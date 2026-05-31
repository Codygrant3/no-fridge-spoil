import { Suspense, lazy, useState, useCallback, useMemo, useEffect } from 'react';
import { BottomNav } from './components/BottomNav';
import type { TabType } from './components/BottomNav';
import { InventoryProvider, useInventory } from './context/InventoryContext';
import { ThemeProvider } from './context/ThemeContext';
import { ProfileProvider } from './context/ProfileContext';
import { SplashScreen } from './components/SplashScreen';
import { AnimatedBackground } from './components/AnimatedBackground';
import { startScheduler, stopScheduler } from './services/notificationScheduler';
import { cleanupExpiredCache } from './services/aiCacheService';

const Inventory = lazy(() => import('./pages/Inventory').then(module => ({ default: module.Inventory })));
const Scan = lazy(() => import('./pages/Scan').then(module => ({ default: module.Scan })));
const Recipes = lazy(() => import('./pages/Recipes').then(module => ({ default: module.Recipes })));
const Stats = lazy(() => import('./pages/Stats').then(module => ({ default: module.Stats })));
const ShoppingList = lazy(() => import('./pages/ShoppingList').then(module => ({ default: module.ShoppingList })));
const Alerts = lazy(() => import('./pages/Alerts').then(module => ({ default: module.Alerts })));
const MealPlanner = lazy(() => import('./pages/MealPlanner').then(module => ({ default: module.MealPlanner })));

function PageLoadingFallback() {
  return (
    <div className="min-h-full flex items-center justify-center px-6 py-12">
      <div className="text-center">
        <div className="mx-auto mb-4 h-12 w-12 rounded-2xl border border-[var(--border-color)] bg-[var(--bg-secondary)] flex items-center justify-center shadow-[0_0_30px_rgba(16,185,129,0.18)]">
          <div className="h-5 w-5 rounded-full border-2 border-[var(--accent-color)] border-t-transparent animate-spin" />
        </div>
        <p className="text-white text-sm font-bold">Loading market view</p>
        <p className="text-[var(--text-secondary)] text-xs mt-1">Preparing your freshness dashboard.</p>
      </div>
    </div>
  );
}

function AppContent() {
  const [currentTab, setCurrentTab] = useState<TabType>('inventory');
  const [showSplash, setShowSplash] = useState(true);
  const [now] = useState(() => Date.now());
  const { items } = useInventory();

  // Start notification scheduler on mount
  useEffect(() => {
    startScheduler();
    cleanupExpiredCache().catch(error => console.warn('AI Cache cleanup skipped:', error));
    return () => stopScheduler();
  }, []);

  // Listen for SW messages (e.g., notification click → navigate to alerts)
  useEffect(() => {
    const handler = (event: MessageEvent) => {
      if (event.data?.type === 'NAVIGATE_TO' && event.data.tab) {
        setCurrentTab(event.data.tab as TabType);
      }
    };
    navigator.serviceWorker?.addEventListener('message', handler);
    return () => navigator.serviceWorker?.removeEventListener('message', handler);
  }, []);

  const handleSplashComplete = useCallback(() => {
    setShowSplash(false);
  }, []);

  const handleFabClick = () => {
    setCurrentTab('scan');
  };

  // Calculate alert count (expiring within 3 days)
  const alertCount = useMemo(() => {
    return items.filter(item => {
      const diff = new Date(item.expirationDate).getTime() - now;
      const days = Math.ceil(diff / (1000 * 60 * 60 * 24));
      return days >= 0 && days <= 3;
    }).length;
  }, [items, now]);

  const renderPage = () => {
    switch (currentTab) {
      case 'inventory': return <Inventory onNavigate={setCurrentTab} />;
      case 'scan': return <Scan />;
      case 'recipes': return <Recipes onNavigateToPlanner={() => setCurrentTab('planner')} />;
      case 'shop': return <ShoppingList />;
      case 'stats': return <Stats />;
      case 'alerts': return <Alerts />;
      case 'planner': return <MealPlanner onBack={() => setCurrentTab('recipes')} />;
      case 'profile': return <Stats />; // Placeholder - will create ProfilePage
      default: return <Inventory onNavigate={setCurrentTab} />;
    }
  };

  return (
    <>
      {showSplash && <SplashScreen onComplete={handleSplashComplete} />}

      <div className="h-screen w-screen bg-[var(--bg-primary)] flex flex-col overflow-hidden relative">
        {/* Animated Background */}
        <AnimatedBackground />

        {/* Main Content */}
        <main className="flex-1 overflow-y-auto relative z-10">
          <Suspense fallback={<PageLoadingFallback />}>
            {renderPage()}
          </Suspense>
        </main>

        <BottomNav
          currentTab={currentTab}
          onTabChange={setCurrentTab}
          onFabClick={handleFabClick}
          alertCount={alertCount}
        />
      </div>
    </>
  );
}

function App() {
  return (
    <ThemeProvider>
      <ProfileProvider>
        <InventoryProvider>
          <AppContent />
        </InventoryProvider>
      </ProfileProvider>
    </ThemeProvider>
  );
}

export default App;
