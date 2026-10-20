import { Router, Request, Response } from 'express';
import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { dbStore } from '../dbStore';
import { config } from '../config';
import { authenticateJWT, AuthRequest } from '../middleware/auth';

const router = Router();

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  name: z.string().min(2),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

// Register
router.post('/register', async (req: Request, res: Response) => {
  const result = registerSchema.safeParse(req.body);
  if (!result.success) {
    return res.status(400).json({ message: 'Validation failed', errors: result.error.issues });
  }

  const { email, password, name } = result.data;

  const existing = await dbStore.findUserByEmail(email);
  if (existing) {
    return res.status(409).json({ message: 'User with this email already exists' });
  }

  const saltRounds = 10;
  const passwordHash = await bcrypt.hash(password, saltRounds);

  const user = await dbStore.createUser({
    email,
    passwordHash,
    name,
    avatar: `https://api.dicebear.com/7.x/identicon/svg?seed=${encodeURIComponent(name)}`,
  });

  const token = jwt.sign(
    { userId: user._id.toString(), email: user.email, name: user.name },
    config.JWT_SECRET,
    { expiresIn: '7d' }
  );

  res.cookie('obsidian_token', token, {
    httpOnly: true,
    secure: config.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });

  return res.status(201).json({
    user: {
      _id: user._id,
      email: user.email,
      name: user.name,
      avatar: user.avatar,
    },
    token,
  });
});

// Login
router.post('/login', async (req: Request, res: Response) => {
  const result = loginSchema.safeParse(req.body);
  if (!result.success) {
    return res.status(400).json({ message: 'Validation failed', errors: result.error.issues });
  }

  const { email, password } = result.data;
  const user = await dbStore.findUserByEmail(email);
  if (!user) {
    return res.status(401).json({ message: 'Invalid email or password' });
  }

  const match = await bcrypt.compare(password, user.passwordHash);
  if (!match) {
    return res.status(401).json({ message: 'Invalid email or password' });
  }

  const token = jwt.sign(
    { userId: user._id.toString(), email: user.email, name: user.name },
    config.JWT_SECRET,
    { expiresIn: '7d' }
  );

  res.cookie('obsidian_token', token, {
    httpOnly: true,
    secure: config.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });

  return res.json({
    user: {
      _id: user._id,
      email: user.email,
      name: user.name,
      avatar: user.avatar,
    },
    token,
  });
});

// Logout
router.post('/logout', (req: Request, res: Response) => {
  res.clearCookie('obsidian_token');
  return res.json({ message: 'Logged out successfully' });
});

// Me
router.get('/me', authenticateJWT, async (req: AuthRequest, res: Response) => {
  const user = await dbStore.findUserById(req.user!.userId);
  if (!user) {
    return res.status(404).json({ message: 'User not found' });
  }

  return res.json({
    _id: user._id,
    email: user.email,
    name: user.name,
    avatar: user.avatar,
    createdAt: user.createdAt,
  });
});

const clerkSyncSchema = z.object({
  clerkId: z.string().min(1),
  email: z.string().email(),
  name: z.string().min(1),
  avatar: z.string().optional(),
});

// Clerk user session sync
router.post('/clerk-sync', async (req: Request, res: Response) => {
  const result = clerkSyncSchema.safeParse(req.body);
  if (!result.success) {
    return res.status(400).json({ message: 'Validation failed', errors: result.error.issues });
  }

  const { clerkId, email, name, avatar } = result.data;
  const user = await dbStore.upsertClerkUser({ clerkId, email, name, avatar });

  const token = jwt.sign(
    { userId: user._id.toString(), email: user.email, name: user.name },
    config.JWT_SECRET,
    { expiresIn: '7d' }
  );

  res.cookie('obsidian_token', token, {
    httpOnly: true,
    secure: config.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });

  return res.json({
    user: {
      _id: user._id,
      email: user.email,
      name: user.name,
      avatar: user.avatar,
    },
    token,
  });
});

// ----------------------------------------------------------------------------
// Desktop Application OAuth Flow (Loopback Session Store & Polling)
// ----------------------------------------------------------------------------
interface DesktopAuthSession {
  id: string;
  strategy: string;
  status: 'pending' | 'completed' | 'expired';
  token?: string;
  user?: any;
  ticket?: string;
  createdAt: number;
}

const desktopAuthSessions = new Map<string, DesktopAuthSession>();

function cleanOldDesktopSessions() {
  const now = Date.now();
  for (const [id, session] of desktopAuthSessions.entries()) {
    if (now - session.createdAt > 10 * 60 * 1000) {
      desktopAuthSessions.delete(id);
    }
  }
}

// 1. Initiate desktop authentication request
router.post('/desktop/initiate', (req: Request, res: Response) => {
  cleanOldDesktopSessions();
  const sessionId = crypto.randomBytes(24).toString('hex');
  const strategy = typeof req.body?.strategy === 'string' ? req.body.strategy : 'oauth_google';

  desktopAuthSessions.set(sessionId, {
    id: sessionId,
    strategy,
    status: 'pending',
    createdAt: Date.now(),
  });

  return res.json({ sessionId, strategy });
});

// 2. Complete desktop authentication from the external browser callback
const desktopCompleteSchema = z.object({
  sessionId: z.string().min(1),
  clerkId: z.string().min(1),
  email: z.string().email(),
  name: z.string().min(1),
  avatar: z.string().optional(),
});

router.post('/desktop/complete', async (req: Request, res: Response) => {
  cleanOldDesktopSessions();
  const result = desktopCompleteSchema.safeParse(req.body);
  if (!result.success) {
    return res.status(400).json({ message: 'Validation failed', errors: result.error.issues });
  }

  const { sessionId, clerkId, email, name, avatar } = result.data;
  const session = desktopAuthSessions.get(sessionId);
  if (!session) {
    return res.status(404).json({ message: 'Desktop authentication session not found or expired' });
  }

  const user = await dbStore.upsertClerkUser({ clerkId, email, name, avatar });

  const token = jwt.sign(
    { userId: user._id.toString(), email: user.email, name: user.name },
    config.JWT_SECRET,
    { expiresIn: '7d' }
  );

  let ticket: string | undefined;
  if (config.CLERK_SECRET_KEY) {
    try {
      const ticketRes = await fetch('https://api.clerk.com/v1/sign_in_tokens', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${config.CLERK_SECRET_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ user_id: clerkId }),
      });
      if (ticketRes.ok) {
        const ticketData = (await ticketRes.json()) as any;
        if (ticketData?.token) {
          ticket = ticketData.token;
        }
      }
    } catch (ticketErr) {
      console.warn('[DesktopAuth] Failed to generate Clerk sign-in ticket:', ticketErr);
    }
  }

  session.status = 'completed';
  session.token = token;
  session.ticket = ticket;
  session.user = {
    _id: user._id,
    email: user.email,
    name: user.name,
    avatar: user.avatar,
  };

  return res.json({
    success: true,
    message: 'Desktop authentication completed successfully',
    sessionId,
  });
});

// 3. Poll status of desktop authentication session
router.get('/desktop/poll', (req: Request, res: Response) => {
  cleanOldDesktopSessions();
  const sessionId = typeof req.query.sessionId === 'string' ? req.query.sessionId : '';
  if (!sessionId) {
    return res.status(400).json({ message: 'Missing sessionId parameter' });
  }

  const session = desktopAuthSessions.get(sessionId);
  if (!session) {
    return res.status(404).json({ status: 'expired', message: 'Session not found or expired' });
  }

  if (session.status === 'completed') {
    const payload = {
      status: 'completed',
      token: session.token,
      user: session.user,
      ticket: session.ticket,
    };
    // Once polled after completion, remove session so it cannot be replayed
    desktopAuthSessions.delete(sessionId);
    return res.json(payload);
  }

  return res.json({ status: 'pending' });
});

// OAuth Providers check (S4.2)
router.get('/oauth/providers', (_req: Request, res: Response) => {
  const github = Boolean(config.GITHUB_CLIENT_ID && config.GITHUB_CLIENT_SECRET);
  return res.json({ github });
});

// GitHub OAuth Authorization Start (S4.2)
router.get('/github', (_req: Request, res: Response) => {
  if (!config.GITHUB_CLIENT_ID || !config.GITHUB_CLIENT_SECRET) {
    return res.status(503).json({ message: 'GitHub OAuth is not configured on this server.' });
  }

  const state = crypto.randomBytes(32).toString('hex');
  res.cookie('gh_oauth_state', state, {
    httpOnly: true,
    secure: config.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 10 * 60 * 1000, // 10 minutes
  });

  const redirectUri = `${config.APP_URL}/api/auth/github/callback`;
  const githubAuthUrl = `https://github.com/login/oauth/authorize?client_id=${config.GITHUB_CLIENT_ID}&redirect_uri=${encodeURIComponent(
    redirectUri
  )}&scope=read:user%20user:email&state=${state}`;

  return res.redirect(302, githubAuthUrl);
});

// GitHub OAuth Callback (S4.2)
router.get('/github/callback', async (req: Request, res: Response) => {
  const cookieState = req.cookies?.gh_oauth_state;
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
    });

    const tokenData = (await tokenRes.json()) as any;
    const accessToken = tokenData?.access_token;
    if (!accessToken) {
      console.error('GitHub token exchange failed:', tokenData);
      return res.status(400).json({
        message: 'Failed to retrieve access token from GitHub.',
      });
    }

    // Fetch user profile from GitHub
    const userRes = await fetch('https://api.github.com/user', {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'User-Agent': 'Obsidian-Code-App',
      },
    });
    const ghUser = (await userRes.json()) as any;
    if (!ghUser?.id) {
      return res.status(400).json({ message: 'Failed to retrieve user profile from GitHub.' });
    }

    // Fetch primary email if not visible in profile
    let email = ghUser.email;
    if (!email) {
      try {
        const emailsRes = await fetch('https://api.github.com/user/emails', {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'User-Agent': 'Obsidian-Code-App',
          },
        });
        const emails = (await emailsRes.json()) as any[];
        if (Array.isArray(emails)) {
          const primary = emails.find((e) => e.primary && e.verified) || emails.find((e) => e.verified) || emails[0];
          if (primary?.email) {
            email = primary.email;
          }
        }
      } catch {}
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

    const token = jwt.sign(
      { userId: user._id.toString(), email: user.email, name: user.name },
      config.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.cookie('obsidian_token', token, {
      httpOnly: true,
      secure: config.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    return res.redirect(`${config.CLIENT_ORIGIN}/dashboard`);
  } catch (err: any) {
    console.error('OAuth callback failed:', err);
    return res.status(500).json({ message: 'Internal server error during OAuth callback.' });
  }
});

export const authRoutes = router;
