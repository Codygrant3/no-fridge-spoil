/// <reference types="node" />

import { describe, expect, it, vi } from 'vitest';
import {
  extractStableBarcodes,
  isValidGtin,
  lookupOpenFoodFactsProduct,
} from '../../../server/openFoodFacts';

describe('openFoodFacts receipt enrichment', () => {
  it('accepts valid GTINs and rejects receipt item numbers with invalid check digits', () => {
    expect(isValidGtin('3017620422003')).toBe(true);
    expect(isValidGtin('036000291452')).toBe(true);
    expect(isValidGtin('036000291453')).toBe(false);
    expect(isValidGtin('4011')).toBe(false);
  });

  it('extracts only stable barcode candidates from receipt evidence', () => {
    expect(extractStableBarcodes('ITEM 4011 UPC 3017620422003 PRICE 4.99')).toEqual(['3017620422003']);
  });

  it('maps an Open Food Facts product without treating the community result as verified', async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json({
      status: 'success',
      product: { product_name: 'Hazelnut Cocoa Spread', brands: 'Example Brand' },
    }));

    const product = await lookupOpenFoodFactsProduct('3017620422003', fetchMock);

    expect(product).toEqual({
      barcode: '3017620422003',
      name: 'Hazelnut Cocoa Spread',
      brand: 'Example Brand',
      source: 'open-food-facts',
    });
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/3017620422003?'),
      expect.objectContaining({
        headers: expect.objectContaining({ 'User-Agent': expect.stringContaining('NoFridgeSpoil') }),
      }),
    );
  });
});

