import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';
import { WebrtcProvider } from 'y-webrtc';
import { IndexeddbPersistence } from 'y-indexeddb';
import { MonacoBinding } from 'y-monaco';
import type { Awareness } from 'y-protocols/awareness';
import type * as Monaco from 'monaco-editor';
import type { CollaboratorPresence, ProjectRole, TransportMode } from '../types';

export interface LineAuthorMetadata {
  authorId: string;
  authorName: string;
  color: string;
  timestamp: number;
}

export interface DocSession {
  doc: Y.Doc;
  ytext: Y.Text;
  lineAuthors: Y.Map<LineAuthorMetadata>;
  wsProvider: WebsocketProvider | null;
  webrtcProvider: WebrtcProvider | null;
  awareness: Awareness | null;
  idbPersistence: IndexeddbPersistence;
  binding: MonacoBinding | null;
  synced: boolean;
  cleanups: (() => void)[];
  unsubscribeAwareness?: () => void;
}

export type EditorPane = 'primary' | 'secondary';

interface AwarenessUserState {
  id?: string;
  name?: string;
  color?: string;
  avatar?: string;
  role?: ProjectRole;
  fileId?: string;
  cursor?: { line: number; column: number };
  selection?: {
    startLine: number;
    startColumn: number;
    endLine: number;
    endColumn: number;
  };
}

function getRoomKey(projectId: string, fileId: string): string {
  return `obsidian-project-${projectId}-file-${fileId}`;
}

function readStoredAuthToken(): string {
  if (typeof window === 'undefined') return '';
  try {
    return localStorage.getItem('obsidian_token') || '';
  } catch {
    return '';
  }
}

class YjsDocManager {
  private sessions = new Map<string, DocSession>();
  private pendingSessions = new Map<string, Promise<DocSession>>();
  private bindings = new Map<string, MonacoBinding>();
  private secondaryBindings = new Map<string, MonacoBinding>();
  private activeBoundFileId: string | null = null;
  private secondaryBoundFileId: string | null = null;
  private activeTransport: TransportMode = 'Hybrid';

  public setTransportMode(mode: TransportMode): void {
    this.activeTransport = mode;
  }

  public getTransportMode(): TransportMode {
    return this.activeTransport;
  }

  public getSession(projectId: string, fileId: string): DocSession | undefined {
    return this.sessions.get(getRoomKey(projectId, fileId));
  }

  /**
   * Initializes or retrieves a Yjs document session for a project file.
   * Deduplicates concurrent creation attempts for the same room key.
   */
  public async getOrCreateSession(
    projectId: string,
    fileId: string,
    initialContent: string = '',
    onSyncStatusChange?: (synced: boolean) => void,
    allowP2P: boolean = false
  ): Promise<DocSession> {
    const roomKey = getRoomKey(projectId, fileId);

    const existing = this.sessions.get(roomKey);
    if (existing) {
      return existing;
    }

    const inFlight = this.pendingSessions.get(roomKey);
    if (inFlight) {
      return inFlight;
    }

    const createPromise = this.createSessionInternal(
      roomKey,
      initialContent,
      onSyncStatusChange,
      allowP2P
    );
    this.pendingSessions.set(roomKey, createPromise);

    try {
      const session = await createPromise;
      return session;
    } finally {
      this.pendingSessions.delete(roomKey);
    }
  }

  private async createSessionInternal(
    roomKey: string,
    initialContent: string,
    onSyncStatusChange?: (synced: boolean) => void,
    allowP2P: boolean = false
  ): Promise<DocSession> {
    const doc = new Y.Doc();
    const ytext = doc.getText('content');
    const lineAuthors = doc.getMap<LineAuthorMetadata>('lineAuthors');

    // 1. Local-first persistence via IndexedDB
    const idbPersistence = new IndexeddbPersistence(roomKey, doc);
    await idbPersistence.whenSynced;

    // Seed empty local document once before any MonacoBinding attaches
    if (ytext.length === 0 && initialContent) {
      doc.transact(() => {
        ytext.insert(0, initialContent);
      }, 'seed-initial-content');
    }

    onSyncStatusChange?.(true);

    let wsProvider: WebsocketProvider | null = null;
    let webrtcProvider: WebrtcProvider | null = null;
    const cleanups: (() => void)[] = [];

    const isHttps = typeof window !== 'undefined' && window.location.protocol === 'https:';
    const wsProto = isHttps ? 'wss:' : 'ws:';
    const wsHost =
      typeof window !== 'undefined'
        ? `${wsProto}//${window.location.host}/ws`
        : 'ws://localhost:5000/ws';

    // 2. WebSocket Relay (Hybrid or WebSocket Only)
    if (this.activeTransport === 'Hybrid' || this.activeTransport === 'WebSocket Only') {
      try {
        wsProvider = new WebsocketProvider(wsHost, roomKey, doc, {
          connect: true,
          params: {
            token: readStoredAuthToken(),
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

    // 3. WebRTC P2P Mesh (public projects only when Hybrid or P2P Mesh Only)
    if (this.activeTransport === 'Hybrid' || this.activeTransport === 'P2P Mesh Only') {
      if (allowP2P) {
        try {
          webrtcProvider = new WebrtcProvider(roomKey, doc, {
            awareness: wsProvider ? wsProvider.awareness : undefined,
            signaling: [
              'wss://signaling.yjs.dev',
              'wss://y-webrtc-signaling-eu.herokuapp.com',
            ],
          });
        } catch (err) {
          console.warn('WebRTC signaling initialization notice:', err);
        }
      } else {
        console.warn(
          `[Security] WebRTC P2P skipped for private room ${roomKey}. P2P is allowed only for public projects.`
        );
      }
    }

    const awareness: Awareness | null =
      wsProvider?.awareness ?? webrtcProvider?.awareness ?? null;

    const session: DocSession = {
      doc,
      ytext,
      lineAuthors,
      wsProvider,
      webrtcProvider,
      awareness,
      idbPersistence,
      binding: null,
      synced: true,
      cleanups,
    };

    this.sessions.set(roomKey, session);
    return session;
  }

  /**
   * Sets local user awareness state.
   */
  public setLocalAwareness(
    projectId: string,
    fileId: string,
    user: { id: string; name: string; color: string; role: ProjectRole; avatar?: string }
  ): void {
    const session = this.getSession(projectId, fileId);
    if (!session?.awareness) return;

    const current = (session.awareness.getLocalState()?.user ?? {}) as AwarenessUserState;
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
   * Subscribes to real-time awareness presence updates for a file room.
   */
  public subscribeAwareness(
    projectId: string,
    fileId: string,
    onChange: (collaborators: CollaboratorPresence[]) => void
  ): () => void {
    const session = this.getSession(projectId, fileId);
    if (!session?.awareness) return () => {};

    const awareness = session.awareness;
    const updateCollaborators = () => {
      const states = awareness.getStates();
      const list: CollaboratorPresence[] = [];
      states.forEach((state) => {
        const user = (state as { user?: AwarenessUserState } | null)?.user;
        if (user?.id) {
          list.push({
            id: user.id,
            name: user.name || 'Anonymous',
            color: user.color || '#c08532',
            avatar: user.avatar,
            role: user.role || 'viewer',
            fileId: user.fileId,
            cursor: user.cursor,
            selection: user.selection,
          });
        }
      });
      onChange(list);
    };

    awareness.on('change', updateCollaborators);
    updateCollaborators();

    const unsubscribe = () => {
      awareness.off('change', updateCollaborators);
    };

    session.cleanups.push(unsubscribe);
    session.unsubscribeAwareness = unsubscribe;
    return unsubscribe;
  }

  /**
   * Binds a Monaco editor instance to Yjs text and awareness for a per-file model.
   * Supports independent 'primary' and 'secondary' split panes.
   */
  public bindMonaco(
    projectId: string,
    fileId: string,
    editor: Monaco.editor.IStandaloneCodeEditor,
    awarenessPayload: CollaboratorPresence,
    targetModel?: Monaco.editor.ITextModel | null,
    pane: EditorPane = 'primary'
  ): MonacoBinding | null {
    const session = this.getSession(projectId, fileId);
    if (!session) return null;

    const paneBindings = pane === 'secondary' ? this.secondaryBindings : this.bindings;
    const prevBoundId =
      pane === 'secondary' ? this.secondaryBoundFileId : this.activeBoundFileId;

    const existingBinding = paneBindings.get(fileId);
    if (existingBinding) {
      existingBinding.destroy();
      paneBindings.delete(fileId);
    }
    if (pane === 'primary' && session.binding && session.binding !== existingBinding) {
      session.binding.destroy();
      session.binding = null;
    }

    if (prevBoundId && prevBoundId !== fileId) {
      const prevBinding = paneBindings.get(prevBoundId);
      if (prevBinding) {
        prevBinding.destroy();
        paneBindings.delete(prevBoundId);
        if (pane === 'primary') {
          const prevSession = this.sessions.get(getRoomKey(projectId, prevBoundId));
          if (prevSession) {
            prevSession.binding = null;
          }
        }
      }
    }

    if (pane === 'secondary') {
      this.secondaryBoundFileId = fileId;
    } else {
      this.activeBoundFileId = fileId;
    }

    const model = targetModel ?? editor.getModel();
    if (!model) return null;

    const awareness = session.awareness;
    if (awareness) {
      const current = (awareness.getLocalState()?.user ?? {}) as AwarenessUserState;
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

    let createdBinding: MonacoBinding | null = null;
    try {
      // Clear model synchronously before attaching MonacoBinding to prevent buffer duplication
      if (model.getValue().length > 0) {
        model.setValue('');
      }

      const binding = new MonacoBinding(
        session.ytext,
        model,
        new Set([editor]),
        awareness
      );
      createdBinding = binding;
      paneBindings.set(fileId, binding);
      if (pane === 'primary') {
        session.binding = binding;
      }
    } catch (err) {
      console.warn('MonacoBinding initialized with local text model:', err);
    }

    return createdBinding;
  }

  /**
   * Cleans up and disposes the MonacoBinding for a file on one or both panes.
   */
  public destroyBinding(fileId: string, pane?: EditorPane): void {
    if (!pane || pane === 'primary') {
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

    if (!pane || pane === 'secondary') {
      const secBinding = this.secondaryBindings.get(fileId);
      if (secBinding) {
        secBinding.destroy();
        this.secondaryBindings.delete(fileId);
      }
      if (this.secondaryBoundFileId === fileId) {
        this.secondaryBoundFileId = null;
      }
    }
  }

  /**
   * Returns the active MonacoBinding for the given file and pane.
   */
  public getBinding(fileId: string, pane: EditorPane = 'primary'): MonacoBinding | undefined {
    return pane === 'secondary'
      ? this.secondaryBindings.get(fileId)
      : this.bindings.get(fileId);
  }

  /**
   * Updates local awareness cursor and selection coordinates.
   */
  public updateCursorAwareness(
    projectId: string,
    fileId: string,
    cursor: { line: number; column: number },
    selection?: { startLine: number; startColumn: number; endLine: number; endColumn: number }
  ): void {
    const session = this.getSession(projectId, fileId);
    if (!session?.awareness) return;

    const current = (session.awareness.getLocalState()?.user ?? {}) as AwarenessUserState;
    session.awareness.setLocalStateField('user', {
      ...current,
      fileId,
      cursor,
      selection,
    });
  }

  /**
   * Records line authorship metadata inside a Yjs transaction.
   */
  public recordAuthorship(
    projectId: string,
    fileId: string,
    lineNumber: number,
    author: { id: string; name: string; color: string }
  ): void {
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
   * Disposes bindings, providers, persistence, and Y.Doc for a file session.
   */
  public destroySession(projectId: string, fileId: string): void {
    this.destroyBinding(fileId);
    const roomKey = getRoomKey(projectId, fileId);
    const session = this.sessions.get(roomKey);
    if (!session) return;

    if (session.awareness) {
      session.awareness.setLocalState(null);
    }
    session.cleanups.forEach((cleanup) => cleanup());
    session.binding?.destroy();
    session.wsProvider?.destroy();
    session.webrtcProvider?.destroy();
    session.idbPersistence.destroy();
    session.doc.destroy();

    this.sessions.delete(roomKey);
  }
}

export const docManager = new YjsDocManager();
