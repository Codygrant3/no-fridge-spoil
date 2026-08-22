import { describe, expect, it } from 'vitest';
import {
  enrichWithInventory,
  getSubstitutions,
} from '../../services/substitutionService';
import type { InventoryItem } from '../../types';

function inventoryItem(id: string, name: string): InventoryItem {
  return {
    id,
    name,
    expirationDate: '2026-08-28',
    dateType: 'best_by',
    addedAt: '2026-08-21T12:00:00Z',
    status: 'good',
    quantity: 1,
    storageLocation: 'fridge',
  };
}

describe('substitutionService', () => {
  describe('getSubstitutions', () => {
    it('returns Heavy Cream for exact heavy cream lookups, including case variants', () => {
      const variants = ['heavy cream', 'Heavy Cream', 'HEAVY CREAM', '  heavy cream  '];

      for (const ingredient of variants) {
        const result = getSubstitutions(ingredient);
        expect(result, ingredient).not.toBeNull();
        expect(result?.original, ingredient).toBe('Heavy Cream');
        expect(result?.original, ingredient).not.toBe('Sour Cream');
        expect(result?.alternatives.map(alt => alt.name)).toEqual([
          'Milk + Butter',
          'Half-and-Half',
          'Greek Yogurt + Milk',
        ]);
      }
    });

    it('returns null for an unknown ingredient with no database overlap', () => {
      expect(getSubstitutions('unknown spice blend xyz')).toBeNull();
    });

    it('locks current fuzzy behavior for the short token cream', () => {
      // Characterization: after missing an exact key, the matcher uses
      // normalized.includes(key) || key.includes(normalized). The token
      // "cream" is contained by both "heavy cream" and "sour cream";
      // insertion order returns Heavy Cream first. Cooks often write
      // "cream" to mean heavy cream, so this is locked rather than tightened.
      const result = getSubstitutions('cream');

      expect(result).not.toBeNull();
      expect(result?.original).toBe('Heavy Cream');
      expect(result?.original).not.toBe('Sour Cream');
      expect(getSubstitutions('CREAM')?.original).toBe('Heavy Cream');
    });
  });

  describe('enrichWithInventory', () => {
    it('flags overlapping inventory names and sorts those alternatives first', () => {
      const substitution = getSubstitutions('egg');
      expect(substitution).not.toBeNull();

      const enriched = enrichWithInventory(substitution!, [
        inventoryItem('banana', 'Ripe Banana'),
      ]);

      expect(enriched.alternatives.map(alt => ({
        name: alt.name,
        inInventory: alt.inInventory,
      }))).toEqual([
        { name: 'Banana', inInventory: true },
        { name: 'Flax Egg', inInventory: false },
        { name: 'Applesauce', inInventory: false },
      ]);
    });
  });
});
