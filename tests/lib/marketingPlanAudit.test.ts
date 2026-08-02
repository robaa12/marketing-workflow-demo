import { describe, expect, it } from 'vitest';
import { auditMarketingPlan } from '../../src/lib/marketing-plan-audit.js';
import { sampleObjectives, sampleProduct, sampleStp, sampleStrategy } from '../helpers/fixtures.js';

describe('marketing plan audit', () => {
  it('flags ICP drift, allocation errors, missing baselines, and unsupported claims', () => {
    const quality = auditMarketingPlan({
      product: {
        ...sampleProduct,
        targetMarket: 'B2B SaaS growth teams and marketing agencies',
        verifiedFacts: ['Automated reporting for B2B SaaS growth teams.'],
      },
      stp: {
        ...sampleStp,
        targetedSegments: [{ segmentId: 'mid-market-marketer', priority: 'primary', justification: 'Test mismatch.' }],
      },
      smartObjectives: sampleObjectives,
      campaignStrategy: {
        ...sampleStrategy,
        primaryChannels: [{ ...sampleStrategy.primaryChannels[0]!, estimatedShare: 60 }],
        budgetAllocation: [
          { bucket: 'Ads', percentage: 70, rationale: 'Test allocation.' },
          { bucket: 'Content', percentage: 20, rationale: 'Test allocation.' },
        ],
        creativeDirection: {
          ...sampleStrategy.creativeDirection,
          keyMessages: ['Get real-time Shopify reporting and save 10 hours every week.', 'Automated reporting.'],
        },
      },
      research: { queries: ['test'], citations: [], warnings: [] },
    });

    expect(quality.status).toBe('needs-rework');
    expect(quality.issues.map((item) => item.code)).toEqual(expect.arrayContaining([
      'icp-drift',
      'channel-allocation-total',
      'budget-allocation-total',
      'missing-evidence',
      'unsupported-claim',
      'objective-baseline-missing',
    ]));
    expect(quality.nextDecisions).toContain('Confirm one primary ICP that matches the supplied target market.');
  });
});
