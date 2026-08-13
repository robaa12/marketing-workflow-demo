import { z } from 'zod';

/**
 * Server-derived boundary for project knowledge. The backend builds this from
 * the owned project and READY sources; browser clients must never choose a
 * different project or source set for a workflow run.
 */
export const KnowledgeScopeSchema = z.object({
  projectId: z.string().min(1),
  sourceIds: z.array(z.string().min(1)),
});
export type KnowledgeScope = z.infer<typeof KnowledgeScopeSchema>;

/** A compact, traceable excerpt returned from the project vector index. */
export const KnowledgeCitationSchema = z.object({
  sourceId: z.string().min(1),
  pageId: z.string().min(1).optional(),
  chunkId: z.string().min(1).optional(),
  sourceType: z.string().min(1),
  title: z.string().min(1),
  url: z.string().url().optional(),
  excerpt: z.string().min(1).max(600),
  score: z.number().finite(),
});
export type KnowledgeCitation = z.infer<typeof KnowledgeCitationSchema>;
