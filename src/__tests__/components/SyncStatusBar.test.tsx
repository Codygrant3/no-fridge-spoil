import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  syncNow: vi.fn().mockResolvedValue({ status: 'idle' }),
  applyUpdate: vi.fn(),
}));

vi.mock('../../services/cloudSyncService', () => ({
  getCloudSyncSnapshot: () => ({ status: 'error', householdId: 'house-1', pendingChanges: 2 }),
  subscribeCloudSync: (listener: (value: unknown) => void) => {
    listener({ status: 'error', householdId: 'house-1', pendingChanges: 2 });
    return () => undefined;
  },
  syncNow: mocks.syncNow,
}));

vi.mock('../../services/appUpdateService', () => ({
  subscribeAppUpdate: (listener: (value: boolean) => void) => {
    listener(false);
    return () => undefined;
  },
  subscribeAppRuntimeStatus: (listener: (value: null) => void) => {
    listener(null);
    return () => undefined;
  },
  applyAppUpdate: mocks.applyUpdate,
}));

import { SyncStatusBar } from '../../components/SyncStatusBar';

describe('SyncStatusBar', () => {
  it('shows pending changes and lets the user retry', () => {
    render(<SyncStatusBar />);

    expect(screen.getByText('2 changes waiting to sync')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(mocks.syncNow).toHaveBeenCalledTimes(1);
  });
});
