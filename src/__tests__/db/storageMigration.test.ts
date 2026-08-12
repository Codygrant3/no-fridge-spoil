import { afterEach, describe, expect, it, vi } from 'vitest';
import { db, initializeDatabase } from '../../db/database';
import { clearMemoryStorageFallback } from '../../services/safeStorage';

describe('legacy storage migration', () => {
    afterEach(async () => {
        vi.restoreAllMocks();
        clearMemoryStorageFallback();
        await db.items.clear();
        await db.stats.clear();
        await db.settings.clear();
        await db.customTags.clear();
    });

    it('does not block database startup when local storage is unavailable', async () => {
        vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
            throw new DOMException('Storage blocked', 'SecurityError');
        });
        vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
            throw new DOMException('Storage blocked', 'SecurityError');
        });

        await expect(initializeDatabase()).resolves.toBeUndefined();
        await expect(db.settings.get('user')).resolves.toBeDefined();
    });
});
