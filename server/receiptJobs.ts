/// <reference types="node" />

import type { SupabaseClient } from '@supabase/supabase-js';
import {
    analyzeReceiptUpload,
    AzureRequestError,
    completeReceiptScan,
    receiptProviderErrorResponse,
} from '../api/receipt-ocr';
import { enrichReceiptAnalysis } from './receiptResolution';

export const RECEIPT_UPLOAD_BUCKET = 'receipt-uploads';

export type ReceiptJobStatus =
    | 'queued'
    | 'processing'
    | 'retry'
    | 'succeeded'
    | 'failed'
    | 'canceled';

export interface ReceiptScanJob {
    id: string;
    household_id: string;
    user_id: string;
    status: ReceiptJobStatus;
    storage_path: string;
    content_type: string;
    original_name: string;
    attempts: number;
    max_attempts: number;
}

interface ProviderFailure {
    status: string;
    message: string;
    retryAfterSeconds?: number;
}

async function providerFailure(error: unknown): Promise<{ response: Response; body: ProviderFailure }> {
    const response = receiptProviderErrorResponse(error);
    let body: ProviderFailure = {
        status: 'service-error',
        message: 'Receipt processing could not be completed.',
    };

    try {
        const payload = await response.clone().json() as Partial<ProviderFailure>;
        body = {
            status: typeof payload.status === 'string' ? payload.status : body.status,
            message: typeof payload.message === 'string' ? payload.message : body.message,
            retryAfterSeconds: typeof payload.retryAfterSeconds === 'number'
                ? payload.retryAfterSeconds
                : undefined,
        };
    } catch {
        // Keep the public fallback. Provider payloads should always be JSON.
    }

    return { response, body };
}

function retryDelaySeconds(job: ReceiptScanJob, failure: ProviderFailure): number {
    if (failure.retryAfterSeconds !== undefined) {
        return Math.max(5, Math.min(900, failure.retryAfterSeconds));
    }
    return Math.min(900, 15 * (2 ** Math.max(0, job.attempts - 1)));
}

function isRetryable(error: unknown, status: string): boolean {
    if (error instanceof AzureRequestError) {
        return error.httpStatus === 408 || error.httpStatus === 429 || error.httpStatus >= 500;
    }
    if (error instanceof Error && (error.name === 'AbortError' || error.name === 'TimeoutError')) return true;
    return status === 'network-error' || status === 'quota-or-rate-limit' || status === 'service-error';
}

export async function claimReceiptJob(
    admin: SupabaseClient,
    workerId: string,
    requestedId?: string,
): Promise<ReceiptScanJob | null> {
    const { data, error } = await admin.rpc('claim_receipt_scan_job', {
        worker_id: workerId,
        requested_id: requestedId ?? null,
    });
    if (error) throw error;
    const row = (Array.isArray(data) ? data[0] : data) as ReceiptScanJob | null;
    return row?.id ? row : null;
}

async function finishUsage(
    admin: SupabaseClient,
    job: ReceiptScanJob,
    values: Parameters<typeof completeReceiptScan>[2],
): Promise<void> {
    try {
        await completeReceiptScan(admin, job.id, values);
    } catch (error) {
        console.error('Receipt job usage completion failed:', error instanceof Error ? error.message : error);
    }
}

async function removeUpload(admin: SupabaseClient, path: string): Promise<void> {
    const { error } = await admin.storage.from(RECEIPT_UPLOAD_BUCKET).remove([path]);
    if (error) console.error('Receipt upload cleanup failed:', error.message);
}

export async function processClaimedReceiptJob(
    admin: SupabaseClient,
    job: ReceiptScanJob,
): Promise<ReceiptJobStatus> {
    try {
        const { data: upload, error: downloadError } = await admin.storage
            .from(RECEIPT_UPLOAD_BUCKET)
            .download(job.storage_path);
        if (downloadError || !upload) throw downloadError ?? new Error('Receipt upload was not found.');

        const {
            mapped: providerMapped,
            pageCount,
            costCents,
            provider,
            providerLabel,
        } = await analyzeReceiptUpload(
            new Blob([await upload.arrayBuffer()], { type: job.content_type }),
        );
        const mapped = await enrichReceiptAnalysis(admin, job.household_id, providerMapped);
        const result = {
            provider,
            providerLabel,
            ...mapped,
            estimatedCostCents: costCents,
        };
        const completedAt = new Date().toISOString();
        const { error: updateError } = await admin
            .from('receipt_scan_jobs')
            .update({
                status: 'succeeded',
                result_data: result,
                public_error: null,
                completed_at: completedAt,
                updated_at: completedAt,
                lease_owner: null,
                lease_expires_at: null,
            })
            .eq('id', job.id)
            .eq('status', 'processing');
        if (updateError) throw updateError;

        await finishUsage(admin, job, {
            status: 'succeeded',
            httpStatus: 200,
            storeName: mapped.storeName,
            receiptDate: mapped.date,
            itemCount: mapped.items.length,
            skippedCount: mapped.skippedItems.length,
            costCents,
            pageCount,
        });
        await removeUpload(admin, job.storage_path);
        return 'succeeded';
    } catch (error) {
        const failure = await providerFailure(error);
        const retry = job.attempts < job.max_attempts && isRetryable(error, failure.body.status);
        const nextStatus: ReceiptJobStatus = retry ? 'retry' : 'failed';
        const now = new Date();
        const update = retry
            ? {
                status: nextStatus,
                public_error: failure.body,
                next_attempt_at: new Date(now.getTime() + retryDelaySeconds(job, failure.body) * 1_000).toISOString(),
                updated_at: now.toISOString(),
                lease_owner: null,
                lease_expires_at: null,
            }
            : {
                status: nextStatus,
                public_error: failure.body,
                completed_at: now.toISOString(),
                updated_at: now.toISOString(),
                lease_owner: null,
                lease_expires_at: null,
            };
        const { error: updateError } = await admin
            .from('receipt_scan_jobs')
            .update(update)
            .eq('id', job.id)
            .eq('status', 'processing');
        if (updateError) throw updateError;

        if (!retry) {
            await finishUsage(admin, job, {
                status: 'failed',
                httpStatus: failure.response.status,
                providerStatus: failure.body.status,
            });
            await removeUpload(admin, job.storage_path);
        }
        return nextStatus;
    }
}

export async function processNextReceiptJob(
    admin: SupabaseClient,
    workerId: string,
    requestedId?: string,
): Promise<{ jobId: string; status: ReceiptJobStatus } | null> {
    const job = await claimReceiptJob(admin, workerId, requestedId);
    if (!job) return null;
    return { jobId: job.id, status: await processClaimedReceiptJob(admin, job) };
}
