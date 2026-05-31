import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Scan } from '../../pages/Scan';

const mocks = vi.hoisted(() => ({
  analyzeReceipt: vi.fn(),
  compressReceiptImage: vi.fn(),
}));

vi.mock('../../services/receiptOCRService', () => ({
  analyzeReceipt: mocks.analyzeReceipt,
  getGeminiReceiptDiagnostics: () => ({
    configured: true,
    reachable: 'unknown',
    status: 'configured',
    message: 'Gemini API key is configured. Connectivity is verified when receipt OCR runs.',
  }),
  checkGeminiReceiptHealth: () => Promise.resolve({
    configured: true,
    reachable: 'ok',
    status: 'configured',
    message: 'Gemini is configured and reachable.',
  }),
  queueReceiptScan: vi.fn(() => Promise.resolve({ id: 'queued', name: 'receipt.png', type: 'image/png', dataUrl: '', queuedAt: '', reason: '' })),
  getQueuedReceiptScans: () => [],
  clearQueuedReceiptScan: vi.fn(),
  classifyReceiptOcrError: (error: Error) => ({
    configured: false,
    reachable: 'blocked',
    status: error.message.includes('API Key') ? 'missing-key' : 'unknown-error',
    message: error.message.includes('API Key')
      ? 'VITE_GEMINI_API_KEY is not configured. Receipt OCR cannot run.'
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
  analyzeImage: vi.fn(),
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
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.compressReceiptImage.mockImplementation((file: File) => Promise.resolve(file));
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

    fireEvent.click(screen.getByRole('button', { name: 'Receipt' }));
    expect(screen.getByText('Tap CAPTURE to photograph your receipt')).toBeInTheDocument();

    const receiptFile = uploadSyntheticReceipt(container);

    await waitFor(() => expect(mocks.compressReceiptImage).toHaveBeenCalledWith(receiptFile));
    await waitFor(() => expect(mocks.analyzeReceipt).toHaveBeenCalledWith(receiptFile));

    expect(await screen.findByText('Review Scanned Items')).toBeInTheDocument();
    expect(screen.getByText('Organic Whole Milk x1')).toBeInTheDocument();
    expect(screen.getByText('Bananas x6')).toBeInTheDocument();
    expect(screen.getByText('Skipped: Dish Soap')).toBeInTheDocument();
  });

  it('shows a setup-specific error when receipt OCR reports a missing Gemini API key', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    mocks.analyzeReceipt.mockRejectedValue(new Error('Missing Gemini API Key'));

    const { container } = render(<Scan />);

    fireEvent.click(screen.getByRole('button', { name: 'Receipt' }));
    uploadSyntheticReceipt(container);

    expect(await screen.findByText(/Gemini API key|VITE_GEMINI_API_KEY/)).toBeInTheDocument();
  });

  it('loads a local sample receipt without calling Gemini OCR', async () => {
    render(<Scan />);

    fireEvent.click(screen.getByRole('button', { name: 'Receipt' }));
    fireEvent.click(screen.getByRole('button', { name: 'Try sample receipt' }));

    expect(await screen.findByText('Review Scanned Items')).toBeInTheDocument();
    expect(screen.getByText('Source: sample')).toBeInTheDocument();
    expect(screen.getByText('Organic Whole Milk x1')).toBeInTheDocument();
    expect(mocks.analyzeReceipt).not.toHaveBeenCalled();
  });
});
