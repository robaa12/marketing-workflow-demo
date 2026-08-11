import type { Agent } from '@mastra/core/agent';
import { describe, expect, it, vi } from 'vitest';
import { runSTPStrategy } from '../../src/agents/stp/agent.js';
import { buildMockAgent } from '../helpers/mockAgent.js';
import { sampleProduct, sampleStp } from '../helpers/fixtures.js';

describe('STP Strategy agent', () => {
  it('returns a parsed STP result', async () => {
    const agent = buildMockAgent(sampleStp);
    const result = await runSTPStrategy(agent, sampleProduct);
    expect(result.segments).toHaveLength(2);
    expect(result.targetedSegments[0]?.priority).toBe('primary');
  });

  it('sends a compact product and bounded research evidence to the model', async () => {
    const generate = vi.fn(async (_messages: unknown, _options?: unknown) => ({ object: sampleStp }));
    const agent = { generate } as unknown as Agent;
    const oversizedExcerpt = 'evidence '.repeat(200);

    await runSTPStrategy(agent, sampleProduct, {
      queries: ['query'],
      citations: Array.from({ length: 6 }, (_, index) => ({
        title: `Source ${index}`,
        url: `https://example.com/${index}`,
        publisher: 'Example',
        excerpt: oversizedExcerpt,
        retrievedAt: '2026-08-10T00:00:00.000Z',
      })),
      warnings: ['one', 'two', 'three', 'four'],
    });

    const messages = generate.mock.calls[0]?.[0] as Array<{ content: string }>;
    const payload = JSON.parse(messages[0]!.content);
    expect(payload.product).not.toHaveProperty('verifiedFacts');
    expect(payload.research.citations).toHaveLength(4);
    expect(payload.research.citations[0].excerpt.length).toBeLessThanOrEqual(600);
    expect(payload.research.citations[0]).not.toHaveProperty('url');
    expect(payload.research.warnings).toHaveLength(3);
  });

  it('throws when the agent returns an invalid object', async () => {
    const agent = buildMockAgent({ segments: [] });
    await expect(runSTPStrategy(agent, sampleProduct)).rejects.toThrow();
  });
});
