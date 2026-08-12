import { beforeEach, describe, expect, it, vi } from 'vitest';

const vector = vi.hoisted(() => ({
  createIndex: vi.fn().mockResolvedValue(undefined),
  deleteVectors: vi.fn().mockResolvedValue(undefined),
  upsert: vi.fn().mockResolvedValue([]),
  query: vi.fn(),
}));

vi.mock('@mastra/pg', () => ({
  PgVector: class {
    constructor(_: unknown) {
      return vector;
    }
  },
}));

const scope = {
  projectId: '11111111-1111-4111-8111-111111111111',
  sourceIds: ['22222222-2222-4222-8222-222222222222'],
};

describe('project knowledge retrieval', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    process.env.RAG_ENABLED = 'true';
    process.env.RAG_EMBEDDING_DIMENSIONS = '3';
    process.env.OLLAMA_EMBEDDING_MODEL = 'test-embedding-model';
    process.env.RAG_POSTGRES_URL =
      'postgresql://postgres:postgres@localhost:5432/iti_graduation';
  });

  it('does not retrieve without eligible source IDs', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const { retrieveProjectKnowledge } =
      await import('../../src/lib/project-knowledge.js');

    await expect(
      retrieveProjectKnowledge(
        { projectId: scope.projectId, sourceIds: [] },
        'What is the approved positioning?',
      ),
    ).resolves.toEqual([]);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(vector.query).not.toHaveBeenCalled();
  });

  it('filters results by project and the eligible-source allow-list', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ embeddings: [[0.1, 0.2, 0.3]] }),
      }),
    );
    vector.query.mockResolvedValue([
      {
        id: 'chunk-1',
        score: 0.88,
        metadata: {
          sourceId: scope.sourceIds[0],
          sourceType: 'WEBSITE',
          pageId: 'page-1',
          title: 'Pricing',
          url: 'https://example.com/pricing',
          text: 'Annual plans include onboarding support.',
        },
      },
    ]);
    const { retrieveProjectKnowledge } =
      await import('../../src/lib/project-knowledge.js');

    const citations = await retrieveProjectKnowledge(
      scope,
      'What does onboarding include?',
    );

    expect(vector.query).toHaveBeenCalledWith(
      expect.objectContaining({
        topK: 18,
        minScore: 0.35,
        filter: {
          $and: [
            { projectId: scope.projectId },
            { sourceId: { $in: scope.sourceIds } },
          ],
        },
      }),
    );
    expect(vector.createIndex).toHaveBeenCalledWith(
      expect.objectContaining({
        dimension: 3,
        metric: 'cosine',
        indexConfig: {
          type: 'hnsw',
          hnsw: { m: 16, efConstruction: 64 },
        },
        metadataIndexes: ['projectId', 'sourceId', 'pageId'],
      }),
    );
    expect(citations).toEqual([
      expect.objectContaining({
        sourceId: scope.sourceIds[0],
        pageId: 'page-1',
        title: 'Pricing',
        score: 0.88,
      }),
    ]);
  });

  it('uses the bounded typo fallback after strict retrieval misses', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ embeddings: [[0.1, 0.2, 0.3]] }),
      }),
    );
    vector.query
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          id: 'brand-overview',
          score: 0.26,
          metadata: {
            sourceId: scope.sourceIds[0],
            sourceType: 'WEBSITE',
            pageId: 'home',
            title: 'Protein Box Egypt',
            text: 'Fresh high-protein meals delivered across Egypt.',
          },
        },
      ]);
    const { retrieveProjectKnowledge } =
      await import('../../src/lib/project-knowledge.js');

    await expect(
      retrieveProjectKnowledge(scope, 'what is protienbox edypt?'),
    ).resolves.toEqual([
      expect.objectContaining({ title: 'Protein Box Egypt', score: 0.26 }),
    ]);
    expect(vector.query).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ minScore: 0.35 }),
    );
    expect(vector.query).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ minScore: 0.2 }),
    );
  });

  it('requires a PostgreSQL vector connection before indexing', async () => {
    delete process.env.RAG_POSTGRES_URL;
    const { indexProjectKnowledge } =
      await import('../../src/lib/project-knowledge.js');

    await expect(
      indexProjectKnowledge({
        projectId: scope.projectId,
        sourceId: scope.sourceIds[0]!,
        sourceType: 'DOCUMENT',
        name: 'Brand handbook',
        content: 'Approved brand material.',
      }),
    ).rejects.toThrow('RAG_POSTGRES_URL is required');
  });
});
