import { describe, expect, it } from 'vitest';
import { buildBuyerJourneyAgent } from '../../src/agents/buyer-journey/agent.js';
import { buildBuyerPersonaAgent } from '../../src/agents/buyer-persona/agent.js';
import { buildCampaignPlannerAgent } from '../../src/agents/campaign-planner/agent.js';
import { buildProductAnalysisAgent } from '../../src/agents/product-analysis/agent.js';
import { buildSmartObjectivesAgent } from '../../src/agents/smart-objectives/agent.js';
import { buildSTPStrategyAgent } from '../../src/agents/stp/agent.js';
import { MarketingStrategyInputSchema } from '../../src/schemas/index.js';
import { buildMarketingStrategyWorkflow } from '../../src/workflows/marketing/index.js';
import { buildMockAgent } from '../helpers/mockAgent.js';
import {
  sampleJourney,
  sampleObjectives,
  samplePersonas,
  sampleProduct,
  sampleStp,
  sampleStrategy,
} from '../helpers/fixtures.js';

describe('Marketing Director workflow (integration)', () => {
  it('runs the full chain end-to-end with mock agents', async () => {
    // Build real agents then patch their `generate` with typed mocks that
    // return matching fixtures. This exercises the real wiring code paths
    // while keeping the test deterministic and free of any LLM cost.
    const productAgent = buildProductAnalysisAgent();
    const stpAgent = buildSTPStrategyAgent();
    const personaAgent = buildBuyerPersonaAgent();
    const journeyAgent = buildBuyerJourneyAgent();
    const objectivesAgent = buildSmartObjectivesAgent();
    const campaignAgent = buildCampaignPlannerAgent();

    (productAgent.generate as unknown as ReturnType<typeof buildMockAgent>['generate']) =
      buildMockAgent(sampleProduct).generate;
    (stpAgent.generate as unknown as ReturnType<typeof buildMockAgent>['generate']) =
      buildMockAgent(sampleStp).generate;
    (personaAgent.generate as unknown as ReturnType<typeof buildMockAgent>['generate']) =
      buildMockAgent(samplePersonas).generate;
    (journeyAgent.generate as unknown as ReturnType<typeof buildMockAgent>['generate']) =
      buildMockAgent([sampleJourney]).generate;
    (objectivesAgent.generate as unknown as ReturnType<typeof buildMockAgent>['generate']) =
      buildMockAgent(sampleObjectives).generate;
    (campaignAgent.generate as unknown as ReturnType<typeof buildMockAgent>['generate']) =
      buildMockAgent(sampleStrategy).generate;

    const workflow = buildMarketingStrategyWorkflow({
      productAnalysisAgent: productAgent,
      stpStrategyAgent: stpAgent,
      stpResearcher: async () => ({ queries: ['test query'], citations: [], warnings: [] }),
      buyerPersonaAgent: personaAgent,
      buyerJourneyAgent: journeyAgent,
      smartObjectivesAgent: objectivesAgent,
      campaignPlannerAgent: campaignAgent,
    });

    const input = MarketingStrategyInputSchema.parse({
      description: 'A SaaS that automates marketing reporting',
      industry: 'Software',
      businessType: 'SaaS',
    });

    const run = await workflow.createRun();
    const result = await run.start({ inputData: input });

    expect(result.status).toBe('success');
    if (result.status !== 'success') return;

    // Final response shape exactly matches the spec.
    expect(result.result.product.name).toBe('Insight Loop');
    expect(result.result.stp.segments).toHaveLength(2);
    expect(result.result.personas).toHaveLength(1);
    expect(result.result.buyerJourney).toHaveLength(1);
    expect(result.result.smartObjectives).toHaveLength(1);
    expect(result.result.campaignStrategy.primaryChannels).toHaveLength(2);
    expect(result.result.planQuality.channelForecast).toHaveLength(2);
    expect(result.result.planQuality.status).toBe('needs-evidence');
  });

  it('returns a failed status when an agent throws', { timeout: 15_000 }, async () => {
    const productAgent = buildProductAnalysisAgent();
    (productAgent.generate as unknown as ReturnType<typeof buildMockAgent>['generate']) =
      failingAgent().generate;

    const workflow = buildMarketingStrategyWorkflow({
      productAnalysisAgent: productAgent,
      stpStrategyAgent: buildSTPStrategyAgent(),
      stpResearcher: async () => ({ queries: ['test query'], citations: [], warnings: [] }),
      buyerPersonaAgent: buildBuyerPersonaAgent(),
      buyerJourneyAgent: buildBuyerJourneyAgent(),
      smartObjectivesAgent: buildSmartObjectivesAgent(),
      campaignPlannerAgent: buildCampaignPlannerAgent(),
    });

    const input = MarketingStrategyInputSchema.parse({
      description: 'A SaaS that automates marketing reporting',
      industry: 'Software',
      businessType: 'SaaS',
    });

    const run = await workflow.createRun();
    const result = await run.start({ inputData: input });

    expect(result.status).toBe('failed');
  });
});

/**
 * Build a mock agent whose `generate()` throws. Used to exercise the
 * workflow's failure path.
 */
function failingAgent() {
  const generate = (async () => {
    throw new Error('Product agent exploded');
  }) as unknown as ReturnType<typeof buildMockAgent>['generate'];
  return { generate };
}
