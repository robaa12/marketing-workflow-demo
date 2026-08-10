import { z } from 'zod';
import { CampaignStrategySchema } from './campaign.js';
import { BuyerJourneySchema } from './buyerJourney.js';
import { SmartObjectiveSchema } from './objectives.js';
import { BuyerPersonaSchema } from './persona.js';
import { ProductProfileSchema, UserProductInputSchema } from './product.js';
import { STPResultSchema } from './stp.js';
import { MarketingPlanQualitySchema } from './planQuality.js';

export const KnowledgeCitationSchema = z.object({
  sourceId: z.string(),
  pageId: z.string().optional(),
  /** Stable vector chunk identifier for audit and replay. */
  chunkId: z.string().optional(),
  sourceType: z.string(),
  title: z.string(),
  url: z.string().url().optional(),
  excerpt: z.string(),
  score: z.number(),
});
export type KnowledgeCitation = z.infer<typeof KnowledgeCitationSchema>;

/**
 * Server-derived retrieval boundary. `sourceIds` is deliberately required
 * whenever project knowledge is used: a project id alone is not sufficient to
 * prove that a source is current and safe to ground a generation.
 */
export const KnowledgeScopeSchema = z.object({
  projectId: z.string().uuid(),
  sourceIds: z.array(z.string().uuid()).max(100),
});
export type KnowledgeScope = z.infer<typeof KnowledgeScopeSchema>;

/** Project-owned editorial guardrails. Unlike retrieved website text, this is
 * trusted configuration supplied by the authenticated backend and must be
 * followed by every generation stage. */
export const ProjectBrandProfileSchema = z.object({
  voice: z.string().min(3).max(1000),
  preferredTerms: z.array(z.string().min(1).max(180)).max(30).default([]),
  prohibitedTerms: z.array(z.string().min(1).max(180)).max(30).default([]),
  writingRules: z.array(z.string().min(1).max(180)).max(30).default([]),
  ctaGuidance: z.string().max(500).optional(),
  languageGuidance: z.string().max(500).optional(),
});
export type ProjectBrandProfile = z.infer<typeof ProjectBrandProfileSchema>;

/**
 * Single source of truth for the marketing strategy workflow.
 *
 * Each agent only mutates the field it owns. Steps forward the entire context
 * so downstream agents can read whatever they need, but they MUST NOT mutate
 * upstream fields. This is enforced by convention and by the discriminated
 * schemas per agent.
 */
export const MarketingStrategyContextSchema = z.object({
  product: ProductProfileSchema,
  stp: STPResultSchema.optional(),
  personas: z.array(BuyerPersonaSchema).optional(),
  buyerJourney: z.array(BuyerJourneySchema).optional(),
  smartObjectives: z.array(SmartObjectiveSchema).optional(),
  campaignStrategy: CampaignStrategySchema.optional(),
  planQuality: MarketingPlanQualitySchema.optional(),
});
export type MarketingStrategyContext = z.infer<typeof MarketingStrategyContextSchema>;

/**
 * Input shape for the workflow as a whole.
 * The orchestrator derives the initial `MarketingStrategyContext` from this.
 */
export const MarketingStrategyInputSchema = UserProductInputSchema.extend({
  /** Added only by the authenticated backend; never chosen by a browser. */
  knowledgeScope: KnowledgeScopeSchema.optional(),
  /** Added only by the authenticated backend from the owning project. */
  brandProfile: ProjectBrandProfileSchema.optional(),
  options: z
    .object({
      maxPersonas: z.number().int().min(1).max(3).default(3),
      primaryGoal: z
        .enum(['awareness', 'lead-generation', 'conversion', 'retention', 'balanced'])
        .default('balanced')
        .describe('Strategic bias the campaign planner should honour.'),
    })
    .default({ maxPersonas: 3, primaryGoal: 'balanced' }),
});
export type MarketingStrategyInput = z.infer<typeof MarketingStrategyInputSchema>;

/**
 * Final, terminal shape returned by the workflow.
 */
export const MarketingStrategyOutputSchema = z.object({
  product: ProductProfileSchema,
  stp: STPResultSchema,
  personas: z.array(BuyerPersonaSchema).min(1).max(3),
  buyerJourney: z.array(BuyerJourneySchema).min(1),
  smartObjectives: z.array(SmartObjectiveSchema).min(1),
  campaignStrategy: CampaignStrategySchema,
  planQuality: MarketingPlanQualitySchema,
  knowledgeSources: z.array(KnowledgeCitationSchema).default([]),
});
export type MarketingStrategyOutput = z.infer<typeof MarketingStrategyOutputSchema>;
