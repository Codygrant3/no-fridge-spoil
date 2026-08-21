import { getReceiptPrivacySettings } from './receiptHistoryService';
import {
    analyzeReceipt,
    clearQueuedReceiptScan,
    getQueuedReceiptScans,
    updateQueuedReceiptScan,
    type QueuedReceiptScan,
} from './receiptOCRService';

/**
 * Browser-side acceleration for private local receiptQueue items.
 * Vercel Hobby cron remains daily recovery-of-last-resort; this path retries
 * queued blobs while a signed-in household is online and the app is open.
 */
const RECOVERY_INTERVAL_MS = 60_000;
const MAX_RETRY_COUNT = 5;
const BACKOFF_MS = {
    afterFirst: 30_000,
    afterSecond: 2 * 60_000,
    afterThird: 5 * 60_000,
    later: 15 * 60_000,
} as const;

export interface RecoverQueuedReceiptsOptions {
    /**
     * When false, skip uploads. Defaults to whether startReceiptRecovery() is active.
     * Device-only mode (no authenticated household) must pass false / leave recovery stopped.
     */
    enabled?: boolean;
    now?: number;
}

let recoveryEnabled = false;
let recoveryPromise: Promise<void> | null = null;
let recoveryInterval: number | null = null;
let listenersInstalled = false;

function isRecoveryEnabled(options?: RecoverQueuedReceiptsOptions): boolean {
    return options?.enabled ?? recoveryEnabled;
}

function backoffMs(retryCount: number): number {
    if (retryCount <= 0) return 0;
    if (retryCount === 1) return BACKOFF_MS.afterFirst;
    if (retryCount === 2) return BACKOFF_MS.afterSecond;
    if (retryCount === 3) return BACKOFF_MS.afterThird;
    return BACKOFF_MS.later;
}

function isInBackoff(queued: QueuedReceiptScan, now: number): boolean {
    const retryCount = queued.retryCount || 0;
    if (retryCount >= MAX_RETRY_COUNT && !queued.lastRetryAt) return true;
    if (!queued.lastRetryAt) return false;
    const lastRetry = Date.parse(queued.lastRetryAt);
    if (!Number.isFinite(lastRetry)) return false;
    return now - lastRetry < backoffMs(retryCount);
}

function isBrowserOnline(): boolean {
    return typeof navigator === 'undefined' || navigator.onLine !== false;
}

async function retryQueuedReceipt(queued: QueuedReceiptScan, cloudConsent: boolean): Promise<void> {
    const claimedAt = new Date().toISOString();
    await updateQueuedReceiptScan(queued.id, {
        retryCount: (queued.retryCount || 0) + 1,
        lastRetryAt: claimedAt,
        lastError: queued.lastError ?? queued.reason,
    });

    const file = new File([queued.imageBlob], queued.name, { type: queued.type });
    try {
        await analyzeReceipt(file, { cloudConsent });
        await clearQueuedReceiptScan(queued.id);
    } catch (error) {
        const message = error instanceof Error
            ? error.message
            : 'Retry failed. The receipt remains in the private queue.';
        await updateQueuedReceiptScan(queued.id, { lastError: message });
    }
}

async function runRecovery(options?: RecoverQueuedReceiptsOptions): Promise<void> {
    if (!isRecoveryEnabled(options) || !isBrowserOnline()) return;

    const cloudConsent = getReceiptPrivacySettings().cloudOcrConsent === true;
    const now = options?.now ?? Date.now();
    const queuedScans = await getQueuedReceiptScans();

    for (const queued of queuedScans) {
        if (!isRecoveryEnabled(options)) return;
        if (!isBrowserOnline()) return;
        if (isInBackoff(queued, now)) continue;
        if (!cloudConsent) continue;

        await retryQueuedReceipt(queued, cloudConsent);
    }
}

export async function recoverQueuedReceipts(options?: RecoverQueuedReceiptsOptions): Promise<void> {
    if (!isRecoveryEnabled(options)) return;
    if (recoveryPromise) return recoveryPromise;
    recoveryPromise = runRecovery(options).finally(() => {
        recoveryPromise = null;
    });
    return recoveryPromise;
}

function handleOnline(): void {
    void recoverQueuedReceipts();
}

function handleVisibilityChange(): void {
    if (document.visibilityState === 'visible') void recoverQueuedReceipts();
}

export function startReceiptRecovery(): void {
    if (typeof window === 'undefined') return;
    recoveryEnabled = true;
    if (!listenersInstalled) {
        window.addEventListener('online', handleOnline);
        document.addEventListener('visibilitychange', handleVisibilityChange);
        listenersInstalled = true;
    }
    if (recoveryInterval === null) {
        recoveryInterval = window.setInterval(() => void recoverQueuedReceipts(), RECOVERY_INTERVAL_MS);
    }
    void recoverQueuedReceipts();
}

export function stopReceiptRecovery(): void {
    recoveryEnabled = false;
    if (typeof window !== 'undefined' && listenersInstalled) {
        window.removeEventListener('online', handleOnline);
        document.removeEventListener('visibilitychange', handleVisibilityChange);
        listenersInstalled = false;
    }
    if (recoveryInterval !== null && typeof window !== 'undefined') {
        window.clearInterval(recoveryInterval);
        recoveryInterval = null;
    }
}
