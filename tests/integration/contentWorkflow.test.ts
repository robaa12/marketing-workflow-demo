import type { Agent } from '@mastra/core/agent';
import { describe, expect, it, vi } from 'vitest';
import { buildContentCreationWorkflow, type ContentWorkflowDeps } from '../../src/workflows/content/index.js';
import type { SocialPlatform } from '../../src/schemas/content.js';
import { sampleStrategy } from '../helpers/fixtures.js';

const research = {
  trends: [{ title: 'Reporting automation', summary: 'Teams want faster reporting.' }],
  hashtags: ['#MarketingOps'],
  sources: [{
    title: 'Marketing automation trend report',
    url: 'https://example.com/marketing-automation',
    retrievedAt: '2026-08-02T00:00:00.000Z',
  }],
  contentHooks: [{
    platform: 'linkedin' as const,
    angle: 'Show the hours saved every week.',
    rationale: 'It addresses the audience’s most urgent pain point.',
  }],
  competitorNotes: 'Competitors focus on dashboards rather than time saved.',
  audienceInsights: 'Growth leaders value practical proof and clear outcomes.',
};

const strategy = {
  coreNarrative: 'Turn reporting time into growth time.',
  contentPillars: [
    { name: 'Efficiency', description: 'Save reporting time.' },
    { name: 'Proof', description: 'Show measurable outcomes.' },
    { name: 'Simplicity', description: 'Make complex data accessible.' },
  ],
  tonePerPlatform: {
    x: 'concise',
    instagram: 'visual',
    linkedin: 'practical',
    facebook: 'friendly',
    tiktok: 'energetic',
    youtube_shorts: 'direct',
  },
  rationale: 'The pillars match the campaign’s awareness goal.',
};

const initialPost = {
  postId: 'linkedin-1',
  platform: 'linkedin' as const,
  index: 0,
  caption: 'Your weekly report should take minutes, not hours.',
  cta: 'Book a demo',
  format: 'text',
};

const revisedPost = {
  ...initialPost,
  caption: 'Give your growth team five hours back every week.',
};

function mockAgent(...responses: unknown[]): Agent {
  const generate = vi.fn(async () => responses.shift());
  return { generate } as unknown as Agent;
}

function failingAgent(message: string): Agent {
  const generate = vi.fn(async () => {
    throw new Error(message);
  });
  return { generate } as unknown as Agent;
}

function buildDeps(overrides: Partial<ContentWorkflowDeps> = {}): ContentWorkflowDeps {
  return {
    contentResearcherAgent: mockAgent({ object: research }),
    contentStrategyAgent: mockAgent({ object: strategy }),
    copywriterAgent: mockAgent({ text: 'Draft post' }),
    copywriterStructurerAgent: mockAgent({ object: [initialPost] }),
    visualPromptAgent: mockAgent({
      object: [{
        postId: initialPost.postId,
        prompt: 'A focused growth leader reviewing a concise dashboard.',
        tool: 'dall-e',
        aspectRatio: '1:1',
      }],
    }),
    hashtagSeoAgent: mockAgent({
      object: [{
        postId: initialPost.postId,
        platform: 'linkedin',
        hashtags: ['#MarketingOps'],
        keywords: ['marketing reporting'],
      }],
    }),
    editorQaAgent: mockAgent({
      object: { passed: true, posts: [initialPost], notes: [], feedback: [] },
    }),
    ...overrides,
  };
}

const input = {
  brandName: 'Insight Loop',
  product: 'Automated marketing reporting',
  targetAudience: 'Growth leaders at SaaS companies',
  campaignStrategy: sampleStrategy,
  platforms: ['linkedin'] as SocialPlatform[],
  duration: '1 week',
  postsPerWeek: 1,
};

describe('Content Creation workflow', () => {
  it('builds a dated calendar with injected agent dependencies', async () => {
    const workflow = buildContentCreationWorkflow(buildDeps());
    const result = await (await workflow.createRun()).start({ inputData: input });

    expect(result.status).toBe('success');
    if (result.status !== 'success') return;
    expect(result.result.calendar).toHaveLength(1);
    expect(result.result.claimVerification.unsupportedCount).toBe(0);
    expect(result.result.calendar[0]).toMatchObject({
      platform: 'linkedin',
      caption: initialPost.caption,
      hashtags: ['#MarketingOps'],
      imageUrl: expect.stringMatching(/^simulated:\/\/image-generation\//),
    });
  });

  it('rewrites failed QA output and reruns QA before scheduling', async () => {
    const copywriterAgent = mockAgent({ text: 'Initial draft' }, { text: 'Revised draft' });
    const copywriterStructurerAgent = mockAgent(
      { object: [initialPost] },
      { object: [revisedPost] },
    );
    const editorQaAgent = mockAgent(
      {
        object: {
          passed: false,
          posts: [initialPost],
          notes: [{ postId: initialPost.postId, severity: 'warning', message: 'Use a clearer outcome.', resolved: false }],
          feedback: [{ postId: initialPost.postId, issue: 'Weak benefit', suggestion: 'Lead with time saved.', severity: 'warning' }],
        },
      },
      { object: { passed: true, posts: [revisedPost], notes: [], feedback: [] } },
    );
    const workflow = buildContentCreationWorkflow(buildDeps({
      copywriterAgent,
      copywriterStructurerAgent,
      editorQaAgent,
    }));

    const result = await (await workflow.createRun()).start({ inputData: input });

    expect(result.status).toBe('success');
    if (result.status !== 'success') return;
    expect(result.result.calendar[0]?.caption).toBe(revisedPost.caption);
    expect(vi.mocked(copywriterAgent.generate)).toHaveBeenCalledTimes(2);
    expect(vi.mocked(editorQaAgent.generate)).toHaveBeenCalledTimes(2);
  });

  it('fails the run when content research is unavailable', { timeout: 15_000 }, async () => {
    const workflow = buildContentCreationWorkflow(buildDeps({
      contentResearcherAgent: failingAgent('TAVILY_API_KEY is not set'),
    }));

    const result = await (await workflow.createRun()).start({ inputData: input });

    expect(result.status).toBe('failed');
  });

  it('suspends for optional editorial approval', async () => {
    const workflow = buildContentCreationWorkflow(buildDeps());
    const run = await workflow.createRun();
    const result = await run.start({ inputData: { ...input, requireApproval: true } });

    expect(result.status).toBe('suspended');
  });

  it('stops after three failed QA iterations and schedules the latest rewrite', async () => {
    const failedQa = (post: typeof initialPost) => ({
      object: {
        passed: false,
        posts: [post],
        notes: [],
        feedback: [{ postId: post.postId, issue: 'Weak benefit', suggestion: 'Lead with time saved.', severity: 'warning' as const }],
      },
    });
    const copywriterAgent = mockAgent(
      { text: 'Initial draft' }, { text: 'Rewrite one' }, { text: 'Rewrite two' }, { text: 'Rewrite three' },
    );
    const copywriterStructurerAgent = mockAgent(
      { object: [initialPost] }, { object: [revisedPost] }, { object: [revisedPost] }, { object: [revisedPost] },
    );
    const editorQaAgent = mockAgent(failedQa(initialPost), failedQa(revisedPost), failedQa(revisedPost));
    const workflow = buildContentCreationWorkflow(buildDeps({
      copywriterAgent,
      copywriterStructurerAgent,
      editorQaAgent,
    }));

    const result = await (await workflow.createRun()).start({ inputData: input });

    expect(result.status).toBe('success');
    expect(vi.mocked(editorQaAgent.generate)).toHaveBeenCalledTimes(3);
    expect(vi.mocked(copywriterAgent.generate)).toHaveBeenCalledTimes(4);
  });

  it('derives platform, duration, and post volume from the marketing strategy', async () => {
    const deps = buildDeps();
    const workflow = buildContentCreationWorkflow(deps);
    const { platforms: _platforms, duration: _duration, postsPerWeek: _postsPerWeek, ...derivedInput } = input;

    const result = await (await workflow.createRun()).start({ inputData: derivedInput });

    expect(result.status).toBe('success');
    const copywriterMessages = (
      vi.mocked(deps.copywriterAgent.generate).mock.calls[0]?.[0]
    ) as unknown as Array<{ content?: string }> | undefined;
    const copywriterPrompt = copywriterMessages?.[0];
    expect(copywriterPrompt?.content).toContain('Generate 8 on-brand posts for linkedin');
  });

  it('fails instead of publishing a calendar with unmatched generated artifacts', async () => {
    const workflow = buildContentCreationWorkflow(buildDeps({
      visualPromptAgent: mockAgent({
        object: [{ postId: 'linkedin-missing', prompt: 'Unmatched prompt', tool: 'dall-e', aspectRatio: '1:1' }],
      }),
    }));

    const result = await (await workflow.createRun()).start({ inputData: input });

    expect(result.status).toBe('failed');
  });
});
