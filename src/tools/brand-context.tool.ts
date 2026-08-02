import { createTool } from '@mastra/core/tools';
import { z } from 'zod';

const BrandProfileSchema = z.object({
  brandName: z.string().min(1),
  voice: z.string().min(1),
  approvedClaims: z.array(z.string()).default([]),
  prohibitedTerms: z.array(z.string()).default([]),
  toneExamples: z.array(z.string()).default([]),
  assetUrls: z.array(z.string().url()).default([]),
  updatedAt: z.string().datetime(),
});

export type BrandProfile = z.infer<typeof BrandProfileSchema>;

export function resolveBrandContext(
  brandName: string,
  rawProfiles = process.env['BRAND_CONTEXT_JSON'],
): BrandProfile | undefined {
  if (!rawProfiles) return undefined;
  try {
    const profiles = z.array(BrandProfileSchema).parse(JSON.parse(rawProfiles));
    return profiles.find((profile) => profile.brandName.toLocaleLowerCase() === brandName.toLocaleLowerCase());
  } catch {
    throw new Error('BRAND_CONTEXT_JSON must be a JSON array of valid brand profiles.');
  }
}

export const brandContextTool = createTool({
  id: 'brand-context',
  description:
    'Looks up approved brand voice, claims, prohibited terms, examples, and assets. Treat a missing profile as no additional context; never invent approved claims.',
  strict: true,
  inputExamples: [{ input: { brandName: 'Insight Loop' } }],
  inputSchema: z.object({ brandName: z.string().min(1) }),
  outputSchema: z.object({
    found: z.boolean(),
    profile: BrandProfileSchema.optional(),
  }),
  toModelOutput: (output) => ({ type: 'json', value: output }),
  execute: async ({ brandName }) => {
    const profile = resolveBrandContext(brandName);
    return profile ? { found: true, profile } : { found: false };
  },
});
