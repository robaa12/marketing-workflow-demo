import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

export type ProjectRunKind = 'strategy' | 'content';
export type ProjectRunStatus = 'success' | 'failed' | 'canceled';

export interface ProjectSummary {
  id: string;
  name: string;
  color: string;
  createdAt: string;
  updatedAt: string;
  historyCount: number;
  chatCount: number;
  lastRunAt?: string;
}

export interface ProjectHistoryEntry {
  id: string;
  projectId: string;
  chatId?: string;
  runId: string;
  kind: ProjectRunKind;
  status: ProjectRunStatus;
  createdAt: string;
  postCount: number;
  result?: unknown;
  error?: string;
}

export interface ChatSummary {
  id: string;
  projectId: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  historyCount: number;
}

interface StoredProject {
  id: string;
  name: string;
  color: string;
  createdAt: string;
  updatedAt: string;
}

interface StoredChat {
  id: string;
  projectId: string;
  title: string;
  createdAt: string;
  updatedAt: string;
}

interface ProjectData {
  projects: StoredProject[];
  chats: StoredChat[];
  history: ProjectHistoryEntry[];
}

const PROJECT_COLORS = ['#b7f36b', '#d0bcff', '#ffb3c7', '#ffd36e', '#8fd9cf', '#91b9ff'];

export class ProjectStore {
  private writeQueue: Promise<void> = Promise.resolve();

  constructor(private readonly filePath: string) {}

  private async read(): Promise<ProjectData> {
    try {
      const parsed = JSON.parse(await readFile(this.filePath, 'utf8')) as Partial<ProjectData>;
      return {
        projects: Array.isArray(parsed.projects) ? parsed.projects : [],
        chats: Array.isArray(parsed.chats) ? parsed.chats : [],
        history: Array.isArray(parsed.history) ? parsed.history : [],
      };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { projects: [], chats: [], history: [] };
      throw error;
    }
  }

  private async mutate<T>(update: (data: ProjectData) => T): Promise<T> {
    let result: T;
    const operation = this.writeQueue.then(async () => {
      const data = await this.read();
      result = update(data);
      await mkdir(dirname(this.filePath), { recursive: true });
      const temporaryPath = `${this.filePath}.${process.pid}.tmp`;
      await writeFile(temporaryPath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
      await rename(temporaryPath, this.filePath);
    });
    this.writeQueue = operation.catch(() => undefined);
    await operation;
    return result!;
  }

  async listProjects(): Promise<ProjectSummary[]> {
    await this.writeQueue;
    const data = await this.read();
    return data.projects
      .map((project) => {
        const projectHistory = data.history.filter((entry) => entry.projectId === project.id);
        return {
          ...project,
          historyCount: projectHistory.length,
          chatCount: data.chats.filter((chat) => chat.projectId === project.id).length,
          lastRunAt: projectHistory[0]?.createdAt,
        };
      })
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async createProject(name: string, color?: string): Promise<ProjectSummary> {
    return this.mutate((data) => {
      const timestamp = new Date().toISOString();
      const project: StoredProject = {
        id: randomUUID(),
        name: name.trim().slice(0, 120),
        color: color ?? PROJECT_COLORS[data.projects.length % PROJECT_COLORS.length]!,
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      data.projects.unshift(project);
      return { ...project, historyCount: 0, chatCount: 0 };
    });
  }

  async renameProject(projectId: string, name: string): Promise<ProjectSummary | undefined> {
    return this.mutate((data) => {
      const project = data.projects.find((candidate) => candidate.id === projectId);
      if (!project) return undefined;
      project.name = name.trim().slice(0, 120);
      project.updatedAt = new Date().toISOString();
      const projectHistory = data.history.filter((entry) => entry.projectId === projectId);
      return {
        ...project,
        historyCount: projectHistory.length,
        chatCount: data.chats.filter((chat) => chat.projectId === projectId).length,
        lastRunAt: projectHistory[0]?.createdAt,
      };
    });
  }

  async deleteProject(projectId: string): Promise<boolean> {
    return this.mutate((data) => {
      const initialLength = data.projects.length;
      data.projects = data.projects.filter((project) => project.id !== projectId);
      data.chats = data.chats.filter((chat) => chat.projectId !== projectId);
      data.history = data.history.filter((entry) => entry.projectId !== projectId);
      return data.projects.length !== initialLength;
    });
  }

  async hasProject(projectId: string): Promise<boolean> {
    await this.writeQueue;
    return (await this.read()).projects.some((project) => project.id === projectId);
  }

  async listHistory(projectId: string): Promise<ProjectHistoryEntry[]> {
    await this.writeQueue;
    return (await this.read()).history
      .filter((entry) => entry.projectId === projectId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async listChats(projectId: string): Promise<ChatSummary[]> {
    await this.writeQueue;
    const data = await this.read();
    return data.chats
      .filter((chat) => chat.projectId === projectId)
      .map((chat) => ({
        ...chat,
        historyCount: data.history.filter((entry) => entry.chatId === chat.id).length,
      }))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async createChat(projectId: string, title: string): Promise<ChatSummary | undefined> {
    return this.mutate((data) => {
      const project = data.projects.find((candidate) => candidate.id === projectId);
      if (!project) return undefined;
      const timestamp = new Date().toISOString();
      const chat: StoredChat = {
        id: randomUUID(),
        projectId,
        title: title.trim().slice(0, 120),
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      data.chats.unshift(chat);
      project.updatedAt = timestamp;
      return { ...chat, historyCount: 0 };
    });
  }

  async hasChat(projectId: string, chatId: string): Promise<boolean> {
    await this.writeQueue;
    return (await this.read()).chats.some((chat) => chat.id === chatId && chat.projectId === projectId);
  }

  async deleteChat(projectId: string, chatId: string): Promise<boolean> {
    return this.mutate((data) => {
      const initialLength = data.chats.length;
      data.chats = data.chats.filter((chat) => chat.id !== chatId || chat.projectId !== projectId);
      if (data.chats.length === initialLength) return false;
      data.history = data.history.filter((entry) => entry.chatId !== chatId || entry.projectId !== projectId);
      const project = data.projects.find((candidate) => candidate.id === projectId);
      if (project) project.updatedAt = new Date().toISOString();
      return true;
    });
  }

  async listChatHistory(projectId: string, chatId: string): Promise<ProjectHistoryEntry[]> {
    await this.writeQueue;
    return (await this.read()).history
      .filter((entry) => entry.projectId === projectId && entry.chatId === chatId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async recordRun(entry: Omit<ProjectHistoryEntry, 'id' | 'createdAt' | 'postCount'>): Promise<void> {
    await this.mutate((data) => {
      const project = data.projects.find((candidate) => candidate.id === entry.projectId);
      if (!project) return;
      const createdAt = new Date().toISOString();
      const result = entry.result as { calendar?: unknown[] } | undefined;
      data.history.unshift({
        ...entry,
        id: randomUUID(),
        createdAt,
        postCount: Array.isArray(result?.calendar) ? result.calendar.length : 0,
      });
      project.updatedAt = createdAt;
      const chat = entry.chatId
        ? data.chats.find((candidate) => candidate.id === entry.chatId && candidate.projectId === entry.projectId)
        : undefined;
      if (chat) chat.updatedAt = createdAt;
    });
  }
}
