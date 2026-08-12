import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  categorizeItems,
  isSchedulerRunning,
  isWithinQuietHours,
  runNotificationCheck,
  startScheduler,
  stopScheduler,
} from '../../services/notificationScheduler';
import { NotificationService } from '../../services/notificationService';
import { db, type DbInventoryItem } from '../../db/database';

function localTime(hours: number, minutes = 0): Date {
  const date = new Date(2026, 6, 14, hours, minutes, 0, 0);
  return date;
}

describe('notification quiet hours', () => {
  beforeEach(async () => {
    vi.restoreAllMocks();
    await db.items.clear();
    await db.settings.clear();
    await db.notificationLog.clear();
    Object.defineProperty(window, 'Notification', {
      configurable: true,
      value: { permission: 'granted' },
    });
  });

  it('handles a quiet window that crosses midnight', () => {
    expect(isWithinQuietHours(localTime(22), '21:00', '07:00')).toBe(true);
    expect(isWithinQuietHours(localTime(6, 59), '21:00', '07:00')).toBe(true);
    expect(isWithinQuietHours(localTime(12), '21:00', '07:00')).toBe(false);
  });

  it('handles a daytime quiet window and invalid values', () => {
    expect(isWithinQuietHours(localTime(13), '12:00', '14:00')).toBe(true);
    expect(isWithinQuietHours(localTime(15), '12:00', '14:00')).toBe(false);
    expect(isWithinQuietHours(localTime(13), 'bad', '14:00')).toBe(false);
  });

  it('categorizes expiration dates against the local calendar day', () => {
    const item = (id: string, expirationDate: string): DbInventoryItem => ({
      id,
      name: id,
      expirationDate,
      dateType: 'use_by',
      addedAt: '2026-07-25T12:00:00.000Z',
      status: 'good',
      quantity: 1,
      storageLocation: 'fridge',
      isDeleted: 0,
    });
    const batch = categorizeItems(
      [
        item('expired', '2026-07-24'),
        item('today', '2026-07-25'),
        item('tomorrow', '2026-07-26'),
        item('warning', '2026-07-28'),
        item('invalid', '2026-02-30'),
      ],
      3,
      new Date(2026, 6, 25, 23, 45),
    );

    expect(batch.expired.map(entry => entry.id)).toEqual(['expired']);
    expect(batch.expiresToday.map(entry => entry.id)).toEqual(['today']);
    expect(batch.expiresTomorrow.map(entry => entry.id)).toEqual(['tomorrow']);
    expect(batch.expiringWarning.map(entry => entry.id)).toEqual(['warning']);
  });

  it('records notification history only after successful delivery', async () => {
    await db.settings.put({
      id: 'user',
      theme: 'system',
      defaultStorageLocation: 'fridge',
      expirationWarningDays: 3,
      notificationsEnabled: true,
      notificationFrequency: 'daily',
    });
    const today = new Date();
    const dateOnly = [
      today.getFullYear(),
      String(today.getMonth() + 1).padStart(2, '0'),
      String(today.getDate()).padStart(2, '0'),
    ].join('-');
    await db.items.put({
      id: 'notify-today',
      name: 'Milk',
      expirationDate: dateOnly,
      dateType: 'use_by',
      addedAt: new Date().toISOString(),
      status: 'expiring_soon',
      quantity: 1,
      storageLocation: 'fridge',
      isDeleted: 0,
    });
    const delivery = vi.spyOn(NotificationService, 'sendNotification').mockResolvedValue(false);

    await runNotificationCheck();
    expect(await db.notificationLog.count()).toBe(0);

    delivery.mockResolvedValue(true);
    await runNotificationCheck();
    expect(await db.notificationLog.count()).toBe(1);
  });

  it('keeps the recurring scheduler active when the app opens during quiet hours', async () => {
    const hour = new Date().getHours();
    const quietHoursStart = `${String(hour).padStart(2, '0')}:00`;
    const quietHoursEnd = `${String((hour + 1) % 24).padStart(2, '0')}:00`;
    await db.settings.put({
      id: 'user',
      theme: 'system',
      defaultStorageLocation: 'fridge',
      expirationWarningDays: 3,
      notificationsEnabled: true,
      notificationFrequency: 'realtime',
      quietHoursStart,
      quietHoursEnd,
    });
    const delivery = vi.spyOn(NotificationService, 'sendNotification');

    await startScheduler();

    expect(isSchedulerRunning()).toBe(true);
    expect(delivery).not.toHaveBeenCalled();
    stopScheduler();
  });
});
