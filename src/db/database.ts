import Dexie, { type Table } from 'dexie';
import type { InventoryItem } from '../types';
import { localMutationFields } from '../services/localMutationService';
import { readLocalValue, removeLocalValue } from '../services/safeStorage';
import { isValidDateOnly } from '../utils/dateValidation';
import {
    CustomTagSchema,
    InventoryItemSchema,
    MealPlanSchema,
    ProfileSchema,
    ReceiptHistorySchema,
    SettingsSchema,
    ShoppingItemSchema,
    StatsSchema,
} from './schemas';

// DB-specific fields that extend the shared InventoryItem interface
export interface DbInventoryItem extends InventoryItem {
    updatedAt?: string;
    imageId?: string;
    notes?: string;
    isDeleted: number; // Use 0 for false, 1 for true (IndexedDB query compatibility)
    profileId?: string; // V7: Multi-user profile association (undefined = Household/shared)
    cloudHouseholdId?: string;
    cloudCreatedBy?: string;
    syncPending?: number;
    cloudVersionAt?: string;
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
    quietHoursStart?: string;
    quietHoursEnd?: string;
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
    updatedAt?: string;
    isDeleted?: number;
    cloudHouseholdId?: string;
    cloudCreatedBy?: string;
    syncPending?: number;
    cloudVersionAt?: string;
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
    serviceType: 'vision' | 'receipt' | 'recipe' | 'factCheck';
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
    updatedAt?: string;
    isDeleted?: number;
    cloudHouseholdId?: string;
    cloudCreatedBy?: string;
    syncPending?: number;
    cloudVersionAt?: string;
}

// V7: User Profiles for multi-user households
export interface DbProfile {
    id: string;
    name: string;
    avatar: string; // Emoji avatar
    color: string; // Hex color
    createdAt: string;
    updatedAt?: string;
    isDeleted?: number;
    cloudHouseholdId?: string;
    cloudCreatedBy?: string;
    syncPending?: number;
    cloudVersionAt?: string;
}

export type CloudSyncEntityType = 'profile' | 'inventory' | 'shopping' | 'meal-plan';

export interface DbSyncOutbox {
    id: string;
    householdId: string;
    entityType: CloudSyncEntityType;
    entityId: string;
    localUpdatedAt: string;
    payload: string;
    attempts: number;
    nextAttemptAt: string;
    lastError?: string;
    createdAt: string;
    updatedAt: string;
    baseCloudUpdatedAt?: string;
    conflictRemotePayload?: string;
}

export interface DbSyncState {
    id: string;
    householdId: string;
    pullCursor?: string;
    lastSuccessfulSyncAt?: string;
    lastAttemptAt?: string;
    lastError?: string;
    initialClaimCompleted: number;
}

export interface DbReceiptQueueEntry {
    id: string;
    name: string;
    type: string;
    size: number;
    imageBlob: Blob;
    queuedAt: string;
    expiresAt: string;
    reason: string;
    retryCount: number;
    lastRetryAt?: string;
    lastError?: string;
}

export interface DbReceiptHistoryEntry {
    id: string;
    scannedAt: string;
    storeName?: string;
    date?: string;
    source: 'camera' | 'gallery' | 'sample';
    itemCount: number;
    skippedItems: string[];
    cacheHit: boolean;
    status: 'completed' | 'queued' | 'failed';
    previewUrl?: string;
    previewBlob?: Blob;
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
    syncOutbox!: Table<DbSyncOutbox, string>;
    syncState!: Table<DbSyncState, string>;
    receiptQueue!: Table<DbReceiptQueueEntry, string>;
    receiptHistory!: Table<DbReceiptHistoryEntry, string>;

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
        }).upgrade(async () => {
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
        }).upgrade(async () => {
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
        }).upgrade(async () => {
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
        }).upgrade(async () => {
            console.log('Upgrading database to version 7 (multi-user profiles)...');
            // No data migration needed - profileId is optional (undefined = Household)
            console.log('Database upgraded to version 7!');
        });

        // Schema version 8 (durable household cloud synchronization)
        this.version(8).stores({
            items: 'id, name, expirationDate, status, storageLocation, addedAt, isDeleted, openedDate, profileId, cloudHouseholdId, syncPending, updatedAt',
            stats: 'id',
            settings: 'id',
            shoppingList: 'id, name, addedAt, isChecked, profileId, cloudHouseholdId, isDeleted, syncPending, updatedAt',
            customTags: 'id, name',
            barcodeCache: 'barcode, cachedAt',
            aiCache: 'cacheKey, serviceType, expiresAt',
            notificationLog: 'id, itemId, sentAt',
            mealPlans: 'id, weekStartDate, cloudHouseholdId, isDeleted, syncPending, updatedAt',
            profiles: 'id, name, createdAt, cloudHouseholdId, isDeleted, syncPending, updatedAt',
            syncOutbox: 'id, householdId, entityType, entityId, nextAttemptAt, updatedAt, [householdId+entityType]',
            syncState: 'id, householdId, lastSuccessfulSyncAt',
        }).upgrade(async tx => {
            const now = new Date().toISOString();
            await tx.table('items').toCollection().modify(item => {
                item.updatedAt ||= item.addedAt || now;
                item.syncPending = 1;
            });
            await tx.table('shoppingList').toCollection().modify(item => {
                item.updatedAt ||= item.addedAt || now;
                item.isDeleted ??= 0;
                item.syncPending = 1;
            });
            await tx.table('mealPlans').toCollection().modify(plan => {
                plan.updatedAt ||= plan.createdAt || now;
                plan.isDeleted ??= 0;
                plan.syncPending = 1;
            });
            await tx.table('profiles').toCollection().modify(profile => {
                profile.updatedAt ||= profile.createdAt || now;
                profile.isDeleted ??= 0;
                profile.syncPending = 1;
            });
        });

        // Schema version 9 (private, expiring receipt retry blobs)
        this.version(9).stores({
            items: 'id, name, expirationDate, status, storageLocation, addedAt, isDeleted, openedDate, profileId, cloudHouseholdId, syncPending, updatedAt',
            stats: 'id',
            settings: 'id',
            shoppingList: 'id, name, addedAt, isChecked, profileId, cloudHouseholdId, isDeleted, syncPending, updatedAt',
            customTags: 'id, name',
            barcodeCache: 'barcode, cachedAt',
            aiCache: 'cacheKey, serviceType, expiresAt',
            notificationLog: 'id, itemId, sentAt',
            mealPlans: 'id, weekStartDate, cloudHouseholdId, isDeleted, syncPending, updatedAt',
            profiles: 'id, name, createdAt, cloudHouseholdId, isDeleted, syncPending, updatedAt',
            syncOutbox: 'id, householdId, entityType, entityId, nextAttemptAt, updatedAt, [householdId+entityType]',
            syncState: 'id, householdId, lastSuccessfulSyncAt',
            receiptQueue: 'id, queuedAt, expiresAt',
        });

        // Schema version 10 (transactional receipt history metadata)
        this.version(10).stores({
            items: 'id, name, expirationDate, status, storageLocation, addedAt, isDeleted, openedDate, profileId, cloudHouseholdId, syncPending, updatedAt',
            stats: 'id',
            settings: 'id',
            shoppingList: 'id, name, addedAt, isChecked, profileId, cloudHouseholdId, isDeleted, syncPending, updatedAt',
            customTags: 'id, name',
            barcodeCache: 'barcode, cachedAt',
            aiCache: 'cacheKey, serviceType, expiresAt',
            notificationLog: 'id, itemId, sentAt',
            mealPlans: 'id, weekStartDate, cloudHouseholdId, isDeleted, syncPending, updatedAt',
            profiles: 'id, name, createdAt, cloudHouseholdId, isDeleted, syncPending, updatedAt',
            syncOutbox: 'id, householdId, entityType, entityId, nextAttemptAt, updatedAt, [householdId+entityType]',
            syncState: 'id, householdId, lastSuccessfulSyncAt',
            receiptQueue: 'id, queuedAt, expiresAt',
            receiptHistory: 'id, scannedAt, status',
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

}

// Validate localStorage item data before migration
function isValidLocalStorageItem(item: unknown): item is Partial<DbInventoryItem> {
    if (!item || typeof item !== 'object') return false;
    const obj = item as Record<string, unknown>;

    // Required fields must exist and be correct types
    if (typeof obj.name !== 'string' || obj.name.trim() === '') return false;
    if (!isValidDateOnly(obj.expirationDate)) return false;

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
    const localItems = readLocalValue('inventory');
    const localStats = readLocalValue('stats');

    if (localItems) {
        try {
            const parsed = JSON.parse(localItems);

            // Validate it's an array
            if (!Array.isArray(parsed)) {
                console.warn('localStorage inventory is not an array, skipping migration');
                removeLocalValue('inventory');
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
                            status: item.status || 'good',
                            quantity: item.quantity || 1,
                            storageLocation: item.storageLocation || 'fridge',
                            isDeleted: item.isDeleted ? 1 : 0,
                            consumedAt: item.consumedAt,
                            imageId: item.imageId,
                            notes: item.notes,
                            ...localMutationFields(),
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
                removeLocalValue('inventory');
            }
        } catch (error) {
            console.error('Failed to migrate items from localStorage:', error);
            // Remove corrupt data
            removeLocalValue('inventory');
        }
    }

    if (localStats) {
        try {
            const stats = JSON.parse(localStats);

            if (!isValidLocalStorageStats(stats)) {
                console.warn('localStorage stats is invalid, skipping migration');
                removeLocalValue('stats');
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
            removeLocalValue('stats');
        } catch (error) {
            console.error('Failed to migrate stats from localStorage:', error);
            // Remove corrupt data
            removeLocalValue('stats');
        }
    }
}

// Export/Import functions for data backup
export async function exportAllData(): Promise<string> {
    const items = await db.items.where('isDeleted').equals(0).toArray();
    const stats = await db.stats.get('global');
    const settings = await db.settings.get('user');
    const shoppingList = await db.shoppingList.where('isDeleted').equals(0).toArray();
    const profiles = await db.profiles.where('isDeleted').equals(0).toArray();
    const mealPlans = await db.mealPlans.where('isDeleted').equals(0).toArray();
    const customTags = await db.customTags.toArray();
    const receiptHistory = (await db.receiptHistory.orderBy('scannedAt').reverse().toArray()).map(entry => ({
        id: entry.id,
        scannedAt: entry.scannedAt,
        storeName: entry.storeName,
        date: entry.date,
        source: entry.source,
        itemCount: entry.itemCount,
        skippedItems: entry.skippedItems,
        cacheHit: entry.cacheHit,
        status: entry.status,
    }));

    return JSON.stringify({
        version: 3,
        exportedAt: new Date().toISOString(),
        items,
        stats,
        settings,
        shoppingList,
        profiles,
        mealPlans,
        customTags,
        receiptHistory,
    }, null, 2);
}

export interface ImportDataResult {
    success: boolean;
    itemsImported: number;
    recordsImported: number;
    errors: string[];
}

export interface BackupInspectionResult {
    success: boolean;
    version: number | null;
    exportedAt: string | null;
    totalRecords: number;
    sections: Array<{ label: string; count: number }>;
    errors: string[];
}

export function inspectBackupData(jsonString: string): BackupInspectionResult {
    try {
        const data = JSON.parse(jsonString) as Record<string, unknown>;
        if (typeof data !== 'object' || data === null || Array.isArray(data)) {
            throw new Error('Backup must be a JSON object.');
        }

        const version = typeof data.version === 'number' && Number.isInteger(data.version)
            ? data.version
            : null;
        if (version !== null && (version < 1 || version > 3)) {
            return {
                success: false,
                version,
                exportedAt: null,
                totalRecords: 0,
                sections: [],
                errors: [`Backup version ${version} is not supported by this app.`],
            };
        }

        const collectionSections: Array<[string, string]> = [
            ['items', 'Inventory'],
            ['shoppingList', 'Shopping list'],
            ['profiles', 'Profiles'],
            ['mealPlans', 'Meal plans'],
            ['customTags', 'Custom tags'],
            ['receiptHistory', 'Receipt history'],
        ];
        const errors: string[] = [];
        const sections = collectionSections.map(([key, label]) => {
            const value = data[key];
            if (value !== undefined && !Array.isArray(value)) errors.push(`${label} must be an array.`);
            return { label, count: Array.isArray(value) ? value.length : 0 };
        });
        for (const [key, label] of [['stats', 'Statistics'], ['settings', 'Settings']] as const) {
            const value = data[key];
            const isRecord = typeof value === 'object' && value !== null && !Array.isArray(value);
            if (value !== undefined && !isRecord) errors.push(`${label} must be an object.`);
            sections.push({ label, count: isRecord ? 1 : 0 });
        }

        const recognizedKeys = [...collectionSections.map(([key]) => key), 'stats', 'settings'];
        if (!recognizedKeys.some(key => key in data)) {
            return {
                success: false,
                version,
                exportedAt: null,
                totalRecords: 0,
                sections,
                errors: ['This file does not contain a recognized No Fridge Spoil backup.'],
            };
        }

        const exportedAt = typeof data.exportedAt === 'string' && !Number.isNaN(Date.parse(data.exportedAt))
            ? data.exportedAt
            : null;
        return {
            success: true,
            version,
            exportedAt,
            totalRecords: sections.reduce((sum, section) => sum + section.count, 0),
            sections: sections.filter(section => section.count > 0),
            errors,
        };
    } catch (error) {
        return {
            success: false,
            version: null,
            exportedAt: null,
            totalRecords: 0,
            sections: [],
            errors: [error instanceof Error ? error.message : 'Backup file could not be read.'],
        };
    }
}

export async function importData(jsonString: string): Promise<ImportDataResult> {
    const errors: string[] = [];

    try {
        const data = JSON.parse(jsonString) as Record<string, unknown>;
        if (typeof data !== 'object' || data === null || Array.isArray(data)) {
            throw new Error('Backup must be a JSON object.');
        }
        if (typeof data.version === 'number' && data.version > 3) {
            return {
                success: false,
                itemsImported: 0,
                recordsImported: 0,
                errors: [`Backup version ${data.version} is newer than this app supports.`],
            };
        }

        const parseCollection = <T>(
            value: unknown,
            label: string,
            parse: (record: unknown) => { success: true; data: T } | { success: false },
        ): T[] => {
            if (value === undefined) return [];
            if (!Array.isArray(value)) {
                errors.push(`${label} must be an array.`);
                return [];
            }
            return value.flatMap((record, index) => {
                const result = parse(record);
                if (result.success) return [result.data];
                errors.push(`Invalid ${label} record at position ${index + 1}.`);
                return [];
            });
        };

        const validItems = parseCollection(data.items, 'inventory', value => InventoryItemSchema.safeParse(value))
            .map(item => ({
                ...item,
                isDeleted: item.isDeleted ? 1 : 0,
                ...localMutationFields(),
            } satisfies DbInventoryItem));
        const validShopping = parseCollection(data.shoppingList, 'shopping list', value => ShoppingItemSchema.safeParse(value))
            .map(item => ({
                ...item,
                isDeleted: item.isDeleted ? 1 : 0,
                ...localMutationFields(),
            } satisfies DbShoppingItem));
        const validProfiles = parseCollection(data.profiles, 'profile', value => ProfileSchema.safeParse(value))
            .map(profile => ({
                ...profile,
                isDeleted: profile.isDeleted ? 1 : 0,
                ...localMutationFields(),
            } satisfies DbProfile));
        const validMealPlans = parseCollection(data.mealPlans, 'meal plan', value => MealPlanSchema.safeParse(value))
            .map(plan => ({
                ...plan,
                isDeleted: plan.isDeleted ? 1 : 0,
                ...localMutationFields(),
            } satisfies DbMealPlan));
        const validTags = parseCollection(data.customTags, 'custom tag', value => CustomTagSchema.safeParse(value));
        const validReceiptHistory = parseCollection(data.receiptHistory, 'receipt history', value => ReceiptHistorySchema.safeParse(value));
        const validStats = data.stats === undefined ? null : StatsSchema.safeParse(data.stats);
        const validSettings = data.settings === undefined ? null : SettingsSchema.safeParse(data.settings);
        if (validStats && !validStats.success) errors.push('Invalid statistics record.');
        if (validSettings && !validSettings.success) errors.push('Invalid settings record.');

        await db.transaction(
            'rw',
            [
                db.items,
                db.stats,
                db.settings,
                db.shoppingList,
                db.profiles,
                db.mealPlans,
                db.customTags,
                db.receiptHistory,
            ],
            async () => {
                if (validItems.length > 0) await db.items.bulkPut(validItems);
                if (validShopping.length > 0) await db.shoppingList.bulkPut(validShopping);
                if (validProfiles.length > 0) await db.profiles.bulkPut(validProfiles);
                if (validMealPlans.length > 0) await db.mealPlans.bulkPut(validMealPlans);
                if (validTags.length > 0) await db.customTags.bulkPut(validTags);
                if (validReceiptHistory.length > 0) await db.receiptHistory.bulkPut(validReceiptHistory);
                if (validStats?.success) await db.stats.put(validStats.data);
                if (validSettings?.success) await db.settings.put(validSettings.data);
            },
        );

        const recordsImported = validItems.length
            + validShopping.length
            + validProfiles.length
            + validMealPlans.length
            + validTags.length
            + validReceiptHistory.length
            + (validStats?.success ? 1 : 0)
            + (validSettings?.success ? 1 : 0);
        return {
            success: true,
            itemsImported: validItems.length,
            recordsImported,
            errors,
        };
    } catch (error) {
        console.error('Import failed:', error);
        return {
            success: false,
            itemsImported: 0,
            recordsImported: 0,
            errors: ['Failed to parse import data'],
        };
    }
}
