import type { Agent } from '@mastra/core/agent';
import { createStep } from '@mastra/core/workflows';
import { z } from 'zod';
import { runBuyerJourney } from '../../../agents/buyer-journey/agent.js';
import {
  BuyerJourneySchema,
  BuyerPersonaSchema,
  ProductProfileSchema,
  STPResultSchema,
} from '../../../schemas/index.js';
import { WORKFLOW_OPTIONS_SCHEMA } from './productAnalysis.step.js';

/**
 * Step 4 — Buyer Journey.
 *
 * Consumes the personas and produces one 5-stage journey per persona.
 * `options` is forwarded so the next step (SMART) can use it.
 */
export function buildBuyerJourneyStep(agent: Agent) {
  return createStep({
    id: 'buyer-journey',
    description: 'Maps every persona through the 5-stage buyer journey.',
    inputSchema: z.object({
      product: ProductProfileSchema,
      stp: STPResultSchema,
      personas: z.array(BuyerPersonaSchema).min(1).max(3),
      options: WORKFLOW_OPTIONS_SCHEMA,
    }),
    outputSchema: z.object({
      product: ProductProfileSchema,
      stp: STPResultSchema,
      personas: z.array(BuyerPersonaSchema).min(1).max(3),
      buyerJourney: z.array(BuyerJourneySchema).min(1),
      options: WORKFLOW_OPTIONS_SCHEMA,
    }),
    execute: async ({ inputData, tracingContext }) => {
      const buyerJourney = await runBuyerJourney(agent, {
        product: inputData.product,
        personas: inputData.personas,
      }, tracingContext);
      return {
        product: inputData.product,
        stp: inputData.stp,
        personas: inputData.personas,
        buyerJourney,
        options: inputData.options,
      };
    },
  });
}
