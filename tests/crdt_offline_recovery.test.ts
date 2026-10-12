import { describe, it, expect } from 'vitest';
import * as Y from 'yjs';

interface RecoveryMetrics {
  offlineEdits: number;
  docChars: number;
  snapshotSizeBytes: number;
  hydrationLatencyMs: number;
  reconciliationLatencyMs: number;
  totalRecoveryMs: number;
}

describe('Offline Recovery Time Measurement (T3 / GAP_A)', () => {
  it('measures local hydration time and network reconciliation latency after offline divergence', () => {
    const editTiers = [10, 50, 100, 500, 1000];
    const metricsReport: RecoveryMetrics[] = [];

    // Warmup JIT to avoid cold-start compilation artifacts
    {
      const wDoc = new Y.Doc();
      wDoc.getText('t').insert(0, 'warmup');
      const u = Y.encodeStateAsUpdate(wDoc);
      const wDoc2 = new Y.Doc();
      Y.applyUpdate(wDoc2, u);
    }

    for (const N of editTiers) {
      // 1. Establish baseline remote and local replicas
      const remoteDoc = new Y.Doc();
      const localDoc = new Y.Doc();
      const remoteText = remoteDoc.getText('content');
      const localText = localDoc.getText('content');

      const seedCode = `// Project Core File\nfunction executeApp() {\n  console.log("ready");\n}\n`;
      remoteText.insert(0, seedCode);
      Y.applyUpdate(localDoc, Y.encodeStateAsUpdate(remoteDoc));

      // 2. Disconnect: Local replica performs N offline edits
      for (let i = 0; i < N; i++) {
        localText.insert(localText.length, `  const offline_var_${i} = ${i * 42};\n`);
      }

      // Also simulate concurrent remote edits while local was disconnected
      for (let j = 0; j < Math.max(5, Math.floor(N / 10)); j++) {
        remoteText.insert(remoteText.length, `  // remote modification ${j}\n`);
      }

      // 3. Measure Local Persistence & Hydration (Snapshot Recovery)
      // Note: In Node.js testing environment, browser IndexedDB is substituted
      // with Y.encodeStateAsUpdate / new Y.Doc + Y.applyUpdate binary snapshot hydration.
      const snapshotBytes = Y.encodeStateAsUpdate(localDoc);
      const snapshotSizeBytes = snapshotBytes.byteLength;

      const tHydrateStart = performance.now();
      const hydratedDoc = new Y.Doc();
      Y.applyUpdate(hydratedDoc, snapshotBytes);
      const hydrationLatencyMs = +(performance.now() - tHydrateStart).toFixed(4);

      // Verify hydration integrity
      expect(hydratedDoc.getText('content').toString()).toBe(localText.toString());

      // 4. Measure Reconnection & State Vector Reconciliation Time
      const tReconcileStart = performance.now();

      // State vector exchange
      const remoteSV = Y.encodeStateVector(remoteDoc);
      const localSV = Y.encodeStateVector(hydratedDoc);

      // Diff extraction
      const deltaToRemote = Y.encodeStateAsUpdate(hydratedDoc, remoteSV);
      const deltaToLocal = Y.encodeStateAsUpdate(remoteDoc, localSV);

      // Cross-application
      Y.applyUpdate(remoteDoc, deltaToRemote);
      Y.applyUpdate(hydratedDoc, deltaToLocal);

      const reconciliationLatencyMs = +(performance.now() - tReconcileStart).toFixed(4);

      // Both replicas must converge
      expect(hydratedDoc.getText('content').toString()).toBe(remoteDoc.getText('content').toString());

      const totalRecoveryMs = +(hydrationLatencyMs + reconciliationLatencyMs).toFixed(4);

      metricsReport.push({
        offlineEdits: N,
        docChars: hydratedDoc.getText('content').toString().length,
        snapshotSizeBytes,
        hydrationLatencyMs,
        reconciliationLatencyMs,
        totalRecoveryMs,
      });
    }

    // Format results table
    console.log('\n--- Offline Recovery Time & Reconciliation Benchmark ---');
    console.log(
      '| Offline Edits (N) | Doc Chars | Snapshot Size (bytes) | Hydration Time (ms) | Reconciliation Time (ms) | Total Recovery Time (ms) |'
    );
    console.log(
      '| :---: | :---: | :---: | :---: | :---: | :---: |'
    );
    for (const m of metricsReport) {
      console.log(
        `| ${m.offlineEdits} | ${m.docChars} | ${m.snapshotSizeBytes} | ${m.hydrationLatencyMs} | ${m.reconciliationLatencyMs} | ${m.totalRecoveryMs} |`
      );
    }
    console.log('---------------------------------------------------------\n');

    // Assertions on recovery scaling
    for (const m of metricsReport) {
      // Total recovery must comfortably complete in CI environment (< 100ms)
      expect(m.totalRecoveryMs).toBeLessThan(100);
      // Hydration must be sub-50ms under CI load
      expect(m.hydrationLatencyMs).toBeLessThan(50);
    }
  });
});
