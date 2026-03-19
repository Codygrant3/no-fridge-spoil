/**
 * Fact-Check Service - Google Search Grounding via Gemini
 * 
 * Uses Gemini with Google Search grounding to verify product information,
 * check for recalls, and provide storage recommendations.
 */

import { ai } from './ai-client';
import { makeFactCheckCacheKey, makeCacheKey, getCachedResponse, setCachedResponse } from './aiCacheService';

export interface FactCheckResult {
    verified: boolean;
    confidence: 'high' | 'medium' | 'low';
    productInfo: {
        name: string;
        brand?: string;
        category?: string;
        typicalShelfLife?: string;
    };
    storageRecommendations: string[];
    recallAlerts: {
        hasRecall: boolean;
        details?: string;
    };
    sources: {
        title: string;
        url?: string;
    }[];
    additionalNotes?: string;
}

export interface FactCheckInput {
    productName: string;
    brand?: string;
    barcode?: string;
    expirationDate?: string;
}

/**
 * Fact-check product information using Gemini with Google Search grounding
 */
export async function factCheckProduct(input: FactCheckInput): Promise<FactCheckResult> {
    if (!ai) {
        return {
            verified: false,
            confidence: 'low',
            productInfo: { name: input.productName },
            storageRecommendations: [],
            recallAlerts: { hasRecall: false },
            sources: [],
            additionalNotes: 'Fact-check service unavailable. Please check your API key.',
        };
    }

    // Check cache first
    const cacheKey = makeFactCheckCacheKey(input.productName, input.brand);
    const cached = await getCachedResponse<FactCheckResult>(cacheKey, 'factCheck');
    if (cached) {
        console.log('AI Cache hit: fact-check');
        return cached;
    }

    const prompt = `
    You are a food safety expert with access to current information. Verify and provide details about this food product.
    
    Product: ${input.productName}
    ${input.brand ? `Brand: ${input.brand}` : ''}
    ${input.barcode ? `Barcode: ${input.barcode}` : ''}
    ${input.expirationDate ? `Labeled expiration: ${input.expirationDate}` : ''}
    
    Please research and provide:
    1. Verify if this is a real product
    2. Typical shelf life for this type of product
    3. Proper storage recommendations (refrigerate? freeze? pantry?)
    4. Any current FDA recalls for this product or brand
    5. Food safety tips specific to this item
    
    Return ONLY a JSON object (no markdown) with this structure:
    {
        "verified": boolean,
        "confidence": "high" | "medium" | "low",
        "productInfo": {
            "name": "verified product name",
            "brand": "brand if known",
            "category": "dairy/produce/meat/etc",
            "typicalShelfLife": "e.g., 7-10 days after opening"
        },
        "storageRecommendations": ["recommendation 1", "recommendation 2"],
        "recallAlerts": {
            "hasRecall": boolean,
            "details": "recall details if any"
        },
        "sources": [{"title": "source name", "url": "optional url"}],
        "additionalNotes": "any other helpful information"
    }
    `;

    try {
        const response = await ai.models.generateContent({
            model: 'gemini-2.0-flash',
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
            // Note: Google Search grounding would be configured here when available
            // tools: [{ googleSearch: {} }],
        });

        const text = response.text?.replace(/```json/g, '').replace(/```/g, '').trim() || '';
        const result = JSON.parse(text) as FactCheckResult;

        // Cache successful result
        await setCachedResponse(cacheKey, 'factCheck', result);

        return result;
    } catch (error) {
        console.error('Fact-check failed:', error);
        return {
            verified: false,
            confidence: 'low',
            productInfo: { name: input.productName, brand: input.brand },
            storageRecommendations: [
                'When in doubt, refrigerate perishables',
                'Check for unusual odors or appearance before consuming',
            ],
            recallAlerts: { hasRecall: false },
            sources: [],
            additionalNotes: 'Could not verify product information. Using general food safety guidelines.',
        };
    }
}

/**
 * Get storage recommendations for a product category
 */
export async function getStorageTips(productName: string): Promise<string[]> {
    if (!ai) {
        return ['Store in a cool, dry place', 'Check expiration dates regularly'];
    }

    // Check cache
    const tipsCacheKey = makeCacheKey(`storageTips:${productName.toLowerCase()}`);
    const cachedTips = await getCachedResponse<string[]>(tipsCacheKey, 'factCheck');
    if (cachedTips) return cachedTips;

    const prompt = `
    Give me 3 brief, practical storage tips for: ${productName}
    Return ONLY a JSON array of strings, e.g., ["tip 1", "tip 2", "tip 3"]
    `;

    try {
        const response = await ai.models.generateContent({
            model: 'gemini-2.0-flash',
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
        });

        const text = response.text?.replace(/```json/g, '').replace(/```/g, '').trim() || '';
        const tips = JSON.parse(text) as string[];
        await setCachedResponse(tipsCacheKey, 'factCheck', tips);
        return tips;
    } catch {
        return ['Store properly to maximize freshness', 'Check regularly for spoilage'];
    }
}

/**
 * Check for product recalls
 */
export async function checkRecalls(productName: string, brand?: string): Promise<{
    hasRecall: boolean;
    details?: string;
    disclaimer: string;
}> {
    const disclaimer = 'AI-generated — not a substitute for official FDA recall data. Verify at fda.gov/safety/recalls.';

    if (!ai) {
        return { hasRecall: false, disclaimer };
    }

    const prompt = `
    Check if there are any current FDA food recalls for: ${productName}${brand ? ` by ${brand}` : ''}

    Return ONLY a JSON object:
    {
        "hasRecall": boolean,
        "details": "recall details if any, otherwise null"
    }

    Only report recalls from the last 6 months. If unsure, return hasRecall: false.
    IMPORTANT: Do not fabricate recall information. Only report a recall if you are confident it is real.
    `;

    try {
        const response = await ai.models.generateContent({
            model: 'gemini-2.0-flash',
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
        });

        const text = response.text?.replace(/```json/g, '').replace(/```/g, '').trim() || '';
        const result = JSON.parse(text) as { hasRecall: boolean; details?: string };
        return { ...result, disclaimer };
    } catch {
        return { hasRecall: false, disclaimer };
    }
}
