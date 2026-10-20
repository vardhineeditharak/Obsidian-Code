import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import express from 'express';
import http from 'http';
import { AddressInfo } from 'net';
import { authRoutes } from '../server/routes/authRoutes';
import { dbStore } from '../server/dbStore';

describe('Desktop Browser OAuth Lifecycle & Loopback Protocol (M-DESKTOP)', () => {
  let server: http.Server;
  let baseUrl: string;

  beforeAll(async () => {
    const app = express();
    app.use(express.json());
    app.use('/api/auth', authRoutes);

    await new Promise<void>((resolve) => {
      server = app.listen(0, () => {
        const port = (server.address() as AddressInfo).port;
        baseUrl = `http://127.0.0.1:${port}`;
        resolve();
      });
    });
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
  });

  it('initiates a desktop authentication session with unique sessionId', async () => {
    const res = await fetch(`${baseUrl}/api/auth/desktop/initiate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ strategy: 'oauth_google' }),
    });

    expect(res.status).toBe(200);
    const data = (await res.json()) as any;
    expect(data.sessionId).toBeDefined();
    expect(typeof data.sessionId).toBe('string');
    expect(data.sessionId.length).toBeGreaterThanOrEqual(32);
    expect(data.strategy).toBe('oauth_google');
  });

  it('returns pending status while waiting for browser authorization', async () => {
    // 1. Initiate session
    const initRes = await fetch(`${baseUrl}/api/auth/desktop/initiate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ strategy: 'oauth_github' }),
    });
    const { sessionId } = (await initRes.json()) as any;

    // 2. Poll session
    const pollRes = await fetch(`${baseUrl}/api/auth/desktop/poll?sessionId=${sessionId}`);
    expect(pollRes.status).toBe(200);
    const pollData = (await pollRes.json()) as any;
    expect(pollData.status).toBe('pending');
  });

  it('rejects completion for non-existent session IDs', async () => {
    const res = await fetch(`${baseUrl}/api/auth/desktop/complete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId: 'non-existent-session-id',
        clerkId: 'user_fake_123',
        email: 'hacker@example.com',
        name: 'Attacker',
      }),
    });

    expect(res.status).toBe(404);
    const data = (await res.json()) as any;
    expect(data.message).toContain('not found or expired');
  });

  it('completes desktop session and returns auth token and user on poll', async () => {
    // 1. Initiate session
    const initRes = await fetch(`${baseUrl}/api/auth/desktop/initiate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ strategy: 'oauth_google' }),
    });
    const { sessionId } = (await initRes.json()) as any;

    // 2. Complete session from external browser simulation
    const completeRes = await fetch(`${baseUrl}/api/auth/desktop/complete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId,
        clerkId: 'user_desktop_test_999',
        email: 'desktop_developer@example.com',
        name: 'Desktop Developer',
        avatar: 'https://example.com/avatar.png',
      }),
    });

    expect(completeRes.status).toBe(200);
    const completeData = (await completeRes.json()) as any;
    expect(completeData.success).toBe(true);

    // 3. Poll completed session from Desktop App
    const pollRes = await fetch(`${baseUrl}/api/auth/desktop/poll?sessionId=${sessionId}`);
    expect(pollRes.status).toBe(200);
    const pollData = (await pollRes.json()) as any;
    expect(pollData.status).toBe('completed');
    expect(pollData.token).toBeDefined();
    expect(pollData.user).toBeDefined();
    expect(pollData.user.email).toBe('desktop_developer@example.com');
    expect(pollData.user.name).toBe('Desktop Developer');

    // 4. Verify single-use session consumption (prevent replay attacks)
    const replayRes = await fetch(`${baseUrl}/api/auth/desktop/poll?sessionId=${sessionId}`);
    expect(replayRes.status).toBe(404);
    const replayData = (await replayRes.json()) as any;
    expect(replayData.status).toBe('expired');
  });

  it('returns 400 when missing sessionId in poll query', async () => {
    const res = await fetch(`${baseUrl}/api/auth/desktop/poll`);
    expect(res.status).toBe(400);
  });
});
