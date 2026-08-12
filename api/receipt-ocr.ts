/// <reference types="node" />

import { mapAzureReceiptResult } from '../src/services/azureReceiptMapper';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
    authorizeHouseholdRequest,
    hashRequestIp,
    ServerRequestError,
    serverRequestErrorResponse,
    type AuthorizedHouseholdRequest,
} from '../server/supabaseServer';
import { enrichReceiptAnalysis } from '../server/receiptResolution';
import { mapMistralReceiptResult } from '../src/services/mistralReceiptMapper';

const CONFIGURED_PROVIDER = process.env.RECEIPT_OCR_PROVIDER?.trim().toLowerCase() === 'mistral'
    ? 'mistral'
    : 'azure';
const PROVIDER = CONFIGURED_PROVIDER === 'mistral' ? 'mistral-ocr' : 'azure-document-intelligence';
const PROVIDER_LABEL = CONFIGURED_PROVIDER === 'mistral' ? 'Mistral OCR' : 'Azure Document Intelligence';
const API_VERSION = '2024-11-30';
const MAX_RECEIPT_BYTES = 4 * 1024 * 1024;
const POLL_TIMEOUT_MS = 45_000;
const SUPPORTED_CONTENT_TYPES = new Set([
    'application/pdf',
    'image/bmp',
    'image/heif',
    'image/jpeg',
    'image/png',
    'image/tiff',
]);

type ReceiptOcrStatus =
    | 'ready'
    | 'missing-configuration'
    | 'invalid-credentials'
    | 'quota-or-rate-limit'
    | 'network-error'
    | 'malformed-response'
    | 'service-error';

export interface AzureConfig {
    endpoint: string;
    key: string;
    modelId: string;
    usingCustomModel: boolean;
}

export interface MistralConfig {
    provider: 'mistral';
    key: string;
    modelId: string;
}

type ReceiptProviderConfig = AzureConfig | MistralConfig;

interface AzureOperationResponse {
    status?: string;
    error?: {
        code?: string;
        message?: string;
    };
}

export interface ReceiptReservation {
    allowed: boolean;
    reason: string;
    scan_id: string | null;
    user_remaining: number;
    household_remaining: number;
}

export interface ProjectBudgetReservation {
    allowed: boolean;
    reason: string;
    pages_used: number;
    cost_cents_used: number;
}

export class AzureRequestError extends Error {
    readonly httpStatus: number;
    readonly providerCode?: string;
    readonly retryAfterSeconds?: number;

    constructor(
        message: string,
        httpStatus: number,
        providerCode?: string,
        retryAfterSeconds?: number,
    ) {
        super(message);
        this.name = 'AzureRequestError';
        this.httpStatus = httpStatus;
        this.providerCode = providerCode;
        this.retryAfterSeconds = retryAfterSeconds;
    }
}

export function receiptJsonResponse(body: unknown, status = 200, extraHeaders: HeadersInit = {}): Response {
    return Response.json(body, {
        status,
        headers: {
            'Cache-Control': 'no-store',
            'X-OCR-Provider': PROVIDER,
            ...Object.fromEntries(new Headers(extraHeaders)),
        },
    });
}

export function getAzureConfig(): AzureConfig | null {
    const endpoint = process.env.AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT?.trim().replace(/\/+$/, '');
    const key = process.env.AZURE_DOCUMENT_INTELLIGENCE_KEY?.trim();
    if (!endpoint || !key || endpoint === 'undefined' || key === 'undefined') return null;

    try {
        const endpointUrl = new URL(endpoint);
        if (endpointUrl.protocol !== 'https:') return null;
    } catch {
        return null;
    }

    const requestedModelId = process.env.AZURE_DOCUMENT_INTELLIGENCE_MODEL_ID?.trim();
    const customModelApproved = process.env.AZURE_CUSTOM_RECEIPT_MODEL_APPROVED?.trim().toLowerCase() === 'true';
    const validModelId = requestedModelId && /^[a-zA-Z0-9][a-zA-Z0-9._~-]{1,63}$/.test(requestedModelId)
        ? requestedModelId
        : 'prebuilt-receipt';
    const usingCustomModel = validModelId !== 'prebuilt-receipt' && customModelApproved;

    return {
        endpoint,
        key,
        modelId: usingCustomModel ? validModelId : 'prebuilt-receipt',
        usingCustomModel,
    };
}

export function getMistralConfig(): MistralConfig | null {
    const key = process.env.MISTRAL_API_KEY?.trim();
    if (!key || key === 'undefined') return null;
    const requestedModel = process.env.MISTRAL_OCR_MODEL?.trim();
    const modelId = requestedModel && /^[a-zA-Z0-9][a-zA-Z0-9._~-]{1,80}$/.test(requestedModel)
        ? requestedModel
        : 'mistral-ocr-latest';
    return { provider: 'mistral', key, modelId };
}

function isMistralConfig(config: ReceiptProviderConfig): config is MistralConfig {
    return 'provider' in config && config.provider === 'mistral';
}

function providerConfig(name: 'azure' | 'mistral'): ReceiptProviderConfig | null {
    return name === 'mistral' ? getMistralConfig() : getAzureConfig();
}

function configuredProviderChain(): ReceiptProviderConfig[] {
    const primary = providerConfig(CONFIGURED_PROVIDER);
    const fallbackName = process.env.RECEIPT_OCR_FALLBACK_PROVIDER?.trim().toLowerCase() === 'azure'
        ? 'azure'
        : 'mistral';
    const fallbackEnabled = process.env.RECEIPT_OCR_CLOUD_FALLBACK_ENABLED?.trim().toLowerCase() === 'true';
    const fallback = fallbackEnabled && fallbackName !== CONFIGURED_PROVIDER
        ? providerConfig(fallbackName)
        : null;
    return [primary, fallback].filter((config): config is ReceiptProviderConfig => config !== null);
}

function azureHeaders(config: AzureConfig, contentType?: string): HeadersInit {
    return {
        'Ocp-Apim-Subscription-Key': config.key,
        ...(contentType ? { 'Content-Type': contentType } : {}),
    };
}

function retryAfterSeconds(response: Response): number | undefined {
    const value = Number(response.headers.get('retry-after'));
    return Number.isFinite(value) && value >= 0 ? value : undefined;
}

async function readAzureError(response: Response): Promise<AzureRequestError> {
    let code: string | undefined;
    let message = `Azure receipt OCR returned HTTP ${response.status}.`;

    try {
        const body = await response.json() as {
            error?: { code?: string; message?: string };
        };
        code = body.error?.code;
        if (body.error?.message) message = body.error.message;
    } catch {
        // Azure occasionally returns an empty body for gateway failures.
    }

    return new AzureRequestError(message, response.status, code, retryAfterSeconds(response));
}

function statusForAzureError(error: AzureRequestError): ReceiptOcrStatus {
    if (error.httpStatus === 401 || error.httpStatus === 403) return 'invalid-credentials';
    if (error.httpStatus === 429) return 'quota-or-rate-limit';
    if (error.httpStatus === 408 || error.httpStatus === 504) return 'network-error';
    if (error.providerCode?.toLowerCase().includes('invalidcontent')) return 'malformed-response';
    return 'service-error';
}

function publicMessageForAzureError(error: AzureRequestError): string {
    const status = statusForAzureError(error);
    if (status === 'invalid-credentials') {
        return `${PROVIDER_LABEL} rejected the configured credentials.`;
    }
    if (status === 'quota-or-rate-limit') {
        return `${PROVIDER_LABEL} is reachable, but quota or rate limits blocked this receipt scan.`;
    }
    if (status === 'network-error') {
        return `${PROVIDER_LABEL} timed out. Try the scan again.`;
    }
    if (status === 'malformed-response') {
        return `${PROVIDER_LABEL} could not read this receipt image. Retake it with the full receipt in focus.`;
    }
    return `${PROVIDER_LABEL} is temporarily unavailable.`;
}

export function receiptProviderErrorResponse(error: unknown): Response {
    if (error instanceof AzureRequestError) {
        const status = statusForAzureError(error);
        const responseStatus = status === 'invalid-credentials'
            ? 502
            : status === 'quota-or-rate-limit'
                ? 429
                : status === 'malformed-response'
                    ? 422
                    : 502;

        return receiptJsonResponse({
            provider: PROVIDER,
            providerLabel: PROVIDER_LABEL,
            configured: status !== 'invalid-credentials',
            reachable: status === 'malformed-response' ? 'ok' : 'blocked',
            status,
            message: publicMessageForAzureError(error),
            retryAfterSeconds: error.retryAfterSeconds,
        }, responseStatus, error.retryAfterSeconds === undefined
            ? {}
            : { 'Retry-After': String(error.retryAfterSeconds) });
    }

    const isTimeout = error instanceof Error && (error.name === 'AbortError' || error.name === 'TimeoutError');
    return receiptJsonResponse({
        provider: PROVIDER,
        providerLabel: PROVIDER_LABEL,
        configured: true,
        reachable: 'blocked',
        status: isTimeout ? 'network-error' : 'service-error',
        message: isTimeout
            ? 'Azure receipt OCR timed out. Try the scan again.'
            : 'The receipt OCR service could not complete this request.',
    }, isTimeout ? 504 : 502);
}

export function receiptQuotaHeaders(reservation: ReceiptReservation, requestId: string): HeadersInit {
    return {
        'X-Request-Id': requestId,
        'X-RateLimit-Remaining-User': String(Math.max(0, reservation.user_remaining)),
        'X-RateLimit-Remaining-Household': String(Math.max(0, reservation.household_remaining)),
    };
}

function missingConfigurationResponse(): Response {
    return receiptJsonResponse({
        provider: PROVIDER,
        providerLabel: PROVIDER_LABEL,
        configured: false,
        reachable: 'blocked',
        status: 'missing-configuration',
        message: 'Azure receipt OCR is not configured on the app server.',
    }, 503);
}

export function receiptCloudConsentResponse(request: Request): Response | null {
    const required = process.env.RECEIPT_OCR_REQUIRE_USER_CONSENT?.trim().toLowerCase() !== 'false';
    if (!required || request.headers.get('x-receipt-cloud-consent')?.toLowerCase() === 'true') return null;
    return receiptJsonResponse({
        provider: PROVIDER,
        providerLabel: PROVIDER_LABEL,
        configured: true,
        reachable: 'ok',
        status: 'consent-required',
        message: 'Enable cloud receipt processing before sending this receipt.',
    }, 412);
}

async function checkHealth(config: AzureConfig): Promise<Response> {
    const response = await fetch(
        `${config.endpoint}/documentintelligence/info?api-version=${API_VERSION}`,
        {
            method: 'GET',
            headers: azureHeaders(config),
            signal: AbortSignal.timeout(10_000),
        },
    );

    if (!response.ok) throw await readAzureError(response);

    return receiptJsonResponse({
        provider: PROVIDER,
        providerLabel: PROVIDER_LABEL,
        configured: true,
        reachable: 'ok',
        status: 'ready',
        message: 'Azure Document Intelligence is configured and reachable.',
    });
}

async function checkMistralHealth(config: MistralConfig): Promise<Response> {
    const response = await fetch(`https://api.mistral.ai/v1/models/${encodeURIComponent(config.modelId)}`, {
        method: 'GET',
        headers: { Authorization: `Bearer ${config.key}` },
        signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) throw await readAzureError(response);
    return receiptJsonResponse({
        provider: 'mistral-ocr',
        providerLabel: 'Mistral OCR',
        configured: true,
        reachable: 'ok',
        status: 'ready',
        message: 'Mistral OCR is configured and reachable.',
    });
}

function wait(milliseconds: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, milliseconds));
}

async function pollAnalyzeResult(
    operationLocation: string,
    config: AzureConfig,
    initialRetryAfterSeconds?: number,
): Promise<unknown> {
    const operationUrl = new URL(operationLocation);
    const configuredUrl = new URL(config.endpoint);
    if (operationUrl.protocol !== 'https:' || operationUrl.origin !== configuredUrl.origin) {
        throw new AzureRequestError('Azure returned an invalid operation location.', 502, 'MalformedResponse');
    }

    const deadline = Date.now() + POLL_TIMEOUT_MS;
    let delayMs = Math.max(500, (initialRetryAfterSeconds ?? 1) * 1_000);

    while (Date.now() < deadline) {
        await wait(delayMs);

        const response = await fetch(operationLocation, {
            method: 'GET',
            headers: azureHeaders(config),
            signal: AbortSignal.timeout(10_000),
        });

        if (response.status === 429 || response.status >= 500) {
            delayMs = Math.min(4_000, (retryAfterSeconds(response) ?? delayMs / 1_000 + 1) * 1_000);
            continue;
        }

        if (!response.ok) throw await readAzureError(response);

        const result = await response.json() as AzureOperationResponse;
        const status = result.status?.toLowerCase();
        if (status === 'succeeded') return result;
        if (status === 'failed' || status === 'canceled') {
            throw new AzureRequestError(
                result.error?.message || 'Azure could not analyze this receipt.',
                422,
                result.error?.code,
            );
        }

        delayMs = Math.min(2_500, delayMs + 500);
    }

    throw new AzureRequestError('Azure receipt analysis timed out.', 504);
}

export async function readReceiptUpload(request: Request): Promise<File | Response> {
    let formData: FormData;
    try {
        formData = await request.formData();
    } catch {
        return receiptJsonResponse({
            provider: PROVIDER,
            status: 'service-error',
            message: 'Upload the receipt as multipart form data.',
        }, 400);
    }

    const receipt = formData.get('receipt');

    if (!receipt || typeof receipt === 'string') {
        return receiptJsonResponse({
            provider: PROVIDER,
            status: 'service-error',
            message: 'Attach a receipt image in the receipt form field.',
        }, 400);
    }

    if (receipt.size === 0) {
        return receiptJsonResponse({
            provider: PROVIDER,
            status: 'service-error',
            message: 'The uploaded receipt image is empty.',
        }, 400);
    }

    if (receipt.size > MAX_RECEIPT_BYTES) {
        return receiptJsonResponse({
            provider: PROVIDER,
            status: 'service-error',
            message: 'The receipt image is too large. Keep it under 4 MB.',
        }, 413);
    }

    if (!SUPPORTED_CONTENT_TYPES.has(receipt.type)) {
        return receiptJsonResponse({
            provider: PROVIDER,
            status: 'service-error',
            message: 'Use a JPEG, PNG, BMP, TIFF, HEIF, or PDF receipt.',
        }, 415);
    }

    return receipt;
}

export function countAnalyzedPages(value: unknown): number {
    if (!value || typeof value !== 'object') return 1;
    const analyzeResult = (value as { analyzeResult?: unknown }).analyzeResult;
    if (!analyzeResult || typeof analyzeResult !== 'object') return 1;
    const pages = (analyzeResult as { pages?: unknown }).pages;
    return Array.isArray(pages) && pages.length > 0 ? pages.length : 1;
}

export function estimatedProviderCostCents(pageCount: number): number {
    const dollarsPerPage = Number(process.env.AZURE_DOCUMENT_INTELLIGENCE_COST_PER_PAGE_USD ?? '0');
    if (!Number.isFinite(dollarsPerPage) || dollarsPerPage < 0) return 0;
    return Math.round(dollarsPerPage * 100 * pageCount * 10_000) / 10_000;
}

export async function reserveReceiptScan(
    authorization: AuthorizedHouseholdRequest,
    request: Request,
    requestId: string,
): Promise<ReceiptReservation> {
    const { data, error } = await authorization.admin.rpc('reserve_receipt_scan', {
        request_id: requestId,
        request_user_id: authorization.user.id,
        request_household_id: authorization.householdId,
        request_ip_hash: hashRequestIp(request),
    });

    if (error) {
        console.error('Receipt quota reservation failed:', error.message);
        throw new ServerRequestError(503, 'account-service-error', 'Receipt usage could not be reserved.');
    }

    const row = (Array.isArray(data) ? data[0] : data) as ReceiptReservation | null;
    if (!row || typeof row.allowed !== 'boolean') {
        throw new ServerRequestError(503, 'account-service-error', 'Receipt usage could not be reserved.');
    }
    return row;
}

function positiveBudget(value: string | undefined, fallback: number): number {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export async function reserveProjectReceiptBudget(
    admin: SupabaseClient,
    requestId: string,
): Promise<ProjectBudgetReservation> {
    const pageBudget = positiveBudget(process.env.RECEIPT_OCR_MONTHLY_PAGE_BUDGET, 10_000);
    const usdBudget = positiveBudget(process.env.RECEIPT_OCR_MONTHLY_USD_BUDGET, 100);
    const reservedCostCents = positiveBudget(
        process.env.AZURE_DOCUMENT_INTELLIGENCE_COST_PER_PAGE_USD,
        0.01,
    ) * 100;
    const { data, error } = await admin.rpc('check_receipt_project_budget', {
        request_id: requestId,
        provider_name: PROVIDER,
        monthly_page_budget: pageBudget,
        monthly_cost_budget_cents: usdBudget * 100,
        reserved_cost_cents: reservedCostCents,
    });
    if (error) {
        console.error('Receipt project budget reservation failed:', error.message);
        throw new ServerRequestError(503, 'account-service-error', 'Receipt project budget could not be checked.');
    }
    const row = (Array.isArray(data) ? data[0] : data) as ProjectBudgetReservation | null;
    if (!row || typeof row.allowed !== 'boolean') {
        throw new ServerRequestError(503, 'account-service-error', 'Receipt project budget could not be checked.');
    }
    return row;
}

export async function completeReceiptScan(
    admin: SupabaseClient,
    requestId: string,
    values: {
        status: 'succeeded' | 'failed';
        httpStatus: number;
        storeName?: string;
        receiptDate?: string;
        itemCount?: number;
        skippedCount?: number;
        costCents?: number;
        pageCount?: number;
        providerStatus?: string;
    },
): Promise<void> {
    const { error } = await admin.rpc('complete_receipt_scan', {
        request_id: requestId,
        completion_status: values.status,
        completion_http_status: values.httpStatus,
        completion_store_name: values.storeName ?? null,
        completion_receipt_date: values.receiptDate ?? null,
        completion_item_count: values.itemCount ?? 0,
        completion_skipped_count: values.skippedCount ?? 0,
        completion_units: values.pageCount ?? 1,
        completion_cost_cents: values.costCents ?? 0,
        completion_source: 'upload',
        completion_cache_hit: false,
        completion_metadata: {
            pages: values.pageCount ?? 0,
            provider_status: values.providerStatus ?? values.status,
        },
    });

    if (error) {
        console.error('Receipt usage completion failed:', error.message);
        throw new ServerRequestError(503, 'account-service-error', 'Receipt usage could not be recorded.');
    }
}

export interface ReceiptProviderAnalysis {
    mapped: ReturnType<typeof mapAzureReceiptResult>;
    pageCount: number;
    costCents: number;
    provider: string;
    providerLabel: string;
}

async function analyzeAzureReceiptUpload(
    upload: Blob,
    config: AzureConfig,
): Promise<ReceiptProviderAnalysis> {
    const response = await fetch(
        `${config.endpoint}/documentintelligence/documentModels/${encodeURIComponent(config.modelId)}:analyze?api-version=${API_VERSION}`,
        {
            method: 'POST',
            headers: azureHeaders(config, upload.type),
            body: new Uint8Array(await upload.arrayBuffer()),
            signal: AbortSignal.timeout(15_000),
        },
    );

    if (!response.ok) throw await readAzureError(response);

    const operationLocation = response.headers.get('operation-location');
    if (!operationLocation) {
        throw new AzureRequestError('Azure did not return an operation location.', 502, 'MalformedResponse');
    }

    const rawResult = await pollAnalyzeResult(operationLocation, config, retryAfterSeconds(response));
    const mapped = mapAzureReceiptResult(rawResult);
    const pageCount = countAnalyzedPages(rawResult);
    return {
        mapped,
        pageCount,
        costCents: estimatedProviderCostCents(pageCount),
        provider: 'azure-document-intelligence',
        providerLabel: 'Azure Document Intelligence',
    };
}

async function analyzeMistralReceiptUpload(
    upload: Blob,
    config: MistralConfig,
): Promise<ReceiptProviderAnalysis> {
    const base64 = Buffer.from(await upload.arrayBuffer()).toString('base64');
    const documentType = upload.type === 'application/pdf' ? 'document_url' : 'image_url';
    const documentUrlKey = documentType === 'document_url' ? 'document_url' : 'image_url';
    const response = await fetch('https://api.mistral.ai/v1/ocr', {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${config.key}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            model: config.modelId,
            document: {
                type: documentType,
                [documentUrlKey]: `data:${upload.type};base64,${base64}`,
            },
            confidence_scores_granularity: 'page',
            include_image_base64: false,
        }),
        signal: AbortSignal.timeout(POLL_TIMEOUT_MS),
    });
    if (!response.ok) throw await readAzureError(response);
    const rawResult = await response.json() as { pages?: unknown[] };
    const mapped = mapMistralReceiptResult(rawResult);
    const pageCount = Array.isArray(rawResult.pages) && rawResult.pages.length > 0
        ? rawResult.pages.length
        : 1;
    const dollarsPerPage = Number(process.env.MISTRAL_OCR_COST_PER_PAGE_USD ?? '0');
    const costCents = Number.isFinite(dollarsPerPage) && dollarsPerPage >= 0
        ? Math.round(dollarsPerPage * 100 * pageCount * 10_000) / 10_000
        : 0;
    return {
        mapped,
        pageCount,
        costCents,
        provider: 'mistral-ocr',
        providerLabel: 'Mistral OCR',
    };
}

export async function analyzeReceiptUpload(
    upload: Blob,
    explicitConfig?: ReceiptProviderConfig | null,
): Promise<ReceiptProviderAnalysis> {
    const configs = explicitConfig ? [explicitConfig] : configuredProviderChain();
    if (configs.length === 0) {
        throw new ServerRequestError(
            503,
            'receipt-ocr-not-configured',
            'Receipt OCR is not configured on the app server.',
        );
    }

    let lastError: unknown;
    for (const config of configs) {
        try {
            return isMistralConfig(config)
                ? await analyzeMistralReceiptUpload(upload, config)
                : await analyzeAzureReceiptUpload(upload, config);
        } catch (error) {
            lastError = error;
            if (error instanceof AzureRequestError && error.httpStatus >= 400 && error.httpStatus < 500 && error.httpStatus !== 429) {
                break;
            }
        }
    }
    throw lastError;
}

async function analyzeReceipt(
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
            provider: PROVIDER,
            providerLabel: PROVIDER_LABEL,
            configured: true,
            reachable: 'ok',
            status: 'quota-or-rate-limit',
            reason: projectBudget.reason,
            message: 'Receipt OCR is paused because the project monthly budget was reached.',
        }, 429, { ...responseHeaders, 'Retry-After': '3600' });
    }

    try {
        const {
            mapped: providerMapped,
            pageCount,
            costCents,
            provider,
            providerLabel,
        } = await analyzeReceiptUpload(upload);
        const mapped = await enrichReceiptAnalysis(
            authorization.admin,
            authorization.householdId,
            providerMapped,
        );

        await completeReceiptScan(authorization.admin, requestId, {
            status: 'succeeded',
            httpStatus: 200,
            storeName: mapped.storeName,
            receiptDate: mapped.date,
            itemCount: mapped.items.length,
            skippedCount: mapped.skippedItems.length,
            costCents,
            pageCount,
        });

        return receiptJsonResponse({
            provider,
            providerLabel,
            ...mapped,
            estimatedCostCents: costCents,
            quota: {
                userRemaining: reservation.user_remaining,
                householdRemaining: reservation.household_remaining,
            },
        }, 200, responseHeaders);
    } catch (error) {
        const providerResponse = receiptProviderErrorResponse(error);
        let providerStatus = 'service-error';
        try {
            const body = await providerResponse.clone().json() as { status?: string };
            providerStatus = body.status ?? providerStatus;
        } catch {
            // The public provider response always uses JSON; keep the fallback if that changes.
        }

        await completeReceiptScan(authorization.admin, requestId, {
            status: 'failed',
            httpStatus: providerResponse.status,
            providerStatus,
        });

        const headers = new Headers(providerResponse.headers);
        new Headers(responseHeaders).forEach((value, name) => headers.set(name, value));
        return new Response(providerResponse.body, { status: providerResponse.status, headers });
    }
}

export async function handleReceiptOcrRequest(request: Request): Promise<Response> {
    const config = configuredProviderChain()[0] ?? null;
    if (!config) return missingConfigurationResponse();

    try {
        if (request.method !== 'GET' && request.method !== 'POST') {
            return receiptJsonResponse({ message: 'Method not allowed.' }, 405, { Allow: 'GET, POST' });
        }

        const authorization = await authorizeHouseholdRequest(request);
        if (request.method === 'GET') {
            return isMistralConfig(config) ? await checkMistralHealth(config) : await checkHealth(config);
        }
        const consentResponse = receiptCloudConsentResponse(request);
        if (consentResponse) return consentResponse;
        return await analyzeReceipt(request, authorization);
    } catch (error) {
        const requestError = serverRequestErrorResponse(error);
        if (requestError) return requestError;
        return receiptProviderErrorResponse(error);
    }
}

export default {
    fetch: handleReceiptOcrRequest,
};
