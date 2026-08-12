import type {
    ReceiptPackageInfo,
    ReceiptResolutionConfidence,
    ReceiptResolutionMethod,
    ReceiptWeightInfo,
} from './receiptItemResolver';

export type AzureReceiptConfidence = 'High' | 'Medium' | 'Low';

export interface AzureReceiptItemResolution {
    proposedName: string;
    proposedBrand?: string;
    proposedCategory: string;
    confidence: ReceiptResolutionConfidence;
    method: ReceiptResolutionMethod;
    shouldReview: boolean;
    autoAccepted: boolean;
    alternatives: string[];
    unresolvedTokens: string[];
    evidence: string[];
    packageInfo?: ReceiptPackageInfo;
    soldByWeight?: ReceiptWeightInfo;
    itemCode?: string;
    barcode?: string;
    catalogSource?: string;
}

export interface AzureReceiptLineItem {
    name: string;
    originalName?: string;
    brand?: string;
    quantity: number;
    price?: string;
    category: string;
    confidence: AzureReceiptConfidence;
    fieldConfidence?: {
        name?: AzureReceiptConfidence;
        quantity?: AzureReceiptConfidence;
        price?: AzureReceiptConfidence;
    };
    sourceLine?: string;
    sourceRegion?: string;
    resolution?: AzureReceiptItemResolution;
}

export interface AzureReceiptAnalysis {
    storeName?: string;
    date?: string;
    fieldConfidence?: {
        storeName?: AzureReceiptConfidence;
        date?: AzureReceiptConfidence;
    };
    items: AzureReceiptLineItem[];
    totalItemsDetected: number;
    skippedItems: string[];
    estimatedCostCents: number;
    resolutionMode?: 'shadow';
    resolutionStats?: {
        proposed: number;
        autoAccepted: number;
        needsReview: number;
        barcodeMatches: number;
    };
}

interface AzureCurrencyValue {
    amount?: number;
    currencyCode?: string;
}

interface AzureBoundingRegion {
    pageNumber?: number;
}

interface AzureDocumentField {
    content?: string;
    confidence?: number;
    valueString?: string;
    valueDate?: string;
    valueNumber?: number;
    valueInteger?: number;
    valueCurrency?: AzureCurrencyValue;
    valueArray?: AzureDocumentField[];
    valueObject?: Record<string, AzureDocumentField>;
    boundingRegions?: AzureBoundingRegion[];
}

interface AzureAnalyzeResult {
    documents?: Array<{
        confidence?: number;
        fields?: Record<string, AzureDocumentField>;
    }>;
}

interface AzureAnalyzeOperation {
    analyzeResult?: AzureAnalyzeResult;
}

const NON_FOOD_TERMS = [
    'acetaminophen',
    'aluminum foil',
    'batteries',
    'battery',
    'bleach',
    'candle',
    'cat food',
    'cat litter',
    'cleaner',
    'conditioner',
    'cosmetic',
    'deodorant',
    'detergent',
    'diaper',
    'dish soap',
    'dishwasher',
    'dog food',
    'gift card',
    'greeting card',
    'ibuprofen',
    'laundry',
    'lotion',
    'magazine',
    'makeup',
    'medicine',
    'paper towel',
    'pet food',
    'plastic wrap',
    'razor',
    'shampoo',
    'soap',
    'sponge',
    'storage bag',
    'tissue',
    'toilet paper',
    'toothbrush',
    'toothpaste',
    'trash bag',
    'vitamin',
    'wipes',
    'zipper bag',
] as const;

const CATEGORY_TERMS: Array<{ category: string; terms: readonly string[] }> = [
    {
        category: 'Frozen',
        terms: ['frozen', 'ice cream', 'popsicle', 'sorbet'],
    },
    {
        category: 'Produce',
        terms: [
            'apple', 'avocado', 'banana', 'berries', 'berry', 'broccoli', 'cabbage',
            'carrot', 'cauliflower', 'celery', 'cilantro', 'corn', 'cucumber', 'garlic',
            'grape', 'kale', 'lemon', 'lettuce', 'lime', 'mango', 'melon', 'mushroom',
            'onion', 'orange', 'peach', 'pear', 'pepper', 'potato', 'spinach', 'tomato',
            'watermelon', 'zucchini',
        ],
    },
    {
        category: 'Dairy',
        terms: ['butter', 'cheese', 'cream', 'half and half', 'milk', 'yogurt'],
    },
    {
        category: 'Eggs',
        terms: ['egg', 'eggs'],
    },
    {
        category: 'Meat & Seafood',
        terms: [
            'bacon', 'beef', 'chicken', 'fish', 'ham', 'lamb', 'pork', 'salmon',
            'sausage', 'seafood', 'shrimp', 'steak', 'tilapia', 'tuna', 'turkey',
        ],
    },
    {
        category: 'Bakery',
        terms: ['bagel', 'bread', 'bun', 'cake', 'croissant', 'loaf', 'muffin', 'pastry', 'roll', 'tortilla'],
    },
    {
        category: 'Beverages',
        terms: ['beer', 'coffee', 'juice', 'kombucha', 'lemonade', 'soda', 'sparkling water', 'tea', 'water', 'wine'],
    },
    {
        category: 'Prepared Foods',
        terms: ['deli', 'prepared', 'rotisserie', 'salad', 'sandwich', 'sushi'],
    },
    {
        category: 'Pantry',
        terms: [
            'beans', 'canned', 'cereal', 'chips', 'cookie', 'crackers', 'flour', 'granola',
            'jam', 'jelly', 'noodle', 'nuts', 'oil', 'pasta', 'peanut butter', 'rice',
            'sauce', 'seasoning', 'snack', 'soup', 'spice', 'sugar',
        ],
    },
];

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asAnalyzeOperation(value: unknown): AzureAnalyzeOperation {
    if (!isRecord(value)) return {};
    return value as AzureAnalyzeOperation;
}

function normalizedText(value: string): string {
    return value
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function containsTerm(text: string, term: string): boolean {
    const escapedTerm = normalizedText(term).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`(?:^|\\s)${escapedTerm}(?:s|es)?(?:\\s|$)`).test(normalizedText(text));
}

export function isNonFoodReceiptItem(name: string, sourceLine = ''): boolean {
    const text = `${name} ${sourceLine}`;
    return NON_FOOD_TERMS.some(term => containsTerm(text, term));
}

export function categorizeReceiptItem(name: string): string {
    const match = CATEGORY_TERMS.find(group => group.terms.some(term => containsTerm(name, term)));
    return match?.category ?? 'Grocery';
}

function fieldString(field?: AzureDocumentField): string | undefined {
    const value = field?.valueString || field?.valueDate || field?.content;
    return value?.trim() || undefined;
}

function fieldNumber(field?: AzureDocumentField): number | undefined {
    const typedValue = field?.valueNumber ?? field?.valueInteger ?? field?.valueCurrency?.amount;
    if (typeof typedValue === 'number' && Number.isFinite(typedValue)) return typedValue;

    const numericContent = field?.content?.replace(/[^0-9.-]/g, '');
    if (!numericContent) return undefined;
    const parsed = Number(numericContent);
    return Number.isFinite(parsed) ? parsed : undefined;
}

function priceString(field?: AzureDocumentField): string | undefined {
    const value = fieldNumber(field);
    return value === undefined ? undefined : value.toFixed(2);
}

function confidenceLevel(value?: number): AzureReceiptConfidence {
    if (typeof value !== 'number') return 'Medium';
    if (value >= 0.85) return 'High';
    if (value >= 0.65) return 'Medium';
    return 'Low';
}

function fieldConfidence(field?: AzureDocumentField, documentConfidence?: number): AzureReceiptConfidence | undefined {
    if (!field && typeof documentConfidence !== 'number') return undefined;
    return confidenceLevel(field?.confidence ?? documentConfidence);
}

function itemConfidence(fields: Array<AzureDocumentField | undefined>, documentConfidence?: number): AzureReceiptConfidence {
    const confidenceValues = fields
        .map(field => field?.confidence)
        .filter((value): value is number => typeof value === 'number');

    if (typeof documentConfidence === 'number') confidenceValues.push(documentConfidence);
    if (confidenceValues.length === 0) return 'Medium';
    return confidenceLevel(Math.min(...confidenceValues));
}

function sourceRegion(field?: AzureDocumentField): string | undefined {
    const pageNumber = field?.boundingRegions?.[0]?.pageNumber;
    return pageNumber ? `page ${pageNumber}` : undefined;
}

export function mapAzureReceiptResult(value: unknown): AzureReceiptAnalysis {
    const operation = asAnalyzeOperation(value);
    const document = operation.analyzeResult?.documents?.[0];
    const fields = document?.fields ?? {};
    const rawItems = fields.Items?.valueArray ?? [];
    const items: AzureReceiptLineItem[] = [];
    const skippedItems: string[] = [];

    for (const rawItem of rawItems) {
        const itemFields = rawItem.valueObject ?? {};
        const nameField = itemFields.Description ?? itemFields.Name;
        const name = fieldString(nameField);
        if (!name) continue;

        const sourceLine = rawItem.content?.trim() || nameField?.content?.trim() || name;
        if (isNonFoodReceiptItem(name, sourceLine)) {
            skippedItems.push(name);
            continue;
        }

        const quantityValue = fieldNumber(itemFields.Quantity);
        const quantity = quantityValue && quantityValue >= 1 ? quantityValue : 1;
        const priceField = itemFields.TotalPrice ?? itemFields.Price;

        items.push({
            name,
            brand: fieldString(itemFields.Brand),
            quantity,
            price: priceString(priceField),
            category: categorizeReceiptItem(name),
            confidence: itemConfidence([nameField, itemFields.Quantity, priceField], document?.confidence),
            fieldConfidence: {
                name: fieldConfidence(nameField, document?.confidence),
                quantity: fieldConfidence(itemFields.Quantity, document?.confidence),
                price: fieldConfidence(priceField, document?.confidence),
            },
            sourceLine,
            sourceRegion: sourceRegion(nameField ?? rawItem),
        });
    }

    return {
        storeName: fieldString(fields.MerchantName),
        date: fieldString(fields.TransactionDate),
        ...(document ? {
            fieldConfidence: {
                storeName: fieldConfidence(fields.MerchantName, document.confidence),
                date: fieldConfidence(fields.TransactionDate, document.confidence),
            },
        } : {}),
        items,
        totalItemsDetected: items.length,
        skippedItems,
        estimatedCostCents: 1,
    };
}
