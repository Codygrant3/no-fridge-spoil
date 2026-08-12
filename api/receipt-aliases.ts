/// <reference types="node" />

import {
    authorizeHouseholdRequest,
    ServerRequestError,
    serverRequestErrorResponse,
} from '../server/supabaseServer';
import { normalizeReceiptAliasKey } from '../src/services/receiptItemResolver';

interface AliasInput {
    merchantName: string;
    rawDescription: string;
    canonicalName: string;
    brand?: string;
    category?: string;
}

function jsonResponse(body: unknown, status = 200, extraHeaders: HeadersInit = {}): Response {
    return Response.json(body, {
        status,
        headers: {
            'Cache-Control': 'no-store',
            ...Object.fromEntries(new Headers(extraHeaders)),
        },
    });
}

function cleanText(value: unknown, maxLength: number): string {
    if (typeof value !== 'string') return '';
    return [...value]
        .filter(character => {
            const code = character.charCodeAt(0);
            return code >= 32 && code !== 127;
        })
        .join('')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, maxLength);
}

function parseAlias(value: unknown): AliasInput {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw new ServerRequestError(400, 'invalid-alias', 'Send a valid receipt correction.');
    }
    const row = value as Record<string, unknown>;
    const alias: AliasInput = {
        merchantName: cleanText(row.merchantName, 160),
        rawDescription: cleanText(row.rawDescription, 240),
        canonicalName: cleanText(row.canonicalName, 200),
        brand: cleanText(row.brand, 100) || undefined,
        category: cleanText(row.category, 80) || undefined,
    };
    if (!alias.merchantName || !alias.rawDescription || !alias.canonicalName) {
        throw new ServerRequestError(
            400,
            'invalid-alias',
            'Store, receipt description, and corrected product name are required.',
        );
    }
    return alias;
}

async function saveAliases(request: Request): Promise<Response> {
    const authorization = await authorizeHouseholdRequest(request);
    const payload = await request.json().catch(() => null) as { aliases?: unknown } | null;
    if (!payload || !Array.isArray(payload.aliases) || payload.aliases.length === 0 || payload.aliases.length > 100) {
        throw new ServerRequestError(400, 'invalid-alias-batch', 'Send between 1 and 100 receipt corrections.');
    }

    const deduplicated = new Map<string, AliasInput>();
    for (const value of payload.aliases) {
        const alias = parseAlias(value);
        const key = `${normalizeReceiptAliasKey(alias.merchantName)}\u0000${normalizeReceiptAliasKey(alias.rawDescription)}`;
        deduplicated.set(key, alias);
    }

    const values = [...deduplicated.values()].map(alias => ({
        household_id: authorization.householdId,
        merchant_name: alias.merchantName,
        merchant_key: normalizeReceiptAliasKey(alias.merchantName),
        raw_description: alias.rawDescription,
        raw_description_key: normalizeReceiptAliasKey(alias.rawDescription),
        canonical_name: alias.canonicalName,
        brand: alias.brand ?? null,
        category: alias.category ?? null,
        created_by: authorization.user.id,
        updated_by: authorization.user.id,
    }));

    const { data, error } = await authorization.admin
        .from('receipt_item_aliases')
        .upsert(values, { onConflict: 'household_id,merchant_key,raw_description_key' })
        .select('id');
    if (error) throw error;
    return jsonResponse({ saved: data?.length ?? values.length }, 201);
}

export async function handleReceiptAliasesRequest(request: Request): Promise<Response> {
    try {
        if (request.method !== 'POST') {
            return jsonResponse({ message: 'Method not allowed.' }, 405, { Allow: 'POST' });
        }
        return await saveAliases(request);
    } catch (error) {
        const requestError = serverRequestErrorResponse(error);
        if (requestError) return requestError;
        console.error('Receipt alias request failed:', error instanceof Error ? error.message : error);
        return jsonResponse({
            status: 'account-service-error',
            message: 'Receipt corrections could not be saved.',
        }, 500);
    }
}

export default {
    fetch: handleReceiptAliasesRequest,
};

