import { Agent } from '@mastra/core/agent';
import { getModel } from '../../lib/model.js';
import { safeGenerate } from '../../lib/safeGenerate.js';
import { CONTENT_ITEM_PROMPT } from '../../prompts/contentItem.js';
import {
  GeneratedContentItemSchema,
  type ContentItemGenerationInput,
  type GeneratedContentItem,
} from '../../schemas/generated-content.js';

export function buildContentItemAgent(model: string = getModel()): Agent {
  return new Agent({
    id: 'content-item-agent',
    name: 'Content Item Agent',
    description: 'Generates or revises one campaign content asset.',
    instructions: CONTENT_ITEM_PROMPT,
    model,
  });
}

export function runContentItemGeneration(
  agent: Agent,
  input: ContentItemGenerationInput,
): Promise<GeneratedContentItem> {
  return safeGenerate(
    agent,
    [
      {
        role: 'user',
        content: `Create this campaign asset from the following JSON input:\n${JSON.stringify(input)}`,
      },
    ],
    GeneratedContentItemSchema,
    'content-item',
  );
}
