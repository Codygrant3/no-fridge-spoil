import type { InventoryItem } from '../types';
import { db } from '../db/database';
import { getActiveCloudHouseholdId } from './cloudSessionService';
import { belongsToActiveHousehold, localMutationFields } from './localMutationService';
import { isCloudConfigured } from './supabaseClient';
import { generateUUID } from '../utils/uuid';

export function shoppingCategory(name: string): 'produce' | 'dairy' | 'meat' | 'frozen' | 'pantry' | 'beverages' | 'other' {
    const value = name.toLowerCase();
    if (/(milk|cheese|yogurt|cream|butter|egg)/.test(value)) return 'dairy';
    if (/(chicken|beef|pork|fish|salmon|turkey|meat)/.test(value)) return 'meat';
    if (/(apple|banana|berry|lettuce|spinach|tomato|produce|fruit|vegetable)/.test(value)) return 'produce';
    if (/(frozen|ice cream)/.test(value)) return 'frozen';
    if (/(water|juice|coffee|tea|soda|drink)/.test(value)) return 'beverages';
    if (/(rice|pasta|flour|sugar|cereal|bread|can|jar)/.test(value)) return 'pantry';
    return 'other';
}

export async function addInventoryItemToShoppingList(item: InventoryItem): Promise<'added' | 'already-listed'> {
    const householdId = getActiveCloudHouseholdId();
    const existing = (await db.shoppingList.toArray()).find(candidate => (
        candidate.isDeleted !== 1
        && !candidate.isChecked
        && candidate.name.trim().toLowerCase() === item.name.trim().toLowerCase()
        && belongsToActiveHousehold(candidate, isCloudConfigured, householdId)
    ));
    if (existing) return 'already-listed';

    const now = new Date().toISOString();
    await db.shoppingList.add({
        id: generateUUID(),
        name: item.name,
        brand: item.brand,
        quantity: 1,
        category: shoppingCategory(item.name),
        metadata: 'Added from freshness action',
        addedAt: now,
        isChecked: false,
        isDeleted: 0,
        ...localMutationFields(householdId ?? undefined),
    });
    return 'added';
}
