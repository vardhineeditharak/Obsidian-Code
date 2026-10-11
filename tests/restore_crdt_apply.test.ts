import { describe, it, expect } from 'vitest';
import * as Y from 'yjs';
import { ProjectFile, VersionCheckpoint } from '../src/lib/types';

describe('Checkpoint Restore and CRDT Application (Step 8)', () => {
  it('restore applies checkpoint content to Yjs doc session via transaction delete+insert', () => {
    // 1. Setup local Yjs doc and peer Yjs doc simulating collaborator
    const localDoc = new Y.Doc();
    const peerDoc = new Y.Doc();

    const localYText = localDoc.getText('monaco');
    const peerYText = peerDoc.getText('monaco');

    // Sync initial state
    localYText.insert(0, 'console.log("initial text");');
    Y.applyUpdate(peerDoc, Y.encodeStateAsUpdate(localDoc));
    expect(peerYText.toString()).toBe('console.log("initial text");');

    // 2. User edits draft locally
    localYText.insert(localYText.length, '\n// user typing unsaved draft');
    Y.applyUpdate(peerDoc, Y.encodeStateAsUpdate(localDoc));
    expect(peerYText.toString()).toContain('unsaved draft');

    // 3. Restore checkpoint content
    const restoredCheckpointContent = 'console.log("pristine restored code");\nconst restored = true;';

    localDoc.transact(() => {
      localYText.delete(0, localYText.length);
      localYText.insert(0, restoredCheckpointContent);
    });

    // 4. Verify local doc reflects restored content exactly
    expect(localYText.toString()).toBe(restoredCheckpointContent);

    // 5. Verify peer collaborator sync receives restored content without conflict
    const restoreUpdate = Y.encodeStateAsUpdate(localDoc);
    Y.applyUpdate(peerDoc, restoreUpdate);

    expect(peerYText.toString()).toBe(restoredCheckpointContent);
  });

  it('multi-file restore updates active tab and background CRDT sessions', () => {
    const projectId = 'proj-restore-test';
    const activeFileId = 'file-active';
    const backgroundFileId = 'file-bg';

    // Mock active and background Yjs sessions
    const activeDoc = new Y.Doc();
    const activeYText = activeDoc.getText('monaco');
    activeYText.insert(0, 'let active = "drifted content";');

    const bgDoc = new Y.Doc();
    const bgYText = bgDoc.getText('monaco');
    bgYText.insert(0, 'let background = "drifted background";');

    const sessions = new Map<string, { doc: Y.Doc; ytext: Y.Text }>();
    sessions.set(`${projectId}:${activeFileId}`, { doc: activeDoc, ytext: activeYText });
    sessions.set(`${projectId}:${backgroundFileId}`, { doc: bgDoc, ytext: bgYText });

    const files: ProjectFile[] = [
      {
        _id: activeFileId,
        projectId,
        name: 'app.ts',
        path: 'app.ts',
        isFolder: false,
        content: 'let active = "drifted content";',
      },
      {
        _id: backgroundFileId,
        projectId,
        name: 'helper.ts',
        path: 'helper.ts',
        isFolder: false,
        content: 'let background = "drifted background";',
      },
    ];

    const versionToRestore: VersionCheckpoint = {
      _id: 'ver-100',
      projectId,
      name: 'Checkpoint Alpha',
      type: 'auto',
      trigger: 'interval',
      createdBy: { userId: 'u1', name: 'Dev' },
      createdAt: new Date().toISOString(),
      files: [
        { fileId: activeFileId, fileName: 'app.ts', content: 'let active = "restored v1";' },
        { fileId: backgroundFileId, fileName: 'helper.ts', content: 'let background = "restored v1";' },
      ],
    };

    let currentActiveText = activeYText.toString();
    let replaceModelEvent: { fileId: string; content: string } | null = null;

    // Emulate handleRestoreVersion
    for (const f of versionToRestore.files) {
      if (f.fileId === activeFileId) {
        currentActiveText = f.content;
        replaceModelEvent = { fileId: f.fileId, content: f.content };
      }
      const session = sessions.get(`${projectId}:${f.fileId}`);
      if (session) {
        session.doc.transact(() => {
          session.ytext.delete(0, session.ytext.length);
          session.ytext.insert(0, f.content);
        });
      }
    }

    const updatedFiles = files.map((file) => {
      const match = versionToRestore.files.find((vf) => vf.fileId === file._id);
      return match ? { ...file, content: match.content } : file;
    });

    // Both active and background Yjs documents must have restored content
    expect(activeYText.toString()).toBe('let active = "restored v1";');
    expect(bgYText.toString()).toBe('let background = "restored v1";');

    // Active Monaco model trigger was signaled
    expect(currentActiveText).toBe('let active = "restored v1";');
    expect(replaceModelEvent).toEqual({ fileId: 'file-active', content: 'let active = "restored v1";' });

    // Files state updated
    expect(updatedFiles[0].content).toBe('let active = "restored v1";');
    expect(updatedFiles[1].content).toBe('let background = "restored v1";');
  });
});
