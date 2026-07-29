import type { Agent } from '@mastra/core/agent';
import { createStep } from '@mastra/core/workflows';
import { z } from 'zod';
import { runSmartObjectives } from '../../../agents/smart-objectives/agent.js';
import {
  BuyerJourneySchema,
  BuyerPersonaSchema,
  ProductProfileSchema,
  SmartObjectiveSchema,
  STPResultSchema,
} from '../../../schemas/index.js';
import { WORKFLOW_OPTIONS_SCHEMA } from './productAnalysis.step.js';

/**
 * Step 5 — SMART Objectives.
 *
 * Consumes the product, personas, and journey. Produces 3-7 SMART objectives
 * that map to funnel stages.
 */
export function buildSmartObjectivesStep(agent: Agent) {
  return createStep({
    id: 'smart-objectives',
    description: 'Generates 3-7 SMART objectives aligned with the funnel.',
    inputSchema: z.object({
      product: ProductProfileSchema,
      stp: STPResultSchema,
      personas: z.array(BuyerPersonaSchema).min(1).max(3),
      buyerJourney: z.array(BuyerJourneySchema).min(1),
      options: WORKFLOW_OPTIONS_SCHEMA,
    }),
    outputSchema: z.object({
      product: ProductProfileSchema,
      stp: STPResultSchema,
      personas: z.array(BuyerPersonaSchema).min(1).max(3),
      buyerJourney: z.array(BuyerJourneySchema).min(1),
      smartObjectives: z.array(SmartObjectiveSchema).min(1),
      options: WORKFLOW_OPTIONS_SCHEMA,
    }),
    execute: async ({ inputData }) => {
      const smartObjectives = await runSmartObjectives(agent, {
        product: inputData.product,
        buyerJourney: inputData.buyerJourney,
      });
      return {
        product: inputData.product,
        stp: inputData.stp,
        personas: inputData.personas,
        buyerJourney: inputData.buyerJourney,
        smartObjectives,
        options: inputData.options,
      };
    },
  });
}
