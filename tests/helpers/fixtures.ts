import {
  BuyerJourneySchema,
  BuyerPersonaSchema,
  CampaignStrategySchema,
  ProductProfileSchema,
  SmartObjectiveSchema,
  STPResultSchema,
  type BuyerJourney,
  type BuyerPersona,
  type CampaignStrategy,
  type ProductProfile,
  type SmartObjective,
  type STPResult,
} from '../../src/schemas/index.js';

/**
 * Shared valid fixtures used by every agent test and the integration test.
 * Kept in one place so the chain of expectations is consistent.
 */

export const sampleProduct: ProductProfile = ProductProfileSchema.parse({
  name: 'Insight Loop',
  type: 'B2B SaaS',
  industry: 'Software',
  businessModel: 'saas',
  productMaturity: 'growth',
  pricingModel: 'subscription',
  coreFeatures: ['Automated reporting', 'Anomaly alerts'],
  customerProblems: ['Reporting eats hours every week'],
  valueProposition: 'Reports in 5 minutes, not 5 hours.',
  uniqueSellingPoints: ['30+ integrations out of the box'],
  differentiators: ['Self-serve onboarding, no consultant required'],
});

export const sampleStp: STPResult = STPResultSchema.parse({
  segments: [
    {
      id: 'smb-marketer',
      label: 'SMB marketers',
      technicalMaturity: 'medium',
    },
    {
      id: 'mid-market-marketer',
      label: 'Mid-market marketers',
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
      segmentId: 'mid-market-marketer',
      marketAttractiveness: 8,
      productFit: 6,
      revenuePotential: 9,
      easeOfAcquisition: 4,
      competitiveIntensity: 3,
      weightedScore: 6.0,
      rationale: 'Big revenue, harder to acquire.',
    },
  ],
  targetedSegments: [
    {
      segmentId: 'smb-marketer',
      priority: 'primary',
      justification: 'Best product fit and ease of acquisition.',
    },
    {
      segmentId: 'mid-market-marketer',
      priority: 'secondary',
      justification: 'Bigger revenue but more competitive.',
    },
  ],
  positioning: {
    positioningStatement:
      'For SMB marketers who hate reporting, Insight Loop is the automated reporting platform that ships weekly reports in 5 minutes because it integrates with 30+ ad platforms out of the box.',
    valueProposition: 'Reports in 5 minutes, not 5 hours.',
    brandPromise: 'Reporting on autopilot.',
    keyDifferentiators: [
      '30+ native integrations',
      'Self-serve onboarding in under 10 minutes',
    ],
    messagingPillars: [
      { pillar: 'Speed', description: 'Get time back every week.' },
      { pillar: 'Coverage', description: 'Every channel, one source of truth.' },
    ],
    toneOfVoice: 'Direct, practical, never breezy.',
  },
  rationale:
    'SMB marketers are the primary target because they have the highest product fit and the lowest acquisition cost; mid-market is the secondary target because of revenue potential.',
});

export const samplePersonas: BuyerPersona[] = [
  BuyerPersonaSchema.parse({
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
    motivations: ['Get promoted to VP Marketing'],
    buyingTriggers: ['New fiscal year budget'],
    objections: ['Onboarding will take forever'],
    decisionCriteria: ['Time to value', 'Integration coverage'],
    preferredChannels: ['linkedin', 'email'],
    preferredContent: ['case-study', 'webinar'],
    summary:
      'Priya is the head of growth at a 30-person SaaS. She lives in LinkedIn, hates dashboards, and wants a tool that just works.',
  }),
];

export const sampleJourney: BuyerJourney = BuyerJourneySchema.parse({
  personaId: 'priya-growth',
  personaName: 'Priya Shah',
  awareness: {
    stage: 'awareness',
    problems: ['Reporting eats hours every week'],
    questions: ['Is there a faster way to do weekly reporting?'],
    contentNeeds: [
      { type: 'blog-post', topic: 'ROI of automated reporting', goal: 'educate' },
    ],
    channels: ['linkedin', 'seo'],
    kpis: ['impressions'],
  },
  consideration: {
    stage: 'consideration',
    problems: ['Comparing vendors'],
    questions: ['Which tool integrates with all my channels?'],
    evaluationCriteria: ['Integration coverage', 'Time to value'],
    competitors: ['in-house spreadsheets', 'manual reporting'],
    trustSignals: ['Customer case studies', 'SOC 2 compliance'],
    requiredInformation: ['Pricing', 'Onboarding steps'],
    contentNeeds: [
      { type: 'case-study', topic: 'Acme cut reporting by 80%', goal: 'proof' },
    ],
    channels: ['linkedin', 'email'],
    kpis: ['reply-rate'],
  },
  decision: {
    stage: 'decision',
    objections: ['Onboarding is slow'],
    purchaseTriggers: ['New budget'],
    cta: 'Book a 20-minute demo',
    channels: ['linkedin'],
    kpis: ['demo-bookings'],
  },
  retention: {
    stage: 'retention',
    followUp: ['Weekly office hours', 'Dedicated CSM after 30 days'],
    upsellOpportunities: ['Multi-seat upgrade', 'White-label reports'],
    customerEducation: ['On-demand training library', 'Quarterly power-user workshops'],
    channels: ['email', 'community'],
  },
  advocacy: {
    stage: 'advocacy',
    referralOpportunities: ['$500 referral credit'],
    reviews: ['G2 review prompt after 90 days'],
    communityEngagement: ['Private Slack community for customers'],
  },
});

export const sampleObjectives: SmartObjective[] = [
  SmartObjectiveSchema.parse({
    id: 'mql-linkedin',
    objective:
      'Increase MQL volume from LinkedIn by 30% within 90 days by running 4 lead-gen campaigns.',
    specific: '4 LinkedIn lead-gen campaigns targeting the SMB segment.',
    measurable: 'Weekly MQL count from LinkedIn, tracked in HubSpot.',
    achievable:
      'Prior campaigns delivered +15%; +30% is ambitious but feasible with new creative.',
    relevant: 'MQL volume is the primary growth lever this quarter.',
    timeBound: '90 days from launch.',
    kpi: 'MQL volume',
    targetValue: '+30%',
    deadline: '90 days',
    funnelStage: 'awareness',
    measurementMethod: 'HubSpot MQL source field.',
    reasoning:
      'Awareness is the bottleneck per the buyer journey; LinkedIn is the primary channel for the SMB persona.',
    smartCheck: {
      specific: true,
      measurable: true,
      achievable: true,
      relevant: true,
      timeBound: true,
    },
  }),
];

export const sampleStrategy: CampaignStrategy = CampaignStrategySchema.parse({
  summary:
    'A balanced plan that prioritises awareness and lead generation while keeping room for conversion optimisation.',
  primaryChannels: [
    {
      channel: 'linkedin',
      rationale: 'Primary channel for the SMB persona.',
      estimatedShare: 60,
      primaryFunnelStage: 'awareness',
      expectedKpis: ['impressions', 'ctr'],
    },
    {
      channel: 'email',
      rationale: 'Direct nurture channel for warm leads.',
      estimatedShare: 40,
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
      secondaryKpis: ['ctr'],
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
    visualStyle: 'Clean, technical, blue-and-white palette, real product screenshots.',
    storytellingApproach: 'Pain → Insight → Outcome, anchored in real customer numbers.',
    doList: ['Use real numbers', 'Lead with the time saved', 'Show product UI'],
    dontList: ['Avoid hype words', 'No stock photos of "happy marketers"'],
  },
  budgetAllocation: [
    { bucket: 'Paid social', percentage: 60, rationale: 'Highest expected return.' },
    { bucket: 'Content', percentage: 30, rationale: 'Fuels nurture.' },
    { bucket: 'Tools', percentage: 10, rationale: 'Analytics + CRM.' },
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
      target: '120 / month',
      measurementCadence: 'weekly',
      owner: 'Growth',
    },
  ],
  experiments: [
    {
      id: 'cta-copy',
      hypothesis:
        'If we replace the primary CTA with benefit-led copy, demo requests will increase by 15% because it speaks to the persona\'s frustration.',
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
