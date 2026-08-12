/// <reference types="node" />

import { logServerEvent } from '../server/observability';
import { createServiceAdminClient } from '../server/supabaseServer';
import { isAuthorizedCronRequest } from '../server/cronAuth';

interface HealthCheck {
    status: 'ok' | 'degraded' | 'failed';
    message?: string;
}

interface DetailedHealthPayload {
    status: 'healthy' | 'degraded' | 'unhealthy';
    timestamp: string;
    durationMs: number;
    checks: Record<string, HealthCheck>;
    queue: { queuedJobs: number; oldestQueuedSeconds: number | null };
}

let detailedHealthCache: { expiresAt: number; payload: DetailedHealthPayload } | null = null;

export async function handleHealthRequest(request: Request): Promise<Response> {
    if (request.method !== 'GET') {
        return Response.json({ message: 'Method not allowed.' }, {
            status: 405,
            headers: { Allow: 'GET', 'Cache-Control': 'no-store' },
        });
    }

    const privileged = isAuthorizedCronRequest(request);
    if (!privileged) {
        return Response.json({
            status: 'healthy',
            timestamp: new Date().toISOString(),
        }, {
            headers: { 'Cache-Control': 'public, max-age=15, stale-while-revalidate=30' },
        });
    }
    if (detailedHealthCache && detailedHealthCache.expiresAt > Date.now()) {
        return Response.json(detailedHealthCache.payload, {
            status: detailedHealthCache.payload.status === 'unhealthy' ? 503 : 200,
            headers: { 'Cache-Control': 'no-store', 'X-Health-Cache': 'hit' },
        });
    }

    const startedAt = Date.now();
    const selectedProvider = process.env.RECEIPT_OCR_PROVIDER?.trim().toLowerCase();
    const receiptProviderConfigured = selectedProvider === 'mistral'
        ? Boolean(process.env.MISTRAL_API_KEY?.trim())
        : Boolean(
            process.env.AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT?.trim()
            && process.env.AZURE_DOCUMENT_INTELLIGENCE_KEY?.trim(),
        );
    const checks: Record<string, HealthCheck> = {
        application: { status: 'ok' },
        receiptProvider: receiptProviderConfigured
            ? { status: 'ok' }
            : { status: 'degraded', message: 'Receipt provider configuration is incomplete.' },
    };
    let queuedJobs = 0;
    let oldestQueuedSeconds: number | null = null;

    try {
        const admin = createServiceAdminClient();
        const { count, error: countError } = await admin
            .from('receipt_scan_jobs')
            .select('id', { count: 'exact', head: true })
            .in('status', ['queued', 'processing', 'retry']);
        if (countError) throw countError;
        queuedJobs = count ?? 0;

        const { data: oldest, error: oldestError } = await admin
            .from('receipt_scan_jobs')
            .select('created_at')
            .in('status', ['queued', 'processing', 'retry'])
            .order('created_at', { ascending: true })
            .limit(1)
            .maybeSingle();
        if (oldestError) throw oldestError;
        if (oldest?.created_at) {
            oldestQueuedSeconds = Math.max(0, Math.floor((Date.now() - Date.parse(String(oldest.created_at))) / 1_000));
        }
        checks.database = { status: 'ok' };
        checks.receiptQueue = oldestQueuedSeconds !== null && oldestQueuedSeconds > 600
            ? { status: 'degraded', message: 'The oldest receipt job has waited more than 10 minutes.' }
            : { status: 'ok' };
    } catch (error) {
        checks.database = { status: 'failed', message: 'The cloud database is unavailable.' };
        checks.receiptQueue = { status: 'failed', message: 'Receipt queue health could not be read.' };
        logServerEvent('error', 'health.database.failed', {
            durationMs: Date.now() - startedAt,
            error: error instanceof Error ? error.message : String(error),
        });
    }

    const failed = Object.values(checks).some(check => check.status === 'failed');
    const degraded = Object.values(checks).some(check => check.status === 'degraded');
    const status = failed ? 'unhealthy' : degraded ? 'degraded' : 'healthy';
    const durationMs = Date.now() - startedAt;
    logServerEvent(failed ? 'error' : degraded ? 'warn' : 'info', 'health.completed', {
        status,
        durationMs,
        queuedJobs,
        oldestQueuedSeconds,
    });

    const payload: DetailedHealthPayload = {
        status,
        timestamp: new Date().toISOString(),
        durationMs,
        checks,
        queue: { queuedJobs, oldestQueuedSeconds },
    };
    detailedHealthCache = { expiresAt: Date.now() + 30_000, payload };

    return Response.json(payload, {
        status: failed ? 503 : 200,
        headers: { 'Cache-Control': 'no-store' },
    });
}

export default {
    fetch: handleHealthRequest,
};
