import type { ProductProfile, STPResearch } from '../schemas/index.js';
import {
  getResearchEvidence,
  type ResearchEvidenceInput,
} from '../tools/research-evidence.tool.js';
import { withTimeout } from './timeout.js';

const DEFAULT_RESEARCH_TIMEOUT_MS = 15_000;

export type STPResearchRunner = (product: ProductProfile) => Promise<STPResearch>;
export type ResearchEvidenceFetcher = (
  input: ResearchEvidenceInput,
  abortSignal?: AbortSignal,
) => ReturnType<typeof getResearchEvidence>;

function getResearchTimeoutMs(): number {
  const configured = Number.parseInt(process.env['MASTRA_RESEARCH_TIMEOUT_MS'] ?? '', 10);
  if (!Number.isFinite(configured)) return DEFAULT_RESEARCH_TIMEOUT_MS;
  return Math.min(Math.max(configured, 3_000), 30_000);
}

export async function researchSTPMarket(
  product: ProductProfile,
  fetchEvidence: ResearchEvidenceFetcher = getResearchEvidence,
): Promise<STPResearch> {
  const queries = [
    `${product.industry} market segments buyer profiles and growth trends`,
    `${product.type} competitor positioning target customers and differentiation`,
  ];
  const timeoutMs = getResearchTimeoutMs();
  const results = await Promise.allSettled(queries.map(async (query) => {
    const startedAt = Date.now();
    console.info(`[stp-research] query started: ${query}`);
    try {
      const result = await withTimeout(
        (abortSignal) => fetchEvidence({ query, maxResults: 4 }, abortSignal),
        timeoutMs,
        `STP research query: ${query}`,
      );
      console.info(
        `[stp-research] query completed in ${Date.now() - startedAt}ms with ${result.citations.length} citations`,
      );
      return result;
    } catch (error) {
      console.warn(
        `[stp-research] query failed after ${Date.now() - startedAt}ms: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw error;
    }
  }));

  const warnings: string[] = [];
  const citationsByUrl = new Map<string, STPResearch['citations'][number]>();
  results.forEach((result, index) => {
    if (result.status === 'rejected') {
      const reason = result.reason instanceof Error ? result.reason.message : String(result.reason);
      warnings.push(`${queries[index]}: ${reason}`);
      return;
    }
    for (const citation of result.value.citations) {
      citationsByUrl.set(citation.url, {
        title: citation.title,
        url: citation.url,
        publisher: citation.publisher,
        excerpt: citation.excerpt,
        retrievedAt: citation.retrievedAt,
      });
    }
  });

  return {
    queries,
    citations: [...citationsByUrl.values()].slice(0, 10),
    warnings,
  };
}
