import { describe, expect, it } from 'vitest';
import { runSmartObjectives } from '../../src/agents/smart-objectives/agent.js';
import { buildMockAgent } from '../helpers/mockAgent.js';
import {
  sampleJourney,
  sampleObjectives,
  sampleProduct,
} from '../helpers/fixtures.js';

describe('SMART Objectives agent', () => {
  it('returns one or more SMART objectives', async () => {
    const agent = buildMockAgent(sampleObjectives);
    const result = await runSmartObjectives(agent, {
      product: sampleProduct,
      buyerJourney: [sampleJourney],
    });
    expect(result.length).toBeGreaterThan(0);
    expect(result[0]?.funnelStage).toBe('awareness');
  });

  it('throws when the agent returns an empty array', async () => {
    const agent = buildMockAgent([]);
    await expect(
      runSmartObjectives(agent, { product: sampleProduct, buyerJourney: [sampleJourney] }),
    ).rejects.toThrow();
  });
});
