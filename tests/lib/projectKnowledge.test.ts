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
    process.env.RAG_EMBEDDING_PROVIDER = 'ollama';
    process.env.RAG_EMBEDDING_DIMENSIONS = '3';
    process.env.OLLAMA_EMBEDDING_MODEL = 'test-embedding-model';
    delete process.env.GEMINI_API_KEY;
    delete process.env.GOOGLE_API_KEY;
    delete process.env.GEMINI_EMBEDDING_MODEL;
    delete process.env.GEMINI_EMBEDDING_BATCH_SIZE;
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

  it('uses Gemini Embedding 2 document formatting and a provider-safe index', async () => {
    process.env.RAG_EMBEDDING_PROVIDER = 'gemini';
    process.env.GEMINI_API_KEY = 'test-gemini-key';
    process.env.GEMINI_EMBEDDING_MODEL = 'gemini-embedding-2';
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        embeddings: [{ values: [0.1, 0.2, 0.3] }],
      }),
    });
    vi.stubGlobal('fetch', fetchMock);
    const { indexProjectKnowledge, PROJECT_KNOWLEDGE_INDEX } =
      await import('../../src/lib/project-knowledge.js');

    const result = await indexProjectKnowledge({
      projectId: scope.projectId,
      sourceId: scope.sourceIds[0]!,
      sourceType: 'DOCUMENT',
      name: 'Brand handbook',
      content: 'Approved brand material.',
    });

    expect(PROJECT_KNOWLEDGE_INDEX).toContain(
      'gemini_gemini_embedding_2_3',
    );
    expect(fetchMock).toHaveBeenCalledWith(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-2:batchEmbedContents',
      expect.objectContaining({
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': 'test-gemini-key',
        },
      }),
    );
    const request = fetchMock.mock.calls[0]?.[1] as { body: string };
    expect(JSON.parse(request.body)).toEqual({
      requests: [
        {
          model: 'models/gemini-embedding-2',
          content: {
            parts: [
              {
                text: 'title: Brand handbook | text: Approved brand material.',
              },
            ],
          },
          embedContentConfig: { outputDimensionality: 3 },
        },
      ],
    });
    expect(result).toEqual(
      expect.objectContaining({
        chunkCount: 1,
        embeddingProvider: 'gemini',
        embeddingModel: 'gemini-embedding-2',
      }),
    );
  });

  it('uses Gemini Embedding 2 search-query formatting', async () => {
    process.env.RAG_EMBEDDING_PROVIDER = 'gemini';
    process.env.GEMINI_API_KEY = 'test-gemini-key';
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        embeddings: [{ values: [0.1, 0.2, 0.3] }],
      }),
    });
    vi.stubGlobal('fetch', fetchMock);
    vector.query.mockResolvedValue([]);
    const { retrieveProjectKnowledge } =
      await import('../../src/lib/project-knowledge.js');

    await retrieveProjectKnowledge(scope, 'What is the approved positioning?');

    const request = fetchMock.mock.calls[0]?.[1] as { body: string };
    expect(JSON.parse(request.body)).toEqual({
      requests: [
        {
          model: 'models/gemini-embedding-2',
          content: {
            parts: [
              {
                text: 'task: search result | query: What is the approved positioning?',
              },
            ],
          },
          embedContentConfig: { outputDimensionality: 3 },
        },
      ],
    });
  });

  it('uses retrieval task types with Gemini Embedding 1', async () => {
    process.env.RAG_EMBEDDING_PROVIDER = 'gemini';
    process.env.GEMINI_API_KEY = 'test-gemini-key';
    process.env.GEMINI_EMBEDDING_MODEL = 'gemini-embedding-001';
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        embeddings: [{ values: [0.1, 0.2, 0.3] }],
      }),
    });
    vi.stubGlobal('fetch', fetchMock);
    const { indexProjectKnowledge } =
      await import('../../src/lib/project-knowledge.js');

    await indexProjectKnowledge({
      projectId: scope.projectId,
      sourceId: scope.sourceIds[0]!,
      sourceType: 'DOCUMENT',
      name: 'Brand handbook',
      content: 'Approved brand material.',
    });

    const request = fetchMock.mock.calls[0]?.[1] as { body: string };
    expect(JSON.parse(request.body)).toEqual({
      requests: [
        {
          model: 'models/gemini-embedding-001',
          content: {
            parts: [
              { text: 'Brand handbook\n\nApproved brand material.' },
            ],
          },
          embedContentConfig: {
            outputDimensionality: 3,
            taskType: 'RETRIEVAL_DOCUMENT',
          },
        },
      ],
    });
  });

  it('requires a Gemini API key only when Gemini is selected', async () => {
    process.env.RAG_EMBEDDING_PROVIDER = 'gemini';
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
    ).rejects.toThrow(
      'GEMINI_API_KEY or GOOGLE_API_KEY is required when RAG_EMBEDDING_PROVIDER=gemini',
    );
  });
});
