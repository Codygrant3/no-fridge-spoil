import { useEffect, useMemo, useRef, useState } from 'react';
import {
    AlertTriangle,
    Calendar,
    Check,
    ChevronLeft,
    Drumstick,
    Eye,
    Info,
    Leaf,
    Merge,
    Milk,
    Minus,
    Package,
    Plus,
    Sparkles,
    Wheat,
    X,
} from 'lucide-react';
import { useInventory } from '../context/InventoryContext';
import { generateUUID } from '../utils/uuid';
import { getShelfLifeDefaults, estimateExpirationDate } from '../services/sealedShelfLifeService';
import { saveReceiptAliasCorrections } from '../services/receiptAliasService';
import type { ReceiptItemResolution } from '../services/receiptOCRService';
import type { StorageLocation } from '../types';
import { isValidDateOnly, normalizeDateOnly } from '../utils/dateValidation';

export interface ScannedItem {
    id: string;
    name: string;
    brand?: string;
    category: string;
    confidence: 'High' | 'Medium' | 'Low';
    expirationDate: string;
    quantity: number;
    price?: string;
    imageUrl?: string;
    sourceImageUrl?: string;
    sourceLine?: string;
    sourceRegion?: string;
    originalName?: string;
    resolution?: ReceiptItemResolution;
    resolutionDecision?: 'auto' | 'proposal' | 'alternative' | 'manual' | 'original';
    fieldConfidence?: {
        name?: 'High' | 'Medium' | 'Low';
        quantity?: 'High' | 'Medium' | 'Low';
        price?: 'High' | 'Medium' | 'Low';
    };
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
        fieldConfidence?: {
            storeName?: 'High' | 'Medium' | 'Low';
            date?: 'High' | 'Medium' | 'Low';
        };
        resolutionMode?: 'shadow';
        resolutionStats?: {
            proposed: number;
            autoAccepted: number;
            needsReview: number;
            barcodeMatches: number;
        };
    };
}

type ReviewConfidence = 'High' | 'Medium' | 'Low';

const QUICK_IDENTIFY_ITEMS = [
    { name: 'Apple', category: 'Produce' },
    { name: 'Banana', category: 'Produce' },
    { name: 'Avocado', category: 'Produce' },
    { name: 'Tomato', category: 'Produce' },
    { name: 'Lettuce', category: 'Produce' },
    { name: 'Onion', category: 'Produce' },
    { name: 'Potato', category: 'Produce' },
] as const;

function ConfidenceBadge({ value }: { value?: ReviewConfidence }) {
    if (!value) return null;
    return (
        <span className={`review-confidence-badge is-${value.toLowerCase()}`}>
            {value}
        </span>
    );
}

function itemNeedsReview(item: ScannedItem): boolean {
    return item.confidence === 'Low'
        || Object.values(item.fieldConfidence ?? {}).some(value => value === 'Low')
        || (item.wasAutoFilled === true && item.autoFillConfidence === 'low')
        || item.resolution?.shouldReview === true;
}

function normalizedName(value: string): string {
    return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function hasResolutionProposal(item: ScannedItem): boolean {
    return Boolean(
        item.resolution
        && normalizedName(item.resolution.proposedName) !== normalizedName(item.originalName ?? item.name),
    );
}

function packageSummary(item: ScannedItem): string[] {
    const details: string[] = [];
    const packageInfo = item.resolution?.packageInfo;
    if (packageInfo?.count) details.push(`${packageInfo.count} count`);
    if (packageInfo?.size && packageInfo.unit) details.push(`${packageInfo.size} ${packageInfo.unit}`);
    const weight = item.resolution?.soldByWeight;
    if (weight) details.push(`${weight.value} ${weight.unit} by weight`);
    if (item.resolution?.barcode) details.push(`Barcode ${item.resolution.barcode}`);
    else if (item.resolution?.itemCode) details.push(`Receipt code ${item.resolution.itemCode}`);
    return details;
}

const getProductImage = (name: string): string | undefined => {
    const nameLower = name.toLowerCase();
    if (nameLower.includes('yogurt')) return '/market/greek-yogurt.webp';
    if (nameLower.includes('spinach')) return '/market/baby-spinach.webp';
    if (nameLower.includes('salmon')) return '/market/salmon-fillet.webp';
    return undefined;
};

function ReviewItemVisual({ item }: { item: ScannedItem }) {
    const productImage = item.imageUrl || getProductImage(item.name);
    if (productImage) {
        return <img src={productImage} alt="" loading="lazy" decoding="async" />;
    }

    const name = item.name.toLowerCase();
    const category = item.category.toLowerCase();
    if (name.includes('milk') || name.includes('yogurt') || category.includes('dairy')) return <Milk aria-hidden="true" />;
    if (name.includes('chicken') || category.includes('meat')) return <Drumstick aria-hidden="true" />;
    if (name.includes('bread') || category.includes('pantry')) return <Wheat aria-hidden="true" />;
    if (category.includes('produce')) return <Leaf aria-hidden="true" />;
    return <Package aria-hidden="true" />;
}

// Apply smart shelf-life defaults to scanned items missing expiration dates
function applySmartDefaults(items: ScannedItem[]): ScannedItem[] {
    return items.map(item => {
        // Only auto-fill if no expiration date was detected by AI
        if (isValidDateOnly(item.expirationDate)) return item;

        const defaults = getShelfLifeDefaults(item.name);
        if (!defaults) return { ...item, expirationDate: '' };

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
    const [isReceiptPreviewExpanded, setIsReceiptPreviewExpanded] = useState(false);
    const [showDuplicateMerge, setShowDuplicateMerge] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [feedback, setFeedback] = useState<{ type: 'success' | 'warning' | 'error'; message: string } | null>(null);
    const [approvedItemIds, setApprovedItemIds] = useState<Set<string>>(() => new Set());
    const [receiptDetails, setReceiptDetails] = useState(() => ({
        storeName: receiptMeta?.storeName ?? '',
        date: receiptMeta?.date ?? '',
    }));
    const confirmTimeoutRef = useRef<number | null>(null);
    const duplicateTriggerRef = useRef<HTMLButtonElement>(null);
    const duplicateCloseRef = useRef<HTMLButtonElement>(null);
    const autoFilledCount = useMemo(() => items.filter(i => i.wasAutoFilled).length, [items]);
    const lowConfidenceItemIds = useMemo(
        () => items.filter(itemNeedsReview).map(item => item.id),
        [items],
    );
    const receiptLowConfidenceCount = Object.values(receiptMeta?.fieldConfidence ?? {})
        .filter(value => value === 'Low').length;
    const lowConfidenceFieldCount = useMemo(() => items.reduce((count, item) => (
        count
        + (item.confidence === 'Low' ? 1 : 0)
        + Object.values(item.fieldConfidence ?? {}).filter(value => value === 'Low').length
        + (item.wasAutoFilled && item.autoFillConfidence === 'low' ? 1 : 0)
        + (item.resolution?.shouldReview ? 1 : 0)
    ), receiptLowConfidenceCount), [items, receiptLowConfidenceCount]);
    const outstandingReviewCount = lowConfidenceItemIds.filter(id => !approvedItemIds.has(id)).length;
    const pendingResolutionIds = lowConfidenceItemIds.filter(id => {
        const item = items.find(candidate => candidate.id === id);
        return item ? hasResolutionProposal(item) && item.resolution?.autoAccepted !== true : false;
    });
    const bulkApprovableIds = lowConfidenceItemIds.filter(id => !pendingResolutionIds.includes(id));
    const duplicateNames = useMemo(() => items
        .filter(item => inventoryItems.some(existing =>
            existing.name.trim().toLowerCase() === item.name.trim().toLowerCase()
        ))
        .map(item => item.name), [inventoryItems, items]);
    const groupedItems = useMemo(() => [...items].sort((a, b) => {
        const rank = { Low: 0, Medium: 1, High: 2 };
        return rank[a.confidence] - rank[b.confidence];
    }).reduce<Record<string, ScannedItem[]>>((groups, item) => {
        const category = item.category || 'Grocery';
        groups[category] = groups[category] || [];
        groups[category].push(item);
        return groups;
    }, {}), [items]);

    useEffect(() => () => {
        if (confirmTimeoutRef.current !== null) {
            window.clearTimeout(confirmTimeoutRef.current);
        }
    }, []);

    useEffect(() => {
        if (!showDuplicateMerge) return;
        const trigger = duplicateTriggerRef.current;
        duplicateCloseRef.current?.focus();
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') setShowDuplicateMerge(false);
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => {
            window.removeEventListener('keydown', handleKeyDown);
            trigger?.focus();
        };
    }, [showDuplicateMerge]);

    const updateItem = (id: string, updates: Partial<ScannedItem>) => {
        setItems(prev => prev.map(item =>
            item.id === id ? { ...item, ...updates } : item
        ));
    };

    const removeItem = (id: string) => {
        setItems(prev => prev.filter(item => item.id !== id));
        setApprovedItemIds(prev => {
            const next = new Set(prev);
            next.delete(id);
            return next;
        });
    };

    const approveItem = (id: string) => {
        setApprovedItemIds(prev => new Set(prev).add(id));
    };

    const approveAllSuggestions = () => {
        setApprovedItemIds(current => new Set([...current, ...bulkApprovableIds]));
        setFeedback({
            type: pendingResolutionIds.length > 0 ? 'warning' : 'success',
            message: pendingResolutionIds.length > 0
                ? 'OCR fields approved. Product-name suggestions still need an individual choice.'
                : 'All flagged OCR fields are approved.',
        });
    };

    const chooseResolvedName = (
        item: ScannedItem,
        name: string,
        decision: 'proposal' | 'alternative',
    ) => {
        const isPrimaryProposal = decision === 'proposal';
        const defaults = getShelfLifeDefaults(name);
        updateItem(item.id, {
            name,
            brand: isPrimaryProposal ? item.resolution?.proposedBrand ?? item.brand : item.brand,
            category: isPrimaryProposal
                ? item.resolution?.proposedCategory ?? defaults?.category ?? item.category
                : defaults?.category ?? item.category,
            expirationDate: item.expirationDate || (defaults ? estimateExpirationDate(defaults.sealedDays) : ''),
            suggestedStorage: defaults?.defaultStorage ?? item.suggestedStorage,
            suggestedDateType: defaults?.dateType ?? item.suggestedDateType,
            autoFillConfidence: defaults?.confidence ?? item.autoFillConfidence,
            wasAutoFilled: Boolean(defaults) || item.wasAutoFilled,
            resolutionDecision: decision,
        });
        approveItem(item.id);
    };

    const keepReceiptName = (item: ScannedItem) => {
        updateItem(item.id, {
            name: item.originalName ?? item.name,
            resolutionDecision: 'original',
        });
        approveItem(item.id);
    };

    const updateItemName = (item: ScannedItem, name: string) => {
        updateItem(item.id, { name, resolutionDecision: 'manual' });
        setApprovedItemIds(current => {
            const next = new Set(current);
            const originalName = item.originalName ?? '';
            if (name.trim() && normalizedName(name) !== normalizedName(originalName)) next.add(item.id);
            else next.delete(item.id);
            return next;
        });
    };

    const clearAll = () => {
        setItems([]);
    };

    const applyBulkExpirationDate = () => {
        if (!isValidDateOnly(bulkExpirationDate)) return;
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
            const itemsWithDate = items.filter(item => isValidDateOnly(item.expirationDate));
            const skippedCount = items.length - itemsWithDate.length;
            let addedCount = 0;
            let aliasSaveFailed = false;

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

            if (receiptMeta?.source !== 'sample' && receiptDetails.storeName.trim()) {
                const corrections = itemsWithDate.flatMap(item => {
                    const originalName = item.originalName?.trim();
                    if (
                        !originalName
                        || item.resolutionDecision === 'auto'
                        || item.resolutionDecision === 'original'
                        || normalizedName(item.name) === normalizedName(originalName)
                    ) return [];
                    return [{
                        merchantName: receiptDetails.storeName,
                        rawDescription: originalName,
                        canonicalName: item.name,
                        brand: item.brand,
                        category: item.category,
                    }];
                });
                if (corrections.length > 0) {
                    try {
                        await saveReceiptAliasCorrections(corrections);
                    } catch {
                        aliasSaveFailed = true;
                    }
                }
            }

            if (aliasSaveFailed && addedCount > 0) {
                setFeedback({
                    type: 'warning',
                    message: 'Items were added, but the receipt corrections could not be saved for future scans.',
                });
                confirmTimeoutRef.current = window.setTimeout(() => onConfirm(items), 2000);
                return;
            }

            // Show feedback based on results
            if (skippedCount > 0 && addedCount > 0) {
                setFeedback({
                    type: 'warning',
                    message: `Added ${addedCount} item${addedCount !== 1 ? 's' : ''}. ${skippedCount} item${skippedCount !== 1 ? 's' : ''} without expiration date${skippedCount !== 1 ? 's were' : ' was'} skipped.`
                });
                // Delay closing to show feedback
                confirmTimeoutRef.current = window.setTimeout(() => onConfirm(items), 2000);
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

    const itemsWithoutDate = items.filter(item => !isValidDateOnly(item.expirationDate)).length;

    return (
        <div className="market-review-page min-h-full bg-[var(--bg-primary)] flex flex-col">
            {/* Header */}
            <header className="market-review-header flex items-center justify-between p-4 pt-12">
                <button
                    onClick={onClose}
                    aria-label="Back from review"
                    className="market-icon-button text-white p-2 bg-[var(--bg-secondary)] rounded-lg border border-[var(--border-color)] inventory-card"
                >
                    <ChevronLeft className="w-6 h-6" />
                </button>
                <h1 className="text-white text-lg font-bold">Review groceries</h1>
                <button
                    onClick={clearAll}
                    className="text-[var(--accent-color)] text-sm font-bold"
                >
                    Clear All
                </button>
            </header>

            {/* Items Count */}
            <div className="market-review-intro px-4 pb-4">
                <p className="market-kicker">Receipt scan</p>
                <h2 className="text-white text-3xl font-bold">{items.length} items found</h2>
                <p className="text-[var(--text-secondary)] text-sm font-medium mt-1">Review details before adding to fridge</p>
            </div>

            {receiptMeta && (
                <ol className="market-receipt-journey is-review" aria-label="Receipt scan progress">
                    {['Capture', 'Processing', 'Review'].map((label, index) => (
                        <li key={label} className={index < 2 ? 'is-complete' : 'is-current'} aria-current={index === 2 ? 'step' : undefined}>
                            <span>{index < 2 ? <Check className="w-3 h-3" /> : index + 1}</span>
                            {label}
                        </li>
                    ))}
                </ol>
            )}

            {receiptMeta && (
                <div className="px-4 pb-4">
                    <div className="market-receipt-metadata-review inventory-card">
                        <div className="market-receipt-metadata-heading">
                            <div>
                                <p className="market-kicker">Receipt details</p>
                                <h3>Confirm the source</h3>
                            </div>
                            <span>{items.length} food items</span>
                        </div>
                        <div className="market-receipt-metadata-fields">
                            <label>
                                <span>
                                    Store name
                                    <ConfidenceBadge value={receiptMeta.fieldConfidence?.storeName} />
                                </span>
                                <input
                                    type="text"
                                    value={receiptDetails.storeName}
                                    onChange={event => setReceiptDetails(current => ({ ...current, storeName: event.target.value }))}
                                    placeholder="Store not detected"
                                />
                            </label>
                            <label>
                                <span>
                                    Receipt date
                                    <ConfidenceBadge value={receiptMeta.fieldConfidence?.date} />
                                </span>
                                <input
                                    type="date"
                                    value={receiptDetails.date}
                                    onChange={event => setReceiptDetails(current => ({ ...current, date: event.target.value }))}
                                />
                            </label>
                        </div>
                        <div className="market-receipt-metadata-footnote">
                            <span>{receiptMeta.source === 'sample' ? 'Sample receipt' : 'OCR receipt'}</span>
                            <span>{receiptMeta.cacheHit ? 'Cache hit' : 'Fresh OCR'}</span>
                            <span>Estimated OCR cost {receiptMeta.estimatedCostCents ?? 0}c</span>
                            {receiptMeta.resolutionStats && receiptMeta.resolutionStats.proposed > 0 && (
                                <span>{receiptMeta.resolutionStats.proposed} product match{receiptMeta.resolutionStats.proposed === 1 ? '' : 'es'} suggested</span>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {receiptMeta?.previewUrl && (
                <div className="px-4 pb-4">
                    <div className="rounded-2xl border border-[var(--border-color)] bg-[var(--bg-secondary)] inventory-card overflow-hidden">
                        <button
                            type="button"
                            onClick={() => setIsReceiptPreviewExpanded(prev => !prev)}
                            className="w-full flex items-center justify-between gap-3 p-4 text-left"
                            aria-expanded={isReceiptPreviewExpanded}
                        >
                            <span>
                                <span className="block text-white text-sm font-bold">Receipt preview</span>
                                <span className="block text-[var(--text-secondary)] text-xs mt-1">
                                    {isReceiptPreviewExpanded ? 'Hide image to focus on items' : 'Expand to inspect source image'}
                                </span>
                            </span>
                            <span className="inline-flex items-center gap-2 rounded-xl bg-emerald-500/15 px-3 py-2 text-xs font-bold text-emerald-200">
                                <Eye className="w-4 h-4" />
                                {isReceiptPreviewExpanded ? 'Hide' : 'Expand'}
                            </span>
                        </button>
                        {isReceiptPreviewExpanded && (
                            <img
                                src={receiptMeta.previewUrl}
                                alt="Receipt preview"
                                loading="lazy"
                                decoding="async"
                                className="max-h-64 w-full object-cover border-t border-[var(--border-color)]"
                            />
                        )}
                    </div>
                </div>
            )}

            {lowConfidenceFieldCount > 0 && (
                <div className="px-4 pb-4">
                    <div className={`market-review-confidence-summary ${outstandingReviewCount === 0 ? 'is-approved' : ''}`} role="status" aria-live="polite">
                        <div>
                            <p>{outstandingReviewCount === 0 ? 'Review complete' : 'Check uncertain fields'}</p>
                            <span>
                                {outstandingReviewCount === 0
                                    ? `${lowConfidenceFieldCount} flagged field${lowConfidenceFieldCount === 1 ? '' : 's'} approved.`
                                    : `${lowConfidenceFieldCount} low-confidence field${lowConfidenceFieldCount === 1 ? '' : 's'} across ${outstandingReviewCount} item${outstandingReviewCount === 1 ? '' : 's'}.`}
                            </span>
                        </div>
                        {outstandingReviewCount > 0 && bulkApprovableIds.length > 0 && (
                            <button type="button" onClick={approveAllSuggestions}>
                                <Check className="w-4 h-4" />
                                Approve OCR flags
                            </button>
                        )}
                    </div>
                </div>
            )}

            {/* Smart Defaults Banner */}
            {autoFilledCount > 0 && (
                <div className="px-4 pb-4">
                    <div className="market-review-smart rounded-xl p-4 flex items-start gap-3 inventory-card">
                        <Sparkles className="w-5 h-5 shrink-0 mt-0.5" />
                        <p className="text-sm font-medium">
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
                        <button
                            ref={duplicateTriggerRef}
                            type="button"
                            onClick={() => setShowDuplicateMerge(true)}
                            className="ml-auto shrink-0 px-3 py-1.5 rounded-lg bg-blue-400/20 text-blue-100 text-xs font-bold"
                        >
                            Review
                        </button>
                    </div>
                </div>
            )}

            {showDuplicateMerge && (
                <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/70 p-4">
                    <div
                        className="w-full max-w-md rounded-3xl border border-[var(--border-color)] bg-[var(--bg-primary)] p-5 inventory-card"
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="duplicate-merge-title"
                    >
                        <div className="flex items-start justify-between gap-3">
                            <div>
                                <h3 id="duplicate-merge-title" className="text-white text-lg font-bold">Merge duplicate items</h3>
                                <p className="text-[var(--text-secondary)] text-sm mt-1">
                                    Choose how to handle {duplicateNames.length} item{duplicateNames.length !== 1 ? 's' : ''} already in inventory.
                                </p>
                            </div>
                            <button
                                ref={duplicateCloseRef}
                                type="button"
                                onClick={() => setShowDuplicateMerge(false)}
                                aria-label="Close duplicate merge"
                                className="rounded-xl bg-[var(--bg-secondary)] p-2 text-[var(--text-secondary)]"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                        <div className="mt-4 space-y-2">
                            {[
                                ['quantity', 'Merge quantity', 'Add scanned quantities to matching inventory items.'],
                                ['expiration', 'Replace date', 'Keep quantities but update matching expiration dates.'],
                                ['separate', 'Keep separate', 'Leave duplicates as individual scanned items.'],
                            ].map(([value, label, description]) => (
                                <label key={value} className="flex gap-3 rounded-2xl border border-[var(--border-color)] bg-[var(--bg-secondary)] p-3">
                                    <input
                                        type="radio"
                                        name="mergeMode"
                                        checked={mergeMode === value}
                                        onChange={() => setMergeMode(value as typeof mergeMode)}
                                    />
                                    <span>
                                        <span className="block text-white text-sm font-bold">{label}</span>
                                        <span className="block text-[var(--text-secondary)] text-xs mt-1">{description}</span>
                                    </span>
                                </label>
                            ))}
                        </div>
                        <button
                            type="button"
                            onClick={async () => {
                                await mergeDuplicates();
                                setShowDuplicateMerge(false);
                            }}
                            className="mt-4 w-full py-4 rounded-2xl bg-blue-500/20 text-blue-100 font-bold flex items-center justify-center gap-2"
                        >
                            <Merge className="w-4 h-4" />
                            Apply duplicate choice
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
            <div className="market-review-content flex-1 overflow-y-auto px-4 space-y-5 pb-4">
                <div className="market-bulk-actions space-y-3 rounded-2xl bg-[var(--bg-secondary)] border border-[var(--border-color)] p-4 inventory-card">
                    <p className="text-white text-sm font-bold">Bulk actions</p>
                    <div className="grid grid-cols-[1fr_auto] gap-2">
                        <label className="sr-only" htmlFor="review-bulk-expiration">Expiration date for all items</label>
                        <input
                            id="review-bulk-expiration"
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
                        <label className="sr-only" htmlFor="review-bulk-category">Category for all items</label>
                        <select
                            id="review-bulk-category"
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
                                className={`market-review-item bg-[var(--bg-secondary)] rounded-3xl p-5 border inventory-card ${
                                    !isValidDateOnly(item.expirationDate) ? 'is-missing-date' : ''
                                } ${itemNeedsReview(item) && !approvedItemIds.has(item.id) ? 'needs-review' : ''}`}
                            >
                        {/* Item Header */}
                        <div className="flex items-start gap-4 mb-4">
                            {/* Product visual */}
                            <div className="market-review-product product-image rounded-3xl flex items-center justify-center overflow-hidden">
                                <ReviewItemVisual item={item} />
                            </div>

                            {/* Name & Category */}
                            <div className="market-review-item-copy flex-1">
                                <label className="sr-only" htmlFor={`review-name-${item.id}`}>Item name</label>
                                <textarea
                                    id={`review-name-${item.id}`}
                                    rows={2}
                                    value={item.name}
                                    onChange={(e) => updateItemName(item, e.target.value)}
                                    className="market-review-item-name text-white text-xl font-bold bg-transparent w-full outline-none"
                                />
                                {normalizedName(item.name) === 'unidentified item' && (
                                    <div className="mt-2" aria-label="Quick identify item">
                                        <p className="mb-2 text-[10px] font-bold uppercase text-[var(--text-muted)]">
                                            Quick identify
                                        </p>
                                        <div className="flex flex-wrap gap-2">
                                            {QUICK_IDENTIFY_ITEMS.map(option => (
                                                <button
                                                    key={option.name}
                                                    type="button"
                                                    onClick={() => {
                                                        updateItemName(item, option.name);
                                                        const defaults = getShelfLifeDefaults(option.name);
                                                        updateItem(item.id, {
                                                            category: option.category,
                                                            expirationDate: defaults
                                                                ? estimateExpirationDate(defaults.sealedDays)
                                                                : item.expirationDate,
                                                            suggestedStorage: defaults?.defaultStorage,
                                                            suggestedDateType: defaults?.dateType,
                                                            autoFillConfidence: defaults?.confidence,
                                                            wasAutoFilled: Boolean(defaults),
                                                        });
                                                    }}
                                                    className="rounded-md border border-[var(--border-color)] bg-[var(--bg-tertiary)] px-2.5 py-1.5 text-xs font-semibold text-white hover:border-[var(--accent-color)]"
                                                >
                                                    {option.name}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                )}
                                <div className="flex items-center gap-2 mt-1 flex-wrap">
                                    <span className={`text-xs flex items-center gap-1 font-semibold ${
                                        item.confidence === 'High' ? 'text-[var(--accent-color)]' :
                                        item.confidence === 'Medium' ? 'text-blue-300' :
                                        'text-[var(--warning-color)]'
                                    }`}>
                                        {item.confidence === 'High' && <Check className="w-3 h-3" />}
                                        {item.confidence} confidence
                                    </span>
                                    <ConfidenceBadge value={item.fieldConfidence?.name} />
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
                                    {item.resolution?.autoAccepted && (
                                        <span className="review-approved-badge">
                                            <Check className="w-3 h-3" />
                                            {item.resolution.method === 'catalog-alias' ? 'Verified match' : 'Learned match'}
                                        </span>
                                    )}
                                    {item.originalName && normalizedName(item.originalName) !== normalizedName(item.name) && (
                                        <span className="text-[var(--text-muted)] text-xs font-semibold">Receipt: {item.originalName}</span>
                                    )}
                                    {item.sourceLine && (
                                        <span className="text-[var(--text-muted)] text-xs font-semibold">Line: {item.sourceLine}</span>
                                    )}
                                    {item.sourceRegion && (
                                        <span className="text-[var(--text-muted)] text-xs font-semibold">Region: {item.sourceRegion}</span>
                                    )}
                                    {approvedItemIds.has(item.id) && (
                                        <span className="review-approved-badge"><Check className="w-3 h-3" /> Approved</span>
                                    )}
                                </div>
                            </div>

                            {itemNeedsReview(item) && !approvedItemIds.has(item.id) && !hasResolutionProposal(item) && (
                                <button
                                    type="button"
                                    onClick={() => approveItem(item.id)}
                                    className="review-approve-item"
                                >
                                    <Check className="w-4 h-4" />
                                    Approve
                                </button>
                            )}

                            {/* Remove Button */}
                            <button
                                onClick={() => removeItem(item.id)}
                                aria-label={`Remove ${item.name}`}
                                className="text-[var(--text-muted)] hover:text-[var(--danger-color)] p-2 bg-[var(--bg-tertiary)] rounded-lg border border-[var(--border-color)] inventory-card"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        {item.resolution && (
                            hasResolutionProposal(item)
                            || item.resolution.autoAccepted
                            || packageSummary(item).length > 0
                        ) && (
                            <section className="market-receipt-resolution" aria-label={`Product match for ${item.originalName ?? item.name}`}>
                                <div className="market-receipt-resolution-heading">
                                    <span>
                                        <Sparkles className="w-4 h-4" />
                                        {item.resolution.autoAccepted
                                            ? item.resolution.method === 'catalog-alias' ? 'Verified catalog match' : 'Learned household match'
                                            : item.resolution.method === 'barcode-lookup' ? 'Barcode match' : 'Suggested product match'}
                                    </span>
                                    <ConfidenceBadge value={item.resolution.confidence} />
                                </div>

                                {hasResolutionProposal(item) && (
                                    <div className="market-receipt-resolution-proposal">
                                        <div>
                                            <span>Proposed name</span>
                                            <strong>{item.resolution.proposedName}</strong>
                                            {item.resolution.proposedBrand && <small>{item.resolution.proposedBrand}</small>}
                                        </div>
                                        {!item.resolution.autoAccepted && !approvedItemIds.has(item.id) && (
                                            <button
                                                type="button"
                                                onClick={() => chooseResolvedName(item, item.resolution!.proposedName, 'proposal')}
                                            >
                                                <Check className="w-4 h-4" />
                                                Use suggestion
                                            </button>
                                        )}
                                    </div>
                                )}

                                {packageSummary(item).length > 0 && (
                                    <div className="market-receipt-resolution-facts">
                                        {packageSummary(item).map(detail => <span key={detail}>{detail}</span>)}
                                    </div>
                                )}

                                {!item.resolution.autoAccepted
                                    && !approvedItemIds.has(item.id)
                                    && item.resolution.alternatives.length > 0 && (
                                    <div className="market-receipt-resolution-alternatives">
                                        <span>Other possible matches</span>
                                        <div>
                                            {item.resolution.alternatives.map(alternative => (
                                                <button
                                                    type="button"
                                                    key={alternative}
                                                    onClick={() => chooseResolvedName(item, alternative, 'alternative')}
                                                >
                                                    {alternative}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {!item.resolution.autoAccepted
                                    && hasResolutionProposal(item)
                                    && !approvedItemIds.has(item.id) && (
                                    <button
                                        type="button"
                                        className="market-receipt-resolution-keep"
                                        onClick={() => keepReceiptName(item)}
                                    >
                                        Keep receipt text
                                    </button>
                                )}

                                {item.resolutionDecision && item.resolutionDecision !== 'auto' && approvedItemIds.has(item.id) && (
                                    <span className="market-receipt-resolution-selected">
                                        <Check className="w-4 h-4" /> Selection confirmed
                                    </span>
                                )}
                            </section>
                        )}

                        <div className="market-review-field-grid mb-4">
                            <div>
                                <label htmlFor={`review-brand-${item.id}`} className="text-[var(--text-secondary)] text-xs uppercase tracking-wide block mb-2 font-bold">
                                    Brand
                                </label>
                                <input
                                    id={`review-brand-${item.id}`}
                                    aria-label={`${item.name} brand`}
                                    type="text"
                                    value={item.brand || ''}
                                    onChange={(e) => updateItem(item.id, { brand: e.target.value })}
                                    placeholder="Optional"
                                    className="w-full px-4 py-3 bg-[var(--bg-tertiary)] border border-[var(--border-color)] rounded-xl text-white outline-none font-medium"
                                />
                            </div>
                            <div>
                                <label htmlFor={`review-category-${item.id}`} className="text-[var(--text-secondary)] text-xs uppercase tracking-wide block mb-2 font-bold">
                                    Category
                                </label>
                                <select
                                    id={`review-category-${item.id}`}
                                    aria-label={`${item.name} category`}
                                    value={item.category}
                                    onChange={(e) => updateItem(item.id, { category: e.target.value })}
                                    className="w-full px-4 py-3 bg-[var(--bg-tertiary)] border border-[var(--border-color)] rounded-xl text-white outline-none font-medium"
                                >
                                    {['Produce', 'Dairy', 'Meat', 'Pantry', 'Frozen', 'Beverages', 'Grocery'].map(option => (
                                        <option key={option} value={option}>{option}</option>
                                    ))}
                                </select>
                            </div>
                            {item.price !== undefined && (
                                <div>
                                    <label htmlFor={`review-price-${item.id}`} className="text-[var(--text-secondary)] text-xs uppercase tracking-wide flex items-center gap-2 mb-2 font-bold">
                                        Price
                                        <ConfidenceBadge value={item.fieldConfidence?.price} />
                                    </label>
                                    <input
                                        id={`review-price-${item.id}`}
                                        aria-label={`${item.name} price`}
                                        type="text"
                                        inputMode="decimal"
                                        value={item.price}
                                        onChange={(e) => updateItem(item.id, { price: e.target.value })}
                                        className="w-full px-4 py-3 bg-[var(--bg-tertiary)] border border-[var(--border-color)] rounded-xl text-white outline-none font-medium"
                                    />
                                </div>
                            )}
                        </div>

                        {/* Expiration & Quantity Row */}
                        <div className="flex items-end gap-4">
                            {/* Expiration Date */}
                            <div className="flex-1">
                                <label htmlFor={`review-expiration-${item.id}`} className="text-[var(--text-secondary)] text-xs uppercase tracking-wide block mb-2 font-bold">
                                    Expires On {!isValidDateOnly(item.expirationDate) && <span className="text-[var(--warning-color)]">(Required)</span>}
                                </label>
                                <div className="relative">
                                    <input
                                        id={`review-expiration-${item.id}`}
                                        aria-label={`${item.name} expiration date`}
                                        aria-invalid={!isValidDateOnly(item.expirationDate)}
                                        type="date"
                                        value={normalizeDateOnly(item.expirationDate)}
                                        onChange={(e) => updateItem(item.id, { expirationDate: e.target.value })}
                                        className={`w-full px-4 py-3 bg-[var(--bg-tertiary)] border rounded-xl text-white outline-none font-medium ${
                                            !isValidDateOnly(item.expirationDate)
                                                ? 'border-orange-500'
                                                : isExpiringSoon(item.expirationDate)
                                                    ? 'border-orange-500'
                                                    : 'border-[var(--border-color)]'
                                            }`}
                                    />
                                    {isValidDateOnly(item.expirationDate) && isExpiringSoon(item.expirationDate) && (
                                        <AlertTriangle className="absolute right-10 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--warning-color)]" />
                                    )}
                                    <Calendar className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)] pointer-events-none" />
                                </div>
                            </div>

                            {/* Quantity Controls */}
                            <div>
                                <label htmlFor={`review-quantity-${item.id}`} className="text-[var(--text-secondary)] text-xs uppercase tracking-wide block mb-2 font-bold">
                                    Quantity
                                    <ConfidenceBadge value={item.fieldConfidence?.quantity} />
                                </label>
                                <div className="flex items-center gap-2">
                                    <button
                                        onClick={() => updateItem(item.id, { quantity: Math.max(1, item.quantity - 1) })}
                                        aria-label={`Decrease ${item.name} quantity`}
                                        className="w-12 h-12 bg-[var(--accent-color)] rounded-xl flex items-center justify-center text-white action-button"
                                    >
                                        <Minus className="w-5 h-5" />
                                    </button>
                                    <input
                                        id={`review-quantity-${item.id}`}
                                        aria-label={`${item.name} quantity`}
                                        type="number"
                                        min="1"
                                        value={item.quantity}
                                        onChange={(e) => updateItem(item.id, { quantity: Math.max(1, Number(e.target.value) || 1) })}
                                        className="w-14 text-center text-white font-bold text-lg bg-transparent outline-none"
                                    />
                                    <button
                                        onClick={() => updateItem(item.id, { quantity: item.quantity + 1 })}
                                        aria-label={`Increase ${item.name} quantity`}
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
            <div className="market-review-footer p-4 pb-28">
                {outstandingReviewCount > 0 && (
                    <p className="market-review-footer-note" id="review-confidence-note">
                        Approve or correct {outstandingReviewCount} flagged item{outstandingReviewCount === 1 ? '' : 's'} before adding them.
                    </p>
                )}
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
                    disabled={items.length === 0 || isSubmitting || outstandingReviewCount > 0 || items.every(i => !isValidDateOnly(i.expirationDate))}
                    aria-describedby={outstandingReviewCount > 0 ? 'review-confidence-note' : undefined}
                    className="w-full py-5 bg-[var(--accent-color)] text-white font-bold rounded-3xl flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed action-button glow-green text-lg"
                >
                    <Check className="w-6 h-6" />
                    {isSubmitting ? 'Adding...' : `Confirm & Add ${items.filter(i => isValidDateOnly(i.expirationDate)).length} Item${items.filter(i => isValidDateOnly(i.expirationDate)).length !== 1 ? 's' : ''}`}
                </button>
            </div>
        </div>
    );
}
