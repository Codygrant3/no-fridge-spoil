import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../context/AuthContext', () => ({
  useAuth: () => ({
    configured: true,
    recoveryMode: false,
    signIn: vi.fn(),
    signUp: vi.fn(),
    sendPasswordReset: vi.fn(),
    updatePassword: vi.fn(),
  }),
}));

import { AccountAccess } from '../../components/AccountAccess';

describe('AccountAccess', () => {
  it('shows password requirements and supports visibility toggling', async () => {
    const user = userEvent.setup();
    render(<AccountAccess embedded />);

    await user.click(screen.getByRole('tab', { name: 'Create account' }));
    const password = screen.getByLabelText('Password');

    expect(screen.getByText('Use at least 8 characters.')).toBeInTheDocument();
    expect(password).toHaveAttribute('type', 'password');
    await user.click(screen.getByRole('button', { name: 'Show password' }));
    expect(password).toHaveAttribute('type', 'text');
    expect(screen.getByRole('button', { name: 'Hide password' })).toBeInTheDocument();
  });
});
