import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  auth: {
    configured: true,
    loading: true,
    session: null,
    recoveryMode: false,
    activeHousehold: null,
  },
  startCloudSync: vi.fn(),
  stopCloudSync: vi.fn(),
  syncNow: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../context/AuthContext', () => ({
  useAuth: () => mocks.auth,
  AuthProvider: ({ children }: { children: React.ReactNode }) => children,
}));

vi.mock('../../services/cloudSyncService', () => ({
  startCloudSync: mocks.startCloudSync,
  stopCloudSync: mocks.stopCloudSync,
  syncNow: mocks.syncNow,
}));

import { AccountGate } from '../../App';

describe('AccountGate local-first behavior', () => {
  beforeEach(() => {
    mocks.auth.configured = true;
    mocks.auth.loading = true;
    mocks.auth.session = null;
    mocks.auth.recoveryMode = false;
    mocks.auth.activeHousehold = null;
  });

  it('keeps device-only features available while account restoration is pending', () => {
    render(
      <AccountGate>
        <p>Device inventory ready</p>
      </AccountGate>,
    );

    expect(screen.getByText('Device inventory ready')).toBeInTheDocument();
    expect(screen.queryByText('Restoring your account')).not.toBeInTheDocument();
    expect(mocks.stopCloudSync).toHaveBeenCalled();
  });
});
