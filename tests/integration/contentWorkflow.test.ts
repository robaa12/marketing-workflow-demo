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
  const generate = vi.fn(async (
    _messages?: unknown,
    _options?: Record<string, any>,
  ) => responses.shift());
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
    copywriterAgent: mockAgent({ object: [initialPost] }),
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
    imageGenerator: vi.fn(async (imageInput) => ({
      url: 'data:image/png;base64,ZmFrZS1pbWFnZQ==',
      seed: imageInput.seed ?? 42,
      prompt: imageInput.prompt,
      enhancedPrompt: `Gemini image: ${imageInput.prompt}`,
      style: imageInput.style ?? 'cinematic',
      aspectRatio: imageInput.aspectRatio ?? '16:9',
      quality: imageInput.quality ?? 'standard',
      provider: 'vercel-ai-gateway' as const,
      model: 'gemini-test-image',
      mimeType: 'image/png',
      specs: {
        composition: 'Centered subject',
        colorPalette: ['brand purple'],
        lighting: 'Studio light',
        mood: 'Confident',
      },
    })),
    ...overrides,
  };
}

const input = {
  temporalContext: {
    asOfDate: '2026-08-13',
    timeZone: 'Africa/Cairo',
    campaignStartDate: '2026-08-20',
    campaignEndDate: '2026-08-26',
  },
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
      date: '2026-08-20',
      platform: 'linkedin',
      caption: initialPost.caption,
      hashtags: expect.arrayContaining(['#MarketingOps']),
      imageUrl: 'data:image/png;base64,ZmFrZS1pbWFnZQ==',
    });
  });

  it('skips Gemini calls when image generation is disabled', async () => {
    const deps = buildDeps();
    const workflow = buildContentCreationWorkflow(deps);
    const result = await (await workflow.createRun()).start({
      inputData: { ...input, generateImages: false },
    });

    expect(result.status).toBe('success');
    expect(deps.imageGenerator).not.toHaveBeenCalled();
    if (result.status === 'success') {
      expect(result.result.calendar[0]?.imageUrl).toBeUndefined();
      expect(result.result.calendar[0]?.visualPrompt).toContain(initialPost.caption);
    }
  });

  it('keeps posts when image generation fails', async () => {
    const deps = buildDeps({
      imageGenerator: vi.fn(async () => {
        throw new Error('Image provider unavailable');
      }),
    });
    const workflow = buildContentCreationWorkflow(deps);

    const result = await (await workflow.createRun()).start({ inputData: input });

    expect(result.status).toBe('success');
    expect(deps.imageGenerator).toHaveBeenCalledTimes(1);
    if (result.status !== 'success') return;
    expect(result.result.calendar).toHaveLength(1);
    expect(result.result.calendar[0]).toMatchObject({
      caption: initialPost.caption,
      imageError: expect.stringContaining('post copy is ready'),
    });
    expect(result.result.calendar[0]?.imageUrl).toBeUndefined();
    expect(result.result.notes).toContainEqual(expect.objectContaining({
      postId: initialPost.postId,
      severity: 'warning',
      resolved: false,
    }));
  });

  it('retrieves project-scoped knowledge and carries it into content research', async () => {
    const knowledgeRetriever = vi.fn(async () => ({
      status: 'success' as const,
      retrievedAt: '2026-08-13T00:00:00.000Z',
      sourceIds: ['source-1'],
      sourceSnapshots: [],
      citations: [{
        sourceId: 'source-1',
        sourceType: 'document',
        title: 'Approved positioning',
        url: 'https://example.com/positioning',
        excerpt: 'Insight Loop gives growth teams reliable reporting without manual spreadsheet work.',
        score: 0.91,
      }],
    }));
    const deps = buildDeps({ knowledgeRetriever });
    const workflow = buildContentCreationWorkflow(deps);

    const result = await (await workflow.createRun()).start({
      inputData: {
        ...input,
        knowledgeScope: { projectId: 'project-1', sourceIds: ['source-1'] },
      },
    });

    expect(result.status).toBe('success');
    expect(knowledgeRetriever).toHaveBeenCalledWith(
      { projectId: 'project-1', sourceIds: ['source-1'] },
      expect.stringContaining('Insight Loop'),
    );
    const researcherMessages = vi.mocked(deps.contentResearcherAgent.generate)
      .mock.calls[0]?.[0] as Array<{ content?: string }> | undefined;
    expect(researcherMessages?.[0]?.content).toContain('Approved positioning');
    expect(researcherMessages?.[0]?.content).toContain('manual spreadsheet work');
    if (result.status === 'success') {
      expect(result.result.knowledgeProvenance).toMatchObject({
        status: 'success',
        sourceIds: ['source-1'],
      });
    }
  });

  it('rewrites failed QA output once before scheduling', async () => {
    const copywriterAgent = mockAgent({ object: [initialPost] }, { object: [revisedPost] });
    const copywriterStructurerAgent = mockAgent(
      { object: [initialPost] },
      { object: [revisedPost] },
    );
    const editorQaAgent = mockAgent({
      object: {
        passed: false,
        posts: [initialPost],
        notes: [{ postId: initialPost.postId, severity: 'warning', message: 'Use a clearer outcome.', resolved: false }],
        feedback: [{ postId: initialPost.postId, issue: 'Weak benefit', suggestion: 'Lead with time saved.', severity: 'warning' }],
      },
    });
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
    const copywriterCalls = vi.mocked(copywriterAgent.generate).mock.calls as unknown as Array<
      [unknown, Record<string, any>?]
    >;
    for (const call of copywriterCalls) {
      expect(call[1]?.structuredOutput).toBeUndefined();
    }
    expect(vi.mocked(editorQaAgent.generate)).toHaveBeenCalledTimes(1);
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

  it('bounds failed QA to one review and one rewrite', async () => {
    const failedQa = (post: typeof initialPost) => ({
      object: {
        passed: false,
        posts: [post],
        notes: [],
        feedback: [{ postId: post.postId, issue: 'Weak benefit', suggestion: 'Lead with time saved.', severity: 'warning' as const }],
      },
    });
    const copywriterAgent = mockAgent(
      { object: [initialPost] }, { object: [revisedPost] },
    );
    const copywriterStructurerAgent = mockAgent(
      { object: [initialPost] }, { object: [revisedPost] }, { object: [revisedPost] }, { object: [revisedPost] },
    );
    const editorQaAgent = mockAgent(failedQa(initialPost));
    const workflow = buildContentCreationWorkflow(buildDeps({
      copywriterAgent,
      copywriterStructurerAgent,
      editorQaAgent,
    }));

    const result = await (await workflow.createRun()).start({ inputData: input });

    expect(result.status).toBe('success');
    expect(vi.mocked(editorQaAgent.generate)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(copywriterAgent.generate)).toHaveBeenCalledTimes(2);
  });

  it('rewrites posts when QA reports a campaign-level strategy issue', async () => {
    const copywriterAgent = mockAgent(
      { object: [initialPost] },
      { object: [revisedPost] },
    );
    const editorQaAgent = mockAgent({
      object: {
        passed: false,
        notes: [],
        feedback: [{
          postId: 'strategy',
          issue: 'The efficiency pillar is missing.',
          suggestion: 'Rewrite the set to lead with time saved.',
          severity: 'warning',
        }],
      },
    });
    const workflow = buildContentCreationWorkflow(buildDeps({
      copywriterAgent,
      editorQaAgent,
    }));

    const result = await (await workflow.createRun()).start({ inputData: input });

    expect(result.status).toBe('success');
    if (result.status !== 'success') return;
    expect(result.result.calendar[0]?.caption).toBe(revisedPost.caption);
    expect(vi.mocked(copywriterAgent.generate)).toHaveBeenCalledTimes(2);
  });

  it('rejects an unsafe QA rewrite before scheduling', async () => {
    const unsafePost = {
      ...revisedPost,
      caption: 'x'.repeat(3_001),
    };
    const copywriterAgent = mockAgent(
      { object: [initialPost] },
      { object: [unsafePost] },
    );
    const editorQaAgent = mockAgent({
      object: {
        passed: false,
        notes: [],
        feedback: [{
          postId: initialPost.postId,
          issue: 'Weak benefit',
          suggestion: 'Lead with time saved.',
          severity: 'warning',
        }],
      },
    });
    const workflow = buildContentCreationWorkflow(buildDeps({
      copywriterAgent,
      editorQaAgent,
    }));

    const result = await (await workflow.createRun()).start({ inputData: input });

    expect(result.status).toBe('failed');
  });

  it('rejects campaigns over maxPosts before copy generation', async () => {
    const copywriterAgent = mockAgent({ object: [initialPost] });
    const workflow = buildContentCreationWorkflow(buildDeps({ copywriterAgent }));

    const result = await (await workflow.createRun()).start({
      inputData: {
        ...input,
        platforms: ['linkedin', 'facebook'],
        maxPosts: 1,
      },
    });

    expect(result.status).toBe('failed');
    expect(vi.mocked(copywriterAgent.generate)).not.toHaveBeenCalled();
  });

  it('derives platform, duration, and post volume from the marketing strategy', async () => {
    const posts = Array.from({ length: 8 }, (_, index) => ({
      ...initialPost,
      postId: `linkedin-${index + 1}`,
      index,
    }));
    const deps = buildDeps({
      copywriterAgent: mockAgent(
        { object: posts },
      ),
      visualPromptAgent: mockAgent({
        object: posts.map((post) => ({
          postId: post.postId,
          prompt: `Visual for ${post.postId}`,
          tool: 'dall-e',
          aspectRatio: '1:1',
        })),
      }),
      hashtagSeoAgent: mockAgent({
        object: posts.map((post) => ({
          postId: post.postId,
          platform: 'linkedin',
          hashtags: ['#MarketingOps'],
          keywords: ['marketing reporting'],
        })),
      }),
      editorQaAgent: mockAgent({
        object: { passed: true, posts, notes: [], feedback: [] },
      }),
    });
    const workflow = buildContentCreationWorkflow(deps);
    const { platforms: _platforms, duration: _duration, postsPerWeek: _postsPerWeek, ...derivedInput } = input;

    const result = await (await workflow.createRun()).start({ inputData: derivedInput });

    expect(result.status).toBe('success');
    const copywriterMessages = (
      vi.mocked(deps.copywriterAgent.generate).mock.calls[0]?.[0]
    ) as unknown as Array<{ content?: string }> | undefined;
    const copywriterPrompt = copywriterMessages?.find((message) =>
      message.content?.includes('Generate 8 on-brand posts for linkedin'),
    );
    expect(copywriterPrompt?.content).toContain('Generate 8 on-brand posts for linkedin');
    expect(vi.mocked(deps.copywriterAgent.generate)).toHaveBeenCalledTimes(1);
  });

  it('keeps only one platform copywriter request in flight', async () => {
    const facebookPost = {
      ...initialPost,
      postId: 'facebook-1',
      platform: 'facebook' as const,
      caption: 'Reporting should leave more time for customer conversations.',
    };
    const posts = [initialPost, facebookPost];
    let activeRequests = 0;
    let maxActiveRequests = 0;
    const copywriterAgent = {
      generate: vi.fn(async (messages: Array<{ content?: string }>) => {
        activeRequests += 1;
        maxActiveRequests = Math.max(maxActiveRequests, activeRequests);
        await new Promise((resolve) => setTimeout(resolve, 5));
        const prompt = messages.map((message) => message.content ?? '').join('\n');
        activeRequests -= 1;
        return { object: [prompt.includes('for facebook') ? facebookPost : initialPost] };
      }),
    } as unknown as Agent;
    const workflow = buildContentCreationWorkflow(buildDeps({
      copywriterAgent,
      visualPromptAgent: mockAgent({
        object: posts.map((post) => ({
          postId: post.postId,
          prompt: `Visual for ${post.postId}`,
          tool: 'dall-e',
          aspectRatio: '1:1',
        })),
      }),
      hashtagSeoAgent: mockAgent({
        object: posts.map((post) => ({
          postId: post.postId,
          platform: post.platform,
          hashtags: ['#MarketingOps'],
          keywords: ['marketing reporting'],
        })),
      }),
      editorQaAgent: mockAgent({
        object: { passed: true, posts, notes: [], feedback: [] },
      }),
    }));

    const result = await (await workflow.createRun()).start({
      inputData: { ...input, platforms: ['linkedin', 'facebook'] },
    });

    expect(result.status).toBe('success');
    expect(maxActiveRequests).toBe(1);
    expect(vi.mocked(copywriterAgent.generate)).toHaveBeenCalledTimes(2);
  });

  it('keeps visual artifacts matched without trusting another model response', async () => {
    const visualPromptAgent = mockAgent({
        object: [{ postId: 'linkedin-missing', prompt: 'Unmatched prompt', tool: 'dall-e', aspectRatio: '1:1' }],
      });
    const workflow = buildContentCreationWorkflow(buildDeps({ visualPromptAgent }));

    const result = await (await workflow.createRun()).start({ inputData: input });

    expect(result.status).toBe('success');
    expect(visualPromptAgent.generate).not.toHaveBeenCalled();
    if (result.status === 'success') {
      expect(result.result.calendar[0]?.visualPrompt).toContain('for linkedin-1 unique');
    }
  });
});
