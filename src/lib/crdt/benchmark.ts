import * as Y from 'yjs';

export interface LatencyBenchmarkResult {
  editCount: number;
  textLengthChars: number;
  encodedUpdateBytes: number;
  stateVectorBytes: number;
  expansionRatio: number;
  encodeLatencyMs: number;
  applyLatencyMs: number;
}

export interface OfflineDivergenceBenchmarkResult {
  offlineEdits: number;
  baseDocChars: number;
  divergentUpdateBytes: number;
  stateVectorBytes: number;
  diffEncodeLatencyMs: number;
  diffApplyLatencyMs: number;
  convergedTextChars: number;
}

/**
 * Benchmarks Yjs serialization size, state vector size, and merge application latency
 * across varying sequential edit counts.
 */
export function runLatencyBenchmark(
  editCounts: number[] = [1, 10, 100, 500, 1000, 2000]
): LatencyBenchmarkResult[] {
  const results: LatencyBenchmarkResult[] = [];

  for (const count of editCounts) {
    const docSource = new Y.Doc();
    const textSource = docSource.getText('content');

    for (let i = 0; i < count; i++) {
      textSource.insert(textSource.length, `const val_${i} = ${i * 10};\n`);
    }

    const textLengthChars = textSource.toString().length;

    const t0 = performance.now();
    const encodedUpdate = Y.encodeStateAsUpdate(docSource);
    const encodeLatencyMs = +(performance.now() - t0).toFixed(4);

    const stateVector = Y.encodeStateVector(docSource);
    const stateVectorBytes = stateVector.byteLength;
    const encodedUpdateBytes = encodedUpdate.byteLength;
    const expansionRatio = +(encodedUpdateBytes / (textLengthChars || 1)).toFixed(3);

    const docTarget = new Y.Doc();
    const t1 = performance.now();
    Y.applyUpdate(docTarget, encodedUpdate);
    const applyLatencyMs = +(performance.now() - t1).toFixed(4);

    results.push({
      editCount: count,
      textLengthChars,
      encodedUpdateBytes,
      stateVectorBytes,
      expansionRatio,
      encodeLatencyMs,
      applyLatencyMs,
    });
  }

  return results;
}

/**
 * Benchmarks state-vector delta size and merge latency after two replicas diverge offline.
 */
export function runOfflineDivergenceBenchmark(
  divergenceCounts: number[] = [1, 10, 50, 100, 500, 1000]
): OfflineDivergenceBenchmarkResult[] {
  const results: OfflineDivergenceBenchmarkResult[] = [];

  for (const offlineEdits of divergenceCounts) {
    const docA = new Y.Doc();
    const docB = new Y.Doc();
    const textA = docA.getText('content');
    const textB = docB.getText('content');

    textA.insert(0, '// Shared Baseline Module\nfunction run() {\n  return 0;\n}\n');
    Y.applyUpdate(docB, Y.encodeStateAsUpdate(docA));
    const baseDocChars = textA.toString().length;

    for (let i = 0; i < offlineEdits; i++) {
      textA.insert(textA.length, `  // A edit ${i}\n`);
      textB.insert(textB.length, `  // B edit ${i}\n`);
    }

    const svB = Y.encodeStateVector(docB);
    const t0 = performance.now();
    const diffUpdateAtoB = Y.encodeStateAsUpdate(docA, svB);
    const diffEncodeLatencyMs = +(performance.now() - t0).toFixed(4);

    const t1 = performance.now();
    Y.applyUpdate(docB, diffUpdateAtoB);
    const diffApplyLatencyMs = +(performance.now() - t1).toFixed(4);

    results.push({
      offlineEdits,
      baseDocChars,
      divergentUpdateBytes: diffUpdateAtoB.byteLength,
      stateVectorBytes: svB.byteLength,
      diffEncodeLatencyMs,
      diffApplyLatencyMs,
      convergedTextChars: textB.toString().length,
    });
  }

  return results;
}

/**
 * Formats LatencyBenchmarkResult rows into a Markdown table.
 */
export function formatLatencyTable(results: LatencyBenchmarkResult[]): string {
  const rows = [
    '| Edit Count | Document Size (chars) | Encoded Update (bytes) | State Vector (bytes) | Metadata Overhead Ratio | Encode Latency (ms) | Merge Latency (ms) |',
    '| :---: | :---: | :---: | :---: | :---: | :---: | :---: |',
  ];

  for (const r of results) {
    rows.push(
      `| ${r.editCount} | ${r.textLengthChars} | ${r.encodedUpdateBytes} | ${r.stateVectorBytes} | ${r.expansionRatio}x | ${r.encodeLatencyMs} | ${r.applyLatencyMs} |`
    );
  }

  return rows.join('\n');
}

/**
 * Formats OfflineDivergenceBenchmarkResult rows into a Markdown table.
 */
export function formatOfflineDivergenceTable(
  results: OfflineDivergenceBenchmarkResult[]
): string {
  const rows = [
    '| Offline Edits (per replica) | Base Chars | Delta Update Size (bytes) | State Vector Size (bytes) | Diff Encode Time (ms) | Merge Latency (ms) | Converged Chars |',
    '| :---: | :---: | :---: | :---: | :---: | :---: | :---: |',
  ];

  for (const r of results) {
    rows.push(
      `| ${r.offlineEdits} | ${r.baseDocChars} | ${r.divergentUpdateBytes} | ${r.stateVectorBytes} | ${r.diffEncodeLatencyMs} | ${r.diffApplyLatencyMs} | ${r.convergedTextChars} |`
    );
  }

  return rows.join('\n');
}
