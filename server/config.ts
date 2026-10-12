import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const DEV_JWT_PLACEHOLDER = 'obsidian-code-dev-jwt-super-secret-key-32chars!';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.string().default('5000'),
  MONGODB_URI: z.string().default('mongodb://127.0.0.1:27017/obsidian-code'),
  JWT_SECRET: z.string().min(32),
  CLIENT_ORIGIN: z.string().default('http://localhost:3000'),
  APP_URL: z.string().default('http://localhost:5000'),
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  GITHUB_CLIENT_ID: z.string().optional(),
  GITHUB_CLIENT_SECRET: z.string().optional(),
  WEBRTC_STUN_URLS: z.string().default('stun:stun.l.google.com:19302'),
  WEBRTC_TURN_URL: z.string().optional(),
  WEBRTC_TURN_USERNAME: z.string().optional(),
  WEBRTC_TURN_CREDENTIAL: z.string().optional(),
  CLERK_SECRET_KEY: z.string().optional(),
  CLERK_PUBLISHABLE_KEY: z.string().optional(),
  VITE_CLERK_PUBLISHABLE_KEY: z.string().optional(),
});

const isProd = process.env.NODE_ENV === 'production';
const rawJwtSecret = process.env.JWT_SECRET || (!isProd ? DEV_JWT_PLACEHOLDER : '');

if (isProd) {
  if (!rawJwtSecret || rawJwtSecret === DEV_JWT_PLACEHOLDER) {
    console.error('CRITICAL: JWT_SECRET must be configured with a secure non-default secret in production.');
    process.exit(1);
  }
}

const envToParse = {
  ...process.env,
  JWT_SECRET: rawJwtSecret,
};

const parsed = envSchema.safeParse(envToParse);
if (!parsed.success) {
  console.error('Invalid environment variables:', parsed.error.issues);
  if (isProd) process.exit(1);
  throw new Error('Invalid environment configuration. See issues above.');
}

export const config = parsed.data;
