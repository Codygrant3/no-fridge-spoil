import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

const inventoryItems = Array.from({ length: 30 }, (_, index) => ({
  id: `item-${index + 1}`,
  name: `Batch Item ${String(index + 1).padStart(2, '0')}`,
  expirationDate: '2026-12-01',
  dateType: 'best_before',
  addedAt: '2026-07-25T12:00:00.000Z',
  status: 'good' as const,
  quantity: 1,
  storageLocation: 'pantry' as const,
}));

vi.mock('../../context/InventoryContext', () => ({
  useInventory: () => ({
    items: inventoryItems,
    removeItem: vi.fn(),
    consumeItem: vi.fn(),
    updateItem: vi.fn(),
  }),
}));
vi.mock('../../components/ProfileSwitcher', () => ({ ProfileSwitcher: () => null }));
vi.mock('../../components/OnboardingCarousel', () => ({ OnboardingCarousel: () => null }));
vi.mock('../../components/EatThisTonightWidget', () => ({ EatThisTonightWidget: () => null }));
vi.mock('../../services/shoppingActionService', () => ({
  addInventoryItemToShoppingList: vi.fn(),
}));

import { Inventory } from '../../pages/Inventory';

describe('Inventory batching', () => {
  it('renders large inventories in incremental groups', async () => {
    const user = userEvent.setup();
    render(<Inventory />);

    expect(screen.getByText('Batch Item 24')).toBeInTheDocument();
    expect(screen.queryByText('Batch Item 25')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Show 6 more/i }));
    expect(screen.getByText('Batch Item 30')).toBeInTheDocument();
  });
});
