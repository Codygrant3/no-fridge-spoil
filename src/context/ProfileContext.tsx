import React, { createContext, useContext, useState, useCallback } from 'react';
import { db } from '../db/database';
import type { DbProfile } from '../db/database';
import { useLiveQuery } from 'dexie-react-hooks';
import { generateUUID } from '../utils/uuid';
import { useOptionalAuth } from './AuthContext';
import { belongsToActiveHousehold, localMutationFields } from '../services/localMutationService';
import { readLocalValue, removeLocalValue, writeLocalValue } from '../services/safeStorage';

interface ProfileContextType {
    profiles: DbProfile[];
    activeProfileId: string | null; // null = "Household" (shared)
    activeProfile: DbProfile | null;
    switchProfile: (profileId: string | null) => void;
    createProfile: (name: string, avatar: string, color: string) => Promise<DbProfile>;
    updateProfile: (id: string, updates: Partial<Omit<DbProfile, 'id' | 'createdAt'>>) => Promise<void>;
    deleteProfile: (id: string) => Promise<void>;
    isHousehold: boolean;
}

const ProfileContext = createContext<ProfileContextType | undefined>(undefined);

const ACTIVE_PROFILE_KEY = 'nfs_active_profile';

// Default avatar emojis for profile creation
export const PROFILE_AVATARS = ['👤', '👩', '👨', '👧', '👦', '🧑‍🍳', '👵', '👴', '🐱', '🐶'];
export const PROFILE_COLORS = ['#4ade80', '#3b82f6', '#f59e0b', '#ef4444', '#a855f7', '#ec4899', '#06b6d4', '#f97316'];

export function ProfileProvider({ children }: { children: React.ReactNode }) {
    const auth = useOptionalAuth();
    const configured = auth?.configured ?? false;
    const activeHousehold = auth?.activeHousehold ?? null;
    const [activeProfileId, setActiveProfileId] = useState<string | null>(() => {
        return readLocalValue(ACTIVE_PROFILE_KEY) || null;
    });

    // Live query for all profiles
    const profiles = useLiveQuery(
        () => db.profiles.orderBy('createdAt').toArray().then(records => records.filter(profile => (
            profile.isDeleted !== 1
            && belongsToActiveHousehold(profile, configured, activeHousehold?.id ?? null)
        ))),
        [configured, activeHousehold?.id],
        []
    );

    const activeProfile = profiles.find(p => p.id === activeProfileId) || null;
    const resolvedActiveProfileId = activeProfile ? activeProfileId : null;
    const isHousehold = resolvedActiveProfileId === null;

    const switchProfile = useCallback((profileId: string | null) => {
        setActiveProfileId(profileId);
        if (profileId) {
            writeLocalValue(ACTIVE_PROFILE_KEY, profileId);
        } else {
            removeLocalValue(ACTIVE_PROFILE_KEY);
        }
    }, []);

    const createProfile = useCallback(async (name: string, avatar: string, color: string): Promise<DbProfile> => {
        const profile: DbProfile = {
            id: generateUUID(),
            name,
            avatar,
            color,
            createdAt: new Date().toISOString(),
            ...localMutationFields(),
            isDeleted: 0,
        };
        await db.profiles.add(profile);
        return profile;
    }, []);

    const updateProfile = useCallback(async (id: string, updates: Partial<Omit<DbProfile, 'id' | 'createdAt'>>) => {
        const profile = await db.profiles.get(id);
        if (!profile) return;
        await db.profiles.update(id, {
            ...updates,
            ...localMutationFields(profile.cloudHouseholdId),
        });
    }, []);

    const deleteProfile = useCallback(async (id: string) => {
        // If deleting the active profile, switch to Household
        if (activeProfileId === id) {
            switchProfile(null);
        }
        const profile = await db.profiles.get(id);
        if (!profile) return;
        const mutation = localMutationFields(profile.cloudHouseholdId);

        await db.transaction('rw', db.items, db.shoppingList, db.profiles, async () => {
            await db.items.where('profileId').equals(id).modify(item => {
                item.profileId = undefined;
                Object.assign(item, localMutationFields(item.cloudHouseholdId));
            });
            await db.shoppingList.where('profileId').equals(id).modify(item => {
                item.profileId = undefined;
                Object.assign(item, localMutationFields(item.cloudHouseholdId));
            });
            await db.profiles.update(id, {
                isDeleted: 1,
                ...mutation,
            });
        });
    }, [activeProfileId, switchProfile]);

    return (
        <ProfileContext.Provider value={{
            profiles,
            activeProfileId: resolvedActiveProfileId,
            activeProfile,
            switchProfile,
            createProfile,
            updateProfile,
            deleteProfile,
            isHousehold,
        }}>
            {children}
        </ProfileContext.Provider>
    );
}

export function useProfile() {
    const context = useContext(ProfileContext);
    if (context === undefined) {
        throw new Error('useProfile must be used within a ProfileProvider');
    }
    return context;
}
