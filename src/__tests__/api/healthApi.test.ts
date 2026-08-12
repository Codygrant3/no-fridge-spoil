/// <reference types="node" />

import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../server/supabaseServer', () => ({
  createServiceAdminClient: vi.fn(() => {
    throw new Error('database secret detail');
  }),
}));

import { handleHealthRequest } from '../../../api/health';

describe('health API', () => {
  const originalCronSecret = process.env.CRON_SECRET;

  afterEach(() => {
    if (originalCronSecret === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = originalCronSecret;
  });

  it('returns redacted unhealthy diagnostics when the database check fails', async () => {
    process.env.CRON_SECRET = 'test-operator-secret-123456789';
    const response = await handleHealthRequest(new Request('http://localhost/api/health', {
      headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` },
    }));
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body.status).toBe('unhealthy');
    expect(body.checks.database.message).toBe('The cloud database is unavailable.');
    expect(JSON.stringify(body)).not.toContain('database secret detail');
  });

  it('rejects unsupported methods', async () => {
    const response = await handleHealthRequest(new Request('http://localhost/api/health', { method: 'POST' }));
    expect(response.status).toBe(405);
  });
});
