import { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { useInventory } from '../context/InventoryContext';
import { Search, SlidersHorizontal, AlertTriangle, Check, Trash2, Calendar, ChevronRight, Clock, Sparkles } from 'lucide-react';
import type { TabType } from '../components/BottomNav';
import { getShelfLifeDescription } from '../services/shelfLifeService';
import { EatThisTonightWidget } from '../components/EatThisTonightWidget';
import type { Recipe } from '../services/recipeService';
import { CookMode } from '../components/CookMode';
import { ProfileSwitcher } from '../components/ProfileSwitcher';

interface InventoryProps {
    onNavigate?: (tab: TabType) => void;
}

// Calculate freshness percentage (100% = just added, 0% = expired)
function calculateFreshness(addedAt: string, expirationDate: string): number {
    const added = new Date(addedAt).getTime();
    const expires = new Date(expirationDate).getTime();
    const now = Date.now();

    if (now >= expires) return 0;
    if (now <= added) return 100;

    const totalDuration = expires - added;
    const elapsed = now - added;
    return Math.round(100 - (elapsed / totalDuration) * 100);
}

// Get freshness color class based on percentage
function getFreshnessClass(percentage: number): string {
    if (percentage <= 10) return 'freshness-critical';
    if (percentage <= 30) return 'freshness-warning';
    if (percentage <= 60) return 'freshness-good';
    return 'freshness-fresh';
}

// Get days until expiration
function getDaysUntil(dateStr: string, currentTime: number): { text: string; days: number } {
    const diff = new Date(dateStr).getTime() - currentTime;
    const days = Math.ceil(diff / (1000 * 60 * 60 * 24));
    if (days < 0) return { text: 'Expired', days };
    if (days === 0) return { text: 'Today', days: 0 };
    if (days === 1) return { text: '1 day', days: 1 };
    return { text: `${days} days`, days };
}

// Custom hook for debounced value
function useDebouncedValue<T>(value: T, delay: number): T {
    const [debouncedValue, setDebouncedValue] = useState(value);

    useEffect(() => {
        const timer = setTimeout(() => {
            setDebouncedValue(value);
        }, delay);

        return () => {
            clearTimeout(timer);
        };
    }, [value, delay]);

    return debouncedValue;
}

// Get current timestamp
function getCurrentTime(): number {
    return Date.now();
}

// Food emoji mapping
const foodEmojis: Record<string, string> = {
    milk: '🥛', yogurt: '🥛', cheese: '🧀', butter: '🧈', cream: '🥛',
    egg: '🥚', eggs: '🥚',
    bread: '🍞', toast: '🍞',
    apple: '🍎', banana: '🍌', orange: '🍊', lemon: '🍋', grape: '🍇',
    strawberry: '🍓', blueberry: '🫐', avocado: '🥑',
    carrot: '🥕', broccoli: '🥦', lettuce: '🥬', spinach: '🥬', salad: '🥗',
    tomato: '🍅', potato: '🥔', onion: '🧅', garlic: '🧄', corn: '🌽',
    chicken: '🍗', beef: '🥩', meat: '🥩', fish: '🐟', salmon: '🐟', shrimp: '🦐',
    default: '🍽️'
};

function getFoodEmoji(name: string): string {
    const lower = name.toLowerCase();
    for (const [key, emoji] of Object.entries(foodEmojis)) {
        if (lower.includes(key)) return emoji;
    }
    return foodEmojis.default;
}

export function Inventory({ onNavigate }: InventoryProps) {
    const { items, removeItem, consumeItem, updateItem } = useInventory();
    const [search, setSearch] = useState('');
    const [showFilters, setShowFilters] = useState(false);
    const [selectedRecipe, setSelectedRecipe] = useState<Recipe | null>(null);
    const [onboardingStep, setOnboardingStep] = useState(0);
    const startXRef = useRef(0);

    const [currentTime, setCurrentTime] = useState(getCurrentTime);

    useEffect(() => {
        const interval = setInterval(() => {
            setCurrentTime(getCurrentTime());
        }, 60000);
        return () => clearInterval(interval);
    }, []);

    const debouncedSearch = useDebouncedValue(search, 300);

    // Calculate stats
    const stats = useMemo(() => {
        const total = items.length;
        const urgent = items.filter(i => i.status === 'expired' ||
            (i.status === 'expiring_soon' && getDaysUntil(i.expirationDate, currentTime).days <= 1)).length;
        const soon = items.filter(i => i.status === 'expiring_soon' && getDaysUntil(i.expirationDate, currentTime).days > 1).length;
        const good = items.filter(i => i.status === 'good').length;

        // Calculate overall freshness score
        const totalFreshness = items.reduce((sum, item) =>
            sum + calculateFreshness(item.addedAt, item.expirationDate), 0);
        const freshnessScore = total > 0 ? Math.round(totalFreshness / total) : 100;

        return { total, urgent, soon, good, freshnessScore };
    }, [items, currentTime]);

    // Filtered and categorized items
    const categorizedItems = useMemo(() => {
        let result = items;
        if (debouncedSearch.trim()) {
            const q = debouncedSearch.toLowerCase();
            result = result.filter(item =>
                item.name.toLowerCase().includes(q) ||
                item.brand?.toLowerCase().includes(q)
            );
        }

        // Sort by expiration date
        result = [...result].sort((a, b) =>
            new Date(a.expirationDate).getTime() - new Date(b.expirationDate).getTime()
        );

        // Categorize by urgency
        const critical = result.filter(i =>
            i.status === 'expired' || getDaysUntil(i.expirationDate, currentTime).days <= 1);
        const thisWeek = result.filter(i => {
            const days = getDaysUntil(i.expirationDate, currentTime).days;
            return days > 1 && days <= 7 && i.status !== 'expired';
        });
        const allGood = result.filter(i => {
            const days = getDaysUntil(i.expirationDate, currentTime).days;
            return days > 7;
        });

        return { critical, thisWeek, allGood };
    }, [items, debouncedSearch, currentTime]);

    // Touch handlers for future swipe-to-action feature
    const handleTouchStart = (_id: string, e: React.TouchEvent) => {
        startXRef.current = e.touches[0].clientX;
    };

    const handleTouchEnd = (_id: string, _e: React.TouchEvent) => {
        // TODO: Implement swipe-to-reveal actions (delete, consume, etc.)
    };

    const markAsOpened = useCallback(async (id: string) => {
        const today = new Date().toISOString().split('T')[0];
        await updateItem(id, { openedDate: today });
    }, [updateItem]);

    const handleCookNow = useCallback((recipe: Recipe) => {
        setSelectedRecipe(recipe);
    }, []);

    // Auto-cycle onboarding
    useEffect(() => {
        if (items.length === 0) {
            const interval = setInterval(() => {
                setOnboardingStep((prev) => (prev + 1) % 3);
            }, 4000);
            return () => clearInterval(interval);
        }
    }, [items.length]);

    if (selectedRecipe) {
        return (
            <CookMode
                recipe={selectedRecipe}
                items={items}
                onClose={() => setSelectedRecipe(null)}
            />
        );
    }

    // Render item card
    const renderItemCard = (item: typeof items[0], index: number, variant: 'critical' | 'warning' | 'good') => {
        const freshness = calculateFreshness(item.addedAt, item.expirationDate);
        const { text: daysText, days } = getDaysUntil(item.expirationDate, currentTime);
        const emoji = getFoodEmoji(item.name);

        const cardClass = variant === 'critical'
            ? 'card-urgent glow-red'
            : variant === 'warning'
                ? 'card-warning'
                : 'card-fresh';

        return (
            <div
                key={item.id}
                className={`animate-reveal delay-${Math.min(index, 8)} inventory-card glass-card-elevated rounded-2xl overflow-hidden ${cardClass}`}
                style={{ '--index': index } as React.CSSProperties}
                onTouchStart={(e) => handleTouchStart(item.id, e)}
                onTouchEnd={(e) => handleTouchEnd(item.id, e)}
            >
                <div className="p-4 flex gap-4">
                    {/* Food emoji icon */}
                    <div className={`w-16 h-16 rounded-xl flex items-center justify-center text-3xl ${
                        variant === 'critical'
                            ? 'bg-red-500/20'
                            : variant === 'warning'
                                ? 'bg-amber-500/20'
                                : 'bg-green-500/20'
                    }`}>
                        {emoji}
                    </div>

                    {/* Item details */}
                    <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                                <h3 className="font-semibold text-lg text-[var(--text-primary)] truncate">
                                    {item.name}
                                </h3>
                                <p className="text-sm text-[var(--text-secondary)] truncate">
                                    {item.brand || item.storageLocation}
                                    {item.quantity > 1 && ` • ${item.quantity} units`}
                                </p>
                            </div>
                            {variant === 'critical' && (
                                <AlertTriangle className="w-5 h-5 text-red-400 flex-shrink-0" />
                            )}
                        </div>

                        {/* Freshness bar */}
                        <div className="mt-3">
                            <div className="flex items-center justify-between text-xs mb-1.5">
                                <span className="text-[var(--text-muted)] uppercase tracking-wide font-medium">
                                    {days <= 0 ? 'Expired' : `Expires in ${daysText}`}
                                </span>
                                <span className={`font-mono font-semibold ${
                                    freshness <= 20 ? 'text-red-400' :
                                    freshness <= 40 ? 'text-amber-400' : 'text-green-400'
                                }`}>
                                    {freshness}%
                                </span>
                            </div>
                            <div className="freshness-bar freshness-bar-animated">
                                <div
                                    className={`freshness-bar-fill ${getFreshnessClass(freshness)}`}
                                    style={{ '--bar-width': `${freshness}%` } as React.CSSProperties}
                                />
                            </div>
                        </div>
                    </div>
                </div>

                {/* Action buttons */}
                <div className="flex border-t border-[var(--border-color)]/50">
                    {!item.openedDate && getShelfLifeDescription(item.name) && (
                        <>
                            <button
                                onClick={() => markAsOpened(item.id)}
                                className="flex-1 flex items-center justify-center gap-2 py-3 text-blue-400 hover:bg-blue-400/10 transition-colors text-sm font-medium"
                            >
                                <Calendar className="w-4 h-4" />
                                Opened
                            </button>
                            <div className="w-px bg-[var(--border-color)]/50" />
                        </>
                    )}
                    {item.openedDate && (
                        <>
                            <div className="flex-1 flex items-center justify-center py-3 text-[var(--text-muted)] text-xs">
                                <Clock className="w-3 h-3 mr-1" />
                                {new Date(item.openedDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                            </div>
                            <div className="w-px bg-[var(--border-color)]/50" />
                        </>
                    )}
                    <button
                        onClick={() => consumeItem(item.id)}
                        className="flex-1 flex items-center justify-center gap-2 py-3 text-green-400 hover:bg-green-400/10 transition-colors text-sm font-medium"
                    >
                        <Check className="w-4 h-4" />
                        Used
                    </button>
                    <div className="w-px bg-[var(--border-color)]/50" />
                    <button
                        onClick={() => removeItem(item.id)}
                        className="flex-1 flex items-center justify-center gap-2 py-3 text-[var(--text-muted)] hover:bg-red-400/10 hover:text-red-400 transition-colors text-sm font-medium"
                    >
                        <Trash2 className="w-4 h-4" />
                        Toss
                    </button>
                </div>
            </div>
        );
    };

    // Compact item for "All Good" section
    const renderCompactItem = (item: typeof items[0], index: number) => {
        const freshness = calculateFreshness(item.addedAt, item.expirationDate);
        const { text: daysText } = getDaysUntil(item.expirationDate, currentTime);
        const emoji = getFoodEmoji(item.name);

        return (
            <div
                key={item.id}
                className={`animate-reveal delay-${Math.min(index, 8)} glass-card rounded-xl p-3 flex items-center gap-3`}
                onTouchStart={(e) => handleTouchStart(item.id, e)}
                onTouchEnd={(e) => handleTouchEnd(item.id, e)}
            >
                <div className="w-10 h-10 rounded-lg bg-green-500/10 flex items-center justify-center text-xl">
                    {emoji}
                </div>
                <div className="flex-1 min-w-0">
                    <h4 className="font-medium text-[var(--text-primary)] truncate">{item.name}</h4>
                    <p className="text-xs text-[var(--text-muted)]">{daysText}</p>
                </div>
                <div className="w-12 h-1.5 bg-[var(--bg-tertiary)] rounded-full overflow-hidden">
                    <div
                        className={`h-full rounded-full ${getFreshnessClass(freshness)}`}
                        style={{ width: `${freshness}%` }}
                    />
                </div>
            </div>
        );
    };

    return (
        <div className="min-h-full bg-[var(--bg-primary)] text-[var(--text-primary)] pb-32">
            {/* Header */}
            <header className="p-4 flex items-center justify-between">
                <ProfileSwitcher />
                <h1 className="font-display text-xl font-semibold tracking-tight">No Fridge Spoil</h1>
                <div className="flex items-center gap-1">
                    <button
                        onClick={() => setShowFilters(!showFilters)}
                        className="p-2 hover:bg-white/5 rounded-xl transition-colors"
                    >
                        <Search className="w-5 h-5 text-[var(--text-muted)]" />
                    </button>
                    <button
                        onClick={() => setShowFilters(!showFilters)}
                        className="p-2 hover:bg-white/5 rounded-xl transition-colors"
                    >
                        <SlidersHorizontal className="w-5 h-5 text-[var(--text-muted)]" />
                    </button>
                </div>
            </header>

            {/* Search Bar */}
            {showFilters && (
                <div className="px-4 pb-4 animate-fade-in">
                    <input
                        type="text"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Search items..."
                        className="w-full px-4 py-3 glass-card rounded-xl text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-color)]/50"
                    />
                </div>
            )}

            {/* Stats Dashboard */}
            <div className="px-4 mb-6">
                <div className="glass-card-elevated rounded-2xl p-5 animate-reveal">
                    {/* Freshness Score */}
                    <div className="flex items-center justify-between mb-4">
                        <div>
                            <p className="text-sm text-[var(--text-muted)] mb-1">Overall Freshness</p>
                            <div className="flex items-baseline gap-2">
                                <span className="font-display text-4xl font-bold text-[var(--text-primary)]">
                                    {stats.total}
                                </span>
                                <span className="text-[var(--text-secondary)]">items</span>
                            </div>
                        </div>
                        <div className="text-right">
                            <div className={`font-mono text-3xl font-bold ${
                                stats.freshnessScore >= 70 ? 'text-green-400' :
                                stats.freshnessScore >= 40 ? 'text-amber-400' : 'text-red-400'
                            }`}>
                                {stats.freshnessScore}%
                            </div>
                            <p className="text-xs text-[var(--text-muted)]">freshness score</p>
                        </div>
                    </div>

                    {/* Mini stats row */}
                    <div className="grid grid-cols-3 gap-3">
                        <div className="text-center p-2 rounded-lg bg-red-500/10">
                            <p className="font-mono text-xl font-bold text-red-400">{stats.urgent}</p>
                            <p className="text-[10px] text-[var(--text-muted)] uppercase tracking-wide">Urgent</p>
                        </div>
                        <div className="text-center p-2 rounded-lg bg-amber-500/10">
                            <p className="font-mono text-xl font-bold text-amber-400">{stats.soon}</p>
                            <p className="text-[10px] text-[var(--text-muted)] uppercase tracking-wide">This Week</p>
                        </div>
                        <div className="text-center p-2 rounded-lg bg-green-500/10">
                            <p className="font-mono text-xl font-bold text-green-400">{stats.good}</p>
                            <p className="text-[10px] text-[var(--text-muted)] uppercase tracking-wide">Fresh</p>
                        </div>
                    </div>
                </div>
            </div>

            {/* EAT THIS TONIGHT WIDGET */}
            {categorizedItems.critical.length > 0 && (
                <div className="px-4 mb-6 animate-reveal delay-1">
                    <EatThisTonightWidget
                        expiringItems={categorizedItems.critical.slice(0, 3)}
                        onCookNow={handleCookNow}
                    />
                </div>
            )}

            {/* CRITICAL ZONE - Use Today */}
            {categorizedItems.critical.length > 0 && (
                <section className="mb-6 animate-reveal delay-2">
                    <div className="flex items-center gap-2 px-4 mb-3">
                        <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                        <h2 className="font-display text-lg font-semibold text-red-400">Use Today</h2>
                        <span className="status-badge status-urgent ml-auto">{categorizedItems.critical.length}</span>
                    </div>
                    <div className="px-4 space-y-3">
                        {categorizedItems.critical.map((item, i) => renderItemCard(item, i, 'critical'))}
                    </div>
                </section>
            )}

            {/* WARNING ZONE - This Week */}
            {categorizedItems.thisWeek.length > 0 && (
                <section className="mb-6 animate-reveal delay-3">
                    <div className="flex items-center gap-2 px-4 mb-3">
                        <div className="w-2 h-2 rounded-full bg-amber-500" />
                        <h2 className="font-display text-lg font-semibold text-amber-400">This Week</h2>
                        <span className="status-badge status-warning ml-auto">{categorizedItems.thisWeek.length}</span>
                    </div>
                    <div className="px-4 space-y-3">
                        {categorizedItems.thisWeek.map((item, i) => renderItemCard(item, i, 'warning'))}
                    </div>
                </section>
            )}

            {/* GOOD ZONE - All Fresh */}
            {categorizedItems.allGood.length > 0 && (
                <section className="animate-reveal delay-4">
                    <div className="flex items-center gap-2 px-4 mb-3">
                        <div className="w-2 h-2 rounded-full bg-green-500" />
                        <h2 className="font-display text-lg font-semibold text-green-400">All Fresh</h2>
                        <span className="status-badge status-fresh ml-auto">{categorizedItems.allGood.length}</span>
                    </div>
                    <div className="px-4 space-y-2">
                        {categorizedItems.allGood.map((item, i) => renderCompactItem(item, i))}
                    </div>
                </section>
            )}

            {/* Empty State - Onboarding */}
            {items.length === 0 && (
                <div className="flex flex-col items-center justify-center py-8 px-6 text-center min-h-[60vh]">
                    {/* Step Illustrations */}
                    <div className="relative w-full max-w-sm mb-8 h-[380px]">
                        {[0, 1, 2].map((step) => (
                            <div
                                key={step}
                                className={`absolute inset-0 transition-all duration-500 ${
                                    onboardingStep === step
                                        ? 'opacity-100 scale-100'
                                        : 'opacity-0 scale-95 pointer-events-none'
                                }`}
                            >
                                <div className={`w-full h-full rounded-3xl overflow-hidden glass-card-elevated ${
                                    step === 2 ? 'glow-green' : ''
                                }`}>
                                    <img
                                        src={`/onboarding-step${step + 1}.jpg`}
                                        alt={`Step ${step + 1}`}
                                        className="w-full h-full object-cover"
                                        onError={(e) => {
                                            e.currentTarget.style.display = 'none';
                                        }}
                                    />
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* Step Title & Description */}
                    <div className="mb-6 min-h-[100px] flex flex-col justify-center">
                        <h3 className="font-display text-2xl font-bold mb-2 text-[var(--text-primary)]">
                            {onboardingStep === 0 && 'Mindful Selection'}
                            {onboardingStep === 1 && 'The Ticking Clock'}
                            {onboardingStep === 2 && 'The Rescue Scan'}
                        </h3>
                        <p className="text-[var(--text-secondary)]">
                            {onboardingStep === 0 && 'Buy what you need, waste nothing.'}
                            {onboardingStep === 1 && 'The freshness clock starts ticking.'}
                            {onboardingStep === 2 && 'Scan to track and never waste a bite.'}
                        </p>
                    </div>

                    {/* Navigation Dots */}
                    <div className="flex gap-2 mb-8">
                        {[0, 1, 2].map((step) => (
                            <button
                                key={step}
                                onClick={() => setOnboardingStep(step)}
                                className={`transition-all duration-300 rounded-full ${
                                    onboardingStep === step
                                        ? 'w-8 h-2.5 bg-[var(--accent-color)]'
                                        : 'w-2.5 h-2.5 bg-[var(--bg-tertiary)] hover:bg-[var(--text-muted)]'
                                }`}
                                aria-label={`Go to step ${step + 1}`}
                            />
                        ))}
                    </div>

                    {/* CTA Button */}
                    <button
                        onClick={() => onNavigate?.('scan')}
                        className="action-button btn-primary px-8 py-4 rounded-2xl flex items-center gap-3 text-lg group"
                    >
                        <Sparkles className="w-5 h-5" />
                        Start Scanning
                        <ChevronRight className="w-5 h-5 transition-transform group-hover:translate-x-1" />
                    </button>
                </div>
            )}
        </div>
    );
}
