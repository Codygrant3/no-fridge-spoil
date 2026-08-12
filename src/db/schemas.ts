import { z } from 'zod';
import { isValidDateOnly } from '../utils/dateValidation';

// Inventory Item Schema
export const InventoryItemSchema = z.object({
    id: z.string().uuid(),
    name: z.string().min(1, 'Name is required').max(200, 'Name too long'),
    brand: z.string().max(100).optional(),
    expirationDate: z.string().refine(isValidDateOnly, 'Invalid calendar date (YYYY-MM-DD)'),
    dateType: z.string().max(50),
    addedAt: z.string().datetime(),
    updatedAt: z.string().datetime().optional(),
    status: z.enum(['good', 'expiring_soon', 'expired']),
    quantity: z.number().int().min(1).max(999),
    storageLocation: z.enum(['fridge', 'freezer', 'pantry']),
    consumedAt: z.string().datetime().optional(),
    openedDate: z.string().refine(isValidDateOnly, 'Invalid opened date').optional(),
    imageId: z.string().uuid().optional(), // Reference to scan image
    notes: z.string().max(500).optional(),
    profileId: z.string().max(100).optional(),
    isDeleted: z.union([z.boolean(), z.number()]).default(false), // Support both for IndexedDB
});

export type ValidatedInventoryItem = z.infer<typeof InventoryItemSchema>;

// Scan Record Schema (stores captured images and analysis)
export const ScanRecordSchema = z.object({
    id: z.string().uuid(),
    imageBlob: z.instanceof(Blob).optional(),
    thumbnailBlob: z.instanceof(Blob).optional(),
    analysisResult: z.object({
        item_name: z.string(),
        brand: z.string(),
        expiration_date: z.string(),
        date_type: z.string(),
        confidence: z.enum(['High', 'Medium', 'Low']),
        notes: z.string(),
        category: z.enum(['packaged', 'fresh_produce', 'unknown']).optional(),
    }).optional(),
    createdAt: z.string().datetime(),
    linkedItemId: z.string().uuid().optional(),
});

export type ValidatedScanRecord = z.infer<typeof ScanRecordSchema>;

// Stats Schema
export const StatsSchema = z.object({
    id: z.literal('global'),
    itemsSaved: z.number().int().min(0),
    itemsWasted: z.number().int().min(0),
    totalScans: z.number().int().min(0),
    firstUseDate: z.string().datetime().optional(),
    lastActiveDate: z.string().datetime().optional(),
    co2SavedKg: z.number().min(0).default(0),
    waterSavedL: z.number().min(0).default(0),
    moneySaved: z.number().min(0).default(0),
    badges: z.array(z.string().max(100)).max(100).default([]),
    xp: z.number().int().min(0).default(0),
    level: z.number().int().min(1).default(1),
});

export type ValidatedStats = z.infer<typeof StatsSchema>;

// Settings Schema
export const SettingsSchema = z.object({
    id: z.literal('user'),
    theme: z.enum(['light', 'dark', 'system']).default('system'),
    defaultStorageLocation: z.enum(['fridge', 'freezer', 'pantry']).default('fridge'),
    expirationWarningDays: z.number().int().min(1).max(14).default(3),
    notificationsEnabled: z.boolean().default(false),
    notificationFrequency: z.enum(['off', 'daily', 'twice', 'realtime']).optional(),
    notificationTime: z.string().optional(),
    quietHoursStart: z.string().optional(),
    quietHoursEnd: z.string().optional(),
});

export const ShoppingItemSchema = z.object({
    id: z.string().min(1).max(100),
    name: z.string().min(1).max(200),
    brand: z.string().max(100).optional(),
    quantity: z.number().int().min(1).max(999),
    addedAt: z.string().datetime(),
    isChecked: z.boolean(),
    category: z.enum(['produce', 'dairy', 'meat', 'frozen', 'pantry', 'beverages', 'other']).optional(),
    metadata: z.string().max(500).optional(),
    lastBought: z.string().optional(),
    unit: z.string().max(50).optional(),
    profileId: z.string().max(100).optional(),
    isDeleted: z.union([z.boolean(), z.number()]).default(false),
});

export const ProfileSchema = z.object({
    id: z.string().min(1).max(100),
    name: z.string().min(1).max(80),
    avatar: z.string().min(1).max(20),
    color: z.string().regex(/^#[0-9a-f]{6}$/i),
    createdAt: z.string().datetime(),
    isDeleted: z.union([z.boolean(), z.number()]).default(false),
});

export const MealPlanSchema = z.object({
    id: z.string().min(1).max(100),
    weekStartDate: z.string().refine(isValidDateOnly, 'Invalid week start date'),
    meals: z.array(z.object({
        day: z.number().int().min(0).max(6),
        slot: z.enum(['breakfast', 'lunch', 'dinner', 'snack']),
        recipeName: z.string().min(1).max(200),
        ingredients: z.array(z.string().min(1).max(200)).max(100),
    })).max(100),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime().optional(),
    isDeleted: z.union([z.boolean(), z.number()]).default(false),
});

export const CustomTagSchema = z.object({
    id: z.string().min(1).max(100),
    name: z.string().min(1).max(80),
    color: z.string().regex(/^#[0-9a-f]{6}$/i),
    icon: z.string().max(50).optional(),
    isDefault: z.boolean().optional(),
});

export const ReceiptHistorySchema = z.object({
    id: z.string().min(1).max(100),
    scannedAt: z.string().datetime(),
    storeName: z.string().max(200).optional(),
    date: z.string().optional(),
    source: z.enum(['camera', 'gallery', 'sample']),
    itemCount: z.number().int().min(0).max(1_000),
    skippedItems: z.array(z.string().max(200)).max(1_000),
    cacheHit: z.boolean(),
    status: z.enum(['completed', 'queued', 'failed']),
});

export type ValidatedSettings = z.infer<typeof SettingsSchema>;

// Validation helpers
export function validateItem(data: unknown): ValidatedInventoryItem {
    return InventoryItemSchema.parse(data);
}

export function validateScan(data: unknown): ValidatedScanRecord {
    return ScanRecordSchema.parse(data);
}

export function safeValidateItem(data: unknown): { success: true; data: ValidatedInventoryItem } | { success: false; error: z.ZodError } {
    const result = InventoryItemSchema.safeParse(data);
    return result;
}
