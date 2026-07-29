/**
 * Run the marketing strategy workflow from the command line.
 *
 * Usage:
 *   pnpm dev "Product description here, industry, business type, etc."
 *
 * The first argument is the product description. Additional environment
 * variables can be used to tweak the input; see README.
 */
import { marketingStrategyWorkflow } from './mastra/index.js';
import { MarketingStrategyInputSchema } from './schemas/index.js';

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const description = args.join(' ').trim();

  if (description.length < 10) {
    console.error(
      'Usage: tsx src/index.ts "Product description (>= 10 chars), industry, business type"',
    );
    process.exit(1);
  }

  const input = MarketingStrategyInputSchema.parse({
    description,
    industry: process.env['INDUSTRY'] ?? 'Software',
    businessType: process.env['BUSINESS_TYPE'] ?? 'SaaS',
    targetMarket: process.env['TARGET_MARKET'] ?? undefined,
    pricing: process.env['PRICING'] ?? undefined,
  });

  const run = await marketingStrategyWorkflow.createRun();
  const result = await run.start({ inputData: input });

  if (result.status === 'success') {
    console.log(JSON.stringify(result.result, null, 2));
  } else if (result.status === 'failed') {
    console.error('Workflow failed:', result.error);
    process.exit(1);
  } else {
    console.error('Unexpected workflow status:', result.status);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
