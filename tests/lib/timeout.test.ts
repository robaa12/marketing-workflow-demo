import { afterEach, describe, expect, it, vi } from 'vitest';
import { OperationTimeoutError, withTimeout } from '../../src/lib/timeout.js';

afterEach(() => {
  vi.useRealTimers();
});

describe('withTimeout', () => {
  it('rejects on the deadline even if the operation ignores abort', async () => {
    vi.useFakeTimers();
    let signal: AbortSignal | undefined;
    const result = withTimeout(
      (abortSignal) => {
        signal = abortSignal;
        return new Promise<string>(() => undefined);
      },
      1_000,
      'slow operation',
    );
    const rejection = expect(result).rejects.toBeInstanceOf(OperationTimeoutError);

    await vi.advanceTimersByTimeAsync(1_000);

    await rejection;
    expect(signal?.aborted).toBe(true);
  });
});
