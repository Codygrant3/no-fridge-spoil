/// <reference types="node" />

import {
    completeReceiptScan,
    PROVIDER,
    PROVIDER_LABEL,
    readReceiptUpload,
    receiptJsonResponse,
    receiptCloudConsentResponse,
    receiptQuotaHeaders,
    reserveProjectReceiptBudget,
    reserveReceiptScan,
} from './receipt-ocr';
import {
    authorizeHouseholdRequest,
    serverRequestErrorResponse,
    type AuthorizedHouseholdRequest,
} from '../server/supabaseServer';
import {
    processNextReceiptJob,
    RECEIPT_UPLOAD_BUCKET,
    type ReceiptJobStatus,
} from '../server/receiptJobs';

interface ReceiptJobRecord {
    id: string;
    status: ReceiptJobStatus;
    result_data: unknown;
    public_error: unknown;
    attempts: number;
    max_attempts: number;
    created_at: string;
    updated_at: string;
    completed_at: string | null;
}

const JOB_SELECT = 'id, status, result_data, public_error, attempts, max_attempts, created_at, updated_at, completed_at';

function isUuid(value: string): boolean {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function safeOriginalName(value: string): string {
    const sanitized = [...value]
        .filter(character => {
            const code = character.charCodeAt(0);
            return code >= 32 && code !== 127;
        })
        .join('')
        .slice(0, 160);
    return sanitized || 'receipt';
}

function requestJobId(request: Request): string | null {
    const id = new URL(request.url).searchParams.get('id')?.trim() ?? '';
    return isUuid(id) ? id : null;
}

function publicJob(record: ReceiptJobRecord): Record<string, unknown> {
    return {
        jobId: record.id,
        status: record.status,
        attempts: record.attempts,
        maxAttempts: record.max_attempts,
        createdAt: record.created_at,
        updatedAt: record.updated_at,
        completedAt: record.completed_at,
        ...(record.status === 'succeeded' ? { result: record.result_data } : {}),
        ...(record.status === 'failed' ? { error: record.public_error } : {}),
        retryAfterMs: record.status === 'queued' || record.status === 'retry' || record.status === 'processing'
            ? 1_500
            : undefined,
    };
}

async function findJob(
    authorization: AuthorizedHouseholdRequest,
    id: string,
): Promise<ReceiptJobRecord | null> {
    const { data, error } = await authorization.admin
        .from('receipt_scan_jobs')
        .select(JOB_SELECT)
        .eq('id', id)
        .eq('household_id', authorization.householdId)
        .eq('user_id', authorization.user.id)
        .maybeSingle();
    if (error) throw error;
    return data as ReceiptJobRecord | null;
}

async function createJob(
    request: Request,
    authorization: AuthorizedHouseholdRequest,
): Promise<Response> {
    const upload = await readReceiptUpload(request);
    if (upload instanceof Response) return upload;

    const requestId = crypto.randomUUID();
    const reservation = await reserveReceiptScan(authorization, request, requestId);
    const responseHeaders = receiptQuotaHeaders(reservation, requestId);
    if (!reservation.allowed) {
        return receiptJsonResponse({
            provider: PROVIDER,
            providerLabel: PROVIDER_LABEL,
            configured: true,
            reachable: 'ok',
            status: 'quota-or-rate-limit',
            reason: reservation.reason,
            message: 'This receipt scan was blocked by the account usage limit. Try again later.',
            userRemaining: reservation.user_remaining,
            householdRemaining: reservation.household_remaining,
        }, 429, { ...responseHeaders, 'Retry-After': '60' });
    }

    const projectBudget = await reserveProjectReceiptBudget(authorization.admin, requestId);
    if (!projectBudget.allowed) {
        await completeReceiptScan(authorization.admin, requestId, {
            status: 'failed',
            httpStatus: 429,
            providerStatus: projectBudget.reason,
        });
        return receiptJsonResponse({
            status: 'quota-or-rate-limit',
            reason: projectBudget.reason,
            message: 'Receipt OCR is paused because the project monthly budget was reached.',
        }, 429, { ...responseHeaders, 'Retry-After': '3600' });
    }

    const storagePath = `${authorization.householdId}/${authorization.user.id}/${requestId}`;
    const { error: storageError } = await authorization.admin.storage
        .from(RECEIPT_UPLOAD_BUCKET)
        .upload(storagePath, new Uint8Array(await upload.arrayBuffer()), {
            contentType: upload.type,
            upsert: false,
        });
    if (storageError) {
        await completeReceiptScan(authorization.admin, requestId, {
            status: 'failed',
            httpStatus: 503,
            providerStatus: 'upload-storage-error',
        });
        throw storageError;
    }

    const now = new Date().toISOString();
    const { error: insertError } = await authorization.admin.from('receipt_scan_jobs').insert({
        id: requestId,
        household_id: authorization.householdId,
        user_id: authorization.user.id,
        status: 'queued',
        storage_path: storagePath,
        content_type: upload.type,
        original_name: safeOriginalName(upload.name),
        next_attempt_at: now,
    });
    if (insertError) {
        await authorization.admin.storage.from(RECEIPT_UPLOAD_BUCKET).remove([storagePath]);
        await completeReceiptScan(authorization.admin, requestId, {
            status: 'failed',
            httpStatus: 503,
            providerStatus: 'queue-storage-error',
        });
        throw insertError;
    }

    return receiptJsonResponse({
        jobId: requestId,
        status: 'queued',
        retryAfterMs: 750,
        quota: {
            userRemaining: reservation.user_remaining,
            householdRemaining: reservation.household_remaining,
        },
    }, 202, responseHeaders);
}

async function getJob(
    request: Request,
    authorization: AuthorizedHouseholdRequest,
): Promise<Response> {
    const id = requestJobId(request);
    if (!id) return receiptJsonResponse({ message: 'Provide a valid receipt job id.' }, 400);
    const record = await findJob(authorization, id);
    if (!record) return receiptJsonResponse({ message: 'Receipt job not found.' }, 404);
    return receiptJsonResponse(publicJob(record), record.status === 'failed' ? 422 : 200);
}

async function processJob(
    request: Request,
    authorization: AuthorizedHouseholdRequest,
): Promise<Response> {
    const id = requestJobId(request);
    if (!id) return receiptJsonResponse({ message: 'Provide a valid receipt job id.' }, 400);
    const existing = await findJob(authorization, id);
    if (!existing) return receiptJsonResponse({ message: 'Receipt job not found.' }, 404);
    if (existing.status === 'succeeded' || existing.status === 'failed' || existing.status === 'canceled') {
        return receiptJsonResponse(publicJob(existing), existing.status === 'failed' ? 422 : 200);
    }

    await processNextReceiptJob(
        authorization.admin,
        `user:${authorization.user.id}:${crypto.randomUUID()}`,
        id,
    );
    const updated = await findJob(authorization, id);
    if (!updated) return receiptJsonResponse({ message: 'Receipt job not found.' }, 404);
    return receiptJsonResponse(publicJob(updated), updated.status === 'failed' ? 422 : 200);
}

export async function handleReceiptJobsRequest(request: Request): Promise<Response> {
    try {
        if (!['GET', 'POST', 'PUT'].includes(request.method)) {
            return receiptJsonResponse({ message: 'Method not allowed.' }, 405, { Allow: 'GET, POST, PUT' });
        }
        const authorization = await authorizeHouseholdRequest(request);
        if (request.method === 'POST') {
            const consentResponse = receiptCloudConsentResponse(request);
            if (consentResponse) return consentResponse;
            return await createJob(request, authorization);
        }
        if (request.method === 'PUT') return await processJob(request, authorization);
        return await getJob(request, authorization);
    } catch (error) {
        const requestError = serverRequestErrorResponse(error);
        if (requestError) return requestError;
        console.error('Receipt job request failed:', error instanceof Error ? error.message : error);
        return receiptJsonResponse({
            status: 'account-service-error',
            message: 'Receipt processing could not be queued. Try again.',
        }, 503);
    }
}

export default {
    fetch: handleReceiptJobsRequest,
};
