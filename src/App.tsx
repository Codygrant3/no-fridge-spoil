import { useState, useCallback, useMemo, useEffect } from 'react';
import { BottomNav } from './components/BottomNav';
import type { TabType } from './components/BottomNav';
import { Inventory } from './pages/Inventory';
import { Scan } from './pages/Scan';
import { Recipes } from './pages/Recipes';
import { Stats } from './pages/Stats';
import { ShoppingList } from './pages/ShoppingList';
import { Alerts } from './pages/Alerts';
import { MealPlanner } from './pages/MealPlanner';
import { InventoryProvider, useInventory } from './context/InventoryContext';
import { ThemeProvider } from './context/ThemeContext';
import { ProfileProvider } from './context/ProfileContext';
import { SplashScreen } from './components/SplashScreen';
import { AnimatedBackground } from './components/AnimatedBackground';
import { startScheduler, stopScheduler } from './services/notificationScheduler';

function AppContent() {
  const [currentTab, setCurrentTab] = useState<TabType>('inventory');
  const [showSplash, setShowSplash] = useState(true);
  const { items } = useInventory();

  // Start notification scheduler on mount
  useEffect(() => {
    startScheduler();
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
    const now = Date.now();
    return items.filter(item => {
      const diff = new Date(item.expirationDate).getTime() - now;
      const days = Math.ceil(diff / (1000 * 60 * 60 * 24));
      return days >= 0 && days <= 3;
    }).length;
  }, [items]);

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
          {renderPage()}
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
