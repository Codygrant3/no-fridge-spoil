import { formatDate } from '../utils/dateUtils';

export interface ShelfLifeRule {
  keywords: string[];         // Keywords to match item names
  openedDays: number;         // Days fresh after opening
  sealedMultiplier?: number;  // Optional: if sealed date unknown
}

const SHELF_LIFE_DATABASE: ShelfLifeRule[] = [
  // Dairy - IMPORTANT: More specific items must come BEFORE generic ones
  // e.g., "sour cream" before "cream", "cottage cheese" before "cheese"
  { keywords: ["sour cream"], openedDays: 14 },
  { keywords: ["cream cheese"], openedDays: 14 },
  { keywords: ["cottage cheese"], openedDays: 7 },
  { keywords: ["cream", "heavy cream", "whipping cream"], openedDays: 7 },
  { keywords: ["cheese", "cheddar", "mozzarella", "swiss"], openedDays: 21 },
  { keywords: ["milk", "whole milk", "2% milk", "skim milk", "1% milk"], openedDays: 7 },
  { keywords: ["yogurt", "greek yogurt"], openedDays: 5 },
  { keywords: ["butter"], openedDays: 90 },

  // Condiments & Sauces
  { keywords: ["ketchup"], openedDays: 180 },
  { keywords: ["mustard"], openedDays: 365 },
  { keywords: ["mayo", "mayonnaise"], openedDays: 60 },
  { keywords: ["bbq sauce", "barbecue sauce"], openedDays: 120 },
  { keywords: ["soy sauce"], openedDays: 730 },
  { keywords: ["hot sauce", "sriracha"], openedDays: 180 },
  { keywords: ["salsa"], openedDays: 7 },
  { keywords: ["pasta sauce", "marinara", "tomato sauce"], openedDays: 7 },
  { keywords: ["alfredo sauce"], openedDays: 5 },
  { keywords: ["pesto"], openedDays: 7 },
  { keywords: ["hummus"], openedDays: 7 },
  { keywords: ["guacamole"], openedDays: 2 },

  // Pickled & Preserved
  { keywords: ["pickle", "pickles"], openedDays: 90 },
  { keywords: ["olives"], openedDays: 60 },
  { keywords: ["relish"], openedDays: 90 },
  { keywords: ["jam", "jelly", "preserve"], openedDays: 180 },
  { keywords: ["peanut butter"], openedDays: 90 },
  { keywords: ["almond butter"], openedDays: 60 },

  // Beverages
  { keywords: ["orange juice", "oj"], openedDays: 7 },
  { keywords: ["apple juice"], openedDays: 7 },
  { keywords: ["grape juice"], openedDays: 7 },
  { keywords: ["cranberry juice"], openedDays: 21 },
  { keywords: ["wine", "red wine", "white wine"], openedDays: 5 },
  { keywords: ["beer"], openedDays: 1 },

  // Eggs & Proteins
  { keywords: ["egg", "eggs"], openedDays: 21 },
  { keywords: ["bacon"], openedDays: 7 },
  { keywords: ["deli meat", "lunch meat", "ham", "turkey"], openedDays: 5 },
  { keywords: ["hot dogs"], openedDays: 7 },
  { keywords: ["sausage"], openedDays: 7 },

  // Miscellaneous
  { keywords: ["tofu"], openedDays: 5 },
  { keywords: ["kimchi"], openedDays: 90 },
  { keywords: ["sauerkraut"], openedDays: 60 },
  { keywords: ["chicken broth", "beef broth", "stock"], openedDays: 5 },
  { keywords: ["coconut milk"], openedDays: 7 },
  { keywords: ["whipped cream"], openedDays: 7 },
];

/**
 * Get shelf life in days after opening for a given item
 * @param itemName - The name of the item
 * @returns Number of days the item stays fresh after opening, or null if not found
 */
export function getShelfLifeAfterOpening(itemName: string): number | null {
  const nameLower = itemName.toLowerCase();

  const match = SHELF_LIFE_DATABASE.find(rule =>
    rule.keywords.some(kw => nameLower.includes(kw))
  );

  return match ? match.openedDays : null;
}

/**
 * Calculate new expiration date based on when item was opened
 * @param openedDate - ISO date string when item was opened (YYYY-MM-DD)
 * @param itemName - The name of the item
 * @returns New expiration date (YYYY-MM-DD) or null if shelf life not found
 */
export function calculateOpenedExpiration(openedDate: string, itemName: string): string | null {
  const shelfLife = getShelfLifeAfterOpening(itemName);
  if (!shelfLife) return null;

  const opened = new Date(openedDate);
  opened.setDate(opened.getDate() + shelfLife);
  return formatDate(opened);
}

/**
 * Get human-readable shelf life description
 * @param itemName - The name of the item
 * @returns Description like "7 days after opening" or null if not found
 */
export function getShelfLifeDescription(itemName: string): string | null {
  const days = getShelfLifeAfterOpening(itemName);
  if (!days) return null;

  if (days === 1) return "1 day after opening";
  if (days < 7) return `${days} days after opening`;
  if (days === 7) return "1 week after opening";
  if (days < 30) return `${Math.floor(days / 7)} weeks after opening`;
  if (days < 365) return `${Math.floor(days / 30)} months after opening`;
  return `${Math.floor(days / 365)} year${days >= 730 ? 's' : ''} after opening`;
}
