/// <reference types="node" />

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  authorize: vi.fn(),
  hashIp: vi.fn(() => 'hashed-ip'),
  rpc: vi.fn(),
}));

vi.mock('../../../server/supabaseServer', () => ({
  authorizeHouseholdRequest: mocks.authorize,
  hashRequestIp: mocks.hashIp,
  ServerRequestError: class ServerRequestError extends Error {
    status: number;
    code: string;
    constructor(status: number, code: string, message: string) {
      super(message);
      this.status = status;
      this.code = code;
    }
  },
  serverRequestErrorResponse: vi.fn(() => null),
}));

import { handleReceiptOcrRequest } from '../../../api/receipt-ocr';

const originalEndpoint = process.env.AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT;
const originalKey = process.env.AZURE_DOCUMENT_INTELLIGENCE_KEY;

describe('protected receipt OCR API', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    process.env.AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT = 'https://azure.example.test';
    process.env.AZURE_DOCUMENT_INTELLIGENCE_KEY = 'azure-secret';
    mocks.rpc.mockReset();
    mocks.authorize.mockReset().mockResolvedValue({
      user: { id: 'user-1' },
      householdId: '11111111-1111-4111-8111-111111111111',
      role: 'owner',
      admin: { rpc: mocks.rpc },
    });
    mocks.hashIp.mockClear().mockReturnValue('hashed-ip');
  });

  afterEach(() => {
    if (originalEndpoint === undefined) delete process.env.AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT;
    else process.env.AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT = originalEndpoint;
    if (originalKey === undefined) delete process.env.AZURE_DOCUMENT_INTELLIGENCE_KEY;
    else process.env.AZURE_DOCUMENT_INTELLIGENCE_KEY = originalKey;
    vi.unstubAllGlobals();
  });

  it('requires authorization before returning provider health', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const response = await handleReceiptOcrRequest(new Request('http://localhost/api/receipt-ocr'));

    expect(response.status).toBe(200);
    expect(mocks.authorize).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('returns quota details without sending a denied upload to Azure', async () => {
    mocks.rpc.mockImplementation(async (name: string) => {
      expect(name).toBe('reserve_receipt_scan');
      return {
        data: [{
          allowed: false,
          reason: 'user-daily-limit',
          scan_id: null,
          user_remaining: 0,
          household_remaining: 14,
        }],
        error: null,
      };
    });
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const formData = new FormData();
    formData.append('receipt', new Blob(['receipt'], { type: 'image/jpeg' }), 'receipt.jpg');

    const request = new Request('http://localhost/api/receipt-ocr', {
      method: 'POST',
      headers: { 'X-Receipt-Cloud-Consent': 'true' },
      body: formData,
    });
    vi.spyOn(request, 'formData').mockResolvedValue(formData);
    const response = await handleReceiptOcrRequest(request);
    const body = await response.json();

    expect(response.status).toBe(429);
    expect(response.headers.get('x-ratelimit-remaining-user')).toBe('0');
    expect(response.headers.get('x-ratelimit-remaining-household')).toBe('14');
    expect(body).toMatchObject({ status: 'quota-or-rate-limit', reason: 'user-daily-limit' });
    expect(mocks.hashIp).toHaveBeenCalledTimes(1);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('requires explicit cloud processing consent before reading an upload', async () => {
    const formData = new FormData();
    formData.append('receipt', new Blob(['receipt'], { type: 'image/jpeg' }), 'receipt.jpg');
    const request = new Request('http://localhost/api/receipt-ocr', {
      method: 'POST',
      body: formData,
    });
    const formDataSpy = vi.spyOn(request, 'formData');

    const response = await handleReceiptOcrRequest(request);
    const body = await response.json();

    expect(response.status).toBe(412);
    expect(body.status).toBe('consent-required');
    expect(formDataSpy).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
});
