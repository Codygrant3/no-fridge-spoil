import { Suspense, lazy, useState, useCallback, useMemo, useEffect, useRef, type ReactNode } from 'react';
import { BottomNav } from './components/BottomNav';
import type { TabType } from './components/BottomNav';
import { InventoryProvider, useInventory } from './context/InventoryContext';
import { ThemeProvider } from './context/ThemeContext';
import { ProfileProvider } from './context/ProfileContext';
import { AuthProvider, useAuth } from './context/AuthContext';
import { SplashScreen } from './components/SplashScreen';
import { AccountAccess } from './components/AccountAccess';
import { SyncStatusBar } from './components/SyncStatusBar';
import { snoozeItemAlert } from './services/alertActionService';
import { startScheduler, stopScheduler } from './services/notificationScheduler';
import { cleanupExpiredCache } from './services/aiCacheService';
import { startCloudSync, stopCloudSync, syncNow } from './services/cloudSyncService';
import { resolveTabFromHash, routeTabs } from './utils/routing';
import { isWithinExpirationWindow } from './utils/dateUtils';

const loadInventory = () => import('./pages/Inventory');
const loadScan = () => import('./pages/Scan');
const loadRecipes = () => import('./pages/Recipes');
const loadStats = () => import('./pages/Stats');
const loadShoppingList = () => import('./pages/ShoppingList');
const loadAlerts = () => import('./pages/Alerts');
const loadMealPlanner = () => import('./pages/MealPlanner');
const loadProfile = () => import('./pages/Profile');

const Inventory = lazy(() => loadInventory().then(module => ({ default: module.Inventory })));
const Scan = lazy(() => loadScan().then(module => ({ default: module.Scan })));
const Recipes = lazy(() => loadRecipes().then(module => ({ default: module.Recipes })));
const Stats = lazy(() => loadStats().then(module => ({ default: module.Stats })));
const ShoppingList = lazy(() => loadShoppingList().then(module => ({ default: module.ShoppingList })));
const Alerts = lazy(() => loadAlerts().then(module => ({ default: module.Alerts })));
const MealPlanner = lazy(() => loadMealPlanner().then(module => ({ default: module.MealPlanner })));
const Profile = lazy(() => loadProfile().then(module => ({ default: module.Profile })));

const SPLASH_SESSION_KEY = 'no-fridge-spoil:splash-viewed:v2';

function shouldShowSplash(): boolean {
  if (typeof window === 'undefined') return true;
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return false;
  try {
    return window.sessionStorage.getItem(SPLASH_SESSION_KEY) !== 'true';
  } catch {
    return true;
  }
}

function preloadTab(tab: TabType): void {
  const loaders: Record<TabType, () => Promise<unknown>> = {
    inventory: loadInventory,
    scan: loadScan,
    alerts: loadAlerts,
    shop: loadShoppingList,
    profile: loadProfile,
    stats: loadStats,
    recipes: loadRecipes,
    planner: loadMealPlanner,
  };
  void loaders[tab]().catch(() => undefined);
}

function getTabFromHash(): TabType {
  return typeof window === 'undefined' ? 'inventory' : resolveTabFromHash(window.location.hash);
}

function normalizeUnknownHash(): void {
  const path = window.location.hash.replace(/^#\/?/, '').split('?')[0];
  if (path && !routeTabs.includes(path as TabType)) {
    window.history.replaceState(null, '', '#/');
  }
}

function PageLoadingFallback() {
  return (
    <div
      className="min-h-full flex items-center justify-center px-6 py-12"
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <div className="text-center">
        <div className="mx-auto mb-4 h-12 w-12 rounded-full border border-[var(--border-color)] bg-[var(--bg-secondary)] flex items-center justify-center">
          <div
            className="h-5 w-5 rounded-full border-2 border-[var(--accent-color)] border-t-transparent animate-spin"
            aria-hidden="true"
          />
        </div>
        <p className="text-[var(--text-primary)] text-sm font-bold">Loading market view</p>
        <p className="text-[var(--text-secondary)] text-xs mt-1">Preparing your freshness dashboard.</p>
      </div>
    </div>
  );
}

function AppContent() {
  const [currentTab, setCurrentTab] = useState<TabType>(() => getTabFromHash());
  const [showSplash, setShowSplash] = useState(shouldShowSplash);
  const [now, setNow] = useState(() => Date.now());
  const mainRef = useRef<HTMLElement>(null);
  const { items, consumeItem } = useInventory();

  const handleSplashComplete = useCallback(() => {
    try {
      window.sessionStorage.setItem(SPLASH_SESSION_KEY, 'true');
    } catch {
      // A blocked session store should not prevent entry into the app.
    }
    setShowSplash(false);
  }, []);

  const handleTabChange = useCallback((tab: TabType) => {
    setCurrentTab(tab);
    if (typeof window !== 'undefined') {
      const nextHash = tab === 'inventory' ? '#/' : `#/${tab}`;
      if (window.location.hash !== nextHash) {
        window.history.pushState(null, '', nextHash);
      }
    }
  }, []);

  // Start notification scheduler on mount
  useEffect(() => {
    void startScheduler().catch(error => console.warn('Notification scheduler unavailable:', error));
    cleanupExpiredCache().catch(error => console.warn('AI Cache cleanup skipped:', error));
    return () => stopScheduler();
  }, []);

  useEffect(() => {
    const refreshClock = () => setNow(Date.now());
    const interval = window.setInterval(refreshClock, 60_000);
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') refreshClock();
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, []);

  // Listen for SW messages (e.g., notification click → navigate to alerts)
  useEffect(() => {
    const handler = (event: MessageEvent) => {
      if (event.data?.type === 'NAVIGATE_TO' && event.data.tab) {
        handleTabChange(event.data.tab as TabType);
      } else if (event.data?.type === 'ALERT_ACTION' && typeof event.data.itemId === 'string') {
        if (event.data.action === 'use-first') void consumeItem(event.data.itemId);
        if (event.data.action === 'snooze-first') snoozeItemAlert(event.data.itemId, 24);
        handleTabChange('alerts');
      }
    };
    navigator.serviceWorker?.addEventListener('message', handler);
    return () => navigator.serviceWorker?.removeEventListener('message', handler);
  }, [consumeItem, handleTabChange]);

  useEffect(() => {
    const handleHashChange = () => {
      normalizeUnknownHash();
      setCurrentTab(getTabFromHash());
    };
    handleHashChange();
    window.addEventListener('hashchange', handleHashChange);
    window.addEventListener('popstate', handleHashChange);
    return () => {
      window.removeEventListener('hashchange', handleHashChange);
      window.removeEventListener('popstate', handleHashChange);
    };
  }, []);

  useEffect(() => {
    mainRef.current?.scrollTo({ top: 0, behavior: 'auto' });
  }, [currentTab]);

  const handleFabClick = () => {
    handleTabChange('scan');
  };

  // Calculate alert count (expiring within 3 days)
  const alertCount = useMemo(() => {
    const referenceDate = new Date(now);
    return items.filter(item => isWithinExpirationWindow(item.expirationDate, 3, referenceDate)).length;
  }, [items, now]);

  const renderPage = () => {
    switch (currentTab) {
      case 'inventory': return <Inventory onNavigate={handleTabChange} />;
      case 'scan': return <Scan onBack={() => handleTabChange('inventory')} />;
      case 'recipes': return <Recipes onBack={() => handleTabChange('inventory')} onNavigateToPlanner={() => handleTabChange('planner')} />;
      case 'shop': return <ShoppingList />;
      case 'stats': return <Stats onBack={() => handleTabChange('inventory')} />;
      case 'alerts': return <Alerts onNavigate={handleTabChange} />;
      case 'planner': return <MealPlanner onBack={() => handleTabChange('recipes')} />;
      case 'profile': return <Profile />;
      default: return <Inventory onNavigate={handleTabChange} />;
    }
  };

  return (
    <>
      {showSplash && <SplashScreen onComplete={handleSplashComplete} />}

      <div className="editorial-shell h-screen w-screen bg-[var(--bg-primary)] flex flex-col overflow-hidden relative">
        <main ref={mainRef} className="editorial-main flex-1 overflow-y-auto relative">
          <Suspense fallback={<PageLoadingFallback />}>
            {renderPage()}
          </Suspense>
        </main>

        <SyncStatusBar />

        <BottomNav
          currentTab={currentTab}
          onTabChange={handleTabChange}
          onFabClick={handleFabClick}
          onTabIntent={preloadTab}
          alertCount={alertCount}
        />
      </div>
    </>
  );
}

export function AccountGate({ children }: { children: ReactNode }) {
  const { configured, session, recoveryMode, activeHousehold } = useAuth();

  useEffect(() => {
    if (!configured || !session || !activeHousehold) {
      stopCloudSync();
      return;
    }

    startCloudSync();
    void syncNow();
    return () => stopCloudSync();
  }, [activeHousehold, configured, session]);

  if (recoveryMode) return <AccountAccess />;
  return children;
}

function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <AccountGate>
          <ProfileProvider>
            <InventoryProvider>
              <AppContent />
            </InventoryProvider>
          </ProfileProvider>
        </AccountGate>
      </AuthProvider>
    </ThemeProvider>
  );
}

export default App;
