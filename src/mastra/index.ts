import { existsSync, mkdirSync } from 'node:fs';
import { dirname, isAbsolute, resolve } from 'node:path';
import { Mastra } from '@mastra/core';
import { LibSQLStore } from '@mastra/libsql';
import { workflowRoute } from '@mastra/ai-sdk';
import { buildProductAnalysisAgent } from '../agents/product-analysis/index.js';
import { buildSTPStrategyAgent } from '../agents/stp/index.js';
import { buildBuyerPersonaAgent } from '../agents/buyer-persona/index.js';
import { buildBuyerJourneyAgent } from '../agents/buyer-journey/index.js';
import { buildSmartObjectivesAgent } from '../agents/smart-objectives/index.js';
import { buildCampaignPlannerAgent } from '../agents/campaign-planner/index.js';
import {
  buildContentResearcherAgent,
  buildContentStrategyAgent,
  buildCopywriterAgent,
  buildCopywriterStructurerAgent,
  buildVisualPromptAgent,
  buildHashtagSeoAgent,
  buildEditorQaAgent,
} from '../agents/content/index.js';
import { buildMarketingStrategyWorkflow } from '../workflows/marketing/index.js';
import { buildContentCreationWorkflow } from '../workflows/content/index.js';
import { getModel } from '../lib/model.js';

function resolveStorageUrl(): string {
  const raw = process.env['MASTRA_STORAGE_URL'] ?? 'file:.mastra/marketing.db';
  if (raw.startsWith('libsql:') || raw.startsWith('http')) return raw;
  const filePath = raw.startsWith('file:') ? raw.slice('file:'.length) : raw;
  const absolute = isAbsolute(filePath)
    ? filePath
    : resolve(process.cwd(), filePath);
  const dir = dirname(absolute);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return `file:${absolute}`;
}

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
 * Content creation agents.
 */
const contentResearcherAgent = buildContentResearcherAgent(model);
const contentStrategyAgent = buildContentStrategyAgent(model);
const copywriterAgent = buildCopywriterAgent(model);
const copywriterStructurerAgent = buildCopywriterStructurerAgent(model);
const visualPromptAgent = buildVisualPromptAgent(model);
const hashtagSeoAgent = buildHashtagSeoAgent(model);
const editorQaAgent = buildEditorQaAgent(model);

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
 * Content Creation workflow.
 *
 * Chains after the marketing strategy workflow to generate actual social
 * media content (posts, visuals, hashtags, calendar) from the strategy.
 */
export const contentCreationWorkflow = buildContentCreationWorkflow({
  contentResearcherAgent,
  contentStrategyAgent,
  copywriterAgent,
  copywriterStructurerAgent,
  visualPromptAgent,
  hashtagSeoAgent,
  editorQaAgent,
});

/**
 * Singleton Mastra instance.
 *
 * Agents are registered with a stable camelCase key (the workflow looks up
 * the agent by this key when running through `mastra.getAgent(...)`).
 */
export const mastra = new Mastra({
  storage: new LibSQLStore({
    id: 'marketing-strategy-storage',
    url: resolveStorageUrl(),
  }),
  agents: {
    productAnalysisAgent,
    stpStrategyAgent,
    buyerPersonaAgent,
    buyerJourneyAgent,
    smartObjectivesAgent,
    campaignPlannerAgent,
    contentResearcherAgent,
    contentStrategyAgent,
    copywriterAgent,
    visualPromptAgent,
    hashtagSeoAgent,
    editorQaAgent,
  },
  workflows: {
    marketingStrategyWorkflow,
    contentCreationWorkflow,
  },
  server: {
    port: Number(process.env['PORT'] ?? 4111),
    host: process.env['MASTRA_HOST'] ?? 'localhost',
    apiRoutes: [
      workflowRoute({
        path: '/workflow/stream',
        workflow: 'marketingStrategyWorkflow',
      }),
      workflowRoute({
        path: '/content/workflow/stream',
        workflow: 'contentCreationWorkflow',
      }),
    ],
  },
});

export type AppMastra = typeof mastra;
