import { Agent } from '@mastra/core/agent';
import type { z } from 'zod';
import { getModel } from '../../../lib/model.js';
import { safeGenerate } from '../../../lib/safeGenerate.js';
import { getPlatformRules } from '../../../lib/platform-rules.js';
import {
  HashtagItemSchema,
  type Post,
  type ContentBrief,
  type ResearchOutput,
  type SocialPlatform,
} from '../../../schemas/content.js';
import { HASHTAG_SEO_PROMPT } from '../../../prompts/hashtagSeo.js';

export type HashtagSeoResult = z.infer<typeof HashtagItemSchema>[];

/**
 * Build the hashtag & SEO agent.
 */
export function buildHashtagSeoAgent(model: string = getModel()): Agent {
  return new Agent({
    id: 'hashtag-seo-agent',
    name: 'Hashtag & SEO Agent',
    description: 'Generates ranked hashtags and keywords per post.',
    instructions: HASHTAG_SEO_PROMPT,
    model,
  });
}

export interface HashtagSeoInput {
  brief: ContentBrief;
  research: ResearchOutput;
  posts: Post[];
}

/**
 * Run the hashtag & SEO agent against a set of posts.
 * Returns an empty array if no posts are provided.
 */
export async function runHashtags(
  agent: Agent,
  input: HashtagSeoInput,
): Promise<HashtagSeoResult> {
  const { brief, research, posts } = input;
  if (posts.length === 0) return [];

  const prompt = `Generate hashtags + keywords for each post below.

== BRAND ==
${brief.brandName} — voice: ${brief.brandVoice}
Product: ${brief.product}
Audience: ${brief.targetAudience}

== RESEARCH-DERIVED HASHTAG POOL (prioritise usable ones, prune spam tags) ==
${research.hashtags.join(' ')}

== POSTS ==
${posts
  .map((p) => {
    const rules = getPlatformRules(p.platform as SocialPlatform);
    return `- [${p.postId}] platform=${p.platform} (rule: ${rules.hashtagConvention})\n  caption: ${p.caption}`;
  })
  .join('\n')}

Return an array, one item per post, with postIds matching exactly.`;

  return safeGenerate(
    agent,
    [{ role: 'user', content: prompt }],
    HashtagItemSchema.array(),
    'hashtag-seo',
  );
}
