import type { Agent } from '@mastra/core/agent';
import { createStep, createWorkflow } from '@mastra/core/workflows';
import { z } from 'zod';
import { runBuyerJourney } from '../../agents/buyer-journey/agent.js';
import { runBuyerPersona } from '../../agents/buyer-persona/agent.js';
import { runSmartObjectives } from '../../agents/smart-objectives/agent.js';
import { MarketingStrategyOutputSchema } from '../../schemas/marketingContext.js';

const SectionSchema = z.enum([
  'personas',
  'buyerJourney',
  'smartObjectives',
]);

export const StrategySectionRevisionInputSchema = z.object({
  strategy: MarketingStrategyOutputSchema,
  section: SectionSchema,
  feedback: z.string().trim().min(3).max(4_000),
});

export interface StrategySectionRevisionDeps {
  buyerPersonaAgent: Agent;
  buyerJourneyAgent: Agent;
  smartObjectivesAgent: Agent;
}

export function buildStrategySectionRevisionWorkflow(
  deps: StrategySectionRevisionDeps,
) {
  const reviseSection = createStep({
    id: 'regenerate-strategy-section',
    description:
      'Regenerates one selected strategy section from reviewer feedback.',
    inputSchema: StrategySectionRevisionInputSchema,
    outputSchema: MarketingStrategyOutputSchema,
    execute: async ({ inputData, tracingContext }) => {
      const { strategy, section, feedback } = inputData;

      if (section === 'personas') {
        const personas = await runBuyerPersona(
          deps.buyerPersonaAgent,
          {
            product: strategy.product,
            stp: strategy.stp,
            maxPersonas: strategy.personas.length,
            reviewFeedback: feedback,
          },
          tracingContext,
        );
        return markDependentReview(
          { ...strategy, personas },
          section,
          'Review buyer journeys, objectives, and campaign targeting against the revised personas.',
        );
      }

      if (section === 'buyerJourney') {
        const buyerJourney = await runBuyerJourney(
          deps.buyerJourneyAgent,
          {
            product: strategy.product,
            personas: strategy.personas,
            reviewFeedback: feedback,
          },
          tracingContext,
        );
        return markDependentReview(
          { ...strategy, buyerJourney },
          section,
          'Review objectives and campaign messaging against the revised buyer journey.',
        );
      }

      const smartObjectives = await runSmartObjectives(
        deps.smartObjectivesAgent,
        {
          product: strategy.product,
          buyerJourney: strategy.buyerJourney,
          reviewFeedback: feedback,
        },
        tracingContext,
      );
      return markDependentReview(
        { ...strategy, smartObjectives },
        section,
        'Review campaign KPIs and recommendations against the revised objectives.',
      );
    },
  });

  return createWorkflow({
    id: 'strategySectionRevisionWorkflow',
    description:
      'Regenerates one approved strategy section from specific reviewer feedback.',
    inputSchema: StrategySectionRevisionInputSchema,
    outputSchema: MarketingStrategyOutputSchema,
    retryConfig: { attempts: 1, delay: 0 },
  })
    .then(reviseSection)
    .commit();
}

function markDependentReview(
  strategy: z.infer<typeof MarketingStrategyOutputSchema>,
  section: z.infer<typeof SectionSchema>,
  decision: string,
) {
  return {
    ...strategy,
    planQuality: {
      ...strategy.planQuality,
      status: 'needs-rework' as const,
      issues: [
        ...strategy.planQuality.issues.filter(
          (issue) => issue.code !== 'dependent-section-review',
        ),
        {
          severity: 'warning' as const,
          code: 'dependent-section-review',
          field: section,
          message:
            'A strategy section changed while its dependent sections were preserved.',
          resolution: decision,
        },
      ],
      nextDecisions: [
        decision,
        ...strategy.planQuality.nextDecisions.filter(
          (item) => item !== decision,
        ),
      ].slice(0, 8),
    },
  };
}
