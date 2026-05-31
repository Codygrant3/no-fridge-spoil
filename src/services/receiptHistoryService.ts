import { clearCacheByService } from './aiCacheService';
import type { ReceiptAnalysisResult } from './receiptOCRService';

export interface ReceiptHistoryEntry {
    id: string;
    scannedAt: string;
    storeName?: string;
    date?: string;
    source: 'camera' | 'gallery' | 'sample';
    itemCount: number;
    skippedItems: string[];
    cacheHit: boolean;
    status: 'completed' | 'queued' | 'failed';
    previewUrl?: string;
}

export interface ReceiptPrivacySettings {
    saveHistory: boolean;
    savePreviews: boolean;
}

const HISTORY_KEY = 'no-fridge-spoil:receipt-history';
const PRIVACY_KEY = 'no-fridge-spoil:receipt-privacy';

export function getReceiptPrivacySettings(): ReceiptPrivacySettings {
    try {
        return {
            saveHistory: true,
            savePreviews: true,
            ...JSON.parse(localStorage.getItem(PRIVACY_KEY) || '{}'),
        };
    } catch {
        return { saveHistory: true, savePreviews: true };
    }
}

export function setReceiptPrivacySettings(settings: ReceiptPrivacySettings): void {
    localStorage.setItem(PRIVACY_KEY, JSON.stringify(settings));
}

export function getReceiptHistory(): ReceiptHistoryEntry[] {
    try {
        return JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]') as ReceiptHistoryEntry[];
    } catch {
        return [];
    }
}

export function saveReceiptHistory(
    result: ReceiptAnalysisResult,
    options: {
        source: ReceiptHistoryEntry['source'];
        previewUrl?: string;
        cacheHit?: boolean;
        status?: ReceiptHistoryEntry['status'];
    },
): ReceiptHistoryEntry | null {
    const privacy = getReceiptPrivacySettings();
    if (!privacy.saveHistory) return null;

    const entry: ReceiptHistoryEntry = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        scannedAt: new Date().toISOString(),
        storeName: result.storeName,
        date: result.date,
        source: options.source,
        itemCount: result.items.length,
        skippedItems: result.skippedItems || [],
        cacheHit: Boolean(options.cacheHit),
        status: options.status || 'completed',
        previewUrl: privacy.savePreviews ? options.previewUrl : undefined,
    };
    localStorage.setItem(HISTORY_KEY, JSON.stringify([entry, ...getReceiptHistory()].slice(0, 25)));
    return entry;
}

export function clearReceiptHistory(): void {
    localStorage.removeItem(HISTORY_KEY);
}

export async function clearReceiptPrivacyData(): Promise<void> {
    clearReceiptHistory();
    await clearCacheByService('receipt');
}
