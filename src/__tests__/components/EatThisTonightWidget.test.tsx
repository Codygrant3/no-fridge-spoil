import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { EatThisTonightWidget } from '../../components/EatThisTonightWidget';
import type { RecipeRecommendation } from '../../services/recipeService';
import type { InventoryItem } from '../../types';

const generateRecipes = vi.hoisted(() => vi.fn());

vi.mock('../../services/recipeService', () => ({
    generateRecipes,
}));

const EXPIRING_EGGS: InventoryItem = {
    id: 'eggs',
    name: 'Eggs',
    expirationDate: '2026-08-22',
    dateType: 'best_by',
    addedAt: '2026-08-20T12:00:00Z',
    status: 'expiring_soon',
    quantity: 6,
    storageLocation: 'fridge',
};

function recipeFixture(
    overrides: Partial<RecipeRecommendation> & Pick<RecipeRecommendation, 'title' | 'prepMinutes' | 'cookMinutes'>,
): RecipeRecommendation {
    return {
        id: overrides.id ?? overrides.title.toLowerCase().replace(/\s+/g, '-'),
        title: overrides.title,
        description: overrides.description ?? 'A test recipe',
        ingredients: overrides.ingredients ?? ['1 egg'],
        instructions: overrides.instructions ?? ['Cook'],
        prepTime: overrides.prepTime ?? `${overrides.prepMinutes} min`,
        cookTime: overrides.cookTime ?? `${overrides.cookMinutes} min`,
        difficulty: overrides.difficulty ?? 'Easy',
        usedIngredients: overrides.usedIngredients ?? ['Eggs'],
        ingredientDetails: overrides.ingredientDetails ?? [{ name: 'egg', amount: '1' }],
        prepMinutes: overrides.prepMinutes,
        cookMinutes: overrides.cookMinutes,
        servings: overrides.servings ?? 1,
        mealTypes: overrides.mealTypes ?? ['dinner'],
        dietaryTags: overrides.dietaryTags ?? [],
        cuisine: overrides.cuisine ?? 'Test',
        catalogPriority: overrides.catalogPriority ?? 1,
        match: overrides.match ?? {
            score: 1,
            coverage: 1,
            canMakeNow: true,
            matchedIngredients: ['egg'],
            matchedInventoryItems: ['Eggs'],
            missingIngredients: [],
            expiringIngredients: ['Eggs'],
            assumedStaples: [],
            reasons: ['Uses Eggs'],
        },
    };
}

const LONG_RECIPE = recipeFixture({
    title: 'Slow Roast',
    description: 'A long roast that only looks quick if string times are parsed.',
    prepMinutes: 20,
    cookMinutes: 40,
    prepTime: '5 min',
    cookTime: '10 min',
});

const SHORT_RECIPE = recipeFixture({
    title: 'Quick Salad',
    description: 'A short salad that only looks slow if string times are parsed.',
    prepMinutes: 8,
    cookMinutes: 10,
    prepTime: '45 min',
    cookTime: '45 min',
});

describe('EatThisTonightWidget', () => {
    it('renders nothing when there are no expiring items', () => {
        const { container } = render(
            <EatThisTonightWidget expiringItems={[]} onCookNow={vi.fn()} />,
        );

        expect(container).toBeEmptyDOMElement();
        expect(generateRecipes).not.toHaveBeenCalled();
    });

    it('prefers a recipe whose numeric prep and cook minutes total under 30', async () => {
        generateRecipes.mockResolvedValue([LONG_RECIPE, SHORT_RECIPE]);

        render(
            <EatThisTonightWidget
                expiringItems={[EXPIRING_EGGS]}
                onCookNow={vi.fn()}
            />,
        );

        expect(await screen.findByText('Quick Salad')).toBeInTheDocument();
        expect(screen.getByText('18 min')).toBeInTheDocument();
        expect(screen.queryByText('Slow Roast')).not.toBeInTheDocument();
        expect(screen.queryByText('60 min')).not.toBeInTheDocument();
        expect(screen.queryByText('15 min')).not.toBeInTheDocument();
    });

    it('calls onCookNow with the preferred quick recipe when Start cooking is pressed', async () => {
        generateRecipes.mockResolvedValue([LONG_RECIPE, SHORT_RECIPE]);
        const onCookNow = vi.fn();

        render(
            <EatThisTonightWidget
                expiringItems={[EXPIRING_EGGS]}
                onCookNow={onCookNow}
            />,
        );

        const startCooking = await screen.findByRole('button', { name: 'Start cooking' });
        fireEvent.click(startCooking);

        expect(onCookNow).toHaveBeenCalledTimes(1);
        expect(onCookNow).toHaveBeenCalledWith(SHORT_RECIPE);
    });

    it('announces a loading status while generateRecipes is pending', async () => {
        let resolveRecipes: (recipes: RecipeRecommendation[]) => void = () => {};
        generateRecipes.mockImplementation(
            () => new Promise<RecipeRecommendation[]>((resolve) => {
                resolveRecipes = resolve;
            }),
        );

        render(
            <EatThisTonightWidget
                expiringItems={[EXPIRING_EGGS]}
                onCookNow={vi.fn()}
            />,
        );

        const status = screen.getByRole('status');
        expect(status).toHaveTextContent('Finding perfect recipe...');

        resolveRecipes([SHORT_RECIPE]);

        await waitFor(() => {
            expect(screen.queryByRole('status')).not.toBeInTheDocument();
        });
        expect(screen.getByText('Quick Salad')).toBeInTheDocument();
    });
});
