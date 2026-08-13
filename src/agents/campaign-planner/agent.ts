import { Agent } from '@mastra/core/agent';
import type { TracingContext } from '@mastra/core/observability';
import { getModel } from '../../lib/model.js';
import { safeGenerate } from '../../lib/safeGenerate.js';
import {
  CampaignStrategySchema,
  type BuyerJourney,
  type BuyerPersona,
  type CampaignStrategy,
  type ProductProfile,
  type SmartObjective,
  type STPResult,
} from '../../schemas/index.js';
import { CAMPAIGN_PLANNER_PROMPT } from '../../prompts/campaignPlanner.js';
import type { TemporalContext } from '../../schemas/temporal.js';
import { temporalValueIssues } from '../../lib/temporal-context.js';

export type CampaignStrategyResult = CampaignStrategy;
export type PrimaryGoal =
  | 'awareness'
  | 'lead-generation'
  | 'conversion'
  | 'retention'
  | 'balanced';

export function buildCampaignPlannerAgent(model: string = getModel()): Agent {
  return new Agent({
    id: 'campaign-planner-agent',
    name: 'Campaign Planner Agent',
    description:
      'Synthesises the full prior context into a CampaignStrategy with channels, campaigns, budget, and KPIs.',
    instructions: CAMPAIGN_PLANNER_PROMPT,
    model,
  });
}

export interface CampaignPlannerInput {
  product: ProductProfile;
  stp: STPResult;
  personas: BuyerPersona[];
  buyerJourney: BuyerJourney[];
  smartObjectives: SmartObjective[];
  options: PrimaryGoal;
  temporalContext?: TemporalContext;
}

/**
 * The campaign planner needs the entire prior context, so we serialise the
 * full context object minus the (still empty) campaign field.
 */
export async function runCampaignPlanner(
  agent: Agent,
  input: CampaignPlannerInput,
  tracingContext?: TracingContext,
): Promise<CampaignStrategyResult> {
  const contextForAgent = {
    product: input.product,
    stp: input.stp,
    personas: input.personas,
    buyerJourney: input.buyerJourney,
    smartObjectives: input.smartObjectives,
    options: { primaryGoal: input.options },
    ...(input.temporalContext
      ? { temporalContext: input.temporalContext }
      : {}),
  };

  const messages = [
    {
      role: 'user' as const,
      content: JSON.stringify(contextForAgent, null, 2),
    },
  ];
  let result = await safeGenerate(
    agent,
    messages,
    CampaignStrategySchema,
    'campaign-planner',
    { tracingContext },
  );

  if (!input.temporalContext) return result;
  let dateIssues = temporalValueIssues(
    result,
    input.temporalContext,
    'campaignStrategy',
  );
  if (dateIssues.length === 0) return result;

  result = await safeGenerate(
    agent,
    [
      ...messages,
      {
        role: 'user',
        content: `Your previous campaign strategy contained invalid dates:\n- ${dateIssues.join('\n- ')}\nRegenerate the complete strategy. Preserve sound content, but replace every invalid date with an ISO date inside the authoritative campaign window or a fixed launch-relative duration.`,
      },
    ],
    CampaignStrategySchema,
    'campaign-planner-date-repair',
    { tracingContext },
  );
  dateIssues = temporalValueIssues(
    result,
    input.temporalContext,
    'campaignStrategy',
  );
  if (dateIssues.length > 0) {
    throw new Error(`Campaign strategy dates failed validation: ${dateIssues.join('; ')}`);
  }
  return result;
}
