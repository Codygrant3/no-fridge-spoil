import { useCallback, useEffect, useRef, useState } from 'react';
import {
    ArrowsClockwise,
    ChartBar,
    CloudCheck,
    CloudSlash,
    Copy,
    Crown,
    Database,
    DownloadSimple,
    FloppyDisk,
    Key,
    ShieldCheck,
    SignOut,
    SpinnerGap,
    Trash,
    UserCircle,
    UserPlus,
    UsersThree,
    UploadSimple,
    Warning,
} from '@phosphor-icons/react';
import { AccountAccess } from '../components/AccountAccess';
import { clearCacheByService, getCacheStats } from '../services/aiCacheService';
import {
    checkReceiptOcrHealth,
    getReceiptOcrDiagnostics,
    getQueuedReceiptScans,
    type ReceiptDiagnostics,
} from '../services/receiptOCRService';
import {
    clearReceiptPreviews,
    clearReceiptPrivacyData,
    getReceiptHistory,
    getReceiptPrivacySettings,
    setReceiptPrivacySettings,
    type ReceiptPrivacySettings,
} from '../services/receiptHistoryService';
import { useOptionalAuth } from '../context/AuthContext';
import {
    clearLocalHouseholdData,
    deleteCloudAccount,
    downloadAccountExport,
    getAccountPreferences,
    updateAccountPreferences,
    updateHouseholdRetention,
    type AccountPreferences,
} from '../services/accountService';
import {
    getCloudSyncSnapshot,
    migrateLocalDataToActiveHousehold,
    resolveAllSyncConflicts,
    subscribeCloudSync,
    syncNow,
    type CloudSyncSnapshot,
} from '../services/cloudSyncService';
import { getUsageSummary, type UsageSummary } from '../services/usageService';
import {
    acceptHouseholdInvite,
    cancelHouseholdInvite,
    createHouseholdInvite,
    getHouseholdRoster,
    removeHouseholdMember,
    transferHouseholdOwnership,
    updateHouseholdMember,
    type HouseholdRoster,
} from '../services/householdService';
import { setActiveCloudHouseholdId } from '../services/cloudSessionService';
import {
    exportAllData,
    importData,
    inspectBackupData,
    type BackupInspectionResult,
} from '../db/database';
import { copyText } from '../utils/clipboard';

type CacheStats = Awaited<ReturnType<typeof getCacheStats>>;
type PendingBackup = {
    fileName: string;
    body: string;
    inspection: BackupInspectionResult;
};

export function Profile() {
    const auth = useOptionalAuth();
    const [diagnostics, setDiagnostics] = useState<ReceiptDiagnostics>(() => getReceiptOcrDiagnostics());
    const [isChecking, setIsChecking] = useState(false);
    const [cacheStats, setCacheStats] = useState<CacheStats | null>(null);
    const [queueCount, setQueueCount] = useState(0);
    const [historyCount, setHistoryCount] = useState(0);
    const [privacy, setPrivacy] = useState<ReceiptPrivacySettings>(() => getReceiptPrivacySettings());
    const [feedback, setFeedback] = useState<string | null>(null);
    const [accountPreferences, setAccountPreferences] = useState<AccountPreferences | null>(null);
    const [householdRetentionDays, setHouseholdRetentionDays] = useState(30);
    const [usage, setUsage] = useState<UsageSummary | null>(null);
    const [syncSnapshot, setSyncSnapshot] = useState<CloudSyncSnapshot>(() => getCloudSyncSnapshot());
    const [accountBusy, setAccountBusy] = useState<string | null>(null);
    const [accountError, setAccountError] = useState<string | null>(null);
    const [receiptDeleteArmed, setReceiptDeleteArmed] = useState(false);
    const [deleteConfirmation, setDeleteConfirmation] = useState('');
    const [roster, setRoster] = useState<HouseholdRoster | null>(null);
    const [inviteEmail, setInviteEmail] = useState('');
    const [inviteRole, setInviteRole] = useState<'member' | 'admin'>('member');
    const [inviteLink, setInviteLink] = useState('');
    const [pendingBackup, setPendingBackup] = useState<PendingBackup | null>(null);
    const inviteHandled = useRef(false);
    const backupInputRef = useRef<HTMLInputElement>(null);
    const activeHousehold = auth?.activeHousehold ?? null;
    const accountConfigured = Boolean(auth?.configured);
    const accountUserId = auth?.user?.id;

    const refreshRoster = useCallback(async () => {
        if (!auth?.configured || !auth.user || !auth.activeHousehold) {
            setRoster(null);
            return;
        }
        setRoster(await getHouseholdRoster());
    }, [auth?.activeHousehold, auth?.configured, auth?.user]);

    const refreshDiagnostics = async () => {
        setCacheStats(await getCacheStats());
        setQueueCount((await getQueuedReceiptScans()).length);
        setHistoryCount((await getReceiptHistory()).length);
        setPrivacy(getReceiptPrivacySettings());
    };

    useEffect(() => {
        void refreshDiagnostics();
    }, []);

    useEffect(() => subscribeCloudSync(setSyncSnapshot), []);

    useEffect(() => {
        void refreshRoster().catch(error => {
            setAccountError(error instanceof Error ? error.message : 'Household members could not be loaded.');
        });
    }, [refreshRoster]);

    useEffect(() => {
        if (inviteHandled.current || !auth?.configured || !auth.user) return;
        const query = window.location.hash.split('?')[1] ?? '';
        const token = new URLSearchParams(query).get('invite');
        if (!token) return;
        inviteHandled.current = true;
        setAccountBusy('accept-invite');
        void acceptHouseholdInvite(token).then(async result => {
            if (result.householdId) setActiveCloudHouseholdId(result.householdId);
            await auth.refreshAccount();
            setFeedback('Household invitation accepted. Shared groceries are syncing now.');
            window.history.replaceState(null, '', '#/profile');
        }).catch(error => {
            setAccountError(error instanceof Error ? error.message : 'Household invitation could not be accepted.');
        }).finally(() => setAccountBusy(null));
    }, [auth]);

    useEffect(() => {
        const userId = accountUserId;
        const householdId = activeHousehold?.id;
        if (!accountConfigured || !userId || !activeHousehold || !householdId) {
            setAccountPreferences(null);
            setUsage(null);
            return;
        }

        let cancelled = false;
        setAccountError(null);
        setHouseholdRetentionDays(activeHousehold.receiptRetentionDays);
        void Promise.all([
            getAccountPreferences(userId),
            getUsageSummary(householdId, userId),
        ]).then(([preferences, summary]) => {
            if (cancelled) return;
            setAccountPreferences(preferences);
            setUsage(summary);
        }).catch(error => {
            if (!cancelled) setAccountError(error instanceof Error ? error.message : 'Account data could not be loaded.');
        });
        return () => {
            cancelled = true;
        };
    }, [
        accountConfigured,
        accountUserId,
        activeHousehold,
    ]);

    const runHealthCheck = async () => {
        setIsChecking(true);
        try {
            setDiagnostics(await checkReceiptOcrHealth());
        } finally {
            setIsChecking(false);
            await refreshDiagnostics();
        }
    };

    const updatePrivacy = (updates: Partial<ReceiptPrivacySettings>) => {
        const next = { ...privacy, ...updates };
        setPrivacy(next);
        setReceiptPrivacySettings(next);
        setFeedback('Receipt privacy settings updated.');
        void refreshDiagnostics();
    };

    const clearPreviews = async () => {
        await clearReceiptPreviews();
        setFeedback('Saved receipt previews cleared.');
        await refreshDiagnostics();
    };

    const clearReceiptData = async () => {
        if (!receiptDeleteArmed) {
            setReceiptDeleteArmed(true);
            setFeedback('Tap “Confirm delete” to permanently clear all local receipt data.');
            return;
        }
        await clearReceiptPrivacyData();
        setFeedback('All local receipt history, queued images, previews, and OCR cache were cleared.');
        setReceiptDeleteArmed(false);
        await refreshDiagnostics();
    };

    const clearReceiptCache = async () => {
        await clearCacheByService('receipt');
        setFeedback('Receipt OCR cache cleared.');
        await refreshDiagnostics();
    };

    const downloadDeviceBackup = async () => {
        const body = await exportAllData();
        const url = URL.createObjectURL(new Blob([body], { type: 'application/json' }));
        const link = document.createElement('a');
        link.href = url;
        link.download = `no-fridge-spoil-device-backup-${new Date().toISOString().slice(0, 10)}.json`;
        link.click();
        URL.revokeObjectURL(url);
        setFeedback('Device backup downloaded.');
    };

    const reviewDeviceBackup = async (file?: File) => {
        if (!file) return;
        setAccountError(null);
        setPendingBackup(null);
        if (file.size > 10 * 1024 * 1024) {
            setAccountError('Backup files must be 10 MB or smaller.');
            return;
        }
        const body = await file.text();
        const inspection = inspectBackupData(body);
        if (!inspection.success) {
            setAccountError(inspection.errors[0] || 'The backup could not be read.');
            return;
        }
        setPendingBackup({ fileName: file.name, body, inspection });
        setFeedback(`Review ${inspection.totalRecords} record${inspection.totalRecords === 1 ? '' : 's'} before restoring.`);
    };

    const confirmDeviceBackupRestore = async () => {
        if (!pendingBackup) return;
        setAccountBusy('device-restore');
        setAccountError(null);
        const result = await importData(pendingBackup.body);
        if (!result.success) {
            setAccountError(result.errors[0] || 'The backup could not be restored.');
            setAccountBusy(null);
            return;
        }
        const warning = result.errors.length > 0
            ? ` ${result.errors.length} invalid record${result.errors.length === 1 ? ' was' : 's were'} skipped.`
            : '';
        setFeedback(`${result.recordsImported} device record${result.recordsImported === 1 ? '' : 's'} restored.${warning}`);
        setPendingBackup(null);
        setAccountBusy(null);
        await refreshDiagnostics();
    };

    const runCloudAction = async (name: string, action: () => Promise<void>, successMessage: string) => {
        setAccountBusy(name);
        setAccountError(null);
        try {
            await action();
            setFeedback(successMessage);
        } catch (error) {
            setAccountError(error instanceof Error ? error.message : 'Account request failed.');
        } finally {
            setAccountBusy(null);
        }
    };

    const inviteMember = async () => {
        if (!inviteEmail.trim()) return;
        await runCloudAction('invite', async () => {
            const invitation = await createHouseholdInvite(inviteEmail, inviteRole);
            setInviteLink(invitation.inviteLink);
            setInviteEmail('');
            await refreshRoster();
        }, 'Invitation link created. Share it with the household member.');
    };

    const copyInviteLink = async () => {
        if (!inviteLink) return;
        const copied = await copyText(inviteLink);
        if (copied) {
            setFeedback('Invitation link copied.');
        } else {
            setAccountError('The invitation link could not be copied. Select and copy it manually.');
        }
    };

    const changeMemberRole = async (userId: string, role: 'admin' | 'member') => {
        await runCloudAction(`role-${userId}`, async () => {
            await updateHouseholdMember(userId, role);
            await refreshRoster();
        }, 'Household role updated.');
    };

    const removeMember = async (userId: string, displayName: string) => {
        if (!window.confirm(`Remove ${displayName} from this household? Their account will keep its personal data.`)) return;
        await runCloudAction(`remove-${userId}`, async () => {
            await removeHouseholdMember(userId);
            await refreshRoster();
        }, 'Household member removed.');
    };

    const transferOwnership = async (userId: string, displayName: string) => {
        if (!window.confirm(`Transfer household ownership to ${displayName}? You will no longer control owner-only settings.`)) return;
        await runCloudAction(`transfer-${userId}`, async () => {
            await transferHouseholdOwnership(userId);
            await auth?.refreshAccount();
            await refreshRoster();
        }, 'Household ownership transferred.');
    };

    const cancelInvite = async (inviteId: string) => {
        await runCloudAction(`invite-${inviteId}`, async () => {
            await cancelHouseholdInvite(inviteId);
            await refreshRoster();
        }, 'Invitation canceled.');
    };

    const saveAccountSettings = async () => {
        if (!auth?.user || !auth.activeHousehold || !accountPreferences) return;
        await runCloudAction('save', async () => {
            await updateAccountPreferences(auth.user!.id, accountPreferences);
            if (auth.activeHousehold!.role !== 'member') {
                await updateHouseholdRetention(auth.activeHousehold!.id, householdRetentionDays);
            }
            await auth.refreshAccount();
        }, 'Account and retention settings saved.');
    };

    const refreshCloud = async () => {
        if (!auth?.user || !auth.activeHousehold) return;
        await runCloudAction('sync', async () => {
            const result = await syncNow();
            if (result.status === 'error') throw new Error(result.error || 'Cloud synchronization failed.');
            setUsage(await getUsageSummary(auth.activeHousehold!.id, auth.user!.id));
        }, 'Cloud data is up to date.');
    };

    const migrateLocalData = async () => {
        await runCloudAction('migrate', async () => {
            const result = await migrateLocalDataToActiveHousehold();
            if (result.status === 'error') throw new Error(result.error || 'Local data migration failed.');
        }, 'Local device data is now assigned to this household and queued for sync.');
    };

    const resolveConflicts = async (choice: 'device' | 'cloud') => {
        await runCloudAction(`conflict-${choice}`, async () => {
            const result = await resolveAllSyncConflicts(choice);
            if (result.status === 'error') throw new Error(result.error || 'Conflict resolution failed.');
        }, choice === 'device'
            ? 'This device version was selected for all current conflicts.'
            : 'Cloud versions were selected for all current conflicts.');
    };

    const exportAccount = async () => {
        await runCloudAction('export', async () => {
            await syncNow();
            await downloadAccountExport();
        }, 'Account export prepared.');
    };

    const sendRecoveryEmail = async () => {
        const email = auth?.user?.email;
        if (!email) return;
        await runCloudAction('recovery', () => auth!.sendPasswordReset(email), 'Password reset email sent.');
    };

    const removeAccount = async () => {
        const householdId = auth?.activeHousehold?.id;
        if (!auth || !householdId) return;
        await runCloudAction('delete', async () => {
            await deleteCloudAccount(deleteConfirmation);
            await clearLocalHouseholdData(householdId);
            auth.finishAccountDeletion();
        }, 'Account permanently deleted.');
    };

    const formatSyncTime = (value?: string) => {
        if (!value) return 'Not synced yet';
        return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
    };

    return (
        <div className="editorial-page profile-page">
            <header className="editorial-page-header">
                <div>
                    <p className="editorial-kicker">Account & data</p>
                    <h1>Profile</h1>
                </div>
            </header>

            {feedback && <div className="editorial-toast" role="status">{feedback}</div>}
            {accountError && <div className="editorial-toast is-error" role="alert">{accountError}</div>}

            {auth?.configured && auth.user && auth.activeHousehold ? (
                <>
                    <section className="settings-section" aria-labelledby="account-heading">
                        <div className="settings-section-heading">
                            <UserCircle size={22} weight="duotone" />
                            <div>
                                <h2 id="account-heading">Cloud account</h2>
                                <p>{auth.user.email}</p>
                            </div>
                            <span className="settings-status is-ready">Verified</span>
                        </div>

                        {auth.households.length > 1 && (
                            <label className="account-setting-field">
                                <span>Household</span>
                                <select
                                    value={auth.activeHousehold.id}
                                    onChange={event => auth.setActiveHousehold(event.target.value)}
                                >
                                    {auth.households.map(household => (
                                        <option key={household.id} value={household.id}>{household.name}</option>
                                    ))}
                                </select>
                            </label>
                        )}

                        {accountPreferences && (
                            <div className="account-settings-grid">
                                <label className="account-setting-field">
                                    <span>Display name</span>
                                    <input
                                        value={accountPreferences.displayName}
                                        maxLength={80}
                                        onChange={event => setAccountPreferences(current => current
                                            ? { ...current, displayName: event.target.value }
                                            : current)}
                                    />
                                </label>
                                <label className="account-setting-field">
                                    <span>Receipt records</span>
                                    <select
                                        value={accountPreferences.receiptRetentionDays}
                                        onChange={event => setAccountPreferences(current => current
                                            ? { ...current, receiptRetentionDays: Number(event.target.value) }
                                            : current)}
                                    >
                                        <option value={0}>Delete after processing</option>
                                        <option value={7}>Keep 7 days</option>
                                        <option value={30}>Keep 30 days</option>
                                        <option value={90}>Keep 90 days</option>
                                        <option value={365}>Keep 1 year</option>
                                    </select>
                                </label>
                                <label className="account-setting-field">
                                    <span>Usage records</span>
                                    <select
                                        value={accountPreferences.usageRetentionDays}
                                        onChange={event => setAccountPreferences(current => current
                                            ? { ...current, usageRetentionDays: Number(event.target.value) }
                                            : current)}
                                    >
                                        <option value={30}>Keep 30 days</option>
                                        <option value={90}>Keep 90 days</option>
                                        <option value={365}>Keep 1 year</option>
                                        <option value={730}>Keep 2 years</option>
                                    </select>
                                </label>
                                {auth.activeHousehold.role !== 'member' && (
                                    <label className="account-setting-field">
                                        <span>Household receipt records</span>
                                        <select
                                            value={householdRetentionDays}
                                            onChange={event => setHouseholdRetentionDays(Number(event.target.value))}
                                        >
                                            <option value={0}>Delete after processing</option>
                                            <option value={7}>Keep 7 days</option>
                                            <option value={30}>Keep 30 days</option>
                                            <option value={90}>Keep 90 days</option>
                                            <option value={365}>Keep 1 year</option>
                                        </select>
                                    </label>
                                )}
                            </div>
                        )}

                        <button
                            type="button"
                            className="settings-command"
                            disabled={!accountPreferences || accountBusy !== null}
                            onClick={() => void saveAccountSettings()}
                        >
                            <FloppyDisk size={18} />
                            {accountBusy === 'save' ? 'Saving settings' : 'Save account settings'}
                        </button>
                        <div className="settings-action-row account-action-grid">
                            <button type="button" disabled={accountBusy !== null} onClick={() => void exportAccount()}>
                                <DownloadSimple size={17} /> Export
                            </button>
                            <button type="button" disabled={accountBusy !== null} onClick={() => void sendRecoveryEmail()}>
                                <Key size={17} /> Reset password
                            </button>
                            <button type="button" disabled={accountBusy !== null} onClick={() => void auth.signOut()}>
                                <SignOut size={17} /> Sign out
                            </button>
                        </div>
                    </section>

                    <section className="settings-section household-section" aria-labelledby="household-heading">
                        <div className="settings-section-heading">
                            <UsersThree size={22} weight="duotone" />
                            <div>
                                <h2 id="household-heading">Household</h2>
                                <p>{auth.activeHousehold.name} shared access</p>
                            </div>
                            <span className="settings-status is-ready">
                                {roster?.members.length ?? 1} member{(roster?.members.length ?? 1) === 1 ? '' : 's'}
                            </span>
                        </div>

                        {auth.activeHousehold.role !== 'member' && (
                            <div className="household-invite-controls">
                                <label className="account-setting-field">
                                    <span>Invite by email</span>
                                    <input
                                        type="email"
                                        value={inviteEmail}
                                        onChange={event => setInviteEmail(event.target.value)}
                                        placeholder="name@example.com"
                                    />
                                </label>
                                <label className="account-setting-field">
                                    <span>Access</span>
                                    <select value={inviteRole} onChange={event => setInviteRole(event.target.value as 'member' | 'admin')}>
                                        <option value="member">Member</option>
                                        {auth.activeHousehold.role === 'owner' && <option value="admin">Admin</option>}
                                    </select>
                                </label>
                                <button
                                    type="button"
                                    className="settings-command"
                                    disabled={!inviteEmail.trim() || accountBusy !== null}
                                    onClick={() => void inviteMember()}
                                >
                                    <UserPlus size={18} />
                                    {accountBusy === 'invite' ? 'Creating invitation' : 'Create invitation'}
                                </button>
                            </div>
                        )}

                        {inviteLink && (
                            <div className="household-invite-link" role="status">
                                <span>Invitation link ready for secure sharing</span>
                                <button type="button" onClick={() => void copyInviteLink()}>
                                    <Copy size={17} /> Copy link
                                </button>
                            </div>
                        )}

                        <div className="household-member-list" aria-label="Household members">
                            {(roster?.members ?? []).map(member => {
                                const isCurrentUser = member.userId === auth.user?.id;
                                const canManage = auth.activeHousehold!.role === 'owner' && !isCurrentUser && member.role !== 'owner';
                                const canRemove = !isCurrentUser
                                    && member.role !== 'owner'
                                    && (auth.activeHousehold!.role === 'owner' || member.role === 'member');
                                return (
                                    <div className="household-member-row" key={member.userId}>
                                        <span className="household-member-avatar" aria-hidden="true">
                                            {member.role === 'owner' ? <Crown size={18} weight="fill" /> : member.displayName.slice(0, 1).toUpperCase()}
                                        </span>
                                        <span className="household-member-copy">
                                            <strong>{member.displayName}{isCurrentUser ? ' (you)' : ''}</strong>
                                            <small>{member.email || member.role}</small>
                                        </span>
                                        {canManage ? (
                                            <select
                                                aria-label={`Role for ${member.displayName}`}
                                                value={member.role}
                                                disabled={accountBusy !== null}
                                                onChange={event => void changeMemberRole(member.userId, event.target.value as 'admin' | 'member')}
                                            >
                                                <option value="member">Member</option>
                                                <option value="admin">Admin</option>
                                            </select>
                                        ) : (
                                            <span className="household-role-label">{member.role}</span>
                                        )}
                                        {canRemove && (
                                            <button
                                                type="button"
                                                className="household-row-action is-destructive"
                                                aria-label={`Remove ${member.displayName}`}
                                                title="Remove member"
                                                disabled={accountBusy !== null}
                                                onClick={() => void removeMember(member.userId, member.displayName)}
                                            >
                                                <Trash size={17} />
                                            </button>
                                        )}
                                        {auth.activeHousehold!.role === 'owner' && !isCurrentUser && member.role !== 'owner' && (
                                            <button
                                                type="button"
                                                className="household-row-action"
                                                aria-label={`Transfer ownership to ${member.displayName}`}
                                                title="Transfer ownership"
                                                disabled={accountBusy !== null}
                                                onClick={() => void transferOwnership(member.userId, member.displayName)}
                                            >
                                                <Crown size={17} />
                                            </button>
                                        )}
                                    </div>
                                );
                            })}
                        </div>

                        {auth.activeHousehold.role !== 'member' && (roster?.invites.length ?? 0) > 0 && (
                            <div className="household-pending-list">
                                <p>Pending invitations</p>
                                {roster!.invites.map(invite => (
                                    <div key={invite.id}>
                                        <span><strong>{invite.email}</strong><small>{invite.role} · expires {new Date(invite.expiresAt).toLocaleDateString()}</small></span>
                                        <button
                                            type="button"
                                            disabled={accountBusy !== null}
                                            onClick={() => void cancelInvite(invite.id)}
                                        >Cancel</button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </section>

                    <section className="settings-section" aria-labelledby="sync-heading">
                        <div className="settings-section-heading">
                            <ArrowsClockwise size={22} weight="duotone" />
                            <div>
                                <h2 id="sync-heading">Cloud sync</h2>
                                <p>{formatSyncTime(syncSnapshot.lastSuccessfulSyncAt)}</p>
                            </div>
                            <span className={`settings-status ${syncSnapshot.status === 'idle' ? 'is-ready' : 'is-warning'}`}>
                                {syncSnapshot.status}
                            </span>
                        </div>
                        <p className="settings-message">
                            {syncSnapshot.pendingChanges === 0
                                ? 'All device changes are backed up.'
                                : `${syncSnapshot.pendingChanges} change${syncSnapshot.pendingChanges === 1 ? '' : 's'} waiting to sync.`}
                        </p>
                        {(syncSnapshot.localMigrationCount ?? 0) > 0 && (
                            <div className="settings-message is-warning">
                                <strong>{syncSnapshot.localMigrationCount} local record{syncSnapshot.localMigrationCount === 1 ? '' : 's'}</strong>
                                {' '}are still private to this device. They will not be uploaded without your approval.
                                <button
                                    type="button"
                                    className="settings-command"
                                    disabled={accountBusy !== null}
                                    onClick={() => void migrateLocalData()}
                                >
                                    <CloudCheck size={18} />
                                    {accountBusy === 'migrate' ? 'Moving data' : 'Move local data to this household'}
                                </button>
                            </div>
                        )}
                        {(syncSnapshot.conflictCount ?? 0) > 0 && (
                            <div className="settings-message is-warning">
                                <strong>{syncSnapshot.conflictCount} sync conflict{syncSnapshot.conflictCount === 1 ? '' : 's'}</strong>
                                {' '}need a version choice before syncing can continue.
                                <div className="flex gap-2 pt-2">
                                    <button
                                        type="button"
                                        className="settings-command"
                                        disabled={accountBusy !== null}
                                        onClick={() => void resolveConflicts('device')}
                                    >
                                        Use this device
                                    </button>
                                    <button
                                        type="button"
                                        className="settings-command"
                                        disabled={accountBusy !== null}
                                        onClick={() => void resolveConflicts('cloud')}
                                    >
                                        Use cloud
                                    </button>
                                </div>
                            </div>
                        )}
                        <button type="button" className="settings-command" disabled={accountBusy !== null} onClick={() => void refreshCloud()}>
                            <ArrowsClockwise size={18} className={accountBusy === 'sync' ? 'animate-spin' : ''} />
                            {accountBusy === 'sync' ? 'Synchronizing' : 'Sync now'}
                        </button>
                    </section>

                    <section className="settings-section" aria-labelledby="usage-heading">
                        <div className="settings-section-heading">
                            <ChartBar size={22} weight="duotone" />
                            <div>
                                <h2 id="usage-heading">Receipt usage</h2>
                                <p>Household processing over the last 30 days</p>
                            </div>
                        </div>
                        <div className="settings-metrics account-usage-metrics">
                            <div><strong>{usage?.todaySuccessful ?? 0}</strong><span>Today</span></div>
                            <div><strong>{usage?.personalThirtyDaySuccessful ?? 0}</strong><span>Your scans</span></div>
                            <div><strong>{usage?.thirtyDaySuccessful ?? 0}</strong><span>Household</span></div>
                            <div><strong>{usage?.thirtyDayFailed ?? 0}</strong><span>Failed</span></div>
                            <div><strong>{usage?.thirtyDayDenied ?? 0}</strong><span>Limited</span></div>
                            <div><strong>${((usage?.thirtyDayCostCents ?? 0) / 100).toFixed(2)}</strong><span>OCR cost</span></div>
                        </div>
                    </section>
                </>
            ) : (
                <>
                    <section className="settings-section" aria-labelledby="local-account-heading">
                        <div className="settings-section-heading">
                            <CloudSlash size={22} weight="duotone" />
                            <div>
                                <h2 id="local-account-heading">Device storage</h2>
                                <p>Data is stored in this browser</p>
                            </div>
                            <span className="settings-status is-warning">Local</span>
                        </div>
                    </section>
                    {auth?.configured && <AccountAccess embedded />}
                </>
            )}

            <section className="settings-section" aria-labelledby="ocr-heading">
                <div className="settings-section-heading">
                    <CloudCheck size={22} weight="duotone" />
                    <div>
                        <h2 id="ocr-heading">Receipt intelligence</h2>
                        <p>{diagnostics.providerLabel} processing health</p>
                    </div>
                    <span className={`settings-status ${diagnostics.status === 'ready' ? 'is-ready' : 'is-warning'}`}>
                        {diagnostics.status}
                    </span>
                </div>
                <p className="settings-message">{diagnostics.message}</p>
                <button type="button" className="settings-command" onClick={() => void runHealthCheck()} disabled={isChecking}>
                    <SpinnerGap size={18} className={isChecking ? 'animate-spin' : ''} />
                    {isChecking ? 'Checking connection' : 'Check OCR health'}
                </button>
            </section>

            <section className="settings-section" aria-labelledby="device-backup-heading">
                <div className="settings-section-heading">
                    <DownloadSimple size={22} weight="duotone" />
                    <div>
                        <h2 id="device-backup-heading">Device backup</h2>
                        <p>Portable inventory, lists, profiles, meal plans, settings, and receipt summaries</p>
                    </div>
                </div>
                <div className="settings-action-row">
                    <button type="button" onClick={() => void downloadDeviceBackup()}>
                        <DownloadSimple size={17} /> Download backup
                    </button>
                    <button type="button" onClick={() => backupInputRef.current?.click()}>
                        <UploadSimple size={17} /> Restore backup
                    </button>
                </div>
                <input
                    ref={backupInputRef}
                    type="file"
                    accept="application/json,.json"
                    className="sr-only"
                    aria-label="Choose device backup"
                    onChange={event => {
                        const file = event.target.files?.[0];
                        event.target.value = '';
                        void reviewDeviceBackup(file);
                    }}
                />
                {pendingBackup && (
                    <div className="settings-restore-review" role="status" aria-live="polite">
                        <div>
                            <strong>Review restore</strong>
                            <span>{pendingBackup.fileName}</span>
                            <small>
                                {pendingBackup.inspection.totalRecords} record{pendingBackup.inspection.totalRecords === 1 ? '' : 's'}
                                {pendingBackup.inspection.exportedAt
                                    ? ` · ${new Date(pendingBackup.inspection.exportedAt).toLocaleString()}`
                                    : ''}
                                {pendingBackup.inspection.version ? ` · version ${pendingBackup.inspection.version}` : ' · legacy backup'}
                            </small>
                        </div>
                        <p>
                            {pendingBackup.inspection.sections
                                .map(section => `${section.label}: ${section.count}`)
                                .join(' · ')}
                        </p>
                        {pendingBackup.inspection.errors.length > 0 && (
                            <p className="is-warning">
                                {pendingBackup.inspection.errors.length} section warning{pendingBackup.inspection.errors.length === 1 ? '' : 's'} will be handled during restore.
                            </p>
                        )}
                        <div className="settings-action-row">
                            <button
                                type="button"
                                onClick={() => void confirmDeviceBackupRestore()}
                                disabled={accountBusy === 'device-restore'}
                            >
                                {accountBusy === 'device-restore' ? <SpinnerGap size={17} className="animate-spin" /> : <UploadSimple size={17} />}
                                {accountBusy === 'device-restore' ? 'Restoring' : 'Confirm restore'}
                            </button>
                            <button type="button" onClick={() => setPendingBackup(null)} disabled={accountBusy === 'device-restore'}>
                                Cancel
                            </button>
                        </div>
                    </div>
                )}
            </section>

            <section className="settings-section" aria-labelledby="storage-heading">
                <div className="settings-section-heading">
                    <Database size={22} weight="duotone" />
                    <div>
                        <h2 id="storage-heading">Receipt storage</h2>
                        <p>Saved processing data on this device</p>
                    </div>
                </div>
                <div className="settings-metrics">
                    <div><strong>{historyCount}</strong><span>History</span></div>
                    <div><strong>{queueCount}</strong><span>Queued</span></div>
                    <div><strong>{cacheStats?.byService.receipt.count ?? 0}</strong><span>Cache</span></div>
                </div>
                <div className="settings-action-row">
                    <button type="button" onClick={() => void clearReceiptCache()}>Clear OCR cache</button>
                    <button
                        type="button"
                        className="is-destructive"
                        aria-pressed={receiptDeleteArmed}
                        onClick={() => void clearReceiptData()}
                    >
                        {receiptDeleteArmed ? 'Confirm delete' : 'Clear receipt data'}
                    </button>
                </div>
            </section>

            <section className="settings-section" aria-labelledby="privacy-heading">
                <div className="settings-section-heading">
                    <ShieldCheck size={22} weight="duotone" />
                    <div>
                        <h2 id="privacy-heading">Receipt privacy</h2>
                        <p>Choose what stays on this device</p>
                    </div>
                </div>
                <div className="settings-list">
                    <label>
                        <span><strong>Save receipt history</strong><small>Keep store and item summaries</small></span>
                        <input
                            type="checkbox"
                            checked={privacy.saveHistory}
                            onChange={event => updatePrivacy({ saveHistory: event.target.checked })}
                        />
                    </label>
                    <label>
                        <span><strong>Save receipt previews</strong><small>Keep the source image temporarily</small></span>
                        <input
                            type="checkbox"
                            checked={privacy.savePreviews}
                            onChange={event => updatePrivacy({ savePreviews: event.target.checked })}
                        />
                    </label>
                    <label className="settings-select-row">
                        <span><strong>Preview retention</strong><small>Delete previews automatically</small></span>
                        <select
                            value={privacy.previewRetentionDays}
                            onChange={event => updatePrivacy({ previewRetentionDays: Number(event.target.value) })}
                        >
                            <option value={0}>Never keep</option>
                            <option value={1}>1 day</option>
                            <option value={7}>7 days</option>
                            <option value={30}>30 days</option>
                        </select>
                    </label>
                </div>
                <button type="button" className="settings-command is-secondary" onClick={clearPreviews}>
                    <Trash size={18} />
                    Clear saved previews
                </button>
            </section>

            {auth?.configured && auth.user && auth.activeHousehold && (
                <section className="settings-section account-danger-section" aria-labelledby="delete-account-heading">
                    <div className="settings-section-heading">
                        <Warning size={22} weight="duotone" />
                        <div>
                            <h2 id="delete-account-heading">Delete account</h2>
                            <p>Permanently remove account and personal records</p>
                        </div>
                    </div>
                    <p className="settings-message">
                        Owner deletion is blocked while another member remains in the household.
                    </p>
                    <label className="account-setting-field">
                        <span>Confirm with your email</span>
                        <input
                            type="email"
                            value={deleteConfirmation}
                            onChange={event => setDeleteConfirmation(event.target.value)}
                            placeholder={auth.user.email ?? ''}
                        />
                    </label>
                    <button
                        type="button"
                        className="settings-command is-destructive"
                        disabled={accountBusy !== null || deleteConfirmation.trim().toLowerCase() !== auth.user.email?.toLowerCase()}
                        onClick={() => void removeAccount()}
                    >
                        <Trash size={18} />
                        {accountBusy === 'delete' ? 'Deleting account' : 'Delete account permanently'}
                    </button>
                </section>
            )}
        </div>
    );
}
