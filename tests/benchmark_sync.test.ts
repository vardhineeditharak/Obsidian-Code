import { describe, it, expect } from 'vitest';
import {
  runLatencyBenchmark,
  runOfflineDivergenceBenchmark,
  formatLatencyTable,
  formatOfflineDivergenceTable,
} from '../src/lib/crdt/benchmark';

describe('Synchronization Latency & Resource-Overhead Benchmark (T2 / GAP_A)', () => {
  it('benchmarks merge latency, state vector size, and metadata overhead across operation volumes', () => {
    const editCounts = [1, 10, 100, 500, 1000];
    const results = runLatencyBenchmark(editCounts);

    expect(results.length).toBe(editCounts.length);

    // Verify properties for each level
    for (const res of results) {
      expect(res.encodedUpdateBytes).toBeGreaterThan(0);
      expect(res.stateVectorBytes).toBeGreaterThan(0);
      // State vector should remain extremely compact (< 64 bytes for single origin)
      expect(res.stateVectorBytes).toBeLessThan(64);
      // Merge application time should be sub-50ms even for 1000 operations
      expect(res.applyLatencyMs).toBeLessThan(50);
      // Metadata expansion ratio should be reasonable (typically between 1.0x and 1.5x for text)
      expect(res.expansionRatio).toBeGreaterThan(0.5);
      expect(res.expansionRatio).toBeLessThan(3.0);
    }

    const table = formatLatencyTable(results);
    console.log('\n--- CRDT Merge Latency & Metadata Overhead Benchmark ---');
    console.log(table);
    console.log('--------------------------------------------------------\n');
  });

  it('benchmarks offline divergence scaling and delta merge performance', () => {
    const divergenceDepths = [1, 10, 50, 100, 500];
    const results = runOfflineDivergenceBenchmark(divergenceDepths);

    expect(results.length).toBe(divergenceDepths.length);

    for (const res of results) {
      expect(res.divergentUpdateBytes).toBeGreaterThan(0);
      // Delta merge latency must remain fast (< 30ms for 500 edits)
      expect(res.diffApplyLatencyMs).toBeLessThan(30);
      // State vector size is constant O(clients)
      expect(res.stateVectorBytes).toBeLessThan(64);
    }

    const table = formatOfflineDivergenceTable(results);
    console.log('\n--- Offline Divergence Cost & Delta Merge Benchmark ---');
    console.log(table);
    console.log('--------------------------------------------------------\n');
  });
});
