import { Agent } from '@mastra/core/agent';
import type { TracingContext } from '@mastra/core/observability';
import { z } from 'zod';
import { getModel } from '../../lib/model.js';
import { safeGenerate } from '../../lib/safeGenerate.js';
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
  reviewFeedback?: string;
}

const PersonasArraySchema = z.array(BuyerPersonaSchema).min(1).max(3);

export async function runBuyerPersona(
  agent: Agent,
  input: BuyerPersonaInput,
  tracingContext?: TracingContext,
): Promise<BuyerPersonaResult[]> {
  return safeGenerate(
    agent,
    [
      {
        role: 'user',
        content: JSON.stringify(
          {
            product: input.product,
            stp: input.stp,
            maxPersonas: input.maxPersonas,
            ...(input.reviewFeedback
              ? { reviewFeedback: input.reviewFeedback }
              : {}),
          },
          null,
          2,
        ),
      },
    ],
    PersonasArraySchema,
    'buyer-persona',
    { tracingContext },
  );
}
