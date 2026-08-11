import type { Agent } from '@mastra/core/agent';
import { describe, expect, it, vi } from 'vitest';
import { runHashtags } from '../../src/agents/content/hashtag-seo/agent.js';
import { runVisualPrompts } from '../../src/agents/content/visual-prompt/agent.js';
import type {
  ContentBrief,
  ContentStrategy,
  Post,
  ResearchOutput,
} from '../../src/schemas/content.js';

const brief: ContentBrief = {
  brandName: 'Insight Loop',
  brandVoice: 'Direct and practical.',
  product: 'Marketing reporting automation',
  campaignGoal: 'Increase qualified demos.',
  targetAudience: 'SaaS growth leaders',
  platforms: ['linkedin', 'youtube_shorts'],
  duration: '1 week',
  postsPerWeek: 1,
  maxPosts: 24,
  keyMessages: ['Save reporting time.'],
  constraints: '',
};

const strategy: ContentStrategy = {
  coreNarrative: 'Turn reporting time into growth time.',
  contentPillars: [
    { name: 'Efficiency', description: 'Save reporting time.' },
    { name: 'Proof', description: 'Show measurable outcomes.' },
    { name: 'Simplicity', description: 'Make reporting accessible.' },
  ],
  tonePerPlatform: {
    x: 'concise',
    instagram: 'visual',
    linkedin: 'practical',
    facebook: 'friendly',
    tiktok: 'energetic',
    youtube_shorts: 'direct',
  },
  rationale: 'The pillars support the campaign goal.',
};

const research: ResearchOutput = {
  trends: [{ title: 'Automation', summary: 'Teams are automating reporting.' }],
  hashtags: ['#MarketingOps', '#ReportingAutomation', '#SaaSGrowth'],
  sources: [{
    title: 'Reporting benchmark',
    url: 'https://example.com/reporting',
    retrievedAt: '2026-08-11T00:00:00.000Z',
  }],
  contentHooks: [{
    platform: 'linkedin',
    angle: 'Show time saved.',
    rationale: 'It addresses the audience pain point.',
  }],
  competitorNotes: '',
  audienceInsights: 'Leaders prefer clean product visuals.',
};

function makePost(index: number, platform: Post['platform'] = 'linkedin'): Post {
  return {
    postId: `${platform}-${index + 1}`,
    platform,
    index,
    caption: `Automate weekly marketing reporting and give your team more growth time ${index + 1}.`,
    cta: 'Book a demo',
    format: platform === 'youtube_shorts' ? 'short' : 'text',
  };
}

describe('Content enrichment', () => {
  it('builds hashtags and keywords without another model request', async () => {
    const generate = vi.fn(async () => {
      throw new Error('the hashtag model should not run');
    });
    const agent = { generate } as unknown as Agent;
    const posts = [makePost(0), makePost(1, 'youtube_shorts')];

    const result = await runHashtags(agent, { brief, research, posts });

    expect(generate).not.toHaveBeenCalled();
    expect(result).toHaveLength(2);
    expect(result[0]?.hashtags).toContain('#MarketingOps');
    expect(result[1]?.hashtags.map((tag) => tag.toLowerCase())).toContain('#shorts');
    for (const item of result) {
      expect(new Set(item.hashtags.map((tag) => tag.toLowerCase())).size).toBe(item.hashtags.length);
      expect(item.keywords.length).toBeGreaterThan(0);
    }
  });

  it('generates visual prompts text-first in batches of at most twelve', async () => {
    const posts = Array.from({ length: 13 }, (_, index) => makePost(index));
    let offset = 0;
    const generate = vi.fn(async (
      _messages: unknown,
      options?: Record<string, any>,
    ) => {
      expect(options?.structuredOutput).toBeUndefined();
      const batch = posts.slice(offset, offset + 12);
      offset += batch.length;
      return {
        object: batch.map((post) => ({
          postId: post.postId,
          prompt: `Campaign visual for ${post.postId}`,
          tool: 'dall-e',
          aspectRatio: '1:1',
        })),
      };
    });
    const agent = { generate } as unknown as Agent;

    const result = await runVisualPrompts(agent, { brief, strategy, research, posts });

    expect(result).toHaveLength(13);
    expect(generate).toHaveBeenCalledTimes(2);
  });
});
