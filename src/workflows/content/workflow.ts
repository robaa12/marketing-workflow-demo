import type { Agent } from '@mastra/core/agent';
import { createStep, createWorkflow } from '@mastra/core/workflows';
import { z } from 'zod';
import {
  ContentBriefSchema,
  ContentBundleSchema,
  ContentStrategySchema,
  CampaignContentDraftOutputSchema,
  CampaignContentOutputSchema,
  ResearchOutputSchema,
  QAReviewResultSchema,
  SocialPlatformEnum,
  type ContentBrief,
  type ContentStrategy,
  type ResearchOutput,
  type SocialPlatform,
  type Post,
  type VisualPromptItem,
  type HashtagItem,
} from '../../schemas/content.js';
import { CampaignStrategySchema, type CampaignStrategy } from '../../schemas/campaign.js';
import type { MarketingChannel } from '../../schemas/common.js';
import {
  runContentResearch,
  runContentStrategy,
  runCopywriting,
  runCopywriterRewrite,
  runVisualPrompts,
  runHashtags,
  runQA,
} from '../../agents/content/index.js';
import { buildCalendar, parseDuration } from '../../tools/content-calendar.tool.js';
import {
  ContentPreflightError,
  runContentPreflight,
} from '../../lib/content-preflight.js';
import { auditCampaignClaimsForBrand } from '../../lib/claim-audit.js';
import { resolveBrandContext } from '../../tools/brand-context.tool.js';
import { generateImageAsset, resolveImageAspectRatio } from '../../lib/image-generation.js';
import { resolveTemporalContext } from '../../lib/temporal-context.js';
import { TemporalContextSchema } from '../../schemas/temporal.js';
import { KnowledgeCitationSchema, KnowledgeScopeSchema } from '../../schemas/projectKnowledge.js';
import {
  retrieveProjectKnowledge,
  type ProjectKnowledgeRetriever,
} from '../../lib/project-knowledge.js';

// ── Channel → Platform mapping ────────────────────────────────────────────

/**
 * Maps marketing channels to social platforms.
 * Note: 'meta' maps to 'instagram' by default (more content-friendly).
 * Use 'facebook' explicitly if needed.
 */
const CHANNEL_TO_PLATFORM: Record<MarketingChannel, SocialPlatform | null> = {
  x: 'x',
  linkedin: 'linkedin',
  tiktok: 'tiktok',
  youtube: 'youtube_shorts',
  meta: 'instagram', // Meta covers both FB and IG; default to IG for content
  google: null,
  reddit: null,
  email: null,
  seo: null,
  content: null,
  community: null,
  events: null,
  pr: null,
  partnerships: null,
  referral: null,
  podcast: null,
  sms: null,
  offline: null,
  other: null,
};

function derivePlatformsFromStrategy(strategy: CampaignStrategy): SocialPlatform[] {
  const platforms = new Set<SocialPlatform>();

  // Collect channels from campaign recommendations
  for (const campaign of strategy.campaignRecommendations) {
    for (const channel of campaign.channels) {
      const platform = CHANNEL_TO_PLATFORM[channel];
      if (platform) platforms.add(platform);
    }
  }

  // Also check primary channels
  for (const allocation of strategy.primaryChannels) {
    const platform = CHANNEL_TO_PLATFORM[allocation.channel];
    if (platform) platforms.add(platform);
  }

  // Default to x and instagram if no social platforms found
  if (platforms.size === 0) {
    return ['x', 'instagram'];
  }

  return Array.from(platforms);
}

function deriveDurationFromStrategy(strategy: CampaignStrategy): string {
  const campaign = strategy.campaignRecommendations[0];
  if (campaign?.duration && campaign.duration.length >= 3) {
    return campaign.duration;
  }
  return '2 weeks';
}

function derivePostsPerWeekFromStrategy(strategy: CampaignStrategy): number {
  const campaign = strategy.campaignRecommendations[0];
  if (!campaign) return 3;
  // More content mix items = more posts per week
  const contentMixCount = campaign.contentMix.length;
  return Math.min(Math.max(contentMixCount, 2), 5);
}

// ── Input schema: CampaignStrategy from the marketing workflow ────────────

const ContentCreationInputSchema = z.object({
  temporalContext: TemporalContextSchema.optional(),
  knowledgeScope: KnowledgeScopeSchema.optional()
    .describe('Server-derived project sources that may be retrieved during this run.'),
  brandName: z.string().min(1),
  product: z.string().min(1),
  targetAudience: z.string().min(1),
  campaignStrategy: CampaignStrategySchema,
  platforms: z.array(SocialPlatformEnum).min(1).optional()
    .describe('Social platforms to create content for. If omitted, derived from strategy channels.'),
  duration: z.string().min(1).optional()
    .describe('Campaign duration (e.g. "2 weeks"). If omitted, derived from strategy.'),
  postsPerWeek: z.number().int().positive().optional()
    .describe('Posts per week. If omitted, derived from strategy content mix.'),
  maxPosts: z.number().int().positive().max(60).optional()
    .describe('Safety limit for the total generated posts in one run.'),
  requireApproval: z.boolean().optional()
    .describe('Suspend after QA until a reviewer explicitly approves the content.'),
});
type ContentCreationInput = z.infer<typeof ContentCreationInputSchema>;

const ContentWorkflowStateSchema = z.object({
  runId: z.string().optional(),
  sourceCount: z.number().int().nonnegative().optional(),
  qaIterations: z.number().int().nonnegative().optional(),
  preflightWarnings: z.number().int().nonnegative().optional(),
});

const QAReviewInputSchema = ContentBundleSchema.extend({
  qaPassed: z.boolean().optional(),
  qaIteration: z.number().int().positive().default(1),
});

const QAReviewOutputSchema = ContentBundleSchema.extend({
  qaPassed: z.boolean(),
  qaIteration: z.number().int().positive(),
});

/**
 * Content agents are dependencies so callers can select models and tests can
 * run the full workflow with deterministic agent fakes.
 */
export interface ContentWorkflowDeps {
  contentResearcherAgent: Agent;
  contentStrategyAgent: Agent;
  copywriterAgent: Agent;
  copywriterStructurerAgent: Agent;
  visualPromptAgent: Agent;
  hashtagSeoAgent: Agent;
  editorQaAgent: Agent;
  knowledgeRetriever?: ProjectKnowledgeRetriever;
}

// ── Step 1: Build content brief from strategy ─────────────────────────────

const buildBriefStep = createStep({
  id: 'build-brief',
  description: 'Converts the marketing CampaignStrategy into a ContentBrief for the content pipeline.',
  inputSchema: ContentCreationInputSchema,
  outputSchema: z.object({
    brief: ContentBriefSchema,
    knowledgeScope: KnowledgeScopeSchema.optional(),
  }),
  stateSchema: ContentWorkflowStateSchema,
  execute: async ({ inputData, runId, state, setState }) => {
    const strategy = inputData.campaignStrategy;
    const campaign = strategy.campaignRecommendations[0];
    const keyMessages = strategy.creativeDirection.keyMessages;
    const constraints = [
      ...strategy.creativeDirection.dontList.map((d) => `AVOID: ${d}`),
    ].join('; ');

    // Derive platforms, duration, postsPerWeek from strategy if not provided
    const platforms = inputData.platforms ?? derivePlatformsFromStrategy(strategy);
    const duration = inputData.duration ?? deriveDurationFromStrategy(strategy);
    const postsPerWeek = inputData.postsPerWeek ?? derivePostsPerWeekFromStrategy(strategy);

    const brief: ContentBrief = {
      temporalContext: resolveTemporalContext(inputData.temporalContext),
      brandName: inputData.brandName,
      brandVoice: strategy.creativeDirection.storytellingApproach,
      product: inputData.product,
      campaignGoal: campaign?.objective ?? 'Increase brand awareness',
      targetAudience: inputData.targetAudience,
      platforms: platforms as [SocialPlatform, ...SocialPlatform[]],
      duration,
      postsPerWeek,
      maxPosts: inputData.maxPosts ?? 24,
      keyMessages,
      constraints,
    };

    await setState({
      ...state,
      runId,
      sourceCount: 0,
      qaIterations: 0,
      preflightWarnings: 0,
    });
    return { brief, knowledgeScope: inputData.knowledgeScope };
  },
});

function contentQuery(brief: ContentBrief): string {
  return [
    `Brand: ${brief.brandName}`,
    `Product: ${brief.product}`,
    `Audience: ${brief.targetAudience}`,
    `Campaign goal: ${brief.campaignGoal}`,
    `Key messages: ${brief.keyMessages.slice(0, 5).join('; ')}`,
    'Retrieve approved brand facts, product claims, voice guidance, audience insights, and constraints that should ground this content campaign.',
  ].join('\n');
}

function buildProjectKnowledgeStep(retrieve: ProjectKnowledgeRetriever) {
  return createStep({
    id: 'project-knowledge',
    description: 'Retrieves relevant approved project knowledge to ground content generation.',
    inputSchema: z.object({
      brief: ContentBriefSchema,
      knowledgeScope: KnowledgeScopeSchema.optional(),
    }),
    outputSchema: z.object({
      brief: ContentBriefSchema,
      knowledge: z.array(KnowledgeCitationSchema),
    }),
    execute: async ({ inputData }) => ({
      brief: inputData.brief,
      knowledge: await retrieve(inputData.knowledgeScope, contentQuery(inputData.brief)),
    }),
  });
}

// ── Step 2: Research ──────────────────────────────────────────────────────

function buildResearchStep(researchAgent: Agent) {
  return createStep({
  id: 'content-research',
  description: 'Researches trends, hashtags, and audience context for content creation.',
  inputSchema: z.object({
    brief: ContentBriefSchema,
    knowledge: z.array(KnowledgeCitationSchema),
  }),
  outputSchema: z.object({
    brief: ContentBriefSchema,
    research: ResearchOutputSchema,
  }),
  retries: 0,
  stateSchema: ContentWorkflowStateSchema,
  execute: async ({ inputData, state, setState, tracingContext }) => {
    const { brief, knowledge } = inputData;
    const research = await runContentResearch(
      researchAgent,
      { brief, knowledge },
      tracingContext,
    );
    await setState({ ...state, sourceCount: research.sources.length });
    return { brief, research };
  },
  });
}

// ── Step 3: Content strategy ──────────────────────────────────────────────

function buildStrategyStep(strategyAgent: Agent) {
  return createStep({
  id: 'content-strategy',
  description: 'Generates content strategy from brief + research.',
  inputSchema: z.object({
    brief: ContentBriefSchema,
    research: ResearchOutputSchema,
  }),
  outputSchema: z.object({
    brief: ContentBriefSchema,
    research: ResearchOutputSchema,
    strategy: ContentStrategySchema,
  }),
  retries: 0,
  execute: async ({ inputData, tracingContext }) => {
    const { brief, research } = inputData;
    const strategy = await runContentStrategy(
      strategyAgent,
      { brief, research },
      tracingContext,
    );
    return { brief, research, strategy };
  },
  });
}

// ── Step 4: Generate content (posts) ──────────────────────────────────────

function buildGenerateContentStep(
  copywriterAgent: Agent,
  copywriterStructurerAgent: Agent,
) {
  return createStep({
  id: 'generate-content',
  description: 'Copywriter Agent — on-brand posts per platform.',
  inputSchema: z.object({
    brief: ContentBriefSchema,
    research: ResearchOutputSchema,
    strategy: ContentStrategySchema,
  }),
  outputSchema: ContentBundleSchema,
  retries: 0,
  execute: async ({ inputData, tracingContext }) => {
    const { brief, research, strategy } = inputData;
    const { weeks } = parseDuration(brief.duration);
    const postCount = Math.max(1, brief.postsPerWeek) * weeks;

    const platforms = brief.platforms as SocialPlatform[];
    const requestedPostCount = postCount * platforms.length;
    if (requestedPostCount > brief.maxPosts) {
      throw new ContentPreflightError([
        `requested ${requestedPostCount} posts; limit is ${brief.maxPosts}`,
      ]);
    }
    // The configured provider queues concurrent reasoning requests. Running
    // platforms together caused one copywriter call to finish while the other
    // stayed pending until its deadline. Keep one provider request in flight;
    // runCopywriting also processes each platform's bounded batches in order.
    const results = [];
    for (const platform of platforms) {
      results.push(await runCopywriting(
        copywriterAgent,
        { brief, research, strategy, platform, postCount },
        copywriterStructurerAgent,
        tracingContext,
      ));
    }
    const posts = results.flat();
    posts.sort((a, b) => (a.postId < b.postId ? -1 : 1));
    return {
      posts,
      visuals: [],
      hashtags: [],
      qaNotes: [],
    };
  },
  });
}

const preflightStep = createStep({
  id: 'content-preflight',
  description: 'Runs deterministic platform, policy, and claim-safety checks before model QA.',
  inputSchema: ContentBundleSchema,
  outputSchema: ContentBundleSchema,
  stateSchema: ContentWorkflowStateSchema,
  execute: async ({ inputData, getStepResult, state, setState }) => {
    const briefResult = getStepResult<{ brief: ContentBrief }>('build-brief');
    if (!briefResult?.brief) throw new Error('brief missing');
    const notes = runContentPreflight(briefResult.brief, inputData.posts);
    await setState({ ...state, preflightWarnings: notes.length });
    return { ...inputData, qaNotes: [...inputData.qaNotes, ...notes] };
  },
});

// ── Step 5: Generate visual prompts ───────────────────────────────────────

function buildGenerateVisualsStep(visualAgent: Agent) {
  return createStep({
  id: 'generate-visuals',
  description: 'Visual Prompt Agent — image/video prompts per generated post.',
  inputSchema: ContentBundleSchema,
  outputSchema: ContentBundleSchema,
  retries: 0,
  execute: async ({ inputData, getStepResult, tracingContext }) => {
    const briefResult = getStepResult<{ brief: ContentBrief }>('build-brief');
    const strategyResult = getStepResult<{ strategy: ContentStrategy }>('content-strategy');
    const researchResult = getStepResult<{ research: ResearchOutput }>('content-research');
    if (!briefResult?.brief) throw new Error('brief missing');
    if (!strategyResult?.strategy) throw new Error('strategy missing');
    if (!researchResult?.research) throw new Error('research missing');

    const visualPrompts = await runVisualPrompts(visualAgent, {
      brief: briefResult.brief,
      strategy: strategyResult.strategy,
      research: researchResult.research,
      posts: inputData.posts,
    }, tracingContext);
    const visuals = await Promise.all(visualPrompts.map(async (visual) => {
      const image = await generateImageAsset({
        prompt: visual.prompt,
        aspectRatio: resolveImageAspectRatio(visual.aspectRatio),
      });
      return {
        ...visual,
        prompt: image.enhancedPrompt,
        tool: 'image-generation-agent',
        aspectRatio: image.aspectRatio,
        imageUrl: image.url,
      };
    }));
    return { ...inputData, visuals };
  },
  });
}

// ── Step 6a: Generate hashtags ────────────────────────────────────────────

function buildGenerateHashtagsStep(hashtagAgent: Agent) {
  return createStep({
  id: 'generate-hashtags',
  description: 'Builds ranked hashtags and keywords deterministically from researched signals.',
  inputSchema: ContentBundleSchema,
  outputSchema: ContentBundleSchema,
  retries: 0,
  execute: async ({ inputData, getStepResult }) => {
    const briefResult = getStepResult<{ brief: ContentBrief }>('build-brief');
    const researchResult = getStepResult<{ research: ResearchOutput }>('content-research');
    if (!briefResult?.brief) throw new Error('brief missing');
    if (!researchResult?.research) throw new Error('research missing');

    const hashtags = await runHashtags(hashtagAgent, {
      brief: briefResult.brief,
      research: researchResult.research,
      posts: inputData.posts,
    });
    return { ...inputData, hashtags };
  },
  });
}

// ── Parallel output schema ────────────────────────────────────────────────

const parallelOutputSchema = z.object({
  'generate-visuals': ContentBundleSchema,
  'generate-hashtags': ContentBundleSchema,
});

// ── Step 7: Bounded QA review + rewrite ──────────────────────────────────

/**
 * Runs one QA pass and, if it fails, one targeted copywriter rewrite. The
 * deterministic preflight step already handles rules that do not need a model.
 */
function buildQaReviewStep(
  editorAgent: Agent,
  copywriterAgent: Agent,
  copywriterStructurerAgent: Agent,
) {
  return createStep({
  id: 'qa-review',
  description: 'One bounded QA review with a targeted copywriter rewrite when needed.',
  inputSchema: QAReviewInputSchema,
  outputSchema: QAReviewOutputSchema,
  retries: 0,
  stateSchema: ContentWorkflowStateSchema,
  execute: async ({ inputData, getStepResult, state, setState, tracingContext }) => {
    const briefResult = getStepResult<{ brief: ContentBrief }>('build-brief');
    const strategyResult = getStepResult<{ strategy: ContentStrategy }>('content-strategy');
    const researchResult = getStepResult<{ research: ResearchOutput }>('content-research');
    if (!briefResult?.brief) throw new Error('brief missing');
    if (!strategyResult?.strategy) throw new Error('strategy missing');
    if (!researchResult?.research) throw new Error('research missing');

    const { brief, strategy } = { brief: briefResult.brief, strategy: strategyResult.strategy };
    // Run QA
    const qaResult = await runQA(editorAgent, {
      brief,
      strategy,
      research: researchResult.research,
      posts: inputData.posts,
      iteration: inputData.qaIteration,
    }, tracingContext);

    // If QA passed, we're done
    if (qaResult.passed) {
      await setState({ ...state, qaIterations: inputData.qaIteration });
      return {
        ...inputData,
        posts: qaResult.posts,
        qaNotes: [...inputData.qaNotes, ...qaResult.notes],
        qaPassed: true,
        qaIteration: inputData.qaIteration,
      };
    }

    // QA failed — rewrite posts with feedback
    const rewrittenPosts = await runCopywriterRewrite(copywriterAgent, {
      brief,
      strategy,
      posts: inputData.posts,
      feedback: qaResult.feedback,
    }, copywriterStructurerAgent, tracingContext);
    const rewritePreflightNotes = runContentPreflight(brief, rewrittenPosts);

    await setState({ ...state, qaIterations: inputData.qaIteration });

    return {
      ...inputData,
      posts: rewrittenPosts,
      qaNotes: [
        ...inputData.qaNotes,
        ...qaResult.notes,
        ...rewritePreflightNotes,
      ],
      qaPassed: false,
      qaIteration: inputData.qaIteration + 1,
    };
  },
  });
}

// ── Step 8: Build calendar ────────────────────────────────────────────────

const scheduleStep = createStep({
  id: 'schedule',
  description: 'Assembles the final dated campaign calendar.',
  inputSchema: z.object({
    'generate-visuals': ContentBundleSchema,
    'generate-hashtags': ContentBundleSchema,
  }),
  outputSchema: CampaignContentDraftOutputSchema,
  execute: async ({ inputData, getStepResult }) => {
    const briefResult = getStepResult<{ brief: ContentBrief }>('build-brief');
    const strategyResult = getStepResult<{ strategy: ContentStrategy }>('content-strategy');
    const researchResult = getStepResult<{ research: ResearchOutput }>('content-research');
    if (!briefResult?.brief) throw new Error('brief missing');
    if (!strategyResult?.strategy) throw new Error('strategy missing');
    if (!researchResult?.research) throw new Error('research missing');

    const brief = briefResult.brief;
    const strategy = strategyResult.strategy;

    // Merge parallel outputs
    const posts = inputData['generate-visuals'].posts;
    const visuals = inputData['generate-visuals'].visuals;
    const hashtags = inputData['generate-hashtags'].hashtags;
    const qaNotes = inputData['generate-visuals'].qaNotes;

    const { schedule } = buildCalendar({
      posts,
      platforms: brief.platforms as SocialPlatform[],
      duration: brief.duration,
      postsPerWeek: brief.postsPerWeek,
      startDate: brief.temporalContext.campaignStartDate,
      endDate: brief.temporalContext.campaignEndDate ?? undefined,
    });

    const byPostId = new Map(posts.map((p) => [p.postId, p]));
    const visualsByPostId = new Map(visuals.map((v) => [v.postId, v]));
    const hashtagsByPostId = new Map(hashtags.map((h) => [h.postId, h]));

    const calendar = schedule.map((slot) => {
      const post = byPostId.get(slot.postId);
      const vis = visualsByPostId.get(slot.postId);
      const hash = hashtagsByPostId.get(slot.postId);
      if (!post) throw new Error(`missing post for id ${slot.postId}`);
      if (!vis) throw new Error(`missing visual prompt for post id ${slot.postId}`);
      if (!hash) throw new Error(`missing hashtags for post id ${slot.postId}`);
      return {
        date: slot.date,
        platform: slot.platform,
        caption: post.caption,
        hashtags: hash.hashtags,
        visualPrompt: vis.prompt,
        imageUrl: vis.imageUrl,
        cta: post.cta,
      };
    });

    return {
      temporalContext: brief.temporalContext,
      strategy,
      calendar,
      notes: qaNotes,
      sources: researchResult.research.sources,
    };
  },
});

const claimAuditStep = createStep({
  id: 'claim-audit',
  description: 'Adds a deterministic traceability audit for publishable marketing claims.',
  inputSchema: CampaignContentDraftOutputSchema,
  outputSchema: CampaignContentOutputSchema,
  execute: async ({ inputData, getStepResult }) => {
    const briefResult = getStepResult<{ brief: ContentBrief }>('build-brief');
    if (!briefResult?.brief) throw new Error('brief missing');
    const profile = resolveBrandContext(briefResult.brief.brandName);
    return {
      ...inputData,
      claimVerification: auditCampaignClaimsForBrand(inputData, profile?.approvedClaims ?? []),
    };
  },
});

const approvalStep = createStep({
  id: 'content-approval',
  description: 'Optionally suspends after QA until a reviewer approves the campaign content.',
  inputSchema: ContentBundleSchema,
  outputSchema: ContentBundleSchema,
  resumeSchema: z.object({
    approved: z.boolean(),
    feedback: z.string().max(2_000).optional(),
  }),
  suspendSchema: z.object({
    reason: z.string(),
    postCount: z.number().int().nonnegative(),
    qaNoteCount: z.number().int().nonnegative(),
  }),
  execute: async ({ inputData, getInitData, resumeData, suspend }) => {
    const initialInput = getInitData<ContentCreationInput>();
    if (!initialInput.requireApproval) return inputData;
    if (!resumeData) {
      await suspend({
        reason: 'Content is ready for editorial approval.',
        postCount: inputData.posts.length,
        qaNoteCount: inputData.qaNotes.length,
      }, { resumeLabel: 'approve-content' });
      return inputData;
    }
    if (!resumeData.approved) throw new Error('Content approval was rejected. Update the brief and start a new run.');
    if (!resumeData.feedback) return inputData;
    return {
      ...inputData,
      qaNotes: [...inputData.qaNotes, {
        severity: 'info' as const,
        message: `Reviewer feedback: ${resumeData.feedback}`,
        resolved: true,
      }],
    };
  },
});

// ── Workflow ──────────────────────────────────────────────────────────────

export function buildContentCreationWorkflow(deps: ContentWorkflowDeps) {
  const researchStep = buildResearchStep(deps.contentResearcherAgent);
  const knowledgeStep = buildProjectKnowledgeStep(
    deps.knowledgeRetriever ?? retrieveProjectKnowledge,
  );
  const strategyStep = buildStrategyStep(deps.contentStrategyAgent);
  const generateContentStep = buildGenerateContentStep(
    deps.copywriterAgent,
    deps.copywriterStructurerAgent,
  );
  const qaReviewStep = buildQaReviewStep(
    deps.editorQaAgent,
    deps.copywriterAgent,
    deps.copywriterStructurerAgent,
  );
  const generateVisualsStep = buildGenerateVisualsStep(deps.visualPromptAgent);
  const generateHashtagsStep = buildGenerateHashtagsStep(deps.hashtagSeoAgent);

  return createWorkflow({
    id: 'content-creation-workflow',
    description:
      'Takes a CampaignStrategy and produces a full, ready-to-publish, dated social media content calendar.',
    inputSchema: ContentCreationInputSchema,
    outputSchema: CampaignContentOutputSchema,
    retryConfig: {
      attempts: 1,
      delay: 0,
    },
    stateSchema: ContentWorkflowStateSchema,
    options: { validateInputs: true },
  })
    .then(buildBriefStep)
    .then(knowledgeStep)
    .then(researchStep)
    .then(strategyStep)
    .then(generateContentStep)
    .then(preflightStep)
    .dowhile(qaReviewStep, async () => {
      // One bounded review/rewrite cycle keeps the workflow's worst-case model
      // budget below the backend's fixed 600-second run deadline. Deterministic
      // preflight checks already run immediately before this model review.
      return false;
    })
    .map(async ({ inputData }) => {
      // Strip qaPassed/qaIteration before passing to visuals/hashtags
      const { qaPassed: _qaPassed, qaIteration: _qaIteration, ...bundle } = inputData;
      return bundle;
    })
    .then(approvalStep)
    .parallel([generateVisualsStep, generateHashtagsStep])
    .then(scheduleStep)
    .then(claimAuditStep)
    .commit();
}

export type ContentCreationWorkflow = ReturnType<typeof buildContentCreationWorkflow>;
