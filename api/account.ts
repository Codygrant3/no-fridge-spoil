/// <reference types="node" />

import {
    authenticateRequest,
    ServerRequestError,
    serverRequestErrorResponse,
    type AuthenticatedRequest,
} from '../server/supabaseServer';

const EXPORT_TABLES = [
    'household_profiles',
    'inventory_items',
    'shopping_items',
    'meal_plans',
    'receipt_scans',
    'receipt_item_aliases',
    'usage_events',
] as const;

function jsonResponse(body: unknown, status = 200, extraHeaders: HeadersInit = {}): Response {
    return Response.json(body, {
        status,
        headers: {
            'Cache-Control': 'no-store',
            ...Object.fromEntries(new Headers(extraHeaders)),
        },
    });
}

async function exportAccountData(authentication: AuthenticatedRequest): Promise<Response> {
    const { data: profile, error: profileError } = await authentication.admin
        .from('user_profiles')
        .select('*')
        .eq('id', authentication.user.id)
        .maybeSingle();
    if (profileError) throw new Error(`Profile export failed: ${profileError.message}`);

    const { data: memberships, error: membershipError } = await authentication.admin
        .from('household_members')
        .select('household_id, role, created_at, households(*)')
        .eq('user_id', authentication.user.id);
    if (membershipError) throw new Error(`Household export failed: ${membershipError.message}`);

    const householdIds = (memberships ?? []).map(row => row.household_id as string);
    const householdData: Record<string, unknown[]> = {};

    for (const table of EXPORT_TABLES) {
        if (householdIds.length === 0) {
            householdData[table] = [];
            continue;
        }

        const { data, error } = await authentication.admin
            .from(table)
            .select('*')
            .in('household_id', householdIds);
        if (error) throw new Error(`${table} export failed: ${error.message}`);
        householdData[table] = data ?? [];
    }

    const exportedAt = new Date().toISOString();
    const exportBody = {
        format: 'no-fridge-spoil-account-export',
        version: 1,
        exportedAt,
        account: {
            id: authentication.user.id,
            email: authentication.user.email,
            createdAt: authentication.user.created_at,
            lastSignInAt: authentication.user.last_sign_in_at,
            profile,
        },
        memberships,
        data: householdData,
    };

    return new Response(JSON.stringify(exportBody, null, 2), {
        status: 200,
        headers: {
            'Cache-Control': 'no-store',
            'Content-Type': 'application/json; charset=utf-8',
            'Content-Disposition': `attachment; filename="no-fridge-spoil-export-${exportedAt.slice(0, 10)}.json"`,
        },
    });
}

async function assertDeletionWillNotAffectOtherMembers(authentication: AuthenticatedRequest): Promise<void> {
    const { data: ownedHouseholds, error: ownerError } = await authentication.admin
        .from('household_members')
        .select('household_id')
        .eq('user_id', authentication.user.id)
        .eq('role', 'owner');
    if (ownerError) throw new Error(`Owner lookup failed: ${ownerError.message}`);

    const householdIds = (ownedHouseholds ?? []).map(row => row.household_id as string);
    if (householdIds.length === 0) return;

    const { data: members, error: memberError } = await authentication.admin
        .from('household_members')
        .select('household_id, user_id')
        .in('household_id', householdIds);
    if (memberError) throw new Error(`Household member lookup failed: ${memberError.message}`);

    if ((members ?? []).some(member => member.user_id !== authentication.user.id)) {
        throw new ServerRequestError(
            409,
            'ownership-transfer-required',
            'Transfer household ownership or remove the other members before deleting this account.',
        );
    }
}

async function deleteAccount(request: Request, authentication: AuthenticatedRequest): Promise<Response> {
    const body = await request.json().catch(() => null) as { confirmation?: unknown } | null;
    const expected = authentication.user.email?.trim().toLowerCase();
    const confirmation = typeof body?.confirmation === 'string'
        ? body.confirmation.trim().toLowerCase()
        : '';

    if (!expected || confirmation !== expected) {
        throw new ServerRequestError(
            400,
            'deletion-confirmation-required',
            'Enter the account email address to confirm permanent deletion.',
        );
    }

    await assertDeletionWillNotAffectOtherMembers(authentication);

    for (const table of ['household_profiles', 'inventory_items', 'shopping_items', 'meal_plans'] as const) {
        const { error: attributionError } = await authentication.admin
            .from(table)
            .update({ created_by: null })
            .eq('created_by', authentication.user.id);
        if (attributionError) {
            throw new Error(`Creator attribution cleanup failed for ${table}: ${attributionError.message}`);
        }
    }

    for (const column of ['created_by', 'updated_by'] as const) {
        const { error: aliasAttributionError } = await authentication.admin
            .from('receipt_item_aliases')
            .update({ [column]: null })
            .eq(column, authentication.user.id);
        if (aliasAttributionError) {
            throw new Error(`Receipt alias attribution cleanup failed for ${column}: ${aliasAttributionError.message}`);
        }
    }

    const { error } = await authentication.admin.auth.admin.deleteUser(authentication.user.id, false);
    if (error) {
        console.error('Account deletion failed:', error.message);
        throw new Error('Account deletion failed.');
    }

    return jsonResponse({ deleted: true });
}

export async function handleAccountRequest(request: Request): Promise<Response> {
    try {
        if (request.method !== 'GET' && request.method !== 'DELETE') {
            return jsonResponse({ message: 'Method not allowed.' }, 405, { Allow: 'GET, DELETE' });
        }

        const authentication = await authenticateRequest(request);
        if (request.method === 'GET') return await exportAccountData(authentication);
        return await deleteAccount(request, authentication);
    } catch (error) {
        const requestError = serverRequestErrorResponse(error);
        if (requestError) return requestError;
        console.error('Account API failed:', error);
        return jsonResponse({
            status: 'account-service-error',
            message: 'The account service could not complete this request.',
        }, 500);
    }
}

export default {
    fetch: handleAccountRequest,
};
