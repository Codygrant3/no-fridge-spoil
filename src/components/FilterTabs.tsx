import type { FilterType } from '../types';

interface FilterTabsProps {
    activeFilter: FilterType;
    onFilterChange: (filter: FilterType) => void;
    counts: { all: number; expiring_soon: number; expired: number; good: number };
}

export function FilterTabs({ activeFilter, onFilterChange, counts }: FilterTabsProps) {
    const tabs: { key: FilterType; label: string; color: string }[] = [
        { key: 'all', label: 'All', color: 'bg-gray-500' },
        { key: 'expiring_soon', label: 'Expiring', color: 'bg-yellow-500' },
        { key: 'expired', label: 'Expired', color: 'bg-red-500' },
        { key: 'good', label: 'Fresh', color: 'bg-green-500' },
    ];

    return (
        <div className="flex gap-2 overflow-x-auto pb-2 -mx-4 px-4">
            {tabs.map((tab) => {
                const count = counts[tab.key];
                const isActive = activeFilter === tab.key;
                return (
                    <button
                        key={tab.key}
                        onClick={() => onFilterChange(tab.key)}
                        className={`px-3 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-all flex items-center gap-1.5
              ${isActive
                                ? 'bg-[var(--accent-color)] text-white'
                                : 'bg-[var(--bg-tertiary)] text-[var(--text-secondary)] hover:bg-[var(--border-color)]'
                            }`}
                    >
                        {tab.label}
                        {count > 0 && (
                            <span className={`px-1.5 py-0.5 text-xs rounded-full ${isActive ? 'bg-white/20' : tab.color + ' text-white'}`}>
                                {count}
                            </span>
                        )}
                    </button>
                );
            })}
        </div>
    );
}
