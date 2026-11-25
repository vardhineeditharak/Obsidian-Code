import { Router, Response } from 'express';
import { z } from 'zod';
import { dbStore } from '../dbStore';
import { authenticateJWT, requireProjectRole, AuthRequest, param } from '../middleware/auth';

const router = Router();

const createVersionSchema = z.object({
  name: z.string().trim().min(1).max(200),
  note: z.string().max(1000).optional(),
  type: z.enum(['auto', 'manual']).optional(),
  trigger: z.string().max(100).optional(),
  files: z
    .array(
      z.object({
        fileId: z.string(),
        fileName: z.string(),
        content: z.string(),
      })
    )
    .optional(),
});

// List checkpoints
router.get(
  '/projects/:projectId/versions',
  authenticateJWT,
  requireProjectRole(['owner', 'editor', 'viewer']),
  async (req: AuthRequest, res: Response) => {
    const versions = await dbStore.getVersions(param(req.params.projectId));
    return res.json(versions);
  }
);

// Create checkpoint
router.post(
  '/projects/:projectId/versions',
  authenticateJWT,
  requireProjectRole(['owner', 'editor']),
  async (req: AuthRequest, res: Response) => {
    const parsed = createVersionSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: 'Validation failed', errors: parsed.error.issues });
    }

    const { name, note, type, trigger, files } = parsed.data;
    const projectId = param(req.params.projectId);

    let snapshotFiles = files;
    if (!snapshotFiles || snapshotFiles.length === 0) {
      const currentFiles = await dbStore.getProjectFiles(projectId);
      snapshotFiles = currentFiles
        .filter((f) => !f.isFolder)
        .map((f) => ({
          fileId: String(f._id),
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
  }
);

// Restore checkpoint (IDOR protection: Owner & Editor only)
router.post('/versions/:versionId/restore', authenticateJWT, async (req: AuthRequest, res: Response) => {
  const versionId = param(req.params.versionId);
  const version = await dbStore.findVersionById(versionId);
  if (!version) {
    return res.status(404).json({ message: 'Version checkpoint not found' });
  }

  const projectId = String(version.projectId);
  const role = await dbStore.getMemberRole(projectId, req.user!.userId);
  if (!role || (role !== 'owner' && role !== 'editor')) {
    return res.status(403).json({
      message: 'Permission denied. Role is not permitted to restore versions.',
    });
  }

  for (const f of version.files) {
    const targetFile = await dbStore.getFileById(f.fileId);
    if (targetFile && String(targetFile.projectId) === projectId) {
      await dbStore.updateFile(f.fileId, { content: f.content });
    }
  }

  return res.json({ message: 'Checkpoint restored successfully', version });
});

export const versionRoutes = router;
