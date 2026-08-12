import type { Agent } from '@mastra/core/agent';
import { createStep } from '@mastra/core/workflows';
import { z } from 'zod';
import { runSTPStrategy } from '../../../agents/stp/agent.js';
import {
  ProductProfileSchema,
  STPResultSchema,
  STPResearchSchema,
} from '../../../schemas/index.js';
import { WORKFLOW_OPTIONS_SCHEMA } from './productAnalysis.step.js';

/**
 * Step 2 — STP Strategy.
 *
 * Consumes the product profile (and forwarded options) and produces
 * segmentation, targeting, and positioning. Returns the full context so
 * downstream steps don't have to re-thread the product.
 */
export function buildSTPStrategyStep(agent: Agent) {
  return createStep({
    id: 'stp-strategy',
    description: 'Generates segmentation, targeting, and positioning.',
    inputSchema: z.object({
      product: ProductProfileSchema,
      stpResearch: STPResearchSchema,
      options: WORKFLOW_OPTIONS_SCHEMA,
    }),
    outputSchema: z.object({
      product: ProductProfileSchema,
      stp: STPResultSchema,
      options: WORKFLOW_OPTIONS_SCHEMA,
    }),
    execute: async ({ inputData, tracingContext }) => {
      const stp = await runSTPStrategy(
        agent,
        inputData.product,
        inputData.stpResearch,
        tracingContext,
      );
      return {
        product: inputData.product,
        stp,
        options: inputData.options,
      };
    },
  });
}
