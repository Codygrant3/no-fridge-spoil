import { describe, expect, it } from 'vitest';
import { mapMistralReceiptResult } from '../../services/mistralReceiptMapper';

describe('mistralReceiptMapper', () => {
  it('maps price lines into reviewable groceries without treating totals as items', () => {
    const result = mapMistralReceiptResult({
      pages: [{
        markdown: [
          'Neighborhood Market',
          '07/25/2026',
          'ORG WHL MLK 4.99',
          'BANANAS 1.43',
          'SUBTOTAL 6.42',
          'TAX 0.00',
          'TOTAL 6.42',
        ].join('\n'),
        confidence_scores: { average_page_confidence_score: 0.9 },
      }],
    });

    expect(result).toMatchObject({
      storeName: 'Neighborhood Market',
      date: '2026-07-25',
      totalItemsDetected: 2,
    });
    expect(result.items).toHaveLength(2);
    expect(result.items[0]).toMatchObject({
      name: 'ORG WHL MLK',
      price: '4.99',
      confidence: 'High',
    });
  });
});
