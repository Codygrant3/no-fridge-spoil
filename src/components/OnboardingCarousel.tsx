import { useEffect, useMemo, useState } from 'react';
import { Bell, Check, Gauge, Scan, X } from '@phosphor-icons/react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/database';
import { NotificationService } from '../services/notificationService';
import { startScheduler } from '../services/notificationScheduler';
import { readLocalValue, writeLocalValue } from '../services/safeStorage';

const DISMISSED_KEY = 'no-fridge-spoil:activation-dismissed';
const EXPIRY_SET_KEY = 'no-fridge-spoil:activation-expiry-set';

interface OnboardingCarouselProps {
    itemCount?: number;
    onStartClick?: () => void;
}

export function OnboardingCarousel({ itemCount = 0, onStartClick }: OnboardingCarouselProps) {
    const settings = useLiveQuery(() => db.settings.get('user'), [], undefined);
    const [dismissed, setDismissed] = useState(() => readLocalValue(DISMISSED_KEY) === 'true');
    const [expiryConfigured, setExpiryConfigured] = useState(() => readLocalValue(EXPIRY_SET_KEY) === 'true');
    const [permissionError, setPermissionError] = useState<string | null>(null);
    const notificationReady = Boolean(
        settings?.notificationsEnabled
        && typeof Notification !== 'undefined'
        && Notification.permission === 'granted',
    );

    const completed = useMemo(() => [
        true,
        itemCount > 0,
        expiryConfigured,
        notificationReady,
    ], [expiryConfigured, itemCount, notificationReady]);
    const completedCount = completed.filter(Boolean).length;

    useEffect(() => {
        if (completedCount === completed.length) {
            const timeout = window.setTimeout(() => {
                writeLocalValue(DISMISSED_KEY, 'true');
                setDismissed(true);
            }, 1_500);
            return () => window.clearTimeout(timeout);
        }
    }, [completed.length, completedCount]);

    if (dismissed) return null;

    const setWarningDays = async (days: number) => {
        if (!settings) return;
        await db.settings.update('user', { expirationWarningDays: days });
        writeLocalValue(EXPIRY_SET_KEY, 'true');
        setExpiryConfigured(true);
    };

    const enableNotifications = async () => {
        setPermissionError(null);
        const granted = await NotificationService.requestPermission();
        if (!granted) {
            setPermissionError('Notifications are blocked in this browser. You can still use the in-app alerts page.');
            return;
        }
        await db.settings.update('user', {
            notificationsEnabled: true,
            notificationFrequency: 'daily',
        });
        await startScheduler();
    };

    const dismiss = () => {
        writeLocalValue(DISMISSED_KEY, 'true');
        setDismissed(true);
    };

    return (
        <section className="market-activation" aria-labelledby="activation-heading">
            <div className="market-activation-heading">
                <div>
                    <p>Kitchen setup</p>
                    <h2 id="activation-heading">Get to your first saved item</h2>
                </div>
                <span>{completedCount} of {completed.length}</span>
                <button type="button" onClick={dismiss} aria-label="Hide setup checklist" title="Hide checklist">
                    <X size={18} />
                </button>
            </div>

            <div className="market-activation-progress" aria-hidden="true">
                <span style={{ width: `${(completedCount / completed.length) * 100}%` }} />
            </div>

            <ol className="market-activation-list">
                <li className="is-complete">
                    <span><Check size={15} weight="bold" /></span>
                    <div><strong>Kitchen ready</strong><small>Your private household space is set.</small></div>
                </li>
                <li className={itemCount > 0 ? 'is-complete' : ''}>
                    <span>{itemCount > 0 ? <Check size={15} weight="bold" /> : <Scan size={16} />}</span>
                    <div><strong>Add your first grocery</strong><small>Scan a receipt or one item.</small></div>
                    {!itemCount && <button type="button" onClick={onStartClick}>Scan</button>}
                </li>
                <li className={expiryConfigured ? 'is-complete' : ''}>
                    <span>{expiryConfigured ? <Check size={15} weight="bold" /> : <Gauge size={16} />}</span>
                    <div><strong>Choose your warning window</strong><small>How early should food appear in alerts?</small></div>
                    {!expiryConfigured && (
                        <div className="market-activation-options" role="group" aria-label="Expiration warning days">
                            {[2, 3, 5].map(days => (
                                <button type="button" key={days} onClick={() => void setWarningDays(days)}>{days}d</button>
                            ))}
                        </div>
                    )}
                </li>
                <li className={notificationReady ? 'is-complete' : ''}>
                    <span>{notificationReady ? <Check size={15} weight="bold" /> : <Bell size={16} />}</span>
                    <div><strong>Turn on daily reminders</strong><small>Enable after adding a grocery, when the value is clear.</small></div>
                    {!notificationReady && (
                        <button type="button" disabled={itemCount === 0} onClick={() => void enableNotifications()}>Enable</button>
                    )}
                </li>
            </ol>
            {permissionError && <p className="market-activation-error" role="alert">{permissionError}</p>}
        </section>
    );
}
