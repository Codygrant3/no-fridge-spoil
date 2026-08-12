/// <reference types="node" />

import { createServiceAdminClient, serverRequestErrorResponse } from '../server/supabaseServer';
import { cronConfigurationResponse, isAuthorizedCronRequest } from '../server/cronAuth';

export async function handleMaintenanceRequest(request: Request): Promise<Response> {
    if (request.method !== 'GET') {
        return Response.json({ message: 'Method not allowed.' }, {
            status: 405,
            headers: { Allow: 'GET', 'Cache-Control': 'no-store' },
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
        const { data, error } = await admin.rpc('cleanup_expired_account_data');
        if (error) throw error;
        const { data: invitesDeleted, error: inviteError } = await admin.rpc('cleanup_expired_household_invites');
        if (inviteError) throw inviteError;
        const { data: reapedJobs, error: reaperError } = await admin.rpc('reap_receipt_scan_jobs');
        if (reaperError) throw reaperError;
        const storagePaths = (Array.isArray(reapedJobs) ? reapedJobs : [])
            .map((job: { storage_path?: unknown }) => job.storage_path)
            .filter((path: unknown): path is string => typeof path === 'string' && path.length > 0);
        if (storagePaths.length > 0) {
            const { error: storageError } = await admin.storage.from('receipt-uploads').remove(storagePaths);
            if (storageError) throw storageError;
        }

        return Response.json({
            completed: true,
            deleted: {
                ...data,
                householdInvitesDeleted: invitesDeleted,
                receiptJobsReaped: storagePaths.length,
            },
        }, {
            headers: { 'Cache-Control': 'no-store' },
        });
    } catch (error) {
        const requestError = serverRequestErrorResponse(error);
        if (requestError) return requestError;
        console.error('Scheduled account cleanup failed:', error);
        return Response.json({ message: 'Scheduled cleanup failed.' }, {
            status: 500,
            headers: { 'Cache-Control': 'no-store' },
        });
    }
}

export default {
    fetch: handleMaintenanceRequest,
};
