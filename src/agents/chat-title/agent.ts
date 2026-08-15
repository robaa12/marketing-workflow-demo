import { Agent } from '@mastra/core/agent';
import { z } from 'zod';
import { getModel } from '../../lib/model.js';
import { safeGenerate } from '../../lib/safeGenerate.js';
import { CHAT_TITLE_PROMPT } from '../../prompts/chatTitle.js';

export const ChatTitleInputSchema = z.object({
  brandName: z.string().trim().min(1).max(120),
  product: z.string().trim().min(1).max(2_000),
  industry: z.string().trim().min(1).max(120),
  businessType: z.string().trim().min(1).max(120),
  campaignGoal: z.string().trim().min(1).max(60),
  targetAudience: z.string().trim().min(1).max(500),
});

export type ChatTitleInput = z.infer<typeof ChatTitleInputSchema>;

export function countTitleWords(title: string): number {
  return title.trim().split(/\s+/u).filter(Boolean).length;
}

export const ChatTitleResultSchema = z.object({
  title: z
    .string()
    .trim()
    .min(1)
    .max(120)
    .refine(
      (title) => {
        const words = countTitleWords(title);
        return words >= 4 && words <= 5;
      },
      'Chat titles must contain exactly 4 or 5 words',
    ),
});

export type ChatTitleResult = z.infer<typeof ChatTitleResultSchema>;

export function buildChatTitleAgent(model: string = getModel()): Agent {
  return new Agent({
    id: 'chat-title-agent',
    name: 'Chat Title Agent',
    description: 'Creates concise 4-5 word chat titles from campaign briefs.',
    instructions: CHAT_TITLE_PROMPT,
    model,
  });
}

export async function runChatTitle(
  agent: Agent,
  input: ChatTitleInput,
): Promise<ChatTitleResult> {
  return safeGenerate(
    agent,
    [{ role: 'user', content: JSON.stringify(input, null, 2) }],
    ChatTitleResultSchema,
    'chat-title',
    { timeoutMs: 30_000, structuredAttemptTimeoutMs: 10_000 },
  );
}

const FALLBACK_WORDS = ['Campaign', 'Launch', 'Strategy', 'Plan'];
const FILLER_WORDS = new Set([
  'a',
  'an',
  'and',
  'at',
  'for',
  'from',
  'in',
  'of',
  'on',
  'the',
  'to',
  'with',
]);

/** Keeps the endpoint useful when the title model is temporarily unavailable. */
export function fallbackChatTitle(input: ChatTitleInput): ChatTitleResult {
  const source = `${input.brandName} ${input.product}`
    .replace(/[^\p{L}\p{N}'’-]+/gu, ' ')
    .trim()
    .split(/\s+/u)
    .filter((word) => word && !FILLER_WORDS.has(word.toLocaleLowerCase()));
  const uniqueWords: string[] = [];

  for (const word of source) {
    if (!uniqueWords.some((item) => item.toLocaleLowerCase() === word.toLocaleLowerCase())) {
      uniqueWords.push(word);
    }
    if (uniqueWords.length === 5) break;
  }

  for (const word of FALLBACK_WORDS) {
    if (uniqueWords.length >= 4) break;
    if (!uniqueWords.some((item) => item.toLocaleLowerCase() === word.toLocaleLowerCase())) {
      uniqueWords.push(word);
    }
  }

  return ChatTitleResultSchema.parse({ title: uniqueWords.slice(0, 5).join(' ') });
}
