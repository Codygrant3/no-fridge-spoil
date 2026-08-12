import type { InventoryItem } from "../types";

export interface AppNotificationOptions extends NotificationOptions {
    actions?: Array<{ action: string; title: string; icon?: string }>;
}

const SERVICE_WORKER_READY_TIMEOUT_MS = 2_000;

async function readyServiceWorkerRegistration(): Promise<ServiceWorkerRegistration | null> {
    if (!('serviceWorker' in navigator)) return null;

    return new Promise(resolve => {
        let settled = false;
        const settle = (registration: ServiceWorkerRegistration | null) => {
            if (settled) return;
            settled = true;
            window.clearTimeout(timeout);
            resolve(registration);
        };
        const timeout = window.setTimeout(() => settle(null), SERVICE_WORKER_READY_TIMEOUT_MS);
        navigator.serviceWorker.ready.then(
            registration => settle(registration),
            () => settle(null),
        );
    });
}

function escapeCalendarText(value: string): string {
    return value
        .replace(/\\/g, '\\\\')
        .replace(/\r?\n/g, '\\n')
        .replace(/,/g, '\\,')
        .replace(/;/g, '\\;');
}

function calendarDateRange(dateOnly: string): { start: string; end: string } | null {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateOnly);
    if (!match) return null;
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    const date = new Date(Date.UTC(year, month - 1, day));
    if (
        date.getUTCFullYear() !== year
        || date.getUTCMonth() !== month - 1
        || date.getUTCDate() !== day
    ) return null;
    const format = (value: Date) => value.toISOString().slice(0, 10).replace(/-/g, '');
    const start = format(date);
    date.setUTCDate(date.getUTCDate() + 1);
    return { start, end: format(date) };
}

export function buildExpirationCalendarEvent(item: InventoryItem, now = new Date()): string | null {
    const range = calendarDateRange(item.expirationDate);
    if (!range) return null;
    const brand = item.brand?.trim();
    const description = `Your ${item.name}${brand ? ` (${brand})` : ''} expires today.`;
    const timestamp = now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
    return [
        'BEGIN:VCALENDAR',
        'VERSION:2.0',
        'PRODID:-//No Fridge Spoil//Expiration Reminder//EN',
        'CALSCALE:GREGORIAN',
        'BEGIN:VEVENT',
        `UID:${escapeCalendarText(item.id)}@no-fridge-spoil.local`,
        `DTSTAMP:${timestamp}`,
        `DTSTART;VALUE=DATE:${range.start}`,
        `DTEND;VALUE=DATE:${range.end}`,
        `SUMMARY:${escapeCalendarText(`Use up ${item.name}`)}`,
        `DESCRIPTION:${escapeCalendarText(description)}`,
        'BEGIN:VALARM',
        'TRIGGER:-PT24H',
        'ACTION:DISPLAY',
        `DESCRIPTION:${escapeCalendarText(`Use up ${item.name} tomorrow`)}`,
        'END:VALARM',
        'END:VEVENT',
        'END:VCALENDAR',
    ].join('\r\n');
}

export const NotificationService = {
    // Request permission for push notifications
    async requestPermission(): Promise<boolean> {
        if (!('Notification' in window)) {
            console.log("This browser does not support desktop notification");
            return false;
        }

        try {
            const permission = await Notification.requestPermission();
            return permission === 'granted';
        } catch {
            return false;
        }
    },

    // Send a local notification immediately
    async sendNotification(title: string, options?: AppNotificationOptions): Promise<boolean> {
        if (!('Notification' in window) || Notification.permission !== 'granted') return false;
        const notificationOptions = {
            icon: '/pwa-192x192.png',
            badge: '/pwa-192x192.png',
            ...options,
        };

        if ('serviceWorker' in navigator) {
            try {
                const registration = await readyServiceWorkerRegistration();
                if (registration) {
                    await registration.showNotification(title, notificationOptions);
                    return true;
                }
            } catch {
                // Fall through to the page-level Notification API.
            }
        }

        try {
            new Notification(title, notificationOptions);
            return true;
        } catch {
            return false;
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
            void this.sendNotification(title, { body, tag: 'expiring-check' });
        }
    },

    // Generate a calendar event (.ics file) for an item
    addToCalendar(item: InventoryItem): boolean {
        const event = buildExpirationCalendarEvent(item);
        if (!event) return false;
        const blob = new Blob([event], { type: 'text/calendar;charset=utf-8' });
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        const safeName = item.name.trim().replace(/[^a-z0-9.-]+/gi, '-').replace(/^-|-$/g, '') || 'food-item';
        link.setAttribute('download', `${safeName}-expiration.ics`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        window.setTimeout(() => window.URL.revokeObjectURL(url), 0);
        return true;
    }
};
