import { db, exportAllData } from '../db/database';
import { getAuthenticatedRequestHeaders } from './cloudSessionService';
import { supabase } from './supabaseClient';

const ACCOUNT_API_URL = import.meta.env.VITE_ACCOUNT_API_URL?.trim() || '/api/account';

export interface AccountPreferences {
    displayName: string;
    receiptRetentionDays: number;
    usageRetentionDays: number;
}

function requireCloudClient() {
    if (!supabase) throw new Error('Cloud accounts are not configured.');
    return supabase;
}

async function responseError(response: Response): Promise<Error> {
    try {
        const payload = await response.json() as { message?: string };
        return new Error(payload.message || `Account request failed with HTTP ${response.status}.`);
    } catch {
        return new Error(`Account request failed with HTTP ${response.status}.`);
    }
}

export async function getAccountPreferences(userId: string): Promise<AccountPreferences> {
    const client = requireCloudClient();
    const { data, error } = await client
        .from('user_profiles')
        .select('display_name, receipt_retention_days, usage_retention_days')
        .eq('id', userId)
        .single();
    if (error) throw error;

    return {
        displayName: data.display_name,
        receiptRetentionDays: data.receipt_retention_days,
        usageRetentionDays: data.usage_retention_days,
    };
}

export async function updateAccountPreferences(
    userId: string,
    preferences: AccountPreferences,
): Promise<void> {
    const client = requireCloudClient();
    const { error } = await client
        .from('user_profiles')
        .update({
            display_name: preferences.displayName.trim(),
            receipt_retention_days: preferences.receiptRetentionDays,
            usage_retention_days: preferences.usageRetentionDays,
        })
        .eq('id', userId);
    if (error) throw error;
}

export async function updateHouseholdRetention(householdId: string, days: number): Promise<void> {
    const client = requireCloudClient();
    const { error } = await client
        .from('households')
        .update({ receipt_retention_days: days })
        .eq('id', householdId);
    if (error) throw error;
}

export async function downloadAccountExport(): Promise<void> {
    const headers = await getAuthenticatedRequestHeaders();
    const response = await fetch(ACCOUNT_API_URL, {
        method: 'GET',
        headers: { Accept: 'application/json', ...headers },
        cache: 'no-store',
    });
    if (!response.ok) throw await responseError(response);

    const cloudExport = await response.json();
    const localDeviceSnapshot = JSON.parse(await exportAllData()) as unknown;
    const body = JSON.stringify({
        format: 'no-fridge-spoil-complete-export',
        version: 1,
        exportedAt: new Date().toISOString(),
        cloud: cloudExport,
        localDeviceSnapshot,
    }, null, 2);
    const url = URL.createObjectURL(new Blob([body], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `no-fridge-spoil-complete-export-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
}

export async function deleteCloudAccount(confirmation: string): Promise<void> {
    const headers = await getAuthenticatedRequestHeaders();
    const response = await fetch(ACCOUNT_API_URL, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json', ...headers },
        body: JSON.stringify({ confirmation }),
        cache: 'no-store',
    });
    if (!response.ok) throw await responseError(response);
}

export async function clearLocalHouseholdData(householdId: string): Promise<void> {
    await db.transaction(
        'rw',
        [db.items, db.shoppingList, db.mealPlans, db.profiles, db.syncOutbox, db.syncState],
        async () => {
            await db.items.filter(item => item.cloudHouseholdId === householdId).delete();
            await db.shoppingList.filter(item => item.cloudHouseholdId === householdId).delete();
            await db.mealPlans.filter(plan => plan.cloudHouseholdId === householdId).delete();
            await db.profiles.filter(profile => profile.cloudHouseholdId === householdId).delete();
            await db.syncOutbox.where('householdId').equals(householdId).delete();
            await db.syncState.delete(householdId);
        },
    );
}
