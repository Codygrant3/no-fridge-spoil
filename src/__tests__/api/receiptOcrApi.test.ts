/// <reference types="node" />

import { afterEach, describe, expect, it } from 'vitest';
import { getAzureConfig, handleReceiptOcrRequest } from '../../../api/receipt-ocr';

const originalEndpoint = process.env.AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT;
const originalKey = process.env.AZURE_DOCUMENT_INTELLIGENCE_KEY;
const originalModelId = process.env.AZURE_DOCUMENT_INTELLIGENCE_MODEL_ID;
const originalCustomApproval = process.env.AZURE_CUSTOM_RECEIPT_MODEL_APPROVED;

function restoreEnvironment(): void {
  if (originalEndpoint === undefined) delete process.env.AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT;
  else process.env.AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT = originalEndpoint;

  if (originalKey === undefined) delete process.env.AZURE_DOCUMENT_INTELLIGENCE_KEY;
  else process.env.AZURE_DOCUMENT_INTELLIGENCE_KEY = originalKey;

  if (originalModelId === undefined) delete process.env.AZURE_DOCUMENT_INTELLIGENCE_MODEL_ID;
  else process.env.AZURE_DOCUMENT_INTELLIGENCE_MODEL_ID = originalModelId;
  if (originalCustomApproval === undefined) delete process.env.AZURE_CUSTOM_RECEIPT_MODEL_APPROVED;
  else process.env.AZURE_CUSTOM_RECEIPT_MODEL_APPROVED = originalCustomApproval;
}

describe('receipt OCR API configuration', () => {
  afterEach(restoreEnvironment);

  it('returns structured missing-configuration diagnostics when server secrets are absent', async () => {
    delete process.env.AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT;
    delete process.env.AZURE_DOCUMENT_INTELLIGENCE_KEY;

    const response = await handleReceiptOcrRequest(new Request('http://localhost/api/receipt-ocr'));
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(body).toMatchObject({
      provider: 'azure-document-intelligence',
      configured: false,
      status: 'missing-configuration',
    });
  });

  it('rejects invalid and stringified undefined configuration values', async () => {
    process.env.AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT = 'undefined';
    process.env.AZURE_DOCUMENT_INTELLIGENCE_KEY = 'undefined';

    const response = await handleReceiptOcrRequest(new Request('http://localhost/api/receipt-ocr'));

    expect(response.status).toBe(503);
  });

  it('keeps custom Azure models disabled until explicitly approved', () => {
    process.env.AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT = 'https://azure.example.test';
    process.env.AZURE_DOCUMENT_INTELLIGENCE_KEY = 'azure-key';
    process.env.AZURE_DOCUMENT_INTELLIGENCE_MODEL_ID = 'retailer-receipt-v1';
    process.env.AZURE_CUSTOM_RECEIPT_MODEL_APPROVED = 'false';

    expect(getAzureConfig()).toMatchObject({ modelId: 'prebuilt-receipt', usingCustomModel: false });

    process.env.AZURE_CUSTOM_RECEIPT_MODEL_APPROVED = 'true';
    expect(getAzureConfig()).toMatchObject({ modelId: 'retailer-receipt-v1', usingCustomModel: true });
  });
});
