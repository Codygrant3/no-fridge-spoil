import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SearchBar } from '../../components/SearchBar';

describe('SearchBar', () => {
  it('should render with default placeholder', () => {
    render(<SearchBar value="" onChange={() => {}} />);

    const input = screen.getByPlaceholderText('Search items...');
    expect(input).toBeInTheDocument();
  });

  it('should render with custom placeholder', () => {
    render(<SearchBar value="" onChange={() => {}} placeholder="Find recipes..." />);

    const input = screen.getByPlaceholderText('Find recipes...');
    expect(input).toBeInTheDocument();
  });

  it('should display the current value', () => {
    render(<SearchBar value="test search" onChange={() => {}} />);

    const input = screen.getByDisplayValue('test search');
    expect(input).toBeInTheDocument();
  });

  it('should call onChange when typing', () => {
    const handleChange = vi.fn();
    render(<SearchBar value="" onChange={handleChange} />);

    const input = screen.getByPlaceholderText('Search items...');
    fireEvent.change(input, { target: { value: 'milk' } });

    expect(handleChange).toHaveBeenCalledWith('milk');
  });

  it('should not show clear button when value is empty', () => {
    render(<SearchBar value="" onChange={() => {}} />);

    // The clear button should not be in the document
    const clearButton = screen.queryByRole('button');
    expect(clearButton).not.toBeInTheDocument();
  });

  it('should show clear button when value is not empty', () => {
    render(<SearchBar value="something" onChange={() => {}} />);

    const clearButton = screen.getByRole('button');
    expect(clearButton).toBeInTheDocument();
  });

  it('should clear value when clear button is clicked', () => {
    const handleChange = vi.fn();
    render(<SearchBar value="something" onChange={handleChange} />);

    const clearButton = screen.getByRole('button');
    fireEvent.click(clearButton);

    expect(handleChange).toHaveBeenCalledWith('');
  });

  it('should have correct input type', () => {
    render(<SearchBar value="" onChange={() => {}} />);

    const input = screen.getByPlaceholderText('Search items...');
    expect(input).toHaveAttribute('type', 'text');
  });
});
