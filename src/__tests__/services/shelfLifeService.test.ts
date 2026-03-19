import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  getShelfLifeAfterOpening,
  calculateOpenedExpiration,
  getShelfLifeDescription,
} from '../../services/shelfLifeService';

describe('shelfLifeService', () => {
  describe('getShelfLifeAfterOpening', () => {
    // Dairy products
    describe('dairy products', () => {
      it('should return 7 days for milk', () => {
        expect(getShelfLifeAfterOpening('milk')).toBe(7);
        expect(getShelfLifeAfterOpening('Whole Milk')).toBe(7);
        expect(getShelfLifeAfterOpening('2% milk')).toBe(7);
        expect(getShelfLifeAfterOpening('skim milk')).toBe(7);
      });

      it('should return 5 days for yogurt', () => {
        expect(getShelfLifeAfterOpening('yogurt')).toBe(5);
        expect(getShelfLifeAfterOpening('Greek Yogurt')).toBe(5);
      });

      it('should return 7 days for cream', () => {
        expect(getShelfLifeAfterOpening('cream')).toBe(7);
        expect(getShelfLifeAfterOpening('heavy cream')).toBe(7);
        expect(getShelfLifeAfterOpening('whipping cream')).toBe(7);
      });

      it('should return 14 days for sour cream', () => {
        expect(getShelfLifeAfterOpening('sour cream')).toBe(14);
        expect(getShelfLifeAfterOpening('Daisy Sour Cream')).toBe(14);
      });

      it('should return 90 days for butter', () => {
        expect(getShelfLifeAfterOpening('butter')).toBe(90);
        expect(getShelfLifeAfterOpening('Salted Butter')).toBe(90);
      });

      it('should return 21 days for cheese', () => {
        expect(getShelfLifeAfterOpening('cheese')).toBe(21);
        expect(getShelfLifeAfterOpening('cheddar')).toBe(21);
        expect(getShelfLifeAfterOpening('mozzarella')).toBe(21);
        expect(getShelfLifeAfterOpening('Swiss Cheese')).toBe(21);
      });

      it('should return 7 days for cottage cheese', () => {
        expect(getShelfLifeAfterOpening('cottage cheese')).toBe(7);
        expect(getShelfLifeAfterOpening('Breakstone Cottage Cheese')).toBe(7);
      });

      it('should return 14 days for cream cheese', () => {
        expect(getShelfLifeAfterOpening('cream cheese')).toBe(14);
        expect(getShelfLifeAfterOpening('Philadelphia Cream Cheese')).toBe(14);
      });
    });

    // Condiments
    describe('condiments', () => {
      it('should return 180 days for ketchup', () => {
        expect(getShelfLifeAfterOpening('ketchup')).toBe(180);
        expect(getShelfLifeAfterOpening('Heinz Ketchup')).toBe(180);
      });

      it('should return 365 days for mustard', () => {
        expect(getShelfLifeAfterOpening('mustard')).toBe(365);
        expect(getShelfLifeAfterOpening('Yellow Mustard')).toBe(365);
      });

      it('should return 60 days for mayo', () => {
        expect(getShelfLifeAfterOpening('mayo')).toBe(60);
        expect(getShelfLifeAfterOpening('mayonnaise')).toBe(60);
        expect(getShelfLifeAfterOpening('Hellmanns Mayonnaise')).toBe(60);
      });

      it('should return 730 days for soy sauce', () => {
        expect(getShelfLifeAfterOpening('soy sauce')).toBe(730);
        expect(getShelfLifeAfterOpening('Kikkoman Soy Sauce')).toBe(730);
      });

      it('should return 180 days for hot sauce and sriracha', () => {
        expect(getShelfLifeAfterOpening('hot sauce')).toBe(180);
        expect(getShelfLifeAfterOpening('sriracha')).toBe(180);
      });

      it('should return 7 days for salsa', () => {
        expect(getShelfLifeAfterOpening('salsa')).toBe(7);
        expect(getShelfLifeAfterOpening('Fresh Salsa')).toBe(7);
      });

      it('should return 7 days for pasta sauce', () => {
        expect(getShelfLifeAfterOpening('pasta sauce')).toBe(7);
        expect(getShelfLifeAfterOpening('marinara')).toBe(7);
        expect(getShelfLifeAfterOpening('tomato sauce')).toBe(7);
      });

      it('should return 120 days for bbq sauce', () => {
        expect(getShelfLifeAfterOpening('bbq sauce')).toBe(120);
        expect(getShelfLifeAfterOpening('barbecue sauce')).toBe(120);
      });

      it('should return 2 days for guacamole', () => {
        expect(getShelfLifeAfterOpening('guacamole')).toBe(2);
      });
    });

    // Beverages
    describe('beverages', () => {
      it('should return 7 days for orange juice', () => {
        expect(getShelfLifeAfterOpening('orange juice')).toBe(7);
        expect(getShelfLifeAfterOpening('oj')).toBe(7);
      });

      it('should return 5 days for wine', () => {
        expect(getShelfLifeAfterOpening('wine')).toBe(5);
        expect(getShelfLifeAfterOpening('red wine')).toBe(5);
        expect(getShelfLifeAfterOpening('white wine')).toBe(5);
      });

      it('should return 1 day for beer', () => {
        expect(getShelfLifeAfterOpening('beer')).toBe(1);
      });
    });

    // Proteins
    describe('proteins', () => {
      it('should return 21 days for eggs', () => {
        expect(getShelfLifeAfterOpening('eggs')).toBe(21);
        expect(getShelfLifeAfterOpening('egg')).toBe(21);
      });

      it('should return 7 days for bacon', () => {
        expect(getShelfLifeAfterOpening('bacon')).toBe(7);
      });

      it('should return 5 days for deli meat', () => {
        expect(getShelfLifeAfterOpening('deli meat')).toBe(5);
        expect(getShelfLifeAfterOpening('lunch meat')).toBe(5);
        expect(getShelfLifeAfterOpening('ham')).toBe(5);
        expect(getShelfLifeAfterOpening('turkey')).toBe(5);
        expect(getShelfLifeAfterOpening('Sliced Turkey')).toBe(5);
      });

      it('should return 5 days for tofu', () => {
        expect(getShelfLifeAfterOpening('tofu')).toBe(5);
      });
    });

    // Fermented foods
    describe('fermented foods', () => {
      it('should return 90 days for kimchi', () => {
        expect(getShelfLifeAfterOpening('kimchi')).toBe(90);
      });

      it('should return 60 days for sauerkraut', () => {
        expect(getShelfLifeAfterOpening('sauerkraut')).toBe(60);
      });
    });

    // Case insensitivity
    describe('case insensitivity', () => {
      it('should match regardless of case', () => {
        expect(getShelfLifeAfterOpening('MILK')).toBe(7);
        expect(getShelfLifeAfterOpening('Milk')).toBe(7);
        expect(getShelfLifeAfterOpening('mIlK')).toBe(7);
      });
    });

    // Partial matching
    describe('partial matching', () => {
      it('should match items containing keywords', () => {
        expect(getShelfLifeAfterOpening('Organic Whole Milk')).toBe(7);
        expect(getShelfLifeAfterOpening('Store Brand Greek Yogurt')).toBe(5);
        expect(getShelfLifeAfterOpening('Homemade Guacamole')).toBe(2);
      });
    });

    // Unknown items
    describe('unknown items', () => {
      it('should return null for unknown items', () => {
        expect(getShelfLifeAfterOpening('unknown food')).toBeNull();
        expect(getShelfLifeAfterOpening('xyz123')).toBeNull();
        expect(getShelfLifeAfterOpening('')).toBeNull();
      });
    });
  });

  describe('calculateOpenedExpiration', () => {
    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date(2026, 0, 22)); // January 22, 2026
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should calculate expiration for milk opened today', () => {
      const result = calculateOpenedExpiration('2026-01-22', 'milk');
      // Milk has 7 days shelf life, so should be around Jan 28-29
      expect(result).toMatch(/^2026-01-2[89]$/);
    });

    it('should calculate expiration for yogurt', () => {
      const result = calculateOpenedExpiration('2026-01-22', 'yogurt');
      // Yogurt has 5 days shelf life, so should be around Jan 26-27
      expect(result).toMatch(/^2026-01-2[67]$/);
    });

    it('should calculate expiration for butter', () => {
      const result = calculateOpenedExpiration('2026-01-22', 'butter');
      // Butter has 90 days shelf life, so should be around April 21-22
      expect(result).toMatch(/^2026-04-2[12]$/);
    });

    it('should return null for unknown items', () => {
      expect(calculateOpenedExpiration('2026-01-22', 'unknown food')).toBeNull();
    });

    it('should handle items opened in the past', () => {
      const result = calculateOpenedExpiration('2026-01-15', 'milk');
      // Jan 15 + 7 days = Jan 21-22
      expect(result).toMatch(/^2026-01-2[12]$/);
    });

    it('should handle month boundaries', () => {
      const result = calculateOpenedExpiration('2026-01-25', 'milk');
      // Jan 25 + 7 days = Jan 31 or Feb 1
      expect(result).toMatch(/^2026-0[12]-[03][01]$/);
    });

    it('should handle year boundaries', () => {
      const result = calculateOpenedExpiration('2025-12-30', 'milk');
      // Dec 30 + 7 days = Jan 5-6
      expect(result).toMatch(/^2026-01-0[56]$/);
    });
  });

  describe('getShelfLifeDescription', () => {
    it('should return "1 day after opening" for beer', () => {
      expect(getShelfLifeDescription('beer')).toBe('1 day after opening');
    });

    it('should return days format for items under 1 week', () => {
      expect(getShelfLifeDescription('guacamole')).toBe('2 days after opening');
      expect(getShelfLifeDescription('yogurt')).toBe('5 days after opening');
    });

    it('should return "1 week after opening" for 7-day items', () => {
      expect(getShelfLifeDescription('milk')).toBe('1 week after opening');
      expect(getShelfLifeDescription('salsa')).toBe('1 week after opening');
    });

    it('should return weeks format for items under 1 month', () => {
      expect(getShelfLifeDescription('sour cream')).toBe('2 weeks after opening');
      expect(getShelfLifeDescription('cheese')).toBe('3 weeks after opening');
    });

    it('should return months format for items under 1 year', () => {
      expect(getShelfLifeDescription('mayo')).toBe('2 months after opening');
      expect(getShelfLifeDescription('butter')).toBe('3 months after opening');
      expect(getShelfLifeDescription('ketchup')).toBe('6 months after opening');
    });

    it('should return year format for 1-year items', () => {
      expect(getShelfLifeDescription('mustard')).toBe('1 year after opening');
    });

    it('should return years format for multi-year items', () => {
      expect(getShelfLifeDescription('soy sauce')).toBe('2 years after opening');
    });

    it('should return null for unknown items', () => {
      expect(getShelfLifeDescription('unknown food')).toBeNull();
    });
  });
});
