import { describe, expect, it } from 'vitest';
import { resolveBrandContext } from '../../src/tools/brand-context.tool.js';

const profiles = JSON.stringify([{
  brandName: 'Insight Loop',
  voice: 'Direct and practical',
  approvedClaims: ['Reports in 5 minutes, not 5 hours.'],
  prohibitedTerms: ['guaranteed'],
  toneExamples: ['Show the time saved.'],
  assetUrls: [],
  updatedAt: '2026-08-02T00:00:00.000Z',
}]);

describe('brand context lookup', () => {
  it('matches a profile without case sensitivity', () => {
    expect(resolveBrandContext('insight loop', profiles)).toMatchObject({
      brandName: 'Insight Loop',
      prohibitedTerms: ['guaranteed'],
    });
  });

  it('returns undefined when no profile matches', () => {
    expect(resolveBrandContext('Unknown Brand', profiles)).toBeUndefined();
  });

  it('rejects malformed configuration', () => {
    expect(() => resolveBrandContext('Insight Loop', '{bad json')).toThrow(
      'BRAND_CONTEXT_JSON must be a JSON array of valid brand profiles.',
    );
  });
});
