import type { InventoryItem } from '../types';

export interface SubstitutionOption {
    name: string;
    ratio: string;              // e.g., "1:1" or "¾ cup per 1 cup"
    flavorImpact: string;       // "Similar", "Sweeter", "More savory"
    textureImpact?: string;
    notes: string;
    inInventory?: boolean;
}

export interface IngredientSubstitution {
    original: string;
    alternatives: SubstitutionOption[];
    proTip: string;
}

const SUBSTITUTION_DATABASE: Record<string, IngredientSubstitution> = {
    "buttermilk": {
        original: "Buttermilk",
        alternatives: [
            {
                name: "Milk + Lemon Juice",
                ratio: "1 cup milk + 1 tbsp lemon juice",
                flavorImpact: "Similar tanginess",
                notes: "Let sit 5 mins before using",
            },
            {
                name: "Milk + Vinegar",
                ratio: "1 cup milk + 1 tbsp vinegar",
                flavorImpact: "Similar",
                notes: "White vinegar works best",
            },
            {
                name: "Plain Yogurt",
                ratio: "1:1 (thin with milk if needed)",
                flavorImpact: "Similar",
                textureImpact: "Thicker",
                notes: "Great for baking",
            },
        ],
        proTip: "The acid in lemon/vinegar curdles the milk, mimicking buttermilk's tang.",
    },
    "heavy cream": {
        original: "Heavy Cream",
        alternatives: [
            {
                name: "Milk + Butter",
                ratio: "¾ cup milk + ¼ cup melted butter",
                flavorImpact: "Similar richness",
                notes: "Best for cooking, not whipping",
            },
            {
                name: "Half-and-Half",
                ratio: "1:1",
                flavorImpact: "Lighter",
                notes: "Won't whip well",
            },
            {
                name: "Greek Yogurt + Milk",
                ratio: "½ cup yogurt + ½ cup milk",
                flavorImpact: "Tangy",
                notes: "Good for soups/sauces",
            },
        ],
        proTip: "For whipped cream, you need actual heavy cream—no substitute whips well.",
    },
    "sour cream": {
        original: "Sour Cream",
        alternatives: [
            {
                name: "Greek Yogurt",
                ratio: "1:1",
                flavorImpact: "Similar tanginess",
                notes: "Plain, full-fat works best",
            },
            {
                name: "Cottage Cheese (blended)",
                ratio: "1:1 blended smooth",
                flavorImpact: "Milder",
                notes: "Add lemon juice for tang",
            },
            {
                name: "Cream Cheese + Milk",
                ratio: "¾ cup cream cheese + ¼ cup milk",
                flavorImpact: "Richer",
                notes: "Beat until smooth",
            },
        ],
        proTip: "Greek yogurt is the closest match for both flavor and texture.",
    },
    "egg": {
        original: "Egg",
        alternatives: [
            {
                name: "Flax Egg",
                ratio: "1 tbsp ground flaxseed + 3 tbsp water",
                flavorImpact: "Nutty",
                notes: "Let sit 5 mins. Best for baking",
            },
            {
                name: "Banana",
                ratio: "¼ cup mashed banana per egg",
                flavorImpact: "Sweet, banana flavor",
                notes: "Works in muffins/breads",
            },
            {
                name: "Applesauce",
                ratio: "¼ cup per egg",
                flavorImpact: "Subtle",
                notes: "Reduces fat content",
            },
        ],
        proTip: "These work for binding only. Won't work for omelets or scrambles.",
    },
    "butter": {
        original: "Butter",
        alternatives: [
            {
                name: "Coconut Oil",
                ratio: "1:1",
                flavorImpact: "Slight coconut flavor",
                notes: "Solid at room temp like butter",
            },
            {
                name: "Olive Oil",
                ratio: "¾ cup oil per 1 cup butter",
                flavorImpact: "Savory",
                notes: "Best for savory dishes",
            },
            {
                name: "Applesauce",
                ratio: "½ cup per 1 cup butter",
                flavorImpact: "Sweeter",
                notes: "Best for baking, reduces fat",
            },
        ],
        proTip: "For baking, use solid fats (coconut oil) for better texture.",
    },
    "milk": {
        original: "Milk",
        alternatives: [
            {
                name: "Almond Milk",
                ratio: "1:1",
                flavorImpact: "Nutty",
                notes: "Use unsweetened for savory",
            },
            {
                name: "Oat Milk",
                ratio: "1:1",
                flavorImpact: "Slightly sweet",
                notes: "Great for baking",
            },
            {
                name: "Coconut Milk",
                ratio: "1:1",
                flavorImpact: "Coconut flavor",
                notes: "Canned is richer than carton",
            },
        ],
        proTip: "Most non-dairy milks work 1:1, but flavor varies significantly.",
    },
    "brown sugar": {
        original: "Brown Sugar",
        alternatives: [
            {
                name: "White Sugar + Molasses",
                ratio: "1 cup white sugar + 1 tbsp molasses",
                flavorImpact: "Identical",
                notes: "Mix well before using",
            },
            {
                name: "White Sugar",
                ratio: "1:1",
                flavorImpact: "Less complex",
                notes: "Lacks molasses depth",
            },
            {
                name: "Honey",
                ratio: "¾ cup per 1 cup sugar",
                flavorImpact: "Different sweetness",
                notes: "Reduce liquid by ¼ cup",
            },
        ],
        proTip: "White sugar + molasses gives you true brown sugar.",
    },
    "breadcrumbs": {
        original: "Breadcrumbs",
        alternatives: [
            {
                name: "Crushed Crackers",
                ratio: "1:1",
                flavorImpact: "Similar",
                notes: "Saltines or Ritz work great",
            },
            {
                name: "Panko",
                ratio: "1:1",
                flavorImpact: "Same",
                textureImpact: "Crunchier",
                notes: "Japanese breadcrumbs",
            },
            {
                name: "Crushed Cornflakes",
                ratio: "1:1",
                flavorImpact: "Slightly sweet",
                notes: "Great for coating",
            },
        ],
        proTip: "Toast fresh bread and pulse in food processor for fresh breadcrumbs.",
    },
    "cornstarch": {
        original: "Cornstarch",
        alternatives: [
            {
                name: "Flour",
                ratio: "2 tbsp flour per 1 tbsp cornstarch",
                flavorImpact: "Similar",
                notes: "Double the amount for thickening",
            },
            {
                name: "Arrowroot Powder",
                ratio: "1:1",
                flavorImpact: "Neutral",
                notes: "Works great for glazes",
            },
            {
                name: "Potato Starch",
                ratio: "1:1",
                flavorImpact: "Neutral",
                notes: "Good for gluten-free",
            },
        ],
        proTip: "Flour needs to cook longer to lose raw taste; cornstarch thickens instantly.",
    },
    "baking powder": {
        original: "Baking Powder",
        alternatives: [
            {
                name: "Baking Soda + Cream of Tartar",
                ratio: "¼ tsp soda + ½ tsp cream of tartar per 1 tsp baking powder",
                flavorImpact: "Identical",
                notes: "Mix fresh each time",
            },
            {
                name: "Baking Soda + Yogurt",
                ratio: "¼ tsp soda + ½ cup yogurt replaces 1 tsp baking powder + ½ cup liquid",
                flavorImpact: "Slight tang",
                notes: "Adjust liquid in recipe",
            },
        ],
        proTip: "Baking powder = baking soda + acid. Any acid works (lemon, vinegar, yogurt).",
    },
};

/**
 * Get substitutions for an ingredient
 * @param ingredient - The ingredient name to find substitutes for
 * @returns Substitution info or null if not found
 */
export function getSubstitutions(ingredient: string): IngredientSubstitution | null {
    const normalized = ingredient.toLowerCase().trim();

    // Exact match
    if (SUBSTITUTION_DATABASE[normalized]) {
        return SUBSTITUTION_DATABASE[normalized];
    }

    // Fuzzy match (contains keyword)
    for (const [key, sub] of Object.entries(SUBSTITUTION_DATABASE)) {
        if (normalized.includes(key) || key.includes(normalized)) {
            return sub;
        }
    }

    return null;
}

/**
 * Enrich substitution options with inventory availability
 * @param substitution - The substitution to enrich
 * @param inventoryItems - User's inventory items
 * @returns Enriched substitution with inInventory flags and sorted by availability
 */
export function enrichWithInventory(
    substitution: IngredientSubstitution,
    inventoryItems: InventoryItem[]
): IngredientSubstitution {
    const inventoryNames = inventoryItems.map(i => i.name.toLowerCase());

    const enrichedAlternatives = substitution.alternatives.map(alt => {
        // Check if any part of the alternative name matches inventory
        const altWords = alt.name.toLowerCase().split(/[\s+]/);
        const inInventory = inventoryNames.some(invName =>
            altWords.some(word => invName.includes(word) || word.includes(invName))
        );

        return {
            ...alt,
            inInventory,
        };
    });

    // Sort: items in inventory first
    enrichedAlternatives.sort((a, b) => {
        if (a.inInventory && !b.inInventory) return -1;
        if (!a.inInventory && b.inInventory) return 1;
        return 0;
    });

    return {
        ...substitution,
        alternatives: enrichedAlternatives,
    };
}
