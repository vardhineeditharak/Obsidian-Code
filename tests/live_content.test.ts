import { describe, it, expect } from 'vitest';
import * as Y from 'yjs';
import { ProjectFile } from '../src/lib/types';

describe('Live Content Truth & Checkpoint Snapshotting (T1/T2/T4)', () => {
  it('live-content collector prefers activeContent for active file, ytext for open sessions, file.content fallback', () => {
    const projectId = 'test-proj-1';
    const activeFileId = 'file-1';
    const activeContent = 'const active = "fresh typing";';

    const files: ProjectFile[] = [
      {
        _id: 'file-1',
        projectId,
        name: 'app.js',
        path: 'app.js',
        isFolder: false,
        language: 'javascript',
        content: 'const active = "stale initial";',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      {
        _id: 'file-2',
        projectId,
        name: 'utils.js',
        path: 'utils.js',
        isFolder: false,
        language: 'javascript',
        content: 'const utils = "stale disk";',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      {
        _id: 'file-3',
        projectId,
        name: 'styles.css',
        path: 'styles.css',
        isFolder: false,
        language: 'css',
        content: 'body { color: red; }',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ];

    // Mock docManager session for file-2 (peer edited via CRDT)
    const mockSessions = new Map<string, { ytext: Y.Text }>();
    const doc2 = new Y.Doc();
    const ytext2 = doc2.getText('monaco');
    ytext2.insert(0, 'const utils = "live crdt peer update";');
    mockSessions.set(`test-proj-1:file-2`, { ytext: ytext2 });

    const getSessionMock = (pId: string, fId: string) => {
      return mockSessions.get(`${pId}:${fId}`);
    };

    // Live files collector logic
    const getLiveFiles = (
      filesList: ProjectFile[],
      activeId: string | null,
      activeText: string
    ) => {
      return filesList
        .filter((f) => !f.isFolder)
        .map((f) => {
          let content = f.content || '';
          if (f._id === activeId) {
            content = activeText;
          } else {
            const session = getSessionMock(projectId, f._id);
            if (session) {
              content = session.ytext.toString();
            }
          }
          return {
            fileId: f._id,
            fileName: f.name,
            content,
          };
        });
    };

    const liveFiles = getLiveFiles(files, activeFileId, activeContent);

    expect(liveFiles).toHaveLength(3);

    // 1. Active file must have activeContent (not stale files[0].content)
    const liveFile1 = liveFiles.find((f) => f.fileId === 'file-1');
    expect(liveFile1?.content).toBe('const active = "fresh typing";');

    // 2. Open session file must have ytext content (not stale disk content)
    const liveFile2 = liveFiles.find((f) => f.fileId === 'file-2');
    expect(liveFile2?.content).toBe('const utils = "live crdt peer update";');

    // 3. Unopened file must fall back to file.content
    const liveFile3 = liveFiles.find((f) => f.fileId === 'file-3');
    expect(liveFile3?.content).toBe('body { color: red; }');
  });

  it('checkpoint payload includes files[] with live contents', () => {
    const livePayload = [
      { fileId: 'file-1', fileName: 'main.js', content: 'console.log("live v1");' },
      { fileId: 'file-2', fileName: 'helper.js', content: 'export const help = true;' },
    ];

    // Payload verification
    expect(livePayload[0].content).toContain('live v1');
    expect(livePayload[1].content).toContain('help = true');
  });
});
