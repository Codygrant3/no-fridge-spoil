import {
    categorizeReceiptItem,
    isNonFoodReceiptItem,
    type AzureReceiptAnalysis,
} from './azureReceiptMapper';
import { isValidDateOnly } from '../utils/dateValidation';

interface MistralOcrPage {
    markdown?: string;
    confidence_scores?: {
        average_page_confidence_score?: number;
    };
}

interface MistralOcrResponse {
    pages?: MistralOcrPage[];
}

const TOTAL_LINE = /\b(sub\s*total|total|tax|change|cash|credit|debit|balance|tender|payment)\b/i;
const PRICE_AT_END = /(?:^|\s)\$?(\d{1,6}\.\d{2})\s*$/;

function confidenceLevel(value: number | undefined): 'High' | 'Medium' | 'Low' {
    if (typeof value !== 'number') return 'Medium';
    if (value >= 0.85) return 'High';
    if (value >= 0.65) return 'Medium';
    return 'Low';
}

function normalizeReceiptDate(text: string): string | undefined {
    const iso = text.match(/\b(20\d{2})[-/.](\d{1,2})[-/.](\d{1,2})\b/);
    if (iso) {
        const value = `${iso[1]}-${iso[2].padStart(2, '0')}-${iso[3].padStart(2, '0')}`;
        return isValidDateOnly(value) ? value : undefined;
    }

    const us = text.match(/\b(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})\b/);
    if (!us) return undefined;
    const year = us[3].length === 2 ? `20${us[3]}` : us[3];
    const value = `${year}-${us[1].padStart(2, '0')}-${us[2].padStart(2, '0')}`;
    return isValidDateOnly(value) ? value : undefined;
}

function cleanMarkdownLine(value: string): string {
    return value
        .replace(/^\s*[-*#>]+\s*/, '')
        .replace(/\|/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

export function mapMistralReceiptResult(value: unknown): AzureReceiptAnalysis {
    const payload = value && typeof value === 'object' ? value as MistralOcrResponse : {};
    const pages = Array.isArray(payload.pages) ? payload.pages : [];
    const markdown = pages.map(page => page.markdown ?? '').join('\n');
    const lines = markdown.split(/\r?\n/).map(cleanMarkdownLine).filter(Boolean);
    const averageConfidence = pages.length > 0
        ? pages.reduce((sum, page) => sum + (page.confidence_scores?.average_page_confidence_score ?? 0.7), 0) / pages.length
        : 0.5;
    const confidence = confidenceLevel(averageConfidence);
    const storeName = lines.find(line => (
        !PRICE_AT_END.test(line)
        && !normalizeReceiptDate(line)
        && line.length >= 2
        && line.length <= 80
    ));
    const date = normalizeReceiptDate(markdown);
    const skippedItems: string[] = [];
    let totalItemsDetected = 0;

    const items = lines.flatMap(line => {
        const priceMatch = PRICE_AT_END.exec(line);
        if (!priceMatch || TOTAL_LINE.test(line)) return [];
        const name = line
            .slice(0, priceMatch.index)
            .replace(/^\d+\s*[xX@]\s*/, '')
            .replace(/\s+\d+(?:\.\d+)?\s*(?:lb|oz|kg|g|ea)\b.*$/i, '')
            .replace(/\s+/g, ' ')
            .trim();
        if (name.length < 2 || !/[a-z]/i.test(name)) return [];

        totalItemsDetected += 1;
        if (isNonFoodReceiptItem(name, line)) {
            skippedItems.push(name);
            return [];
        }

        return [{
            name,
            originalName: name,
            quantity: 1,
            price: priceMatch[1],
            category: categorizeReceiptItem(name),
            confidence,
            fieldConfidence: {
                name: confidence,
                quantity: 'Low' as const,
                price: confidence,
            },
            sourceLine: line,
            sourceRegion: 'page',
        }];
    });

    return {
        storeName,
        date,
        fieldConfidence: {
            storeName: storeName ? confidence : 'Low',
            date: date ? confidence : 'Low',
        },
        items,
        totalItemsDetected,
        skippedItems,
        estimatedCostCents: 0,
    };
}
