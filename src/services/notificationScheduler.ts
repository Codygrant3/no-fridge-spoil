/**
 * Notification Scheduler — Smart, Batched Expiration Alerts
 *
 * Schedules and manages expiration notifications with configurable
 * frequency, urgency grouping, and duplicate prevention.
 */

import { db } from '../db/database';
import type { DbInventoryItem } from '../db/database';
import { NotificationService } from './notificationService';
import { getActiveCloudHouseholdId } from './cloudSessionService';
import { isCloudConfigured } from './supabaseClient';
import { belongsToActiveHousehold } from './localMutationService';
import { formatDate, validateAndFormatDate } from '../utils/dateUtils';

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
    if (!hasNotificationPermission()) return;

    // Install the recurring check even when startup happens during quiet hours.
    // Every run re-reads settings, so later preference changes take effect.
    const intervalMs = getIntervalMs(frequency);
    if (intervalMs > 0) {
        schedulerInterval = setInterval(() => {
            void runNotificationCheck();
        }, intervalMs);
    }

    // Run an immediate check
    if (!isWithinQuietHours(new Date(), settings.quietHoursStart, settings.quietHoursEnd)) {
        await runNotificationCheck();
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

export function isSchedulerRunning(): boolean {
    return schedulerInterval !== null;
}

/**
 * Run a single notification check — batch items by urgency and send.
 */
export async function runNotificationCheck(): Promise<void> {
    try {
        const settings = await db.settings.get('user');
        const frequency = settings?.notificationFrequency as NotificationFrequency | undefined;
        if (
            !settings?.notificationsEnabled
            || !frequency
            || frequency === 'off'
            || !hasNotificationPermission()
            || isWithinQuietHours(new Date(), settings.quietHoursStart, settings.quietHoursEnd)
        ) return;
        const warningDays = settings?.expirationWarningDays ?? 3;

        // Get active (non-deleted) items
        const items = (await db.items
            .where('isDeleted')
            .equals(0)
            .toArray()).filter(item => belongsToActiveHousehold(
                item,
                isCloudConfigured,
                getActiveCloudHouseholdId(),
            ));

        const batch = categorizeItems(items, warningDays);

        // Send notifications for each urgency level, avoiding duplicates
        if (batch.expired.length > 0) {
            await sendBatchIfNew(batch.expired, 'expired', 'Expired items');
        }
        if (batch.expiresToday.length > 0) {
            await sendBatchIfNew(batch.expiresToday, 'expiring', 'Expiring today');
        }
        if (batch.expiresTomorrow.length > 0) {
            await sendBatchIfNew(batch.expiresTomorrow, 'expiring', 'Expiring tomorrow');
        }
        if (batch.expiringWarning.length > 0) {
            await sendBatchIfNew(batch.expiringWarning, 'expiring', `Expiring within ${warningDays} days`);
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

function hasNotificationPermission(): boolean {
    return typeof window !== 'undefined'
        && 'Notification' in window
        && Notification.permission === 'granted';
}

function timeMinutes(value: string | undefined): number | null {
    if (!value || !/^\d{2}:\d{2}$/.test(value)) return null;
    const [hours, minutes] = value.split(':').map(Number);
    if (!Number.isInteger(hours) || !Number.isInteger(minutes) || hours > 23 || minutes > 59) return null;
    return hours * 60 + minutes;
}

export function isWithinQuietHours(now: Date, startValue?: string, endValue?: string): boolean {
    const start = timeMinutes(startValue);
    const end = timeMinutes(endValue);
    if (start === null || end === null || start === end) return false;
    const current = now.getHours() * 60 + now.getMinutes();
    return start < end
        ? current >= start && current < end
        : current >= start || current < end;
}

/**
 * Categorize items into urgency groups.
 */
export function categorizeItems(
    items: DbInventoryItem[],
    warningDays: number,
    now = new Date(),
): NotificationBatch {
    const todayStr = formatDate(now);

    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = formatDate(tomorrow);

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
        const expDate = validateAndFormatDate(item.expirationDate);
        if (!expDate) continue;

        if (expDate < todayStr) {
            batch.expired.push(item);
        } else if (expDate === todayStr) {
            batch.expiresToday.push(item);
        } else if (expDate === tomorrowStr) {
            batch.expiresTomorrow.push(item);
        } else if (expDate <= formatDate(warningDate)) {
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

    const delivered = await NotificationService.sendNotification(title, {
        body,
        tag: `${type}-batch-${formatDate(new Date())}`,
        data: { action: 'navigate-alerts', itemIds: newItems.map(item => item.id) },
        actions: [
            { action: 'use-first', title: 'Mark first used' },
            { action: 'snooze-first', title: 'Snooze first' },
        ],
    });
    if (!delivered) return;

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

    const items = (await db.items
        .where('isDeleted')
        .equals(0)
        .toArray()).filter(item => belongsToActiveHousehold(
            item,
            isCloudConfigured,
            getActiveCloudHouseholdId(),
        ));

    const batch = categorizeItems(items, warningDays);

    return {
        expired: batch.expired.length,
        expiresToday: batch.expiresToday.length,
        expiresTomorrow: batch.expiresTomorrow.length,
        expiringWarning: batch.expiringWarning.length,
    };
}
