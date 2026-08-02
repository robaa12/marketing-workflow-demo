import { describe, expect, it } from 'vitest';
import { ContentPreflightError, runContentPreflight } from '../../src/lib/content-preflight.js';
import type { ContentBrief, Post } from '../../src/schemas/content.js';

const brief: ContentBrief = {
  brandName: 'Insight Loop',
  brandVoice: 'Direct',
  product: 'Reporting automation',
  campaignGoal: 'Awareness',
  targetAudience: 'Growth leaders',
  platforms: ['linkedin'],
  duration: '1 week',
  postsPerWeek: 1,
  maxPosts: 2,
  keyMessages: [],
  constraints: 'AVOID: guaranteed; AVOID: hype',
};

const post: Post = {
  postId: 'linkedin-1',
  platform: 'linkedin',
  index: 0,
  caption: 'Teams save 5 hours every week with reporting automation.',
  cta: 'Book a demo',
  format: 'text',
};

describe('content preflight', () => {
  it('flags quantified claims for human verification', () => {
    expect(runContentPreflight(brief, [post])).toMatchObject([
      { postId: 'linkedin-1', severity: 'warning' },
    ]);
  });

  it('blocks prohibited terms and duplicate IDs before model QA', () => {
    const prohibitedPost = { ...post, caption: 'Guaranteed reporting automation.' };

    expect(() => runContentPreflight(brief, [post, prohibitedPost])).toThrow(ContentPreflightError);
  });
});
