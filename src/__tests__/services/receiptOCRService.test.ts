import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockReceiptResponse = {
  storeName: 'Fresh Market Test Store',
  date: '2026-05-02',
  items: [
    {
      name: 'Organic Whole Milk',
      brand: 'Horizon',
      quantity: 1,
      price: '4.99',
      category: 'Dairy',
      confidence: 'High',
    },
    {
      name: 'Bananas',
      quantity: 6,
      price: '1.79',
      category: 'Produce',
      confidence: 'High',
    },
  ],
  totalItemsDetected: 2,
  skippedItems: ['Dish Soap'],
};

const receiptCache = new Map<string, unknown>();

async function loadReceiptService(generateContent = vi.fn()) {
  vi.resetModules();
  vi.doMock('../../services/ai-client', () => ({
    ai: {
      models: {
        generateContent,
      },
    },
  }));
  vi.doMock('../../services/aiCacheService', () => ({
    makeReceiptImageCacheKey: vi.fn((file: File) => Promise.resolve(`receipt:${file.name}:${file.size}:${file.type}`)),
    getCachedResponse: vi.fn((key: string) => Promise.resolve(receiptCache.get(key) ?? null)),
    setCachedResponse: vi.fn((key: string, _serviceType: string, response: unknown) => {
      receiptCache.set(key, response);
      return Promise.resolve();
    }),
  }));

  return import('../../services/receiptOCRService');
}

function makeSyntheticReceiptFile(type = 'image/png') {
  return new File(['SYNTHETIC RECEIPT IMAGE BYTES'], 'synthetic-receipt.png', { type });
}

describe('receiptOCRService', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    receiptCache.clear();
  });

  it('sends receipt images to Gemini with the expected OCR prompt and inline image data', async () => {
    const generateContent = vi.fn().mockResolvedValue({
      text: JSON.stringify(mockReceiptResponse),
    });
    const { analyzeReceipt } = await loadReceiptService(generateContent);

    const result = await analyzeReceipt(makeSyntheticReceiptFile());

    expect(result.items).toHaveLength(2);
    expect(result.skippedItems).toEqual(['Dish Soap']);
    expect(result.items[0]).toMatchObject({
      name: 'Organic Whole Milk',
      brand: 'Horizon',
      quantity: 1,
      category: 'Dairy',
      confidence: 'High',
    });

    expect(generateContent).toHaveBeenCalledTimes(1);
    const request = generateContent.mock.calls[0][0];
    expect(request.model).toBe('gemini-2.0-flash-exp');
    expect(request.contents[0].role).toBe('user');

    const [promptPart, imagePart] = request.contents[0].parts;
    expect(promptPart.text).toContain('Analyze this grocery receipt image');
    expect(promptPart.text).toContain('Skip non-food items');
    expect(promptPart.text).toContain('skippedItems');
    expect(promptPart.text).toContain('Return ONLY valid JSON');
    expect(imagePart.inlineData).toMatchObject({
      mimeType: 'image/png',
      data: expect.any(String),
    });
    expect(imagePart.inlineData.data.length).toBeGreaterThan(0);
  });

  it('parses Gemini JSON wrapped in markdown code fences', async () => {
    const generateContent = vi.fn().mockResolvedValue({
      text: `\`\`\`json\n${JSON.stringify(mockReceiptResponse)}\n\`\`\``,
    });
    const { analyzeReceipt } = await loadReceiptService(generateContent);

    const result = await analyzeReceipt(makeSyntheticReceiptFile('image/jpeg'));

    expect(result).toMatchObject({
      storeName: 'Fresh Market Test Store',
      date: '2026-05-02',
      totalItemsDetected: 2,
    });
    expect(result.items.map((item) => item.name)).toEqual(['Organic Whole Milk', 'Bananas']);
  });

  it('uses the receipt OCR cache for repeat scans of the same image', async () => {
    const generateContent = vi.fn().mockResolvedValue({
      text: JSON.stringify(mockReceiptResponse),
    });
    const { analyzeReceipt } = await loadReceiptService(generateContent);
    const file = makeSyntheticReceiptFile();

    await analyzeReceipt(file);
    const secondResult = await analyzeReceipt(file);

    expect(generateContent).toHaveBeenCalledTimes(1);
    expect(secondResult.items[0].name).toBe('Organic Whole Milk');
  });

  it('returns an empty item list when Gemini omits items', async () => {
    const generateContent = vi.fn().mockResolvedValue({
      text: JSON.stringify({
        storeName: 'Sparse Store',
        date: '2026-05-02',
      }),
    });
    const { analyzeReceipt } = await loadReceiptService(generateContent);

    const result = await analyzeReceipt(makeSyntheticReceiptFile());

    expect(result).toEqual({
      storeName: 'Sparse Store',
      date: '2026-05-02',
      items: [],
      totalItemsDetected: 0,
      skippedItems: [],
      cacheHit: false,
      estimatedCostCents: 1,
    });
  });

  it('fails fast when the Gemini API key is not configured', async () => {
    vi.resetModules();
    vi.doMock('../../services/ai-client', () => ({
      ai: null,
    }));
    const { analyzeReceipt } = await import('../../services/receiptOCRService');

    await expect(analyzeReceipt(makeSyntheticReceiptFile())).rejects.toThrow('Missing Gemini API Key');
  });

  it('normalizes malformed Gemini responses into a receipt analysis error', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const generateContent = vi.fn().mockResolvedValue({
      text: 'not-json',
    });
    const { analyzeReceipt } = await loadReceiptService(generateContent);

    await expect(analyzeReceipt(makeSyntheticReceiptFile())).rejects.toThrow('Gemini responded, but the receipt response could not be parsed as JSON.');
  });

  it.each([
    ['weeknight receipt', 'image/png'],
    ['pantry restock receipt', 'image/jpeg'],
    ['produce receipt', 'image/webp'],
  ])('sends fixture-style synthetic receipt image: %s', async (name, mimeType) => {
    const generateContent = vi.fn().mockResolvedValue({
      text: JSON.stringify(mockReceiptResponse),
    });
    const { analyzeReceipt } = await loadReceiptService(generateContent);

    await analyzeReceipt(new File([`${name} bytes`], `${name}.png`, { type: mimeType }));

    const request = generateContent.mock.calls[0][0];
    expect(request.contents[0].parts[1].inlineData.mimeType).toBe(mimeType);
    expect(request.contents[0].parts[1].inlineData.data).toEqual(expect.any(String));
  });
});
