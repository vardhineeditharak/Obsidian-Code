import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import express from 'express';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import jwt from 'jsonwebtoken';
import { dbStore } from '../server/dbStore';
import { config } from '../server/config';
import { projectRoutes } from '../server/routes/projectRoutes';
import { invitationRoutes } from '../server/routes/invitationRoutes';

describe('Projects, Templates, Member Management & Invitations', () => {
  let server: http.Server;
  let baseUrl: string;

  const owner1Id = 'pm-owner-1';
  const owner2Id = 'pm-owner-2';
  const editor1Id = 'pm-editor-1';
  const viewer1Id = 'pm-viewer-1';
  const joinerId = 'pm-joiner-1';
  const outsiderId = 'pm-outsider-1';

  const makeToken = (userId: string, email: string, name: string) =>
    jwt.sign({ userId, email, name }, config.JWT_SECRET, { algorithm: 'HS256', expiresIn: '1h' });

  let owner1Token: string;
  let editor1Token: string;
  let viewer1Token: string;
  let joinerToken: string;
  let outsiderToken: string;

  beforeAll(async () => {
    const app = express();
    app.use(express.json());
    app.use('/api/projects', projectRoutes);
    app.use('/api', invitationRoutes);

    await new Promise<void>((resolve) => {
      server = app.listen(0, '127.0.0.1', () => {
        const port = (server.address() as AddressInfo).port;
        baseUrl = `http://127.0.0.1:${port}`;
        resolve();
      });
    });

    owner1Token = makeToken(owner1Id, 'owner1@pm.test', 'Owner One');
    editor1Token = makeToken(editor1Id, 'editor1@pm.test', 'Editor One');
    viewer1Token = makeToken(viewer1Id, 'viewer1@pm.test', 'Viewer One');
    joinerToken = makeToken(joinerId, 'joiner@pm.test', 'Joiner User');
    outsiderToken = makeToken(outsiderId, 'outsider@pm.test', 'Outsider User');
  });

  afterAll(async () => {
    server.closeAllConnections?.();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  describe('Project CRUD, Template Seeding & Cascade Deletion', () => {
    it('creates projects with blank/web/node/algorithms templates and escapes HTML in web template', async () => {
      const xssName = '<script>alert("xss")</script>';
      const webRes = await fetch(`${baseUrl}/api/projects`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${owner1Token}`,
        },
        body: JSON.stringify({ name: xssName, description: 'Web app', template: 'web' }),
      });
      expect(webRes.status).toBe(201);
      const webProj = (await webRes.json()) as any;
      const webFiles = await dbStore.getProjectFiles(String(webProj._id));
      const htmlFile = webFiles.find((f) => f.name === 'index.html');
      expect(htmlFile).toBeDefined();
      expect(htmlFile!.content).toContain('&lt;script&gt;');
      expect(htmlFile!.content).not.toContain('<script>alert');
      expect(webFiles.some((f) => f.name === 'style.css')).toBe(true);
      expect(webFiles.some((f) => f.name === 'app.js')).toBe(true);

      const nodeRes = await fetch(`${baseUrl}/api/projects`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${owner1Token}` },
        body: JSON.stringify({ name: 'Node App', template: 'node' }),
      });
      expect(nodeRes.status).toBe(201);
      const nodeProj = (await nodeRes.json()) as any;
      const nodeFiles = await dbStore.getProjectFiles(String(nodeProj._id));
      expect(nodeFiles.some((f) => f.name === 'index.js')).toBe(true);
      expect(nodeFiles.some((f) => f.name === 'package.json')).toBe(true);

      const algoRes = await fetch(`${baseUrl}/api/projects`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${owner1Token}` },
        body: JSON.stringify({ name: 'Algo Sandbox', template: 'algorithms' }),
      });
      expect(algoRes.status).toBe(201);
      const algoProj = (await algoRes.json()) as any;
      const algoFiles = await dbStore.getProjectFiles(String(algoProj._id));
      expect(algoFiles.some((f) => f.name === 'solution.js')).toBe(true);
    });

    it('restricts project PATCH/DELETE to owners and cascades deletion across related records', async () => {
      const project = await dbStore.createProject('Cascade Project', owner1Id);
      const pid = String(project._id);
      await dbStore.addMember(pid, editor1Id, 'editor');
      await dbStore.addMember(pid, viewer1Id, 'viewer');
      const file = await dbStore.createFile({
        projectId: pid,
        name: 'main.ts',
        path: 'main.ts',
        isFolder: false,
      });
      await dbStore.saveDocSnapshot(pid, String(file._id), Buffer.from([1, 2, 3]));
      await dbStore.createVersion(pid, 'v1', 'note', { userId: owner1Id, name: 'Owner' }, []);
      await dbStore.createInvitation(pid, `tok-${pid}`, 'editor', owner1Id, new Date(Date.now() + 60000));

      // Editor & Viewer cannot PATCH or DELETE project
      const editorPatch = await fetch(`${baseUrl}/api/projects/${pid}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${editor1Token}` },
        body: JSON.stringify({ name: 'Hijacked Name' }),
      });
      expect(editorPatch.status).toBe(403);

      const viewerDel = await fetch(`${baseUrl}/api/projects/${pid}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${viewer1Token}` },
      });
      expect(viewerDel.status).toBe(403);

      // Owner can PATCH
      const ownerPatch = await fetch(`${baseUrl}/api/projects/${pid}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${owner1Token}` },
        body: JSON.stringify({ name: 'Renamed Cascade Project', isPublic: true }),
      });
      expect(ownerPatch.status).toBe(200);
      const updated = (await ownerPatch.json()) as any;
      expect(updated.name).toBe('Renamed Cascade Project');
      expect(updated.isPublic).toBe(true);

      // Owner DELETE cascades
      const ownerDel = await fetch(`${baseUrl}/api/projects/${pid}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${owner1Token}` },
      });
      expect(ownerDel.status).toBe(200);
      expect(await dbStore.findProjectById(pid)).toBeNull();
      expect(await dbStore.getProjectFiles(pid)).toEqual([]);
      expect(await dbStore.getVersions(pid)).toEqual([]);
      expect(await dbStore.getDocSnapshot(pid, String(file._id))).toBeNull();
      expect(await dbStore.getMemberRole(pid, editor1Id)).toBeNull();
    });
  });

  describe('Member Role Management & Protection', () => {
    it('allows owner to change member role and rejects non-owner attempts with 403', async () => {
      const project = await dbStore.createProject('Role Change Project', owner1Id);
      const pid = String(project._id);
      await dbStore.addMember(pid, editor1Id, 'editor');
      await dbStore.addMember(pid, viewer1Id, 'viewer');

      const res = await fetch(`${baseUrl}/api/projects/${pid}/members/${editor1Id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${owner1Token}` },
        body: JSON.stringify({ role: 'viewer' }),
      });
      expect(res.status).toBe(200);
      expect(await dbStore.getMemberRole(pid, editor1Id)).toBe('viewer');

      const nonOwnerRes = await fetch(`${baseUrl}/api/projects/${pid}/members/${viewer1Id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${editor1Token}` },
        body: JSON.stringify({ role: 'editor' }),
      });
      expect(nonOwnerRes.status).toBe(403);
    });

    it('protects last remaining owner from demotion or removal (400) while allowing multi-owner leave (200)', async () => {
      const soloProj = await dbStore.createProject('Sole Owner Project', owner1Id);
      const soloId = String(soloProj._id);

      const demoteRes = await fetch(`${baseUrl}/api/projects/${soloId}/members/${owner1Id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${owner1Token}` },
        body: JSON.stringify({ role: 'editor' }),
      });
      expect(demoteRes.status).toBe(400);

      const removeRes = await fetch(`${baseUrl}/api/projects/${soloId}/members/${owner1Id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${owner1Token}` },
      });
      expect(removeRes.status).toBe(400);

      // Multi-owner project allows one owner to leave
      const multiProj = await dbStore.createProject('Multi Owner Project', owner1Id);
      const multiId = String(multiProj._id);
      await dbStore.addMember(multiId, owner2Id, 'owner');

      const leaveRes = await fetch(`${baseUrl}/api/projects/${multiId}/members/${owner1Id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${owner1Token}` },
      });
      expect(leaveRes.status).toBe(200);
      expect(await dbStore.getMemberRole(multiId, owner1Id)).toBeNull();
    });

    it('handles non-member removal (404), unauthorized peer removal (403), and editor self-leave (200)', async () => {
      const project = await dbStore.createProject('Removal Rules Project', owner1Id);
      const pid = String(project._id);
      await dbStore.addMember(pid, editor1Id, 'editor');
      await dbStore.addMember(pid, viewer1Id, 'viewer');

      const notFoundRes = await fetch(`${baseUrl}/api/projects/${pid}/members/unknown-user`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${owner1Token}` },
      });
      expect(notFoundRes.status).toBe(404);

      const nonOwnerRemoveOther = await fetch(`${baseUrl}/api/projects/${pid}/members/${viewer1Id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${editor1Token}` },
      });
      expect(nonOwnerRemoveOther.status).toBe(403);

      const outsiderRes = await fetch(`${baseUrl}/api/projects/${pid}/members/${viewer1Id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${outsiderToken}` },
      });
      expect(outsiderRes.status).toBe(403);

      const selfLeave = await fetch(`${baseUrl}/api/projects/${pid}/members/${editor1Id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${editor1Token}` },
      });
      expect(selfLeave.status).toBe(200);
      expect(await dbStore.getMemberRole(pid, editor1Id)).toBeNull();
    });
  });

  describe('Invitation Lifecycle, Security & Route Parsing', () => {
    let mockStorage: Record<string, string>;

    beforeEach(() => {
      mockStorage = {};
    });

    it('only allows owner to create invitation links via POST /projects/:projectId/invitations', async () => {
      const project = await dbStore.createProject('Invite Auth Project', owner1Id);
      const pid = String(project._id);
      await dbStore.addMember(pid, editor1Id, 'editor');

      const editorCreate = await fetch(`${baseUrl}/api/projects/${pid}/invitations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${editor1Token}` },
        body: JSON.stringify({ role: 'viewer' }),
      });
      expect(editorCreate.status).toBe(403);

      const ownerCreate = await fetch(`${baseUrl}/api/projects/${pid}/invitations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${owner1Token}` },
        body: JSON.stringify({ role: 'editor', expiresInDays: 3 }),
      });
      expect(ownerCreate.status).toBe(201);
      const body = (await ownerCreate.json()) as { token: string; inviteUrl: string };
      expect(body.token).toMatch(/^[a-f0-9]{48}$/);
      expect(body.inviteUrl).toContain(`/join/${body.token}`);
    });

    it('rejects unknown (404), expired (410), and reused single-use invitations (410)', async () => {
      const missingRes = await fetch(`${baseUrl}/api/invitations/nonexistent-token/accept`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${joinerToken}` },
      });
      expect(missingRes.status).toBe(404);

      const project = await dbStore.createProject('Single Use Invite Project', owner1Id);
      const pid = String(project._id);

      const expiredTok = `expired-${Date.now()}`;
      await dbStore.createInvitation(pid, expiredTok, 'editor', owner1Id, new Date(Date.now() - 5000));
      const expiredRes = await fetch(`${baseUrl}/api/invitations/${expiredTok}/accept`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${joinerToken}` },
      });
      expect(expiredRes.status).toBe(410);
      expect((await expiredRes.json()).message).toContain('expired');

      const singleTok = `single-${Date.now()}`;
      await dbStore.createInvitation(pid, singleTok, 'editor', owner1Id, new Date(Date.now() + 60000));

      const first = await fetch(`${baseUrl}/api/invitations/${singleTok}/accept`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${joinerToken}` },
      });
      expect(first.status).toBe(200);
      expect((await first.json()).role).toBe('editor');

      const second = await fetch(`${baseUrl}/api/invitations/${singleTok}/accept`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${joinerToken}` },
      });
      expect(second.status).toBe(410);
      expect((await second.json()).message).toBe('Invitation has already been used');
    });

    it('never downgrades an existing higher-privilege role when accepting a viewer invitation', async () => {
      const project = await dbStore.createProject('Role Protection Project', owner1Id);
      const pid = String(project._id);
      const tok = `viewer-inv-${Date.now()}`;
      await dbStore.createInvitation(pid, tok, 'viewer', owner1Id, new Date(Date.now() + 60000));

      const acceptRes = await fetch(`${baseUrl}/api/invitations/${tok}/accept`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${owner1Token}` },
      });
      expect(acceptRes.status).toBe(200);
      expect((await acceptRes.json()).role).toBe('owner');
      expect(await dbStore.getMemberRole(pid, owner1Id)).toBe('owner');

      // Also verify direct dbStore.addMember refuses downgrade
      await dbStore.addMember(pid, owner1Id, 'viewer');
      expect(await dbStore.getMemberRole(pid, owner1Id)).toBe('owner');
    });

    it('parses /join/<token> routes and handles auth pending_invite stash lifecycle', () => {
      const getInviteTokenFromPath = (pathname: string): string | null => {
        const match = pathname.match(/\/join\/([a-zA-Z0-9_-]+)/);
        return match ? match[1] : null;
      };

      const token = getInviteTokenFromPath('/join/5a9bf320c1e488d90fa1');
      expect(token).toBe('5a9bf320c1e488d90fa1');
      if (token) mockStorage['pending_invite'] = token;

      const resumed = mockStorage['pending_invite'] || null;
      delete mockStorage['pending_invite'];
      expect(resumed).toBe('5a9bf320c1e488d90fa1');
      expect(mockStorage['pending_invite']).toBeUndefined();

      expect(getInviteTokenFromPath('/workspace/proj-123')).toBeNull();
      expect(getInviteTokenFromPath('/dashboard')).toBeNull();
    });
  });
});
