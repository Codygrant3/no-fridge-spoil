import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildExpirationCalendarEvent, NotificationService } from '../../services/notificationService';
import type { InventoryItem } from '../../types';

const item: InventoryItem = {
  id: 'milk-1',
  name: 'Milk, whole; 2%',
  brand: 'Farm\\House',
  expirationDate: '2026-07-31',
  dateType: 'use_by',
  addedAt: '2026-07-25T12:00:00.000Z',
  status: 'expiring_soon',
  quantity: 1,
  storageLocation: 'fridge',
};

describe('buildExpirationCalendarEvent', () => {
  it('creates a timezone-safe all-day reminder and escapes calendar text', () => {
    const event = buildExpirationCalendarEvent(item, new Date('2026-07-25T12:34:56.000Z'));

    expect(event).toContain('DTSTART;VALUE=DATE:20260731');
    expect(event).toContain('DTEND;VALUE=DATE:20260801');
    expect(event).toContain('SUMMARY:Use up Milk\\, whole\\; 2%');
    expect(event).toContain('Farm\\\\House');
    expect(event).toContain('DTSTAMP:20260725T123456Z');
    expect(event).toContain('\r\n');
  });

  it('rejects impossible or non-date-only expiration values', () => {
    expect(buildExpirationCalendarEvent({ ...item, expirationDate: '2026-02-30' })).toBeNull();
    expect(buildExpirationCalendarEvent({ ...item, expirationDate: 'not-a-date' })).toBeNull();
  });
});

describe('NotificationService', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('returns false when the browser permission request rejects', async () => {
    Object.defineProperty(window, 'Notification', {
      configurable: true,
      value: { requestPermission: vi.fn().mockRejectedValue(new Error('blocked')) },
    });

    await expect(NotificationService.requestPermission()).resolves.toBe(false);
  });

  it('falls back when service-worker readiness never settles', async () => {
    vi.useFakeTimers();
    const pageNotification = vi.fn();
    Object.assign(pageNotification, { permission: 'granted' });
    vi.stubGlobal('Notification', pageNotification);
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: { ready: new Promise(() => undefined) },
    });

    const delivered = NotificationService.sendNotification('Freshness check');
    await vi.advanceTimersByTimeAsync(2_000);

    await expect(delivered).resolves.toBe(true);
    expect(pageNotification).toHaveBeenCalledWith('Freshness check', expect.objectContaining({
      icon: '/pwa-192x192.png',
    }));
  });
});
