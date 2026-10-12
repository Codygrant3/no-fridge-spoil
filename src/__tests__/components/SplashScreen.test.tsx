import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SplashScreen } from '../../components/SplashScreen';

describe('SplashScreen', () => {
    afterEach(() => {
        vi.useRealTimers();
        vi.unstubAllGlobals();
    });

    it('presents the product story and completes after the motion timeline', () => {
        vi.useFakeTimers();
        const onComplete = vi.fn();
        render(<SplashScreen onComplete={onComplete} />);

        expect(screen.getByRole('dialog', { name: 'No Fridge Spoil' })).toBeInTheDocument();
        expect(screen.getByText('Know what to use next.')).toBeInTheDocument();
        expect(screen.getAllByText('Baby spinach')).toHaveLength(2);

        vi.advanceTimersByTime(3_599);
        expect(onComplete).not.toHaveBeenCalled();
        vi.advanceTimersByTime(1);
        expect(onComplete).toHaveBeenCalledTimes(1);
    });

    it('can be skipped by button or Escape without completing twice', () => {
        vi.useFakeTimers();
        const onComplete = vi.fn();
        render(<SplashScreen onComplete={onComplete} />);

        fireEvent.click(screen.getByRole('button', { name: 'Skip intro' }));
        fireEvent.keyDown(window, { key: 'Escape' });
        vi.runAllTimers();

        expect(onComplete).toHaveBeenCalledTimes(1);
    });

    it('keeps replay static when reduced motion is requested', () => {
        vi.useFakeTimers();
        vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() })));
        const onComplete = vi.fn();
        render(<SplashScreen onComplete={onComplete} />);
        vi.advanceTimersByTime(10_000);
        expect(onComplete).not.toHaveBeenCalled();
        fireEvent.click(screen.getByRole('button', { name: 'Skip intro' }));
        expect(onComplete).toHaveBeenCalledTimes(1);
    });

    it('dismisses if reduced motion is enabled during playback and cleans up the listener', () => {
        const addEventListener = vi.fn();
        const removeEventListener = vi.fn();
        vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: false, addEventListener, removeEventListener })));
        const onComplete = vi.fn();
        const { unmount } = render(<SplashScreen onComplete={onComplete} />);
        const listener = addEventListener.mock.calls[0][1];
        listener({ matches: true });
        expect(onComplete).toHaveBeenCalledTimes(1);
        unmount();
        expect(removeEventListener).toHaveBeenCalledWith('change', listener);
    });

    it('contains keyboard focus, restores the trigger and clears background inertness', () => {
        const shell = document.createElement('div');
        shell.className = 'editorial-shell';
        const trigger = document.createElement('button');
        shell.append(trigger);
        document.body.append(shell);
        trigger.focus();
        const { unmount } = render(<SplashScreen onComplete={vi.fn()} />);
        expect(shell).toHaveAttribute('inert');
        expect(shell).toHaveAttribute('aria-hidden', 'true');
        fireEvent.keyDown(window, { key: 'Tab' });
        expect(screen.getByRole('button', { name: 'Skip intro' })).toHaveFocus();
        fireEvent.keyDown(window, { key: 'Tab', shiftKey: true });
        expect(screen.getByRole('button', { name: 'Skip intro' })).toHaveFocus();
        unmount();
        expect(shell).not.toHaveAttribute('inert');
        expect(shell).not.toHaveAttribute('aria-hidden');
        expect(trigger).toHaveFocus();
        shell.remove();
    });
});
