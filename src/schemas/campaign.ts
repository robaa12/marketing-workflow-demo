import { z } from 'zod';
import {
  CampaignTypeEnum,
  ContentTypeEnum,
  FunnelStageEnum,
  MarketingChannelEnum,
} from './common.js';

export const ChannelAllocationSchema = z.object({
  channel: MarketingChannelEnum,
  rationale: z.string().min(5),
  estimatedShare: z
    .number()
    .min(0)
    .max(100)
    .describe('Percentage of total budget or effort (0-100).'),
  primaryFunnelStage: FunnelStageEnum,
  expectedKpis: z.array(z.string().min(3)).min(1).max(4),
});
export type ChannelAllocation = z.infer<typeof ChannelAllocationSchema>;

export const CampaignRecommendationSchema = z.object({
  id: z.string().min(1).describe('Stable kebab-case id.'),
  name: z.string().min(2),
  type: CampaignTypeEnum,
  primaryFunnelStage: FunnelStageEnum,
  objective: z.string().min(10),
  targetPersonaIds: z.array(z.string().min(1)).min(1),
  channels: z.array(MarketingChannelEnum).min(1).max(5),
  contentMix: z
    .array(
      z.object({
        type: ContentTypeEnum,
        topic: z.string().min(3),
        goal: z.string().min(3),
      }),
    )
    .min(1)
    .max(5),
  primaryKpi: z.string().min(3),
  secondaryKpis: z.array(z.string().min(3)).max(4).default([]),
  estimatedEffort: z
    .enum(['low', 'medium', 'high'])
    .describe('Relative implementation cost.'),
  estimatedImpact: z
    .enum(['low', 'medium', 'high'])
    .describe('Expected impact on the primary KPI.'),
  duration: z
    .string()
    .min(3)
    .describe('Suggested running window (e.g. "6 weeks", "always-on").'),
});
export type CampaignRecommendation = z.infer<typeof CampaignRecommendationSchema>;

export const ExperimentSchema = z.object({
  id: z.string().min(1),
  hypothesis: z.string().min(10),
  metric: z.string().min(3),
  successCriteria: z.string().min(5),
  minimumSampleSize: z.string().optional(),
  duration: z.string().min(3),
  channels: z.array(MarketingChannelEnum).min(1).max(4),
});
export type Experiment = z.infer<typeof ExperimentSchema>;

export const CampaignStrategySchema = z.object({
  summary: z
    .string()
    .min(30)
    .describe('One paragraph summarising the overall campaign plan.'),
  primaryChannels: z
    .array(ChannelAllocationSchema)
    .min(2)
    .describe('Channel mix with allocation rationale.'),
  campaignRecommendations: z
    .array(CampaignRecommendationSchema)
    .min(1)
    .describe('Concrete campaign concepts ready to brief out.'),
  audienceStrategy: z
    .object({
      primaryAudience: z.string().min(10),
      secondaryAudiences: z.array(z.string().min(5)).min(0).max(3),
      retargetingAudiences: z.array(z.string().min(5)).min(0).max(3),
      lookalikeSeeds: z.array(z.string().min(5)).min(0).max(3),
    })
    .describe('Audiences to target across channels.'),
  creativeDirection: z
    .object({
      keyMessages: z.array(z.string().min(5)).min(2).max(5),
      visualStyle: z.string().min(10),
      storytellingApproach: z.string().min(10),
      doList: z.array(z.string().min(3)).min(1).max(6),
      dontList: z.array(z.string().min(3)).min(1).max(6),
    })
    .describe('Guardrails for the creative team.'),
  budgetAllocation: z
    .array(
      z.object({
        bucket: z.string().min(2),
        percentage: z.number().min(0).max(100),
        rationale: z.string().min(5),
      }),
    )
    .min(2)
    .describe('How the budget splits across categories.'),
  ctaStrategy: z
    .object({
      primaryCta: z.string().min(3),
      secondaryCtas: z.array(z.string().min(3)).min(0).max(3),
      ctaHierarchy: z
        .string()
        .min(10)
        .describe('When to use the primary vs. secondary CTAs.'),
    }),
  kpis: z
    .array(
      z.object({
        name: z.string().min(3),
        target: z.string().min(1),
        measurementCadence: z.string().min(3),
        owner: z.string().min(2).default('Marketing'),
      }),
    )
    .min(2)
    .describe('KPIs the team will report on.'),
  experiments: z
    .array(ExperimentSchema)
    .min(1)
    .describe('A/B tests to run in the first 90 days.'),
  risks: z
    .array(
      z.object({
        risk: z.string().min(5),
        mitigation: z.string().min(5),
      }),
    )
    .min(1)
    .describe('Known risks and how to mitigate them.'),
});
export type CampaignStrategy = z.infer<typeof CampaignStrategySchema>;
