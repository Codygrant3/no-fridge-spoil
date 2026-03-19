import { db } from '../db/database';

/**
 * Service to cache barcode lookups in IndexedDB for offline use
 */
export const BarcodeCache = {
    /**
     * Check if a barcode is cached
     */
    async get(barcode: string) {
        const cached = await db.barcodeCache.get(barcode);
        if (!cached) return null;

        // Check if cache is older than 7 days
        const cacheAge = Date.now() - new Date(cached.cachedAt).getTime();
        const sevenDays = 7 * 24 * 60 * 60 * 1000;

        if (cacheAge > sevenDays) {
            // Cache is stale, delete it
            await db.barcodeCache.delete(barcode);
            return null;
        }

        return cached;
    },

    /**
     * Store a barcode result in cache
     */
    async set(barcode: string, name: string, brand?: string) {
        await db.barcodeCache.put({
            barcode,
            name,
            brand,
            cachedAt: new Date().toISOString(),
        });
    },

    /**
     * Clear all cached barcodes
     */
    async clear() {
        await db.barcodeCache.clear();
    },

    /**
     * Get cache stats
     */
    async getStats() {
        const count = await db.barcodeCache.count();
        return { count };
    },
};
