import { Agent } from '@mastra/core/agent';
import type { z } from 'zod';
import { getModel } from '../../../lib/model.js';
import { safeGenerate } from '../../../lib/safeGenerate.js';
import { getPlatformRules } from '../../../lib/platform-rules.js';
import {
  VisualPromptItemSchema,
  type Post,
  type ContentBrief,
  type ContentStrategy,
  type ResearchOutput,
  type SocialPlatform,
} from '../../../schemas/content.js';
import { VISUAL_PROMPT_PROMPT } from '../../../prompts/visualPrompt.js';

export type VisualPromptResult = z.infer<typeof VisualPromptItemSchema>[];

/**
 * Build the visual prompt agent.
 */
export function buildVisualPromptAgent(model: string = getModel()): Agent {
  return new Agent({
    id: 'visual-prompt-agent',
    name: 'Visual Prompt Agent',
    description: 'Generates AI image/video prompts for social media posts.',
    instructions: VISUAL_PROMPT_PROMPT,
    model,
  });
}

export interface VisualPromptInput {
  brief: ContentBrief;
  strategy: ContentStrategy;
  research: ResearchOutput;
  posts: Post[];
}

/**
 * Run the visual prompt agent against a set of posts.
 * Includes research context (trends, content hooks) for more relevant visuals.
 * Returns an empty array if no posts are provided.
 */
export async function runVisualPrompts(
  agent: Agent,
  input: VisualPromptInput,
): Promise<VisualPromptResult> {
  const { brief, strategy, research, posts } = input;
  if (posts.length === 0) return [];

  // Get content hooks for visual storytelling
  const hooksText = research.contentHooks
    .map((h) => `- ${h.platform}: ${h.angle}`)
    .join('\n');

  const prompt = `Generate one visual/video AI prompt per post below. Stay visually consistent across the whole set — this is one campaign, one feed.

== BRAND ==
${brief.brandName} — voice: ${brief.brandVoice}
Product: ${brief.product}
Core narrative: ${strategy.coreNarrative}

== TRENDS TO INCORPORATE (use for visual relevance) ==
${research.trends.map((t) => `- ${t.title}: ${t.summary}`).join('\n')}

== CONTENT HOOKS (weave these into visual storytelling) ==
${hooksText || 'No specific hooks — use trends and brand voice.'}

== AUDIENCE INSIGHTS (visual preferences) ==
${research.audienceInsights}

== POSTS ==
${posts.map((p) => `- [${p.postId}] ${p.platform} / format=${p.format}\n  caption: ${p.caption}\n  cta: ${p.cta}`).join('\n')}

Return an array matching the schema, one item per post. Use the trends and hooks above to make visuals more relevant and engaging. Keep visual world consistent across posts. Use the most appropriate per-platform aspect ratio:
${JSON.stringify(posts.map((p) => ({ postId: p.postId, aspect: getPlatformRules(p.platform as SocialPlatform).format })), null, 2)}`;

  return safeGenerate(
    agent,
    [{ role: 'user', content: prompt }],
    VisualPromptItemSchema.array(),
    'visual-prompt',
  );
}
