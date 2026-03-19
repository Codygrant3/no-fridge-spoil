const CACHE_NAME = 'no-fridge-spoil-v2';
const URLS_TO_CACHE = [
    '/',
    '/index.html',
    '/manifest.json'
];

// Install — cache shell files
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => cache.addAll(URLS_TO_CACHE))
    );
    self.skipWaiting();
});

// Activate — clean old caches
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames
                    .filter((name) => name !== CACHE_NAME)
                    .map((name) => caches.delete(name))
            );
        })
    );
    self.clients.claim();
});

// Fetch — network-first with cache fallback for navigation
self.addEventListener('fetch', (event) => {
    // Skip non-GET and cross-origin requests
    if (event.request.method !== 'GET') return;
    if (!event.request.url.startsWith(self.location.origin)) return;

    // Skip API calls (Gemini, Google TTS)
    if (event.request.url.includes('generativelanguage.googleapis.com')) return;
    if (event.request.url.includes('texttospeech.googleapis.com')) return;

    event.respondWith(
        fetch(event.request)
            .then((response) => {
                // Clone and cache successful responses
                if (response.ok) {
                    const clone = response.clone();
                    caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
                }
                return response;
            })
            .catch(() => {
                // Fallback to cache when offline
                return caches.match(event.request).then((cached) => {
                    if (cached) return cached;
                    // For navigation requests, return the shell
                    if (event.request.mode === 'navigate') {
                        return caches.match('/index.html');
                    }
                    return new Response('Offline', { status: 503 });
                });
            })
    );
});

// Handle notification clicks — navigate to alerts tab
self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    const action = event.notification.data?.action;

    event.waitUntil(
        self.clients.matchAll({ type: 'window' }).then((clientList) => {
            // Focus existing window and send navigation message
            for (const client of clientList) {
                if ('focus' in client) {
                    client.focus();
                    if (action === 'navigate-alerts') {
                        client.postMessage({ type: 'NAVIGATE_TO', tab: 'alerts' });
                    }
                    return;
                }
            }
            // Open new window if none exist
            if (self.clients.openWindow) return self.clients.openWindow('/');
        })
    );
});
