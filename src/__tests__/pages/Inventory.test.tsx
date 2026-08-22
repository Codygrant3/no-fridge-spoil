import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { InventoryItem } from '../../types';
import { formatDate } from '../../utils/dateUtils';

const mocks = vi.hoisted(() => ({
  items: [] as InventoryItem[],
  updateItem: vi.fn(),
  removeItem: vi.fn(),
  consumeItem: vi.fn(),
}));

vi.mock('../../context/InventoryContext', () => ({
  useInventory: () => ({
    items: mocks.items,
    removeItem: mocks.removeItem,
    consumeItem: mocks.consumeItem,
    updateItem: mocks.updateItem,
  }),
}));
vi.mock('../../components/ProfileSwitcher', () => ({ ProfileSwitcher: () => null }));
vi.mock('../../components/OnboardingCarousel', () => ({ OnboardingCarousel: () => null }));
vi.mock('../../components/EatThisTonightWidget', () => ({ EatThisTonightWidget: () => null }));
vi.mock('../../services/shoppingActionService', () => ({
  addInventoryItemToShoppingList: vi.fn(),
}));

import { Inventory } from '../../pages/Inventory';

function createItem(overrides: Partial<InventoryItem> & Pick<InventoryItem, 'id' | 'name'>): InventoryItem {
  return {
    expirationDate: '2026-12-01',
    dateType: 'best_before',
    addedAt: '2026-07-25T12:00:00.000Z',
    status: 'good',
    quantity: 1,
    storageLocation: 'pantry',
    ...overrides,
  };
}

function localDatePlus(days: number, from = new Date()): Date {
  const date = new Date(from);
  date.setDate(date.getDate() + days);
  return date;
}

function setMockItems(items: InventoryItem[]) {
  mocks.items.splice(0, mocks.items.length, ...items);
}

const batchItems = Array.from({ length: 30 }, (_, index) => createItem({
  id: `item-${index + 1}`,
  name: `Batch Item ${String(index + 1).padStart(2, '0')}`,
}));

describe('Inventory batching', () => {
  beforeEach(() => {
    setMockItems(batchItems);
    mocks.updateItem.mockReset();
    mocks.removeItem.mockReset();
    mocks.consumeItem.mockReset();
  });

  it('renders large inventories in incremental groups', async () => {
    const user = userEvent.setup();
    render(<Inventory />);

    expect(screen.getByText('Batch Item 24')).toBeInTheDocument();
    expect(screen.queryByText('Batch Item 25')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Show 6 more/i }));
    expect(screen.getByText('Batch Item 30')).toBeInTheDocument();
  });
});

describe('Inventory local-calendar actions', () => {
  beforeEach(() => {
    setMockItems([]);
    mocks.updateItem.mockReset();
    mocks.removeItem.mockReset();
    mocks.consumeItem.mockReset();
  });

  it('hides items more than 7 local days out in the attention filter', async () => {
    const today = new Date();
    setMockItems([
      createItem({
        id: 'due-today',
        name: 'Due Today Yogurt',
        expirationDate: formatDate(today),
      }),
      createItem({
        id: 'due-in-week',
        name: 'Due In Week Milk',
        expirationDate: formatDate(localDatePlus(7, today)),
        quantity: 2,
      }),
      createItem({
        id: 'due-later',
        name: 'Due Later Beans',
        expirationDate: formatDate(localDatePlus(8, today)),
        quantity: 2,
      }),
    ]);

    const user = userEvent.setup();
    render(<Inventory />);

    expect(screen.getByText('Due Later Beans')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /search inventory/i }));
    await user.click(screen.getByRole('button', { name: /needs attention/i }));

    expect(screen.getByText('Due Today Yogurt')).toBeInTheDocument();
    expect(screen.getByText('Due In Week Milk')).toBeInTheDocument();
    expect(screen.queryByText('Due Later Beans')).not.toBeInTheDocument();
  });

  it('freezes a fridge item due in 2-3 days with a local +30 expiration', async () => {
    const today = new Date();
    setMockItems([
      createItem({
        id: 'fridge-milk',
        name: 'Fridge Milk',
        expirationDate: formatDate(localDatePlus(2, today)),
        storageLocation: 'fridge',
      }),
    ]);

    const user = userEvent.setup();
    render(<Inventory />);

    await user.click(screen.getByRole('button', { name: /^Freeze$/i }));

    expect(mocks.updateItem).toHaveBeenCalledWith('fridge-milk', {
      storageLocation: 'freezer',
      expirationDate: formatDate(localDatePlus(30, today)),
    });
  });

  it('writes today as formatDate when marking an item opened', async () => {
    const today = new Date();
    setMockItems([
      createItem({
        id: 'yogurt-1',
        name: 'Greek Yogurt',
        expirationDate: formatDate(localDatePlus(5, today)),
      }),
    ]);

    const user = userEvent.setup();
    render(<Inventory />);

    await user.click(screen.getByRole('button', { name: /greek yogurt/i }));
    await user.click(screen.getByRole('button', { name: /^Opened$/i }));

    expect(mocks.updateItem).toHaveBeenCalledWith('yogurt-1', {
      openedDate: formatDate(today),
    });
  });

  it('exposes the grocery search field with an accessible name', async () => {
    setMockItems(batchItems.slice(0, 1));
    const user = userEvent.setup();
    render(<Inventory />);

    await user.click(screen.getByRole('button', { name: /search inventory/i }));
    expect(screen.getByRole('textbox', { name: /search groceries/i })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /filter inventory/i }));
    expect(screen.queryByRole('textbox', { name: /search groceries/i })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /filter inventory/i }));
    expect(screen.getByRole('textbox', { name: /search groceries/i })).toBeInTheDocument();
  });
});
