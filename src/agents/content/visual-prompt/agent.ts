import { Agent } from '@mastra/core/agent';
import type { TracingContext } from '@mastra/core/observability';
import type { z } from 'zod';
import { getModel } from '../../../lib/model.js';
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

const MAX_IMAGE_PROMPT_CHARS = 1_000;

/**
 * Build Gemini-ready prompts directly from the approved content bundle.
 *
 * This used to ask a second language model to rewrite posts in batches of 12.
 * A slow provider call could consume the full agent deadline and fail an
 * otherwise complete content run before Gemini was ever reached. The renderer
 * already understands rich natural-language instructions, so this bounded,
 * deterministic transform is both more reliable and easier to audit.
 */
export async function runVisualPrompts(
  _agent: Agent,
  input: VisualPromptInput,
  _tracingContext?: TracingContext,
): Promise<VisualPromptResult> {
  const { brief, strategy, research, posts } = input;
  if (posts.length === 0) return [];

  const trends = research.trends
    .slice(0, 2)
    .map((trend) => trend.title)
    .join(', ');
  const hooksByPlatform = new Map<SocialPlatform, string[]>();
  for (const hook of research.contentHooks) {
    const hooks = hooksByPlatform.get(hook.platform) ?? [];
    hooks.push(hook.angle);
    hooksByPlatform.set(hook.platform, hooks);
  }

  return posts.map((post) => {
    const platformRules = getPlatformRules(post.platform);
    const platformHooks = hooksByPlatform.get(post.platform)?.slice(0, 2);
    const aspectRatio = visualAspectRatio(post.platform, post.format);
    const closingInstructions =
      `Compose for ${aspectRatio}; keep the subject in the center safe area and leave intentional negative space. ` +
      'Do not render logos, watermarks, UI chrome, hashtags, captions, or unreadable text.';
    const prompt = boundedPrompt([
      `Create a polished ${platformRules.label} visual for ${compactText(brief.brandName, 50)}.`,
      `Message: ${compactText(post.caption, 180)}.`,
      `Product: ${compactText(brief.product, 70)}. Audience: ${compactText(brief.targetAudience, 70)}.`,
      `Campaign: ${compactText(strategy.coreNarrative, 70)}. Voice: ${compactText(brief.brandVoice, 50)}.`,
      `Use one coherent campaign palette, lighting treatment, and recurring motif; make the composition for ${compactText(post.postId, 50)} unique.`,
      `Format: ${compactText(`${post.format}; ${platformRules.format}`, 90)}.`,
      platformHooks?.length
        ? `Angle: ${compactText(platformHooks.join('; '), 70)}.`
        : undefined,
      trends ? `Context: ${compactText(trends, 50)}.` : undefined,
      research.audienceInsights
        ? `Preference: ${compactText(research.audienceInsights, 60)}.`
        : undefined,
      `CTA mood: ${compactText(post.cta, 40)}.`,
    ], closingInstructions);

    return VisualPromptItemSchema.parse({
      postId: post.postId,
      prompt,
      tool: 'gemini',
      aspectRatio,
    });
  });
}

function boundedPrompt(
  rawParts: Array<string | undefined>,
  closingInstructions: string,
): string {
  const closing = compactText(closingInstructions, MAX_IMAGE_PROMPT_CHARS);
  const parts: string[] = [];
  let remaining = MAX_IMAGE_PROMPT_CHARS - closing.length - 1;

  for (const rawPart of rawParts) {
    if (!rawPart || remaining <= 1) continue;
    const part = compactText(rawPart, remaining);
    if (!part) continue;
    parts.push(part);
    remaining -= part.length + 1;
  }

  return `${parts.join(' ')} ${closing}`.trim();
}

function compactText(value: string, maximum: number): string {
  const normalized = value.replace(/\s+/g, ' ').trim();
  if (normalized.length <= maximum) return normalized;
  if (maximum <= 1) return normalized.slice(0, maximum);

  const clipped = normalized.slice(0, maximum - 1);
  const lastSpace = clipped.lastIndexOf(' ');
  const boundary = lastSpace >= Math.floor(maximum * 0.6)
    ? lastSpace
    : clipped.length;
  return `${clipped.slice(0, boundary).trimEnd()}…`;
}

function visualAspectRatio(
  platform: SocialPlatform,
  format: string,
): '1:1' | '16:9' | '9:16' {
  if (
    platform === 'tiktok' ||
    platform === 'youtube_shorts' ||
    /reel|short|vertical|story|video/i.test(format)
  ) {
    return '9:16';
  }
  if (platform === 'instagram') return '1:1';
  return '16:9';
}
