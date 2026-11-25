import type {
  ExecutionResult,
  Project,
  ProjectFile,
  ProjectMember,
  ProjectRole,
  User,
  VersionCheckpoint,
} from './types';

const BASE_URL = '/api';

const TOKEN_KEY = 'obsidian_token';
const USER_KEY = 'obsidian_user';

function readStorage(key: string): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStorage(key: string, value: string): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(key, value);
  } catch {
    // Ignore storage quota or private-browsing errors
  }
}

function removeStorage(key: string): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(key);
  } catch {
    // Ignore storage access errors
  }
}

function persistAuthSession(data: { user: User; token: string }): void {
  writeStorage(TOKEN_KEY, data.token);
  writeStorage(USER_KEY, JSON.stringify(data.user));
}

function getAuthHeaders(includeJsonContentType: boolean = true): HeadersInit {
  const token = readStorage(TOKEN_KEY);
  return {
    ...(includeJsonContentType ? { 'Content-Type': 'application/json' } : {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

async function handleResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({ message: res.statusText }));
    const message =
      typeof errorData?.message === 'string' && errorData.message.trim()
        ? errorData.message
        : `Request failed with status ${res.status}`;
    throw new Error(message);
  }
  if (res.status === 204) {
    return undefined as T;
  }
  return res.json() as Promise<T>;
}

async function requestJson<T>(
  path: string,
  init: RequestInit = {},
  options: { withAuth?: boolean; jsonBody?: unknown } = {}
): Promise<T> {
  const { withAuth = true, jsonBody } = options;
  const hasBody = jsonBody !== undefined;
  const baseHeaders = withAuth
    ? getAuthHeaders(hasBody)
    : hasBody
      ? { 'Content-Type': 'application/json' }
      : {};

  const res = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: {
      ...baseHeaders,
      ...(init.headers ?? {}),
    },
    ...(hasBody ? { body: JSON.stringify(jsonBody) } : {}),
  });

  return handleResponse<T>(res);
}

export interface RuntimeStatus {
  language: string;
  available: boolean;
  version?: string;
  hint?: string;
}

export const api = {
  // Auth
  async register(email: string, password: string, name: string): Promise<{ user: User; token: string }> {
    const data = await requestJson<{ user: User; token: string }>(
      '/auth/register',
      { method: 'POST' },
      { withAuth: false, jsonBody: { email, password, name } }
    );
    persistAuthSession(data);
    return data;
  },

  async login(email: string, password: string): Promise<{ user: User; token: string }> {
    const data = await requestJson<{ user: User; token: string }>(
      '/auth/login',
      { method: 'POST' },
      { withAuth: false, jsonBody: { email, password } }
    );
    persistAuthSession(data);
    return data;
  },

  async syncClerkUser(params: {
    clerkId: string;
    email: string;
    name: string;
    avatar?: string;
    sessionToken: string;
  }): Promise<{ user: User; token: string }> {
    const data = await requestJson<{ user: User; token: string }>(
      '/auth/clerk-sync',
      { method: 'POST' },
      { withAuth: false, jsonBody: params }
    );
    persistAuthSession(data);
    return data;
  },

  async getMe(): Promise<User> {
    return requestJson<User>('/auth/me');
  },

  async logout(): Promise<void> {
    try {
      await fetch(`${BASE_URL}/auth/logout`, {
        method: 'POST',
        headers: getAuthHeaders(false),
      });
    } catch {
      // Clear local session even if server logout fails
    } finally {
      removeStorage(TOKEN_KEY);
      removeStorage(USER_KEY);
    }
  },

  // Projects
  async getProjects(): Promise<Project[]> {
    return requestJson<Project[]>('/projects');
  },

  async createProject(
    name: string,
    description?: string,
    template: string = 'blank'
  ): Promise<Project> {
    return requestJson<Project>(
      '/projects',
      { method: 'POST' },
      { jsonBody: { name, description, template } }
    );
  },

  async getProject(projectId: string): Promise<{ project: Project; userRole: ProjectRole }> {
    return requestJson<{ project: Project; userRole: ProjectRole }>(
      `/projects/${encodeURIComponent(projectId)}`
    );
  },

  async updateProject(projectId: string, data: Partial<Project>): Promise<Project> {
    const cleanData = Object.fromEntries(
      Object.entries(data).filter(([, value]) => value !== undefined)
    );
    return requestJson<Project>(
      `/projects/${encodeURIComponent(projectId)}`,
      { method: 'PATCH' },
      { jsonBody: cleanData }
    );
  },

  async deleteProject(projectId: string): Promise<void> {
    return requestJson<void>(`/projects/${encodeURIComponent(projectId)}`, {
      method: 'DELETE',
    });
  },

  // Files
  async getProjectFiles(projectId: string): Promise<ProjectFile[]> {
    return requestJson<ProjectFile[]>(`/projects/${encodeURIComponent(projectId)}/files`);
  },

  async createFile(
    projectId: string,
    name: string,
    isFolder: boolean = false,
    parentId?: string | null,
    content: string = ''
  ): Promise<ProjectFile> {
    return requestJson<ProjectFile>(
      `/projects/${encodeURIComponent(projectId)}/files`,
      { method: 'POST' },
      { jsonBody: { name, isFolder, parentId, content } }
    );
  },

  async updateFile(fileId: string, data: Partial<ProjectFile>): Promise<ProjectFile> {
    return requestJson<ProjectFile>(
      `/files/${encodeURIComponent(fileId)}`,
      { method: 'PATCH' },
      { jsonBody: data }
    );
  },

  async deleteFile(fileId: string): Promise<void> {
    return requestJson<void>(`/files/${encodeURIComponent(fileId)}`, {
      method: 'DELETE',
    });
  },

  // Version Checkpoints
  async getVersions(projectId: string): Promise<VersionCheckpoint[]> {
    return requestJson<VersionCheckpoint[]>(
      `/projects/${encodeURIComponent(projectId)}/versions`
    );
  },

  async createVersion(
    projectId: string,
    name: string,
    note?: string,
    files?: { fileId: string; fileName: string; content: string }[],
    type?: 'auto' | 'manual',
    trigger?: string
  ): Promise<VersionCheckpoint> {
    return requestJson<VersionCheckpoint>(
      `/projects/${encodeURIComponent(projectId)}/versions`,
      { method: 'POST' },
      { jsonBody: { name, note, files, type, trigger } }
    );
  },

  async restoreVersion(versionId: string): Promise<VersionCheckpoint> {
    return requestJson<VersionCheckpoint>(
      `/versions/${encodeURIComponent(versionId)}/restore`,
      { method: 'POST' }
    );
  },

  // Sharing & Invitations
  async createInvitation(
    projectId: string,
    role: ProjectRole
  ): Promise<{ token: string; inviteUrl: string }> {
    return requestJson<{ token: string; inviteUrl: string }>(
      `/projects/${encodeURIComponent(projectId)}/invitations`,
      { method: 'POST' },
      { jsonBody: { role } }
    );
  },

  async acceptInvitation(
    token: string
  ): Promise<{ projectId: string; role: ProjectRole; message: string }> {
    return requestJson<{ projectId: string; role: ProjectRole; message: string }>(
      `/invitations/${encodeURIComponent(token)}/accept`,
      { method: 'POST' }
    );
  },

  async updateMemberRole(
    projectId: string,
    userId: string,
    role: ProjectRole
  ): Promise<{ message: string; member: ProjectMember }> {
    return requestJson<{ message: string; member: ProjectMember }>(
      `/projects/${encodeURIComponent(projectId)}/members/${encodeURIComponent(userId)}`,
      { method: 'PATCH' },
      { jsonBody: { role } }
    );
  },

  async removeMember(projectId: string, userId: string): Promise<{ message: string }> {
    return requestJson<{ message: string }>(
      `/projects/${encodeURIComponent(projectId)}/members/${encodeURIComponent(userId)}`,
      { method: 'DELETE' }
    );
  },

  // Sandbox Code Execution
  async executeCode(
    code: string,
    language: string,
    fileName?: string
  ): Promise<ExecutionResult> {
    return requestJson<ExecutionResult>(
      '/execute',
      { method: 'POST' },
      { jsonBody: { code, language, fileName } }
    );
  },

  async getRuntimes(): Promise<{ runtimes: RuntimeStatus[] }> {
    return requestJson<{ runtimes: RuntimeStatus[] }>('/execute/runtimes');
  },

  async getOAuthProviders(): Promise<{ github: boolean }> {
    return requestJson<{ github: boolean }>('/auth/oauth/providers', {}, { withAuth: false });
  },
};
