import { Bell, ClipboardText, House, Scan, UserCircle } from '@phosphor-icons/react';

export type TabType = 'inventory' | 'scan' | 'alerts' | 'shop' | 'profile' | 'stats' | 'recipes' | 'planner';

interface BottomNavProps {
    currentTab: TabType;
    onTabChange: (tab: TabType) => void;
    onFabClick?: () => void;
    onTabIntent?: (tab: TabType) => void;
    alertCount?: number;
}

export function BottomNav({ currentTab, onTabChange, onFabClick, onTabIntent, alertCount = 0 }: BottomNavProps) {
    const tabs = [
        { key: 'inventory' as const, label: 'Home', icon: House },
        { key: 'scan' as const, label: 'Scan', icon: Scan },
        { key: 'alerts' as const, label: 'Alerts', icon: Bell, showBadge: true },
        { key: 'shop' as const, label: 'List', icon: ClipboardText },
        { key: 'profile' as const, label: 'Profile', icon: UserCircle },
    ];

    return (
        <nav className="market-bottom-nav pb-safe" aria-label="Primary navigation">
            <div className="market-bottom-nav-inner">
                {tabs.map(({ key, label, icon: Icon, showBadge }) => {
                    const isActive = currentTab === key;
                    return (
                        <button
                            key={key}
                            type="button"
                            onClick={() => key === 'scan' && onFabClick ? onFabClick() : onTabChange(key)}
                            onFocus={() => onTabIntent?.(key)}
                            onPointerEnter={() => onTabIntent?.(key)}
                            className={`market-nav-item ${isActive ? 'is-active' : ''}`}
                            aria-current={isActive ? 'page' : undefined}
                        >
                            <span className="market-nav-icon">
                                <Icon size={23} weight={isActive ? 'fill' : 'regular'} />
                                {showBadge && alertCount > 0 && (
                                    <span className="market-nav-badge">{alertCount > 9 ? '9+' : alertCount}</span>
                                )}
                            </span>
                            <span>{label}</span>
                        </button>
                    );
                })}
            </div>
        </nav>
    );
}
