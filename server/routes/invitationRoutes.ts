import { Router, Response } from 'express';
import crypto from 'crypto';
import { z } from 'zod';
import { dbStore } from '../dbStore';
import { config } from '../config';
import { authenticateJWT, requireProjectRole, AuthRequest, param } from '../middleware/auth';

const router = Router();

// Create invitation token (Owner only)
router.post('/projects/:projectId/invitations', authenticateJWT, requireProjectRole(['owner']), async (req: AuthRequest, res: Response) => {
  const schema = z.object({
    role: z.enum(['editor', 'viewer']).default('editor'),
    expiresInDays: z.number().default(7),
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: 'Validation failed', errors: parsed.error.issues });
  }

  const { role, expiresInDays } = parsed.data;
  const token = crypto.randomBytes(24).toString('hex');
  const expiresAt = new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000);
  const projectId = param(req.params.projectId);

  await dbStore.createInvitation(
    projectId,
    token,
    role,
    req.user!.userId,
    expiresAt
  );

  const inviteUrl = `${config.APP_URL}/join/${token}`;
  return res.status(201).json({ token, inviteUrl });
});

// Accept invitation (Single-use & role downgrade safe)
router.post('/invitations/:token/accept', authenticateJWT, async (req: AuthRequest, res: Response) => {
  const token = param(req.params.token);
  const inv = await dbStore.findInvitationByToken(token);
  if (!inv) {
    return res.status(404).json({ message: 'Invitation not found or invalid' });
  }

  if (inv.consumedAt) {
    return res.status(410).json({ message: 'Invitation has already been used' });
  }

  if (new Date(inv.expiresAt).getTime() < Date.now()) {
    return res.status(410).json({ message: 'Invitation link has expired' });
  }

  // Consume invitation
  await dbStore.consumeInvitation(token);

  // Add user to project members (safe against role downgrade)
  await dbStore.addMember(inv.projectId.toString(), req.user!.userId, inv.role);

  return res.json({
    projectId: inv.projectId.toString(),
    role: inv.role,
    message: `Successfully joined workspace as ${inv.role}`,
  });
});

export const invitationRoutes = router;
