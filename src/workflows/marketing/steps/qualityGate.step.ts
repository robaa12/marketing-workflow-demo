import { createStep } from '@mastra/core/workflows';
import { z } from 'zod';
import { auditMarketingPlan } from '../../../lib/marketing-plan-audit.js';
import {
  MarketingStrategyOutputSchema,
  STPResearchSchema,
} from '../../../schemas/index.js';

export const qualityGateStep = createStep({
  id: 'plan-quality-gate',
  description: 'Audits evidence, ICP fit, objectives, allocations, and risky claims before returning the plan.',
  inputSchema: MarketingStrategyOutputSchema.omit({ planQuality: true }),
  outputSchema: MarketingStrategyOutputSchema,
  execute: async ({ inputData, getStepResult }) => {
    const researchResult = getStepResult<{ stpResearch: z.infer<typeof STPResearchSchema> }>('stp-research');
    const research = researchResult?.stpResearch ?? { queries: ['unavailable'], citations: [], warnings: ['STP research was unavailable to the quality gate.'] };
    return {
      ...inputData,
      planQuality: auditMarketingPlan({ ...inputData, research }),
    };
  },
});
