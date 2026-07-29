import { z } from 'zod';
import { FunnelStageEnum } from './common.js';

/**
 * One SMART objective aligned with the buyer journey.
 * Every objective must satisfy Specific, Measurable, Achievable, Relevant,
 * Time-bound. `smartCheck` is the agent's self-assessment against that rubric.
 */
export const SmartObjectiveSchema = z.object({
  id: z
    .string()
    .min(1)
    .describe('Stable kebab-case id (e.g. "demo-requests-linkedin").'),
  objective: z
    .string()
    .min(20)
    .describe('Single-sentence objective in the form "verb + metric + target + deadline".'),
  specific: z.string().min(10).describe('What exactly will be achieved.'),
  measurable: z.string().min(5).describe('How progress will be quantified.'),
  achievable: z.string().min(10).describe('Why the target is realistic given resources.'),
  relevant: z.string().min(10).describe('Why this objective matters to the business.'),
  timeBound: z.string().min(5).describe('Concrete deadline or window.'),
  kpi: z.string().min(3).describe('Primary KPI (e.g. "MQL volume", "Demo requests").'),
  baseline: z
    .string()
    .optional()
    .describe('Current value of the metric, if known.'),
  targetValue: z.string().min(1).describe('Target value (e.g. "+30%", "1200 sign-ups").'),
  deadline: z.string().min(3).describe('Date or window by which the target must be hit.'),
  funnelStage: FunnelStageEnum,
  measurementMethod: z
    .string()
    .min(5)
    .describe('Where the data comes from (analytics tool, CRM field, etc.).'),
  reasoning: z
    .string()
    .min(10)
    .describe('Why this objective was chosen, referencing the buyer journey.'),
  smartCheck: z
    .object({
      specific: z.boolean(),
      measurable: z.boolean(),
      achievable: z.boolean(),
      relevant: z.boolean(),
      timeBound: z.boolean(),
    })
    .describe('Self-check that the objective passes each SMART criterion.'),
});
export type SmartObjective = z.infer<typeof SmartObjectiveSchema>;
