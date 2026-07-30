/**
 * Centralised model configuration.
 *
 * Each agent reads from `getModel()` so swapping the underlying LLM is a
 * one-line change. Override via the `MASTRA_MODEL_DEFAULT` env var without
 * touching agent code.
 *
 * Default is OpenCode Go (your subscription). Set `MASTRA_MODEL_DEFAULT` to
 * any Mastra-supported `provider/model` string (see https://mastra.ai/models).
 */

const DEFAULT_MODEL = 'opencode-go/kimi-k2.6' as const;

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

/**
 * Provider-specific options applied to every agent call.
 *
 * OpenCode Go handles reasoning automatically per model, so we don't need
 * to force it on or off. Returns an empty object; Mastra's model gateway
 * routes to the correct provider based on the model string.
 */
export function getProviderOptions() {
  return {};
}
