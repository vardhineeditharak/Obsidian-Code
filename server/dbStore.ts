import mongoose from 'mongoose';
import {
  User,
  Project,
  ProjectMember,
  ProjectFile,
  Invitation,
  Version,
  DocSnapshot,
} from './models';

export type ProjectRole = 'owner' | 'editor' | 'viewer';

export interface StoredUser {
  _id: string | mongoose.Types.ObjectId;
  email: string;
  passwordHash?: string;
  name: string;
  avatar?: string;
  githubId?: string;
  clerkId?: string;
  createdAt: Date;
}

export interface StoredProject {
  _id: string | mongoose.Types.ObjectId;
  name: string;
  ownerId: string | mongoose.Types.ObjectId;
  description: string;
  isPublic: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface StoredMember {
  _id: string | mongoose.Types.ObjectId;
  projectId: string | mongoose.Types.ObjectId;
  userId: string | mongoose.Types.ObjectId;
  role: ProjectRole;
  joinedAt: Date;
}

export interface StoredFile {
  _id: string | mongoose.Types.ObjectId;
  projectId: string | mongoose.Types.ObjectId;
  name: string;
  path: string;
  isFolder: boolean;
  parentId?: string | mongoose.Types.ObjectId | null;
  language?: string;
  content?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface StoredInvitation {
  _id: string | mongoose.Types.ObjectId;
  projectId: string | mongoose.Types.ObjectId;
  token: string;
  role: ProjectRole;
  expiresAt: Date;
  consumedAt?: Date | null;
  createdBy: string | mongoose.Types.ObjectId;
  createdAt: Date;
}

export interface StoredVersionFile {
  fileId: string;
  fileName: string;
  content: string;
}

export interface StoredVersion {
  _id: string | mongoose.Types.ObjectId;
  projectId: string | mongoose.Types.ObjectId;
  name: string;
  note?: string;
  type?: 'auto' | 'manual';
  trigger?: string;
  createdBy: { userId: string | mongoose.Types.ObjectId; name: string };
  files: StoredVersionFile[];
  createdAt: Date;
  seq?: number;
}

export interface ProjectMemberView {
  userId: string | mongoose.Types.ObjectId;
  name: string;
  email: string;
  avatar?: string;
  role: ProjectRole;
  joinedAt: Date;
}

export interface CreateProjectOptions {
  name: string;
  ownerId: string;
  description?: string;
  isPublic?: boolean;
}

const ROLE_RANKS: Record<ProjectRole, number> = {
  owner: 3,
  editor: 2,
  viewer: 1,
};

let versionSeq = 0;

const mem = {
  users: new Map<string, StoredUser>(),
  projects: new Map<string, StoredProject>(),
  members: new Map<string, StoredMember>(),
  files: new Map<string, StoredFile>(),
  invitations: new Map<string, StoredInvitation>(),
  versions: new Map<string, StoredVersion>(),
  snapshots: new Map<string, Buffer>(),
};

function isMongoOnline(): boolean {
  return mongoose.connection.readyState === 1;
}

function isValidObjectId(id: string): boolean {
  return mongoose.isValidObjectId(id);
}

function genId(): string {
  return new mongoose.Types.ObjectId().toHexString();
}

function toPlainObject<T>(doc: any): T {
  if (!doc) return doc;
  return typeof doc.toObject === 'function' ? doc.toObject() : doc;
}

function toBuffer(data: any): Buffer | null {
  if (!data) return null;
  if (Buffer.isBuffer(data)) return data;
  if (data instanceof Uint8Array) return Buffer.from(data);
  if (data.buffer) return Buffer.from(data.buffer);
  return Buffer.from(data);
}

async function createProjectImpl(
  nameOrOpts: string | CreateProjectOptions,
  ownerIdArg?: string,
  descriptionArg: string = ''
): Promise<StoredProject> {
  const opts: CreateProjectOptions =
    typeof nameOrOpts === 'string'
      ? {
          name: nameOrOpts,
          ownerId: ownerIdArg ?? '',
          description: descriptionArg,
          isPublic: false,
        }
      : {
          name: nameOrOpts.name,
          ownerId: nameOrOpts.ownerId,
          description: nameOrOpts.description ?? '',
          isPublic: nameOrOpts.isPublic ?? false,
        };

  if (isMongoOnline()) {
    const projectDoc = await Project.create({
      name: opts.name,
      ownerId: opts.ownerId,
      description: opts.description ?? '',
      isPublic: opts.isPublic ?? false,
    });
    await ProjectMember.create({
      projectId: projectDoc._id,
      userId: opts.ownerId,
      role: 'owner',
    });
    return toPlainObject<StoredProject>(projectDoc);
  }

  const now = new Date();
  const project: StoredProject = {
    _id: genId(),
    name: opts.name,
    ownerId: opts.ownerId,
    description: opts.description ?? '',
    isPublic: opts.isPublic ?? false,
    createdAt: now,
    updatedAt: now,
  };
  mem.projects.set(String(project._id), project);

  const member: StoredMember = {
    _id: genId(),
    projectId: String(project._id),
    userId: opts.ownerId,
    role: 'owner',
    joinedAt: now,
  };
  mem.members.set(String(member._id), member);
  return project;
}

function createProjectOverload(
  name: string,
  ownerId: string,
  description?: string
): Promise<StoredProject>;
function createProjectOverload(options: CreateProjectOptions): Promise<StoredProject>;
function createProjectOverload(
  nameOrOpts: string | CreateProjectOptions,
  ownerIdArg?: string,
  descriptionArg?: string
): Promise<StoredProject> {
  return createProjectImpl(nameOrOpts, ownerIdArg, descriptionArg);
}

export const dbStore = {
  isOnline: isMongoOnline,

  // Users
  async findUserByEmail(email: string): Promise<StoredUser | null> {
    const normalized = email.toLowerCase().trim();
    if (isMongoOnline()) {
      return User.findOne({ email: normalized }).lean<StoredUser>();
    }
    for (const u of mem.users.values()) {
      if (u.email.toLowerCase() === normalized) return u;
    }
    return null;
  },

  async findUserById(id: string): Promise<StoredUser | null> {
    if (isMongoOnline()) {
      if (!isValidObjectId(id)) return null;
      return User.findById(id).lean<StoredUser>();
    }
    return mem.users.get(id) || null;
  },

  async createUser(data: {
    email: string;
    passwordHash: string;
    name: string;
    avatar?: string;
  }): Promise<StoredUser> {
    if (isMongoOnline()) {
      const doc = await User.create({
        ...data,
        email: data.email.toLowerCase().trim(),
      });
      return toPlainObject<StoredUser>(doc);
    }
    const user: StoredUser = {
      _id: genId(),
      email: data.email.toLowerCase().trim(),
      passwordHash: data.passwordHash,
      name: data.name,
      avatar: data.avatar,
      createdAt: new Date(),
    };
    mem.users.set(String(user._id), user);
    return user;
  },

  async findUserByGithubId(githubId: string): Promise<StoredUser | null> {
    if (isMongoOnline()) {
      return User.findOne({ githubId }).lean<StoredUser>();
    }
    for (const u of mem.users.values()) {
      if (u.githubId === githubId) return u;
    }
    return null;
  },

  async upsertGithubUser(data: {
    githubId: string;
    email: string;
    name: string;
    avatar?: string;
  }): Promise<StoredUser> {
    const existingByGh = await this.findUserByGithubId(data.githubId);
    if (existingByGh) {
      return existingByGh;
    }

    const existingByEmail = await this.findUserByEmail(data.email);
    if (existingByEmail) {
      if (isMongoOnline()) {
        const updated = await User.findByIdAndUpdate(
          existingByEmail._id,
          { githubId: data.githubId, ...(data.avatar && !existingByEmail.avatar ? { avatar: data.avatar } : {}) },
          { new: true }
        ).lean<StoredUser>();
        return updated || existingByEmail;
      }
      const memUser = mem.users.get(String(existingByEmail._id));
      if (memUser) {
        memUser.githubId = data.githubId;
        if (data.avatar && !memUser.avatar) {
          memUser.avatar = data.avatar;
        }
      }
      return memUser || existingByEmail;
    }

    if (isMongoOnline()) {
      const doc = await User.create({
        email: data.email.toLowerCase().trim(),
        name: data.name,
        avatar: data.avatar,
        githubId: data.githubId,
      });
      return toPlainObject<StoredUser>(doc);
    }

    const newUser: StoredUser = {
      _id: genId(),
      email: data.email.toLowerCase().trim(),
      name: data.name,
      avatar: data.avatar,
      githubId: data.githubId,
      createdAt: new Date(),
    };
    mem.users.set(String(newUser._id), newUser);
    return newUser;
  },

  async findUserByClerkId(clerkId: string): Promise<StoredUser | null> {
    if (isMongoOnline()) {
      return User.findOne({ clerkId }).lean<StoredUser>();
    }
    for (const u of mem.users.values()) {
      if (u.clerkId === clerkId) return u;
    }
    return null;
  },

  async upsertClerkUser(data: {
    clerkId: string;
    email: string;
    name: string;
    avatar?: string;
  }): Promise<StoredUser> {
    const existingByClerk = await this.findUserByClerkId(data.clerkId);
    if (existingByClerk) {
      const needsNameUpdate = Boolean(data.name && existingByClerk.name !== data.name);
      const needsAvatarUpdate = Boolean(data.avatar && existingByClerk.avatar !== data.avatar);
      if (needsNameUpdate || needsAvatarUpdate) {
        if (isMongoOnline()) {
          const updated = await User.findByIdAndUpdate(
            existingByClerk._id,
            {
              ...(needsNameUpdate ? { name: data.name } : {}),
              ...(needsAvatarUpdate ? { avatar: data.avatar } : {}),
            },
            { new: true }
          ).lean<StoredUser>();
          return updated || existingByClerk;
        }
        const memUser = mem.users.get(String(existingByClerk._id));
        if (memUser) {
          if (needsNameUpdate) memUser.name = data.name;
          if (needsAvatarUpdate) memUser.avatar = data.avatar;
        }
        return memUser || existingByClerk;
      }
      return existingByClerk;
    }

    const existingByEmail = await this.findUserByEmail(data.email);
    if (existingByEmail) {
      if (isMongoOnline()) {
        const updated = await User.findByIdAndUpdate(
          existingByEmail._id,
          {
            clerkId: data.clerkId,
            name: data.name || existingByEmail.name,
            avatar: data.avatar || existingByEmail.avatar,
          },
          { new: true }
        ).lean<StoredUser>();
        return updated || existingByEmail;
      }
      const memUser = mem.users.get(String(existingByEmail._id));
      if (memUser) {
        memUser.clerkId = data.clerkId;
        if (data.name) memUser.name = data.name;
        if (data.avatar) memUser.avatar = data.avatar;
      }
      return memUser || existingByEmail;
    }

    const defaultAvatar =
      data.avatar ||
      `https://api.dicebear.com/7.x/identicon/svg?seed=${encodeURIComponent(data.name)}`;

    if (isMongoOnline()) {
      const doc = await User.create({
        email: data.email.toLowerCase().trim(),
        name: data.name,
        avatar: defaultAvatar,
        clerkId: data.clerkId,
      });
      return toPlainObject<StoredUser>(doc);
    }

    const newUser: StoredUser = {
      _id: genId(),
      email: data.email.toLowerCase().trim(),
      name: data.name,
      avatar: defaultAvatar,
      clerkId: data.clerkId,
      createdAt: new Date(),
    };
    mem.users.set(String(newUser._id), newUser);
    return newUser;
  },

  // Projects
  async findProjectsForUser(userId: string): Promise<StoredProject[]> {
    if (isMongoOnline()) {
      if (!isValidObjectId(userId)) return [];
      const memberships = await ProjectMember.find({ userId }).lean();
      const projectIds = memberships.map((m) => m.projectId);
      if (projectIds.length === 0) return [];
      return Project.find({ _id: { $in: projectIds } })
        .sort({ updatedAt: -1 })
        .lean<StoredProject[]>();
    }
    const seen = new Set<string>();
    const myProjects: StoredProject[] = [];
    for (const m of mem.members.values()) {
      const pid = String(m.projectId);
      if (String(m.userId) === userId && !seen.has(pid)) {
        const p = mem.projects.get(pid);
        if (p) {
          seen.add(pid);
          myProjects.push(p);
        }
      }
    }
    return myProjects.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
  },

  async findProjectById(id: string): Promise<StoredProject | null> {
    if (isMongoOnline()) {
      if (!isValidObjectId(id)) return null;
      return Project.findById(id).lean<StoredProject>();
    }
    return mem.projects.get(id) || null;
  },

  createProject: createProjectOverload,

  async updateProject(
    id: string,
    update: Partial<Pick<StoredProject, 'name' | 'description' | 'isPublic'>>
  ): Promise<StoredProject | null> {
    const cleanUpdate = Object.fromEntries(
      Object.entries(update).filter(([, v]) => v !== undefined)
    );
    if (isMongoOnline()) {
      if (!isValidObjectId(id)) return null;
      return Project.findByIdAndUpdate(
        id,
        { ...cleanUpdate, updatedAt: new Date() },
        { new: true }
      ).lean<StoredProject>();
    }
    const p = mem.projects.get(id);
    if (!p) return null;
    Object.assign(p, cleanUpdate, { updatedAt: new Date() });
    return p;
  },

  async deleteProject(id: string): Promise<void> {
    if (isMongoOnline()) {
      if (!isValidObjectId(id)) return;
      await Promise.all([
        Project.findByIdAndDelete(id),
        ProjectMember.deleteMany({ projectId: id }),
        ProjectFile.deleteMany({ projectId: id }),
        Invitation.deleteMany({ projectId: id }),
        Version.deleteMany({ projectId: id }),
        DocSnapshot.deleteMany({ projectId: id }),
      ]);
      return;
    }

    mem.projects.delete(id);
    for (const [k, m] of mem.members.entries()) {
      if (String(m.projectId) === id) mem.members.delete(k);
    }
    for (const [k, f] of mem.files.entries()) {
      if (String(f.projectId) === id) mem.files.delete(k);
    }
    for (const [k, inv] of mem.invitations.entries()) {
      if (String(inv.projectId) === id) mem.invitations.delete(k);
    }
    for (const [k, v] of mem.versions.entries()) {
      if (String(v.projectId) === id) mem.versions.delete(k);
    }
    const snapPrefix = `${id}:`;
    for (const k of mem.snapshots.keys()) {
      if (k.startsWith(snapPrefix)) mem.snapshots.delete(k);
    }
  },

  // Members & Roles
  async getMemberRole(projectId: string, userId: string): Promise<ProjectRole | null> {
    if (isMongoOnline()) {
      if (!isValidObjectId(projectId) || !isValidObjectId(userId)) return null;
      const member = await ProjectMember.findOne({ projectId, userId }).lean<StoredMember>();
      return member ? member.role : null;
    }
    for (const m of mem.members.values()) {
      if (String(m.projectId) === projectId && String(m.userId) === userId) {
        return m.role;
      }
    }
    return null;
  },

  async addMember(
    projectId: string,
    userId: string,
    role: ProjectRole
  ): Promise<StoredMember> {
    if (isMongoOnline()) {
      const existing = await ProjectMember.findOne({ projectId, userId }).lean<StoredMember>();
      let finalRole = role;
      if (existing && ROLE_RANKS[existing.role] > ROLE_RANKS[role]) {
        finalRole = existing.role;
      }
      const updated = await ProjectMember.findOneAndUpdate(
        { projectId, userId },
        { $set: { role: finalRole }, $setOnInsert: { joinedAt: new Date() } },
        { upsert: true, new: true }
      ).lean<StoredMember>();
      return updated!;
    }

    for (const m of mem.members.values()) {
      if (String(m.projectId) === projectId && String(m.userId) === userId) {
        if (ROLE_RANKS[m.role] < ROLE_RANKS[role]) {
          m.role = role;
        }
        return m;
      }
    }
    const member: StoredMember = {
      _id: genId(),
      projectId,
      userId,
      role,
      joinedAt: new Date(),
    };
    mem.members.set(String(member._id), member);
    return member;
  },

  async updateMemberRole(
    projectId: string,
    userId: string,
    role: ProjectRole
  ): Promise<StoredMember | null> {
    if (isMongoOnline()) {
      if (!isValidObjectId(projectId) || !isValidObjectId(userId)) return null;
      return ProjectMember.findOneAndUpdate(
        { projectId, userId },
        { role },
        { new: true }
      ).lean<StoredMember>();
    }
    for (const m of mem.members.values()) {
      if (String(m.projectId) === projectId && String(m.userId) === userId) {
        m.role = role;
        return m;
      }
    }
    return null;
  },

  async removeMember(projectId: string, userId: string): Promise<boolean> {
    if (isMongoOnline()) {
      if (!isValidObjectId(projectId) || !isValidObjectId(userId)) return false;
      const res = await ProjectMember.findOneAndDelete({ projectId, userId });
      return Boolean(res);
    }
    for (const [k, m] of mem.members.entries()) {
      if (String(m.projectId) === projectId && String(m.userId) === userId) {
        mem.members.delete(k);
        return true;
      }
    }
    return false;
  },

  async getProjectMembers(projectId: string): Promise<ProjectMemberView[]> {
    if (isMongoOnline()) {
      if (!isValidObjectId(projectId)) return [];
      const members = await ProjectMember.find({ projectId })
        .populate('userId', 'name email avatar')
        .lean();
      return members
        .filter((m: any) => m.userId)
        .map((m: any) => ({
          userId: m.userId._id,
          name: m.userId.name,
          email: m.userId.email,
          avatar: m.userId.avatar,
          role: m.role,
          joinedAt: m.joinedAt,
        }));
    }
    const list: ProjectMemberView[] = [];
    for (const m of mem.members.values()) {
      if (String(m.projectId) === projectId) {
        const u = mem.users.get(String(m.userId));
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
  async getProjectFiles(projectId: string): Promise<StoredFile[]> {
    if (isMongoOnline()) {
      if (!isValidObjectId(projectId)) return [];
      return ProjectFile.find({ projectId })
        .sort({ isFolder: -1, name: 1 })
        .lean<StoredFile[]>();
    }
    const files: StoredFile[] = [];
    for (const f of mem.files.values()) {
      if (String(f.projectId) === projectId) files.push(f);
    }
    return files.sort((a, b) => {
      if (a.isFolder === b.isFolder) return a.name.localeCompare(b.name);
      return a.isFolder ? -1 : 1;
    });
  },

  async getFileById(id: string): Promise<StoredFile | null> {
    if (isMongoOnline()) {
      if (!isValidObjectId(id)) return null;
      return ProjectFile.findById(id).lean<StoredFile>();
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
  }): Promise<StoredFile> {
    if (isMongoOnline()) {
      const doc = await ProjectFile.create(data);
      return toPlainObject<StoredFile>(doc);
    }
    const now = new Date();
    const f: StoredFile = {
      _id: genId(),
      projectId: data.projectId,
      name: data.name,
      path: data.path,
      isFolder: data.isFolder,
      parentId: data.parentId || null,
      language: data.language || 'plaintext',
      content: data.content || '',
      createdAt: now,
      updatedAt: now,
    };
    mem.files.set(String(f._id), f);
    return f;
  },

  async updateFile(
    id: string,
    update: Partial<Pick<StoredFile, 'name' | 'path' | 'language' | 'content' | 'parentId'>>
  ): Promise<StoredFile | null> {
    const cleanUpdate = Object.fromEntries(
      Object.entries(update).filter(([, v]) => v !== undefined)
    );
    if (isMongoOnline()) {
      if (!isValidObjectId(id)) return null;
      return ProjectFile.findByIdAndUpdate(
        id,
        { ...cleanUpdate, updatedAt: new Date() },
        { new: true }
      ).lean<StoredFile>();
    }
    const f = mem.files.get(id);
    if (!f) return null;
    Object.assign(f, cleanUpdate, { updatedAt: new Date() });
    return f;
  },

  async deleteFile(id: string): Promise<void> {
    if (isMongoOnline()) {
      if (!isValidObjectId(id)) return;
      const deleted = await ProjectFile.findByIdAndDelete(id).lean<StoredFile>();
      if (deleted) {
        await DocSnapshot.deleteMany({
          projectId: String(deleted.projectId),
          fileId: id,
        });
      }
      return;
    }
    const existing = mem.files.get(id);
    mem.files.delete(id);
    if (existing) {
      mem.snapshots.delete(`${String(existing.projectId)}:${id}`);
    }
  },

  // Invitations
  async createInvitation(
    projectId: string,
    token: string,
    role: ProjectRole,
    createdBy: string,
    expiresAt: Date
  ): Promise<StoredInvitation> {
    if (isMongoOnline()) {
      const doc = await Invitation.create({ projectId, token, role, createdBy, expiresAt });
      return toPlainObject<StoredInvitation>(doc);
    }
    const inv: StoredInvitation = {
      _id: genId(),
      projectId,
      token,
      role,
      expiresAt,
      consumedAt: null,
      createdBy,
      createdAt: new Date(),
    };
    mem.invitations.set(token, inv);
    return inv;
  },

  async findInvitationByToken(token: string): Promise<StoredInvitation | null> {
    if (isMongoOnline()) {
      return Invitation.findOne({ token }).lean<StoredInvitation>();
    }
    return mem.invitations.get(token) || null;
  },

  async consumeInvitation(token: string): Promise<StoredInvitation | null> {
    const now = new Date();
    if (isMongoOnline()) {
      return Invitation.findOneAndUpdate(
        {
          token,
          consumedAt: null,
          expiresAt: { $gt: now },
        },
        { $set: { consumedAt: now } },
        { new: true }
      ).lean<StoredInvitation>();
    }
    const inv = mem.invitations.get(token);
    if (!inv || inv.consumedAt || new Date(inv.expiresAt).getTime() < now.getTime()) {
      return null;
    }
    inv.consumedAt = now;
    return inv;
  },

  // Versions / Checkpoints
  async getVersions(projectId: string): Promise<StoredVersion[]> {
    if (isMongoOnline()) {
      if (!isValidObjectId(projectId)) return [];
      return Version.find({ projectId })
        .sort({ createdAt: -1, _id: -1 })
        .lean<StoredVersion[]>();
    }
    const list: StoredVersion[] = [];
    for (const v of mem.versions.values()) {
      if (String(v.projectId) === projectId) list.push(v);
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
    files: Array<{ fileId: string; fileName?: string; name?: string; content?: string }>,
    type: 'auto' | 'manual' = 'manual',
    trigger: string = 'manual'
  ): Promise<StoredVersion> {
    const normalizedFiles: StoredVersionFile[] = (files || []).map((f) => ({
      fileId: String(f.fileId),
      fileName: f.fileName || f.name || '',
      content: f.content ?? '',
    }));

    if (isMongoOnline()) {
      const doc = await Version.create({
        projectId,
        name,
        note,
        createdBy,
        files: normalizedFiles,
        type,
        trigger,
      });
      if (type === 'auto') {
        await this.pruneAutoVersions(projectId, 50);
      }
      return toPlainObject<StoredVersion>(doc);
    }

    const v: StoredVersion = {
      _id: genId(),
      projectId,
      name,
      note,
      createdBy,
      files: normalizedFiles,
      type,
      trigger,
      createdAt: new Date(),
      seq: ++versionSeq,
    };
    mem.versions.set(String(v._id), v);
    if (type === 'auto') {
      await this.pruneAutoVersions(projectId, 50);
    }
    return v;
  },

  async pruneAutoVersions(projectId: string, keepCount: number = 50): Promise<void> {
    if (isMongoOnline()) {
      if (!isValidObjectId(projectId)) return;
      const autoVersions = await Version.find({ projectId, type: 'auto' })
        .sort({ createdAt: -1, _id: -1 })
        .select('_id')
        .lean();
      if (autoVersions.length > keepCount) {
        const toDeleteIds = autoVersions.slice(keepCount).map((v) => v._id);
        await Version.deleteMany({ _id: { $in: toDeleteIds } });
      }
      return;
    }

    const autoList: StoredVersion[] = [];
    for (const v of mem.versions.values()) {
      if (String(v.projectId) === projectId && v.type === 'auto') {
        autoList.push(v);
      }
    }
    autoList.sort((a, b) => {
      const diff = b.createdAt.getTime() - a.createdAt.getTime();
      if (diff !== 0) return diff;
      return (b.seq || 0) - (a.seq || 0);
    });
    if (autoList.length > keepCount) {
      for (const v of autoList.slice(keepCount)) {
        mem.versions.delete(String(v._id));
      }
    }
  },

  async findVersionById(id: string): Promise<StoredVersion | null> {
    if (isMongoOnline()) {
      if (!isValidObjectId(id)) return null;
      return Version.findById(id).lean<StoredVersion>();
    }
    return mem.versions.get(id) || null;
  },

  async saveDocSnapshot(projectId: string, fileId: string, yjsState: Buffer): Promise<void> {
    const stateCopy = Buffer.from(yjsState);
    if (isMongoOnline()) {
      await DocSnapshot.findOneAndUpdate(
        { projectId, fileId },
        { yjsState: stateCopy, updatedAt: new Date() },
        { upsert: true, new: true }
      );
      return;
    }
    mem.snapshots.set(`${projectId}:${fileId}`, stateCopy);
  },

  async getDocSnapshot(projectId: string, fileId: string): Promise<Buffer | null> {
    if (isMongoOnline()) {
      const snap = await DocSnapshot.findOne({ projectId, fileId }).lean();
      return snap ? toBuffer(snap.yjsState) : null;
    }
    const buf = mem.snapshots.get(`${projectId}:${fileId}`);
    return buf ? Buffer.from(buf) : null;
  },
};
