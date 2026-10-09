import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import express from 'express';
import http from 'http';
import jwt from 'jsonwebtoken';
import { AddressInfo } from 'net';
import { dbStore } from '../server/dbStore';
import { config } from '../server/config';
import { fileRoutes } from '../server/routes/fileRoutes';
import { versionRoutes } from '../server/routes/versionRoutes';

describe('RBAC Mutations Protection (S3 IDOR Fix)', () => {
  let server: http.Server;
  let baseUrl: string;

  const ownerId = 'user-owner';
  const editorId = 'user-editor';
  const viewerId = 'user-viewer';
  const nonMemberId = 'user-nonmember';

  let projectId: string;
  let fileId: string;
  let versionId: string;

  let ownerToken: string;
  let editorToken: string;
  let viewerToken: string;
  let nonMemberToken: string;

  const createToken = (userId: string, email: string, name: string) =>
    jwt.sign({ userId, email, name }, config.JWT_SECRET, { expiresIn: '1h' });

  beforeAll(async () => {
    const app = express();
    app.use(express.json());
    app.use('/api', fileRoutes);
    app.use('/api', versionRoutes);

    await new Promise<void>((resolve) => {
      server = app.listen(0, () => {
        const port = (server.address() as AddressInfo).port;
        baseUrl = `http://127.0.0.1:${port}`;
        resolve();
      });
    });

    // Mirror tests/auth_rbac.test.ts setup
    const project = await dbStore.createProject('Test RBAC Project', ownerId);
    projectId = project._id.toString();
    await dbStore.addMember(projectId, editorId, 'editor');
    await dbStore.addMember(projectId, viewerId, 'viewer');

    const file = await dbStore.createFile({
      projectId,
      name: 'test.ts',
      path: 'test.ts',
      isFolder: false,
      content: 'console.log("initial");',
    });
    fileId = file._id.toString();

    const version = await dbStore.createVersion(
      projectId,
      'v1.0',
      'initial snapshot',
      { userId: ownerId, name: 'Owner' },
      [{ fileId, name: 'test.ts', path: 'test.ts', content: 'console.log("initial");' }]
    );
    versionId = version._id.toString();

    ownerToken = createToken(ownerId, 'owner@test.com', 'Owner');
    editorToken = createToken(editorId, 'editor@test.com', 'Editor');
    viewerToken = createToken(viewerId, 'viewer@test.com', 'Viewer');
    nonMemberToken = createToken(nonMemberId, 'non@test.com', 'NonMember');
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
  });

  it('viewer denied PATCH/DELETE on files', async () => {
    const patchRes = await fetch(`${baseUrl}/api/files/${fileId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${viewerToken}`,
      },
      body: JSON.stringify({ content: 'viewer mutation attempt' }),
    });
    expect(patchRes.status).toBe(403);

    const deleteRes = await fetch(`${baseUrl}/api/files/${fileId}`, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${viewerToken}`,
      },
    });
    expect(deleteRes.status).toBe(403);
  });

  it('viewer denied version restore', async () => {
    const restoreRes = await fetch(`${baseUrl}/api/versions/${versionId}/restore`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${viewerToken}`,
      },
    });
    expect(restoreRes.status).toBe(403);
  });

  it('owner/editor allowed', async () => {
    // Editor allowed to patch
    const patchRes = await fetch(`${baseUrl}/api/files/${fileId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${editorToken}`,
      },
      body: JSON.stringify({ content: 'editor updated content' }),
    });
    expect(patchRes.status).toBe(200);

    // Owner allowed to restore
    const restoreRes = await fetch(`${baseUrl}/api/versions/${versionId}/restore`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${ownerToken}`,
      },
    });
    expect(restoreRes.status).toBe(200);

    // Editor allowed to delete a test file
    const tempFile = await dbStore.createFile({
      projectId,
      name: 'temp.ts',
      path: 'temp.ts',
      isFolder: false,
    });
    const deleteRes = await fetch(`${baseUrl}/api/files/${tempFile._id.toString()}`, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${editorToken}`,
      },
    });
    expect(deleteRes.status).toBe(200);
  });

  it('non-member gets 403', async () => {
    const patchRes = await fetch(`${baseUrl}/api/files/${fileId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${nonMemberToken}`,
      },
      body: JSON.stringify({ content: 'non-member attack' }),
    });
    expect(patchRes.status).toBe(403);

    const deleteRes = await fetch(`${baseUrl}/api/files/${fileId}`, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${nonMemberToken}`,
      },
    });
    expect(deleteRes.status).toBe(403);

    const restoreRes = await fetch(`${baseUrl}/api/versions/${versionId}/restore`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${nonMemberToken}`,
      },
    });
    expect(restoreRes.status).toBe(403);
  });
});
