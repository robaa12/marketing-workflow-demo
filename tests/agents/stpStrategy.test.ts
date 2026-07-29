import { describe, expect, it } from 'vitest';
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

  it('throws when the agent returns an invalid object', async () => {
    const agent = buildMockAgent({ segments: [] });
    await expect(runSTPStrategy(agent, sampleProduct)).rejects.toThrow();
  });
});
