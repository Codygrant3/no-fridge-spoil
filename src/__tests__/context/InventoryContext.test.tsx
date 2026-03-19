import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import React from 'react';
import { InventoryProvider, useInventory } from '../../context/InventoryContext';
import { db, initializeDatabase } from '../../db/database';

// Helper to wrap hook with provider
const wrapper = ({ children }: { children: React.ReactNode }) => (
  <InventoryProvider>{children}</InventoryProvider>
);

describe('InventoryContext', () => {
  beforeEach(async () => {
    // Clear the database before each test
    await db.items.clear();
    await db.stats.clear();
    await db.customTags.clear();
    await db.settings.clear();
    // Re-initialize
    await initializeDatabase();
  });

  afterEach(async () => {
    // Clean up after tests
    await db.items.clear();
  });

  describe('useInventory hook', () => {
    it('should throw error when used outside provider', () => {
      // Suppress console.error for this test
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      expect(() => {
        renderHook(() => useInventory());
      }).toThrow('useInventory must be used within an InventoryProvider');

      consoleSpy.mockRestore();
    });

    it('should provide initial state', async () => {
      const { result } = renderHook(() => useInventory(), { wrapper });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.items).toEqual([]);
      expect(result.current.stats.totalItems).toBe(0);
      expect(result.current.stats.expiringSoon).toBe(0);
      expect(result.current.stats.expired).toBe(0);
    });

    it('should add an item', async () => {
      const { result } = renderHook(() => useInventory(), { wrapper });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      await act(async () => {
        await result.current.addItem({
          name: 'Test Milk',
          expirationDate: '2026-02-15',
          dateType: 'use_by',
          quantity: 1,
          storageLocation: 'fridge',
        });
      });

      await waitFor(() => {
        expect(result.current.items.length).toBe(1);
      });

      expect(result.current.items[0].name).toBe('Test Milk');
      expect(result.current.items[0].quantity).toBe(1);
      expect(result.current.stats.totalItems).toBe(1);
    });

    it('should calculate status correctly for new items', async () => {
      const { result } = renderHook(() => useInventory(), { wrapper });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      // Add item expiring far in future (good)
      await act(async () => {
        await result.current.addItem({
          name: 'Fresh Item',
          expirationDate: '2026-12-31',
          dateType: 'best_by',
          quantity: 1,
          storageLocation: 'fridge',
        });
      });

      await waitFor(() => {
        expect(result.current.items.length).toBe(1);
      });

      expect(result.current.items[0].status).toBe('good');
    });

    it('should remove an item (soft delete)', async () => {
      const { result } = renderHook(() => useInventory(), { wrapper });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      // Add item
      await act(async () => {
        await result.current.addItem({
          name: 'To Be Removed',
          expirationDate: '2026-02-15',
          dateType: 'use_by',
          quantity: 1,
          storageLocation: 'fridge',
        });
      });

      await waitFor(() => {
        expect(result.current.items.length).toBe(1);
      });

      const itemId = result.current.items[0].id;

      // Remove item
      await act(async () => {
        await result.current.removeItem(itemId);
      });

      await waitFor(() => {
        expect(result.current.items.length).toBe(0);
      });

      // Verify soft delete in database
      const dbItem = await db.items.get(itemId);
      expect(dbItem?.isDeleted).toBe(1);
    });

    it('should update an item', async () => {
      const { result } = renderHook(() => useInventory(), { wrapper });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      // Add item
      await act(async () => {
        await result.current.addItem({
          name: 'Original Name',
          expirationDate: '2026-02-15',
          dateType: 'use_by',
          quantity: 1,
          storageLocation: 'fridge',
        });
      });

      await waitFor(() => {
        expect(result.current.items.length).toBe(1);
      });

      const itemId = result.current.items[0].id;

      // Update item
      await act(async () => {
        await result.current.updateItem(itemId, { quantity: 5 });
      });

      await waitFor(() => {
        expect(result.current.items[0].quantity).toBe(5);
      });
    });

    it('should consume an item and decrement quantity', async () => {
      const { result } = renderHook(() => useInventory(), { wrapper });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      // Add item with quantity > 1
      await act(async () => {
        await result.current.addItem({
          name: 'Multi Item',
          expirationDate: '2026-02-15',
          dateType: 'use_by',
          quantity: 3,
          storageLocation: 'fridge',
        });
      });

      await waitFor(() => {
        expect(result.current.items.length).toBe(1);
      });

      const itemId = result.current.items[0].id;

      // Consume one
      await act(async () => {
        await result.current.consumeItem(itemId);
      });

      await waitFor(() => {
        expect(result.current.items[0].quantity).toBe(2);
      });
    });

    it('should remove item when consuming last one', async () => {
      const { result } = renderHook(() => useInventory(), { wrapper });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      // Add item with quantity 1
      await act(async () => {
        await result.current.addItem({
          name: 'Single Item',
          expirationDate: '2026-02-15',
          dateType: 'use_by',
          quantity: 1,
          storageLocation: 'fridge',
        });
      });

      await waitFor(() => {
        expect(result.current.items.length).toBe(1);
      });

      const itemId = result.current.items[0].id;

      // Consume last one
      await act(async () => {
        await result.current.consumeItem(itemId);
      });

      await waitFor(() => {
        expect(result.current.items.length).toBe(0);
      });

      // Check stats were updated
      const stats = await db.stats.get('global');
      expect(stats?.itemsSaved).toBe(1);
    });

    it('should calculate stats correctly', async () => {
      const { result } = renderHook(() => useInventory(), { wrapper });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      // Add multiple items with different statuses
      const today = new Date();
      const futureDate = new Date(today);
      futureDate.setDate(today.getDate() + 30);
      const tomorrowDate = new Date(today);
      tomorrowDate.setDate(today.getDate() + 1);
      const pastDate = new Date(today);
      pastDate.setDate(today.getDate() - 5);

      await act(async () => {
        // Good item (far future)
        await result.current.addItem({
          name: 'Good Item',
          expirationDate: futureDate.toISOString().split('T')[0],
          dateType: 'use_by',
          quantity: 1,
          storageLocation: 'fridge',
        });

        // Expiring soon item (1 day)
        await result.current.addItem({
          name: 'Expiring Item',
          expirationDate: tomorrowDate.toISOString().split('T')[0],
          dateType: 'use_by',
          quantity: 1,
          storageLocation: 'fridge',
        });

        // Expired item (past)
        await result.current.addItem({
          name: 'Expired Item',
          expirationDate: pastDate.toISOString().split('T')[0],
          dateType: 'use_by',
          quantity: 1,
          storageLocation: 'fridge',
        });
      });

      await waitFor(() => {
        expect(result.current.items.length).toBe(3);
      });

      expect(result.current.stats.totalItems).toBe(3);
      expect(result.current.stats.expired).toBe(1);
      expect(result.current.stats.expiringSoon).toBe(1);
    });

    it('should handle opened date for shelf life calculation', async () => {
      const { result } = renderHook(() => useInventory(), { wrapper });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      // Add milk that was opened a while ago
      const today = new Date();
      const farFuture = new Date(today);
      farFuture.setDate(today.getDate() + 60);
      const openedDate = new Date(today);
      openedDate.setDate(today.getDate() - 10); // Opened 10 days ago

      await act(async () => {
        await result.current.addItem({
          name: 'Milk',
          expirationDate: farFuture.toISOString().split('T')[0],
          dateType: 'use_by',
          quantity: 1,
          storageLocation: 'fridge',
          openedDate: openedDate.toISOString().split('T')[0],
        });
      });

      await waitFor(() => {
        expect(result.current.items.length).toBe(1);
      });

      // Milk has 7-day shelf life after opening
      // Opened 10 days ago means it's expired
      expect(result.current.items[0].status).toBe('expired');
    });
  });
});
