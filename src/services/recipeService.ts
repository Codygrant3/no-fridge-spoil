import { ai } from './ai-client';
import type { InventoryItem } from '../types';
import { makeRecipeCacheKey, getCachedResponse, setCachedResponse } from './aiCacheService';

export interface Recipe {
    title: string;
    description: string;
    ingredients: string[];
    instructions: string[];
    prepTime: string;
    cookTime: string;  // V2: Added for Cook Mode
    difficulty: 'Easy' | 'Medium' | 'Hard';
    usedIngredients: string[]; // Which inventory items are used
}

export async function generateRecipes(items: InventoryItem[]): Promise<Recipe[]> {
    if (!ai) {
        throw new Error("Gemini API Key not configured");
    }

    if (items.length === 0) {
        return [];
    }

    // Check cache first
    const cacheKey = makeRecipeCacheKey(items.map(i => i.name));
    const cached = await getCachedResponse<Recipe[]>(cacheKey, 'recipe');
    if (cached) {
        console.log('AI Cache hit: recipe generation');
        return cached;
    }

    const itemNames = items.map(i => `${i.name} (${i.quantity} units)`).join(', ');
    const expiringNames = items
        .filter(i => i.status === 'expiring_soon' || i.status === 'expired')
        .map(i => i.name)
        .join(', ');

    const prompt = `
        You are a creative chef. I have these ingredients in my fridge: ${itemNames}.
        ${expiringNames ? `Please prioritize using these items which are expiring soon: ${expiringNames}.` : ''}

        Suggest 3 distinct recipes I can make. You can assume I have basic pantry staples (oil, salt, pepper, flour, etc.).
        
        Return ONLY valid JSON array with this structure:
        [
            {
                "title": "Recipe Name",
                "description": "Short appetizing description",
                "ingredients": ["1 cup flour", "2 eggs"],
                "instructions": ["Step 1: Do this first", "Step 2: Then do this"],
                "prepTime": "15 mins",
                "cookTime": "30 mins",
                "difficulty": "Easy",
                "usedIngredients": ["Egg", "Milk"]
            }
        ]
        Important: Each instruction should be a complete, clear step. Do not use markdown formatting.
    `;

    try {
        const response = await ai.models.generateContent({
            model: 'gemini-2.0-flash',
            contents: [{
                role: 'user',
                parts: [{ text: prompt }]
            }]
        });

        const responseText = response.text || "";

        // Clean up markdown if present
        const jsonStr = responseText.replace(/```json/g, '').replace(/```/g, '').trim();
        const recipes: Recipe[] = JSON.parse(jsonStr);

        // Cache successful result
        await setCachedResponse(cacheKey, 'recipe', recipes);

        return recipes;
    } catch (error) {
        console.error("Recipe generation failed:", error);
        throw new Error("Failed to generate recipes");
    }
}

/**
 * Generate quick recipes (total time < 30 mins) prioritizing expiring items
 * @param items - Inventory items to use
 * @param maxTotalTime - Maximum total time in minutes (default: 30)
 */
export async function generateQuickRecipes(
    items: InventoryItem[],
    maxTotalTime: number = 30
): Promise<Recipe[]> {
    const allRecipes = await generateRecipes(items);

    // Filter recipes by total time
    const quickRecipes = allRecipes.filter(recipe => {
        const prepMins = parseInt(recipe.prepTime) || 0;
        const cookMins = parseInt(recipe.cookTime) || 0;
        return (prepMins + cookMins) <= maxTotalTime;
    });

    return quickRecipes;
}
