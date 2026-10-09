import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import express from 'express';
import cookieParser from 'cookie-parser';
import http from 'http';
import { AddressInfo } from 'net';
import { authRoutes } from '../server/routes/authRoutes';
import { dbStore } from '../server/dbStore';

describe('GitHub OAuth Authentication (Phase 4)', () => {
  let server: http.Server;
  let baseUrl: string;

  beforeAll(async () => {
    const app = express();
    app.use(express.json());
    app.use(cookieParser());
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

  it('GET /api/auth/oauth/providers returns provider status boolean', async () => {
    const res = await fetch(`${baseUrl}/api/auth/oauth/providers`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { github: boolean };
    expect(typeof body.github).toBe('boolean');
  });

  it('GET /api/auth/github/callback rejects missing or mismatched state with 400', async () => {
    // Missing state
    const resNoState = await fetch(`${baseUrl}/api/auth/github/callback?code=fake_code`);
    expect(resNoState.status).toBe(400);
    const bodyNoState = await resNoState.json();
    expect(bodyNoState.message).toContain('state');

    // Mismatched state
    const resMismatch = await fetch(`${baseUrl}/api/auth/github/callback?code=fake_code&state=forged_state`, {
      headers: {
        Cookie: 'gh_oauth_state=legitimate_state_1234567890',
      },
    });
    expect(resMismatch.status).toBe(400);
  });

  it('dbStore.upsertGithubUser creates new OAuth user without passwordHash', async () => {
    const user = await dbStore.upsertGithubUser({
      githubId: 'gh-123456',
      email: 'oauth_user@github.com',
      name: 'Octocat Dev',
      avatar: 'https://github.com/octocat.png',
    });

    expect(user).toBeDefined();
    expect(user.githubId).toBe('gh-123456');
    expect(user.email).toBe('oauth_user@github.com');
    expect(user.name).toBe('Octocat Dev');
    expect((user as any).passwordHash).toBeUndefined();
  });

  it('dbStore.upsertGithubUser links githubId to existing account if email matches', async () => {
    // Pre-create regular email/password user
    const existing = await dbStore.createUser({
      email: 'team_lead@company.com',
      passwordHash: '$2a$10$fakehashpassword123',
      name: 'Team Lead',
    });

    // Sign in with GitHub with same email
    const linked = await dbStore.upsertGithubUser({
      githubId: 'gh-998877',
      email: 'team_lead@company.com',
      name: 'Team Lead GH',
      avatar: 'https://github.com/teamlead.png',
    });

    expect(linked._id.toString()).toBe(existing._id.toString());
    expect(linked.githubId).toBe('gh-998877');
    expect(linked.email).toBe('team_lead@company.com');
  });
});
