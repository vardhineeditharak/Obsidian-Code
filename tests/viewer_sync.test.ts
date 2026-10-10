import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import http from 'http';
import { AddressInfo } from 'net';
import { WebSocket } from 'ws';
import * as Y from 'yjs';
import * as syncProtocol from 'y-protocols/sync';
import * as encoding from 'lib0/encoding';
import * as decoding from 'lib0/decoding';
import jwt from 'jsonwebtoken';
import { dbStore } from '../server/dbStore';
import { config } from '../server/config';
import { YjsWebSocketServer } from '../server/websocket/yjsServer';

describe('Yjs Viewer Synchronization & RBAC Enforcement (BUG-6)', () => {
  let server: http.Server;
  let port: number;
  let yjsServer: YjsWebSocketServer;

  const ownerId = 'owner-crdt-1';
  const viewerId = 'viewer-crdt-1';
  let projectId: string;
  const fileId = 'main.ts';
  let viewerToken: string;
  let roomName: string;

  beforeAll(async () => {
    server = http.createServer();
    yjsServer = new YjsWebSocketServer(server);

    server.on('upgrade', (req, socket, head) => {
      yjsServer.authenticateAndUpgrade(req, socket, head);
    });

    await new Promise<void>((resolve) => {
      server.listen(0, () => {
        port = (server.address() as AddressInfo).port;
        resolve();
      });
    });

    // Create project and assign viewer role
    const project = await dbStore.createProject({
      name: 'CRDT Viewer Sync Test Project',
      ownerId,
      isPublic: false,
    });
    projectId = project._id.toString();
    roomName = `obsidian-project-${projectId}-file-${fileId}`;

    await dbStore.addMember(projectId, viewerId, 'viewer');

    viewerToken = jwt.sign(
      { userId: viewerId, email: 'viewer@crdttest.com', name: 'Viewer Tester' },
      config.JWT_SECRET,
      { expiresIn: '1h' }
    );
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
  });

  it('viewer role receives initial document content during handshake and cannot mutate server document', async () => {
    // 1. Pre-populate the room doc on the server
    const serverRoom = await (yjsServer as any).getOrCreateRoom(roomName, projectId, fileId);
    const initialText = serverRoom.doc.getText('content');
    initialText.insert(0, 'const greeting = "Hello Obsidian";');

    // 2. Connect as viewer
    const viewerDoc = new Y.Doc();
    const wsUrl = `ws://127.0.0.1:${port}/ws/${roomName}?token=${viewerToken}`;
    const ws = new WebSocket(wsUrl);

    await new Promise<void>((resolve, reject) => {
      ws.on('open', () => resolve());
      ws.on('error', reject);
    });

    // 3. Process handshake
    // When connected, server sends sync step 1. Viewer responds with sync step 2 and sync step 1.
    const syncCompleted = new Promise<void>((resolve) => {
      ws.on('message', (data: Buffer) => {
        const buf = new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
        const decoder = decoding.createDecoder(buf);
        const messageType = decoding.readVarUint(decoder);

        if (messageType === 0) { // messageSync
          const responseEncoder = encoding.createEncoder();
          encoding.writeVarUint(responseEncoder, 0); // messageSync
          syncProtocol.readSyncMessage(decoder, responseEncoder, viewerDoc, ws);

          if (encoding.length(responseEncoder) > 1) {
            ws.send(encoding.toUint8Array(responseEncoder));
          }

          if (viewerDoc.getText('content').toString() === 'const greeting = "Hello Obsidian";') {
            resolve();
          }
        }
      });

      // Send viewer's initial sync step 1 to request server state
      const initialStep1 = encoding.createEncoder();
      encoding.writeVarUint(initialStep1, 0); // messageSync
      syncProtocol.writeSyncStep1(initialStep1, viewerDoc);
      ws.send(encoding.toUint8Array(initialStep1));
    });

    await syncCompleted;

    // Verify viewer successfully loaded initial document state
    expect(viewerDoc.getText('content').toString()).toBe('const greeting = "Hello Obsidian";');

    // 4. Viewer attempts to send an unauthorized write (syncSubtype 2: update)
    const unauthorizedEncoder = encoding.createEncoder();
    encoding.writeVarUint(unauthorizedEncoder, 0); // messageSync
    encoding.writeVarUint(unauthorizedEncoder, 2); // messageSyncUpdate (syncSubtype 2)

    // Create a local rogue edit
    const rogueDoc = new Y.Doc();
    const rogueText = rogueDoc.getText('content');
    rogueText.insert(0, 'MALICIOUS_OVERWRITE');
    const rogueUpdate = Y.encodeStateAsUpdate(rogueDoc);
    encoding.writeVarUint8Array(unauthorizedEncoder, rogueUpdate);

    ws.send(encoding.toUint8Array(unauthorizedEncoder));

    // Allow time for server to receive and drop the message
    await new Promise((r) => setTimeout(r, 100));

    // Verify the server doc was NOT modified
    expect(serverRoom.doc.getText('content').toString()).toBe('const greeting = "Hello Obsidian";');

    ws.close();
  });
});
