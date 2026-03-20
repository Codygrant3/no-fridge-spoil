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
            {/* FAB — Floating Action Button */}
            <button
                onClick={onFabClick}
                className="fixed bottom-24 right-5 w-14 h-14 rounded-full flex items-center justify-center z-50 transition-all duration-300 active:scale-90"
                style={{
                    background: 'linear-gradient(135deg, #34d399 0%, #10b981 50%, #059669 100%)',
                    boxShadow: '0 4px 20px rgba(52, 211, 153, 0.3), 0 0 40px rgba(52, 211, 153, 0.1), inset 0 1px 0 rgba(255, 255, 255, 0.2)',
                }}
                aria-label="Quick scan"
            >
                <Plus className="w-6 h-6 text-white" strokeWidth={2.5} />
            </button>

            {/* Bottom Navigation — Frosted Glass Pill */}
            <nav className="fixed bottom-0 left-0 right-0 flex justify-center pb-safe z-50 px-4 pb-2">
                <div
                    className="flex items-center justify-around w-full max-w-md h-16 rounded-[20px] px-1"
                    style={{
                        background: 'rgba(2, 26, 19, 0.75)',
                        backdropFilter: 'blur(40px) saturate(180%)',
                        WebkitBackdropFilter: 'blur(40px) saturate(180%)',
                        border: '1px solid rgba(52, 211, 153, 0.08)',
                        boxShadow: '0 -2px 20px rgba(0, 0, 0, 0.15), inset 0 1px 0 rgba(167, 243, 208, 0.04)',
                    }}
                >
                    {tabs.map(({ key, label, icon: Icon, showBadge }) => {
                        const isActive = currentTab === key;
                        return (
                            <button
                                key={key}
                                onClick={() => onTabChange(key)}
                                className={`relative flex flex-col items-center justify-center w-16 h-12 rounded-3xl transition-all duration-300 ${
                                    isActive
                                        ? 'text-[var(--accent-color)]'
                                        : 'text-[var(--text-muted)] active:text-[var(--text-secondary)]'
                                }`}
                                style={isActive ? {
                                    background: 'rgba(52, 211, 153, 0.1)',
                                    boxShadow: 'inset 0 1px 0 rgba(52, 211, 153, 0.08)',
                                } : undefined}
                            >
                                {/* Active indicator line */}
                                {isActive && (
                                    <div
                                        className="absolute -top-0.5 w-6 h-[2px] rounded-full"
                                        style={{
                                            background: 'linear-gradient(90deg, transparent, var(--accent-color), transparent)',
                                        }}
                                    />
                                )}

                                {/* Icon */}
                                <div className="relative">
                                    <Icon
                                        className={`w-[22px] h-[22px] transition-all duration-300 ${
                                            isActive ? 'scale-105' : ''
                                        }`}
                                        strokeWidth={isActive ? 2.2 : 1.8}
                                    />
                                    {showBadge && alertCount > 0 && (
                                        <span
                                            className="absolute -top-1.5 -right-2 min-w-[16px] h-[16px] flex items-center justify-center rounded-full text-[9px] font-bold text-white px-1"
                                            style={{
                                                background: 'linear-gradient(135deg, #f87171, #ef4444)',
                                                boxShadow: '0 2px 6px rgba(248, 113, 113, 0.4)',
                                            }}
                                        >
                                            {alertCount > 9 ? '9+' : alertCount}
                                        </span>
                                    )}
                                </div>

                                {/* Label */}
                                <span
                                    className={`text-[10px] mt-0.5 font-medium tracking-wide transition-all duration-300 ${
                                        isActive ? 'opacity-100' : 'opacity-50'
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
