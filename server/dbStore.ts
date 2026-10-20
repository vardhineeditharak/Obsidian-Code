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
  passwordHash?: string;
  name: string;
  avatar?: string;
  githubId?: string;
  clerkId?: string;
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
  consumedAt?: Date;
  createdBy: string;
  createdAt: Date;
}

let versionSeq = 0;

interface MemVersion {
  _id: string;
  projectId: string;
  name: string;
  note?: string;
  type?: 'auto' | 'manual';
  trigger?: string;
  createdBy: { userId: string; name: string };
  files: { fileId: string; fileName: string; content: string }[];
  createdAt: Date;
  seq?: number;
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

  async findUserByGithubId(githubId: string) {
    if (isMongoOnline()) {
      return User.findOne({ githubId });
    }
    for (const u of mem.users.values()) {
      if (u.githubId === githubId) return u;
    }
    return null;
  },

  async upsertGithubUser(data: { githubId: string; email: string; name: string; avatar?: string }) {
    // 1. Existing user with this githubId
    let user = await this.findUserByGithubId(data.githubId);
    if (user) {
      return user;
    }

    // 2. Existing user with matching email: link githubId
    user = await this.findUserByEmail(data.email);
    if (user) {
      if (isMongoOnline()) {
        return User.findByIdAndUpdate(user._id, { githubId: data.githubId }, { new: true });
      }
      const memUser = mem.users.get(user._id);
      if (memUser) {
        memUser.githubId = data.githubId;
      }
      return user;
    }

    // 3. Brand new OAuth user
    if (isMongoOnline()) {
      return User.create({
        email: data.email.toLowerCase(),
        name: data.name,
        avatar: data.avatar,
        githubId: data.githubId,
      });
    }

    const newUser: MemUser = {
      _id: genId(),
      email: data.email.toLowerCase(),
      name: data.name,
      avatar: data.avatar,
      githubId: data.githubId,
      createdAt: new Date(),
    };
    mem.users.set(newUser._id, newUser);
    return newUser;
  },

  async findUserByClerkId(clerkId: string) {
    if (isMongoOnline()) {
      return User.findOne({ clerkId });
    }
    for (const u of mem.users.values()) {
      if (u.clerkId === clerkId) return u;
    }
    return null;
  },

  async upsertClerkUser(data: { clerkId: string; email: string; name: string; avatar?: string }) {
    // 1. Existing user with this clerkId
    let user = await this.findUserByClerkId(data.clerkId);
    if (user) {
      if ((data.name && user.name !== data.name) || (data.avatar && user.avatar !== data.avatar)) {
        if (isMongoOnline()) {
          return User.findByIdAndUpdate(user._id, { name: data.name, avatar: data.avatar }, { new: true });
        }
        const memUser = mem.users.get(user._id);
        if (memUser) {
          memUser.name = data.name;
          if (data.avatar) memUser.avatar = data.avatar;
        }
      }
      return user;
    }

    // 2. Existing user with matching email: link clerkId
    user = await this.findUserByEmail(data.email);
    if (user) {
      if (isMongoOnline()) {
        return User.findByIdAndUpdate(user._id, { clerkId: data.clerkId, name: data.name || user.name, avatar: data.avatar || user.avatar }, { new: true });
      }
      const memUser = mem.users.get(user._id);
      if (memUser) {
        memUser.clerkId = data.clerkId;
        if (data.name) memUser.name = data.name;
        if (data.avatar) memUser.avatar = data.avatar;
      }
      return user;
    }

    // 3. Brand new Clerk user
    if (isMongoOnline()) {
      return User.create({
        email: data.email.toLowerCase(),
        name: data.name,
        avatar: data.avatar || `https://api.dicebear.com/7.x/identicon/svg?seed=${encodeURIComponent(data.name)}`,
        clerkId: data.clerkId,
      });
    }

    const newUser: MemUser = {
      _id: genId(),
      email: data.email.toLowerCase(),
      name: data.name,
      avatar: data.avatar || `https://api.dicebear.com/7.x/identicon/svg?seed=${encodeURIComponent(data.name)}`,
      clerkId: data.clerkId,
      createdAt: new Date(),
    };
    mem.users.set(newUser._id, newUser);
    return newUser;
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
      const doc = await Project.findById(id);
      return doc ? (typeof doc.toObject === 'function' ? doc.toObject() : doc) : null;
    }
    return mem.projects.get(id) || null;
  },

  async createProject(name: string, ownerId: string, description: string = '') {
    if (isMongoOnline()) {
      const p = await Project.create({ name, ownerId, description });
      await ProjectMember.create({ projectId: p._id, userId: ownerId, role: 'owner' });
      return typeof p.toObject === 'function' ? p.toObject() : p;
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
    const cleanUpdate = Object.fromEntries(
      Object.entries(update).filter(([_, v]) => v !== undefined)
    );
    if (isMongoOnline()) {
      const doc = await Project.findByIdAndUpdate(id, { ...cleanUpdate, updatedAt: new Date() }, { new: true });
      return doc ? (typeof doc.toObject === 'function' ? doc.toObject() : doc) : null;
    }
    const p = mem.projects.get(id);
    if (!p) return null;
    Object.assign(p, cleanUpdate, { updatedAt: new Date() });
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
    const roleRanks: Record<'owner' | 'editor' | 'viewer', number> = {
      owner: 3,
      editor: 2,
      viewer: 1,
    };
    if (isMongoOnline()) {
      const existing = await ProjectMember.findOne({ projectId, userId });
      let finalRole = role;
      if (existing && roleRanks[existing.role as 'owner' | 'editor' | 'viewer'] > roleRanks[role]) {
        finalRole = existing.role as 'owner' | 'editor' | 'viewer';
      }
      return ProjectMember.findOneAndUpdate(
        { projectId, userId },
        { role: finalRole },
        { upsert: true, new: true }
      );
    }
    for (const m of mem.members.values()) {
      if (m.projectId === projectId && m.userId === userId) {
        if (roleRanks[m.role] < roleRanks[role]) {
          m.role = role;
        }
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

  async updateMemberRole(projectId: string, userId: string, role: 'owner' | 'editor' | 'viewer') {
    if (isMongoOnline()) {
      return ProjectMember.findOneAndUpdate(
        { projectId, userId },
        { role },
        { new: true }
      );
    }
    for (const m of mem.members.values()) {
      if (m.projectId === projectId && m.userId === userId) {
        m.role = role;
        return m;
      }
    }
    return null;
  },

  async removeMember(projectId: string, userId: string) {
    if (isMongoOnline()) {
      const res = await ProjectMember.findOneAndDelete({ projectId, userId });
      return !!res;
    }
    for (const [k, m] of mem.members.entries()) {
      if (m.projectId === projectId && m.userId === userId) {
        mem.members.delete(k);
        return true;
      }
    }
    return false;
  },

  async getProjectMembers(projectId: string) {
    if (isMongoOnline()) {
      const members = await ProjectMember.find({ projectId }).populate('userId', 'name email avatar');
      return members
        .filter((m: any) => m.userId != null)
        .map((m: any) => ({
          userId: m.userId._id,
          name: m.userId.name || 'Collaborator',
          email: m.userId.email || '',
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

  async getFileById(id: string) {
    if (isMongoOnline()) {
      return ProjectFile.findById(id);
    }
    return mem.files.get(id) || null;
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

  async consumeInvitation(token: string) {
    if (isMongoOnline()) {
      return Invitation.findOneAndUpdate({ token }, { consumedAt: new Date() }, { new: true });
    }
    const inv = mem.invitations.get(token);
    if (inv) {
      inv.consumedAt = new Date();
    }
    return inv || null;
  },

  // Versions / Checkpoints
  async getVersions(projectId: string) {
    if (isMongoOnline()) {
      return Version.find({ projectId }).sort({ createdAt: -1, _id: -1 });
    }
    const list: MemVersion[] = [];
    for (const v of mem.versions.values()) {
      if (v.projectId === projectId) list.push(v);
    }
    return list.sort((a, b) => {
      const diff = b.createdAt.getTime() - a.createdAt.getTime();
      if (diff !== 0) return diff;
      return (b.seq || 0) - (a.seq || 0);
    });
  },

  async createVersion(
    projectId: string,
    name: string,
    note: string,
    createdBy: { userId: string; name: string },
    files: any[],
    type: 'auto' | 'manual' = 'manual',
    trigger: string = 'manual'
  ) {
    if (isMongoOnline()) {
      const v = await Version.create({ projectId, name, note, createdBy, files, type, trigger });
      if (type === 'auto') {
        await this.pruneAutoVersions(projectId, 50);
      }
      return v;
    }
    const v: MemVersion = {
      _id: genId(),
      projectId,
      name,
      note,
      createdBy,
      files,
      type,
      trigger,
      createdAt: new Date(),
      seq: ++versionSeq,
    };
    mem.versions.set(v._id, v);
    if (type === 'auto') {
      await this.pruneAutoVersions(projectId, 50);
    }
    return v;
  },

  async pruneAutoVersions(projectId: string, keepCount: number = 50) {
    if (isMongoOnline()) {
      const autoVersions = await Version.find({ projectId, type: 'auto' })
        .sort({ createdAt: -1, _id: -1 })
        .select('_id');
      if (autoVersions.length > keepCount) {
        const toDeleteIds = autoVersions.slice(keepCount).map((v: any) => v._id);
        await Version.deleteMany({ _id: { $in: toDeleteIds } });
      }
      return;
    }
    const autoList: MemVersion[] = [];
    for (const v of mem.versions.values()) {
      if (v.projectId === projectId && v.type === 'auto') {
        autoList.push(v);
      }
    }
    autoList.sort((a, b) => {
      const diff = b.createdAt.getTime() - a.createdAt.getTime();
      if (diff !== 0) return diff;
      return (b.seq || 0) - (a.seq || 0);
    });
    if (autoList.length > keepCount) {
      const toDelete = autoList.slice(keepCount);
      for (const v of toDelete) {
        mem.versions.delete(v._id);
      }
    }
  },

  async findVersionById(id: string) {
    if (isMongoOnline()) {
      return Version.findById(id);
    }
    return mem.versions.get(id) || null;
  },

  async saveDocSnapshot(projectId: string, fileId: string, yjsState: Buffer) {
    if (isMongoOnline()) {
      return DocSnapshot.findOneAndUpdate(
        { projectId, fileId },
        { yjsState, updatedAt: new Date() },
        { upsert: true, new: true }
      );
    }
    mem.snapshots.set(`${projectId}:${fileId}`, yjsState);
  },

  async getDocSnapshot(projectId: string, fileId: string): Promise<Buffer | null> {
    if (isMongoOnline()) {
      const snap = await DocSnapshot.findOne({ projectId, fileId });
      return snap ? snap.yjsState : null;
    }
    return mem.snapshots.get(`${projectId}:${fileId}`) || null;
  },
};
