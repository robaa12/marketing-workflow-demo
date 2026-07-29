/**
 * Centralised model configuration.
 *
 * Each agent reads from `getModel()` so swapping the underlying LLM is a
 * one-line change. Override via the `MASTRA_MODEL_DEFAULT` env var without
 * touching agent code.
 */

const DEFAULT_MODEL = 'openai/gpt-4o-mini' as const;

export function getModel(override?: string): string {
  if (override && override.length > 0) {
    return override;
  }
  const fromEnv = process.env['MASTRA_MODEL_DEFAULT'];
  if (fromEnv && fromEnv.length > 0) {
    return fromEnv;
  }
  return DEFAULT_MODEL;
}
