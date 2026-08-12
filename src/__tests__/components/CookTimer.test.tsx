import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CookTimer } from '../../components/CookTimer';
import type { VoiceService } from '../../services/voiceService';

describe('CookTimer', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-25T12:00:00.000Z'));
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      value: 'visible',
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('reconciles against its deadline after background throttling', () => {
    const speak = vi.fn();
    render(<CookTimer defaultSeconds={3} voiceService={{ speak } as unknown as VoiceService} />);

    fireEvent.click(screen.getByRole('button', { name: 'Start timer' }));
    act(() => {
      vi.setSystemTime(new Date('2026-07-25T12:00:04.000Z'));
      document.dispatchEvent(new Event('visibilitychange'));
    });

    expect(screen.getByText('00:00')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Restart timer' })).toBeInTheDocument();
    expect(speak).toHaveBeenCalledWith('Timer complete!');
    expect(speak).toHaveBeenCalledTimes(1);
  });
});
