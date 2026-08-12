import { describe, expect, it } from 'vitest';
import { extractExpirationDate } from '../../services/visionService';

const NOW = new Date('2026-07-16T12:00:00Z');

describe('visionService local date parsing', () => {
  it('extracts an ISO expiration date and label', () => {
    expect(extractExpirationDate('BEST BY 2026-09-18', NOW)).toEqual({
      expiration_date: '2026-09-18',
      date_type: 'Best By',
    });
  });

  it('extracts a two-digit year from day-month text', () => {
    expect(extractExpirationDate('USE BY 22 MAR 27', NOW)).toEqual({
      expiration_date: '2027-03-22',
      date_type: 'Use By',
    });
  });

  it('extracts a US numeric date', () => {
    expect(extractExpirationDate('SELL BY 08/05/2026', NOW)).toEqual({
      expiration_date: '2026-08-05',
      date_type: 'Sell By',
    });
  });

  it('rejects impossible and implausibly distant dates', () => {
    expect(extractExpirationDate('EXP 02/31/2027', NOW).expiration_date).toBe('Unknown');
    expect(extractExpirationDate('EXP 01/01/2040', NOW).expiration_date).toBe('Unknown');
  });

  it('does not invent a date when local text detection finds none', () => {
    expect(extractExpirationDate('LOT A42 KEEP REFRIGERATED', NOW)).toEqual({
      expiration_date: 'Unknown',
      date_type: 'Unknown',
    });
  });
});
