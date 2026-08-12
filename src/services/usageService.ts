import { supabase } from './supabaseClient';

export interface UsageSummary {
    todaySuccessful: number;
    todayDenied: number;
    thirtyDaySuccessful: number;
    thirtyDayFailed: number;
    thirtyDayDenied: number;
    thirtyDayCostCents: number;
    personalThirtyDaySuccessful: number;
}

interface UsageRow {
    user_id: string;
    usage_day: string;
    successful_scans: number | string | null;
    failed_scans: number | string | null;
    denied_scans: number | string | null;
    total_cost_cents: number | string | null;
}

function value(input: number | string | null): number {
    const parsed = Number(input ?? 0);
    return Number.isFinite(parsed) ? parsed : 0;
}

export async function getUsageSummary(householdId: string, userId: string): Promise<UsageSummary> {
    if (!supabase) throw new Error('Cloud accounts are not configured.');
    const from = new Date();
    from.setUTCDate(from.getUTCDate() - 29);
    from.setUTCHours(0, 0, 0, 0);

    const { data, error } = await supabase
        .from('household_usage_daily')
        .select('user_id, usage_day, successful_scans, failed_scans, denied_scans, total_cost_cents')
        .eq('household_id', householdId)
        .gte('usage_day', from.toISOString());
    if (error) throw error;

    const today = new Date().toISOString().slice(0, 10);
    const rows = (data ?? []) as UsageRow[];
    return rows.reduce<UsageSummary>((summary, row) => {
        const successful = value(row.successful_scans);
        const failed = value(row.failed_scans);
        const denied = value(row.denied_scans);
        summary.thirtyDaySuccessful += successful;
        summary.thirtyDayFailed += failed;
        summary.thirtyDayDenied += denied;
        summary.thirtyDayCostCents += value(row.total_cost_cents);
        if (row.user_id === userId) summary.personalThirtyDaySuccessful += successful;
        if (row.usage_day.slice(0, 10) === today) {
            summary.todaySuccessful += successful;
            summary.todayDenied += denied;
        }
        return summary;
    }, {
        todaySuccessful: 0,
        todayDenied: 0,
        thirtyDaySuccessful: 0,
        thirtyDayFailed: 0,
        thirtyDayDenied: 0,
        thirtyDayCostCents: 0,
        personalThirtyDaySuccessful: 0,
    });
}
