import { afterEach, describe, expect, it, vi } from 'vitest';
import { checkReceiptImageQuality } from '../../services/receiptImageQualityService';

describe('checkReceiptImageQuality', () => {
    afterEach(() => {
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
    });

    it('blocks an image that the browser cannot decode', async () => {
        vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:bad-receipt');
        vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
        class BrokenImage {
            onload: (() => void) | null = null;
            onerror: (() => void) | null = null;
            set src(_value: string) {
                this.onerror?.();
            }
        }
        vi.stubGlobal('Image', BrokenImage);
        const file = new File(
            [new Uint8Array(2_000)],
            'receipt.jpg',
            { type: 'image/jpeg' },
        );

        const result = await checkReceiptImageQuality(file);

        expect(result.ok).toBe(false);
        expect(result.issues).toContainEqual(expect.objectContaining({ code: 'unreadable-image' }));
    });
});
