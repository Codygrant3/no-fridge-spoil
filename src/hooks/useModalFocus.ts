import { useEffect, type RefObject } from 'react';

const FOCUSABLE_SELECTOR = [
    'button:not([disabled])',
    '[href]',
    'input:not([disabled])',
    'select:not([disabled])',
    'textarea:not([disabled])',
    '[tabindex]:not([tabindex="-1"])',
].join(',');

export function useModalFocus(
    open: boolean,
    dialogRef: RefObject<HTMLElement | null>,
    onClose: () => void,
    initialFocusRef?: RefObject<HTMLElement | null>,
    restoreFocusRef?: RefObject<HTMLElement | null>,
): void {
    useEffect(() => {
        if (!open) return;

        const previouslyFocused = restoreFocusRef?.current
            ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null);
        const initialTarget = initialFocusRef?.current
            ?? dialogRef.current?.querySelector<HTMLElement>(FOCUSABLE_SELECTOR)
            ?? dialogRef.current;
        initialTarget?.focus();

        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                event.preventDefault();
                onClose();
                return;
            }
            if (event.key !== 'Tab' || !dialogRef.current) return;

            const controls = Array.from(dialogRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
            if (controls.length === 0) {
                event.preventDefault();
                dialogRef.current.focus();
                return;
            }

            const first = controls[0];
            const last = controls[controls.length - 1];
            if (event.shiftKey && document.activeElement === first) {
                event.preventDefault();
                last.focus();
            } else if (!event.shiftKey && document.activeElement === last) {
                event.preventDefault();
                first.focus();
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => {
            window.removeEventListener('keydown', handleKeyDown);
            previouslyFocused?.focus();
        };
    }, [dialogRef, initialFocusRef, onClose, open, restoreFocusRef]);
}
