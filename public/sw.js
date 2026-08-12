const CACHE_NAME = 'no-fridge-spoil-v7';
const URLS_TO_CACHE = [
    '/',
    '/index.html',
    '/manifest.json'
];

const workerUrl = new URL(self.location.href);
const localHosts = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);
const isLocalDev = localHosts.has(self.location.hostname)
    && workerUrl.searchParams.get('production') !== '1';

self.addEventListener('install', (event) => {
    if (isLocalDev) {
        self.skipWaiting();
        return;
    }

    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => cache.addAll(URLS_TO_CACHE))
    );
});

self.addEventListener('message', (event) => {
    if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys()
            .then((cacheNames) => Promise.all(
                cacheNames
                    .filter((name) => name.startsWith('no-fridge-spoil-') && name !== CACHE_NAME)
                    .map((name) => caches.delete(name))
            ))
            .then(() => {
                if (isLocalDev) return self.registration.unregister();
                return undefined;
            })
            .then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', (event) => {
    if (isLocalDev) return;
    if (event.request.method !== 'GET') return;
    if (!event.request.url.startsWith(self.location.origin)) return;

    const requestUrl = new URL(event.request.url);
    if (requestUrl.pathname.startsWith('/api/')) return;

    event.respondWith(
        fetch(event.request)
            .then((response) => {
                if (response.ok) {
                    const clone = response.clone();
                    caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
                }
                return response;
            })
            .catch(() => caches.match(event.request).then((cached) => {
                if (cached) return cached;
                if (event.request.mode === 'navigate') {
                    return caches.match('/index.html');
                }
                return new Response('Offline', { status: 503 });
            }))
    );
});

self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    const action = event.notification.data?.action;
    const clickedAction = event.action;
    const itemId = event.notification.data?.itemIds?.[0];

    event.waitUntil(
        self.clients.matchAll({ type: 'window' }).then((clientList) => {
            for (const client of clientList) {
                if ('focus' in client) {
                    client.focus();
                    if (clickedAction && itemId) {
                        client.postMessage({ type: 'ALERT_ACTION', action: clickedAction, itemId });
                    } else if (action === 'navigate-alerts') {
                        client.postMessage({ type: 'NAVIGATE_TO', tab: 'alerts' });
                    }
                    return;
                }
            }

            if (self.clients.openWindow) return self.clients.openWindow('/#/alerts');
            return undefined;
        })
    );
});
