import type { Agent } from '@mastra/core/agent';
import { createWorkflow } from '@mastra/core/workflows';
import {
  buildBuyerJourneyStep,
  buildBuyerPersonaStep,
  buildCampaignPlannerStep,
  buildProductAnalysisStep,
  buildSmartObjectivesStep,
  buildSTPStrategyStep,
} from './steps/index.js';
import {
  MarketingStrategyInputSchema,
  MarketingStrategyOutputSchema,
} from '../../schemas/index.js';
import { MarketingWorkflowError } from '../../lib/errors.js';

/**
 * Dependency bag for the workflow. Each agent is built and passed in so the
 * workflow file can be unit-tested with mock agents by passing fakes.
 */
export interface MarketingWorkflowDeps {
  productAnalysisAgent: Agent;
  stpStrategyAgent: Agent;
  buyerPersonaAgent: Agent;
  buyerJourneyAgent: Agent;
  smartObjectivesAgent: Agent;
  campaignPlannerAgent: Agent;
}

/**
 * Marketing Director workflow.
 *
 *   user input ──▶ Product Analysis ──▶ STP ──▶ Persona ──▶ Journey ──▶ SMART ──▶ Campaign ──▶ final strategy
 *
 * The chain is fully sequential. New agents can be inserted at any point
 * without touching the surrounding steps — see README "Extension points".
 */
export function buildMarketingStrategyWorkflow(deps: MarketingWorkflowDeps) {
  const productAnalysisStep = buildProductAnalysisStep(
    deps.productAnalysisAgent,
  );
  const stpStep = buildSTPStrategyStep(deps.stpStrategyAgent);
  const personaStep = buildBuyerPersonaStep(deps.buyerPersonaAgent);
  const journeyStep = buildBuyerJourneyStep(deps.buyerJourneyAgent);
  const objectivesStep = buildSmartObjectivesStep(deps.smartObjectivesAgent);
  const campaignStep = buildCampaignPlannerStep(deps.campaignPlannerAgent);

  return createWorkflow({
    id: 'marketing-strategy-workflow',
    description:
      'Generates a complete marketing strategy from a raw product description.',
    inputSchema: MarketingStrategyInputSchema,
    outputSchema: MarketingStrategyOutputSchema,
    retryConfig: {
      attempts: 3,
      delay: 2000,
    },
    options: {
      onFinish: async (result) => {
        const runId = result.runId ?? 'unknown';
        const stepIds = Object.keys(result.steps ?? {});
        const failedStep = stepIds.find(
          (id) => result.steps?.[id]?.status === 'failed',
        );
        console.info(
          `[marketing-strategy-workflow] run=${runId} status=${result.status} steps=${stepIds.length}${failedStep ? ` failedAt=${failedStep}` : ''}`,
        );
      },
      onError: async (errorInfo) => {
        const runId = errorInfo.runId ?? 'unknown';
        const msg =
          errorInfo.error instanceof MarketingWorkflowError
            ? errorInfo.error.details.message
            : (errorInfo.error?.message ?? String(errorInfo.error));
        console.error(
          `[marketing-strategy-workflow] FAILED run=${runId} error="${msg}"`,
        );
      },
    },
  })
    .then(productAnalysisStep)
    .then(stpStep)
    .then(personaStep)
    .then(journeyStep)
    .then(objectivesStep)
    .then(campaignStep)
    .commit();
}

export type MarketingStrategyWorkflow = ReturnType<
  typeof buildMarketingStrategyWorkflow
>;
