import { afterEach, describe, expect, it, vi } from 'vitest';

const compression = vi.hoisted(() => ({
    compressImage: vi.fn(),
}));

vi.mock('../../services/imageCompressionService', () => compression);
vi.mock('../../services/visionService', () => ({
    analyzeImage: vi.fn(),
}));

import { createScanThumbnail, ScanQueue } from '../../services/scanQueueService';

describe('createScanThumbnail', () => {
    afterEach(() => {
        vi.useRealTimers();
        vi.restoreAllMocks();
    });

    it('settles and releases its object URL when image decoding stalls', async () => {
        vi.useFakeTimers();
        const revokeObjectURL = vi.fn();
        vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:receipt');
        vi.spyOn(URL, 'revokeObjectURL').mockImplementation(revokeObjectURL);
        class StalledImage {
            onload: (() => void) | null = null;
            onerror: (() => void) | null = null;
            src = '';
            width = 0;
            height = 0;
        }
        vi.stubGlobal('Image', StalledImage);

        const result = createScanThumbnail(new File(['receipt'], 'receipt.jpg', { type: 'image/jpeg' }), 50);
        await vi.advanceTimersByTimeAsync(50);

        await expect(result).resolves.toBe('');
        expect(revokeObjectURL).toHaveBeenCalledWith('blob:receipt');
    });

    it('aborts active compression and suppresses stale updates when cleared', async () => {
        let rejectCompression: ((error: unknown) => void) | undefined;
        compression.compressImage.mockImplementation((_file: File, signal?: AbortSignal) => new Promise((_resolve, reject) => {
            rejectCompression = reject;
            signal?.addEventListener('abort', () => reject(signal.reason), { once: true });
        }));
        vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:receipt');
        vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
        class LoadedImage {
            onload: (() => void) | null = null;
            onerror: (() => void) | null = null;
            width = 1;
            height = 1;
            set src(_value: string) { queueMicrotask(() => this.onload?.()); }
        }
        vi.stubGlobal('Image', LoadedImage);
        vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
            drawImage: vi.fn(),
        } as unknown as CanvasRenderingContext2D);
        vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:image/jpeg;base64,test');
        const updates: number[] = [];
        const queue = new ScanQueue(items => updates.push(items.length));

        await queue.add(new File(['item'], 'item.jpg', { type: 'image/jpeg' }));
        expect(compression.compressImage).toHaveBeenCalled();
        queue.clear();
        await Promise.resolve();

        expect(queue.getQueue()).toEqual([]);
        expect(updates.at(-1)).toBe(0);
        expect(rejectCompression).toBeDefined();
    });
});
