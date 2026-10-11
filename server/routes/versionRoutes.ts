import { Router, Response } from 'express';
import { z } from 'zod';
import { dbStore } from '../dbStore';
import { authenticateJWT, requireProjectRole, AuthRequest, param } from '../middleware/auth';

const router = Router();

// List checkpoints
router.get('/projects/:projectId/versions', authenticateJWT, requireProjectRole(['owner', 'editor', 'viewer']), async (req: AuthRequest, res: Response) => {
  const versions = await dbStore.getVersions(param(req.params.projectId));
  return res.json(versions);
});

// Create checkpoint
router.post('/projects/:projectId/versions', authenticateJWT, requireProjectRole(['owner', 'editor']), async (req: AuthRequest, res: Response) => {
  const schema = z.object({
    name: z.string().min(1),
    note: z.string().optional(),
    type: z.enum(['auto', 'manual']).optional(),
    trigger: z.string().optional(),
    files: z.array(
      z.object({
        fileId: z.string(),
        fileName: z.string(),
        content: z.string(),
      })
    ).optional(),
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: 'Validation failed', errors: parsed.error.issues });
  }

  const { name, note, type, trigger, files } = parsed.data;
  const projectId = param(req.params.projectId);

  // If client didn't supply full files map, pull current project files from store
  let snapshotFiles = files;
  if (!snapshotFiles || snapshotFiles.length === 0) {
    const currentFiles = await dbStore.getProjectFiles(projectId);
    snapshotFiles = currentFiles
      .filter((f) => !f.isFolder)
      .map((f) => ({
        fileId: f._id.toString(),
        fileName: f.name,
        content: f.content || '',
      }));
  }

  const versionType = type || 'manual';
  const versionTrigger = trigger || (versionType === 'auto' ? 'periodic' : 'manual');

  const version = await dbStore.createVersion(
    projectId,
    name,
    note || '',
    { userId: req.user!.userId, name: req.user!.name },
    snapshotFiles,
    versionType,
    versionTrigger
  );

  return res.status(201).json(version);
});

// Restore checkpoint (S3 IDOR protection: Owner & Editor only)
router.post('/versions/:versionId/restore', authenticateJWT, async (req: AuthRequest, res: Response) => {
  const versionId = param(req.params.versionId);
  const version = await dbStore.findVersionById(versionId);
  if (!version) {
    return res.status(404).json({ message: 'Version checkpoint not found' });
  }

  const role = await dbStore.getMemberRole(version.projectId.toString(), req.user!.userId);
  if (!role || (role !== 'owner' && role !== 'editor')) {
    return res.status(403).json({ message: 'Permission denied. Role is not permitted to restore versions.' });
  }

  // Restore file contents in store
  for (const f of version.files) {
    await dbStore.updateFile(f.fileId, { content: f.content });
  }

  return res.json({ message: 'Checkpoint restored successfully', version });
});

export const versionRoutes = router;
