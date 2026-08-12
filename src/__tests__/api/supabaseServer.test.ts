/// <reference types="node" />

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  clients: [] as unknown[],
}));

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => mocks.clients.shift()),
}));

import {
  authorizeHouseholdRequest,
  hashRequestIp,
  ServerRequestError,
} from '../../../server/supabaseServer';

const householdId = '11111111-1111-4111-8111-111111111111';
const originalEnvironment = {
  SUPABASE_URL: process.env.SUPABASE_URL,
  SUPABASE_PUBLISHABLE_KEY: process.env.SUPABASE_PUBLISHABLE_KEY,
  SUPABASE_SECRET_KEY: process.env.SUPABASE_SECRET_KEY,
  RATE_LIMIT_SALT: process.env.RATE_LIMIT_SALT,
};

function restore(name: keyof typeof originalEnvironment): void {
  const value = originalEnvironment[name];
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

function authorizedClients(options: { user?: boolean; membership?: boolean } = {}) {
  const user = options.user === false ? null : { id: 'user-1', email: 'user@example.test' };
  const verifier = {
    auth: {
      getUser: vi.fn().mockResolvedValue(user
        ? { data: { user }, error: null }
        : { data: { user: null }, error: { message: 'invalid' } }),
    },
  };
  const query = {
    select: vi.fn(),
    eq: vi.fn(),
    maybeSingle: vi.fn().mockResolvedValue({
      data: options.membership === false ? null : { role: 'owner' },
      error: null,
    }),
  };
  query.select.mockReturnValue(query);
  query.eq.mockReturnValue(query);
  const admin = { from: vi.fn().mockReturnValue(query) };
  mocks.clients.push(verifier, admin);
  return { verifier, admin, query };
}

describe('Supabase server authorization', () => {
  beforeEach(() => {
    process.env.SUPABASE_URL = 'https://project.supabase.co';
    process.env.SUPABASE_PUBLISHABLE_KEY = 'publishable-test';
    process.env.SUPABASE_SECRET_KEY = 'secret-test';
    process.env.RATE_LIMIT_SALT = '0123456789abcdef0123456789abcdef';
    mocks.clients.length = 0;
  });

  afterEach(() => {
    restore('SUPABASE_URL');
    restore('SUPABASE_PUBLISHABLE_KEY');
    restore('SUPABASE_SECRET_KEY');
    restore('RATE_LIMIT_SALT');
  });

  it('verifies the bearer token and household membership', async () => {
    const { verifier, query } = authorizedClients();
    const request = new Request('http://localhost/api/test', {
      headers: {
        Authorization: 'Bearer access-token',
        'X-Household-Id': householdId,
      },
    });

    const result = await authorizeHouseholdRequest(request);

    expect(result).toMatchObject({ householdId, role: 'owner', user: { id: 'user-1' } });
    expect(verifier.auth.getUser).toHaveBeenCalledWith('access-token');
    expect(query.eq).toHaveBeenCalledWith('household_id', householdId);
    expect(query.eq).toHaveBeenCalledWith('user_id', 'user-1');
  });

  it('rejects missing and invalid sessions', async () => {
    await expect(authorizeHouseholdRequest(new Request('http://localhost/api/test')))
      .rejects.toMatchObject({ status: 401, code: 'authentication-required' });

    authorizedClients({ user: false });
    await expect(authorizeHouseholdRequest(new Request('http://localhost/api/test', {
      headers: { Authorization: 'Bearer expired', 'X-Household-Id': householdId },
    }))).rejects.toMatchObject({ status: 401, code: 'invalid-session' });
  });

  it('rejects a valid user outside the requested household', async () => {
    authorizedClients({ membership: false });
    await expect(authorizeHouseholdRequest(new Request('http://localhost/api/test', {
      headers: { Authorization: 'Bearer valid', 'X-Household-Id': householdId },
    }))).rejects.toMatchObject({ status: 403, code: 'household-access-denied' });
  });

  it('fails closed when server account secrets are incomplete', async () => {
    delete process.env.SUPABASE_SECRET_KEY;
    await expect(authorizeHouseholdRequest(new Request('http://localhost/api/test', {
      headers: { Authorization: 'Bearer valid', 'X-Household-Id': householdId },
    }))).rejects.toMatchObject({ status: 503, code: 'account-service-not-configured' });
  });

  it('stores a stable HMAC bucket instead of the raw client IP', () => {
    const first = hashRequestIp(new Request('http://localhost', {
      headers: { 'X-Vercel-Forwarded-For': '203.0.113.42' },
    }));
    const repeated = hashRequestIp(new Request('http://localhost', {
      headers: { 'X-Vercel-Forwarded-For': '203.0.113.42' },
    }));
    const different = hashRequestIp(new Request('http://localhost', {
      headers: { 'X-Vercel-Forwarded-For': '203.0.113.43' },
    }));

    expect(first).toHaveLength(64);
    expect(first).toBe(repeated);
    expect(first).not.toBe(different);
    expect(first).not.toContain('203.0.113.42');
  });

  it('rejects weak or absent rate-limit salts', () => {
    process.env.RATE_LIMIT_SALT = 'too-short';
    expect(() => hashRequestIp(new Request('http://localhost')))
      .toThrow(ServerRequestError);
  });
});
