import { User, Project, ProjectFile, VersionCheckpoint, ProjectRole, ExecutionResult } from './types';

const BASE_URL = '/api';

function getAuthHeaders(): HeadersInit {
  const token = typeof window !== 'undefined' ? localStorage.getItem('obsidian_token') : null;
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

async function handleResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({ message: res.statusText }));
    throw new Error(errorData.message || `Request failed with status ${res.status}`);
  }
  return res.json();
}

export const api = {
  // Auth
  async register(email: string, password: string, name: string): Promise<{ user: User; token: string }> {
    const res = await fetch(`${BASE_URL}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, name }),
    });
    const data = await handleResponse<{ user: User; token: string }>(res);
    if (typeof window !== 'undefined') {
      localStorage.setItem('obsidian_token', data.token);
      localStorage.setItem('obsidian_user', JSON.stringify(data.user));
    }
    return data;
  },

  async login(email: string, password: string): Promise<{ user: User; token: string }> {
    const res = await fetch(`${BASE_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    const data = await handleResponse<{ user: User; token: string }>(res);
    if (typeof window !== 'undefined') {
      localStorage.setItem('obsidian_token', data.token);
      localStorage.setItem('obsidian_user', JSON.stringify(data.user));
    }
    return data;
  },

  async syncClerkUser(params: { clerkId: string; email: string; name: string; avatar?: string }): Promise<{ user: User; token: string }> {
    const res = await fetch(`${BASE_URL}/auth/clerk-sync`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });
    const data = await handleResponse<{ user: User; token: string }>(res);
    if (typeof window !== 'undefined') {
      localStorage.setItem('obsidian_token', data.token);
      localStorage.setItem('obsidian_user', JSON.stringify(data.user));
    }
    return data;
  },

  async getMe(): Promise<User> {
    const res = await fetch(`${BASE_URL}/auth/me`, {
      headers: getAuthHeaders(),
    });
    return handleResponse<User>(res);
  },

  async logout(): Promise<void> {
    try {
      await fetch(`${BASE_URL}/auth/logout`, {
        method: 'POST',
        headers: getAuthHeaders(),
      });
    } finally {
      if (typeof window !== 'undefined') {
        localStorage.removeItem('obsidian_token');
        localStorage.removeItem('obsidian_user');
      }
    }
  },

  // Projects
  async getProjects(): Promise<Project[]> {
    const res = await fetch(`${BASE_URL}/projects`, {
      headers: getAuthHeaders(),
    });
    return handleResponse<Project[]>(res);
  },

  async createProject(name: string, description?: string, template: string = 'blank'): Promise<Project> {
    const res = await fetch(`${BASE_URL}/projects`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ name, description, template }),
    });
    return handleResponse<Project>(res);
  },

  async getProject(projectId: string): Promise<{ project: Project; userRole: ProjectRole }> {
    const res = await fetch(`${BASE_URL}/projects/${projectId}`, {
      headers: getAuthHeaders(),
    });
    return handleResponse<{ project: Project; userRole: ProjectRole }>(res);
  },

  async updateProject(projectId: string, data: Partial<Project>): Promise<Project> {
    const res = await fetch(`${BASE_URL}/projects/${projectId}`, {
      method: 'PATCH',
      headers: getAuthHeaders(),
      body: JSON.stringify(data),
    });
    return handleResponse<Project>(res);
  },

  async deleteProject(projectId: string): Promise<void> {
    const res = await fetch(`${BASE_URL}/projects/${projectId}`, {
      method: 'DELETE',
      headers: getAuthHeaders(),
    });
    return handleResponse<void>(res);
  },

  // Files
  async getProjectFiles(projectId: string): Promise<ProjectFile[]> {
    const res = await fetch(`${BASE_URL}/projects/${projectId}/files`, {
      headers: getAuthHeaders(),
    });
    return handleResponse<ProjectFile[]>(res);
  },

  async createFile(
    projectId: string,
    name: string,
    isFolder: boolean = false,
    parentId?: string | null,
    content: string = ''
  ): Promise<ProjectFile> {
    const res = await fetch(`${BASE_URL}/projects/${projectId}/files`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ name, isFolder, parentId, content }),
    });
    return handleResponse<ProjectFile>(res);
  },

  async updateFile(fileId: string, data: Partial<ProjectFile>): Promise<ProjectFile> {
    const res = await fetch(`${BASE_URL}/files/${fileId}`, {
      method: 'PATCH',
      headers: getAuthHeaders(),
      body: JSON.stringify(data),
    });
    return handleResponse<ProjectFile>(res);
  },

  async deleteFile(fileId: string): Promise<void> {
    const res = await fetch(`${BASE_URL}/files/${fileId}`, {
      method: 'DELETE',
      headers: getAuthHeaders(),
    });
    return handleResponse<void>(res);
  },

  // Version Checkpoints
  async getVersions(projectId: string): Promise<VersionCheckpoint[]> {
    const res = await fetch(`${BASE_URL}/projects/${projectId}/versions`, {
      headers: getAuthHeaders(),
    });
    return handleResponse<VersionCheckpoint[]>(res);
  },

  async createVersion(projectId: string, name: string, note?: string, files?: { fileId: string; fileName: string; content: string }[]): Promise<VersionCheckpoint> {
    const res = await fetch(`${BASE_URL}/projects/${projectId}/versions`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ name, note, files }),
    });
    return handleResponse<VersionCheckpoint>(res);
  },

  async restoreVersion(versionId: string): Promise<VersionCheckpoint> {
    const res = await fetch(`${BASE_URL}/versions/${versionId}/restore`, {
      method: 'POST',
      headers: getAuthHeaders(),
    });
    return handleResponse<VersionCheckpoint>(res);
  },

  // Sharing & Invitations
  async createInvitation(projectId: string, role: ProjectRole): Promise<{ token: string; inviteUrl: string }> {
    const res = await fetch(`${BASE_URL}/projects/${projectId}/invitations`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ role }),
    });
    return handleResponse<{ token: string; inviteUrl: string }>(res);
  },

  async acceptInvitation(token: string): Promise<{ projectId: string; role: ProjectRole; message: string }> {
    const res = await fetch(`${BASE_URL}/invitations/${token}/accept`, {
      method: 'POST',
      headers: getAuthHeaders(),
    });
    return handleResponse<{ projectId: string; role: ProjectRole; message: string }>(res);
  },

  async updateMemberRole(projectId: string, userId: string, role: ProjectRole): Promise<{ message: string; member: any }> {
    const res = await fetch(`${BASE_URL}/projects/${projectId}/members/${userId}`, {
      method: 'PATCH',
      headers: getAuthHeaders(),
      body: JSON.stringify({ role }),
    });
    return handleResponse<{ message: string; member: any }>(res);
  },

  async removeMember(projectId: string, userId: string): Promise<{ message: string }> {
    const res = await fetch(`${BASE_URL}/projects/${projectId}/members/${userId}`, {
      method: 'DELETE',
      headers: getAuthHeaders(),
    });
    return handleResponse<{ message: string }>(res);
  },

  // Sandbox Code Execution
  async executeCode(code: string, language: string, fileName?: string): Promise<ExecutionResult> {
    const res = await fetch(`${BASE_URL}/execute`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ code, language, fileName }),
    });
    return handleResponse<ExecutionResult>(res);
  },

  async getRuntimes(): Promise<{ runtimes: { language: string; available: boolean; version?: string; hint?: string }[] }> {
    const res = await fetch(`${BASE_URL}/execute/runtimes`, {
      headers: getAuthHeaders(),
    });
    return handleResponse<{ runtimes: { language: string; available: boolean; version?: string; hint?: string }[] }>(res);
  },

  async getOAuthProviders(): Promise<{ github: boolean }> {
    const res = await fetch(`${BASE_URL}/auth/oauth/providers`);
    return handleResponse<{ github: boolean }>(res);
  },
};
