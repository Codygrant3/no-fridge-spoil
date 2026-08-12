import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ErrorBoundary } from '../../components/ErrorBoundary';

function BrokenView(): never {
  throw new Error('private database path and secret stack details');
}

describe('ErrorBoundary', () => {
  it('shows a safe recovery screen without rendering internal error details', () => {
    render(
      <ErrorBoundary>
        <BrokenView />
      </ErrorBoundary>,
    );

    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'The kitchen view needs a reset' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Retry view' })).toBeInTheDocument();
    expect(screen.queryByText(/private database path/i)).not.toBeInTheDocument();
    expect(screen.getByText(/Reference NFS-/)).toBeInTheDocument();
  });
});
