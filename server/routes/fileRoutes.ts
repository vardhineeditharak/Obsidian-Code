import { Router, Response } from 'express';
import { z } from 'zod';
import { dbStore } from '../dbStore';
import { authenticateJWT, requireProjectRole, AuthRequest, param } from '../middleware/auth';
import { emitProjectEvent } from '../websocket/projectEvents';

const router = Router();

const safeEntryNameSchema = z
  .string()
  .trim()
  .min(1)
  .max(200)
  .refine(
    (n) => !n.includes('/') && !n.includes('\\') && !n.includes('\0') && n !== '.' && n !== '..',
    {
      message: 'File or folder name cannot contain path separators or relative segments.',
    }
  );

const createFileSchema = z.object({
  name: safeEntryNameSchema,
  isFolder: z.boolean().default(false),
  parentId: z.string().nullable().optional(),
  content: z.string().optional(),
});

const patchFileSchema = z.object({
  name: safeEntryNameSchema.optional(),
  content: z.string().optional(),
});

function detectLanguage(fileName: string): string {
  const ext = fileName.split('.').pop()?.toLowerCase();
  switch (ext) {
    case 'js':
    case 'jsx':
    case 'mjs':
    case 'cjs':
      return 'javascript';
    case 'ts':
    case 'tsx':
      return 'typescript';
    case 'py':
      return 'python';
    case 'c':
    case 'h':
      return 'c';
    case 'cpp':
    case 'cc':
    case 'cxx':
    case 'hpp':
      return 'cpp';
    case 'java':
      return 'java';
    case 'go':
      return 'go';
    case 'rb':
      return 'ruby';
    case 'php':
      return 'php';
    case 'sh':
    case 'bash':
      return 'bash';
    case 'html':
    case 'htm':
      return 'html';
    case 'css':
    case 'scss':
      return 'css';
    case 'json':
      return 'json';
    case 'md':
    case 'markdown':
      return 'markdown';
    default:
      return 'plaintext';
  }
}

// List files for project
router.get(
  '/projects/:projectId/files',
  authenticateJWT,
  requireProjectRole(['owner', 'editor', 'viewer']),
  async (req: AuthRequest, res: Response) => {
    const files = await dbStore.getProjectFiles(param(req.params.projectId));
    return res.json(files);
  }
);

// Create file or folder in project (Owner & Editor only)
router.post(
  '/projects/:projectId/files',
  authenticateJWT,
  requireProjectRole(['owner', 'editor']),
  async (req: AuthRequest, res: Response) => {
    const parsed = createFileSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: 'Validation failed', errors: parsed.error.issues });
    }

    const { name, isFolder, parentId, content } = parsed.data;
    const projectId = param(req.params.projectId);

    let filePath = name;
    if (parentId) {
      const parent = await dbStore.getFileById(parentId);
      if (!parent || String(parent.projectId) !== projectId || !parent.isFolder) {
        return res.status(400).json({ message: 'Invalid parent folder for this project.' });
      }
      filePath = `${parent.path}/${name}`;
    }

    const existingFiles = await dbStore.getProjectFiles(projectId);
    if (existingFiles.some((f) => f.path === filePath)) {
      return res.status(409).json({ message: `A file or folder already exists at '${filePath}'.` });
    }

    const language = isFolder ? undefined : detectLanguage(name);
    const file = await dbStore.createFile({
      projectId,
      name,
      path: filePath,
      isFolder,
      parentId: parentId ?? null,
      language,
      content: content || '',
    });

    emitProjectEvent({
      type: 'file:created',
      projectId,
      file,
    });

    return res.status(201).json(file);
  }
);

// Update file metadata or content (Owner & Editor only)
router.patch('/files/:fileId', authenticateJWT, async (req: AuthRequest, res: Response) => {
  const parsed = patchFileSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: 'Validation failed', errors: parsed.error.issues });
  }

  const fileId = param(req.params.fileId);
  const file = await dbStore.getFileById(fileId);
  if (!file) {
    return res.status(404).json({ message: 'File not found' });
  }

  const projectId = String(file.projectId);
  const role = await dbStore.getMemberRole(projectId, req.user!.userId);
  if (!role || (role !== 'owner' && role !== 'editor')) {
    return res.status(403).json({
      message: 'Permission denied. Role is not permitted to modify files.',
    });
  }

  const { name, content } = parsed.data;
  const updateData: {
    name?: string;
    path?: string;
    language?: string;
    content?: string;
  } = {};

  const oldPath = file.path;
  if (name !== undefined) {
    let newPath = name;
    if (file.parentId) {
      const parent = await dbStore.getFileById(String(file.parentId));
      if (parent && String(parent.projectId) === projectId) {
        newPath = `${parent.path}/${name}`;
      }
    }

    if (newPath !== oldPath) {
      const existingFiles = await dbStore.getProjectFiles(projectId);
      if (existingFiles.some((f) => String(f._id) !== fileId && f.path === newPath)) {
        return res.status(409).json({ message: `A file or folder already exists at '${newPath}'.` });
      }
    }

    updateData.name = name;
    updateData.path = newPath;
    if (!file.isFolder) {
      updateData.language = detectLanguage(name);
    }
  }
  if (content !== undefined) {
    updateData.content = content;
  }

  const updated = await dbStore.updateFile(fileId, updateData);
  if (updated) {
    emitProjectEvent({
      type: 'file:updated',
      projectId,
      file: updated,
    });

    // Cascade path updates to descendants when renaming a folder
    if (file.isFolder && updateData.path && updateData.path !== oldPath) {
      const allFiles = await dbStore.getProjectFiles(projectId);
      const oldPrefix = `${oldPath}/`;
      const newPrefix = `${updateData.path}/`;
      for (const child of allFiles) {
        const childId = String(child._id);
        if (childId !== fileId && child.path.startsWith(oldPrefix)) {
          const updatedChildPath = `${newPrefix}${child.path.slice(oldPrefix.length)}`;
          const updatedChild = await dbStore.updateFile(childId, { path: updatedChildPath });
          if (updatedChild) {
            emitProjectEvent({
              type: 'file:updated',
              projectId,
              file: updatedChild,
            });
          }
        }
      }
    }
  }

  return res.json(updated);
});

// Delete file or folder recursively (Owner & Editor only)
router.delete('/files/:fileId', authenticateJWT, async (req: AuthRequest, res: Response) => {
  const fileId = param(req.params.fileId);
  const file = await dbStore.getFileById(fileId);
  if (!file) {
    return res.status(404).json({ message: 'File not found' });
  }

  const projectId = String(file.projectId);
  const role = await dbStore.getMemberRole(projectId, req.user!.userId);
  if (!role || (role !== 'owner' && role !== 'editor')) {
    return res.status(403).json({
      message: 'Permission denied. Role is not permitted to delete files.',
    });
  }

  if (file.isFolder) {
    const allFiles = await dbStore.getProjectFiles(projectId);
    const prefix = `${file.path}/`;
    for (const child of allFiles) {
      const childId = String(child._id);
      if (childId !== fileId && child.path.startsWith(prefix)) {
        await dbStore.deleteFile(childId);
        emitProjectEvent({
          type: 'file:deleted',
          projectId,
          fileId: childId,
        });
      }
    }
  }

  await dbStore.deleteFile(fileId);
  emitProjectEvent({
    type: 'file:deleted',
    projectId,
    fileId,
  });

  return res.json({ message: 'File deleted successfully' });
});

export const fileRoutes = router;
