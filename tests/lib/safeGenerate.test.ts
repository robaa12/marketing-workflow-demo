import type { Agent } from '@mastra/core/agent';
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { safeGenerate } from '../../src/lib/safeGenerate.js';

describe('safeGenerate', () => {
  it('falls back when Mastra reports its current structured validation error text', async () => {
    const generate = vi.fn(async (_messages: unknown, options?: Record<string, any>) => {
      if (options?.structuredOutput) {
        throw new Error('Structured output validation failed: channels.0: Invalid option');
      }
      return { text: '{"value":7}' };
    });
    const agent = {
      generate,
    } as unknown as Agent;

    await expect(
      safeGenerate(agent, [{ role: 'user', content: 'Return a value.' }], z.object({ value: z.number() })),
    ).resolves.toEqual({ value: 7 });
    expect(generate).toHaveBeenCalledTimes(2);
    for (const call of generate.mock.calls) {
      expect(call[1]?.modelSettings).toMatchObject({ maxRetries: 0 });
    }
  });

  it('injects the JSON schema, including enum values, into text fallback', async () => {
    const agent = {
      generate: vi.fn(async (messages, options) => {
        if (options?.structuredOutput) throw new Error('APICallError');
        const systemMessage = messages.find((message: { role: string }) => message.role === 'system');
        expect(systemMessage?.content).toContain('"enum":["linkedin","meta"]');
        expect(systemMessage?.content).not.toContain('"$schema"');
        expect(systemMessage?.content).not.toContain('"description"');
        return { text: '["linkedin"]' };
      }),
    } as unknown as Agent;

    await expect(
      safeGenerate(
        agent,
        [{ role: 'user', content: 'Return channels.' }],
        z.array(z.enum(['linkedin', 'meta'])),
      ),
    ).resolves.toEqual(['linkedin']);
  });

  it('uses a later balanced JSON value when an earlier example fails the schema', async () => {
    const agent = {
      generate: vi.fn(async (_messages, options) => {
        if (options?.structuredOutput) throw new Error('APICallError');
        return {
          text: 'Example: {"value":"not-a-number"}\nActual response: {"value":7}',
        };
      }),
    } as unknown as Agent;

    await expect(
      safeGenerate(agent, [{ role: 'user', content: 'Return a value.' }], z.object({ value: z.number() })),
    ).resolves.toEqual({ value: 7 });
  });

  it('unwraps a single valid object from a root array', async () => {
    const agent = {
      generate: vi.fn(async (_messages, options) => {
        if (options?.structuredOutput) throw new Error('APICallError');
        return { text: '[{"value":7}]' };
      }),
    } as unknown as Agent;

    await expect(
      safeGenerate(agent, [{ role: 'user', content: 'Return a value.' }], z.object({ value: z.number() })),
    ).resolves.toEqual({ value: 7 });
  });

  it('requests one schema correction after invalid JSON output', async () => {
    let calls = 0;
    const agent = {
      generate: vi.fn(async (_messages, options) => {
        calls += 1;
        if (calls === 1 && options?.structuredOutput) throw new Error('APICallError');
        if (calls === 3 && options?.structuredOutput) return { object: { value: 7 } };
        return { text: '[{"notValue":7}]' };
      }),
    } as unknown as Agent;

    await expect(
      safeGenerate(agent, [{ role: 'user', content: 'Return a value.' }], z.object({ value: z.number() })),
    ).resolves.toEqual({ value: 7 });
    expect(vi.mocked(agent.generate)).toHaveBeenCalledTimes(3);
    const correctionMessages = vi.mocked(agent.generate).mock.calls[2]?.[0] as Array<{
      role: string;
      content: string;
    }>;
    expect(correctionMessages.at(-1)?.content).toContain('object or array according to the schema root');
    expect(correctionMessages.at(-1)?.content).not.toContain('Never return an array');
  });

  it('requests schema correction after an empty text response', async () => {
    let calls = 0;
    const agent = {
      generate: vi.fn(async (_messages, options) => {
        calls += 1;
        if (calls === 1 && options?.structuredOutput) return {};
        if (calls === 2) return { text: '' };
        return { object: { value: 7 } };
      }),
    } as unknown as Agent;

    await expect(
      safeGenerate(agent, [{ role: 'user', content: 'Return a value.' }], z.object({ value: z.number() })),
    ).resolves.toEqual({ value: 7 });
    expect(vi.mocked(agent.generate)).toHaveBeenCalledTimes(3);
  });

  it('falls back to text mode when the structured attempt stalls', async () => {
    vi.useFakeTimers();
    try {
      const generate = vi.fn(async (_messages: unknown, options?: Record<string, any>) => {
        if (options?.structuredOutput) return new Promise(() => undefined);
        return { text: '{"value":7}' };
      });
      const agent = { generate } as unknown as Agent;

      const generation = safeGenerate(
        agent,
        [{ role: 'user', content: 'Return a value.' }],
        z.object({ value: z.number() }),
        'structured-stall-test',
        { timeoutMs: 20_000, structuredAttemptTimeoutMs: 5_000 },
      );
      const assertion = expect(generation).resolves.toEqual({ value: 7 });

      await vi.advanceTimersByTimeAsync(5_000);
      await assertion;
      expect(generate).toHaveBeenCalledTimes(2);
      expect(generate.mock.calls[1]?.[1]?.structuredOutput).toBeUndefined();
    } finally {
      vi.useRealTimers();
    }
  });

  it('can start in text mode without making a structured-output request', async () => {
    const generate = vi.fn(async (
      _messages: unknown,
      _options?: Record<string, any>,
    ) => ({ text: '{"value":7}' }));
    const agent = { generate } as unknown as Agent;

    await expect(
      safeGenerate(
        agent,
        [{ role: 'user', content: 'Return a value.' }],
        z.object({ value: z.number() }),
        'text-first-test',
        { textFirst: true },
      ),
    ).resolves.toEqual({ value: 7 });

    expect(generate).toHaveBeenCalledTimes(1);
    expect(generate.mock.calls[0]?.[1]?.structuredOutput).toBeUndefined();
  });

  it('keeps text-first schema correction out of structured-output mode', async () => {
    const generate = vi.fn()
      .mockResolvedValueOnce({ text: '{"wrong":7}' })
      .mockResolvedValueOnce({ text: '{"value":7}' });
    const agent = { generate } as unknown as Agent;

    await expect(
      safeGenerate(
        agent,
        [{ role: 'user', content: 'Return a value.' }],
        z.object({ value: z.number() }),
        'text-first-correction-test',
        { textFirst: true },
      ),
    ).resolves.toEqual({ value: 7 });

    expect(generate).toHaveBeenCalledTimes(2);
    expect(generate.mock.calls[1]?.[1]?.structuredOutput).toBeUndefined();
  });

  it('reports the configured total budget when a fallback consumes the remainder', async () => {
    vi.useFakeTimers();
    try {
      const agent = {
        generate: vi.fn(async (_messages, options) => {
          if (options?.structuredOutput) throw new Error('APICallError');
          return new Promise(() => undefined);
        }),
      } as unknown as Agent;

      const generation = safeGenerate(
        agent,
        [{ role: 'user', content: 'Return a value.' }],
        z.object({ value: z.number() }),
        'budget-test',
        { timeoutMs: 20_000 },
      );
      const assertion = expect(generation).rejects.toThrow(
        'safeGenerate: budget-test exceeded the 20000ms timeout',
      );

      await vi.advanceTimersByTimeAsync(20_000);
      await assertion;
    } finally {
      vi.useRealTimers();
    }
  });
});
