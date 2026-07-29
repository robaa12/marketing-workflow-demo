import { Mastra } from '@mastra/core';
import { buildProductAnalysisAgent } from '../agents/product-analysis/index.js';
import { buildSTPStrategyAgent } from '../agents/stp/index.js';
import { buildBuyerPersonaAgent } from '../agents/buyer-persona/index.js';
import { buildBuyerJourneyAgent } from '../agents/buyer-journey/index.js';
import { buildSmartObjectivesAgent } from '../agents/smart-objectives/index.js';
import { buildCampaignPlannerAgent } from '../agents/campaign-planner/index.js';
import { buildMarketingStrategyWorkflow } from '../workflows/marketing/index.js';
import { getModel } from '../lib/model.js';

/**
 * Build the six specialised agents with the shared default model.
 * Override via `MASTRA_MODEL_DEFAULT`.
 */
const model = getModel();
const productAnalysisAgent = buildProductAnalysisAgent(model);
const stpStrategyAgent = buildSTPStrategyAgent(model);
const buyerPersonaAgent = buildBuyerPersonaAgent(model);
const buyerJourneyAgent = buildBuyerJourneyAgent(model);
const smartObjectivesAgent = buildSmartObjectivesAgent(model);
const campaignPlannerAgent = buildCampaignPlannerAgent(model);

/**
 * Marketing Director workflow.
 *
 * The agents are injected by reference so tests can swap in fakes by passing
 * their own `MarketingWorkflowDeps` to `buildMarketingStrategyWorkflow`
 * instead of importing the workflow from this registry.
 */
export const marketingStrategyWorkflow = buildMarketingStrategyWorkflow({
  productAnalysisAgent,
  stpStrategyAgent,
  buyerPersonaAgent,
  buyerJourneyAgent,
  smartObjectivesAgent,
  campaignPlannerAgent,
});

/**
 * Singleton Mastra instance.
 *
 * Agents are registered with a stable camelCase key (the workflow looks up
 * the agent by this key when running through `mastra.getAgent(...)`).
 */
export const mastra = new Mastra({
  agents: {
    productAnalysisAgent,
    stpStrategyAgent,
    buyerPersonaAgent,
    buyerJourneyAgent,
    smartObjectivesAgent,
    campaignPlannerAgent,
  },
  workflows: {
    marketingStrategyWorkflow,
  },
});

export type AppMastra = typeof mastra;
