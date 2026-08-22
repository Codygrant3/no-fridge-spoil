import { z } from 'zod';
import { getCachedResponse, makeReceiptImageCacheKey, setCachedResponse } from './aiCacheService';
import { CloudSessionError, getAuthenticatedRequestHeaders } from './cloudSessionService';
import type {
    ReceiptPackageInfo,
    ReceiptResolutionConfidence,
    ReceiptResolutionMethod,
    ReceiptWeightInfo,
} from './receiptItemResolver';
import { db } from '../db/database';
import { removeLocalValue } from './safeStorage';

export type ReceiptConfidence = 'High' | 'Medium' | 'Low';

export interface ReceiptLineItemFieldConfidence {
    name?: ReceiptConfidence;
    quantity?: ReceiptConfidence;
    price?: ReceiptConfidence;
}

export interface ReceiptItemResolution {
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

export interface ReceiptFieldConfidence {
    storeName?: ReceiptConfidence;
    date?: ReceiptConfidence;
}

export interface ReceiptLineItem {
    name: string;
    originalName?: string;
    brand?: string;
    quantity: number;
    price?: string;
    category: string;
    confidence: ReceiptConfidence;
    fieldConfidence?: ReceiptLineItemFieldConfidence;
    sourceLine?: string;
    sourceRegion?: string;
    resolution?: ReceiptItemResolution;
}

export interface ReceiptAnalysisResult {
    storeName?: string;
    date?: string;
    fieldConfidence?: ReceiptFieldConfidence;
    items: ReceiptLineItem[];
    totalItemsDetected: number;
    skippedItems?: string[];
    cacheHit?: boolean;
    estimatedCostCents?: number;
    resolutionMode?: 'shadow';
    resolutionStats?: {
        proposed: number;
        autoAccepted: number;
        needsReview: number;
        barcodeMatches: number;
    };
}

export type ReceiptJobProgressStatus = 'uploading' | 'queued' | 'processing' | 'retrying' | 'completed';

export interface ReceiptJobProgress {
    status: ReceiptJobProgressStatus;
    jobId?: string;
    attempt?: number;
    maxAttempts?: number;
}

export interface AnalyzeReceiptOptions {
    onProgress?: (progress: ReceiptJobProgress) => void;
    cloudConsent?: boolean;
    /** Resume an already-reserved server job instead of POSTing a new one. */
    resumeJobId?: string;
}

export type ReceiptOcrStatus =
    | 'unchecked'
    | 'ready'
    | 'account-required'
    | 'account-service-error'
    | 'missing-configuration'
    | 'invalid-credentials'
    | 'quota-or-rate-limit'
    | 'network-error'
    | 'malformed-response'
    | 'service-error'
    | 'unknown-error';

export interface ReceiptDiagnostics {
    provider: string;
    providerLabel: string;
    configured: boolean;
    reachable: 'unknown' | 'ok' | 'blocked';
    status: ReceiptOcrStatus;
    message: string;
}

export interface QueuedReceiptScan {
    id: string;
    name: string;
    type: string;
    size: number;
    imageBlob: Blob;
    queuedAt: string;
    expiresAt: string;
    reason: string;
    retryCount: number;
    lastRetryAt?: string;
    lastError?: string;
    jobId?: string;
}

const FALLBACK_PROVIDER = 'receipt-ocr';
const FALLBACK_PROVIDER_LABEL = 'Receipt OCR';
const RECEIPT_OCR_API_URL = import.meta.env.VITE_RECEIPT_OCR_API_URL?.trim() || '/api/receipt-ocr';
const RECEIPT_JOBS_API_URL = import.meta.env.VITE_RECEIPT_JOBS_API_URL?.trim() || '/api/receipt-jobs';
const LEGACY_QUEUED_RECEIPTS_KEY = 'no-fridge-spoil:queued-receipts';
const RECEIPT_QUEUE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const RECEIPT_QUEUE_MAX_ITEMS = 10;
const RECEIPT_QUEUE_MAX_BYTES = 20 * 1024 * 1024;

const receiptOcrStatusSchema = z.enum([
    'unchecked',
    'ready',
    'account-required',
    'account-service-error',
    'missing-configuration',
    'invalid-credentials',
    'quota-or-rate-limit',
    'network-error',
    'malformed-response',
    'service-error',
    'unknown-error',
]);

const receiptConfidenceSchema = z.enum(['High', 'Medium', 'Low']);
const receiptResolutionMethodSchema = z.enum([
    'learned-alias',
    'catalog-alias',
    'barcode-lookup',
    'catalog-match',
    'store-alias',
    'token-expansion',
    'unchanged',
]);
const receiptMeasureUnitSchema = z.enum(['oz', 'lb', 'g', 'kg', 'ml', 'l', 'gallon', 'quart', 'pint']);
const receiptWeightUnitSchema = z.enum(['lb', 'oz', 'g', 'kg']);
const receiptItemResolutionSchema = z.object({
    proposedName: z.string().min(1),
    proposedBrand: z.string().optional(),
    proposedCategory: z.string().min(1),
    confidence: receiptConfidenceSchema,
    method: receiptResolutionMethodSchema,
    shouldReview: z.boolean(),
    autoAccepted: z.boolean(),
    alternatives: z.array(z.string()).default([]),
    unresolvedTokens: z.array(z.string()).default([]),
    evidence: z.array(z.string()).default([]),
    packageInfo: z.object({
        count: z.coerce.number().positive().optional(),
        size: z.coerce.number().positive().optional(),
        unit: receiptMeasureUnitSchema.optional(),
    }).optional(),
    soldByWeight: z.object({
        value: z.coerce.number().positive(),
        unit: receiptWeightUnitSchema,
    }).optional(),
    itemCode: z.string().optional(),
    barcode: z.string().optional(),
    catalogSource: z.string().optional(),
});

const receiptLineItemSchema = z.object({
    name: z.string().min(1),
    originalName: z.string().optional(),
    brand: z.string().optional(),
    quantity: z.coerce.number().min(1).default(1),
    price: z.string().optional(),
    category: z.string().min(1).default('Grocery'),
    confidence: receiptConfidenceSchema.default('Medium'),
    fieldConfidence: z.object({
        name: receiptConfidenceSchema.optional(),
        quantity: receiptConfidenceSchema.optional(),
        price: receiptConfidenceSchema.optional(),
    }).optional(),
    sourceLine: z.string().optional(),
    sourceRegion: z.string().optional(),
    resolution: receiptItemResolutionSchema.optional(),
});

const receiptAnalysisSchema = z.object({
    storeName: z.string().optional(),
    date: z.string().optional(),
    fieldConfidence: z.object({
        storeName: receiptConfidenceSchema.optional(),
        date: receiptConfidenceSchema.optional(),
    }).optional(),
    items: z.array(receiptLineItemSchema).default([]),
    totalItemsDetected: z.coerce.number().optional(),
    skippedItems: z.array(z.string()).default([]),
    estimatedCostCents: z.coerce.number().optional(),
    resolutionMode: z.literal('shadow').optional(),
    resolutionStats: z.object({
        proposed: z.coerce.number().int().min(0),
        autoAccepted: z.coerce.number().int().min(0),
        needsReview: z.coerce.number().int().min(0),
        barcodeMatches: z.coerce.number().int().min(0),
    }).optional(),
});

const receiptDiagnosticsSchema = z.object({
    provider: z.string().min(1).default(FALLBACK_PROVIDER),
    providerLabel: z.string().min(1).default(FALLBACK_PROVIDER_LABEL),
    configured: z.boolean(),
    reachable: z.enum(['unknown', 'ok', 'blocked']),
    status: receiptOcrStatusSchema,
    message: z.string().min(1),
});

const receiptJobSchema = z.object({
    jobId: z.string().uuid(),
    status: z.enum(['queued', 'processing', 'retry', 'succeeded', 'failed', 'canceled']),
    result: z.unknown().optional(),
    error: z.object({
        status: z.string().optional(),
        message: z.string().optional(),
    }).passthrough().optional(),
    attempts: z.coerce.number().optional(),
    maxAttempts: z.coerce.number().optional(),
    retryAfterMs: z.coerce.number().optional(),
});

class ReceiptOcrServiceError extends Error {
    readonly diagnostics: ReceiptDiagnostics;

    constructor(diagnostics: ReceiptDiagnostics) {
        super(diagnostics.message);
        this.name = 'ReceiptOcrServiceError';
        this.diagnostics = diagnostics;
    }
}

function fallbackProviderIdentity(): Pick<ReceiptDiagnostics, 'provider' | 'providerLabel'> {
    return {
        provider: FALLBACK_PROVIDER,
        providerLabel: FALLBACK_PROVIDER_LABEL,
    };
}

function providerIdentityFromPayload(payload: unknown): Pick<ReceiptDiagnostics, 'provider' | 'providerLabel'> {
    if (!payload || typeof payload !== 'object') return fallbackProviderIdentity();
    const record = payload as Record<string, unknown>;
    const provider = typeof record.provider === 'string' && record.provider.trim()
        ? record.provider.trim()
        : FALLBACK_PROVIDER;
    const providerLabel = typeof record.providerLabel === 'string' && record.providerLabel.trim()
        ? record.providerLabel.trim()
        : FALLBACK_PROVIDER_LABEL;
    return { provider, providerLabel };
}

export function getReceiptOcrDiagnostics(): ReceiptDiagnostics {
    return {
        ...fallbackProviderIdentity(),
        configured: false,
        reachable: 'unknown',
        status: 'unchecked',
        message: 'Receipt OCR runs through the secure app service. Check health to verify setup.',
    };
}

async function fetchWithTimeout(input: RequestInfo | URL, init: RequestInit, timeoutMs: number): Promise<Response> {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), timeoutMs);

    try {
        return await fetch(input, { ...init, signal: controller.signal });
    } finally {
        window.clearTimeout(timeout);
    }
}

async function readJsonResponse(response: Response): Promise<unknown> {
    const contentType = response.headers.get('content-type') || '';
    if (!contentType.toLowerCase().includes('application/json')) {
        throw new ReceiptOcrServiceError({
            ...fallbackProviderIdentity(),
            configured: false,
            reachable: 'blocked',
            status: 'service-error',
            message: 'The secure receipt OCR endpoint is unavailable on this server.',
        });
    }

    try {
        return await response.json();
    } catch {
        throw new ReceiptOcrServiceError({
            ...fallbackProviderIdentity(),
            configured: true,
            reachable: 'ok',
            status: 'malformed-response',
            message: 'The receipt OCR service returned an unreadable response.',
        });
    }
}

function diagnosticsFromResponse(payload: unknown, response: Response): ReceiptDiagnostics {
    const parsed = receiptDiagnosticsSchema.safeParse(payload);
    if (parsed.success) return parsed.data;

    const identity = providerIdentityFromPayload(payload);
    const responseMessage = payload && typeof payload === 'object' && 'message' in payload
        && typeof (payload as { message?: unknown }).message === 'string'
        ? (payload as { message: string }).message
        : null;

    if (response.status === 401 || response.status === 403) {
        return {
            ...identity,
            configured: true,
            reachable: 'blocked',
            status: 'account-required',
            message: responseMessage || 'Sign in to use receipt intelligence.',
        };
    }

    const status: ReceiptOcrStatus = response.status === 429
        ? 'quota-or-rate-limit'
        : response.status >= 500
            && payload && typeof payload === 'object'
            && 'status' in payload
            && String((payload as { status?: unknown }).status).includes('account')
            ? 'account-service-error'
            : response.status >= 500
                ? 'service-error'
                : 'unknown-error';

    return {
        ...identity,
        configured: true,
        reachable: 'blocked',
        status,
        message: responseMessage || 'The receipt OCR service could not complete this request.',
    };
}

export async function checkReceiptOcrHealth(): Promise<ReceiptDiagnostics> {
    try {
        const accountHeaders = await getAuthenticatedRequestHeaders();
        const response = await fetchWithTimeout(RECEIPT_OCR_API_URL, {
            method: 'GET',
            headers: { Accept: 'application/json', ...accountHeaders },
            cache: 'no-store',
        }, 15_000);
        const payload = await readJsonResponse(response);
        return diagnosticsFromResponse(payload, response);
    } catch (error) {
        return classifyReceiptOcrError(error);
    }
}

export function classifyReceiptOcrError(error: unknown): ReceiptDiagnostics {
    if (error instanceof ReceiptOcrServiceError) return error.diagnostics;

    if (error instanceof CloudSessionError) {
        return {
            ...fallbackProviderIdentity(),
            configured: error.code !== 'not-configured',
            reachable: 'blocked',
            status: error.code === 'not-configured' ? 'account-service-error' : 'account-required',
            message: error.message,
        };
    }

    const message = error instanceof Error ? error.message : String(error);
    const lower = message.toLowerCase();

    if (lower.includes('not configured') || lower.includes('missing configuration')) {
        return {
            ...fallbackProviderIdentity(),
            configured: false,
            reachable: 'blocked',
            status: 'missing-configuration',
            message: 'Receipt OCR is not configured on the app server.',
        };
    }

    if (lower.includes('credential') || lower.includes('401') || lower.includes('403')) {
        return {
            ...fallbackProviderIdentity(),
            configured: false,
            reachable: 'blocked',
            status: 'invalid-credentials',
            message: 'Receipt OCR rejected the configured credentials.',
        };
    }

    if (lower.includes('quota') || lower.includes('rate') || lower.includes('429')) {
        return {
            ...fallbackProviderIdentity(),
            configured: true,
            reachable: 'blocked',
            status: 'quota-or-rate-limit',
            message: 'Receipt OCR is reachable, but quota or rate limits blocked this receipt scan.',
        };
    }

    if (lower.includes('json') || lower.includes('parse') || lower.includes('malformed') || lower.includes('validation')) {
        return {
            ...fallbackProviderIdentity(),
            configured: true,
            reachable: 'ok',
            status: 'malformed-response',
            message: 'The receipt OCR response could not be validated.',
        };
    }

    if (
        lower.includes('network')
        || lower.includes('fetch')
        || lower.includes('offline')
        || lower.includes('abort')
        || lower.includes('timeout')
    ) {
        return {
            ...fallbackProviderIdentity(),
            configured: true,
            reachable: 'blocked',
            status: 'network-error',
            message: 'The receipt OCR service could not be reached from this session.',
        };
    }

    if (lower.includes('unavailable') || lower.includes('service')) {
        return {
            ...fallbackProviderIdentity(),
            configured: false,
            reachable: 'blocked',
            status: 'service-error',
            message: message || 'The receipt OCR service is unavailable.',
        };
    }

    return {
        ...fallbackProviderIdentity(),
        configured: false,
        reachable: 'unknown',
        status: 'unknown-error',
        message: message || 'Receipt OCR failed for an unknown reason.',
    };
}

export async function queueReceiptScan(file: File, reason: string): Promise<QueuedReceiptScan> {
    if (file.size > RECEIPT_QUEUE_MAX_BYTES) {
        throw new Error('Receipt image is too large for the private retry queue.');
    }
    const now = Date.now();
    const entry: QueuedReceiptScan = {
        id: `${now}-${Math.random().toString(36).slice(2)}`,
        name: file.name,
        type: file.type,
        size: file.size,
        imageBlob: file,
        queuedAt: new Date(now).toISOString(),
        expiresAt: new Date(now + RECEIPT_QUEUE_TTL_MS).toISOString(),
        reason,
        retryCount: 0,
        lastError: reason,
    };

    await db.transaction('rw', db.receiptQueue, async () => {
        await db.receiptQueue.put(entry);
        const all = await db.receiptQueue.orderBy('queuedAt').reverse().toArray();
        let totalBytes = 0;
        const retainedIds = new Set<string>();
        for (const queued of all) {
            if (retainedIds.size >= RECEIPT_QUEUE_MAX_ITEMS) continue;
            if (totalBytes + queued.size > RECEIPT_QUEUE_MAX_BYTES) continue;
            retainedIds.add(queued.id);
            totalBytes += queued.size;
        }
        const expiredIds = all.filter(queued => !retainedIds.has(queued.id)).map(queued => queued.id);
        if (expiredIds.length > 0) await db.receiptQueue.bulkDelete(expiredIds);
    });
    return entry;
}

export async function getQueuedReceiptScans(): Promise<QueuedReceiptScan[]> {
    removeLocalValue(LEGACY_QUEUED_RECEIPTS_KEY);
    await db.receiptQueue.where('expiresAt').belowOrEqual(new Date().toISOString()).delete();
    return db.receiptQueue.orderBy('queuedAt').reverse().toArray();
}

export async function clearQueuedReceiptScan(id: string): Promise<void> {
    await db.receiptQueue.delete(id);
}

export async function updateQueuedReceiptScan(id: string, updates: Partial<QueuedReceiptScan>): Promise<void> {
    await db.receiptQueue.update(id, updates);
}

function mapReceiptAnalysis(payload: unknown): ReceiptAnalysisResult {
    const data = receiptAnalysisSchema.parse(payload);
    return {
        storeName: data.storeName,
        date: data.date,
        ...(data.fieldConfidence ? { fieldConfidence: data.fieldConfidence } : {}),
        items: data.items,
        totalItemsDetected: data.totalItemsDetected ?? data.items.length,
        skippedItems: data.skippedItems,
        cacheHit: false,
        estimatedCostCents: data.estimatedCostCents ?? 0,
        ...(data.resolutionMode ? { resolutionMode: data.resolutionMode } : {}),
        ...(data.resolutionStats ? { resolutionStats: data.resolutionStats } : {}),
    };
}

function jobFailureDiagnostics(error: { status?: string; message?: string } | undefined): ReceiptDiagnostics {
    const status = error?.status;
    const knownStatus = receiptOcrStatusSchema.safeParse(status);
    return {
        ...providerIdentityFromPayload(error),
        configured: status !== 'missing-configuration' && status !== 'invalid-credentials',
        reachable: status === 'malformed-response' ? 'ok' : 'blocked',
        status: knownStatus.success ? knownStatus.data : 'service-error',
        message: error?.message || 'Receipt processing could not be completed.',
    };
}

function jobProgressStatus(status: z.infer<typeof receiptJobSchema>['status']): ReceiptJobProgressStatus {
    if (status === 'retry') return 'retrying';
    if (status === 'succeeded') return 'completed';
    return status === 'queued' ? 'queued' : 'processing';
}

async function processReceiptJob(
    jobId: string,
    accountHeaders: Record<string, string>,
    options: AnalyzeReceiptOptions,
): Promise<ReceiptAnalysisResult> {
    const deadline = Date.now() + 180_000;
    let nextMethod: 'GET' | 'PUT' = 'PUT';

    while (Date.now() < deadline) {
        let response: Response;
        try {
            response = await fetchWithTimeout(`${RECEIPT_JOBS_API_URL}?id=${encodeURIComponent(jobId)}`, {
                method: nextMethod,
                headers: { Accept: 'application/json', ...accountHeaders },
                cache: 'no-store',
            }, nextMethod === 'PUT' ? 65_000 : 15_000);
        } catch {
            nextMethod = 'GET';
            await new Promise(resolve => window.setTimeout(resolve, 1_500));
            continue;
        }

        const payload = await readJsonResponse(response);
        const parsed = receiptJobSchema.safeParse(payload);
        if (!parsed.success) {
            if (!response.ok) throw new ReceiptOcrServiceError(diagnosticsFromResponse(payload, response));
            throw new ReceiptOcrServiceError({
                ...providerIdentityFromPayload(payload),
                configured: true,
                reachable: 'ok',
                status: 'malformed-response',
                message: 'The receipt job returned an unreadable status.',
            });
        }

        const job = parsed.data;
        options.onProgress?.({
            status: jobProgressStatus(job.status),
            jobId,
            attempt: job.attempts,
            maxAttempts: job.maxAttempts,
        });
        if (job.status === 'succeeded') return mapReceiptAnalysis(job.result);
        if (job.status === 'failed' || job.status === 'canceled') {
            throw new ReceiptOcrServiceError(jobFailureDiagnostics(job.error));
        }

        await new Promise(resolve => window.setTimeout(
            resolve,
            Math.max(500, Math.min(5_000, job.retryAfterMs ?? 1_500)),
        ));
        nextMethod = job.status === 'retry' ? 'PUT' : 'GET';
    }

    throw new ReceiptOcrServiceError({
        ...fallbackProviderIdentity(),
        configured: true,
        reachable: 'blocked',
        status: 'network-error',
        message: 'Receipt processing is taking longer than expected. It remains safely queued for retry.',
    });
}

async function analyzeReceiptSynchronously(
    imageFile: File,
    accountHeaders: Record<string, string>,
    cloudConsent: boolean,
): Promise<ReceiptAnalysisResult> {
    const formData = new FormData();
    formData.append('receipt', imageFile, imageFile.name);
    const response = await fetchWithTimeout(RECEIPT_OCR_API_URL, {
        method: 'POST',
        headers: {
            Accept: 'application/json',
            'X-Receipt-Cloud-Consent': String(cloudConsent),
            ...accountHeaders,
        },
        body: formData,
        cache: 'no-store',
    }, 55_000);
    const payload = await readJsonResponse(response);
    if (!response.ok) throw new ReceiptOcrServiceError(diagnosticsFromResponse(payload, response));
    return mapReceiptAnalysis(payload);
}

export async function analyzeReceipt(
    imageFile: File,
    options: AnalyzeReceiptOptions = {},
): Promise<ReceiptAnalysisResult> {
    try {
        const cacheKey = await makeReceiptImageCacheKey(imageFile);
        const cached = await getCachedResponse<ReceiptAnalysisResult>(cacheKey, 'receipt');
        if (cached) return { ...cached, cacheHit: true };

        const accountHeaders = await getAuthenticatedRequestHeaders();
        const cloudConsent = options.cloudConsent === true;
        const resumeJobId = z.string().uuid().safeParse(options.resumeJobId);
        if (resumeJobId.success) {
            options.onProgress?.({ status: 'queued', jobId: resumeJobId.data });
            const resumed = await processReceiptJob(resumeJobId.data, accountHeaders, options);
            await setCachedResponse(cacheKey, 'receipt', resumed);
            return resumed;
        }

        const formData = new FormData();
        formData.append('receipt', imageFile, imageFile.name);
        options.onProgress?.({ status: 'uploading' });
        const response = await fetchWithTimeout(RECEIPT_JOBS_API_URL, {
            method: 'POST',
            headers: {
                Accept: 'application/json',
                'X-Receipt-Cloud-Consent': String(cloudConsent),
                ...accountHeaders,
            },
            body: formData,
            cache: 'no-store',
        }, 30_000);

        const contentType = response.headers.get('content-type')?.toLowerCase() ?? '';
        if ((response.status === 404 || response.status === 405 || !contentType.includes('application/json'))) {
            const result = await analyzeReceiptSynchronously(imageFile, accountHeaders, cloudConsent);
            await setCachedResponse(cacheKey, 'receipt', result);
            return result;
        }
        const payload = await readJsonResponse(response);
        if (!response.ok) throw new ReceiptOcrServiceError(diagnosticsFromResponse(payload, response));
        const job = receiptJobSchema.parse(payload);
        options.onProgress?.({ status: 'queued', jobId: job.jobId });
        const result = await processReceiptJob(job.jobId, accountHeaders, options);

        await setCachedResponse(cacheKey, 'receipt', result);
        return result;
    } catch (error) {
        console.error('Receipt OCR failed:', error);
        if (error instanceof ReceiptOcrServiceError) throw error;
        throw new ReceiptOcrServiceError(classifyReceiptOcrError(error));
    }
}
