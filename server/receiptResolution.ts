/// <reference types="node" />

import type { SupabaseClient } from '@supabase/supabase-js';
import {
    categorizeReceiptItem,
    type AzureReceiptAnalysis,
    type AzureReceiptLineItem,
} from '../src/services/azureReceiptMapper';
import {
    normalizeReceiptAliasKey,
    resolveReceiptItem,
    type ReceiptCatalogCandidate,
    type ReceiptItemAlias,
} from '../src/services/receiptItemResolver';
import { extractStableBarcodes, lookupOpenFoodFactsProduct } from './openFoodFacts';

interface HouseholdAliasRow {
    merchant_name: string;
    raw_description: string;
    canonical_name: string;
    brand: string | null;
    category: string | null;
}

interface CatalogAliasRow {
    merchant_name: string | null;
    raw_description: string;
    canonical_name: string;
    brand: string | null;
    category: string | null;
    barcode: string | null;
    source: string;
}

async function loadHouseholdAliases(
    admin: SupabaseClient,
    householdId: string,
    merchantName: string | undefined,
): Promise<ReceiptItemAlias[]> {
    const merchantKey = normalizeReceiptAliasKey(merchantName ?? '');
    if (!merchantKey) return [];
    const { data, error } = await admin
        .from('receipt_item_aliases')
        .select('merchant_name, raw_description, canonical_name, brand, category')
        .eq('household_id', householdId)
        .eq('merchant_key', merchantKey)
        .limit(500);
    if (error) {
        console.warn('Receipt household alias enrichment unavailable:', error.code || error.message);
        return [];
    }
    return ((data ?? []) as HouseholdAliasRow[]).map(row => ({
        merchantName: row.merchant_name,
        rawDescription: row.raw_description,
        canonicalName: row.canonical_name,
        brand: row.brand ?? undefined,
        category: row.category ?? undefined,
    }));
}

async function loadVerifiedCatalogAliases(
    admin: SupabaseClient,
    merchantName: string | undefined,
): Promise<ReceiptCatalogCandidate[]> {
    const merchantKey = normalizeReceiptAliasKey(merchantName ?? '');
    const { data, error } = await admin
        .from('receipt_catalog_aliases')
        .select('merchant_name, raw_description, canonical_name, brand, category, barcode, source')
        .eq('active', true)
        .in('merchant_key', merchantKey ? [merchantKey, '*'] : ['*'])
        .limit(500);
    if (error) {
        console.warn('Receipt verified catalog enrichment unavailable:', error.code || error.message);
        return [];
    }
    return ((data ?? []) as CatalogAliasRow[]).map(row => ({
        merchantName: row.merchant_name ?? undefined,
        name: row.canonical_name,
        brand: row.brand ?? undefined,
        category: row.category ?? undefined,
        aliases: [row.raw_description],
        barcode: row.barcode ?? undefined,
        source: row.source,
        verified: true,
    }));
}

async function barcodeCandidate(
    admin: SupabaseClient,
    item: AzureReceiptLineItem,
): Promise<ReceiptCatalogCandidate | null> {
    const barcode = extractStableBarcodes(`${item.name} ${item.sourceLine ?? ''}`)[0];
    if (!barcode) return null;
    const product = await lookupOpenFoodFactsProduct(barcode, fetch, admin);
    if (!product) return null;
    return {
        name: product.name,
        brand: product.brand,
        aliases: [item.name],
        barcode: product.barcode,
        source: product.source,
        verified: false,
    };
}

async function mapWithConcurrency<T, R>(
    values: T[],
    concurrency: number,
    mapper: (value: T, index: number) => Promise<R>,
): Promise<R[]> {
    const results = new Array<R>(values.length);
    let nextIndex = 0;
    const workers = Array.from({ length: Math.min(concurrency, values.length) }, async () => {
        while (nextIndex < values.length) {
            const index = nextIndex;
            nextIndex += 1;
            results[index] = await mapper(values[index], index);
        }
    });
    await Promise.all(workers);
    return results;
}

function hasNameProposal(item: AzureReceiptLineItem, proposedName: string): boolean {
    return normalizeReceiptAliasKey(item.name) !== normalizeReceiptAliasKey(proposedName);
}

export async function enrichReceiptAnalysis(
    admin: SupabaseClient,
    householdId: string,
    analysis: AzureReceiptAnalysis,
): Promise<AzureReceiptAnalysis> {
    const [learnedAliases, verifiedCatalogAliases, barcodeCandidates] = await Promise.all([
        loadHouseholdAliases(admin, householdId, analysis.storeName),
        loadVerifiedCatalogAliases(admin, analysis.storeName),
        mapWithConcurrency(analysis.items, 4, item => barcodeCandidate(admin, item)),
    ]);

    let proposed = 0;
    let autoAccepted = 0;
    let needsReview = 0;
    let barcodeMatches = 0;

    const items = analysis.items.map((item, index) => {
        const originalName = item.name;
        const barcode = barcodeCandidates[index];
        const resolved = resolveReceiptItem(originalName, {
            merchantName: analysis.storeName,
            sourceLine: item.sourceLine,
            learnedAliases,
            catalogCandidates: barcode
                ? [...verifiedCatalogAliases, barcode]
                : verifiedCatalogAliases,
        });
        const proposedCategory = resolved.category ?? categorizeReceiptItem(resolved.canonicalName);
        const hasProposal = hasNameProposal(item, resolved.canonicalName)
            || Boolean(resolved.brand && resolved.brand !== item.brand);
        if (hasProposal) proposed += 1;
        if (resolved.autoAccepted) autoAccepted += 1;
        if (resolved.shouldReview && hasProposal) needsReview += 1;
        if (resolved.barcode) barcodeMatches += 1;

        return {
            ...item,
            originalName,
            name: resolved.autoAccepted ? resolved.canonicalName : originalName,
            brand: resolved.autoAccepted ? resolved.brand ?? item.brand : item.brand,
            category: resolved.autoAccepted ? proposedCategory : item.category,
            resolution: {
                proposedName: resolved.canonicalName,
                proposedBrand: resolved.brand,
                proposedCategory,
                confidence: resolved.confidence,
                method: resolved.method,
                shouldReview: resolved.shouldReview && hasProposal,
                autoAccepted: resolved.autoAccepted,
                alternatives: resolved.alternatives,
                unresolvedTokens: resolved.unresolvedTokens,
                evidence: resolved.evidence,
                packageInfo: resolved.packageInfo,
                soldByWeight: resolved.soldByWeight,
                itemCode: resolved.itemCode,
                barcode: resolved.barcode,
                catalogSource: resolved.catalogSource,
            },
        } satisfies AzureReceiptLineItem;
    });

    return {
        ...analysis,
        items,
        resolutionMode: 'shadow',
        resolutionStats: { proposed, autoAccepted, needsReview, barcodeMatches },
    };
}
