import { getActiveCloudHouseholdId } from './cloudSessionService';

export interface HouseholdScopedLocalRecord {
    cloudHouseholdId?: string;
}

export function localMutationFields(existingHouseholdId?: string): {
    updatedAt: string;
    syncPending: number;
    cloudHouseholdId?: string;
} {
    return {
        updatedAt: new Date().toISOString(),
        syncPending: 1,
        cloudHouseholdId: existingHouseholdId ?? getActiveCloudHouseholdId() ?? undefined,
    };
}

export function belongsToActiveHousehold(
    record: HouseholdScopedLocalRecord,
    cloudConfigured: boolean,
    activeHouseholdId: string | null,
): boolean {
    if (!cloudConfigured) return true;
    if (!record.cloudHouseholdId) return true;
    return record.cloudHouseholdId === activeHouseholdId;
}
