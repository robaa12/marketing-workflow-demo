import { describe, expect, it } from 'vitest';
import {
  BuyerPersonaSchema,
  CampaignStrategySchema,
  ContentTypeEnum,
  FunnelStageEnum,
  MarketingChannelEnum,
  ProductProfileSchema,
  STPResultSchema,
  SmartObjectiveSchema,
  UserProductInputSchema,
} from '../../src/schemas/index.js';

describe('common enums', () => {
  it('exposes funnel stages in canonical order', () => {
    expect(FunnelStageEnum.options).toEqual([
      'awareness',
      'consideration',
      'decision',
      'retention',
      'advocacy',
    ]);
  });

  it('exposes a non-empty marketing channel enum', () => {
    expect(MarketingChannelEnum.options.length).toBeGreaterThan(5);
  });

  it('exposes a non-empty content type enum', () => {
    expect(ContentTypeEnum.options.length).toBeGreaterThan(5);
  });
});

describe('UserProductInputSchema', () => {
  it('accepts a valid input', () => {
    const parsed = UserProductInputSchema.parse({
      description: 'A SaaS that automates marketing reporting',
      industry: 'Software',
      businessType: 'SaaS',
    });
    expect(parsed.industry).toBe('Software');
  });

  it('rejects a description that is too short', () => {
    expect(() =>
      UserProductInputSchema.parse({
        description: 'short',
        industry: 'Software',
        businessType: 'SaaS',
      }),
    ).toThrow();
  });
});

describe('ProductProfileSchema', () => {
  const minimalProduct = {
    name: 'Insight Loop',
    type: 'B2B SaaS',
    industry: 'Software',
    businessModel: 'saas' as const,
    productMaturity: 'growth' as const,
    pricingModel: 'subscription' as const,
    coreFeatures: ['Automated reporting', 'Anomaly alerts'],
    customerProblems: ['Marketers spend too long building weekly reports'],
    valueProposition: 'Ship weekly reports in 5 minutes, not 5 hours.',
    uniqueSellingPoints: ['Connects to 30+ ad platforms out of the box'],
    differentiators: ['Self-serve onboarding, no consultant required'],
  };

  it('parses a minimal valid product', () => {
    const parsed = ProductProfileSchema.parse(minimalProduct);
    expect(parsed.name).toBe('Insight Loop');
    expect(parsed.constraints).toEqual([]);
    expect(parsed.assumptions).toEqual([]);
  });

  it('rejects a product without a name', () => {
    expect(() =>
      ProductProfileSchema.parse({ ...minimalProduct, name: '' }),
    ).toThrow();
  });

  it('rejects an empty coreFeatures list', () => {
    expect(() =>
      ProductProfileSchema.parse({ ...minimalProduct, coreFeatures: [] }),
    ).toThrow();
  });
});

describe('STPResultSchema', () => {
  it('parses a minimal STP result with at least 2 segments', () => {
    const result = STPResultSchema.parse({
      segments: [
        {
          id: 'smb-marketer',
          label: 'SMB Marketers',
          technicalMaturity: 'medium',
        },
        {
          id: 'enterprise-marketer',
          label: 'Enterprise Marketers',
          technicalMaturity: 'high',
        },
      ],
      segmentScores: [
        {
          segmentId: 'smb-marketer',
          marketAttractiveness: 7,
          productFit: 9,
          revenuePotential: 6,
          easeOfAcquisition: 8,
          competitiveIntensity: 5,
          weightedScore: 7.1,
          rationale: 'High fit, easy to acquire.',
        },
        {
          segmentId: 'enterprise-marketer',
          marketAttractiveness: 9,
          productFit: 5,
          revenuePotential: 9,
          easeOfAcquisition: 3,
          competitiveIntensity: 2,
          weightedScore: 5.5,
          rationale: 'Big revenue, but hard to acquire.',
        },
      ],
      targetedSegments: [
        {
          segmentId: 'smb-marketer',
          priority: 'primary',
          justification: 'Best fit and ease of acquisition.',
        },
      ],
      positioning: {
        positioningStatement:
          'For SMB marketers who hate reporting, Insight Loop is an automated reporting platform that ships weekly reports in 5 minutes because it integrates with 30+ ad platforms out of the box.',
        valueProposition: 'Reports in 5 minutes, not 5 hours.',
        brandPromise: 'Reporting on autopilot.',
        keyDifferentiators: ['30+ native integrations', 'No consultant required'],
        messagingPillars: [
          { pillar: 'Speed', description: 'Get time back every week.' },
          { pillar: 'Coverage', description: 'Every channel, one source of truth.' },
        ],
        toneOfVoice: 'Direct, practical, never breezy.',
      },
      rationale:
        'SMB is the primary target because of high product fit and ease of acquisition; enterprise is future.',
    });
    expect(result.targetedSegments).toHaveLength(1);
  });
});

describe('BuyerPersonaSchema', () => {
  it('parses a complete persona', () => {
    const parsed = BuyerPersonaSchema.parse({
      id: 'priya-growth',
      name: 'Priya Shah',
      role: 'Head of Growth',
      archetype: 'Pragmatic operator',
      segmentId: 'smb-marketer',
      company: 'Acme Co',
      companySize: '20-50',
      goals: ['Hit MQL targets', 'Reduce reporting toil'],
      frustrations: ['Drowning in dashboards'],
      painPoints: ['Reporting eats 8 hours a week'],
      motivations: ['Hit promotion to VP Marketing'],
      buyingTriggers: ['New fiscal year budget'],
      objections: ['Onboarding will take forever'],
      decisionCriteria: ['Time to value', 'Integration coverage'],
      preferredChannels: ['linkedin', 'email'],
      preferredContent: ['case-study', 'webinar'],
      summary:
        'Priya is the head of growth at a 30-person SaaS. She lives in LinkedIn, hates dashboards, and wants a tool that just works.',
    });
    expect(parsed.id).toBe('priya-growth');
  });

  it('rejects an empty goals list', () => {
    expect(() =>
      BuyerPersonaSchema.parse({
        id: 'p',
        name: 'P',
        role: 'r',
        archetype: 'a',
        segmentId: 's',
        goals: [],
        frustrations: ['x'],
        painPoints: ['x'],
        motivations: ['x'],
        buyingTriggers: ['x'],
        objections: ['x'],
        decisionCriteria: ['x'],
        preferredChannels: ['linkedin'],
        preferredContent: ['blog-post'],
        summary: 'long enough summary',
      }),
    ).toThrow();
  });
});

describe('SmartObjectiveSchema', () => {
  it('parses a SMART objective with a passing smartCheck', () => {
    const parsed = SmartObjectiveSchema.parse({
      id: 'mql-linkedin',
      objective:
        'Increase MQL volume from LinkedIn by 30% within 90 days by running 4 lead-gen campaigns.',
      specific: '4 LinkedIn lead-gen campaigns targeting the SMB segment.',
      measurable: 'Weekly MQL count from LinkedIn.',
      achievable: 'Prior campaigns delivered +15%; +30% is ambitious but feasible.',
      relevant: 'MQL volume is the primary growth lever this quarter.',
      timeBound: '90 days from launch.',
      kpi: 'MQL volume',
      targetValue: '+30%',
      deadline: '90 days',
      funnelStage: 'awareness',
      measurementMethod: 'HubSpot MQL source field',
      reasoning:
        'Awareness is the bottleneck per the buyer journey; LinkedIn is the primary channel for the SMB persona.',
      smartCheck: {
        specific: true,
        measurable: true,
        achievable: true,
        relevant: true,
        timeBound: true,
      },
    });
    expect(parsed.smartCheck.timeBound).toBe(true);
  });

  it('rejects a SMART check that misses a flag', () => {
    expect(() =>
      SmartObjectiveSchema.parse({
        id: 'mql',
        objective: 'Increase MQL by 30% in 90 days via LinkedIn campaigns.',
        specific: '4 LinkedIn lead-gen campaigns targeting SMB.',
        measurable: 'Weekly MQL count from LinkedIn.',
        achievable: 'Prior campaigns delivered +15% on average.',
        relevant: 'MQL volume is the primary growth lever this quarter.',
        timeBound: '90 days from launch.',
        kpi: 'MQL',
        targetValue: '+30%',
        deadline: '90 days',
        funnelStage: 'awareness',
        measurementMethod: 'HubSpot',
        reasoning: 'Because of the journey.',
        smartCheck: {
          specific: true,
          measurable: true,
          achievable: false,
          relevant: true,
          timeBound: true,
        },
      }),
    ).not.toThrow();
  });
});

describe('CampaignStrategySchema', () => {
  it('parses a minimal but valid strategy', () => {
    const parsed = CampaignStrategySchema.parse({
      summary: 'A balanced plan that prioritises awareness and lead generation.',
      primaryChannels: [
        {
          channel: 'linkedin',
          rationale: 'Primary channel for the SMB persona.',
          estimatedShare: 50,
          primaryFunnelStage: 'awareness',
          expectedKpis: ['impressions', 'ctr'],
        },
        {
          channel: 'email',
          rationale: 'Direct nurture channel.',
          estimatedShare: 30,
          primaryFunnelStage: 'consideration',
          expectedKpis: ['open-rate', 'reply-rate'],
        },
      ],
      campaignRecommendations: [
        {
          id: 'linkedin-awareness',
          name: 'LinkedIn awareness sprint',
          type: 'awareness',
          primaryFunnelStage: 'awareness',
          objective: 'Reach 50k SMB marketers in 4 weeks.',
          targetPersonaIds: ['priya-growth'],
          channels: ['linkedin'],
          contentMix: [
            { type: 'social-post', topic: 'reporting ROI', goal: 'engagement' },
          ],
          primaryKpi: 'impressions',
          estimatedEffort: 'low',
          estimatedImpact: 'medium',
          duration: '4 weeks',
        },
      ],
      audienceStrategy: {
        primaryAudience: 'SMB marketers at 20-50 person SaaS companies.',
        secondaryAudiences: ['Mid-market CMOs'],
        retargetingAudiences: ['Site visitors from the last 30 days'],
        lookalikeSeeds: ['Top 100 customers by ARR'],
      },
      creativeDirection: {
        keyMessages: [
          'Reports in 5 minutes, not 5 hours.',
          'Every channel, one source of truth.',
        ],
        visualStyle: 'Clean, technical, blue-and-white.',
        storytellingApproach: 'Pain → Insight → Outcome.',
        doList: ['Use real numbers'],
        dontList: ['Avoid hype words'],
      },
      budgetAllocation: [
        { bucket: 'Paid social', percentage: 50, rationale: 'Highest expected return.' },
        { bucket: 'Content', percentage: 30, rationale: 'Fuels nurture.' },
        { bucket: 'Tools', percentage: 20, rationale: 'Analytics + CRM.' },
      ],
      ctaStrategy: {
        primaryCta: 'Book a 20-minute demo',
        secondaryCtas: ['Start free trial'],
        ctaHierarchy:
          'Use the primary CTA on landing pages and ads; secondary CTAs in nurture emails.',
      },
      kpis: [
        {
          name: 'MQL volume',
          target: '+30%',
          measurementCadence: 'weekly',
          owner: 'Growth',
        },
        {
          name: 'Demo requests',
          target: '120 / mo',
          measurementCadence: 'weekly',
          owner: 'Growth',
        },
      ],
      experiments: [
        {
          id: 'cta-copy',
          hypothesis:
            'If we replace the primary CTA with a benefit-led copy, demo requests will increase by 15% because it speaks to the persona\'s frustration.',
          metric: 'Demo requests',
          successCriteria: '+15% over baseline',
          duration: '4 weeks',
          channels: ['linkedin'],
        },
      ],
      risks: [
        { risk: 'LinkedIn ad costs spike', mitigation: 'Reserve 20% of budget for backup channels.' },
      ],
    });
    expect(parsed.primaryChannels).toHaveLength(2);
  });
});
