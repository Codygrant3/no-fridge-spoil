import { useState } from 'react';
import { ChevronLeft, X, Minus, Plus, Calendar, Check, AlertTriangle, Info, Sparkles } from 'lucide-react';
import { useInventory } from '../context/InventoryContext';
import { generateUUID } from '../utils/uuid';
import { getShelfLifeDefaults, estimateExpirationDate } from '../services/sealedShelfLifeService';
import type { StorageLocation } from '../types';

export interface ScannedItem {
    id: string;
    name: string;
    brand?: string;
    category: string;
    confidence: 'High' | 'Medium' | 'Low';
    expirationDate: string;
    quantity: number;
    imageUrl?: string;
    // Smart defaults metadata
    autoFillConfidence?: 'high' | 'medium' | 'low';
    suggestedStorage?: StorageLocation;
    suggestedDateType?: string;
    wasAutoFilled?: boolean;
}

interface ReviewItemsProps {
    items: ScannedItem[];
    onConfirm: (items: ScannedItem[]) => void;
    onClose: () => void;
}

// Emoji icons for categories
const getCategoryEmoji = (category: string, name: string): string => {
    const nameLower = name.toLowerCase();
    if (nameLower.includes('milk')) return '🥛';
    if (nameLower.includes('avocado')) return '🥑';
    if (nameLower.includes('chicken')) return '🍗';
    if (nameLower.includes('egg')) return '🥚';
    if (nameLower.includes('bread')) return '🍞';
    if (nameLower.includes('cheese')) return '🧀';
    if (nameLower.includes('yogurt')) return '🥛';
    if (category.toLowerCase().includes('produce')) return '🥬';
    if (category.toLowerCase().includes('dairy')) return '🧈';
    if (category.toLowerCase().includes('meat')) return '🍖';
    return '🛒';
};

// Apply smart shelf-life defaults to scanned items missing expiration dates
function applySmartDefaults(items: ScannedItem[]): ScannedItem[] {
    return items.map(item => {
        // Only auto-fill if no expiration date was detected by AI
        if (item.expirationDate && item.expirationDate !== 'Unknown') return item;

        const defaults = getShelfLifeDefaults(item.name);
        if (!defaults) return item;

        return {
            ...item,
            expirationDate: estimateExpirationDate(defaults.sealedDays),
            suggestedStorage: defaults.defaultStorage,
            suggestedDateType: defaults.dateType,
            autoFillConfidence: defaults.confidence,
            wasAutoFilled: true,
        };
    });
}

export function ReviewItems({ items: initialItems, onConfirm, onClose }: ReviewItemsProps) {
    const { addItem } = useInventory();
    const [items, setItems] = useState<ScannedItem[]>(() => applySmartDefaults(initialItems));
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [feedback, setFeedback] = useState<{ type: 'success' | 'warning' | 'error'; message: string } | null>(null);
    const autoFilledCount = items.filter(i => i.wasAutoFilled).length;

    const updateItem = (id: string, updates: Partial<ScannedItem>) => {
        setItems(prev => prev.map(item =>
            item.id === id ? { ...item, ...updates } : item
        ));
    };

    const removeItem = (id: string) => {
        setItems(prev => prev.filter(item => item.id !== id));
    };

    const clearAll = () => {
        setItems([]);
    };

    const addManualItem = () => {
        const newItem: ScannedItem = {
            id: generateUUID(),
            name: 'New Item',
            category: 'Grocery',
            confidence: 'Low',
            expirationDate: '',
            quantity: 1,
        };
        setItems(prev => [...prev, newItem]);
    };

    const handleConfirm = async () => {
        setIsSubmitting(true);
        setFeedback(null);

        try {
            const itemsWithDate = items.filter(item => item.expirationDate);
            const skippedCount = items.length - itemsWithDate.length;
            let addedCount = 0;

            for (const item of itemsWithDate) {
                await addItem({
                    name: item.name,
                    brand: item.brand || undefined,
                    expirationDate: item.expirationDate,
                    dateType: item.suggestedDateType || 'Best By',
                    quantity: item.quantity,
                    storageLocation: item.suggestedStorage || 'fridge',
                });
                addedCount++;
            }

            // Show feedback based on results
            if (skippedCount > 0 && addedCount > 0) {
                setFeedback({
                    type: 'warning',
                    message: `Added ${addedCount} item${addedCount !== 1 ? 's' : ''}. ${skippedCount} item${skippedCount !== 1 ? 's' : ''} without expiration date${skippedCount !== 1 ? 's were' : ' was'} skipped.`
                });
                // Delay closing to show feedback
                setTimeout(() => onConfirm(items), 2000);
            } else if (skippedCount > 0 && addedCount === 0) {
                setFeedback({
                    type: 'error',
                    message: `No items added. All ${skippedCount} item${skippedCount !== 1 ? 's are' : ' is'} missing expiration date${skippedCount !== 1 ? 's' : ''}.`
                });
                setIsSubmitting(false);
            } else {
                onConfirm(items);
            }
        } catch (error) {
            console.error('Failed to add items:', error);
            setFeedback({
                type: 'error',
                message: 'Failed to add items. Please try again.'
            });
            setIsSubmitting(false);
        }
    };

    const isExpiringSoon = (date: string): boolean => {
        if (!date) return false;
        const expDate = new Date(date);
        const now = new Date();
        const diffDays = Math.ceil((expDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
        return diffDays <= 3;
    };

    const itemsWithoutDate = items.filter(item => !item.expirationDate).length;

    return (
        <div className="min-h-full bg-[var(--bg-primary)] flex flex-col">
            {/* Header */}
            <header className="flex items-center justify-between p-4 pt-12">
                <button
                    onClick={onClose}
                    className="text-white p-2 bg-[var(--bg-secondary)] rounded-lg border border-[var(--border-color)] inventory-card"
                >
                    <ChevronLeft className="w-6 h-6" />
                </button>
                <h1 className="text-white text-lg font-bold">Review Scanned Items</h1>
                <button
                    onClick={clearAll}
                    className="text-[var(--accent-color)] text-sm font-bold"
                >
                    Clear All
                </button>
            </header>

            {/* Items Count */}
            <div className="px-4 pb-4">
                <h2 className="text-white text-3xl font-bold">{items.length} items detected</h2>
                <p className="text-[var(--text-secondary)] text-sm font-medium mt-1">Review details before adding to fridge</p>
            </div>

            {/* Smart Defaults Banner */}
            {autoFilledCount > 0 && (
                <div className="px-4 pb-4">
                    <div className="bg-purple-500/15 border border-purple-500/40 rounded-xl p-4 flex items-start gap-3 inventory-card">
                        <Sparkles className="w-5 h-5 text-purple-400 shrink-0 mt-0.5" />
                        <p className="text-purple-300 text-sm font-medium">
                            Smart-filled {autoFilledCount} item{autoFilledCount !== 1 ? 's' : ''} with estimated dates and storage. Review and adjust as needed.
                        </p>
                    </div>
                </div>
            )}

            {/* Warning for items without expiration date */}
            {itemsWithoutDate > 0 && (
                <div className="px-4 pb-4">
                    <div className="bg-orange-500/20 border border-orange-500/50 rounded-xl p-4 flex items-start gap-3 inventory-card">
                        <Info className="w-5 h-5 text-[var(--warning-color)] shrink-0 mt-0.5" />
                        <p className="text-[var(--warning-color)] text-sm font-medium">
                            {itemsWithoutDate} item{itemsWithoutDate !== 1 ? 's' : ''} missing expiration date{itemsWithoutDate !== 1 ? 's' : ''} and will be skipped.
                        </p>
                    </div>
                </div>
            )}

            {/* Feedback Message */}
            {feedback && (
                <div className="px-4 pb-4">
                    <div className={`rounded-xl p-4 flex items-start gap-3 inventory-card ${
                        feedback.type === 'success' ? 'bg-green-500/20 border border-green-500/50' :
                        feedback.type === 'warning' ? 'bg-yellow-500/20 border border-yellow-500/50' :
                        'bg-red-500/20 border border-red-500/50'
                    }`}>
                        <Info className={`w-5 h-5 shrink-0 mt-0.5 ${
                            feedback.type === 'success' ? 'text-[var(--accent-color)]' :
                            feedback.type === 'warning' ? 'text-[var(--warning-color)]' :
                            'text-[var(--danger-color)]'
                        }`} />
                        <p className={`text-sm font-medium ${
                            feedback.type === 'success' ? 'text-[var(--accent-color)]' :
                            feedback.type === 'warning' ? 'text-[var(--warning-color)]' :
                            'text-[var(--danger-color)]'
                        }`}>
                            {feedback.message}
                        </p>
                    </div>
                </div>
            )}

            {/* Items List */}
            <div className="flex-1 overflow-y-auto px-4 space-y-4 pb-4">
                {items.map((item) => (
                    <div
                        key={item.id}
                        className={`bg-[var(--bg-secondary)] rounded-2xl p-5 border inventory-card ${
                            !item.expirationDate ? 'border-orange-500/50 glow-red' : 'border-[var(--border-color)]'
                        }`}
                    >
                        {/* Item Header */}
                        <div className="flex items-start gap-4 mb-4">
                            {/* Image/Emoji */}
                            <div className="product-image bg-gradient-to-br from-gray-700 to-gray-800 rounded-2xl flex items-center justify-center overflow-hidden">
                                <span className="text-5xl">{getCategoryEmoji(item.category, item.name)}</span>
                            </div>

                            {/* Name & Category */}
                            <div className="flex-1">
                                <input
                                    type="text"
                                    value={item.name}
                                    onChange={(e) => updateItem(item.id, { name: e.target.value })}
                                    className="text-white text-xl font-bold bg-transparent w-full outline-none"
                                />
                                <div className="flex items-center gap-2 mt-1 flex-wrap">
                                    {item.confidence === 'High' && (
                                        <span className="text-[var(--accent-color)] text-xs flex items-center gap-1 font-semibold">
                                            <Check className="w-3 h-3" />
                                            High confidence scan
                                        </span>
                                    )}
                                    {item.confidence === 'Low' && (
                                        <span className="text-[var(--warning-color)] text-xs font-semibold">{item.category}</span>
                                    )}
                                    {item.confidence === 'Medium' && (
                                        <span className="text-[var(--text-secondary)] text-xs font-semibold">{item.category}</span>
                                    )}
                                    {item.wasAutoFilled && (
                                        <span className={`text-xs flex items-center gap-1 font-semibold ${
                                            item.autoFillConfidence === 'high' ? 'text-purple-400' :
                                            item.autoFillConfidence === 'medium' ? 'text-blue-400' :
                                            'text-gray-400'
                                        }`}>
                                            <Sparkles className="w-3 h-3" />
                                            Smart estimate
                                        </span>
                                    )}
                                </div>
                            </div>

                            {/* Remove Button */}
                            <button
                                onClick={() => removeItem(item.id)}
                                className="text-[var(--text-muted)] hover:text-[var(--danger-color)] p-2 bg-[var(--bg-tertiary)] rounded-lg border border-[var(--border-color)] inventory-card"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        {/* Expiration & Quantity Row */}
                        <div className="flex items-end gap-4">
                            {/* Expiration Date */}
                            <div className="flex-1">
                                <label className="text-[var(--text-secondary)] text-xs uppercase tracking-wide block mb-2 font-bold">
                                    Expires On {!item.expirationDate && <span className="text-[var(--warning-color)]">(Required)</span>}
                                </label>
                                <div className="relative">
                                    <input
                                        type="date"
                                        value={item.expirationDate}
                                        onChange={(e) => updateItem(item.id, { expirationDate: e.target.value })}
                                        className={`w-full px-4 py-3 bg-[var(--bg-tertiary)] border rounded-xl text-white outline-none font-medium ${
                                            !item.expirationDate
                                                ? 'border-orange-500'
                                                : isExpiringSoon(item.expirationDate)
                                                    ? 'border-orange-500'
                                                    : 'border-[var(--border-color)]'
                                            }`}
                                    />
                                    {isExpiringSoon(item.expirationDate) && item.expirationDate && (
                                        <AlertTriangle className="absolute right-10 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--warning-color)]" />
                                    )}
                                    <Calendar className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)] pointer-events-none" />
                                </div>
                            </div>

                            {/* Quantity Controls */}
                            <div>
                                <label className="text-[var(--text-secondary)] text-xs uppercase tracking-wide block mb-2 font-bold">
                                    Quantity
                                </label>
                                <div className="flex items-center gap-2">
                                    <button
                                        onClick={() => updateItem(item.id, { quantity: Math.max(1, item.quantity - 1) })}
                                        className="w-12 h-12 bg-[var(--accent-color)] rounded-xl flex items-center justify-center text-white action-button"
                                    >
                                        <Minus className="w-5 h-5" />
                                    </button>
                                    <span className="w-10 text-center text-white font-bold text-lg">
                                        {item.quantity}
                                    </span>
                                    <button
                                        onClick={() => updateItem(item.id, { quantity: item.quantity + 1 })}
                                        className="w-12 h-12 bg-[var(--accent-color)] rounded-xl flex items-center justify-center text-white action-button"
                                    >
                                        <Plus className="w-5 h-5" />
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                ))}

                {/* Add Manual Item */}
                <button
                    onClick={addManualItem}
                    className="w-full py-5 border-2 border-dashed border-[var(--border-color)] rounded-2xl text-[var(--text-secondary)] flex items-center justify-center gap-2 hover:border-[var(--accent-color)] hover:text-[var(--accent-color)] transition-all inventory-card font-semibold"
                >
                    <Plus className="w-5 h-5" />
                    Add another item manually
                </button>
            </div>

            {/* Confirm Button */}
            <div className="p-4 pb-8">
                <button
                    onClick={handleConfirm}
                    disabled={items.length === 0 || isSubmitting || items.every(i => !i.expirationDate)}
                    className="w-full py-5 bg-[var(--accent-color)] text-white font-bold rounded-2xl flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed action-button glow-green text-lg"
                >
                    <Check className="w-6 h-6" />
                    {isSubmitting ? 'Adding...' : `Confirm & Add ${items.filter(i => i.expirationDate).length} Item${items.filter(i => i.expirationDate).length !== 1 ? 's' : ''}`}
                </button>
            </div>
        </div>
    );
}
