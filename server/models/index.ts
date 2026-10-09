import mongoose, { Schema, Document } from 'mongoose';

// User Schema
export interface IUser extends Document {
  email: string;
  passwordHash: string;
  name: string;
  avatar?: string;
  createdAt: Date;
}

const UserSchema = new Schema<IUser>({
  email: { type: String, required: true, unique: true, index: true, lowercase: true, trim: true },
  passwordHash: { type: String, required: true },
  name: { type: String, required: true, trim: true },
  avatar: { type: String },
  createdAt: { type: Date, default: Date.now },
});

export const User = mongoose.models.User || mongoose.model<IUser>('User', UserSchema);

// Project Schema
export interface IProject extends Document {
  name: string;
  ownerId: mongoose.Types.ObjectId;
  description?: string;
  isPublic: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const ProjectSchema = new Schema<IProject>({
  name: { type: String, required: true, trim: true },
  ownerId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  description: { type: String, default: '' },
  isPublic: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

export const Project = mongoose.models.Project || mongoose.model<IProject>('Project', ProjectSchema);

// Project Member Schema
export interface IProjectMember extends Document {
  projectId: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  role: 'owner' | 'editor' | 'viewer';
  joinedAt: Date;
}

const ProjectMemberSchema = new Schema<IProjectMember>({
  projectId: { type: Schema.Types.ObjectId, ref: 'Project', required: true, index: true },
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  role: { type: String, enum: ['owner', 'editor', 'viewer'], required: true },
  joinedAt: { type: Date, default: Date.now },
});
ProjectMemberSchema.index({ projectId: 1, userId: 1 }, { unique: true });

export const ProjectMember = mongoose.models.ProjectMember || mongoose.model<IProjectMember>('ProjectMember', ProjectMemberSchema);

// Project File Schema
export interface IProjectFile extends Document {
  projectId: mongoose.Types.ObjectId;
  name: string;
  path: string;
  isFolder: boolean;
  parentId?: mongoose.Types.ObjectId | null;
  language?: string;
  createdAt: Date;
  updatedAt: Date;
}

const ProjectFileSchema = new Schema<IProjectFile>({
  projectId: { type: Schema.Types.ObjectId, ref: 'Project', required: true, index: true },
  name: { type: String, required: true, trim: true },
  path: { type: String, required: true, trim: true },
  isFolder: { type: Boolean, default: false },
  parentId: { type: Schema.Types.ObjectId, ref: 'ProjectFile', default: null },
  language: { type: String, default: 'plaintext' },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});
ProjectFileSchema.index({ projectId: 1, path: 1 }, { unique: true });

export const ProjectFile = mongoose.models.ProjectFile || mongoose.model<IProjectFile>('ProjectFile', ProjectFileSchema);

// Invitation Schema
export interface IInvitation extends Document {
  projectId: mongoose.Types.ObjectId;
  token: string;
  role: 'owner' | 'editor' | 'viewer';
  expiresAt: Date;
  consumedAt?: Date;
  createdBy: mongoose.Types.ObjectId;
  createdAt: Date;
}

const InvitationSchema = new Schema<IInvitation>({
  projectId: { type: Schema.Types.ObjectId, ref: 'Project', required: true, index: true },
  token: { type: String, required: true, unique: true, index: true },
  role: { type: String, enum: ['owner', 'editor', 'viewer'], default: 'editor' },
  expiresAt: { type: Date, required: true },
  consumedAt: { type: Date, default: null },
  createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  createdAt: { type: Date, default: Date.now },
});

export const Invitation = mongoose.models.Invitation || mongoose.model<IInvitation>('Invitation', InvitationSchema);

// Version Checkpoint Schema
export interface IVersion extends Document {
  projectId: mongoose.Types.ObjectId;
  name: string;
  note?: string;
  createdBy: {
    userId: mongoose.Types.ObjectId;
    name: string;
  };
  files: {
    fileId: string;
    fileName: string;
    content: string;
  }[];
  createdAt: Date;
}

const VersionSchema = new Schema<IVersion>({
  projectId: { type: Schema.Types.ObjectId, ref: 'Project', required: true, index: true },
  name: { type: String, required: true },
  note: { type: String, default: '' },
  createdBy: {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    name: { type: String, required: true },
  },
  files: [
    {
      fileId: { type: String, required: true },
      fileName: { type: String, required: true },
      content: { type: String, default: '' },
    },
  ],
  createdAt: { type: Date, default: Date.now },
});

export const Version = mongoose.models.Version || mongoose.model<IVersion>('Version', VersionSchema);

// Document Snapshot Schema (durable Yjs binary state)
export interface IDocSnapshot extends Document {
  projectId: string;
  fileId: string;
  yjsState: Buffer;
  updatedAt: Date;
}

const DocSnapshotSchema = new Schema<IDocSnapshot>({
  projectId: { type: String, required: true, index: true },
  fileId: { type: String, required: true, index: true },
  yjsState: { type: Buffer, required: true },
  updatedAt: { type: Date, default: Date.now },
});
DocSnapshotSchema.index({ projectId: 1, fileId: 1 }, { unique: true });

export const DocSnapshot = mongoose.models.DocSnapshot || mongoose.model<IDocSnapshot>('DocSnapshot', DocSnapshotSchema);
