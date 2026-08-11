import type { Agent } from '@mastra/core/agent';
import { z } from 'zod';
import { getProviderOptions } from './model.js';
import { runWithAgentErrorHandling } from './errors.js';
import { OperationTimeoutError, withTimeout } from './timeout.js';

/**
 * Wrapper around agent.generate that:
 *  1. Tries structuredOutput first by default (with jsonPromptInjection), or
 *     starts in text mode when the caller opts out of an unreliable provider path.
 *  2. Extracts, parses, and schema-validates JSON returned as plain text.
 *
 * This is necessary because free-tier OpenRouter providers frequently ignore
 * jsonPromptInjection or return 500s when structured output is requested.
 *
 * All errors are wrapped in `MarketingWorkflowError` with the given `agentId`
 * so workflow error handlers receive structured diagnostics.
 */
type SimpleMessage = { role: 'user' | 'system'; content: string };

const DEFAULT_AGENT_TIMEOUT_MS = 90_000;
const MIN_AGENT_TIMEOUT_MS = 15_000;
const MAX_AGENT_TIMEOUT_MS = 300_000;

export interface SafeGenerateOptions {
  /** Shared deadline across structured generation and all fallback passes. */
  timeoutMs?: number;
  /** Optional cap for only the first structured-output attempt. */
  structuredAttemptTimeoutMs?: number;
  /** Start in plain JSON text mode for providers where structured output stalls. */
  textFirst?: boolean;
}

class RecoverableAttemptTimeoutError extends Error {
  constructor(agentId: string, timeoutMs: number) {
    super(`Structured output for ${agentId} stalled after ${timeoutMs}ms`);
    this.name = 'RecoverableAttemptTimeoutError';
  }
}

function clampAgentTimeoutMs(value: number): number {
  return Math.min(Math.max(value, MIN_AGENT_TIMEOUT_MS), MAX_AGENT_TIMEOUT_MS);
}

function getAgentTimeoutMs(overrideMs?: number): number {
  if (Number.isFinite(overrideMs)) return clampAgentTimeoutMs(overrideMs!);
  const configured = Number.parseInt(process.env['MASTRA_AGENT_TIMEOUT_MS'] ?? '', 10);
  if (!Number.isFinite(configured)) return DEFAULT_AGENT_TIMEOUT_MS;
  return clampAgentTimeoutMs(configured);
}

async function generateWithinTimeout(
  agent: Agent,
  messages: SimpleMessage[],
  options: Record<string, unknown>,
  agentId: string,
  deadlineAt: number,
  totalTimeoutMs: number,
  attemptTimeoutMs?: number,
): Promise<{ object?: unknown; text?: string }> {
  const remainingMs = Math.max(deadlineAt - Date.now(), 1);
  const effectiveTimeoutMs = Math.min(remainingMs, attemptTimeoutMs ?? remainingMs);
  try {
    return await withTimeout(
      (abortSignal) => agent.generate(messages as any, {
        ...options,
        abortSignal,
      } as any),
      effectiveTimeoutMs,
      `safeGenerate: ${agentId}`,
    );
  } catch (error) {
    // A fallback pass receives only the time left in the shared deadline. Tell
    // callers the configured total rather than a confusing remainder such as
    // 33575ms.
    if (error instanceof OperationTimeoutError) {
      if (effectiveTimeoutMs < remainingMs) {
        throw new RecoverableAttemptTimeoutError(agentId, effectiveTimeoutMs);
      }
      throw new OperationTimeoutError(`safeGenerate: ${agentId}`, totalTimeoutMs);
    }
    throw error;
  }
}

function parseCandidates<T>(text: string, schema: z.ZodSchema<T>): T | undefined {
  for (const candidate of extractJsonCandidates(text)) {
    try {
      const parsed = JSON.parse(candidate);
      try {
        return schema.parse(parsed);
      } catch (error) {
        // Some models put a single valid object in an unnecessary root array.
        if (Array.isArray(parsed) && parsed.length === 1) {
          return schema.parse(parsed[0]);
        }
        throw error;
      }
    } catch {
      // Keep scanning: another JSON value may match the requested schema.
    }
  }
  return undefined;
}

function schemaInstruction<T>(schema: z.ZodSchema<T>): string {
  try {
    return JSON.stringify(compactJsonSchema(z.toJSONSchema(schema)));
  } catch {
    return '[Schema conversion unavailable; follow the agent schema exactly.]';
  }
}

/**
 * Keep validation constraints while removing prose that the agent already has
 * in its instructions. This makes a fallback materially smaller and faster.
 */
function compactJsonSchema(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(compactJsonSchema);
  if (!value || typeof value !== 'object') return value;

  const omittedKeys = new Set(['$schema', 'description', 'default', 'examples', 'title']);
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => !omittedKeys.has(key))
      .map(([key, nested]) => [key, compactJsonSchema(nested)]),
  );
}

function isRecoverableGenerationError(error: unknown): boolean {
  if (error instanceof RecoverableAttemptTimeoutError) return true;
  if (error instanceof z.ZodError) return true;

  const message = error instanceof Error ? error.message : String(error);
  const normalized = message.toLowerCase();
  return (
    normalized.includes('structured_output_schema_validation_failed') ||
    normalized.includes('structured output validation failed') ||
    normalized.includes('structured output failed validation') ||
    normalized.includes('zoderror') ||
    normalized.includes('internal server error') ||
    normalized.includes('apicallerror') ||
    normalized.includes('empty structured response')
  );
}

export async function safeGenerate<T>(
  agent: Agent,
  messages: SimpleMessage[],
  schema: z.ZodSchema<T>,
  agentId = 'unknown-agent',
  options: SafeGenerateOptions = {},
): Promise<T> {
  return runWithAgentErrorHandling(agentId, async () => {
    const timeoutMs = getAgentTimeoutMs(options.timeoutMs);
    const deadlineAt = Date.now() + timeoutMs;
    const structuredAttemptTimeoutMs = options.structuredAttemptTimeoutMs === undefined
      ? undefined
      : Math.min(Math.max(options.structuredAttemptTimeoutMs, 1_000), timeoutMs);
    // ── Attempt 1: native structured output ────────────────────────────────
    if (!options.textFirst) {
      try {
        const response = await generateWithinTimeout(agent, messages, {
          providerOptions: getProviderOptions(),
          // safeGenerate owns cross-mode recovery. Provider-level retries can
          // otherwise consume most of this shared deadline before fallback.
          modelSettings: { temperature: 0.1, maxRetries: 0 },
          structuredOutput: {
            schema,
            jsonPromptInjection: true,
          },
          maxSteps: 1,
          toolChoice: 'none',
        }, agentId, deadlineAt, timeoutMs, structuredAttemptTimeoutMs);

        const object = response.object as T | undefined;
        if (object !== undefined && object !== null) {
          return schema.parse(object);
        }
        const textObject = parseCandidates(response.text ?? '', schema);
        if (textObject !== undefined) return textObject;
      } catch (err) {
        // Only fall back for *expected* failure classes; rethrow hard network bugs.
        if (isRecoverableGenerationError(err)) {
          const msg = err instanceof Error ? err.message : String(err);
          console.warn(`[safeGenerate] Structured output failed (${msg}), falling back to text mode...`);
        } else {
          throw err;
        }
      }
    }

    // ── Attempt 2: text generation + JSON repair ─────────────────────────
    const fallbackMessages: SimpleMessage[] = [
      {
        role: 'system',
        content:
          'CRITICAL: Return ONLY one valid JSON value. No markdown fences, commentary, or trailing prose. ' +
          'The JSON root may be an object or array as required by this JSON Schema:\n' +
          schemaInstruction(schema),
      },
      ...messages,
    ];

    const response = await generateWithinTimeout(agent, fallbackMessages, {
      providerOptions: getProviderOptions(),
      modelSettings: { temperature: 0.1, maxRetries: 0 },
      maxSteps: 1,
      toolChoice: 'none',
    }, agentId, deadlineAt, timeoutMs);

    if (response.object !== undefined && response.object !== null) {
      const objectResult = schema.safeParse(response.object);
      if (objectResult.success) return objectResult.data;
    }

    const text = response.text ?? '';
    const parsed = parseCandidates(text, schema);
    if (parsed !== undefined) return parsed;

    // The model returned JSON but not this schema. Give it one short, focused
    // correction pass without tools. Empty text is corrected too: tool-calling
    // models can otherwise finish their step budget without a final response.
    const correctionOptions: Record<string, unknown> = {
      providerOptions: getProviderOptions(),
      modelSettings: { temperature: 0, maxRetries: 0 },
      toolChoice: 'none',
      maxSteps: 1,
    };
    if (!options.textFirst) {
      correctionOptions.structuredOutput = {
        schema,
        jsonPromptInjection: true,
      };
    }

    const correctionResponse = await generateWithinTimeout(agent, [
      ...fallbackMessages,
      {
        role: 'user',
        content: `Your previous response was ${text.trim() ? 'invalid' : 'empty'} and did not match the required schema. Return exactly one JSON value matching the supplied JSON Schema. Use an object or array according to the schema root. Never return markdown, explanation, or tool output. Previous response:\n${text.slice(0, 12_000) || '[empty response]'}`,
      },
    ], correctionOptions, agentId, deadlineAt, timeoutMs);

    if (correctionResponse.object !== undefined && correctionResponse.object !== null) {
      const objectResult = schema.safeParse(correctionResponse.object);
      if (objectResult.success) return objectResult.data;
    }

    const corrected = parseCandidates(correctionResponse.text ?? '', schema);
    if (corrected !== undefined) return corrected;

    throw new Error(
      `safeGenerate: The model returned ${correctionResponse.text?.trim() ? 'invalid output' : 'an empty response'}, including after a tool-free correction pass.`,
    );
  });
}

/**
 * Finds balanced JSON objects and arrays, including JSON embedded in prose or
 * Markdown fences. Candidates are parsed and schema-validated by the caller,
 * so an earlier JSON example cannot hide a later valid response.
 */
function extractJsonCandidates(text: string): string[] {
  const candidates: string[] = [];

  for (let start = 0; start < text.length; start += 1) {
    const opening = text[start];
    if (opening !== '{' && opening !== '[') continue;

    const stack = [opening === '{' ? '}' : ']'];
    let inString = false;
    let escaped = false;

    for (let index = start + 1; index < text.length; index += 1) {
      const character = text[index];
      if (inString) {
        if (escaped) escaped = false;
        else if (character === '\\') escaped = true;
        else if (character === '"') inString = false;
        continue;
      }

      if (character === '"') {
        inString = true;
      } else if (character === '{') {
        stack.push('}');
      } else if (character === '[') {
        stack.push(']');
      } else if (character === '}' || character === ']') {
        if (stack.at(-1) !== character) break;
        stack.pop();
        if (stack.length === 0) {
          const candidate = text.slice(start, index + 1);
          try {
            JSON.parse(candidate);
            candidates.push(candidate);
          } catch {
            // Keep scanning: another JSON value may follow malformed output.
          }
          break;
        }
      }
    }
  }

  return [...new Set(candidates)];
}
