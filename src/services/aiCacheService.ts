/**
 * AI Cache Service — Offline-First Caching for AI Responses
 *
 * Caches AI responses in IndexedDB so repeat scans/recipe lookups
 * work offline and return instantly.
 */

import { db } from '../db/database';
import type { DbAICacheEntry } from '../db/database';

export type AICacheServiceType = 'vision' | 'recipe' | 'factCheck';

// Default TTL in hours per service type
const DEFAULT_TTL: Record<AICacheServiceType, number> = {
    vision: 24,       // 1 day — same image rarely changes
    recipe: 72,       // 3 days — recipes are creative, but duplicates are fine short-term
    factCheck: 168,   // 1 week — recall data doesn't change rapidly
};

/**
 * Generate a deterministic cache key from input data.
 * Uses btoa() for sync, lightweight hashing.
 */
export function makeCacheKey(input: string): string {
    try {
        return btoa(unescape(encodeURIComponent(input)));
    } catch {
        // Fallback for very long strings: truncate + simple hash
        const truncated = input.slice(0, 500);
        let hash = 0;
        for (let i = 0; i < truncated.length; i++) {
            const char = truncated.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash |= 0; // Convert to 32-bit int
        }
        return `hash_${hash}`;
    }
}

/**
 * Generate a cache key for an image file (based on name + size + lastModified).
 */
export function makeImageCacheKey(file: File): string {
    return makeCacheKey(`vision:${file.name}:${file.size}:${file.lastModified}`);
}

/**
 * Generate a cache key for recipe generation (sorted item names).
 */
export function makeRecipeCacheKey(itemNames: string[]): string {
    const sorted = [...itemNames].sort().join('|').toLowerCase();
    return makeCacheKey(`recipe:${sorted}`);
}

/**
 * Generate a cache key for fact-checking.
 */
export function makeFactCheckCacheKey(productName: string, brand?: string): string {
    return makeCacheKey(`factCheck:${productName.toLowerCase()}:${(brand || '').toLowerCase()}`);
}

/**
 * Get a cached response if it exists and hasn't expired.
 */
export async function getCachedResponse<T>(
    cacheKey: string,
    _serviceType?: AICacheServiceType,
): Promise<T | null> {
    try {
        const entry = await db.aiCache.get(cacheKey);
        if (!entry) return null;

        // Check expiration
        if (new Date(entry.expiresAt) < new Date()) {
            // Expired — delete and return null
            await db.aiCache.delete(cacheKey);
            return null;
        }

        // Increment hit count
        await db.aiCache.update(cacheKey, {
            hitCount: (entry.hitCount || 0) + 1,
        });

        return JSON.parse(entry.response) as T;
    } catch (error) {
        console.warn('AI Cache read error:', error);
        return null;
    }
}

/**
 * Store an AI response in the cache.
 */
export async function setCachedResponse(
    cacheKey: string,
    serviceType: AICacheServiceType,
    response: unknown,
    ttlHours?: number,
): Promise<void> {
    try {
        const responseStr = JSON.stringify(response);
        const ttl = ttlHours ?? DEFAULT_TTL[serviceType];
        const now = new Date();
        const expiresAt = new Date(now.getTime() + ttl * 60 * 60 * 1000);

        const entry: DbAICacheEntry = {
            cacheKey,
            serviceType,
            response: responseStr,
            cachedAt: now.toISOString(),
            expiresAt: expiresAt.toISOString(),
            hitCount: 0,
            sizeBytes: new Blob([responseStr]).size,
        };

        await db.aiCache.put(entry);
    } catch (error) {
        console.warn('AI Cache write error:', error);
    }
}

/**
 * Clean up expired cache entries. Call on app init.
 */
export async function cleanupExpiredCache(): Promise<number> {
    try {
        const now = new Date().toISOString();
        const expired = await db.aiCache
            .where('expiresAt')
            .below(now)
            .toArray();

        if (expired.length > 0) {
            await db.aiCache.bulkDelete(expired.map(e => e.cacheKey));
            console.log(`AI Cache: cleaned up ${expired.length} expired entries`);
        }
        return expired.length;
    } catch (error) {
        console.warn('AI Cache cleanup error:', error);
        return 0;
    }
}

/**
 * Get cache statistics for the Stats page.
 */
export async function getCacheStats(): Promise<{
    totalEntries: number;
    totalSizeBytes: number;
    totalHits: number;
    byService: Record<AICacheServiceType, { count: number; hits: number; sizeBytes: number }>;
}> {
    try {
        const allEntries = await db.aiCache.toArray();

        const byService: Record<AICacheServiceType, { count: number; hits: number; sizeBytes: number }> = {
            vision: { count: 0, hits: 0, sizeBytes: 0 },
            recipe: { count: 0, hits: 0, sizeBytes: 0 },
            factCheck: { count: 0, hits: 0, sizeBytes: 0 },
        };

        let totalHits = 0;
        let totalSizeBytes = 0;

        for (const entry of allEntries) {
            const svc = entry.serviceType as AICacheServiceType;
            if (byService[svc]) {
                byService[svc].count++;
                byService[svc].hits += entry.hitCount || 0;
                byService[svc].sizeBytes += entry.sizeBytes || 0;
            }
            totalHits += entry.hitCount || 0;
            totalSizeBytes += entry.sizeBytes || 0;
        }

        return {
            totalEntries: allEntries.length,
            totalSizeBytes,
            totalHits,
            byService,
        };
    } catch {
        return {
            totalEntries: 0,
            totalSizeBytes: 0,
            totalHits: 0,
            byService: {
                vision: { count: 0, hits: 0, sizeBytes: 0 },
                recipe: { count: 0, hits: 0, sizeBytes: 0 },
                factCheck: { count: 0, hits: 0, sizeBytes: 0 },
            },
        };
    }
}

/**
 * Clear all cache entries (manual purge).
 */
export async function clearAllCache(): Promise<void> {
    await db.aiCache.clear();
    console.log('AI Cache: all entries cleared');
}
