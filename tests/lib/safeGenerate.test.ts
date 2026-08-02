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
});
