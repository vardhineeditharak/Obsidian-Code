import { WebSocketServer, WebSocket } from 'ws';
import type { IncomingMessage } from 'http';
import * as Y from 'yjs';
import * as syncProtocol from 'y-protocols/sync';
import * as awarenessProtocol from 'y-protocols/awareness';
import * as encoding from 'lib0/encoding';
import * as decoding from 'lib0/decoding';
import jwt from 'jsonwebtoken';
import { config } from '../config';
import { dbStore, ProjectRole } from '../dbStore';
import { projectEventBus, ProjectRealtimeEvent } from './projectEvents';

const messageSync = 0;
const messageAwareness = 1;
const MAX_WS_PAYLOAD_BYTES = 10 * 1024 * 1024; // 10MB max message payload
const HEARTBEAT_INTERVAL_MS = 30_000;

interface HeartbeatSocket extends WebSocket {
  isAlive?: boolean;
}

interface UpgradeClientInfo {
  isEventChannel: boolean;
  userId: string;
  userName: string;
  role: ProjectRole;
  roomName: string;
  projectId: string;
  fileId: string;
}

export interface EventClientConnection {
  ws: WebSocket;
  userId: string;
  userName: string;
  role: ProjectRole;
  projectId: string;
}

export interface ClientConnection {
  ws: WebSocket;
  userId: string;
  userName: string;
  role: ProjectRole;
  roomName: string;
  projectId: string;
  fileId: string;
  controlledIds: Set<number>;
}

export interface Room {
  name: string;
  projectId: string;
  fileId: string;
  doc: Y.Doc;
  awareness: awarenessProtocol.Awareness;
  clients: Set<ClientConnection>;
  awarenessHandler: (
    changed: { added: number[]; updated: number[]; removed: number[] },
    origin: unknown
  ) => void;
  docUpdateHandler: (update: Uint8Array, origin: unknown) => void;
  snapshotTimeout: NodeJS.Timeout | null;
  closing?: boolean;
}

export class YjsWebSocketServer {
  private wss: WebSocketServer;
  private rooms = new Map<string, Room>();
  private pendingRooms = new Map<string, Promise<Room>>();
  private eventClients = new Map<string, Set<EventClientConnection>>();
  private eventListener: (event: ProjectRealtimeEvent) => void;
  private heartbeatInterval: NodeJS.Timeout;

  constructor(_server?: unknown) {
    this.wss = new WebSocketServer({
      noServer: true,
      maxPayload: MAX_WS_PAYLOAD_BYTES,
    });
    this.eventListener = (event) => this.handleProjectEvent(event);
    projectEventBus.on('project-event', this.eventListener);

    this.heartbeatInterval = setInterval(() => {
      this.wss.clients.forEach((rawWs) => {
        const ws = rawWs as HeartbeatSocket;
        if (ws.isAlive === false) {
          ws.terminate();
          return;
        }
        ws.isAlive = false;
        if (ws.readyState === WebSocket.OPEN) {
          ws.ping();
        }
      });
    }, HEARTBEAT_INTERVAL_MS);
    this.heartbeatInterval.unref?.();

    this.init();
  }

  public getWss(): WebSocketServer {
    return this.wss;
  }

  private init(): void {
    this.wss.on('connection', (ws: WebSocket, _req: IncomingMessage, clientInfo: UpgradeClientInfo) => {
      const hbWs = ws as HeartbeatSocket;
      hbWs.isAlive = true;
      hbWs.on('pong', () => {
        hbWs.isAlive = true;
      });
      hbWs.on('error', (err) => {
        console.warn('[WebSocket] Socket error:', err.message);
      });

      if (clientInfo?.isEventChannel) {
        this.handleEventConnection(ws, clientInfo);
      } else {
        void this.handleConnection(ws, clientInfo);
      }
    });

    this.wss.on('close', async () => {
      clearInterval(this.heartbeatInterval);
      projectEventBus.off('project-event', this.eventListener);

      // Flush debounced snapshots before destroying documents, otherwise edits made in
      // the final debounce window are lost on shutdown.
      for (const room of Array.from(this.rooms.values())) {
        if (room.snapshotTimeout) {
          clearTimeout(room.snapshotTimeout);
          room.snapshotTimeout = null;
        }
        try {
          const state = Buffer.from(Y.encodeStateAsUpdate(room.doc));
          await dbStore.saveDocSnapshot(room.projectId, room.fileId, state);
        } catch (err) {
          console.error('Failed to save snapshot during shutdown:', err);
        }
        this.cleanupRoomResources(room);
      }
      this.rooms.clear();
      this.pendingRooms.clear();
      this.eventClients.clear();
    });
  }

  private cleanupRoomResources(room: Room): void {
    if (room.snapshotTimeout) {
      clearTimeout(room.snapshotTimeout);
      room.snapshotTimeout = null;
    }
    room.awareness.off('update', room.awarenessHandler);
    room.doc.off('update', room.docUpdateHandler);
    room.awareness.destroy();
    room.doc.destroy();
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

      // Support project-level event channel: obsidian-project-events-<projectId>
      const eventMatch = roomName.match(/^obsidian-project-events-([A-Za-z0-9_-]+)$/);
      // Support file room format: obsidian-project-<projectId>-file-<fileId>
      const fileMatch = roomName.match(/^obsidian-project-(.+?)-file-(.+)$/);

      if (!eventMatch && !fileMatch) {
        socket.write('HTTP/1.1 400 Bad Request\r\n\r\n');
        socket.destroy();
        return;
      }

      const projectId = eventMatch ? eventMatch[1] : fileMatch![1];
      const fileId = fileMatch ? fileMatch[2] : '';

      if (!projectId || (fileMatch && (!fileId || fileId.includes('..') || fileId.includes('/') || fileId.includes('\\')))) {
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
        const decoded = jwt.verify(token, config.JWT_SECRET, { algorithms: ['HS256'] }) as {
          userId?: string;
          name?: string;
        };
        if (!decoded?.userId) {
          socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
          socket.destroy();
          return;
        }
        userId = decoded.userId;
        userName = decoded.name || 'Collaborator';
      } catch {
        socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
        socket.destroy();
        return;
      }

      let role: ProjectRole = 'viewer';
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
        const clientInfo: UpgradeClientInfo = {
          isEventChannel: Boolean(eventMatch),
          userId,
          userName,
          role,
          roomName,
          projectId,
          fileId,
        };
        this.wss.emit('connection', ws, req, clientInfo);
      });
    } catch {
      socket.write('HTTP/1.1 500 Internal Server Error\r\n\r\n');
      socket.destroy();
    }
  }

  private handleEventConnection(ws: WebSocket, clientInfo: UpgradeClientInfo): void {
    const { userId, userName, role, projectId } = clientInfo;
    const client: EventClientConnection = { ws, userId, userName, role, projectId };

    let clients = this.eventClients.get(projectId);
    if (!clients) {
      clients = new Set();
      this.eventClients.set(projectId, clients);
    }
    clients.add(client);

    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'connected', projectId, role }));
    }

    ws.on('close', () => {
      const set = this.eventClients.get(projectId);
      if (set) {
        set.delete(client);
        if (set.size === 0) {
          this.eventClients.delete(projectId);
        }
      }
    });
  }

  private handleProjectEvent(event: ProjectRealtimeEvent): void {
    // 1. Apply immediate RBAC updates to active Yjs document rooms and event sockets
    if (event.type === 'member:role-updated') {
      for (const room of this.rooms.values()) {
        if (room.projectId === event.projectId) {
          for (const client of room.clients) {
            if (client.userId === event.userId) {
              client.role = event.role;
            }
          }
        }
      }
      const evClients = this.eventClients.get(event.projectId);
      if (evClients) {
        for (const client of evClients) {
          if (client.userId === event.userId) {
            client.role = event.role;
          }
        }
      }
    }

    // 2. Broadcast JSON event to all connected project event listeners
    const listeners = this.eventClients.get(event.projectId);
    if (listeners && listeners.size > 0) {
      const payload = JSON.stringify(event);
      for (const client of listeners) {
        if (client.ws.readyState === WebSocket.OPEN) {
          client.ws.send(payload);
        }
      }
    }

    // 3. Disconnect removed members from active rooms after notifying them
    if (event.type === 'member:removed') {
      for (const room of this.rooms.values()) {
        if (room.projectId === event.projectId) {
          for (const client of room.clients) {
            if (client.userId === event.userId && client.ws.readyState === WebSocket.OPEN) {
              client.ws.close(4003, 'Removed from project');
            }
          }
        }
      }
      if (listeners) {
        for (const client of listeners) {
          if (client.userId === event.userId && client.ws.readyState === WebSocket.OPEN) {
            client.ws.close(4003, 'Removed from project');
          }
        }
      }
    }
  }

  /**
   * Deduplicates concurrent room creation. The snapshot read is async, so publishing the
   * in-flight promise before awaiting prevents two connections from building separate docs.
   */
  private async getOrCreateRoom(roomName: string, projectId: string, fileId: string): Promise<Room> {
    const existing = this.rooms.get(roomName);
    if (existing && !existing.closing) return existing;

    const inFlight = this.pendingRooms.get(roomName);
    if (inFlight) return inFlight;

    const creation = this.createRoomInternal(roomName, projectId, fileId);
    this.pendingRooms.set(roomName, creation);
    try {
      return await creation;
    } finally {
      this.pendingRooms.delete(roomName);
    }
  }

  private async createRoomInternal(roomName: string, projectId: string, fileId: string): Promise<Room> {
    let room = this.rooms.get(roomName);
    if (!room) {
      const doc = new Y.Doc();

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

      const createdRoom: Room = {
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

      const awarenessHandler = (
        { added, updated, removed }: { added: number[]; updated: number[]; removed: number[] },
        origin: unknown
      ) => {
        const changedClients = added.concat(updated, removed);

        // Track awareness clientIDs controlled by the originating WebSocket so we can clean up on disconnect
        if (origin && typeof origin === 'object') {
          for (const client of createdRoom.clients) {
            if (client.ws === origin) {
              for (const id of added) client.controlledIds.add(id);
              for (const id of updated) client.controlledIds.add(id);
              for (const id of removed) client.controlledIds.delete(id);
              break;
            }
          }
        }

        const encoder = encoding.createEncoder();
        encoding.writeVarUint(encoder, messageAwareness);
        encoding.writeVarUint8Array(
          encoder,
          awarenessProtocol.encodeAwarenessUpdate(awareness, changedClients)
        );
        const message = encoding.toUint8Array(encoder);

        for (const client of createdRoom.clients) {
          if (client.ws !== origin && client.ws.readyState === WebSocket.OPEN) {
            client.ws.send(message);
          }
        }
      };

      awareness.on('update', awarenessHandler);
      createdRoom.awarenessHandler = awarenessHandler;

      const docUpdateHandler = (update: Uint8Array, origin: unknown) => {
        // Broadcast applied document updates to all other peers in the room
        if (createdRoom.clients.size > 0) {
          const encoder = encoding.createEncoder();
          encoding.writeVarUint(encoder, messageSync);
          syncProtocol.writeUpdate(encoder, update);
          const message = encoding.toUint8Array(encoder);

          for (const peer of createdRoom.clients) {
            if (peer.ws !== origin && peer.ws.readyState === WebSocket.OPEN) {
              peer.ws.send(message);
            }
          }
        }

        // Schedule debounced durable snapshot persistence
        if (createdRoom.snapshotTimeout) {
          clearTimeout(createdRoom.snapshotTimeout);
          createdRoom.snapshotTimeout = null;
        }
        createdRoom.snapshotTimeout = setTimeout(async () => {
          createdRoom.snapshotTimeout = null;
          try {
            const state = Buffer.from(Y.encodeStateAsUpdate(doc));
            await dbStore.saveDocSnapshot(projectId, fileId, state);
          } catch (err) {
            console.error('Failed to save debounced snapshot:', err);
          }
        }, 3000);
        createdRoom.snapshotTimeout.unref?.();
      };

      doc.on('update', docUpdateHandler);
      createdRoom.docUpdateHandler = docUpdateHandler;

      this.rooms.set(roomName, createdRoom);
      room = createdRoom;
    }
    return room;
  }

  public getRoom(roomName: string): Room | undefined {
    return this.rooms.get(roomName);
  }

  public async getOrCreateRoomForTest(
    roomName: string,
    projectId: string,
    fileId: string
  ): Promise<Room> {
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

  private async handleConnection(ws: WebSocket, clientInfo: UpgradeClientInfo): Promise<void> {
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
      controlledIds: new Set<number>(),
    };
    room.clients.add(client);

    // 1. Send sync step 1
    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, messageSync);
    syncProtocol.writeSyncStep1(encoder, room.doc);
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(encoding.toUint8Array(encoder));
    }

    // 2. Send current awareness states
    const awarenessStates = room.awareness.getStates();
    if (awarenessStates.size > 0 && ws.readyState === WebSocket.OPEN) {
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
        const buf =
          data instanceof Buffer
            ? new Uint8Array(data.buffer, data.byteOffset, data.byteLength)
            : new Uint8Array(data);
        const decoder = decoding.createDecoder(buf);
        const messageType = decoding.readVarUint(decoder);

        if (messageType === messageSync) {
          const syncSubtype = decoding.peekVarUint(decoder);

          // Viewer users must never mutate the server document (block both SyncStep2=1 and Update=2)
          if (client.role === 'viewer' && (syncSubtype === 1 || syncSubtype === 2)) {
            if (syncSubtype === 2) {
              console.warn(
                `[Security] Dropped unauthorized Yjs update from Viewer (userId: ${client.userId}, room: ${roomName})`
              );
            }
            return;
          }

          const responseEncoder = encoding.createEncoder();
          encoding.writeVarUint(responseEncoder, messageSync);

          syncProtocol.readSyncMessage(decoder, responseEncoder, room.doc, client.ws);

          if (encoding.length(responseEncoder) > 1 && ws.readyState === WebSocket.OPEN) {
            ws.send(encoding.toUint8Array(responseEncoder));
          }
        } else if (messageType === messageAwareness) {
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

      if (client.controlledIds.size > 0) {
        awarenessProtocol.removeAwarenessStates(
          room.awareness,
          Array.from(client.controlledIds),
          null
        );
        client.controlledIds.clear();
      }

      if (room.clients.size === 0 && !room.closing) {
        // Detach the room before the async save so a new connection cannot join a room
        // that is about to be destroyed.
        room.closing = true;
        this.rooms.delete(roomName);
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

        this.cleanupRoomResources(room);
      }
    });
  }
}
