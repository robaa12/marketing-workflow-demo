import { z } from 'zod';
import { BusinessModelEnum, PricingModelEnum, ProductMaturityEnum } from './common.js';

/**
 * Raw user input that bootstraps the Product Analysis agent.
 * All fields except `description` and `industry` are optional, but the agent
 * will surface a validation error if the required ones are missing.
 */
export const UserProductInputSchema = z.object({
  description: z
    .string()
    .min(10, 'A product description of at least 10 characters is required.'),
  industry: z
    .string()
    .min(2, 'An industry classification is required.'),
  businessType: z
    .string()
    .min(2, 'A business type (e.g. SaaS, marketplace) is required.'),
  targetMarket: z.string().optional(),
  pricing: z.string().optional(),
  additionalNotes: z.string().optional(),
});
export type UserProductInput = z.infer<typeof UserProductInputSchema>;

/**
 * Structured product profile produced by the Product Analysis agent.
 * Every downstream agent consumes this; the field set is intentionally rich
 * so other agents never need to re-derive what was already extracted.
 */
export const ProductProfileSchema = z.object({
  name: z.string().min(1).describe('Working name for the product or service.'),
  type: z
    .string()
    .min(2)
    .describe('Concise product type (e.g. "Developer SaaS", "DTC skincare").'),
  industry: z.string().min(2),
  businessModel: BusinessModelEnum,
  productMaturity: ProductMaturityEnum,
  pricingModel: PricingModelEnum,
  pricingNotes: z
    .string()
    .optional()
    .describe('Free-form pricing context (price points, tiers, currency).'),
  coreFeatures: z
    .array(z.string().min(2))
    .min(1)
    .max(8)
    .describe('Up to 8 concise, distinct feature descriptions.'),
  customerProblems: z
    .array(z.string().min(5))
    .min(1)
    .max(6)
    .describe('Concrete jobs-to-be-done or pain points the product solves.'),
  valueProposition: z
    .string()
    .min(10)
    .describe('One-sentence value proposition in the customer\'s voice.'),
  uniqueSellingPoints: z
    .array(z.string().min(5))
    .min(1)
    .max(6)
    .describe('Defensible, ideally unique advantages over alternatives.'),
  differentiators: z
    .array(z.string().min(5))
    .min(1)
    .max(6)
    .describe('How the product compares to typical market alternatives.'),
  constraints: z
    .array(z.string())
    .default([])
    .describe('Regulatory, technical, or operational constraints to respect.'),
  assumptions: z
    .array(z.string())
    .default([])
    .describe('Inferences the agent had to make because the user input was thin.'),
});
export type ProductProfile = z.infer<typeof ProductProfileSchema>;
