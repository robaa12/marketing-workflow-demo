import { Agent } from '@mastra/core/agent';
import type { TracingContext } from '@mastra/core/observability';
import { z } from 'zod';
import { getModel } from '../../lib/model.js';
import { safeGenerate } from '../../lib/safeGenerate.js';
import {
  SmartObjectiveSchema,
  type BuyerJourney,
  type ProductProfile,
} from '../../schemas/index.js';
import { SMART_OBJECTIVES_PROMPT } from '../../prompts/smartObjectives.js';
import {
  resolveTemporalContext,
  temporalObjectiveIssues,
} from '../../lib/temporal-context.js';
import type { TemporalContext } from '../../schemas/temporal.js';

export type SmartObjectiveResult = z.infer<typeof SmartObjectiveSchema>;

export function buildSmartObjectivesAgent(model: string = getModel()): Agent {
  return new Agent({
    id: 'smart-objectives-agent',
    name: 'SMART Objectives Agent',
    description:
      'Generates 3-7 SMART business objectives aligned with the buyer journey.',
    instructions: SMART_OBJECTIVES_PROMPT,
    model,
  });
}

export interface SmartObjectivesInput {
  product: ProductProfile;
  buyerJourney: BuyerJourney[];
  temporalContext?: TemporalContext;
  reviewFeedback?: string;
}

const ObjectivesArraySchema = z.array(SmartObjectiveSchema).min(1).max(10);

export async function runSmartObjectives(
  agent: Agent,
  input: SmartObjectivesInput,
  tracingContext?: TracingContext,
): Promise<SmartObjectiveResult[]> {
  const temporalContext = resolveTemporalContext(input.temporalContext);
  const generate = (reviewFeedback?: string) => safeGenerate(
    agent,
    [
      {
        role: 'user',
        content: JSON.stringify(
          {
            product: input.product,
            buyerJourney: input.buyerJourney,
            temporalContext,
            ...(reviewFeedback
              ? { reviewFeedback }
              : {}),
          },
          null,
          2,
        ),
      },
    ],
    ObjectivesArraySchema,
    'smart-objectives',
    { tracingContext },
  );
  let objectives = await generate(input.reviewFeedback);
  let issues = temporalObjectiveIssues(objectives, temporalContext);
  if (issues.length > 0) {
    objectives = await generate(
      `Correct every temporal error below. Preserve valid business content, use the authoritative temporalContext, and return the full corrected objective array.\n- ${issues.join('\n- ')}`,
    );
    issues = temporalObjectiveIssues(objectives, temporalContext);
  }
  if (issues.length > 0) {
    throw new Error(`SMART objective dates failed validation: ${issues.join('; ')}`);
  }
  return objectives;
}
