import { z } from 'zod';
import { CampaignStrategySchema } from './campaign.js';
import { BuyerJourneySchema } from './buyerJourney.js';
import { SmartObjectiveSchema } from './objectives.js';
import { BuyerPersonaSchema } from './persona.js';
import { ProductProfileSchema, UserProductInputSchema } from './product.js';
import { STPResultSchema } from './stp.js';

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
});
export type MarketingStrategyContext = z.infer<typeof MarketingStrategyContextSchema>;

/**
 * Input shape for the workflow as a whole.
 * The orchestrator derives the initial `MarketingStrategyContext` from this.
 */
export const MarketingStrategyInputSchema = UserProductInputSchema.extend({
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
});
export type MarketingStrategyOutput = z.infer<typeof MarketingStrategyOutputSchema>;
