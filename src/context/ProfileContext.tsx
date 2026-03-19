import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { db } from '../db/database';
import type { DbProfile } from '../db/database';
import { useLiveQuery } from 'dexie-react-hooks';
import { generateUUID } from '../utils/uuid';

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
    const [activeProfileId, setActiveProfileId] = useState<string | null>(() => {
        return localStorage.getItem(ACTIVE_PROFILE_KEY) || null;
    });

    // Live query for all profiles
    const profiles = useLiveQuery(
        () => db.profiles.orderBy('createdAt').toArray(),
        [],
        []
    );

    const activeProfile = profiles.find(p => p.id === activeProfileId) || null;
    const isHousehold = activeProfileId === null;

    const switchProfile = useCallback((profileId: string | null) => {
        setActiveProfileId(profileId);
        if (profileId) {
            localStorage.setItem(ACTIVE_PROFILE_KEY, profileId);
        } else {
            localStorage.removeItem(ACTIVE_PROFILE_KEY);
        }
    }, []);

    const createProfile = useCallback(async (name: string, avatar: string, color: string): Promise<DbProfile> => {
        const profile: DbProfile = {
            id: generateUUID(),
            name,
            avatar,
            color,
            createdAt: new Date().toISOString(),
        };
        await db.profiles.add(profile);
        return profile;
    }, []);

    const updateProfile = useCallback(async (id: string, updates: Partial<Omit<DbProfile, 'id' | 'createdAt'>>) => {
        await db.profiles.update(id, updates);
    }, []);

    const deleteProfile = useCallback(async (id: string) => {
        // If deleting the active profile, switch to Household
        if (activeProfileId === id) {
            switchProfile(null);
        }
        // Reassign items from this profile to Household (remove profileId)
        await db.items.where('profileId').equals(id).modify({ profileId: undefined });
        await db.shoppingList.where('profileId').equals(id).modify({ profileId: undefined });
        await db.profiles.delete(id);
    }, [activeProfileId, switchProfile]);

    // Validate active profile still exists
    useEffect(() => {
        if (activeProfileId && profiles.length > 0 && !profiles.find(p => p.id === activeProfileId)) {
            switchProfile(null);
        }
    }, [activeProfileId, profiles, switchProfile]);

    return (
        <ProfileContext.Provider value={{
            profiles,
            activeProfileId,
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
