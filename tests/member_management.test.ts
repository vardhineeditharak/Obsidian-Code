import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import express from 'express';
import http from 'http';
import jwt from 'jsonwebtoken';
import { AddressInfo } from 'net';
import { dbStore } from '../server/dbStore';
import { config } from '../server/config';
import { projectRoutes } from '../server/routes/projectRoutes';

describe('Member Role Management & Protection Routes (M1)', () => {
  let server: http.Server;
  let baseUrl: string;

  const owner1Id = 'owner-user-1';
  const owner2Id = 'owner-user-2';
  const editor1Id = 'editor-user-1';
  const viewer1Id = 'viewer-user-1';
  const outsiderId = 'outsider-user-1';

  let owner1Token: string;
  let owner2Token: string;
  let editor1Token: string;
  let outsiderToken: string;

  const createToken = (userId: string, email: string, name: string) =>
    jwt.sign({ userId, email, name }, config.JWT_SECRET, { expiresIn: '1h' });

  beforeAll(async () => {
    const app = express();
    app.use(express.json());
    app.use('/api/projects', projectRoutes);

    await new Promise<void>((resolve) => {
      server = app.listen(0, () => {
        const port = (server.address() as AddressInfo).port;
        baseUrl = `http://127.0.0.1:${port}`;
        resolve();
      });
    });

    owner1Token = createToken(owner1Id, 'owner1@test.com', 'Owner One');
    owner2Token = createToken(owner2Id, 'owner2@test.com', 'Owner Two');
    editor1Token = createToken(editor1Id, 'editor1@test.com', 'Editor One');
    outsiderToken = createToken(outsiderId, 'outsider@test.com', 'Outsider');
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
  });

  it('owner changes member role -> 200', async () => {
    const project = await dbStore.createProject('Role Change Project', owner1Id);
    await dbStore.addMember(project._id.toString(), editor1Id, 'editor');

    const res = await fetch(`${baseUrl}/api/projects/${project._id}/members/${editor1Id}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${owner1Token}`,
      },
      body: JSON.stringify({ role: 'viewer' }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.message).toBe('Member role updated successfully');

    const role = await dbStore.getMemberRole(project._id.toString(), editor1Id);
    expect(role).toBe('viewer');
  });

  it('non-owner attempting role change -> 403', async () => {
    const project = await dbStore.createProject('Non-Owner Role Test', owner1Id);
    await dbStore.addMember(project._id.toString(), editor1Id, 'editor');
    await dbStore.addMember(project._id.toString(), viewer1Id, 'viewer');

    const res = await fetch(`${baseUrl}/api/projects/${project._id}/members/${viewer1Id}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${editor1Token}`,
      },
      body: JSON.stringify({ role: 'editor' }),
    });

    expect(res.status).toBe(403);
  });

  it('removing last owner -> 400', async () => {
    const project = await dbStore.createProject('Sole Owner Removal Test', owner1Id);

    // Attempt to demote sole owner
    const demoteRes = await fetch(`${baseUrl}/api/projects/${project._id}/members/${owner1Id}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${owner1Token}`,
      },
      body: JSON.stringify({ role: 'editor' }),
    });
    expect(demoteRes.status).toBe(400);

    // Attempt to remove sole owner
    const removeRes = await fetch(`${baseUrl}/api/projects/${project._id}/members/${owner1Id}`, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${owner1Token}`,
      },
    });
    expect(removeRes.status).toBe(400);
  });

  it('removing non-member -> 404', async () => {
    const project = await dbStore.createProject('Non-Member Test', owner1Id);

    const res = await fetch(`${baseUrl}/api/projects/${project._id}/members/non-existent-user-id`, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${owner1Token}`,
      },
    });

    expect(res.status).toBe(404);
  });

  it('self-removal (leave) as sole owner -> 400', async () => {
    const project = await dbStore.createProject('Leave As Sole Owner Test', owner1Id);

    const res = await fetch(`${baseUrl}/api/projects/${project._id}/members/${owner1Id}`, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${owner1Token}`,
      },
    });

    expect(res.status).toBe(400);
  });

  it('self-removal (leave) succeeds when another owner exists -> 200', async () => {
    const project = await dbStore.createProject('Multi-Owner Leave Test', owner1Id);
    await dbStore.addMember(project._id.toString(), owner2Id, 'owner');

    const res = await fetch(`${baseUrl}/api/projects/${project._id}/members/${owner1Id}`, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${owner1Token}`,
      },
    });

    expect(res.status).toBe(200);
    const roleAfter = await dbStore.getMemberRole(project._id.toString(), owner1Id);
    expect(roleAfter).toBeNull();
  });
});
