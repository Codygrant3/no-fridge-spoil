import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { BottomNav } from '../../components/BottomNav';

describe('BottomNav', () => {
  it('preloads a destination when a nav item receives pointer or keyboard intent', () => {
    const onTabIntent = vi.fn();
    render(
      <BottomNav
        currentTab="inventory"
        onTabChange={vi.fn()}
        onTabIntent={onTabIntent}
      />,
    );

    const profile = screen.getByRole('button', { name: 'Profile' });
    fireEvent.pointerEnter(profile);
    fireEvent.focus(profile);

    expect(onTabIntent).toHaveBeenCalledWith('profile');
    expect(onTabIntent).toHaveBeenCalledTimes(2);
  });
});
