import { Agent } from '@mastra/core/agent';
import { z } from 'zod';
import { getModel } from '../../lib/model.js';
import {
  BuyerPersonaSchema,
  type ProductProfile,
  type STPResult,
} from '../../schemas/index.js';
import { BUYER_PERSONA_PROMPT } from '../../prompts/buyerPersona.js';

export type BuyerPersonaResult = z.infer<typeof BuyerPersonaSchema>;

export function buildBuyerPersonaAgent(model: string = getModel()): Agent {
  return new Agent({
    id: 'buyer-persona-agent',
    name: 'Buyer Persona Agent',
    description:
      'Generates 1-3 realistic buyer personas for a ProductProfile + STPResult.',
    instructions: BUYER_PERSONA_PROMPT,
    model,
  });
}

export interface BuyerPersonaInput {
  product: ProductProfile;
  stp: STPResult;
  maxPersonas: number;
}

const PersonasArraySchema = z.array(BuyerPersonaSchema).min(1).max(3);

export async function runBuyerPersona(
  agent: Agent,
  input: BuyerPersonaInput,
): Promise<BuyerPersonaResult[]> {
  const response = await agent.generate(
    [
      {
        role: 'user',
        content: JSON.stringify(
          {
            product: input.product,
            stp: input.stp,
            maxPersonas: input.maxPersonas,
          },
          null,
          2,
        ),
      },
    ],
    {
      structuredOutput: {
        schema: PersonasArraySchema,
        jsonPromptInjection: true,
      },
    },
  );

  const object = response.object as BuyerPersonaResult[] | undefined;
  if (!object) {
    throw new Error('Buyer Persona agent returned an empty structured response.');
  }
  return PersonasArraySchema.parse(object);
}
