import { supabase } from './supabaseClient';
import { readLocalValue, removeLocalValue, writeLocalValue } from './safeStorage';

const ACTIVE_HOUSEHOLD_KEY = 'no-fridge-spoil:active-cloud-household';

export class CloudSessionError extends Error {
    readonly code: 'not-configured' | 'not-authenticated' | 'no-household';

    constructor(code: CloudSessionError['code'], message: string) {
        super(message);
        this.name = 'CloudSessionError';
        this.code = code;
    }
}

export function getActiveCloudHouseholdId(): string | null {
    return readLocalValue(ACTIVE_HOUSEHOLD_KEY);
}

export function setActiveCloudHouseholdId(householdId: string | null): void {
    if (householdId) writeLocalValue(ACTIVE_HOUSEHOLD_KEY, householdId);
    else removeLocalValue(ACTIVE_HOUSEHOLD_KEY);
}

export async function getSessionAuthorizationHeaders(): Promise<Record<string, string>> {
    if (!supabase) {
        throw new CloudSessionError('not-configured', 'Cloud accounts are not configured for this deployment.');
    }

    const { data, error } = await supabase.auth.getSession();
    if (error || !data.session?.access_token) {
        throw new CloudSessionError('not-authenticated', 'Sign in to use receipt intelligence.');
    }

    return { Authorization: `Bearer ${data.session.access_token}` };
}

export async function getAuthenticatedRequestHeaders(): Promise<Record<string, string>> {
    const authorization = await getSessionAuthorizationHeaders();
    const householdId = getActiveCloudHouseholdId();
    if (!householdId) {
        throw new CloudSessionError('no-household', 'Choose a household before scanning a receipt.');
    }

    return {
        ...authorization,
        'X-Household-Id': householdId,
    };
}
