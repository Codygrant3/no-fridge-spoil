import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const diagnostics = {
    provider: 'azure-document-intelligence',
    providerLabel: 'Azure Document Intelligence',
    configured: false,
    reachable: 'unknown' as const,
    status: 'unchecked' as const,
    message: 'Receipt OCR runs through the secure app service.',
  };

  return {
    diagnostics,
    getReceiptOcrDiagnostics: vi.fn(() => diagnostics),
    checkReceiptOcrHealth: vi.fn(() => Promise.resolve({
      ...diagnostics,
      configured: true,
      reachable: 'ok' as const,
      status: 'ready' as const,
      message: 'Azure Document Intelligence is configured and reachable.',
    })),
    getQueuedReceiptScans: vi.fn(() => Promise.resolve([])),
    getReceiptHistory: vi.fn(() => Promise.resolve([])),
    getReceiptPrivacySettings: vi.fn(() => ({
      saveHistory: true,
      savePreviews: false,
      previewRetentionDays: 7,
      cloudOcrConsent: false,
    })),
    getCacheStats: vi.fn(() => Promise.resolve({
      totalEntries: 0,
      totalSizeBytes: 0,
      totalHits: 0,
      byService: {
        vision: { count: 0, hits: 0, sizeBytes: 0 },
        receipt: { count: 0, hits: 0, sizeBytes: 0 },
        recipe: { count: 0, hits: 0, sizeBytes: 0 },
        factCheck: { count: 0, hits: 0, sizeBytes: 0 },
      },
    })),
    getCloudSyncSnapshot: vi.fn(() => ({
      status: 'disabled' as const,
      householdId: null,
      pendingChanges: 0,
    })),
    subscribeCloudSync: vi.fn((listener: (value: unknown) => void) => {
      listener({
        status: 'disabled',
        householdId: null,
        pendingChanges: 0,
      });
      return () => undefined;
    }),
  };
});

vi.mock('../../context/AuthContext', () => ({
  useOptionalAuth: () => ({
    configured: false,
    loading: false,
    session: null,
    user: null,
    households: [],
    activeHousehold: null,
    recoveryMode: false,
    signUp: vi.fn(),
    signIn: vi.fn(),
    signOut: vi.fn(),
    finishAccountDeletion: vi.fn(),
    sendPasswordReset: vi.fn(),
    updatePassword: vi.fn(),
    setActiveHousehold: vi.fn(),
    refreshAccount: vi.fn(),
  }),
}));

vi.mock('../../services/receiptOCRService', () => ({
  getReceiptOcrDiagnostics: mocks.getReceiptOcrDiagnostics,
  checkReceiptOcrHealth: mocks.checkReceiptOcrHealth,
  getQueuedReceiptScans: mocks.getQueuedReceiptScans,
}));

vi.mock('../../services/receiptHistoryService', () => ({
  getReceiptPrivacySettings: mocks.getReceiptPrivacySettings,
  getReceiptHistory: mocks.getReceiptHistory,
  setReceiptPrivacySettings: vi.fn(),
  clearReceiptPreviews: vi.fn(),
  clearReceiptPrivacyData: vi.fn(),
}));

vi.mock('../../services/aiCacheService', () => ({
  getCacheStats: mocks.getCacheStats,
  clearCacheByService: vi.fn(),
}));

vi.mock('../../services/cloudSyncService', () => ({
  getCloudSyncSnapshot: mocks.getCloudSyncSnapshot,
  subscribeCloudSync: mocks.subscribeCloudSync,
  migrateLocalDataToActiveHousehold: vi.fn(),
  resolveAllSyncConflicts: vi.fn(),
  syncNow: vi.fn(),
}));

import { Profile } from '../../pages/Profile';

describe('Profile local-first sections', () => {
  it('renders the profile heading and unsigned-in local sections', async () => {
    render(<Profile />);

    expect(screen.getByRole('heading', { level: 1, name: 'Profile' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Device storage' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Receipt intelligence' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Device backup' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Receipt privacy' })).toBeInTheDocument();
    await waitFor(() => expect(mocks.getCacheStats).toHaveBeenCalled());
  });

  it('exposes a health-check control that calls checkReceiptOcrHealth', async () => {
    const user = userEvent.setup();
    render(<Profile />);

    const healthCheck = screen.getByRole('button', { name: 'Check OCR health' });
    expect(healthCheck).toBeInTheDocument();
    await user.click(healthCheck);
    expect(mocks.checkReceiptOcrHealth).toHaveBeenCalledTimes(1);
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Check OCR health' })).toBeEnabled();
    });
  });

  it('exposes a device backup download control', () => {
    render(<Profile />);

    expect(screen.getByRole('button', { name: 'Download backup' })).toBeInTheDocument();
  });

  it('hides Cloud account and Household headings when auth is unconfigured', () => {
    render(<Profile />);

    expect(screen.queryByRole('heading', { name: 'Cloud account' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Household' })).not.toBeInTheDocument();
  });
});
