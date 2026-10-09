import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';
import { WebrtcProvider } from 'y-webrtc';
import { IndexeddbPersistence } from 'y-indexeddb';
import { MonacoBinding } from 'y-monaco';
import type * as Monaco from 'monaco-editor';
import { CollaboratorPresence, TransportMode } from '../types';

export interface DocSession {
  doc: Y.Doc;
  ytext: Y.Text;
  lineAuthors: Y.Map<any>;
  wsProvider: WebsocketProvider | null;
  webrtcProvider: WebrtcProvider | null;
  idbPersistence: IndexeddbPersistence;
  binding: MonacoBinding | null;
  synced: boolean;
  cleanups: (() => void)[];
}

class YjsDocManager {
  private sessions = new Map<string, DocSession>();
  private activeTransport: TransportMode = 'Hybrid';

  public setTransportMode(mode: TransportMode) {
    this.activeTransport = mode;
  }

  public getTransportMode(): TransportMode {
    return this.activeTransport;
  }

  /**
   * Initializes or retrieves a Yjs document session for a project file.
   */
  public async getOrCreateSession(
    projectId: string,
    fileId: string,
    initialContent: string = '',
    onSyncStatusChange?: (synced: boolean) => void
  ): Promise<DocSession> {
    const roomKey = `obsidian-project-${projectId}-file-${fileId}`;

    if (this.sessions.has(roomKey)) {
      return this.sessions.get(roomKey)!;
    }

    const doc = new Y.Doc();
    const ytext = doc.getText('content');
    const lineAuthors = doc.getMap('lineAuthors');

    // 1. Local-first persistence via IndexedDB
    const idbPersistence = new IndexeddbPersistence(roomKey, doc);
    let synced = false;

    // Wait for local IndexedDB cache hydration
    await idbPersistence.whenSynced;
    synced = true;

    // If local document is brand new and empty, seed it with initial file content
    if (ytext.length === 0 && initialContent) {
      doc.transact(() => {
        ytext.insert(0, initialContent);
      }, 'seed-initial-content');
    }

    onSyncStatusChange?.(true);

    let wsProvider: WebsocketProvider | null = null;
    let webrtcProvider: WebrtcProvider | null = null;
    const cleanups: (() => void)[] = [];

    // Protocol & Host discovery
    const isHttps = typeof window !== 'undefined' && window.location.protocol === 'https:';
    const wsProto = isHttps ? 'wss:' : 'ws:';
    const wsHost = typeof window !== 'undefined' 
      ? `${wsProto}//${window.location.host}/ws`
      : 'ws://localhost:5000/ws';

    // 2. Attach WebSocket Relay (if Hybrid or WebSocket Only)
    if (this.activeTransport === 'Hybrid' || this.activeTransport === 'WebSocket Only') {
      try {
        wsProvider = new WebsocketProvider(wsHost, roomKey, doc, {
          connect: true,
          params: {
            token: typeof window !== 'undefined' ? localStorage.getItem('obsidian_token') || '' : '',
          },
        });

        const statusHandler = ({ status }: { status: string }) => {
          onSyncStatusChange?.(status === 'connected');
        };
        wsProvider.on('status', statusHandler);
        cleanups.push(() => wsProvider?.off('status', statusHandler));
      } catch (err) {
        console.warn('Failed to connect to WebSocket relay:', err);
      }
    }

    // 3. Attach WebRTC P2P Mesh (if Hybrid or P2P Mesh Only)
    if (this.activeTransport === 'Hybrid' || this.activeTransport === 'P2P Mesh Only') {
      try {
        webrtcProvider = new WebrtcProvider(roomKey, doc, {
          signaling: ['wss://signaling.yjs.dev', 'wss://y-webrtc-signaling-eu.herokuapp.com'],
        });
      } catch (err) {
        console.warn('WebRTC signaling initialization notice:', err);
      }
    }

    const session: DocSession = {
      doc,
      ytext,
      lineAuthors,
      wsProvider,
      webrtcProvider,
      idbPersistence,
      binding: null,
      synced,
      cleanups,
    };

    this.sessions.set(roomKey, session);
    return session;
  }

  /**
   * Binds Monaco editor instance to Yjs text and awareness
   */
  public bindMonaco(
    projectId: string,
    fileId: string,
    editor: Monaco.editor.IStandaloneCodeEditor,
    awarenessPayload: CollaboratorPresence
  ): MonacoBinding | null {
    const roomKey = `obsidian-project-${projectId}-file-${fileId}`;
    const session = this.sessions.get(roomKey);
    if (!session) return null;

    // Dispose old binding if it exists
    if (session.binding) {
      session.binding.destroy();
      session.binding = null;
    }

    const model = editor.getModel();
    if (!model) return null;

    // Use wsProvider awareness if available, else webrtcProvider awareness
    const awareness = session.wsProvider?.awareness || session.webrtcProvider?.awareness;

    if (awareness) {
      awareness.setLocalStateField('user', {
        id: awarenessPayload.id,
        name: awarenessPayload.name,
        color: awarenessPayload.color,
        avatar: awarenessPayload.avatar,
        role: awarenessPayload.role,
        fileId,
      });
    }

    try {
      session.binding = new MonacoBinding(
        session.ytext,
        model,
        new Set([editor]),
        awareness
      );
    } catch (err) {
      console.warn('MonacoBinding initialized with local text model');
    }

    return session.binding;
  }

  /**
   * Updates local awareness cursor and selection
   */
  public updateCursorAwareness(
    projectId: string,
    fileId: string,
    cursor: { line: number; column: number },
    selection?: { startLine: number; startColumn: number; endLine: number; endColumn: number }
  ) {
    const roomKey = `obsidian-project-${projectId}-file-${fileId}`;
    const session = this.sessions.get(roomKey);
    if (!session) return;

    const awareness = session.wsProvider?.awareness || session.webrtcProvider?.awareness;
    if (awareness) {
      const current = awareness.getLocalState()?.user || {};
      awareness.setLocalStateField('user', {
        ...current,
        fileId,
        cursor,
        selection,
      });
    }
  }

  /**
   * Record line authorship during an edit transaction
   */
  public recordAuthorship(
    projectId: string,
    fileId: string,
    lineNumber: number,
    author: { id: string; name: string; color: string }
  ) {
    const roomKey = `obsidian-project-${projectId}-file-${fileId}`;
    const session = this.sessions.get(roomKey);
    if (!session) return;

    session.doc.transact(() => {
      session.lineAuthors.set(String(lineNumber), {
        authorId: author.id,
        authorName: author.name,
        color: author.color,
        timestamp: Date.now(),
      });
    }, 'line-authorship');
  }

  /**
   * Cleans up and disposes a session
   */
  public destroySession(projectId: string, fileId: string) {
    const roomKey = `obsidian-project-${projectId}-file-${fileId}`;
    const session = this.sessions.get(roomKey);
    if (!session) return;

    session.cleanups.forEach((fn) => fn());
    if (session.binding) {
      session.binding.destroy();
    }
    if (session.wsProvider) {
      session.wsProvider.destroy();
    }
    if (session.webrtcProvider) {
      session.webrtcProvider.destroy();
    }
    session.idbPersistence.destroy();
    session.doc.destroy();

    this.sessions.delete(roomKey);
  }
}

export const docManager = new YjsDocManager();
