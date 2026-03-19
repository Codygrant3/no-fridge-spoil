import { describe, it, expect, vi, beforeEach } from 'vitest';
import { lookupBarcode } from '../../services/barcodeService';
import { BarcodeCache } from '../../services/barcodeCache';

// Mock the BarcodeCache module
vi.mock('../../services/barcodeCache', () => ({
  BarcodeCache: {
    get: vi.fn(),
    set: vi.fn(),
  },
}));

describe('barcodeService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset fetch mock
    vi.mocked(global.fetch).mockReset();
  });

  describe('lookupBarcode', () => {
    describe('cache behavior', () => {
      it('should return cached result when available', async () => {
        vi.mocked(BarcodeCache.get).mockResolvedValue({
          barcode: '123456789',
          name: 'Cached Product',
          brand: 'Cached Brand',
          cachedAt: new Date().toISOString(),
        });

        const result = await lookupBarcode('123456789');

        expect(result).toEqual({
          barcode: '123456789',
          name: 'Cached Product',
          brand: 'Cached Brand',
          found: true,
          fromCache: true,
        });

        expect(BarcodeCache.get).toHaveBeenCalledWith('123456789');
        expect(global.fetch).not.toHaveBeenCalled();
      });

      it('should return "Unknown" brand when cached brand is missing', async () => {
        vi.mocked(BarcodeCache.get).mockResolvedValue({
          barcode: '123456789',
          name: 'Cached Product',
          brand: undefined,
          cachedAt: new Date().toISOString(),
        });

        const result = await lookupBarcode('123456789');

        expect(result.brand).toBe('Unknown');
      });
    });

    describe('API success scenarios', () => {
      it('should fetch from API when cache misses', async () => {
        vi.mocked(BarcodeCache.get).mockResolvedValue(null);
        vi.mocked(global.fetch).mockResolvedValue({
          ok: true,
          json: () =>
            Promise.resolve({
              status: 1,
              product: {
                product_name: 'API Product',
                brands: 'API Brand',
                quantity: '500ml',
                categories: 'beverages',
                image_front_small_url: 'http://example.com/image.jpg',
                nutriscore_grade: 'b',
                ingredients_text: 'water, sugar',
              },
            }),
        } as Response);

        const result = await lookupBarcode('987654321');

        expect(BarcodeCache.get).toHaveBeenCalledWith('987654321');
        expect(global.fetch).toHaveBeenCalledWith(
          'https://world.openfoodfacts.org/api/v0/product/987654321.json'
        );
        expect(result).toEqual({
          barcode: '987654321',
          name: 'API Product',
          brand: 'API Brand',
          quantity: '500ml',
          categories: 'beverages',
          imageUrl: 'http://example.com/image.jpg',
          nutriscore: 'B',
          ingredients: 'water, sugar',
          found: true,
        });
      });

      it('should save successful lookups to cache', async () => {
        vi.mocked(BarcodeCache.get).mockResolvedValue(null);
        vi.mocked(global.fetch).mockResolvedValue({
          ok: true,
          json: () =>
            Promise.resolve({
              status: 1,
              product: {
                product_name: 'New Product',
                brands: 'New Brand',
              },
            }),
        } as Response);

        await lookupBarcode('111222333');

        expect(BarcodeCache.set).toHaveBeenCalledWith('111222333', 'New Product', 'New Brand');
      });

      it('should not cache products with unknown name', async () => {
        vi.mocked(BarcodeCache.get).mockResolvedValue(null);
        vi.mocked(global.fetch).mockResolvedValue({
          ok: true,
          json: () =>
            Promise.resolve({
              status: 1,
              product: {
                product_name: undefined,
                brands: 'Some Brand',
              },
            }),
        } as Response);

        await lookupBarcode('444555666');

        expect(BarcodeCache.set).not.toHaveBeenCalled();
      });

      it('should use product_name_en as fallback', async () => {
        vi.mocked(BarcodeCache.get).mockResolvedValue(null);
        vi.mocked(global.fetch).mockResolvedValue({
          ok: true,
          json: () =>
            Promise.resolve({
              status: 1,
              product: {
                product_name: undefined,
                product_name_en: 'English Name',
                brands: 'Brand',
              },
            }),
        } as Response);

        const result = await lookupBarcode('777888999');

        expect(result.name).toBe('English Name');
      });

      it('should use image_url as fallback for imageUrl', async () => {
        vi.mocked(BarcodeCache.get).mockResolvedValue(null);
        vi.mocked(global.fetch).mockResolvedValue({
          ok: true,
          json: () =>
            Promise.resolve({
              status: 1,
              product: {
                product_name: 'Product',
                brands: 'Brand',
                image_front_small_url: undefined,
                image_url: 'http://example.com/fallback.jpg',
              },
            }),
        } as Response);

        const result = await lookupBarcode('111000111');

        expect(result.imageUrl).toBe('http://example.com/fallback.jpg');
      });
    });

    describe('API failure scenarios', () => {
      it('should return not found when API response is not ok', async () => {
        vi.mocked(BarcodeCache.get).mockResolvedValue(null);
        vi.mocked(global.fetch).mockResolvedValue({
          ok: false,
          status: 500,
        } as Response);

        const result = await lookupBarcode('error123');

        expect(result).toEqual({
          barcode: 'error123',
          name: 'Unknown Product',
          brand: 'Unknown',
          found: false,
        });
      });

      it('should return not found when product status is 0', async () => {
        vi.mocked(BarcodeCache.get).mockResolvedValue(null);
        vi.mocked(global.fetch).mockResolvedValue({
          ok: true,
          json: () =>
            Promise.resolve({
              status: 0,
              product: null,
            }),
        } as Response);

        const result = await lookupBarcode('notfound123');

        expect(result).toEqual({
          barcode: 'notfound123',
          name: 'Unknown Product',
          brand: 'Unknown',
          found: false,
        });
      });

      it('should return not found when product is null', async () => {
        vi.mocked(BarcodeCache.get).mockResolvedValue(null);
        vi.mocked(global.fetch).mockResolvedValue({
          ok: true,
          json: () =>
            Promise.resolve({
              status: 1,
              product: null,
            }),
        } as Response);

        const result = await lookupBarcode('nullproduct');

        expect(result).toEqual({
          barcode: 'nullproduct',
          name: 'Unknown Product',
          brand: 'Unknown',
          found: false,
        });
      });

      it('should return lookup failed on network error', async () => {
        vi.mocked(BarcodeCache.get).mockResolvedValue(null);
        vi.mocked(global.fetch).mockRejectedValue(new Error('Network error'));

        const result = await lookupBarcode('networkerror');

        expect(result).toEqual({
          barcode: 'networkerror',
          name: 'Lookup Failed',
          brand: 'Unknown',
          found: false,
        });
      });

      it('should return lookup failed on JSON parse error', async () => {
        vi.mocked(BarcodeCache.get).mockResolvedValue(null);
        vi.mocked(global.fetch).mockResolvedValue({
          ok: true,
          json: () => Promise.reject(new Error('Invalid JSON')),
        } as Response);

        const result = await lookupBarcode('jsonerror');

        expect(result).toEqual({
          barcode: 'jsonerror',
          name: 'Lookup Failed',
          brand: 'Unknown',
          found: false,
        });
      });
    });

    describe('optional fields', () => {
      it('should handle missing optional fields gracefully', async () => {
        vi.mocked(BarcodeCache.get).mockResolvedValue(null);
        vi.mocked(global.fetch).mockResolvedValue({
          ok: true,
          json: () =>
            Promise.resolve({
              status: 1,
              product: {
                product_name: 'Minimal Product',
                brands: 'Minimal Brand',
                // All optional fields missing
              },
            }),
        } as Response);

        const result = await lookupBarcode('minimal123');

        expect(result).toEqual({
          barcode: 'minimal123',
          name: 'Minimal Product',
          brand: 'Minimal Brand',
          quantity: undefined,
          categories: undefined,
          imageUrl: undefined,
          nutriscore: undefined,
          ingredients: undefined,
          found: true,
        });
      });

      it('should handle missing brand', async () => {
        vi.mocked(BarcodeCache.get).mockResolvedValue(null);
        vi.mocked(global.fetch).mockResolvedValue({
          ok: true,
          json: () =>
            Promise.resolve({
              status: 1,
              product: {
                product_name: 'No Brand Product',
                brands: undefined,
              },
            }),
        } as Response);

        const result = await lookupBarcode('nobrand');

        expect(result.brand).toBe('Unknown');
      });
    });
  });
});
