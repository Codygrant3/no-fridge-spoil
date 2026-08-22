import { beforeEach, describe, expect, it, vi } from 'vitest';
import { formatDate } from '../../utils/dateUtils';

const mocks = vi.hoisted(() => ({
    supabase: null as { from: ReturnType<typeof vi.fn> } | null,
}));

vi.mock('../../services/supabaseClient', () => ({
    get supabase() {
        return mocks.supabase;
    },
}));

import { getUsageSummary } from '../../services/usageService';

const householdId = 'house-1';
const userId = 'user-1';

function mockUsageQuery(rows: Array<Record<string, unknown>>, error: unknown = null) {
    const query = {
        select: vi.fn(),
        eq: vi.fn(),
        gte: vi.fn(),
    };
    query.select.mockReturnValue(query);
    query.eq.mockReturnValue(query);
    query.gte.mockResolvedValue({ data: rows, error });
    mocks.supabase = {
        from: vi.fn().mockReturnValue(query),
    };
    return query;
}

describe('getUsageSummary', () => {
    beforeEach(() => {
        mocks.supabase = null;
    });

    it('increments todaySuccessful and todayDenied for usage_day matching local formatDate', async () => {
        const today = formatDate(new Date());
        const query = mockUsageQuery([{
            user_id: userId,
            usage_day: today,
            successful_scans: 3,
            failed_scans: 1,
            denied_scans: 2,
            total_cost_cents: 40,
        }]);

        const summary = await getUsageSummary(householdId, userId);

        expect(summary.todaySuccessful).toBe(3);
        expect(summary.todayDenied).toBe(2);
        expect(summary.thirtyDaySuccessful).toBe(3);
        expect(summary.thirtyDayDenied).toBe(2);
        expect(mocks.supabase?.from).toHaveBeenCalledWith('household_usage_daily');
        expect(query.eq).toHaveBeenCalledWith('household_id', householdId);

        const windowStart = new Date();
        windowStart.setUTCDate(windowStart.getUTCDate() - 29);
        windowStart.setUTCHours(0, 0, 0, 0);
        expect(query.gte).toHaveBeenCalledWith('usage_day', windowStart.toISOString());
    });

    it('does not increment today counters for a different local calendar day', async () => {
        const today = formatDate(new Date());
        const otherDay = today === '1999-01-01' ? '1999-01-02' : '1999-01-01';
        mockUsageQuery([{
            user_id: userId,
            usage_day: otherDay,
            successful_scans: 5,
            failed_scans: 2,
            denied_scans: 4,
            total_cost_cents: 80,
        }]);

        const summary = await getUsageSummary(householdId, userId);

        expect(summary.todaySuccessful).toBe(0);
        expect(summary.todayDenied).toBe(0);
        expect(summary.thirtyDaySuccessful).toBe(5);
        expect(summary.thirtyDayFailed).toBe(2);
        expect(summary.thirtyDayDenied).toBe(4);
        expect(summary.thirtyDayCostCents).toBe(80);
        expect(summary.personalThirtyDaySuccessful).toBe(5);
    });

    it('throws when supabase is null', async () => {
        mocks.supabase = null;

        await expect(getUsageSummary(householdId, userId)).rejects.toThrow(
            'Cloud accounts are not configured.',
        );
    });
});
