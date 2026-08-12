import { db, type DbReceiptHistoryEntry } from '../db/database';
import { clearCacheByService } from './aiCacheService';
import type { ReceiptAnalysisResult } from './receiptOCRService';
import {
    readLocalJson,
    removeLocalValue,
    writeLocalJson,
} from './safeStorage';

export type ReceiptHistoryEntry = DbReceiptHistoryEntry;

export interface ReceiptPrivacySettings {
    saveHistory: boolean;
    savePreviews: boolean;
    previewRetentionDays: number;
    cloudOcrConsent: boolean;
}

const HISTORY_KEY = 'no-fridge-spoil:receipt-history';
const PRIVACY_KEY = 'no-fridge-spoil:receipt-privacy';
const DEFAULT_PRIVACY: ReceiptPrivacySettings = {
    saveHistory: true,
    savePreviews: false,
    previewRetentionDays: 7,
    cloudOcrConsent: false,
};

export function getReceiptPrivacySettings(): ReceiptPrivacySettings {
    return {
        ...DEFAULT_PRIVACY,
        ...readLocalJson<Partial<ReceiptPrivacySettings>>(PRIVACY_KEY, {}),
    };
}

export function setReceiptPrivacySettings(settings: ReceiptPrivacySettings): void {
    writeLocalJson(PRIVACY_KEY, settings);
}

async function migrateLegacyHistory(): Promise<void> {
    const legacy = readLocalJson<ReceiptHistoryEntry[]>(HISTORY_KEY, []);
    if (legacy.length > 0) {
        await db.receiptHistory.bulkPut(legacy.slice(0, 25));
    }
    removeLocalValue(HISTORY_KEY);
}

function previewIsRetained(entry: ReceiptHistoryEntry, privacy: ReceiptPrivacySettings): boolean {
    if (!privacy.savePreviews || privacy.previewRetentionDays <= 0) return false;
    const cutoff = Date.now() - privacy.previewRetentionDays * 24 * 60 * 60 * 1000;
    return Date.parse(entry.scannedAt) >= cutoff;
}

export async function getReceiptHistory(): Promise<ReceiptHistoryEntry[]> {
    await migrateLegacyHistory();
    const privacy = getReceiptPrivacySettings();
    const entries = await db.receiptHistory.orderBy('scannedAt').reverse().limit(25).toArray();
    const expiredPreviewIds = entries
        .filter(entry => (
            (entry.previewBlob || entry.previewUrl)
            && (!previewIsRetained(entry, privacy) || entry.previewUrl?.startsWith('blob:'))
        ))
        .map(entry => entry.id);
    if (expiredPreviewIds.length > 0) {
        await db.transaction('rw', db.receiptHistory, async () => {
            await Promise.all(expiredPreviewIds.map(id => db.receiptHistory.update(id, {
                previewUrl: undefined,
                previewBlob: undefined,
            })));
        });
    }
    return entries.map(entry => (
        (entry.previewBlob || entry.previewUrl)
            && (!previewIsRetained(entry, privacy) || entry.previewUrl?.startsWith('blob:'))
            ? { ...entry, previewUrl: undefined, previewBlob: undefined }
            : entry
    ));
}

export async function saveReceiptHistory(
    result: ReceiptAnalysisResult,
    options: {
        source: ReceiptHistoryEntry['source'];
        previewUrl?: string;
        previewBlob?: Blob;
        cacheHit?: boolean;
        status?: ReceiptHistoryEntry['status'];
    },
): Promise<ReceiptHistoryEntry | null> {
    const privacy = getReceiptPrivacySettings();
    if (!privacy.saveHistory) return null;

    const entry: ReceiptHistoryEntry = {
        id: crypto.randomUUID(),
        scannedAt: new Date().toISOString(),
        storeName: result.storeName,
        date: result.date,
        source: options.source,
        itemCount: result.items.length,
        skippedItems: result.skippedItems || [],
        cacheHit: Boolean(options.cacheHit),
        status: options.status || 'completed',
        previewUrl: privacy.savePreviews && privacy.previewRetentionDays > 0
            ? options.previewUrl
            : undefined,
        previewBlob: privacy.savePreviews && privacy.previewRetentionDays > 0
            ? options.previewBlob
            : undefined,
    };
    await migrateLegacyHistory();
    await db.receiptHistory.put(entry);
    const overflow = await db.receiptHistory.orderBy('scannedAt').reverse().offset(25).primaryKeys();
    if (overflow.length > 0) await db.receiptHistory.bulkDelete(overflow);
    return entry;
}

export async function clearReceiptPreviews(): Promise<void> {
    await db.receiptHistory.toCollection().modify(entry => {
        entry.previewUrl = undefined;
        entry.previewBlob = undefined;
    });
}

export async function clearReceiptHistory(): Promise<void> {
    removeLocalValue(HISTORY_KEY);
    await db.receiptHistory.clear();
}

export async function deleteReceiptHistoryEntry(id: string): Promise<void> {
    await db.receiptHistory.delete(id);
}

export async function clearReceiptPrivacyData(): Promise<void> {
    await db.transaction('rw', db.receiptHistory, db.receiptQueue, async () => {
        await db.receiptHistory.clear();
        await db.receiptQueue.clear();
    });
    removeLocalValue(HISTORY_KEY);
    await clearCacheByService('receipt');
}
