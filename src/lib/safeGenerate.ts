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
    const json = extractJson(text);

    if (!json) {
      throw new Error(
        `safeGenerate: Could not extract JSON from text response.\nRaw text:\n${text}`,
      );
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(json);
    } catch (parseErr) {
      throw new Error(
        `safeGenerate: Extracted text is not valid JSON. ${parseErr instanceof Error ? parseErr.message : String(parseErr)}\nExtracted:\n${json}`,
      );
    }

    return schema.parse(parsed);
  });
}

/**
 * Naive but effective JSON extractor for LLM text output.
 * Handles markdown fences, surrounding prose, and common formatting mistakes.
 */
function extractJson(text: string): string | null {
  const trimmed = text.trim();

  // 1. Markdown fenced code block (```json ... ```)
  const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch && fenceMatch[1]) {
    const inner = fenceMatch[1].trim();
    if (looksLikeJson(inner)) return inner;
  }

  // 2. First top-level array [...]
  const arrayMatch = trimmed.match(/\[[\s\S]*\]/);
  if (arrayMatch) {
    const candidate = arrayMatch[0];
    if (looksLikeJson(candidate)) return candidate;
  }

  // 3. First top-level object {...}
  const objectMatch = trimmed.match(/\{[\s\S]*\}/);
  if (objectMatch) {
    const candidate = objectMatch[0];
    if (looksLikeJson(candidate)) return candidate;
  }

  // 4. Whole string if it looks like JSON
  if (looksLikeJson(trimmed)) return trimmed;

  return null;
}

function looksLikeJson(s: string): boolean {
  return (
    (s.startsWith('[') && s.endsWith(']')) ||
    (s.startsWith('{') && s.endsWith('}'))
  );
}
