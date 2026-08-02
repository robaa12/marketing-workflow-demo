import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { SocialPlatformEnum, type SocialPlatform } from '../schemas/content.js';
import { getPlatformRules } from '../lib/platform-rules.js';

export const platformRulesTool = createTool({
  id: 'platform-rules',
  description:
    'Returns the formatting rules, character limits, hashtag conventions, CTA style, and best-practices for a given social platform.',
  inputSchema: z.object({
    platform: SocialPlatformEnum.describe('The platform to look up rules for.'),
  }),
  outputSchema: z.object({
    platform: SocialPlatformEnum,
    label: z.string(),
    charLimit: z.number(),
    hashtagConvention: z.string(),
    ctaStyle: z.string(),
    format: z.string(),
    bestPractices: z.array(z.string()),
  }),
  execute: async (inputData) => {
    const rules = getPlatformRules(inputData.platform as SocialPlatform);
    return rules;
  },
});
