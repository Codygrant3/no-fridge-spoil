import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const html5QrcodeMocks = vi.hoisted(() => ({
  start: vi.fn(),
  stop: vi.fn(),
  getState: vi.fn(() => 0),
  scanFile: vi.fn(),
  clear: vi.fn(),
}));

vi.mock('html5-qrcode', () => ({
  Html5Qrcode: vi.fn().mockImplementation(() => ({
    start: html5QrcodeMocks.start,
    stop: html5QrcodeMocks.stop,
    getState: html5QrcodeMocks.getState,
    scanFile: html5QrcodeMocks.scanFile,
    clear: html5QrcodeMocks.clear,
  })),
  Html5QrcodeSupportedFormats: {
    EAN_13: 1,
    EAN_8: 2,
    UPC_A: 3,
    UPC_E: 4,
    CODE_128: 5,
    CODE_39: 6,
  },
}));

const lookupBarcode = vi.hoisted(() => vi.fn());

vi.mock('../../services/barcodeService', () => ({
  lookupBarcode,
}));

import { BarcodeScanner } from '../../components/BarcodeScanner';
import type { BarcodeProductInfo } from '../../services/barcodeService';

const foundProduct: BarcodeProductInfo = {
  barcode: '0123456789012',
  name: 'Organic Whole Milk',
  brand: 'Test Brand',
  found: true,
};

describe('BarcodeScanner', () => {
  const originalMediaDevices = navigator.mediaDevices;

  beforeEach(() => {
    html5QrcodeMocks.start.mockResolvedValue(undefined);
    html5QrcodeMocks.stop.mockResolvedValue(undefined);
    html5QrcodeMocks.getState.mockReturnValue(0);
    lookupBarcode.mockResolvedValue(foundProduct);
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: { getUserMedia: vi.fn() },
    });
  });

  afterEach(() => {
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: originalMediaDevices,
    });
  });

  it('calls onClose when Close scanner is clicked', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(
      <BarcodeScanner isOpen onClose={onClose} onProductFound={vi.fn()} />,
    );

    await user.click(screen.getByRole('button', { name: /close scanner/i }));

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('looks up a typed barcode and reports the product', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const onProductFound = vi.fn();
    render(
      <BarcodeScanner isOpen onClose={onClose} onProductFound={onProductFound} />,
    );

    await user.click(screen.getByRole('button', { name: /manual/i }));
    const barcodeField = screen.getByRole('textbox', { name: /barcode number/i });
    await user.type(barcodeField, '0123456789012');
    await user.click(screen.getByRole('button', { name: /look up product/i }));

    await waitFor(() => {
      expect(lookupBarcode).toHaveBeenCalledWith('0123456789012');
      expect(onProductFound).toHaveBeenCalledWith(foundProduct);
    });
    expect(lookupBarcode.mock.invocationCallOrder[0]).toBeLessThan(
      onProductFound.mock.invocationCallOrder[0],
    );
  });

  it('exposes the manual field as Barcode number', async () => {
    const user = userEvent.setup();
    render(
      <BarcodeScanner isOpen onClose={vi.fn()} onProductFound={vi.fn()} />,
    );

    await user.click(screen.getByRole('button', { name: /manual/i }));

    expect(screen.getByRole('textbox', { name: /barcode number/i })).toBeInTheDocument();
  });

  it('shows the HTTPS photo-capture error when getUserMedia is missing', async () => {
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: {},
    });

    render(
      <BarcodeScanner isOpen onClose={vi.fn()} onProductFound={vi.fn()} />,
    );

    await waitFor(() => {
      expect(
        screen.getByText('Camera requires HTTPS. Use the photo capture option instead.'),
      ).toBeInTheDocument();
    });
    expect(html5QrcodeMocks.start).not.toHaveBeenCalled();
  });
});
