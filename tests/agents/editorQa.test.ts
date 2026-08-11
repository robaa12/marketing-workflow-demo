import type { Agent } from '@mastra/core/agent';
import { describe, expect, it, vi } from 'vitest';
import { runQA } from '../../src/agents/content/editor-qa/agent.js';
import type {
  ContentBrief,
  ContentStrategy,
  ResearchOutput,
} from '../../src/schemas/content.js';

const brief: ContentBrief = {
  brandName: 'Insight Loop',
  brandVoice: 'Direct and practical.',
  product: 'Automated reporting',
  campaignGoal: 'Increase qualified demos.',
  targetAudience: 'SaaS growth leaders',
  platforms: ['linkedin'],
  duration: '1 week',
  postsPerWeek: 1,
  maxPosts: 24,
  keyMessages: ['Save reporting time.'],
  constraints: 'AVOID: unsupported claims',
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
  trends: [],
  hashtags: [],
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
  audienceInsights: '',
};

const post = {
  postId: 'linkedin-1',
  platform: 'linkedin' as const,
  index: 0,
  caption: 'Your weekly report should take minutes, not hours.',
  cta: 'Book a demo',
  format: 'text',
};

describe('Editor QA agent', () => {
  it('returns a compact text-first decision and preserves posts locally', async () => {
    const generate = vi.fn(async (
      messages: Array<{ role: string; content: string }>,
      options?: Record<string, any>,
    ) => {
      expect(options?.structuredOutput).toBeUndefined();
      const prompt = messages.find((message) => message.role === 'user')?.content ?? '';
      expect(prompt).toContain('Do not repeat or rewrite the posts');
      expect(prompt).not.toContain('"index":0');
      return { text: '{"passed":true,"notes":[],"feedback":[]}' };
    });
    const agent = { generate } as unknown as Agent;

    const result = await runQA(agent, { brief, strategy, research, posts: [post] });

    expect(result).toEqual({ passed: true, notes: [], feedback: [], posts: [post] });
    expect(generate).toHaveBeenCalledTimes(1);
  });
});
