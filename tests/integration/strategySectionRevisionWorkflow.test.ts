import { describe, expect, it } from 'vitest';
import { MarketingStrategyOutputSchema } from '../../src/schemas/index.js';
import { buildStrategySectionRevisionWorkflow } from '../../src/workflows/marketing/index.js';
import { buildMockAgent } from '../helpers/mockAgent.js';
import {
  sampleJourney,
  sampleObjectives,
  samplePersonas,
  sampleProduct,
  sampleStp,
  sampleStrategy,
} from '../helpers/fixtures.js';

const strategy = MarketingStrategyOutputSchema.parse({
  product: sampleProduct,
  stp: sampleStp,
  personas: samplePersonas,
  buyerJourney: [sampleJourney],
  smartObjectives: sampleObjectives,
  campaignStrategy: sampleStrategy,
  planQuality: {
    score: 88,
    status: 'ready-for-review',
    evidenceSources: [],
    assumptionRegister: [],
    baselineStatus: sampleObjectives.map((objective) => ({
      objectiveId: objective.id,
      status: 'known',
      baseline: 'Supplied by reviewer',
    })),
    channelForecast: sampleStrategy.primaryChannels.map((channel) => ({
      channel: channel.channel,
      allocationPercent: channel.estimatedShare,
      primaryKpis: channel.expectedKpis,
      status: 'requires-budget-and-baseline',
    })),
    issues: [],
    nextDecisions: ['Approve the revised section.'],
    strategyRevision: {
      attempted: false,
      addressedIssueCodes: [],
      remainingActionableIssueCodes: [],
    },
  },
  knowledgeSources: [],
});

describe('strategy section revision workflow', () => {
  it('replaces only personas and forwards reviewer feedback to that agent', async () => {
    const revisedPersonas = [{ ...samplePersonas[0], name: 'Mona Hassan' }];
    const personaAgent = buildMockAgent(revisedPersonas);
    const workflow = buildStrategySectionRevisionWorkflow({
      buyerPersonaAgent: personaAgent,
      buyerJourneyAgent: buildMockAgent([sampleJourney]),
      smartObjectivesAgent: buildMockAgent(sampleObjectives),
    });

    const result = await (await workflow.createRun()).start({
      inputData: {
        strategy,
        section: 'personas',
        feedback: 'Use a persona from the Egyptian market.',
      },
    });

    expect(result.status).toBe('success');
    if (result.status !== 'success') return;
    expect(result.result.personas[0]?.name).toBe('Mona Hassan');
    expect(result.result.buyerJourney).toEqual(strategy.buyerJourney);
    expect(result.result.smartObjectives).toEqual(strategy.smartObjectives);
    expect(result.result.campaignStrategy).toEqual(strategy.campaignStrategy);
    expect(personaAgent.generate).toHaveBeenCalledOnce();
    expect(personaAgent.generate).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          content: expect.stringContaining('Use a persona from the Egyptian market.'),
        }),
      ]),
      expect.any(Object),
    );
  });
});
