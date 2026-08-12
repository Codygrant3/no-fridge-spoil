import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Stats } from '../../pages/Stats';
import { db } from '../../db/database';

describe('Stats', () => {
  beforeEach(async () => {
    await db.stats.clear();
    await db.aiCache.clear();
    await db.stats.put({
      id: 'global',
      itemsSaved: 4,
      itemsWasted: 0,
      totalScans: 2,
      co2SavedKg: 10,
      waterSavedL: 400,
      moneySaved: 14,
      badges: [],
      xp: 200,
      level: 1,
    });
  });

  it('labels cumulative estimates honestly and reports clipboard sharing', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'share', { configurable: true, value: undefined });
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });
    render(<Stats />);

    expect(await screen.findByText('All-time estimates from items marked used')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Weekly' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Share your impact' }));

    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
    expect(screen.getByRole('status')).toHaveTextContent('Impact summary copied.');
  });

  it('closes an achievement dialog with Escape and restores badge focus', async () => {
    await db.stats.update('global', { badges: ['first-save'] });
    render(<Stats />);
    const badge = await screen.findByRole('button', { name: 'First Save' });
    await waitFor(() => expect(badge).toBeEnabled());

    fireEvent.click(badge);

    expect(screen.getByRole('dialog', { name: 'First Save' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Close' })).toHaveFocus();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('dialog', { name: 'First Save' })).not.toBeInTheDocument();
    expect(badge).toHaveFocus();
  });
});
