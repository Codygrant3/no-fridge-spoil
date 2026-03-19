import Dexie, { type Table } from 'dexie';
import type { InventoryItem } from '../types';

// DB-specific fields that extend the shared InventoryItem interface
export interface DbInventoryItem extends InventoryItem {
    updatedAt?: string;
    imageId?: string;
    notes?: string;
    isDeleted: number; // Use 0 for false, 1 for true (IndexedDB query compatibility)
    profileId?: string; // V7: Multi-user profile association (undefined = Household/shared)
}

export interface DbStats {
    id: string;
    itemsSaved: number;
    itemsWasted: number;
    totalScans: number;
    firstUseDate?: string;
    lastActiveDate?: string;
    // V2: Gamification metrics
    co2SavedKg: number;
    waterSavedL: number;
    moneySaved: number;
    badges: string[]; // Array of badge IDs
    // V3: XP Leveling System
    xp: number;
    level: number;
}

export interface DbSettings {
    id: string;
    theme: 'light' | 'dark' | 'system';
    defaultStorageLocation: string; // Changed from enum to support custom tags
    expirationWarningDays: number;
    notificationsEnabled: boolean;
    // V5: Smart notification settings
    notificationFrequency?: 'off' | 'daily' | 'twice' | 'realtime';
    notificationTime?: string; // HH:MM preferred notification time
}

// V2: Shopping List
export interface DbShoppingItem {
    id: string;
    name: string;
    brand?: string;
    quantity: number;
    addedAt: string;
    isChecked: boolean;
    // V3: Enhanced shopping list
    category?: 'produce' | 'dairy' | 'meat' | 'frozen' | 'pantry' | 'beverages' | 'other';
    metadata?: string; // e.g., "Frequent buy", "Eco-pick"
    lastBought?: string; // ISO date
    unit?: string; // e.g., "pcs", "bag", "L"
    profileId?: string; // V7: Multi-user profile association
}

// V2: Custom Tags for storage locations
export interface DbCustomTag {
    id: string;
    name: string;
    color: string;
    icon?: string;
    isDefault?: boolean;
}

// V2: Barcode cache for offline lookup
export interface DbBarcodeCache {
    barcode: string;
    name: string;
    brand?: string;
    cachedAt: string;
}

// V5: AI Response Cache for offline-first AI
export interface DbAICacheEntry {
    cacheKey: string;
    serviceType: 'vision' | 'recipe' | 'factCheck';
    response: string; // JSON-stringified response
    cachedAt: string;
    expiresAt: string;
    hitCount: number;
    sizeBytes: number;
}

// V5: Notification Log to prevent duplicate alerts
export interface DbNotificationLog {
    id: string;
    itemId: string;
    type: 'expiring' | 'expired';
    sentAt: string;
}

// V6: Meal Plan
export interface MealSlot {
    day: number; // 0=Mon, 6=Sun
    slot: 'breakfast' | 'lunch' | 'dinner' | 'snack';
    recipeName: string;
    ingredients: string[];
}

export interface DbMealPlan {
    id: string;
    weekStartDate: string; // YYYY-MM-DD (Monday)
    meals: MealSlot[];
    createdAt: string;
}

// V7: User Profiles for multi-user households
export interface DbProfile {
    id: string;
    name: string;
    avatar: string; // Emoji avatar
    color: string; // Hex color
    createdAt: string;
}

// Database class with typed tables
class FoodTrackerDB extends Dexie {
    items!: Table<DbInventoryItem, string>;
    stats!: Table<DbStats, string>;
    settings!: Table<DbSettings, string>;
    shoppingList!: Table<DbShoppingItem, string>;
    customTags!: Table<DbCustomTag, string>;
    barcodeCache!: Table<DbBarcodeCache, string>;
    aiCache!: Table<DbAICacheEntry, string>;
    notificationLog!: Table<DbNotificationLog, string>;
    mealPlans!: Table<DbMealPlan, string>;
    profiles!: Table<DbProfile, string>;

    constructor() {
        super('FoodTrackerDB');

        // Schema version 1 (original)
        this.version(1).stores({
            items: 'id, name, expirationDate, status, storageLocation, addedAt, isDeleted',
            scans: 'id, createdAt, linkedItemId',
            stats: 'id',
            settings: 'id',
        });

        // Schema version 2 (simplified - removes scans table, fixes isDeleted)
        this.version(2).stores({
            items: 'id, name, expirationDate, status, storageLocation, addedAt, isDeleted',
            scans: null, // Delete scans table
            stats: 'id',
            settings: 'id',
        }).upgrade(async tx => {
            // Clear all items to start fresh with correct schema
            console.log('Upgrading database to version 2...');
            await tx.table('items').clear();
            console.log('Database upgraded successfully!');
        });

        // Schema version 3 (V2 features: shopping list, custom tags, barcode cache, gamification)
        this.version(3).stores({
            items: 'id, name, expirationDate, status, storageLocation, addedAt, isDeleted',
            stats: 'id',
            settings: 'id',
            shoppingList: 'id, name, addedAt, isChecked',
            customTags: 'id, name',
            barcodeCache: 'barcode, cachedAt',
        }).upgrade(async tx => {
            console.log('Upgrading database to version 3 (V2 features)...');
            // Initialize default tags
            const tagsTable = tx.table('customTags');
            await tagsTable.bulkPut([
                { id: 'fridge', name: 'Fridge', color: '#3b82f6', isDefault: true },
                { id: 'freezer', name: 'Freezer', color: '#06b6d4', isDefault: true },
                { id: 'pantry', name: 'Pantry', color: '#f59e0b', isDefault: true },
            ]);
            // Extend stats with gamification fields
            const statsTable = tx.table('stats');
            const existingStats = await statsTable.get('global');
            if (existingStats) {
                await statsTable.update('global', {
                    co2SavedKg: 0,
                    waterSavedL: 0,
                    moneySaved: 0,
                    badges: [],
                });
            }
            console.log('Database upgraded to version 3!');
        });

        // Schema version 4 (Opened date tracking)
        this.version(4).stores({
            items: 'id, name, expirationDate, status, storageLocation, addedAt, isDeleted, openedDate',
            stats: 'id',
            settings: 'id',
            shoppingList: 'id, name, addedAt, isChecked',
            customTags: 'id, name',
            barcodeCache: 'barcode, cachedAt',
        }).upgrade(async _tx => {
            console.log('Upgrading database to version 4 (opened date tracking)...');
            // No data migration needed - openedDate is optional
            console.log('Database upgraded to version 4!');
        });

        // Schema version 5 (AI cache, notification log, extended settings)
        this.version(5).stores({
            items: 'id, name, expirationDate, status, storageLocation, addedAt, isDeleted, openedDate',
            stats: 'id',
            settings: 'id',
            shoppingList: 'id, name, addedAt, isChecked',
            customTags: 'id, name',
            barcodeCache: 'barcode, cachedAt',
            aiCache: 'cacheKey, serviceType, expiresAt',
            notificationLog: 'id, itemId, sentAt',
        }).upgrade(async _tx => {
            console.log('Upgrading database to version 5 (AI cache + notifications)...');
            console.log('Database upgraded to version 5!');
        });

        // Schema version 6 (Meal Planning)
        this.version(6).stores({
            items: 'id, name, expirationDate, status, storageLocation, addedAt, isDeleted, openedDate',
            stats: 'id',
            settings: 'id',
            shoppingList: 'id, name, addedAt, isChecked',
            customTags: 'id, name',
            barcodeCache: 'barcode, cachedAt',
            aiCache: 'cacheKey, serviceType, expiresAt',
            notificationLog: 'id, itemId, sentAt',
            mealPlans: 'id, weekStartDate',
        }).upgrade(async _tx => {
            console.log('Upgrading database to version 6 (meal planning)...');
            console.log('Database upgraded to version 6!');
        });

        // Schema version 7 (Multi-user profiles)
        this.version(7).stores({
            items: 'id, name, expirationDate, status, storageLocation, addedAt, isDeleted, openedDate, profileId',
            stats: 'id',
            settings: 'id',
            shoppingList: 'id, name, addedAt, isChecked, profileId',
            customTags: 'id, name',
            barcodeCache: 'barcode, cachedAt',
            aiCache: 'cacheKey, serviceType, expiresAt',
            notificationLog: 'id, itemId, sentAt',
            mealPlans: 'id, weekStartDate',
            profiles: 'id, name, createdAt',
        }).upgrade(async _tx => {
            console.log('Upgrading database to version 7 (multi-user profiles)...');
            // No data migration needed - profileId is optional (undefined = Household)
            console.log('Database upgraded to version 7!');
        });
    }
}

// Singleton instance
export const db = new FoodTrackerDB();

// Helper to initialize default data
export async function initializeDatabase(): Promise<void> {
    // Ensure stats record exists
    const existingStats = await db.stats.get('global');
    if (!existingStats) {
        await db.stats.put({
            id: 'global',
            itemsSaved: 0,
            itemsWasted: 0,
            totalScans: 0,
            firstUseDate: new Date().toISOString(),
            lastActiveDate: new Date().toISOString(),
            // V2: Gamification
            co2SavedKg: 0,
            waterSavedL: 0,
            moneySaved: 0,
            badges: [],
            // V3: XP Leveling
            xp: 0,
            level: 1,
        });
    }

    // Ensure default tags exist
    const tagCount = await db.customTags.count();
    if (tagCount === 0) {
        await db.customTags.bulkPut([
            { id: 'fridge', name: 'Fridge', color: '#3b82f6', isDefault: true },
            { id: 'freezer', name: 'Freezer', color: '#06b6d4', isDefault: true },
            { id: 'pantry', name: 'Pantry', color: '#f59e0b', isDefault: true },
        ]);
    }

    // Ensure settings record exists
    const existingSettings = await db.settings.get('user');
    if (!existingSettings) {
        await db.settings.put({
            id: 'user',
            theme: 'system',
            defaultStorageLocation: 'fridge',
            expirationWarningDays: 3,
            notificationsEnabled: false,
        });
    }

    // Migrate from localStorage if data exists
    await migrateFromLocalStorage();

    // Clean up expired AI cache entries
    try {
        const { cleanupExpiredCache } = await import('../services/aiCacheService');
        await cleanupExpiredCache();
    } catch (error) {
        console.warn('AI Cache cleanup skipped:', error);
    }
}

// Validate localStorage item data before migration
function isValidLocalStorageItem(item: unknown): item is Partial<DbInventoryItem> {
    if (!item || typeof item !== 'object') return false;
    const obj = item as Record<string, unknown>;

    // Required fields must exist and be correct types
    if (typeof obj.name !== 'string' || obj.name.trim() === '') return false;
    if (typeof obj.expirationDate !== 'string') return false;

    // Optional fields must be correct types if present
    if (obj.id !== undefined && typeof obj.id !== 'string') return false;
    if (obj.brand !== undefined && typeof obj.brand !== 'string') return false;
    if (obj.quantity !== undefined && (typeof obj.quantity !== 'number' || obj.quantity < 0)) return false;
    if (obj.storageLocation !== undefined &&
        !['fridge', 'freezer', 'pantry'].includes(obj.storageLocation as string)) return false;

    return true;
}

// Validate localStorage stats data before migration
function isValidLocalStorageStats(stats: unknown): stats is Partial<DbStats> {
    if (!stats || typeof stats !== 'object') return false;
    const obj = stats as Record<string, unknown>;

    // Stats fields must be numbers if present
    if (obj.itemsSaved !== undefined && typeof obj.itemsSaved !== 'number') return false;
    if (obj.itemsWasted !== undefined && typeof obj.itemsWasted !== 'number') return false;

    return true;
}

// Migrate existing localStorage data to IndexedDB
async function migrateFromLocalStorage(): Promise<void> {
    const localItems = localStorage.getItem('inventory');
    const localStats = localStorage.getItem('stats');

    if (localItems) {
        try {
            const parsed = JSON.parse(localItems);

            // Validate it's an array
            if (!Array.isArray(parsed)) {
                console.warn('localStorage inventory is not an array, skipping migration');
                localStorage.removeItem('inventory');
                return;
            }

            const existingCount = await db.items.count();

            if (existingCount === 0 && parsed.length > 0) {
                // Validate and migrate items
                const validItems: DbInventoryItem[] = [];

                for (const item of parsed) {
                    if (isValidLocalStorageItem(item)) {
                        validItems.push({
                            id: item.id || crypto.randomUUID(),
                            name: item.name!,
                            brand: item.brand || '',
                            expirationDate: item.expirationDate!,
                            dateType: item.dateType || 'Best By',
                            addedAt: item.addedAt || new Date().toISOString(),
                            updatedAt: new Date().toISOString(),
                            status: item.status || 'good',
                            quantity: item.quantity || 1,
                            storageLocation: item.storageLocation || 'fridge',
                            isDeleted: item.isDeleted ? 1 : 0,
                            consumedAt: item.consumedAt,
                            imageId: item.imageId,
                            notes: item.notes,
                        });
                    } else {
                        console.warn('Skipping invalid localStorage item:', item);
                    }
                }

                if (validItems.length > 0) {
                    await db.items.bulkPut(validItems);
                    console.log(`Migrated ${validItems.length} items from localStorage`);
                }

                // Clear localStorage after migration attempt
                localStorage.removeItem('inventory');
            }
        } catch (error) {
            console.error('Failed to migrate items from localStorage:', error);
            // Remove corrupt data
            localStorage.removeItem('inventory');
        }
    }

    if (localStats) {
        try {
            const stats = JSON.parse(localStats);

            if (!isValidLocalStorageStats(stats)) {
                console.warn('localStorage stats is invalid, skipping migration');
                localStorage.removeItem('stats');
                return;
            }

            const existingStats = await db.stats.get('global');

            if (existingStats && (stats.itemsSaved || stats.itemsWasted)) {
                await db.stats.update('global', {
                    itemsSaved: (existingStats.itemsSaved || 0) + (stats.itemsSaved || 0),
                    itemsWasted: (existingStats.itemsWasted || 0) + (stats.itemsWasted || 0),
                });
                console.log('Migrated stats from localStorage');
            }
            localStorage.removeItem('stats');
        } catch (error) {
            console.error('Failed to migrate stats from localStorage:', error);
            // Remove corrupt data
            localStorage.removeItem('stats');
        }
    }
}

// Export/Import functions for data backup
export async function exportAllData(): Promise<string> {
    const items = await db.items.where('isDeleted').equals(0).toArray();
    const stats = await db.stats.get('global');
    const settings = await db.settings.get('user');
    const shoppingList = await db.shoppingList.toArray();
    const profiles = await db.profiles.toArray();
    const mealPlans = await db.mealPlans.toArray();
    const customTags = await db.customTags.toArray();

    return JSON.stringify({
        version: 2,
        exportedAt: new Date().toISOString(),
        items,
        stats,
        settings,
        shoppingList,
        profiles,
        mealPlans,
        customTags,
    }, null, 2);
}

export async function importData(jsonString: string): Promise<{ success: boolean; itemsImported: number; errors: string[] }> {
    const errors: string[] = [];

    try {
        const data = JSON.parse(jsonString);

        if (data.items && Array.isArray(data.items)) {
            // Validate each item before import
            const { InventoryItemSchema } = await import('./schemas');
            const validItems: DbInventoryItem[] = [];

            for (const item of data.items) {
                const result = InventoryItemSchema.safeParse(item);
                if (result.success) {
                    // Normalize isDeleted to number
                    const normalizedItem: DbInventoryItem = {
                        ...result.data,
                        isDeleted: result.data.isDeleted ? 1 : 0,
                    };
                    validItems.push(normalizedItem);
                } else {
                    errors.push(`Invalid item: ${item.name || 'unknown'}`);
                }
            }

            if (validItems.length > 0) {
                await db.items.bulkPut(validItems);
            }
        }

        if (data.stats) {
            await db.stats.put({ ...data.stats, id: 'global' });
        }

        return { success: true, itemsImported: data.items?.length || 0, errors };
    } catch (error) {
        console.error('Import failed:', error);
        return { success: false, itemsImported: 0, errors: ['Failed to parse import data'] };
    }
}
