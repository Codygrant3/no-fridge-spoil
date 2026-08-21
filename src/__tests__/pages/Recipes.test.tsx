import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import {
  getRecipeRecommendations,
} from '../../services/recipeService';
import type { InventoryItem } from '../../types';

const { NOW, inventoryItems } = vi.hoisted(() => {
  const NOW = new Date('2026-07-16T12:00:00Z');

  function inventoryItem(
    id: string,
    name: string,
    expirationDate: string,
    status: InventoryItem['status'] = 'good',
  ): InventoryItem {
    return {
      id,
      name,
      expirationDate,
      dateType: 'best_by',
      addedAt: '2026-07-15T12:00:00Z',
      status,
      quantity: 1,
      storageLocation: 'fridge',
    };
  }

  return {
    NOW,
    inventoryItems: [
      inventoryItem('spinach', 'Baby Spinach', '2026-07-17', 'expiring_soon'),
      inventoryItem('egg', 'Eggs', '2026-07-24'),
      inventoryItem('bread', 'Bread', '2026-07-22'),
      inventoryItem('garlic', 'Garlic', '2026-08-01'),
    ],
  };
});

vi.mock('../../context/InventoryContext', () => ({
  useInventory: () => ({
    items: inventoryItems,
    removeItem: vi.fn(),
    consumeItem: vi.fn(),
    updateItem: vi.fn(),
  }),
}));

vi.mock('../../services/recipeService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../services/recipeService')>();
  return {
    ...actual,
    getRecipeRecommendations: (
      items: Parameters<typeof actual.getRecipeRecommendations>[0],
      options: Parameters<typeof actual.getRecipeRecommendations>[1] = {},
    ) => actual.getRecipeRecommendations(items, { ...options, now: NOW }),
  };
});

import { Recipes } from '../../pages/Recipes';

function recipeResults() {
  return screen.getByRole('region', {
    name: /recommended for you|ready to cook|recipe catalogue/i,
  });
}

describe('Recipes page', () => {
  it('renders the Recipes heading and view group', () => {
    render(<Recipes />);

    expect(screen.getByRole('heading', { name: 'Recipes' })).toBeInTheDocument();
    const views = screen.getByRole('group', { name: /recipe view/i });
    expect(within(views).getByRole('button', { name: 'For you' })).toBeInTheDocument();
    expect(within(views).getByRole('button', { name: 'Make now' })).toBeInTheDocument();
    expect(within(views).getByRole('button', { name: 'Catalogue' })).toBeInTheDocument();
  });

  it('shows a ready recipe on Make now and hides recipes that are not ready', async () => {
    const user = userEvent.setup();
    const ready = getRecipeRecommendations(inventoryItems, { now: NOW })
      .filter(recipe => recipe.match.canMakeNow)
      .map(recipe => recipe.title);
    const notReady = getRecipeRecommendations(inventoryItems, { now: NOW })
      .filter(recipe => !recipe.match.canMakeNow)
      .map(recipe => recipe.title);

    expect(ready).toContain('Spinach Egg Toast');
    expect(notReady).toContain('Garden Vegetable Omelet');

    render(<Recipes />);
    await user.click(screen.getByRole('button', { name: 'Make now' }));

    const results = recipeResults();
    expect(screen.getByRole('heading', { name: 'Ready to cook' })).toBeInTheDocument();
    expect(within(results).getByRole('button', { name: /spinach egg toast/i })).toBeInTheDocument();
    expect(within(results).queryByRole('button', { name: /garden vegetable omelet/i })).not.toBeInTheDocument();
  });

  it('shows the empty state when Breakfast and Vegan filters have no catalogue matches', async () => {
    const user = userEvent.setup();
    expect(getRecipeRecommendations(inventoryItems, {
      dietaryTag: 'vegan',
      mealType: 'breakfast',
      now: NOW,
    })).toEqual([]);

    render(<Recipes />);
    await user.selectOptions(screen.getByRole('combobox', { name: /meal/i }), 'breakfast');
    await user.selectOptions(screen.getByRole('combobox', { name: /preference/i }), 'vegan');

    expect(screen.getByRole('heading', { name: 'No recipes match these filters' })).toBeInTheDocument();
    expect(screen.getByText(/try another meal, preference, or catalogue view/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /spinach egg toast/i })).not.toBeInTheDocument();
  });

  it('reveals the recipe search field and filters the catalogue by query', async () => {
    const user = userEvent.setup();
    render(<Recipes />);

    expect(screen.queryByRole('textbox', { name: /search recipes or ingredients/i })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /search recipes/i }));
    const search = screen.getByRole('textbox', { name: /search recipes or ingredients/i });
    expect(search).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Catalogue' }));
    await user.type(search, 'banana');

    const results = recipeResults();
    expect(within(results).getByRole('button', { name: /banana oat pancakes/i })).toBeInTheDocument();
    expect(within(results).queryByRole('button', { name: /spinach egg toast/i })).not.toBeInTheDocument();
  });

  it('opens Cook Mode from a recipe card', async () => {
    const user = userEvent.setup();
    render(<Recipes />);

    await user.click(
      within(recipeResults()).getByRole('button', { name: /spinach egg toast/i }),
    );

    expect(screen.getByText('NOW COOKING')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Spinach Egg Toast' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /exit cook mode/i })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Recipes' })).not.toBeInTheDocument();
  });
});
