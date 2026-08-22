import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  imageCompression: vi.fn(),
}));

vi.mock('browser-image-compression', () => ({
  default: mocks.imageCompression,
}));

import { compressImage, compressReceiptImage } from '../../services/imageCompressionService';

function createFile(name: string, type = 'image/png'): File {
  return new File(['original-bytes'], name, { type });
}

describe('imageCompressionService', () => {
  const original = createFile('produce.png');
  const compressed = createFile('produce.jpg', 'image/jpeg');

  beforeEach(() => {
    mocks.imageCompression.mockReset();
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('returns the mocked compressed file on success', async () => {
    mocks.imageCompression.mockResolvedValue(compressed);

    await expect(compressImage(original)).resolves.toBe(compressed);
    await expect(compressReceiptImage(original)).resolves.toBe(compressed);
  });

  it('returns the original file when the compressor throws', async () => {
    mocks.imageCompression.mockRejectedValue(new Error('encoder failed'));

    await expect(compressImage(original)).resolves.toBe(original);
    await expect(compressReceiptImage(original)).resolves.toBe(original);
  });

  it('rejects compressImage when the signal is aborted', async () => {
    const controller = new AbortController();
    const reason = new DOMException('Scan cancelled.', 'AbortError');
    controller.abort(reason);
    mocks.imageCompression.mockRejectedValue(new Error('interrupted'));

    await expect(compressImage(original, controller.signal)).rejects.toBe(reason);
  });

  it('rejects compressImage with AbortError when the aborted signal has no reason', async () => {
    const controller = new AbortController();
    Object.defineProperty(controller.signal, 'aborted', { value: true });
    Object.defineProperty(controller.signal, 'reason', { value: undefined });
    mocks.imageCompression.mockRejectedValue(new Error('interrupted'));

    await expect(compressImage(original, controller.signal)).rejects.toMatchObject({
      name: 'AbortError',
      message: 'Scan cancelled.',
    });
  });

  it('forwards signal and JPEG fileType from compressReceiptImage', async () => {
    const controller = new AbortController();
    mocks.imageCompression.mockResolvedValue(compressed);

    await expect(compressReceiptImage(original, controller.signal)).resolves.toBe(compressed);

    expect(mocks.imageCompression).toHaveBeenCalledTimes(1);
    expect(mocks.imageCompression).toHaveBeenCalledWith(original, {
      maxSizeMB: 0.8,
      maxWidthOrHeight: 1920,
      useWebWorker: true,
      fileType: 'image/jpeg',
      signal: controller.signal,
    });
  });

  it('rejects compressReceiptImage when the signal is aborted', async () => {
    const controller = new AbortController();
    const reason = new DOMException('Scan cancelled.', 'AbortError');
    controller.abort(reason);
    mocks.imageCompression.mockRejectedValue(new Error('interrupted'));

    await expect(compressReceiptImage(original, controller.signal)).rejects.toBe(reason);
  });
});
