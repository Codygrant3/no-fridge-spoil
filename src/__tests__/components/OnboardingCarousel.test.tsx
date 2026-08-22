import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { OnboardingCarousel } from '../../components/OnboardingCarousel';
import { db } from '../../db/database';
import { NotificationService } from '../../services/notificationService';
import { clearMemoryStorageFallback, readLocalValue } from '../../services/safeStorage';

const DISMISSED_KEY = 'no-fridge-spoil:activation-dismissed';

async function seedUserSettings(
  overrides: Partial<{
    expirationWarningDays: number;
    notificationsEnabled: boolean;
  }> = {},
) {
  await db.settings.put({
    id: 'user',
    theme: 'system',
    defaultStorageLocation: 'fridge',
    expirationWarningDays: 5,
    notificationsEnabled: false,
    notificationFrequency: 'daily',
    ...overrides,
  });
}

describe('OnboardingCarousel', () => {
  beforeEach(async () => {
    localStorage.clear();
    clearMemoryStorageFallback();
    await db.settings.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders Get to your first saved item when not dismissed', () => {
    render(<OnboardingCarousel />);

    expect(screen.getByRole('heading', { name: 'Get to your first saved item' })).toBeInTheDocument();
  });

  it('hides the setup checklist and persists dismissed', async () => {
    const user = userEvent.setup();
    render(<OnboardingCarousel />);

    await user.click(screen.getByRole('button', { name: 'Hide setup checklist' }));

    expect(screen.queryByRole('heading', { name: 'Get to your first saved item' })).not.toBeInTheDocument();
    expect(readLocalValue(DISMISSED_KEY)).toBe('true');
  });

  it('shows Scan when itemCount is 0, calls onStartClick, and keeps Enable disabled', async () => {
    const user = userEvent.setup();
    const onStartClick = vi.fn();
    render(<OnboardingCarousel itemCount={0} onStartClick={onStartClick} />);

    await user.click(screen.getByRole('button', { name: 'Scan' }));

    expect(onStartClick).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Enable' })).toBeDisabled();
  });

  it('sets expirationWarningDays to 3 on the user settings row when 3d is clicked', async () => {
    const user = userEvent.setup();
    await seedUserSettings({ expirationWarningDays: 5 });
    render(<OnboardingCarousel />);

    await waitFor(async () => {
      const current = await db.settings.get('user');
      if (current?.expirationWarningDays !== 3) {
        const warningDays = screen.queryByRole('button', { name: '3d' });
        if (warningDays) {
          await user.click(warningDays);
        }
      }
      expect((await db.settings.get('user'))?.expirationWarningDays).toBe(3);
    });
  });

  it('shows the blocked-notifications alert when requestPermission is denied', async () => {
    const user = userEvent.setup();
    vi.spyOn(NotificationService, 'requestPermission').mockResolvedValue(false);
    render(<OnboardingCarousel itemCount={1} />);

    await user.click(screen.getByRole('button', { name: 'Enable' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Notifications are blocked in this browser. You can still use the in-app alerts page.',
    );
  });
});
