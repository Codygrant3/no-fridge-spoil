import { useEffect, useRef, useState, type ComponentType } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import type { IconProps } from '@phosphor-icons/react';
import {
    CaretLeft,
    CheckCircle,
    CurrencyDollar,
    Database,
    Drop,
    GlobeHemisphereWest,
    Leaf,
    Recycle,
    SealCheck,
    ShareNetwork,
    ShieldCheck,
    ShoppingCart,
    Star,
    Trash,
    Trophy,
} from '@phosphor-icons/react';
import { db } from '../db/database';
import { clearAllCache, getCacheStats } from '../services/aiCacheService';
import { BADGES, getLevelFromXp, getLevelProgress, getLevelTitle, type Badge } from '../services/impactService';
import { copyText } from '../utils/clipboard';
import { useModalFocus } from '../hooks/useModalFocus';

interface StatsProps {
    onBack?: () => void;
}

const badgeIcons: Record<string, ComponentType<IconProps>> = {
    'first-save': Leaf,
    'waste-warrior': ShieldCheck,
    'food-hero': SealCheck,
    'planet-protector': GlobeHemisphereWest,
    'planner-pro': ShoppingCart,
    'zero-hero': CheckCircle,
    'compost-king': Recycle,
    'bulk-buyer': ShoppingCart,
    'perfect-month': Star,
    'carbon-cutter': Leaf,
    'climate-champion': Trophy,
    'earth-guardian': GlobeHemisphereWest,
};

function BadgeIcon({ badge, size = 25 }: { badge: Badge; size?: number }) {
    const Icon = badgeIcons[badge.id] || SealCheck;
    return <Icon size={size} weight="duotone" />;
}

export function Stats({ onBack }: StatsProps) {
    const [showBadgePopup, setShowBadgePopup] = useState<Badge | null>(null);
    const badgeTriggerRef = useRef<HTMLButtonElement | null>(null);
    const badgeCloseRef = useRef<HTMLButtonElement | null>(null);
    const [cacheStats, setCacheStats] = useState<Awaited<ReturnType<typeof getCacheStats>> | null>(null);
    const [shareFeedback, setShareFeedback] = useState<string | null>(null);

    useEffect(() => {
        void getCacheStats().then(setCacheStats);
    }, []);

    const badgeDialogRef = useRef<HTMLDivElement | null>(null);
    useModalFocus(Boolean(showBadgePopup), badgeDialogRef, () => setShowBadgePopup(null), badgeCloseRef, badgeTriggerRef);

    const extendedStats = useLiveQuery(() => db.stats.get('global'), [], null);
    const xp = extendedStats?.xp || 0;
    const level = getLevelFromXp(xp);
    const levelTitle = getLevelTitle(level);
    const levelProgress = getLevelProgress(xp);
    const xpToNextLevel = Math.max(0, level * 250 - xp);

    const allBadges = BADGES.map(badge => ({
        ...badge,
        unlocked: extendedStats?.badges?.includes(badge.id) || false,
    }));

    const featuredBadges = allBadges.slice(0, 6);

    const shareImpact = async () => {
        const text = `I have saved $${(extendedStats?.moneySaved || 0).toFixed(2)} and prevented ${Math.round(extendedStats?.co2SavedKg || 0)} kg of CO2 with No Fridge Spoil.`;
        if (navigator.share) {
            try {
                await navigator.share({ title: 'My No Fridge Spoil impact', text });
                setShareFeedback('Impact shared.');
                return;
            } catch (error) {
                if (error instanceof DOMException && error.name === 'AbortError') return;
            }
        }
        const copied = await copyText(text);
        if (copied) {
            setShareFeedback('Impact summary copied.');
        } else {
            setShareFeedback('Impact summary could not be shared. Try again from a supported browser.');
        }
    };

    return (
        <div className="editorial-page stats-page">
            <header className="recipe-header">
                <button type="button" className="market-icon-button editorial-header-action" onClick={onBack} aria-label="Back to home">
                    <CaretLeft size={22} weight="bold" />
                </button>
                <div>
                    <p className="editorial-kicker">Waste prevented</p>
                    <h1>Your impact</h1>
                </div>
                <button type="button" className="market-icon-button editorial-header-action" onClick={() => void shareImpact()} aria-label="Share your impact">
                    <ShareNetwork size={21} />
                </button>
            </header>

            {shareFeedback && <p className="impact-share-feedback" role="status">{shareFeedback}</p>}

            <section className="impact-level" aria-label={`Level ${level}, ${levelTitle}`}>
                <div className="impact-level-copy">
                    <span>Level {level}</span>
                    <strong>{levelTitle}</strong>
                    <small>{xpToNextLevel} XP to level {level + 1}</small>
                </div>
                <div className="impact-xp"><strong>{xp.toLocaleString()}</strong><span>XP</span></div>
                <div className="editorial-progress-track"><div style={{ width: `${levelProgress}%` }} /></div>
            </section>

            <p className="impact-period-label">All-time estimates from items marked used</p>

            <section className="impact-metrics" aria-label="Impact metrics">
                <div className="impact-metric impact-metric-primary">
                    <CurrencyDollar size={22} weight="duotone" />
                    <span>Money saved</span>
                    <strong>${(extendedStats?.moneySaved || 0).toFixed(2)}</strong>
                </div>
                <div className="impact-metric">
                    <Leaf size={22} weight="duotone" />
                    <span>CO2 reduced</span>
                    <strong>{Math.round(extendedStats?.co2SavedKg || 0)} <small>kg</small></strong>
                </div>
                <div className="impact-metric">
                    <Drop size={22} weight="duotone" />
                    <span>Water saved</span>
                    <strong>{((extendedStats?.waterSavedL || 0) / 1000).toFixed(1)} <small>k L</small></strong>
                </div>
            </section>

            <section className="editorial-section" aria-labelledby="achievements-heading">
                <div className="editorial-section-heading">
                    <h2 id="achievements-heading">Achievements</h2>
                    <span>{featuredBadges.filter(badge => badge.unlocked).length} unlocked</span>
                </div>
                <div className="achievement-grid">
                    {featuredBadges.map(badge => (
                        <button
                            key={badge.id}
                            type="button"
                            className={badge.unlocked ? 'is-unlocked' : ''}
                            onClick={event => {
                                if (!badge.unlocked) return;
                                badgeTriggerRef.current = event.currentTarget;
                                setShowBadgePopup(badge);
                            }}
                            disabled={!badge.unlocked}
                        >
                            <span><BadgeIcon badge={badge} /></span>
                            <strong>{badge.name}</strong>
                        </button>
                    ))}
                </div>
            </section>

            {cacheStats && cacheStats.totalEntries > 0 && (
                <section className="editorial-section" aria-labelledby="cache-heading">
                    <div className="editorial-section-heading">
                        <h2 id="cache-heading">AI cache</h2>
                        <button
                            type="button"
                            className="impact-clear-cache"
                            onClick={async () => {
                                await clearAllCache();
                                setCacheStats(await getCacheStats());
                            }}
                        >
                            <Trash size={15} />
                            Clear
                        </button>
                    </div>
                    <div className="impact-cache-row">
                        <Database size={22} weight="duotone" />
                        <span><strong>{cacheStats.totalEntries}</strong><small>Cached</small></span>
                        <span><strong>{cacheStats.totalHits}</strong><small>Hits</small></span>
                        <span><strong>{(cacheStats.totalSizeBytes / 1024).toFixed(1)}</strong><small>KB used</small></span>
                    </div>
                </section>
            )}

            <p className="impact-note">
                Estimated impact uses an average per saved item. Your recorded savings equal roughly{' '}
                {Math.round((extendedStats?.co2SavedKg || 0) / 4)} tree-years of carbon absorption.
            </p>

            {showBadgePopup && (
                <div className="editorial-modal-backdrop" onClick={() => setShowBadgePopup(null)}>
                    <div ref={badgeDialogRef} tabIndex={-1} className="achievement-dialog" role="dialog" aria-modal="true" aria-labelledby="badge-title" onClick={event => event.stopPropagation()}>
                        <span className="achievement-dialog-icon"><BadgeIcon badge={showBadgePopup} size={42} /></span>
                        <h2 id="badge-title">{showBadgePopup.name}</h2>
                        <p>{showBadgePopup.description}</p>
                        <button ref={badgeCloseRef} type="button" onClick={() => setShowBadgePopup(null)}>Close</button>
                    </div>
                </div>
            )}
        </div>
    );
}
