import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { ErrorBoundary } from './components/ErrorBoundary'
import '@fontsource/dm-sans/400.css'
import '@fontsource/dm-sans/500.css'
import '@fontsource/dm-sans/600.css'
import '@fontsource/dm-sans/700.css'
import '@fontsource/cormorant-garamond/600.css'
import '@fontsource/cormorant-garamond/700.css'
import './index.css'
import App from './App.tsx'
import { notifyAppRuntimeStatus, notifyAppUpdate } from './services/appUpdateService'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
)
if ('serviceWorker' in navigator && import.meta.env.DEV) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.getRegistrations().then((registrations) => {
      registrations.forEach((registration) => {
        registration.unregister();
      });
    });

    if ('caches' in window) {
      caches.keys().then((cacheNames) => {
        cacheNames
          .filter((name) => name.startsWith('no-fridge-spoil-'))
          .forEach((name) => {
            caches.delete(name);
          });
      });
    }

  });
}

// Register Service Worker in production only.
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js?production=1').then(
      (registration) => {
        console.log('ServiceWorker registration successful with scope: ', registration.scope);
        void navigator.serviceWorker.ready.then(() => notifyAppRuntimeStatus('offline-ready'));
        if (registration.waiting && navigator.serviceWorker.controller) {
          notifyAppUpdate(registration.waiting);
        }
        registration.addEventListener('updatefound', () => {
          const installing = registration.installing;
          installing?.addEventListener('statechange', () => {
            if (installing.state === 'installed' && navigator.serviceWorker.controller) {
              notifyAppUpdate(installing);
            }
          });
        });
      },
      (err) => {
        console.log('ServiceWorker registration failed: ', err);
        notifyAppRuntimeStatus('registration-failed');
      }
    );
  });

  let refreshing = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (refreshing) return;
    refreshing = true;
    window.location.reload();
  });
}
