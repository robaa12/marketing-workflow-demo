import { describe, expect, it } from 'vitest';
import { hasOpenAiScorerCredentials } from '../../src/lib/scorers.js';

describe('optional content scorers', () => {
  it('does not enable OpenAI scorers without a usable API key', () => {
    expect(hasOpenAiScorerCredentials({})).toBe(false);
    expect(hasOpenAiScorerCredentials({ OPENAI_API_KEY: '   ' })).toBe(false);
  });

  it('enables OpenAI scorers when a key is configured', () => {
    expect(hasOpenAiScorerCredentials({ OPENAI_API_KEY: 'test-key' })).toBe(true);
  });
});
