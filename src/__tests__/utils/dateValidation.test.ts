import { describe, expect, it } from 'vitest';
import { isValidDateOnly, normalizeDateOnly } from '../../utils/dateValidation';

describe('dateValidation', () => {
  it('accepts real calendar dates and leap days', () => {
    expect(isValidDateOnly('2028-02-29')).toBe(true);
    expect(isValidDateOnly('2026-12-31')).toBe(true);
  });

  it('rejects placeholders and impossible calendar dates', () => {
    expect(isValidDateOnly('Unknown')).toBe(false);
    expect(isValidDateOnly('2027-02-29')).toBe(false);
    expect(isValidDateOnly('2026-13-01')).toBe(false);
    expect(normalizeDateOnly('2026-02-31')).toBe('');
  });
});
