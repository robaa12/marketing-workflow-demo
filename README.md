# Marketing Strategy Workflow

A production-ready marketing strategy workflow built on [Mastra](https://mastra.ai).
The system behaves like a senior marketing consultancy: it takes a raw product
description and returns a complete, structured marketing strategy — segmentation,
targeting, positioning, personas, journeys, SMART objectives, and a campaign
plan.

It is **modular, strongly typed, and easy to extend**. Every agent is
independently testable; new agents can be inserted anywhere in the chain
without touching the surrounding code.

---

## High-level architecture

```
Marketing Director (Workflow Orchestrator)
│
├── Product Analysis Agent
├── STP Strategy Agent
├── Buyer Persona Agent
├── Buyer Journey Agent
├── SMART Objectives Agent
└── Campaign Planner Agent
```

Planned future agents (Market Research, Competitor Analysis, SEO, Analytics,
Content Generator, Image Brief Generator) can be inserted at any point without
modifying the existing agents.

---

## Quick start

```bash
# 1. Install
npm install

# 2. Configure your LLM
cp .env.example .env
# Edit .env and set OPENROUTER_API_KEY=sk-or-v1-...
# (Free key at https://openrouter.ai/keys — no credit card required.)

# 3. Run the full workflow from the CLI
npm run dev -- "A SaaS that automates weekly marketing reporting" \
  --industry="Software" \
  --businessType="SaaS"
```

### Run the API for the AetherFlow frontend

```bash
npm run server
```

The server listens on `http://localhost:4112` by default (`API_PORT` overrides
it) and exposes two
approval-aware workflow endpoints:

- `POST /api/strategy` and `GET /api/strategy/:runId` build and poll a complete marketing strategy.
- `POST /api/content` and `GET /api/content/:runId` build and poll posts from the approved `campaignStrategy` object.
- `POST /api/strategy/:runId/cancel` and `POST /api/content/:runId/cancel` cancel an active run.

The React frontend uses the first workflow as a review gate. It sends the
strategy to the content endpoint only after the user selects **Approve & create
posts**.

The CLI serialises the final strategy as JSON to stdout.

### Project knowledge RAG

RAG is deliberately off by default. It is project-scoped: the Nest backend
owns source lifecycle and sends Mastra only the IDs of sources currently marked
`READY`. Mastra will not retrieve with a project ID alone.

For local use, configure the same high-entropy `MASTRA_INTERNAL_TOKEN` in both
services, set `RAG_ENABLED=true` in both environments, start Ollama, and pull
the configured embedding model before starting the workflow server:

```bash
docker compose -f ../iti-grad/docker-compose.yml --profile local-rag up -d ollama
ollama pull nomic-embed-text-v2-moe
npm run server
```

Keep `RAG_INDEX_VERSION` stable for a given embedding model, dimension, and
vector-index configuration. When any of them changes, increment it and
re-index all project sources; this prevents mixing incompatible vectors. The
RAG vector store is PostgreSQL with pgvector, in the `rag` schema by default;
LibSQL remains only for Mastra workflow/tracing storage.

Run the deterministic RAG quality suite with:

```bash
npm run test:rag
```

It reports and gates Recall@K, mean reciprocal rank, precision@K, and no-answer
accuracy against checked-in retrieval cases. Add a case whenever a production
retrieval failure is fixed.

### Using the workflow programmatically

```ts
import { mastra } from './src/mastra/index.js';

const workflow = mastra.getWorkflow('marketingStrategyWorkflow');
const run = await workflow.createRun();
const result = await run.start({
  inputData: {
    description: 'A SaaS that automates weekly marketing reporting',
    industry: 'Software',
    businessType: 'SaaS',
  },
});

if (result.status === 'success') {
  console.log(result.result);
}
```

---

## Project layout

```
src/
    workflows/
        marketing/
            workflow.ts              # Marketing Director composition
            steps/                   # Per-step factories
                productAnalysis.step.ts
                stpStrategy.step.ts
                buyerPersona.step.ts
                buyerJourney.step.ts
                smartObjectives.step.ts
                campaignPlanner.step.ts

    agents/
        product-analysis/            # Agent + run() helper
        stp/
        buyer-persona/
        buyer-journey/
        smart-objectives/
        campaign-planner/

    schemas/                          # Zod schemas
        common.ts                    # Enums (channels, funnel, etc.)
        product.ts
        stp.ts
        persona.ts
        buyerJourney.ts
        objectives.ts
        campaign.ts
        marketingContext.ts          # Shared workflow context

    prompts/                          # Per-agent system prompts
        productAnalysis.ts
        stpStrategy.ts
        buyerPersona.ts
        buyerJourney.ts
        smartObjectives.ts
        campaignPlanner.ts

    lib/
        model.ts                     # Centralised model string resolver
        errors.ts                    # MarketingWorkflowError

    tools/                            # Reserved for future tools

    mastra/
        index.ts                     # Singleton Mastra instance

    index.ts                          # CLI entry point

tests/
    agents/                           # Unit tests per agent
    integration/                      # Full-workflow integration test
    helpers/
        mockAgent.ts                  # Agent mock factory
        fixtures.ts                   # Valid schema fixtures
```

---

## Workflow contract

### Input

```ts
{
  description: string;       // >= 10 chars
  industry: string;          // >= 2 chars
  businessType: string;      // >= 2 chars
  targetMarket?: string;
  pricing?: string;
  additionalNotes?: string;
  options?: {
    maxPersonas: 1 | 2 | 3;            // default 3
    primaryGoal:                       // default 'balanced'
      | 'awareness'
      | 'lead-generation'
      | 'conversion'
      | 'retention'
      | 'balanced';
  };
}
```

### Output

```ts
{
  product:         ProductProfile;
  stp:             STPResult;
  personas:        BuyerPersona[];          // 1–3
  buyerJourney:    BuyerJourney[];          // one per persona
  smartObjectives: SmartObjective[];        // 1+
  campaignStrategy: CampaignStrategy;
}
```

No markdown, no long essays — only structured, JSON-compatible objects.

---

## Shared workflow context

The chain of steps threads a single, strongly-typed `MarketingStrategyContext`
through the workflow. Each step reads only the fields it needs and writes
**exactly one** new field.

```
User Input
   │
   ▼
Product Analysis ──▶ context.product
STP Strategy     ──▶ context.stp
Buyer Persona    ──▶ context.personas
Buyer Journey    ──▶ context.buyerJourney
SMART Objectives ──▶ context.smartObjectives
Campaign Planner ──▶ context.campaignStrategy
   │
   ▼
Return Complete Strategy
```

No agent overwrites another agent's output. Adding a new step is purely
additive: see *Extension points* below.

The `options` field is the only piece of user input that flows through the
chain. It is propagated alongside the derived fields and intentionally
dropped in the final step so the workflow's terminal output matches the
public output contract.

---

## Agent design

Each agent follows the same shape:

```
agents/<name>/
    agent.ts    # buildXxxAgent(model) + runXxx(agent, input)
    index.ts    # Re-exports
```

### Why each step is a factory

`buildProductAnalysisStep(agent: Agent)` takes the agent as a dependency
rather than reaching into a global registry. This makes every step:

- **Independently testable** — pass a `vi.fn()` for the agent.
- **Composable** — the workflow file wires up real agents; tests wire up
  mocks.
- **Model-agnostic** — swap the model string without touching prompt code.

### Why a run() helper alongside buildXxxAgent()

`buildXxxAgent()` builds the Mastra `Agent` (id, name, instructions, model).
`runXxx(agent, input)` is a thin wrapper around `agent.generate()` that
serialises input, configures structured output, and validates the result
against the agent's Zod schema. The step factories call `runXxx()` so the
execution logic stays in one place per agent.

### Structured output

Every agent returns a Zod-validated object via Mastra's
`structuredOutput: { schema, jsonPromptInjection: true }` mechanism. The
schema is the contract: nothing else flows between agents.

### Prompt discipline

Each agent has its own dedicated system prompt in `src/prompts/`. Prompts
follow three rules:

1. **Single responsibility** — explicit "you NEVER do X" clauses prevent
   agents from doing another agent's job.
2. **Explicit inputs and outputs** — no guessing what the agent consumes or
   produces.
3. **No hallucinated business facts** — agents list unknowns in
   `assumptions` rather than inventing numbers.

---

## Testing

```bash
npm test               # one-shot
npm run test:watch     # watch mode
```

- `tests/agents/*.test.ts` — per-agent unit tests, each one builds a real
  agent then patches `agent.generate` with a typed mock that returns a
  fixture. The full agent wiring is exercised; only the LLM call is faked.
- `tests/integration/workflow.test.ts` — composes the workflow with
  fully-mocked agents and asserts the end-to-end contract.
- `tests/agents/schemas.test.ts` — pure Zod schema tests, no agents.
- `tests/helpers/fixtures.ts` — shared, valid schema fixtures used by every
  test.

To run the integration test against real LLMs, set `OPENAI_API_KEY` and
remove the `agent.generate` patches in `tests/integration/workflow.test.ts`.

---

## Extension points

The workflow is designed so new agents can be inserted **without changing
any existing agent**.

### Example: add a Market Research agent before STP

1. Create `src/agents/market-research/agent.ts` mirroring the existing
   pattern. Have it consume `MarketingStrategyContext['product']` and produce
   a new `MarketResearch` field on the context.
2. Add `MarketResearch` to the shared context schema in
   `src/schemas/marketingContext.ts`.
3. Create `src/workflows/marketing/steps/marketResearch.step.ts`:

   ```ts
   import { createStep } from '@mastra/core/workflows';
   import { z } from 'zod';
   import { runMarketResearch } from '../../../agents/market-research/agent.js';
   import {
     MarketResearchSchema,
     ProductProfileSchema,
   } from '../../../schemas/index.js';

   export function buildMarketResearchStep(agent: Agent) {
     return createStep({
       id: 'market-research',
       inputSchema: z.object({ product: ProductProfileSchema }),
       outputSchema: z.object({
         product: ProductProfileSchema,
         marketResearch: MarketResearchSchema,
       }),
       execute: async ({ inputData }) => ({
         product: inputData.product,
         marketResearch: await runMarketResearch(agent, inputData.product),
       }),
     });
   }
   ```

4. In `src/workflows/marketing/workflow.ts`:

   ```ts
   const marketResearchStep = buildMarketResearchStep(deps.marketResearchAgent);

   return createWorkflow({...})
     .then(productAnalysisStep)
     .then(marketResearchStep)   // ← inserted here
     .then(stpStep)
     ...
   ```

No other agent is touched.

### Future agents this design supports

| Agent                | Inserted between                | New context field   |
|----------------------|---------------------------------|---------------------|
| Market Research      | Product Analysis and STP         | `marketResearch`    |
| Competitor Analysis  | Market Research and STP          | `competitorAnalysis`|
| SEO                  | Buyer Journey and SMART          | `seoOpportunities`  |
| Analytics            | Campaign Planner and final step  | `analyticsPlan`     |
| Content Generator    | Campaign Planner                 | `contentBriefs`     |
| Image Brief Generator| Content Generator                | `imageBriefs`       |

Each addition is purely additive: add a schema field, add an agent folder,
add a step factory, insert one `.then()` call in the workflow file.

---

## Design decisions

### Why Zod 4 schemas (and not raw TypeScript interfaces)?

The Zod schema is the single source of truth. TypeScript types are inferred
from the schemas, and runtime validation is automatic. This eliminates the
class of bug where an LLM returns a field the consumer didn't expect.

### Why does each step output the full context?

It keeps the type chain trivially correct. The previous step's output
(almost the full context) extends the next step's inputSchema, satisfying
Mastra's `TPrevSchema extends TStepInput` constraint. If a step needs only
a subset, it declares that subset in its `inputSchema`; the unwritten
fields are simply ignored.

### Why not pass raw text between agents?

Because the spec asks for structured outputs, and because raw-text
transcripts are the canonical source of "the LLM said something different
this run" bugs. Every step boundary is a Zod-validated handoff.

### Why `jsonPromptInjection: true`?

Mastra's `structuredOutput` API defaults to the model's native structured
output. For Gemini 2.5 with tools this combination is unsupported, and even
without tools, prompt-injection is the most portable option. It also makes
the prompts themselves easier to debug — the LLM sees the schema inline.

---

## Environment variables

| Variable                  | Purpose                                | Default                                       |
|---------------------------|----------------------------------------|-----------------------------------------------|
| `OPENCODE_API_KEY`        | API key for OpenCode Go                | _required_ (get at https://opencode.ai/settings/api) |
| `MASTRA_MODEL_DEFAULT`    | Model string used by all agents        | `opencode-go/kimi-k2.6` |
| `OPENAI_API_KEY`          | API key for OpenAI models              | _optional_                                    |
| `ANTHROPIC_API_KEY`       | API key for Anthropic models           | _optional_                                    |
| `GOOGLE_API_KEY`          | API key for Google models              | _optional_                                    |
| `INDUSTRY` / `BUSINESS_TYPE` / `TARGET_MARKET` / `PRICING` | Defaults for the CLI | none |

### Switching providers

Set `MASTRA_MODEL_DEFAULT` to any Mastra-supported `provider/model` string:

```bash
# OpenCode Go (default — uses your subscription)
MASTRA_MODEL_DEFAULT=opencode-go/kimi-k2.6
MASTRA_MODEL_DEFAULT=opencode-go/deepseek-v4-flash
MASTRA_MODEL_DEFAULT=opencode-go/qwen3.7-plus

# Other providers
MASTRA_MODEL_DEFAULT=openai/gpt-4o-mini        # needs OPENAI_API_KEY
MASTRA_MODEL_DEFAULT=anthropic/claude-sonnet-4-6  # needs ANTHROPIC_API_KEY
MASTRA_MODEL_DEFAULT=google/gemini-2.5-pro     # needs GOOGLE_API_KEY
```

See <https://mastra.ai/models> for the full list.

To use a different model per agent, edit `src/lib/model.ts` and accept an
override inside each `buildXxxAgent` factory — they already accept a
`model: string` parameter.

---

## Scripts

| Script              | Purpose                                       |
|---------------------|-----------------------------------------------|
| `npm run dev`       | Run the workflow from the CLI                 |
| `npm run build`     | Type-check and emit `dist/`                   |
| `npm run typecheck` | Type-check only (no emit)                     |
| `npm test`          | Run all unit + integration tests              |
| `npm run test:watch`| Tests in watch mode                           |

---

## License

MIT
