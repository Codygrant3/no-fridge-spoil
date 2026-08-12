import { describe, expect, it } from 'vitest';
import { resolveTabFromHash } from '../../utils/routing';

describe('resolveTabFromHash', () => {
    it('preserves known routes with query parameters', () => {
        expect(resolveTabFromHash('#/profile?invite=abc123')).toBe('profile');
        expect(resolveTabFromHash('#/scan')).toBe('scan');
    });

    it('sends unknown routes to inventory', () => {
        expect(resolveTabFromHash('#/missing')).toBe('inventory');
        expect(resolveTabFromHash('')).toBe('inventory');
    });
});
