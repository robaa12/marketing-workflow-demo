import type { Agent } from '@mastra/core/agent';
import { vi } from 'vitest';

/**
 * Build a mock Agent that returns a pre-canned structured object from
 * `generate()`. The mock is type-parameterised so it can stand in for any
 * specialised agent in the workflow while still satisfying the Agent type.
 *
 * The returned object has the same surface area as the real `Agent.generate`
 * method: we just need `.generate(...)` to resolve to `{ object: payload }`.
 */
export function buildMockAgent<Output>(payload: Output): Agent {
  const generate = vi.fn(async (
    _messages?: unknown,
    _options?: Record<string, any>,
  ) => ({ object: payload }));
  // The Agent type has dozens of methods. We cast to `unknown` first to
  // avoid having to satisfy the entire interface, then to `Agent`.
  return { generate } as unknown as Agent;
}
