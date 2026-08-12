const memoryFallback = new Map<string, string>();

function getStorage(): Storage | null {
    try {
        return typeof window === 'undefined' ? null : window.localStorage;
    } catch {
        return null;
    }
}

export function readLocalValue(key: string): string | null {
    try {
        const value = getStorage()?.getItem(key);
        if (value !== null && value !== undefined) {
            memoryFallback.set(key, value);
            return value;
        }
    } catch {
        // Fall through to the session-only copy.
    }
    return memoryFallback.get(key) ?? null;
}

export function writeLocalValue(key: string, value: string): boolean {
    memoryFallback.set(key, value);
    try {
        const storage = getStorage();
        if (!storage) return false;
        storage.setItem(key, value);
        return true;
    } catch {
        return false;
    }
}

export function removeLocalValue(key: string): boolean {
    memoryFallback.delete(key);
    try {
        const storage = getStorage();
        if (!storage) return false;
        storage.removeItem(key);
        return true;
    } catch {
        return false;
    }
}

export function readLocalJson<T>(key: string, fallback: T): T {
    const raw = readLocalValue(key);
    if (!raw) return fallback;
    try {
        return JSON.parse(raw) as T;
    } catch {
        removeLocalValue(key);
        return fallback;
    }
}

export function writeLocalJson(key: string, value: unknown): boolean {
    try {
        return writeLocalValue(key, JSON.stringify(value));
    } catch {
        return false;
    }
}

export function clearMemoryStorageFallback(): void {
    memoryFallback.clear();
}
