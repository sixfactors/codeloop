import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createIdleTimer } from '../signals.js';

describe('createIdleTimer', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('fires after the specified timeout', () => {
    const callback = vi.fn();
    const timer = createIdleTimer(5000, callback);

    vi.advanceTimersByTime(4999);
    expect(callback).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(callback).toHaveBeenCalledOnce();
    expect(callback.mock.calls[0][0].type).toBe('idle');
    expect(callback.mock.calls[0][0].data.idleSeconds).toBe(5);

    timer.close();
  });

  it('resets the timer on reset()', () => {
    const callback = vi.fn();
    const timer = createIdleTimer(5000, callback);

    vi.advanceTimersByTime(4000);
    timer.reset();

    vi.advanceTimersByTime(4000);
    expect(callback).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1000);
    expect(callback).toHaveBeenCalledOnce();

    timer.close();
  });

  it('does not fire after close()', () => {
    const callback = vi.fn();
    const timer = createIdleTimer(5000, callback);

    vi.advanceTimersByTime(3000);
    timer.close();

    vi.advanceTimersByTime(10000);
    expect(callback).not.toHaveBeenCalled();
  });
});
