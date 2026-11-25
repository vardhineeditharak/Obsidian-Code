import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const DEV_JWT_PLACEHOLDER = 'obsidian-code-dev-jwt-super-secret-key-32chars!';
const DISALLOWED_PROD_SECRETS = new Set([
  '',
  DEV_JWT_PLACEHOLDER,
  'your_jwt_secret_here',
  'changeme',
  'secret',
]);

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.string().default('5000'),
  MONGODB_URI: z.string().default('mongodb://127.0.0.1:27017/obsidian-code'),
  JWT_SECRET: z.string().min(32),
  CLIENT_ORIGIN: z.string().default('http://localhost:3000'),
  APP_URL: z.string().default('http://localhost:5000'),
  SESSION_COOKIE_SECURE: z.enum(['true', 'false']).optional(),
  // Native code execution is remote code execution by design. Require an explicit opt-in
  // in production so it is only enabled inside a properly isolated deployment.
  EXECUTION_ENABLED_IN_PRODUCTION: z.enum(['true', 'false']).optional(),
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

if (isProd && DISALLOWED_PROD_SECRETS.has(rawJwtSecret.trim())) {
  console.error('CRITICAL: JWT_SECRET must be configured with a secure non-default secret in production.');
  process.exit(1);
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

export function isCookieSecure(): boolean {
  if (config.SESSION_COOKIE_SECURE !== undefined) {
    return config.SESSION_COOKIE_SECURE === 'true';
  }
  return config.NODE_ENV === 'production';
}
