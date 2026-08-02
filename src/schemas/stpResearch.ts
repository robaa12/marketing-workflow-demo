import { z } from 'zod';

export const STPResearchCitationSchema = z.object({
  title: z.string(),
  url: z.string().url(),
  publisher: z.string(),
  excerpt: z.string(),
  retrievedAt: z.string().datetime(),
});

export const STPResearchSchema = z.object({
  queries: z.array(z.string()).min(1).max(3),
  citations: z.array(STPResearchCitationSchema).max(10),
  warnings: z.array(z.string()),
});

export type STPResearch = z.infer<typeof STPResearchSchema>;
