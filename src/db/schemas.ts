import { z } from 'zod';

// Inventory Item Schema
export const InventoryItemSchema = z.object({
    id: z.string().uuid(),
    name: z.string().min(1, 'Name is required').max(200, 'Name too long'),
    brand: z.string().max(100).optional(),
    expirationDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date format (YYYY-MM-DD)'),
    dateType: z.string().max(50),
    addedAt: z.string().datetime(),
    updatedAt: z.string().datetime().optional(),
    status: z.enum(['good', 'expiring_soon', 'expired']),
    quantity: z.number().int().min(1).max(999),
    storageLocation: z.enum(['fridge', 'freezer', 'pantry']),
    consumedAt: z.string().datetime().optional(),
    imageId: z.string().uuid().optional(), // Reference to scan image
    notes: z.string().max(500).optional(),
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
});

export type ValidatedStats = z.infer<typeof StatsSchema>;

// Settings Schema
export const SettingsSchema = z.object({
    id: z.literal('user'),
    theme: z.enum(['light', 'dark', 'system']).default('system'),
    defaultStorageLocation: z.enum(['fridge', 'freezer', 'pantry']).default('fridge'),
    expirationWarningDays: z.number().int().min(1).max(14).default(3),
    notificationsEnabled: z.boolean().default(false),
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
