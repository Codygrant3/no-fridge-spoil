import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SplashScreen } from '../../components/SplashScreen';

describe('SplashScreen', () => {
    afterEach(() => {
        vi.useRealTimers();
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
});
