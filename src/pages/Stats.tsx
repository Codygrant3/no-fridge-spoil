import { useState, useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/database';
import { BADGES, getLevelFromXp, getLevelTitle, getLevelProgress, type Badge } from '../services/impactService';
import { getCacheStats, clearAllCache, type AICacheServiceType } from '../services/aiCacheService';
import { ChevronLeft, Share2, Leaf, Droplets, DollarSign, Database, Trash2 } from 'lucide-react';

type TimeFilter = 'weekly' | 'monthly' | 'allTime';

export function Stats() {
    const [timeFilter, setTimeFilter] = useState<TimeFilter>('monthly');
    const [showBadgePopup, setShowBadgePopup] = useState<Badge | null>(null);
    const [cacheStats, setCacheStats] = useState<Awaited<ReturnType<typeof getCacheStats>> | null>(null);

    // Load cache stats
    useEffect(() => {
        getCacheStats().then(setCacheStats);
    }, []);

    // Live query for extended stats with gamification
    const extendedStats = useLiveQuery(() => db.stats.get('global'), [], null);

    // Calculate XP and level
    const xp = extendedStats?.xp || 0;
    const level = getLevelFromXp(xp);
    const levelTitle = getLevelTitle(level);
    const levelProgress = getLevelProgress(xp);
    const xpInCurrentLevel = xp - (level - 1) * 250;

    // Get all badges with unlock status
    const allBadges = BADGES.map(badge => ({
        ...badge,
        unlocked: extendedStats?.badges?.includes(badge.id) || false,
    }));

    // Featured badges for display (first 6)
    const featuredBadges = allBadges.slice(0, 6);

    return (
        <div className="min-h-full bg-[#0f1419] text-white pb-32">
            {/* Header */}
            <header className="flex items-center justify-between p-4">
                <button className="p-2 hover:bg-white/10 rounded-lg">
                    <ChevronLeft className="w-6 h-6" />
                </button>
                <h1 className="text-xl font-bold">Your Impact</h1>
                <button className="p-2 hover:bg-white/10 rounded-lg">
                    <Share2 className="w-5 h-5" />
                </button>
            </header>

            <div className="px-4 space-y-6">
                {/* Level Progress */}
                <section>
                    <div className="flex items-center justify-between mb-2">
                        <h2 className="text-lg font-semibold">Level {level}: {levelTitle}</h2>
                        <span className="text-green-400 font-bold">{xp.toLocaleString()} XP</span>
                    </div>
                    <div className="h-2 bg-gray-800 rounded-full overflow-hidden mb-1">
                        <div
                            className="h-full bg-gradient-to-r from-green-500 to-emerald-400 rounded-full transition-all"
                            style={{ width: `${levelProgress}%` }}
                        />
                    </div>
                    <p className="text-xs text-gray-500">{xpInCurrentLevel} XP TO LEVEL {level + 1}</p>
                </section>

                {/* Time Filter Toggle */}
                <div className="flex bg-[#1a1f2e] rounded-xl p-1">
                    {(['weekly', 'monthly', 'allTime'] as const).map((filter) => (
                        <button
                            key={filter}
                            onClick={() => setTimeFilter(filter)}
                            className={`flex-1 py-2 px-4 rounded-lg text-sm font-medium transition-colors ${timeFilter === filter
                                ? 'bg-gray-700 text-white'
                                : 'text-gray-400 hover:text-white'
                                }`}
                        >
                            {filter === 'allTime' ? 'All-Time' : filter.charAt(0).toUpperCase() + filter.slice(1)}
                        </button>
                    ))}
                </div>

                {/* Money Saved Card */}
                <div className="bg-gradient-to-br from-[#1a2f23] to-[#1a1f2e] rounded-2xl p-5 border border-green-900/50">
                    <div className="flex items-center gap-2 mb-2">
                        <div className="w-8 h-8 bg-green-500/20 rounded-lg flex items-center justify-center">
                            <DollarSign className="w-4 h-4 text-green-400" />
                        </div>
                        <span className="text-gray-400 text-sm uppercase tracking-wide">Money Saved</span>
                    </div>
                    <div className="flex items-baseline gap-2">
                        <span className="text-4xl font-bold">${(extendedStats?.moneySaved || 0).toFixed(2)}</span>
                        <span className="text-green-400 text-sm">↑12%</span>
                    </div>
                </div>

                {/* CO2 and Water Cards */}
                <div className="grid grid-cols-2 gap-3">
                    <div className="bg-[#1a1f2e] rounded-2xl p-4 border border-gray-800">
                        <div className="w-8 h-8 bg-blue-500/20 rounded-lg flex items-center justify-center mb-3">
                            <Leaf className="w-4 h-4 text-blue-400" />
                        </div>
                        <p className="text-gray-400 text-xs uppercase tracking-wide mb-1">CO2 Reduced</p>
                        <p className="text-2xl font-bold">{Math.round(extendedStats?.co2SavedKg || 0)} <span className="text-sm font-normal text-gray-400">kg</span></p>
                    </div>
                    <div className="bg-[#1a1f2e] rounded-2xl p-4 border border-gray-800">
                        <div className="w-8 h-8 bg-cyan-500/20 rounded-lg flex items-center justify-center mb-3">
                            <Droplets className="w-4 h-4 text-cyan-400" />
                        </div>
                        <p className="text-gray-400 text-xs uppercase tracking-wide mb-1">Water Saved</p>
                        <p className="text-2xl font-bold">{((extendedStats?.waterSavedL || 0) / 1000).toFixed(1)}<span className="text-sm font-normal text-gray-400">k L</span></p>
                    </div>
                </div>

                {/* Eco-Achievements */}
                <section>
                    <div className="flex items-center justify-between mb-4">
                        <h2 className="text-lg font-semibold">Eco-Achievements</h2>
                        <button className="text-green-400 text-sm font-medium">View All</button>
                    </div>
                    <div className="grid grid-cols-3 gap-3">
                        {featuredBadges.map((badge) => (
                            <button
                                key={badge.id}
                                onClick={() => badge.unlocked && setShowBadgePopup(badge)}
                                className={`flex flex-col items-center p-4 rounded-2xl border transition-all ${badge.unlocked
                                    ? 'bg-[#1a1f2e] border-green-500/50 hover:scale-105'
                                    : 'bg-[#1a1f2e]/50 border-gray-800 opacity-50'
                                    }`}
                            >
                                <div className={`w-14 h-14 rounded-full flex items-center justify-center mb-2 ${badge.unlocked
                                    ? 'bg-green-500/20 border-2 border-green-500'
                                    : 'bg-gray-800'
                                    }`}>
                                    <span className="text-2xl">{badge.icon}</span>
                                </div>
                                <span className="text-xs text-center text-gray-300">{badge.name}</span>
                            </button>
                        ))}
                    </div>
                </section>

                {/* AI Cache Stats */}
                {cacheStats && cacheStats.totalEntries > 0 && (
                    <section>
                        <div className="flex items-center justify-between mb-3">
                            <div className="flex items-center gap-2">
                                <Database className="w-5 h-5 text-purple-400" />
                                <h2 className="text-lg font-semibold">AI Cache</h2>
                            </div>
                            <button
                                onClick={async () => {
                                    await clearAllCache();
                                    setCacheStats(await getCacheStats());
                                }}
                                className="flex items-center gap-1 text-red-400 text-sm font-medium hover:text-red-300"
                            >
                                <Trash2 className="w-3.5 h-3.5" /> Clear
                            </button>
                        </div>
                        <div className="grid grid-cols-3 gap-3">
                            <div className="bg-[#1a1f2e] rounded-xl p-3 border border-gray-800 text-center">
                                <p className="text-2xl font-bold text-purple-400">{cacheStats.totalEntries}</p>
                                <p className="text-xs text-gray-400 mt-1">Cached</p>
                            </div>
                            <div className="bg-[#1a1f2e] rounded-xl p-3 border border-gray-800 text-center">
                                <p className="text-2xl font-bold text-green-400">{cacheStats.totalHits}</p>
                                <p className="text-xs text-gray-400 mt-1">Cache Hits</p>
                            </div>
                            <div className="bg-[#1a1f2e] rounded-xl p-3 border border-gray-800 text-center">
                                <p className="text-2xl font-bold text-blue-400">{(cacheStats.totalSizeBytes / 1024).toFixed(1)}</p>
                                <p className="text-xs text-gray-400 mt-1">KB Used</p>
                            </div>
                        </div>
                    </section>
                )}

                {/* Motivational Quote */}
                <div className="bg-gradient-to-r from-green-900/30 to-emerald-900/30 rounded-2xl p-4 border border-green-800/50">
                    <p className="text-green-300 text-sm italic text-center">
                        "You've saved the equivalent of {Math.round((extendedStats?.co2SavedKg || 0) / 4)} trees this month!
                        Keep it up, nature's best friend."
                    </p>
                </div>
            </div>

            {/* Badge Popup */}
            {showBadgePopup && (
                <div
                    className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4"
                    onClick={() => setShowBadgePopup(null)}
                >
                    <div
                        className="bg-[#1a1f2e] p-8 rounded-3xl max-w-sm w-full text-center border border-gray-700"
                        onClick={e => e.stopPropagation()}
                    >
                        <div className="w-24 h-24 mx-auto bg-green-500/20 rounded-full flex items-center justify-center mb-4 border-2 border-green-500">
                            <span className="text-5xl">{showBadgePopup.icon}</span>
                        </div>
                        <h3 className="text-2xl font-bold mb-2">{showBadgePopup.name}</h3>
                        <p className="text-gray-400 mb-6">{showBadgePopup.description}</p>
                        <button
                            onClick={() => setShowBadgePopup(null)}
                            className="px-8 py-3 bg-green-500 text-white rounded-xl font-semibold hover:bg-green-600 transition-colors"
                        >
                            Awesome!
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
