import { describe, expect, it } from 'vitest';
import { verifyClaims } from '../../src/tools/claim-verifier.tool.js';

describe('claim verification', () => {
  it('distinguishes approved, evidence-linked, and unsupported claims', () => {
    const results = verifyClaims([
      { text: 'Reports in 5 minutes, not 5 hours.' },
      { text: 'Teams save five hours each week.', sourceUrls: ['https://example.com/case-study'] },
      { text: 'The number one reporting platform.' },
    ], [{ title: 'Customer case study', url: 'https://example.com/case-study' }], [
      'Reports in 5 minutes, not 5 hours.',
    ]);

    expect(results.map((result) => result.status)).toEqual([
      'approved',
      'evidence-linked',
      'unsupported',
    ]);
  });
});
