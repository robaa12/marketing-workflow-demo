import { Agent } from '@mastra/core/agent';
import type { z } from 'zod';
import { getModel } from '../../../lib/model.js';
import { safeGenerate } from '../../../lib/safeGenerate.js';
import { getPlatformRules } from '../../../lib/platform-rules.js';
import { brandContextTool, claimVerifierTool } from '../../../tools/index.js';
import {
  QAReviewResultSchema,
  type Post,
  type ContentBrief,
  type ContentStrategy,
  type ResearchOutput,
  type SocialPlatform,
  type QAReviewResult,
} from '../../../schemas/content.js';
import { EDITOR_QA_PROMPT } from '../../../prompts/editorQa.js';
import { qaScorers } from '../../../lib/scorers.js';

export type EditorQaResult = QAReviewResult;

/**
 * Build the editor / QA agent.
 * Includes tone consistency scorer for quality measurement.
 */
export function buildEditorQaAgent(model: string = getModel()): Agent {
  return new Agent({
    id: 'editor-qa-agent',
    name: 'Editor / QA Agent',
    description: 'Reviews content against brand voice and platform limits. Returns pass/fail with specific feedback for rewrites.',
    instructions: EDITOR_QA_PROMPT,
    model,
    tools: { brandContext: brandContextTool, claimVerifier: claimVerifierTool },
    scorers: qaScorers,
  });
}

export interface EditorQaInput {
  brief: ContentBrief;
  strategy: ContentStrategy;
  research: ResearchOutput;
  posts: Post[];
  iteration?: number;
}

/**
 * Run the editor / QA agent against a set of posts.
 * Returns a QAReviewResult with pass/fail status and feedback for rewrites.
 */
export async function runQA(
  agent: Agent,
  input: EditorQaInput,
): Promise<EditorQaResult> {
  const { brief, strategy, research, posts, iteration = 1 } = input;
  if (posts.length === 0) {
    return { passed: true, posts: [], notes: [], feedback: [] };
  }

  const limits = posts
    .map((p) => {
      const rules = getPlatformRules(p.platform as SocialPlatform);
      const over = p.caption.length > rules.charLimit;
      return `- [${p.postId}] ${p.platform}: limit=${rules.charLimit} actual=${p.caption.length} ${over ? 'OVER LIMIT' : 'ok'}`;
    })
    .join('\n');

  const prompt = `Review the full content set. This is review iteration #${iteration}.

== BRAND ==
${brief.brandName} — voice: ${brief.brandVoice}
Campaign goal: ${brief.campaignGoal}
Constraints: ${brief.constraints || 'none'}

== STRATEGY ==
Core narrative: ${strategy.coreNarrative}
Content pillars:
${strategy.contentPillars.map((p) => `- ${p.name}: ${p.description}`).join('\n')}
Tone per platform:
${Object.entries(strategy.tonePerPlatform).map(([platform, tone]) => `- ${platform}: ${tone}`).join('\n')}

== KEY MESSAGES TO COVER ==
${brief.keyMessages.map((m) => `- ${m}`).join('\n') || 'None specified'}

== RESEARCH CITATIONS ==
${research.sources.map((source) => `- ${source.title}: ${source.url}`).join('\n')}

== PLATFORM-LIMIT CHECK ==
${limits}

== POSTS TO REVIEW ==
${JSON.stringify(posts, null, 2)}

== YOUR JOB ==
1. Check every post against brand voice, platform limits, constraints, and quality.
2. **Check strategic coverage**: Are all content pillars represented? Is the core narrative evident? Does each platform's tone match the strategy? Are key messages woven in?
3. If ALL posts pass (including strategic coverage): set passed=true, return posts as-is, leave feedback empty.
4. If ANY post needs rewrites: set passed=false, fix minor issues directly in posts, but for MAJOR issues (wrong tone, weak CTA, off-brand, over limit, missing pillar coverage) add specific feedback with actionable rewrite instructions.
5. feedback.suggestion must be specific enough for the copywriter to act on — not "make it better" but "rewrite this as a question hook targeting burned-out managers" or "this post doesn't cover the efficiency pillar — add a time-saving angle".

Return the structured object per schema.`;

  return safeGenerate(
    agent,
    [{ role: 'user', content: prompt }],
    QAReviewResultSchema,
    'editor-qa',
  );
}
