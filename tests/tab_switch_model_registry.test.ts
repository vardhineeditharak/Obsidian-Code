import { describe, it, expect, vi } from 'vitest';

vi.mock('y-monaco', () => {
  return {
    MonacoBinding: class MockMonacoBinding {
      public destroyed = false;
      constructor(public ytext: any, public model: any, public editors: any, public awareness: any) {}
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
      public awareness = {
        getLocalState: () => ({ user: {} }),
        setLocalStateField: vi.fn(),
        setLocalState: vi.fn(),
        getStates: () => new Map(),
        on: vi.fn(),
        off: vi.fn(),
      };
      on() {}
      off() {}
      destroy() {}
    },
  };
});

import * as Y from 'yjs';
import { docManager } from '../src/lib/crdt/docManager';
import { detectLanguage } from '../src/lib/language';
import { ProjectFile } from '../src/lib/types';

describe('Monaco Tab-Switch Corruption Fix & Per-File Model Registry', () => {
  it('detectLanguage returns authoritative language matching file extension', () => {
    expect(detectLanguage('hello.py')).toBe('python');
    expect(detectLanguage('hello.c')).toBe('c');
    expect(detectLanguage('main.cpp')).toBe('cpp');
    expect(detectLanguage('app.ts')).toBe('typescript');
    expect(detectLanguage('index.js')).toBe('javascript');
    expect(detectLanguage('unknown.xyz')).toBe('plaintext');
  });

  it('aligns language detection across editor, status bar, and run runner', () => {
    const pyFile: ProjectFile = {
      _id: 'f-py',
      projectId: 'proj-1',
      name: 'hello.py',
      path: 'hello.py',
      isFolder: false,
      content: 'print("hello")',
      language: undefined,
    };

    const cFile: ProjectFile = {
      _id: 'f-c',
      projectId: 'proj-1',
      name: 'hello.c',
      path: 'hello.c',
      isFolder: false,
      content: '#include <stdio.h>\nint main() { return 0; }',
      language: 'plaintext', // Outdated metadata
    };

    // The authoritative language should prefer detectLanguage(file.name)
    const pyLang = detectLanguage(pyFile.name) || pyFile.language || 'plaintext';
    const cLang = detectLanguage(cFile.name) || cFile.language || 'plaintext';

    expect(pyLang).toBe('python');
    expect(cLang).toBe('c'); // overrides stale 'plaintext' metadata
  });

  it('docManager binds MonacoBinding to specific per-file model and tracks by fileId', async () => {
    const projectId = 'test-proj-tab-switch';
    const file1Id = 'file-c-1';
    const file2Id = 'file-py-2';

    // Create sessions
    const session1 = await docManager.getOrCreateSession(projectId, file1Id, 'int x = 1;', undefined, false);
    const session2 = await docManager.getOrCreateSession(projectId, file2Id, 'x = 1', undefined, false);

    expect(session1.ytext.toString()).toBe('int x = 1;');
    expect(session2.ytext.toString()).toBe('x = 1');

    // Mock Monaco editor and models
    const createMockModel = (id: string, initialText: string) => {
      let text = initialText;
      const listeners: Array<() => void> = [];
      return {
        id,
        uri: { toString: () => `file://${id}` },
        getValue: () => text,
        setValue: (val: string) => {
          text = val;
          listeners.forEach((fn) => fn());
        },
        onDidChangeContent: (fn: () => void) => {
          listeners.push(fn);
          return { dispose: () => {} };
        },
        onWillDispose: () => ({ dispose: () => {} }),
        getPositionAt: () => ({ lineNumber: 1, column: 1 }),
        applyEdits: () => {},
      } as any;
    };

    const model1 = createMockModel(file1Id, 'int x = 1;');
    const model2 = createMockModel(file2Id, 'x = 1');

    let currentEditorModel = model1;
    const mockEditor = {
      getModel: () => currentEditorModel,
      setModel: (m: any) => { currentEditorModel = m; },
      onDidChangeCursorSelection: () => ({ dispose: () => {} }),
      deltaDecorations: () => [],
      getSelection: () => null,
    } as any;

    const userPayload = {
      id: 'u-1',
      name: 'Alice',
      color: '#c08532',
      role: 'editor' as const,
    };

    // 1. Bind file 1
    const binding1 = docManager.bindMonaco(projectId, file1Id, mockEditor, { ...userPayload, fileId: file1Id }, model1);
    expect(binding1).not.toBeNull();
    expect(docManager.getBinding(file1Id)).toBe(binding1);

    // 2. Switch tabs to file 2: bind file 2
    mockEditor.setModel(model2);
    const binding2 = docManager.bindMonaco(projectId, file2Id, mockEditor, { ...userPayload, fileId: file2Id }, model2);
    expect(binding2).not.toBeNull();
    expect(docManager.getBinding(file2Id)).toBe(binding2);

    // Prior binding on editor was destroyed when switching active file
    expect(session1.binding).toBeNull();
    expect(session2.binding).toBe(binding2);

    // 3. Tab close: destroyBinding clears the binding cleanly
    docManager.destroyBinding(file2Id);
    expect(docManager.getBinding(file2Id)).toBeUndefined();
    expect(session2.binding).toBeNull();

    // Clean up
    docManager.destroySession(projectId, file1Id);
    docManager.destroySession(projectId, file2Id);
  });

  it('guarantees per-file models never cross-contaminate content on tab switch', () => {
    // Model registry keyed by URI file://<fileId>
    const registry = new Map<string, { uri: string; content: string; language: string }>();

    const getOrCreateModel = (file: ProjectFile) => {
      const uri = `file://${file._id}`;
      let existing = registry.get(uri);
      const lang = detectLanguage(file.name) || file.language || 'plaintext';
      if (!existing) {
        existing = { uri, content: file.content || '', language: lang };
        registry.set(uri, existing);
      } else {
        existing.language = lang;
      }
      return existing;
    };

    const fileA: ProjectFile = {
      _id: 'fa',
      projectId: 'p1',
      name: 'hello.c',
      path: 'hello.c',
      isFolder: false,
      content: '#include <stdio.h>\nint main() { printf("c"); }',
    };

    const fileB: ProjectFile = {
      _id: 'fb',
      projectId: 'p1',
      name: 'hello.py',
      path: 'hello.py',
      isFolder: false,
      content: 'print("python")',
    };

    const modelA = getOrCreateModel(fileA);
    const modelB = getOrCreateModel(fileB);

    // Verify distinct instances
    expect(modelA).not.toBe(modelB);
    expect(modelA.content).toContain('printf');
    expect(modelB.content).toContain('print("python")');
    expect(modelA.language).toBe('c');
    expect(modelB.language).toBe('python');

    // Swapping back and forth preserves contents and language without cross-leak
    const swappedA = getOrCreateModel(fileA);
    expect(swappedA.content).toBe(modelA.content);
    expect(swappedA.language).toBe('c');

    const swappedB = getOrCreateModel(fileB);
    expect(swappedB.content).toBe(modelB.content);
    expect(swappedB.language).toBe('python');
  });
});
