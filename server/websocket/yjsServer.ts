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
      const roomName = url.pathname.replace(/^\/ws\/?/, '') || url.searchParams.get('room') || 'default';

      // Parse roomName format: obsidian-project-<projectId>-file-<fileId>
      const match = roomName.match(/obsidian-project-([^-]+)-file-(.+)/);
      const projectId = match ? match[1] : '';
      const fileId = match ? match[2] : '';

      let userId = 'anonymous';
      let userName = 'Anonymous User';
      let role: 'owner' | 'editor' | 'viewer' = 'viewer';

      if (token) {
        try {
          const decoded = jwt.verify(token, config.JWT_SECRET) as any;
          userId = decoded.userId;
          userName = decoded.name || 'Collaborator';
          if (projectId) {
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
          }
        } catch {
          // Token invalid
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

  private getOrCreateRoom(roomName: string, projectId: string, fileId: string): Room {
    let room = this.rooms.get(roomName);
    if (!room) {
      const doc = new Y.Doc();
      const awareness = new awarenessProtocol.Awareness(doc);
      awareness.setLocalState(null);

      const clients = new Set<ClientConnection>();
      room = { name: roomName, projectId, fileId, doc, awareness, clients };

      // Relay awareness changes to all connected room clients
      awareness.on('update', ({ added, updated, removed }: any, origin: any) => {
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
      });

      this.rooms.set(roomName, room);
    }
    return room;
  }

  private handleConnection(ws: WebSocket, req: IncomingMessage, clientInfo: any) {
    const { userId, userName, role, roomName, projectId, fileId } = clientInfo;
    const room = this.getOrCreateRoom(roomName, projectId, fileId);

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

    ws.on('close', () => {
      room.clients.delete(client);
      if (room.clients.size === 0) {
        // Optional: keep room in cache or snapshot
      }
    });
  }
}
