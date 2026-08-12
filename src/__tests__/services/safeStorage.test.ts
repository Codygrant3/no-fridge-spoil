import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearMemoryStorageFallback,
  readLocalJson,
  readLocalValue,
  removeLocalValue,
  writeLocalJson,
  writeLocalValue,
} from '../../services/safeStorage';

describe('safeStorage', () => {
  beforeEach(() => {
    localStorage.clear();
    clearMemoryStorageFallback();
    vi.restoreAllMocks();
  });

  it('falls back to session memory when browser storage throws', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('Storage blocked', 'SecurityError');
    });
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('Storage blocked', 'SecurityError');
    });

    expect(writeLocalValue('preference', 'local-only')).toBe(false);
    expect(readLocalValue('preference')).toBe('local-only');
  });

  it('recovers from invalid JSON and supports safe removal', () => {
    localStorage.setItem('broken', '{');
    expect(readLocalJson('broken', { enabled: false })).toEqual({ enabled: false });
    expect(localStorage.getItem('broken')).toBeNull();

    expect(writeLocalJson('valid', { enabled: true })).toBe(true);
    expect(readLocalJson('valid', { enabled: false })).toEqual({ enabled: true });
    expect(removeLocalValue('valid')).toBe(true);
    expect(readLocalValue('valid')).toBeNull();
  });
});
