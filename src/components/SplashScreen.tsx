import { useCallback, useEffect, useRef } from 'react';

type SplashScreenProps = {
    onComplete: () => void;
};

const INTRO_DURATION_MS = 3_600;

const RECOGNIZED_ITEMS = [
    { name: 'Baby spinach', status: 'Fresh 6d', tone: 'fresh' },
    { name: 'Greek yogurt', status: 'Use soon 2d', tone: 'soon' },
    { name: 'Salmon fillet', status: 'Tonight', tone: 'today' },
] as const;

export function SplashScreen({ onComplete }: SplashScreenProps) {
    const completedRef = useRef(false);
    const skipRef = useRef<HTMLButtonElement>(null);

    const completeSplash = useCallback(() => {
        if (completedRef.current) return;
        completedRef.current = true;
        onComplete();
    }, [onComplete]);

    useEffect(() => {
        const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        const appShell = document.querySelector<HTMLElement>('.editorial-shell');
        appShell?.setAttribute('inert', '');
        appShell?.setAttribute('aria-hidden', 'true');
        const focusFrame = window.requestAnimationFrame(() => skipRef.current?.focus());
        const completionTimer = window.setTimeout(completeSplash, INTRO_DURATION_MS);
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') completeSplash();
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => {
            window.cancelAnimationFrame(focusFrame);
            window.clearTimeout(completionTimer);
            window.removeEventListener('keydown', handleKeyDown);
            appShell?.removeAttribute('inert');
            appShell?.removeAttribute('aria-hidden');
            previouslyFocused?.focus();
        };
    }, [completeSplash]);

    return (
        <div
            className="motion-intro"
            data-testid="app-splash"
            role="dialog"
            aria-modal="true"
            aria-labelledby="motion-intro-title"
        >
            <div className="motion-intro-canvas">
                <button
                    ref={skipRef}
                    type="button"
                    className="motion-intro-skip"
                    onClick={completeSplash}
                >
                    Skip intro
                </button>

                <header className="motion-intro-brand">
                    <p className="motion-intro-eyebrow">Freshness, made visible</p>
                    <div className="motion-intro-brand-row">
                        <span className="motion-intro-mark" aria-hidden="true">N</span>
                        <div>
                            <h1 id="motion-intro-title">No Fridge Spoil</h1>
                            <p>Turn every receipt into a use-first plan.</p>
                        </div>
                    </div>
                </header>

                <div className="motion-intro-stage" aria-hidden="true">
                    <span className="motion-intro-halo" />
                    <span className="motion-intro-orbit" />

                    <div className="motion-intro-receipt">
                        <strong>The Fresh Market</strong>
                        <small>Thu Jul 30 <span>•</span> 6:42 PM</small>
                        <div className="motion-intro-receipt-rule" />
                        <dl>
                            <div><dt>Baby spinach</dt><dd>$3.49</dd></div>
                            <div><dt>Greek yogurt</dt><dd>$5.29</dd></div>
                            <div><dt>Salmon fillet</dt><dd>$12.80</dd></div>
                            <div className="is-total"><dt>Total</dt><dd>$21.58</dd></div>
                        </dl>
                        <p>Thanks for shopping fresh</p>
                        <i className="motion-intro-corner is-tl" />
                        <i className="motion-intro-corner is-tr" />
                        <i className="motion-intro-corner is-bl" />
                        <i className="motion-intro-corner is-br" />
                    </div>

                    <span className="motion-intro-scan-beam" />

                    <div className="motion-intro-results">
                        {RECOGNIZED_ITEMS.map(item => (
                            <div className={`motion-intro-result is-${item.tone}`} key={item.name}>
                                <span />
                                <strong>{item.name}</strong>
                                <small>{item.status}</small>
                            </div>
                        ))}
                    </div>
                </div>

                <section className="motion-intro-message">
                    <h2>Know what to use next.</h2>
                    <p>Scan once. Keep groceries visible, useful, and out of the bin.</p>
                </section>

                <div className="motion-intro-progress" aria-hidden="true">
                    <span />
                </div>
                <p className="sr-only" role="status">Preparing your freshness dashboard.</p>
            </div>
        </div>
    );
}
