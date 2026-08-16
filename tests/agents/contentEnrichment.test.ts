import type { Agent } from '@mastra/core/agent';
import { describe, expect, it, vi } from 'vitest';
import { runHashtags } from '../../src/agents/content/hashtag-seo/agent.js';
import { runVisualPrompts } from '../../src/agents/content/visual-prompt/agent.js';
import { ImageGenerationInputSchema } from '../../src/lib/image-generation.js';
import type {
  ContentBrief,
  ContentStrategy,
  Post,
  ResearchOutput,
} from '../../src/schemas/content.js';

const brief: ContentBrief = {
  temporalContext: { asOfDate: '2026-08-13', timeZone: 'Africa/Cairo', campaignStartDate: '2026-08-13', campaignEndDate: null },
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
  knowledge: [],
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

  it('builds Gemini-ready visual prompts without another model request', async () => {
    const posts = Array.from({ length: 13 }, (_, index) => makePost(index));
    const generate = vi.fn(async () => {
      throw new Error('the visual prompt model should not run');
    });
    const agent = { generate } as unknown as Agent;

    const result = await runVisualPrompts(agent, { brief, strategy, research, posts });

    expect(result).toHaveLength(13);
    expect(generate).not.toHaveBeenCalled();
    expect(result[0]).toMatchObject({
      postId: 'linkedin-1',
      tool: 'gemini',
      aspectRatio: '16:9',
    });
    expect(result[0]?.prompt).toContain(brief.brandName);
    expect(result[0]?.prompt).toContain(posts[0]?.caption);
    expect(new Set(result.map((visual) => visual.prompt)).size).toBe(posts.length);
  });

  it('uses vertical Gemini images for short-form video platforms', async () => {
    const agent = { generate: vi.fn() } as unknown as Agent;
    const posts = [
      makePost(0, 'youtube_shorts'),
      makePost(1, 'tiktok'),
    ];

    const result = await runVisualPrompts(agent, { brief, strategy, research, posts });

    expect(result.map((visual) => visual.aspectRatio)).toEqual(['9:16', '9:16']);
  });

  it('bounds long source content to the Gemini image prompt contract', async () => {
    const agent = { generate: vi.fn() } as unknown as Agent;
    const longPost = {
      ...makePost(0),
      caption: 'A detailed campaign message with supporting context. '.repeat(100),
      cta: 'Book a tailored demonstration for your entire growth organization. '.repeat(20),
    };

    const [visual] = await runVisualPrompts(agent, {
      brief: {
        ...brief,
        product: 'A comprehensive marketing intelligence and reporting platform. '.repeat(30),
        targetAudience: 'Growth leaders at international SaaS organizations. '.repeat(30),
      },
      strategy,
      research,
      posts: [longPost],
    });

    expect(visual?.prompt.length).toBeLessThanOrEqual(1_000);
    expect(visual?.prompt).toContain('Message: A detailed campaign message');
    expect(visual?.prompt).toContain('Do not render logos, watermarks');
    expect(() => ImageGenerationInputSchema.parse({
      prompt: visual?.prompt,
      aspectRatio: visual?.aspectRatio,
    })).not.toThrow();
  });
});
