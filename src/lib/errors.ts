import { z } from 'zod';

/**
 * Lightweight structured error returned by agents when an upstream input is
 * missing or contradictory. Workflow steps can inspect `kind` to decide whether
 * to suspend (request more user input) or fail hard.
 */
export const AgentValidationErrorSchema = z.object({
  kind: z.enum(['missing-input', 'invalid-input', 'insufficient-context', 'internal']),
  agent: z.string().min(1),
  missingFields: z.array(z.string()).default([]),
  message: z.string().min(5),
});
export type AgentValidationError = z.infer<typeof AgentValidationErrorSchema>;

export class MarketingWorkflowError extends Error {
  readonly details: AgentValidationError;
  constructor(details: AgentValidationError) {
    super(`[${details.agent}] ${details.message}`);
    this.name = 'MarketingWorkflowError';
    this.details = details;
  }
}
