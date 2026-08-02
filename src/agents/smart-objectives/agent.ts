import { Agent } from '@mastra/core/agent';
import { z } from 'zod';
import { getModel } from '../../lib/model.js';
import { safeGenerate } from '../../lib/safeGenerate.js';
import {
  SmartObjectiveSchema,
  type BuyerJourney,
  type ProductProfile,
} from '../../schemas/index.js';
import { SMART_OBJECTIVES_PROMPT } from '../../prompts/smartObjectives.js';
import { webSearchTool } from '../../tools/index.js';

export type SmartObjectiveResult = z.infer<typeof SmartObjectiveSchema>;

export function buildSmartObjectivesAgent(model: string = getModel()): Agent {
  return new Agent({
    id: 'smart-objectives-agent',
    name: 'SMART Objectives Agent',
    description:
      'Generates 3-7 SMART business objectives aligned with the buyer journey.',
    instructions: SMART_OBJECTIVES_PROMPT,
    model,
    tools: { webSearchTool },
  });
}

export interface SmartObjectivesInput {
  product: ProductProfile;
  buyerJourney: BuyerJourney[];
}

const ObjectivesArraySchema = z.array(SmartObjectiveSchema).min(1).max(10);

export async function runSmartObjectives(
  agent: Agent,
  input: SmartObjectivesInput,
): Promise<SmartObjectiveResult[]> {
  return safeGenerate(
    agent,
    [
      {
        role: 'user',
        content: JSON.stringify(
          {
            product: input.product,
            buyerJourney: input.buyerJourney,
          },
          null,
          2,
        ),
      },
    ],
    ObjectivesArraySchema,
    'smart-objectives',
  );
}
