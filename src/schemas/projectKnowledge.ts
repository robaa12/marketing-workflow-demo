import { z } from 'zod';

/**
 * Server-derived boundary for project knowledge. The backend builds this from
 * the owned project and READY sources; browser clients must never choose a
 * different project or source set for a workflow run.
 */
export const KnowledgeScopeSchema = z.object({
  projectId: z.string().min(1),
  sourceIds: z.array(z.string().min(1)),
  sourceSnapshots: z.array(z.object({
    sourceId: z.string().min(1),
    sourceType: z.string().min(1),
    name: z.string().min(1),
    url: z.string().url().optional(),
    indexedAt: z.string().datetime().optional(),
    indexVersion: z.string().min(1).optional(),
  })).optional(),
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

export const KnowledgeRetrievalStatusSchema = z.enum([
  'disabled',
  'no-sources',
  'no-match',
  'success',
  'unavailable',
]);
export type KnowledgeRetrievalStatus = z.infer<typeof KnowledgeRetrievalStatusSchema>;

/**
 * Durable, non-sensitive record of the evidence available to a workflow run.
 * The full project documents remain in the source system and vector store.
 */
export const KnowledgeRetrievalProvenanceSchema = z.object({
  status: KnowledgeRetrievalStatusSchema,
  retrievedAt: z.string().datetime(),
  sourceIds: z.array(z.string().min(1)),
  sourceSnapshots: KnowledgeScopeSchema.shape.sourceSnapshots.default([]),
  citations: z.array(KnowledgeCitationSchema),
  warning: z.string().max(300).optional(),
});
export type KnowledgeRetrievalProvenance = z.infer<typeof KnowledgeRetrievalProvenanceSchema>;
