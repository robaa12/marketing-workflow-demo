import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { ProjectStore } from '../../src/lib/project-store.js';

const temporaryDirectories: string[] = [];

async function createStore(): Promise<{ store: ProjectStore; filePath: string }> {
  const directory = await mkdtemp(join(tmpdir(), 'aetherflow-projects-'));
  temporaryDirectories.push(directory);
  const filePath = join(directory, 'workspace.json');
  return { store: new ProjectStore(filePath), filePath };
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe('ProjectStore', () => {
  it('persists projects and completed workflow history', async () => {
    const { store, filePath } = await createStore();
    const project = await store.createProject('Launch campaign');
    const chat = await store.createChat(project.id, 'LinkedIn launch');
    expect(chat).toBeDefined();

    await store.recordRun({
      projectId: project.id,
      chatId: chat!.id,
      runId: 'content-run-1',
      kind: 'content',
      status: 'success',
      result: { calendar: [{ caption: 'First post' }, { caption: 'Second post' }] },
    });

    expect(await store.listProjects()).toMatchObject([{
      id: project.id,
      name: 'Launch campaign',
      historyCount: 1,
      chatCount: 1,
    }]);
    expect(await store.listHistory(project.id)).toMatchObject([{
      runId: 'content-run-1',
      status: 'success',
      postCount: 2,
    }]);
    expect(await store.listChatHistory(project.id, chat!.id)).toHaveLength(1);
    expect(JSON.parse(await readFile(filePath, 'utf8'))).toHaveProperty('projects.0.id', project.id);
  });

  it('serializes concurrent project writes without losing data', async () => {
    const { store } = await createStore();

    await Promise.all([
      store.createProject('Project one'),
      store.createProject('Project two'),
      store.createProject('Project three'),
    ]);

    expect(await store.listProjects()).toHaveLength(3);
  });

  it('renames projects and deletes their chats and history', async () => {
    const { store } = await createStore();
    const project = await store.createProject('Old project name');
    const firstChat = await store.createChat(project.id, 'Chat one');
    const secondChat = await store.createChat(project.id, 'Chat two');

    expect(firstChat).toBeDefined();
    expect(secondChat).toBeDefined();
    expect(await store.listChats(project.id)).toHaveLength(2);
    expect(await store.renameProject(project.id, 'Renamed project')).toMatchObject({
      name: 'Renamed project',
      chatCount: 2,
    });

    expect(await store.deleteProject(project.id)).toBe(true);
    expect(await store.hasProject(project.id)).toBe(false);
    expect(await store.listChats(project.id)).toEqual([]);
  });

  it('deletes one chat and only its workflow history', async () => {
    const { store } = await createStore();
    const project = await store.createProject('Multi-chat project');
    const firstChat = await store.createChat(project.id, 'Chat one');
    const secondChat = await store.createChat(project.id, 'Chat two');
    expect(firstChat).toBeDefined();
    expect(secondChat).toBeDefined();

    await store.recordRun({ projectId: project.id, chatId: firstChat!.id, runId: 'run-1', kind: 'strategy', status: 'success', result: {} });
    await store.recordRun({ projectId: project.id, chatId: secondChat!.id, runId: 'run-2', kind: 'strategy', status: 'success', result: {} });

    expect(await store.deleteChat(project.id, firstChat!.id)).toBe(true);
    expect(await store.listChats(project.id)).toMatchObject([{ id: secondChat!.id }]);
    expect(await store.listChatHistory(project.id, firstChat!.id)).toEqual([]);
    expect(await store.listChatHistory(project.id, secondChat!.id)).toHaveLength(1);
  });
});
