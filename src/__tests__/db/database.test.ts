import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { db, initializeDatabase, exportAllData, importData } from '../../db/database';
import type { DbInventoryItem } from '../../db/database';

describe('database', () => {
  beforeEach(async () => {
    // Clear all tables before each test
    await db.items.clear();
    await db.stats.clear();
    await db.settings.clear();
    await db.customTags.clear();
    await db.shoppingList.clear();
    await db.barcodeCache.clear();
  });

  afterEach(async () => {
    // Clean up
    await db.items.clear();
    await db.stats.clear();
    await db.settings.clear();
  });

  describe('initializeDatabase', () => {
    it('should create default stats record', async () => {
      await initializeDatabase();

      const stats = await db.stats.get('global');
      expect(stats).toBeDefined();
      expect(stats?.id).toBe('global');
      expect(stats?.itemsSaved).toBe(0);
      expect(stats?.itemsWasted).toBe(0);
      expect(stats?.xp).toBe(0);
      expect(stats?.level).toBe(1);
      expect(stats?.badges).toEqual([]);
    });

    it('should create default settings record', async () => {
      await initializeDatabase();

      const settings = await db.settings.get('user');
      expect(settings).toBeDefined();
      expect(settings?.theme).toBe('system');
      expect(settings?.defaultStorageLocation).toBe('fridge');
      expect(settings?.expirationWarningDays).toBe(3);
      expect(settings?.notificationsEnabled).toBe(false);
    });

    it('should create default custom tags', async () => {
      await initializeDatabase();

      const tags = await db.customTags.toArray();
      expect(tags.length).toBe(3);

      const tagNames = tags.map((t) => t.name);
      expect(tagNames).toContain('Fridge');
      expect(tagNames).toContain('Freezer');
      expect(tagNames).toContain('Pantry');
    });

    it('should not duplicate data on multiple calls', async () => {
      await initializeDatabase();
      await initializeDatabase();
      await initializeDatabase();

      const stats = await db.stats.toArray();
      expect(stats.length).toBe(1);

      const settings = await db.settings.toArray();
      expect(settings.length).toBe(1);
    });
  });

  describe('items table', () => {
    it('should add an item', async () => {
      const item: DbInventoryItem = {
        id: 'test-1',
        name: 'Test Milk',
        expirationDate: '2026-02-15',
        dateType: 'use_by',
        addedAt: new Date().toISOString(),
        status: 'good',
        quantity: 1,
        storageLocation: 'fridge',
        isDeleted: 0,
      };

      await db.items.add(item);

      const retrieved = await db.items.get('test-1');
      expect(retrieved).toBeDefined();
      expect(retrieved?.name).toBe('Test Milk');
      expect(retrieved?.isDeleted).toBe(0);
    });

    it('should query non-deleted items', async () => {
      await db.items.bulkAdd([
        {
          id: 'active-1',
          name: 'Active Item',
          expirationDate: '2026-02-15',
          dateType: 'use_by',
          addedAt: new Date().toISOString(),
          status: 'good',
          quantity: 1,
          storageLocation: 'fridge',
          isDeleted: 0,
        },
        {
          id: 'deleted-1',
          name: 'Deleted Item',
          expirationDate: '2026-02-15',
          dateType: 'use_by',
          addedAt: new Date().toISOString(),
          status: 'good',
          quantity: 1,
          storageLocation: 'fridge',
          isDeleted: 1,
        },
      ]);

      const activeItems = await db.items.where('isDeleted').equals(0).toArray();
      expect(activeItems.length).toBe(1);
      expect(activeItems[0].name).toBe('Active Item');
    });

    it('should update an item', async () => {
      await db.items.add({
        id: 'update-test',
        name: 'Original Name',
        expirationDate: '2026-02-15',
        dateType: 'use_by',
        addedAt: new Date().toISOString(),
        status: 'good',
        quantity: 1,
        storageLocation: 'fridge',
        isDeleted: 0,
      });

      await db.items.update('update-test', {
        name: 'Updated Name',
        quantity: 5,
      });

      const updated = await db.items.get('update-test');
      expect(updated?.name).toBe('Updated Name');
      expect(updated?.quantity).toBe(5);
    });

    it('should soft delete an item', async () => {
      await db.items.add({
        id: 'soft-delete-test',
        name: 'To Delete',
        expirationDate: '2026-02-15',
        dateType: 'use_by',
        addedAt: new Date().toISOString(),
        status: 'good',
        quantity: 1,
        storageLocation: 'fridge',
        isDeleted: 0,
      });

      await db.items.update('soft-delete-test', { isDeleted: 1 });

      const item = await db.items.get('soft-delete-test');
      expect(item?.isDeleted).toBe(1);

      // Should not appear in active items query
      const activeItems = await db.items.where('isDeleted').equals(0).toArray();
      expect(activeItems.length).toBe(0);
    });

    it('should support optional fields', async () => {
      await db.items.add({
        id: 'optional-test',
        name: 'Item with optionals',
        brand: 'Test Brand',
        expirationDate: '2026-02-15',
        dateType: 'use_by',
        addedAt: new Date().toISOString(),
        status: 'good',
        quantity: 1,
        storageLocation: 'fridge',
        isDeleted: 0,
        openedDate: '2026-01-20',
        notes: 'Test notes',
      });

      const item = await db.items.get('optional-test');
      expect(item?.brand).toBe('Test Brand');
      expect(item?.openedDate).toBe('2026-01-20');
      expect(item?.notes).toBe('Test notes');
    });
  });

  describe('stats table', () => {
    it('should update stats', async () => {
      await initializeDatabase();

      await db.stats.update('global', {
        itemsSaved: 10,
        itemsWasted: 2,
        xp: 500,
        level: 3,
      });

      const stats = await db.stats.get('global');
      expect(stats?.itemsSaved).toBe(10);
      expect(stats?.itemsWasted).toBe(2);
      expect(stats?.xp).toBe(500);
      expect(stats?.level).toBe(3);
    });

    it('should track badges', async () => {
      await initializeDatabase();

      await db.stats.update('global', {
        badges: ['first-save', 'waste-warrior'],
      });

      const stats = await db.stats.get('global');
      expect(stats?.badges).toContain('first-save');
      expect(stats?.badges).toContain('waste-warrior');
      expect(stats?.badges?.length).toBe(2);
    });

    it('should track environmental impact', async () => {
      await initializeDatabase();

      await db.stats.update('global', {
        co2SavedKg: 25.5,
        waterSavedL: 1000,
        moneySaved: 35.0,
      });

      const stats = await db.stats.get('global');
      expect(stats?.co2SavedKg).toBe(25.5);
      expect(stats?.waterSavedL).toBe(1000);
      expect(stats?.moneySaved).toBe(35.0);
    });
  });

  describe('shoppingList table', () => {
    it('should add shopping items', async () => {
      await db.shoppingList.add({
        id: 'shop-1',
        name: 'Eggs',
        quantity: 12,
        addedAt: new Date().toISOString(),
        isChecked: false,
      });

      const item = await db.shoppingList.get('shop-1');
      expect(item?.name).toBe('Eggs');
      expect(item?.isChecked).toBe(false);
    });

    it('should toggle checked status', async () => {
      await db.shoppingList.add({
        id: 'shop-toggle',
        name: 'Milk',
        quantity: 1,
        addedAt: new Date().toISOString(),
        isChecked: false,
      });

      await db.shoppingList.update('shop-toggle', { isChecked: true });

      const item = await db.shoppingList.get('shop-toggle');
      expect(item?.isChecked).toBe(true);
    });
  });

  describe('barcodeCache table', () => {
    it('should cache barcode lookups', async () => {
      await db.barcodeCache.add({
        barcode: '1234567890',
        name: 'Test Product',
        brand: 'Test Brand',
        cachedAt: new Date().toISOString(),
      });

      const cached = await db.barcodeCache.get('1234567890');
      expect(cached?.name).toBe('Test Product');
      expect(cached?.brand).toBe('Test Brand');
    });
  });

  describe('exportAllData', () => {
    it('should export all data as JSON', async () => {
      await initializeDatabase();

      // Add some test data
      await db.items.add({
        id: 'export-test',
        name: 'Export Item',
        expirationDate: '2026-02-15',
        dateType: 'use_by',
        addedAt: new Date().toISOString(),
        status: 'good',
        quantity: 1,
        storageLocation: 'fridge',
        isDeleted: 0,
      });

      const exported = await exportAllData();
      const data = JSON.parse(exported);

      expect(data.version).toBe(1);
      expect(data.exportedAt).toBeDefined();
      expect(data.items).toHaveLength(1);
      expect(data.items[0].name).toBe('Export Item');
      expect(data.stats).toBeDefined();
      expect(data.settings).toBeDefined();
    });

    it('should not export deleted items', async () => {
      await initializeDatabase();

      await db.items.bulkAdd([
        {
          id: 'active-export',
          name: 'Active',
          expirationDate: '2026-02-15',
          dateType: 'use_by',
          addedAt: new Date().toISOString(),
          status: 'good',
          quantity: 1,
          storageLocation: 'fridge',
          isDeleted: 0,
        },
        {
          id: 'deleted-export',
          name: 'Deleted',
          expirationDate: '2026-02-15',
          dateType: 'use_by',
          addedAt: new Date().toISOString(),
          status: 'good',
          quantity: 1,
          storageLocation: 'fridge',
          isDeleted: 1,
        },
      ]);

      const exported = await exportAllData();
      const data = JSON.parse(exported);

      expect(data.items).toHaveLength(1);
      expect(data.items[0].name).toBe('Active');
    });
  });

  describe('importData', () => {
    it('should import valid data', async () => {
      await initializeDatabase();

      // Use a valid UUID format for the import test
      const testItemId = 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d';

      const importJson = JSON.stringify({
        version: 1,
        items: [
          {
            id: testItemId,
            name: 'Imported Item',
            expirationDate: '2026-02-15',
            dateType: 'use_by',
            addedAt: new Date().toISOString(),
            status: 'good',
            quantity: 1,
            storageLocation: 'fridge',
            isDeleted: false,
          },
        ],
        stats: {
          id: 'global',
          itemsSaved: 5,
          itemsWasted: 1,
          totalScans: 10,
          co2SavedKg: 12.5,
          waterSavedL: 500,
          moneySaved: 17.5,
          badges: ['first-save'],
          xp: 250,
          level: 2,
        },
      });

      const result = await importData(importJson);

      expect(result.success).toBe(true);
      expect(result.itemsImported).toBe(1);
      expect(result.errors).toHaveLength(0);

      const item = await db.items.get(testItemId);
      expect(item?.name).toBe('Imported Item');

      const stats = await db.stats.get('global');
      expect(stats?.itemsSaved).toBe(5);
    });

    it('should handle invalid JSON', async () => {
      const result = await importData('not valid json');

      expect(result.success).toBe(false);
      expect(result.itemsImported).toBe(0);
      expect(result.errors).toContain('Failed to parse import data');
    });

    it('should handle empty import', async () => {
      const result = await importData(JSON.stringify({}));

      expect(result.success).toBe(true);
      expect(result.itemsImported).toBe(0);
    });
  });
});
