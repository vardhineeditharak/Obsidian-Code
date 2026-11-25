import { Router, Request, Response } from 'express';
import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { dbStore, StoredUser } from '../dbStore';
import { config, isCookieSecure } from '../config';
import { authenticateJWT, AuthRequest } from '../middleware/auth';

const router = Router();

const AUTH_RATE_LIMIT_MAX = 30;
const AUTH_RATE_LIMIT_WINDOW_MS = 60 * 1000;
const authAttemptsByIp = new Map<string, number[]>();

function checkAuthRateLimit(ip: string): boolean {
  const now = Date.now();
  if (authAttemptsByIp.size > 500) {
    for (const [key, times] of authAttemptsByIp.entries()) {
      const fresh = times.filter((t) => now - t < AUTH_RATE_LIMIT_WINDOW_MS);
      if (fresh.length === 0) authAttemptsByIp.delete(key);
      else authAttemptsByIp.set(key, fresh);
    }
  }
  const existing = authAttemptsByIp.get(ip) || [];
  const valid = existing.filter((t) => now - t < AUTH_RATE_LIMIT_WINDOW_MS);
  if (valid.length >= AUTH_RATE_LIMIT_MAX) {
    authAttemptsByIp.set(ip, valid);
    return false;
  }
  valid.push(now);
  authAttemptsByIp.set(ip, valid);
  return true;
}

function signSessionToken(user: StoredUser): string {
  return jwt.sign(
    { userId: String(user._id), email: user.email, name: user.name },
    config.JWT_SECRET,
    { algorithm: 'HS256', expiresIn: '7d' }
  );
}

function setAuthCookie(res: Response, token: string): void {
  res.cookie('obsidian_token', token, {
    httpOnly: true,
    secure: isCookieSecure(),
    sameSite: 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });
}

function formatPublicUser(user: StoredUser) {
  return {
    _id: user._id,
    email: user.email,
    name: user.name,
    avatar: user.avatar,
  };
}

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  name: z.string().trim().min(2).max(100),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const clerkSyncSchema = z.object({
  clerkId: z.string().min(1),
  email: z.string().email(),
  name: z.string().trim().min(1).max(100),
  avatar: z.string().optional(),
});

function hasConfiguredClerkSecret(): boolean {
  const key = config.CLERK_SECRET_KEY;
  return Boolean(key && !key.includes('your_clerk_secret_key') && key.startsWith('sk_'));
}

// Register
router.post('/register', async (req: Request, res: Response) => {
  if (!checkAuthRateLimit(req.ip || 'unknown')) {
    return res.status(429).json({ message: 'Too many authentication attempts. Please try again shortly.' });
  }

  const result = registerSchema.safeParse(req.body);
  if (!result.success) {
    return res.status(400).json({ message: 'Validation failed', errors: result.error.issues });
  }

  const { email, password, name } = result.data;

  const existing = await dbStore.findUserByEmail(email);
  if (existing) {
    return res.status(409).json({ message: 'User with this email already exists' });
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const user = await dbStore.createUser({
    email,
    passwordHash,
    name,
    avatar: `https://api.dicebear.com/7.x/identicon/svg?seed=${encodeURIComponent(name)}`,
  });

  const token = signSessionToken(user);
  setAuthCookie(res, token);

  return res.status(201).json({
    user: formatPublicUser(user),
    token,
  });
});

// Login
router.post('/login', async (req: Request, res: Response) => {
  if (!checkAuthRateLimit(req.ip || 'unknown')) {
    return res.status(429).json({ message: 'Too many login attempts. Please try again shortly.' });
  }

  const result = loginSchema.safeParse(req.body);
  if (!result.success) {
    return res.status(400).json({ message: 'Validation failed', errors: result.error.issues });
  }

  const { email, password } = result.data;
  const user = await dbStore.findUserByEmail(email);
  if (!user || !user.passwordHash) {
    return res.status(401).json({ message: 'Invalid email or password' });
  }

  const match = await bcrypt.compare(password, user.passwordHash);
  if (!match) {
    return res.status(401).json({ message: 'Invalid email or password' });
  }

  const token = signSessionToken(user);
  setAuthCookie(res, token);

  return res.json({
    user: formatPublicUser(user),
    token,
  });
});

// Logout
router.post('/logout', (_req: Request, res: Response) => {
  res.clearCookie('obsidian_token');
  return res.json({ message: 'Logged out successfully' });
});

// Current authenticated user
router.get('/me', authenticateJWT, async (req: AuthRequest, res: Response) => {
  const user = await dbStore.findUserById(req.user!.userId);
  if (!user) {
    return res.status(404).json({ message: 'User not found' });
  }

  return res.json({
    ...formatPublicUser(user),
    createdAt: user.createdAt,
  });
});

// Clerk user session sync
router.post('/clerk-sync', async (req: Request, res: Response) => {
  const result = clerkSyncSchema.safeParse(req.body);
  if (!result.success) {
    return res.status(400).json({ message: 'Validation failed', errors: result.error.issues });
  }

  const { clerkId, email, name, avatar } = result.data;

  // Verify Clerk identity against Clerk Backend API when a real CLERK_SECRET_KEY is configured
  if (hasConfiguredClerkSecret()) {
    try {
      const clerkRes = await fetch(
        `https://api.clerk.com/v1/users/${encodeURIComponent(clerkId)}`,
        {
          headers: {
            Authorization: `Bearer ${config.CLERK_SECRET_KEY}`,
            'Content-Type': 'application/json',
          },
          signal: AbortSignal.timeout(8000),
        }
      );
      if (!clerkRes.ok) {
        return res.status(401).json({ message: 'Unable to verify Clerk user identity.' });
      }
      const clerkUserData = (await clerkRes.json()) as {
        id?: string;
        email_addresses?: Array<{ email_address?: string }>;
      };
      if (clerkUserData.id !== clerkId) {
        return res.status(401).json({ message: 'Clerk user ID mismatch.' });
      }
      const verifiedEmails = (clerkUserData.email_addresses || [])
        .map((e) => e.email_address?.toLowerCase())
        .filter((e): e is string => Boolean(e));
      if (verifiedEmails.length > 0 && !verifiedEmails.includes(email.toLowerCase())) {
        return res.status(403).json({ message: 'Clerk email verification mismatch.' });
      }
    } catch (err) {
      console.error('Clerk verification error:', err);
      return res.status(502).json({
        message: 'Failed to verify Clerk session with identity provider.',
      });
    }
  }

  const user = await dbStore.upsertClerkUser({ clerkId, email, name, avatar });
  const token = signSessionToken(user);
  setAuthCookie(res, token);

  return res.json({
    user: formatPublicUser(user),
    token,
  });
});

// OAuth providers discovery
router.get('/oauth/providers', (_req: Request, res: Response) => {
  const github = Boolean(config.GITHUB_CLIENT_ID && config.GITHUB_CLIENT_SECRET);
  return res.json({ github });
});

// GitHub OAuth authorization initiation
router.get('/github', (_req: Request, res: Response) => {
  if (!config.GITHUB_CLIENT_ID || !config.GITHUB_CLIENT_SECRET) {
    return res.status(503).json({ message: 'GitHub OAuth is not configured on this server.' });
  }

  const state = crypto.randomBytes(32).toString('hex');
  res.cookie('gh_oauth_state', state, {
    httpOnly: true,
    secure: isCookieSecure(),
    sameSite: 'lax',
    maxAge: 10 * 60 * 1000,
  });

  const redirectUri = `${config.APP_URL}/api/auth/github/callback`;
  const githubAuthUrl = `https://github.com/login/oauth/authorize?client_id=${encodeURIComponent(
    config.GITHUB_CLIENT_ID
  )}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=read:user%20user:email&state=${state}`;

  return res.redirect(302, githubAuthUrl);
});

// GitHub OAuth callback
router.get('/github/callback', async (req: Request, res: Response) => {
  const cookieState = typeof req.cookies?.gh_oauth_state === 'string' ? req.cookies.gh_oauth_state : '';
  const queryState = typeof req.query?.state === 'string' ? req.query.state : '';

  if (
    !cookieState ||
    !queryState ||
    cookieState.length !== queryState.length ||
    !crypto.timingSafeEqual(Buffer.from(cookieState), Buffer.from(queryState))
  ) {
    return res.status(400).json({ message: 'Invalid or missing OAuth state parameter.' });
  }

  res.clearCookie('gh_oauth_state');

  const code = typeof req.query?.code === 'string' ? req.query.code : '';
  if (!code) {
    return res.status(400).json({ message: 'Missing OAuth authorization code.' });
  }

  if (!config.GITHUB_CLIENT_ID || !config.GITHUB_CLIENT_SECRET) {
    return res.status(503).json({ message: 'GitHub OAuth is not configured on this server.' });
  }

  try {
    const redirectUri = `${config.APP_URL}/api/auth/github/callback`;
    const tokenRes = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        client_id: config.GITHUB_CLIENT_ID,
        client_secret: config.GITHUB_CLIENT_SECRET,
        code,
        redirect_uri: redirectUri,
      }),
      signal: AbortSignal.timeout(8000),
    });

    const tokenData = (await tokenRes.json()) as { access_token?: string };
    const accessToken = tokenData?.access_token;
    if (!accessToken) {
      return res.status(400).json({
        message: 'Failed to retrieve access token from GitHub.',
      });
    }

    const userRes = await fetch('https://api.github.com/user', {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'User-Agent': 'Obsidian-Code-App',
      },
      signal: AbortSignal.timeout(8000),
    });
    const ghUser = (await userRes.json()) as {
      id?: number | string;
      email?: string | null;
      name?: string | null;
      login?: string | null;
      avatar_url?: string;
    };
    if (!ghUser?.id) {
      return res.status(400).json({ message: 'Failed to retrieve user profile from GitHub.' });
    }

    let email = ghUser.email || '';
    if (!email) {
      try {
        const emailsRes = await fetch('https://api.github.com/user/emails', {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'User-Agent': 'Obsidian-Code-App',
          },
          signal: AbortSignal.timeout(8000),
        });
        const emails = (await emailsRes.json()) as Array<{
          email?: string;
          primary?: boolean;
          verified?: boolean;
        }>;
        if (Array.isArray(emails)) {
          const primary =
            emails.find((e) => e.primary && e.verified) ||
            emails.find((e) => e.verified) ||
            emails[0];
          if (primary?.email) {
            email = primary.email;
          }
        }
      } catch {
        // Fallback to GitHub noreply email below
      }
    }

    if (!email) {
      email = `${ghUser.id}@users.noreply.github.com`;
    }

    const user = await dbStore.upsertGithubUser({
      githubId: String(ghUser.id),
      email,
      name: ghUser.name || ghUser.login || 'GitHub User',
      avatar: ghUser.avatar_url,
    });

    const token = signSessionToken(user);
    setAuthCookie(res, token);

    return res.redirect(`${config.CLIENT_ORIGIN}/dashboard`);
  } catch (err) {
    console.error('OAuth callback failed:', err);
    return res.status(500).json({ message: 'Internal server error during OAuth callback.' });
  }
});

export const authRoutes = router;
