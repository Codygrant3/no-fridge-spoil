import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { FilterTabs } from '../../components/FilterTabs';
import type { FilterType } from '../../types';

describe('FilterTabs', () => {
  const defaultCounts = { all: 10, expiring_soon: 3, expired: 2, good: 5 };

  it('should render all filter tabs', () => {
    render(
      <FilterTabs activeFilter="all" onFilterChange={() => {}} counts={defaultCounts} />
    );

    expect(screen.getByText('All')).toBeInTheDocument();
    expect(screen.getByText('Expiring')).toBeInTheDocument();
    expect(screen.getByText('Expired')).toBeInTheDocument();
    expect(screen.getByText('Fresh')).toBeInTheDocument();
  });

  it('should display counts for each filter', () => {
    render(
      <FilterTabs activeFilter="all" onFilterChange={() => {}} counts={defaultCounts} />
    );

    expect(screen.getByText('10')).toBeInTheDocument(); // all
    expect(screen.getByText('3')).toBeInTheDocument(); // expiring_soon
    expect(screen.getByText('2')).toBeInTheDocument(); // expired
    expect(screen.getByText('5')).toBeInTheDocument(); // good
  });

  it('should not display count badge when count is 0', () => {
    const zeroCounts = { all: 0, expiring_soon: 0, expired: 0, good: 0 };
    render(
      <FilterTabs activeFilter="all" onFilterChange={() => {}} counts={zeroCounts} />
    );

    // Should have 4 buttons but no count badges
    const buttons = screen.getAllByRole('button');
    expect(buttons).toHaveLength(4);

    // Count badges should not be present
    expect(screen.queryByText('0')).not.toBeInTheDocument();
  });

  it('should call onFilterChange when tab is clicked', () => {
    const handleFilterChange = vi.fn();
    render(
      <FilterTabs
        activeFilter="all"
        onFilterChange={handleFilterChange}
        counts={defaultCounts}
      />
    );

    fireEvent.click(screen.getByText('Expiring'));
    expect(handleFilterChange).toHaveBeenCalledWith('expiring_soon');

    fireEvent.click(screen.getByText('Expired'));
    expect(handleFilterChange).toHaveBeenCalledWith('expired');

    fireEvent.click(screen.getByText('Fresh'));
    expect(handleFilterChange).toHaveBeenCalledWith('good');

    fireEvent.click(screen.getByText('All'));
    expect(handleFilterChange).toHaveBeenCalledWith('all');
  });

  it('should highlight active filter', () => {
    const { rerender } = render(
      <FilterTabs activeFilter="all" onFilterChange={() => {}} counts={defaultCounts} />
    );

    // Find the All button's parent and check it has active styles
    const allButton = screen.getByText('All').closest('button');
    expect(allButton).toHaveClass('bg-[var(--accent-color)]');

    // Switch to expiring filter
    rerender(
      <FilterTabs
        activeFilter="expiring_soon"
        onFilterChange={() => {}}
        counts={defaultCounts}
      />
    );

    const expiringButton = screen.getByText('Expiring').closest('button');
    expect(expiringButton).toHaveClass('bg-[var(--accent-color)]');
  });

  it('should render correctly with different active filters', () => {
    const filters: FilterType[] = ['all', 'expiring_soon', 'expired', 'good'];

    filters.forEach((filter) => {
      const { unmount } = render(
        <FilterTabs activeFilter={filter} onFilterChange={() => {}} counts={defaultCounts} />
      );

      // All 4 tabs should always be present
      expect(screen.getAllByRole('button')).toHaveLength(4);
      unmount();
    });
  });

  it('should handle large counts', () => {
    const largeCounts = { all: 999, expiring_soon: 150, expired: 50, good: 799 };
    render(
      <FilterTabs activeFilter="all" onFilterChange={() => {}} counts={largeCounts} />
    );

    expect(screen.getByText('999')).toBeInTheDocument();
    expect(screen.getByText('150')).toBeInTheDocument();
    expect(screen.getByText('50')).toBeInTheDocument();
    expect(screen.getByText('799')).toBeInTheDocument();
  });
});
