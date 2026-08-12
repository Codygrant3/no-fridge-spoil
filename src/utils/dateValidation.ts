const DATE_ONLY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isValidDateOnly(value: unknown): value is string {
    if (typeof value !== 'string') return false;
    const match = DATE_ONLY_PATTERN.exec(value);
    if (!match) return false;

    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    const date = new Date(Date.UTC(year, month - 1, day));

    return date.getUTCFullYear() === year
        && date.getUTCMonth() === month - 1
        && date.getUTCDate() === day;
}

export function normalizeDateOnly(value: unknown): string {
    return isValidDateOnly(value) ? value : '';
}

export function dateOnlyToLocalDate(value: string): Date | null {
    if (!isValidDateOnly(value)) return null;
    const [year, month, day] = value.split('-').map(Number);
    return new Date(year, month - 1, day);
}
