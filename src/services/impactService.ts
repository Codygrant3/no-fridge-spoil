import { db } from '../db/database';

// Estimated environmental impact per food item (rough averages)
const IMPACT_PER_ITEM = {
    co2Kg: 2.5,      // Average CO2 saved per item not wasted (kg)
    waterL: 100,     // Average water saved per item not wasted (liters)
    moneyUsd: 3.50,  // Average value per item saved
    xp: 50,          // XP earned per item saved
};

// Level titles with thresholds
export const LEVEL_TITLES: { [key: number]: string } = {
    1: 'Eco Beginner',
    2: 'Food Saver',
    3: 'Waste Fighter',
    4: 'Green Guardian',
    5: 'Planet Protector',
    6: 'Sustainability Star',
    7: 'Earth Champion',
    8: 'Climate Hero',
    9: 'Environmental Master',
    10: 'Planet Guardian',
    11: 'Eco Legend',
    12: 'Zero Waste Warrior',
};

export interface Badge {
    id: string;
    name: string;
    description: string;
    icon: string;
    requirement: number;
    type: 'itemsSaved' | 'streak' | 'co2' | 'special';
    unlocked?: boolean;
}

export const BADGES: Badge[] = [
    // Items Saved Badges
    { id: 'first-save', name: 'First Save', description: 'Saved your first item from waste', icon: '🌱', requirement: 1, type: 'itemsSaved' },
    { id: 'waste-warrior', name: 'Waste Warrior', description: 'Saved 25 items from waste', icon: '🛡️', requirement: 25, type: 'itemsSaved' },
    { id: 'food-hero', name: 'Food Hero', description: 'Saved 50 items from waste', icon: '🦸', requirement: 50, type: 'itemsSaved' },
    { id: 'planet-protector', name: 'Planet Protector', description: 'Saved 100 items from waste', icon: '🌍', requirement: 100, type: 'itemsSaved' },

    // Special Badges (matching design)
    { id: 'planner-pro', name: 'Planner Pro', description: 'Added 10 items to shopping list', icon: '📋', requirement: 10, type: 'special' },
    { id: 'zero-hero', name: 'Zero Hero', description: 'Zero waste for a full week', icon: '✅', requirement: 7, type: 'streak' },
    { id: 'compost-king', name: 'Compost King', description: 'Properly disposed of 20 items', icon: '♻️', requirement: 20, type: 'special' },
    { id: 'bulk-buyer', name: 'Bulk Buyer', description: 'Bought items in bulk 5 times', icon: '🛒', requirement: 5, type: 'special' },
    { id: 'perfect-month', name: 'Perfect Month', description: 'No waste for a full month', icon: '⭐', requirement: 30, type: 'streak' },

    // CO2 Badges
    { id: 'carbon-cutter', name: 'Carbon Cutter', description: 'Saved 10kg of CO2', icon: '💨', requirement: 10, type: 'co2' },
    { id: 'climate-champion', name: 'Climate Champion', description: 'Saved 50kg of CO2', icon: '🏆', requirement: 50, type: 'co2' },
    { id: 'earth-guardian', name: 'Earth Guardian', description: 'Saved 100kg of CO2', icon: '🌟', requirement: 100, type: 'co2' },
];

// Calculate XP needed for next level
export function getXpForLevel(level: number): number {
    return level * 250;
}

// Calculate level from XP
export function getLevelFromXp(xp: number): number {
    return Math.floor(xp / 250) + 1;
}

// Get level title
export function getLevelTitle(level: number): string {
    return LEVEL_TITLES[Math.min(level, 12)] || LEVEL_TITLES[12];
}

// Get progress to next level (0-100)
export function getLevelProgress(xp: number): number {
    const currentLevel = getLevelFromXp(xp);
    const xpForCurrentLevel = (currentLevel - 1) * 250;
    const xpForNextLevel = currentLevel * 250;
    const progressXp = xp - xpForCurrentLevel;
    const neededXp = xpForNextLevel - xpForCurrentLevel;
    return Math.round((progressXp / neededXp) * 100);
}

export const ImpactService = {
    /**
     * Calculate environmental impact when an item is consumed (saved from waste)
     */
    async recordItemSaved(): Promise<string[]> {
        const stats = await db.stats.get('global');
        if (!stats) return [];

        const newCo2 = (stats.co2SavedKg || 0) + IMPACT_PER_ITEM.co2Kg;
        const newWater = (stats.waterSavedL || 0) + IMPACT_PER_ITEM.waterL;
        const newMoney = (stats.moneySaved || 0) + IMPACT_PER_ITEM.moneyUsd;
        const newXp = (stats.xp || 0) + IMPACT_PER_ITEM.xp;
        const newLevel = getLevelFromXp(newXp);

        // Check for new badges
        const currentBadges = stats.badges || [];
        const newBadges = this.checkBadges(stats.itemsSaved + 1, newCo2, currentBadges);

        await db.stats.update('global', {
            co2SavedKg: newCo2,
            waterSavedL: newWater,
            moneySaved: newMoney,
            xp: newXp,
            level: newLevel,
            badges: [...currentBadges, ...newBadges],
        });

        return newBadges;
    },

    /**
     * Check which badges should be unlocked
     */
    checkBadges(itemsSaved: number, co2Saved: number, currentBadges: string[]): string[] {
        const newBadges: string[] = [];

        for (const badge of BADGES) {
            if (currentBadges.includes(badge.id)) continue;

            let earned = false;
            if (badge.type === 'itemsSaved' && itemsSaved >= badge.requirement) {
                earned = true;
            } else if (badge.type === 'co2' && co2Saved >= badge.requirement) {
                earned = true;
            }

            if (earned) {
                newBadges.push(badge.id);
            }
        }

        return newBadges;
    },

    /**
     * Get badge details by ID
     */
    getBadgeById(id: string): Badge | undefined {
        return BADGES.find(b => b.id === id);
    },

    /**
     * Get all unlocked badges from the stats
     */
    async getUnlockedBadges(): Promise<Badge[]> {
        const stats = await db.stats.get('global');
        if (!stats || !stats.badges) return [];

        return stats.badges
            .map(id => this.getBadgeById(id))
            .filter((b): b is Badge => b !== undefined);
    },
};
