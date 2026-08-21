import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { db, type DbShoppingItem } from '../../db/database';
import { ShoppingList } from '../../pages/ShoppingList';

function itemNameInput() {
  return screen.getByRole('textbox', { name: /item name/i });
}

function shoppingItem(overrides: Partial<DbShoppingItem> = {}): DbShoppingItem {
  return {
    id: overrides.id ?? crypto.randomUUID(),
    name: overrides.name ?? 'Milk',
    quantity: overrides.quantity ?? 1,
    addedAt: overrides.addedAt ?? new Date().toISOString(),
    isChecked: overrides.isChecked ?? false,
    category: overrides.category ?? 'dairy',
    isDeleted: overrides.isDeleted ?? 0,
    ...overrides,
  };
}

describe('ShoppingList', () => {
  beforeEach(async () => {
    await db.shoppingList.clear();
  });

  afterEach(async () => {
    await db.shoppingList.clear();
  });

  it('exposes the add field with an Item name accessible name', () => {
    render(<ShoppingList />);
    expect(itemNameInput()).toBeInTheDocument();
  });

  it('adds a typed Milk item under Dairy', async () => {
    const user = userEvent.setup();
    render(<ShoppingList />);

    await user.type(itemNameInput(), 'Milk');
    await user.click(screen.getByRole('button', { name: 'Add item' }));

    const dairyHeading = await screen.findByRole('heading', { name: 'Dairy & eggs' });
    const dairySection = dairyHeading.closest('section');
    expect(dairySection).not.toBeNull();
    expect(within(dairySection as HTMLElement).getByText('Milk')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Other' })).not.toBeInTheDocument();

    const stored = await db.shoppingList.toArray();
    expect(stored).toHaveLength(1);
    expect(stored[0]?.category).toBe('dairy');
  });

  it('adds Bread from Running Low under Pantry', async () => {
    const user = userEvent.setup();
    render(<ShoppingList />);

    await user.click(screen.getByRole('button', { name: 'Bread' }));

    const pantryHeading = await screen.findByRole('heading', { name: 'Pantry' });
    const pantrySection = pantryHeading.closest('section');
    expect(pantrySection).not.toBeNull();
    expect(within(pantrySection as HTMLElement).getByText('Bread')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Other' })).not.toBeInTheDocument();

    const stored = await db.shoppingList.toArray();
    expect(stored).toHaveLength(1);
    expect(stored[0]?.category).toBe('pantry');
  });

  it('increases quantity and keeps the existing category when the same name is added again', async () => {
    const user = userEvent.setup();
    await db.shoppingList.add(shoppingItem({
      id: 'existing-milk',
      name: 'Milk',
      quantity: 1,
      category: 'other',
    }));

    render(<ShoppingList />);
    expect(await screen.findByRole('heading', { name: 'Other' })).toBeInTheDocument();

    await user.type(itemNameInput(), 'Milk');
    await user.click(screen.getByRole('button', { name: 'Add item' }));

    expect(await screen.findByText('Milk quantity updated to 2.')).toBeInTheDocument();
    expect(screen.getByLabelText('2 items')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Other' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Dairy & eggs' })).not.toBeInTheDocument();

    const stored = await db.shoppingList.toArray();
    expect(stored).toHaveLength(1);
    expect(stored[0]?.quantity).toBe(2);
    expect(stored[0]?.category).toBe('other');
  });

  it('restores soft-deleted items when Clear list is undone', async () => {
    const user = userEvent.setup();
    await db.shoppingList.add(shoppingItem({
      id: 'apples',
      name: 'Apples',
      category: 'produce',
    }));

    render(<ShoppingList />);
    expect(await screen.findByText('Apples')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Shopping list options' }));
    await user.click(screen.getByRole('menuitem', { name: 'Clear list' }));

    await waitFor(() => {
      expect(screen.getByText('Your list is empty')).toBeInTheDocument();
    });
    expect(screen.getByText('1 item cleared from list.')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Undo' }));

    expect(await screen.findByText('Apples')).toBeInTheDocument();
    expect(screen.getByText('1 item restored.')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Produce' })).toBeInTheDocument();

    const stored = await db.shoppingList.toArray();
    expect(stored).toHaveLength(1);
    expect(stored[0]?.isDeleted).toBe(0);
    expect(stored[0]?.name).toBe('Apples');
  });
});
