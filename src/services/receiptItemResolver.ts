export type ReceiptResolutionConfidence = 'High' | 'Medium' | 'Low';

export type ReceiptResolutionMethod =
    | 'learned-alias'
    | 'catalog-alias'
    | 'barcode-lookup'
    | 'catalog-match'
    | 'store-alias'
    | 'token-expansion'
    | 'unchanged';

export type ReceiptMeasureUnit = 'oz' | 'lb' | 'g' | 'kg' | 'ml' | 'l' | 'gallon' | 'quart' | 'pint';

export interface ReceiptPackageInfo {
    count?: number;
    size?: number;
    unit?: ReceiptMeasureUnit;
}

export interface ReceiptWeightInfo {
    value: number;
    unit: 'lb' | 'oz' | 'g' | 'kg';
}

export interface ReceiptItemAlias {
    rawDescription: string;
    canonicalName: string;
    merchantName?: string;
    brand?: string;
    category?: string;
}

export interface ReceiptCatalogCandidate {
    name: string;
    merchantName?: string;
    brand?: string;
    category?: string;
    aliases?: readonly string[];
    verified?: boolean;
    barcode?: string;
    source?: string;
}

export interface ResolveReceiptItemOptions {
    merchantName?: string;
    sourceLine?: string;
    learnedAliases?: readonly ReceiptItemAlias[];
    catalogCandidates?: readonly ReceiptCatalogCandidate[];
}

export interface ResolvedReceiptItem {
    originalName: string;
    canonicalName: string;
    brand?: string;
    category?: string;
    confidence: ReceiptResolutionConfidence;
    method: ReceiptResolutionMethod;
    shouldReview: boolean;
    autoAccepted: boolean;
    packageInfo?: ReceiptPackageInfo;
    soldByWeight?: ReceiptWeightInfo;
    itemCode?: string;
    barcode?: string;
    catalogSource?: string;
    unresolvedTokens: string[];
    alternatives: string[];
    evidence: string[];
    isLikelyAdjustment: boolean;
}

interface ParsedDescriptionMetadata {
    cleanedDescription: string;
    packageInfo?: ReceiptPackageInfo;
    soldByWeight?: ReceiptWeightInfo;
    itemCode?: string;
}

interface PhraseRule {
    tokens: readonly string[];
    replacement: readonly string[];
}

interface StoreBrandRule {
    merchantTerms: readonly string[];
    token: string;
    brand: string;
}

const PHRASE_RULES: readonly PhraseRule[] = [
    { tokens: ['BNLS', 'SKNLS'], replacement: ['boneless', 'skinless'] },
    { tokens: ['GRND', 'BF'], replacement: ['ground', 'beef'] },
    { tokens: ['CR', 'CHS'], replacement: ['cream', 'cheese'] },
    { tokens: ['HVY', 'WHP', 'CRM'], replacement: ['heavy', 'whipping', 'cream'] },
    { tokens: ['HVY', 'WHPNG', 'CRM'], replacement: ['heavy', 'whipping', 'cream'] },
    { tokens: ['HVY', 'CRM'], replacement: ['heavy', 'cream'] },
    { tokens: ['SR', 'CRM'], replacement: ['sour', 'cream'] },
    { tokens: ['PNUT', 'BTR'], replacement: ['peanut', 'butter'] },
] as const;

const TOKEN_EXPANSIONS: Readonly<Record<string, readonly string[]>> = {
    ALMD: ['almond'],
    BNLS: ['boneless'],
    BNNA: ['bananas'],
    BRCL: ['broccoli'],
    BRCLI: ['broccoli'],
    BRN: ['brown'],
    BRST: ['breast'],
    BUTTR: ['butter'],
    CHDR: ['cheddar'],
    CHKN: ['chicken'],
    CHS: ['cheese'],
    CKN: ['chicken'],
    CLB: ['club'],
    CPN: ['coupon'],
    DISC: ['discount'],
    DSH: ['dish'],
    EG: ['eggs'],
    EVOO: ['extra', 'virgin', 'olive', 'oil'],
    FRZ: ['frozen'],
    GRK: ['greek'],
    GRND: ['ground'],
    HRTS: ['hearts'],
    HVY: ['heavy'],
    LG: ['large'],
    MFR: ['manufacturer'],
    MIX: ['mixed'],
    MLK: ['milk'],
    OJ: ['orange', 'juice'],
    ORG: ['organic'],
    PNUT: ['peanut'],
    PPR: ['paper'],
    RMA: ['romaine'],
    RMAINE: ['romaine'],
    SHRD: ['shredded'],
    SKNLS: ['skinless'],
    SLCD: ['sliced'],
    SPNCH: ['spinach'],
    STRAWB: ['strawberries'],
    SWT: ['sweet'],
    TRKY: ['turkey'],
    TURK: ['turkey'],
    TWL: ['towels'],
    VAN: ['vanilla'],
    VEG: ['vegetables'],
    WHL: ['whole'],
    WHPNG: ['whipping'],
    YGRT: ['yogurt'],
    YOG: ['yogurt'],
} as const;

const AMBIGUOUS_TOKENS = new Set([
    'BF',
    'BTR',
    'CR',
    'CRM',
    'GRN',
    'POT',
    'RD',
    'REG',
    'SM',
    'WHT',
]);

const AMBIGUOUS_COMPARISON_TOKENS: Readonly<Record<string, readonly string[]>> = {
    GRN: ['green', 'grain'],
} as const;

const SAFE_SHORT_WORDS = new Set([
    'and',
    'bar',
    'beef',
    'bun',
    'can',
    'egg',
    'fat',
    'ham',
    'hot',
    'ice',
    'low',
    'mix',
    'no',
    'nut',
    'oat',
    'oil',
    'pie',
    'raw',
    'red',
    'soy',
    'tea',
]);

const STORE_BRAND_RULES: readonly StoreBrandRule[] = [
    { merchantTerms: ['walmart', 'wal mart'], token: 'GV', brand: 'Great Value' },
    { merchantTerms: ['costco'], token: 'KS', brand: 'Kirkland Signature' },
    { merchantTerms: ['kroger'], token: 'KRO', brand: 'Kroger' },
    { merchantTerms: ['target'], token: 'GG', brand: 'Good & Gather' },
    { merchantTerms: ['safeway', 'albertsons'], token: 'OO', brand: 'O Organics' },
] as const;

const ADJUSTMENT_TERMS = new Set([
    'bag fee',
    'bottle deposit',
    'change',
    'coupon',
    'discount',
    'loyalty discount',
    'manufacturer coupon',
    'savings',
    'snap ebt',
    'subtotal',
    'tax',
    'tender',
    'total',
]);

const UNIT_ALIASES: Readonly<Record<string, ReceiptMeasureUnit>> = {
    G: 'g',
    GAL: 'gallon',
    GLN: 'gallon',
    KG: 'kg',
    L: 'l',
    LB: 'lb',
    LBS: 'lb',
    ML: 'ml',
    OZ: 'oz',
    PT: 'pint',
    QT: 'quart',
};

export function normalizeReceiptAliasKey(value: string): string {
    return value
        .toLowerCase()
        .replace(/&/g, ' and ')
        .replace(/[^a-z0-9%/]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function merchantMatches(expected: string | undefined, actual: string | undefined): boolean {
    if (!expected) return true;
    const expectedKey = normalizeReceiptAliasKey(expected);
    const actualKey = normalizeReceiptAliasKey(actual ?? '');
    if (!actualKey) return false;
    return actualKey.includes(expectedKey) || expectedKey.includes(actualKey);
}

function formatCanonicalToken(token: string): string {
    if (/^\d+(?:\.\d+)?%$/.test(token) || /^\d+\/\d+$/.test(token)) return token;
    return token.length === 0 ? token : `${token[0].toUpperCase()}${token.slice(1).toLowerCase()}`;
}

function formatCanonicalName(tokens: readonly string[]): string {
    return tokens.map(formatCanonicalToken).join(' ').replace(/\s+/g, ' ').trim();
}

function unitFromToken(value: string): ReceiptMeasureUnit | undefined {
    return UNIT_ALIASES[value.toUpperCase()];
}

function extractDescriptionMetadata(rawDescription: string, sourceLine?: string): ParsedDescriptionMetadata {
    let cleanedDescription = rawDescription.trim();
    let packageInfo: ReceiptPackageInfo | undefined;
    let soldByWeight: ReceiptWeightInfo | undefined;

    const source = `${rawDescription} ${sourceLine ?? ''}`.toUpperCase();
    const soldByWeightMatch = source.match(/(\d+(?:\.\d+)?)\s*(LB|LBS|OZ|KG|G)\b(?=[^\n]*?(?:@|\/\s*(?:LB|LBS|OZ|KG|G)\b))/);
    if (soldByWeightMatch) {
        const unit = unitFromToken(soldByWeightMatch[2]);
        if (unit === 'lb' || unit === 'oz' || unit === 'g' || unit === 'kg') {
            soldByWeight = { value: Number(soldByWeightMatch[1]), unit };
        }
    }

    const countMatch = cleanedDescription.match(/\b(\d+)\s*(PK|PACK|CT|COUNT|DZ)\b/i);
    if (countMatch) {
        const rawCount = Number(countMatch[1]);
        packageInfo = { count: countMatch[2].toUpperCase() === 'DZ' ? rawCount * 12 : rawCount };
        cleanedDescription = cleanedDescription.replace(countMatch[0], ' ');
    }

    const sizeMatch = cleanedDescription.match(/\b(\d+(?:\.\d+)?)\s*(OZ|LBS?|KG|G|GAL|GLN|QT|PT|ML|L)\b/i);
    if (sizeMatch && !soldByWeight) {
        const unit = unitFromToken(sizeMatch[2]);
        if (unit) packageInfo = { ...packageInfo, size: Number(sizeMatch[1]), unit };
        cleanedDescription = cleanedDescription.replace(sizeMatch[0], ' ');
    } else if (!soldByWeight) {
        const standaloneVolumeMatch = cleanedDescription.match(/\b(GAL|GLN)\b/i);
        if (standaloneVolumeMatch) {
            packageInfo = { ...packageInfo, size: 1, unit: 'gallon' };
            cleanedDescription = cleanedDescription.replace(standaloneVolumeMatch[0], ' ');
        }
    }

    const itemCodeMatch = cleanedDescription.match(/^\s*(\d{4,8})\b/);
    const itemCode = itemCodeMatch?.[1];
    if (itemCodeMatch) cleanedDescription = cleanedDescription.slice(itemCodeMatch[0].length);

    cleanedDescription = cleanedDescription
        .replace(/\s+\$?\d+\.\d{2}\s*$/, '')
        .replace(/\s+/g, ' ')
        .trim();

    return {
        cleanedDescription,
        packageInfo,
        soldByWeight,
        itemCode,
    };
}

function storeBrandFor(merchantName: string | undefined, tokens: string[]): { brand?: string; matched: boolean } {
    if (!merchantName || tokens.length === 0) return { matched: false };
    const merchant = normalizeReceiptAliasKey(merchantName);
    const rule = STORE_BRAND_RULES.find(candidate => (
        candidate.token === tokens[0]
        && candidate.merchantTerms.some(term => merchant.includes(normalizeReceiptAliasKey(term)))
    ));
    if (!rule) return { matched: false };
    tokens.shift();
    return { brand: rule.brand, matched: true };
}

function applyPhraseRules(tokens: readonly string[]): { tokens: string[]; expansions: string[] } {
    const result: string[] = [];
    const expansions: string[] = [];
    let index = 0;

    while (index < tokens.length) {
        const rule = PHRASE_RULES.find(candidate => candidate.tokens.every(
            (token, offset) => tokens[index + offset] === token,
        ));
        if (!rule) {
            result.push(tokens[index]);
            index += 1;
            continue;
        }

        result.push(...rule.replacement);
        expansions.push(`${rule.tokens.join(' ')} -> ${rule.replacement.join(' ')}`);
        index += rule.tokens.length;
    }

    return { tokens: result, expansions };
}

function looksUnresolved(token: string): boolean {
    const key = token.toLowerCase();
    if (SAFE_SHORT_WORDS.has(key)) return false;
    if (AMBIGUOUS_TOKENS.has(token)) return true;
    if (/^[a-z]+$/i.test(token) && token.length <= 3) return true;
    if (/^[a-z0-9]+$/i.test(token) && /\d/.test(token) && /[a-z]/i.test(token)) return true;
    return token.length <= 4 && !/[aeiou]/i.test(token);
}

function comparisonTokens(value: string): Set<string> {
    const result = new Set<string>();
    for (const token of normalizeReceiptAliasKey(value).split(' ').filter(Boolean)) {
        const comparable = token === 'mixed' ? 'mix' : token;
        result.add(comparable);
        for (const alternative of AMBIGUOUS_COMPARISON_TOKENS[token.toUpperCase()] ?? []) {
            result.add(alternative);
        }
    }
    return result;
}

function candidateTokens(candidate: ReceiptCatalogCandidate): Set<string> {
    return comparisonTokens(`${candidate.brand ?? ''} ${candidate.name}`);
}

function tokenSimilarity(sourceName: string, candidate: ReceiptCatalogCandidate): number {
    const source = comparisonTokens(sourceName);
    const target = candidateTokens(candidate);
    if (source.size === 0 || target.size === 0) return 0;
    const overlap = [...source].filter(token => target.has(token)).length;
    const union = new Set([...source, ...target]).size;
    const containment = overlap / Math.min(source.size, target.size);
    return Math.max(overlap / union, containment * 0.9);
}

function matchingCandidates(
    sourceName: string,
    merchantName: string | undefined,
    candidates: readonly ReceiptCatalogCandidate[],
): Array<{ candidate: ReceiptCatalogCandidate; score: number }> {
    return candidates
        .filter(candidate => merchantMatches(candidate.merchantName, merchantName))
        .map(candidate => ({ candidate, score: tokenSimilarity(sourceName, candidate) }))
        .filter(result => result.score >= 0.35)
        .sort((left, right) => right.score - left.score);
}

function baseResult(
    rawDescription: string,
    metadata: ParsedDescriptionMetadata,
    values: Omit<ResolvedReceiptItem, 'originalName' | 'packageInfo' | 'soldByWeight' | 'itemCode'>,
): ResolvedReceiptItem {
    return {
        originalName: rawDescription.trim(),
        ...values,
        ...(metadata.packageInfo ? { packageInfo: metadata.packageInfo } : {}),
        ...(metadata.soldByWeight ? { soldByWeight: metadata.soldByWeight } : {}),
        ...(metadata.itemCode ? { itemCode: metadata.itemCode } : {}),
    };
}

export function resolveReceiptItem(
    rawDescription: string,
    options: ResolveReceiptItemOptions = {},
): ResolvedReceiptItem {
    const metadata = extractDescriptionMetadata(rawDescription, options.sourceLine);
    const rawKey = normalizeReceiptAliasKey(rawDescription);
    const aliases = options.learnedAliases ?? [];
    const catalog = options.catalogCandidates ?? [];

    const learnedAlias = aliases.find(alias => (
        normalizeReceiptAliasKey(alias.rawDescription) === rawKey
        && merchantMatches(alias.merchantName, options.merchantName)
    ));
    if (learnedAlias) {
        return baseResult(rawDescription, metadata, {
            canonicalName: learnedAlias.canonicalName,
            brand: learnedAlias.brand,
            category: learnedAlias.category,
            confidence: 'High',
            method: 'learned-alias',
            shouldReview: false,
            autoAccepted: true,
            unresolvedTokens: [],
            alternatives: [],
            evidence: ['Matched a household-confirmed receipt alias.'],
            isLikelyAdjustment: false,
        });
    }

    const catalogAlias = catalog.find(candidate => (
        merchantMatches(candidate.merchantName, options.merchantName)
        && (candidate.aliases ?? []).some(alias => normalizeReceiptAliasKey(alias) === rawKey)
    ));
    if (catalogAlias) {
        const verified = catalogAlias.verified === true;
        return baseResult(rawDescription, metadata, {
            canonicalName: catalogAlias.name,
            brand: catalogAlias.brand,
            category: catalogAlias.category,
            confidence: verified ? 'High' : 'Medium',
            method: verified ? 'catalog-alias' : catalogAlias.barcode ? 'barcode-lookup' : 'catalog-match',
            shouldReview: !verified,
            autoAccepted: verified,
            barcode: catalogAlias.barcode,
            catalogSource: catalogAlias.source,
            unresolvedTokens: [],
            alternatives: [],
            evidence: [verified
                ? 'Matched an exact verified catalog alias.'
                : 'Matched an exact unverified catalog identifier; review is required.'],
            isLikelyAdjustment: false,
        });
    }

    const rawTokens = normalizeReceiptAliasKey(metadata.cleanedDescription).toUpperCase().split(' ').filter(Boolean);
    const storeBrand = storeBrandFor(options.merchantName, rawTokens);
    const phraseResult = applyPhraseRules(rawTokens);
    const expandedTokens: string[] = [];
    const expansionEvidence = [...phraseResult.expansions];
    const unresolvedTokens: string[] = [];

    for (const token of phraseResult.tokens) {
        const expansion = TOKEN_EXPANSIONS[token];
        if (expansion) {
            expandedTokens.push(...expansion);
            expansionEvidence.push(`${token} -> ${expansion.join(' ')}`);
            continue;
        }

        expandedTokens.push(token.toLowerCase());
        if (looksUnresolved(token)) unresolvedTokens.push(token);
    }

    const canonicalName = formatCanonicalName(expandedTokens) || rawDescription.trim();
    const normalizedCanonical = normalizeReceiptAliasKey(canonicalName);
    const isLikelyAdjustment = ADJUSTMENT_TERMS.has(normalizedCanonical);
    const candidateMatches = matchingCandidates(canonicalName, options.merchantName, catalog);
    const top = candidateMatches[0];
    const runnerUp = candidateMatches[1];
    const hasUniqueCatalogMatch = Boolean(
        top
        && top.score >= 0.78
        && top.score - (runnerUp?.score ?? 0) >= 0.2,
    );

    if (hasUniqueCatalogMatch && top) {
        return baseResult(rawDescription, metadata, {
            canonicalName: top.candidate.name,
            brand: top.candidate.brand ?? storeBrand.brand,
            category: top.candidate.category,
            confidence: 'Medium',
            method: 'catalog-match',
            shouldReview: true,
            autoAccepted: false,
            barcode: top.candidate.barcode,
            catalogSource: top.candidate.source,
            unresolvedTokens,
            alternatives: candidateMatches.slice(1, 3).map(result => result.candidate.name),
            evidence: [
                ...expansionEvidence,
                `Unique catalog candidate scored ${top.score.toFixed(2)}.`,
            ],
            isLikelyAdjustment,
        });
    }

    const hasExpansion = expansionEvidence.length > 0;
    const confidence: ReceiptResolutionConfidence = unresolvedTokens.length > 0
        ? 'Low'
        : hasExpansion || storeBrand.matched
            ? 'Medium'
            : 'High';
    const method: ReceiptResolutionMethod = storeBrand.matched
        ? 'store-alias'
        : hasExpansion
            ? 'token-expansion'
            : 'unchanged';

    return baseResult(rawDescription, metadata, {
        canonicalName,
        brand: storeBrand.brand,
        confidence,
        method,
        shouldReview: confidence !== 'High' || isLikelyAdjustment,
        autoAccepted: false,
        unresolvedTokens,
        alternatives: candidateMatches.slice(0, 3).map(result => result.candidate.name),
        evidence: [
            ...expansionEvidence,
            ...(storeBrand.matched ? [`Store token identified ${storeBrand.brand}.`] : []),
            ...(unresolvedTokens.length > 0 ? [`Unresolved tokens: ${unresolvedTokens.join(', ')}.`] : []),
        ],
        isLikelyAdjustment,
    });
}
