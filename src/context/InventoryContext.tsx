import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import type { InventoryItem } from '../types';
import { db, initializeDatabase } from '../db/database';
import { useLiveQuery } from 'dexie-react-hooks';
import { ImpactService } from '../services/impactService';
import { generateUUID } from '../utils/uuid';
import { calculateOpenedExpiration } from '../services/shelfLifeService';
import { useProfile } from './ProfileContext';

interface Stats {
    totalItems: number;
    expiringSoon: number;
    expired: number;
    itemsSaved: number;
    itemsWasted: number;
}

interface InventoryContextType {
    items: InventoryItem[];
    stats: Stats;
    isLoading: boolean;
    addItem: (item: Omit<InventoryItem, 'id' | 'addedAt' | 'status'>) => Promise<void>;
    removeItem: (id: string) => Promise<void>;
    updateItem: (id: string, updates: Partial<InventoryItem>) => Promise<void>;
    consumeItem: (id: string) => Promise<void>;
    refreshStatuses: () => Promise<void>;
}

const InventoryContext = createContext<InventoryContextType | undefined>(undefined);

function calculateStatus(
    expirationDate: string,
    openedDate?: string,
    itemName?: string
): InventoryItem['status'] {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    let effectiveExpiration = expirationDate;

    // If item is opened, recalculate expiration based on shelf life
    if (openedDate && itemName) {
        const recalculated = calculateOpenedExpiration(openedDate, itemName);
        if (recalculated) {
            effectiveExpiration = recalculated;
        }
    }

    const expDate = new Date(effectiveExpiration);
    expDate.setHours(0, 0, 0, 0);
    const diffTime = expDate.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays < 0) return 'expired';
    if (diffDays <= 3) return 'expiring_soon';
    return 'good';
}

export function InventoryProvider({ children }: { children: React.ReactNode }) {
    const [isLoading, setIsLoading] = useState(true);
    const { activeProfileId, isHousehold } = useProfile();

    // Initialize database on mount
    useEffect(() => {
        initializeDatabase()
            .then(() => setIsLoading(false))
            .catch(err => {
                console.error('Database init failed:', err);
                setIsLoading(false);
            });
    }, []);

    // Live query for items - filtered by active profile
    // Household (null) = show ALL items (shared view)
    // Specific profile = show items for that profile + unassigned items
    const dbItems = useLiveQuery(
        () => db.items.where('isDeleted').equals(0).toArray().then(allItems => {
            if (isHousehold) return allItems;
            return allItems.filter(item =>
                !item.profileId || item.profileId === activeProfileId
            );
        }),
        [activeProfileId, isHousehold],
        []
    );

    // Live query for stats
    const dbStats = useLiveQuery(
        () => db.stats.get('global'),
        [],
        null
    );

    // Map DB items to app items with status calculation
    const items: InventoryItem[] = (dbItems || []).map(item => ({
        ...item,
        status: calculateStatus(item.expirationDate, item.openedDate, item.name),
        brand: item.brand || undefined,
        consumedAt: item.consumedAt || undefined,
        openedDate: item.openedDate || undefined,
    }));

    const stats: Stats = {
        totalItems: items.length,
        expiringSoon: items.filter(i => i.status === 'expiring_soon').length,
        expired: items.filter(i => i.status === 'expired').length,
        itemsSaved: dbStats?.itemsSaved || 0,
        itemsWasted: dbStats?.itemsWasted || 0,
    };

    const addItem = useCallback(async (item: Omit<InventoryItem, 'id' | 'addedAt' | 'status'>) => {
        try {
            const status = calculateStatus(item.expirationDate, item.openedDate, item.name);
            const now = new Date().toISOString();
            const id = generateUUID();

            // Explicit object to avoid spreading issues
            const newItem = {
                id,
                name: item.name,
                brand: item.brand || '',
                expirationDate: item.expirationDate,
                dateType: item.dateType,
                addedAt: now,
                updatedAt: now,
                status,
                quantity: item.quantity || 1,
                storageLocation: item.storageLocation || 'fridge',
                isDeleted: 0,
                openedDate: item.openedDate || undefined,
                profileId: activeProfileId || undefined, // Associate with active profile
            };

            console.log('Adding item to database:', JSON.stringify(newItem, null, 2));

            await db.items.add(newItem);
            console.log('Item added successfully with id:', id);

            // Update stats (don't fail if this doesn't work)
            try {
                await db.stats.update('global', { lastActiveDate: now });
            } catch (statsError) {
                console.warn('Stats update failed (non-critical):', statsError);
            }
        } catch (error) {
            console.error('Failed to add item. Full error:', error);
            if (error instanceof Error) {
                console.error('Error name:', error.name);
                console.error('Error message:', error.message);
                console.error('Error stack:', error.stack);
            }
            throw error;
        }
    }, [activeProfileId]);

    const removeItem = useCallback(async (id: string) => {
        const item = await db.items.get(id);

        if (item) {
            // Soft delete with number value for isDeleted
            await db.items.update(id, {
                isDeleted: 1,
                updatedAt: new Date().toISOString(),
            });

            // Update waste stats if expired
            if (item.status === 'expired') {
                const currentStats = await db.stats.get('global');
                if (currentStats) {
                    await db.stats.update('global', {
                        itemsWasted: currentStats.itemsWasted + 1,
                        lastActiveDate: new Date().toISOString(),
                    });
                }
            }
        }
    }, []);

    const updateItem = useCallback(async (id: string, updates: Partial<InventoryItem>) => {
        const item = await db.items.get(id);

        const updateData: Partial<InventoryItem & { updatedAt: string }> = {
            ...updates,
            updatedAt: new Date().toISOString(),
        };

        // Recalculate status if expiration date or opened date changed
        if (updates.expirationDate || updates.openedDate) {
            const expDate = updates.expirationDate || item?.expirationDate || '';
            const openedDate = updates.openedDate !== undefined ? updates.openedDate : item?.openedDate;
            const itemName = item?.name || '';
            updateData.status = calculateStatus(expDate, openedDate, itemName);
        }

        await db.items.update(id, updateData);
    }, []);

    const consumeItem = useCallback(async (id: string) => {
        const item = await db.items.get(id);

        if (item) {
            if (item.quantity > 1) {
                await updateItem(id, { quantity: item.quantity - 1 });
            } else {
                // Mark as consumed (soft delete with consumption tracking)
                await db.items.update(id, {
                    isDeleted: 1,
                    consumedAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString(),
                });

                // Update saved stats
                const currentStats = await db.stats.get('global');
                if (currentStats) {
                    await db.stats.update('global', {
                        itemsSaved: currentStats.itemsSaved + 1,
                        lastActiveDate: new Date().toISOString(),
                    });
                }

                // Record environmental impact and check for new badges
                try {
                    const newBadges = await ImpactService.recordItemSaved();
                    if (newBadges.length > 0) {
                        console.log('New badges earned:', newBadges);
                    }
                } catch (impactError) {
                    console.warn('Impact tracking failed (non-critical):', impactError);
                }
            }
        }
    }, [updateItem]);

    const refreshStatuses = useCallback(async () => {
        const allItems = await db.items.where('isDeleted').equals(0).toArray();

        await db.transaction('rw', db.items, async () => {
            for (const item of allItems) {
                const newStatus = calculateStatus(item.expirationDate, item.openedDate, item.name);
                if (newStatus !== item.status) {
                    await db.items.update(item.id, {
                        status: newStatus,
                        updatedAt: new Date().toISOString(),
                    });
                }
            }
        });
    }, []);

    return (
        <InventoryContext.Provider value={{
            items,
            stats,
            isLoading,
            addItem,
            removeItem,
            updateItem,
            consumeItem,
            refreshStatuses
        }}>
            {children}
        </InventoryContext.Provider>
    );
}

export function useInventory() {
    const context = useContext(InventoryContext);
    if (context === undefined) {
        throw new Error('useInventory must be used within an InventoryProvider');
    }
    return context;
}
