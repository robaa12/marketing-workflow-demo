import { Agent } from '@mastra/core/agent';
import { z } from 'zod';
import { getModel } from '../../lib/model.js';
import {
  BuyerJourneySchema,
  type BuyerPersona,
  type ProductProfile,
} from '../../schemas/index.js';
import { BUYER_JOURNEY_PROMPT } from '../../prompts/buyerJourney.js';

export type BuyerJourneyResult = z.infer<typeof BuyerJourneySchema>;

export function buildBuyerJourneyAgent(model: string = getModel()): Agent {
  return new Agent({
    id: 'buyer-journey-agent',
    name: 'Buyer Journey Agent',
    description:
      'Maps every BuyerPersona through the 5-stage buyer journey.',
    instructions: BUYER_JOURNEY_PROMPT,
    model,
  });
}

export interface BuyerJourneyInput {
  product: ProductProfile;
  personas: BuyerPersona[];
}

const JourneysArraySchema = z.array(BuyerJourneySchema).min(1);

export async function runBuyerJourney(
  agent: Agent,
  input: BuyerJourneyInput,
): Promise<BuyerJourneyResult[]> {
  const response = await agent.generate(
    [
      {
        role: 'user',
        content: JSON.stringify(
          {
            product: input.product,
            personas: input.personas,
          },
          null,
          2,
        ),
      },
    ],
    {
      structuredOutput: {
        schema: JourneysArraySchema,
        jsonPromptInjection: true,
      },
    },
  );

  const object = response.object as BuyerJourneyResult[] | undefined;
  if (!object) {
    throw new Error('Buyer Journey agent returned an empty structured response.');
  }
  return JourneysArraySchema.parse(object);
}
