import type { InventoryItem } from "../types";

export const NotificationService = {
    // Request permission for push notifications
    async requestPermission(): Promise<boolean> {
        if (!('Notification' in window)) {
            console.log("This browser does not support desktop notification");
            return false;
        }

        const permission = await Notification.requestPermission();
        return permission === 'granted';
    },

    // Send a local notification immediately
    sendNotification(title: string, options?: NotificationOptions) {
        if ('Notification' in window && Notification.permission === 'granted') {
            try {
                // Try Service Worker registration first for mobile support
                navigator.serviceWorker.ready.then((registration) => {
                    registration.showNotification(title, {
                        icon: '/icons/icon-192.png',
                        badge: '/icons/icon-192.png',
                        ...options
                    });
                });
            } catch (e) {
                // Fallback to basic API
                new Notification(title, options);
            }
        }
    },

    // Check for expiring items and notify
    checkExpiringItems(items: InventoryItem[]) {
        const expiringItems = items.filter(item => item.status === 'expiring_soon');

        if (expiringItems.length > 0) {
            const count = expiringItems.length;
            const title = `⚠️ ${count} items expiring soon!`;
            const body = `Time to use up: ${expiringItems.slice(0, 3).map(i => i.name).join(', ')}${count > 3 ? '...' : ''}`;

            // Limit frequency? For now, we rely on the calling logic (e.g., once per day)
            this.sendNotification(title, { body, tag: 'expiring-check' });
        }
    },

    // Generate a calendar event (.ics file) for an item
    addToCalendar(item: InventoryItem) {
        if (!item.expirationDate) return;

        const date = new Date(item.expirationDate);
        // Set reminder for 9 AM on expiration day
        date.setHours(9, 0, 0);

        const startDate = date.toISOString().replace(/-|:|\.\d+/g, '');
        const endDate = new Date(date.getTime() + 60 * 60 * 1000).toISOString().replace(/-|:|\.\d+/g, '');

        const event = [
            'BEGIN:VCALENDAR',
            'VERSION:2.0',
            'BEGIN:VEVENT',
            `DTSTART:${startDate}`,
            `DTEND:${endDate}`,
            `SUMMARY:Use up ${item.name}`,
            `DESCRIPTION:Your ${item.name} (${item.brand}) is expiring!`,
            'BEGIN:VALARM',
            'TRIGGER:-PT24H',
            'ACTION:DISPLAY',
            'DESCRIPTION:Reminder',
            'END:VALARM',
            'END:VEVENT',
            'END:VCALENDAR'
        ].join('\n');

        const blob = new Blob([event], { type: 'text/calendar;charset=utf-8' });
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.setAttribute('download', `${item.name}_expiration.ics`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }
};
