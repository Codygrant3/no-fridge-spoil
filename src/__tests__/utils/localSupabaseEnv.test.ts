import { describe, expect, it } from 'vitest';
import {
    LOCAL_SUPABASE_ENV_HEADER,
    assertCanWriteLocalEnv,
    parseSupabaseStatusEnv,
    renderLocalSupabaseEnv,
} from '../../utils/localSupabaseEnv';

const STATUS_ENV = `
API_URL="http://127.0.0.1:54321"
ANON_KEY="anon-test-key"
SERVICE_ROLE_KEY="service-role-test-key"
JWT_SECRET="do-not-copy"
`;

describe('localSupabaseEnv', () => {
    it('maps status env keys without promoting the secret into a VITE_ variable', () => {
        const keys = parseSupabaseStatusEnv(STATUS_ENV);
        expect(keys).toEqual({
            apiUrl: 'http://127.0.0.1:54321',
            publishableKey: 'anon-test-key',
            secretKey: 'service-role-test-key',
        });

        const rendered = renderLocalSupabaseEnv(keys, {
            cronSecret: 'cron-test',
            rateLimitSalt: 'salt-test',
        });
        expect(rendered.startsWith(LOCAL_SUPABASE_ENV_HEADER)).toBe(true);
        expect(rendered).toContain('VITE_SUPABASE_URL=http://127.0.0.1:54321');
        expect(rendered).toContain('VITE_SUPABASE_PUBLISHABLE_KEY=anon-test-key');
        expect(rendered).toContain('SUPABASE_SECRET_KEY=service-role-test-key');
        expect(rendered).not.toMatch(/VITE_SUPABASE_SECRET_KEY=/);
        expect(rendered).not.toContain('JWT_SECRET');
    });

    it('prefers publishable and secret key names when both legacy names exist', () => {
        expect(parseSupabaseStatusEnv(`
API_URL="http://127.0.0.1:54321"
ANON_KEY="legacy-anon"
PUBLISHABLE_KEY="publishable-key"
SERVICE_ROLE_KEY="legacy-service"
SECRET_KEY="secret-key"
`)).toEqual({
            apiUrl: 'http://127.0.0.1:54321',
            publishableKey: 'publishable-key',
            secretKey: 'secret-key',
        });
    });

    it('refuses to overwrite a hand-written env file unless forced', () => {
        expect(() => assertCanWriteLocalEnv('SUPABASE_URL=https://prod.example', false)).toThrow(/Refusing to overwrite/);
        expect(() => assertCanWriteLocalEnv(null, false)).not.toThrow();
        expect(() => assertCanWriteLocalEnv(`${LOCAL_SUPABASE_ENV_HEADER}\n`, false)).not.toThrow();
        expect(() => assertCanWriteLocalEnv('SUPABASE_URL=https://prod.example', true)).not.toThrow();
    });
});
