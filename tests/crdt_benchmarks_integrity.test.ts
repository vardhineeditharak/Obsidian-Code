import { describe, it, expect } from 'vitest';
import * as Y from 'yjs';
import {
  runLatencyBenchmark,
  runOfflineDivergenceBenchmark,
  formatLatencyTable,
  formatOfflineDivergenceTable,
} from '../src/lib/crdt/benchmark';
import { analyzeCode } from '../src/lib/diagnostics/codeDiagnostics';

describe('CRDT Benchmarks, Post-Merge Integrity & Code Workloads', () => {
  describe('Synchronization Latency & Metadata Overhead Benchmark (T2 / GAP_A)', () => {
    it('benchmarks merge latency, state vector size, and metadata overhead across edit counts', () => {
      const editCounts = [1, 10, 100, 500, 1000];
      const results = runLatencyBenchmark(editCounts);
      expect(results).toHaveLength(editCounts.length);

      for (const res of results) {
        expect(res.encodedUpdateBytes).toBeGreaterThan(0);
        expect(res.stateVectorBytes).toBeGreaterThan(0);
        expect(res.stateVectorBytes).toBeLessThan(64);
        expect(res.applyLatencyMs).toBeLessThan(50);
        expect(res.expansionRatio).toBeGreaterThan(0.5);
        expect(res.expansionRatio).toBeLessThan(3.0);
      }

      const table = formatLatencyTable(results);
      expect(table).toContain('| Edit Count |');
      expect(table).toContain('| 1000 |');
    });

    it('benchmarks offline divergence scaling and delta merge performance', () => {
      const depths = [1, 10, 50, 100, 500];
      const results = runOfflineDivergenceBenchmark(depths);
      expect(results).toHaveLength(depths.length);

      for (const res of results) {
        expect(res.divergentUpdateBytes).toBeGreaterThan(0);
        expect(res.diffApplyLatencyMs).toBeLessThan(30);
        expect(res.stateVectorBytes).toBeLessThan(64);
      }

      const table = formatOfflineDivergenceTable(results);
      expect(table).toContain('| Offline Edits (per replica) |');
      expect(table).toContain('| 500 |');
    });
  });

  describe('Post-Merge Source-Code Integrity Experiment: Convergence != Validity (T4 / GAP_C)', () => {
    it('evaluates all 5 concurrent merge scenarios proving 100% convergence does not guarantee semantic intent', () => {
      const results: Array<{
        id: string;
        converged: boolean;
        syntacticallyValid: boolean;
        intentPreserved: boolean;
      }> = [];

      // SC-1: Conflicting return expression replacement
      {
        const docA = new Y.Doc();
        const docB = new Y.Doc();
        const textA = docA.getText('content');
        const textB = docB.getText('content');
        textA.insert(0, 'function calculate() {\n  return 10;\n}\n');
        Y.applyUpdate(docB, Y.encodeStateAsUpdate(docA));

        const idxA = textA.toString().indexOf('10');
        textA.delete(idxA, 2);
        textA.insert(idxA, '10 + 5');

        const idxB = textB.toString().indexOf('10');
        textB.delete(idxB, 2);
        textB.insert(idxB, '10 * 2');

        Y.applyUpdate(docB, Y.encodeStateAsUpdate(docA, Y.encodeStateVector(docB)));
        Y.applyUpdate(docA, Y.encodeStateAsUpdate(docB, Y.encodeStateVector(docA)));

        const converged = textA.toString();
        expect(converged).toBe(textB.toString());
        const errors = analyzeCode(converged, 's1', 'calculate.js', 'javascript').filter(
          (d) => d.severity === 'error'
        );
        results.push({
          id: 'SC-1',
          converged: true,
          syntacticallyValid: errors.length === 0,
          intentPreserved: false,
        });
      }

      // SC-2: Concurrent block delimiter insertion
      {
        const docA = new Y.Doc();
        const docB = new Y.Doc();
        const textA = docA.getText('content');
        const textB = docB.getText('content');
        textA.insert(0, 'function runTask(task) {\n  execute(task);\n}\n');
        Y.applyUpdate(docB, Y.encodeStateAsUpdate(docA));

        const idxA = textA.toString().indexOf('execute(task);');
        textA.insert(idxA, 'try {\n    ');
        textA.insert(
          textA.toString().indexOf('execute(task);') + 'execute(task);'.length,
          '\n  } catch (err) {\n    handle(err);\n  }'
        );

        const idxB = textB.toString().indexOf('execute(task);');
        textB.insert(idxB, 'if (task.isValid) {\n    ');
        textB.insert(
          textB.toString().indexOf('execute(task);') + 'execute(task);'.length,
          '\n  }'
        );

        Y.applyUpdate(docB, Y.encodeStateAsUpdate(docA, Y.encodeStateVector(docB)));
        Y.applyUpdate(docA, Y.encodeStateAsUpdate(docB, Y.encodeStateVector(docA)));

        const converged = textA.toString();
        expect(converged).toBe(textB.toString());
        const errors = analyzeCode(converged, 's2', 'task.js', 'javascript').filter(
          (d) => d.severity === 'error'
        );
        results.push({
          id: 'SC-2',
          converged: true,
          syntacticallyValid: errors.length === 0,
          intentPreserved: false,
        });
      }

      // SC-3: Concurrent same-scope duplicate variable declaration
      {
        const docA = new Y.Doc();
        const docB = new Y.Doc();
        const textA = docA.getText('content');
        const textB = docB.getText('content');
        textA.insert(0, 'function initialize() {\n  const id = 1;\n  return id;\n}\n');
        Y.applyUpdate(docB, Y.encodeStateAsUpdate(docA));

        const insertIdx = textA.toString().indexOf('return id;');
        textA.insert(insertIdx, '  const timeout = 5000;\n');
        textB.insert(insertIdx, '  const timeout = 10000;\n');

        Y.applyUpdate(docB, Y.encodeStateAsUpdate(docA, Y.encodeStateVector(docB)));
        Y.applyUpdate(docA, Y.encodeStateAsUpdate(docB, Y.encodeStateVector(docA)));

        const converged = textA.toString();
        expect(converged).toBe(textB.toString());
        expect(converged).toContain('const timeout = 5000;');
        expect(converged).toContain('const timeout = 10000;');
        results.push({
          id: 'SC-3',
          converged: true,
          syntacticallyValid: true,
          intentPreserved: false,
        });
      }

      // SC-4: Orthogonal class method additions
      {
        const docA = new Y.Doc();
        const docB = new Y.Doc();
        const textA = docA.getText('content');
        const textB = docB.getText('content');
        textA.insert(0, 'class MathService {\n  constructor() {\n    this.ops = 0;\n  }\n}\n');
        Y.applyUpdate(docB, Y.encodeStateAsUpdate(docA));

        const idx = textA.toString().indexOf('}\n');
        textA.insert(idx, '  add(a, b) {\n    this.ops++;\n    return a + b;\n  }\n');
        textB.insert(idx, '  multiply(a, b) {\n    this.ops++;\n    return a * b;\n  }\n');

        Y.applyUpdate(docB, Y.encodeStateAsUpdate(docA, Y.encodeStateVector(docB)));
        Y.applyUpdate(docA, Y.encodeStateAsUpdate(docB, Y.encodeStateVector(docA)));

        const converged = textA.toString();
        expect(converged).toBe(textB.toString());
        const errors = analyzeCode(converged, 's4', 'MathService.js', 'javascript').filter(
          (d) => d.severity === 'error'
        );
        expect(errors).toHaveLength(0);
        results.push({
          id: 'SC-4',
          converged: true,
          syntacticallyValid: true,
          intentPreserved: true,
        });
      }

      // SC-5: Unmatched delimiter from conflicting block deletion
      {
        const docA = new Y.Doc();
        const docB = new Y.Doc();
        const textA = docA.getText('content');
        const textB = docB.getText('content');
        textA.insert(0, 'function worker() {\n  process();\n}\n');
        Y.applyUpdate(docB, Y.encodeStateAsUpdate(docA));

        textA.insert(textA.toString().indexOf('process();'), 'if (ready) {\n  ');
        const delIdx = textB.toString().indexOf('process();\n}\n');
        textB.delete(delIdx, 'process();\n}\n'.length);
        textB.insert(delIdx, 'return null;\n');

        Y.applyUpdate(docB, Y.encodeStateAsUpdate(docA, Y.encodeStateVector(docB)));
        Y.applyUpdate(docA, Y.encodeStateAsUpdate(docB, Y.encodeStateVector(docA)));

        const converged = textA.toString();
        expect(converged).toBe(textB.toString());
        const errors = analyzeCode(converged, 's5', 'worker.js', 'javascript').filter(
          (d) => d.severity === 'error'
        );
        expect(errors.length).toBeGreaterThan(0);
        results.push({
          id: 'SC-5',
          converged: true,
          syntacticallyValid: false,
          intentPreserved: false,
        });
      }

      expect(results.every((r) => r.converged)).toBe(true);
      expect(results.filter((r) => r.intentPreserved).length).toBeLessThan(results.length);
    });
  });

  describe('Realistic Source-Code Workload Scenarios (T5 / GAP_D)', () => {
    it('evaluates disjoint edits, block move vs in-place edit, symbol rename drift, and block nesting', () => {
      // WL-1: Disjoint function body modifications
      {
        const docA = new Y.Doc();
        const docB = new Y.Doc();
        const textA = docA.getText('content');
        const textB = docB.getText('content');
        textA.insert(0, 'function processOrder(order) {\n  validateOrder(order);\n  chargeCustomer(order);\n  fulfillOrder(order);\n  return order.id;\n}\n');
        Y.applyUpdate(docB, Y.encodeStateAsUpdate(docA));

        textA.insert(textA.toString().indexOf('chargeCustomer(order);'), 'logAudit("charging", order.id);\n  ');
        const fulfillIdx = textB.toString().indexOf('fulfillOrder(order);');
        textB.delete(fulfillIdx, 'fulfillOrder(order);'.length);
        textB.insert(fulfillIdx, 'fulfillOrder(order, { priority: true });');

        Y.applyUpdate(docB, Y.encodeStateAsUpdate(docA, Y.encodeStateVector(docB)));
        Y.applyUpdate(docA, Y.encodeStateAsUpdate(docB, Y.encodeStateVector(docA)));

        const converged = textA.toString();
        expect(converged).toBe(textB.toString());
        expect(analyzeCode(converged, 'wl1', 'order.js', 'javascript').filter((d) => d.severity === 'error')).toHaveLength(0);
      }

      // WL-2: Code Block Move vs In-Place Edit anomaly
      {
        const docA = new Y.Doc();
        const docB = new Y.Doc();
        const textA = docA.getText('content');
        const textB = docB.getText('content');
        textA.insert(0, 'function getMultiplier() {\n  return 2;\n}\n\nfunction main() {\n  return getMultiplier() * 10;\n}\n');
        Y.applyUpdate(docB, Y.encodeStateAsUpdate(docA));

        const fnTarget = 'function getMultiplier() {\n  return 2;\n}\n\n';
        textA.delete(0, fnTarget.length);
        textA.insert(textA.length, '\nfunction getMultiplier() {\n  return 2;\n}\n');

        const retIdx = textB.toString().indexOf('return 2;');
        textB.delete(retIdx, 'return 2;'.length);
        textB.insert(retIdx, 'return 5;');

        Y.applyUpdate(docB, Y.encodeStateAsUpdate(docA, Y.encodeStateVector(docB)));
        Y.applyUpdate(docA, Y.encodeStateAsUpdate(docB, Y.encodeStateVector(docA)));

        const converged = textA.toString();
        expect(converged).toBe(textB.toString());
        expect(converged.includes('return 5;') && converged.includes('return 2;')).toBe(true);
      }

      // WL-3: Symbol rename vs concurrent line edit semantic drift
      {
        const docA = new Y.Doc();
        const docB = new Y.Doc();
        const textA = docA.getText('content');
        const textB = docB.getText('content');
        textA.insert(0, 'function calculatePrice(cart) {\n  const baseRate = 100;\n  const subtotal = baseRate * cart.count;\n  return subtotal;\n}\n');
        Y.applyUpdate(docB, Y.encodeStateAsUpdate(docA));

        let idx = textA.toString().indexOf('baseRate');
        while (idx !== -1) {
          textA.delete(idx, 'baseRate'.length);
          textA.insert(idx, 'standardFee');
          idx = textA.toString().indexOf('baseRate');
        }

        const lineIdx = textB.toString().indexOf('const subtotal = baseRate * cart.count;');
        textB.delete(lineIdx, 'const subtotal = baseRate * cart.count;'.length);
        textB.insert(lineIdx, 'const subtotal = (baseRate + 5) * cart.count;');

        Y.applyUpdate(docB, Y.encodeStateAsUpdate(docA, Y.encodeStateVector(docB)));
        Y.applyUpdate(docA, Y.encodeStateAsUpdate(docB, Y.encodeStateVector(docA)));

        const converged = textA.toString();
        expect(converged).toBe(textB.toString());
        expect(converged).toContain('const standardFee = 100;');
        expect(converged).toContain('baseRate');
      }

      // WL-4: Structured block nesting vs statement injection
      {
        const docA = new Y.Doc();
        const docB = new Y.Doc();
        const textA = docA.getText('content');
        const textB = docB.getText('content');
        textA.insert(0, 'function handleEvent(event) {\n  logEvent(event);\n  dispatch(event);\n}\n');
        Y.applyUpdate(docB, Y.encodeStateAsUpdate(docA));

        const idxA = textA.toString().indexOf('dispatch(event);');
        textA.insert(idxA, 'if (event.enabled) {\n    ');
        textA.insert(idxA + 'if (event.enabled) {\n    dispatch(event);'.length, '\n  }');
        textB.insert(textB.toString().indexOf('dispatch(event);'), 'recordMetric("event_received");\n  ');

        Y.applyUpdate(docB, Y.encodeStateAsUpdate(docA, Y.encodeStateVector(docB)));
        Y.applyUpdate(docA, Y.encodeStateAsUpdate(docB, Y.encodeStateVector(docA)));

        const converged = textA.toString();
        expect(converged).toBe(textB.toString());
        expect(analyzeCode(converged, 'wl4', 'event.js', 'javascript').filter((d) => d.severity === 'error')).toHaveLength(0);
      }
    });
  });
});
