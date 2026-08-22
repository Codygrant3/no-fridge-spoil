import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockReceiptResponse = {
  provider: 'azure-document-intelligence',
  providerLabel: 'Azure Document Intelligence',
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
  estimatedCostCents: 1,
};

const receiptCache = new Map<string, unknown>();
const receiptJobId = '22222222-2222-4222-8222-222222222222';

async function loadReceiptService() {
  vi.resetModules();
  vi.doMock('../../services/aiCacheService', () => ({
    makeReceiptImageCacheKey: vi.fn((file: File) => Promise.resolve(`receipt:${file.name}:${file.size}:${file.type}`)),
    getCachedResponse: vi.fn((key: string) => Promise.resolve(receiptCache.get(key) ?? null)),
    setCachedResponse: vi.fn((key: string, _serviceType: string, response: unknown) => {
      receiptCache.set(key, response);
      return Promise.resolve();
    }),
  }));
  vi.doMock('../../services/cloudSessionService', () => ({
    CloudSessionError: class CloudSessionError extends Error {},
    getAuthenticatedRequestHeaders: vi.fn().mockResolvedValue({
      Authorization: 'Bearer test-access-token',
      'X-Household-Id': '11111111-1111-4111-8111-111111111111',
    }),
  }));

  return import('../../services/receiptOCRService');
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function makeSyntheticReceiptFile(type = 'image/jpeg') {
  return new File(['SYNTHETIC RECEIPT IMAGE BYTES'], 'synthetic-receipt.jpg', { type });
}

function successfulJobResponses(result: unknown = mockReceiptResponse): Response[] {
  return [
    jsonResponse({ jobId: receiptJobId, status: 'queued', retryAfterMs: 1 }, 202),
    jsonResponse({ jobId: receiptJobId, status: 'succeeded', attempts: 1, maxAttempts: 3, result }),
  ];
}

describe('receiptOCRService', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    receiptCache.clear();
  });

  it('uploads a receipt to the secure OCR endpoint as multipart form data', async () => {
    const [queued, completed] = successfulJobResponses();
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(queued)
      .mockResolvedValueOnce(completed);
    vi.stubGlobal('fetch', fetchMock);
    const { analyzeReceipt } = await loadReceiptService();
    const file = makeSyntheticReceiptFile();

    const result = await analyzeReceipt(file);

    expect(result.items).toHaveLength(2);
    expect(result.skippedItems).toEqual(['Dish Soap']);
    expect(result.items[0]).toMatchObject({
      name: 'Organic Whole Milk',
      brand: 'Horizon',
      quantity: 1,
      category: 'Dairy',
      confidence: 'High',
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [url, request] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/receipt-jobs');
    expect(request.method).toBe('POST');
    expect(request.headers).toMatchObject({
      Authorization: 'Bearer test-access-token',
      'X-Household-Id': '11111111-1111-4111-8111-111111111111',
    });
    expect(request.body).toBeInstanceOf(FormData);
    expect((request.body as FormData).get('receipt')).toBeInstanceOf(File);
    expect(fetchMock).toHaveBeenNthCalledWith(2, `/api/receipt-jobs?id=${receiptJobId}`, expect.objectContaining({
      method: 'PUT',
    }));
  });

  it('preserves raw OCR evidence and shadow-mode resolution proposals', async () => {
    const enrichedResponse = {
      ...mockReceiptResponse,
      items: [{
        name: 'ORG WHL MLK',
        originalName: 'ORG WHL MLK',
        quantity: 1,
        price: '4.99',
        category: 'Grocery',
        confidence: 'Medium',
        sourceLine: 'ORG WHL MLK 4.99 012345678905',
        resolution: {
          proposedName: 'Organic Whole Milk',
          proposedBrand: 'Horizon',
          proposedCategory: 'Dairy',
          confidence: 'Medium',
          method: 'barcode-lookup',
          shouldReview: true,
          autoAccepted: false,
          alternatives: ['Whole Milk', 'Organic Milk'],
          unresolvedTokens: [],
          evidence: ['Raw OCR: ORG WHL MLK', 'Barcode: 012345678905'],
          packageInfo: { size: 1, unit: 'gallon' },
          barcode: '012345678905',
          catalogSource: 'open-food-facts',
        },
      }],
      totalItemsDetected: 1,
      resolutionMode: 'shadow',
      resolutionStats: {
        proposed: 1,
        autoAccepted: 0,
        needsReview: 1,
        barcodeMatches: 1,
      },
    };
    const [queued, completed] = successfulJobResponses(enrichedResponse);
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(queued)
      .mockResolvedValueOnce(completed));
    const { analyzeReceipt } = await loadReceiptService();

    const result = await analyzeReceipt(makeSyntheticReceiptFile());

    expect(result.resolutionMode).toBe('shadow');
    expect(result.resolutionStats).toEqual({
      proposed: 1,
      autoAccepted: 0,
      needsReview: 1,
      barcodeMatches: 1,
    });
    expect(result.items[0]).toMatchObject({
      name: 'ORG WHL MLK',
      originalName: 'ORG WHL MLK',
      sourceLine: 'ORG WHL MLK 4.99 012345678905',
      resolution: {
        proposedName: 'Organic Whole Milk',
        confidence: 'Medium',
        shouldReview: true,
        autoAccepted: false,
        alternatives: ['Whole Milk', 'Organic Milk'],
        evidence: ['Raw OCR: ORG WHL MLK', 'Barcode: 012345678905'],
        barcode: '012345678905',
        catalogSource: 'open-food-facts',
      },
    });
  });

  it('uses the receipt OCR cache for repeat scans of the same image', async () => {
    const [queued, completed] = successfulJobResponses();
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(queued)
      .mockResolvedValueOnce(completed);
    vi.stubGlobal('fetch', fetchMock);
    const { analyzeReceipt } = await loadReceiptService();
    const file = makeSyntheticReceiptFile();

    await analyzeReceipt(file);
    const secondResult = await analyzeReceipt(file);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(secondResult.cacheHit).toBe(true);
    expect(secondResult.items[0].name).toBe('Organic Whole Milk');
  });

  it('returns an empty item list when Azure finds no line items', async () => {
    const [queued, completed] = successfulJobResponses({
      storeName: 'Sparse Store',
      date: '2026-05-02',
      items: [],
      skippedItems: [],
    });
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(queued)
      .mockResolvedValueOnce(completed));
    const { analyzeReceipt } = await loadReceiptService();

    const result = await analyzeReceipt(makeSyntheticReceiptFile());

    expect(result).toEqual({
      storeName: 'Sparse Store',
      date: '2026-05-02',
      items: [],
      totalItemsDetected: 0,
      skippedItems: [],
      cacheHit: false,
      estimatedCostCents: 0,
    });
  });

  it('surfaces missing server configuration without exposing a browser key', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({
      provider: 'azure-document-intelligence',
      providerLabel: 'Azure Document Intelligence',
      configured: false,
      reachable: 'blocked',
      status: 'missing-configuration',
      message: 'Azure Document Intelligence is not configured on the app server.',
    }, 503)));
    const { analyzeReceipt } = await loadReceiptService();

    await expect(analyzeReceipt(makeSyntheticReceiptFile())).rejects.toThrow(
      'Azure Document Intelligence is not configured on the app server.',
    );
  });

  it('normalizes non-JSON endpoint responses into a service error', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('<html>SPA fallback</html>', {
      status: 200,
      headers: { 'Content-Type': 'text/html' },
    })));
    const { analyzeReceipt } = await loadReceiptService();

    await expect(analyzeReceipt(makeSyntheticReceiptFile())).rejects.toThrow(
      'The secure receipt OCR endpoint is unavailable on this server.',
    );
  });

  it('uses provider-neutral fallback diagnostics until the server identifies the provider', async () => {
    const { getReceiptOcrDiagnostics, classifyReceiptOcrError } = await loadReceiptService();

    const fallback = getReceiptOcrDiagnostics();
    expect(fallback.provider).toBe('receipt-ocr');
    expect(fallback.providerLabel).toBe('Receipt OCR');
    expect(fallback.message).not.toMatch(/Azure|Mistral/i);

    const classified = classifyReceiptOcrError(new Error('missing configuration'));
    expect(classified.provider).toBe('receipt-ocr');
    expect(classified.providerLabel).toBe('Receipt OCR');
    expect(classified.status).toBe('missing-configuration');
    expect(classified.message).toBe('Receipt OCR is not configured on the app server.');
    expect(classified.message).not.toMatch(/Azure|Mistral/i);

    const credentialError = classifyReceiptOcrError(new Error('401 credential'));
    expect(credentialError.providerLabel).toBe('Receipt OCR');
    expect(credentialError.message).not.toMatch(/Azure|Mistral/i);
  });

  it('preserves a Mistral health payload from the server', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({
      provider: 'mistral-ocr',
      providerLabel: 'Mistral OCR',
      configured: true,
      reachable: 'ok',
      status: 'ready',
      message: 'Mistral OCR is configured and reachable.',
    }));
    vi.stubGlobal('fetch', fetchMock);
    const { checkReceiptOcrHealth } = await loadReceiptService();

    const diagnostics = await checkReceiptOcrHealth();

    expect(diagnostics).toMatchObject({
      provider: 'mistral-ocr',
      providerLabel: 'Mistral OCR',
      status: 'ready',
      message: 'Mistral OCR is configured and reachable.',
    });
    expect(fetchMock).toHaveBeenCalledWith('/api/receipt-ocr', expect.objectContaining({ method: 'GET' }));
  });

  it('preserves an Azure health payload from the server', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({
      provider: 'azure-document-intelligence',
      providerLabel: 'Azure Document Intelligence',
      configured: true,
      reachable: 'ok',
      status: 'ready',
      message: 'Azure Document Intelligence is configured and reachable.',
    }));
    vi.stubGlobal('fetch', fetchMock);
    const { checkReceiptOcrHealth } = await loadReceiptService();

    const diagnostics = await checkReceiptOcrHealth();

    expect(diagnostics.status).toBe('ready');
    expect(diagnostics.provider).toBe('azure-document-intelligence');
    expect(diagnostics.providerLabel).toBe('Azure Document Intelligence');
    expect(fetchMock).toHaveBeenCalledWith('/api/receipt-ocr', expect.objectContaining({ method: 'GET' }));
  });

  it('preserves provider identity from a failed receipt job payload', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(jsonResponse({ jobId: receiptJobId, status: 'queued', retryAfterMs: 1 }, 202))
      .mockResolvedValueOnce(jsonResponse({
        jobId: receiptJobId,
        status: 'failed',
        error: {
          status: 'quota-or-rate-limit',
          message: 'Mistral OCR is reachable, but quota or rate limits blocked this receipt scan.',
          provider: 'mistral-ocr',
          providerLabel: 'Mistral OCR',
        },
      })));
    const { analyzeReceipt } = await loadReceiptService();

    await expect(analyzeReceipt(makeSyntheticReceiptFile())).rejects.toMatchObject({
      diagnostics: {
        provider: 'mistral-ocr',
        providerLabel: 'Mistral OCR',
        status: 'quota-or-rate-limit',
        message: 'Mistral OCR is reachable, but quota or rate limits blocked this receipt scan.',
      },
    });
  });

  it('resumes a stored jobId without POSTing a new receipt job', async () => {
    const completed = jsonResponse({
      jobId: receiptJobId,
      status: 'succeeded',
      attempts: 1,
      maxAttempts: 3,
      result: mockReceiptResponse,
    });
    const fetchMock = vi.fn().mockResolvedValue(completed);
    vi.stubGlobal('fetch', fetchMock);
    const { analyzeReceipt } = await loadReceiptService();

    const result = await analyzeReceipt(makeSyntheticReceiptFile(), { resumeJobId: receiptJobId });

    expect(result.items).toHaveLength(2);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(`/api/receipt-jobs?id=${receiptJobId}`, expect.objectContaining({
      method: 'PUT',
    }));
  });
});
