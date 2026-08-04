import { z } from 'zod';
import { SegmentPriorityEnum } from './common.js';

const TechnicalMaturitySchema = z.preprocess(
  (value) => {
    if (typeof value !== 'string') return value;
    const normalized = value.trim().toLowerCase();
    if (normalized === 'low' || normalized === 'medium' || normalized === 'high' || normalized === 'unknown') {
      return normalized;
    }
    if (normalized.includes('beginner') || normalized.includes('basic')) return 'low';
    if (normalized.includes('intermediate') || normalized.includes('moderate')) return 'medium';
    if (normalized.includes('advanced') || normalized.includes('expert')) return 'high';
    return 'unknown';
  },
  z.enum(['low', 'medium', 'high', 'unknown']).default('unknown'),
);

/**
 * One candidate customer segment discovered during segmentation.
 * Kept deliberately distinct from BuyerPersona: a segment is a market slice,
 * a persona is a representative buyer inside one or more segments.
 */
export const CustomerSegmentSchema = z.object({
  id: z
    .string()
    .min(1)
    .describe('Stable kebab-case identifier (e.g. "mid-market-cto").'),
  label: z
    .string()
    .min(2)
    .describe('Human-readable segment name (e.g. "Mid-market CTOs").'),
  demographics: z
    .array(z.string())
    .default([])
    .describe('Demographic descriptors (age, gender, income, education...).'),
  geography: z
    .array(z.string())
    .default([])
    .describe('Regions, countries, or locales in scope.'),
  psychographics: z
    .array(z.string())
    .default([])
    .describe('Attitudes, values, lifestyle, worldview.'),
  behavior: z
    .array(z.string())
    .default([])
    .describe('Usage patterns, buying behaviour, channel preferences.'),
  companySize: z
    .array(z.string())
    .default([])
    .describe('B2B-only. Employee count or revenue band.'),
  industry: z
    .array(z.string())
    .default([])
    .describe('Verticals the segment operates in.'),
  budget: z
    .string()
    .optional()
    .describe('Typical budget range for the product category.'),
  technicalMaturity: TechnicalMaturitySchema,
  estimatedSize: z
    .string()
    .optional()
    .describe('Qualitative size estimate (e.g. "~120k companies globally").'),
  notes: z.string().optional(),
});
export type CustomerSegment = z.infer<typeof CustomerSegmentSchema>;

/**
 * Targeting score for a single segment.
 * All scores are 0-10 to keep weighting trivial downstream.
 */
export const SegmentScoreSchema = z.object({
  segmentId: z.string().min(1),
  marketAttractiveness: z.number().min(0).max(10),
  productFit: z.number().min(0).max(10),
  revenuePotential: z.number().min(0).max(10),
  easeOfAcquisition: z.number().min(0).max(10),
  competitiveIntensity: z
    .number()
    .min(0)
    .max(10)
    .describe('10 = blue ocean, 0 = saturated red ocean.'),
  weightedScore: z
    .number()
    .min(0)
    .max(10)
    .describe('Final composite score, weighted across the dimensions above.'),
  rationale: z.string().min(5),
});
export type SegmentScore = z.infer<typeof SegmentScoreSchema>;

export const TargetedSegmentSchema = z.object({
  segmentId: z.string().min(1),
  priority: SegmentPriorityEnum,
  justification: z
    .string()
    .min(10)
    .describe('Why this segment earns this priority tier.'),
});
export type TargetedSegment = z.infer<typeof TargetedSegmentSchema>;

export const PositioningSchema = z.object({
  positioningStatement: z
    .string()
    .min(20)
    .describe(
      'Classic positioning: For [target] who [need], [product] is [category] that [benefit] because [reason to believe].',
    ),
  valueProposition: z
    .string()
    .min(10)
    .describe('Concise value proposition in the customer\'s voice.'),
  brandPromise: z
    .string()
    .min(5)
    .describe('One-line promise the brand makes to every customer.'),
  keyDifferentiators: z
    .array(z.string().min(5))
    .min(1)
    .max(5)
    .describe('The 3-5 reasons the product wins against alternatives.'),
  messagingPillars: z
    .array(
      z.object({
        pillar: z.string().min(2),
        description: z.string().min(10),
      }),
    )
    .min(2)
    .max(5)
    .describe('Core narrative themes the entire marketing system repeats.'),
  toneOfVoice: z
    .string()
    .min(5)
    .describe('How the brand sounds in 1-2 sentences (e.g. "Direct, technical, never breezy").'),
});
export type Positioning = z.infer<typeof PositioningSchema>;

export const STPResultSchema = z.object({
  segments: z
    .array(CustomerSegmentSchema)
    .min(2)
    .max(8)
    .describe('All candidate segments considered during segmentation.'),
  segmentScores: z
    .array(SegmentScoreSchema)
    .min(1)
    .describe('Scoring matrix used during targeting.'),
  targetedSegments: z
    .array(TargetedSegmentSchema)
    .min(1)
    .max(3)
    .describe('Final target tiers (primary, secondary, future).'),
  positioning: PositioningSchema,
  rationale: z
    .string()
    .min(20)
    .describe('One paragraph summarising the strategic reasoning.'),
});
export type STPResult = z.infer<typeof STPResultSchema>;
