import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import {
    assertCanWriteLocalEnv,
    parseSupabaseStatusEnv,
    renderLocalSupabaseEnv,
} from '../src/utils/localSupabaseEnv.ts';

const envPath = path.resolve('.env.local');
const force = process.argv.includes('--force');

let existing: string | null = null;
try {
    existing = readFileSync(envPath, 'utf8');
} catch (error) {
    if (!(error instanceof Error) || !('code' in error) || error.code !== 'ENOENT') throw error;
}

assertCanWriteLocalEnv(existing, force);

const statusEnv = execFileSync('supabase', ['status', '-o', 'env'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
});
const rendered = renderLocalSupabaseEnv(parseSupabaseStatusEnv(statusEnv), {
    cronSecret: randomBytes(32).toString('hex'),
    rateLimitSalt: randomBytes(32).toString('hex'),
});
writeFileSync(envPath, rendered, { encoding: 'utf8', mode: 0o600 });
console.log(`Wrote disposable local Supabase env to ${envPath}`);
