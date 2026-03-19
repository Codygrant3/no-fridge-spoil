import { describe, it, expect } from 'vitest';
import {
  getXpForLevel,
  getLevelFromXp,
  getLevelTitle,
  getLevelProgress,
  ImpactService,
  BADGES,
  LEVEL_TITLES,
} from '../../services/impactService';

describe('impactService', () => {
  describe('getXpForLevel', () => {
    it('should return 250 XP for level 1', () => {
      expect(getXpForLevel(1)).toBe(250);
    });

    it('should return 500 XP for level 2', () => {
      expect(getXpForLevel(2)).toBe(500);
    });

    it('should return 2500 XP for level 10', () => {
      expect(getXpForLevel(10)).toBe(2500);
    });

    it('should scale linearly with level', () => {
      expect(getXpForLevel(5)).toBe(1250);
      expect(getXpForLevel(12)).toBe(3000);
    });
  });

  describe('getLevelFromXp', () => {
    it('should return level 1 for 0 XP', () => {
      expect(getLevelFromXp(0)).toBe(1);
    });

    it('should return level 1 for 249 XP', () => {
      expect(getLevelFromXp(249)).toBe(1);
    });

    it('should return level 2 for 250 XP', () => {
      expect(getLevelFromXp(250)).toBe(2);
    });

    it('should return level 2 for 499 XP', () => {
      expect(getLevelFromXp(499)).toBe(2);
    });

    it('should return level 3 for 500 XP', () => {
      expect(getLevelFromXp(500)).toBe(3);
    });

    it('should return level 5 for 1000 XP', () => {
      expect(getLevelFromXp(1000)).toBe(5);
    });

    it('should return level 11 for 2500 XP', () => {
      expect(getLevelFromXp(2500)).toBe(11);
    });

    it('should handle large XP values', () => {
      expect(getLevelFromXp(10000)).toBe(41);
    });
  });

  describe('getLevelTitle', () => {
    it('should return "Eco Beginner" for level 1', () => {
      expect(getLevelTitle(1)).toBe('Eco Beginner');
    });

    it('should return "Food Saver" for level 2', () => {
      expect(getLevelTitle(2)).toBe('Food Saver');
    });

    it('should return "Planet Guardian" for level 10', () => {
      expect(getLevelTitle(10)).toBe('Planet Guardian');
    });

    it('should return "Zero Waste Warrior" for level 12', () => {
      expect(getLevelTitle(12)).toBe('Zero Waste Warrior');
    });

    it('should cap at level 12 title for levels above 12', () => {
      expect(getLevelTitle(13)).toBe('Zero Waste Warrior');
      expect(getLevelTitle(100)).toBe('Zero Waste Warrior');
    });

    it('should have titles for all levels 1-12', () => {
      for (let level = 1; level <= 12; level++) {
        expect(LEVEL_TITLES[level]).toBeDefined();
        expect(typeof getLevelTitle(level)).toBe('string');
      }
    });
  });

  describe('getLevelProgress', () => {
    it('should return 0% at the start of a level', () => {
      expect(getLevelProgress(0)).toBe(0); // Start of level 1
      expect(getLevelProgress(250)).toBe(0); // Start of level 2
      expect(getLevelProgress(500)).toBe(0); // Start of level 3
    });

    it('should return 50% halfway through a level', () => {
      expect(getLevelProgress(125)).toBe(50); // Halfway through level 1
      expect(getLevelProgress(375)).toBe(50); // Halfway through level 2
    });

    it('should return near 100% just before level up', () => {
      // 249 out of 250 needed for level 1 = 99.6% which rounds to 100
      expect(getLevelProgress(249)).toBe(100);
    });

    it('should handle various XP values correctly', () => {
      // Level 1: 0-249 XP (need 250)
      expect(getLevelProgress(50)).toBe(20);
      expect(getLevelProgress(100)).toBe(40);
      expect(getLevelProgress(200)).toBe(80);
    });
  });

  describe('ImpactService.checkBadges', () => {
    it('should return empty array when no badges earned', () => {
      const newBadges = ImpactService.checkBadges(0, 0, []);
      expect(newBadges).toEqual([]);
    });

    it('should award "first-save" badge for 1 item saved', () => {
      const newBadges = ImpactService.checkBadges(1, 0, []);
      expect(newBadges).toContain('first-save');
    });

    it('should award "waste-warrior" badge for 25 items saved', () => {
      const newBadges = ImpactService.checkBadges(25, 0, ['first-save']);
      expect(newBadges).toContain('waste-warrior');
    });

    it('should award "food-hero" badge for 50 items saved', () => {
      const newBadges = ImpactService.checkBadges(50, 0, ['first-save', 'waste-warrior']);
      expect(newBadges).toContain('food-hero');
    });

    it('should award "planet-protector" badge for 100 items saved', () => {
      const newBadges = ImpactService.checkBadges(100, 0, ['first-save', 'waste-warrior', 'food-hero']);
      expect(newBadges).toContain('planet-protector');
    });

    it('should award "carbon-cutter" badge for 10kg CO2 saved', () => {
      const newBadges = ImpactService.checkBadges(0, 10, []);
      expect(newBadges).toContain('carbon-cutter');
    });

    it('should award "climate-champion" badge for 50kg CO2 saved', () => {
      const newBadges = ImpactService.checkBadges(0, 50, ['carbon-cutter']);
      expect(newBadges).toContain('climate-champion');
    });

    it('should award "earth-guardian" badge for 100kg CO2 saved', () => {
      const newBadges = ImpactService.checkBadges(0, 100, ['carbon-cutter', 'climate-champion']);
      expect(newBadges).toContain('earth-guardian');
    });

    it('should not re-award badges already earned', () => {
      const newBadges = ImpactService.checkBadges(50, 50, ['first-save', 'waste-warrior', 'food-hero', 'carbon-cutter', 'climate-champion']);
      expect(newBadges).not.toContain('first-save');
      expect(newBadges).not.toContain('waste-warrior');
      expect(newBadges).not.toContain('food-hero');
      expect(newBadges).not.toContain('carbon-cutter');
      expect(newBadges).not.toContain('climate-champion');
    });

    it('should award multiple badges at once if thresholds met', () => {
      // New user saves 100 items with 100kg CO2 - should get all applicable badges
      const newBadges = ImpactService.checkBadges(100, 100, []);
      expect(newBadges).toContain('first-save');
      expect(newBadges).toContain('waste-warrior');
      expect(newBadges).toContain('food-hero');
      expect(newBadges).toContain('planet-protector');
      expect(newBadges).toContain('carbon-cutter');
      expect(newBadges).toContain('climate-champion');
      expect(newBadges).toContain('earth-guardian');
    });
  });

  describe('ImpactService.getBadgeById', () => {
    it('should return badge for valid ID', () => {
      const badge = ImpactService.getBadgeById('first-save');
      expect(badge).toBeDefined();
      expect(badge?.name).toBe('First Save');
      expect(badge?.icon).toBe('🌱');
    });

    it('should return undefined for invalid ID', () => {
      const badge = ImpactService.getBadgeById('invalid-badge-id');
      expect(badge).toBeUndefined();
    });

    it('should return correct badge details', () => {
      const badge = ImpactService.getBadgeById('planet-protector');
      expect(badge).toEqual({
        id: 'planet-protector',
        name: 'Planet Protector',
        description: 'Saved 100 items from waste',
        icon: '🌍',
        requirement: 100,
        type: 'itemsSaved',
      });
    });
  });

  describe('BADGES constant', () => {
    it('should have unique IDs for all badges', () => {
      const ids = BADGES.map(b => b.id);
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(ids.length);
    });

    it('should have valid types for all badges', () => {
      const validTypes = ['itemsSaved', 'streak', 'co2', 'special'];
      for (const badge of BADGES) {
        expect(validTypes).toContain(badge.type);
      }
    });

    it('should have icons for all badges', () => {
      for (const badge of BADGES) {
        expect(badge.icon).toBeDefined();
        expect(badge.icon.length).toBeGreaterThan(0);
      }
    });

    it('should have positive requirements for all badges', () => {
      for (const badge of BADGES) {
        expect(badge.requirement).toBeGreaterThan(0);
      }
    });
  });
});
