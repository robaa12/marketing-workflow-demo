import type { Agent } from '@mastra/core/agent';
import { createStep } from '@mastra/core/workflows';
import { z } from 'zod';
import { runCampaignPlanner } from '../../../agents/campaign-planner/agent.js';
import { auditMarketingPlan } from '../../../lib/marketing-plan-audit.js';
import {
  MarketingPlanIssueSchema,
  MarketingStrategyOutputSchema,
  STPResearchSchema,
} from '../../../schemas/index.js';

const ACTIONABLE_ISSUE_CODES = new Set([
  'channel-allocation-total',
  'budget-allocation-total',
  'unsupported-claim',
  'unmapped-objective',
]);

const revisionInputSchema = MarketingStrategyOutputSchema;

/**
 * A single, bounded remediation pass. The deterministic audit remains the
 * authority on whether a revision helped; the model only sees feedback it can
 * correct without fabricating upstream research or business baselines.
 */
export function buildStrategyRevisionStep(agent: Agent) {
  return createStep({
    id: 'strategy-qa-remediation',
    description:
      'Uses actionable plan-quality feedback to revise the campaign strategy once, then re-audits it.',
    inputSchema: revisionInputSchema,
    outputSchema: MarketingStrategyOutputSchema,
    retries: 1,
    execute: async ({ inputData, getStepResult }) => {
      const actionableFeedback = inputData.planQuality.issues.filter((issue) =>
        ACTIONABLE_ISSUE_CODES.has(issue.code),
      );

      if (actionableFeedback.length === 0) return inputData;

      const campaignStrategy = await runCampaignPlanner(agent, {
        product: inputData.product,
        stp: inputData.stp,
        personas: inputData.personas,
        buyerJourney: inputData.buyerJourney,
        smartObjectives: inputData.smartObjectives,
        currentStrategy: inputData.campaignStrategy,
        qaFeedback: actionableFeedback,
        knowledgeSources: inputData.knowledgeSources,
      });

      const researchResult = getStepResult<{
        stpResearch: z.infer<typeof STPResearchSchema>;
      }>('stp-research');
      const research = researchResult?.stpResearch ?? {
        queries: ['unavailable'],
        citations: [],
        warnings: ['STP research was unavailable to the quality gate.'],
      };
      const planQuality = auditMarketingPlan({
        ...inputData,
        campaignStrategy,
        research,
      });

      return {
        ...inputData,
        campaignStrategy,
        planQuality: {
          ...planQuality,
          strategyRevision: {
            attempted: true,
            addressedIssueCodes: uniqueCodes(actionableFeedback),
            remainingActionableIssueCodes: uniqueCodes(
              planQuality.issues.filter((issue) =>
                ACTIONABLE_ISSUE_CODES.has(issue.code),
              ),
            ),
          },
        },
      };
    },
  });
}

function uniqueCodes(issues: z.infer<typeof MarketingPlanIssueSchema>[]) {
  return [...new Set(issues.map((issue) => issue.code))];
}
