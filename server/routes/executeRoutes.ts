import { Router, Response } from 'express';
import { z } from 'zod';
import { executeSandboxCode } from '../execution/sandboxRunner';
import { authenticateJWT, AuthRequest } from '../middleware/auth';

const router = Router();

const executeSchema = z.object({
  code: z.string(),
  language: z.string().default('javascript'),
});

// NOTE: Node vm is an execution sandbox for evaluating expressions, not a hardened isolation boundary.
router.post('/', authenticateJWT, async (req: AuthRequest, res: Response) => {
  const parsed = executeSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: 'Validation failed', errors: parsed.error.issues });
  }

  const { code, language } = parsed.data;
  const result = await executeSandboxCode({ code, language });
  return res.json(result);
});

export const executeRoutes = router;
