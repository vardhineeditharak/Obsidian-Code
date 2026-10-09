import { Router, Response } from 'express';
import { z } from 'zod';
import { dbStore } from '../dbStore';
import { authenticateJWT, requireProjectRole, AuthRequest } from '../middleware/auth';

const router = Router();

function detectLanguage(fileName: string): string {
  const ext = fileName.split('.').pop()?.toLowerCase();
  switch (ext) {
    case 'js':
    case 'jsx':
    case 'mjs':
      return 'javascript';
    case 'ts':
    case 'tsx':
      return 'typescript';
    case 'py':
      return 'python';
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
router.get('/projects/:projectId/files', authenticateJWT, requireProjectRole(['owner', 'editor', 'viewer']), async (req: AuthRequest, res: Response) => {
  const files = await dbStore.getProjectFiles(req.params.projectId);
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
    return res.status(400).json({ message: 'Validation failed', errors: parsed.error.errors });
  }

  const { name, isFolder, parentId, content } = parsed.data;
  const path = name; // simplified relative path
  const language = isFolder ? undefined : detectLanguage(name);

  const file = await dbStore.createFile({
    projectId: req.params.projectId,
    name,
    path,
    isFolder,
    parentId,
    language,
    content: content || '',
  });

  return res.status(201).json(file);
});

// Update file metadata or content (Owner & Editor only)
router.patch('/files/:fileId', authenticateJWT, async (req: AuthRequest, res: Response) => {
  const { name, content } = req.body;
  const updateData: any = {};
  if (name !== undefined) {
    updateData.name = name;
    updateData.path = name;
    updateData.language = detectLanguage(name);
  }
  if (content !== undefined) {
    updateData.content = content;
  }

  const updated = await dbStore.updateFile(req.params.fileId, updateData);
  if (!updated) {
    return res.status(404).json({ message: 'File not found' });
  }

  return res.json(updated);
});

// Delete file (Owner & Editor only)
router.delete('/files/:fileId', authenticateJWT, async (req: AuthRequest, res: Response) => {
  await dbStore.deleteFile(req.params.fileId);
  return res.json({ message: 'File deleted successfully' });
});

export const fileRoutes = router;
