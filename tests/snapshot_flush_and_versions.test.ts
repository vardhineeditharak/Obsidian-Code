import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import express from 'express';
import http from 'http';
import jwt from 'jsonwebtoken';
import { AddressInfo } from 'net';
import * as Y from 'yjs';
import { dbStore } from '../server/dbStore';
import { config } from '../server/config';
import { versionRoutes } from '../server/routes/versionRoutes';
import { YjsWebSocketServer } from '../server/websocket/yjsServer';

describe('Server Snapshot Flush & Version Pruning (Step 6 & Step 7)', () => {
  let server: http.Server;
  let baseUrl: string;
  let yjsWsServer: YjsWebSocketServer;

  const ownerId = 'user-owner-snap';
  let projectId: string;
  let ownerToken: string;

  beforeAll(async () => {
    const app = express();
    app.use(express.json());
    app.use('/api', versionRoutes);

    await new Promise<void>((resolve) => {
      server = app.listen(0, () => {
        const port = (server.address() as AddressInfo).port;
        baseUrl = `http://127.0.0.1:${port}`;
        resolve();
      });
    });

    yjsWsServer = new YjsWebSocketServer(server);

    const project = await dbStore.createProject('Snapshot Test Project', ownerId);
    projectId = project._id.toString();

    ownerToken = jwt.sign(
      { userId: ownerId, email: 'owner@snap.test', name: 'Owner Snap' },
      config.JWT_SECRET,
      { expiresIn: '1h' }
    );
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it('periodic server-side Yjs snapshot flush saves doc state to dbStore', async () => {
    const roomName = `obsidian-project-${projectId}-file-main.ts`;
    const room = await yjsWsServer.getOrCreateRoomForTest(roomName, projectId, 'main.ts');

    // Mutate the room document
    const ytext = room.doc.getText('monaco');
    ytext.insert(0, 'console.log("snapshot durability test");');

    // Verify debounce timeout was scheduled
    expect(room.snapshotTimeout).not.toBeNull();

    // Flush snapshot explicitly
    await yjsWsServer.flushRoomSnapshot(roomName);

    // Verify snapshot was stored in dbStore
    const savedSnapshot = await dbStore.getDocSnapshot(projectId, 'main.ts');
    expect(savedSnapshot).not.toBeNull();
    expect(savedSnapshot!.length).toBeGreaterThan(0);

    // Hydrate another doc from snapshot to verify content matches
    const targetDoc = new Y.Doc();
    Y.applyUpdate(targetDoc, new Uint8Array(savedSnapshot!));
    expect(targetDoc.getText('monaco').toString()).toBe('console.log("snapshot durability test");');
  });

  it('version routes accept type: auto and trigger, storing them on the Version doc', async () => {
    const res = await fetch(`${baseUrl}/api/projects/${projectId}/versions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${ownerToken}`,
      },
      body: JSON.stringify({
        name: 'Auto-save checkpoint (12:00 PM)',
        note: 'Periodic interval checkpoint',
        type: 'auto',
        trigger: 'interval',
        files: [
          { fileId: 'file-1', fileName: 'main.ts', content: 'export const x = 42;' },
        ],
      }),
    });

    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.type).toBe('auto');
    expect(data.trigger).toBe('interval');
    expect(data.name).toBe('Auto-save checkpoint (12:00 PM)');
  });

  it('caps retained auto-checkpoints at N=50 while preserving all manual checkpoints', async () => {
    const pruneProj = await dbStore.createProject('Pruning Test Project', ownerId);
    const pruneProjId = pruneProj._id.toString();

    // Create 3 manual checkpoints
    await dbStore.createVersion(pruneProjId, 'Manual V1', 'note 1', { userId: ownerId, name: 'Owner' }, [], 'manual', 'manual');
    await dbStore.createVersion(pruneProjId, 'Manual V2', 'note 2', { userId: ownerId, name: 'Owner' }, [], 'manual', 'manual');
    await dbStore.createVersion(pruneProjId, 'Manual V3', 'note 3', { userId: ownerId, name: 'Owner' }, [], 'manual', 'manual');

    // Create 55 auto checkpoints
    for (let i = 1; i <= 55; i++) {
      await dbStore.createVersion(
        pruneProjId,
        `Auto V${i}`,
        `auto note ${i}`,
        { userId: ownerId, name: 'Owner' },
        [],
        'auto',
        'interval'
      );
    }

    const allVersions = await dbStore.getVersions(pruneProjId);
    const autoVersions = allVersions.filter((v: any) => v.type === 'auto');
    const manualVersions = allVersions.filter((v: any) => v.type === 'manual');

    // Auto versions must be pruned to exactly 50
    expect(autoVersions.length).toBe(50);

    // All 3 manual versions must still exist
    expect(manualVersions.length).toBe(3);

    // The oldest auto checkpoints (1 to 5) should have been pruned; the newest (6 to 55) should remain
    const autoNames = autoVersions.map((v: any) => v.name);
    expect(autoNames).toContain('Auto V55');
    expect(autoNames).toContain('Auto V6');
    expect(autoNames).not.toContain('Auto V1');
    expect(autoNames).not.toContain('Auto V2');
  });
});
