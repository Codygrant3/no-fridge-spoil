// Barcode lookup service using Open Food Facts API
import { BarcodeCache } from './barcodeCache';

export interface BarcodeProductInfo {
    barcode: string;
    name: string;
    brand: string;
    quantity?: string;
    categories?: string;
    imageUrl?: string;
    nutriscore?: string;
    ingredients?: string;
    found: boolean;
    fromCache?: boolean;
}

const OPEN_FOOD_FACTS_API = 'https://world.openfoodfacts.org/api/v0/product';

export async function lookupBarcode(barcode: string): Promise<BarcodeProductInfo> {
    // Check cache first
    const cached = await BarcodeCache.get(barcode);
    if (cached) {
        console.log('📦 Barcode found in cache:', barcode);
        return {
            barcode,
            name: cached.name,
            brand: cached.brand || 'Unknown',
            found: true,
            fromCache: true,
        };
    }

    try {
        const response = await fetch(`${OPEN_FOOD_FACTS_API}/${barcode}.json`);

        if (!response.ok) {
            return { barcode, name: 'Unknown Product', brand: 'Unknown', found: false };
        }

        const data = await response.json();

        if (data.status === 0 || !data.product) {
            return { barcode, name: 'Unknown Product', brand: 'Unknown', found: false };
        }

        const product = data.product;
        const name = product.product_name || product.product_name_en || 'Unknown Product';
        const brand = product.brands || 'Unknown';

        // Save to cache for offline use
        if (name !== 'Unknown Product') {
            await BarcodeCache.set(barcode, name, brand !== 'Unknown' ? brand : undefined);
            console.log('💾 Barcode saved to cache:', barcode);
        }

        return {
            barcode,
            name,
            brand,
            quantity: product.quantity || undefined,
            categories: product.categories || undefined,
            imageUrl: product.image_front_small_url || product.image_url || undefined,
            nutriscore: product.nutriscore_grade?.toUpperCase() || undefined,
            ingredients: product.ingredients_text || undefined,
            found: true,
        };
    } catch (error) {
        console.error('Barcode lookup failed:', error);
        return { barcode, name: 'Lookup Failed', brand: 'Unknown', found: false };
    }
}

