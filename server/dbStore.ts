import mongoose from 'mongoose';
import { User, Project, ProjectMember, ProjectFile, Invitation, Version, DocSnapshot } from './models';
import { config } from './config';

/**
 * Universal Data Layer
 * Uses Mongoose when connected to MongoDB Atlas.
 * Falls back to an in-memory repository in development mode if MongoDB is offline.
 */

// In-memory store structures for dev fallback
interface MemUser {
  _id: string;
  email: string;
  passwordHash: string;
  name: string;
  avatar?: string;
  createdAt: Date;
}

interface MemProject {
  _id: string;
  name: string;
  ownerId: string;
  description: string;
  isPublic: boolean;
  createdAt: Date;
  updatedAt: Date;
}

interface MemMember {
  _id: string;
  projectId: string;
  userId: string;
  role: 'owner' | 'editor' | 'viewer';
  joinedAt: Date;
}

interface MemFile {
  _id: string;
  projectId: string;
  name: string;
  path: string;
  isFolder: boolean;
  parentId?: string | null;
  language: string;
  content?: string;
  createdAt: Date;
  updatedAt: Date;
}

interface MemInvitation {
  _id: string;
  projectId: string;
  token: string;
  role: 'owner' | 'editor' | 'viewer';
  expiresAt: Date;
  createdBy: string;
  createdAt: Date;
}

interface MemVersion {
  _id: string;
  projectId: string;
  name: string;
  note?: string;
  createdBy: { userId: string; name: string };
  files: { fileId: string; fileName: string; content: string }[];
  createdAt: Date;
}

const mem = {
  users: new Map<string, MemUser>(),
  projects: new Map<string, MemProject>(),
  members: new Map<string, MemMember>(),
  files: new Map<string, MemFile>(),
  invitations: new Map<string, MemInvitation>(),
  versions: new Map<string, MemVersion>(),
  snapshots: new Map<string, Buffer>(),
};

function isMongoOnline(): boolean {
  return mongoose.connection.readyState === 1;
}

let idSeq = 1;
function genId(): string {
  return new mongoose.Types.ObjectId().toHexString();
}

export const dbStore = {
  isOnline: isMongoOnline,

  // Users
  async findUserByEmail(email: string) {
    if (isMongoOnline()) {
      return User.findOne({ email: email.toLowerCase() });
    }
    for (const u of mem.users.values()) {
      if (u.email.toLowerCase() === email.toLowerCase()) return u;
    }
    return null;
  },

  async findUserById(id: string) {
    if (isMongoOnline()) {
      return User.findById(id);
    }
    return mem.users.get(id) || null;
  },

  async createUser(data: { email: string; passwordHash: string; name: string; avatar?: string }) {
    if (isMongoOnline()) {
      return User.create(data);
    }
    const user: MemUser = {
      _id: genId(),
      email: data.email.toLowerCase(),
      passwordHash: data.passwordHash,
      name: data.name,
      avatar: data.avatar,
      createdAt: new Date(),
    };
    mem.users.set(user._id, user);
    return user;
  },

  // Projects
  async findProjectsForUser(userId: string) {
    if (isMongoOnline()) {
      const memberships = await ProjectMember.find({ userId });
      const projectIds = memberships.map((m) => m.projectId);
      return Project.find({ _id: { $in: projectIds } }).sort({ updatedAt: -1 });
    }
    const myProjects: MemProject[] = [];
    for (const m of mem.members.values()) {
      if (m.userId === userId) {
        const p = mem.projects.get(m.projectId);
        if (p) myProjects.push(p);
      }
    }
    return myProjects.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
  },

  async findProjectById(id: string) {
    if (isMongoOnline()) {
      return Project.findById(id);
    }
    return mem.projects.get(id) || null;
  },

  async createProject(name: string, ownerId: string, description: string = '') {
    if (isMongoOnline()) {
      const p = await Project.create({ name, ownerId, description });
      await ProjectMember.create({ projectId: p._id, userId: ownerId, role: 'owner' });
      return p;
    }
    const p: MemProject = {
      _id: genId(),
      name,
      ownerId,
      description,
      isPublic: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    mem.projects.set(p._id, p);
    const m: MemMember = {
      _id: genId(),
      projectId: p._id,
      userId: ownerId,
      role: 'owner',
      joinedAt: new Date(),
    };
    mem.members.set(m._id, m);
    return p;
  },

  async updateProject(id: string, update: Partial<MemProject>) {
    if (isMongoOnline()) {
      return Project.findByIdAndUpdate(id, { ...update, updatedAt: new Date() }, { new: true });
    }
    const p = mem.projects.get(id);
    if (!p) return null;
    Object.assign(p, update, { updatedAt: new Date() });
    return p;
  },

  async deleteProject(id: string) {
    if (isMongoOnline()) {
      await Project.findByIdAndDelete(id);
      await ProjectMember.deleteMany({ projectId: id });
      await ProjectFile.deleteMany({ projectId: id });
      return;
    }
    mem.projects.delete(id);
    for (const [k, m] of mem.members.entries()) {
      if (m.projectId === id) mem.members.delete(k);
    }
    for (const [k, f] of mem.files.entries()) {
      if (f.projectId === id) mem.files.delete(k);
    }
  },

  // Members & Roles
  async getMemberRole(projectId: string, userId: string): Promise<'owner' | 'editor' | 'viewer' | null> {
    if (isMongoOnline()) {
      const member = await ProjectMember.findOne({ projectId, userId });
      return member ? member.role : null;
    }
    for (const m of mem.members.values()) {
      if (m.projectId === projectId && m.userId === userId) {
        return m.role;
      }
    }
    return null;
  },

  async addMember(projectId: string, userId: string, role: 'owner' | 'editor' | 'viewer') {
    if (isMongoOnline()) {
      return ProjectMember.findOneAndUpdate(
        { projectId, userId },
        { role },
        { upsert: true, new: true }
      );
    }
    for (const m of mem.members.values()) {
      if (m.projectId === projectId && m.userId === userId) {
        m.role = role;
        return m;
      }
    }
    const member: MemMember = {
      _id: genId(),
      projectId,
      userId,
      role,
      joinedAt: new Date(),
    };
    mem.members.set(member._id, member);
    return member;
  },

  async getProjectMembers(projectId: string) {
    if (isMongoOnline()) {
      const members = await ProjectMember.find({ projectId }).populate('userId', 'name email avatar');
      return members.map((m: any) => ({
        userId: m.userId._id,
        name: m.userId.name,
        email: m.userId.email,
        avatar: m.userId.avatar,
        role: m.role,
        joinedAt: m.joinedAt,
      }));
    }
    const list: any[] = [];
    for (const m of mem.members.values()) {
      if (m.projectId === projectId) {
        const u = mem.users.get(m.userId);
        list.push({
          userId: m.userId,
          name: u?.name || 'Anonymous',
          email: u?.email || '',
          avatar: u?.avatar,
          role: m.role,
          joinedAt: m.joinedAt,
        });
      }
    }
    return list;
  },

  // Files
  async getProjectFiles(projectId: string) {
    if (isMongoOnline()) {
      return ProjectFile.find({ projectId }).sort({ isFolder: -1, name: 1 });
    }
    const files: MemFile[] = [];
    for (const f of mem.files.values()) {
      if (f.projectId === projectId) files.push(f);
    }
    return files.sort((a, b) => {
      if (a.isFolder === b.isFolder) return a.name.localeCompare(b.name);
      return a.isFolder ? -1 : 1;
    });
  },

  async createFile(data: {
    projectId: string;
    name: string;
    path: string;
    isFolder: boolean;
    parentId?: string | null;
    language?: string;
    content?: string;
  }) {
    if (isMongoOnline()) {
      const f = await ProjectFile.create(data);
      return f;
    }
    const f: MemFile = {
      _id: genId(),
      projectId: data.projectId,
      name: data.name,
      path: data.path,
      isFolder: data.isFolder,
      parentId: data.parentId || null,
      language: data.language || 'plaintext',
      content: data.content || '',
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    mem.files.set(f._id, f);
    return f;
  },

  async updateFile(id: string, update: Partial<MemFile>) {
    if (isMongoOnline()) {
      return ProjectFile.findByIdAndUpdate(id, { ...update, updatedAt: new Date() }, { new: true });
    }
    const f = mem.files.get(id);
    if (!f) return null;
    Object.assign(f, update, { updatedAt: new Date() });
    return f;
  },

  async deleteFile(id: string) {
    if (isMongoOnline()) {
      await ProjectFile.findByIdAndDelete(id);
      return;
    }
    mem.files.delete(id);
  },

  // Invitations
  async createInvitation(projectId: string, token: string, role: 'owner' | 'editor' | 'viewer', createdBy: string, expiresAt: Date) {
    if (isMongoOnline()) {
      return Invitation.create({ projectId, token, role, createdBy, expiresAt });
    }
    const inv: MemInvitation = {
      _id: genId(),
      projectId,
      token,
      role,
      expiresAt,
      createdBy,
      createdAt: new Date(),
    };
    mem.invitations.set(token, inv);
    return inv;
  },

  async findInvitationByToken(token: string) {
    if (isMongoOnline()) {
      return Invitation.findOne({ token });
    }
    return mem.invitations.get(token) || null;
  },

  // Versions / Checkpoints
  async getVersions(projectId: string) {
    if (isMongoOnline()) {
      return Version.find({ projectId }).sort({ createdAt: -1 });
    }
    const list: MemVersion[] = [];
    for (const v of mem.versions.values()) {
      if (v.projectId === projectId) list.push(v);
    }
    return list.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  },

  async createVersion(projectId: string, name: string, note: string, createdBy: { userId: string; name: string }, files: any[]) {
    if (isMongoOnline()) {
      return Version.create({ projectId, name, note, createdBy, files });
    }
    const v: MemVersion = {
      _id: genId(),
      projectId,
      name,
      note,
      createdBy,
      files,
      createdAt: new Date(),
    };
    mem.versions.set(v._id, v);
    return v;
  },

  async findVersionById(id: string) {
    if (isMongoOnline()) {
      return Version.findById(id);
    }
    return mem.versions.get(id) || null;
  },
};
