const hasNotificationTriggers = typeof Notification !== "undefined" &&
    "showTrigger" in Notification.prototype &&
    typeof TimestampTrigger !== "undefined";

let scheduledTimerId = null;
let scheduledTag = null;
const cancelledTags = new Set();

self.addEventListener("install", event => {
    event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", event => {
    event.waitUntil(self.clients.claim());
});

self.addEventListener("message", event => {
    if (!event.data) {
        return;
    }

    if (event.data.type === "SCHEDULE_NOTIFICATION") {
        event.waitUntil(handleSchedule(event.data));
        return;
    }

    if (event.data.type === "CANCEL_NOTIFICATION") {
        event.waitUntil(handleCancel(event.data.tag));
    }
});

async function handleSchedule(data) {
    const delayMs = Number(data.delayMs) || 30000;
    const title = data.title || "Scheduled Notification";
    const options = {
        body: data.body || "This notification was scheduled 30 seconds earlier.",
        icon: data.icon || "/",
        badge: data.badge || data.icon || "/",
        tag: data.tag || "scheduled-alert",
        renotify: true,
        data: {
            scheduledAt: Date.now(),
            delayMs,
        },
    };

    if (cancelledTags.has(options.tag)) {
        cancelledTags.delete(options.tag);
        return;
    }

    scheduledTag = options.tag;

    if (hasNotificationTriggers) {
        options.showTrigger = new TimestampTrigger(Date.now() + delayMs);
        return self.registration.showNotification(title, options);
    }

    if (scheduledTimerId) {
        clearTimeout(scheduledTimerId);
        scheduledTimerId = null;
    }

    console.log("Service worker fallback timer scheduled for", delayMs, "ms.");
    return new Promise(resolve => {
        scheduledTimerId = setTimeout(() => {
            scheduledTimerId = null;
            if (cancelledTags.has(options.tag)) {
                cancelledTags.delete(options.tag);
                resolve();
                return;
            }
            self.registration.showNotification(title, options)
                .then(resolve)
                .catch(error => {
                    console.warn("Fallback notification failed:", error);
                    resolve();
                });
        }, delayMs);
    });
}

function handleCancel(tag) {
    if (!tag) {
        return;
    }

    cancelledTags.add(tag);

    if (scheduledTimerId && scheduledTag === tag) {
        clearTimeout(scheduledTimerId);
        scheduledTimerId = null;
        scheduledTag = null;
        console.log("Cancelled scheduled fallback notification for tag:", tag);
        return;
    }

    console.log("Cancellation requested for tag", tag, "but a browser-managed trigger may still fire.");
    return self.registration.getNotifications({ tag }).then(notifications => {
        notifications.forEach(notification => notification.close());
    });
}

self.addEventListener("notificationclick", event => {
    event.notification.close();
    event.waitUntil(
        self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(windowClients => {
            for (const client of windowClients) {
                if (client.url.includes("notify.html") && "focus" in client) {
                    return client.focus();
                }
            }
            if (self.clients.openWindow) {
                return self.clients.openWindow("notify.html");
            }
        })
    );
});
