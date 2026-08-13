import type { Agent } from '@mastra/core/agent';
import { describe, expect, it, vi } from 'vitest';
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

  it('repairs a past ISO deadline once using the authoritative date context', async () => {
    const past = sampleObjectives.map((objective) => ({
      ...objective,
      objective: 'Increase MQL volume by 30% by 2025-09-01.',
      timeBound: 'Complete by 2025-09-01.',
      deadline: '2025-09-01',
    }));
    const corrected = sampleObjectives.map((objective) => ({
      ...objective,
      objective: 'Increase MQL volume by 30% by 2026-09-01.',
      timeBound: 'Complete by 2026-09-01.',
      deadline: '2026-09-01',
    }));
    const responses = [past, corrected];
    const generate = vi.fn(async () => ({ object: responses.shift() }));
    const agent = { generate } as unknown as Agent;

    const result = await runSmartObjectives(agent, {
      product: sampleProduct,
      buyerJourney: [sampleJourney],
      temporalContext: {
        asOfDate: '2026-08-13',
        timeZone: 'Africa/Cairo',
        campaignStartDate: '2026-08-20',
        campaignEndDate: '2026-09-30',
      },
    });

    expect(result[0]?.deadline).toBe('2026-09-01');
    expect(generate).toHaveBeenCalledTimes(2);
    expect(JSON.stringify(generate.mock.calls[1])).toContain(
      'date 2025-09-01 is before the authoritative planning start 2026-08-20',
    );
  });

  it('fails closed when a repaired objective still contains a past date', async () => {
    const past = sampleObjectives.map((objective) => ({
      ...objective,
      objective: 'Increase MQL volume by 30% by 2025-09-01.',
      timeBound: 'Complete by 2025-09-01.',
      deadline: '2025-09-01',
    }));
    const generate = vi.fn(async () => ({ object: past }));
    const agent = { generate } as unknown as Agent;

    await expect(
      runSmartObjectives(agent, {
        product: sampleProduct,
        buyerJourney: [sampleJourney],
        temporalContext: {
          asOfDate: '2026-08-13',
          timeZone: 'Africa/Cairo',
          campaignStartDate: '2026-08-20',
          campaignEndDate: null,
        },
      }),
    ).rejects.toThrow('SMART objective dates failed validation');
    expect(generate).toHaveBeenCalledTimes(2);
  });
});
