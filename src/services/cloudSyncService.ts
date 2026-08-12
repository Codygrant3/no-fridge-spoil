import type { SupabaseClient, User } from '@supabase/supabase-js';
import {
    db,
    type CloudSyncEntityType,
    type DbInventoryItem,
    type DbMealPlan,
    type DbProfile,
    type DbShoppingItem,
    type DbSyncOutbox,
    type DbSyncState,
} from '../db/database';
import { getActiveCloudHouseholdId } from './cloudSessionService';
import { isCloudConfigured, supabase } from './supabaseClient';

type LocalSyncRecord = DbInventoryItem | DbShoppingItem | DbMealPlan | DbProfile;

export type CloudSyncStatus = 'disabled' | 'signed-out' | 'offline' | 'idle' | 'syncing' | 'error';

export interface CloudSyncSnapshot {
    status: CloudSyncStatus;
    householdId: string | null;
    pendingChanges: number;
    lastSuccessfulSyncAt?: string;
    error?: string;
    localMigrationCount?: number;
    conflictCount?: number;
}

const ENTITY_ORDER: CloudSyncEntityType[] = ['profile', 'inventory', 'shopping', 'meal-plan'];
const EPOCH = '1970-01-01T00:00:00.000Z';
const SYNC_INTERVAL_MS = 60_000;
const PAGE_SIZE = 500;
const listeners = new Set<(snapshot: CloudSyncSnapshot) => void>();

let snapshot: CloudSyncSnapshot = {
    status: isCloudConfigured ? 'signed-out' : 'disabled',
    householdId: null,
    pendingChanges: 0,
};
let syncPromise: Promise<CloudSyncSnapshot> | null = null;
let syncInterval: number | null = null;
let onlineListenerInstalled = false;

function publish(next: CloudSyncSnapshot): CloudSyncSnapshot {
    snapshot = next;
    listeners.forEach(listener => listener(snapshot));
    return snapshot;
}

export function getCloudSyncSnapshot(): CloudSyncSnapshot {
    return snapshot;
}

export function subscribeCloudSync(listener: (value: CloudSyncSnapshot) => void): () => void {
    listeners.add(listener);
    listener(snapshot);
    return () => listeners.delete(listener);
}

function outboxId(householdId: string, entityType: CloudSyncEntityType, entityId: string): string {
    return `${householdId}:${entityType}:${entityId}`;
}

function asIso(value: unknown, fallback = new Date().toISOString()): string {
    return typeof value === 'string' && !Number.isNaN(Date.parse(value)) ? value : fallback;
}

function asOptionalString(value: unknown): string | undefined {
    return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function asQuantity(value: unknown): number {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

function recordUpdatedAt(record: LocalSyncRecord): string {
    if (record.updatedAt) return record.updatedAt;
    if ('addedAt' in record) return record.addedAt;
    return record.createdAt;
}

function cloudPayload(
    entityType: CloudSyncEntityType,
    record: LocalSyncRecord,
    householdId: string,
    userId: string,
): Record<string, unknown> {
    const createdBy = record.cloudCreatedBy ?? userId;

    if (entityType === 'profile') {
        const profile = record as DbProfile;
        return {
            id: profile.id,
            household_id: householdId,
            name: profile.name,
            avatar: profile.avatar,
            color: profile.color,
            created_by: createdBy,
            created_at: profile.createdAt,
            deleted_at: profile.isDeleted === 1 ? recordUpdatedAt(profile) : null,
        };
    }

    if (entityType === 'inventory') {
        const item = record as DbInventoryItem;
        return {
            id: item.id,
            household_id: householdId,
            profile_id: item.profileId ?? null,
            name: item.name,
            brand: item.brand ?? null,
            quantity: item.quantity,
            category: 'Grocery',
            storage_location: item.storageLocation,
            expiration_date: item.expirationDate,
            date_type: item.dateType,
            status: item.status,
            opened_date: item.openedDate ?? null,
            consumed_at: item.consumedAt ?? null,
            notes: item.notes ?? null,
            is_deleted: item.isDeleted === 1,
            added_at: item.addedAt,
            created_by: createdBy,
        };
    }

    if (entityType === 'shopping') {
        const item = record as DbShoppingItem;
        return {
            id: item.id,
            household_id: householdId,
            profile_id: item.profileId ?? null,
            name: item.name,
            brand: item.brand ?? null,
            quantity: item.quantity,
            category: item.category ?? null,
            metadata: item.metadata ?? null,
            last_bought: item.lastBought ?? null,
            unit: item.unit ?? null,
            is_checked: item.isChecked,
            is_deleted: item.isDeleted === 1,
            added_at: item.addedAt,
            created_by: createdBy,
        };
    }

    const plan = record as DbMealPlan;
    return {
        id: plan.id,
        household_id: householdId,
        week_start_date: plan.weekStartDate,
        meals: plan.meals,
        is_deleted: plan.isDeleted === 1,
        created_by: createdBy,
        created_at: plan.createdAt,
    };
}

function remoteProfile(row: Record<string, unknown>): DbProfile {
    return {
        id: String(row.id),
        name: String(row.name ?? 'Member'),
        avatar: String(row.avatar ?? ''),
        color: String(row.color ?? '#2f6d55'),
        createdAt: asIso(row.created_at),
        updatedAt: asIso(row.updated_at),
        isDeleted: row.deleted_at ? 1 : 0,
        cloudHouseholdId: String(row.household_id),
        cloudCreatedBy: asOptionalString(row.created_by),
        syncPending: 0,
        cloudVersionAt: asIso(row.updated_at),
    };
}

function remoteInventory(row: Record<string, unknown>): DbInventoryItem {
    const storage = row.storage_location;
    const storageLocation = storage === 'freezer' || storage === 'pantry' ? storage : 'fridge';
    const status = row.status === 'expired' || row.status === 'expiring_soon' ? row.status : 'good';
    return {
        id: String(row.id),
        name: String(row.name ?? 'Grocery item'),
        brand: asOptionalString(row.brand),
        quantity: asQuantity(row.quantity),
        expirationDate: String(row.expiration_date),
        dateType: String(row.date_type ?? 'Best By'),
        status,
        storageLocation,
        addedAt: asIso(row.added_at),
        updatedAt: asIso(row.updated_at),
        openedDate: asOptionalString(row.opened_date),
        consumedAt: asOptionalString(row.consumed_at),
        notes: asOptionalString(row.notes),
        profileId: asOptionalString(row.profile_id),
        isDeleted: row.is_deleted ? 1 : 0,
        cloudHouseholdId: String(row.household_id),
        cloudCreatedBy: asOptionalString(row.created_by),
        syncPending: 0,
        cloudVersionAt: asIso(row.updated_at),
    };
}

const SHOPPING_CATEGORIES = new Set(['produce', 'dairy', 'meat', 'frozen', 'pantry', 'beverages', 'other']);

function remoteShopping(row: Record<string, unknown>): DbShoppingItem {
    const category = String(row.category ?? 'other');
    return {
        id: String(row.id),
        name: String(row.name ?? 'Shopping item'),
        brand: asOptionalString(row.brand),
        quantity: asQuantity(row.quantity),
        addedAt: asIso(row.added_at),
        updatedAt: asIso(row.updated_at),
        isChecked: Boolean(row.is_checked),
        isDeleted: row.is_deleted ? 1 : 0,
        category: (SHOPPING_CATEGORIES.has(category) ? category : 'other') as DbShoppingItem['category'],
        metadata: asOptionalString(row.metadata),
        lastBought: asOptionalString(row.last_bought),
        unit: asOptionalString(row.unit),
        profileId: asOptionalString(row.profile_id),
        cloudHouseholdId: String(row.household_id),
        cloudCreatedBy: asOptionalString(row.created_by),
        syncPending: 0,
        cloudVersionAt: asIso(row.updated_at),
    };
}

function remoteMealPlan(row: Record<string, unknown>): DbMealPlan {
    return {
        id: String(row.id),
        weekStartDate: String(row.week_start_date),
        meals: Array.isArray(row.meals) ? row.meals as DbMealPlan['meals'] : [],
        createdAt: asIso(row.created_at),
        updatedAt: asIso(row.updated_at),
        isDeleted: row.is_deleted ? 1 : 0,
        cloudHouseholdId: String(row.household_id),
        cloudCreatedBy: asOptionalString(row.created_by),
        syncPending: 0,
        cloudVersionAt: asIso(row.updated_at),
    };
}

async function claimUnassignedRecords(householdId: string, userId: string): Promise<void> {
    const now = new Date().toISOString();
    await db.transaction(
        'rw',
        db.items,
        db.shoppingList,
        db.mealPlans,
        db.profiles,
        async () => {
            const claim = (record: LocalSyncRecord) => {
                if (record.cloudHouseholdId) return;
                record.cloudHouseholdId = householdId;
                record.cloudCreatedBy ??= userId;
                record.updatedAt ||= 'createdAt' in record ? record.createdAt : 'addedAt' in record ? record.addedAt : now;
                record.syncPending = 1;
            };
            await db.items.toCollection().modify(claim);
            await db.shoppingList.toCollection().modify(claim);
            await db.mealPlans.toCollection().modify(claim);
            await db.profiles.toCollection().modify(claim);
        },
    );
}

export async function countUnassignedLocalRecords(): Promise<number> {
    const counts = await Promise.all([
        db.items.filter(record => !record.cloudHouseholdId).count(),
        db.shoppingList.filter(record => !record.cloudHouseholdId).count(),
        db.mealPlans.filter(record => !record.cloudHouseholdId).count(),
        db.profiles.filter(record => !record.cloudHouseholdId).count(),
    ]);
    return counts.reduce((sum, count) => sum + count, 0);
}

async function pendingRecords(entityType: CloudSyncEntityType, householdId: string): Promise<LocalSyncRecord[]> {
    const isPending = (record: LocalSyncRecord) => (
        record.cloudHouseholdId === householdId && record.syncPending === 1
    );
    if (entityType === 'profile') return (await db.profiles.toArray()).filter(isPending);
    if (entityType === 'inventory') return (await db.items.toArray()).filter(isPending);
    if (entityType === 'shopping') return (await db.shoppingList.toArray()).filter(isPending);
    return (await db.mealPlans.toArray()).filter(isPending);
}

async function capturePendingChanges(householdId: string, userId: string): Promise<void> {
    const now = new Date().toISOString();
    for (const entityType of ENTITY_ORDER) {
        const records = await pendingRecords(entityType, householdId);
        for (const record of records) {
            const id = outboxId(householdId, entityType, record.id);
            const existing = await db.syncOutbox.get(id);
            const entry: DbSyncOutbox = {
                id,
                householdId,
                entityType,
                entityId: record.id,
                localUpdatedAt: recordUpdatedAt(record),
                payload: JSON.stringify(cloudPayload(entityType, record, householdId, userId)),
                attempts: existing?.attempts ?? 0,
                nextAttemptAt: existing?.nextAttemptAt ?? now,
                lastError: existing?.lastError,
                createdAt: existing?.createdAt ?? now,
                updatedAt: now,
                baseCloudUpdatedAt: existing?.baseCloudUpdatedAt ?? record.cloudVersionAt,
                conflictRemotePayload: existing?.conflictRemotePayload,
            };
            await db.syncOutbox.put(entry);
        }
    }
}

async function resolveMealPlanTarget(
    client: SupabaseClient,
    payload: Record<string, unknown>,
): Promise<Record<string, unknown>> {
    const { data, error } = await client
        .from('meal_plans')
        .select('id, created_by')
        .eq('household_id', payload.household_id)
        .eq('week_start_date', payload.week_start_date)
        .maybeSingle();
    if (error) throw error;
    if (!data || data.id === payload.id) return payload;
    return { ...payload, id: data.id, created_by: data.created_by };
}

async function markPushSucceeded(entry: DbSyncOutbox, remote: Record<string, unknown>): Promise<void> {
    const remoteUpdatedAt = asIso(remote.updated_at);
    const targetId = String(remote.id);

    if (entry.entityType === 'profile') {
        const local = await db.profiles.get(entry.entityId);
        if (local?.updatedAt === entry.localUpdatedAt) {
            await db.profiles.update(entry.entityId, {
                updatedAt: remoteUpdatedAt,
                cloudVersionAt: remoteUpdatedAt,
                cloudCreatedBy: asOptionalString(remote.created_by),
                syncPending: 0,
            });
        }
    } else if (entry.entityType === 'inventory') {
        const local = await db.items.get(entry.entityId);
        if (local?.updatedAt === entry.localUpdatedAt) {
            await db.items.update(entry.entityId, {
                updatedAt: remoteUpdatedAt,
                cloudVersionAt: remoteUpdatedAt,
                cloudCreatedBy: asOptionalString(remote.created_by),
                syncPending: 0,
            });
        }
    } else if (entry.entityType === 'shopping') {
        const local = await db.shoppingList.get(entry.entityId);
        if (local?.updatedAt === entry.localUpdatedAt) {
            await db.shoppingList.update(entry.entityId, {
                updatedAt: remoteUpdatedAt,
                cloudVersionAt: remoteUpdatedAt,
                cloudCreatedBy: asOptionalString(remote.created_by),
                syncPending: 0,
            });
        }
    } else {
        const local = await db.mealPlans.get(entry.entityId);
        if (local?.updatedAt === entry.localUpdatedAt) {
            if (targetId !== entry.entityId) {
                await db.transaction('rw', db.mealPlans, async () => {
                    await db.mealPlans.delete(entry.entityId);
                    await db.mealPlans.put(remoteMealPlan(remote));
                });
            } else {
                await db.mealPlans.update(entry.entityId, {
                    updatedAt: remoteUpdatedAt,
                    cloudVersionAt: remoteUpdatedAt,
                    cloudCreatedBy: asOptionalString(remote.created_by),
                    syncPending: 0,
                });
            }
        }
    }

    await db.syncOutbox.delete(entry.id);
}

function cloudTable(entityType: CloudSyncEntityType): string {
    if (entityType === 'profile') return 'household_profiles';
    if (entityType === 'inventory') return 'inventory_items';
    if (entityType === 'shopping') return 'shopping_items';
    return 'meal_plans';
}

async function flushOutbox(
    client: SupabaseClient,
    householdId: string,
): Promise<{ errors: string[]; conflicts: number }> {
    const now = new Date().toISOString();
    const entries = (await db.syncOutbox.where('householdId').equals(householdId).toArray())
        .filter(entry => entry.nextAttemptAt <= now)
        .sort((a, b) => ENTITY_ORDER.indexOf(a.entityType) - ENTITY_ORDER.indexOf(b.entityType));
    const errors: string[] = [];
    let conflicts = 0;

    for (const entry of entries) {
        try {
            let payload = JSON.parse(entry.payload) as Record<string, unknown>;
            if (entry.entityType === 'meal-plan') payload = await resolveMealPlanTarget(client, payload);

            const { data: remoteExisting, error: remoteError } = await client
                .from(cloudTable(entry.entityType))
                .select('*')
                .eq('id', payload.id)
                .maybeSingle();
            if (remoteError) throw remoteError;
            const remoteUpdatedAt = remoteExisting
                ? asIso((remoteExisting as Record<string, unknown>).updated_at)
                : undefined;
            if (
                remoteExisting
                && entry.baseCloudUpdatedAt
                && remoteUpdatedAt !== entry.baseCloudUpdatedAt
            ) {
                await db.syncOutbox.update(entry.id, {
                    conflictRemotePayload: JSON.stringify(remoteExisting),
                    lastError: 'Cloud record changed on another device.',
                    nextAttemptAt: '9999-12-31T23:59:59.999Z',
                    updatedAt: new Date().toISOString(),
                });
                conflicts += 1;
                continue;
            }

            const { data, error } = await client
                .from(cloudTable(entry.entityType))
                .upsert(payload, { onConflict: 'id' })
                .select('*')
                .single();
            if (error) throw error;
            await markPushSucceeded(entry, data as Record<string, unknown>);
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Cloud push failed.';
            const attempts = entry.attempts + 1;
            const delay = Math.min(300_000, 2 ** Math.min(attempts, 8) * 1_000);
            await db.syncOutbox.update(entry.id, {
                attempts,
                lastError: message,
                nextAttemptAt: new Date(Date.now() + delay).toISOString(),
                updatedAt: new Date().toISOString(),
            });
            errors.push(`${entry.entityType}: ${message}`);
        }
    }

    return { errors, conflicts };
}

async function fetchRemoteRows(
    client: SupabaseClient,
    entityType: CloudSyncEntityType,
    householdId: string,
    cursor: string,
): Promise<Record<string, unknown>[]> {
    const rows: Record<string, unknown>[] = [];
    let offset = 0;

    while (true) {
        const { data, error } = await client
            .from(cloudTable(entityType))
            .select('*')
            .eq('household_id', householdId)
            .gte('updated_at', cursor)
            .order('updated_at', { ascending: true })
            .order('id', { ascending: true })
            .range(offset, offset + PAGE_SIZE - 1);
        if (error) throw error;

        const page = (data ?? []) as Record<string, unknown>[];
        rows.push(...page);
        if (page.length < PAGE_SIZE) break;
        offset += PAGE_SIZE;
    }

    return rows;
}

async function applyRemoteRow(
    entityType: CloudSyncEntityType,
    row: Record<string, unknown>,
    force = false,
): Promise<void> {
    const id = String(row.id);
    if (entityType === 'profile') {
        const local = await db.profiles.get(id);
        if (!force && local?.syncPending === 1) return;
        await db.profiles.put(remoteProfile(row));
    } else if (entityType === 'inventory') {
        const local = await db.items.get(id);
        if (!force && local?.syncPending === 1) return;
        await db.items.put(remoteInventory(row));
    } else if (entityType === 'shopping') {
        const local = await db.shoppingList.get(id);
        if (!force && local?.syncPending === 1) return;
        await db.shoppingList.put(remoteShopping(row));
    } else {
        const local = await db.mealPlans.get(id);
        if (!force && local?.syncPending === 1) return;
        await db.mealPlans.put(remoteMealPlan(row));
    }
}

async function pullCloudChanges(client: SupabaseClient, householdId: string, cursor: string): Promise<string> {
    let nextCursor = cursor;

    for (const entityType of ENTITY_ORDER) {
        const rows = await fetchRemoteRows(client, entityType, householdId, cursor);
        for (const row of rows) {
            await applyRemoteRow(entityType, row);
            const updatedAt = asIso(row.updated_at, cursor);
            if (updatedAt > nextCursor) nextCursor = updatedAt;
        }
    }

    return nextCursor;
}

async function currentSession(): Promise<{ client: SupabaseClient; user: User; householdId: string } | null> {
    if (!supabase) return null;
    const { data, error } = await supabase.auth.getSession();
    if (error || !data.session?.user) return null;
    const householdId = getActiveCloudHouseholdId();
    if (!householdId) return null;
    return { client: supabase, user: data.session.user, householdId };
}

async function performSync(): Promise<CloudSyncSnapshot> {
    const session = await currentSession();
    if (!session) {
        return publish({ status: isCloudConfigured ? 'signed-out' : 'disabled', householdId: null, pendingChanges: 0 });
    }

    const { client, user, householdId } = session;
    const existingState = await db.syncState.get(householdId);
    const pendingBefore = await db.syncOutbox.where('householdId').equals(householdId).count();
    const localMigrationCount = await countUnassignedLocalRecords();

    if (typeof navigator !== 'undefined' && !navigator.onLine) {
        return publish({
            status: 'offline',
            householdId,
            pendingChanges: pendingBefore,
            lastSuccessfulSyncAt: existingState?.lastSuccessfulSyncAt,
            localMigrationCount,
        });
    }

    publish({
        status: 'syncing',
        householdId,
        pendingChanges: pendingBefore,
        lastSuccessfulSyncAt: existingState?.lastSuccessfulSyncAt,
        localMigrationCount,
    });

    const attemptedAt = new Date().toISOString();
    try {
        await capturePendingChanges(householdId, user.id);
        const pushResult = await flushOutbox(client, householdId);
        const conflictCount = (await db.syncOutbox.where('householdId').equals(householdId).toArray())
            .filter(entry => entry.conflictRemotePayload).length;
        const cursor = await pullCloudChanges(client, householdId, existingState?.pullCursor ?? EPOCH);
        const pendingChanges = await db.syncOutbox.where('householdId').equals(householdId).count();
        const completedAt = new Date().toISOString();
        const lastError = pushResult.errors.length > 0
            ? pushResult.errors[0]
            : conflictCount > 0
                ? 'Cloud records changed on another device.'
                : undefined;
        const state: DbSyncState = {
            id: householdId,
            householdId,
            pullCursor: cursor,
            lastAttemptAt: attemptedAt,
            lastSuccessfulSyncAt: pushResult.errors.length === 0 && conflictCount === 0
                ? completedAt
                : existingState?.lastSuccessfulSyncAt,
            lastError,
            initialClaimCompleted: existingState?.initialClaimCompleted ?? 0,
        };
        await db.syncState.put(state);

        return publish({
            status: pushResult.errors.length === 0 && conflictCount === 0 ? 'idle' : 'error',
            householdId,
            pendingChanges,
            lastSuccessfulSyncAt: state.lastSuccessfulSyncAt,
            error: lastError,
            localMigrationCount,
            conflictCount,
        });
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Cloud synchronization failed.';
        await db.syncState.put({
            id: householdId,
            householdId,
            pullCursor: existingState?.pullCursor,
            lastAttemptAt: attemptedAt,
            lastSuccessfulSyncAt: existingState?.lastSuccessfulSyncAt,
            lastError: message,
            initialClaimCompleted: existingState?.initialClaimCompleted ?? 0,
        });
        const pendingChanges = await db.syncOutbox.where('householdId').equals(householdId).count();
        return publish({
            status: 'error',
            householdId,
            pendingChanges,
            lastSuccessfulSyncAt: existingState?.lastSuccessfulSyncAt,
            error: message,
            localMigrationCount,
        });
    }
}

export async function migrateLocalDataToActiveHousehold(): Promise<CloudSyncSnapshot> {
    const session = await currentSession();
    if (!session) throw new Error('Sign in and select a household before migrating local data.');
    await claimUnassignedRecords(session.householdId, session.user.id);
    const state = await db.syncState.get(session.householdId);
    await db.syncState.put({
        id: session.householdId,
        householdId: session.householdId,
        pullCursor: state?.pullCursor,
        lastAttemptAt: state?.lastAttemptAt,
        lastSuccessfulSyncAt: state?.lastSuccessfulSyncAt,
        lastError: state?.lastError,
        initialClaimCompleted: 1,
    });
    return syncNow();
}

export async function resolveAllSyncConflicts(choice: 'device' | 'cloud'): Promise<CloudSyncSnapshot> {
    const session = await currentSession();
    if (!session) throw new Error('Sign in before resolving sync conflicts.');
    const entries = (await db.syncOutbox.where('householdId').equals(session.householdId).toArray())
        .filter(entry => entry.conflictRemotePayload);

    for (const entry of entries) {
        const remote = JSON.parse(entry.conflictRemotePayload!) as Record<string, unknown>;
        if (choice === 'cloud') {
            await db.syncOutbox.delete(entry.id);
            await applyRemoteRow(entry.entityType, remote, true);
        } else {
            await db.syncOutbox.update(entry.id, {
                baseCloudUpdatedAt: asIso(remote.updated_at),
                conflictRemotePayload: undefined,
                lastError: undefined,
                attempts: 0,
                nextAttemptAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
            });
        }
    }
    return syncNow();
}

export function syncNow(): Promise<CloudSyncSnapshot> {
    if (syncPromise) return syncPromise;
    syncPromise = performSync().finally(() => {
        syncPromise = null;
    });
    return syncPromise;
}

export function startCloudSync(): void {
    if (!isCloudConfigured || typeof window === 'undefined') return;
    if (!onlineListenerInstalled) {
        window.addEventListener('online', syncNow);
        onlineListenerInstalled = true;
    }
    if (syncInterval === null) {
        syncInterval = window.setInterval(() => void syncNow(), SYNC_INTERVAL_MS);
    }
    void syncNow();
}

export function stopCloudSync(): void {
    if (typeof window !== 'undefined' && onlineListenerInstalled) {
        window.removeEventListener('online', syncNow);
        onlineListenerInstalled = false;
    }
    if (syncInterval !== null && typeof window !== 'undefined') {
        window.clearInterval(syncInterval);
        syncInterval = null;
    }
}
