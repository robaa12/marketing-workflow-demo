import type { Agent } from '@mastra/core/agent';
import type { z } from 'zod';
import { getProviderOptions } from './model.js';
import { runWithAgentErrorHandling } from './errors.js';

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

export async function safeGenerate<T>(
  agent: Agent,
  messages: SimpleMessage[],
  schema: z.ZodSchema<T>,
  agentId = 'unknown-agent',
): Promise<T> {
  return runWithAgentErrorHandling(agentId, async () => {
    // ── Attempt 1: native structured output ────────────────────────────────
    try {
      const response = await agent.generate(messages as any, {
        providerOptions: getProviderOptions(),
        modelSettings: { temperature: 0.1 },
        structuredOutput: {
          schema,
          jsonPromptInjection: true,
        },
      });

      const object = response.object as T | undefined;
      if (object !== undefined && object !== null) {
        return schema.parse(object);
      }
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

    const response = await agent.generate(fallbackMessages as any, {
      providerOptions: getProviderOptions(),
      modelSettings: { temperature: 0.1 },
    });

    const text = response.text ?? '';
    const candidates = extractJsonCandidates(text);

    if (candidates.length === 0) {
      throw new Error(
        `safeGenerate: Could not extract JSON from text response.\nRaw text:\n${text}`,
      );
    }

    let lastError: unknown;
    for (const candidate of candidates) {
      try {
        return schema.parse(JSON.parse(candidate));
      } catch (error) {
        lastError = error;
      }
    }

    throw new Error(
      `safeGenerate: No JSON candidate matched the requested schema. ${lastError instanceof Error ? lastError.message : String(lastError)}`,
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
