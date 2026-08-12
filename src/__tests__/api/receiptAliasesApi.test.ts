/// <reference types="node" />

import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  authorize: vi.fn(),
  upsert: vi.fn(),
}));

vi.mock('../../../server/supabaseServer', () => {
  class ServerRequestError extends Error {
    status: number;
    code: string;
    constructor(status: number, code: string, message: string) {
      super(message);
      this.status = status;
      this.code = code;
    }
  }
  return {
    authorizeHouseholdRequest: mocks.authorize,
    ServerRequestError,
    serverRequestErrorResponse: (error: unknown) => error instanceof ServerRequestError
      ? Response.json({ status: error.code, message: error.message }, { status: error.status })
      : null,
  };
});

import { handleReceiptAliasesRequest } from '../../../api/receipt-aliases';

describe('receipt aliases API', () => {
  beforeEach(() => {
    mocks.upsert.mockReset();
    mocks.authorize.mockReset().mockResolvedValue({
      householdId: '11111111-1111-4111-8111-111111111111',
      user: { id: 'user-1' },
      admin: {
        from: vi.fn(() => ({
          upsert: mocks.upsert.mockImplementation((values: unknown[]) => ({
            select: vi.fn().mockResolvedValue({
              data: values.map((_, index) => ({ id: `alias-${index}` })),
              error: null,
            }),
          })),
        })),
      },
    });
  });

  it('forces the authorized household and stores normalized store-scoped aliases', async () => {
    const response = await handleReceiptAliasesRequest(new Request('http://localhost/api/receipt-aliases', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        householdId: 'attacker-household',
        aliases: [{
          merchantName: '  Kroger #124  ',
          rawDescription: ' ORG   WHL MLK ',
          canonicalName: 'Organic Whole Milk',
          category: 'Dairy',
        }],
      }),
    }));

    expect(response.status).toBe(201);
    expect(mocks.upsert).toHaveBeenCalledWith([
      expect.objectContaining({
        household_id: '11111111-1111-4111-8111-111111111111',
        merchant_name: 'Kroger #124',
        merchant_key: 'kroger 124',
        raw_description: 'ORG WHL MLK',
        raw_description_key: 'org whl mlk',
        canonical_name: 'Organic Whole Milk',
        created_by: 'user-1',
      }),
    ], { onConflict: 'household_id,merchant_key,raw_description_key' });
  });

  it('rejects empty or oversized correction batches', async () => {
    const response = await handleReceiptAliasesRequest(new Request('http://localhost/api/receipt-aliases', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ aliases: [] }),
    }));

    expect(response.status).toBe(400);
    expect(mocks.upsert).not.toHaveBeenCalled();
  });
});

