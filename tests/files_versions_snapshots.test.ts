import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import express from 'express';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import jwt from 'jsonwebtoken';
import * as Y from 'yjs';
import { dbStore } from '../server/dbStore';
import { config } from '../server/config';
import { fileRoutes } from '../server/routes/fileRoutes';
import { versionRoutes } from '../server/routes/versionRoutes';
import { YjsWebSocketServer } from '../server/websocket/yjsServer';

describe('Files Validation, Folder Cascades, Versions & Snapshot Flushing', () => {
  let server: http.Server;
  let baseUrl: string;
  let yjsServer: YjsWebSocketServer;

  const ownerId = 'fv-owner-1';
  const editorId = 'fv-editor-1';
  const viewerId = 'fv-viewer-1';
  const nonMemberId = 'fv-nonmember-1';

  const makeToken = (userId: string, name: string) =>
    jwt.sign({ userId, email: `${userId}@fv.test`, name }, config.JWT_SECRET, {
      algorithm: 'HS256',
      expiresIn: '1h',
    });

  let ownerToken: string;
  let editorToken: string;
  let viewerToken: string;
  let nonMemberToken: string;

  beforeAll(async () => {
    const app = express();
    app.use(express.json());
    app.use('/api', fileRoutes);
    app.use('/api', versionRoutes);

    server = http.createServer(app);
    yjsServer = new YjsWebSocketServer(server);

    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => {
        const port = (server.address() as AddressInfo).port;
        baseUrl = `http://127.0.0.1:${port}`;
        resolve();
      });
    });

    ownerToken = makeToken(ownerId, 'Owner');
    editorToken = makeToken(editorId, 'Editor');
    viewerToken = makeToken(viewerId, 'Viewer');
    nonMemberToken = makeToken(nonMemberId, 'Outsider');
  });

  afterAll(async () => {
    yjsServer.getWss().clients.forEach((c) => c.terminate());
    await new Promise<void>((resolve) => yjsServer.getWss().close(() => resolve()));
    server.closeAllConnections?.();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  describe('File Validation, RBAC & Folder Rename/Delete Cascades', () => {
    it('rejects path traversal/separators, invalid cross-project parentId, and duplicate file paths', async () => {
      const projA = await dbStore.createProject('File Validation Proj A', ownerId);
      const projB = await dbStore.createProject('File Validation Proj B', ownerId);
      const pidA = String(projA._id);
      const pidB = String(projB._id);

      const invalidNames = ['../escape.js', 'dir/file.js', 'dir\\file.js', '..', '.', ''];
      for (const badName of invalidNames) {
        const res = await fetch(`${baseUrl}/api/projects/${pidA}/files`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ownerToken}` },
          body: JSON.stringify({ name: badName, isFolder: false }),
        });
        expect(res.status).toBe(400);
      }

      // Parent folder from another project rejected
      const folderInB = await dbStore.createFile({
        projectId: pidB,
        name: 'src',
        path: 'src',
        isFolder: true,
      });
      const crossParentRes = await fetch(`${baseUrl}/api/projects/${pidA}/files`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ownerToken}` },
        body: JSON.stringify({ name: 'index.ts', isFolder: false, parentId: String(folderInB._id) }),
      });
      expect(crossParentRes.status).toBe(400);

      // Non-folder parentId rejected
      const nonFolder = await dbStore.createFile({
        projectId: pidA,
        name: 'readme.md',
        path: 'readme.md',
        isFolder: false,
      });
      const nonFolderParentRes = await fetch(`${baseUrl}/api/projects/${pidA}/files`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ownerToken}` },
        body: JSON.stringify({ name: 'child.js', isFolder: false, parentId: String(nonFolder._id) }),
      });
      expect(nonFolderParentRes.status).toBe(400);

      // Duplicate path rejected with 409
      const dupRes = await fetch(`${baseUrl}/api/projects/${pidA}/files`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ownerToken}` },
        body: JSON.stringify({ name: 'readme.md', isFolder: false }),
      });
      expect(dupRes.status).toBe(409);
    });

    it('cascades folder renames and deletes across multi-level nested files and snapshots', async () => {
      const proj = await dbStore.createProject('Cascade Folder Project', ownerId);
      const pid = String(proj._id);

      const rootFolderRes = await fetch(`${baseUrl}/api/projects/${pid}/files`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ownerToken}` },
        body: JSON.stringify({ name: 'src', isFolder: true }),
      });
      expect(rootFolderRes.status).toBe(201);
      const rootFolder = (await rootFolderRes.json()) as any;

      const subFolderRes = await fetch(`${baseUrl}/api/projects/${pid}/files`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ownerToken}` },
        body: JSON.stringify({ name: 'utils', isFolder: true, parentId: rootFolder._id }),
      });
      expect(subFolderRes.status).toBe(201);
      const subFolder = (await subFolderRes.json()) as any;
      expect(subFolder.path).toBe('src/utils');

      const leafRes = await fetch(`${baseUrl}/api/projects/${pid}/files`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ownerToken}` },
        body: JSON.stringify({
          name: 'helpers.txt',
          isFolder: false,
          parentId: subFolder._id,
          content: 'export const x = 1;',
        }),
      });
      expect(leafRes.status).toBe(201);
      const leaf = (await leafRes.json()) as any;
      expect(leaf.path).toBe('src/utils/helpers.txt');
      expect(leaf.language).toBe('plaintext');

      // Save snapshot for nested file to verify delete cleanup
      await dbStore.saveDocSnapshot(pid, leaf._id, Buffer.from([9, 8, 7]));

      // Rename leaf file -> updates language automatically
      const renameLeafRes = await fetch(`${baseUrl}/api/files/${leaf._id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ownerToken}` },
        body: JSON.stringify({ name: 'helpers.ts' }),
      });
      expect(renameLeafRes.status).toBe(200);
      const renamedLeaf = (await renameLeafRes.json()) as any;
      expect(renamedLeaf.path).toBe('src/utils/helpers.ts');
      expect(renamedLeaf.language).toBe('typescript');

      // Rename root folder -> cascades paths to subFolder and leaf
      const renameFolderRes = await fetch(`${baseUrl}/api/files/${rootFolder._id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ownerToken}` },
        body: JSON.stringify({ name: 'app' }),
      });
      expect(renameFolderRes.status).toBe(200);

      expect((await dbStore.getFileById(subFolder._id))?.path).toBe('app/utils');
      expect((await dbStore.getFileById(leaf._id))?.path).toBe('app/utils/helpers.ts');

      // Delete root folder -> cascades delete to all descendants and snapshots
      const delRes = await fetch(`${baseUrl}/api/files/${rootFolder._id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${ownerToken}` },
      });
      expect(delRes.status).toBe(200);
      expect(await dbStore.getFileById(rootFolder._id)).toBeNull();
      expect(await dbStore.getFileById(subFolder._id)).toBeNull();
      expect(await dbStore.getFileById(leaf._id)).toBeNull();
      expect(await dbStore.getDocSnapshot(pid, leaf._id)).toBeNull();
    });

    it('enforces file/version RBAC and prevents IDOR across viewer, editor, owner, and outsider', async () => {
      const proj = await dbStore.createProject('RBAC Mutations Proj', ownerId);
      const pid = String(proj._id);
      await dbStore.addMember(pid, editorId, 'editor');
      await dbStore.addMember(pid, viewerId, 'viewer');

      const file = await dbStore.createFile({
        projectId: pid,
        name: 'test.ts',
        path: 'test.ts',
        isFolder: false,
        content: 'console.log("initial");',
      });
      const fid = String(file._id);

      // Cross-project file to test IDOR protection during version restore
      const otherProj = await dbStore.createProject('Other Project', nonMemberId);
      const foreignFile = await dbStore.createFile({
        projectId: String(otherProj._id),
        name: 'secret.ts',
        path: 'secret.ts',
        isFolder: false,
        content: 'DO NOT OVERWRITE',
      });

      const version = await dbStore.createVersion(
        pid,
        'v1.0',
        'initial snapshot',
        { userId: ownerId, name: 'Owner' },
        [
          { fileId: fid, fileName: 'test.ts', content: 'console.log("restored");' },
          { fileId: String(foreignFile._id), fileName: 'secret.ts', content: 'TAMPERED' },
        ]
      );
      const vid = String(version._id);

      // Viewer denied create, patch, delete, version create, and version restore
      expect(
        (
          await fetch(`${baseUrl}/api/projects/${pid}/files`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${viewerToken}` },
            body: JSON.stringify({ name: 'bad.ts', isFolder: false }),
          })
        ).status
      ).toBe(403);

      expect(
        (
          await fetch(`${baseUrl}/api/files/${fid}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${viewerToken}` },
            body: JSON.stringify({ content: 'hack' }),
          })
        ).status
      ).toBe(403);

      expect(
        (
          await fetch(`${baseUrl}/api/files/${fid}`, {
            method: 'DELETE',
            headers: { Authorization: `Bearer ${viewerToken}` },
          })
        ).status
      ).toBe(403);

      expect(
        (
          await fetch(`${baseUrl}/api/versions/${vid}/restore`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${viewerToken}` },
          })
        ).status
      ).toBe(403);

      // Non-member denied
      expect(
        (
          await fetch(`${baseUrl}/api/versions/${vid}/restore`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${nonMemberToken}` },
          })
        ).status
      ).toBe(403);

      // Editor allowed to patch
      const editorPatch = await fetch(`${baseUrl}/api/files/${fid}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${editorToken}` },
        body: JSON.stringify({ content: 'editor modified' }),
      });
      expect(editorPatch.status).toBe(200);

      // Owner restore updates project file ONLY and leaves foreign project file untouched
      const restoreRes = await fetch(`${baseUrl}/api/versions/${vid}/restore`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${ownerToken}` },
      });
      expect(restoreRes.status).toBe(200);
      expect((await dbStore.getFileById(fid))?.content).toBe('console.log("restored");');
      expect((await dbStore.getFileById(String(foreignFile._id)))?.content).toBe('DO NOT OVERWRITE');
    });
  });

  describe('Version Checkpoints, Pruning & Snapshot Flushing', () => {
    it('flushes Yjs room state to dbStore and hydrates into a fresh Y.Doc', async () => {
      const proj = await dbStore.createProject('Snapshot Flush Proj', ownerId);
      const pid = String(proj._id);
      const roomName = `obsidian-project-${pid}-file-main.ts`;

      const room = await yjsServer.getOrCreateRoomForTest(roomName, pid, 'main.ts');
      room.doc.getText('content').insert(0, 'console.log("snapshot durability");');
      expect(room.snapshotTimeout).not.toBeNull();

      await yjsServer.flushRoomSnapshot(roomName);
      expect(room.snapshotTimeout).toBeNull();

      const savedSnapshot = await dbStore.getDocSnapshot(pid, 'main.ts');
      expect(savedSnapshot).not.toBeNull();
      expect(savedSnapshot!.length).toBeGreaterThan(0);

      const hydratedDoc = new Y.Doc();
      Y.applyUpdate(hydratedDoc, new Uint8Array(savedSnapshot!));
      expect(hydratedDoc.getText('content').toString()).toBe('console.log("snapshot durability");');
    });

    it('creates auto/manual checkpoints from explicit files or live project files and caps auto checkpoints at 50', async () => {
      const proj = await dbStore.createProject('Checkpoint Cap Proj', ownerId);
      const pid = String(proj._id);
      await dbStore.createFile({
        projectId: pid,
        name: 'app.ts',
        path: 'app.ts',
        isFolder: false,
        content: 'export const v = 1;',
      });

      // Omit files[] -> snapshots current non-folder project files
      const autoRes = await fetch(`${baseUrl}/api/projects/${pid}/versions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ownerToken}` },
        body: JSON.stringify({
          name: 'Auto-save checkpoint',
          type: 'auto',
          trigger: 'interval',
        }),
      });
      expect(autoRes.status).toBe(201);
      const createdAuto = (await autoRes.json()) as any;
      expect(createdAuto.type).toBe('auto');
      expect(createdAuto.trigger).toBe('interval');
      expect(createdAuto.files[0].content).toBe('export const v = 1;');

      // Test pruning cap at N=50 auto checkpoints while retaining all manual checkpoints
      const pruneProj = await dbStore.createProject('Pruning Cap Proj', ownerId);
      const prunePid = String(pruneProj._id);

      await dbStore.createVersion(prunePid, 'Manual V1', 'm1', { userId: ownerId, name: 'Owner' }, [], 'manual');
      await dbStore.createVersion(prunePid, 'Manual V2', 'm2', { userId: ownerId, name: 'Owner' }, [], 'manual');
      await dbStore.createVersion(prunePid, 'Manual V3', 'm3', { userId: ownerId, name: 'Owner' }, [], 'manual');

      for (let i = 1; i <= 55; i++) {
        await dbStore.createVersion(
          prunePid,
          `Auto V${i}`,
          `auto ${i}`,
          { userId: ownerId, name: 'Owner' },
          [],
          'auto',
          'interval'
        );
      }

      const listRes = await fetch(`${baseUrl}/api/projects/${prunePid}/versions`, {
        headers: { Authorization: `Bearer ${ownerToken}` },
      });
      expect(listRes.status).toBe(200);
      const allVersions = (await listRes.json()) as any[];
      const autoVersions = allVersions.filter((v) => v.type === 'auto');
      const manualVersions = allVersions.filter((v) => v.type === 'manual');

      expect(autoVersions.length).toBe(50);
      expect(manualVersions.length).toBe(3);

      const autoNames = autoVersions.map((v) => v.name);
      expect(autoNames).toContain('Auto V55');
      expect(autoNames).toContain('Auto V6');
      expect(autoNames).not.toContain('Auto V1');
      expect(autoNames).not.toContain('Auto V5');
    });
  });
});
