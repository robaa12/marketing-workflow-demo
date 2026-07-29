import { z } from 'zod';

/**
 * Enums used across multiple schemas.
 * Centralised here so every agent references the same controlled vocabulary.
 */

export const BusinessModelEnum = z.enum([
  'b2b',
  'b2c',
  'b2b2c',
  'marketplace',
  'saas',
  'ecommerce',
  'service',
  'community',
  'other',
]);
export type BusinessModel = z.infer<typeof BusinessModelEnum>;

export const ProductMaturityEnum = z.enum([
  'idea',
  'pre-launch',
  'mvp',
  'growth',
  'mature',
  'declining',
]);
export type ProductMaturity = z.infer<typeof ProductMaturityEnum>;

export const PricingModelEnum = z.enum([
  'free',
  'freemium',
  'one-time',
  'subscription',
  'usage-based',
  'tiered',
  'enterprise',
  'unknown',
]);
export type PricingModel = z.infer<typeof PricingModelEnum>;

export const SegmentPriorityEnum = z.enum(['primary', 'secondary', 'future']);
export type SegmentPriority = z.infer<typeof SegmentPriorityEnum>;

export const FunnelStageEnum = z.enum([
  'awareness',
  'consideration',
  'decision',
  'retention',
  'advocacy',
]);
export type FunnelStage = z.infer<typeof FunnelStageEnum>;

export const MarketingChannelEnum = z.enum([
  'linkedin',
  'meta',
  'google',
  'tiktok',
  'youtube',
  'x',
  'reddit',
  'email',
  'seo',
  'content',
  'community',
  'events',
  'pr',
  'partnerships',
  'referral',
  'podcast',
  'sms',
  'offline',
  'other',
]);
export type MarketingChannel = z.infer<typeof MarketingChannelEnum>;

export const CampaignTypeEnum = z.enum([
  'awareness',
  'lead-generation',
  'conversion',
  'retargeting',
  'nurture',
  'loyalty',
  'advocacy',
]);
export type CampaignType = z.infer<typeof CampaignTypeEnum>;

export const ContentTypeEnum = z.enum([
  'blog-post',
  'whitepaper',
  'case-study',
  'webinar',
  'video',
  'podcast',
  'social-post',
  'newsletter',
  'landing-page',
  'infographic',
  'comparison',
  'demo',
  'free-tool',
  'community-post',
  'other',
]);
export type ContentType = z.infer<typeof ContentTypeEnum>;

export const ErrorStrategyEnum = z.enum(['strict', 'warn', 'fallback']);
export type ErrorStrategy = z.infer<typeof ErrorStrategyEnum>;
