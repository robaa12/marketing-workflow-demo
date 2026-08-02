import { z } from 'zod';

const ExplicitValueSchema = z.string().trim().min(1).describe('Provide a verified value or the literal "unknown".');

export const MarketingIntakeFactsSchema = z.object({
  targetGeography: ExplicitValueSchema,
  primaryIcp: ExplicitValueSchema,
  salesMotion: z.enum(['self-serve', 'sales-led', 'hybrid', 'unknown']),
  monthlyBudget: ExplicitValueSchema,
  supportedIntegrations: z.array(ExplicitValueSchema).min(1)
    .describe('Verified integrations, or ["unknown"].'),
  verifiedProofPoints: z.array(ExplicitValueSchema).min(1)
    .describe('Approved customer proof, or ["none verified"].'),
  prohibitedClaims: z.array(ExplicitValueSchema).min(1)
    .describe('Claims that must not appear, or ["none specified"].'),
  baselineMetrics: z.object({
    monthlyQualifiedVisits: ExplicitValueSchema,
    monthlyLeads: ExplicitValueSchema,
    trialOrDemoConversionRate: ExplicitValueSchema,
    activationRate: ExplicitValueSchema,
    paidConversionRate: ExplicitValueSchema,
    monthlyChurnRate: ExplicitValueSchema,
  }),
});
export type MarketingIntakeFacts = z.infer<typeof MarketingIntakeFactsSchema>;

export const MarketingIntakeResumeSchema = z.object({
  targetMarket: z.string().trim().min(3),
  intake: MarketingIntakeFactsSchema,
});
export type MarketingIntakeResume = z.infer<typeof MarketingIntakeResumeSchema>;
