import { Agent } from '@mastra/core/agent';
import type { z } from 'zod';
import { getModel } from '../../lib/model.js';
import { safeGenerate } from '../../lib/safeGenerate.js';
import {
  STPResultSchema,
  type ProductProfile,
  type STPResearch,
} from '../../schemas/index.js';
import { STP_STRATEGY_PROMPT } from '../../prompts/stpStrategy.js';

export type STPStrategyResult = z.infer<typeof STPResultSchema>;

export function buildSTPStrategyAgent(model: string = getModel()): Agent {
  return new Agent({
    id: 'stp-strategy-agent',
    name: 'STP Strategy Agent',
    description:
      'Designs segmentation, targeting, and positioning for a ProductProfile.',
    instructions: STP_STRATEGY_PROMPT,
    model,
  });
}

export async function runSTPStrategy(
  agent: Agent,
  product: ProductProfile,
  research?: STPResearch,
): Promise<STPStrategyResult> {
  const compactProduct = {
    name: product.name,
    targetMarket: product.targetMarket,
    type: product.type,
    industry: product.industry,
    businessModel: product.businessModel,
    productMaturity: product.productMaturity,
    pricingModel: product.pricingModel,
    pricingNotes: product.pricingNotes,
    intake: product.intake,
    coreFeatures: product.coreFeatures.slice(0, 5),
    customerProblems: product.customerProblems.slice(0, 5),
    valueProposition: product.valueProposition,
    uniqueSellingPoints: product.uniqueSellingPoints.slice(0, 4),
    differentiators: product.differentiators.slice(0, 4),
    constraints: product.constraints.slice(0, 3),
    assumptions: product.assumptions.slice(0, 3),
  };
  const compactResearch = research && {
    citations: research.citations.slice(0, 4).map((citation) => ({
      title: citation.title,
      publisher: citation.publisher,
      excerpt: citation.excerpt.slice(0, 600),
    })),
    warnings: research.warnings.slice(0, 3),
  };

  return safeGenerate(
    agent,
    [
      {
        role: 'user',
        content: JSON.stringify({ product: compactProduct, research: compactResearch }),
      },
    ],
    STPResultSchema,
    'stp-strategy',
  );
}
