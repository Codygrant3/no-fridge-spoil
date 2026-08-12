import { makeImageCacheKey, getCachedResponse, setCachedResponse } from './aiCacheService';
import { lookupBarcode } from './barcodeService';

export interface VisionAnalysisResult {
    item_name: string;
    brand: string;
    expiration_date: string;
    date_type: 'Use By' | 'Best By' | 'Best Before' | 'Expires' | 'Sell By' | 'Unknown';
    confidence: 'High' | 'Medium' | 'Low';
    notes: string;
    category?: 'packaged' | 'fresh_produce' | 'unknown';
}

interface BarcodeDetection {
    rawValue?: string;
}

interface TextDetection {
    rawValue?: string;
}

interface BarcodeDetectorInstance {
    detect(source: ImageBitmapSource): Promise<BarcodeDetection[]>;
}

interface TextDetectorInstance {
    detect(source: ImageBitmapSource): Promise<TextDetection[]>;
}

interface LocalImageDetectors {
    BarcodeDetector?: new(options?: { formats?: string[] }) => BarcodeDetectorInstance;
    TextDetector?: new() => TextDetectorInstance;
}

const MONTHS: Readonly<Record<string, number>> = {
    jan: 1,
    january: 1,
    feb: 2,
    february: 2,
    mar: 3,
    march: 3,
    apr: 4,
    april: 4,
    may: 5,
    jun: 6,
    june: 6,
    jul: 7,
    july: 7,
    aug: 8,
    august: 8,
    sep: 9,
    sept: 9,
    september: 9,
    oct: 10,
    october: 10,
    nov: 11,
    november: 11,
    dec: 12,
    december: 12,
};

function inferDateType(text: string): VisionAnalysisResult['date_type'] {
    if (/\buse\s*by\b/i.test(text)) return 'Use By';
    if (/\bbest\s*before\b/i.test(text)) return 'Best Before';
    if (/\bbest\s*by\b/i.test(text)) return 'Best By';
    if (/\bsell\s*by\b/i.test(text)) return 'Sell By';
    if (/\bexp(?:ires?|iration)?\b/i.test(text)) return 'Expires';
    return 'Unknown';
}

function normalizeYear(value: number): number {
    return value < 100 ? 2000 + value : value;
}

function formatDate(year: number, month: number, day: number, now: Date): string | undefined {
    const normalizedYear = normalizeYear(year);
    if (normalizedYear < now.getFullYear() - 1 || normalizedYear > now.getFullYear() + 6) return undefined;
    const candidate = new Date(Date.UTC(normalizedYear, month - 1, day));
    if (
        candidate.getUTCFullYear() !== normalizedYear
        || candidate.getUTCMonth() !== month - 1
        || candidate.getUTCDate() !== day
    ) return undefined;
    return `${normalizedYear}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function extractExpirationDate(
    text: string,
    now: Date = new Date(),
): Pick<VisionAnalysisResult, 'expiration_date' | 'date_type'> {
    const dateType = inferDateType(text);
    const normalized = text.replace(/[,]/g, ' ').replace(/\s+/g, ' ');

    const iso = normalized.match(/\b(20\d{2})[-/.](\d{1,2})[-/.](\d{1,2})\b/);
    if (iso) {
        const expirationDate = formatDate(Number(iso[1]), Number(iso[2]), Number(iso[3]), now);
        if (expirationDate) return { expiration_date: expirationDate, date_type: dateType };
    }

    const numeric = normalized.match(/\b(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})\b/);
    if (numeric) {
        const first = Number(numeric[1]);
        const second = Number(numeric[2]);
        const month = first > 12 ? second : first;
        const day = first > 12 ? first : second;
        const expirationDate = formatDate(Number(numeric[3]), month, day, now);
        if (expirationDate) return { expiration_date: expirationDate, date_type: dateType };
    }

    const dayMonth = normalized.match(/\b(\d{1,2})\s+([a-z]{3,9})\s+(\d{2,4})\b/i);
    if (dayMonth) {
        const month = MONTHS[dayMonth[2].toLowerCase()];
        const expirationDate = month
            ? formatDate(Number(dayMonth[3]), month, Number(dayMonth[1]), now)
            : undefined;
        if (expirationDate) return { expiration_date: expirationDate, date_type: dateType };
    }

    const monthDay = normalized.match(/\b([a-z]{3,9})\s+(\d{1,2})\s+(\d{2,4})\b/i);
    if (monthDay) {
        const month = MONTHS[monthDay[1].toLowerCase()];
        const expirationDate = month
            ? formatDate(Number(monthDay[3]), month, Number(monthDay[2]), now)
            : undefined;
        if (expirationDate) return { expiration_date: expirationDate, date_type: dateType };
    }

    return { expiration_date: 'Unknown', date_type: dateType };
}

async function inspectImageLocally(imageFile: File): Promise<{ barcode?: string; text: string }> {
    if (typeof createImageBitmap !== 'function') return { text: '' };
    const bitmap = await createImageBitmap(imageFile);
    const detectors = globalThis as typeof globalThis & LocalImageDetectors;
    let barcode: string | undefined;
    let text = '';

    try {
        if (detectors.BarcodeDetector) {
            try {
                const detector = new detectors.BarcodeDetector({
                    formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'itf'],
                });
                const detections = await detector.detect(bitmap);
                barcode = detections.map(result => result.rawValue?.trim()).find(Boolean);
            } catch {
                // Barcode detection is best-effort and unsupported on some browsers.
            }
        }

        if (detectors.TextDetector) {
            try {
                const detector = new detectors.TextDetector();
                const detections = await detector.detect(bitmap);
                text = detections.map(result => result.rawValue?.trim()).filter(Boolean).join('\n');
            } catch {
                // Native text detection is best-effort; manual review remains available.
            }
        }
    } finally {
        bitmap.close();
    }

    if (!text) {
        try {
            const { recognizeTextLocally } = await import('./localOcrService');
            text = await recognizeTextLocally(imageFile);
        } catch {
            // The local OCR worker is optional; users can still enter details manually.
        }
    }

    return { barcode, text };
}

export async function analyzeImage(imageFile: File): Promise<VisionAnalysisResult> {
    const cacheKey = await makeImageCacheKey(imageFile);
    const cached = await getCachedResponse<VisionAnalysisResult>(cacheKey, 'vision');
    if (cached) return cached;

    const local = await inspectImageLocally(imageFile);
    const product = local.barcode ? await lookupBarcode(local.barcode) : undefined;
    const date = extractExpirationDate(local.text);
    const productFound = Boolean(product?.found);
    const dateFound = date.expiration_date !== 'Unknown';
    const capabilities: string[] = [];

    if (productFound) capabilities.push('barcode matched locally');
    if (dateFound) capabilities.push('date read on this device');
    if (!productFound) capabilities.push('item name needs review');
    if (!dateFound) capabilities.push('expiration date needs review');

    const result: VisionAnalysisResult = {
        item_name: productFound ? product!.name : 'Unidentified item',
        brand: productFound ? product!.brand : 'Unknown',
        expiration_date: date.expiration_date,
        date_type: date.date_type,
        confidence: productFound && dateFound ? 'High' : productFound || dateFound ? 'Medium' : 'Low',
        category: productFound || local.text ? 'packaged' : 'unknown',
        notes: `Processed on this device: ${capabilities.join('; ')}.`,
    };

    await setCachedResponse(cacheKey, 'vision', result);
    return result;
}
