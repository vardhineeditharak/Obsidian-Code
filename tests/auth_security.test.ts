import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { authRoutes } from '../server/routes/authRoutes';
import { authenticateJWT, requireProjectRole, param, AuthRequest } from '../server/middleware/auth';
import { dbStore } from '../server/dbStore';
import { config } from '../server/config';

describe('Backend Authentication, Security, OAuth, CORS & Clerk Sync', () => {
  let server: http.Server;
  let baseUrl: string;
  const originalFetch = globalThis.fetch;
  const originalEnvConfig = {
    CLERK_SECRET_KEY: config.CLERK_SECRET_KEY,
    GITHUB_CLIENT_ID: config.GITHUB_CLIENT_ID,
    GITHUB_CLIENT_SECRET: config.GITHUB_CLIENT_SECRET,
  };

  beforeAll(async () => {
    const app = express();
    app.use(express.json());
    app.use(cookieParser());

    const allowedOrigins = new Set<string>();
    if (config.CLIENT_ORIGIN) allowedOrigins.add(new URL(config.CLIENT_ORIGIN).origin);
    if (config.APP_URL) allowedOrigins.add(new URL(config.APP_URL).origin);

    app.use(
      cors({
        origin: (origin, callback) => {
          if (!origin) return callback(null, true);
          if (allowedOrigins.has(origin)) return callback(null, true);
          return callback(null, false);
        },
        credentials: true,
      })
    );

    app.use('/api/auth', authRoutes);

    app.get('/api/test-cors', (_req, res) => {
      res.json({ ok: true });
    });

    app.get('/api/test-protected', authenticateJWT, (req: AuthRequest, res) => {
      res.json({ user: req.user });
    });

    app.get(
      '/api/test-role/:projectId/read',
      authenticateJWT,
      requireProjectRole(['owner', 'editor', 'viewer']),
      (req: AuthRequest, res) => {
        res.json({ role: req.projectRole });
      }
    );

    app.post(
      '/api/test-role/:projectId/write',
      authenticateJWT,
      requireProjectRole(['owner', 'editor']),
      (req: AuthRequest, res) => {
        res.json({ role: req.projectRole });
      }
    );

    app.post(
      '/api/test-role-missing',
      authenticateJWT,
      requireProjectRole(['viewer']),
      (_req, res) => {
        res.json({ ok: true });
      }
    );

    app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
      const status = err?.status || 500;
      res.status(status).json({ message: err?.message || 'Error' });
    });

    await new Promise<void>((resolve) => {
      server = app.listen(0, '127.0.0.1', () => {
        const port = (server.address() as AddressInfo).port;
        baseUrl = `http://127.0.0.1:${port}`;
        resolve();
      });
    });
  });

  afterEach(() => {
    config.CLERK_SECRET_KEY = originalEnvConfig.CLERK_SECRET_KEY;
    config.GITHUB_CLIENT_ID = originalEnvConfig.GITHUB_CLIENT_ID;
    config.GITHUB_CLIENT_SECRET = originalEnvConfig.GITHUB_CLIENT_SECRET;
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  afterAll(async () => {
    server.closeAllConnections?.();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  describe('param() helper & cryptographic primitives', () => {
    it('normalizes string, array, empty array, and undefined route parameters', () => {
      expect(param('abc123')).toBe('abc123');
      expect(param('')).toBe('');
      expect(param(['first', 'second'])).toBe('first');
      expect(param(['only'])).toBe('only');
      expect(param([])).toBe('');
      expect(param(undefined)).toBe('');
    });

    it('hashes passwords using bcrypt (10 rounds) and signs/verifies HS256 JWTs', async () => {
      const password = 'SuperSecurePassword123!';
      const hash = await bcrypt.hash(password, 10);
      expect(hash).not.toBe(password);
      expect(hash.startsWith('$2')).toBe(true);
      expect(await bcrypt.compare(password, hash)).toBe(true);
      expect(await bcrypt.compare('WrongPassword!', hash)).toBe(false);

      const token = jwt.sign(
        { userId: 'u-crypto-1', email: 'crypto@test.dev', name: 'Crypto Dev' },
        config.JWT_SECRET,
        { algorithm: 'HS256', expiresIn: '7d' }
      );
      const decoded = jwt.verify(token, config.JWT_SECRET, { algorithms: ['HS256'] }) as any;
      expect(decoded.userId).toBe('u-crypto-1');
      expect(decoded.email).toBe('crypto@test.dev');
    });
  });

  describe('authenticateJWT & requireProjectRole RBAC middleware', () => {
    it('accepts Bearer header and obsidian_token cookie while rejecting invalid/missing tokens', async () => {
      const noAuth = await originalFetch(`${baseUrl}/api/test-protected`);
      expect(noAuth.status).toBe(401);

      const badToken = await originalFetch(`${baseUrl}/api/test-protected`, {
        headers: { Authorization: 'Bearer not.a.valid.jwt' },
      });
      expect(badToken.status).toBe(401);

      const missingUserIdToken = jwt.sign({ email: 'nouid@test.dev' }, config.JWT_SECRET, {
        algorithm: 'HS256',
      });
      const noUidRes = await originalFetch(`${baseUrl}/api/test-protected`, {
        headers: { Authorization: `Bearer ${missingUserIdToken}` },
      });
      expect(noUidRes.status).toBe(401);

      const validToken = jwt.sign(
        { userId: 'jwt-u1', email: 'jwt@test.dev', name: 'JWT User' },
        config.JWT_SECRET,
        { algorithm: 'HS256' }
      );

      const bearerRes = await originalFetch(`${baseUrl}/api/test-protected`, {
        headers: { Authorization: `Bearer ${validToken}` },
      });
      expect(bearerRes.status).toBe(200);
      expect(await bearerRes.json()).toEqual({
        user: { userId: 'jwt-u1', email: 'jwt@test.dev', name: 'JWT User' },
      });

      const cookieRes = await originalFetch(`${baseUrl}/api/test-protected`, {
        headers: { Cookie: `obsidian_token=${validToken}` },
      });
      expect(cookieRes.status).toBe(200);
    });

    it('enforces project membership, missing projectId 400, and public project viewer fallback', async () => {
      const ownerId = 'rbac-mw-owner';
      const editorId = 'rbac-mw-editor';
      const viewerId = 'rbac-mw-viewer';
      const outsiderId = 'rbac-mw-outsider';

      const privateProj = await dbStore.createProject({
        name: 'Private RBAC Project',
        ownerId,
        isPublic: false,
      });
      const publicProj = await dbStore.createProject({
        name: 'Public RBAC Project',
        ownerId,
        isPublic: true,
      });

      await dbStore.addMember(String(privateProj._id), editorId, 'editor');
      await dbStore.addMember(String(privateProj._id), viewerId, 'viewer');

      const makeTok = (uid: string) =>
        jwt.sign({ userId: uid, email: `${uid}@test.dev`, name: uid }, config.JWT_SECRET, {
          algorithm: 'HS256',
        });

      const missingIdRes = await originalFetch(`${baseUrl}/api/test-role-missing`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${makeTok(ownerId)}` },
      });
      expect(missingIdRes.status).toBe(400);

      // Outsider denied private project read & write
      const privOutRead = await originalFetch(`${baseUrl}/api/test-role/${privateProj._id}/read`, {
        headers: { Authorization: `Bearer ${makeTok(outsiderId)}` },
      });
      expect(privOutRead.status).toBe(403);

      // Viewer allowed read, denied write on private project
      const viewerRead = await originalFetch(`${baseUrl}/api/test-role/${privateProj._id}/read`, {
        headers: { Authorization: `Bearer ${makeTok(viewerId)}` },
      });
      expect(viewerRead.status).toBe(200);
      expect((await viewerRead.json()).role).toBe('viewer');

      const viewerWrite = await originalFetch(`${baseUrl}/api/test-role/${privateProj._id}/write`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${makeTok(viewerId)}` },
      });
      expect(viewerWrite.status).toBe(403);

      // Editor allowed write
      const editorWrite = await originalFetch(`${baseUrl}/api/test-role/${privateProj._id}/write`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${makeTok(editorId)}` },
      });
      expect(editorWrite.status).toBe(200);

      // Outsider gets viewer read access on public project, still blocked from write
      const pubOutRead = await originalFetch(`${baseUrl}/api/test-role/${publicProj._id}/read`, {
        headers: { Authorization: `Bearer ${makeTok(outsiderId)}` },
      });
      expect(pubOutRead.status).toBe(200);
      expect((await pubOutRead.json()).role).toBe('viewer');

      const pubOutWrite = await originalFetch(`${baseUrl}/api/test-role/${publicProj._id}/write`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${makeTok(outsiderId)}` },
      });
      expect(pubOutWrite.status).toBe(403);
    });
  });

  describe('Register, Login, Logout, /me & Zod 4 validation formatting', () => {
    it('formats Zod 4 validation errors with issues array on invalid registration', async () => {
      const res = await originalFetch(`${baseUrl}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'not-an-email', password: '12', name: 'A' }),
      });

      expect(res.status).toBe(400);
      const body = (await res.json()) as { message: string; errors: Array<{ message: string }> };
      expect(body.message).toBe('Validation failed');
      expect(Array.isArray(body.errors)).toBe(true);
      expect(body.errors.length).toBeGreaterThan(0);
      expect(body.errors[0]).toHaveProperty('message');
    });

    it('registers, prevents duplicate email, logs in, reads /me without passwordHash, and logs out', async () => {
      const email = `auth-${Date.now()}@obsidian.test`;

      const regRes = await originalFetch(`${baseUrl}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password: 'Password123!', name: 'Alice Tester' }),
      });
      expect(regRes.status).toBe(201);
      const regCookie = regRes.headers.get('set-cookie') || '';
      expect(regCookie).toContain('obsidian_token=');
      expect(regCookie).toContain('HttpOnly');

      const regBody = (await regRes.json()) as any;
      expect(regBody.user.email).toBe(email);
      expect(regBody.user.passwordHash).toBeUndefined();
      expect(typeof regBody.token).toBe('string');

      // Duplicate registration -> 409
      const dupRes = await originalFetch(`${baseUrl}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password: 'Password123!', name: 'Alice Tester' }),
      });
      expect(dupRes.status).toBe(409);

      // Wrong password -> 401
      const badLogin = await originalFetch(`${baseUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password: 'WrongPassword!' }),
      });
      expect(badLogin.status).toBe(401);

      // Valid login -> 200
      const loginRes = await originalFetch(`${baseUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password: 'Password123!' }),
      });
      expect(loginRes.status).toBe(200);
      const loginBody = (await loginRes.json()) as any;

      // /me returns user profile
      const meRes = await originalFetch(`${baseUrl}/api/auth/me`, {
        headers: { Authorization: `Bearer ${loginBody.token}` },
      });
      expect(meRes.status).toBe(200);
      const meBody = (await meRes.json()) as any;
      expect(meBody.email).toBe(email);
      expect(meBody.passwordHash).toBeUndefined();

      // /me for non-existent userId -> 404
      const ghostToken = jwt.sign(
        { userId: 'nonexistent-uid', email: 'ghost@test.dev', name: 'Ghost' },
        config.JWT_SECRET,
        { algorithm: 'HS256' }
      );
      const ghostRes = await originalFetch(`${baseUrl}/api/auth/me`, {
        headers: { Authorization: `Bearer ${ghostToken}` },
      });
      expect(ghostRes.status).toBe(404);

      // Logout clears cookie
      const logoutRes = await originalFetch(`${baseUrl}/api/auth/logout`, { method: 'POST' });
      expect(logoutRes.status).toBe(200);
      expect(logoutRes.headers.get('set-cookie') || '').toContain('obsidian_token=;');
    });
  });

  describe('Clerk Sync Verification (/api/auth/clerk-sync)', () => {
    it('upserts Clerk user and links existing email account when CLERK_SECRET_KEY is placeholder/unset', async () => {
      config.CLERK_SECRET_KEY = undefined;
      const email = `clerk-dev-${Date.now()}@obsidian.test`;

      // Pre-create standard user to test email linking
      const existing = await dbStore.createUser({
        email,
        passwordHash: '$2a$10$existinghashvalue',
        name: 'Preexisting User',
      });

      const res = await originalFetch(`${baseUrl}/api/auth/clerk-sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clerkId: `user_dev_${Date.now()}`,
          email,
          name: 'Clerk Linked Name',
        }),
      });
      expect(res.status).toBe(200);
      const body = (await res.json()) as any;
      expect(String(body.user._id)).toBe(String(existing._id));
      expect(body.user.name).toBe('Clerk Linked Name');
      expect(typeof body.token).toBe('string');
      expect(res.headers.get('set-cookie') || '').toContain('obsidian_token=');
    });

    it('verifies Clerk identity against Clerk Backend API when CLERK_SECRET_KEY is configured', async () => {
      config.CLERK_SECRET_KEY = 'sk_test_verified_secret_key_for_tests';
      const clerkId = `user_verified_${Date.now()}`;
      const email = `verified-${Date.now()}@clerk.test`;

      globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.startsWith('https://api.clerk.com/v1/users/')) {
          expect(init?.headers).toMatchObject({
            Authorization: 'Bearer sk_test_verified_secret_key_for_tests',
          });
          return new Response(
            JSON.stringify({
              id: clerkId,
              email_addresses: [{ email_address: email }],
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          );
        }
        return originalFetch(input, init);
      }) as typeof fetch;

      const okRes = await originalFetch(`${baseUrl}/api/auth/clerk-sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clerkId, email, name: 'Verified Clerk User' }),
      });
      expect(okRes.status).toBe(200);
      const okBody = (await okRes.json()) as any;
      expect(okBody.user.email).toBe(email);
    });

    it('rejects Clerk sync with 401 on non-OK API response or ID mismatch, 403 on email mismatch, and 502 on network error', async () => {
      config.CLERK_SECRET_KEY = 'sk_test_verified_secret_key_for_tests';

      // 1. Non-OK response from Clerk API -> 401
      globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
        if (String(input).startsWith('https://api.clerk.com/')) {
          return new Response(JSON.stringify({ errors: [] }), { status: 404 });
        }
        return originalFetch(input, init);
      }) as typeof fetch;

      const notFoundRes = await originalFetch(`${baseUrl}/api/auth/clerk-sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clerkId: 'user_bad', email: 'a@b.com', name: 'Bad' }),
      });
      expect(notFoundRes.status).toBe(401);

      // 2. Clerk ID mismatch -> 401
      globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
        if (String(input).startsWith('https://api.clerk.com/')) {
          return new Response(
            JSON.stringify({
              id: 'user_different',
              email_addresses: [{ email_address: 'a@b.com' }],
            }),
            { status: 200 }
          );
        }
        return originalFetch(input, init);
      }) as typeof fetch;

      const idMismatchRes = await originalFetch(`${baseUrl}/api/auth/clerk-sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clerkId: 'user_expected', email: 'a@b.com', name: 'Mismatch' }),
      });
      expect(idMismatchRes.status).toBe(401);

      // 3. Email verification mismatch -> 403
      globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
        if (String(input).startsWith('https://api.clerk.com/')) {
          return new Response(
            JSON.stringify({
              id: 'user_email_check',
              email_addresses: [{ email_address: 'real@clerk.dev' }],
            }),
            { status: 200 }
          );
        }
        return originalFetch(input, init);
      }) as typeof fetch;

      const emailMismatchRes = await originalFetch(`${baseUrl}/api/auth/clerk-sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clerkId: 'user_email_check',
          email: 'spoofed@evil.dev',
          name: 'Spoof',
        }),
      });
      expect(emailMismatchRes.status).toBe(403);

      // 4. Network failure contacting Clerk -> 502
      globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
        if (String(input).startsWith('https://api.clerk.com/')) {
          throw new Error('ECONNREFUSED');
        }
        return originalFetch(input, init);
      }) as typeof fetch;

      const networkErrRes = await originalFetch(`${baseUrl}/api/auth/clerk-sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clerkId: 'user_net', email: 'net@clerk.dev', name: 'Net' }),
      });
      expect(networkErrRes.status).toBe(502);
    });
  });

  describe('GitHub OAuth CSRF, Callback & User Upsert', () => {
    it('reports OAuth provider status and rejects unconfigured /github initiation with 503', async () => {
      config.GITHUB_CLIENT_ID = undefined;
      config.GITHUB_CLIENT_SECRET = undefined;

      const providersRes = await originalFetch(`${baseUrl}/api/auth/oauth/providers`);
      expect(providersRes.status).toBe(200);
      expect(await providersRes.json()).toEqual({ github: false });

      const initRes = await originalFetch(`${baseUrl}/api/auth/github`, { redirect: 'manual' });
      expect(initRes.status).toBe(503);
    });

    it('rejects missing/mismatched/length-mismatched OAuth state and missing code with 400', async () => {
      const noState = await originalFetch(`${baseUrl}/api/auth/github/callback?code=fake`);
      expect(noState.status).toBe(400);
      expect((await noState.json()).message).toContain('state');

      const lenMismatch = await originalFetch(
        `${baseUrl}/api/auth/github/callback?code=fake&state=short`,
        { headers: { Cookie: 'gh_oauth_state=longer_valid_state_value' } }
      );
      expect(lenMismatch.status).toBe(400);

      const valMismatch = await originalFetch(
        `${baseUrl}/api/auth/github/callback?code=fake&state=aaaaaaaaaaaaaaaa`,
        { headers: { Cookie: 'gh_oauth_state=bbbbbbbbbbbbbbbb' } }
      );
      expect(valMismatch.status).toBe(400);

      const missingCode = await originalFetch(
        `${baseUrl}/api/auth/github/callback?state=matching_state_123`,
        { headers: { Cookie: 'gh_oauth_state=matching_state_123' } }
      );
      expect(missingCode.status).toBe(400);
      expect((await missingCode.json()).message).toContain('code');
    });

    it('initiates OAuth with random state cookie and completes callback login flow', async () => {
      config.GITHUB_CLIENT_ID = 'gh-client-id-test';
      config.GITHUB_CLIENT_SECRET = 'gh-client-secret-test';

      const providersRes = await originalFetch(`${baseUrl}/api/auth/oauth/providers`);
      expect(await providersRes.json()).toEqual({ github: true });

      const initRes = await originalFetch(`${baseUrl}/api/auth/github`, { redirect: 'manual' });
      expect(initRes.status).toBe(302);
      const location = initRes.headers.get('location') || '';
      expect(location).toContain('https://github.com/login/oauth/authorize');
      const setCookie = initRes.headers.get('set-cookie') || '';
      const stateMatch = setCookie.match(/gh_oauth_state=([^;]+)/);
      expect(stateMatch).not.toBeNull();
      const state = stateMatch![1];
      expect(location).toContain(`state=${state}`);

      globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url === 'https://github.com/login/oauth/access_token') {
          return new Response(JSON.stringify({ access_token: 'gho_mock_token' }), { status: 200 });
        }
        if (url === 'https://api.github.com/user') {
          return new Response(
            JSON.stringify({
              id: 777123,
              email: null,
              name: 'Octocat Tester',
              login: 'octocat',
              avatar_url: 'https://avatars.githubusercontent.com/u/777123',
            }),
            { status: 200 }
          );
        }
        if (url === 'https://api.github.com/user/emails') {
          return new Response(
            JSON.stringify([
              { email: 'secondary@octo.dev', primary: false, verified: true },
              { email: 'primary@octo.dev', primary: true, verified: true },
            ]),
            { status: 200 }
          );
        }
        return originalFetch(input, init);
      }) as typeof fetch;

      const cbRes = await originalFetch(
        `${baseUrl}/api/auth/github/callback?code=auth_code_1&state=${state}`,
        {
          redirect: 'manual',
          headers: { Cookie: `gh_oauth_state=${state}` },
        }
      );
      expect(cbRes.status).toBe(302);
      expect(cbRes.headers.get('location')).toBe(`${config.CLIENT_ORIGIN}/dashboard`);
      const cbCookies = cbRes.headers.get('set-cookie') || '';
      expect(cbCookies).toContain('obsidian_token=');

      const savedUser = await dbStore.findUserByGithubId('777123');
      expect(savedUser).not.toBeNull();
      expect(savedUser?.email).toBe('primary@octo.dev');
      expect(savedUser?.passwordHash).toBeUndefined();
    });

    it('dbStore.upsertGithubUser creates passwordless user and links by matching email', async () => {
      const existing = await dbStore.createUser({
        email: 'team_lead@company.com',
        passwordHash: '$2a$10$fakehashpassword123',
        name: 'Team Lead',
      });

      const linked = await dbStore.upsertGithubUser({
        githubId: 'gh-998877',
        email: 'team_lead@company.com',
        name: 'Team Lead GH',
        avatar: 'https://github.com/teamlead.png',
      });
      expect(String(linked._id)).toBe(String(existing._id));
      expect(linked.githubId).toBe('gh-998877');

      const fresh = await dbStore.upsertGithubUser({
        githubId: 'gh-123456',
        email: 'oauth_user@github.com',
        name: 'Octocat Dev',
        avatar: 'https://github.com/octocat.png',
      });
      expect(fresh.passwordHash).toBeUndefined();
      expect(fresh.githubId).toBe('gh-123456');
    });
  });

  describe('CORS Origin Allowlist', () => {
    it('allows configured client origin and blocks unknown origins without throwing 500', async () => {
      const allowedRes = await originalFetch(`${baseUrl}/api/test-cors`, {
        headers: { Origin: config.CLIENT_ORIGIN },
      });
      expect(allowedRes.status).toBe(200);
      expect(allowedRes.headers.get('access-control-allow-origin')).toBe(config.CLIENT_ORIGIN);
      expect(allowedRes.headers.get('access-control-allow-credentials')).toBe('true');

      const blockedRes = await originalFetch(`${baseUrl}/api/test-cors`, {
        headers: { Origin: 'http://unauthorized-malicious-origin.com' },
      });
      expect(blockedRes.status).not.toBe(500);
      expect(blockedRes.headers.get('access-control-allow-origin')).toBeNull();
    });
  });
});
