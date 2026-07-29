import { describe, expect, it } from 'vitest';
import { runProductAnalysis } from '../../src/agents/product-analysis/agent.js';
import { ProductProfileSchema } from '../../src/schemas/index.js';
import { buildMockAgent } from '../helpers/mockAgent.js';

const baseProduct = ProductProfileSchema.parse({
  name: 'Insight Loop',
  type: 'B2B SaaS',
  industry: 'Software',
  businessModel: 'saas',
  productMaturity: 'growth',
  pricingModel: 'subscription',
  coreFeatures: ['Automated reporting'],
  customerProblems: ['Reporting eats hours every week'],
  valueProposition: 'Reports in 5 minutes, not 5 hours.',
  uniqueSellingPoints: ['30+ integrations'],
  differentiators: ['No consultant required'],
});

describe('Product Analysis agent', () => {
  it('returns the agent\'s structured object', async () => {
    const agent = buildMockAgent(baseProduct);
    const result = await runProductAnalysis(agent, {
      description: 'A SaaS that automates marketing reporting',
      industry: 'Software',
      businessType: 'SaaS',
    });
    expect(result.name).toBe('Insight Loop');
  });

  it('parses the agent output against the schema', async () => {
    const agent = buildMockAgent(baseProduct);
    const result = await runProductAnalysis(agent, {
      description: 'A SaaS that automates marketing reporting',
      industry: 'Software',
      businessType: 'SaaS',
    });
    // If parsing fails this test fails — that's the assertion.
    expect(result).toBeDefined();
    expect(result.uniqueSellingPoints).toContain('30+ integrations');
  });

  it('throws when the agent returns an invalid object', async () => {
    const agent = buildMockAgent({ name: '', type: '', industry: '' });
    await expect(
      runProductAnalysis(agent, {
        description: 'A SaaS that automates marketing reporting',
        industry: 'Software',
        businessType: 'SaaS',
      }),
    ).rejects.toThrow();
  });
});
