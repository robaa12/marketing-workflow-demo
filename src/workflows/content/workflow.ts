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
  PostFeedbackSchema,
  SocialPlatformEnum,
  type ContentBrief,
  type ContentStrategy,
  type ResearchOutput,
  type SocialPlatform,
  type Post,
  type VisualPromptItem,
  type HashtagItem,
  type PostFeedback,
} from '../../schemas/content.js';
import { CampaignStrategySchema, type CampaignStrategy } from '../../schemas/campaign.js';
import { MarketingStrategyOutputSchema } from '../../schemas/marketingContext.js';
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
import { runContentPreflight } from '../../lib/content-preflight.js';
import { auditCampaignClaimsForBrand } from '../../lib/claim-audit.js';
import { resolveBrandContext } from '../../tools/brand-context.tool.js';
import { generateImageAsset, resolveImageAspectRatio } from '../../lib/image-generation.js';
import { retrieveProjectKnowledge } from '../../lib/project-knowledge.js';
import { KnowledgeScopeSchema, ProjectBrandProfileSchema } from '../../schemas/marketingContext.js';

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

export const ContentCreationInputSchema = z.object({
  knowledgeScope: KnowledgeScopeSchema.optional(),
  brandProfile: ProjectBrandProfileSchema.optional(),
  brandName: z.string().min(1),
  product: z.string().min(1),
  targetAudience: z.string().min(1),
  campaignStrategy: CampaignStrategySchema,
  marketingStrategy: MarketingStrategyOutputSchema.optional()
    .describe('The reviewed marketing strategy, including the outputs from every strategy agent.'),
  platforms: z.array(SocialPlatformEnum).min(1).optional()
    .describe('Social platforms to create content for. If omitted, derived from strategy channels.'),
  duration: z.string().min(1).optional()
    .describe('Campaign duration (e.g. "2 weeks"). If omitted, derived from strategy.'),
  postsPerWeek: z.number().int().positive().optional()
    .describe('Posts per week. If omitted, derived from strategy content mix.'),
  generateImages: z.boolean().optional()
    .describe('Generate rendered image assets in addition to visual prompts.'),
  maxPosts: z.number().int().positive().max(60).optional()
    .describe('Safety limit for the total generated posts in one run.'),
  requireApproval: z.boolean().optional()
    .describe('Suspend after QA until a reviewer explicitly approves the content.'),
});
export type ContentCreationInput = z.infer<typeof ContentCreationInputSchema>;

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

const EditorialReviewStateSchema = ContentBundleSchema.extend({
  editorialApproved: z.boolean().default(false),
  editorialRevision: z.number().int().nonnegative().default(0),
});

const EditorialPostFeedbackSchema = PostFeedbackSchema.extend({
  issue: z.string().trim().min(1).max(500),
  suggestion: z.string().trim().min(1).max(2_000),
});

const EditorialResumeSchema = z.object({
  approved: z.boolean(),
  feedback: z.string().trim().min(1).max(2_000).optional(),
  postFeedback: z.array(EditorialPostFeedbackSchema).max(60).optional(),
}).superRefine((value, context) => {
  if (!value.approved && !value.feedback && !value.postFeedback?.length) {
    context.addIssue({
      code: 'custom',
      message: 'Rejected content requires feedback or postFeedback.',
    });
  }
});

const MAX_EDITORIAL_REVISIONS = 3;

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
}

// ── Step 1: Build content brief from strategy ─────────────────────────────

const buildBriefStep = createStep({
  id: 'build-brief',
  description: 'Converts the marketing CampaignStrategy into a ContentBrief for the content pipeline.',
  inputSchema: ContentCreationInputSchema,
  outputSchema: z.object({
    brief: ContentBriefSchema,
  }),
  stateSchema: ContentWorkflowStateSchema,
  execute: async ({ inputData, runId, state, setState }) => {
    const strategy = inputData.campaignStrategy;
    const campaign = strategy.campaignRecommendations[0];
    const reviewedProduct = inputData.marketingStrategy?.product;
    const keyMessages = [
      ...strategy.creativeDirection.keyMessages,
      ...(reviewedProduct?.uniqueSellingPoints ?? []),
    ].slice(0, 5);
    const constraints = [
      ...strategy.creativeDirection.dontList.map((d) => `AVOID: ${d}`),
      ...(inputData.brandProfile?.prohibitedTerms ?? []).map((term) => `NEVER USE: ${term}`),
      ...(inputData.brandProfile?.writingRules ?? []).map((rule) => `RULE: ${rule}`),
      ...(inputData.brandProfile?.preferredTerms.length ? [`PREFER: ${inputData.brandProfile.preferredTerms.join(', ')}`] : []),
      ...(inputData.brandProfile?.ctaGuidance ? [`CTA: ${inputData.brandProfile.ctaGuidance}`] : []),
      ...(inputData.brandProfile?.languageGuidance ? [`LANGUAGE: ${inputData.brandProfile.languageGuidance}`] : []),
    ].join('; ');
    const knowledgeSources = await retrieveProjectKnowledge(
      inputData.knowledgeScope,
      `${inputData.brandName} ${inputData.product} ${inputData.targetAudience}`,
    );
    const knowledgeContext = knowledgeSources.length
      ? `\nApproved project knowledge (cite only these facts):\n${knowledgeSources.map((source) => `- ${source.title}: ${source.excerpt}`).join('\n')}`
      : '';
    const productContext = reviewedProduct
      ? [
          inputData.product,
          `Value proposition: ${reviewedProduct.valueProposition}`,
          `Customer problems: ${reviewedProduct.customerProblems.join('; ')}`,
        ].join('\n') + knowledgeContext
      : inputData.product + knowledgeContext;

    // Derive platforms, duration, postsPerWeek from strategy if not provided
    const platforms = inputData.platforms ?? derivePlatformsFromStrategy(strategy);
    const duration = inputData.duration ?? deriveDurationFromStrategy(strategy);
    const postsPerWeek = inputData.postsPerWeek ?? derivePostsPerWeekFromStrategy(strategy);

    const brief: ContentBrief = {
      brandName: inputData.brandName,
      brandVoice: inputData.brandProfile?.voice ?? strategy.creativeDirection.storytellingApproach,
      product: productContext,
      campaignGoal: campaign?.objective ?? 'Increase brand awareness',
      targetAudience: inputData.marketingStrategy?.campaignStrategy.audienceStrategy.primaryAudience ?? inputData.targetAudience,
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
    return { brief };
  },
});

// ── Step 2: Research ──────────────────────────────────────────────────────

function buildResearchStep(researchAgent: Agent) {
  return createStep({
  id: 'content-research',
  description: 'Researches trends, hashtags, and audience context for content creation.',
  inputSchema: z.object({
    brief: ContentBriefSchema,
  }),
  outputSchema: z.object({
    brief: ContentBriefSchema,
    research: ResearchOutputSchema,
  }),
  retries: 3,
  stateSchema: ContentWorkflowStateSchema,
  execute: async ({ inputData, state, setState }) => {
    const { brief } = inputData;
    const research = await runContentResearch(researchAgent, { brief });
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
  retries: 2,
  execute: async ({ inputData }) => {
    const { brief, research } = inputData;
    const strategy = await runContentStrategy(strategyAgent, { brief, research });
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
  retries: 2,
  execute: async ({ inputData }) => {
    const { brief, research, strategy } = inputData;
    const { weeks } = parseDuration(brief.duration);
    const postCount = Math.max(1, brief.postsPerWeek) * weeks;

    const platforms = brief.platforms as SocialPlatform[];
    const results = await Promise.all(
      platforms.map((platform) =>
        runCopywriting(
          copywriterAgent,
          { brief, research, strategy, platform, postCount },
          copywriterStructurerAgent,
        ),
      ),
    );
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
  execute: async ({ inputData, getInitData, getStepResult }) => {
    const briefResult = getStepResult<{ brief: ContentBrief }>('build-brief');
    const strategyResult = getStepResult<{ strategy: ContentStrategy }>('content-strategy');
    const researchResult = getStepResult<{ research: ResearchOutput }>('content-research');
    if (!briefResult?.brief) throw new Error('brief missing');
    if (!strategyResult?.strategy) throw new Error('strategy missing');
    if (!researchResult?.research) throw new Error('research missing');

    const generatedVisualPrompts = await runVisualPrompts(visualAgent, {
      brief: briefResult.brief,
      strategy: strategyResult.strategy,
      research: researchResult.research,
      posts: inputData.posts,
    });
    const visualPrompts = ensureVisualPromptPerPost(
      inputData.posts,
      generatedVisualPrompts,
      briefResult.brief,
      strategyResult.strategy,
    );
    const initialInput = getInitData<ContentCreationInput>();
    if (initialInput.generateImages === false) {
      return {
        ...inputData,
        visuals: visualPrompts.map(({ imageUrl: _imageUrl, ...visual }) => visual),
      };
    }
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

/**
 * Structured model output can be valid while still omitting a post. Keep the
 * calendar contract total by preserving matching agent output and creating a
 * deterministic, on-brand direction for every omitted post.
 */
function ensureVisualPromptPerPost(
  posts: Post[],
  generatedVisuals: VisualPromptItem[],
  brief: ContentBrief,
  strategy: ContentStrategy,
): VisualPromptItem[] {
  const postIds = new Set(posts.map((post) => post.postId));
  const generatedByPostId = new Map<string, VisualPromptItem>();

  for (const visual of generatedVisuals) {
    if (postIds.has(visual.postId) && !generatedByPostId.has(visual.postId)) {
      generatedByPostId.set(visual.postId, visual);
    }
  }

  return posts.map((post) => generatedByPostId.get(post.postId) ?? {
    postId: post.postId,
    prompt: [
      `Create a polished ${post.format} campaign visual for ${brief.brandName} on ${post.platform}.`,
      `Communicate this post idea: ${post.caption.slice(0, 500)}`,
      `Keep it consistent with the campaign narrative: ${strategy.coreNarrative.slice(0, 240)}`,
      `Use the brand voice (${brief.brandVoice}) and leave clear negative space for platform-safe copy.`,
    ].join(' '),
    tool: 'visual-prompt-agent-fallback',
    aspectRatio: post.platform === 'instagram'
      ? '1:1'
      : post.platform === 'tiktok' || post.platform === 'youtube_shorts'
        ? '9:16'
        : '16:9',
  });
}

// ── Step 6a: Generate hashtags ────────────────────────────────────────────

function buildGenerateHashtagsStep(hashtagAgent: Agent) {
  return createStep({
  id: 'generate-hashtags',
  description: 'Hashtag & SEO Agent — ranked hashtags + keywords per post.',
  inputSchema: ContentBundleSchema,
  outputSchema: ContentBundleSchema,
  execute: async ({ inputData, getStepResult, getInitData }) => {
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

// ── Step 7: QA review + rewrite loop ─────────────────────────────────────

/**
 * Combined QA + rewrite step for the feedback loop.
 * Runs QA, and if it fails, rewrites posts with the copywriter.
 * Returns explicit QA state for the `dowhile` condition.
 */
function buildQaReviewStep(
  editorAgent: Agent,
  copywriterAgent: Agent,
  copywriterStructurerAgent: Agent,
) {
  return createStep({
  id: 'qa-review',
  description: 'QA review with copywriter feedback loop — rewrites posts until QA passes.',
  inputSchema: QAReviewInputSchema,
  outputSchema: QAReviewOutputSchema,
  retries: 2,
  stateSchema: ContentWorkflowStateSchema,
  execute: async ({ inputData, getStepResult, state, setState }) => {
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
    });

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
    }, copywriterStructurerAgent);

    await setState({ ...state, qaIterations: inputData.qaIteration });

    return {
      ...inputData,
      posts: rewrittenPosts,
      qaNotes: [...inputData.qaNotes, ...qaResult.notes],
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
  execute: async ({ inputData, getStepResult, getInitData }) => {
    const briefResult = getStepResult<{ brief: ContentBrief }>('build-brief');
    const strategyResult = getStepResult<{ strategy: ContentStrategy }>('content-strategy');
    const researchResult = getStepResult<{ research: ResearchOutput }>('content-research');
    if (!briefResult?.brief) throw new Error('brief missing');
    if (!strategyResult?.strategy) throw new Error('strategy missing');
    if (!researchResult?.research) throw new Error('research missing');

    const brief = briefResult.brief;
    const strategy = strategyResult.strategy;
    const initialInput = getInitData<ContentCreationInput>();
    const knowledgeSources = await retrieveProjectKnowledge(
      initialInput.knowledgeScope,
      `${brief.brandName} ${brief.product} ${brief.targetAudience}`,
    );

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
      strategy,
      calendar,
      notes: qaNotes,
      sources: researchResult.research.sources,
      knowledgeSources,
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

function normalizeEditorialFeedback(
  posts: Post[],
  feedback?: string,
  postFeedback: PostFeedback[] = [],
): PostFeedback[] {
  const knownPostIds = new Set(posts.map((post) => post.postId));
  const unknownPostIds = postFeedback
    .map((item) => item.postId)
    .filter((postId) => !knownPostIds.has(postId));
  if (unknownPostIds.length) {
    throw new Error(`Reviewer feedback references unknown posts: ${unknownPostIds.join(', ')}`);
  }

  const byPostId = new Map(postFeedback.map((item) => [item.postId, item]));
  if (feedback) {
    for (const post of posts) {
      const specific = byPostId.get(post.postId);
      byPostId.set(post.postId, specific
        ? { ...specific, suggestion: `${specific.suggestion}\nAdditional reviewer feedback: ${feedback}` }
        : {
            postId: post.postId,
            issue: 'Editorial review requested changes',
            suggestion: feedback,
            severity: 'warning',
          });
    }
  }
  return [...byPostId.values()];
}

function buildApprovalStep(
  editorAgent: Agent,
  copywriterAgent: Agent,
  copywriterStructurerAgent: Agent,
) {
  return createStep({
    id: 'content-approval',
    description: 'Applies reviewer feedback, reruns QA, and suspends until content is approved.',
    inputSchema: EditorialReviewStateSchema,
    outputSchema: EditorialReviewStateSchema,
    resumeSchema: EditorialResumeSchema,
    suspendSchema: z.object({
      reason: z.string(),
      revision: z.number().int().nonnegative(),
      revisionsRemaining: z.number().int().nonnegative(),
      posts: ContentBundleSchema.shape.posts,
      qaNotes: ContentBundleSchema.shape.qaNotes,
    }),
    execute: async ({ inputData, getInitData, getStepResult, resumeData, suspend }) => {
      const initialInput = getInitData<ContentCreationInput>();
      if (!initialInput.requireApproval) {
        return { ...inputData, editorialApproved: true };
      }
      if (!resumeData) {
        await suspend({
          reason: inputData.editorialRevision === 0
            ? 'Content is ready for editorial approval.'
            : 'Reviewer feedback was applied and the revised content was rechecked by QA.',
          revision: inputData.editorialRevision,
          revisionsRemaining: MAX_EDITORIAL_REVISIONS - inputData.editorialRevision,
          posts: inputData.posts,
          qaNotes: inputData.qaNotes,
        }, { resumeLabel: 'approve-content' });
        return inputData;
      }
      if (resumeData.approved) {
        return {
          ...inputData,
          editorialApproved: true,
          qaNotes: resumeData.feedback
            ? [...inputData.qaNotes, {
                severity: 'info' as const,
                message: `Reviewer approval note: ${resumeData.feedback}`,
                resolved: true,
              }]
            : inputData.qaNotes,
        };
      }
      if (inputData.editorialRevision >= MAX_EDITORIAL_REVISIONS) {
        throw new Error(`Content was rejected after ${MAX_EDITORIAL_REVISIONS} editorial revisions.`);
      }

      const briefResult = getStepResult<{ brief: ContentBrief }>('build-brief');
      const strategyResult = getStepResult<{ strategy: ContentStrategy }>('content-strategy');
      const researchResult = getStepResult<{ research: ResearchOutput }>('content-research');
      if (!briefResult?.brief) throw new Error('brief missing');
      if (!strategyResult?.strategy) throw new Error('strategy missing');
      if (!researchResult?.research) throw new Error('research missing');

      const reviewerFeedback = normalizeEditorialFeedback(
        inputData.posts,
        resumeData.feedback,
        resumeData.postFeedback,
      );
      let posts = await runCopywriterRewrite(copywriterAgent, {
        brief: briefResult.brief,
        strategy: strategyResult.strategy,
        posts: inputData.posts,
        feedback: reviewerFeedback,
      }, copywriterStructurerAgent);
      const qaNotes = [...inputData.qaNotes, ...reviewerFeedback.map((item) => ({
        postId: item.postId,
        severity: 'info' as const,
        message: `Reviewer feedback applied: ${item.issue}`,
        resolved: true,
      }))];

      // A human-requested rewrite must pass the same deterministic and model QA
      // checks as the original draft before it is shown for re-approval.
      for (let iteration = 1; iteration <= 3; iteration += 1) {
        qaNotes.push(...runContentPreflight(briefResult.brief, posts));
        const qaResult = await runQA(editorAgent, {
          brief: briefResult.brief,
          strategy: strategyResult.strategy,
          research: researchResult.research,
          posts,
          iteration,
        });
        qaNotes.push(...qaResult.notes);
        posts = qaResult.posts;
        if (qaResult.passed) break;
        if (iteration === 3) break;
        posts = await runCopywriterRewrite(copywriterAgent, {
          brief: briefResult.brief,
          strategy: strategyResult.strategy,
          posts,
          feedback: qaResult.feedback,
        }, copywriterStructurerAgent);
      }

      return {
        ...inputData,
        posts,
        qaNotes,
        editorialApproved: false,
        editorialRevision: inputData.editorialRevision + 1,
      };
    },
  });
}

// ── Workflow ──────────────────────────────────────────────────────────────

export function buildContentCreationWorkflow(deps: ContentWorkflowDeps) {
  const researchStep = buildResearchStep(deps.contentResearcherAgent);
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
  const approvalStep = buildApprovalStep(
    deps.editorQaAgent,
    deps.copywriterAgent,
    deps.copywriterStructurerAgent,
  );

  return createWorkflow({
    id: 'content-creation-workflow',
    description:
      'Takes a CampaignStrategy and produces a full, ready-to-publish, dated social media content calendar.',
    inputSchema: ContentCreationInputSchema,
    outputSchema: CampaignContentOutputSchema,
    retryConfig: {
      attempts: 2,
      delay: 2000,
    },
    stateSchema: ContentWorkflowStateSchema,
    options: { validateInputs: true },
  })
    .then(buildBriefStep)
    .then(researchStep)
    .then(strategyStep)
    .then(generateContentStep)
    .then(preflightStep)
    .dowhile(qaReviewStep, async ({ inputData, iterationCount }) => {
      // Loop while QA hasn't passed and we haven't hit max iterations
      return !inputData.qaPassed && iterationCount < 3;
    })
    .map(async ({ inputData }) => {
      // Strip qaPassed/qaIteration before passing to visuals/hashtags
      const { qaPassed: _qaPassed, qaIteration: _qaIteration, ...bundle } = inputData;
      return bundle;
    })
    .dowhile(approvalStep, async ({ inputData, iterationCount }) => {
      // One initial review, followed by at most MAX_EDITORIAL_REVISIONS revisions.
      return !inputData.editorialApproved && iterationCount <= MAX_EDITORIAL_REVISIONS;
    })
    .map(async ({ inputData }) => {
      if (!inputData.editorialApproved) {
        throw new Error(`Content was not approved after ${MAX_EDITORIAL_REVISIONS} editorial revisions.`);
      }
      const {
        editorialApproved: _editorialApproved,
        editorialRevision: _editorialRevision,
        ...bundle
      } = inputData;
      return bundle;
    })
    .parallel([generateVisualsStep, generateHashtagsStep])
    .then(scheduleStep)
    .then(claimAuditStep)
    .commit();
}

export type ContentCreationWorkflow = ReturnType<typeof buildContentCreationWorkflow>;
