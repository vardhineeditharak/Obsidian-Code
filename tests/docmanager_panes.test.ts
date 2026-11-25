import { describe, it, expect, vi, beforeEach } from 'vitest';

const wsProviderCalls: any[] = [];
const webrtcProviderCalls: any[] = [];

vi.mock('y-monaco', () => {
  return {
    MonacoBinding: class MockMonacoBinding {
      public destroyed = false;
      constructor(public ytext: any, public model: any, public editors: any, public awareness: any) {
        if (model && ytext && typeof model.setValue === 'function') {
          model.setValue(ytext.toString());
        }
      }
      destroy() {
        this.destroyed = true;
      }
    },
  };
});

vi.mock('y-indexeddb', () => {
  return {
    IndexeddbPersistence: class MockIndexeddbPersistence {
      public whenSynced = Promise.resolve();
      destroy() {}
    },
  };
});

vi.mock('y-websocket', () => {
  return {
    WebsocketProvider: class MockWebsocketProvider {
      public awareness: any;
      constructor(public serverUrl: string, public roomname: string, public doc: any, public opts: any) {
        wsProviderCalls.push({ serverUrl, roomname, opts });
        const states = new Map<number, any>();
        const listeners = new Set<() => void>();
        this.awareness = {
          getLocalState: () => states.get(1) ?? null,
          setLocalStateField: (field: string, value: any) => {
            const cur = states.get(1) ?? {};
            states.set(1, { ...cur, [field]: value });
            listeners.forEach((fn) => fn());
          },
          setLocalState: (val: any) => {
            if (val === null) states.delete(1);
            else states.set(1, val);
            listeners.forEach((fn) => fn());
          },
          getStates: () => states,
          on: (_ev: string, fn: () => void) => listeners.add(fn),
          off: (_ev: string, fn: () => void) => listeners.delete(fn),
        };
      }
      on() {}
      off() {}
      destroy() {}
    },
  };
});

vi.mock('y-webrtc', () => {
  return {
    WebrtcProvider: class MockWebrtcProvider {
      public awareness: any;
      constructor(public roomName: string, public doc: any, public opts: any) {
        webrtcProviderCalls.push({ roomName, opts });
        this.awareness = opts?.awareness ?? {
          getLocalState: () => null,
          setLocalStateField: vi.fn(),
          setLocalState: vi.fn(),
          getStates: () => new Map(),
          on: vi.fn(),
          off: vi.fn(),
        };
      }
      destroy() {}
    },
  };
});

import { docManager } from '../src/lib/crdt/docManager';
import { detectLanguage } from '../src/lib/language';
import type { ProjectFile } from '../src/lib/types';

function createMockModel(id: string, initialText: string) {
  let text = initialText;
  const setValueCalls: string[] = [];
  return {
    id,
    uri: { toString: () => `file://${id}` },
    setValueCalls,
    getValue: () => text,
    setValue: (val: string) => {
      setValueCalls.push(val);
      text = val;
    },
    onDidChangeContent: () => ({ dispose: () => {} }),
    onWillDispose: () => ({ dispose: () => {} }),
    getPositionAt: () => ({ lineNumber: 1, column: 1 }),
    applyEdits: () => {},
  } as any;
}

function createMockEditor(initialModel: any) {
  let currentModel = initialModel;
  return {
    getModel: () => currentModel,
    setModel: (m: any) => {
      currentModel = m;
    },
    onDidChangeCursorSelection: () => ({ dispose: () => {} }),
    deltaDecorations: () => [],
    getSelection: () => null,
  } as any;
}

describe('YjsDocManager Tab-Switch Isolation & Independent Split Panes', () => {
  beforeEach(() => {
    wsProviderCalls.length = 0;
    webrtcProviderCalls.length = 0;
    docManager.setTransportMode('Hybrid');
  });

  it('deduplicates concurrent getOrCreateSession calls and never exposes documents to WebRTC P2P', async () => {
    const projPriv = 'proj-priv-sec';
    const filePriv = 'file-priv-1';

    const [s1, s2] = await Promise.all([
      docManager.getOrCreateSession(projPriv, filePriv, 'const priv = 1;', undefined, false),
      docManager.getOrCreateSession(projPriv, filePriv, 'const priv = 1;', undefined, false),
    ]);
    expect(s1).toBe(s2);
    expect(s1.ytext.toString()).toBe('const priv = 1;');
    expect(wsProviderCalls).toHaveLength(1);
    expect(webrtcProviderCalls).toHaveLength(0);

    const projPub = 'proj-pub-sec';
    const filePub = 'file-pub-1';
    const sPub = await docManager.getOrCreateSession(projPub, filePub, 'const pub = 2;', undefined, true);
    // Public signaling peers bypass server RBAC, so P2P is disabled here too.
    expect(sPub.webrtcProvider).toBeNull();
    expect(webrtcProviderCalls).toHaveLength(0);

    docManager.setTransportMode('WebSocket Only');
    const sWsOnly = await docManager.getOrCreateSession(projPub, 'file-ws-only', 'ws', undefined, true);
    expect(sWsOnly.wsProvider).not.toBeNull();
    expect(sWsOnly.webrtcProvider).toBeNull();

    // P2P Mesh Only still uses the server-backed relay (P2P is unavailable).
    docManager.setTransportMode('P2P Mesh Only');
    const sP2pOnly = await docManager.getOrCreateSession(projPub, 'file-p2p-only', 'p2p', undefined, true);
    expect(sP2pOnly.wsProvider).not.toBeNull();
    expect(sP2pOnly.webrtcProvider).toBeNull();

    docManager.destroySession(projPriv, filePriv);
    docManager.destroySession(projPub, filePub);
    docManager.destroySession(projPub, 'file-ws-only');
    docManager.destroySession(projPub, 'file-p2p-only');
  });

  it('prevents buffer duplication on bindMonaco and isolates tab switches', async () => {
    const projectId = 'proj-tab-iso';
    const file1Id = 'file-c';
    const file2Id = 'file-py';
    const codeC = '#include <stdio.h>\nint main() { return 0; }';
    const codePy = 'print("hello")';

    const s1 = await docManager.getOrCreateSession(projectId, file1Id, codeC, undefined, false);
    const s2 = await docManager.getOrCreateSession(projectId, file2Id, codePy, undefined, false);

    // Pre-seeded model content simulates an existing model before binding
    const model1 = createMockModel(file1Id, codeC);
    const model2 = createMockModel(file2Id, codePy);
    const editor = createMockEditor(model1);

    const payload = { id: 'u1', name: 'Alice', color: '#c08532', role: 'editor' as const };

    const b1 = docManager.bindMonaco(projectId, file1Id, editor, { ...payload, fileId: file1Id }, model1, 'primary');
    expect(b1).not.toBeNull();
    // Synchronous clear before MonacoBinding hydration prevents C + C duplication
    expect(model1.setValueCalls[0]).toBe('');
    expect(model1.getValue()).toBe(codeC);

    // Switch tab to file2
    editor.setModel(model2);
    const b2 = docManager.bindMonaco(projectId, file2Id, editor, { ...payload, fileId: file2Id }, model2, 'primary');
    expect(b2).not.toBeNull();
    expect((b1 as any).destroyed).toBe(true);
    expect(s1.binding).toBeNull();
    expect(s2.binding).toBe(b2);
    expect(docManager.getBinding(file2Id, 'primary')).toBe(b2);

    // Detect language alignment across C & Python files
    const pyFile: ProjectFile = {
      _id: file2Id,
      projectId,
      name: 'hello.py',
      path: 'hello.py',
      isFolder: false,
      language: 'plaintext',
    };
    expect(detectLanguage(pyFile.name)).toBe('python');

    docManager.destroySession(projectId, file1Id);
    docManager.destroySession(projectId, file2Id);
  });

  it('supports independent primary and secondary split-pane bindings without cross-destruction', async () => {
    const projectId = 'proj-split-panes';
    const fileA = 'split-a';
    const fileB = 'split-b';

    const sessionA = await docManager.getOrCreateSession(projectId, fileA, 'const a = 1;', undefined, false);
    const sessionB = await docManager.getOrCreateSession(projectId, fileB, 'print("b")', undefined, false);

    const modelA = createMockModel(fileA, 'const a = 1;');
    const modelB = createMockModel(fileB, 'print("b")');
    const primaryEditor = createMockEditor(modelA);
    const secondaryEditor = createMockEditor(modelB);

    const user = { id: 'u1', name: 'Dev', color: '#c08532', role: 'editor' as const };
    const primaryBinding = docManager.bindMonaco(
      projectId,
      fileA,
      primaryEditor,
      { ...user, fileId: fileA },
      modelA,
      'primary'
    );
    const secondaryBinding = docManager.bindMonaco(
      projectId,
      fileB,
      secondaryEditor,
      { ...user, fileId: fileB },
      modelB,
      'secondary'
    );

    expect(docManager.getBinding(fileA, 'primary')).toBe(primaryBinding);
    expect(docManager.getBinding(fileB, 'secondary')).toBe(secondaryBinding);

    // Destroying primary binding on fileA does not affect secondary pane on fileB
    docManager.destroyBinding(fileA, 'primary');
    expect(docManager.getBinding(fileA, 'primary')).toBeUndefined();
    expect(docManager.getBinding(fileB, 'secondary')).toBe(secondaryBinding);
    expect((secondaryBinding as any).destroyed).toBe(false);

    // Destroying secondary binding on fileB leaves sessionB open
    docManager.destroyBinding(fileB, 'secondary');
    expect(docManager.getBinding(fileB, 'secondary')).toBeUndefined();
    expect(sessionA.binding).toBeNull();
    expect(docManager.getSession(projectId, fileB)).toBe(sessionB);

    docManager.destroySession(projectId, fileA);
    docManager.destroySession(projectId, fileB);
  });

  it('manages awareness presence, cursor updates, and line authorship metadata', async () => {
    const projectId = 'proj-awareness';
    const fileId = 'aware.ts';
    const session = await docManager.getOrCreateSession(projectId, fileId, 'let x = 1;', undefined, false);

    const seenCollaborators: any[][] = [];
    const unsubscribe = docManager.subscribeAwareness(projectId, fileId, (list) => {
      seenCollaborators.push(list);
    });

    docManager.setLocalAwareness(projectId, fileId, {
      id: 'u-aw-1',
      name: 'Ada Lovelace',
      color: '#a78bfa',
      role: 'owner',
    });

    docManager.updateCursorAwareness(projectId, fileId, { line: 4, column: 12 });
    const latest = seenCollaborators[seenCollaborators.length - 1];
    expect(latest).toHaveLength(1);
    expect(latest[0]).toMatchObject({
      id: 'u-aw-1',
      name: 'Ada Lovelace',
      role: 'owner',
      fileId,
      cursor: { line: 4, column: 12 },
    });

    docManager.recordAuthorship(projectId, fileId, 4, {
      id: 'u-aw-1',
      name: 'Ada Lovelace',
      color: '#a78bfa',
    });
    expect(session.lineAuthors.get('4')?.authorName).toBe('Ada Lovelace');

    unsubscribe();
    docManager.destroySession(projectId, fileId);
    expect(docManager.getSession(projectId, fileId)).toBeUndefined();
  });
});
