import { Agent } from '@mastra/core/agent';
import type { z } from 'zod';
import { getModel } from '../../../lib/model.js';
import { safeGenerate } from '../../../lib/safeGenerate.js';
import { platformRulesTool, brandContextTool } from '../../../tools/index.js';
import {
  PostSchema,
  type ContentBrief,
  type SocialPlatform,
  type ContentStrategy,
  type ResearchOutput,
  type Post,
  type PostFeedback,
} from '../../../schemas/content.js';
import {
  COPYWRITER_PROMPT,
  COPYWRITER_STRUCTURER_PROMPT,
} from '../../../prompts/copywriter.js';
import { copywriterScorers } from '../../../lib/scorers.js';

export type CopywriterResult = z.infer<typeof PostSchema>[];

/**
 * Build the copywriter agent. Accepting a model string keeps the agent
 * testable and lets the workflow compose a different model for specific tenants.
 * Includes quality scorers for tone consistency, completeness, and safety.
 */
export function buildCopywriterAgent(model: string = getModel()): Agent {
  return new Agent({
    id: 'copywriter-agent',
    name: 'Copywriter Agent',
    description: 'Writes on-brand, platform-native social media posts.',
    instructions: COPYWRITER_PROMPT,
    model,
    tools: { platformRules: platformRulesTool, brandContext: brandContextTool },
    scorers: copywriterScorers,
  });
}

/**
 * Build the structurer agent (internal helper for the two-pass copywriting flow).
 */
export function buildCopywriterStructurerAgent(model: string = getModel()): Agent {
  return new Agent({
    id: 'copywriter-structurer',
    name: 'Copywriter Structurer',
    description: 'Converts free-form post output into structured JSON.',
    instructions: COPYWRITER_STRUCTURER_PROMPT,
    model,
  });
}

export interface CopywriterInput {
  brief: ContentBrief;
  research: ResearchOutput;
  strategy: ContentStrategy;
  platform: SocialPlatform;
  postCount: number;
}

/**
 * Run the copywriter against a brief + strategy for a specific platform.
 *
 * Uses a two-pass approach:
 *  1. Pass 1: Generate content (may use platform-rules tool).
 *  2. Pass 2: Structure output into validated JSON via safeGenerate.
 */
export async function runCopywriting(
  agent: Agent,
  input: CopywriterInput,
  structurerAgent: Agent = buildCopywriterStructurerAgent(),
): Promise<CopywriterResult> {
  const { brief, research, strategy, platform, postCount } = input;

  const pillarNames = strategy.contentPillars.map((p) => p.name).join(', ');
  const tone = strategy.tonePerPlatform[platform] ?? brief.brandVoice;

  // Get content hooks for this platform
  const platformHooks = research.contentHooks
    .filter((h) => h.platform === platform)
    .map((h) => `- ${h.angle} (${h.rationale})`)
    .join('\n');

  // ── Pass 1: Generate content ─────────────────────────────────────────
  const prompt = `Generate ${postCount} on-brand posts for ${platform}.

== BRAND ==
${brief.brandName} — brand voice: ${brief.brandVoice}
Product: ${brief.product}
Campaign goal: ${brief.campaignGoal}
Audience: ${brief.targetAudience}
Constraints: ${brief.constraints || 'none'}
Key messages to weave in: ${brief.keyMessages.join(' | ') || 'none'}

== STRATEGY ==
Core narrative: ${strategy.coreNarrative}
Content pillars: ${pillarNames}
Tone for ${platform}: ${tone}

== RESEARCH SIGNALS (use for topicality, don't copy) ==
Trends: ${research.trends.map((t) => t.title).join(' | ')}
Hashtags in play: ${research.hashtags.join(' ')}

== CONTENT HOOKS FOR ${platform} (use these angles in your posts) ==
${platformHooks || 'No specific hooks — use your judgment based on trends and audience.'}

Call the platform-rules tool for ${platform} first to ground yourself in the real limits. Then write ${postCount} posts with postIds "${platform}-1" through "${platform}-${postCount}". Rotate across pillars. Use the content hooks above to make posts more engaging and topical. STRICTLY obey the character limit returned for ${platform}.

Output the posts as readable text. For each post, label the fields clearly:
postId: <id>
platform: ${platform}
format: <thread|carousel|reel|short|text|...>
caption: <full caption>
cta: <call to action>`;

  const copyResult = await agent.generate(
    [{ role: 'user', content: prompt }],
    { maxSteps: 6 },
  );
  let copyText = copyResult.text ?? '';

  // Fallback: extract from tool results if text is empty
  if (!copyText.trim()) {
    const toolResults = (copyResult as { toolResults?: unknown }).toolResults;
    if (toolResults && Array.isArray(toolResults) && toolResults.length > 0) {
      copyText = toolResults
        .map((r: unknown) => {
          const tr = r as { toolName?: string; result?: unknown };
          const payload =
            typeof tr.result === 'string'
              ? tr.result
              : JSON.stringify(tr.result ?? {});
          return `[${tr.toolName ?? 'tool'}]: ${payload}`;
        })
        .join('\n\n');
    }
  }

  if (!copyText.trim()) {
    throw new Error(
      `[copywriter:${platform}] Pass-1 produced no copy text and no tool results`,
    );
  }

  // ── Pass 2: Structure output via safeGenerate ────────────────────────
  const structurePrompt = `Reformat the following copywriter output into a JSON array of post objects matching the schema. The schema fields are: postId, platform, index, caption, cta, format. Preserve every caption and CTA exactly as written. Use the postIds the copywriter used ("${platform}-1" through "${platform}-${postCount}"). Output ONLY the JSON array.

OUTPUT:
${copyText}`;

  return safeGenerate(
    structurerAgent,
    [{ role: 'user', content: structurePrompt }],
    PostSchema.array(),
    `copywriter:${platform}`,
  );
}

export interface CopywriterRewriteInput {
  brief: ContentBrief;
  strategy: ContentStrategy;
  posts: Post[];
  feedback: PostFeedback[];
}

/**
 * Rewrite specific posts based on QA feedback.
 * Only rewrites posts that have feedback; returns others as-is.
 */
export async function runCopywriterRewrite(
  agent: Agent,
  input: CopywriterRewriteInput,
  structurerAgent: Agent = buildCopywriterStructurerAgent(),
): Promise<CopywriterResult> {
  const { brief, strategy, posts, feedback } = input;

  const feedbackByPostId = new Map(feedback.map((f) => [f.postId, f]));
  const postsToRewrite = posts.filter((p) => feedbackByPostId.has(p.postId));
  const postsToKeep = posts.filter((p) => !feedbackByPostId.has(p.postId));

  if (postsToRewrite.length === 0) return posts;

  const feedbackText = postsToRewrite
    .map((p) => {
      const f = feedbackByPostId.get(p.postId)!;
      return `- [${p.postId}] ${p.platform}
  Current caption: ${p.caption}
  Current CTA: ${p.cta}
  Issue: ${f.issue}
  Suggestion: ${f.suggestion}`;
    })
    .join('\n\n');

  const prompt = `Rewrite the following posts based on QA feedback. Keep the same postId, platform, and format. Only change the caption and CTA.

== BRAND ==
${brief.brandName} — voice: ${brief.brandVoice}
Product: ${brief.product}
Campaign goal: ${brief.campaignGoal}

== STRATEGY ==
Core narrative: ${strategy.coreNarrative}
Tone: ${JSON.stringify(strategy.tonePerPlatform)}

== POSTS TO REWRITE ==
${feedbackText}

For each post, output:
postId: <id>
platform: <platform>
format: <format>
caption: <rewritten caption>
cta: <rewritten cta>`;

  const copyResult = await agent.generate(
    [{ role: 'user', content: prompt }],
    { maxSteps: 4 },
  );
  let copyText = copyResult.text ?? '';

  if (!copyText.trim()) {
    const toolResults = (copyResult as { toolResults?: unknown }).toolResults;
    if (toolResults && Array.isArray(toolResults) && toolResults.length > 0) {
      copyText = toolResults
        .map((r: unknown) => {
          const tr = r as { toolName?: string; result?: unknown };
          const payload =
            typeof tr.result === 'string'
              ? tr.result
              : JSON.stringify(tr.result ?? {});
          return `[${tr.toolName ?? 'tool'}]: ${payload}`;
        })
        .join('\n\n');
    }
  }

  if (!copyText.trim()) {
    // If rewrite fails, return original posts
    return posts;
  }

  const structurePrompt = `Reformat the following copywriter output into a JSON array of post objects matching the schema. The schema fields are: postId, platform, index, caption, cta, format. Preserve every caption and CTA exactly as written. Output ONLY the JSON array.

OUTPUT:
${copyText}`;

  const rewrittenPosts = await safeGenerate(
    structurerAgent,
    [{ role: 'user', content: structurePrompt }],
    PostSchema.array(),
    'copywriter-rewrite',
  );

  // Merge: rewritten posts + kept posts, maintaining original order
  const rewrittenByPostId = new Map(rewrittenPosts.map((p) => [p.postId, p]));
  return posts.map((p) => rewrittenByPostId.get(p.postId) ?? p);
}
