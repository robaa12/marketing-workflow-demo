import { describe, expect, it } from 'vitest';
import { runBuyerPersona } from '../../src/agents/buyer-persona/agent.js';
import { buildMockAgent } from '../helpers/mockAgent.js';
import { samplePersonas, sampleProduct, sampleStp } from '../helpers/fixtures.js';

describe('Buyer Persona agent', () => {
  it('returns 1-3 personas linked to segments', async () => {
    const agent = buildMockAgent(samplePersonas);
    const result = await runBuyerPersona(agent, {
      product: sampleProduct,
      stp: sampleStp,
      maxPersonas: 3,
    });
    expect(result).toHaveLength(1);
    expect(result[0]?.segmentId).toBe('smb-marketer');
  });

  it('caps the result at 3 personas', async () => {
    const tooMany = Array.from({ length: 5 }, (_, i) => ({
      ...samplePersonas[0]!,
      id: `p${i}`,
    }));
    const agent = buildMockAgent(tooMany);
    await expect(
      runBuyerPersona(agent, {
        product: sampleProduct,
        stp: sampleStp,
        maxPersonas: 3,
      }),
    ).rejects.toThrow();
  });
});
