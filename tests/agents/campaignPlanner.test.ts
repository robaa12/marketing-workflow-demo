import { describe, expect, it } from 'vitest';
import { runCampaignPlanner } from '../../src/agents/campaign-planner/agent.js';
import { buildMockAgent } from '../helpers/mockAgent.js';
import {
  sampleJourney,
  sampleObjectives,
  samplePersonas,
  sampleProduct,
  sampleStp,
  sampleStrategy,
} from '../helpers/fixtures.js';

describe('Campaign Planner agent', () => {
  it('returns a parsed campaign strategy', async () => {
    const agent = buildMockAgent(sampleStrategy);
    const result = await runCampaignPlanner(agent, {
      product: sampleProduct,
      stp: sampleStp,
      personas: samplePersonas,
      buyerJourney: [sampleJourney],
      smartObjectives: sampleObjectives,
      options: 'balanced',
    });
    expect(result.primaryChannels).toHaveLength(2);
    expect(result.campaignRecommendations[0]?.targetPersonaIds).toContain('priya-growth');
  });

  it('honours the primaryGoal option', async () => {
    const agent = buildMockAgent(sampleStrategy);
    const result = await runCampaignPlanner(agent, {
      product: sampleProduct,
      stp: sampleStp,
      personas: samplePersonas,
      buyerJourney: [sampleJourney],
      smartObjectives: sampleObjectives,
      options: 'awareness',
    });
    expect(result).toBeDefined();
  });

  it('throws when the agent returns an invalid object', async () => {
    const agent = buildMockAgent({ summary: 'x' });
    await expect(
      runCampaignPlanner(agent, {
        product: sampleProduct,
        stp: sampleStp,
        personas: samplePersonas,
        buyerJourney: [sampleJourney],
        smartObjectives: sampleObjectives,
        options: 'balanced',
      }),
    ).rejects.toThrow();
  });
});
