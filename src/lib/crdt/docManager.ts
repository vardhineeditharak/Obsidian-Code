import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';
import { WebrtcProvider } from 'y-webrtc';
import { IndexeddbPersistence } from 'y-indexeddb';
import { MonacoBinding } from 'y-monaco';
import type * as Monaco from 'monaco-editor';
import { CollaboratorPresence, TransportMode, ProjectRole } from '../types';

export interface DocSession {
  doc: Y.Doc;
  ytext: Y.Text;
  lineAuthors: Y.Map<any>;
  wsProvider: WebsocketProvider | null;
  webrtcProvider: WebrtcProvider | null;
  awareness: any;
  idbPersistence: IndexeddbPersistence;
  binding: MonacoBinding | null;
  synced: boolean;
  cleanups: (() => void)[];
  unsubscribeAwareness?: () => void;
}

class YjsDocManager {
  private sessions = new Map<string, DocSession>();
  private bindings = new Map<string, MonacoBinding>();
  private activeBoundFileId: string | null = null;
  private activeTransport: TransportMode = 'Hybrid';

  public setTransportMode(mode: TransportMode) {
    this.activeTransport = mode;
  }

  public getTransportMode(): TransportMode {
    return this.activeTransport;
  }

  public getSession(projectId: string, fileId: string): DocSession | undefined {
    const roomKey = `obsidian-project-${projectId}-file-${fileId}`;
    return this.sessions.get(roomKey);
  }

  /**
   * Initializes or retrieves a Yjs document session for a project file.
   */
  public async getOrCreateSession(
    projectId: string,
    fileId: string,
    initialContent: string = '',
    onSyncStatusChange?: (synced: boolean) => void,
    allowP2P: boolean = false
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
    // Note: Seeding must happen here before any MonacoBinding is created and never after.
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

    // 3. Attach WebRTC P2P Mesh (if Hybrid or P2P Mesh Only) — only when allowP2P is true (S2)
    if (this.activeTransport === 'Hybrid' || this.activeTransport === 'P2P Mesh Only') {
      if (allowP2P) {
        try {
          webrtcProvider = new WebrtcProvider(roomKey, doc, {
            awareness: wsProvider ? wsProvider.awareness : undefined,
            signaling: ['wss://signaling.yjs.dev', 'wss://y-webrtc-signaling-eu.herokuapp.com'],
          });
        } catch (err) {
          console.warn('WebRTC signaling initialization notice:', err);
        }
      } else {
        console.warn(`[Security] WebRTC P2P skipped for private room ${roomKey}. P2P is allowed only for public projects.`);
      }
    }

    const awareness = wsProvider?.awareness || webrtcProvider?.awareness || null;

    const session: DocSession = {
      doc,
      ytext,
      lineAuthors,
      wsProvider,
      webrtcProvider,
      awareness,
      idbPersistence,
      binding: null,
      synced,
      cleanups,
    };

    this.sessions.set(roomKey, session);
    return session;
  }

  /**
   * Sets local user awareness state
   */
  public setLocalAwareness(
    projectId: string,
    fileId: string,
    user: { id: string; name: string; color: string; role: ProjectRole; avatar?: string }
  ) {
    const session = this.getSession(projectId, fileId);
    if (!session || !session.awareness) return;

    const current = session.awareness.getLocalState()?.user || {};
    session.awareness.setLocalStateField('user', {
      ...current,
      id: user.id,
      name: user.name,
      color: user.color,
      avatar: user.avatar,
      role: user.role,
      fileId,
    });
  }

  /**
   * Subscribes to real awareness updates for a file room
   */
  public subscribeAwareness(
    projectId: string,
    fileId: string,
    onChange: (collaborators: CollaboratorPresence[]) => void
  ): () => void {
    const session = this.getSession(projectId, fileId);
    if (!session || !session.awareness) return () => {};

    const awareness = session.awareness;
    const updateCollaborators = () => {
      const states = awareness.getStates();
      const list: CollaboratorPresence[] = [];
      states.forEach((state: any) => {
        if (state?.user?.id) {
          list.push({
            id: state.user.id,
            name: state.user.name || 'Anonymous',
            color: state.user.color || '#c08532',
            avatar: state.user.avatar,
            role: state.user.role || 'viewer',
            fileId: state.user.fileId,
            cursor: state.user.cursor,
            selection: state.user.selection,
          });
        }
      });
      onChange(list);
    };

    awareness.on('change', updateCollaborators);
    // Initial emit
    updateCollaborators();

    const unsubscribe = () => {
      awareness.off('change', updateCollaborators);
    };

    session.cleanups.push(unsubscribe);
    session.unsubscribeAwareness = unsubscribe;
    return unsubscribe;
  }

  /**
   * Binds Monaco editor instance to Yjs text and awareness for a specific per-file model.
   */
  public bindMonaco(
    projectId: string,
    fileId: string,
    editor: Monaco.editor.IStandaloneCodeEditor,
    awarenessPayload: CollaboratorPresence,
    targetModel?: Monaco.editor.ITextModel | null
  ): MonacoBinding | null {
    const session = this.getSession(projectId, fileId);
    if (!session) return null;

    // Dispose old binding for this fileId if one exists
    const existingBinding = this.bindings.get(fileId);
    if (existingBinding) {
      existingBinding.destroy();
      this.bindings.delete(fileId);
    }
    if (session.binding && session.binding !== existingBinding) {
      session.binding.destroy();
      session.binding = null;
    }

    // Dispose previous active binding on this editor if switching from another file
    if (this.activeBoundFileId && this.activeBoundFileId !== fileId) {
      const prevBinding = this.bindings.get(this.activeBoundFileId);
      if (prevBinding) {
        prevBinding.destroy();
        this.bindings.delete(this.activeBoundFileId);
        const prevRoom = `obsidian-project-${projectId}-file-${this.activeBoundFileId}`;
        const prevSession = this.sessions.get(prevRoom);
        if (prevSession) {
          prevSession.binding = null;
        }
      }
    }
    this.activeBoundFileId = fileId;

    const model = targetModel || editor.getModel();
    if (!model) return null;

    const awareness = session.awareness;

    if (awareness) {
      const current = awareness.getLocalState()?.user || {};
      awareness.setLocalStateField('user', {
        ...current,
        id: awarenessPayload.id,
        name: awarenessPayload.name,
        color: awarenessPayload.color,
        avatar: awarenessPayload.avatar,
        role: awarenessPayload.role,
        fileId,
      });
    }

    try {
      if (model.getValue().length > 0) {
        model.setValue('');
      }

      const binding = new MonacoBinding(
        session.ytext,
        model,
        new Set([editor]),
        awareness
      );
      session.binding = binding;
      this.bindings.set(fileId, binding);
    } catch (err) {
      console.warn('MonacoBinding initialized with local text model', err);
    }

    return session.binding;
  }

  /**
   * Cleans up and disposes MonacoBinding for a specific file
   */
  public destroyBinding(fileId: string): void {
    const binding = this.bindings.get(fileId);
    if (binding) {
      binding.destroy();
      this.bindings.delete(fileId);
    }
    if (this.activeBoundFileId === fileId) {
      this.activeBoundFileId = null;
    }
    for (const session of this.sessions.values()) {
      if (session.binding === binding) {
        session.binding = null;
      }
    }
  }

  public getBinding(fileId: string): MonacoBinding | undefined {
    return this.bindings.get(fileId);
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
    const session = this.getSession(projectId, fileId);
    if (!session || !session.awareness) return;

    const current = session.awareness.getLocalState()?.user || {};
    session.awareness.setLocalStateField('user', {
      ...current,
      fileId,
      cursor,
      selection,
    });
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
    const session = this.getSession(projectId, fileId);
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
    this.destroyBinding(fileId);
    const roomKey = `obsidian-project-${projectId}-file-${fileId}`;
    const session = this.sessions.get(roomKey);
    if (!session) return;

    if (session.awareness) {
      session.awareness.setLocalState(null);
    }
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
