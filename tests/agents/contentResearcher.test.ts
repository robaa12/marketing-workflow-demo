import { afterEach, describe, expect, it, vi } from 'vitest';
import { runContentResearch } from '../../src/agents/content/researcher/agent.js';
import { buildMockAgent } from '../helpers/mockAgent.js';
import type { ContentBrief } from '../../src/schemas/content.js';

const brief: ContentBrief = {
  temporalContext: {
    asOfDate: '2026-08-13',
    timeZone: 'Africa/Cairo',
    campaignStartDate: '2026-08-20',
    campaignEndDate: '2026-09-30',
  },
  brandName: 'Insight Loop',
  brandVoice: 'Direct and practical.',
  product: 'Marketing reporting automation',
  campaignGoal: 'Increase qualified demos.',
  targetAudience: 'SaaS growth leaders',
  platforms: ['linkedin'],
  duration: '1 week',
  postsPerWeek: 1,
  maxPosts: 24,
  keyMessages: ['Save reporting time.'],
  constraints: '',
};

afterEach(() => {
  vi.useRealTimers();
});

describe('Content researcher agent', () => {
  it('replaces model-supplied retrieval timestamps with the server clock', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-13T10:15:30.000Z'));
    const agent = buildMockAgent({
      trends: [],
      hashtags: ['#MarketingOps'],
      sources: [{
        title: 'Reporting benchmark',
        url: 'https://example.com/reporting',
        retrievedAt: '2020-01-01T00:00:00.000Z',
      }],
      contentHooks: [{
        platform: 'linkedin',
        angle: 'Show the hours recovered from reporting.',
        rationale: 'The audience values efficiency.',
      }],
      competitorNotes: '',
      audienceInsights: 'Leaders prefer measurable outcomes.',
    });

    const result = await runContentResearch(agent, { brief });

    expect(result.sources[0]?.retrievedAt).toBe('2026-08-13T10:15:30.000Z');
  });
});
