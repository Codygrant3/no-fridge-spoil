/**
 * Notification Scheduler — Smart, Batched Expiration Alerts
 *
 * Schedules and manages expiration notifications with configurable
 * frequency, urgency grouping, and duplicate prevention.
 */

import { db } from '../db/database';
import type { DbInventoryItem } from '../db/database';
import { NotificationService } from './notificationService';

export type NotificationFrequency = 'off' | 'daily' | 'twice' | 'realtime';

interface NotificationBatch {
    expired: DbInventoryItem[];
    expiresToday: DbInventoryItem[];
    expiresTomorrow: DbInventoryItem[];
    expiringWarning: DbInventoryItem[]; // within warning window
}

let schedulerInterval: ReturnType<typeof setInterval> | null = null;

/**
 * Start the notification scheduler based on user settings.
 * Should be called on app init.
 */
export async function startScheduler(): Promise<void> {
    // Stop any existing scheduler
    stopScheduler();

    const settings = await db.settings.get('user');
    if (!settings) return;

    const frequency = settings.notificationFrequency as NotificationFrequency | undefined;
    if (!frequency || frequency === 'off') return;

    const notificationsEnabled = settings.notificationsEnabled;
    if (!notificationsEnabled) return;

    // Check permission
    if (!('Notification' in window) || Notification.permission !== 'granted') return;

    // Run an immediate check
    await runNotificationCheck();

    // Set up recurring checks
    const intervalMs = getIntervalMs(frequency);
    if (intervalMs > 0) {
        schedulerInterval = setInterval(() => {
            runNotificationCheck();
        }, intervalMs);
    }
}

/**
 * Stop the notification scheduler.
 */
export function stopScheduler(): void {
    if (schedulerInterval) {
        clearInterval(schedulerInterval);
        schedulerInterval = null;
    }
}

/**
 * Run a single notification check — batch items by urgency and send.
 */
export async function runNotificationCheck(): Promise<void> {
    try {
        const settings = await db.settings.get('user');
        const warningDays = settings?.expirationWarningDays ?? 3;

        // Get active (non-deleted) items
        const items = await db.items
            .where('isDeleted')
            .equals(0)
            .toArray();

        const batch = categorizeItems(items, warningDays);

        // Send notifications for each urgency level, avoiding duplicates
        if (batch.expired.length > 0) {
            await sendBatchIfNew(batch.expired, 'expired', '🚨 Expired Items');
        }
        if (batch.expiresToday.length > 0) {
            await sendBatchIfNew(batch.expiresToday, 'expiring', '⚠️ Expiring Today');
        }
        if (batch.expiresTomorrow.length > 0) {
            await sendBatchIfNew(batch.expiresTomorrow, 'expiring', '📅 Expiring Tomorrow');
        }
        if (batch.expiringWarning.length > 0) {
            await sendBatchIfNew(batch.expiringWarning, 'expiring', `🔔 Expiring Within ${warningDays} Days`);
        }

        // Cleanup old notification logs (older than 7 days)
        const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
        const oldLogs = await db.notificationLog
            .where('sentAt')
            .below(weekAgo)
            .toArray();
        if (oldLogs.length > 0) {
            await db.notificationLog.bulkDelete(oldLogs.map(l => l.id));
        }
    } catch (error) {
        console.warn('Notification check failed:', error);
    }
}

/**
 * Categorize items into urgency groups.
 */
function categorizeItems(items: DbInventoryItem[], warningDays: number): NotificationBatch {
    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];

    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = tomorrow.toISOString().split('T')[0];

    const warningDate = new Date(now);
    warningDate.setDate(warningDate.getDate() + warningDays);

    const batch: NotificationBatch = {
        expired: [],
        expiresToday: [],
        expiresTomorrow: [],
        expiringWarning: [],
    };

    for (const item of items) {
        if (!item.expirationDate) continue;
        const expDate = item.expirationDate.split('T')[0]; // normalize

        if (expDate < todayStr) {
            batch.expired.push(item);
        } else if (expDate === todayStr) {
            batch.expiresToday.push(item);
        } else if (expDate === tomorrowStr) {
            batch.expiresTomorrow.push(item);
        } else if (expDate <= warningDate.toISOString().split('T')[0]) {
            batch.expiringWarning.push(item);
        }
    }

    return batch;
}

/**
 * Send a batched notification only if we haven't already notified about these items recently.
 */
async function sendBatchIfNew(
    items: DbInventoryItem[],
    type: 'expiring' | 'expired',
    title: string,
): Promise<void> {
    // Check which items haven't been notified about today
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const recentLogs = await db.notificationLog
        .where('sentAt')
        .aboveOrEqual(todayStart.toISOString())
        .toArray();

    const recentItemIds = new Set(recentLogs.map(l => l.itemId));
    const newItems = items.filter(i => !recentItemIds.has(i.id));

    if (newItems.length === 0) return;

    // Build notification body
    const names = newItems.slice(0, 4).map(i => i.name);
    const body = names.join(', ') + (newItems.length > 4 ? ` and ${newItems.length - 4} more` : '');

    NotificationService.sendNotification(title, {
        body,
        tag: `${type}-batch-${new Date().toISOString().split('T')[0]}`,
        data: { action: 'navigate-alerts' },
    });

    // Log these notifications to prevent duplicates
    const logs = newItems.map(item => ({
        id: crypto.randomUUID(),
        itemId: item.id,
        type,
        sentAt: new Date().toISOString(),
    }));
    await db.notificationLog.bulkPut(logs);
}

/**
 * Get interval in milliseconds for a given frequency.
 */
function getIntervalMs(frequency: NotificationFrequency): number {
    switch (frequency) {
        case 'daily': return 24 * 60 * 60 * 1000;
        case 'twice': return 12 * 60 * 60 * 1000;
        case 'realtime': return 2 * 60 * 60 * 1000; // Every 2 hours
        default: return 0;
    }
}

/**
 * Get a summary of pending notifications (for settings UI preview).
 */
export async function getNotificationPreview(): Promise<{
    expired: number;
    expiresToday: number;
    expiresTomorrow: number;
    expiringWarning: number;
}> {
    const settings = await db.settings.get('user');
    const warningDays = settings?.expirationWarningDays ?? 3;

    const items = await db.items
        .where('isDeleted')
        .equals(0)
        .toArray();

    const batch = categorizeItems(items, warningDays);

    return {
        expired: batch.expired.length,
        expiresToday: batch.expiresToday.length,
        expiresTomorrow: batch.expiresTomorrow.length,
        expiringWarning: batch.expiringWarning.length,
    };
}
