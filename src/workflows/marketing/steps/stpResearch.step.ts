import { createStep } from '@mastra/core/workflows';
import { z } from 'zod';
import type { STPResearchRunner } from '../../../lib/stp-research.js';
import {
  ProductProfileSchema,
  STPResearchSchema,
} from '../../../schemas/index.js';
import { WORKFLOW_OPTIONS_SCHEMA } from './productAnalysis.step.js';

export function buildSTPResearchStep(research: STPResearchRunner) {
  return createStep({
    id: 'stp-research',
    description: 'Runs two bounded market searches before STP synthesis.',
    inputSchema: z.object({
      product: ProductProfileSchema,
      options: WORKFLOW_OPTIONS_SCHEMA,
    }),
    outputSchema: z.object({
      product: ProductProfileSchema,
      stpResearch: STPResearchSchema,
      options: WORKFLOW_OPTIONS_SCHEMA,
    }),
    execute: async ({ inputData }) => ({
      ...inputData,
      stpResearch: await research(inputData.product),
    }),
  });
}
