/// <reference types="node" />

import { cronConfigurationResponse, isAuthorizedCronRequest } from '../server/cronAuth';
import { processNextReceiptJob } from '../server/receiptJobs';
import { createServiceAdminClient, serverRequestErrorResponse } from '../server/supabaseServer';

export async function handleReceiptWorkerRequest(request: Request): Promise<Response> {
    if (request.method !== 'GET' && request.method !== 'POST') {
        return Response.json({ message: 'Method not allowed.' }, {
            status: 405,
            headers: { Allow: 'GET, POST', 'Cache-Control': 'no-store' },
        });
    }

    const configurationError = cronConfigurationResponse();
    if (configurationError) return configurationError;
    if (!isAuthorizedCronRequest(request)) {
        return Response.json({ message: 'Unauthorized.' }, {
            status: 401,
            headers: { 'Cache-Control': 'no-store' },
        });
    }

    try {
        const admin = createServiceAdminClient();
        const workerId = `cron:${crypto.randomUUID()}`;
        const deadline = Date.now() + 50_000;
        const maxJobs = Math.max(1, Math.min(10, Number(process.env.RECEIPT_WORKER_BATCH_SIZE ?? '5')));
        const results = [];
        while (results.length < maxJobs && Date.now() < deadline) {
            const result = await processNextReceiptJob(admin, workerId);
            if (!result) break;
            results.push(result);
        }
        return Response.json({
            processed: results.length,
            jobs: results,
            stoppedForTimeBudget: Date.now() >= deadline,
        }, { headers: { 'Cache-Control': 'no-store' } });
    } catch (error) {
        const requestError = serverRequestErrorResponse(error);
        if (requestError) return requestError;
        console.error('Receipt worker failed:', error instanceof Error ? error.message : error);
        return Response.json({ message: 'Receipt worker failed.' }, {
            status: 500,
            headers: { 'Cache-Control': 'no-store' },
        });
    }
}

export default {
    fetch: handleReceiptWorkerRequest,
};
