import type { Agent } from '@mastra/core/agent';
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { safeGenerate } from '../../src/lib/safeGenerate.js';

describe('safeGenerate', () => {
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
});
