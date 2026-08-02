import { createPerplexitySearchTool } from '@mastra/perplexity';

/**
 * Perplexity search tool for content research.
 * Provides AI-summarized web search results — better for research than raw search.
 * Requires PERPLEXITY_API_KEY or PPLX_API_KEY environment variable.
 */
export const perplexitySearchTool = createPerplexitySearchTool();
