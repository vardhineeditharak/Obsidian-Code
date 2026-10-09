import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.string().default('5000'),
  MONGODB_URI: z.string().default('mongodb://127.0.0.1:27017/obsidian-code'),
  JWT_SECRET: z.string().default('obsidian-code-dev-jwt-super-secret-key-32chars!'),
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
});

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  console.error('Invalid environment variables:', parsed.error.format());
}

export const config = parsed.success ? parsed.data : envSchema.parse({});
