import { describe, expect, it } from 'vitest';
import {
  ChatTitleResultSchema,
  countTitleWords,
  fallbackChatTitle,
  runChatTitle,
} from '../../src/agents/chat-title/agent.js';
import { buildMockAgent } from '../helpers/mockAgent.js';

const brief = {
  brandName: 'Ember Goods',
  product: 'A smart mug that keeps coffee at the perfect temperature',
  industry: 'Consumer technology',
  businessType: 'Direct to consumer',
  campaignGoal: 'launch',
  targetAudience: 'Busy creative professionals',
};

describe('Chat Title agent', () => {
  it('returns a four or five word structured title', async () => {
    const result = await runChatTitle(
      buildMockAgent({ title: 'Ember Smart Mug Launch' }),
      brief,
    );

    expect(result.title).toBe('Ember Smart Mug Launch');
    expect(countTitleWords(result.title)).toBe(4);
  });

  it('rejects titles outside the word limit', () => {
    expect(() => ChatTitleResultSchema.parse({ title: 'Smart Mug' })).toThrow();
    expect(() =>
      ChatTitleResultSchema.parse({ title: 'One Two Three Four Five Six' }),
    ).toThrow();
  });

  it('builds a valid deterministic fallback', () => {
    const result = fallbackChatTitle(brief);
    expect(countTitleWords(result.title)).toBeGreaterThanOrEqual(4);
    expect(countTitleWords(result.title)).toBeLessThanOrEqual(5);
    expect(result.title).toContain('Ember');
  });
});
