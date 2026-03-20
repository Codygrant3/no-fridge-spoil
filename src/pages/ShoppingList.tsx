import { useState, useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, type DbShoppingItem } from '../db/database';
import { ChevronLeft, MoreHorizontal, Plus, Check } from 'lucide-react';

// Category definitions
const CATEGORIES = {
    produce: { label: 'Produce', color: 'text-emerald-400' },
    dairy: { label: 'Dairy & Eggs', color: 'text-blue-400' },
    meat: { label: 'Meat & Seafood', color: 'text-red-400' },
    frozen: { label: 'Frozen', color: 'text-cyan-400' },
    pantry: { label: 'Pantry', color: 'text-amber-400' },
    beverages: { label: 'Beverages', color: 'text-purple-400' },
    other: { label: 'Other', color: 'text-[var(--text-muted)]' },
};

// Running low suggestions
const RUNNING_LOW = [
    { name: 'Eggs', icon: '🥚' },
    { name: 'Oat Milk', icon: '🥛' },
    { name: 'Coffee Beans', icon: '☕' },
    { name: 'Bread', icon: '🍞' },
    { name: 'Butter', icon: '🧈' },
];

export function ShoppingList() {
    const [newItemName, setNewItemName] = useState('');
    const selectedCategory = 'other' as const;

    // Live query for shopping list items
    const items = useLiveQuery(
        () => db.shoppingList.orderBy('addedAt').reverse().toArray(),
        [],
        []
    );

    const checkedCount = items?.filter(i => i.isChecked).length || 0;
    const totalCount = items?.length || 0;
    const efficiencyScore = totalCount > 0 ? Math.round((checkedCount / totalCount) * 100) : 0;

    // Group items by category
    const groupedItems = useMemo(() => {
        const groups: Record<string, DbShoppingItem[]> = {};
        items?.forEach(item => {
            const cat = item.category || 'other';
            if (!groups[cat]) groups[cat] = [];
            groups[cat].push(item);
        });
        return groups;
    }, [items]);

    const addItem = async (name?: string) => {
        const itemName = name || newItemName.trim();
        if (!itemName) return;

        await db.shoppingList.add({
            id: crypto.randomUUID(),
            name: itemName,
            quantity: 1,
            addedAt: new Date().toISOString(),
            isChecked: false,
            category: selectedCategory,
        });

        setNewItemName('');
    };

    const toggleItem = async (id: string, currentState: boolean) => {
        await db.shoppingList.update(id, { isChecked: !currentState });
    };

    return (
        <div className="min-h-full bg-[var(--bg-primary)] text-[var(--text-primary)] pb-32">
            {/* Header */}
            <header className="flex items-center justify-between p-4">
                <button className="p-2 hover:bg-white/10 rounded-lg">
                    <ChevronLeft className="w-6 h-6" />
                </button>
                <h1 className="text-xl font-bold">Smart Shopping List</h1>
                <button className="p-2 hover:bg-white/10 rounded-lg">
                    <MoreHorizontal className="w-5 h-5" />
                </button>
            </header>

            <div className="px-4 space-y-6">
                {/* Efficiency Score */}
                <section>
                    <div className="flex items-center justify-between mb-2">
                        <span className="text-xs text-[var(--text-muted)] uppercase tracking-wide">Efficiency Score</span>
                        <span className="text-emerald-400 font-semibold">{efficiencyScore}% Collected</span>
                    </div>
                    <div className="h-1.5 bg-[var(--bg-tertiary)] rounded-full overflow-hidden">
                        <div
                            className="h-full bg-gradient-to-r from-green-500 to-emerald-400 rounded-full transition-all"
                            style={{ width: `${efficiencyScore}%` }}
                        />
                    </div>
                </section>

                {/* Add Item Input */}
                <div className="flex gap-2">
                    <input
                        type="text"
                        value={newItemName}
                        onChange={(e) => setNewItemName(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && addItem()}
                        placeholder="Add 2L Milk, Avocados..."
                        className="flex-1 px-4 py-3.5 glass-thin border border-[var(--border-color)] rounded-xl text-white placeholder-[var(--text-muted)] focus:outline-none focus:border-[var(--accent-color)]"
                    />
                    <button
                        onClick={() => addItem()}
                        className="px-4 bg-[var(--accent-color)] rounded-xl hover:bg-emerald-600 transition-colors"
                        aria-label="Add item"
                    >
                        <Plus className="w-6 h-6" />
                    </button>
                </div>

                {/* Running Low Quick-Add */}
                <section>
                    <h3 className="text-xs text-[var(--text-muted)] uppercase tracking-wide mb-3">Running Low</h3>
                    <div className="flex gap-2 overflow-x-auto pb-2 -mx-4 px-4">
                        {RUNNING_LOW.map((item) => (
                            <button
                                key={item.name}
                                onClick={() => addItem(item.name)}
                                className="flex flex-col items-center min-w-[80px] p-3 glass-thin rounded-xl border border-[var(--border-color)] hover:border-[var(--accent-color)] transition-colors"
                            >
                                <span className="text-2xl mb-1">{item.icon}</span>
                                <span className="text-xs text-[var(--text-secondary)]">{item.name}</span>
                                <span className="text-[10px] text-[var(--text-muted)] mt-1">ADD</span>
                            </button>
                        ))}
                    </div>
                </section>

                {/* Shopping List by Category */}
                {Object.entries(groupedItems).map(([category, categoryItems]) => {
                    const catInfo = CATEGORIES[category as keyof typeof CATEGORIES] || CATEGORIES.other;
                    const unchecked = categoryItems.filter(i => !i.isChecked);
                    const checked = categoryItems.filter(i => i.isChecked);

                    if (categoryItems.length === 0) return null;

                    return (
                        <section key={category}>
                            <div className="flex items-center justify-between mb-3">
                                <h3 className="font-semibold">{catInfo.label}</h3>
                                <span className={`text-sm ${catInfo.color}`}>{unchecked.length} items</span>
                            </div>
                            <div className="space-y-2">
                                {[...unchecked, ...checked].map((item) => (
                                    <button
                                        key={item.id}
                                        onClick={() => toggleItem(item.id, item.isChecked)}
                                        className={`w-full flex items-center gap-3 p-4 rounded-xl transition-all ${item.isChecked
                                            ? 'glass-thin/50 opacity-60'
                                            : 'glass-thin border border-[var(--border-color)]'
                                            }`}
                                    >
                                        <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-colors ${item.isChecked
                                            ? 'bg-[var(--accent-color)] border-[var(--accent-color)]'
                                            : 'border-[var(--border-color)]'
                                            }`}>
                                            {item.isChecked && <Check className="w-4 h-4 text-white" />}
                                        </div>
                                        <div className="flex-1 text-left">
                                            <span className={item.isChecked ? 'line-through text-[var(--text-muted)]' : ''}>
                                                {item.name}
                                            </span>
                                            {item.metadata && (
                                                <p className="text-xs text-emerald-400 mt-0.5">{item.metadata}</p>
                                            )}
                                            {item.lastBought && (
                                                <p className="text-xs text-[var(--text-muted)] mt-0.5">
                                                    Last bought {Math.round((Date.now() - new Date(item.lastBought).getTime()) / (1000 * 60 * 60 * 24))} days ago
                                                </p>
                                            )}
                                        </div>
                                        {item.unit && (
                                            <span className="text-[var(--text-muted)] text-sm">{item.quantity}{item.unit}</span>
                                        )}
                                    </button>
                                ))}
                            </div>
                        </section>
                    );
                })}

                {/* Empty State */}
                {(!items || items.length === 0) && (
                    <div className="flex flex-col items-center justify-center py-16 text-center">
                        <div className="w-20 h-20 glass-thin rounded-full flex items-center justify-center mb-4">
                            <span className="text-4xl">🛒</span>
                        </div>
                        <h3 className="text-xl font-semibold mb-2">Your list is empty</h3>
                        <p className="text-[var(--text-muted)]">Add items above or tap "Running Low" suggestions</p>
                    </div>
                )}
            </div>
        </div>
    );
}
