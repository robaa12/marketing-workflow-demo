import { Agent } from '@mastra/core/agent';
import type { TracingContext } from '@mastra/core/observability';
import type { z } from 'zod';
import { getModel } from '../../../lib/model.js';
import { safeGenerate } from '../../../lib/safeGenerate.js';
import {
  ContentStrategySchema,
  type ContentBrief,
  type ResearchOutput,
} from '../../../schemas/content.js';
import { CONTENT_STRATEGY_PROMPT } from '../../../prompts/contentStrategy.js';

export type ContentStrategyResult = z.infer<typeof ContentStrategySchema>;

/**
 * Build the content strategy agent.
 */
export function buildContentStrategyAgent(model: string = getModel()): Agent {
  return new Agent({
    id: 'content-strategy-agent',
    name: 'Content Strategy Agent',
    description:
      'Converts a campaign brief + research findings into a content strategy with pillars, tone, and narrative.',
    instructions: CONTENT_STRATEGY_PROMPT,
    model,
  });
}

export interface ContentStrategyInput {
  brief: ContentBrief;
  research: ResearchOutput;
}

/**
 * Run the content strategy agent against a brief + research.
 */
export async function runContentStrategy(
  agent: Agent,
  input: ContentStrategyInput,
  tracingContext?: TracingContext,
): Promise<ContentStrategyResult> {
  const { brief, research } = input;

  const researchSummary = [
    'Trends:',
    ...research.trends.map((t) => `- ${t.title}: ${t.summary}`),
    '',
    `Trending hashtags in play: ${research.hashtags.join(', ')}`,
    '',
    `Competitor notes: ${research.competitorNotes}`,
    '',
    `Audience insights: ${research.audienceInsights}`,
  ].join('\n');

  const prompt = `Write the content strategy.

== CAMPAIGN BRIEF ==
${JSON.stringify(brief, null, 2)}

== RESEARCH FINDINGS ==
${researchSummary}

Return the structured object per schema.`;

  return safeGenerate(
    agent,
    [{ role: 'user', content: prompt }],
    ContentStrategySchema,
    'content-strategy',
    { timeoutMs: 150_000, tracingContext },
  );
}
