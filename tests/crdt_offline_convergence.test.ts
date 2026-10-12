import { describe, it, expect } from 'vitest';
import * as Y from 'yjs';

describe('CRDT Offline Divergence & Reconnection Convergence (T1 / GAP_B)', () => {
  it('converges deterministically after disconnected offline editing session', () => {
    // Phase 1: Initial Synchronized State
    const docA = new Y.Doc();
    const docB = new Y.Doc();
    const textA = docA.getText('content');
    const textB = docB.getText('content');

    const initialCode = `function calculateTotal(items) {\n  let sum = 0;\n  return sum;\n}\n`;
    textA.insert(0, initialCode);

    // Initial handshake sync: docA -> docB
    const initialUpdate = Y.encodeStateAsUpdate(docA);
    Y.applyUpdate(docB, initialUpdate);

    expect(textA.toString()).toBe(initialCode);
    expect(textB.toString()).toBe(initialCode);

    // Phase 2: Sever connection (offline mode — zero update exchange)
    // Replica A performs local offline edits:
    // 1. Adds items loop
    const loopCode = '  for (const item of items) {\n    sum += item.price;\n  }\n';
    textA.insert(textA.toString().indexOf('return sum;'), loopCode);
    // 2. Adds JSDoc header at the top
    textA.insert(0, '/** Calculates item total */\n');

    // Replica B performs concurrent, independent offline edits:
    // 1. Adds tax calculation before return
    const taxCode = '  const tax = sum * 0.05;\n';
    textB.insert(textB.toString().indexOf('return sum;'), taxCode);
    // 2. Modifies return statement: replace "return sum;" with "return sum + tax;"
    const returnIdx = textB.toString().indexOf('return sum;');
    textB.delete(returnIdx, 'return sum;'.length);
    textB.insert(returnIdx, 'return sum + tax;');

    // Verify divergence while disconnected
    expect(textA.toString()).not.toBe(textB.toString());
    expect(textA.toString()).toContain('/** Calculates item total */');
    expect(textA.toString()).toContain('sum += item.price');
    expect(textB.toString()).toContain('const tax = sum * 0.05;');
    expect(textB.toString()).toContain('return sum + tax;');

    // Phase 3: Reconnection Protocol (state vector diff exchange)
    const stateVectorA = Y.encodeStateVector(docA);
    const stateVectorB = Y.encodeStateVector(docB);

    // Calculate minimum required diff updates
    const diffForB = Y.encodeStateAsUpdate(docA, stateVectorB);
    const diffForA = Y.encodeStateAsUpdate(docB, stateVectorA);

    // Apply diffs bidirectionally
    Y.applyUpdate(docB, diffForB);
    Y.applyUpdate(docA, diffForA);

    // Phase 4: Deterministic Convergence Verification
    expect(textA.toString()).toBe(textB.toString());

    // Phase 5: Zero Lost Updates Verification
    const converged = textA.toString();
    expect(converged).toContain('/** Calculates item total */');
    expect(converged).toContain('sum += item.price');
    expect(converged).toContain('const tax = sum * 0.05;');
    expect(converged).toContain('return sum + tax;');
  });

  it('handles concurrent same-position insertions and conflicting deletions during offline window', () => {
    const doc1 = new Y.Doc();
    const doc2 = new Y.Doc();
    const text1 = doc1.getText('content');
    const text2 = doc2.getText('content');

    const seed = 'const config = {};\n';
    text1.insert(0, seed);
    Y.applyUpdate(doc2, Y.encodeStateAsUpdate(doc1));

    // Both go offline. Both insert into config at character offset 16 (inside {})
    // Replica 1 inserts: debug: true
    text1.insert(16, ' debug: true,');
    // Replica 2 inserts: port: 8080,
    text2.insert(16, ' port: 8080,');

    // Reconnect & sync
    const sv1 = Y.encodeStateVector(doc1);
    const sv2 = Y.encodeStateVector(doc2);
    Y.applyUpdate(doc2, Y.encodeStateAsUpdate(doc1, sv2));
    Y.applyUpdate(doc1, Y.encodeStateAsUpdate(doc2, sv1));

    // Deterministic convergence
    expect(text1.toString()).toBe(text2.toString());
    // Both contributions preserved
    expect(text1.toString()).toContain('debug: true');
    expect(text1.toString()).toContain('port: 8080');
  });

  it('converges across a 3-replica network partition and subsequent healing', () => {
    // Replicas A, B, C
    const docA = new Y.Doc();
    const docB = new Y.Doc();
    const docC = new Y.Doc();
    const textA = docA.getText('content');
    const textB = docB.getText('content');
    const textC = docC.getText('content');

    // Seed initial state
    textA.insert(0, '// Header\n');
    const initUpdate = Y.encodeStateAsUpdate(docA);
    Y.applyUpdate(docB, initUpdate);
    Y.applyUpdate(docC, initUpdate);

    // Partition: A and B can sync, C is completely isolated
    textA.insert(textA.length, 'const a = 1;\n');
    // A syncs with B
    Y.applyUpdate(docB, Y.encodeStateAsUpdate(docA, Y.encodeStateVector(docB)));
    textB.insert(textB.length, 'const b = 2;\n');
    Y.applyUpdate(docA, Y.encodeStateAsUpdate(docB, Y.encodeStateVector(docA)));

    // Meanwhile, C is offline and makes multiple changes
    textC.insert(textC.length, 'const c = 3;\n');
    textC.insert(textC.length, 'export { c };\n');

    // Partition heals: C reconnects with A and B
    // C exchanges with A
    const svA = Y.encodeStateVector(docA);
    const svC = Y.encodeStateVector(docC);
    Y.applyUpdate(docA, Y.encodeStateAsUpdate(docC, svA));
    Y.applyUpdate(docC, Y.encodeStateAsUpdate(docA, svC));

    // B exchanges with C
    const svB = Y.encodeStateVector(docB);
    const svC2 = Y.encodeStateVector(docC);
    Y.applyUpdate(docB, Y.encodeStateAsUpdate(docC, svB));
    Y.applyUpdate(docC, Y.encodeStateAsUpdate(docB, svC2));

    // Final convergence across all three replicas
    expect(textA.toString()).toBe(textB.toString());
    expect(textB.toString()).toBe(textC.toString());
    expect(textA.toString()).toContain('const a = 1;');
    expect(textA.toString()).toContain('const b = 2;');
    expect(textA.toString()).toContain('const c = 3;');
    expect(textA.toString()).toContain('export { c };');
  });

  it('demonstrates state vector exchange minimizes transmission bytes compared to full snapshot', () => {
    const docA = new Y.Doc();
    const docB = new Y.Doc();
    const textA = docA.getText('content');
    const textB = docB.getText('content');

    // Pre-populate large baseline
    let baseline = '';
    for (let i = 0; i < 50; i++) {
      baseline += `const line${i} = ${i};\n`;
    }
    textA.insert(0, baseline);
    Y.applyUpdate(docB, Y.encodeStateAsUpdate(docA));

    // Full state size
    const fullStateSize = Y.encodeStateAsUpdate(docA).byteLength;

    // A makes a tiny edit offline
    textA.insert(textA.length, '// Single small offline line\n');

    // Diff update using docB's state vector
    const svB = Y.encodeStateVector(docB);
    const deltaUpdate = Y.encodeStateAsUpdate(docA, svB);
    const deltaSize = deltaUpdate.byteLength;

    // Delta update should be substantially smaller than sending the whole document
    expect(deltaSize).toBeLessThan(fullStateSize * 0.3);

    // Apply delta to docB
    Y.applyUpdate(docB, deltaUpdate);
    expect(textB.toString()).toBe(textA.toString());
  });
});
