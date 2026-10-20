import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import express from 'express';
import http from 'http';
import jwt from 'jsonwebtoken';
import { AddressInfo } from 'net';
import { dbStore } from '../server/dbStore';
import { config } from '../server/config';
import { projectRoutes } from '../server/routes/projectRoutes';

describe('Project Title Name Persistence & Refresh Integrity (BUG-PROJECT-TITLE)', () => {
  let server: http.Server;
  let baseUrl: string;

  const ownerId = 'project-owner-persist-1';
  let ownerToken: string;

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

    ownerToken = createToken(ownerId, 'owner@example.com', 'Project Owner');
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
  });

  it('creates project with name, returns name in POST response, and preserves name on GET /:projectId', async () => {
    // 1. Create project with specific name
    const createRes = await fetch(`${baseUrl}/api/projects`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${ownerToken}`,
      },
      body: JSON.stringify({
        name: 'Apollo Cloud Workspace',
        description: 'NextGen collaborative project',
        template: 'blank',
      }),
    });

    expect(createRes.status).toBe(201);
    const createdProject = await createRes.json();
    expect(createdProject.name).toBe('Apollo Cloud Workspace');
    expect(createdProject._id).toBeDefined();

    const projectId = createdProject._id;

    // 2. Fetch project via GET /:projectId (what loadWorkspace calls on page load and refresh)
    const getRes = await fetch(`${baseUrl}/api/projects/${projectId}`, {
      headers: {
        Authorization: `Bearer ${ownerToken}`,
      },
    });

    expect(getRes.status).toBe(200);
    const getBody = await getRes.json();
    expect(getBody.project).toBeDefined();
    // The critical check: project.name must NOT be undefined or stripped
    expect(getBody.project.name).toBe('Apollo Cloud Workspace');
    expect(getBody.project.members).toBeDefined();
    expect(getBody.userRole).toBe('owner');
  });

  it('updates project name on PATCH and preserves new name across GET /:projectId refresh', async () => {
    // 1. Create initial project
    const createRes = await fetch(`${baseUrl}/api/projects`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${ownerToken}`,
      },
      body: JSON.stringify({
        name: 'Original Title',
        template: 'blank',
      }),
    });
    const created = await createRes.json();
    const projectId = created._id;

    // 2. Rename via PATCH /:projectId
    const patchRes = await fetch(`${baseUrl}/api/projects/${projectId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${ownerToken}`,
      },
      body: JSON.stringify({
        name: 'Renamed Production Project',
      }),
    });

    expect(patchRes.status).toBe(200);
    const patched = await patchRes.json();
    expect(patched.name).toBe('Renamed Production Project');

    // 3. Simulate page refresh: GET /:projectId
    const refreshRes = await fetch(`${baseUrl}/api/projects/${projectId}`, {
      headers: {
        Authorization: `Bearer ${ownerToken}`,
      },
    });

    expect(refreshRes.status).toBe(200);
    const refreshBody = await refreshRes.json();
    // Must retain renamed title, not revert to "Untitled Project"
    expect(refreshBody.project.name).toBe('Renamed Production Project');
  });
});
