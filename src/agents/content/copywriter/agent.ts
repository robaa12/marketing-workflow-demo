import { Agent } from '@mastra/core/agent';
import type { TracingContext } from '@mastra/core/observability';
import type { z } from 'zod';
import { getModel } from '../../../lib/model.js';
import { safeGenerate } from '../../../lib/safeGenerate.js';
import { platformRulesTool, brandContextTool } from '../../../tools/index.js';
import { getPlatformRules } from '../../../lib/platform-rules.js';
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

const MAX_POSTS_PER_GENERATION = 12;
const COPYWRITER_BATCH_TIMEOUT_MS = 120_000;

/**
 * Run the copywriter against a brief + strategy for a specific platform.
 *
 * Generates schema-validated posts in bounded batches. Platform rules are
 * resolved locally and injected into each prompt, avoiding an extra tool and
 * structuring round trip.
 */
export async function runCopywriting(
  agent: Agent,
  input: CopywriterInput,
  _structurerAgent?: Agent,
  tracingContext?: TracingContext,
): Promise<CopywriterResult> {
  const { brief, research, strategy, platform, postCount } = input;

  const pillarNames = strategy.contentPillars.map((p) => p.name).join(', ');
  const tone = strategy.tonePerPlatform[platform] ?? brief.brandVoice;

  // Get content hooks for this platform
  const platformHooks = research.contentHooks
    .filter((h) => h.platform === platform)
    .map((h) => `- ${h.angle} (${h.rationale})`)
    .join('\n');

  const rules = getPlatformRules(platform);
  const batches = Array.from(
    { length: Math.ceil(postCount / MAX_POSTS_PER_GENERATION) },
    (_, batchIndex) => {
      const firstPostNumber = batchIndex * MAX_POSTS_PER_GENERATION + 1;
      return {
        firstPostNumber,
        count: Math.min(
          MAX_POSTS_PER_GENERATION,
          postCount - firstPostNumber + 1,
        ),
      };
    },
  );

  const results: CopywriterResult[] = [];
  for (const { firstPostNumber, count } of batches) {
    const lastPostNumber = firstPostNumber + count - 1;
    const prompt = `Generate ${count} on-brand posts for ${platform} and return them as a JSON array. This is batch ${firstPostNumber}-${lastPostNumber} of ${postCount} total posts for this platform.

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

== PLATFORM RULES ==
Character limit: ${rules.charLimit}
Recommended format: ${rules.format}
Hashtag convention: ${rules.hashtagConvention}

Write exactly ${count} posts with postIds "${platform}-${firstPostNumber}" through "${platform}-${lastPostNumber}" and zero-based indexes ${firstPostNumber - 1} through ${lastPostNumber - 1}. Rotate across pillars and use the research hooks. Every item must contain postId, platform, index, caption, cta, and format. STRICTLY obey the ${rules.charLimit}-character caption limit.`;

    const batch = await safeGenerate(
      agent,
      [{ role: 'user', content: prompt }],
      PostSchema.array(),
      `copywriter:${platform}:${firstPostNumber}-${lastPostNumber}`,
      {
        timeoutMs: COPYWRITER_BATCH_TIMEOUT_MS,
        // This provider spends ~45 seconds on structured mode before falling
        // back. Copywriter prompts already demand JSON, so begin in text mode
        // and validate locally instead of paying for two model calls.
        textFirst: true,
        tracingContext,
      },
    );
    results.push(batch);
  }

  return results
    .flat()
    .sort((left, right) => left.index - right.index);
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
  _structurerAgent?: Agent,
  tracingContext?: TracingContext,
): Promise<CopywriterResult> {
  const { brief, strategy, posts, feedback } = input;

  const strategyFeedback = feedback.filter((item) => item.postId === 'strategy');
  const feedbackByPostId = new Map<string, PostFeedback[]>();
  for (const item of feedback) {
    if (item.postId === 'strategy') continue;
    const existing = feedbackByPostId.get(item.postId) ?? [];
    existing.push(item);
    feedbackByPostId.set(item.postId, existing);
  }
  const postsToRewrite = posts.filter(
    (post) => strategyFeedback.length > 0 || feedbackByPostId.has(post.postId),
  );

  if (postsToRewrite.length === 0) return posts;

  const feedbackText = postsToRewrite
    .map((p) => {
      const relevantFeedback = [
        ...(feedbackByPostId.get(p.postId) ?? []),
        ...strategyFeedback,
      ];
      return `- [${p.postId}] ${p.platform}
  Current caption: ${p.caption}
  Current CTA: ${p.cta}
  Required changes:
${relevantFeedback
  .map((item) => `  - ${item.issue}: ${item.suggestion}`)
  .join('\n')}`;
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

Return one JSON array containing only the rewritten posts. Preserve each postId, platform, index, and format. Every item must contain postId, platform, index, caption, cta, and format.`;

  const rewrittenPosts = await safeGenerate(
    agent,
    [{ role: 'user', content: prompt }],
    PostSchema.array(),
    'copywriter-rewrite',
    {
      timeoutMs: COPYWRITER_BATCH_TIMEOUT_MS,
      textFirst: true,
      tracingContext,
    },
  );

  // Merge only mutable copy fields, preserving post identity and original order.
  const rewrittenByPostId = new Map(rewrittenPosts.map((p) => [p.postId, p]));
  return posts.map((post) => {
    const rewritten = rewrittenByPostId.get(post.postId);
    if (!rewritten) return post;
    return {
      ...post,
      caption: rewritten.caption,
      cta: rewritten.cta,
    };
  });
}
