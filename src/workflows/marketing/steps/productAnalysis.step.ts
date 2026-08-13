import type { Agent } from '@mastra/core/agent';
import { createStep } from '@mastra/core/workflows';
import { z } from 'zod';
import { runProductAnalysis } from '../../../agents/product-analysis/agent.js';
import {
  MarketingStrategyInputSchema,
  KnowledgeScopeSchema,
  ProductProfileSchema,
} from '../../../schemas/index.js';

const WorkflowOptionsSchema = z.object({
  maxPersonas: z.number().int().min(1).max(3),
  primaryGoal: z.string(),
});

/**
 * Step 1 — Product Analysis.
 *
 * Takes the raw user input (with `options`) and produces a `ProductProfile`.
 * We return the full context (with `product` and `options` set) so the chain
 * can keep forwarding `options` without losing it.
 */
export function buildProductAnalysisStep(agent: Agent) {
  return createStep({
    id: 'product-analysis',
    description: 'Normalises the user input into a ProductProfile.',
    inputSchema: MarketingStrategyInputSchema,
    outputSchema: z.object({
      product: ProductProfileSchema,
      options: WorkflowOptionsSchema,
      knowledgeScope: KnowledgeScopeSchema.optional(),
    }),
    execute: async ({ inputData, tracingContext }) => {
      const product = await runProductAnalysis(agent, inputData, tracingContext);
      return {
        product,
        options: inputData.options,
        knowledgeScope: inputData.knowledgeScope,
      };
    },
  });
}

export const WORKFLOW_OPTIONS_SCHEMA = WorkflowOptionsSchema;
export type WorkflowOptions = z.infer<typeof WorkflowOptionsSchema>;
