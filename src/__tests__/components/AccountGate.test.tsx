import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  auth: {
    configured: true,
    loading: true,
    session: null as { access_token: string } | null,
    recoveryMode: false,
    activeHousehold: null as {
      id: string;
      name: string;
      role: 'owner';
      dailyReceiptLimit: number;
      receiptRetentionDays: number;
    } | null,
  },
  startCloudSync: vi.fn(),
  stopCloudSync: vi.fn(),
  syncNow: vi.fn().mockResolvedValue(undefined),
  startReceiptRecovery: vi.fn(),
  stopReceiptRecovery: vi.fn(),
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

vi.mock('../../services/receiptRecoveryService', () => ({
  startReceiptRecovery: mocks.startReceiptRecovery,
  stopReceiptRecovery: mocks.stopReceiptRecovery,
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
    expect(mocks.stopReceiptRecovery).toHaveBeenCalled();
    expect(mocks.startReceiptRecovery).not.toHaveBeenCalled();
  });

  it('starts receipt recovery only for a signed-in household', () => {
    mocks.auth.session = { access_token: 'test-access-token' };
    mocks.auth.activeHousehold = {
      id: '11111111-1111-4111-8111-111111111111',
      name: 'Home',
      role: 'owner',
      dailyReceiptLimit: 10,
      receiptRetentionDays: 7,
    };

    render(
      <AccountGate>
        <p>Household inventory ready</p>
      </AccountGate>,
    );

    expect(screen.getByText('Household inventory ready')).toBeInTheDocument();
    expect(mocks.startCloudSync).toHaveBeenCalled();
    expect(mocks.startReceiptRecovery).toHaveBeenCalled();
  });
});
