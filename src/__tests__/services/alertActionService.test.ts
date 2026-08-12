import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearExpiredAlertSnoozes,
  isItemAlertSnoozed,
  snoozeItemAlert,
} from '../../services/alertActionService';

describe('alert snoozes', () => {
  beforeEach(() => localStorage.clear());

  it('persists a snooze and expires it after the selected window', () => {
    vi.spyOn(Date, 'now').mockReturnValue(new Date('2026-07-14T12:00:00Z').getTime());
    snoozeItemAlert('milk', 24);

    expect(isItemAlertSnoozed('milk', new Date('2026-07-15T11:59:00Z').getTime())).toBe(true);
    expect(isItemAlertSnoozed('milk', new Date('2026-07-15T12:01:00Z').getTime())).toBe(false);
  });

  it('removes expired entries while retaining active snoozes', () => {
    localStorage.setItem('no-fridge-spoil:alert-snoozes', JSON.stringify({
      old: '2026-07-13T00:00:00Z',
      active: '2026-07-16T00:00:00Z',
    }));
    clearExpiredAlertSnoozes(new Date('2026-07-14T00:00:00Z').getTime());

    expect(isItemAlertSnoozed('old', new Date('2026-07-14T00:00:00Z').getTime())).toBe(false);
    expect(isItemAlertSnoozed('active', new Date('2026-07-14T00:00:00Z').getTime())).toBe(true);
  });
});
