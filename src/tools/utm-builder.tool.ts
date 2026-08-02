import { createTool } from '@mastra/core/tools';
import { z } from 'zod';

function normalizeTag(value: string): string {
  return value.trim().toLocaleLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

export function buildUtmUrl(input: {
  destinationUrl: string;
  source: string;
  medium: string;
  campaign: string;
  content?: string;
  term?: string;
}): string {
  const url = new URL(input.destinationUrl);
  url.searchParams.set('utm_source', normalizeTag(input.source));
  url.searchParams.set('utm_medium', normalizeTag(input.medium));
  url.searchParams.set('utm_campaign', normalizeTag(input.campaign));
  if (input.content) url.searchParams.set('utm_content', normalizeTag(input.content));
  if (input.term) url.searchParams.set('utm_term', normalizeTag(input.term));
  return url.toString();
}

export const utmBuilderTool = createTool({
  id: 'utm-builder',
  description: 'Builds a normalized UTM-tracked destination URL. Use for campaign links; it does not publish or shorten links.',
  strict: true,
  inputExamples: [{
    input: {
      destinationUrl: 'https://example.com/demo',
      source: 'LinkedIn',
      medium: 'Organic Social',
      campaign: 'Q3 Reporting Launch',
      content: 'Efficiency Post',
    },
  }],
  inputSchema: z.object({
    destinationUrl: z.string().url(),
    source: z.string().min(1).max(100),
    medium: z.string().min(1).max(100),
    campaign: z.string().min(1).max(100),
    content: z.string().min(1).max(100).optional(),
    term: z.string().min(1).max(100).optional(),
  }),
  outputSchema: z.object({ url: z.string().url() }),
  execute: async (input) => ({ url: buildUtmUrl(input) }),
});
