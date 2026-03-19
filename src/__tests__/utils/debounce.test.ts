import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { debounce } from '../../utils/debounce';

describe('debounce', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should delay function execution', () => {
    const func = vi.fn();
    const debouncedFunc = debounce(func, 100);

    debouncedFunc();
    expect(func).not.toHaveBeenCalled();

    vi.advanceTimersByTime(50);
    expect(func).not.toHaveBeenCalled();

    vi.advanceTimersByTime(50);
    expect(func).toHaveBeenCalledTimes(1);
  });

  it('should only call function once for rapid calls', () => {
    const func = vi.fn();
    const debouncedFunc = debounce(func, 100);

    debouncedFunc();
    debouncedFunc();
    debouncedFunc();
    debouncedFunc();
    debouncedFunc();

    expect(func).not.toHaveBeenCalled();

    vi.advanceTimersByTime(100);
    expect(func).toHaveBeenCalledTimes(1);
  });

  it('should reset timer on each call', () => {
    const func = vi.fn();
    const debouncedFunc = debounce(func, 100);

    debouncedFunc();
    vi.advanceTimersByTime(50);

    debouncedFunc(); // Reset timer
    vi.advanceTimersByTime(50);
    expect(func).not.toHaveBeenCalled();

    vi.advanceTimersByTime(50);
    expect(func).toHaveBeenCalledTimes(1);
  });

  it('should pass arguments to the debounced function', () => {
    const func = vi.fn();
    const debouncedFunc = debounce(func, 100);

    debouncedFunc('arg1', 'arg2', 123);

    vi.advanceTimersByTime(100);
    expect(func).toHaveBeenCalledWith('arg1', 'arg2', 123);
  });

  it('should pass the last arguments when called multiple times', () => {
    const func = vi.fn();
    const debouncedFunc = debounce(func, 100);

    debouncedFunc('first');
    debouncedFunc('second');
    debouncedFunc('third');

    vi.advanceTimersByTime(100);
    expect(func).toHaveBeenCalledTimes(1);
    expect(func).toHaveBeenCalledWith('third');
  });

  it('should allow multiple calls after wait time has passed', () => {
    const func = vi.fn();
    const debouncedFunc = debounce(func, 100);

    debouncedFunc('first');
    vi.advanceTimersByTime(100);
    expect(func).toHaveBeenCalledWith('first');

    debouncedFunc('second');
    vi.advanceTimersByTime(100);
    expect(func).toHaveBeenCalledWith('second');

    expect(func).toHaveBeenCalledTimes(2);
  });

  it('should work with different wait times', () => {
    const func = vi.fn();
    const shortDebounce = debounce(func, 50);
    const longDebounce = debounce(func, 200);

    shortDebounce();
    vi.advanceTimersByTime(50);
    expect(func).toHaveBeenCalledTimes(1);

    longDebounce();
    vi.advanceTimersByTime(100);
    expect(func).toHaveBeenCalledTimes(1); // Long debounce hasn't fired yet

    vi.advanceTimersByTime(100);
    expect(func).toHaveBeenCalledTimes(2); // Now it has
  });

  it('should preserve this context', () => {
    const obj = {
      value: 42,
      getValue: vi.fn(function (this: { value: number }) {
        return this.value;
      }),
    };

    const debouncedGetValue = debounce(obj.getValue, 100);

    debouncedGetValue.call(obj);
    vi.advanceTimersByTime(100);

    expect(obj.getValue).toHaveBeenCalled();
  });

  it('should handle zero wait time', () => {
    const func = vi.fn();
    const debouncedFunc = debounce(func, 0);

    debouncedFunc();
    expect(func).not.toHaveBeenCalled();

    vi.advanceTimersByTime(0);
    expect(func).toHaveBeenCalledTimes(1);
  });

  it('should handle very long wait times', () => {
    const func = vi.fn();
    const debouncedFunc = debounce(func, 10000);

    debouncedFunc();
    vi.advanceTimersByTime(9999);
    expect(func).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(func).toHaveBeenCalledTimes(1);
  });
});
