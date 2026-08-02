import { z } from 'zod';
import { STPResearchCitationSchema } from './stpResearch.js';

export const MarketingPlanIssueSchema = z.object({
  severity: z.enum(['warning', 'error']),
  code: z.string(),
  field: z.string(),
  message: z.string(),
  resolution: z.string(),
});
export type MarketingPlanIssue = z.infer<typeof MarketingPlanIssueSchema>;

export const MarketingPlanQualitySchema = z.object({
  score: z.number().int().min(0).max(100),
  status: z.enum(['ready-for-review', 'needs-evidence', 'needs-rework']),
  evidenceSources: z.array(STPResearchCitationSchema).max(10),
  assumptionRegister: z.array(z.string()).max(30),
  baselineStatus: z.array(z.object({
    objectiveId: z.string(),
    status: z.enum(['known', 'assumed', 'missing']),
    baseline: z.string().optional(),
  })),
  channelForecast: z.array(z.object({
    channel: z.string(),
    allocationPercent: z.number(),
    primaryKpis: z.array(z.string()),
    status: z.literal('requires-budget-and-baseline'),
  })),
  issues: z.array(MarketingPlanIssueSchema),
  nextDecisions: z.array(z.string()).min(1).max(8),
});
export type MarketingPlanQuality = z.infer<typeof MarketingPlanQualitySchema>;
