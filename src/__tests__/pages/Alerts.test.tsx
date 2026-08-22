import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { addInventoryItemToShoppingList } from '../../services/shoppingActionService';
import { NotificationService } from '../../services/notificationService';
import { Alerts } from '../../pages/Alerts';
import { db } from '../../db/database';
import { formatDate } from '../../utils/dateUtils';

const { addInventoryItemToShoppingListMock, addToCalendarMock, updateItemMock } = vi.hoisted(() => ({
  addInventoryItemToShoppingListMock: vi.fn(),
  addToCalendarMock: vi.fn(() => true),
  updateItemMock: vi.fn(),
}));

vi.mock('../../context/InventoryContext', () => ({
  useInventory: () => ({
    items: [{
      id: 'tomorrow-item',
      name: 'Tomorrow Milk',
      expirationDate: '2026-07-26',
      dateType: 'use_by',
      addedAt: '2026-07-25T12:00:00.000Z',
      status: 'expiring_soon',
      quantity: 2,
      storageLocation: 'fridge',
    }],
    consumeItem: vi.fn(),
    removeItem: vi.fn(),
    updateItem: updateItemMock,
  }),
}));

vi.mock('../../services/shoppingActionService', () => ({
  addInventoryItemToShoppingList: addInventoryItemToShoppingListMock,
}));

vi.mock('../../services/notificationService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../services/notificationService')>();
  return {
    ...actual,
    NotificationService: {
      ...actual.NotificationService,
      addToCalendar: addToCalendarMock,
    },
  };
});

describe('Alerts', () => {
  beforeEach(async () => {
    await db.settings.clear();
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 6, 25, 23, 59, 30));
    addInventoryItemToShoppingListMock.mockReset();
    addToCalendarMock.mockReset();
    updateItemMock.mockReset();
    addToCalendarMock.mockReturnValue(true);
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

  it('shows added feedback after adding an expiring item to the shopping list', async () => {
    addInventoryItemToShoppingListMock.mockResolvedValue('added');
    render(<Alerts />);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Add Tomorrow Milk to the shopping list' }));
    });

    expect(addInventoryItemToShoppingList).toHaveBeenCalledWith(expect.objectContaining({
      id: 'tomorrow-item',
      name: 'Tomorrow Milk',
    }));
    expect(screen.getByRole('status')).toHaveTextContent('Tomorrow Milk added to the shopping list.');
  });

  it('shows already-on-list feedback when the expiring item is already listed', async () => {
    addInventoryItemToShoppingListMock.mockResolvedValue('already-listed');
    render(<Alerts />);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Add Tomorrow Milk to the shopping list' }));
    });

    expect(addInventoryItemToShoppingList).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('status')).toHaveTextContent('Tomorrow Milk is already on the shopping list.');
  });

  it('downloads a calendar reminder for an expiring item', () => {
    render(<Alerts />);

    fireEvent.click(screen.getByRole('button', { name: 'Download expiration reminder for Tomorrow Milk' }));

    expect(NotificationService.addToCalendar).toHaveBeenCalledWith(expect.objectContaining({
      id: 'tomorrow-item',
      name: 'Tomorrow Milk',
      expirationDate: '2026-07-26',
    }));
    expect(screen.getByRole('status')).toHaveTextContent('Tomorrow Milk expiration reminder downloaded.');
  });

  it('freezes an expiring fridge item with a local +30 calendar date', async () => {
    render(<Alerts />);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Freeze' }));
    });

    const frozenUntil = new Date(2026, 6, 25, 23, 59, 30);
    frozenUntil.setDate(frozenUntil.getDate() + 30);
    expect(updateItemMock).toHaveBeenCalledWith('tomorrow-item', {
      storageLocation: 'freezer',
      expirationDate: formatDate(frozenUntil),
    });
    expect(screen.getByRole('status')).toHaveTextContent('Tomorrow Milk moved to the freezer for 30 days.');
  });
});
