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

/**
 * Scorers for the copywriter agent.
 * Measures toxicity and bias to ensure safe, unbiased content.
 */
export const copywriterScorers = {
  safety: {
    scorer: createToxicityScorer({ model: 'openai/gpt-4o-mini' }),
    sampling: { type: 'ratio' as const, rate: 1 },
  },
  bias: {
    scorer: createBiasScorer({ model: 'openai/gpt-4o-mini' }),
    sampling: { type: 'ratio' as const, rate: 0.5 },
  },
};

/**
 * Scorers for the QA agent.
 * Measures toxicity to ensure reviews are professional.
 */
export const qaScorers = {
  safety: {
    scorer: createToxicityScorer({ model: 'openai/gpt-4o-mini' }),
    sampling: { type: 'ratio' as const, rate: 0.3 },
  },
};
