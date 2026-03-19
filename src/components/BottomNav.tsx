import { Home, ScanLine, Bell, ShoppingBag, User, Plus } from 'lucide-react';

export type TabType = 'inventory' | 'scan' | 'alerts' | 'shop' | 'profile' | 'stats' | 'recipes' | 'planner';

interface BottomNavProps {
    currentTab: TabType;
    onTabChange: (tab: TabType) => void;
    onFabClick?: () => void;
    alertCount?: number;
}

export function BottomNav({ currentTab, onTabChange, onFabClick, alertCount = 0 }: BottomNavProps) {
    const tabs: { key: TabType; label: string; icon: typeof Home; showBadge?: boolean }[] = [
        { key: 'inventory', label: 'Home', icon: Home },
        { key: 'scan', label: 'Scan', icon: ScanLine },
        { key: 'alerts', label: 'Alerts', icon: Bell, showBadge: true },
        { key: 'shop', label: 'List', icon: ShoppingBag },
        { key: 'profile', label: 'Profile', icon: User },
    ];

    return (
        <>
            {/* FAB Button - Floating Action Button */}
            <button
                onClick={onFabClick}
                className="fixed bottom-24 right-4 w-14 h-14 rounded-full flex items-center justify-center z-50 transition-all duration-200 ease-spring hover:scale-105 active:scale-95"
                style={{
                    background: 'linear-gradient(135deg, #4ade80 0%, #22c55e 100%)',
                    boxShadow: '0 4px 20px rgba(74, 222, 128, 0.4), 0 0 40px rgba(74, 222, 128, 0.2)',
                }}
                aria-label="Quick add"
            >
                <Plus className="w-7 h-7 text-white" strokeWidth={2.5} />
            </button>

            {/* Bottom Navigation - Glass Pill Design */}
            <nav className="fixed bottom-0 left-0 right-0 flex justify-center pb-safe z-50 px-4 pb-2">
                <div
                    className="flex items-center justify-around w-full max-w-md h-16 rounded-2xl px-2"
                    style={{
                        background: 'rgba(10, 14, 26, 0.85)',
                        backdropFilter: 'blur(16px)',
                        WebkitBackdropFilter: 'blur(16px)',
                        border: '1px solid rgba(255, 255, 255, 0.08)',
                        boxShadow: '0 -4px 24px rgba(0, 0, 0, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.05)',
                    }}
                >
                    {tabs.map(({ key, label, icon: Icon, showBadge }) => {
                        const isActive = currentTab === key;
                        return (
                            <button
                                key={key}
                                onClick={() => onTabChange(key)}
                                className={`relative flex flex-col items-center justify-center w-16 h-14 rounded-xl transition-all duration-200 ${
                                    isActive
                                        ? 'text-[var(--accent-color)]'
                                        : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
                                }`}
                                style={isActive ? {
                                    background: 'rgba(74, 222, 128, 0.1)',
                                } : undefined}
                            >
                                {/* Active indicator dot */}
                                {isActive && (
                                    <div
                                        className="absolute -top-1 w-1 h-1 rounded-full bg-[var(--accent-color)]"
                                        style={{
                                            boxShadow: '0 0 8px rgba(74, 222, 128, 0.6)',
                                        }}
                                    />
                                )}

                                {/* Icon with badge */}
                                <div className="relative">
                                    <Icon
                                        className={`w-5 h-5 transition-transform duration-200 ${
                                            isActive ? 'scale-110' : ''
                                        }`}
                                        strokeWidth={isActive ? 2.5 : 2}
                                    />
                                    {showBadge && alertCount > 0 && (
                                        <span
                                            className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] flex items-center justify-center rounded-full text-[10px] font-bold text-white px-1"
                                            style={{
                                                background: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
                                                boxShadow: '0 2px 8px rgba(239, 68, 68, 0.4)',
                                            }}
                                        >
                                            {alertCount > 9 ? '9+' : alertCount}
                                        </span>
                                    )}
                                </div>

                                {/* Label */}
                                <span
                                    className={`text-[10px] mt-1 font-medium tracking-wide transition-opacity duration-200 ${
                                        isActive ? 'opacity-100' : 'opacity-70'
                                    }`}
                                >
                                    {label}
                                </span>
                            </button>
                        );
                    })}
                </div>
            </nav>
        </>
    );
}
