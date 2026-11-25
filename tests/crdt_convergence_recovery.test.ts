import { describe, it, expect } from 'vitest';
import * as Y from 'yjs';
import type { ProjectFile, VersionCheckpoint } from '../src/lib/types';

interface RecoveryMetrics {
  offlineEdits: number;
  docChars: number;
  snapshotSizeBytes: number;
  hydrationLatencyMs: number;
  reconciliationLatencyMs: number;
  totalRecoveryMs: number;
}

describe('Yjs CRDT Convergence, Offline Recovery & Checkpoint Restoration', () => {
  describe('Core CRDT Document Convergence & Line Authorship', () => {
    it('converges deterministically when two clients perform concurrent non-overlapping edits', () => {
      const docA = new Y.Doc();
      const docB = new Y.Doc();
      const textA = docA.getText('content');
      const textB = docB.getText('content');

      textA.insert(0, 'Hello World');
      Y.applyUpdate(docB, Y.encodeStateAsUpdate(docA));
      expect(textB.toString()).toBe('Hello World');

      textA.insert(5, ' Beautiful');
      textB.insert(11, '!');

      const updateA = Y.encodeStateAsUpdate(docA, Y.encodeStateVector(docB));
      const updateB = Y.encodeStateAsUpdate(docB, Y.encodeStateVector(docA));
      Y.applyUpdate(docB, updateA);
      Y.applyUpdate(docA, updateB);

      expect(textA.toString()).toBe(textB.toString());
      expect(textA.toString()).toBe('Hello Beautiful World!');
    });

    it('preserves concurrent same-position insertions without data loss and tracks lineAuthors', () => {
      const doc1 = new Y.Doc();
      const doc2 = new Y.Doc();
      doc1.getText('content').insert(0, 'Alpha');
      doc2.getText('content').insert(0, 'Beta');

      const u1 = Y.encodeStateAsUpdate(doc1);
      const u2 = Y.encodeStateAsUpdate(doc2);
      Y.applyUpdate(doc2, u1);
      Y.applyUpdate(doc1, u2);

      const merged = doc1.getText('content').toString();
      expect(merged).toBe(doc2.getText('content').toString());
      expect(merged).toContain('Alpha');
      expect(merged).toContain('Beta');

      const lineAuthors = doc1.getMap('lineAuthors');
      doc1.transact(() => {
        lineAuthors.set('1', {
          authorId: 'user-123',
          authorName: 'Sarah',
          color: '#c08532',
          timestamp: 1672531199000,
        });
      }, 'line-authorship');

      expect(lineAuthors.get('1')).toEqual({
        authorId: 'user-123',
        authorName: 'Sarah',
        color: '#c08532',
        timestamp: 1672531199000,
      });
    });
  });

  describe('Offline Divergence & Reconnection Convergence (T1 / GAP_B)', () => {
    it('converges deterministically with zero lost updates after extended offline divergence', () => {
      const docA = new Y.Doc();
      const docB = new Y.Doc();
      const textA = docA.getText('content');
      const textB = docB.getText('content');

      const initialCode = `function calculateTotal(items) {\n  let sum = 0;\n  return sum;\n}\n`;
      textA.insert(0, initialCode);
      Y.applyUpdate(docB, Y.encodeStateAsUpdate(docA));

      // Offline edits on A
      textA.insert(textA.toString().indexOf('return sum;'), '  for (const item of items) {\n    sum += item.price;\n  }\n');
      textA.insert(0, '/** Calculates item total */\n');

      // Offline edits on B
      textB.insert(textB.toString().indexOf('return sum;'), '  const tax = sum * 0.05;\n');
      const returnIdx = textB.toString().indexOf('return sum;');
      textB.delete(returnIdx, 'return sum;'.length);
      textB.insert(returnIdx, 'return sum + tax;');

      expect(textA.toString()).not.toBe(textB.toString());

      const svA = Y.encodeStateVector(docA);
      const svB = Y.encodeStateVector(docB);
      Y.applyUpdate(docB, Y.encodeStateAsUpdate(docA, svB));
      Y.applyUpdate(docA, Y.encodeStateAsUpdate(docB, svA));

      expect(textA.toString()).toBe(textB.toString());
      const converged = textA.toString();
      expect(converged).toContain('/** Calculates item total */');
      expect(converged).toContain('sum += item.price');
      expect(converged).toContain('const tax = sum * 0.05;');
      expect(converged).toContain('return sum + tax;');
    });

    it('converges across a 3-replica network partition and healing and minimizes delta bytes', () => {
      const docA = new Y.Doc();
      const docB = new Y.Doc();
      const docC = new Y.Doc();

      docA.getText('content').insert(0, '// Header\n');
      const initUpdate = Y.encodeStateAsUpdate(docA);
      Y.applyUpdate(docB, initUpdate);
      Y.applyUpdate(docC, initUpdate);

      docA.getText('content').insert(docA.getText('content').length, 'const a = 1;\n');
      Y.applyUpdate(docB, Y.encodeStateAsUpdate(docA, Y.encodeStateVector(docB)));
      docB.getText('content').insert(docB.getText('content').length, 'const b = 2;\n');
      Y.applyUpdate(docA, Y.encodeStateAsUpdate(docB, Y.encodeStateVector(docA)));

      docC.getText('content').insert(docC.getText('content').length, 'const c = 3;\nexport { c };\n');

      // Heal partition
      Y.applyUpdate(docA, Y.encodeStateAsUpdate(docC, Y.encodeStateVector(docA)));
      Y.applyUpdate(docC, Y.encodeStateAsUpdate(docA, Y.encodeStateVector(docC)));
      Y.applyUpdate(docB, Y.encodeStateAsUpdate(docC, Y.encodeStateVector(docB)));
      Y.applyUpdate(docC, Y.encodeStateAsUpdate(docB, Y.encodeStateVector(docC)));

      expect(docA.getText('content').toString()).toBe(docB.getText('content').toString());
      expect(docB.getText('content').toString()).toBe(docC.getText('content').toString());
      expect(docA.getText('content').toString()).toContain('export { c };');

      // State vector delta efficiency check
      const baseA = new Y.Doc();
      const baseB = new Y.Doc();
      let baseline = '';
      for (let i = 0; i < 50; i++) baseline += `const line${i} = ${i};\n`;
      baseA.getText('content').insert(0, baseline);
      Y.applyUpdate(baseB, Y.encodeStateAsUpdate(baseA));

      const fullBytes = Y.encodeStateAsUpdate(baseA).byteLength;
      baseA.getText('content').insert(baseA.getText('content').length, '// Tiny offline edit\n');
      const deltaBytes = Y.encodeStateAsUpdate(baseA, Y.encodeStateVector(baseB)).byteLength;
      expect(deltaBytes).toBeLessThan(fullBytes * 0.3);
    });
  });

  describe('Offline Recovery Time Measurement (T3 / GAP_A)', () => {
    it('measures sub-50ms snapshot hydration and sub-100ms reconciliation across edit tiers', () => {
      const editTiers = [10, 50, 100, 500, 1000];
      const metricsReport: RecoveryMetrics[] = [];

      // Warmup
      const wDoc = new Y.Doc();
      wDoc.getText('content').insert(0, 'warmup');
      Y.applyUpdate(new Y.Doc(), Y.encodeStateAsUpdate(wDoc));

      for (const n of editTiers) {
        const remoteDoc = new Y.Doc();
        const localDoc = new Y.Doc();
        remoteDoc.getText('content').insert(0, '// Core\nfunction run() {}\n');
        Y.applyUpdate(localDoc, Y.encodeStateAsUpdate(remoteDoc));

        const localText = localDoc.getText('content');
        for (let i = 0; i < n; i++) {
          localText.insert(localText.length, `  const offline_${i} = ${i};\n`);
        }
        const remoteText = remoteDoc.getText('content');
        for (let j = 0; j < Math.max(5, Math.floor(n / 10)); j++) {
          remoteText.insert(remoteText.length, `  // remote_${j}\n`);
        }

        const snapshotBytes = Y.encodeStateAsUpdate(localDoc);
        const tHydrateStart = performance.now();
        const hydratedDoc = new Y.Doc();
        Y.applyUpdate(hydratedDoc, snapshotBytes);
        const hydrationLatencyMs = +(performance.now() - tHydrateStart).toFixed(4);
        expect(hydratedDoc.getText('content').toString()).toBe(localText.toString());

        const tReconcileStart = performance.now();
        const remoteSV = Y.encodeStateVector(remoteDoc);
        const localSV = Y.encodeStateVector(hydratedDoc);
        Y.applyUpdate(remoteDoc, Y.encodeStateAsUpdate(hydratedDoc, remoteSV));
        Y.applyUpdate(hydratedDoc, Y.encodeStateAsUpdate(remoteDoc, localSV));
        const reconciliationLatencyMs = +(performance.now() - tReconcileStart).toFixed(4);

        expect(hydratedDoc.getText('content').toString()).toBe(remoteDoc.getText('content').toString());
        const totalRecoveryMs = +(hydrationLatencyMs + reconciliationLatencyMs).toFixed(4);

        metricsReport.push({
          offlineEdits: n,
          docChars: hydratedDoc.getText('content').toString().length,
          snapshotSizeBytes: snapshotBytes.byteLength,
          hydrationLatencyMs,
          reconciliationLatencyMs,
          totalRecoveryMs,
        });
      }

      for (const m of metricsReport) {
        expect(m.hydrationLatencyMs).toBeLessThan(50);
        expect(m.totalRecoveryMs).toBeLessThan(100);
      }
    });
  });

  describe('Live Content Truth & Checkpoint CRDT Application', () => {
    it('collects live content prioritizing activeContent > CRDT ytext > stored file.content', () => {
      const files: ProjectFile[] = [
        { _id: 'f1', projectId: 'p1', name: 'app.js', path: 'app.js', isFolder: false, content: 'stale disk 1' },
        { _id: 'f2', projectId: 'p1', name: 'utils.js', path: 'utils.js', isFolder: false, content: 'stale disk 2' },
        { _id: 'f3', projectId: 'p1', name: 'styles.css', path: 'styles.css', isFolder: false, content: 'body {}' },
      ];

      const doc2 = new Y.Doc();
      doc2.getText('content').insert(0, 'live crdt peer update');
      const sessions = new Map<string, { ytext: Y.Text }>([['p1:f2', { ytext: doc2.getText('content') }]]);

      const getLiveFileContent = (fileId: string, activeFileId: string, activeContent: string) => {
        if (fileId === activeFileId) return activeContent;
        const session = sessions.get(`p1:${fileId}`);
        if (session) return session.ytext.toString();
        return files.find((f) => f._id === fileId)?.content || '';
      };

      expect(getLiveFileContent('f1', 'f1', 'fresh typing')).toBe('fresh typing');
      expect(getLiveFileContent('f2', 'f1', 'fresh typing')).toBe('live crdt peer update');
      expect(getLiveFileContent('f3', 'f1', 'fresh typing')).toBe('body {}');
    });

    it('applies restored checkpoints via atomic delete+insert transactions and propagates to peers', () => {
      const localDoc = new Y.Doc();
      const peerDoc = new Y.Doc();
      const localText = localDoc.getText('content');
      const peerText = peerDoc.getText('content');

      localText.insert(0, 'console.log("initial");');
      Y.applyUpdate(peerDoc, Y.encodeStateAsUpdate(localDoc));
      localText.insert(localText.length, '\n// unsaved draft');
      Y.applyUpdate(peerDoc, Y.encodeStateAsUpdate(localDoc));

      const checkpoint: VersionCheckpoint = {
        _id: 'ver-1',
        projectId: 'p1',
        name: 'Pristine v1',
        createdBy: { userId: 'u1', name: 'Dev' },
        createdAt: new Date().toISOString(),
        files: [{ fileId: 'f1', fileName: 'app.js', content: 'console.log("restored");' }],
      };

      localDoc.transact(() => {
        localText.delete(0, localText.length);
        localText.insert(0, checkpoint.files[0].content);
      });

      Y.applyUpdate(peerDoc, Y.encodeStateAsUpdate(localDoc));
      expect(localText.toString()).toBe('console.log("restored");');
      expect(peerText.toString()).toBe('console.log("restored");');
    });
  });
});
