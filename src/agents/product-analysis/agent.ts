import { Agent } from '@mastra/core/agent';
import type { z } from 'zod';
import { getModel } from '../../lib/model.js';
import { safeGenerate } from '../../lib/safeGenerate.js';
import { ProductProfileSchema, type UserProductInput } from '../../schemas/index.js';
import { PRODUCT_ANALYSIS_PROMPT } from '../../prompts/productAnalysis.js';
import { webSearchTool } from '../../tools/index.js';

export type ProductAnalysisResult = z.infer<typeof ProductProfileSchema>;

/**
 * Build the agent. Accepting a model string keeps the agent testable and
 * lets the workflow compose a different model for specific tenants.
 */
export function buildProductAnalysisAgent(model: string = getModel()): Agent {
  return new Agent({
    id: 'product-analysis-agent',
    name: 'Product Analysis Agent',
    description:
      'Normalises a raw product description into a structured ProductProfile that downstream agents consume.',
    instructions: PRODUCT_ANALYSIS_PROMPT,
    model,
    tools: { webSearchTool },
  });
}

/**
 * Run the agent against raw user input.
 * The agent's structured output is validated against `ProductProfileSchema`
 * before being returned so downstream code can trust the shape.
 */
export async function runProductAnalysis(
  agent: Agent,
  input: UserProductInput,
): Promise<ProductAnalysisResult> {
  return safeGenerate(
    agent,
    [
      {
        role: 'user',
        content: JSON.stringify(input, null, 2),
      },
    ],
    ProductProfileSchema,
    'product-analysis',
  );
}
