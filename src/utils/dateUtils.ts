/**
 * Validates and parses date strings in various formats.
 *
 * Since MM/DD and DD/MM are ambiguous in slash-separated formats,
 * this function standardizes on US format (MM/DD/YYYY) for slash dates.
 * The AI vision service and barcode scanner both return ISO (YYYY-MM-DD),
 * so this ambiguity only affects manual entry. For unambiguous parsing,
 * prefer ISO format or use a date picker that returns YYYY-MM-DD.
 */
export function parseDate(dateStr: string): Date | null {
    if (!dateStr || dateStr === 'Unknown') return null;

    try {
        // Try parsing YYYY-MM-DD (ISO format) — preferred, unambiguous
        const isoMatch = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})$/);
        if (isoMatch) {
            const date = new Date(dateStr + 'T00:00:00');
            return isNaN(date.getTime()) ? null : date;
        }

        // Try DD-MMM-YYYY or DD MMM YYYY (e.g., "22 MAR 2026", "15-Jan-2025")
        const namedMonthMatch = dateStr.match(/^(\d{1,2})[\s-]([A-Za-z]{3,})[\s-](\d{2,4})$/);
        if (namedMonthMatch) {
            const [, day, monthStr, year] = namedMonthMatch;
            const fullYear = year.length === 2 ? `20${year}` : year;
            const date = new Date(`${monthStr} ${day}, ${fullYear}`);
            return isNaN(date.getTime()) ? null : date;
        }

        // Try MM/DD/YYYY or MM/DD/YY (US format — assumed for ambiguous slash dates)
        const slashMatch = dateStr.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
        if (slashMatch) {
            const [, month, day, year] = slashMatch;
            const fullYear = year.length === 2 ? `20${year}` : year;
            const date = new Date(`${fullYear}-${month.padStart(2, '0')}-${day.padStart(2, '0')}T00:00:00`);
            return isNaN(date.getTime()) ? null : date;
        }

        // Fallback: try native Date parsing
        const parsed = new Date(dateStr);
        return isNaN(parsed.getTime()) ? null : parsed;
    } catch {
        return null;
    }
}

/**
 * Formats a date to YYYY-MM-DD
 */
export function formatDate(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

/**
 * Validates if a date string is valid and returns standardized format
 */
export function validateAndFormatDate(dateStr: string): string | null {
    const parsed = parseDate(dateStr);
    return parsed ? formatDate(parsed) : null;
}

/**
 * Calculates days until expiration
 */
export function daysUntilExpiration(expirationDate: string): number {
    const expDate = new Date(expirationDate);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    expDate.setHours(0, 0, 0, 0);

    const diffTime = expDate.getTime() - today.getTime();
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
}

/**
 * Calculates estimated expiration date based on shelf life (in days)
 */
export function calculateExpirationFromShelfLife(shelfLifeDays: number): string {
    const today = new Date();
    const expDate = new Date(today);
    expDate.setDate(today.getDate() + shelfLifeDays);
    return formatDate(expDate);
}
