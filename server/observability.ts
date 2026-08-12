/// <reference types="node" />

type LogLevel = 'info' | 'warn' | 'error';

const SENSITIVE_KEY = /(authorization|cookie|token|secret|password|key|email|storage_path)/i;

function sanitize(value: unknown, depth = 0): unknown {
    if (depth > 3) return '[truncated]';
    if (Array.isArray(value)) return value.slice(0, 20).map(item => sanitize(item, depth + 1));
    if (!value || typeof value !== 'object') {
        return typeof value === 'string' && value.length > 500 ? `${value.slice(0, 500)}...` : value;
    }

    return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, item]) => [
        key,
        SENSITIVE_KEY.test(key) ? '[redacted]' : sanitize(item, depth + 1),
    ]));
}

export function logServerEvent(
    level: LogLevel,
    event: string,
    details: Record<string, unknown> = {},
): void {
    const record = JSON.stringify({
        timestamp: new Date().toISOString(),
        level,
        event,
        ...sanitize(details) as Record<string, unknown>,
    });
    if (level === 'error') console.error(record);
    else if (level === 'warn') console.warn(record);
    else console.info(record);
}
