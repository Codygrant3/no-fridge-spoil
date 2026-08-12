/// <reference types="node" />

import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  lookupProduct: vi.fn(),
}));

vi.mock('../../../server/openFoodFacts', async () => {
  const actual = await vi.importActual<typeof import('../../../server/openFoodFacts')>('../../../server/openFoodFacts');
  return { ...actual, lookupOpenFoodFactsProduct: mocks.lookupProduct };
});

import { enrichReceiptAnalysis } from '../../../server/receiptResolution';
import type { AzureReceiptAnalysis } from '../../services/azureReceiptMapper';

function adminClient(householdAliases: unknown[] = [], catalogAliases: unknown[] = []) {
  return {
    from: vi.fn((table: string) => {
      const query = {
        select: vi.fn(),
        eq: vi.fn(),
        in: vi.fn(),
        limit: vi.fn().mockResolvedValue({
          data: table === 'receipt_item_aliases' ? householdAliases : catalogAliases,
          error: null,
        }),
      };
      query.select.mockReturnValue(query);
      query.eq.mockReturnValue(query);
      query.in.mockReturnValue(query);
      return query;
    }),
  };
}

function analysis(name: string): AzureReceiptAnalysis {
  return {
    storeName: 'Kroger',
    items: [{
      name,
      quantity: 1,
      category: 'Grocery',
      confidence: 'High',
      sourceLine: `${name} 4.99`,
    }],
    totalItemsDetected: 1,
    skippedItems: [],
    estimatedCostCents: 1,
  };
}

describe('receipt resolution enrichment', () => {
  beforeEach(() => mocks.lookupProduct.mockReset().mockResolvedValue(null));

  it('keeps token expansion in shadow mode with raw OCR evidence', async () => {
    const result = await enrichReceiptAnalysis(
      adminClient() as never,
      '11111111-1111-4111-8111-111111111111',
      analysis('ORG WHL MLK'),
    );

    expect(result.items[0]).toMatchObject({
      name: 'ORG WHL MLK',
      originalName: 'ORG WHL MLK',
      sourceLine: 'ORG WHL MLK 4.99',
      resolution: {
        proposedName: 'Organic Whole Milk',
        confidence: 'Medium',
        method: 'token-expansion',
        shouldReview: true,
        autoAccepted: false,
      },
    });
    expect(result).toMatchObject({
      resolutionMode: 'shadow',
      resolutionStats: { proposed: 1, autoAccepted: 0, needsReview: 1 },
    });
  });

  it('auto-accepts an exact household and store alias', async () => {
    const aliases = [{
      merchant_name: 'Kroger',
      raw_description: 'SMP TRTH MLK',
      canonical_name: 'Simple Truth Milk',
      brand: 'Simple Truth',
      category: 'Dairy',
    }];
    const result = await enrichReceiptAnalysis(
      adminClient(aliases) as never,
      '11111111-1111-4111-8111-111111111111',
      analysis('SMP TRTH MLK'),
    );

    expect(result.items[0]).toMatchObject({
      name: 'Simple Truth Milk',
      originalName: 'SMP TRTH MLK',
      brand: 'Simple Truth',
      category: 'Dairy',
      resolution: { method: 'learned-alias', autoAccepted: true, shouldReview: false },
    });
  });
});

