import { createTool } from '@mastra/core/tools';
import { z } from 'zod';

function getTavilyApiKey(): string {
  const key = process.env['TAVILY_API_KEY'];
  if (!key) {
    throw new Error(
      'TAVILY_API_KEY is not set. Get a free key at https://app.tavily.com and add it to your .env file.',
    );
  }
  return key;
}

export const webSearchTool = createTool({
  id: 'web-search',
  description:
    'Search the web for real-time market data, competitor information, industry trends, demographics, and benchmarks. Use this to ground your analysis in real-world data rather than assumptions.',
  inputSchema: z.object({
    query: z.string().describe('The search query. Be specific about industry, geography, and data type.'),
    maxResults: z
      .number()
      .min(1)
      .max(10)
      .optional()
      .default(5)
      .describe('Maximum number of results to return (1-10).'),
    topic: z
      .enum(['general', 'news', 'finance'])
      .optional()
      .default('general')
      .describe('Search topic category. Use "finance" for market data.'),
  }),
  outputSchema: z.object({
    answer: z.string().optional().describe('AI-generated summary of search results.'),
    results: z.array(
      z.object({
        title: z.string(),
        url: z.string(),
        content: z.string(),
        score: z.number(),
      }),
    ),
  }),
  execute: async ({ query, maxResults, topic }, { abortSignal }) => {
    const { tavily } = await import('@tavily/core');
    const client = tavily({ apiKey: getTavilyApiKey() });

    const response = await client.search(query, {
      maxResults,
      topic,
      searchDepth: 'basic',
      includeAnswer: true,
    }, );

    return {
      answer: response.answer,
      results: response.results.map((r) => ({
        title: r.title,
        url: r.url,
        content: r.content,
        score: r.score,
      })),
    };
  },
});
