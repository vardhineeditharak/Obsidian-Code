import { Router, Response } from 'express';
import { z } from 'zod';
import { runProcessCode } from '../execution/processRunner';
import { probe, LANGUAGE_DEFINITIONS } from '../execution/languageRegistry';
import { authenticateJWT, AuthRequest } from '../middleware/auth';

const router = Router();

// In-memory per-user rate limit (10 runs / min)
const userRunTimestamps = new Map<string, number[]>();
const RATE_LIMIT_MAX = 10;
const RATE_LIMIT_WINDOW_MS = 60 * 1000;

function checkRateLimit(userId: string): boolean {
  const now = Date.now();
  const timestamps = userRunTimestamps.get(userId) || [];
  const valid = timestamps.filter((t) => now - t < RATE_LIMIT_WINDOW_MS);
  if (valid.length >= RATE_LIMIT_MAX) {
    userRunTimestamps.set(userId, valid);
    return false;
  }
  valid.push(now);
  userRunTimestamps.set(userId, valid);
  return true;
}

// Build allowed language set from LANGUAGE_DEFINITIONS
const allowedLanguageKeys = Object.keys(LANGUAGE_DEFINITIONS);
const allowedAliases = Object.values(LANGUAGE_DEFINITIONS).flatMap((d) => [...d.aliases, ...d.extensions]);
const allAllowedLanguages = Array.from(new Set([...allowedLanguageKeys, ...allowedAliases]));

const executeSchema = z.object({
  code: z.string(),
  language: z.string().default('javascript').refine(
    (lang) => allAllowedLanguages.includes(lang.toLowerCase().trim()),
    {
      message: `Unsupported language. Recognized languages: ${allowedLanguageKeys.join(', ')}`,
    }
  ),
  fileName: z.string().optional(),
});

// GET /api/execute/runtimes (S2.3 runtime capability endpoint)
router.get('/runtimes', authenticateJWT, async (_req: AuthRequest, res: Response) => {
  const runtimes = await probe();
  return res.json({ runtimes });
});

// POST /api/execute (S2.3 multi-language execution)
// NOTE: Process runner with authenticateJWT, per-user rate limit, timeouts, and output capping.
router.post('/', authenticateJWT, async (req: AuthRequest, res: Response) => {
  const parsed = executeSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: 'Validation failed', errors: parsed.error.issues });
  }

  const userId = req.user!.userId;
  if (!checkRateLimit(userId)) {
    return res.status(429).json({ message: 'Rate limit exceeded. Maximum 10 runs per minute.' });
  }

  const { code, language, fileName } = parsed.data;
  const result = await runProcessCode({ code, language, fileName });
  return res.json(result);
});

export const executeRoutes = router;
