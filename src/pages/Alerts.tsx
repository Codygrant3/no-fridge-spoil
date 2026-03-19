import { useMemo } from 'react';
import { ChevronLeft, Settings, CheckCircle, ShoppingCart, ChefHat } from 'lucide-react';
import { useInventory } from '../context/InventoryContext';

// Category emoji mapping
const getItemEmoji = (name: string): string => {
    const nameLower = name.toLowerCase();
    if (nameLower.includes('milk')) return '🥛';
    if (nameLower.includes('spinach') || nameLower.includes('lettuce')) return '🥬';
    if (nameLower.includes('egg')) return '🥚';
    if (nameLower.includes('yogurt')) return '🥛';
    if (nameLower.includes('chicken')) return '🍗';
    if (nameLower.includes('cheese')) return '🧀';
    if (nameLower.includes('bread')) return '🍞';
    if (nameLower.includes('apple')) return '🍎';
    if (nameLower.includes('banana')) return '🍌';
    return '🍽️';
};

export function Alerts() {
    const { items } = useInventory();
    const now = Date.now();

    // Calculate days until expiration
    const getDaysUntil = (dateStr: string): number => {
        const diff = new Date(dateStr).getTime() - now;
        return Math.ceil(diff / (1000 * 60 * 60 * 24));
    };

    // Expiring soon items (within 3 days)
    const expiringItems = useMemo(() => {
        return items
            .filter(item => {
                const days = getDaysUntil(item.expirationDate);
                return days >= 0 && days <= 3;
            })
            .sort((a, b) => getDaysUntil(a.expirationDate) - getDaysUntil(b.expirationDate));
    }, [items, now]);

    // Low stock items (quantity <= 2)
    const lowStockItems = useMemo(() => {
        return items.filter(item => item.quantity <= 2);
    }, [items]);

    const allCaughtUp = expiringItems.length === 0 && lowStockItems.length === 0;

    return (
        <div className="min-h-full bg-[#0a1f0f] flex flex-col pb-24">
            {/* Header */}
            <header className="flex items-center justify-between p-4 pt-12">
                <button className="w-10 h-10 rounded-full flex items-center justify-center bg-gray-800/50">
                    <ChevronLeft className="w-6 h-6 text-white" />
                </button>
                <div className="flex-1" />
                <button className="w-10 h-10 rounded-full flex items-center justify-center bg-gray-800/50">
                    <Settings className="w-5 h-5 text-white" />
                </button>
            </header>

            <div className="px-4">
                <h1 className="text-white text-3xl font-bold mb-6">Alerts</h1>

                {/* Expiring Soon Section */}
                {expiringItems.length > 0 && (
                    <section className="mb-8">
                        <div className="flex items-center justify-between mb-4">
                            <h2 className="text-white text-lg font-semibold">Expiring Soon</h2>
                            <span className="px-3 py-1 bg-red-500/20 text-red-400 text-xs font-bold rounded-full uppercase">
                                Urgent
                            </span>
                        </div>

                        <div className="space-y-3">
                            {expiringItems.map((item) => {
                                const days = getDaysUntil(item.expirationDate);
                                const isToday = days === 0;

                                return (
                                    <div
                                        key={item.id}
                                        className="bg-[#1a2f1f] rounded-2xl p-4 border border-green-900/30"
                                    >
                                        <div className="flex items-start gap-4">
                                            {/* Image */}
                                            <div className="w-16 h-16 bg-gray-700 rounded-xl flex items-center justify-center overflow-hidden">
                                                <span className="text-3xl">{getItemEmoji(item.name)}</span>
                                            </div>

                                            {/* Content */}
                                            <div className="flex-1">
                                                <p className={`text-xs font-bold uppercase tracking-wide ${isToday ? 'text-red-400' : 'text-orange-400'
                                                    }`}>
                                                    {isToday ? '● EXPIRES TODAY' : `● EXPIRES IN ${days} DAYS`}
                                                </p>
                                                <h3 className="text-white text-lg font-semibold mt-1">
                                                    {item.name}
                                                </h3>
                                                <p className="text-gray-400 text-sm">
                                                    {item.quantity} {item.quantity > 1 ? 'items' : 'item'} remaining
                                                </p>

                                                {/* Action Buttons */}
                                                <div className="flex gap-2 mt-3">
                                                    {isToday ? (
                                                        <button className="px-4 py-2 bg-green-500/20 text-green-400 text-sm font-semibold rounded-lg flex items-center gap-2">
                                                            <CheckCircle className="w-4 h-4" />
                                                            Use Now
                                                        </button>
                                                    ) : (
                                                        <button className="px-4 py-2 bg-green-500/20 text-green-400 text-sm font-semibold rounded-lg flex items-center gap-2">
                                                            <ChefHat className="w-4 h-4" />
                                                            View Recipes
                                                        </button>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </section>
                )}

                {/* Low Stock Section */}
                {lowStockItems.length > 0 && (
                    <section className="mb-8">
                        <div className="flex items-center justify-between mb-4">
                            <h2 className="text-white text-lg font-semibold">Low Stock</h2>
                            <span className="px-3 py-1 bg-blue-500/20 text-blue-400 text-xs font-bold rounded-full uppercase">
                                Inventory
                            </span>
                        </div>

                        <div className="space-y-3">
                            {lowStockItems.map((item) => (
                                <div
                                    key={item.id}
                                    className="bg-[#1a2f1f] rounded-2xl p-4 border border-green-900/30"
                                >
                                    <div className="flex items-start gap-4">
                                        {/* Image */}
                                        <div className="w-16 h-16 bg-gray-700 rounded-xl flex items-center justify-center overflow-hidden">
                                            <span className="text-3xl">{getItemEmoji(item.name)}</span>
                                        </div>

                                        {/* Content */}
                                        <div className="flex-1">
                                            <p className="text-red-400 text-xs font-bold uppercase tracking-wide">
                                                ONLY {item.quantity} LEFT
                                            </p>
                                            <h3 className="text-white text-lg font-semibold mt-1">
                                                {item.name}
                                            </h3>
                                            <p className="text-gray-400 text-sm">
                                                Minimum stock: 6
                                            </p>

                                            {/* Action Button */}
                                            <button className="mt-3 px-4 py-2 bg-green-500/20 text-green-400 text-sm font-semibold rounded-lg flex items-center gap-2">
                                                <ShoppingCart className="w-4 h-4" />
                                                Add to List
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </section>
                )}

                {/* All Caught Up */}
                {allCaughtUp && (
                    <div className="flex flex-col items-center justify-center py-16">
                        <div className="w-16 h-16 bg-green-500/20 rounded-full flex items-center justify-center mb-4">
                            <CheckCircle className="w-8 h-8 text-green-400" />
                        </div>
                        <p className="text-gray-400">All caught up!</p>
                    </div>
                )}
            </div>
        </div>
    );
}
