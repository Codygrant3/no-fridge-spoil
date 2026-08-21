import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DbMealPlan } from '../../db/database';

const fixtures = vi.hoisted(() => {
  const weekPlan: DbMealPlan = {
    id: 'week-plan-1',
    weekStartDate: '2026-08-17',
    meals: [
      {
        day: 0,
        slot: 'breakfast',
        recipeName: 'Overnight oats',
        ingredients: ['oats', 'milk'],
      },
    ],
    createdAt: '2026-08-17T12:00:00.000Z',
  };
  const missingIngredients = ['spinach', 'garlic', 'lemon'];

  return {
    weekPlan,
    missingIngredients,
    getOrCreateWeekPlan: vi.fn(),
    getMissingIngredients: vi.fn(),
    addMissingToShoppingList: vi.fn(),
    addMealToSlot: vi.fn(),
    removeMealFromSlot: vi.fn(),
    suggestRecipesForSlot: vi.fn(),
  };
});

vi.mock('../../context/InventoryContext', () => ({
  useInventory: () => ({
    items: [],
    consumeItem: vi.fn(),
    removeItem: vi.fn(),
    updateItem: vi.fn(),
  }),
}));

vi.mock('../../services/mealPlanService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../services/mealPlanService')>();
  return {
    ...actual,
    getOrCreateWeekPlan: fixtures.getOrCreateWeekPlan,
    getMissingIngredients: fixtures.getMissingIngredients,
    addMissingToShoppingList: fixtures.addMissingToShoppingList,
    addMealToSlot: fixtures.addMealToSlot,
    removeMealFromSlot: fixtures.removeMealFromSlot,
    suggestRecipesForSlot: fixtures.suggestRecipesForSlot,
  };
});

vi.mock('dexie-react-hooks', () => ({
  useLiveQuery: () => fixtures.weekPlan,
}));

import { MealPlanner } from '../../pages/MealPlanner';

async function renderPlanner() {
  render(<MealPlanner onBack={vi.fn()} />);
  await waitFor(() => {
    expect(fixtures.getOrCreateWeekPlan).toHaveBeenCalled();
    expect(screen.getByRole('heading', { name: 'Meal planner' })).toBeInTheDocument();
  });
}

describe('MealPlanner', () => {
  beforeEach(() => {
    fixtures.getOrCreateWeekPlan.mockResolvedValue(fixtures.weekPlan);
    fixtures.getMissingIngredients.mockResolvedValue(fixtures.missingIngredients);
    fixtures.addMissingToShoppingList.mockResolvedValue(fixtures.missingIngredients.length);
    fixtures.addMealToSlot.mockResolvedValue(undefined);
    fixtures.removeMealFromSlot.mockResolvedValue(undefined);
    fixtures.suggestRecipesForSlot.mockResolvedValue([]);
  });

  it('renders the weekly heading and meal slots from getOrCreateWeekPlan', async () => {
    await renderPlanner();

    expect(screen.getByText('This week')).toBeInTheDocument();
    expect(screen.getByText('1 meal planned')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Mon' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Sun' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Remove Overnight oats from Mon breakfast' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add lunch for Mon' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add snack for Sun' })).toBeInTheDocument();
  });

  it('opens the recipe picker and moves focus when an empty slot is activated', async () => {
    await renderPlanner();

    fireEvent.click(screen.getByRole('button', { name: 'Add lunch for Mon' }));

    expect(screen.getByRole('dialog', { name: 'Add lunch' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Close meal picker' })).toHaveFocus();
  });

  it('hides the picker and restores focus on Escape or Close', async () => {
    await renderPlanner();
    const emptySlot = screen.getByRole('button', { name: 'Add lunch for Mon' });

    fireEvent.click(emptySlot);
    expect(screen.getByRole('dialog', { name: 'Add lunch' })).toBeInTheDocument();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('dialog', { name: 'Add lunch' })).not.toBeInTheDocument();
    expect(emptySlot).toHaveFocus();

    fireEvent.click(emptySlot);
    expect(screen.getByRole('dialog', { name: 'Add lunch' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Close meal picker' }));
    expect(screen.queryByRole('dialog', { name: 'Add lunch' })).not.toBeInTheDocument();
    expect(emptySlot).toHaveFocus();
  });

  it('adds missing ingredients to the shopping list when the missing count is greater than zero', async () => {
    await renderPlanner();

    const addMissing = await screen.findByRole('button', {
      name: `Add ${fixtures.missingIngredients.length} missing ingredients to shopping list`,
    });
    fireEvent.click(addMissing);

    await waitFor(() => {
      expect(fixtures.addMissingToShoppingList).toHaveBeenCalledTimes(1);
    });
    expect(fixtures.addMissingToShoppingList).toHaveBeenCalledWith(fixtures.weekPlan);
    expect(await screen.findByRole('status')).toHaveTextContent('Added 3 items to your shopping list.');
  });
});
