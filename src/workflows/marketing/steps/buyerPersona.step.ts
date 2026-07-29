import type { Agent } from '@mastra/core/agent';
import { createStep } from '@mastra/core/workflows';
import { z } from 'zod';
import { runBuyerPersona } from '../../../agents/buyer-persona/agent.js';
import {
  BuyerPersonaSchema,
  ProductProfileSchema,
  STPResultSchema,
} from '../../../schemas/index.js';
import { WORKFLOW_OPTIONS_SCHEMA } from './productAnalysis.step.js';

/**
 * Step 3 — Buyer Persona.
 *
 * Consumes the product and STP. Produces 1-3 personas, each linked back to
 * a segment via `segmentId`. Honours `options.maxPersonas`.
 */
export function buildBuyerPersonaStep(agent: Agent) {
  return createStep({
    id: 'buyer-persona',
    description: 'Generates 1-3 realistic buyer personas.',
    inputSchema: z.object({
      product: ProductProfileSchema,
      stp: STPResultSchema,
      options: WORKFLOW_OPTIONS_SCHEMA,
    }),
    outputSchema: z.object({
      product: ProductProfileSchema,
      stp: STPResultSchema,
      personas: z.array(BuyerPersonaSchema).min(1).max(3),
      options: WORKFLOW_OPTIONS_SCHEMA,
    }),
    execute: async ({ inputData }) => {
      const personas = await runBuyerPersona(agent, {
        product: inputData.product,
        stp: inputData.stp,
        maxPersonas: inputData.options.maxPersonas,
      });
      return {
        product: inputData.product,
        stp: inputData.stp,
        personas,
        options: inputData.options,
      };
    },
  });
}
