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
    sourceImageUrl?: string;
    sourceLine?: string;
    sourceRegion?: string;
    // Smart defaults metadata
    autoFillConfidence?: 'high' | 'medium' | 'low';
    suggestedStorage?: StorageLocation;
    suggestedDateType?: string;
    wasAutoFilled?: boolean;
}

interface ReviewItemsProps {
    items: ScannedItem[];
    onConfirm: (items: ScannedItem[]) => void;
    onScanAnother?: () => void;
    onClose: () => void;
    receiptMeta?: {
        storeName?: string;
        date?: string;
        skippedItems?: string[];
        source?: 'camera' | 'gallery' | 'sample';
        previewUrl?: string;
        cacheHit?: boolean;
        estimatedCostCents?: number;
    };
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

export function ReviewItems({ items: initialItems, onConfirm, onScanAnother, onClose, receiptMeta }: ReviewItemsProps) {
    const { addItem, updateItem: updateInventoryItem, items: inventoryItems } = useInventory();
    const [items, setItems] = useState<ScannedItem[]>(() => applySmartDefaults(initialItems));
    const [bulkExpirationDate, setBulkExpirationDate] = useState('');
    const [bulkCategory, setBulkCategory] = useState('Produce');
    const [mergeMode, setMergeMode] = useState<'quantity' | 'expiration' | 'separate'>('quantity');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [feedback, setFeedback] = useState<{ type: 'success' | 'warning' | 'error'; message: string } | null>(null);
    const autoFilledCount = items.filter(i => i.wasAutoFilled).length;
    const duplicateNames = items
        .filter(item => inventoryItems.some(existing =>
            existing.name.trim().toLowerCase() === item.name.trim().toLowerCase()
        ))
        .map(item => item.name);
    const sortedItems = [...items].sort((a, b) => {
        const rank = { Low: 0, Medium: 1, High: 2 };
        return rank[a.confidence] - rank[b.confidence];
    });
    const groupedItems = sortedItems.reduce<Record<string, ScannedItem[]>>((groups, item) => {
        const category = item.category || 'Grocery';
        groups[category] = groups[category] || [];
        groups[category].push(item);
        return groups;
    }, {});

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

    const applyBulkExpirationDate = () => {
        if (!bulkExpirationDate) return;
        setItems(prev => prev.map(item => ({ ...item, expirationDate: bulkExpirationDate })));
    };

    const applyBulkCategory = () => {
        setItems(prev => prev.map(item => ({ ...item, category: bulkCategory })));
    };

    const removeLowConfidenceItems = () => {
        setItems(prev => prev.filter(item => item.confidence !== 'Low'));
    };

    const mergeDuplicates = async () => {
        if (mergeMode === 'separate') {
            setFeedback({ type: 'warning', message: 'Duplicates kept as separate scanned items.' });
            return;
        }
        const duplicateItems = items.filter(item => duplicateNames.includes(item.name));
        for (const item of duplicateItems) {
            const existing = inventoryItems.find(inventoryItem =>
                inventoryItem.name.trim().toLowerCase() === item.name.trim().toLowerCase()
            );
            if (existing) {
                await updateInventoryItem(existing.id, mergeMode === 'expiration'
                    ? { expirationDate: item.expirationDate || existing.expirationDate }
                    : { quantity: existing.quantity + item.quantity });
            }
        }
        setItems(prev => prev.filter(item => !duplicateNames.includes(item.name)));
        setFeedback({
            type: 'success',
            message: mergeMode === 'expiration'
                ? `Updated expiration dates for ${duplicateItems.length} duplicate item${duplicateItems.length !== 1 ? 's' : ''}.`
                : `Merged ${duplicateItems.length} duplicate item${duplicateItems.length !== 1 ? 's' : ''} into inventory.`,
        });
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

            {receiptMeta && (
                <div className="px-4 pb-4">
                    <div className="bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-2xl p-4 inventory-card">
                        <div className="flex items-center justify-between gap-3">
                            <div>
                                <p className="text-white text-sm font-bold">{receiptMeta.storeName || 'Receipt scan'}</p>
                                <p className="text-[var(--text-secondary)] text-xs mt-1">
                                    {receiptMeta.date || 'No receipt date detected'} · {receiptMeta.source === 'sample' ? 'Sample receipt' : 'OCR receipt'}
                                </p>
                                <p className="text-[var(--text-muted)] text-[10px] mt-1">
                                    {receiptMeta.cacheHit ? 'Cache hit' : 'Fresh OCR'} · Est. OCR cost {receiptMeta.estimatedCostCents ?? 0}c
                                </p>
                            </div>
                            <span className="text-[var(--accent-color)] text-xs font-bold uppercase tracking-wide">
                                {items.length} food items
                            </span>
                        </div>
                    </div>
                </div>
            )}

            {receiptMeta?.previewUrl && (
                <div className="px-4 pb-4">
                    <img
                        src={receiptMeta.previewUrl}
                        alt="Receipt preview"
                        className="max-h-52 w-full rounded-2xl object-cover border border-[var(--border-color)] inventory-card"
                    />
                </div>
            )}

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

            {duplicateNames.length > 0 && (
                <div className="px-4 pb-4">
                    <div className="bg-blue-500/15 border border-blue-500/40 rounded-xl p-4 flex items-start gap-3 inventory-card">
                        <Info className="w-5 h-5 text-blue-300 shrink-0 mt-0.5" />
                        <p className="text-blue-200 text-sm font-medium">
                            Possible duplicates already in inventory: {duplicateNames.join(', ')}.
                        </p>
                        <select
                            value={mergeMode}
                            onChange={(e) => setMergeMode(e.target.value as typeof mergeMode)}
                            className="shrink-0 rounded-lg bg-blue-950/60 text-blue-100 text-xs px-2 py-1"
                        >
                            <option value="quantity">Merge quantity</option>
                            <option value="expiration">Replace date</option>
                            <option value="separate">Keep separate</option>
                        </select>
                        <button
                            type="button"
                            onClick={mergeDuplicates}
                            className="ml-auto shrink-0 px-3 py-1.5 rounded-lg bg-blue-400/20 text-blue-100 text-xs font-bold"
                        >
                            Merge
                        </button>
                    </div>
                </div>
            )}

            {receiptMeta?.skippedItems && receiptMeta.skippedItems.length > 0 && (
                <div className="px-4 pb-4">
                    <div className="bg-slate-500/15 border border-slate-400/30 rounded-xl p-4 flex items-start gap-3 inventory-card">
                        <Info className="w-5 h-5 text-slate-300 shrink-0 mt-0.5" />
                        <p className="text-slate-200 text-sm font-medium">
                            Non-food items skipped: {receiptMeta.skippedItems.join(', ')}.
                        </p>
                    </div>
                </div>
            )}

            {/* Feedback Message */}
            {feedback && (
                <div className="px-4 pb-4">
                    <div className={`rounded-xl p-4 flex items-start gap-3 inventory-card ${
                        feedback.type === 'success' ? 'bg-emerald-500/20 border border-[var(--accent-color)]/50' :
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
            <div className="flex-1 overflow-y-auto px-4 space-y-5 pb-4">
                <div className="space-y-3 rounded-2xl bg-[var(--bg-secondary)] border border-[var(--border-color)] p-4 inventory-card">
                    <p className="text-white text-sm font-bold">Bulk actions</p>
                    <div className="grid grid-cols-[1fr_auto] gap-2">
                        <input
                            type="date"
                            value={bulkExpirationDate}
                            onChange={(e) => setBulkExpirationDate(e.target.value)}
                            className="px-3 py-2 bg-[var(--bg-tertiary)] border border-[var(--border-color)] rounded-xl text-white text-sm"
                        />
                        <button type="button" onClick={applyBulkExpirationDate} className="px-3 py-2 rounded-xl bg-emerald-500/20 text-emerald-200 text-xs font-bold">
                            Set dates
                        </button>
                    </div>
                    <div className="grid grid-cols-[1fr_auto] gap-2">
                        <select
                            value={bulkCategory}
                            onChange={(e) => setBulkCategory(e.target.value)}
                            className="px-3 py-2 bg-[var(--bg-tertiary)] border border-[var(--border-color)] rounded-xl text-white text-sm"
                        >
                            {['Produce', 'Dairy', 'Meat', 'Pantry', 'Frozen', 'Beverages', 'Grocery'].map(option => (
                                <option key={option} value={option}>{option}</option>
                            ))}
                        </select>
                        <button type="button" onClick={applyBulkCategory} className="px-3 py-2 rounded-xl bg-blue-500/20 text-blue-200 text-xs font-bold">
                            Set category
                        </button>
                    </div>
                    <button type="button" onClick={removeLowConfidenceItems} className="w-full px-3 py-2 rounded-xl bg-orange-500/20 text-orange-200 text-xs font-bold">
                        Remove low-confidence items
                    </button>
                </div>
                {Object.entries(groupedItems).map(([category, categoryItems]) => (
                    <section key={category} className="space-y-3">
                        <div className="flex items-center justify-between px-1">
                            <h3 className="text-white text-sm font-bold uppercase tracking-wide">{category}</h3>
                            <span className="text-[var(--text-muted)] text-xs">{categoryItems.length} item{categoryItems.length !== 1 ? 's' : ''}</span>
                        </div>
                        {categoryItems.map((item) => (
                            <div
                                key={item.id}
                                className={`bg-[var(--bg-secondary)] rounded-3xl p-5 border inventory-card ${
                            !item.expirationDate ? 'border-orange-500/50 glow-red' : 'border-[var(--border-color)]'
                        }`}
                            >
                        {/* Item Header */}
                        <div className="flex items-start gap-4 mb-4">
                            {/* Image/Emoji */}
                            <div className="product-image bg-gradient-to-br from-gray-700 to-gray-800 rounded-3xl flex items-center justify-center overflow-hidden">
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
                                    <span className={`text-xs flex items-center gap-1 font-semibold ${
                                        item.confidence === 'High' ? 'text-[var(--accent-color)]' :
                                        item.confidence === 'Medium' ? 'text-blue-300' :
                                        'text-[var(--warning-color)]'
                                    }`}>
                                        {item.confidence === 'High' && <Check className="w-3 h-3" />}
                                        {item.confidence} confidence
                                    </span>
                                    {duplicateNames.includes(item.name) && (
                                        <span className="text-blue-300 text-xs font-semibold">Possible duplicate</span>
                                    )}
                                    {item.wasAutoFilled && (
                                        <span className={`text-xs flex items-center gap-1 font-semibold ${
                                            item.autoFillConfidence === 'high' ? 'text-purple-400' :
                                            item.autoFillConfidence === 'medium' ? 'text-blue-400' :
                                            'text-[var(--text-muted)]'
                                        }`}>
                                            <Sparkles className="w-3 h-3" />
                                            Smart estimate
                                        </span>
                                    )}
                                    {item.sourceLine && (
                                        <span className="text-[var(--text-muted)] text-xs font-semibold">Line: {item.sourceLine}</span>
                                    )}
                                    {item.sourceRegion && (
                                        <span className="text-[var(--text-muted)] text-xs font-semibold">Region: {item.sourceRegion}</span>
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

                        <div className="grid grid-cols-2 gap-3 mb-4">
                            <div>
                                <label className="text-[var(--text-secondary)] text-xs uppercase tracking-wide block mb-2 font-bold">
                                    Brand
                                </label>
                                <input
                                    type="text"
                                    value={item.brand || ''}
                                    onChange={(e) => updateItem(item.id, { brand: e.target.value })}
                                    placeholder="Optional"
                                    className="w-full px-4 py-3 bg-[var(--bg-tertiary)] border border-[var(--border-color)] rounded-xl text-white outline-none font-medium"
                                />
                            </div>
                            <div>
                                <label className="text-[var(--text-secondary)] text-xs uppercase tracking-wide block mb-2 font-bold">
                                    Category
                                </label>
                                <select
                                    value={item.category}
                                    onChange={(e) => updateItem(item.id, { category: e.target.value })}
                                    className="w-full px-4 py-3 bg-[var(--bg-tertiary)] border border-[var(--border-color)] rounded-xl text-white outline-none font-medium"
                                >
                                    {['Produce', 'Dairy', 'Meat', 'Pantry', 'Frozen', 'Beverages', 'Grocery'].map(option => (
                                        <option key={option} value={option}>{option}</option>
                                    ))}
                                </select>
                            </div>
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
                                    <input
                                        type="number"
                                        min="1"
                                        value={item.quantity}
                                        onChange={(e) => updateItem(item.id, { quantity: Math.max(1, Number(e.target.value) || 1) })}
                                        className="w-14 text-center text-white font-bold text-lg bg-transparent outline-none"
                                    />
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
                    </section>
                ))}

                {/* Add Manual Item */}
                <button
                    onClick={addManualItem}
                    className="w-full py-5 border-2 border-dashed border-[var(--border-color)] rounded-3xl text-[var(--text-secondary)] flex items-center justify-center gap-2 hover:border-[var(--accent-color)] hover:text-[var(--accent-color)] transition-all inventory-card font-semibold"
                >
                    <Plus className="w-5 h-5" />
                    Add another item manually
                </button>
            </div>

            {/* Confirm Button */}
            <div className="p-4 pb-8">
                {onScanAnother && (
                    <button
                        type="button"
                        onClick={onScanAnother}
                        className="mb-3 w-full py-4 bg-[var(--bg-secondary)] text-white font-bold rounded-3xl border border-[var(--border-color)] inventory-card"
                    >
                        Scan another receipt
                    </button>
                )}
                <button
                    onClick={handleConfirm}
                    disabled={items.length === 0 || isSubmitting || items.every(i => !i.expirationDate)}
                    className="w-full py-5 bg-[var(--accent-color)] text-white font-bold rounded-3xl flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed action-button glow-green text-lg"
                >
                    <Check className="w-6 h-6" />
                    {isSubmitting ? 'Adding...' : `Confirm & Add ${items.filter(i => i.expirationDate).length} Item${items.filter(i => i.expirationDate).length !== 1 ? 's' : ''}`}
                </button>
            </div>
        </div>
    );
}
