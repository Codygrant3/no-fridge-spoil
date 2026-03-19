/**
 * Sealed Shelf-Life Service — Smart Defaults for Scanned Items
 *
 * Provides estimated expiration dates, default storage locations,
 * and date types for items based on fuzzy keyword matching.
 * Complements the existing shelfLifeService (which handles opened items).
 */

import type { StorageLocation } from '../types';

export interface ShelfLifeDefaults {
    sealedDays: number;         // Days from purchase to expected expiration
    openedDays: number;         // Days fresh after opening
    defaultStorage: StorageLocation;
    dateType: string;           // e.g., "Best By", "Use By"
    confidence: 'high' | 'medium' | 'low';
    category: string;           // Human-readable category
}

interface ShelfLifeRule {
    keywords: string[];
    sealedDays: number;
    openedDays: number;
    defaultStorage: StorageLocation;
    dateType: string;
    category: string;
}

// More specific entries MUST come before generic ones (e.g., "sour cream" before "cream")
const SEALED_SHELF_LIFE_DATABASE: ShelfLifeRule[] = [
    // Dairy — Refrigerated
    { keywords: ['sour cream'], sealedDays: 21, openedDays: 14, defaultStorage: 'fridge', dateType: 'Use By', category: 'Dairy' },
    { keywords: ['cream cheese'], sealedDays: 30, openedDays: 14, defaultStorage: 'fridge', dateType: 'Use By', category: 'Dairy' },
    { keywords: ['cottage cheese'], sealedDays: 14, openedDays: 7, defaultStorage: 'fridge', dateType: 'Use By', category: 'Dairy' },
    { keywords: ['heavy cream', 'whipping cream'], sealedDays: 30, openedDays: 7, defaultStorage: 'fridge', dateType: 'Use By', category: 'Dairy' },
    { keywords: ['greek yogurt', 'yogurt'], sealedDays: 21, openedDays: 5, defaultStorage: 'fridge', dateType: 'Best By', category: 'Dairy' },
    { keywords: ['mozzarella', 'swiss', 'cheddar', 'cheese'], sealedDays: 60, openedDays: 21, defaultStorage: 'fridge', dateType: 'Best By', category: 'Dairy' },
    { keywords: ['milk', 'whole milk', '2% milk', 'skim milk'], sealedDays: 14, openedDays: 7, defaultStorage: 'fridge', dateType: 'Use By', category: 'Dairy' },
    { keywords: ['butter'], sealedDays: 120, openedDays: 90, defaultStorage: 'fridge', dateType: 'Best By', category: 'Dairy' },

    // Meat & Protein — Refrigerated
    { keywords: ['ground beef', 'ground turkey', 'ground meat'], sealedDays: 3, openedDays: 2, defaultStorage: 'fridge', dateType: 'Use By', category: 'Meat' },
    { keywords: ['chicken breast', 'chicken thigh', 'chicken'], sealedDays: 3, openedDays: 2, defaultStorage: 'fridge', dateType: 'Use By', category: 'Meat' },
    { keywords: ['steak', 'beef'], sealedDays: 5, openedDays: 3, defaultStorage: 'fridge', dateType: 'Use By', category: 'Meat' },
    { keywords: ['pork chop', 'pork'], sealedDays: 5, openedDays: 3, defaultStorage: 'fridge', dateType: 'Use By', category: 'Meat' },
    { keywords: ['salmon', 'tuna', 'fish', 'shrimp', 'seafood'], sealedDays: 2, openedDays: 1, defaultStorage: 'fridge', dateType: 'Use By', category: 'Seafood' },
    { keywords: ['bacon'], sealedDays: 14, openedDays: 7, defaultStorage: 'fridge', dateType: 'Use By', category: 'Meat' },
    { keywords: ['deli meat', 'lunch meat', 'ham', 'turkey breast'], sealedDays: 10, openedDays: 5, defaultStorage: 'fridge', dateType: 'Use By', category: 'Meat' },
    { keywords: ['hot dog', 'hot dogs'], sealedDays: 14, openedDays: 7, defaultStorage: 'fridge', dateType: 'Use By', category: 'Meat' },
    { keywords: ['sausage'], sealedDays: 14, openedDays: 7, defaultStorage: 'fridge', dateType: 'Use By', category: 'Meat' },
    { keywords: ['egg', 'eggs'], sealedDays: 35, openedDays: 21, defaultStorage: 'fridge', dateType: 'Best By', category: 'Eggs' },
    { keywords: ['tofu'], sealedDays: 30, openedDays: 5, defaultStorage: 'fridge', dateType: 'Use By', category: 'Protein' },

    // Produce — Refrigerated
    { keywords: ['lettuce', 'spinach', 'arugula', 'salad greens', 'mixed greens'], sealedDays: 7, openedDays: 3, defaultStorage: 'fridge', dateType: 'Best By', category: 'Produce' },
    { keywords: ['berries', 'strawberry', 'blueberry', 'raspberry'], sealedDays: 5, openedDays: 3, defaultStorage: 'fridge', dateType: 'Best By', category: 'Produce' },
    { keywords: ['avocado'], sealedDays: 5, openedDays: 2, defaultStorage: 'fridge', dateType: 'Best By', category: 'Produce' },
    { keywords: ['tomato'], sealedDays: 7, openedDays: 3, defaultStorage: 'fridge', dateType: 'Best By', category: 'Produce' },
    { keywords: ['broccoli', 'cauliflower'], sealedDays: 7, openedDays: 4, defaultStorage: 'fridge', dateType: 'Best By', category: 'Produce' },
    { keywords: ['carrot'], sealedDays: 21, openedDays: 7, defaultStorage: 'fridge', dateType: 'Best By', category: 'Produce' },
    { keywords: ['bell pepper', 'pepper'], sealedDays: 10, openedDays: 5, defaultStorage: 'fridge', dateType: 'Best By', category: 'Produce' },
    { keywords: ['mushroom'], sealedDays: 7, openedDays: 4, defaultStorage: 'fridge', dateType: 'Best By', category: 'Produce' },
    { keywords: ['apple'], sealedDays: 30, openedDays: 5, defaultStorage: 'fridge', dateType: 'Best By', category: 'Produce' },
    { keywords: ['banana'], sealedDays: 7, openedDays: 2, defaultStorage: 'pantry', dateType: 'Best By', category: 'Produce' },
    { keywords: ['orange', 'lemon', 'lime', 'citrus'], sealedDays: 21, openedDays: 7, defaultStorage: 'fridge', dateType: 'Best By', category: 'Produce' },

    // Condiments & Sauces
    { keywords: ['ketchup'], sealedDays: 365, openedDays: 180, defaultStorage: 'pantry', dateType: 'Best By', category: 'Condiments' },
    { keywords: ['mustard'], sealedDays: 730, openedDays: 365, defaultStorage: 'pantry', dateType: 'Best By', category: 'Condiments' },
    { keywords: ['mayo', 'mayonnaise'], sealedDays: 180, openedDays: 60, defaultStorage: 'fridge', dateType: 'Best By', category: 'Condiments' },
    { keywords: ['soy sauce'], sealedDays: 1095, openedDays: 730, defaultStorage: 'pantry', dateType: 'Best By', category: 'Condiments' },
    { keywords: ['hot sauce', 'sriracha'], sealedDays: 730, openedDays: 180, defaultStorage: 'pantry', dateType: 'Best By', category: 'Condiments' },
    { keywords: ['salsa'], sealedDays: 30, openedDays: 7, defaultStorage: 'fridge', dateType: 'Use By', category: 'Condiments' },
    { keywords: ['pasta sauce', 'marinara', 'tomato sauce'], sealedDays: 365, openedDays: 7, defaultStorage: 'pantry', dateType: 'Best By', category: 'Condiments' },
    { keywords: ['hummus'], sealedDays: 30, openedDays: 7, defaultStorage: 'fridge', dateType: 'Use By', category: 'Condiments' },
    { keywords: ['peanut butter'], sealedDays: 365, openedDays: 90, defaultStorage: 'pantry', dateType: 'Best By', category: 'Condiments' },
    { keywords: ['jam', 'jelly'], sealedDays: 365, openedDays: 180, defaultStorage: 'pantry', dateType: 'Best By', category: 'Condiments' },

    // Beverages
    { keywords: ['orange juice', 'oj'], sealedDays: 14, openedDays: 7, defaultStorage: 'fridge', dateType: 'Best By', category: 'Beverages' },
    { keywords: ['juice'], sealedDays: 14, openedDays: 7, defaultStorage: 'fridge', dateType: 'Best By', category: 'Beverages' },

    // Bakery & Bread
    { keywords: ['bread', 'loaf'], sealedDays: 7, openedDays: 5, defaultStorage: 'pantry', dateType: 'Best By', category: 'Bakery' },
    { keywords: ['tortilla', 'wrap'], sealedDays: 21, openedDays: 7, defaultStorage: 'pantry', dateType: 'Best By', category: 'Bakery' },
    { keywords: ['bagel'], sealedDays: 7, openedDays: 3, defaultStorage: 'pantry', dateType: 'Best By', category: 'Bakery' },

    // Pantry Staples
    { keywords: ['rice'], sealedDays: 730, openedDays: 365, defaultStorage: 'pantry', dateType: 'Best By', category: 'Pantry' },
    { keywords: ['pasta', 'spaghetti', 'noodle'], sealedDays: 730, openedDays: 365, defaultStorage: 'pantry', dateType: 'Best By', category: 'Pantry' },
    { keywords: ['cereal'], sealedDays: 180, openedDays: 30, defaultStorage: 'pantry', dateType: 'Best By', category: 'Pantry' },
    { keywords: ['canned'], sealedDays: 730, openedDays: 5, defaultStorage: 'pantry', dateType: 'Best By', category: 'Pantry' },

    // Frozen
    { keywords: ['frozen pizza'], sealedDays: 180, openedDays: 30, defaultStorage: 'freezer', dateType: 'Best By', category: 'Frozen' },
    { keywords: ['ice cream'], sealedDays: 180, openedDays: 60, defaultStorage: 'freezer', dateType: 'Best By', category: 'Frozen' },
    { keywords: ['frozen vegetable', 'frozen veggies'], sealedDays: 270, openedDays: 90, defaultStorage: 'freezer', dateType: 'Best By', category: 'Frozen' },
    { keywords: ['frozen'], sealedDays: 180, openedDays: 60, defaultStorage: 'freezer', dateType: 'Best By', category: 'Frozen' },
];

/**
 * Get shelf-life defaults for an item by fuzzy keyword matching.
 * Returns null if no match found.
 */
export function getShelfLifeDefaults(itemName: string): ShelfLifeDefaults | null {
    const nameLower = itemName.toLowerCase();

    const match = SEALED_SHELF_LIFE_DATABASE.find(rule =>
        rule.keywords.some(kw => nameLower.includes(kw))
    );

    if (!match) return null;

    // Determine confidence based on keyword specificity
    const matchedKeyword = match.keywords.find(kw => nameLower.includes(kw)) || '';
    const nameWords = nameLower.split(/\s+/).length;
    const keywordWords = matchedKeyword.split(/\s+/).length;

    let confidence: 'high' | 'medium' | 'low';
    if (keywordWords >= 2 || nameLower === matchedKeyword) {
        confidence = 'high';
    } else if (nameWords <= 3) {
        confidence = 'medium';
    } else {
        confidence = 'low';
    }

    return {
        sealedDays: match.sealedDays,
        openedDays: match.openedDays,
        defaultStorage: match.defaultStorage,
        dateType: match.dateType,
        confidence,
        category: match.category,
    };
}

/**
 * Calculate an estimated expiration date from today using shelf-life defaults.
 * Returns YYYY-MM-DD format.
 */
export function estimateExpirationDate(sealedDays: number): string {
    const date = new Date();
    date.setDate(date.getDate() + sealedDays);
    return date.toISOString().split('T')[0];
}
