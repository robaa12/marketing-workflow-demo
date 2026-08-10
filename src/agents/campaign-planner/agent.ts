import { Agent } from '@mastra/core/agent';
import { getModel } from '../../lib/model.js';
import { safeGenerate } from '../../lib/safeGenerate.js';
import {
  CampaignStrategySchema,
  type BuyerJourney,
  type BuyerPersona,
  type CampaignStrategy,
  type MarketingPlanIssue,
  type KnowledgeCitation,
  type ProjectBrandProfile,
  type ProductProfile,
  type SmartObjective,
  type STPResult,
} from '../../schemas/index.js';
import { CAMPAIGN_PLANNER_PROMPT } from '../../prompts/campaignPlanner.js';

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
  options?: PrimaryGoal;
  /** Present only for the bounded QA remediation pass. */
  currentStrategy?: CampaignStrategy;
  qaFeedback?: MarketingPlanIssue[];
  knowledgeSources?: KnowledgeCitation[];
  brandProfile?: ProjectBrandProfile;
}

/**
 * The campaign planner needs the entire prior context, so we serialise the
 * full context object minus the (still empty) campaign field.
 */
export async function runCampaignPlanner(
  agent: Agent,
  input: CampaignPlannerInput,
): Promise<CampaignStrategyResult> {
  const contextForAgent = {
    product: input.product,
    stp: input.stp,
    personas: input.personas,
    buyerJourney: input.buyerJourney,
    smartObjectives: input.smartObjectives,
    ...(input.options ? { options: { primaryGoal: input.options } } : {}),
    ...(input.currentStrategy ? { currentStrategy: input.currentStrategy } : {}),
    ...(input.qaFeedback ? { qaFeedback: input.qaFeedback } : {}),
    ...(input.knowledgeSources?.length ? { knowledgeSources: input.knowledgeSources } : {}),
    ...(input.brandProfile ? { brandProfile: input.brandProfile } : {}),
  };

  return safeGenerate(
    agent,
    [
      {
        role: 'user',
        content: JSON.stringify(contextForAgent, null, 2),
      },
    ],
    CampaignStrategySchema,
    'campaign-planner',
  );
}
