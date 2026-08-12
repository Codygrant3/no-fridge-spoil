/// <reference types="node" />

import type { SupabaseClient } from '@supabase/supabase-js';

const OPEN_FOOD_FACTS_API = 'https://world.openfoodfacts.org/api/v3/product';
const LOOKUP_TIMEOUT_MS = 2_000;
const CACHE_TTL_MS = 60 * 60 * 1_000;

export interface OpenFoodFactsProduct {
    barcode: string;
    name: string;
    brand?: string;
    source: 'open-food-facts';
}

interface CachedProduct {
    expiresAt: number;
    product: OpenFoodFactsProduct | null;
}

const productCache = new Map<string, CachedProduct>();

export function isValidGtin(value: string): boolean {
    if (!/^\d+$/.test(value) || ![8, 12, 13, 14].includes(value.length)) return false;
    const digits = value.split('').map(Number);
    const suppliedCheckDigit = digits.pop();
    if (suppliedCheckDigit === undefined) return false;

    const sum = digits
        .reverse()
        .reduce((total, digit, index) => total + digit * (index % 2 === 0 ? 3 : 1), 0);
    return (10 - (sum % 10)) % 10 === suppliedCheckDigit;
}

export function extractStableBarcodes(value: string): string[] {
    const matches = value.match(/(?:^|\D)(\d{14}|\d{13}|\d{12}|\d{8})(?=\D|$)/g) ?? [];
    const barcodes = matches
        .map(match => match.replace(/\D/g, ''))
        .filter(isValidGtin);
    return [...new Set(barcodes)];
}

function text(value: unknown): string | undefined {
    return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

export async function lookupOpenFoodFactsProduct(
    barcode: string,
    fetchImplementation: typeof fetch = fetch,
    admin?: SupabaseClient,
): Promise<OpenFoodFactsProduct | null> {
    if (!isValidGtin(barcode)) return null;
    const cached = productCache.get(barcode);
    if (cached && cached.expiresAt > Date.now()) return cached.product;
    if (admin) {
        const { data, error } = await admin
            .from('product_lookup_cache')
            .select('product, expires_at')
            .eq('barcode', barcode)
            .gt('expires_at', new Date().toISOString())
            .maybeSingle();
        if (!error && data) {
            const persistentProduct = (data.product ?? null) as OpenFoodFactsProduct | null;
            productCache.set(barcode, {
                product: persistentProduct,
                expiresAt: Date.parse(String(data.expires_at)),
            });
            return persistentProduct;
        }
    }

    let product: OpenFoodFactsProduct | null = null;
    try {
        const response = await fetchImplementation(
            `${OPEN_FOOD_FACTS_API}/${encodeURIComponent(barcode)}?fields=code,product_name,brands`,
            {
                headers: {
                    Accept: 'application/json',
                    'User-Agent': process.env.OPEN_FOOD_FACTS_USER_AGENT?.trim()
                        || 'NoFridgeSpoil/1.0 (receipt enrichment)',
                },
                signal: AbortSignal.timeout(LOOKUP_TIMEOUT_MS),
            },
        );
        if (response.ok) {
            const payload = await response.json() as {
                status?: string | number;
                product?: { product_name?: unknown; brands?: unknown };
            };
            const name = text(payload.product?.product_name);
            const found = payload.status === 'success' || payload.status === 1 || payload.status === undefined;
            if (found && name) {
                product = {
                    barcode,
                    name,
                    brand: text(payload.product?.brands),
                    source: 'open-food-facts',
                };
            }
        }
    } catch {
        // Catalog enrichment is best-effort and must never block receipt OCR.
    }

    productCache.set(barcode, { product, expiresAt: Date.now() + CACHE_TTL_MS });
    if (admin) {
        const { error } = await admin.from('product_lookup_cache').upsert({
            barcode,
            product,
            cached_at: new Date().toISOString(),
            expires_at: new Date(Date.now() + CACHE_TTL_MS).toISOString(),
        });
        if (error) console.warn('Persistent product lookup cache unavailable:', error.code || error.message);
    }
    return product;
}
