import {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useState,
    type ReactNode,
} from 'react';
import type { Session, User } from '@supabase/supabase-js';
import {
    clearDeletedAccountSession,
    isCloudConfigured,
    supabase,
} from '../services/supabaseClient';
import {
    getActiveCloudHouseholdId,
    setActiveCloudHouseholdId as persistActiveCloudHouseholdId,
} from '../services/cloudSessionService';

export interface CloudHousehold {
    id: string;
    name: string;
    role: 'owner' | 'admin' | 'member';
    dailyReceiptLimit: number;
    receiptRetentionDays: number;
}

interface AuthContextValue {
    configured: boolean;
    loading: boolean;
    session: Session | null;
    user: User | null;
    households: CloudHousehold[];
    activeHousehold: CloudHousehold | null;
    recoveryMode: boolean;
    signUp: (displayName: string, email: string, password: string) => Promise<string>;
    signIn: (email: string, password: string) => Promise<void>;
    signOut: () => Promise<void>;
    finishAccountDeletion: () => void;
    sendPasswordReset: (email: string) => Promise<void>;
    updatePassword: (password: string) => Promise<void>;
    setActiveHousehold: (householdId: string) => void;
    refreshAccount: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

interface HouseholdMembershipRow {
    household_id: string;
    role: CloudHousehold['role'];
    households: {
        id: string;
        name: string;
        daily_receipt_limit: number;
        receipt_retention_days: number;
    } | Array<{
        id: string;
        name: string;
        daily_receipt_limit: number;
        receipt_retention_days: number;
    }> | null;
}

function membershipToHousehold(row: HouseholdMembershipRow): CloudHousehold | null {
    const household = Array.isArray(row.households) ? row.households[0] : row.households;
    if (!household) return null;
    return {
        id: household.id,
        name: household.name,
        role: row.role,
        dailyReceiptLimit: household.daily_receipt_limit,
        receiptRetentionDays: household.receipt_retention_days,
    };
}

const SESSION_RESTORE_TIMEOUT_MS = 5_000;

async function restoreSessionWithTimeout(): Promise<Awaited<ReturnType<NonNullable<typeof supabase>['auth']['getSession']>>> {
    if (!supabase) throw new Error('Cloud accounts are not configured.');
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    try {
        return await Promise.race([
            supabase.auth.getSession(),
            new Promise<never>((_, reject) => {
                timeoutId = setTimeout(
                    () => reject(new Error('Account session restore timed out.')),
                    SESSION_RESTORE_TIMEOUT_MS,
                );
            }),
        ]);
    } finally {
        if (timeoutId) clearTimeout(timeoutId);
    }
}

export function AuthProvider({ children }: { children: ReactNode }) {
    const [loading, setLoading] = useState(isCloudConfigured);
    const [session, setSession] = useState<Session | null>(null);
    const [households, setHouseholds] = useState<CloudHousehold[]>([]);
    const [activeHouseholdId, setActiveHouseholdId] = useState<string | null>(() => getActiveCloudHouseholdId());
    const [recoveryMode, setRecoveryMode] = useState(false);

    const loadHouseholds = useCallback(async (nextSession: Session | null) => {
        if (!supabase || !nextSession?.user) {
            setHouseholds([]);
            setActiveHouseholdId(null);
            persistActiveCloudHouseholdId(null);
            return;
        }

        const { data, error } = await supabase
            .from('household_members')
            .select('household_id, role, households(id, name, daily_receipt_limit, receipt_retention_days)')
            .eq('user_id', nextSession.user.id);

        if (error) throw error;

        const nextHouseholds = (data as HouseholdMembershipRow[])
            .map(membershipToHousehold)
            .filter((value): value is CloudHousehold => value !== null);
        setHouseholds(nextHouseholds);

        const persisted = getActiveCloudHouseholdId();
        const nextActiveId = nextHouseholds.some(household => household.id === persisted)
            ? persisted
            : nextHouseholds[0]?.id ?? null;
        setActiveHouseholdId(nextActiveId);
        persistActiveCloudHouseholdId(nextActiveId);
    }, []);

    const refreshAccount = useCallback(async () => {
        if (!supabase) return;
        const { data, error } = await supabase.auth.getSession();
        if (error) throw error;
        setSession(data.session);
        await loadHouseholds(data.session);
    }, [loadHouseholds]);

    useEffect(() => {
        if (!supabase) return;

        let mounted = true;
        void restoreSessionWithTimeout()
            .then(async ({ data, error }) => {
                if (!mounted) return;
                if (error) throw error;
                setSession(data.session);
                await loadHouseholds(data.session);
            })
            .catch(error => {
                if (!mounted) return;
                console.warn('Account session restore unavailable:', error instanceof Error ? error.message : error);
                setSession(null);
                setHouseholds([]);
            })
            .finally(() => {
                if (mounted) setLoading(false);
            });

        const { data: subscription } = supabase.auth.onAuthStateChange((event, nextSession) => {
            if (!mounted) return;
            setSession(nextSession);
            setRecoveryMode(event === 'PASSWORD_RECOVERY');
            window.setTimeout(() => {
                void loadHouseholds(nextSession).catch(error => {
                    console.error('Household refresh failed:', error);
                });
            }, 0);
        });

        return () => {
            mounted = false;
            subscription.subscription.unsubscribe();
        };
    }, [loadHouseholds]);

    const signUp = useCallback(async (displayName: string, email: string, password: string) => {
        if (!supabase) throw new Error('Cloud accounts are not configured.');
        const { data, error } = await supabase.auth.signUp({
            email,
            password,
            options: {
                data: { display_name: displayName },
                emailRedirectTo: `${window.location.origin}/#/profile`,
            },
        });
        if (error) throw error;
        return data.session
            ? 'Account created.'
            : 'Check your email to confirm your account.';
    }, []);

    const signIn = useCallback(async (email: string, password: string) => {
        if (!supabase) throw new Error('Cloud accounts are not configured.');
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
    }, []);

    const signOut = useCallback(async () => {
        if (!supabase) return;
        const { error } = await supabase.auth.signOut({ scope: 'local' });
        if (error) throw error;
        persistActiveCloudHouseholdId(null);
        setActiveHouseholdId(null);
    }, []);

    const finishAccountDeletion = useCallback(() => {
        clearDeletedAccountSession();
        persistActiveCloudHouseholdId(null);
        window.location.replace(`${window.location.pathname}${window.location.search}` || '/');
    }, []);

    const sendPasswordReset = useCallback(async (email: string) => {
        if (!supabase) throw new Error('Cloud accounts are not configured.');
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
            redirectTo: `${window.location.origin}/#/profile`,
        });
        if (error) throw error;
    }, []);

    const updatePassword = useCallback(async (password: string) => {
        if (!supabase) throw new Error('Cloud accounts are not configured.');
        const { error } = await supabase.auth.updateUser({ password });
        if (error) throw error;
        setRecoveryMode(false);
    }, []);

    const setActiveHousehold = useCallback((householdId: string) => {
        if (!households.some(household => household.id === householdId)) return;
        setActiveHouseholdId(householdId);
        persistActiveCloudHouseholdId(householdId);
    }, [households]);

    const activeHousehold = households.find(household => household.id === activeHouseholdId) ?? null;
    const value = useMemo<AuthContextValue>(() => ({
        configured: isCloudConfigured,
        loading,
        session,
        user: session?.user ?? null,
        households,
        activeHousehold,
        recoveryMode,
        signUp,
        signIn,
        signOut,
        finishAccountDeletion,
        sendPasswordReset,
        updatePassword,
        setActiveHousehold,
        refreshAccount,
    }), [
        activeHousehold,
        finishAccountDeletion,
        households,
        loading,
        recoveryMode,
        refreshAccount,
        sendPasswordReset,
        session,
        setActiveHousehold,
        signIn,
        signOut,
        signUp,
        updatePassword,
    ]);

    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
    const context = useContext(AuthContext);
    if (!context) throw new Error('useAuth must be used inside AuthProvider');
    return context;
}

export function useOptionalAuth(): AuthContextValue | null {
    return useContext(AuthContext) ?? null;
}
