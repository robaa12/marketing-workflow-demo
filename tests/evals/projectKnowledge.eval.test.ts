import { describe, expect, it } from 'vitest';
import { evaluateRetrieval, type RetrievalEvaluationCase } from '../../src/lib/rag-evaluation.js';

const sourceId = '22222222-2222-4222-8222-222222222222';
const citation = (chunkId: string, title: string) => ({
  sourceId,
  chunkId,
  sourceType: 'DOCUMENT',
  title,
  excerpt: title,
  score: 0.8,
});

// This fixture is deliberately provider-free. Add cases whenever a production
// retrieval failure is fixed so the quality bar grows with the product.
const cases: RetrievalEvaluationCase[] = [
  {
    id: 'annual-plan-onboarding',
    expectedChunkIds: ['pricing-annual'],
    results: [citation('pricing-annual', 'Annual plans include onboarding support')],
  },
  {
    id: 'approved-claim-document',
    expectedChunkIds: ['proof-five-hours'],
    results: [citation('unrelated', 'General campaign overview'), citation('proof-five-hours', 'Customers save five hours every week')],
  },
  {
    id: 'no-answer-does-not-hallucinate',
    expectedChunkIds: [],
    results: [],
  },
];

describe('project knowledge retrieval evaluation', () => {
  it('meets the initial relevance and no-answer quality gates', () => {
    const metrics = evaluateRetrieval(cases);

    expect(metrics).toEqual({
      caseCount: 3,
      answerableCaseCount: 2,
      recallAtK: 1,
      meanReciprocalRank: 0.75,
      precisionAtK: 0.75,
      noAnswerAccuracy: 1,
    });
    expect(metrics.recallAtK).toBeGreaterThanOrEqual(0.9);
    expect(metrics.meanReciprocalRank).toBeGreaterThanOrEqual(0.7);
    expect(metrics.noAnswerAccuracy).toBeGreaterThanOrEqual(0.95);
  });
});
