import { describe, expect, it } from 'vitest';
import {
  categorizeReceiptItem,
  isNonFoodReceiptItem,
  mapAzureReceiptResult,
} from '../../services/azureReceiptMapper';

const azureReceiptFixture = {
  status: 'succeeded',
  analyzeResult: {
    documents: [
      {
        confidence: 0.94,
        fields: {
          MerchantName: { valueString: 'Fresh Market Test Store', confidence: 0.98 },
          TransactionDate: { valueDate: '2026-07-14', confidence: 0.99 },
          Items: {
            valueArray: [
              {
                content: 'ORGANIC WHOLE MILK 4.99',
                valueObject: {
                  Description: {
                    valueString: 'Organic Whole Milk',
                    content: 'ORGANIC WHOLE MILK',
                    confidence: 0.96,
                    boundingRegions: [{ pageNumber: 1 }],
                  },
                  Quantity: { valueNumber: 1, confidence: 0.95 },
                  TotalPrice: { valueCurrency: { amount: 4.99, currencyCode: 'USD' }, confidence: 0.97 },
                },
              },
              {
                content: 'BANANAS 6 @ 0.30 1.80',
                valueObject: {
                  Description: { valueString: 'Bananas', confidence: 0.91 },
                  Quantity: { valueNumber: 6, confidence: 0.89 },
                  TotalPrice: { valueCurrency: { amount: 1.8 }, confidence: 0.9 },
                },
              },
              {
                content: 'PAPER TOWELS 8.49',
                valueObject: {
                  Description: { valueString: 'Paper Towels', confidence: 0.93 },
                  TotalPrice: { valueCurrency: { amount: 8.49 }, confidence: 0.92 },
                },
              },
            ],
          },
        },
      },
    ],
  },
};

describe('azureReceiptMapper', () => {
  it('maps Azure receipt fields and filters known non-food purchases', () => {
    const result = mapAzureReceiptResult(azureReceiptFixture);

    expect(result).toMatchObject({
      storeName: 'Fresh Market Test Store',
      date: '2026-07-14',
      fieldConfidence: {
        storeName: 'High',
        date: 'High',
      },
      totalItemsDetected: 2,
      skippedItems: ['Paper Towels'],
      estimatedCostCents: 1,
    });
    expect(result.items).toEqual([
      expect.objectContaining({
        name: 'Organic Whole Milk',
        quantity: 1,
        price: '4.99',
        category: 'Dairy',
        confidence: 'High',
        fieldConfidence: {
          name: 'High',
          quantity: 'High',
          price: 'High',
        },
        sourceRegion: 'page 1',
      }),
      expect.objectContaining({
        name: 'Bananas',
        quantity: 6,
        price: '1.80',
        category: 'Produce',
        confidence: 'High',
      }),
    ]);
  });

  it('returns a stable empty result for an unreadable receipt', () => {
    expect(mapAzureReceiptResult({ status: 'succeeded', analyzeResult: { documents: [] } })).toEqual({
      storeName: undefined,
      date: undefined,
      items: [],
      totalItemsDetected: 0,
      skippedItems: [],
      estimatedCostCents: 1,
    });
  });

  it('uses whole terms for category and non-food matching', () => {
    expect(categorizeReceiptItem('Champagne')).toBe('Grocery');
    expect(categorizeReceiptItem('Smoked Ham')).toBe('Meat & Seafood');
    expect(isNonFoodReceiptItem('Paper Towels')).toBe(true);
    expect(isNonFoodReceiptItem('Soapberries')).toBe(false);
  });
});
