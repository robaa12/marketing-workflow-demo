import { z } from 'zod';
import { MarketingChannelEnum } from './common.js';
import { IsoCalendarDateSchema, TemporalContextSchema } from './temporal.js';
import { KnowledgeCitationSchema } from './projectKnowledge.js';
import { KnowledgeRetrievalProvenanceSchema } from './projectKnowledge.js';

// ── Platform enum (social-specific, maps to MarketingChannelEnum) ──────────

export const SocialPlatformEnum = z.enum([
  'x',
  'instagram',
  'linkedin',
  'facebook',
  'tiktok',
  'youtube_shorts',
]);
export type SocialPlatform = z.infer<typeof SocialPlatformEnum>;

// ── Campaign brief for content creation ────────────────────────────────────

export const ContentBriefSchema = z.object({
  temporalContext: TemporalContextSchema,
  brandName: z.string().min(1),
  brandVoice: z.string().min(1).describe('e.g. "witty, confident, minimal"'),
  product: z.string().min(1),
  campaignGoal: z.string().min(1),
  targetAudience: z.string().min(1),
  platforms: z.array(SocialPlatformEnum).min(1),
  duration: z.string().min(1).describe('e.g. "2 weeks", "10 days", "1 month"'),
  postsPerWeek: z.number().int().positive(),
  maxPosts: z.number().int().positive().max(60).default(24),
  keyMessages: z.array(z.string()).optional().default([]),
  constraints: z
    .string()
    .optional()
    .default('')
    .describe('banned words, compliance notes, etc.'),
});
export type ContentBrief = z.infer<typeof ContentBriefSchema>;

// ── Research output ────────────────────────────────────────────────────────

export const ContentHookSchema = z.object({
  platform: SocialPlatformEnum,
  angle: z.string().describe('Specific content angle or hook for this platform'),
  trend: z.string().optional().describe('Which trend this hooks into'),
  rationale: z.string().describe('Why this angle will resonate with the audience'),
});
export type ContentHook = z.infer<typeof ContentHookSchema>;

export const ResearchSourceSchema = z.object({
  title: z.string().min(1),
  url: z.string().url(),
  retrievedAt: z.string().datetime(),
});
export type ResearchSource = z.infer<typeof ResearchSourceSchema>;

export const ResearchOutputSchema = z.object({
  trends: z.array(
    z.object({
      title: z.string(),
      summary: z.string(),
      sourceUrl: z.string().optional(),
    }),
  ),
  hashtags: z.array(z.string()),
  sources: z.array(ResearchSourceSchema).min(1)
    .describe('Sources used to support the research, with retrieval timestamps.'),
  contentHooks: z.array(ContentHookSchema).min(1)
    .describe('Specific content angles per platform, tied to trends and audience insights'),
  competitorNotes: z.string(),
  audienceInsights: z.string(),
  knowledge: z.array(KnowledgeCitationSchema).default([])
    .describe('Retrieved project knowledge excerpts available to downstream content agents.'),
  knowledgeProvenance: KnowledgeRetrievalProvenanceSchema.optional(),
});
export type ResearchOutput = z.infer<typeof ResearchOutputSchema>;

// ── Strategy output ────────────────────────────────────────────────────────

export const ContentStrategySchema = z.object({
  coreNarrative: z.string(),
  contentPillars: z
    .array(
      z.object({
        name: z.string(),
        description: z.string(),
      }),
    )
    .min(3)
    .max(5),
  tonePerPlatform: z.record(SocialPlatformEnum, z.string()),
  rationale: z.string(),
});
export type ContentStrategy = z.infer<typeof ContentStrategySchema>;

// ── Post schema ────────────────────────────────────────────────────────────

export const PostSchema = z.object({
  postId: z.string().describe('Stable unique id, e.g. "x-1"'),
  platform: SocialPlatformEnum,
  index: z.number().int().nonnegative(),
  caption: z.string(),
  cta: z.string(),
  format: z
    .string()
    .describe('platform format: thread | single-image | carousel | video-clip | document | text'),
});
export type Post = z.infer<typeof PostSchema>;

// ── Visual prompt item ─────────────────────────────────────────────────────

export const VisualPromptItemSchema = z.object({
  postId: z.string(),
  prompt: z.string(),
  tool: z
    .string()
    .describe('suggested generator tool, e.g. midjourney | dall-e | sora | imagen | runway'),
  aspectRatio: z.string(),
  imageUrl: z.string().optional().describe('generated image data URI or URL'),
});
export type VisualPromptItem = z.infer<typeof VisualPromptItemSchema>;

// ── Hashtag item ───────────────────────────────────────────────────────────

export const HashtagItemSchema = z.object({
  postId: z.string(),
  platform: SocialPlatformEnum,
  hashtags: z.array(z.string()),
  keywords: z.array(z.string()),
});
export type HashtagItem = z.infer<typeof HashtagItemSchema>;

// ── QA note ────────────────────────────────────────────────────────────────

export const QANoteSchema = z.object({
  postId: z.string().optional(),
  severity: z.enum(['info', 'warning', 'error']),
  message: z.string(),
  resolved: z.boolean(),
});
export type QANote = z.infer<typeof QANoteSchema>;

// ── QA review result (for feedback loop) ───────────────────────────────────

export const PostFeedbackSchema = z.object({
  postId: z.string(),
  issue: z.string().describe('What needs to be fixed'),
  suggestion: z.string().describe('Specific rewrite suggestion'),
  severity: z.enum(['warning', 'error']),
});
export type PostFeedback = z.infer<typeof PostFeedbackSchema>;

export const QAReviewResultSchema = z.object({
  passed: z.boolean().describe('true if all posts pass QA, false if rewrites needed'),
  posts: z.array(PostSchema).describe('Current posts (revised if fixes were minor, original if feedback sent)'),
  notes: z.array(QANoteSchema),
  feedback: z.array(PostFeedbackSchema).describe('Specific feedback for posts that need rewrites — empty if passed=true'),
});
export type QAReviewResult = z.infer<typeof QAReviewResultSchema>;

// ── Content bundle (intermediate step output) ──────────────────────────────

export const ContentBundleSchema = z.object({
  posts: z.array(PostSchema),
  visuals: z.array(VisualPromptItemSchema).default([]),
  hashtags: z.array(HashtagItemSchema).default([]),
  qaNotes: z.array(QANoteSchema).default([]),
});
export type ContentBundle = z.infer<typeof ContentBundleSchema>;

// ── Calendar entry (final output) ──────────────────────────────────────────

export const CalendarEntrySchema = z.object({
  date: IsoCalendarDateSchema.describe('ISO date (YYYY-MM-DD)'),
  platform: SocialPlatformEnum,
  caption: z.string(),
  hashtags: z.array(z.string()),
  visualPrompt: z.string(),
  imageUrl: z.string().optional(),
  cta: z.string(),
});
export type CalendarEntry = z.infer<typeof CalendarEntrySchema>;

// ── Final campaign content output ──────────────────────────────────────────

export const CampaignContentDraftOutputSchema = z.object({
  temporalContext: TemporalContextSchema,
  knowledgeProvenance: KnowledgeRetrievalProvenanceSchema.optional(),
  strategy: ContentStrategySchema,
  calendar: z.array(CalendarEntrySchema),
  notes: z.array(QANoteSchema),
  sources: z.array(ResearchSourceSchema),
});
export type CampaignContentDraftOutput = z.infer<typeof CampaignContentDraftOutputSchema>;

export const ClaimAuditSummarySchema = z.object({
  verifications: z.array(z.object({
    contentIndex: z.number().int().nonnegative(),
    text: z.string(),
    status: z.enum(['approved', 'evidence-linked', 'unsupported']),
    supportingUrls: z.array(z.string().url()),
  })),
  unsupportedCount: z.number().int().nonnegative(),
});
export type ClaimAuditSummary = z.infer<typeof ClaimAuditSummarySchema>;

export const CampaignContentOutputSchema = CampaignContentDraftOutputSchema.extend({
  claimVerification: ClaimAuditSummarySchema,
});
export type CampaignContentOutput = z.infer<typeof CampaignContentOutputSchema>;
