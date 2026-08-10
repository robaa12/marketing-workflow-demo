import { createHash } from 'node:crypto';
import { PgVector } from '@mastra/pg';
import type { KnowledgeScope } from '../schemas/marketingContext.js';

const embeddingModel = process.env['OLLAMA_EMBEDDING_MODEL'] ?? 'nomic-embed-text-v2-moe';
const embeddingDimensions = Number(process.env['RAG_EMBEDDING_DIMENSIONS'] ?? 768);
const indexVersion = (process.env['RAG_INDEX_VERSION'] ?? 'pgvector-v1').replace(/[^a-zA-Z0-9_]/g, '_');
export const PROJECT_KNOWLEDGE_INDEX = `project_knowledge_${indexVersion}`;
const ollamaBaseUrl = (process.env['OLLAMA_BASE_URL'] ?? 'http://localhost:11434').replace(/\/+$/, '');
// nomic-embed-text-v2-moe accepts a maximum of 512 tokens. Character-based
// chunking cannot perfectly count tokens across English and Arabic, so leave
// plenty of headroom rather than allowing Ollama to silently truncate facts.
const CHUNK_SIZE = 800;
const CHUNK_OVERLAP = 120;
const RETRIEVAL_CANDIDATES = 18;
const RETRIEVAL_RESULTS = 6;
const STRICT_MIN_SCORE = 0.35;
// A second, bounded pass handles misspellings in brand/product names. It only
// runs after strict retrieval has no candidates, so it does not dilute normal
// grounded answers with weaker matches.
const TYPO_FALLBACK_MIN_SCORE = 0.2;

export interface KnowledgeCitation {
  sourceId: string;
  pageId?: string;
  chunkId?: string;
  sourceType: string;
  title: string;
  url?: string;
  excerpt: string;
  score: number;
}

interface IndexSourceInput {
  projectId: string;
  sourceId: string;
  sourceType: string;
  name: string;
  url?: string | null;
  content: string;
  documents?: Array<{ pageId: string; title: string; url: string; content: string }>;
}

function vectorDatabaseUrl(): string {
  const url = process.env['RAG_POSTGRES_URL'];
  if (!url) throw new Error('RAG_POSTGRES_URL is required when project knowledge RAG is enabled');
  if (!/^postgres(?:ql)?:\/\//i.test(url)) throw new Error('RAG_POSTGRES_URL must be a PostgreSQL connection URL');
  return url;
}

function vectorSchema(): string {
  const schema = process.env['RAG_POSTGRES_SCHEMA'] ?? 'rag';
  if (!/^[a-z_][a-z0-9_]*$/i.test(schema)) throw new Error('RAG_POSTGRES_SCHEMA must be a valid PostgreSQL identifier');
  return schema;
}

let vector: PgVector | undefined;
function getVector(): PgVector {
  vector ??= new PgVector({
    id: 'project-knowledge-vector',
    connectionString: vectorDatabaseUrl(),
    schemaName: vectorSchema(),
    max: Number(process.env['RAG_POSTGRES_POOL_MAX'] ?? 10),
  });
  return vector;
}
let indexReady: Promise<void> | undefined;

async function ensureIndex(): Promise<void> {
  indexReady ??= getVector().createIndex({
    indexName: PROJECT_KNOWLEDGE_INDEX,
    dimension: embeddingDimensions,
    metric: 'cosine',
    indexConfig: { type: 'hnsw', hnsw: { m: 16, efConstruction: 64 } },
    metadataIndexes: ['projectId', 'sourceId', 'pageId'],
  })
    .catch(async (error: unknown) => {
      // Concurrent workers can both try to create the same persistent index.
      if (!String(error).toLowerCase().includes('exist')) throw error;
    });
  await indexReady;
}

type EmbeddingPurpose = 'document' | 'query';

function prepareEmbeddingInput(value: string, purpose: EmbeddingPurpose): string {
  // Nomic's retrieval model was trained with these asymmetric prefixes. Keep
  // this conditional so a future embedding-model swap does not inherit a
  // model-specific prompt format.
  if (embeddingModel.startsWith('nomic-embed-text')) {
    return `${purpose === 'document' ? 'search_document' : 'search_query'}: ${value}`;
  }
  return value;
}

async function embed(values: string[], purpose: EmbeddingPurpose): Promise<number[][]> {
  const response = await fetch(`${ollamaBaseUrl}/api/embed`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: embeddingModel,
      input: values.map((value) => prepareEmbeddingInput(value, purpose)),
      truncate: false,
    }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`Ollama embedding API returned HTTP ${response.status}`);
  const body = await response.json() as { embeddings?: number[][] };
  const embeddings = body.embeddings ?? [];
  if (embeddings.length !== values.length || embeddings.some((item) => item.length !== embeddingDimensions)) {
    throw new Error(`Ollama returned embeddings that do not match the configured ${embeddingDimensions} dimensions`);
  }
  return embeddings;
}

function chunk(text: string): string[] {
  const blocks = text.trim().split(/\n\s*\n/).flatMap((block) =>
    block.replace(/\s+/g, ' ').trim().split(/(?<=[.!?؟])\s+/),
  ).filter(Boolean);
  const chunks: string[] = [];
  let current = '';

  for (const block of blocks) {
    // A single long sentence has no semantic boundary to preserve. Keep it
    // bounded rather than relying on the embedding service to truncate it.
    if (block.length > CHUNK_SIZE) {
      if (current) chunks.push(current);
      for (let start = 0; start < block.length; start += CHUNK_SIZE - CHUNK_OVERLAP) {
        chunks.push(block.slice(start, start + CHUNK_SIZE));
      }
      current = '';
      continue;
    }
    const candidate = current ? `${current} ${block}` : block;
    if (candidate.length <= CHUNK_SIZE) {
      current = candidate;
      continue;
    }
    chunks.push(current);
    // Repeat only whole trailing text where possible, which keeps an entity
    // or qualifier from disappearing at a chunk boundary.
    const overlapLength = Math.min(CHUNK_OVERLAP, Math.max(0, CHUNK_SIZE - block.length - 1));
    current = `${current.slice(-overlapLength)} ${block}`.trim();
  }
  if (current) chunks.push(current);
  return chunks;
}

export async function indexProjectKnowledge(input: IndexSourceInput): Promise<{ chunkCount: number; embeddingModel: string; indexVersion: string }> {
  await ensureIndex();
  await getVector().deleteVectors({ indexName: PROJECT_KNOWLEDGE_INDEX, filter: { sourceId: input.sourceId } }).catch(() => undefined);
  const documents = input.documents?.length
    ? input.documents
    : [{ pageId: input.sourceId, title: input.name, url: input.url ?? '', content: input.content }];
  const chunks = documents.flatMap((document) => chunk(document.content).map((text, chunkIndex) => ({ ...document, text, chunkIndex })));
  if (chunks.length === 0) return { chunkCount: 0, embeddingModel, indexVersion };
  const embeddings = await embed(chunks.map((item) => `${item.title}\n\n${item.text}`), 'document');
  const ids = chunks.map((item) => createHash('sha256').update(`${input.sourceId}:${item.pageId}:${item.chunkIndex}`).digest('hex'));
  await getVector().upsert({
    indexName: PROJECT_KNOWLEDGE_INDEX,
    vectors: embeddings,
    ids,
    metadata: chunks.map((item, index) => ({
      projectId: input.projectId,
      sourceId: input.sourceId,
      sourceType: input.sourceType,
      pageId: item.pageId,
      chunkId: ids[index],
      title: item.title,
      url: item.url,
      text: item.text,
      chunkIndex: item.chunkIndex,
      embeddingModel,
      indexVersion,
    })),
  });
  return { chunkCount: chunks.length, embeddingModel, indexVersion };
}

export async function deleteProjectKnowledge(sourceId: string): Promise<void> {
  await ensureIndex();
  await getVector().deleteVectors({ indexName: PROJECT_KNOWLEDGE_INDEX, filter: { sourceId } });
}

export async function retrieveProjectKnowledge(scope: KnowledgeScope | undefined, query: string): Promise<KnowledgeCitation[]> {
  // The Nest worker resolves this allow-list from READY rows immediately
  // before dispatch. Refuse project-only retrieval so stale/failed material
  // cannot be made eligible merely by knowing a project id.
  if (!scope?.sourceIds.length || !process.env['RAG_ENABLED'] || process.env['RAG_ENABLED'] !== 'true') return [];
  try {
    await ensureIndex();
    const [queryVector] = await embed([query], 'query');
    const search = (minScore: number) => getVector().query({
      indexName: PROJECT_KNOWLEDGE_INDEX,
      queryVector,
      topK: RETRIEVAL_CANDIDATES,
      minScore,
      ef: 80,
      filter: { $and: [{ projectId: scope.projectId }, { sourceId: { $in: scope.sourceIds } }] },
    });
    let results = await search(STRICT_MIN_SCORE);
    if (results.length === 0) results = await search(TYPO_FALLBACK_MIN_SCORE);
    const candidates = results.map((result) => {
      const metadata = result.metadata as Record<string, unknown>;
      return {
        sourceId: String(metadata.sourceId), sourceType: String(metadata.sourceType),
        ...(typeof metadata.pageId === 'string' && metadata.pageId ? { pageId: metadata.pageId } : {}),
        ...(typeof metadata.chunkId === 'string' && metadata.chunkId ? { chunkId: metadata.chunkId } : { chunkId: result.id }),
        title: String(metadata.title),
        ...(typeof metadata.url === 'string' && metadata.url ? { url: metadata.url } : {}),
        excerpt: String(metadata.text).slice(0, 600), score: result.score,
      };
    });
    return diversifyAndRerank(candidates, query);
  } catch (error) {
    console.warn(`[project-knowledge] retrieval unavailable: ${error instanceof Error ? error.message : String(error)}`);
    return [];
  }
}

function diversifyAndRerank(candidates: KnowledgeCitation[], query: string): KnowledgeCitation[] {
  const queryTerms = terms(query);
  const ranked = [...candidates].sort((a, b) => {
    // Lexical agreement matters strongly for product names, plans, and
    // numbers. A semantic near-match must not outrank a direct answer merely
    // because its embedding score is a little higher.
    const aScore = (a.score * 0.7) + (lexicalScore(a, queryTerms) * 0.3);
    const bScore = (b.score * 0.7) + (lexicalScore(b, queryTerms) * 0.3);
    return bScore - aScore;
  });
  const selected: KnowledgeCitation[] = [];
  const pageCount = new Map<string, number>();
  const sourceCount = new Map<string, number>();

  for (const citation of ranked) {
    const pageKey = citation.pageId ?? citation.sourceId;
    if ((pageCount.get(pageKey) ?? 0) >= 2 || (sourceCount.get(citation.sourceId) ?? 0) >= 3) continue;
    selected.push(citation);
    pageCount.set(pageKey, (pageCount.get(pageKey) ?? 0) + 1);
    sourceCount.set(citation.sourceId, (sourceCount.get(citation.sourceId) ?? 0) + 1);
    if (selected.length === RETRIEVAL_RESULTS) return selected;
  }
  // Returning fewer than six is preferable to crowding the prompt with near-
  // duplicate chunks from one page. The generation should say it lacks enough
  // evidence rather than manufacture breadth from repeated wording.
  return selected;
}

function terms(value: string): Set<string> {
  return new Set(value.toLocaleLowerCase().match(/[\p{L}\p{N}]{2,}/gu) ?? []);
}

function lexicalScore(citation: KnowledgeCitation, queryTerms: Set<string>): number {
  if (queryTerms.size === 0) return 0;
  const candidateTerms = terms(`${citation.title} ${citation.excerpt}`);
  let matches = 0;
  for (const term of queryTerms) if (candidateTerms.has(term)) matches += 1;
  return matches / queryTerms.size;
}
