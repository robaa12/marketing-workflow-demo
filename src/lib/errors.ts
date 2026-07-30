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

/**
 * Run an agent helper and catch failures into structured `MarketingWorkflowError`s.
 *
 * This wraps the three common failure modes in agent helpers:
 *   1. `agent.generate()` throws (network, 429, auth, etc.)
 *   2. The response object is empty/undefined (model returned nothing)
 *   3. `Schema.parse()` fails (LLM returned malformed JSON)
 *
 * Usage:
 *   return runWithAgentErrorHandling('product-analysis', () => agent.generate(...));
 */
export async function runWithAgentErrorHandling<T>(
  agentId: string,
  fn: () => Promise<T>,
): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    // Already a MarketingWorkflowError — re-throw as-is.
    if (error instanceof MarketingWorkflowError) throw error;

    // Zod validation failure → invalid-input
    if (error instanceof z.ZodError) {
      const issues = error.issues
        .map((i) => `${i.path.join('.')}: ${i.message}`)
        .join('; ');
      throw new MarketingWorkflowError({
        kind: 'invalid-input',
        agent: agentId,
        missingFields: [],
        message: `Structured output failed validation: ${issues}`,
      });
    }

    // Empty response → missing-input
    if (
      error instanceof Error &&
      error.message.includes('returned an empty structured response')
    ) {
      throw new MarketingWorkflowError({
        kind: 'missing-input',
        agent: agentId,
        missingFields: [],
        message: `Agent ${agentId} returned an empty response. The model may have been unable to parse the input or produce structured output.`,
      });
    }

    // Everything else → internal
    throw new MarketingWorkflowError({
      kind: 'internal',
      agent: agentId,
      missingFields: [],
      message: error instanceof Error ? error.message : String(error),
    });
  }
}
