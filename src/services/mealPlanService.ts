/**
 * Meal Plan Service — 7-Day Planning with Shopping List Integration
 *
 * Generates meal plans prioritizing expiring items and
 * auto-adds missing ingredients to the shopping list.
 */

import { db } from '../db/database';
import type { DbMealPlan, MealSlot, DbShoppingItem } from '../db/database';
import type { InventoryItem } from '../types';
import {
    getRecipeRecommendations,
    inventoryHasIngredient,
    type RecipeRecommendation,
} from './recipeService';
import { getActiveCloudHouseholdId } from './cloudSessionService';
import { isCloudConfigured } from './supabaseClient';
import { belongsToActiveHousehold, localMutationFields } from './localMutationService';

/**
 * Get the Monday of the current week as YYYY-MM-DD.
 */
export function getCurrentWeekStart(): string {
    const now = new Date();
    const day = now.getDay();
    const diff = now.getDate() - day + (day === 0 ? -6 : 1); // Monday
    const monday = new Date(now);
    monday.setDate(diff);
    return monday.toISOString().split('T')[0];
}

/**
 * Get or create a meal plan for a given week.
 */
export async function getOrCreateWeekPlan(weekStartDate?: string): Promise<DbMealPlan> {
    const weekStart = weekStartDate || getCurrentWeekStart();
    const activeHouseholdId = getActiveCloudHouseholdId();

    const existing = (await db.mealPlans
        .where('weekStartDate')
        .equals(weekStart)
        .toArray())
        .find(plan => plan.isDeleted !== 1 && belongsToActiveHousehold(plan, isCloudConfigured, activeHouseholdId));

    if (existing) return existing;

    const now = new Date().toISOString();
    const newPlan: DbMealPlan = {
        id: crypto.randomUUID(),
        weekStartDate: weekStart,
        meals: [],
        createdAt: now,
        isDeleted: 0,
        ...localMutationFields(),
    };

    await db.mealPlans.put(newPlan);
    return newPlan;
}

/**
 * Add a meal to a day slot in the plan.
 */
export async function addMealToSlot(
    planId: string,
    day: number,
    slot: MealSlot['slot'],
    recipeName: string,
    ingredients: string[],
): Promise<void> {
    const plan = await db.mealPlans.get(planId);
    if (!plan) return;

    // Remove existing meal in same slot
    const meals = plan.meals.filter(m => !(m.day === day && m.slot === slot));

    meals.push({ day, slot, recipeName, ingredients });

    await db.mealPlans.update(planId, {
        meals,
        ...localMutationFields(plan.cloudHouseholdId),
    });
}

/**
 * Remove a meal from a slot.
 */
export async function removeMealFromSlot(
    planId: string,
    day: number,
    slot: MealSlot['slot'],
): Promise<void> {
    const plan = await db.mealPlans.get(planId);
    if (!plan) return;

    const meals = plan.meals.filter(m => !(m.day === day && m.slot === slot));
    await db.mealPlans.update(planId, {
        meals,
        ...localMutationFields(plan.cloudHouseholdId),
    });
}

/**
 * Get all ingredients needed for the current meal plan.
 */
export function getAllIngredients(plan: DbMealPlan): string[] {
    const all = new Set<string>();
    for (const meal of plan.meals) {
        for (const ing of meal.ingredients) {
            all.add(ing.toLowerCase().trim());
        }
    }
    return Array.from(all);
}

/**
 * Find ingredients from the plan that are NOT in the current inventory.
 */
export async function getMissingIngredients(plan: DbMealPlan): Promise<string[]> {
    const planIngredients = getAllIngredients(plan);

    // Get current inventory names
    const items = await db.items
        .where('isDeleted')
        .equals(0)
        .toArray();
    const activeHouseholdId = getActiveCloudHouseholdId();
    const householdItems = items.filter(item => belongsToActiveHousehold(item, isCloudConfigured, activeHouseholdId));
    return planIngredients.filter(ingredient => !inventoryHasIngredient(ingredient, householdItems));
}

/**
 * Add missing ingredients to the shopping list with "From meal plan" tag.
 */
export async function addMissingToShoppingList(plan: DbMealPlan): Promise<number> {
    const missing = await getMissingIngredients(plan);
    if (missing.length === 0) return 0;

    // Check existing shopping list to avoid duplicates
    const activeHouseholdId = getActiveCloudHouseholdId();
    const existingItems = (await db.shoppingList.toArray()).filter(item => (
        item.isDeleted !== 1
        && belongsToActiveHousehold(item, isCloudConfigured, activeHouseholdId)
    ));
    const existingNames = new Set(existingItems.map(i => i.name.toLowerCase().trim()));

    const newItems: DbShoppingItem[] = [];
    for (const ingredient of missing) {
        if (!existingNames.has(ingredient)) {
            newItems.push({
                id: crypto.randomUUID(),
                name: ingredient.charAt(0).toUpperCase() + ingredient.slice(1),
                quantity: 1,
                addedAt: new Date().toISOString(),
                isChecked: false,
                metadata: 'From meal plan',
                category: 'other',
                isDeleted: 0,
                ...localMutationFields(),
            });
        }
    }

    if (newItems.length > 0) {
        await db.shoppingList.bulkPut(newItems);
    }

    return newItems.length;
}

/**
 * Rank catalogue recipes for a meal slot, prioritizing expiring inventory.
 */
export async function suggestRecipesForSlot(
    items: InventoryItem[],
    slot?: MealSlot['slot'],
): Promise<RecipeRecommendation[]> {
    return getRecipeRecommendations(items, {
        includeUnmatched: false,
        limit: 6,
        mealType: slot,
    });
}

/**
 * Get day labels for the week.
 */
export const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
export const MEAL_SLOTS: MealSlot['slot'][] = ['breakfast', 'lunch', 'dinner', 'snack'];
