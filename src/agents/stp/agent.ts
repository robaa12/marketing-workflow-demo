import { Agent } from '@mastra/core/agent';
import type { z } from 'zod';
import { getModel } from '../../lib/model.js';
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
  const response = await agent.generate(
    [
      {
        role: 'user',
        content: JSON.stringify({ product }, null, 2),
      },
    ],
    {
      structuredOutput: {
        schema: STPResultSchema,
        jsonPromptInjection: true,
      },
    },
  );

  const object = response.object as STPStrategyResult | undefined;
  if (!object) {
    throw new Error('STP Strategy agent returned an empty structured response.');
  }
  return STPResultSchema.parse(object);
}
