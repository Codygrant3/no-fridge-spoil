import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../../db/database';
import { getDefaultSampleReceipt } from '../../services/sampleReceiptService';
import {
  clearReceiptPrivacyData,
  deleteReceiptHistoryEntry,
  getReceiptHistory,
  saveReceiptHistory,
  setReceiptPrivacySettings,
} from '../../services/receiptHistoryService';

describe('receiptHistoryService', () => {
  beforeEach(async () => {
    localStorage.clear();
    await db.receiptHistory.clear();
    await db.receiptQueue.clear();
    await db.aiCache.clear();
    setReceiptPrivacySettings({
      saveHistory: true,
      savePreviews: false,
      previewRetentionDays: 7,
      cloudOcrConsent: false,
    });
  });

  it('migrates legacy metadata into IndexedDB and removes the localStorage copy', async () => {
    localStorage.setItem('no-fridge-spoil:receipt-history', JSON.stringify([{
      id: 'legacy-1',
      scannedAt: '2026-07-24T12:00:00.000Z',
      source: 'gallery',
      itemCount: 2,
      skippedItems: [],
      cacheHit: false,
      status: 'completed',
    }]));

    const history = await getReceiptHistory();

    expect(history).toHaveLength(1);
    expect(history[0].id).toBe('legacy-1');
    expect(await db.receiptHistory.get('legacy-1')).toBeDefined();
    expect(localStorage.getItem('no-fridge-spoil:receipt-history')).toBeNull();
  });

  it('stores new history transactionally and clears every local receipt artifact', async () => {
    await saveReceiptHistory(getDefaultSampleReceipt().result, { source: 'sample' });
    await db.receiptQueue.put({
      id: 'queued-1',
      name: 'receipt.png',
      type: 'image/png',
      size: 4,
      imageBlob: new Blob(['test'], { type: 'image/png' }),
      queuedAt: '2026-07-25T12:00:00.000Z',
      expiresAt: '2026-07-26T12:00:00.000Z',
      reason: 'offline',
      retryCount: 0,
    });
    await db.aiCache.put({
      cacheKey: 'receipt-cache',
      serviceType: 'receipt',
      response: '{}',
      cachedAt: '2026-07-25T12:00:00.000Z',
      expiresAt: '2026-07-26T12:00:00.000Z',
      hitCount: 0,
      sizeBytes: 2,
    });

    await clearReceiptPrivacyData();

    expect(await db.receiptHistory.count()).toBe(0);
    expect(await db.receiptQueue.count()).toBe(0);
    expect(await db.aiCache.where('serviceType').equals('receipt').count()).toBe(0);
  });

  it('stores opted-in previews as blobs instead of transient object URLs', async () => {
    setReceiptPrivacySettings({
      saveHistory: true,
      savePreviews: true,
      previewRetentionDays: 7,
      cloudOcrConsent: false,
    });
    const previewBlob = new Blob(['receipt image'], { type: 'image/png' });

    const saved = await saveReceiptHistory(getDefaultSampleReceipt().result, {
      source: 'gallery',
      previewBlob,
    });
    const stored = saved ? await db.receiptHistory.get(saved.id) : undefined;

    expect(saved?.previewBlob).toBe(previewBlob);
    expect(stored).toHaveProperty('previewBlob');
    expect(stored?.previewUrl).toBeUndefined();
  });

  it('deletes one history record without clearing the rest', async () => {
    await db.receiptHistory.bulkPut([
      {
        id: 'delete-me',
        scannedAt: '2026-07-25T12:00:00.000Z',
        source: 'gallery',
        itemCount: 1,
        skippedItems: [],
        cacheHit: false,
        status: 'completed',
      },
      {
        id: 'keep-me',
        scannedAt: '2026-07-24T12:00:00.000Z',
        source: 'camera',
        itemCount: 2,
        skippedItems: [],
        cacheHit: false,
        status: 'completed',
      },
    ]);

    await deleteReceiptHistoryEntry('delete-me');

    expect(await db.receiptHistory.get('delete-me')).toBeUndefined();
    expect(await db.receiptHistory.get('keep-me')).toBeDefined();
  });
});
