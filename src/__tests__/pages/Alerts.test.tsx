import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Alerts } from '../../pages/Alerts';
import { db } from '../../db/database';

vi.mock('../../context/InventoryContext', () => ({
  useInventory: () => ({
    items: [{
      id: 'tomorrow-item',
      name: 'Tomorrow Milk',
      expirationDate: '2026-07-26',
      dateType: 'use_by',
      addedAt: '2026-07-25T12:00:00.000Z',
      status: 'expiring_soon',
      quantity: 3,
      storageLocation: 'fridge',
    }],
    consumeItem: vi.fn(),
    removeItem: vi.fn(),
    updateItem: vi.fn(),
  }),
}));

describe('Alerts', () => {
  beforeEach(async () => {
    await db.settings.clear();
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 6, 25, 23, 59, 30));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('refreshes expiration wording while the page remains open', () => {
    render(<Alerts />);
    expect(screen.getByText('Expires in 1 day')).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(60_000);
    });

    expect(screen.getByText('Expires today')).toBeInTheDocument();
  });
});
