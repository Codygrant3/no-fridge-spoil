import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  addItem: vi.fn(),
  updateInventoryItem: vi.fn(),
  saveAliases: vi.fn(),
  inventoryItems: [] as Array<{ id: string; name: string }>,
}));

vi.mock('../../context/InventoryContext', () => ({
  useInventory: () => ({
    addItem: mocks.addItem,
    updateItem: mocks.updateInventoryItem,
    items: mocks.inventoryItems,
  }),
}));

vi.mock('../../services/receiptAliasService', () => ({
  saveReceiptAliasCorrections: mocks.saveAliases,
}));

import { ReviewItems, type ScannedItem } from '../../components/ReviewItems';

const shorthandItem: ScannedItem = {
  id: '11111111-1111-4111-8111-111111111111',
  name: 'ORG WHL MLK',
  originalName: 'ORG WHL MLK',
  category: 'Grocery',
  confidence: 'High',
  expirationDate: '2026-08-01',
  quantity: 1,
  price: '4.99',
  sourceLine: 'ORG WHL MLK 4.99',
  resolution: {
    proposedName: 'Organic Whole Milk',
    proposedCategory: 'Dairy',
    confidence: 'Medium',
    method: 'token-expansion',
    shouldReview: true,
    autoAccepted: false,
    alternatives: ['Whole Milk'],
    unresolvedTokens: [],
    evidence: ['ORG -> organic'],
  },
};

describe('ReviewItems receipt resolution', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.addItem.mockResolvedValue(undefined);
    mocks.saveAliases.mockResolvedValue(1);
    mocks.inventoryItems.length = 0;
  });

  it('requires a product-name choice and saves an accepted suggestion as a store alias', async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    render(
      <ReviewItems
        items={[shorthandItem]}
        receiptMeta={{ storeName: 'Kroger', source: 'camera' }}
        onConfirm={onConfirm}
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByRole('button', { name: /Confirm & Add 1 Item/i })).toBeDisabled();
    expect(screen.getByText('Organic Whole Milk')).toBeInTheDocument();
    expect(screen.getByText(/ORG WHL MLK 4\.99/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Use suggestion' }));
    expect(screen.getByLabelText('Item name')).toHaveValue('Organic Whole Milk');

    await user.click(screen.getByRole('button', { name: /Confirm & Add 1 Item/i }));
    await waitFor(() => expect(mocks.saveAliases).toHaveBeenCalledWith([{
      merchantName: 'Kroger',
      rawDescription: 'ORG WHL MLK',
      canonicalName: 'Organic Whole Milk',
      brand: undefined,
      category: 'Dairy',
    }]));
    expect(mocks.addItem).toHaveBeenCalledWith(expect.objectContaining({ name: 'Organic Whole Milk' }));
    expect(onConfirm).toHaveBeenCalled();
  });

  it('provides product-specific accessible labels for every editable field', () => {
    render(
      <ReviewItems
        items={[shorthandItem]}
        receiptMeta={{ storeName: 'Kroger', source: 'camera' }}
        onConfirm={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByLabelText('ORG WHL MLK brand')).toBeInTheDocument();
    expect(screen.getByLabelText('ORG WHL MLK category')).toBeInTheDocument();
    expect(screen.getByLabelText('ORG WHL MLK price')).toBeInTheDocument();
    expect(screen.getByLabelText('ORG WHL MLK expiration date')).toHaveAttribute('aria-invalid', 'false');
    expect(screen.getByLabelText('ORG WHL MLK quantity')).toBeInTheDocument();
  });

  it('opens duplicate review as a keyboard dialog and restores focus on Escape', async () => {
    mocks.inventoryItems.push({ id: 'existing-milk', name: 'ORG WHL MLK' });
    const user = userEvent.setup();
    render(
      <ReviewItems
        items={[shorthandItem]}
        onConfirm={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    const trigger = screen.getByRole('button', { name: 'Review' });

    await user.click(trigger);

    expect(screen.getByRole('dialog', { name: 'Merge duplicate items' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Close duplicate merge' })).toHaveFocus();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog', { name: 'Merge duplicate items' })).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });
});
