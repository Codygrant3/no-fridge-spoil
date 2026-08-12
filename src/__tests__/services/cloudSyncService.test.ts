import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const householdId = '11111111-1111-4111-8111-111111111111';
const userId = '22222222-2222-4222-8222-222222222222';
const serverUpdatedAt = '2026-07-14T20:00:00.000Z';

type RemoteRows = Record<string, Array<Record<string, unknown>>>;

function createSupabaseMock(remoteRows: RemoteRows = {}) {
  const upserts: Array<{ table: string; payload: Record<string, unknown> }> = [];
  const client = {
    auth: {
      getSession: vi.fn().mockResolvedValue({
        data: { session: { user: { id: userId } } },
        error: null,
      }),
    },
    from: vi.fn((table: string) => {
      let upsertPayload: Record<string, unknown> | null = null;
      const builder = {
        select: vi.fn(() => builder),
        eq: vi.fn(() => builder),
        gte: vi.fn(() => builder),
        order: vi.fn(() => builder),
        range: vi.fn().mockResolvedValue({ data: remoteRows[table] ?? [], error: null }),
        maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
        upsert: vi.fn((payload: Record<string, unknown>) => {
          upsertPayload = payload;
          upserts.push({ table, payload });
          return builder;
        }),
        single: vi.fn(async () => ({
          data: { ...upsertPayload, updated_at: serverUpdatedAt },
          error: null,
        })),
      };
      return builder;
    }),
  };
  return { client, upserts };
}

describe('cloudSyncService', () => {
  let openedDb: { delete: () => Promise<void>; close: () => void } | null = null;

  beforeEach(() => {
    vi.resetModules();
    vi.spyOn(window.navigator, 'onLine', 'get').mockReturnValue(true);
  });

  afterEach(async () => {
    await openedDb?.delete();
    openedDb = null;
    vi.restoreAllMocks();
  });

  it('migrates consented local data through the outbox and acknowledges the server version', async () => {
    const { client, upserts } = createSupabaseMock();
    vi.doMock('../../services/cloudSessionService', () => ({
      getActiveCloudHouseholdId: () => householdId,
    }));
    vi.doMock('../../services/supabaseClient', () => ({
      isCloudConfigured: true,
      supabase: client,
    }));
    const { db } = await import('../../db/database');
    const { migrateLocalDataToActiveHousehold } = await import('../../services/cloudSyncService');
    openedDb = db;
    await db.delete();
    await db.open();

    await db.items.put({
      id: '33333333-3333-4333-8333-333333333333',
      name: 'Offline milk',
      expirationDate: '2026-07-20',
      dateType: 'Best By',
      addedAt: '2026-07-14T19:00:00.000Z',
      updatedAt: '2026-07-14T19:00:00.000Z',
      status: 'good',
      quantity: 1,
      storageLocation: 'fridge',
      isDeleted: 0,
      syncPending: 1,
    });

    const result = await migrateLocalDataToActiveHousehold();
    const stored = await db.items.get('33333333-3333-4333-8333-333333333333');

    expect(result.status).toBe('idle');
    expect(await db.syncOutbox.count()).toBe(0);
    expect(stored).toMatchObject({
      cloudHouseholdId: householdId,
      cloudCreatedBy: userId,
      updatedAt: serverUpdatedAt,
      syncPending: 0,
    });
    expect(upserts).toHaveLength(1);
    expect(upserts[0]).toMatchObject({
      table: 'inventory_items',
      payload: {
        household_id: householdId,
        created_by: userId,
        name: 'Offline milk',
      },
    });
  });

  it('pulls remote household rows into the Dexie cache', async () => {
    const inventoryId = '44444444-4444-4444-8444-444444444444';
    const { client } = createSupabaseMock({
      inventory_items: [{
        id: inventoryId,
        household_id: householdId,
        profile_id: null,
        name: 'Cloud yogurt',
        brand: 'Test Dairy',
        quantity: 2,
        storage_location: 'fridge',
        expiration_date: '2026-07-22',
        date_type: 'Use By',
        status: 'good',
        opened_date: null,
        consumed_at: null,
        notes: null,
        is_deleted: false,
        added_at: '2026-07-14T18:00:00.000Z',
        created_by: userId,
        updated_at: serverUpdatedAt,
      }],
    });
    vi.doMock('../../services/cloudSessionService', () => ({
      getActiveCloudHouseholdId: () => householdId,
    }));
    vi.doMock('../../services/supabaseClient', () => ({
      isCloudConfigured: true,
      supabase: client,
    }));
    const { db } = await import('../../db/database');
    const { syncNow } = await import('../../services/cloudSyncService');
    openedDb = db;
    await db.delete();
    await db.open();

    const result = await syncNow();
    const stored = await db.items.get(inventoryId);

    expect(result.status).toBe('idle');
    expect(stored).toMatchObject({
      name: 'Cloud yogurt',
      quantity: 2,
      cloudHouseholdId: householdId,
      cloudCreatedBy: userId,
      syncPending: 0,
    });
  });
});
