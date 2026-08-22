import { describe, expect, it } from 'vitest';
import {
  estimateExpirationDate,
  getShelfLifeDefaults,
} from '../../services/sealedShelfLifeService';
import { calculateExpirationFromShelfLife } from '../../utils/dateUtils';

describe('sealedShelfLifeService', () => {
  describe('estimateExpirationDate', () => {
    it('delegates to calculateExpirationFromShelfLife for local-calendar YYYY-MM-DD', () => {
      for (const sealedDays of [0, 7, 21, 30, 365]) {
        expect(estimateExpirationDate(sealedDays)).toBe(
          calculateExpirationFromShelfLife(sealedDays),
        );
      }
    });
  });

  describe('getShelfLifeDefaults', () => {
    it('matches sour cream to the sour-cream rule, not generic cream', () => {
      const defaults = getShelfLifeDefaults('sour cream');

      expect(defaults).not.toBeNull();
      expect(defaults?.sealedDays).toBe(21);
      expect(defaults?.openedDays).toBe(14);
      expect(defaults?.defaultStorage).toBe('fridge');
      expect(defaults?.dateType).toBe('Use By');
      expect(defaults?.category).toBe('Dairy');
    });

    it('matches heavy cream to the heavy/whipping cream rule', () => {
      const defaults = getShelfLifeDefaults('heavy cream');

      expect(defaults).not.toBeNull();
      expect(defaults?.sealedDays).toBe(30);
      expect(defaults?.openedDays).toBe(7);
      expect(defaults?.defaultStorage).toBe('fridge');
      expect(defaults?.dateType).toBe('Use By');
      expect(defaults?.category).toBe('Dairy');
    });

    it('returns null for an unknown item name', () => {
      expect(getShelfLifeDefaults('unknown widget')).toBeNull();
    });
  });
});
