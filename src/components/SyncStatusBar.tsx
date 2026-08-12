import { useEffect, useRef, useState } from 'react';
import { CheckCircle2, Cloud, CloudOff, RefreshCw, WifiOff } from 'lucide-react';
import {
    getCloudSyncSnapshot,
    subscribeCloudSync,
    syncNow,
    type CloudSyncSnapshot,
} from '../services/cloudSyncService';
import {
    applyAppUpdate,
    subscribeAppRuntimeStatus,
    subscribeAppUpdate,
    type AppRuntimeStatus,
} from '../services/appUpdateService';

export function SyncStatusBar() {
    const [snapshot, setSnapshot] = useState<CloudSyncSnapshot>(() => getCloudSyncSnapshot());
    const [online, setOnline] = useState(() => typeof navigator === 'undefined' || navigator.onLine);
    const [updateAvailable, setUpdateAvailable] = useState(false);
    const [runtimeStatus, setRuntimeStatus] = useState<AppRuntimeStatus>(null);
    const [reconnected, setReconnected] = useState(false);
    const wasOffline = useRef(!online);

    useEffect(() => subscribeCloudSync(setSnapshot), []);
    useEffect(() => subscribeAppUpdate(setUpdateAvailable), []);
    useEffect(() => {
        let statusTimeout: number | undefined;
        const unsubscribe = subscribeAppRuntimeStatus(status => {
            setRuntimeStatus(status);
            if (statusTimeout) window.clearTimeout(statusTimeout);
            if (status === 'offline-ready') {
                statusTimeout = window.setTimeout(() => setRuntimeStatus(null), 4_000);
            }
        });
        return () => {
            if (statusTimeout) window.clearTimeout(statusTimeout);
            unsubscribe();
        };
    }, []);
    useEffect(() => {
        let reconnectTimeout: number | undefined;
        const markOnline = () => {
            setOnline(true);
            if (wasOffline.current) {
                setReconnected(true);
                reconnectTimeout = window.setTimeout(() => setReconnected(false), 3_500);
            }
            wasOffline.current = false;
        };
        const markOffline = () => {
            wasOffline.current = true;
            setReconnected(false);
            setOnline(false);
        };
        window.addEventListener('online', markOnline);
        window.addEventListener('offline', markOffline);
        return () => {
            if (reconnectTimeout) window.clearTimeout(reconnectTimeout);
            window.removeEventListener('online', markOnline);
            window.removeEventListener('offline', markOffline);
        };
    }, []);

    const offline = !online || snapshot.status === 'offline';
    const syncing = snapshot.status === 'syncing';
    const failed = snapshot.status === 'error';
    const pending = snapshot.pendingChanges > 0;
    if (!offline && !syncing && !failed && !pending && !updateAvailable && !runtimeStatus && !reconnected) return null;

    let label = 'Changes saved';
    let tone = 'info';
    let Icon = Cloud;
    if (updateAvailable) {
        label = 'A fresh version is ready';
        tone = 'update';
        Icon = RefreshCw;
    } else if (runtimeStatus === 'registration-failed') {
        label = 'Offline mode could not be prepared. Online features still work';
        tone = 'error';
        Icon = CloudOff;
    } else if (offline) {
        label = pending
            ? `Offline. ${snapshot.pendingChanges} change${snapshot.pendingChanges === 1 ? '' : 's'} saved on this device`
            : 'Offline. You can keep working';
        tone = 'offline';
        Icon = WifiOff;
    } else if (reconnected) {
        label = pending ? 'Back online. Syncing saved changes' : 'Back online';
        tone = 'success';
        Icon = CheckCircle2;
    } else if (runtimeStatus === 'offline-ready') {
        label = 'Offline mode is ready';
        tone = 'success';
        Icon = CheckCircle2;
    } else if (failed) {
        label = pending
            ? `${snapshot.pendingChanges} change${snapshot.pendingChanges === 1 ? '' : 's'} waiting to sync`
            : 'Cloud sync needs attention';
        tone = 'error';
        Icon = CloudOff;
    } else if (syncing) {
        label = pending ? `Syncing ${snapshot.pendingChanges} change${snapshot.pendingChanges === 1 ? '' : 's'}` : 'Syncing';
    } else if (pending) {
        label = `${snapshot.pendingChanges} change${snapshot.pendingChanges === 1 ? '' : 's'} waiting to sync`;
    }

    return (
        <div className={`market-sync-status is-${tone}`} role="status" aria-live="polite">
            <Icon className={syncing ? 'is-spinning' : ''} aria-hidden="true" />
            <span>{label}</span>
            {updateAvailable ? (
                <button type="button" onClick={applyAppUpdate}>Refresh</button>
            ) : failed && online ? (
                <button type="button" onClick={() => void syncNow()}>Retry</button>
            ) : null}
        </div>
    );
}
