import { ai, hasGeminiApiKey } from './ai-client';
import { getCachedResponse, makeReceiptImageCacheKey, setCachedResponse } from './aiCacheService';
import { z } from 'zod';

export interface ReceiptLineItem {
    name: string;
    brand?: string;
    quantity: number;
    price?: string;
    category: string;
    confidence: 'High' | 'Medium' | 'Low';
    sourceLine?: string;
    sourceRegion?: string;
}

export interface ReceiptAnalysisResult {
    storeName?: string;
    date?: string;
    items: ReceiptLineItem[];
    totalItemsDetected: number;
    skippedItems?: string[];
    cacheHit?: boolean;
    estimatedCostCents?: number;
}

export interface ReceiptDiagnostics {
    configured: boolean;
    reachable: 'unknown' | 'ok' | 'blocked';
    status: 'configured' | 'missing-key' | 'invalid-key' | 'quota-or-rate-limit' | 'network-error' | 'malformed-response' | 'unknown-error';
    message: string;
}

export interface QueuedReceiptScan {
    id: string;
    name: string;
    type: string;
    dataUrl: string;
    queuedAt: string;
    reason: string;
}

const QUEUED_RECEIPTS_KEY = 'no-fridge-spoil:queued-receipts';

const receiptLineItemSchema = z.object({
    name: z.string().min(1),
    brand: z.string().optional(),
    quantity: z.coerce.number().min(1).default(1),
    price: z.string().optional(),
    category: z.string().min(1).default('Grocery'),
    confidence: z.enum(['High', 'Medium', 'Low']).default('Medium'),
    sourceLine: z.string().optional(),
    sourceRegion: z.string().optional(),
});

const receiptAnalysisSchema = z.object({
    storeName: z.string().optional(),
    date: z.string().optional(),
    items: z.array(receiptLineItemSchema).default([]),
    totalItemsDetected: z.coerce.number().optional(),
    skippedItems: z.array(z.string()).default([]),
});

export function getGeminiReceiptDiagnostics(): ReceiptDiagnostics {
    if (!hasGeminiApiKey) {
        return {
            configured: false,
            reachable: 'blocked',
            status: 'missing-key',
            message: 'VITE_GEMINI_API_KEY is not configured. Receipt OCR cannot run.',
        };
    }

    return {
        configured: true,
        reachable: 'unknown',
        status: 'configured',
        message: 'Gemini API key is configured. Connectivity is verified when receipt OCR runs.',
    };
}

export async function checkGeminiReceiptHealth(): Promise<ReceiptDiagnostics> {
    if (!ai) return getGeminiReceiptDiagnostics();

    try {
        await ai.models.generateContent({
            model: 'gemini-2.0-flash-exp',
            contents: [{ role: 'user', parts: [{ text: 'Return only this JSON: {"ok":true}' }] }],
        });
        return {
            configured: true,
            reachable: 'ok',
            status: 'configured',
            message: 'Gemini is configured and reachable.',
        };
    } catch (error) {
        return classifyReceiptOcrError(error);
    }
}

export function classifyReceiptOcrError(error: unknown): ReceiptDiagnostics {
    const message = error instanceof Error ? error.message : String(error);
    const lower = message.toLowerCase();

    if (lower.includes('api key')) {
        return {
            configured: false,
            reachable: 'blocked',
            status: lower.includes('invalid') ? 'invalid-key' : 'missing-key',
            message: lower.includes('invalid')
                ? 'Gemini rejected the configured API key.'
                : 'VITE_GEMINI_API_KEY is not configured. Receipt OCR cannot run.',
        };
    }

    if (lower.includes('quota') || lower.includes('rate') || lower.includes('429')) {
        return {
            configured: true,
            reachable: 'blocked',
            status: 'quota-or-rate-limit',
            message: 'Gemini is reachable, but quota or rate limits blocked this receipt scan.',
        };
    }

    if (lower.includes('json') || lower.includes('parse') || lower.includes('malformed') || lower.includes('validation') || lower.includes('expected')) {
        return {
            configured: true,
            reachable: 'ok',
            status: 'malformed-response',
            message: 'Gemini responded, but the receipt response could not be parsed as JSON.',
        };
    }

    if (lower.includes('network') || lower.includes('fetch') || lower.includes('failed to fetch')) {
        return {
            configured: true,
            reachable: 'blocked',
            status: 'network-error',
            message: 'Gemini could not be reached from this browser session.',
        };
    }

    return {
        configured: hasGeminiApiKey,
        reachable: 'unknown',
        status: 'unknown-error',
        message: message || 'Receipt OCR failed for an unknown reason.',
    };
}

async function fileToBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
            if (reader.result && typeof reader.result === 'string') {
                resolve(reader.result.split(',')[1]);
            } else {
                reject(new Error('Failed to read file'));
            }
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

function fileToDataUrl(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
            if (reader.result && typeof reader.result === 'string') {
                resolve(reader.result);
            } else {
                reject(new Error('Failed to read file'));
            }
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

export async function queueReceiptScan(file: File, reason: string): Promise<QueuedReceiptScan> {
    const queued = getQueuedReceiptScans();
    const entry: QueuedReceiptScan = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        name: file.name,
        type: file.type,
        dataUrl: await fileToDataUrl(file),
        queuedAt: new Date().toISOString(),
        reason,
    };
    localStorage.setItem(QUEUED_RECEIPTS_KEY, JSON.stringify([entry, ...queued].slice(0, 10)));
    return entry;
}

export function getQueuedReceiptScans(): QueuedReceiptScan[] {
    try {
        return JSON.parse(localStorage.getItem(QUEUED_RECEIPTS_KEY) || '[]') as QueuedReceiptScan[];
    } catch {
        return [];
    }
}

export function clearQueuedReceiptScan(id: string): void {
    const queued = getQueuedReceiptScans().filter(scan => scan.id !== id);
    localStorage.setItem(QUEUED_RECEIPTS_KEY, JSON.stringify(queued));
}

export async function analyzeReceipt(imageFile: File): Promise<ReceiptAnalysisResult> {
    if (!ai) {
        throw new Error("Missing Gemini API Key");
    }

    try {
        const cacheKey = await makeReceiptImageCacheKey(imageFile);
        const cached = await getCachedResponse<ReceiptAnalysisResult>(cacheKey, 'receipt');
        if (cached) return { ...cached, cacheHit: true };

        const prompt = `
        Analyze this grocery receipt image and extract ALL food items purchased.

        Instructions:
        1. Extract each line item's product name (be specific, e.g., "Organic Whole Milk" not just "Milk")
        2. Detect brand names if visible
        3. Determine quantity (default to 1 if unclear)
        4. Categorize each item (Produce, Dairy, Meat, Pantry, Frozen, Beverages, etc.)
        5. Skip non-food items (cleaning supplies, pharmacy items, etc.)
        6. Confidence: "High" if text is clear, "Medium" if partially obscured, "Low" if guessing

        Return ONLY valid JSON in this structure:
        {
            "storeName": "Store name if visible",
            "date": "Receipt date if visible (YYYY-MM-DD format)",
            "items": [
                {
                    "name": "Organic Whole Milk",
                    "brand": "Horizon",
                    "quantity": 1,
                    "price": "4.99",
                    "category": "Dairy",
                    "confidence": "High",
                    "sourceLine": "ORGANIC WHOLE MILK 4.99",
                    "sourceRegion": "upper-middle"
                }
            ],
            "totalItemsDetected": 12,
            "skippedItems": ["Dish Soap", "Paper Towels"]
        }

        Focus on food items only. Be thorough—extract every food item visible on the receipt.
        Include skippedItems for visible non-food lines you intentionally ignored.
        `;

        const base64Image = await fileToBase64(imageFile);

        const response = await ai.models.generateContent({
            model: "gemini-2.0-flash-exp",
            contents: [{
                role: "user",
                parts: [
                    { text: prompt },
                    {
                        inlineData: {
                            mimeType: imageFile.type,
                            data: base64Image,
                        },
                    },
                ],
            }],
        });

        const text = response.text || "";
        const cleanedText = text.replace(/```json/g, '').replace(/```/g, '').trim();
        const data = receiptAnalysisSchema.parse(JSON.parse(cleanedText));

        const result = {
            storeName: data.storeName,
            date: data.date,
            items: data.items || [],
            totalItemsDetected: data.items?.length || 0,
            skippedItems: data.skippedItems || [],
            cacheHit: false,
            estimatedCostCents: 1,
        };

        await setCachedResponse(cacheKey, 'receipt', result);
        return result;
    } catch (error) {
        console.error("Receipt OCR failed:", error);
        const diagnostics = classifyReceiptOcrError(error);
        throw new Error(diagnostics.message || "Failed to analyze receipt");
    }
}
