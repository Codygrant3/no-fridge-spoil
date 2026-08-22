import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const analyzeReceiptMock = vi.hoisted(() => vi.fn());

vi.mock('../../services/receiptOCRService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../services/receiptOCRService')>();
  return {
    ...actual,
    analyzeReceipt: analyzeReceiptMock,
  };
});

import { db } from '../../db/database';
import {
  getQueuedReceiptScans,
  queueReceiptScan,
  updateQueuedReceiptScan,
} from '../../services/receiptOCRService';
import { setReceiptPrivacySettings } from '../../services/receiptHistoryService';
import {
  recoverQueuedReceipts,
  stopReceiptRecovery,
} from '../../services/receiptRecoveryService';

function privacy(cloudOcrConsent: boolean) {
  setReceiptPrivacySettings({
    saveHistory: true,
    savePreviews: false,
    previewRetentionDays: 7,
    cloudOcrConsent,
  });
}

function receiptFile() {
  return new File(['SYNTHETIC RECEIPT IMAGE BYTES'], 'queued-receipt.jpg', { type: 'image/jpeg' });
}

describe('receiptRecoveryService', () => {
  beforeEach(async () => {
    localStorage.clear();
    analyzeReceiptMock.mockReset();
    analyzeReceiptMock.mockResolvedValue({ items: [], totalItemsDetected: 0 });
    vi.spyOn(window.navigator, 'onLine', 'get').mockReturnValue(true);
    await db.receiptQueue.clear();
    privacy(true);
  });

  afterEach(() => {
    stopReceiptRecovery();
    vi.restoreAllMocks();
  });

  it('does not start uploads without an authenticated household (enabled: false)', async () => {
    await queueReceiptScan(receiptFile(), 'offline');

    await recoverQueuedReceipts({ enabled: false });

    expect(analyzeReceiptMock).not.toHaveBeenCalled();
    expect(await getQueuedReceiptScans()).toHaveLength(1);
  });

  it('retries a queued blob via analyzeReceipt with the stored consent value', async () => {
    privacy(true);
    const queued = await queueReceiptScan(receiptFile(), 'network-error');

    await recoverQueuedReceipts({ enabled: true });

    expect(analyzeReceiptMock).toHaveBeenCalledTimes(1);
    const [file, options] = analyzeReceiptMock.mock.calls[0] as [File, { cloudConsent?: boolean; resumeJobId?: string }];
    expect(file).toBeInstanceOf(File);
    expect(file.name).toBe(queued.name);
    expect(file.type).toBe(queued.type);
    expect(options).toEqual(expect.objectContaining({ cloudConsent: true }));
    expect(options.resumeJobId).toBeUndefined();
  });

  it('resumes a stored server jobId instead of opening a second reservation', async () => {
    const queued = await queueReceiptScan(receiptFile(), 'network-error');
    await updateQueuedReceiptScan(queued.id, { jobId: '22222222-2222-4222-8222-222222222222' });

    await recoverQueuedReceipts({ enabled: true });

    expect(analyzeReceiptMock).toHaveBeenCalledWith(
      expect.any(File),
      expect.objectContaining({
        cloudConsent: true,
        resumeJobId: '22222222-2222-4222-8222-222222222222',
      }),
    );
  });

  it('does not retry when stored cloud OCR consent is false (consent-required skip)', async () => {
    privacy(false);
    await queueReceiptScan(receiptFile(), 'offline');

    await recoverQueuedReceipts({ enabled: true });

    expect(analyzeReceiptMock).not.toHaveBeenCalled();
    const remaining = await getQueuedReceiptScans();
    expect(remaining).toHaveLength(1);
    expect(remaining[0].retryCount).toBe(0);
  });

  it('does not retry an item whose lastRetryAt is too recent', async () => {
    const queued = await queueReceiptScan(receiptFile(), 'offline');
    const lastRetryAt = new Date().toISOString();
    await updateQueuedReceiptScan(queued.id, {
      retryCount: 1,
      lastRetryAt,
    });

    await recoverQueuedReceipts({ enabled: true, now: Date.parse(lastRetryAt) + 5_000 });

    expect(analyzeReceiptMock).not.toHaveBeenCalled();
    const remaining = await getQueuedReceiptScans();
    expect(remaining).toHaveLength(1);
    expect(remaining[0].retryCount).toBe(1);
    expect(remaining[0].lastRetryAt).toBe(lastRetryAt);
  });

  it('clears the queue entry after a successful analyze', async () => {
    await queueReceiptScan(receiptFile(), 'offline');

    await recoverQueuedReceipts({ enabled: true });

    expect(analyzeReceiptMock).toHaveBeenCalledTimes(1);
    expect(await getQueuedReceiptScans()).toEqual([]);
  });
});
