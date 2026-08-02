/**
 * Run the marketing strategy workflow from the command line.
 *
 * Usage:
 *   pnpm dev "Product description here, industry, business type, etc."
 *   pnpm dev --content "Product description" --platforms x,instagram --duration "2 weeks" --posts-per-week 3
 *
 * The first argument is the product description. Additional environment
 * variables can be used to tweak the input; see README.
 *
 * With --content flag, the content creation workflow runs after the strategy
 * workflow, generating actual social media posts, visuals, and a calendar.
 */
import { marketingStrategyWorkflow, contentCreationWorkflow } from './mastra/index.js';
import { MarketingStrategyInputSchema, SocialPlatformEnum } from './schemas/index.js';

function parseArgs(): {
  description: string;
  runContent: boolean;
  platforms: string[];
  duration: string | undefined;
  postsPerWeek: number | undefined;
} {
  const rawArgs = process.argv.slice(2);
  let runContent = false;
  let platforms: string[] = [];
  let duration: string | undefined;
  let postsPerWeek: number | undefined;

  const args: string[] = [];
  for (let i = 0; i < rawArgs.length; i++) {
    const arg = rawArgs[i];
    if (!arg) continue;
    if (arg === '--content') {
      runContent = true;
    } else if (arg === '--platforms' && i + 1 < rawArgs.length) {
      const val = rawArgs[++i];
      if (val) platforms = val.split(',').map((p) => p.trim());
    } else if (arg === '--duration' && i + 1 < rawArgs.length) {
      const val = rawArgs[++i];
      if (val) duration = val;
    } else if (arg === '--posts-per-week' && i + 1 < rawArgs.length) {
      const val = rawArgs[++i];
      if (val) postsPerWeek = parseInt(val, 10);
    } else {
      args.push(arg);
    }
  }

  return {
    description: args.join(' ').trim(),
    runContent,
    platforms,
    duration,
    postsPerWeek,
  };
}

async function main(): Promise<void> {
  const { description, runContent, platforms, duration, postsPerWeek } = parseArgs();

  if (description.length < 10) {
    console.error(
      'Usage: tsx src/index.ts [--content] [--platforms x,instagram] [--duration "2 weeks"] [--posts-per-week 3] "Product description (>= 10 chars)"',
    );
    process.exit(1);
  }

  // ── Step 1: Run marketing strategy workflow ───────────────────────────

  console.error('\n=== Marketing Strategy Workflow ===\n');

  const input = MarketingStrategyInputSchema.parse({
    description,
    industry: process.env['INDUSTRY'] ?? 'Software',
    businessType: process.env['BUSINESS_TYPE'] ?? 'SaaS',
    targetMarket: process.env['TARGET_MARKET'] ?? undefined,
    pricing: process.env['PRICING'] ?? undefined,
  });

  const strategyRun = await marketingStrategyWorkflow.createRun();
  const strategyStream = strategyRun.stream({ inputData: input });

  for await (const chunk of strategyStream) {
    if (chunk.type === 'workflow-step-start') {
      const stepName = (chunk.payload as Record<string, unknown>)?.stepName ?? 'unknown';
      console.error(`▸ ${stepName} — started`);
    } else if (chunk.type === 'workflow-step-result') {
      const stepName = (chunk.payload as Record<string, unknown>)?.stepName ?? 'unknown';
      const status = (chunk.payload as Record<string, unknown>)?.status ?? 'unknown';
      console.error(`▸ ${stepName} — ${status}`);
    } else if (chunk.type === 'workflow-finish') {
      console.error(`\n✔ Strategy workflow finished`);
    }
  }

  const strategyResult = await strategyStream.result;

  if (strategyResult.status === 'failed') {
    console.error('Strategy workflow failed:', strategyResult.error);
    process.exit(1);
  }

  if (strategyResult.status !== 'success') {
    console.error('Strategy workflow did not succeed:', strategyResult.status);
    process.exit(1);
  }

  const strategy = strategyResult.result.campaignStrategy;

  if (!runContent) {
    console.log(JSON.stringify(strategyResult.result, null, 2));
    return;
  }

  // ── Step 2: Run content creation workflow ─────────────────────────────

  console.error('\n=== Content Creation Workflow ===\n');

  const brandName = strategy.campaignRecommendations[0]?.name ?? 'Brand';
  const product = description;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const contentInput: any = {
    brandName,
    product,
    targetAudience: strategy.audienceStrategy.primaryAudience,
    campaignStrategy: strategy,
  };

  // Only include if user explicitly provided them; otherwise workflow derives from strategy
  if (platforms.length > 0) {
    contentInput.platforms = platforms.map((p) => SocialPlatformEnum.parse(p));
  }
  if (duration) {
    contentInput.duration = duration;
  }
  if (postsPerWeek) {
    contentInput.postsPerWeek = postsPerWeek;
  }

  const contentRun = await contentCreationWorkflow.createRun();
  const contentStream = contentRun.stream({ inputData: contentInput });

  for await (const chunk of contentStream) {
    if (chunk.type === 'workflow-step-start') {
      const stepName = (chunk.payload as Record<string, unknown>)?.stepName ?? 'unknown';
      console.error(`▸ ${stepName} — started`);
    } else if (chunk.type === 'workflow-step-result') {
      const stepName = (chunk.payload as Record<string, unknown>)?.stepName ?? 'unknown';
      const status = (chunk.payload as Record<string, unknown>)?.status ?? 'unknown';
      console.error(`▸ ${stepName} — ${status}`);
    } else if (chunk.type === 'workflow-finish') {
      console.error(`\n✔ Content workflow finished`);
    }
  }

  const contentResult = await contentStream.result;

  if (contentResult.status === 'success') {
    console.log(JSON.stringify(contentResult.result, null, 2));
  } else if (contentResult.status === 'failed') {
    console.error('Content workflow failed:', contentResult.error);
    process.exit(1);
  } else {
    console.error('Unexpected workflow status:', contentResult.status);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
