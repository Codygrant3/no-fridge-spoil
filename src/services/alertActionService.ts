import { readLocalJson, writeLocalJson } from './safeStorage';

const SNOOZE_KEY = 'no-fridge-spoil:alert-snoozes';

type SnoozeMap = Record<string, string>;

function readSnoozes(): SnoozeMap {
    return readLocalJson<SnoozeMap>(SNOOZE_KEY, {});
}

export function snoozeItemAlert(itemId: string, hours = 24): void {
    const snoozes = readSnoozes();
    snoozes[itemId] = new Date(Date.now() + hours * 3_600_000).toISOString();
    writeLocalJson(SNOOZE_KEY, snoozes);
}

export function isItemAlertSnoozed(itemId: string, now = Date.now()): boolean {
    const until = readSnoozes()[itemId];
    return Boolean(until && Date.parse(until) > now);
}

export function clearExpiredAlertSnoozes(now = Date.now()): void {
    const active = Object.fromEntries(
        Object.entries(readSnoozes()).filter(([, until]) => Date.parse(until) > now),
    );
    writeLocalJson(SNOOZE_KEY, active);
}
