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
      return res.status(400).json({
        message: 'Failed to retrieve access token from GitHub.',
        error: tokenData?.error_description || tokenData?.error,
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

    return res.redirect(`${config.CLIENT_ORIGIN}?token=${encodeURIComponent(token)}`);
  } catch (err: any) {
    return res.status(500).json({ message: 'Internal server error during OAuth callback.', error: err.message });
  }
});

export const authRoutes = router;
