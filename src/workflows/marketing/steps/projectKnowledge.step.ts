import { createStep } from '@mastra/core/workflows';
import { z } from 'zod';
import type { ProjectKnowledgeRetriever } from '../../../lib/project-knowledge.js';
import {
  KnowledgeCitationSchema,
  KnowledgeScopeSchema,
  ProductProfileSchema,
} from '../../../schemas/index.js';
import { WORKFLOW_OPTIONS_SCHEMA } from './productAnalysis.step.js';

function strategyQuery(product: z.infer<typeof ProductProfileSchema>): string {
  return [
    `Product: ${product.name}`,
    `Industry: ${product.industry}`,
    `Market: ${product.targetMarket}`,
    `Value proposition: ${product.valueProposition}`,
    `Customer problems: ${product.customerProblems.slice(0, 3).join('; ')}`,
    'Retrieve approved product facts, positioning, audience evidence, claims, and constraints that should ground a marketing strategy.',
  ].join('\n');
}

/** Retrieves only from the project-scoped source ids supplied by the backend. */
export function buildProjectKnowledgeStep(retrieve: ProjectKnowledgeRetriever) {
  return createStep({
    id: 'project-knowledge',
    description: 'Retrieves relevant approved project knowledge to ground strategy decisions.',
    inputSchema: z.object({
      product: ProductProfileSchema,
      options: WORKFLOW_OPTIONS_SCHEMA,
      knowledgeScope: KnowledgeScopeSchema.optional(),
    }),
    outputSchema: z.object({
      product: ProductProfileSchema,
      options: WORKFLOW_OPTIONS_SCHEMA,
      knowledge: z.array(KnowledgeCitationSchema),
    }),
    execute: async ({ inputData }) => ({
      product: inputData.product,
      options: inputData.options,
      knowledge: await retrieve(inputData.knowledgeScope, strategyQuery(inputData.product)),
    }),
  });
}
