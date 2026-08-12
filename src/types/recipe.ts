export type RecipeDifficulty = 'Easy' | 'Medium' | 'Hard';

export type RecipeMealType = 'breakfast' | 'lunch' | 'dinner' | 'snack';

export type RecipeDietaryTag = 'vegetarian' | 'vegan' | 'gluten-free' | 'dairy-free';

export interface RecipeIngredient {
    name: string;
    amount: string;
    aliases?: string[];
    pantryStaple?: boolean;
    optional?: boolean;
}

export interface Recipe {
    title: string;
    description: string;
    ingredients: string[];
    instructions: string[];
    prepTime: string;
    cookTime: string;
    difficulty: RecipeDifficulty;
    usedIngredients: string[];
}

export interface CatalogRecipe extends Recipe {
    id: string;
    ingredientDetails: RecipeIngredient[];
    prepMinutes: number;
    cookMinutes: number;
    servings: number;
    mealTypes: RecipeMealType[];
    dietaryTags: RecipeDietaryTag[];
    cuisine: string;
    catalogPriority: number;
    image?: string;
    imageAlt?: string;
}

export interface RecipeMatch {
    score: number;
    coverage: number;
    canMakeNow: boolean;
    matchedIngredients: string[];
    matchedInventoryItems: string[];
    missingIngredients: string[];
    expiringIngredients: string[];
    assumedStaples: string[];
    reasons: string[];
}

export interface RecipeRecommendation extends CatalogRecipe {
    match: RecipeMatch;
}
