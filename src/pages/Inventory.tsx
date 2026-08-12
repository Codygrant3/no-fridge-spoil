import { useCallback, useEffect, useMemo, useState } from 'react';
import {
    ArrowRight,
    CalendarBlank,
    CaretRight,
    Check,
    MagnifyingGlass,
    Package,
    Scan,
    ShoppingCartSimple,
    SlidersHorizontal,
    Snowflake,
    Trash,
} from '@phosphor-icons/react';
import type { TabType } from '../components/BottomNav';
import { EatThisTonightWidget } from '../components/EatThisTonightWidget';
import { CookMode } from '../components/CookMode';
import { ProfileSwitcher } from '../components/ProfileSwitcher';
import { OnboardingCarousel } from '../components/OnboardingCarousel';
import { useInventory } from '../context/InventoryContext';
import type { Recipe } from '../services/recipeService';
import { getShelfLifeDescription } from '../services/shelfLifeService';
import { addInventoryItemToShoppingList } from '../services/shoppingActionService';

interface InventoryProps {
    onNavigate?: (tab: TabType) => void;
}

type InventoryFilter = 'all' | 'attention' | 'fresh';
type StatusTone = 'urgent' | 'warning' | 'fresh';

const foodImages: Array<{ terms: string[]; src: string }> = [
    { terms: ['yogurt', 'yoghurt'], src: '/market/greek-yogurt.webp' },
    { terms: ['spinach'], src: '/market/baby-spinach.webp' },
    { terms: ['salmon'], src: '/market/salmon-fillet.webp' },
];

function getDaysUntil(dateString: string, now: number): { days: number; label: string } {
    const difference = new Date(dateString).getTime() - now;
    const days = Math.ceil(difference / 86_400_000);

    if (days < 0) return { days, label: 'Expired' };
    if (days === 0) return { days, label: 'Today' };
    if (days === 1) return { days, label: '1 day' };
    return { days, label: `${days} days` };
}

function getStatusTone(days: number): StatusTone {
    if (days <= 0) return 'urgent';
    if (days <= 7) return 'warning';
    return 'fresh';
}

function getFoodImage(name: string): string | undefined {
    const normalizedName = name.toLowerCase();
    return foodImages.find(({ terms }) => terms.some(term => normalizedName.includes(term)))?.src;
}

export function Inventory({ onNavigate }: InventoryProps) {
    const { items, removeItem, consumeItem, updateItem } = useInventory();
    const [search, setSearch] = useState('');
    const [showSearch, setShowSearch] = useState(false);
    const [filter, setFilter] = useState<InventoryFilter>('all');
    const [expandedItemId, setExpandedItemId] = useState<string | null>(null);
    const [selectedRecipe, setSelectedRecipe] = useState<Recipe | null>(null);
    const [currentTime, setCurrentTime] = useState(() => Date.now());
    const [actionFeedback, setActionFeedback] = useState<string | null>(null);
    const [visibleItemCount, setVisibleItemCount] = useState(24);

    useEffect(() => {
        const interval = window.setInterval(() => setCurrentTime(Date.now()), 60_000);
        return () => window.clearInterval(interval);
    }, []);

    const sortedItems = useMemo(() => {
        const query = search.trim().toLowerCase();

        return [...items]
            .filter(item => {
                const { days } = getDaysUntil(item.expirationDate, currentTime);
                const matchesQuery = !query || item.name.toLowerCase().includes(query) || item.brand?.toLowerCase().includes(query);
                const matchesFilter = filter === 'all'
                    || (filter === 'attention' && days <= 7)
                    || (filter === 'fresh' && days > 7);
                return matchesQuery && matchesFilter;
            })
            .sort((first, second) => new Date(first.expirationDate).getTime() - new Date(second.expirationDate).getTime());
    }, [currentTime, filter, items, search]);

    const criticalItems = useMemo(
        () => items.filter(item => {
            const days = getDaysUntil(item.expirationDate, currentTime).days;
            return days >= 0 && days <= 1 && item.status !== 'expired';
        }),
        [currentTime, items],
    );
    const visibleItems = sortedItems.slice(0, visibleItemCount);

    const actionQueue = useMemo(() => {
        const ranked = items.map(item => ({ item, ...getDaysUntil(item.expirationDate, currentTime) }));
        const useNext = ranked
            .filter(entry => entry.days <= 1)
            .map(entry => ({ ...entry, action: 'use' as const }));
        const freezeToday = ranked
            .filter(entry => entry.days >= 2 && entry.days <= 3 && entry.item.storageLocation === 'fridge')
            .map(entry => ({ ...entry, action: 'freeze' as const }));
        const buySoon = ranked
            .filter(entry => entry.days > 3 && entry.item.quantity <= 1)
            .map(entry => ({ ...entry, action: 'buy' as const }));
        return [...useNext, ...freezeToday, ...buySoon].slice(0, 5);
    }, [currentTime, items]);

    const markAsOpened = useCallback(async (id: string) => {
        await updateItem(id, { openedDate: new Date().toISOString().split('T')[0] });
    }, [updateItem]);

    const freezeItem = useCallback(async (id: string, name: string) => {
        const frozenUntil = new Date();
        frozenUntil.setDate(frozenUntil.getDate() + 30);
        await updateItem(id, {
            storageLocation: 'freezer',
            expirationDate: frozenUntil.toISOString().split('T')[0],
        });
        setActionFeedback(`${name} moved to the freezer for 30 days.`);
    }, [updateItem]);

    const addToList = useCallback(async (item: (typeof items)[number]) => {
        const result = await addInventoryItemToShoppingList(item);
        setActionFeedback(result === 'added' ? `${item.name} added to your shopping list.` : `${item.name} is already on your shopping list.`);
    }, []);

    if (selectedRecipe) {
        return (
            <CookMode
                recipe={selectedRecipe}
                items={items}
                onClose={() => setSelectedRecipe(null)}
            />
        );
    }

    const heroTitle = criticalItems.length > 0
        ? 'Use these tonight'
        : items.length > 0
            ? 'Everything is on track'
            : 'Fresh starts here';

    const heroEyebrow = criticalItems.length > 0
        ? 'Urgent'
        : items.length > 0
            ? 'Kitchen calm'
            : 'Your market';

    return (
        <div className="market-home">
            <header className="market-header">
                <ProfileSwitcher />
                <div className="market-brand-lockup">
                    <span>No Fridge Spoil</span>
                    <h1>Fresh Market</h1>
                </div>
                <div className="market-header-actions">
                    <button
                        type="button"
                        className="market-icon-button"
                        aria-label="Search inventory"
                        onClick={() => setShowSearch(value => !value)}
                    >
                        <MagnifyingGlass size={22} />
                    </button>
                    <button
                        type="button"
                        className="market-icon-button"
                        aria-label="Filter inventory"
                        onClick={() => setShowSearch(value => !value)}
                    >
                        <SlidersHorizontal size={22} />
                    </button>
                </div>
            </header>

            <OnboardingCarousel itemCount={items.length} onStartClick={() => onNavigate?.('scan')} />

            {showSearch && (
                <section className="market-search-panel" aria-label="Inventory filters">
                    <label className="market-search-field">
                        <MagnifyingGlass size={18} />
                        <input
                            value={search}
                            onChange={event => {
                                setSearch(event.target.value);
                                setVisibleItemCount(24);
                            }}
                            placeholder="Search groceries"
                            autoFocus
                        />
                    </label>
                    <div className="market-segmented-control">
                        {([
                            ['all', 'All'],
                            ['attention', 'Needs attention'],
                            ['fresh', 'Fresh'],
                        ] as const).map(([value, label]) => (
                            <button
                                key={value}
                                type="button"
                                className={filter === value ? 'is-active' : ''}
                                onClick={() => {
                                    setFilter(value);
                                    setVisibleItemCount(24);
                                }}
                            >
                                {label}
                            </button>
                        ))}
                    </div>
                </section>
            )}

            {actionFeedback && (
                <div className="market-action-feedback" role="status">
                    <span>{actionFeedback}</span>
                    <button type="button" onClick={() => setActionFeedback(null)} aria-label="Dismiss action message">Close</button>
                </div>
            )}

            {actionQueue.length > 0 && (
                <section className="market-action-queue" aria-labelledby="action-queue-heading">
                    <div className="market-section-heading">
                        <h2 id="action-queue-heading">Do next</h2>
                        <span>{actionQueue.length} useful action{actionQueue.length === 1 ? '' : 's'}</span>
                    </div>
                    <div className="market-action-list">
                        {actionQueue.map(({ item, label, action }) => (
                            <article key={`${action}-${item.id}`} className={`market-action-row action-${action}`}>
                                <span className="market-action-icon" aria-hidden="true">
                                    {action === 'use' ? <Check size={19} weight="bold" /> : action === 'freeze' ? <Snowflake size={19} /> : <ShoppingCartSimple size={19} />}
                                </span>
                                <span>
                                    <strong>{item.name}</strong>
                                    <small>{action === 'use' ? `${label}. Use it before it is lost.` : action === 'freeze' ? `${label}. Freeze it to buy more time.` : 'Running low. Add it before the next shop.'}</small>
                                </span>
                                <button
                                    type="button"
                                    onClick={() => void (action === 'use'
                                        ? consumeItem(item.id).then(() => setActionFeedback(`${item.name} marked as used.`))
                                        : action === 'freeze'
                                            ? freezeItem(item.id, item.name)
                                            : addToList(item))}
                                >
                                    {action === 'use' ? 'Used' : action === 'freeze' ? 'Freeze' : 'Add'}
                                </button>
                            </article>
                        ))}
                    </div>
                </section>
            )}

            <article className={`market-hero ${actionQueue.length > 0 ? 'is-compact' : ''}`} aria-label="Tonight's food plan">
                <img
                    src="/market/market-hero.webp"
                    alt="Spinach, salmon, tomatoes, yogurt, and lemon on a marble counter"
                    decoding="async"
                    fetchPriority="high"
                />
                <div className="market-hero-copy">
                    <p className={`market-hero-eyebrow ${criticalItems.length > 0 ? 'is-urgent' : ''}`}>
                        <span />
                        {heroEyebrow}
                    </p>
                    <h2>{heroTitle}</h2>
                    <button
                        type="button"
                        className="market-hero-action"
                        onClick={() => onNavigate?.(items.length > 0 ? 'recipes' : 'scan')}
                    >
                        {items.length > 0 ? 'Plan dinner' : 'Start scanning'}
                        <ArrowRight size={21} weight="bold" />
                    </button>
                </div>
            </article>

            <section className="market-inventory-section" aria-labelledby="inventory-heading">
                <div className="market-section-heading">
                    <h2 id="inventory-heading">Inventory</h2>
                    <span>Sorted by urgency</span>
                </div>

                {sortedItems.length > 0 ? (
                    <div className="market-inventory-list">
                        {visibleItems.map(item => {
                            const { days, label } = getDaysUntil(item.expirationDate, currentTime);
                            const tone = getStatusTone(days);
                            const image = getFoodImage(item.name);
                            const isExpanded = expandedItemId === item.id;
                            const detail = item.brand || item.storageLocation;

                            return (
                                <article key={item.id} className={`market-inventory-row tone-${tone}`}>
                                    <button
                                        type="button"
                                        className="market-item-main"
                                        onClick={() => setExpandedItemId(isExpanded ? null : item.id)}
                                        aria-expanded={isExpanded}
                                    >
                                        <span className="market-status-dot" />
                                        <span className="market-food-thumb">
                                            {image ? (
                                                <img src={image} alt="" loading="lazy" decoding="async" />
                                            ) : (
                                                <Package size={24} weight="duotone" />
                                            )}
                                        </span>
                                        <span className="market-item-copy">
                                            <strong>{item.name}</strong>
                                            <small>
                                                {detail}
                                                {item.quantity > 1 ? ` · ${item.quantity} units` : ''}
                                            </small>
                                        </span>
                                        <span className="market-item-due">{label}</span>
                                        <CaretRight size={19} weight="bold" className={isExpanded ? 'rotate-90' : ''} />
                                    </button>

                                    {isExpanded && (
                                        <div className="market-item-actions">
                                            {!item.openedDate && getShelfLifeDescription(item.name) && (
                                                <button type="button" onClick={() => markAsOpened(item.id)}>
                                                    <CalendarBlank size={17} />
                                                    Opened
                                                </button>
                                            )}
                                            <button type="button" onClick={() => consumeItem(item.id)}>
                                                <Check size={17} weight="bold" />
                                                Used
                                            </button>
                                            <button type="button" className="is-destructive" onClick={() => removeItem(item.id)}>
                                                <Trash size={17} />
                                                Toss
                                            </button>
                                        </div>
                                    )}
                                </article>
                            );
                        })}
                        {visibleItemCount < sortedItems.length && (
                            <button
                                type="button"
                                className="market-list-more"
                                onClick={() => setVisibleItemCount(count => count + 24)}
                            >
                                Show {Math.min(24, sortedItems.length - visibleItemCount)} more
                                <span>{visibleItemCount} of {sortedItems.length}</span>
                            </button>
                        )}
                    </div>
                ) : (
                    <div className="market-empty-state">
                        <Package size={28} weight="duotone" />
                        <div>
                            <h3>{items.length === 0 ? 'Your inventory is ready for its first shop' : 'No groceries match'}</h3>
                            <p>{items.length === 0 ? 'Scan a receipt or add an item to begin tracking freshness.' : 'Try another search or filter.'}</p>
                        </div>
                    </div>
                )}

                <button type="button" className="market-scan-command" onClick={() => onNavigate?.('scan')}>
                    <Scan size={25} weight="bold" />
                    Scan groceries
                </button>
            </section>

            {criticalItems.length > 0 && (
                <section className="market-tonight-widget">
                    <EatThisTonightWidget
                        expiringItems={criticalItems.slice(0, 3)}
                        onCookNow={recipe => setSelectedRecipe(recipe)}
                    />
                </section>
            )}
        </div>
    );
}
