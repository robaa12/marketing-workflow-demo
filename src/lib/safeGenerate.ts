import type { Agent } from '@mastra/core/agent';
import type { z } from 'zod';
import { getProviderOptions } from './model.js';
import { runWithAgentErrorHandling } from './errors.js';
import { withTimeout } from './timeout.js';

/**
 * Wrapper around agent.generate that:
 *  1. Tries structuredOutput first (with jsonPromptInjection).
 *  2. On validation failure or API error, falls back to plain text generation
 *     and extracts / parses JSON manually.
 *
 * This is necessary because free-tier OpenRouter providers frequently ignore
 * jsonPromptInjection or return 500s when structured output is requested.
 *
 * All errors are wrapped in `MarketingWorkflowError` with the given `agentId`
 * so workflow error handlers receive structured diagnostics.
 */
type SimpleMessage = { role: 'user' | 'system'; content: string };

const DEFAULT_AGENT_TIMEOUT_MS = 90_000;

function getAgentTimeoutMs(): number {
  const configured = Number.parseInt(process.env['MASTRA_AGENT_TIMEOUT_MS'] ?? '', 10);
  if (!Number.isFinite(configured)) return DEFAULT_AGENT_TIMEOUT_MS;
  return Math.min(Math.max(configured, 15_000), 300_000);
}

async function generateWithinTimeout(
  agent: Agent,
  messages: SimpleMessage[],
  options: Record<string, unknown>,
  agentId: string,
  deadlineAt: number,
): Promise<{ object?: unknown; text?: string }> {
  const remainingMs = Math.max(deadlineAt - Date.now(), 1);
  return withTimeout(
    (abortSignal) => agent.generate(messages as any, {
      ...options,
      abortSignal,
    } as any),
    remainingMs,
    `safeGenerate: ${agentId}`,
  );
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

export async function safeGenerate<T>(
  agent: Agent,
  messages: SimpleMessage[],
  schema: z.ZodSchema<T>,
  agentId = 'unknown-agent',
): Promise<T> {
  return runWithAgentErrorHandling(agentId, async () => {
    const deadlineAt = Date.now() + getAgentTimeoutMs();
    // ── Attempt 1: native structured output ────────────────────────────────
    try {
      const response = await generateWithinTimeout(agent, messages, {
        providerOptions: getProviderOptions(),
        modelSettings: { temperature: 0.1 },
        structuredOutput: {
          schema,
          jsonPromptInjection: true,
        },
        maxSteps: 1,
        toolChoice: 'none',
      }, agentId, deadlineAt);

      const object = response.object as T | undefined;
      if (object !== undefined && object !== null) {
        return schema.parse(object);
      }
      const textObject = parseCandidates(response.text ?? '', schema);
      if (textObject !== undefined) return textObject;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      // Only fall back for *expected* failure classes; rethrow hard network bugs.
      if (
        msg.includes('STRUCTURED_OUTPUT_SCHEMA_VALIDATION_FAILED') ||
        msg.includes('ZodError') ||
        msg.includes('Internal Server Error') ||
        msg.includes('APICallError') ||
        msg.includes('empty structured response')
      ) {
        console.warn(`[safeGenerate] Structured output failed (${msg}), falling back to text mode...`);
      } else {
        throw err;
      }
    }

    // ── Attempt 2: text generation + JSON repair ─────────────────────────
    const fallbackMessages: SimpleMessage[] = [
      {
        role: 'system',
        content:
          'CRITICAL: Return ONLY valid JSON. No markdown fences, no commentary, no trailing prose. The JSON must strictly match the requested schema.',
      },
      ...messages,
    ];

    const response = await generateWithinTimeout(agent, fallbackMessages, {
      providerOptions: getProviderOptions(),
      modelSettings: { temperature: 0.1 },
      maxSteps: 1,
      toolChoice: 'none',
    }, agentId, deadlineAt);

    const text = response.text ?? '';
    const parsed = parseCandidates(text, schema);
    if (parsed !== undefined) return parsed;

    // The model returned JSON but not this schema. Give it one short, focused
    // correction pass without tools. Empty text is corrected too: tool-calling
    // models can otherwise finish their step budget without a final response.
    const correctionResponse = await generateWithinTimeout(agent, [
      ...fallbackMessages,
      {
        role: 'user',
        content: `Your previous response was ${text.trim() ? 'invalid' : 'empty'} and did not match the required schema. Return exactly one JSON object matching the requested schema. Never return an array, markdown, explanation, or tool output. Previous response:\n${text.slice(0, 12_000) || '[empty response]'}`,
      },
    ], {
      providerOptions: getProviderOptions(),
      modelSettings: { temperature: 0 },
      structuredOutput: {
        schema,
        jsonPromptInjection: true,
      },
      toolChoice: 'none',
      maxSteps: 1,
    }, agentId, deadlineAt);

    if (correctionResponse.object !== undefined && correctionResponse.object !== null) {
      return schema.parse(correctionResponse.object);
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
