import { createStep } from '@mastra/core/workflows';
import {
  MarketingIntakeResumeSchema,
  MarketingStrategyInputSchema,
} from '../../../schemas/index.js';

export const intakeGateStep = createStep({
  id: 'intake-gate',
  description: 'Suspends before model calls until critical go-to-market facts are explicitly provided or marked unknown.',
  inputSchema: MarketingStrategyInputSchema,
  outputSchema: MarketingStrategyInputSchema,
  resumeSchema: MarketingIntakeResumeSchema,
  suspendSchema: MarketingIntakeResumeSchema.extend({
    reason: MarketingIntakeResumeSchema.shape.targetMarket,
    missingFields: MarketingIntakeResumeSchema.shape.targetMarket.array(),
  }),
  execute: async ({ inputData, resumeData, suspend }) => {
    const targetMarket = resumeData?.targetMarket ?? inputData.targetMarket;
    const intake = resumeData?.intake ?? inputData.intake;
    const missingFields = [
      !targetMarket ? 'targetMarket' : undefined,
      !intake ? 'intake.targetGeography' : undefined,
      !intake ? 'intake.primaryIcp' : undefined,
      !intake ? 'intake.salesMotion' : undefined,
      !intake ? 'intake.monthlyBudget' : undefined,
      !intake ? 'intake.supportedIntegrations' : undefined,
      !intake ? 'intake.verifiedProofPoints' : undefined,
      !intake ? 'intake.prohibitedClaims' : undefined,
      !intake ? 'intake.baselineMetrics' : undefined,
    ].filter((field): field is string => Boolean(field));

    if (missingFields.length > 0) {
      await suspend({
        reason: 'Critical go-to-market facts are required before strategy generation.',
        missingFields,
        targetMarket: targetMarket ?? 'Provide the primary target market.',
        intake: intake ?? {
          targetGeography: 'Provide a value or "unknown".',
          primaryIcp: 'Provide a value or "unknown".',
          salesMotion: 'unknown',
          monthlyBudget: 'Provide a value or "unknown".',
          supportedIntegrations: ['unknown'],
          verifiedProofPoints: ['none verified'],
          prohibitedClaims: ['none specified'],
          baselineMetrics: {
            monthlyQualifiedVisits: 'unknown', monthlyLeads: 'unknown', trialOrDemoConversionRate: 'unknown',
            activationRate: 'unknown', paidConversionRate: 'unknown', monthlyChurnRate: 'unknown',
          },
        },
      }, { resumeLabel: 'complete-marketing-intake' });
      return inputData;
    }

    return { ...inputData, targetMarket, intake };
  },
});
