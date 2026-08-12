/// <reference types="node" />

import { createHash, randomBytes } from 'node:crypto';
import {
    authenticateRequest,
    authorizeHouseholdRequest,
    ServerRequestError,
    serverRequestErrorResponse,
    type AuthorizedHouseholdRequest,
    type HouseholdRole,
} from '../server/supabaseServer';

function jsonResponse(body: unknown, status = 200, extraHeaders: HeadersInit = {}): Response {
    return Response.json(body, {
        status,
        headers: {
            'Cache-Control': 'no-store',
            ...Object.fromEntries(new Headers(extraHeaders)),
        },
    });
}

async function requestBody(request: Request): Promise<Record<string, unknown>> {
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
        throw new ServerRequestError(400, 'invalid-request', 'Send a valid JSON request.');
    }
    return body as Record<string, unknown>;
}

function textValue(value: unknown): string {
    return typeof value === 'string' ? value.trim() : '';
}

function requireManager(authorization: AuthorizedHouseholdRequest): void {
    if (authorization.role === 'member') {
        throw new ServerRequestError(403, 'manager-required', 'Household manager access is required.');
    }
}

function requireOwner(authorization: AuthorizedHouseholdRequest): void {
    if (authorization.role !== 'owner') {
        throw new ServerRequestError(403, 'owner-required', 'Household owner access is required.');
    }
}

async function listHousehold(authorization: AuthorizedHouseholdRequest): Promise<Response> {
    const { data: memberRows, error: memberError } = await authorization.admin
        .from('household_members')
        .select('user_id, role, created_at')
        .eq('household_id', authorization.householdId)
        .order('created_at', { ascending: true });
    if (memberError) throw memberError;

    const userIds = (memberRows ?? []).map(row => String(row.user_id));
    const profiles = userIds.length === 0
        ? []
        : (await authorization.admin
            .from('user_profiles')
            .select('id, display_name')
            .in('id', userIds)).data ?? [];
    const names = new Map(profiles.map(profile => [String(profile.id), String(profile.display_name)]));
    const users = await Promise.all(userIds.map(async id => {
        const { data } = await authorization.admin.auth.admin.getUserById(id);
        return [id, data.user?.email ?? null] as const;
    }));
    const emails = new Map(users);

    let invites: unknown[] = [];
    if (authorization.role !== 'member') {
        const { data, error } = await authorization.admin
            .from('household_invites')
            .select('id, invited_email, role, expires_at, created_at')
            .eq('household_id', authorization.householdId)
            .is('accepted_at', null)
            .gt('expires_at', new Date().toISOString())
            .order('created_at', { ascending: false });
        if (error) throw error;
        invites = (data ?? []).map(invite => ({
            id: invite.id,
            email: invite.invited_email,
            role: invite.role,
            expiresAt: invite.expires_at,
            createdAt: invite.created_at,
        }));
    }

    return jsonResponse({
        members: (memberRows ?? []).map(member => ({
            userId: member.user_id,
            displayName: names.get(String(member.user_id)) ?? 'Household member',
            email: emails.get(String(member.user_id)) ?? null,
            role: member.role,
            joinedAt: member.created_at,
        })),
        invites,
    });
}

async function createInvite(
    request: Request,
    authorization: AuthorizedHouseholdRequest,
    body: Record<string, unknown>,
): Promise<Response> {
    requireManager(authorization);
    const email = textValue(body.email).toLowerCase();
    const role = textValue(body.role) || 'member';
    if (!/^\S+@\S+\.\S+$/.test(email) || email.length > 320) {
        throw new ServerRequestError(400, 'invalid-email', 'Enter a valid email address.');
    }
    if (role !== 'member' && role !== 'admin') {
        throw new ServerRequestError(400, 'invalid-role', 'Choose member or admin access.');
    }
    if (authorization.role === 'admin' && role === 'admin') {
        throw new ServerRequestError(403, 'owner-required', 'Only the owner can invite another admin.');
    }

    const token = randomBytes(32).toString('base64url');
    const tokenHash = createHash('sha256').update(token).digest('hex');
    const expiresAt = new Date(Date.now() + 7 * 86_400_000).toISOString();
    const { data: existing, error: lookupError } = await authorization.admin
        .from('household_invites')
        .select('id')
        .eq('household_id', authorization.householdId)
        .eq('invited_email', email)
        .is('accepted_at', null)
        .maybeSingle();
    if (lookupError) throw lookupError;

    const values = {
        household_id: authorization.householdId,
        invited_email: email,
        role,
        token_hash: tokenHash,
        invited_by: authorization.user.id,
        expires_at: expiresAt,
    };
    const query = existing
        ? authorization.admin.from('household_invites').update(values).eq('id', existing.id)
        : authorization.admin.from('household_invites').insert(values);
    const { error } = await query;
    if (error) throw error;

    const origin = new URL(request.url).origin;
    return jsonResponse({
        email,
        role,
        expiresAt,
        inviteLink: `${origin}/#/profile?invite=${encodeURIComponent(token)}`,
        delivery: 'copy-link',
    }, 201);
}

async function updateMember(
    authorization: AuthorizedHouseholdRequest,
    body: Record<string, unknown>,
): Promise<Response> {
    requireOwner(authorization);
    const userId = textValue(body.userId);
    const role = textValue(body.role) as HouseholdRole;
    if (!userId || (role !== 'admin' && role !== 'member')) {
        throw new ServerRequestError(400, 'invalid-member-update', 'Choose a member and valid role.');
    }
    if (userId === authorization.user.id) {
        throw new ServerRequestError(409, 'owner-role-protected', 'Transfer ownership before changing your role.');
    }

    const { data, error } = await authorization.admin
        .from('household_members')
        .update({ role })
        .eq('household_id', authorization.householdId)
        .eq('user_id', userId)
        .neq('role', 'owner')
        .select('user_id')
        .maybeSingle();
    if (error) throw error;
    if (!data) throw new ServerRequestError(404, 'member-not-found', 'Household member not found.');
    return jsonResponse({ updated: true });
}

async function transferOwnership(
    authorization: AuthorizedHouseholdRequest,
    body: Record<string, unknown>,
): Promise<Response> {
    requireOwner(authorization);
    const userId = textValue(body.userId);
    if (!userId) throw new ServerRequestError(400, 'member-required', 'Choose the next household owner.');
    const { error } = await authorization.admin.rpc('transfer_household_ownership', {
        requested_household_id: authorization.householdId,
        current_owner_id: authorization.user.id,
        next_owner_id: userId,
    });
    if (error) throw error;
    return jsonResponse({ transferred: true });
}

async function removeMember(
    authorization: AuthorizedHouseholdRequest,
    body: Record<string, unknown>,
): Promise<Response> {
    requireManager(authorization);
    const userId = textValue(body.userId);
    if (!userId) throw new ServerRequestError(400, 'member-required', 'Choose a household member.');
    const { data: member, error: memberError } = await authorization.admin
        .from('household_members')
        .select('role')
        .eq('household_id', authorization.householdId)
        .eq('user_id', userId)
        .maybeSingle();
    if (memberError) throw memberError;
    if (!member) throw new ServerRequestError(404, 'member-not-found', 'Household member not found.');
    if (member.role === 'owner' || (authorization.role === 'admin' && member.role === 'admin')) {
        throw new ServerRequestError(403, 'member-protected', 'You cannot remove this household manager.');
    }

    const { error } = await authorization.admin
        .from('household_members')
        .delete()
        .eq('household_id', authorization.householdId)
        .eq('user_id', userId);
    if (error) throw error;
    return jsonResponse({ removed: true });
}

async function cancelInvite(
    authorization: AuthorizedHouseholdRequest,
    body: Record<string, unknown>,
): Promise<Response> {
    requireManager(authorization);
    const inviteId = textValue(body.inviteId);
    if (!inviteId) throw new ServerRequestError(400, 'invite-required', 'Choose an invitation.');
    const { error } = await authorization.admin
        .from('household_invites')
        .delete()
        .eq('id', inviteId)
        .eq('household_id', authorization.householdId)
        .is('accepted_at', null);
    if (error) throw error;
    return jsonResponse({ canceled: true });
}

async function acceptInvite(request: Request, body: Record<string, unknown>): Promise<Response> {
    const authentication = await authenticateRequest(request);
    const token = textValue(body.token);
    const email = authentication.user.email;
    if (!token || !email) throw new ServerRequestError(400, 'invite-invalid', 'This invitation is invalid.');
    const tokenHash = createHash('sha256').update(token).digest('hex');
    const { data, error } = await authentication.admin.rpc('accept_household_invite', {
        requested_token_hash: tokenHash,
        requested_user_id: authentication.user.id,
        requested_user_email: email,
    });
    if (error) {
        throw new ServerRequestError(409, 'invite-unavailable', 'This invitation is expired, already used, or belongs to another email.');
    }
    const row = (Array.isArray(data) ? data[0] : data) as { household_id?: string; role?: string } | null;
    return jsonResponse({ accepted: true, householdId: row?.household_id, role: row?.role });
}

export async function handleHouseholdRequest(request: Request): Promise<Response> {
    try {
        if (!['GET', 'POST', 'PATCH', 'DELETE'].includes(request.method)) {
            return jsonResponse({ message: 'Method not allowed.' }, 405, { Allow: 'GET, POST, PATCH, DELETE' });
        }
        const body = request.method === 'GET' ? {} : await requestBody(request);
        const action = textValue(body.action);
        if (request.method === 'POST' && action === 'accept') return await acceptInvite(request, body);

        const authorization = await authorizeHouseholdRequest(request);
        if (request.method === 'GET') return await listHousehold(authorization);
        if (request.method === 'POST') return await createInvite(request, authorization, body);
        if (request.method === 'PATCH' && action === 'transfer') return await transferOwnership(authorization, body);
        if (request.method === 'PATCH') return await updateMember(authorization, body);
        if (action === 'cancel-invite') return await cancelInvite(authorization, body);
        return await removeMember(authorization, body);
    } catch (error) {
        const requestError = serverRequestErrorResponse(error);
        if (requestError) return requestError;
        console.error('Household collaboration request failed:', error instanceof Error ? error.message : error);
        return jsonResponse({
            status: 'account-service-error',
            message: 'Household collaboration could not be updated.',
        }, 500);
    }
}

export default {
    fetch: handleHouseholdRequest,
};
