import { Agent } from '@mastra/core/agent';
import type { z } from 'zod';
import { getModel } from '../../../lib/model.js';
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

const HASHTAG_COUNTS: Record<SocialPlatform, number> = {
  x: 2,
  instagram: 5,
  linkedin: 4,
  facebook: 3,
  tiktok: 5,
  youtube_shorts: 3,
};

const KEYWORD_STOP_WORDS = new Set([
  'about', 'after', 'again', 'also', 'and', 'are', 'because', 'been', 'before',
  'being', 'but', 'can', 'for', 'from', 'have', 'into', 'just', 'more', 'not',
  'our', 'out', 'that', 'the', 'their', 'them', 'then', 'there', 'these', 'they',
  'this', 'those', 'through', 'was', 'were', 'what', 'when', 'where', 'which',
  'while', 'who', 'will', 'with', 'would', 'your',
]);

function toHashtag(value: string): string | undefined {
  const body = value
    .replace(/^#+/, '')
    .normalize('NFKC')
    .replace(/[^\p{L}\p{N}_]+/gu, '');
  return body ? `#${body}` : undefined;
}

function uniqueCaseInsensitive(values: Array<string | undefined>): string[] {
  const seen = new Set<string>();
  return values.filter((value): value is string => {
    if (!value) return false;
    const key = value.toLocaleLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function extractKeywords(post: Post, brief: ContentBrief): string[] {
  const words = `${post.caption} ${brief.product}`
    .normalize('NFKC')
    .match(/[\p{L}\p{N}][\p{L}\p{N}-]*/gu) ?? [];
  return uniqueCaseInsensitive(words
    .map((word) => word.toLocaleLowerCase())
    .filter((word) => word.length >= 4 && !KEYWORD_STOP_WORDS.has(word)))
    .slice(0, 6);
}

/**
 * Build hashtag and SEO metadata from the researched hashtag pool and post copy.
 * This deterministic stage avoids spending another reasoning-model request on
 * mechanical metadata while retaining the platform-specific tag counts.
 * Returns an empty array if no posts are provided.
 */
export async function runHashtags(
  _agent: Agent,
  input: HashtagSeoInput,
): Promise<HashtagSeoResult> {
  const { brief, research, posts } = input;
  if (posts.length === 0) return [];

  const researchPool = uniqueCaseInsensitive(research.hashtags.map(toHashtag));
  const brandTag = toHashtag(brief.brandName);
  const productTags = brief.product.split(/\s+/).map(toHashtag);

  return posts.map((post) => {
    const keywords = extractKeywords(post, brief);
    const captionTags = keywords.map(toHashtag);
    const requiredTags = post.platform === 'youtube_shorts' ? ['#shorts'] : [];
    const pool = uniqueCaseInsensitive([
      ...requiredTags,
      ...researchPool,
      brandTag,
      ...productTags,
      ...captionTags,
    ]);
    const requiredCount = HASHTAG_COUNTS[post.platform];
    const pinnedCount = requiredTags.length;
    const rotating = pool.slice(pinnedCount);
    const offset = rotating.length > 0 ? post.index % rotating.length : 0;
    const rotated = [...rotating.slice(offset), ...rotating.slice(0, offset)];
    const hashtags = uniqueCaseInsensitive([
      ...requiredTags,
      ...rotated,
    ]).slice(0, requiredCount);

    return HashtagItemSchema.parse({
      postId: post.postId,
      platform: post.platform,
      hashtags,
      keywords,
    });
  });
}
