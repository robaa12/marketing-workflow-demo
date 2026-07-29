import { describe, expect, it } from 'vitest';
import { runBuyerJourney } from '../../src/agents/buyer-journey/agent.js';
import { buildMockAgent } from '../helpers/mockAgent.js';
import {
  sampleJourney,
  samplePersonas,
  sampleProduct,
} from '../helpers/fixtures.js';

describe('Buyer Journey agent', () => {
  it('returns one journey per persona', async () => {
    const agent = buildMockAgent([sampleJourney]);
    const result = await runBuyerJourney(agent, {
      product: sampleProduct,
      personas: samplePersonas,
    });
    expect(result).toHaveLength(1);
    expect(result[0]?.personaId).toBe('priya-growth');
    expect(result[0]?.awareness.stage).toBe('awareness');
  });

  it('throws when the agent returns an empty array', async () => {
    const agent = buildMockAgent([]);
    await expect(
      runBuyerJourney(agent, {
        product: sampleProduct,
        personas: samplePersonas,
      }),
    ).rejects.toThrow();
  });
});
