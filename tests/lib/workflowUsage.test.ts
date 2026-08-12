import { describe, expect, it, vi } from 'vitest';
import {
  getWorkflowUsage,
  type WorkflowUsageMetricStore,
} from '../../src/lib/workflowUsage.js';

describe('getWorkflowUsage', () => {
  it('combines input and output metrics per model and totals their Mastra costs', async () => {
    const store = metricStore([
      [{ dimensions: { provider: 'openai', model: 'gpt-test' }, value: 12, estimatedCost: 0.01, costUnit: 'USD' }],
      [{ dimensions: { provider: 'openai', model: 'gpt-test' }, value: 8, estimatedCost: 0.02, costUnit: 'USD' }],
    ]);

    await expect(getWorkflowUsage(store, 'run-1')).resolves.toEqual({
      status: 'ready',
      inputTokens: 12,
      outputTokens: 8,
      totalTokens: 20,
      estimatedCost: 0.03,
      costUnit: 'USD',
      models: [{
        provider: 'openai',
        model: 'gpt-test',
        inputTokens: 12,
        outputTokens: 8,
        totalTokens: 20,
        estimatedCost: 0.03,
        costUnit: 'USD',
      }],
    });
  });

  it('returns pending until model metrics have been exported', async () => {
    const store = metricStore([[], []]);
    const usage = await getWorkflowUsage(store, 'run-2');
    expect(usage.status).toBe('pending');
    expect(usage.totalTokens).toBe(0);
  });

  it('returns pending until the workflow root trace has been exported', async () => {
    const store = metricStore([[], []], []);
    const usage = await getWorkflowUsage(store, 'run-without-trace');
    expect(usage.status).toBe('pending');
    expect(store.getMetricBreakdown).not.toHaveBeenCalled();
  });

  it('queries model metrics by the workflow trace instead of the agent run id', async () => {
    const store = metricStore([
      [{ dimensions: { provider: 'openai', model: 'gpt-test' }, value: 12, estimatedCost: 0.01, costUnit: 'USD' }],
      [{ dimensions: { provider: 'openai', model: 'gpt-test' }, value: 8, estimatedCost: 0.02, costUnit: 'USD' }],
    ]);

    await getWorkflowUsage(store, 'workflow-run-1');

    expect(store.listTracesLight).toHaveBeenCalledWith(
      expect.objectContaining({
        filters: expect.objectContaining({
          runId: 'workflow-run-1',
        }),
      }),
    );
    expect(store.getMetricBreakdown).toHaveBeenCalledWith(
      expect.objectContaining({
        filters: expect.objectContaining({ traceId: 'trace-1' }),
      }),
    );
    expect(store.getMetricBreakdown).not.toHaveBeenCalledWith(
      expect.objectContaining({
        filters: expect.objectContaining({ runId: 'workflow-run-1' }),
      }),
    );
  });

  it('does not understate the total when a model has no known price', async () => {
    const store = metricStore([
      [{ dimensions: { provider: 'custom', model: 'new-model' }, value: 12, estimatedCost: null, costUnit: null }],
      [{ dimensions: { provider: 'custom', model: 'new-model' }, value: 8, estimatedCost: null, costUnit: null }],
    ]);
    const usage = await getWorkflowUsage(store, 'run-3');
    expect(usage.status).toBe('unpriced');
    expect(usage.estimatedCost).toBeNull();
    expect(usage.totalTokens).toBe(20);
  });
});

function metricStore(groups: Array<Array<{
  dimensions: Record<string, string | null>;
  value: number;
  estimatedCost: number | null;
  costUnit: string | null;
}>>, traces: Array<{ traceId: string }> = [{ traceId: 'trace-1' }]): WorkflowUsageMetricStore {
  const listTracesLight = vi.fn().mockResolvedValue({ spans: traces });
  const getMetricBreakdown = vi.fn()
    .mockResolvedValueOnce({ groups: groups[0] })
    .mockResolvedValueOnce({ groups: groups[1] });
  return { listTracesLight, getMetricBreakdown };
}
