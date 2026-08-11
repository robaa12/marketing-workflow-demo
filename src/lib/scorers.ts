/**
 * Quality scorers for content agents.
 * These provide objective quality measurements for agent outputs.
 *
 * Available scorers from @mastra/evals:
 * - createToxicityScorer: Detects harmful or inappropriate content
 * - createBiasScorer: Detects potential biases
 * - createHallucinationScorer: Detects factual contradictions
 * - createFaithfulnessScorer: Measures accuracy to context
 */

import { createToxicityScorer, createBiasScorer } from '@mastra/evals/scorers/prebuilt';
import type { MastraScorers } from '@mastra/core/evals';

/**
 * The prebuilt safety scorers below use OpenAI directly. They are optional
 * observability checks, not workflow gates, so do not register them when the
 * service has no credential that could run them.
 */
export function hasOpenAiScorerCredentials(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return Boolean(env['OPENAI_API_KEY']?.trim());
}

/**
 * Scorers for the copywriter agent.
 * Measures toxicity and bias to ensure safe, unbiased content.
 */
export const copywriterScorers: MastraScorers = hasOpenAiScorerCredentials()
  ? {
      safety: {
        scorer: createToxicityScorer({ model: 'openai/gpt-4o-mini' }),
        sampling: { type: 'ratio' as const, rate: 1 },
      },
      bias: {
        scorer: createBiasScorer({ model: 'openai/gpt-4o-mini' }),
        sampling: { type: 'ratio' as const, rate: 0.5 },
      },
    }
  : {};

/**
 * Scorers for the QA agent.
 * Measures toxicity to ensure reviews are professional.
 */
export const qaScorers: MastraScorers = hasOpenAiScorerCredentials()
  ? {
      safety: {
        scorer: createToxicityScorer({ model: 'openai/gpt-4o-mini' }),
        sampling: { type: 'ratio' as const, rate: 0.3 },
      },
    }
  : {};
