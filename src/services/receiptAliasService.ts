import { getAuthenticatedRequestHeaders } from './cloudSessionService';

const RECEIPT_ALIASES_API_URL = import.meta.env.VITE_RECEIPT_ALIASES_API_URL?.trim() || '/api/receipt-aliases';

export interface ReceiptAliasCorrection {
    merchantName: string;
    rawDescription: string;
    canonicalName: string;
    brand?: string;
    category?: string;
}

export async function saveReceiptAliasCorrections(
    aliases: readonly ReceiptAliasCorrection[],
): Promise<number> {
    if (aliases.length === 0) return 0;
    const headers = await getAuthenticatedRequestHeaders();
    const response = await fetch(RECEIPT_ALIASES_API_URL, {
        method: 'POST',
        headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
            ...headers,
        },
        body: JSON.stringify({ aliases }),
        cache: 'no-store',
    });
    const payload = await response.json().catch(() => null) as { saved?: number; message?: string } | null;
    if (!response.ok) throw new Error(payload?.message || `Receipt correction request failed with HTTP ${response.status}.`);
    return typeof payload?.saved === 'number' ? payload.saved : aliases.length;
}

