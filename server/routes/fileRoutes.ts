import { Router, Response } from 'express';
import { z } from 'zod';
import { dbStore } from '../dbStore';
import { authenticateJWT, requireProjectRole, AuthRequest, param } from '../middleware/auth';

const router = Router();

export function detectLanguage(fileName: string): string {
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
    case 'sql':
      return 'sql';
    default:
      return 'plaintext';
  }
}

// List files for project
router.get('/projects/:projectId/files', authenticateJWT, requireProjectRole(['owner', 'editor', 'viewer']), async (req: AuthRequest, res: Response) => {
  const files = await dbStore.getProjectFiles(param(req.params.projectId));
  return res.json(files);
});

// Create file or folder in project (Owner & Editor only)
router.post('/projects/:projectId/files', authenticateJWT, requireProjectRole(['owner', 'editor']), async (req: AuthRequest, res: Response) => {
  const schema = z.object({
    name: z.string().min(1),
    isFolder: z.boolean().default(false),
    parentId: z.string().nullable().optional(),
    content: z.string().optional(),
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: 'Validation failed', errors: parsed.error.issues });
  }

  const { name, isFolder, parentId, content } = parsed.data;
  const projectId = param(req.params.projectId);

  // Compute hierarchical path using ancestor
  let path = name;
  if (parentId) {
    const parent = await dbStore.getFileById(parentId);
    if (parent) {
      path = `${parent.path}/${name}`;
    }
  }

  const language = isFolder ? undefined : detectLanguage(name);

  const file = await dbStore.createFile({
    projectId,
    name,
    path,
    isFolder,
    parentId,
    language,
    content: content || '',
  });

  return res.status(201).json(file);
});

// Update file metadata or content (S3 IDOR protection: Owner & Editor only)
router.patch('/files/:fileId', authenticateJWT, async (req: AuthRequest, res: Response) => {
  const fileId = param(req.params.fileId);
  const file = await dbStore.getFileById(fileId);
  if (!file) {
    return res.status(404).json({ message: 'File not found' });
  }

  const role = await dbStore.getMemberRole(file.projectId.toString(), req.user!.userId);
  if (!role || (role !== 'owner' && role !== 'editor')) {
    return res.status(403).json({ message: 'Permission denied. Role is not permitted to modify files.' });
  }

  const { name, content } = req.body;
  const updateData: any = {};
  if (name !== undefined) {
    let newPath = name;
    if (file.parentId) {
      const parent = await dbStore.getFileById(file.parentId.toString());
      if (parent) {
        newPath = `${parent.path}/${name}`;
      }
    }
    updateData.name = name;
    updateData.path = newPath;
    updateData.language = detectLanguage(name);
  }
  if (content !== undefined) {
    updateData.content = content;
  }

  const updated = await dbStore.updateFile(fileId, updateData);
  return res.json(updated);
});

// Delete file (S3 IDOR protection: Owner & Editor only)
router.delete('/files/:fileId', authenticateJWT, async (req: AuthRequest, res: Response) => {
  const fileId = param(req.params.fileId);
  const file = await dbStore.getFileById(fileId);
  if (!file) {
    return res.status(404).json({ message: 'File not found' });
  }

  const role = await dbStore.getMemberRole(file.projectId.toString(), req.user!.userId);
  if (!role || (role !== 'owner' && role !== 'editor')) {
    return res.status(403).json({ message: 'Permission denied. Role is not permitted to delete files.' });
  }

  await dbStore.deleteFile(fileId);
  return res.json({ message: 'File deleted successfully' });
});

export const fileRoutes = router;
