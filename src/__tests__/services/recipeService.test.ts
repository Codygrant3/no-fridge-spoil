import { describe, expect, it } from 'vitest';
import { RECIPE_CATALOG } from '../../data/recipeCatalog';
import {
  generateQuickRecipes,
  getRecipeRecommendations,
  inventoryHasIngredient,
  isInventoryItemUsable,
  normalizeIngredientName,
} from '../../services/recipeService';
import type { InventoryItem } from '../../types';

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

describe('recipeService', () => {
  it('ships a unique structured catalogue with at least 30 recipes', () => {
    expect(RECIPE_CATALOG.length).toBeGreaterThanOrEqual(30);
    expect(new Set(RECIPE_CATALOG.map(recipe => recipe.id)).size).toBe(RECIPE_CATALOG.length);
    for (const recipe of RECIPE_CATALOG) {
      expect(recipe.title).not.toBe('');
      expect(recipe.ingredientDetails.length).toBeGreaterThan(0);
      expect(recipe.instructions.length).toBeGreaterThan(0);
    }
  });

  it('normalizes quantities, descriptors, plurals, and known aliases', () => {
    expect(normalizeIngredientName('2 cups fresh baby spinach')).toBe('spinach');
    expect(normalizeIngredientName('Boneless Skinless Chicken Breasts')).toBe('chicken');
    expect(normalizeIngredientName('1 can garbanzo beans')).toBe('chickpea');
  });

  it('never treats expired inventory as usable', () => {
    const expired = inventoryItem('expired', 'Spinach', '2026-07-15', 'expired');
    expect(isInventoryItemUsable(expired, NOW)).toBe(false);
    expect(inventoryHasIngredient('spinach', [expired], NOW)).toBe(false);
  });

  it('prioritizes recipes that use ingredients expiring soon', () => {
    const items = [
      inventoryItem('spinach', 'Baby Spinach', '2026-07-17', 'expiring_soon'),
      inventoryItem('egg', 'Eggs', '2026-07-24'),
      inventoryItem('bread', 'Whole Grain Bread', '2026-07-22'),
    ];
    const recommendations = getRecipeRecommendations(items, { now: NOW });
    const spinachToast = recommendations.find(recipe => recipe.id === 'spinach-egg-toast');

    expect(spinachToast?.match.expiringIngredients).toContain('Baby Spinach');
    expect(spinachToast?.match.reasons[0]).toContain('before it expires');
    expect(recommendations[0].match.score).toBeGreaterThan(0);
  });

  it('filters quick recommendations by total preparation time', async () => {
    const items = [
      inventoryItem('banana', 'Bananas', '2026-07-18'),
      inventoryItem('oats', 'Rolled Oats', '2026-08-01'),
      inventoryItem('egg', 'Eggs', '2026-07-24'),
      inventoryItem('milk', 'Milk', '2026-07-19'),
    ];
    const recipes = await generateQuickRecipes(items, 20, NOW);

    expect(recipes.length).toBeGreaterThan(0);
    expect(recipes.every(recipe => recipe.prepMinutes + recipe.cookMinutes <= 20)).toBe(true);
  });

  it('returns no generated recommendations for an empty inventory', async () => {
    expect(await generateQuickRecipes([], 30)).toEqual([]);
  });
});
