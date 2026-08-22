import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getActiveCloudHouseholdId: vi.fn(),
}));

vi.mock('../../services/cloudSessionService', () => ({
  getActiveCloudHouseholdId: mocks.getActiveCloudHouseholdId,
}));

import {
  belongsToActiveHousehold,
  localMutationFields,
} from '../../services/localMutationService';

describe('localMutationFields', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-22T12:00:00.000Z'));
    mocks.getActiveCloudHouseholdId.mockReset();
    mocks.getActiveCloudHouseholdId.mockReturnValue(null);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('sets syncPending and an ISO updatedAt', () => {
    const fields = localMutationFields();

    expect(fields.syncPending).toBe(1);
    expect(fields.updatedAt).toBe('2026-08-22T12:00:00.000Z');
    expect(fields.updatedAt).toBe(new Date(fields.updatedAt).toISOString());
  });

  it('preserves an existing household id', () => {
    mocks.getActiveCloudHouseholdId.mockReturnValue('active-household');

    const fields = localMutationFields('existing-household');

    expect(fields.cloudHouseholdId).toBe('existing-household');
    expect(fields.syncPending).toBe(1);
    expect(fields.updatedAt).toBe('2026-08-22T12:00:00.000Z');
    expect(mocks.getActiveCloudHouseholdId).not.toHaveBeenCalled();
  });

  it('uses the active cloud household when no existing id is provided', () => {
    mocks.getActiveCloudHouseholdId.mockReturnValue('active-household');

    expect(localMutationFields().cloudHouseholdId).toBe('active-household');
    expect(mocks.getActiveCloudHouseholdId).toHaveBeenCalledTimes(1);
  });

  it('leaves cloudHouseholdId undefined when no existing or active household exists', () => {
    mocks.getActiveCloudHouseholdId.mockReturnValue(null);

    expect(localMutationFields().cloudHouseholdId).toBeUndefined();
  });
});

describe('belongsToActiveHousehold', () => {
  it('returns true when cloud is unconfigured', () => {
    expect(belongsToActiveHousehold(
      { cloudHouseholdId: 'other-household' },
      false,
      'active-household',
    )).toBe(true);
  });

  it('returns true when the record is missing a household', () => {
    expect(belongsToActiveHousehold({}, true, 'active-household')).toBe(true);
  });

  it('returns true when the record household matches the active household', () => {
    expect(belongsToActiveHousehold(
      { cloudHouseholdId: 'active-household' },
      true,
      'active-household',
    )).toBe(true);
  });

  it('returns false when the record belongs to another household', () => {
    expect(belongsToActiveHousehold(
      { cloudHouseholdId: 'other-household' },
      true,
      'active-household',
    )).toBe(false);
  });
});
