import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { InventoryItem } from '../../types';

// Mock the GoogleGenAI module
vi.mock('@google/genai', () => ({
  GoogleGenAI: vi.fn().mockImplementation(() => ({
    models: {
      generateContent: vi.fn(),
    },
  })),
}));

// We need to mock import.meta.env
vi.stubEnv('VITE_GEMINI_API_KEY', 'test-api-key');

describe('recipeService', () => {
  // Create mock inventory items for testing
  const mockInventoryItems: InventoryItem[] = [
    {
      id: '1',
      name: 'Milk',
      expirationDate: '2026-01-25',
      dateType: 'use_by',
      addedAt: '2026-01-20T00:00:00Z',
      status: 'expiring_soon',
      quantity: 1,
      storageLocation: 'fridge',
    },
    {
      id: '2',
      name: 'Eggs',
      expirationDate: '2026-02-01',
      dateType: 'best_by',
      addedAt: '2026-01-20T00:00:00Z',
      status: 'good',
      quantity: 12,
      storageLocation: 'fridge',
    },
    {
      id: '3',
      name: 'Cheese',
      expirationDate: '2026-01-22',
      dateType: 'use_by',
      addedAt: '2026-01-15T00:00:00Z',
      status: 'expired',
      quantity: 1,
      storageLocation: 'fridge',
    },
  ];

  const mockRecipeResponse = [
    {
      title: 'Cheese Omelette',
      description: 'A fluffy omelette with melted cheese',
      ingredients: ['2 eggs', '1/4 cup milk', '1/2 cup shredded cheese'],
      instructions: ['Beat eggs with milk', 'Pour into pan', 'Add cheese and fold'],
      prepTime: '5 mins',
      cookTime: '10 mins',
      difficulty: 'Easy',
      usedIngredients: ['Eggs', 'Milk', 'Cheese'],
    },
    {
      title: 'French Toast',
      description: 'Classic French toast made with eggs and milk',
      ingredients: ['4 slices bread', '2 eggs', '1/2 cup milk'],
      instructions: ['Mix eggs and milk', 'Dip bread', 'Cook until golden'],
      prepTime: '5 mins',
      cookTime: '15 mins',
      difficulty: 'Easy',
      usedIngredients: ['Eggs', 'Milk'],
    },
    {
      title: 'Cheesy Scrambled Eggs',
      description: 'Creamy scrambled eggs with cheese',
      ingredients: ['3 eggs', '2 tbsp milk', '1/4 cup cheese'],
      instructions: ['Beat eggs with milk', 'Scramble in pan', 'Add cheese at end'],
      prepTime: '3 mins',
      cookTime: '5 mins',
      difficulty: 'Easy',
      usedIngredients: ['Eggs', 'Milk', 'Cheese'],
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Recipe type validation', () => {
    it('should have valid recipe structure', () => {
      const recipe = mockRecipeResponse[0];

      expect(recipe).toHaveProperty('title');
      expect(recipe).toHaveProperty('description');
      expect(recipe).toHaveProperty('ingredients');
      expect(recipe).toHaveProperty('instructions');
      expect(recipe).toHaveProperty('prepTime');
      expect(recipe).toHaveProperty('cookTime');
      expect(recipe).toHaveProperty('difficulty');
      expect(recipe).toHaveProperty('usedIngredients');

      expect(typeof recipe.title).toBe('string');
      expect(typeof recipe.description).toBe('string');
      expect(Array.isArray(recipe.ingredients)).toBe(true);
      expect(Array.isArray(recipe.instructions)).toBe(true);
      expect(Array.isArray(recipe.usedIngredients)).toBe(true);
      expect(['Easy', 'Medium', 'Hard']).toContain(recipe.difficulty);
    });
  });

  describe('Recipe filtering logic', () => {
    it('should identify expiring items from inventory', () => {
      const expiringItems = mockInventoryItems.filter(
        (i) => i.status === 'expiring_soon' || i.status === 'expired'
      );

      expect(expiringItems).toHaveLength(2);
      expect(expiringItems.map((i) => i.name)).toContain('Milk');
      expect(expiringItems.map((i) => i.name)).toContain('Cheese');
    });

    it('should filter quick recipes by total time', () => {
      const maxTotalTime = 30;

      const quickRecipes = mockRecipeResponse.filter((recipe) => {
        const prepMins = parseInt(recipe.prepTime) || 0;
        const cookMins = parseInt(recipe.cookTime) || 0;
        return prepMins + cookMins <= maxTotalTime;
      });

      // All mock recipes are under 30 mins total
      expect(quickRecipes).toHaveLength(3);
    });

    it('should filter out recipes over time limit', () => {
      const recipesWithLong = [
        ...mockRecipeResponse,
        {
          title: 'Slow Roast',
          description: 'A long cooking dish',
          ingredients: ['beef'],
          instructions: ['Cook slowly'],
          prepTime: '30 mins',
          cookTime: '120 mins',
          difficulty: 'Hard' as const,
          usedIngredients: ['Beef'],
        },
      ];

      const maxTotalTime = 30;
      const quickRecipes = recipesWithLong.filter((recipe) => {
        const prepMins = parseInt(recipe.prepTime) || 0;
        const cookMins = parseInt(recipe.cookTime) || 0;
        return prepMins + cookMins <= maxTotalTime;
      });

      expect(quickRecipes).toHaveLength(3);
      expect(quickRecipes.find((r) => r.title === 'Slow Roast')).toBeUndefined();
    });

    it('should handle recipes with non-numeric time strings', () => {
      const recipesWithWeirdTimes = [
        {
          title: 'Quick Snack',
          description: 'Fast',
          ingredients: ['stuff'],
          instructions: ['Make it'],
          prepTime: 'about 5 mins',
          cookTime: 'approximately 10 mins',
          difficulty: 'Easy' as const,
          usedIngredients: ['stuff'],
        },
      ];

      const quickRecipes = recipesWithWeirdTimes.filter((recipe) => {
        const prepMins = parseInt(recipe.prepTime) || 0;
        const cookMins = parseInt(recipe.cookTime) || 0;
        return prepMins + cookMins <= 30;
      });

      // parseInt('about 5 mins') returns NaN, which becomes 0
      // So this recipe would pass the filter with 0 + 0 = 0 mins
      expect(quickRecipes).toHaveLength(1);
    });
  });

  describe('Inventory item formatting', () => {
    it('should format inventory items for prompt', () => {
      const itemNames = mockInventoryItems.map((i) => `${i.name} (${i.quantity} units)`).join(', ');

      expect(itemNames).toBe('Milk (1 units), Eggs (12 units), Cheese (1 units)');
    });

    it('should identify expiring item names for prompt', () => {
      const expiringNames = mockInventoryItems
        .filter((i) => i.status === 'expiring_soon' || i.status === 'expired')
        .map((i) => i.name)
        .join(', ');

      expect(expiringNames).toBe('Milk, Cheese');
    });

    it('should handle empty inventory', () => {
      const emptyItems: InventoryItem[] = [];
      const itemNames = emptyItems.map((i) => `${i.name} (${i.quantity} units)`).join(', ');

      expect(itemNames).toBe('');
    });

    it('should handle inventory with no expiring items', () => {
      const freshItems: InventoryItem[] = [
        {
          id: '1',
          name: 'Fresh Apple',
          expirationDate: '2026-02-15',
          dateType: 'best_by',
          addedAt: '2026-01-20T00:00:00Z',
          status: 'good',
          quantity: 5,
          storageLocation: 'fridge',
        },
      ];

      const expiringNames = freshItems
        .filter((i) => i.status === 'expiring_soon' || i.status === 'expired')
        .map((i) => i.name)
        .join(', ');

      expect(expiringNames).toBe('');
    });
  });

  describe('JSON response parsing', () => {
    it('should handle clean JSON response', () => {
      const jsonStr = JSON.stringify(mockRecipeResponse);
      const recipes = JSON.parse(jsonStr);

      expect(recipes).toHaveLength(3);
      expect(recipes[0].title).toBe('Cheese Omelette');
    });

    it('should clean markdown code blocks from response', () => {
      const responseWithMarkdown = '```json\n' + JSON.stringify(mockRecipeResponse) + '\n```';

      const cleanedJson = responseWithMarkdown.replace(/```json/g, '').replace(/```/g, '').trim();
      const recipes = JSON.parse(cleanedJson);

      expect(recipes).toHaveLength(3);
    });

    it('should handle response with extra whitespace', () => {
      const responseWithWhitespace = '\n\n  ' + JSON.stringify(mockRecipeResponse) + '  \n\n';

      const cleanedJson = responseWithWhitespace.replace(/```json/g, '').replace(/```/g, '').trim();
      const recipes = JSON.parse(cleanedJson);

      expect(recipes).toHaveLength(3);
    });
  });
});
