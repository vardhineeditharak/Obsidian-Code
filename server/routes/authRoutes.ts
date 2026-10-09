import { Router, Request, Response } from 'express';
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

export const authRoutes = router;
