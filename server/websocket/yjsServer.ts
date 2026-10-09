import { WebSocketServer, WebSocket } from 'ws';
import type { IncomingMessage } from 'http';
import * as Y from 'yjs';
import * as syncProtocol from 'y-protocols/sync';
import * as awarenessProtocol from 'y-protocols/awareness';
import * as encoding from 'lib0/encoding';
import * as decoding from 'lib0/decoding';
import jwt from 'jsonwebtoken';
import { config } from '../config';
import { dbStore } from '../dbStore';

const messageSync = 0;
const messageAwareness = 1;

export interface ClientConnection {
  ws: WebSocket;
  userId: string;
  userName: string;
  role: 'owner' | 'editor' | 'viewer';
  roomName: string;
  projectId: string;
  fileId: string;
}

export interface Room {
  name: string;
  projectId: string;
  fileId: string;
  doc: Y.Doc;
  awareness: awarenessProtocol.Awareness;
  clients: Set<ClientConnection>;
  awarenessHandler: (...args: any[]) => void;
  docUpdateHandler: (...args: any[]) => void;
  snapshotTimeout: NodeJS.Timeout | null;
}

export class YjsWebSocketServer {
  private wss: WebSocketServer;
  private rooms = new Map<string, Room>();

  constructor(server: any) {
    this.wss = new WebSocketServer({ noServer: true });
    this.init();
  }

  public getWss(): WebSocketServer {
    return this.wss;
  }

  private init() {
    this.wss.on('connection', (ws: WebSocket, req: IncomingMessage, clientInfo: any) => {
      this.handleConnection(ws, req, clientInfo);
    });
  }

  public async authenticateAndUpgrade(
    req: IncomingMessage,
    socket: any,
    head: Buffer
  ): Promise<void> {
    try {
      const url = new URL(req.url || '', `http://${req.headers.host || 'localhost'}`);
      const token = url.searchParams.get('token') || '';
      const roomName = url.pathname.replace(/^\/ws\/?/, '') || url.searchParams.get('room') || '';

      // Parse roomName format: obsidian-project-<projectId>-file-<fileId>
      const match = roomName.match(/^obsidian-project-([^-]+)-file-(.+)$/);
      if (!match) {
        socket.write('HTTP/1.1 400 Bad Request\r\n\r\n');
        socket.destroy();
        return;
      }

      const projectId = match[1];
      const fileId = match[2];

      if (!token) {
        socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
        socket.destroy();
        return;
      }

      let userId: string;
      let userName: string;
      try {
        const decoded = jwt.verify(token, config.JWT_SECRET) as any;
        userId = decoded.userId;
        userName = decoded.name || 'Collaborator';
      } catch {
        socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
        socket.destroy();
        return;
      }

      let role: 'owner' | 'editor' | 'viewer' = 'viewer';
      const memberRole = await dbStore.getMemberRole(projectId, userId);
      if (memberRole) {
        role = memberRole;
      } else {
        const project = await dbStore.findProjectById(projectId);
        if (project?.isPublic) {
          role = 'viewer';
        } else {
          socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
          socket.destroy();
          return;
        }
      }

      this.wss.handleUpgrade(req, socket, head, (ws) => {
        this.wss.emit('connection', ws, req, {
          userId,
          userName,
          role,
          roomName,
          projectId,
          fileId,
        });
      });
    } catch (err) {
      socket.write('HTTP/1.1 500 Internal Server Error\r\n\r\n');
      socket.destroy();
    }
  }

  private async getOrCreateRoom(roomName: string, projectId: string, fileId: string): Promise<Room> {
    let room = this.rooms.get(roomName);
    if (!room) {
      const doc = new Y.Doc();

      // S8: Hydrate room doc from latest persistent snapshot
      try {
        const snap = await dbStore.getDocSnapshot(projectId, fileId);
        if (snap && snap.length > 0) {
          Y.applyUpdate(doc, new Uint8Array(snap));
        }
      } catch (err) {
        console.warn('Could not hydrate doc snapshot:', err);
      }

      const awareness = new awarenessProtocol.Awareness(doc);
      awareness.setLocalState(null);

      const clients = new Set<ClientConnection>();

      const awarenessHandler = ({ added, updated, removed }: any, origin: any) => {
        const changedClients = added.concat(updated, removed);
        const encoder = encoding.createEncoder();
        encoding.writeVarUint(encoder, messageAwareness);
        encoding.writeVarUint8Array(
          encoder,
          awarenessProtocol.encodeAwarenessUpdate(awareness, changedClients)
        );
        const message = encoding.toUint8Array(encoder);

        for (const client of room!.clients) {
          if (client.ws !== origin && client.ws.readyState === WebSocket.OPEN) {
            client.ws.send(message);
          }
        }
      };

      awareness.on('update', awarenessHandler);

      let snapshotTimeout: NodeJS.Timeout | null = null;
      const docUpdateHandler = () => {
        if (snapshotTimeout) clearTimeout(snapshotTimeout);
        snapshotTimeout = setTimeout(async () => {
          try {
            const state = Buffer.from(Y.encodeStateAsUpdate(doc));
            await dbStore.saveDocSnapshot(projectId, fileId, state);
          } catch (err) {
            console.error('Failed to save debounced snapshot:', err);
          }
        }, 5000);
      };

      doc.on('update', docUpdateHandler);

      room = {
        name: roomName,
        projectId,
        fileId,
        doc,
        awareness,
        clients,
        awarenessHandler,
        docUpdateHandler,
        snapshotTimeout,
      };

      this.rooms.set(roomName, room);
    }
    return room;
  }

  private async handleConnection(ws: WebSocket, req: IncomingMessage, clientInfo: any) {
    const { userId, userName, role, roomName, projectId, fileId } = clientInfo;
    const room = await this.getOrCreateRoom(roomName, projectId, fileId);

    const client: ClientConnection = {
      ws,
      userId,
      userName,
      role,
      roomName,
      projectId,
      fileId,
    };
    room.clients.add(client);

    // 1. Send sync step 1
    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, messageSync);
    syncProtocol.writeSyncStep1(encoder, room.doc);
    ws.send(encoding.toUint8Array(encoder));

    // 2. Send current awareness states
    const awarenessStates = room.awareness.getStates();
    if (awarenessStates.size > 0) {
      const awarenessEncoder = encoding.createEncoder();
      encoding.writeVarUint(awarenessEncoder, messageAwareness);
      encoding.writeVarUint8Array(
        awarenessEncoder,
        awarenessProtocol.encodeAwarenessUpdate(
          room.awareness,
          Array.from(awarenessStates.keys())
        )
      );
      ws.send(encoding.toUint8Array(awarenessEncoder));
    }

    // 3. Handle incoming binary messages
    ws.on('message', (data: Buffer | ArrayBuffer) => {
      try {
        const buf = data instanceof Buffer ? new Uint8Array(data.buffer, data.byteOffset, data.byteLength) : new Uint8Array(data);
        const decoder = decoding.createDecoder(buf);
        const messageType = decoding.readVarUint(decoder);

        if (messageType === messageSync) {
          // Check sync subtype
          const syncSubtype = decoding.peekVarUint(decoder);
          
          // CRITICAL SECURITY ENFORCEMENT:
          // Viewer users are NOT permitted to send document updates (syncSubtype 2 or syncStep2 writing updates)
          if (client.role === 'viewer' && (syncSubtype === 2 || syncSubtype === 1)) {
            console.warn(`[Security] Dropped unauthorized Yjs update from Viewer (userId: ${client.userId}, room: ${roomName})`);
            return;
          }

          const responseEncoder = encoding.createEncoder();
          encoding.writeVarUint(responseEncoder, messageSync);

          // Apply and read sync
          syncProtocol.readSyncMessage(decoder, responseEncoder, room.doc, client.ws);

          if (encoding.length(responseEncoder) > 1) {
            ws.send(encoding.toUint8Array(responseEncoder));
          }

          // Broadcast sync update to other room peers if an update was merged
          if (syncSubtype === 2) {
            for (const peer of room.clients) {
              if (peer.ws !== ws && peer.ws.readyState === WebSocket.OPEN) {
                peer.ws.send(buf);
              }
            }
          }
        } else if (messageType === messageAwareness) {
          // Awareness is permitted for all roles so Viewers can show their presence/cursor and follow others
          awarenessProtocol.applyAwarenessUpdate(
            room.awareness,
            decoding.readVarUint8Array(decoder),
            ws
          );
        }
      } catch (err) {
        console.error('Error handling WebSocket Yjs message:', err);
      }
    });

    ws.on('close', async () => {
      room.clients.delete(client);
      // S8: Clean up room lifecycle and flush snapshots when empty
      if (room.clients.size === 0) {
        if (room.snapshotTimeout) {
          clearTimeout(room.snapshotTimeout);
          room.snapshotTimeout = null;
        }
        try {
          const state = Buffer.from(Y.encodeStateAsUpdate(room.doc));
          await dbStore.saveDocSnapshot(room.projectId, room.fileId, state);
        } catch (err) {
          console.error('Failed to save final snapshot on room close:', err);
        }

        room.awareness.off('update', room.awarenessHandler);
        room.doc.off('update', room.docUpdateHandler);
        room.awareness.destroy();
        room.doc.destroy();
        this.rooms.delete(roomName);
      }
    });
  }
}
