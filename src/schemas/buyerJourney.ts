import { z } from 'zod';
import {
  ContentTypeEnum,
  FunnelStageEnum,
  MarketingChannelEnum,
  normalizeMarketingChannel,
} from './common.js';

const BuyerJourneyChannelSchema = z.preprocess(normalizeMarketingChannel, MarketingChannelEnum);

const StageSchemaBase = z.object({
  problems: z.array(z.string().min(3)).min(1).max(5),
  questions: z.array(z.string().min(3)).min(1).max(5),
  contentNeeds: z
    .array(
      z.object({
        type: ContentTypeEnum,
        topic: z.string().min(3),
        goal: z.string().min(3),
      }),
    )
    .min(1)
    .max(5),
  channels: z
    .array(BuyerJourneyChannelSchema)
    .min(1)
    .max(6),
  kpis: z.array(z.string().min(3)).default([]),
});

const ConsiderationSchema = StageSchemaBase.extend({
  evaluationCriteria: z.array(z.string().min(3)).min(1).max(6),
  competitors: z.array(z.string().min(2)).min(0).max(6),
  trustSignals: z.array(z.string().min(3)).min(1).max(5),
  requiredInformation: z.array(z.string().min(3)).min(1).max(6),
});

const DecisionSchema = z.object({
  objections: z.array(z.string().min(3)).min(1).max(5),
  purchaseTriggers: z.array(z.string().min(3)).min(1).max(5),
  cta: z.string().min(3),
  channels: z.array(BuyerJourneyChannelSchema).min(1).max(5),
  kpis: z.array(z.string().min(3)).default([]),
});

const RetentionSchema = z.object({
  followUp: z.array(z.string().min(3)).min(1).max(5),
  upsellOpportunities: z.array(z.string().min(3)).min(0).max(5),
  customerEducation: z.array(z.string().min(3)).min(1).max(5),
  channels: z.array(BuyerJourneyChannelSchema).min(1).max(5),
});

const AdvocacySchema = z.object({
  referralOpportunities: z.array(z.string().min(3)).min(1).max(4),
  reviews: z.array(z.string().min(3)).min(1).max(4),
  communityEngagement: z.array(z.string().min(3)).min(1).max(4),
});

export const BuyerJourneySchema = z.object({
  personaId: z
    .string()
    .min(1)
    .describe('Foreign key to the BuyerPersona this journey belongs to.'),
  personaName: z.string().min(1),
  awareness: StageSchemaBase.extend({ stage: z.literal(FunnelStageEnum.enum.awareness) }),
  consideration: ConsiderationSchema.extend({
    stage: z.literal(FunnelStageEnum.enum.consideration),
  }),
  decision: DecisionSchema.extend({ stage: z.literal(FunnelStageEnum.enum.decision) }),
  retention: RetentionSchema.extend({ stage: z.literal(FunnelStageEnum.enum.retention) }),
  advocacy: AdvocacySchema.extend({ stage: z.literal(FunnelStageEnum.enum.advocacy) }),
});
export type BuyerJourney = z.infer<typeof BuyerJourneySchema>;

/**
 * Convenient re-export for the funnel stage list used by other schemas.
 */
export const BuyerJourneyFunnelStages = [
  'awareness',
  'consideration',
  'decision',
  'retention',
  'advocacy',
] as const;
