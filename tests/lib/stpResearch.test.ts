import { describe, expect, it } from 'vitest';
import { researchSTPMarket } from '../../src/lib/stp-research.js';
import { sampleProduct } from '../helpers/fixtures.js';

describe('STP research', () => {
  it('runs bounded queries and deduplicates citations', async () => {
    const research = await researchSTPMarket(sampleProduct, async ({ query }) => ({
      query,
      cached: false,
      citations: [{
        title: 'Market report',
        url: 'https://example.com/report',
        publisher: 'example.com',
        excerpt: 'Useful market evidence.',
        score: 0.9,
        retrievedAt: '2026-08-02T00:00:00.000Z',
      }],
    }));

    expect(research.queries).toHaveLength(2);
    expect(research.citations).toHaveLength(1);
    expect(research.warnings).toEqual([]);
  });

  it('degrades gracefully when research is unavailable', async () => {
    const research = await researchSTPMarket(sampleProduct, async () => {
      throw new Error('search unavailable');
    });

    expect(research.citations).toEqual([]);
    expect(research.warnings).toHaveLength(2);
  });
});
