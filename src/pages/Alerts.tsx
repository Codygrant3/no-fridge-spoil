import { useCallback, useEffect, useMemo, useState } from 'react';
import {
    Bell,
    CalendarBlank,
    CheckCircle,
    ClockCounterClockwise,
    Gear,
    Package,
    ShoppingCartSimple,
    Snowflake,
    Trash,
    X,
} from '@phosphor-icons/react';
import { useLiveQuery } from 'dexie-react-hooks';
import type { TabType } from '../components/BottomNav';
import { useInventory } from '../context/InventoryContext';
import { db, type DbSettings } from '../db/database';
import { NotificationService } from '../services/notificationService';
import { startScheduler } from '../services/notificationScheduler';
import { addInventoryItemToShoppingList } from '../services/shoppingActionService';
import { clearExpiredAlertSnoozes, isItemAlertSnoozed, snoozeItemAlert } from '../services/alertActionService';
import { daysUntilExpiration } from '../utils/dateUtils';

interface AlertsProps {
    onNavigate?: (tab: TabType) => void;
}

const foodImages: Array<{ terms: string[]; src: string }> = [
    { terms: ['yogurt', 'yoghurt'], src: '/market/greek-yogurt.webp' },
    { terms: ['spinach'], src: '/market/baby-spinach.webp' },
    { terms: ['salmon'], src: '/market/salmon-fillet.webp' },
];

function getFoodImage(name: string): string | undefined {
    const normalizedName = name.toLowerCase();
    return foodImages.find(({ terms }) => terms.some(term => normalizedName.includes(term)))?.src;
}

export function Alerts({ onNavigate }: AlertsProps) {
    const { items, consumeItem, removeItem, updateItem } = useInventory();
    const settings = useLiveQuery(() => db.settings.get('user'), [], undefined);
    const [now, setNow] = useState(() => Date.now());
    const [snoozeClock, setSnoozeClock] = useState(now);
    const [showSettings, setShowSettings] = useState(false);
    const [feedback, setFeedback] = useState<string | null>(null);
    const warningDays = settings?.expirationWarningDays ?? 3;

    const getDaysUntil = useCallback((dateString: string): number => {
        return daysUntilExpiration(dateString, new Date(now));
    }, [now]);

    useEffect(() => {
        clearExpiredAlertSnoozes(Math.max(now, snoozeClock));
    }, [now, snoozeClock]);

    useEffect(() => {
        const refreshClock = () => setNow(Date.now());
        const interval = window.setInterval(refreshClock, 60_000);
        const handleVisibilityChange = () => {
            if (document.visibilityState === 'visible') refreshClock();
        };
        document.addEventListener('visibilitychange', handleVisibilityChange);
        return () => {
            window.clearInterval(interval);
            document.removeEventListener('visibilitychange', handleVisibilityChange);
        };
    }, []);

    const expiringItems = useMemo(() => {
        const effectiveNow = Math.max(now, snoozeClock);
        return items
            .filter(item => getDaysUntil(item.expirationDate) <= warningDays && !isItemAlertSnoozed(item.id, effectiveNow))
            .sort((first, second) => getDaysUntil(first.expirationDate) - getDaysUntil(second.expirationDate));
    }, [getDaysUntil, items, now, snoozeClock, warningDays]);

    const lowStockItems = useMemo(() => items.filter(item => item.quantity <= 2), [items]);
    const attentionCount = new Set([...expiringItems, ...lowStockItems].map(item => item.id)).size;
    const allCaughtUp = attentionCount === 0;

    const freezeItem = async (id: string, name: string) => {
        const frozenUntil = new Date();
        frozenUntil.setDate(frozenUntil.getDate() + 30);
        await updateItem(id, {
            storageLocation: 'freezer',
            expirationDate: frozenUntil.toISOString().split('T')[0],
        });
        setFeedback(`${name} moved to the freezer for 30 days.`);
    };

    const snoozeItem = (id: string, name: string) => {
        snoozeItemAlert(id, 24);
        setSnoozeClock(Date.now());
        setFeedback(`${name} snoozed until tomorrow.`);
    };

    const addToShopping = async (item: (typeof items)[number]) => {
        const result = await addInventoryItemToShoppingList(item);
        setFeedback(result === 'added' ? `${item.name} added to the shopping list.` : `${item.name} is already on the shopping list.`);
    };

    const addExpirationToCalendar = (item: (typeof items)[number]) => {
        const created = NotificationService.addToCalendar(item);
        setFeedback(created
            ? `${item.name} expiration reminder downloaded.`
            : `${item.name} needs a valid expiration date before a reminder can be created.`);
    };

    const updateSettings = async (updates: Partial<DbSettings>) => {
        await db.settings.update('user', updates);
        await startScheduler();
    };

    const enableNotifications = async () => {
        const granted = await NotificationService.requestPermission();
        if (!granted) {
            setFeedback('Browser notifications are blocked. In-app alerts remain available.');
            return;
        }
        await updateSettings({ notificationsEnabled: true, notificationFrequency: settings?.notificationFrequency ?? 'daily' });
        setFeedback('Daily freshness reminders enabled.');
    };

    return (
        <div className="editorial-page alerts-page">
            <header className="editorial-page-header">
                <div>
                    <p className="editorial-kicker">Kitchen watch</p>
                    <h1>Alerts</h1>
                </div>
                <button
                    type="button"
                    className="market-icon-button editorial-header-action"
                    aria-label={showSettings ? 'Close alert settings' : 'Open alert settings'}
                    onClick={() => setShowSettings(value => !value)}
                >
                    {showSettings ? <X size={22} /> : <Gear size={22} />}
                </button>
            </header>

            {feedback && (
                <div className="editorial-toast" role="status">
                    <span>{feedback}</span>
                    <button type="button" onClick={() => setFeedback(null)} aria-label="Dismiss alert message"><X size={16} /></button>
                </div>
            )}

            {showSettings && settings && (
                <section className="alert-settings" aria-labelledby="alert-settings-heading">
                    <div className="editorial-section-heading">
                        <h2 id="alert-settings-heading">Reminder settings</h2>
                        <span>{settings.notificationsEnabled ? 'On' : 'In-app only'}</span>
                    </div>
                    <div className="alert-settings-grid">
                        <label>
                            <span>Warning window</span>
                            <select value={warningDays} onChange={event => void updateSettings({ expirationWarningDays: Number(event.target.value) })}>
                                {[1, 2, 3, 5, 7, 14].map(days => <option key={days} value={days}>{days} days</option>)}
                            </select>
                        </label>
                        <label>
                            <span>Frequency</span>
                            <select
                                value={settings.notificationFrequency ?? 'daily'}
                                onChange={event => void updateSettings({ notificationFrequency: event.target.value as DbSettings['notificationFrequency'] })}
                            >
                                <option value="off">Off</option>
                                <option value="daily">Daily</option>
                                <option value="twice">Twice daily</option>
                                <option value="realtime">Every 2 hours</option>
                            </select>
                        </label>
                        <label>
                            <span>Quiet from</span>
                            <input type="time" value={settings.quietHoursStart ?? '21:00'} onChange={event => void updateSettings({ quietHoursStart: event.target.value })} />
                        </label>
                        <label>
                            <span>Quiet until</span>
                            <input type="time" value={settings.quietHoursEnd ?? '07:00'} onChange={event => void updateSettings({ quietHoursEnd: event.target.value })} />
                        </label>
                    </div>
                    {!settings.notificationsEnabled ? (
                        <button type="button" className="settings-command" onClick={() => void enableNotifications()}>
                            <Bell size={18} /> Enable browser reminders
                        </button>
                    ) : (
                        <button type="button" className="settings-command is-secondary" onClick={() => void updateSettings({ notificationsEnabled: false })}>
                            Pause browser reminders
                        </button>
                    )}
                    <button type="button" className="alert-settings-link" onClick={() => onNavigate?.('profile')}>Account and data settings</button>
                </section>
            )}

            <section className="editorial-summary-band" aria-label="Alert summary">
                <Bell size={25} weight="duotone" />
                <div>
                    <strong>{allCaughtUp ? 'Your kitchen is calm' : `${attentionCount} item${attentionCount === 1 ? '' : 's'} need attention`}</strong>
                    <span>{allCaughtUp ? 'Nothing is expiring or running low.' : 'Prioritized by what needs action first.'}</span>
                </div>
            </section>

            {expiringItems.length > 0 && (
                <section className="editorial-section" aria-labelledby="expiring-heading">
                    <div className="editorial-section-heading">
                        <h2 id="expiring-heading">Use or save</h2>
                        <span className="editorial-count is-urgent">{expiringItems.length}</span>
                    </div>
                    <div className="editorial-list">
                        {expiringItems.map(item => {
                            const days = getDaysUntil(item.expirationDate);
                            const image = getFoodImage(item.name);
                            const timing = days < 0
                                ? `Expired ${Math.abs(days)} day${Math.abs(days) === 1 ? '' : 's'} ago`
                                : days === 0
                                    ? 'Expires today'
                                    : `Expires in ${days} day${days === 1 ? '' : 's'}`;
                            return (
                                <article key={item.id} className="editorial-list-row alert-item-row">
                                    <span className="editorial-thumb">
                                        {image ? <img src={image} alt="" loading="lazy" decoding="async" /> : <Package size={24} weight="duotone" />}
                                    </span>
                                    <div className="editorial-row-copy">
                                        <span className="editorial-row-status is-urgent">{timing}</span>
                                        <strong>{item.name}</strong>
                                        <small>{item.quantity} {item.quantity === 1 ? 'item' : 'items'} remaining</small>
                                    </div>
                                    <div className="alert-item-actions">
                                        <button type="button" onClick={() => void (days < 0 ? removeItem(item.id) : consumeItem(item.id))}>
                                            {days < 0 ? <Trash size={16} /> : <CheckCircle size={16} />}
                                            {days < 0 ? 'Toss' : 'Used'}
                                        </button>
                                        {days >= 0 && item.storageLocation === 'fridge' && (
                                            <button type="button" onClick={() => void freezeItem(item.id, item.name)}>
                                                <Snowflake size={16} /> Freeze
                                            </button>
                                        )}
                                        <button type="button" onClick={() => snoozeItem(item.id, item.name)}>
                                            <ClockCounterClockwise size={16} /> Snooze
                                        </button>
                                        {days >= 0 && (
                                            <button type="button" onClick={() => addExpirationToCalendar(item)}>
                                                <CalendarBlank size={16} /> Calendar
                                            </button>
                                        )}
                                    </div>
                                </article>
                            );
                        })}
                    </div>
                </section>
            )}

            {lowStockItems.length > 0 && (
                <section className="editorial-section" aria-labelledby="low-stock-heading">
                    <div className="editorial-section-heading">
                        <h2 id="low-stock-heading">Running low</h2>
                        <span className="editorial-count">{lowStockItems.length}</span>
                    </div>
                    <div className="editorial-list">
                        {lowStockItems.map(item => {
                            const image = getFoodImage(item.name);
                            return (
                                <article key={item.id} className="editorial-list-row">
                                    <span className="editorial-thumb">
                                        {image ? <img src={image} alt="" loading="lazy" decoding="async" /> : <Package size={24} weight="duotone" />}
                                    </span>
                                    <span className="editorial-row-copy">
                                        <span className="editorial-row-status is-warning">Only {item.quantity} left</span>
                                        <strong>{item.name}</strong>
                                        <small>Add it before the next market run</small>
                                    </span>
                                    <button type="button" className="editorial-inline-action" onClick={() => void addToShopping(item)}>
                                        <ShoppingCartSimple size={18} /> Add
                                    </button>
                                </article>
                            );
                        })}
                    </div>
                </section>
            )}

            {allCaughtUp && (
                <div className="editorial-empty-state">
                    <CheckCircle size={38} weight="duotone" />
                    <h2>All caught up</h2>
                    <p>Your next freshness alert will appear here.</p>
                </div>
            )}
        </div>
    );
}
