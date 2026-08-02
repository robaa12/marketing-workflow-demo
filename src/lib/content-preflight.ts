import type { ContentBrief, Post, QANote } from '../schemas/content.js';
import { getPlatformRules } from './platform-rules.js';

export class ContentPreflightError extends Error {
  constructor(readonly violations: string[]) {
    super(`Content preflight failed: ${violations.join('; ')}`);
    this.name = 'ContentPreflightError';
  }
}

export function runContentPreflight(
  brief: ContentBrief,
  posts: Post[],
): QANote[] {
  const violations: string[] = [];
  const notes: QANote[] = [];
  const postIds = new Set<string>();
  const prohibitedTerms = parseProhibitedTerms(brief.constraints);

  if (posts.length > brief.maxPosts) {
    violations.push(`generated ${posts.length} posts; limit is ${brief.maxPosts}`);
  }

  for (const post of posts) {
    if (postIds.has(post.postId)) violations.push(`duplicate post id ${post.postId}`);
    postIds.add(post.postId);

    const rules = getPlatformRules(post.platform);
    if (post.caption.length > rules.charLimit) {
      violations.push(
        `${post.postId} exceeds the ${rules.label} character limit (${post.caption.length}/${rules.charLimit})`,
      );
    }

    for (const term of prohibitedTerms) {
      if (post.caption.toLocaleLowerCase().includes(term.toLocaleLowerCase())) {
        violations.push(`${post.postId} contains prohibited term "${term}"`);
      }
    }

    if (hasQuantifiedClaim(post.caption)) {
      notes.push({
        postId: post.postId,
        severity: 'warning',
        resolved: false,
        message:
          'Contains a quantified claim. Verify it against a cited research source or replace it with a qualified statement before publishing.',
      });
    }
  }

  if (violations.length > 0) throw new ContentPreflightError(violations);
  return notes;
}

function parseProhibitedTerms(constraints: string): string[] {
  return [...constraints.matchAll(/AVOID:\s*([^;]+)/gi)]
    .map((match) => match[1]?.trim())
    .filter((term): term is string => Boolean(term));
}

function hasQuantifiedClaim(content: string): boolean {
  return /\b\d+(?:\.\d+)?\s?(?:%|hours?|days?|x)\b/i.test(content)
    || /\b(?:best|number\s*one|#1|guarantee(?:d|s)?)\b/i.test(content);
}
