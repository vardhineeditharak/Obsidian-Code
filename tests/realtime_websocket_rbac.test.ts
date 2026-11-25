import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import express from 'express';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { WebSocket } from 'ws';
import * as Y from 'yjs';
import * as syncProtocol from 'y-protocols/sync';
import * as awarenessProtocol from 'y-protocols/awareness';
import * as encoding from 'lib0/encoding';
import * as decoding from 'lib0/decoding';
import jwt from 'jsonwebtoken';
import { dbStore } from '../server/dbStore';
import { config } from '../server/config';
import { projectRoutes } from '../server/routes/projectRoutes';
import { fileRoutes } from '../server/routes/fileRoutes';
import { YjsWebSocketServer } from '../server/websocket/yjsServer';

function expectUpgradeRejected(url: string, expectedStatus: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    let settled = false;
    const finish = (err?: Error) => {
      if (settled) return;
      settled = true;
      ws.terminate();
      if (err) reject(err);
      else resolve();
    };

    ws.on('open', () => finish(new Error(`Expected rejection ${expectedStatus}, but WebSocket opened`)));
    ws.on('unexpected-response', (_req, res) => {
      try {
        expect(res.statusCode).toBe(expectedStatus);
        finish();
      } catch (e) {
        finish(e as Error);
      }
    });
    ws.on('error', () => finish());
    ws.on('close', () => finish());
  });
}

function waitForOpen(ws: WebSocket): Promise<void> {
  return new Promise((resolve, reject) => {
    if (ws.readyState === WebSocket.OPEN) return resolve();
    ws.once('open', () => resolve());
    ws.once('error', reject);
  });
}

function waitForFirstMessage(ws: WebSocket): Promise<void> {
  return new Promise((resolve, reject) => {
    ws.once('message', () => resolve());
    ws.once('error', reject);
  });
}

function waitForCondition(predicate: () => boolean, timeoutMs = 2000): Promise<void> {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const check = () => {
      if (predicate()) return resolve();
      if (Date.now() - start >= timeoutMs) {
        return reject(new Error('Timed out waiting for condition'));
      }
      setTimeout(check, 15);
    };
    check();
  });
}

describe('Real-Time Yjs WebSocket Sync, Live RBAC & Project Events', () => {
  let server: http.Server;
  let port: number;
  let yjsServer: YjsWebSocketServer;

  const ownerId = 'ws-owner-1';
  const collabId = 'ws-collab-1';
  const viewerId = 'ws-viewer-1';
  const outsiderId = 'ws-outsider-1';

  const makeToken = (userId: string, name: string) =>
    jwt.sign({ userId, email: `${userId}@ws.test`, name }, config.JWT_SECRET, {
      algorithm: 'HS256',
      expiresIn: '1h',
    });

  let ownerToken: string;
  let collabToken: string;
  let viewerToken: string;
  let outsiderToken: string;

  beforeAll(async () => {
    const app = express();
    app.use(express.json());
    app.use('/api/projects', projectRoutes);
    app.use('/api', fileRoutes);

    server = http.createServer(app);
    yjsServer = new YjsWebSocketServer(server);

    server.on('upgrade', (req, socket, head) => {
      void yjsServer.authenticateAndUpgrade(req, socket, head);
    });

    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => {
        port = (server.address() as AddressInfo).port;
        resolve();
      });
    });

    ownerToken = makeToken(ownerId, 'Owner');
    collabToken = makeToken(collabId, 'Collaborator');
    viewerToken = makeToken(viewerId, 'Viewer');
    outsiderToken = makeToken(outsiderId, 'Outsider');
  });

  afterAll(async () => {
    yjsServer.getWss().clients.forEach((c) => c.terminate());
    await new Promise<void>((resolve) => yjsServer.getWss().close(() => resolve()));
    server.closeAllConnections?.();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  describe('WebSocket Upgrade Auth & Public Project Read-Only Access', () => {
    it('rejects malformed rooms (400), path traversal fileIds (400), missing/bad JWT (401), and private non-members (403)', async () => {
      const privProj = await dbStore.createProject({
        name: 'Private WS Auth',
        ownerId,
        isPublic: false,
      });
      const pid = String(privProj._id);

      await expectUpgradeRejected(`ws://127.0.0.1:${port}/ws/invalid-room-format?token=${ownerToken}`, 400);
      await expectUpgradeRejected(
        `ws://127.0.0.1:${port}/ws/obsidian-project-${pid}-file-..%2Fsecret?token=${ownerToken}`,
        400
      );
      await expectUpgradeRejected(`ws://127.0.0.1:${port}/ws/obsidian-project-${pid}-file-main.ts`, 401);
      await expectUpgradeRejected(
        `ws://127.0.0.1:${port}/ws/obsidian-project-${pid}-file-main.ts?token=bad.jwt.token`,
        401
      );
      await expectUpgradeRejected(
        `ws://127.0.0.1:${port}/ws/obsidian-project-${pid}-file-main.ts?token=${outsiderToken}`,
        403
      );
    });

    it('allows non-member on public project as viewer while blocking their writes', async () => {
      const pubProj = await dbStore.createProject({
        name: 'Public WS Room',
        ownerId,
        isPublic: true,
      });
      const pid = String(pubProj._id);
      const roomName = `obsidian-project-${pid}-file-public.js`;

      const room = await yjsServer.getOrCreateRoomForTest(roomName, pid, 'public.js');
      room.doc.getText('content').insert(0, 'const pub = true;');

      const ws = new WebSocket(`ws://127.0.0.1:${port}/ws/${roomName}?token=${outsiderToken}`);
      const ready = waitForFirstMessage(ws);
      try {
        await Promise.all([waitForOpen(ws), ready]);

        // Attempt rogue update as public viewer
        const rogueDoc = new Y.Doc();
        rogueDoc.getText('content').insert(0, 'HACKED');
        const enc = encoding.createEncoder();
        encoding.writeVarUint(enc, 0);
        syncProtocol.writeUpdate(enc, Y.encodeStateAsUpdate(rogueDoc));
        ws.send(encoding.toUint8Array(enc));

        await new Promise((r) => setTimeout(r, 80));
        expect(room.doc.getText('content').toString()).toBe('const pub = true;');
      } finally {
        ws.close();
      }
    });
  });

  describe('Viewer Sync Handshake & Protocol-Level Write Blocking', () => {
    it('delivers initial document state to viewer and drops both SyncStep2 (subtype 1) and Update (subtype 2)', async () => {
      const proj = await dbStore.createProject({
        name: 'Viewer Write Block Project',
        ownerId,
        isPublic: false,
      });
      const pid = String(proj._id);
      await dbStore.addMember(pid, viewerId, 'viewer');

      const fileId = 'main.ts';
      const roomName = `obsidian-project-${pid}-file-${fileId}`;
      const serverRoom = await yjsServer.getOrCreateRoomForTest(roomName, pid, fileId);
      serverRoom.doc.getText('content').insert(0, 'const greeting = "Hello Obsidian";');

      const viewerDoc = new Y.Doc();
      const ws = new WebSocket(`ws://127.0.0.1:${port}/ws/${roomName}?token=${viewerToken}`);

      const syncCompleted = new Promise<void>((resolve) => {
        ws.on('message', (data: Buffer) => {
          const buf = new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
          const decoder = decoding.createDecoder(buf);
          const messageType = decoding.readVarUint(decoder);
          if (messageType === 0) {
            const responseEncoder = encoding.createEncoder();
            encoding.writeVarUint(responseEncoder, 0);
            syncProtocol.readSyncMessage(decoder, responseEncoder, viewerDoc, ws);
            if (encoding.length(responseEncoder) > 1) {
              ws.send(encoding.toUint8Array(responseEncoder));
            }
            if (viewerDoc.getText('content').toString() === 'const greeting = "Hello Obsidian";') {
              resolve();
            }
          }
        });
      });

      try {
        await waitForOpen(ws);

        const step1 = encoding.createEncoder();
        encoding.writeVarUint(step1, 0);
        syncProtocol.writeSyncStep1(step1, viewerDoc);
        ws.send(encoding.toUint8Array(step1));

        await syncCompleted;

        expect(viewerDoc.getText('content').toString()).toBe('const greeting = "Hello Obsidian";');

        // Attempt SyncStep2 (subtype 1) write
        const rogueDoc = new Y.Doc();
        rogueDoc.getText('content').insert(0, 'MALICIOUS_STEP2');
        const step2Enc = encoding.createEncoder();
        encoding.writeVarUint(step2Enc, 0);
        syncProtocol.writeSyncStep2(step2Enc, rogueDoc);
        ws.send(encoding.toUint8Array(step2Enc));

        // Attempt Update (subtype 2) write
        const updateEnc = encoding.createEncoder();
        encoding.writeVarUint(updateEnc, 0);
        syncProtocol.writeUpdate(updateEnc, Y.encodeStateAsUpdate(rogueDoc));
        ws.send(encoding.toUint8Array(updateEnc));

        await new Promise((r) => setTimeout(r, 100));
        expect(serverRoom.doc.getText('content').toString()).toBe('const greeting = "Hello Obsidian";');
      } finally {
        ws.close();
      }
    });
  });

  describe('Live Role Promotion/Demotion, Project Events & Snapshot Close Persistence', () => {
    it('broadcasts file:created, file:updated, file:deleted, member:role-updated, enforces live promotion/demotion, and disconnects removed member with 4003', async () => {
      const proj = await dbStore.createProject('Realtime Events Project', ownerId);
      const pid = String(proj._id);
      await dbStore.addMember(pid, collabId, 'viewer');

      const receivedEvents: any[] = [];
      const eventWs = new WebSocket(
        `ws://127.0.0.1:${port}/ws/obsidian-project-events-${pid}?token=${collabToken}`
      );
      eventWs.on('message', (data) => {
        receivedEvents.push(JSON.parse(String(data)));
      });

      const fileRoomName = `obsidian-project-${pid}-file-live-file`;
      const yjsWs = new WebSocket(`ws://127.0.0.1:${port}/ws/${fileRoomName}?token=${collabToken}`);
      const observerWs = new WebSocket(`ws://127.0.0.1:${port}/ws/${fileRoomName}?token=${ownerToken}`);

      // Wait for initial SyncStep1 on both file sockets so handleConnection listeners are guaranteed attached
      const yjsReady = waitForFirstMessage(yjsWs);
      const observerReady = waitForFirstMessage(observerWs);

      try {
        await Promise.all([
          waitForOpen(eventWs),
          waitForOpen(yjsWs),
          waitForOpen(observerWs),
          yjsReady,
          observerReady,
        ]);

        await waitForCondition(() => receivedEvents.some((e) => e.type === 'connected'));
        const connectedMsg = receivedEvents.find((e) => e.type === 'connected');
        expect(connectedMsg).toEqual({ type: 'connected', projectId: pid, role: 'viewer' });

        const serverRoom = await yjsServer.getOrCreateRoomForTest(fileRoomName, pid, 'live-file');

        // Also verify awareness update broadcast to observerWs
        const awarenessReceived = new Promise<boolean>((resolve) => {
          observerWs.on('message', (raw: Buffer) => {
            const buf = new Uint8Array(raw.buffer, raw.byteOffset, raw.byteLength);
            const dec = decoding.createDecoder(buf);
            const mType = decoding.readVarUint(dec);
            if (mType === 1) {
              resolve(true);
            }
          });
        });

        const clientDoc = new Y.Doc();
        const clientAwareness = new awarenessProtocol.Awareness(clientDoc);
        clientAwareness.setLocalStateField('user', { id: collabId, name: 'Collaborator' });
        const awEnc = encoding.createEncoder();
        encoding.writeVarUint(awEnc, 1);
        encoding.writeVarUint8Array(
          awEnc,
          awarenessProtocol.encodeAwarenessUpdate(clientAwareness, [clientDoc.clientID])
        );
        yjsWs.send(encoding.toUint8Array(awEnc));
        expect(await awarenessReceived).toBe(true);
        clientAwareness.destroy();
        clientDoc.destroy();

        // 1. Blocked while viewer
        const docBlocked = new Y.Doc();
        docBlocked.getText('content').insert(0, 'blocked-as-viewer');
        const encBlocked = encoding.createEncoder();
        encoding.writeVarUint(encBlocked, 0);
        syncProtocol.writeUpdate(encBlocked, Y.encodeStateAsUpdate(docBlocked));
        yjsWs.send(encoding.toUint8Array(encBlocked));
        await new Promise((r) => setTimeout(r, 80));
        expect(serverRoom.doc.getText('content').toString()).toBe('');

        // 2. REST file create, rename, delete events
        const createRes = await fetch(`http://127.0.0.1:${port}/api/projects/${pid}/files`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ownerToken}` },
          body: JSON.stringify({ name: 'alpha.py', isFolder: false, content: 'print(1)' }),
        });
        expect(createRes.status).toBe(201);
        const createdFile = (await createRes.json()) as any;

        const renameRes = await fetch(`http://127.0.0.1:${port}/api/files/${createdFile._id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ownerToken}` },
          body: JSON.stringify({ name: 'beta.py' }),
        });
        expect(renameRes.status).toBe(200);

        const delRes = await fetch(`http://127.0.0.1:${port}/api/files/${createdFile._id}`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${ownerToken}` },
        });
        expect(delRes.status).toBe(200);

        // 2b. Project rename -> broadcasts project:updated, folder rename/delete -> broadcasts descendant events
        const projUpdateRes = await fetch(`http://127.0.0.1:${port}/api/projects/${pid}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ownerToken}` },
          body: JSON.stringify({ name: 'Realtime Events Renamed' }),
        });
        expect(projUpdateRes.status).toBe(200);

        const folderRes = await fetch(`http://127.0.0.1:${port}/api/projects/${pid}/files`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ownerToken}` },
          body: JSON.stringify({ name: 'lib', isFolder: true }),
        });
        const libFolder = (await folderRes.json()) as any;
        const childRes = await fetch(`http://127.0.0.1:${port}/api/projects/${pid}/files`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ownerToken}` },
          body: JSON.stringify({ name: 'math.ts', isFolder: false, parentId: libFolder._id }),
        });
        const childFile = (await childRes.json()) as any;

        await fetch(`http://127.0.0.1:${port}/api/files/${libFolder._id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ownerToken}` },
          body: JSON.stringify({ name: 'core' }),
        });
        await fetch(`http://127.0.0.1:${port}/api/files/${libFolder._id}`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${ownerToken}` },
        });

        // 3. Promote viewer -> editor on live room
        const promoteRes = await fetch(`http://127.0.0.1:${port}/api/projects/${pid}/members/${collabId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ownerToken}` },
          body: JSON.stringify({ role: 'editor' }),
        });
        expect(promoteRes.status).toBe(200);

        await waitForCondition(
          () =>
            receivedEvents.some((e) => e.type === 'file:created' && e.file.name === 'alpha.py') &&
            receivedEvents.some((e) => e.type === 'file:updated' && e.file.name === 'beta.py') &&
            receivedEvents.some((e) => e.type === 'file:deleted' && e.fileId === createdFile._id) &&
            receivedEvents.some(
              (e) => e.type === 'project:updated' && e.project.name === 'Realtime Events Renamed'
            ) &&
            receivedEvents.some(
              (e) => e.type === 'file:updated' && e.file._id === childFile._id && e.file.path === 'core/math.ts'
            ) &&
            receivedEvents.some((e) => e.type === 'file:deleted' && e.fileId === childFile._id) &&
            receivedEvents.some(
              (e) => e.type === 'member:role-updated' && e.userId === collabId && e.role === 'editor'
            )
        );

        // Write now succeeds on existing socket without reconnecting
        const docAllowed = new Y.Doc();
        docAllowed.getText('content').insert(0, 'allowed-after-promotion');
        const encAllowed = encoding.createEncoder();
        encoding.writeVarUint(encAllowed, 0);
        syncProtocol.writeUpdate(encAllowed, Y.encodeStateAsUpdate(docAllowed));
        yjsWs.send(encoding.toUint8Array(encAllowed));
        await waitForCondition(
          () => serverRoom.doc.getText('content').toString() === 'allowed-after-promotion'
        );

        // 4. Demote editor -> viewer on live room
        const demoteRes = await fetch(`http://127.0.0.1:${port}/api/projects/${pid}/members/${collabId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ownerToken}` },
          body: JSON.stringify({ role: 'viewer' }),
        });
        expect(demoteRes.status).toBe(200);
        await waitForCondition(() =>
          receivedEvents.some(
            (e) => e.type === 'member:role-updated' && e.userId === collabId && e.role === 'viewer'
          )
        );

        const docDemoted = new Y.Doc();
        docDemoted.getText('content').insert(0, 'blocked-after-demotion');
        const encDemoted = encoding.createEncoder();
        encoding.writeVarUint(encDemoted, 0);
        syncProtocol.writeUpdate(encDemoted, Y.encodeStateAsUpdate(docDemoted));
        yjsWs.send(encoding.toUint8Array(encDemoted));
        await new Promise((r) => setTimeout(r, 80));
        expect(serverRoom.doc.getText('content').toString()).toBe('allowed-after-promotion');

        // 5. Remove member -> broadcasts member:removed and closes both sockets with 4003
        const yjsClosePromise = new Promise<{ code: number; reason: string }>((resolve) => {
          yjsWs.once('close', (code, reason) => resolve({ code, reason: reason.toString() }));
        });
        const eventClosePromise = new Promise<{ code: number; reason: string }>((resolve) => {
          eventWs.once('close', (code, reason) => resolve({ code, reason: reason.toString() }));
        });

        const removeRes = await fetch(`http://127.0.0.1:${port}/api/projects/${pid}/members/${collabId}`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${ownerToken}` },
        });
        expect(removeRes.status).toBe(200);

        const [yjsClosed, eventClosed] = await Promise.all([yjsClosePromise, eventClosePromise]);
        expect(yjsClosed.code).toBe(4003);
        expect(yjsClosed.reason).toBe('Removed from project');
        expect(eventClosed.code).toBe(4003);
        expect(receivedEvents.some((e) => e.type === 'member:removed' && e.userId === collabId)).toBe(
          true
        );

        // 6. Close remaining owner socket -> room saves snapshot and cleans up
        const observerClosed = new Promise<void>((resolve) => observerWs.once('close', () => resolve()));
        observerWs.close();
        await observerClosed;

        await waitForCondition(() => yjsServer.getRoom(fileRoomName) === undefined);
        const finalSnap = await dbStore.getDocSnapshot(pid, 'live-file');
        expect(finalSnap).not.toBeNull();
        const hydrated = new Y.Doc();
        Y.applyUpdate(hydrated, new Uint8Array(finalSnap!));
        expect(hydrated.getText('content').toString()).toBe('allowed-after-promotion');
      } finally {
        eventWs.close();
        yjsWs.close();
        observerWs.close();
      }
    });
  });
});
