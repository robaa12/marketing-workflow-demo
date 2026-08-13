import { describe, expect, it } from 'vitest';
import { auditCampaignClaimsForBrand } from '../../src/lib/claim-audit.js';
import type { CampaignContentDraftOutput } from '../../src/schemas/content.js';

function draft(caption: string): CampaignContentDraftOutput {
  return {
    temporalContext: { asOfDate: '2026-08-13', timeZone: 'Africa/Cairo', campaignStartDate: '2026-08-13', campaignEndDate: null },
    strategy: {} as CampaignContentDraftOutput['strategy'],
    calendar: [{
      date: '2026-08-02',
      platform: 'linkedin',
      caption,
      hashtags: [],
      visualPrompt: 'A concise dashboard.',
      cta: 'Book a demo',
    }],
    notes: [],
    sources: [{
      title: 'Customer case study',
      url: 'https://example.com/case-study',
      retrievedAt: '2026-08-02T00:00:00.000Z',
    }],
  };
}

describe('campaign claim audit', () => {
  it('marks quantified claims unsupported without an approved claim', () => {
    const audit = auditCampaignClaimsForBrand(draft('Save 5 hours every week.'), []);

    expect(audit).toMatchObject({ unsupportedCount: 1 });
    expect(audit.verifications[0]?.status).toBe('unsupported');
  });

  it('clears an exact approved claim', () => {
    const audit = auditCampaignClaimsForBrand(
      draft('Reports in 5 minutes, not 5 hours.'),
      ['Reports in 5 minutes, not 5 hours.'],
    );

    expect(audit).toMatchObject({ unsupportedCount: 0 });
    expect(audit.verifications[0]?.status).toBe('approved');
  });
});
