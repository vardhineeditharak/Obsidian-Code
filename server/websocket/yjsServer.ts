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

export const ROOM_NAME_REGEX = /^obsidian-project-(.+?)-file-(.+)$/;
export const PROJECT_EVENTS_ROOM_REGEX = /^obsidian-project-(.+?)-events$/;

export interface ClientConnection {
  ws: WebSocket;
  userId: string;
  userName: string;
  role: 'owner' | 'editor' | 'viewer';
  roomName: string;
  projectId: string;
  fileId: string;
  controlledClients: Set<number>;
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
  private static instance: YjsWebSocketServer | null = null;
  private wss: WebSocketServer;
  private rooms = new Map<string, Room>();
  private projectEventClients = new Map<string, Set<ClientConnection>>();

  constructor(server: any) {
    YjsWebSocketServer.instance = this;
    this.wss = new WebSocketServer({ noServer: true });
    this.init();
  }

  public static getInstance(): YjsWebSocketServer | null {
    return YjsWebSocketServer.instance;
  }

  public getWss(): WebSocketServer {
    return this.wss;
  }

  public broadcastProjectEvent(projectId: string, event: any, excludeWs?: WebSocket): void {
    const payload = JSON.stringify(event);

    // 1. Send to dedicated project events clients
    const eventClients = this.projectEventClients.get(projectId);
    if (eventClients) {
      for (const client of eventClients) {
        if (client.ws !== excludeWs && client.ws.readyState === WebSocket.OPEN) {
          try {
            client.ws.send(payload);
          } catch {}
        }
      }
    }

    // 2. Also send to all clients in active file rooms for this project
    for (const room of this.rooms.values()) {
      if (room.projectId === projectId) {
        for (const client of room.clients) {
          if (client.ws !== excludeWs && client.ws.readyState === WebSocket.OPEN) {
            try {
              client.ws.send(payload);
            } catch {}
          }
        }
      }
    }
  }

  public updateClientRole(projectId: string, userId: string, newRole: 'owner' | 'editor' | 'viewer'): void {
    const eventClients = this.projectEventClients.get(projectId);
    if (eventClients) {
      for (const client of eventClients) {
        if (client.userId === userId) {
          client.role = newRole;
        }
      }
    }

    for (const room of this.rooms.values()) {
      if (room.projectId === projectId) {
        for (const client of room.clients) {
          if (client.userId === userId) {
            client.role = newRole;
          }
        }
      }
    }
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

      // Check if file room or project events room
      let projectId: string;
      let fileId: string;

      const fileMatch = roomName.match(ROOM_NAME_REGEX);
      const eventsMatch = roomName.match(PROJECT_EVENTS_ROOM_REGEX) || (
        url.pathname.includes('/events') ? [null, url.searchParams.get('projectId')] : null
      );

      if (fileMatch) {
        projectId = fileMatch[1];
        fileId = fileMatch[2];
      } else if (eventsMatch && eventsMatch[1]) {
        projectId = eventsMatch[1];
        fileId = '__events__';
      } else {
        socket.write('HTTP/1.1 400 Bad Request\r\n\r\n');
        socket.destroy();
        return;
      }

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

      room = {
        name: roomName,
        projectId,
        fileId,
        doc,
        awareness,
        clients,
        awarenessHandler: () => {},
        docUpdateHandler: () => {},
        snapshotTimeout: null,
      };

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
      room.awarenessHandler = awarenessHandler;

      const docUpdateHandler = () => {
        if (room!.snapshotTimeout) {
          clearTimeout(room!.snapshotTimeout);
          room!.snapshotTimeout = null;
        }
        room!.snapshotTimeout = setTimeout(async () => {
          if (room) {
            room.snapshotTimeout = null;
          }
          try {
            const state = Buffer.from(Y.encodeStateAsUpdate(doc));
            await dbStore.saveDocSnapshot(projectId, fileId, state);
          } catch (err) {
            console.error('Failed to save debounced snapshot:', err);
          }
        }, 3000);
      };

      doc.on('update', docUpdateHandler);
      room.docUpdateHandler = docUpdateHandler;

      this.rooms.set(roomName, room);
    }
    return room;
  }

  public getRoom(roomName: string): Room | undefined {
    return this.rooms.get(roomName);
  }

  public async getOrCreateRoomForTest(roomName: string, projectId: string, fileId: string): Promise<Room> {
    return this.getOrCreateRoom(roomName, projectId, fileId);
  }

  public async flushRoomSnapshot(roomName: string): Promise<void> {
    const room = this.rooms.get(roomName);
    if (!room) return;
    if (room.snapshotTimeout) {
      clearTimeout(room.snapshotTimeout);
      room.snapshotTimeout = null;
    }
    const state = Buffer.from(Y.encodeStateAsUpdate(room.doc));
    await dbStore.saveDocSnapshot(room.projectId, room.fileId, state);
  }

  private async handleConnection(ws: WebSocket, req: IncomingMessage, clientInfo: any) {
    const { userId, userName, role, roomName, projectId, fileId } = clientInfo;

    // Handle dedicated project events connection
    if (fileId === '__events__') {
      const client: ClientConnection = {
        ws,
        userId,
        userName,
        role,
        roomName,
        projectId,
        fileId,
        controlledClients: new Set<number>(),
      };
      if (!this.projectEventClients.has(projectId)) {
        this.projectEventClients.set(projectId, new Set());
      }
      this.projectEventClients.get(projectId)!.add(client);

      // Send initial connection acknowledgement
      try {
        ws.send(JSON.stringify({ type: 'connected', projectId, role, userId }));
      } catch {}

      ws.on('message', (data: Buffer | ArrayBuffer | string) => {
        try {
          const str = data.toString();
          const parsed = JSON.parse(str);
          if (parsed.type === 'ping') {
            ws.send(JSON.stringify({ type: 'pong' }));
          }
        } catch {}
      });

      ws.on('close', () => {
        const clients = this.projectEventClients.get(projectId);
        if (clients) {
          clients.delete(client);
          if (clients.size === 0) {
            this.projectEventClients.delete(projectId);
          }
        }
      });
      return;
    }

    const room = await this.getOrCreateRoom(roomName, projectId, fileId);

    const client: ClientConnection = {
      ws,
      userId,
      userName,
      role,
      roomName,
      projectId,
      fileId,
      controlledClients: new Set<number>(),
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
    ws.on('message', (data: Buffer | ArrayBuffer | string) => {
      try {
        if (typeof data === 'string' || (data instanceof Buffer && data.length > 0 && data[0] === 123)) {
          try {
            const parsed = JSON.parse(data.toString());
            if (parsed.type === 'ping') {
              ws.send(JSON.stringify({ type: 'pong' }));
            }
          } catch {}
          return;
        }

        const buf = data instanceof Buffer ? new Uint8Array(data.buffer, data.byteOffset, data.byteLength) : new Uint8Array(data);
        const decoder = decoding.createDecoder(buf);
        const messageType = decoding.readVarUint(decoder);

        if (messageType === messageSync) {
          // Check sync subtype
          const syncSubtype = decoding.peekVarUint(decoder);
          
          // CRITICAL SECURITY ENFORCEMENT:
          // Viewer users are NOT permitted to send document updates (syncSubtype 2: messageSyncUpdate).
          // Handshake sync steps (subtype 0 & 1) are permitted so viewers receive the initial document state.
          if (client.role === 'viewer' && syncSubtype === 2) {
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
          const rawAwarenessUpdate = decoding.readVarUint8Array(decoder);
          // Track client IDs introduced by this socket connection
          try {
            const updateDecoder = decoding.createDecoder(rawAwarenessUpdate);
            const len = decoding.readVarUint(updateDecoder);
            for (let i = 0; i < len; i++) {
              const clientID = decoding.readVarUint(updateDecoder);
              decoding.readVarUint(updateDecoder); // clock
              decoding.readVarString(updateDecoder); // JSON state string
              client.controlledClients.add(clientID);
            }
          } catch {}

          // Awareness is permitted for all roles so Viewers can show their presence/cursor and follow others
          awarenessProtocol.applyAwarenessUpdate(
            room.awareness,
            rawAwarenessUpdate,
            ws
          );
        }
      } catch (err) {
        console.error('Error handling WebSocket Yjs message:', err);
      }
    });

    ws.on('close', async () => {
      room.clients.delete(client);
      if (client.controlledClients.size > 0) {
        awarenessProtocol.removeAwarenessStates(
          room.awareness,
          Array.from(client.controlledClients),
          null
        );
      }
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
