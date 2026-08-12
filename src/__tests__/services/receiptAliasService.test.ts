import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  headers: vi.fn(),
}));

vi.mock('../../services/cloudSessionService', () => ({
  getAuthenticatedRequestHeaders: mocks.headers,
}));

import { saveReceiptAliasCorrections } from '../../services/receiptAliasService';

describe('receiptAliasService', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    mocks.headers.mockReset().mockResolvedValue({
      Authorization: 'Bearer account',
      'X-Household-Id': 'household-1',
    });
  });

  it('saves corrections with active household authorization', async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ saved: 1 }, { status: 201 }));
    vi.stubGlobal('fetch', fetchMock);
    const aliases = [{
      merchantName: 'Kroger',
      rawDescription: 'ORG MLK',
      canonicalName: 'Organic Milk',
    }];

    await expect(saveReceiptAliasCorrections(aliases)).resolves.toBe(1);
    expect(fetchMock).toHaveBeenCalledWith('/api/receipt-aliases', expect.objectContaining({
      method: 'POST',
      headers: expect.objectContaining({ 'X-Household-Id': 'household-1' }),
      body: JSON.stringify({ aliases }),
      cache: 'no-store',
    }));
  });
});

