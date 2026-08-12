type MetricGroup = {
  dimensions: Record<string, string | null>;
  value: number;
  estimatedCost?: number | null;
  costUnit?: string | null;
};

export interface WorkflowUsageMetricStore {
  listTracesLight(args: {
    filters: {
      runId: string;
      startedAt: { start: Date };
    };
    pagination: { page: number; perPage: number };
    orderBy: { field: 'startedAt'; direction: 'DESC' };
  }): Promise<{ spans: Array<{ traceId: string }> }>;
  getMetricBreakdown(args: {
    name: string[];
    groupBy: string[];
    aggregation: 'sum';
    filters: {
      traceId: string;
      timestamp: { start: Date };
    };
    limit: number;
  }): Promise<{ groups: MetricGroup[] }>;
}

export type WorkflowUsage = {
  status: 'ready' | 'pending' | 'unpriced';
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  estimatedCost: number | null;
  costUnit: string | null;
  models: Array<{
    provider: string;
    model: string;
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    estimatedCost: number | null;
    costUnit: string | null;
  }>;
};

const INPUT_TOKENS = 'mastra_model_total_input_tokens';
const OUTPUT_TOKENS = 'mastra_model_total_output_tokens';
const LOOKBACK_MS = 30 * 24 * 60 * 60 * 1_000;

export async function getWorkflowUsage(
  store: WorkflowUsageMetricStore,
  runId: string,
  startedAt = new Date(Date.now() - LOOKBACK_MS),
): Promise<WorkflowUsage> {
  // A workflow and each nested agent generation receive different run IDs in
  // Mastra. Token metrics carry the agent run ID, but every child metric shares
  // the workflow trace ID. Resolve the workflow run to its root trace first so
  // all child model calls are included without mixing concurrent workflows.
  const traces = await store.listTracesLight({
    filters: {
      runId,
      startedAt: { start: startedAt },
    },
    pagination: { page: 0, perPage: 1 },
    orderBy: { field: 'startedAt', direction: 'DESC' },
  });
  const traceId = traces.spans[0]?.traceId;
  if (!traceId) {
    return pendingUsage();
  }

  const filters = {
    traceId,
    timestamp: { start: startedAt },
  };
  const [input, output] = await Promise.all([
    store.getMetricBreakdown({
      name: [INPUT_TOKENS],
      groupBy: ['provider', 'model'],
      aggregation: 'sum',
      filters,
      limit: 100,
    }),
    store.getMetricBreakdown({
      name: [OUTPUT_TOKENS],
      groupBy: ['provider', 'model'],
      aggregation: 'sum',
      filters,
      limit: 100,
    }),
  ]);

  if (input.groups.length === 0 && output.groups.length === 0) {
    return pendingUsage();
  }

  const merged = new Map<string, WorkflowUsage['models'][number]>();
  let hasUnknownPrice = false;
  const costUnits = new Set<string>();

  const merge = (group: MetricGroup, kind: 'input' | 'output') => {
    const provider = group.dimensions['provider'] ?? 'unknown';
    const model = group.dimensions['model'] ?? 'unknown';
    const key = `${provider}\u0000${model}`;
    const current = merged.get(key) ?? {
      provider,
      model,
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      estimatedCost: 0,
      costUnit: group.costUnit ?? null,
    };
    if (kind === 'input') current.inputTokens += group.value;
    else current.outputTokens += group.value;
    current.totalTokens = current.inputTokens + current.outputTokens;
    if (group.estimatedCost == null) {
      hasUnknownPrice = true;
      current.estimatedCost = null;
    } else if (current.estimatedCost != null) {
      current.estimatedCost += group.estimatedCost;
    }
    if (group.costUnit) costUnits.add(group.costUnit);
    if (current.costUnit && group.costUnit && current.costUnit !== group.costUnit) {
      current.costUnit = null;
      hasUnknownPrice = true;
    } else if (!current.costUnit) {
      current.costUnit = group.costUnit ?? null;
    }
    merged.set(key, current);
  };

  input.groups.forEach((group) => merge(group, 'input'));
  output.groups.forEach((group) => merge(group, 'output'));

  const models = [...merged.values()].sort((a, b) =>
    `${a.provider}/${a.model}`.localeCompare(`${b.provider}/${b.model}`),
  );
  const inputTokens = models.reduce((sum, item) => sum + item.inputTokens, 0);
  const outputTokens = models.reduce((sum, item) => sum + item.outputTokens, 0);
  const allPriced = !hasUnknownPrice && costUnits.size === 1;

  return {
    status: allPriced ? 'ready' : 'unpriced',
    inputTokens,
    outputTokens,
    totalTokens: inputTokens + outputTokens,
    estimatedCost: allPriced
      ? models.reduce((sum, item) => sum + (item.estimatedCost ?? 0), 0)
      : null,
    costUnit: allPriced ? [...costUnits][0] ?? null : null,
    models,
  };
}

function pendingUsage(): WorkflowUsage {
  return {
    status: 'pending',
    inputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
    estimatedCost: null,
    costUnit: null,
    models: [],
  };
}
