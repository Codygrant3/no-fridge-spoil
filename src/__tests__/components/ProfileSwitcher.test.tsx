import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DbProfile } from '../../db/database';

const chris: DbProfile = {
  id: 'profile-chris',
  name: 'Chris',
  avatar: '👨',
  color: '#3b82f6',
  createdAt: '2026-01-01T00:00:00.000Z',
};

const mocks = vi.hoisted(() => ({
  switchProfile: vi.fn(),
  createProfile: vi.fn(),
  updateProfile: vi.fn(),
  deleteProfile: vi.fn(),
  state: {
    profiles: [] as DbProfile[],
    activeProfileId: null as string | null,
    activeProfile: null as DbProfile | null,
    isHousehold: true,
  },
}));

vi.mock('../../context/ProfileContext', () => ({
  useProfile: () => ({
    profiles: mocks.state.profiles,
    activeProfileId: mocks.state.activeProfileId,
    activeProfile: mocks.state.activeProfile,
    isHousehold: mocks.state.isHousehold,
    switchProfile: mocks.switchProfile,
    createProfile: mocks.createProfile,
    updateProfile: mocks.updateProfile,
    deleteProfile: mocks.deleteProfile,
  }),
  PROFILE_AVATARS: ['👤', '👩', '👨', '👧', '👦', '🧑‍🍳', '👵', '👴', '🐱', '🐶'],
  PROFILE_COLORS: ['#4ade80', '#3b82f6', '#f59e0b', '#ef4444', '#a855f7', '#ec4899', '#06b6d4', '#f97316'],
}));

import { ProfileSwitcher } from '../../components/ProfileSwitcher';

async function openSwitcher() {
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: /household/i }));
  return user;
}

describe('ProfileSwitcher', () => {
  beforeEach(() => {
    mocks.switchProfile.mockReset();
    mocks.createProfile.mockReset();
    mocks.updateProfile.mockReset();
    mocks.deleteProfile.mockReset();
    mocks.state.profiles = [chris];
    mocks.state.activeProfileId = null;
    mocks.state.activeProfile = null;
    mocks.state.isHousehold = true;
  });

  it('opens the switcher and switches to a named profile', async () => {
    render(<ProfileSwitcher />);

    const user = await openSwitcher();
    await user.click(screen.getByRole('button', { name: 'Chris' }));

    expect(mocks.switchProfile).toHaveBeenCalledWith('profile-chris');
  });

  it('creates a named profile then switches to it', async () => {
    const created: DbProfile = {
      id: 'profile-jamie',
      name: 'Jamie',
      avatar: '👤',
      color: '#4ade80',
      createdAt: '2026-08-22T00:00:00.000Z',
    };
    mocks.createProfile.mockResolvedValue(created);

    render(<ProfileSwitcher />);

    const user = await openSwitcher();
    await user.click(screen.getByRole('button', { name: 'Add profile' }));

    const nameField = screen.getByRole('textbox', { name: /profile name/i });
    await user.type(nameField, 'Jamie');
    await user.click(screen.getByRole('button', { name: 'Create' }));

    expect(mocks.createProfile).toHaveBeenCalledWith('Jamie', '👤', '#4ade80');
    expect(mocks.switchProfile).toHaveBeenCalledWith('profile-jamie');
    expect(mocks.createProfile.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.switchProfile.mock.invocationCallOrder[0],
    );
  });

  it('keeps delete confirm and cancel labeled', async () => {
    render(<ProfileSwitcher />);

    const user = await openSwitcher();

    expect(screen.getByRole('button', { name: 'Delete Chris' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Delete Chris' }));

    expect(screen.getByRole('button', { name: 'Confirm' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cancel delete' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Cancel delete' }));

    expect(screen.getByRole('button', { name: 'Delete Chris' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Cancel delete' })).not.toBeInTheDocument();
  });
});
