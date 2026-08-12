type UpdateListener = (available: boolean) => void;
export type AppRuntimeStatus = 'offline-ready' | 'registration-failed' | null;
type RuntimeStatusListener = (status: AppRuntimeStatus) => void;

const listeners = new Set<UpdateListener>();
const runtimeListeners = new Set<RuntimeStatusListener>();
let waitingWorker: ServiceWorker | null = null;
let runtimeStatus: AppRuntimeStatus = null;

export function notifyAppUpdate(worker: ServiceWorker): void {
    waitingWorker = worker;
    listeners.forEach(listener => listener(true));
}

export function subscribeAppUpdate(listener: UpdateListener): () => void {
    listeners.add(listener);
    listener(Boolean(waitingWorker));
    return () => listeners.delete(listener);
}

export function notifyAppRuntimeStatus(status: AppRuntimeStatus): void {
    runtimeStatus = status;
    runtimeListeners.forEach(listener => listener(status));
}

export function subscribeAppRuntimeStatus(listener: RuntimeStatusListener): () => void {
    runtimeListeners.add(listener);
    listener(runtimeStatus);
    return () => runtimeListeners.delete(listener);
}

export function applyAppUpdate(): void {
    if (!waitingWorker) {
        window.location.reload();
        return;
    }
    waitingWorker.postMessage({ type: 'SKIP_WAITING' });
}
