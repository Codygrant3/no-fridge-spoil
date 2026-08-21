import { useEffect, useMemo, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
    ArrowCounterClockwise,
    Basket,
    Bread,
    Check,
    Checks,
    Coffee,
    DotsThree,
    Drop,
    Egg,
    Minus,
    Package,
    Plus,
    Trash,
    X,
} from '@phosphor-icons/react';
import { db, type DbShoppingItem } from '../db/database';
import { useOptionalAuth } from '../context/AuthContext';
import { belongsToActiveHousehold, localMutationFields } from '../services/localMutationService';
import { shoppingCategory } from '../services/shoppingActionService';

const CATEGORIES = {
    produce: { label: 'Produce', tone: 'produce' },
    dairy: { label: 'Dairy & eggs', tone: 'dairy' },
    meat: { label: 'Meat & seafood', tone: 'meat' },
    frozen: { label: 'Frozen', tone: 'frozen' },
    pantry: { label: 'Pantry', tone: 'pantry' },
    beverages: { label: 'Beverages', tone: 'beverages' },
    other: { label: 'Other', tone: 'other' },
};

const RUNNING_LOW = [
    { name: 'Eggs', icon: Egg },
    { name: 'Oat milk', icon: Drop },
    { name: 'Coffee beans', icon: Coffee },
    { name: 'Bread', icon: Bread },
    { name: 'Butter', icon: Package },
];

export function ShoppingList() {
    const auth = useOptionalAuth();
    const configured = auth?.configured ?? false;
    const activeHousehold = auth?.activeHousehold ?? null;
    const [newItemName, setNewItemName] = useState('');
    const [isMenuOpen, setIsMenuOpen] = useState(false);
    const [feedback, setFeedback] = useState<string | null>(null);
    const [pendingUndo, setPendingUndo] = useState<DbShoppingItem[] | null>(null);
    const menuTriggerRef = useRef<HTMLButtonElement>(null);
    const menuRef = useRef<HTMLDivElement>(null);

    const items = useLiveQuery(
        () => db.shoppingList.orderBy('addedAt').reverse().toArray().then(records => records.filter(item => (
            item.isDeleted !== 1
            && belongsToActiveHousehold(item, configured, activeHousehold?.id ?? null)
        ))),
        [configured, activeHousehold?.id],
        [],
    );

    const checkedCount = items?.filter(item => item.isChecked).length || 0;
    const totalCount = items?.length || 0;
    const efficiencyScore = totalCount > 0 ? Math.round((checkedCount / totalCount) * 100) : 0;

    const groupedItems = useMemo(() => {
        const groups: Record<string, DbShoppingItem[]> = {};
        items?.forEach(item => {
            const category = item.category || 'other';
            groups[category] ??= [];
            groups[category].push(item);
        });
        return groups;
    }, [items]);

    const addItem = async (name?: string) => {
        const itemName = name || newItemName.trim();
        if (!itemName) return;
        const existing = items?.find(item => item.name.trim().toLowerCase() === itemName.toLowerCase());
        if (existing) {
            const nextQuantity = existing.quantity + 1;
            await db.shoppingList.update(existing.id, {
                quantity: nextQuantity,
                isChecked: false,
                ...localMutationFields(existing.cloudHouseholdId),
            });
            setNewItemName('');
            setPendingUndo(null);
            setFeedback(`${existing.name} quantity updated to ${nextQuantity}.`);
            return;
        }

        await db.shoppingList.add({
            id: crypto.randomUUID(),
            name: itemName,
            quantity: 1,
            addedAt: new Date().toISOString(),
            isChecked: false,
            category: shoppingCategory(itemName),
            isDeleted: 0,
            ...localMutationFields(),
        });

        setNewItemName('');
        setPendingUndo(null);
        setFeedback(`${itemName} added to list.`);
    };

    const toggleItem = async (id: string, currentState: boolean) => {
        const item = await db.shoppingList.get(id);
        if (!item) return;
        await db.shoppingList.update(id, {
            isChecked: !currentState,
            ...localMutationFields(item.cloudHouseholdId),
        });
    };

    const changeQuantity = async (item: DbShoppingItem, delta: number) => {
        const quantity = Math.max(1, item.quantity + delta);
        if (quantity === item.quantity) return;
        await db.shoppingList.update(item.id, {
            quantity,
            ...localMutationFields(item.cloudHouseholdId),
        });
        setPendingUndo(null);
        setFeedback(`${item.name} quantity updated to ${quantity}.`);
    };

    const removeShoppingItem = async (item: DbShoppingItem) => {
        setPendingUndo([{ ...item }]);
        await db.shoppingList.update(item.id, {
            isDeleted: 1,
            ...localMutationFields(item.cloudHouseholdId),
        });
        setFeedback(`${item.name} removed from list.`);
    };

    const markAllCollected = async () => {
        if (!items?.length) return;
        await db.shoppingList.where('id').anyOf(items.map(item => item.id)).modify(item => {
            item.isChecked = true;
            Object.assign(item, localMutationFields(item.cloudHouseholdId));
        });
        setFeedback('All items marked collected.');
        setPendingUndo(null);
        setIsMenuOpen(false);
    };

    const clearCollected = async () => {
        const checkedItems = items?.filter(item => item.isChecked) || [];
        if (checkedItems.length === 0) return;
        setPendingUndo(checkedItems.map(item => ({ ...item })));
        await db.shoppingList.where('id').anyOf(checkedItems.map(item => item.id)).modify(item => {
            item.isDeleted = 1;
            Object.assign(item, localMutationFields(item.cloudHouseholdId));
        });
        setFeedback(`${checkedItems.length} collected item${checkedItems.length === 1 ? '' : 's'} cleared.`);
        setIsMenuOpen(false);
    };

    const clearList = async () => {
        if (!items?.length) return;
        const count = items.length;
        setPendingUndo(items.map(item => ({ ...item })));
        await db.shoppingList.where('id').anyOf(items.map(item => item.id)).modify(item => {
            item.isDeleted = 1;
            Object.assign(item, localMutationFields(item.cloudHouseholdId));
        });
        setFeedback(`${count} item${count === 1 ? '' : 's'} cleared from list.`);
        setIsMenuOpen(false);
    };

    const undoClear = async () => {
        if (!pendingUndo?.length) return;
        await db.transaction('rw', db.shoppingList, async () => {
            await db.shoppingList.bulkPut(pendingUndo.map(item => ({
                ...item,
                isDeleted: 0,
                ...localMutationFields(item.cloudHouseholdId),
            })));
        });
        setFeedback(`${pendingUndo.length} item${pendingUndo.length === 1 ? '' : 's'} restored.`);
        setPendingUndo(null);
    };

    useEffect(() => {
        if (!isMenuOpen) return;
        const focusFrame = window.requestAnimationFrame(() => {
            menuRef.current?.querySelector<HTMLButtonElement>('button:not([disabled])')?.focus();
        });
        const closeMenu = () => {
            setIsMenuOpen(false);
            window.requestAnimationFrame(() => menuTriggerRef.current?.focus());
        };
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                event.preventDefault();
                closeMenu();
                return;
            }
            if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
            const controls = Array.from(menuRef.current?.querySelectorAll<HTMLButtonElement>('button:not([disabled])') ?? []);
            if (controls.length === 0) return;
            event.preventDefault();
            const currentIndex = controls.indexOf(document.activeElement as HTMLButtonElement);
            const nextIndex = event.key === 'Home'
                ? 0
                : event.key === 'End'
                    ? controls.length - 1
                    : event.key === 'ArrowDown'
                        ? (currentIndex + 1 + controls.length) % controls.length
                        : (currentIndex - 1 + controls.length) % controls.length;
            controls[nextIndex].focus();
        };
        document.addEventListener('keydown', handleKeyDown);
        return () => {
            window.cancelAnimationFrame(focusFrame);
            document.removeEventListener('keydown', handleKeyDown);
        };
    }, [isMenuOpen]);

    return (
        <div className="editorial-page shopping-page">
            <header className="editorial-page-header">
                <div>
                    <p className="editorial-kicker">Next market run</p>
                    <h1>Shopping list</h1>
                </div>
                <div className="relative">
                    <button
                        ref={menuTriggerRef}
                        type="button"
                        className="market-icon-button editorial-header-action"
                        onClick={() => setIsMenuOpen(open => !open)}
                        aria-label="Shopping list options"
                        aria-expanded={isMenuOpen}
                        aria-haspopup="menu"
                        aria-controls={isMenuOpen ? 'shopping-list-menu' : undefined}
                    >
                        <DotsThree size={24} weight="bold" />
                    </button>

                    {isMenuOpen && (
                        <>
                            <button
                                type="button"
                                className="fixed inset-0 z-40 cursor-default"
                                aria-label="Close shopping list options"
                                onClick={() => setIsMenuOpen(false)}
                            />
                            <div id="shopping-list-menu" ref={menuRef} className="editorial-menu" role="menu">
                                <button role="menuitem" type="button" onClick={markAllCollected} disabled={!items?.length || checkedCount === totalCount}>
                                    <Checks size={18} />
                                    Mark all collected
                                </button>
                                <button role="menuitem" type="button" onClick={clearCollected} disabled={checkedCount === 0}>
                                    <ArrowCounterClockwise size={18} />
                                    Clear collected
                                </button>
                                <button role="menuitem" type="button" className="is-destructive" onClick={clearList} disabled={!items?.length}>
                                    <Trash size={18} />
                                    Clear list
                                </button>
                            </div>
                        </>
                    )}
                </div>
            </header>

            {feedback && (
                <div className="editorial-toast" role="status">
                    <span>{feedback}</span>
                    {pendingUndo && (
                        <button type="button" onClick={() => void undoClear()}>Undo</button>
                    )}
                    <button
                        type="button"
                        onClick={() => {
                            setFeedback(null);
                            setPendingUndo(null);
                        }}
                        aria-label="Dismiss shopping list feedback"
                    >
                        <X size={16} />
                    </button>
                </div>
            )}

            <section className="editorial-summary-band shopping-progress" aria-label="Shopping progress">
                <Basket size={25} weight="duotone" />
                <div>
                    <strong>{efficiencyScore}% collected</strong>
                    <span>{checkedCount} of {totalCount} items ready</span>
                </div>
                <div className="editorial-progress-track" aria-hidden="true">
                    <div style={{ width: `${efficiencyScore}%` }} />
                </div>
            </section>

            <section className="shopping-add-section" aria-label="Add a shopping item">
                <label className="shopping-add-field">
                    <input
                        value={newItemName}
                        onChange={event => setNewItemName(event.target.value)}
                        onKeyDown={event => event.key === 'Enter' && void addItem()}
                        placeholder="Add milk, avocados, bread..."
                        aria-label="Item name"
                    />
                </label>
                <button type="button" className="shopping-add-button" onClick={() => void addItem()} aria-label="Add item">
                    <Plus size={23} weight="bold" />
                </button>
            </section>

            <section className="editorial-section" aria-labelledby="quick-add-heading">
                <div className="editorial-section-heading">
                    <h2 id="quick-add-heading">Running low</h2>
                    <span>Quick add</span>
                </div>
                <div className="shopping-quick-add">
                    {RUNNING_LOW.map(({ name, icon: Icon }) => (
                        <button key={name} type="button" onClick={() => void addItem(name)}>
                            <Icon size={20} weight="duotone" />
                            <span>{name}</span>
                            <Plus size={14} weight="bold" />
                        </button>
                    ))}
                </div>
            </section>

            {Object.entries(groupedItems).map(([category, categoryItems]) => {
                const categoryInfo = CATEGORIES[category as keyof typeof CATEGORIES] || CATEGORIES.other;
                const unchecked = categoryItems.filter(item => !item.isChecked);
                const checked = categoryItems.filter(item => item.isChecked);

                return (
                    <section key={category} className="editorial-section" aria-labelledby={`shopping-${category}`}>
                        <div className="editorial-section-heading">
                            <h2 id={`shopping-${category}`}>{categoryInfo.label}</h2>
                            <span className={`editorial-count tone-${categoryInfo.tone}`}>{unchecked.length}</span>
                        </div>
                        <div className="shopping-list-rows">
                            {[...unchecked, ...checked].map(item => (
                                <div
                                    key={item.id}
                                    className={`shopping-list-row ${item.isChecked ? 'is-checked' : ''}`}
                                >
                                    <button
                                        type="button"
                                        className="shopping-row-toggle"
                                        onClick={() => void toggleItem(item.id, item.isChecked)}
                                        aria-label={`${item.isChecked ? 'Mark not collected' : 'Mark collected'}: ${item.name}`}
                                    >
                                        <span className="shopping-check">
                                            {item.isChecked && <Check size={15} weight="bold" />}
                                        </span>
                                        <span className="shopping-item-copy">
                                            <strong>{item.name}</strong>
                                            {item.metadata && <small>{item.metadata}</small>}
                                            {item.lastBought && (
                                                <small>Last bought {Math.round((Date.now() - new Date(item.lastBought).getTime()) / 86_400_000)} days ago</small>
                                            )}
                                        </span>
                                    </button>
                                    <span className="shopping-item-controls">
                                        <button
                                            type="button"
                                            onClick={() => void changeQuantity(item, -1)}
                                            disabled={item.quantity <= 1}
                                            aria-label={`Decrease ${item.name} quantity`}
                                        >
                                            <Minus size={13} weight="bold" />
                                        </button>
                                        <span className="shopping-quantity" aria-label={`${item.quantity} ${item.unit || 'items'}`}>
                                            {item.quantity}{item.unit || ''}
                                        </span>
                                        <button
                                            type="button"
                                            onClick={() => void changeQuantity(item, 1)}
                                            aria-label={`Increase ${item.name} quantity`}
                                        >
                                            <Plus size={13} weight="bold" />
                                        </button>
                                        <button
                                            type="button"
                                            className="is-remove"
                                            onClick={() => void removeShoppingItem(item)}
                                            aria-label={`Remove ${item.name} from list`}
                                        >
                                            <Trash size={14} />
                                        </button>
                                    </span>
                                </div>
                            ))}
                        </div>
                    </section>
                );
            })}

            {(!items || items.length === 0) && (
                <div className="editorial-empty-state shopping-empty">
                    <Basket size={40} weight="duotone" />
                    <h2>Your list is empty</h2>
                    <p>Add an item above or use a running-low shortcut.</p>
                </div>
            )}
        </div>
    );
}
