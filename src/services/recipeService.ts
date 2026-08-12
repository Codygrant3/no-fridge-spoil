import { RECIPE_CATALOG } from '../data/recipeCatalog';
import type { InventoryItem } from '../types';
import type {
    CatalogRecipe,
    RecipeDietaryTag,
    RecipeIngredient,
    RecipeMealType,
    RecipeRecommendation,
} from '../types/recipe';

export type {
    CatalogRecipe,
    Recipe,
    RecipeDietaryTag,
    RecipeIngredient,
    RecipeMatch,
    RecipeMealType,
    RecipeRecommendation,
} from '../types/recipe';

export interface RecipeRecommendationOptions {
    dietaryTag?: RecipeDietaryTag;
    includeUnmatched?: boolean;
    limit?: number;
    maxTotalMinutes?: number;
    mealType?: RecipeMealType;
    now?: Date;
    query?: string;
}

interface InventoryIngredient {
    item: InventoryItem;
    keys: Set<string>;
    expiringSoon: boolean;
}

const MEASUREMENT_WORDS = new Set([
    'bag', 'bags', 'bottle', 'bottles', 'box', 'boxes', 'can', 'cans',
    'clove', 'cloves', 'cup', 'cups', 'dash', 'dashes', 'dozen',
    'g', 'gallon', 'gallons', 'gram', 'grams', 'kg', 'kilogram', 'kilograms',
    'l', 'lb', 'lbs', 'liter', 'liters', 'ml', 'ounce', 'ounces', 'oz',
    'package', 'packages', 'piece', 'pieces', 'pinch', 'pint', 'pints',
    'pound', 'pounds', 'quart', 'quarts', 'slice', 'slices', 'stalk', 'stalks',
    'tablespoon', 'tablespoons', 'tbsp', 'teaspoon', 'teaspoons', 'tsp',
]);

const DESCRIPTOR_WORDS = new Set([
    'baby', 'boneless', 'canned', 'chopped', 'diced', 'drained', 'dry', 'fresh',
    'frozen', 'grated', 'large', 'medium', 'minced', 'organic', 'packed', 'plain',
    'ripe', 'shredded', 'skinless', 'sliced', 'small', 'softened', 'thinly',
    'whole', 'warm',
]);

const IRREGULAR_SINGULARS: Readonly<Record<string, string>> = {
    berries: 'berry',
    broccoli: 'broccoli',
    cheese: 'cheese',
    chickpeas: 'chickpea',
    eggs: 'egg',
    fish: 'fish',
    leaves: 'leaf',
    lentils: 'lentil',
    mushrooms: 'mushroom',
    oats: 'oat',
    potatoes: 'potato',
    rice: 'rice',
    tomatoes: 'tomato',
};

const INGREDIENT_ALIASES: Readonly<Record<string, string>> = {
    'baby spinach': 'spinach',
    'beef mince': 'ground beef',
    'boneless skinless chicken breast': 'chicken',
    'brown rice': 'brown rice',
    'cannellini bean': 'white bean',
    'chicken breast': 'chicken',
    'chicken thigh': 'chicken',
    'coriander leaf': 'cilantro',
    'courgette': 'zucchini',
    'garbanzo bean': 'chickpea',
    'greek yogurt': 'yogurt',
    'green onion': 'green onion',
    'mixed green': 'lettuce',
    'navy bean': 'white bean',
    'old fashioned oat': 'rolled oat',
    'plain yogurt': 'yogurt',
    'risotto rice': 'arborio rice',
    'romaine': 'lettuce',
    'russet potato': 'potato',
    'salmon fillet': 'salmon',
    'scallion': 'green onion',
    'sweet pepper': 'bell pepper',
    'white rice': 'white rice',
};

function singularize(word: string): string {
    if (IRREGULAR_SINGULARS[word]) return IRREGULAR_SINGULARS[word];
    if (word.length <= 3 || word.endsWith('ss') || word.endsWith('us')) return word;
    if (word.endsWith('ies')) return word.slice(0, -3) + 'y';
    if (word.endsWith('oes')) return word.slice(0, -2);
    if (word.endsWith('ches') || word.endsWith('shes') || word.endsWith('xes')) {
        return word.slice(0, -2);
    }
    if (word.endsWith('s')) return word.slice(0, -1);
    return word;
}

export function normalizeIngredientName(value: string): string {
    const normalized = value
        .toLowerCase()
        .replace(/\([^)]*\)/g, ' ')
        .replace(/&/g, ' and ')
        .replace(/\b\d+(?:[./]\d+)?\b/g, ' ')
        .replace(/[^a-z\s-]/g, ' ')
        .replace(/-/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

    const directAlias = INGREDIENT_ALIASES[normalized];
    if (directAlias) return directAlias;

    const words = normalized
        .split(' ')
        .filter(word => word && !MEASUREMENT_WORDS.has(word) && !DESCRIPTOR_WORDS.has(word))
        .map(singularize);
    const compact = words.join(' ').trim();
    return INGREDIENT_ALIASES[compact] ?? compact;
}

function ingredientKeys(name: string, aliases: readonly string[] = []): Set<string> {
    return new Set([name, ...aliases].map(normalizeIngredientName).filter(Boolean));
}

function ingredientMatches(
    ingredient: RecipeIngredient,
    inventory: readonly InventoryIngredient[],
): InventoryIngredient | undefined {
    const expectedKeys = ingredientKeys(ingredient.name, ingredient.aliases);
    return inventory.find(candidate => (
        [...expectedKeys].some(key => candidate.keys.has(key))
    ));
}

function parseDateOnly(value: string): number | null {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
    const timestamp = new Date(value + 'T00:00:00').getTime();
    return Number.isNaN(timestamp) ? null : timestamp;
}

function startOfDay(value: Date): number {
    const result = new Date(value);
    result.setHours(0, 0, 0, 0);
    return result.getTime();
}

export function isInventoryItemUsable(item: InventoryItem, now: Date = new Date()): boolean {
    if (item.status === 'expired' || item.quantity <= 0) return false;
    const expiration = parseDateOnly(item.expirationDate);
    return expiration === null || expiration >= startOfDay(now);
}

function isInventoryItemExpiringSoon(item: InventoryItem, now: Date): boolean {
    if (!isInventoryItemUsable(item, now)) return false;
    if (item.status === 'expiring_soon') return true;
    const expiration = parseDateOnly(item.expirationDate);
    if (expiration === null) return false;
    const days = Math.ceil((expiration - startOfDay(now)) / 86_400_000);
    return days >= 0 && days <= 3;
}

function prepareInventory(items: readonly InventoryItem[], now: Date): InventoryIngredient[] {
    return items
        .filter(item => isInventoryItemUsable(item, now))
        .map(item => ({
            item,
            keys: ingredientKeys(item.name),
            expiringSoon: isInventoryItemExpiringSoon(item, now),
        }));
}

export function inventoryHasIngredient(
    ingredientName: string,
    items: readonly InventoryItem[],
    now: Date = new Date(),
): boolean {
    const ingredient: RecipeIngredient = { name: ingredientName, amount: '' };
    return Boolean(ingredientMatches(ingredient, prepareInventory(items, now)));
}

function unique(values: readonly string[]): string[] {
    return [...new Set(values)];
}

function buildReasons(
    canMakeNow: boolean,
    matchedInventoryItems: readonly string[],
    missingIngredients: readonly string[],
    expiringIngredients: readonly string[],
): string[] {
    const reasons: string[] = [];
    if (expiringIngredients.length === 1) {
        reasons.push('Uses ' + expiringIngredients[0] + ' before it expires');
    } else if (expiringIngredients.length > 1) {
        reasons.push('Uses ' + expiringIngredients.length + ' items that need attention');
    }

    if (canMakeNow) {
        reasons.push('You have every required ingredient');
    } else if (missingIngredients.length === 1) {
        reasons.push('Only ' + missingIngredients[0] + ' is missing');
    } else if (missingIngredients.length > 1) {
        reasons.push(missingIngredients.length + ' ingredients to pick up');
    }

    if (matchedInventoryItems.length > 0) {
        reasons.push('Uses ' + matchedInventoryItems.length + ' item' + (matchedInventoryItems.length === 1 ? '' : 's') + ' on hand');
    }

    return reasons.length > 0 ? reasons : ['Browse the kitchen catalogue'];
}

export function scoreRecipe(
    recipe: CatalogRecipe,
    items: readonly InventoryItem[],
    now: Date = new Date(),
): RecipeRecommendation {
    const inventory = prepareInventory(items, now);
    const matchedIngredients: string[] = [];
    const matchedInventoryItems: string[] = [];
    const missingIngredients: string[] = [];
    const expiringIngredients: string[] = [];
    const assumedStaples: string[] = [];
    let requiredCount = 0;
    let matchedRequiredCount = 0;

    for (const ingredient of recipe.ingredientDetails) {
        const match = ingredientMatches(ingredient, inventory);

        if (ingredient.pantryStaple) {
            assumedStaples.push(ingredient.name);
            continue;
        }

        if (!ingredient.optional) requiredCount += 1;

        if (match) {
            matchedIngredients.push(ingredient.name);
            matchedInventoryItems.push(match.item.name);
            if (!ingredient.optional) matchedRequiredCount += 1;
            if (match.expiringSoon) expiringIngredients.push(match.item.name);
        } else if (!ingredient.optional) {
            missingIngredients.push(ingredient.name);
        }
    }

    const distinctMatchedItems = unique(matchedInventoryItems);
    const distinctExpiringItems = unique(expiringIngredients);
    const coverage = requiredCount === 0
        ? 0
        : Math.round((matchedRequiredCount / requiredCount) * 100);
    const canMakeNow = requiredCount > 0 && missingIngredients.length === 0;
    const rawScore = (coverage * 0.68)
        + Math.min(distinctMatchedItems.length * 5, 15)
        + Math.min(distinctExpiringItems.length * 8, 16)
        + (canMakeNow ? 8 : 0)
        - Math.min(missingIngredients.length * 2, 12);
    const score = Math.max(0, Math.min(100, Math.round(rawScore)));

    return {
        ...recipe,
        usedIngredients: distinctMatchedItems,
        match: {
            score,
            coverage,
            canMakeNow,
            matchedIngredients: unique(matchedIngredients),
            matchedInventoryItems: distinctMatchedItems,
            missingIngredients: unique(missingIngredients),
            expiringIngredients: distinctExpiringItems,
            assumedStaples: unique(assumedStaples),
            reasons: buildReasons(
                canMakeNow,
                distinctMatchedItems,
                missingIngredients,
                distinctExpiringItems,
            ),
        },
    };
}

function matchesQuery(recipe: CatalogRecipe, query: string): boolean {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return true;
    const searchable = [
        recipe.title,
        recipe.description,
        recipe.cuisine,
        ...recipe.ingredientDetails.flatMap(ingredient => [ingredient.name, ...(ingredient.aliases ?? [])]),
    ].join(' ').toLowerCase();
    return searchable.includes(normalizedQuery);
}

export function getRecipeRecommendations(
    items: readonly InventoryItem[],
    options: RecipeRecommendationOptions = {},
): RecipeRecommendation[] {
    const now = options.now ?? new Date();
    const includeUnmatched = options.includeUnmatched ?? true;
    const recommendations = RECIPE_CATALOG
        .filter(recipe => !options.mealType || recipe.mealTypes.includes(options.mealType))
        .filter(recipe => !options.dietaryTag || recipe.dietaryTags.includes(options.dietaryTag))
        .filter(recipe => !options.maxTotalMinutes || (
            recipe.prepMinutes + recipe.cookMinutes <= options.maxTotalMinutes
        ))
        .filter(recipe => matchesQuery(recipe, options.query ?? ''))
        .map(recipe => scoreRecipe(recipe, items, now))
        .filter(recipe => includeUnmatched || recipe.match.matchedInventoryItems.length > 0)
        .sort((first, second) => (
            second.match.score - first.match.score
            || second.match.expiringIngredients.length - first.match.expiringIngredients.length
            || first.match.missingIngredients.length - second.match.missingIngredients.length
            || first.catalogPriority - second.catalogPriority
        ));

    return options.limit ? recommendations.slice(0, options.limit) : recommendations;
}

export function getRecipeById(recipeId: string): CatalogRecipe | undefined {
    return RECIPE_CATALOG.find(recipe => recipe.id === recipeId);
}

export async function generateRecipes(items: InventoryItem[]): Promise<RecipeRecommendation[]> {
    if (items.length === 0) return [];
    const recommendations = getRecipeRecommendations(items, { includeUnmatched: false });
    return recommendations.slice(0, 3);
}

export async function generateQuickRecipes(
    items: InventoryItem[],
    maxTotalTime: number = 30,
    now: Date = new Date(),
): Promise<RecipeRecommendation[]> {
    if (items.length === 0) return [];
    return getRecipeRecommendations(items, {
        includeUnmatched: false,
        limit: 3,
        maxTotalMinutes: maxTotalTime,
        now,
    });
}
