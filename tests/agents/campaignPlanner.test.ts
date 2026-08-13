import type { Agent } from '@mastra/core/agent';
import { describe, expect, it, vi } from 'vitest';
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

  it('repairs prose dates outside the authoritative campaign window', async () => {
    const invalid = {
      ...sampleStrategy,
      summary: `${sampleStrategy.summary} Launch begins on 2025-09-01.`,
    };
    const corrected = {
      ...sampleStrategy,
      summary: `${sampleStrategy.summary} Launch begins on 2026-08-20.`,
    };
    const responses = [invalid, corrected];
    const generate = vi.fn(async () => ({ object: responses.shift() }));
    const agent = { generate } as unknown as Agent;

    const result = await runCampaignPlanner(agent, {
      product: sampleProduct,
      stp: sampleStp,
      personas: samplePersonas,
      buyerJourney: [sampleJourney],
      smartObjectives: sampleObjectives,
      options: 'balanced',
      temporalContext: {
        asOfDate: '2026-08-13',
        timeZone: 'Africa/Cairo',
        campaignStartDate: '2026-08-20',
        campaignEndDate: '2026-09-30',
      },
    });

    expect(result.summary).toContain('2026-08-20');
    expect(generate).toHaveBeenCalledTimes(2);
    expect(JSON.stringify(generate.mock.calls[1])).toContain(
      'date 2025-09-01 is before the authoritative planning start 2026-08-20',
    );
  });
});
