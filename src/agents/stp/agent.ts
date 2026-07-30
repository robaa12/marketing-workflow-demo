import { Agent } from '@mastra/core/agent';
import type { z } from 'zod';
import { getModel } from '../../lib/model.js';
import { safeGenerate } from '../../lib/safeGenerate.js';
import { STPResultSchema, type ProductProfile } from '../../schemas/index.js';
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
): Promise<STPStrategyResult> {
  return safeGenerate(
    agent,
    [
      {
        role: 'user',
        content: JSON.stringify({ product }, null, 2),
      },
    ],
    STPResultSchema,
    'stp-strategy',
  );
}
