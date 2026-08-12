import {
    getAuthenticatedRequestHeaders,
    getSessionAuthorizationHeaders,
} from './cloudSessionService';

const HOUSEHOLD_API_URL = import.meta.env.VITE_HOUSEHOLD_API_URL?.trim() || '/api/household';

export interface HouseholdMember {
    userId: string;
    displayName: string;
    email: string | null;
    role: 'owner' | 'admin' | 'member';
    joinedAt: string;
}

export interface HouseholdInvite {
    id: string;
    email: string;
    role: 'admin' | 'member';
    expiresAt: string;
    createdAt: string;
}

export interface HouseholdRoster {
    members: HouseholdMember[];
    invites: HouseholdInvite[];
}

async function responsePayload<T>(response: Response): Promise<T> {
    const payload = await response.json().catch(() => null) as (T & { message?: string }) | null;
    if (!response.ok) throw new Error(payload?.message || `Household request failed with HTTP ${response.status}.`);
    if (!payload) throw new Error('Household service returned an unreadable response.');
    return payload;
}

async function householdRequest<T>(
    method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
    body?: Record<string, unknown>,
    sessionOnly = false,
): Promise<T> {
    const headers = sessionOnly
        ? await getSessionAuthorizationHeaders()
        : await getAuthenticatedRequestHeaders();
    const response = await fetch(HOUSEHOLD_API_URL, {
        method,
        headers: {
            Accept: 'application/json',
            ...(body ? { 'Content-Type': 'application/json' } : {}),
            ...headers,
        },
        body: body ? JSON.stringify(body) : undefined,
        cache: 'no-store',
    });
    return responsePayload<T>(response);
}

export function getHouseholdRoster(): Promise<HouseholdRoster> {
    return householdRequest('GET');
}

export function createHouseholdInvite(
    email: string,
    role: HouseholdInvite['role'],
): Promise<{ inviteLink: string; expiresAt: string; delivery: 'copy-link' }> {
    return householdRequest('POST', { email, role });
}

export function acceptHouseholdInvite(token: string): Promise<{ accepted: true; householdId?: string }> {
    return householdRequest('POST', { action: 'accept', token }, true);
}

export function updateHouseholdMember(userId: string, role: 'admin' | 'member'): Promise<void> {
    return householdRequest('PATCH', { userId, role });
}

export function transferHouseholdOwnership(userId: string): Promise<void> {
    return householdRequest('PATCH', { action: 'transfer', userId });
}

export function removeHouseholdMember(userId: string): Promise<void> {
    return householdRequest('DELETE', { userId });
}

export function cancelHouseholdInvite(inviteId: string): Promise<void> {
    return householdRequest('DELETE', { action: 'cancel-invite', inviteId });
}
