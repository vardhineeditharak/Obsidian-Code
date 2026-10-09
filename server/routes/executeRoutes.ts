import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { executeSandboxCode } from '../execution/sandboxRunner';

const router = Router();

const executeSchema = z.object({
  code: z.string(),
  language: z.string().default('javascript'),
});

router.post('/', async (req: Request, res: Response) => {
  const parsed = executeSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: 'Validation failed', errors: parsed.error.errors });
  }

  const { code, language } = parsed.data;
  const result = await executeSandboxCode({ code, language });
  return res.json(result);
});

export const executeRoutes = router;
