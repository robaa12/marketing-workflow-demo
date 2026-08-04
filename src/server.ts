import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { resolve } from 'node:path';
import { marketingStrategyWorkflow, contentCreationWorkflow } from './mastra/index.js';
import { getModel } from './lib/model.js';
import {
  MarketingStrategyInputSchema,
  type MarketingIntakeFacts,
  type MarketingStrategyInput,
} from './schemas/index.js';
import {
  ContentCreationInputSchema,
  type ContentCreationInput,
} from './workflows/content/index.js';
import { ProjectStore, type ProjectRunStatus } from './lib/project-store.js';

const PORT = Number(process.env['API_PORT'] ?? 4112);

type WorkflowKind = 'strategy' | 'content';
type RunStatus = 'running' | 'success' | 'failed' | 'canceled';

interface RunState {
  kind: WorkflowKind;
  projectId?: string;
  chatId?: string;
  status: RunStatus;
  result?: unknown;
  error?: string;
  activeSteps: string[];
  completedSteps: string[];
  startedAt: string;
}

interface WorkflowStream {
  fullStream: AsyncIterable<unknown>;
  result: Promise<unknown>;
}

interface WorkflowResult {
  status?: string;
  result?: unknown;
  error?: unknown;
  tripwire?: { reason?: unknown };
}

const runs = new Map<string, RunState>();
const runControls = new Map<string, { cancel: () => Promise<void> }>();
const projectStore = new ProjectStore(
  process.env['PROJECT_STORE_PATH'] ?? resolve(process.cwd(), '.data', 'workspace.json'),
);

const UNKNOWN_INTAKE: MarketingIntakeFacts = {
  targetGeography: 'unknown',
  primaryIcp: 'unknown',
  salesMotion: 'unknown',
  monthlyBudget: 'unknown',
  supportedIntegrations: ['unknown'],
  verifiedProofPoints: ['none verified'],
  prohibitedClaims: ['none specified'],
  baselineMetrics: {
    monthlyQualifiedVisits: 'unknown',
    monthlyLeads: 'unknown',
    trialOrDemoConversionRate: 'unknown',
    activationRate: 'unknown',
    paidConversionRate: 'unknown',
    monthlyChurnRate: 'unknown',
  },
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object';
}

function toErrorMessage(error: unknown): string {
  if (typeof error === 'string') return error;
  if (error instanceof Error) return error.message || String(error);
  if (isRecord(error)) {
    if (typeof error.message === 'string') return error.message;
    if (typeof error.error === 'string') return error.error;
    if (error.error && typeof error.error === 'object') return toErrorMessage(error.error);
    try {
      return JSON.stringify(error);
    } catch {
      return String(error);
    }
  }
  return String(error ?? 'Unknown error');
}

function readBody(request: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = '';
    request.on('data', (chunk: Buffer | string) => {
      body += chunk.toString();
      if (body.length > 1_000_000) reject(new Error('Request body is too large'));
    });
    request.on('end', () => resolve(body));
    request.on('error', reject);
  });
}

function json(response: ServerResponse, status: number, data: unknown): void {
  const body = JSON.stringify(data);
  response.writeHead(status, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(body),
  });
  response.end(body);
}

function updateRun(runId: string, update: (state: RunState) => RunState): void {
  const current = runs.get(runId);
  if (!current || current.status === 'canceled') return;
  runs.set(runId, update(current));
}

function stepIdFromEvent(event: unknown): string | undefined {
  if (!isRecord(event) || !isRecord(event.payload)) return undefined;
  const payload = event.payload;
  const candidate = payload.id ?? payload.stepId ?? payload.stepName;
  return typeof candidate === 'string' ? candidate : undefined;
}

function markStepStarted(runId: string, stepId: string): void {
  updateRun(runId, (state) => ({
    ...state,
    activeSteps: [...new Set([...state.activeSteps, stepId])],
  }));
}

function markStepFinished(runId: string, stepId: string): void {
  updateRun(runId, (state) => ({
    ...state,
    activeSteps: state.activeSteps.filter((id) => id !== stepId),
    completedSteps: [...new Set([...state.completedSteps, stepId])],
  }));
}

function startTracking(
  runId: string,
  kind: WorkflowKind,
  stream: WorkflowStream,
  cancel: () => Promise<void>,
  projectId?: string,
  chatId?: string,
): void {
  runs.set(runId, {
    kind,
    projectId,
    chatId,
    status: 'running',
    activeSteps: [],
    completedSteps: [],
    startedAt: new Date().toISOString(),
  });
  runControls.set(runId, { cancel });

  void (async () => {
    try {
      for await (const event of stream.fullStream) {
        if (!isRecord(event) || typeof event.type !== 'string') continue;
        const stepId = stepIdFromEvent(event);
        if (!stepId) continue;
        if (event.type === 'workflow-step-start') markStepStarted(runId, stepId);
        if (event.type === 'workflow-step-finish' || event.type === 'workflow-step-result') {
          markStepFinished(runId, stepId);
        }
      }

      if (runs.get(runId)?.status === 'canceled') return;
      const rawResult = await stream.result;
      const result = isRecord(rawResult) ? (rawResult as WorkflowResult) : {};
      if (result.status === 'success') {
        if (projectId) {
          await projectStore.recordRun({ projectId, chatId, runId, kind, status: 'success', result: result.result });
        }
        updateRun(runId, (state) => ({
          ...state,
          status: 'success',
          result: result.result,
          activeSteps: [],
        }));
      } else {
        const reason =
          result.status === 'tripwire'
            ? result.tripwire?.reason
            : result.error ?? `Workflow ended with status "${result.status ?? 'unknown'}"`;
        if (projectId) {
          await projectStore.recordRun({
            projectId,
            chatId,
            runId,
            kind,
            status: 'failed',
            error: toErrorMessage(reason),
          });
        }
        updateRun(runId, (state) => ({
          ...state,
          status: 'failed',
          error: toErrorMessage(reason),
          activeSteps: [],
        }));
      }
    } catch (error) {
      if (runs.get(runId)?.status === 'canceled') return;
      if (projectId) {
        await projectStore.recordRun({
          projectId,
          chatId,
          runId,
          kind,
          status: 'failed',
          error: toErrorMessage(error),
        });
      }
      updateRun(runId, (state) => ({
        ...state,
        status: 'failed',
        error: toErrorMessage(error),
        activeSteps: [],
      }));
    } finally {
      runControls.delete(runId);
    }
  })();
}

async function startStrategy(input: MarketingStrategyInput, projectId?: string, chatId?: string): Promise<string> {
  const run = await marketingStrategyWorkflow.createRun();
  // The API is non-interactive, so satisfy the workflow's intake gate with
  // explicit unknowns instead of leaving the frontend stuck in a suspended run.
  const targetMarket = input.targetMarket?.trim() || 'unknown';
  const normalizedInput: MarketingStrategyInput = {
    ...input,
    targetMarket,
    intake: input.intake ?? {
      ...UNKNOWN_INTAKE,
      primaryIcp: targetMarket,
    },
  };
  const stream = run.stream({ inputData: normalizedInput });
  startTracking(run.runId, 'strategy', stream, () => run.cancel(), projectId, chatId);
  return run.runId;
}

async function startContent(input: ContentCreationInput, projectId?: string, chatId?: string): Promise<string> {
  const run = await contentCreationWorkflow.createRun();
  const stream = run.stream({ inputData: input });
  startTracking(run.runId, 'content', stream, () => run.cancel(), projectId, chatId);
  return run.runId;
}

function endpointKind(segments: string[]): WorkflowKind | undefined {
  if (segments[1] === 'strategy') return 'strategy';
  if (segments[1] === 'content') return 'content';
  return undefined;
}

const server = createServer(async (request, response) => {
  const origin = request.headers.origin;
  response.setHeader('Access-Control-Allow-Origin', origin ?? '*');
  if (origin) {
    response.setHeader('Access-Control-Allow-Credentials', 'true');
    response.setHeader('Vary', 'Origin');
  }
  response.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
  response.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (request.method === 'OPTIONS') {
    response.writeHead(204);
    response.end();
    return;
  }

  const url = new URL(request.url ?? '/', `http://${request.headers.host ?? 'localhost'}`);
  const segments = url.pathname.split('/').filter(Boolean);
  const kind = endpointKind(segments);

  if (request.method === 'GET' && segments.length === 1 && segments[0] === 'api') {
    json(response, 200, {
      name: 'marketing-workflow-api',
      status: 'ok',
      endpoints: [
        '/api/strategy',
        '/api/content',
        '/api/projects',
        '/api/projects/:id/chats',
        '/api/projects/:id/chats/:chatId/history',
      ],
    });
    return;
  }

  if (request.method === 'GET' && segments.length === 2 && segments[1] === 'projects') {
    json(response, 200, { projects: await projectStore.listProjects() });
    return;
  }

  if (request.method === 'POST' && segments.length === 2 && segments[1] === 'projects') {
    try {
      const raw = JSON.parse(await readBody(request)) as unknown;
      const name = isRecord(raw) && typeof raw.name === 'string' ? raw.name.trim() : '';
      const color = isRecord(raw) && typeof raw.color === 'string' ? raw.color : undefined;
      if (!name) {
        json(response, 400, { error: 'Project name is required' });
        return;
      }
      json(response, 201, { project: await projectStore.createProject(name, color) });
    } catch (error) {
      json(response, 400, { error: toErrorMessage(error) });
    }
    return;
  }

  if (request.method === 'PATCH' && segments.length === 3 && segments[1] === 'projects') {
    const projectId = segments[2]!;
    try {
      const raw = JSON.parse(await readBody(request)) as unknown;
      const name = isRecord(raw) && typeof raw.name === 'string' ? raw.name.trim() : '';
      if (!name) {
        json(response, 400, { error: 'Project name is required' });
        return;
      }
      const project = await projectStore.renameProject(projectId, name);
      if (!project) {
        json(response, 404, { error: 'Project not found' });
        return;
      }
      json(response, 200, { project });
    } catch (error) {
      json(response, 400, { error: toErrorMessage(error) });
    }
    return;
  }

  if (request.method === 'DELETE' && segments.length === 3 && segments[1] === 'projects') {
    const deleted = await projectStore.deleteProject(segments[2]!);
    if (!deleted) {
      json(response, 404, { error: 'Project not found' });
      return;
    }
    response.writeHead(204);
    response.end();
    return;
  }

  if (request.method === 'GET' && segments.length === 4 && segments[1] === 'projects' && segments[3] === 'chats') {
    const projectId = segments[2]!;
    if (!await projectStore.hasProject(projectId)) {
      json(response, 404, { error: 'Project not found' });
      return;
    }
    json(response, 200, { chats: await projectStore.listChats(projectId) });
    return;
  }

  if (request.method === 'POST' && segments.length === 4 && segments[1] === 'projects' && segments[3] === 'chats') {
    const projectId = segments[2]!;
    try {
      const raw = JSON.parse(await readBody(request)) as unknown;
      const title = isRecord(raw) && typeof raw.title === 'string' ? raw.title.trim() : '';
      if (!title) {
        json(response, 400, { error: 'Chat title is required' });
        return;
      }
      const chat = await projectStore.createChat(projectId, title);
      if (!chat) {
        json(response, 404, { error: 'Project not found' });
        return;
      }
      json(response, 201, { chat });
    } catch (error) {
      json(response, 400, { error: toErrorMessage(error) });
    }
    return;
  }

  if (request.method === 'DELETE' && segments.length === 5 && segments[1] === 'projects' && segments[3] === 'chats') {
    const deleted = await projectStore.deleteChat(segments[2]!, segments[4]!);
    if (!deleted) {
      json(response, 404, { error: 'Chat not found' });
      return;
    }
    response.writeHead(204);
    response.end();
    return;
  }

  if (request.method === 'GET' && segments.length === 6 && segments[1] === 'projects' && segments[3] === 'chats' && segments[5] === 'history') {
    const projectId = segments[2]!;
    const chatId = segments[4]!;
    if (!await projectStore.hasChat(projectId, chatId)) {
      json(response, 404, { error: 'Chat not found' });
      return;
    }
    json(response, 200, { history: await projectStore.listChatHistory(projectId, chatId) });
    return;
  }

  if (request.method === 'GET' && segments.length === 4 && segments[1] === 'projects' && segments[3] === 'history') {
    const projectId = segments[2]!;
    if (!await projectStore.hasProject(projectId)) {
      json(response, 404, { error: 'Project not found' });
      return;
    }
    json(response, 200, { history: await projectStore.listHistory(projectId) });
    return;
  }

  if (request.method === 'POST' && kind && segments.length === 2) {
    try {
      const raw = JSON.parse(await readBody(request)) as unknown;
      const projectId = isRecord(raw) && typeof raw.projectId === 'string' ? raw.projectId : undefined;
      const chatId = isRecord(raw) && typeof raw.chatId === 'string' ? raw.chatId : undefined;
      if (projectId && !await projectStore.hasProject(projectId)) {
        json(response, 404, { error: 'Project not found' });
        return;
      }
      if (projectId && chatId && !await projectStore.hasChat(projectId, chatId)) {
        json(response, 404, { error: 'Chat not found' });
        return;
      }
      let runId: string;
      if (kind === 'strategy') {
        const parsed = MarketingStrategyInputSchema.safeParse(raw);
        if (!parsed.success) {
          json(response, 400, { error: 'Invalid strategy input', details: parsed.error.issues });
          return;
        }
        runId = await startStrategy(parsed.data, projectId, chatId);
      } else {
        const parsed = ContentCreationInputSchema.safeParse(raw);
        if (!parsed.success) {
          json(response, 400, { error: 'Invalid content input', details: parsed.error.issues });
          return;
        }
        runId = await startContent(parsed.data, projectId, chatId);
      }
      json(response, 202, { runId, status: 'running', kind });
    } catch (error) {
      json(response, 400, { error: toErrorMessage(error) });
    }
    return;
  }

  if (request.method === 'POST' && kind && segments.length === 4 && segments[3] === 'cancel') {
    const runId = segments[2];
    if (!runId) {
      json(response, 400, { error: 'Run id is required' });
      return;
    }
    const state = runs.get(runId);
    const control = runControls.get(runId);
    if (!state || state.kind !== kind) {
      json(response, 404, { error: 'Run not found' });
      return;
    }
    if (state.status !== 'running' || !control) {
      json(response, 200, state);
      return;
    }

    runs.set(runId, {
      ...state,
      status: 'canceled',
      error: 'Workflow run was canceled.',
      activeSteps: [],
    });
    try {
      await control.cancel();
      if (state.projectId) {
        await projectStore.recordRun({
          projectId: state.projectId,
          chatId: state.chatId,
          runId,
          kind,
          status: 'canceled' satisfies ProjectRunStatus,
          error: 'Workflow run was canceled.',
        });
      }
      runControls.delete(runId);
      json(response, 200, runs.get(runId));
    } catch (error) {
      json(response, 500, { error: `Could not cancel workflow: ${toErrorMessage(error)}` });
    }
    return;
  }

  if (request.method === 'GET' && kind && segments.length === 3) {
    const runId = segments[2];
    const state = runId ? runs.get(runId) : undefined;
    if (!state || state.kind !== kind) {
      json(response, 404, { error: 'Run not found' });
      return;
    }
    json(response, 200, state);
    return;
  }

  response.writeHead(404);
  response.end('Not found');
});

server.listen(PORT, () => {
  console.log(`Marketing workflow API running on http://localhost:${PORT} (model: ${getModel()})`);
});
