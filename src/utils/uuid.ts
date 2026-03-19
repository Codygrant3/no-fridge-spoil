/**
 * UUID Generator Utility
 *
 * Provides a cross-browser compatible UUID generator that works
 * in both secure (HTTPS) and insecure (HTTP) contexts.
 */

export function generateUUID(): string {
    // Try native crypto.randomUUID first (only works in secure contexts)
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        try {
            return crypto.randomUUID();
        } catch {
            // Fall through to alternatives
        }
    }

    // Fallback using crypto.getRandomValues (more widely supported)
    if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
            const r = crypto.getRandomValues(new Uint8Array(1))[0] % 16;
            const v = c === 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
        });
    }

    // Last resort fallback using Math.random (not cryptographically secure but works everywhere)
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
        const r = Math.random() * 16 | 0;
        const v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}
