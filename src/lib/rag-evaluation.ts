import type { KnowledgeCitation } from './project-knowledge.js';

/** A deterministic retrieval case; no model or vector provider is required. */
export interface RetrievalEvaluationCase {
  id: string;
  expectedChunkIds: string[];
  results: KnowledgeCitation[];
}

export interface RetrievalEvaluationMetrics {
  caseCount: number;
  answerableCaseCount: number;
  recallAtK: number;
  meanReciprocalRank: number;
  precisionAtK: number;
  noAnswerAccuracy: number;
}

/**
 * Measures the part of RAG we can prove deterministically: whether retrieval
 * returns the approved supporting chunks and correctly stays silent when the
 * corpus has no answer. Generation faithfulness is assessed separately by the
 * claim audit.
 */
export function evaluateRetrieval(
  cases: RetrievalEvaluationCase[],
  k = 6,
): RetrievalEvaluationMetrics {
  if (!Number.isInteger(k) || k < 1) throw new Error('k must be a positive integer');
  let answerable = 0;
  let hits = 0;
  let reciprocalRank = 0;
  let precisionTotal = 0;
  let noAnswerCases = 0;
  let correctNoAnswer = 0;

  for (const testCase of cases) {
    const retrieved = testCase.results.slice(0, k);
    const expected = new Set(testCase.expectedChunkIds);
    if (expected.size === 0) {
      noAnswerCases += 1;
      if (retrieved.length === 0) correctNoAnswer += 1;
      continue;
    }
    answerable += 1;
    const firstRelevantIndex = retrieved.findIndex((citation) =>
      Boolean(citation.chunkId && expected.has(citation.chunkId)),
    );
    if (firstRelevantIndex >= 0) {
      hits += 1;
      reciprocalRank += 1 / (firstRelevantIndex + 1);
    }
    const relevantCount = retrieved.filter((citation) =>
      Boolean(citation.chunkId && expected.has(citation.chunkId)),
    ).length;
    precisionTotal += relevantCount / Math.min(k, Math.max(1, retrieved.length));
  }

  return {
    caseCount: cases.length,
    answerableCaseCount: answerable,
    recallAtK: ratio(hits, answerable),
    meanReciprocalRank: ratio(reciprocalRank, answerable),
    precisionAtK: ratio(precisionTotal, answerable),
    noAnswerAccuracy: ratio(correctNoAnswer, noAnswerCases),
  };
}

function ratio(numerator: number, denominator: number): number {
  return denominator === 0 ? 1 : numerator / denominator;
}
