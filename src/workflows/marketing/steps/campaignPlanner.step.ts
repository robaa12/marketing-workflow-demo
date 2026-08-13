import type { Agent } from '@mastra/core/agent';
import { createStep } from '@mastra/core/workflows';
import { z } from 'zod';
import { runCampaignPlanner } from '../../../agents/campaign-planner/agent.js';
import {
  BuyerJourneySchema,
  BuyerPersonaSchema,
  CampaignStrategySchema,
  ProductProfileSchema,
  SmartObjectiveSchema,
  STPResultSchema,
  TemporalContextSchema,
  type MarketingStrategyInput,
} from '../../../schemas/index.js';
import { WORKFLOW_OPTIONS_SCHEMA } from './productAnalysis.step.js';
import { resolveTemporalContext } from '../../../lib/temporal-context.js';

/**
 * Step 6 — Campaign Planner.
 *
 * The synthesis step. Consumes the full prior context (including the
 * forward-propagated `options`) and produces a single `CampaignStrategy`.
 *
 * This is the terminal step: its output is the workflow's final response,
 * so it intentionally drops `options` to match the public output contract.
 */
export function buildCampaignPlannerStep(agent: Agent) {
  return createStep({
    id: 'campaign-planner',
    description:
      'Synthesises the full prior context into a CampaignStrategy.',
    retries: 3,
    inputSchema: z.object({
      product: ProductProfileSchema,
      stp: STPResultSchema,
      personas: z.array(BuyerPersonaSchema).min(1).max(3),
      buyerJourney: z.array(BuyerJourneySchema).min(1),
      smartObjectives: z.array(SmartObjectiveSchema).min(1),
      options: WORKFLOW_OPTIONS_SCHEMA,
    }),
    outputSchema: z.object({
      temporalContext: TemporalContextSchema,
      product: ProductProfileSchema,
      stp: STPResultSchema,
      personas: z.array(BuyerPersonaSchema).min(1).max(3),
      buyerJourney: z.array(BuyerJourneySchema).min(1),
      smartObjectives: z.array(SmartObjectiveSchema).min(1),
      campaignStrategy: CampaignStrategySchema,
    }),
    execute: async ({ inputData, tracingContext, getInitData }) => {
      const temporalContext = resolveTemporalContext(
        getInitData<MarketingStrategyInput>().temporalContext,
      );
      const campaignStrategy = await runCampaignPlanner(agent, {
        product: inputData.product,
        stp: inputData.stp,
        personas: inputData.personas,
        buyerJourney: inputData.buyerJourney,
        smartObjectives: inputData.smartObjectives,
        options: inputData.options.primaryGoal as
          | 'awareness'
          | 'lead-generation'
          | 'conversion'
          | 'retention'
          | 'balanced',
        temporalContext,
      }, tracingContext);
      return {
        temporalContext,
        product: inputData.product,
        stp: inputData.stp,
        personas: inputData.personas,
        buyerJourney: inputData.buyerJourney,
        smartObjectives: inputData.smartObjectives,
        campaignStrategy,
      };
    },
  });
}
