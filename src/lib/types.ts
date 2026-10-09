export type ProjectRole = 'owner' | 'editor' | 'viewer';

export interface User {
  _id: string;
  email: string;
  name: string;
  avatar?: string;
  createdAt?: string;
}

export interface ProjectMember {
  userId: string;
  name: string;
  email: string;
  avatar?: string;
  role: ProjectRole;
  joinedAt?: string;
}

export interface Project {
  _id: string;
  name: string;
  ownerId: string;
  ownerName?: string;
  description?: string;
  isPublic?: boolean;
  memberCount?: number;
  members?: ProjectMember[];
  createdAt: string;
  updatedAt: string;
}

export interface ProjectFile {
  _id: string;
  projectId: string;
  name: string;
  path: string;
  isFolder: boolean;
  parentId?: string | null;
  language?: string;
  content?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface FileCheckpoint {
  fileId: string;
  fileName: string;
  content: string;
}

export interface VersionCheckpoint {
  _id: string;
  projectId: string;
  name: string;
  note?: string;
  createdBy: {
    userId: string;
    name: string;
  };
  files: FileCheckpoint[];
  createdAt: string;
}

export interface DiagnosticsItem {
  id: string;
  fileId: string;
  fileName?: string;
  line: number;
  column: number;
  endLine: number;
  endColumn: number;
  message: string;
  severity: 'error' | 'warning' | 'info';
  source: string;
}

export interface CollaboratorPresence {
  id: string;
  name: string;
  color: string;
  avatar?: string;
  role: ProjectRole;
  fileId?: string;
  cursor?: {
    line: number;
    column: number;
  };
  selection?: {
    startLine: number;
    startColumn: number;
    endLine: number;
    endColumn: number;
  };
}

export type TransportMode = 'Hybrid' | 'WebSocket Only' | 'P2P Mesh Only';

export type BottomTab = 'OUTPUT' | 'TERMINAL' | 'PROBLEMS' | 'PREVIEW';

export interface ExecutionResult {
  stdout: string[];
  stderr: string[];
  error?: string;
  executionTimeMs: number;
  timestamp: string;
}
