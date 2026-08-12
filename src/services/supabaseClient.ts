import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { removeLocalValue } from './safeStorage';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim();
const supabasePublishableKey = (
    import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY
    || import.meta.env.VITE_SUPABASE_ANON_KEY
)?.trim();
const supabaseAuthStorageKey = supabaseUrl
    ? `sb-${new URL(supabaseUrl).hostname.split('.')[0]}-auth-token`
    : null;

export const isCloudConfigured = Boolean(supabaseUrl && supabasePublishableKey);

export const supabase: SupabaseClient | null = isCloudConfigured
    ? createClient(supabaseUrl!, supabasePublishableKey!, {
        auth: {
            flowType: 'pkce',
            persistSession: true,
            autoRefreshToken: true,
            detectSessionInUrl: true,
            storageKey: supabaseAuthStorageKey!,
        },
    })
    : null;

export function clearDeletedAccountSession(): void {
    if (!supabaseAuthStorageKey || typeof window === 'undefined') return;
    removeLocalValue(supabaseAuthStorageKey);
    removeLocalValue(`${supabaseAuthStorageKey}-code-verifier`);
    removeLocalValue(`${supabaseAuthStorageKey}-user`);
}
