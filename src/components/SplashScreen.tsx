import { useCallback, useEffect, useRef } from 'react';

type SplashScreenProps = {
    onComplete: () => void;
};

const INTRO_DURATION_MS = 3_600;

const RECOGNIZED_ITEMS = [
    { name: 'Baby spinach', status: 'Fresh 6d', tone: 'fresh', image: 'baby-spinach' },
    { name: 'Greek yogurt', status: 'Use soon 2d', tone: 'soon', image: 'greek-yogurt' },
    { name: 'Salmon fillet', status: 'Tonight', tone: 'today', image: 'salmon-fillet' },
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
        const previousInert = appShell?.hasAttribute('inert');
        const previousHidden = appShell?.getAttribute('aria-hidden');
        appShell?.setAttribute('inert', '');
        appShell?.setAttribute('aria-hidden', 'true');
        const focusFrame = window.requestAnimationFrame(() => skipRef.current?.focus());
        const motionPreference = window.matchMedia?.('(prefers-reduced-motion: reduce)');
        // An explicitly replayed intro is a static, dismissible preview in reduced motion.
        const completionTimer = motionPreference?.matches
            ? undefined
            : window.setTimeout(completeSplash, INTRO_DURATION_MS);
        const handleMotionChange = (event: MediaQueryListEvent) => {
            if (event.matches) completeSplash();
        };
        motionPreference?.addEventListener('change', handleMotionChange);
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') completeSplash();
            if (event.key === 'Tab') {
                event.preventDefault();
                skipRef.current?.focus();
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => {
            window.cancelAnimationFrame(focusFrame);
            window.clearTimeout(completionTimer);
            motionPreference?.removeEventListener('change', handleMotionChange);
            window.removeEventListener('keydown', handleKeyDown);
            if (!previousInert) appShell?.removeAttribute('inert');
            if (previousHidden == null) appShell?.removeAttribute('aria-hidden');
            else appShell?.setAttribute('aria-hidden', previousHidden);
            const focusTarget = previouslyFocused && previouslyFocused !== document.body && previouslyFocused.isConnected
                ? previouslyFocused
                : appShell?.querySelector<HTMLElement>('main');
            focusTarget?.focus({ preventScroll: true });
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
                                <img src={`/market/${item.image}.webp`} alt="" width="40" height="40" />
                                <strong>{item.name}</strong>
                                <small>{item.status}</small>
                            </div>
                        ))}
                    </div>
                    <div className="motion-intro-ready">
                        <svg viewBox="0 0 24 24" fill="none"><path d="m5 12 4 4L19 6" /></svg>
                        Your use-first plan, ready
                    </div>
                </div>

                <section className="motion-intro-message">
                    <h2>Know what to use next.</h2>
                    <p>Scan once. Keep groceries visible, useful, and out of the bin.</p>
                </section>

                <div className="motion-intro-progress" aria-hidden="true">
                    <span />
                </div>
                <p className="sr-only">A preview of how receipts become a freshness plan. Skip intro to enter your kitchen.</p>
            </div>
        </div>
    );
}
