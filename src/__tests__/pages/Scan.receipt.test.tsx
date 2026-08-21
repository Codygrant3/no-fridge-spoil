import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Scan } from '../../pages/Scan';
import { db } from '../../db/database';

const mocks = vi.hoisted(() => ({
  analyzeReceipt: vi.fn(),
  analyzeImage: vi.fn(),
  compressReceiptImage: vi.fn(),
  checkReceiptOcrHealth: vi.fn(),
}));

vi.mock('../../services/receiptOCRService', () => ({
  analyzeReceipt: mocks.analyzeReceipt,
  getReceiptOcrDiagnostics: () => ({
    provider: 'receipt-ocr',
    providerLabel: 'Receipt OCR',
    configured: false,
    reachable: 'unknown',
    status: 'unchecked',
    message: 'Receipt OCR runs through the secure app service.',
  }),
  checkReceiptOcrHealth: mocks.checkReceiptOcrHealth,
  queueReceiptScan: vi.fn(() => Promise.resolve({ id: 'queued', name: 'receipt.png', type: 'image/png', dataUrl: '', queuedAt: '', reason: '' })),
  getQueuedReceiptScans: () => [],
  clearQueuedReceiptScan: vi.fn(),
  classifyReceiptOcrError: (error: Error) => ({
    provider: 'receipt-ocr',
    providerLabel: 'Receipt OCR',
    configured: false,
    reachable: 'blocked',
    status: error.message.includes('not configured') ? 'missing-configuration' : 'unknown-error',
    message: error.message.includes('not configured')
      ? 'Receipt OCR is not configured on the app server.'
      : error.message,
  }),
}));

vi.mock('../../services/imageCompressionService', () => ({
  compressImage: vi.fn((file: File) => Promise.resolve(file)),
  compressReceiptImage: mocks.compressReceiptImage,
}));

vi.mock('../../services/receiptImageQualityService', () => ({
  checkReceiptImageQuality: vi.fn(() => Promise.resolve({ ok: true, issues: [] })),
}));

vi.mock('../../services/visionService', () => ({
  analyzeImage: mocks.analyzeImage,
}));

vi.mock('../../components/ReviewItems', () => ({
  ReviewItems: ({
    items,
    receiptMeta,
  }: {
    items: Array<{ id: string; name: string; quantity: number }>;
    receiptMeta?: { skippedItems?: string[]; source?: string };
  }) => (
    <div>
      <h1>Review Scanned Items</h1>
      {receiptMeta?.source && <p>Source: {receiptMeta.source}</p>}
      {receiptMeta?.skippedItems && <p>Skipped: {receiptMeta.skippedItems.join(', ')}</p>}
      {items.map((item) => (
        <p key={item.id}>
          {item.name} x{item.quantity}
        </p>
      ))}
    </div>
  ),
}));

function uploadSyntheticReceipt(container: HTMLElement) {
  const fileInputs = container.querySelectorAll<HTMLInputElement>('input[type="file"]');
  const galleryInput = fileInputs[0];
  const receiptFile = new File(['synthetic receipt bytes'.repeat(80)], 'synthetic-receipt.png', {
    type: 'image/png',
  });

  fireEvent.change(galleryInput, { target: { files: [receiptFile] } });

  return receiptFile;
}

describe('Scan receipt mode', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    mocks.checkReceiptOcrHealth.mockResolvedValue({
      provider: 'azure-document-intelligence',
      providerLabel: 'Azure Document Intelligence',
      configured: true,
      reachable: 'ok',
      status: 'ready',
      message: 'Azure Document Intelligence is configured and reachable.',
    });
    mocks.compressReceiptImage.mockImplementation((file: File) => Promise.resolve(file));
    localStorage.clear();
    await db.receiptHistory.clear();
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: undefined,
    });
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      value: 'visible',
    });
  });

  it('uploads a receipt image, uses receipt OCR, and opens review with extracted grocery items', async () => {
    mocks.analyzeReceipt.mockResolvedValue({
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
    });

    const { container } = render(<Scan />);

    fireEvent.click(screen.getByRole('tab', { name: 'Receipt' }));
    expect(screen.getByText('Tap CAPTURE to photograph your receipt')).toBeInTheDocument();
    expect(screen.getByText('Ready to capture')).toBeInTheDocument();
    expect(screen.queryByText('Receipt OCR setup')).not.toBeInTheDocument();

    const receiptFile = uploadSyntheticReceipt(container);

    await waitFor(() => expect(mocks.compressReceiptImage).toHaveBeenCalledWith(receiptFile));
    await waitFor(() => expect(mocks.analyzeReceipt).toHaveBeenCalledWith(
      receiptFile,
      expect.objectContaining({ onProgress: expect.any(Function) }),
    ));

    expect(await screen.findByText('Review Scanned Items')).toBeInTheDocument();
    expect(screen.getByText('Organic Whole Milk x1')).toBeInTheDocument();
    expect(screen.getByText('Bananas x6')).toBeInTheDocument();
    expect(screen.getByText('Skipped: Dish Soap')).toBeInTheDocument();
  });

  it('shows a setup-specific error when receipt OCR is not configured', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    mocks.analyzeReceipt.mockRejectedValue(new Error('Receipt OCR is not configured on the app server.'));

    const { container } = render(<Scan />);

    fireEvent.click(screen.getByRole('tab', { name: 'Receipt' }));
    uploadSyntheticReceipt(container);

    expect(await screen.findByText(/^Scan failed: Receipt OCR is not configured/)).toBeInTheDocument();
    expect(screen.queryByText(/Azure/i)).not.toBeInTheDocument();
  });

  it('uses a provider-neutral label while checking OCR health', async () => {
    let resolveHealth: ((value: unknown) => void) | undefined;
    mocks.checkReceiptOcrHealth.mockImplementation(() => new Promise((resolve) => {
      resolveHealth = resolve;
    }));

    render(<Scan />);
    fireEvent.click(screen.getByRole('tab', { name: 'Receipt' }));
    fireEvent.click(screen.getByRole('button', { name: 'Receipt settings and scan history' }));

    expect(screen.getByRole('button', { name: 'Check OCR health' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Check OCR health' }));

    expect(await screen.findByRole('button', { name: 'Checking OCR...' })).toBeInTheDocument();
    expect(screen.queryByText(/Checking Azure/i)).not.toBeInTheDocument();

    resolveHealth?.({
      provider: 'mistral-ocr',
      providerLabel: 'Mistral OCR',
      configured: true,
      reachable: 'ok',
      status: 'ready',
      message: 'Mistral OCR is configured and reachable.',
    });

    expect(await screen.findByRole('button', { name: 'Check OCR health' })).toBeInTheDocument();
    expect(await screen.findByText('Mistral OCR is configured and reachable.')).toBeInTheDocument();
  });

  it('loads a local sample receipt without calling cloud OCR', async () => {
    render(<Scan />);

    fireEvent.click(screen.getByRole('tab', { name: 'Receipt' }));
    fireEvent.click(screen.getByRole('button', { name: 'Receipt settings and scan history' }));
    fireEvent.click(screen.getByRole('button', { name: 'Try sample receipt' }));

    expect(await screen.findByText('Review Scanned Items')).toBeInTheDocument();
    expect(screen.getByText('Source: sample')).toBeInTheDocument();
    expect(screen.getByText('Organic Whole Milk x1')).toBeInTheDocument();
    expect(mocks.analyzeReceipt).not.toHaveBeenCalled();
  });

  it('shows privacy-safe guidance when camera permission is denied', async () => {
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: {
        getUserMedia: vi.fn().mockRejectedValue(new DOMException('Denied by browser', 'NotAllowedError')),
      },
    });
    render(<Scan />);

    fireEvent.click(screen.getByRole('button', { name: 'Open camera for item' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Camera access is blocked. Allow camera permission in your browser, or choose a photo instead.',
    );
    expect(screen.queryByText(/Denied by browser/i)).not.toBeInTheDocument();
  });

  it('does not expose raw single-item analysis errors', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    mocks.analyzeImage.mockRejectedValue(new Error('internal-provider-key-abc failed at private endpoint'));
    const { container } = render(<Scan />);
    const galleryInput = container.querySelector<HTMLInputElement>('input[type="file"]');
    const file = new File(['single item'], 'milk.png', { type: 'image/png' });

    fireEvent.change(galleryInput!, { target: { files: [file] } });

    expect(await screen.findByText(/This item could not be analyzed/)).toBeInTheDocument();
    expect(screen.queryByText(/internal-provider-key-abc/i)).not.toBeInTheDocument();
  });

  it('stops an active camera when the app moves to the background', async () => {
    const track = { stop: vi.fn(), onended: null as (() => void) | null };
    const stream = {
      getTracks: () => [track],
      getVideoTracks: () => [track],
    } as unknown as MediaStream;
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: {
        getUserMedia: vi.fn().mockResolvedValue(stream),
      },
    });
    render(<Scan />);

    fireEvent.click(screen.getByRole('button', { name: 'Open camera for item' }));
    await waitFor(() => expect(screen.getByText('Position your item in the frame and tap capture')).toBeInTheDocument());

    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      value: 'hidden',
    });
    fireEvent(document, new Event('visibilitychange'));

    await waitFor(() => expect(track.stop).toHaveBeenCalled());
    expect(screen.getByText(/Camera paused while the app was in the background/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Resume camera' })).toBeInTheDocument();
  });

  it('searches saved receipts and confirms individual deletion', async () => {
    await db.receiptHistory.bulkPut([
      {
        id: 'alpha-receipt',
        scannedAt: '2026-07-25T12:00:00.000Z',
        storeName: 'Alpha Market',
        source: 'gallery',
        itemCount: 3,
        skippedItems: [],
        cacheHit: false,
        status: 'completed',
      },
      {
        id: 'beta-receipt',
        scannedAt: '2026-07-24T12:00:00.000Z',
        storeName: 'Beta Foods',
        source: 'camera',
        itemCount: 2,
        skippedItems: [],
        cacheHit: false,
        status: 'completed',
      },
    ]);
    render(<Scan />);

    fireEvent.click(screen.getByRole('tab', { name: 'Receipt' }));
    fireEvent.click(screen.getByRole('button', { name: 'Receipt settings and scan history' }));
    expect(await screen.findByText('Alpha Market')).toBeInTheDocument();
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search saved receipts' }), {
      target: { value: 'alpha' },
    });

    expect(screen.getByText('Alpha Market')).toBeInTheDocument();
    expect(screen.queryByText('Beta Foods')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Delete receipt from Alpha Market' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm deletion of receipt from Alpha Market' }));

    await waitFor(() => expect(screen.getByText('No saved receipts match that search.')).toBeInTheDocument());
    expect(await db.receiptHistory.get('alpha-receipt')).toBeUndefined();
    expect(await db.receiptHistory.get('beta-receipt')).toBeDefined();
  });
});
