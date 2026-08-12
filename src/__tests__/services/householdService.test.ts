import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  householdHeaders: vi.fn(),
  sessionHeaders: vi.fn(),
}));

vi.mock('../../services/cloudSessionService', () => ({
  getAuthenticatedRequestHeaders: mocks.householdHeaders,
  getSessionAuthorizationHeaders: mocks.sessionHeaders,
}));

import {
  acceptHouseholdInvite,
  createHouseholdInvite,
  getHouseholdRoster,
} from '../../services/householdService';

function jsonResponse(body: unknown, status = 200): Response {
  return Response.json(body, { status });
}

describe('householdService', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    mocks.householdHeaders.mockResolvedValue({ Authorization: 'Bearer account', 'X-Household-Id': 'house-1' });
    mocks.sessionHeaders.mockResolvedValue({ Authorization: 'Bearer account' });
  });

  it('loads the active household roster with household authorization', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ members: [], invites: [] }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(getHouseholdRoster()).resolves.toEqual({ members: [], invites: [] });
    expect(fetchMock).toHaveBeenCalledWith('/api/household', expect.objectContaining({
      method: 'GET',
      headers: expect.objectContaining({ 'X-Household-Id': 'house-1' }),
    }));
  });

  it('creates a role-scoped invitation and accepts it with session-only authorization', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ inviteLink: 'https://app.test/#/profile?invite=token', expiresAt: '2026-07-21', delivery: 'copy-link' }, 201))
      .mockResolvedValueOnce(jsonResponse({ accepted: true, householdId: 'house-2' }));
    vi.stubGlobal('fetch', fetchMock);

    const invitation = await createHouseholdInvite('member@example.com', 'member');
    const accepted = await acceptHouseholdInvite('token');

    expect(invitation.delivery).toBe('copy-link');
    expect(accepted.householdId).toBe('house-2');
    expect(mocks.sessionHeaders).toHaveBeenCalledTimes(1);
    const acceptRequest = fetchMock.mock.calls[1]?.[1] as RequestInit;
    expect(acceptRequest.headers).not.toHaveProperty('X-Household-Id');
  });
});
