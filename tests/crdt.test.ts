import { describe, it, expect } from 'vitest';
import * as Y from 'yjs';

describe('CRDT Convergence & Document Model', () => {
  it('converges deterministically when two clients edit concurrently', () => {
    // Client A and Client B start from the same initial state
    const docA = new Y.Doc();
    const docB = new Y.Doc();

    const textA = docA.getText('content');
    const textB = docB.getText('content');

    textA.insert(0, 'Hello World');

    // Sync A to B
    const updateInit = Y.encodeStateAsUpdate(docA);
    Y.applyUpdate(docB, updateInit);

    expect(textB.toString()).toBe('Hello World');

    // Concurrent edits:
    // User A inserts " Beautiful" after "Hello"
    textA.insert(5, ' Beautiful');

    // User B appends "!" at the end
    textB.insert(11, '!');

    // Exchange updates between A and B
    const updateA = Y.encodeStateAsUpdate(docA, Y.encodeStateVector(docB));
    const updateB = Y.encodeStateAsUpdate(docB, Y.encodeStateVector(docA));

    Y.applyUpdate(docB, updateA);
    Y.applyUpdate(docA, updateB);

    // Both documents must converge to the exact same string
    expect(textA.toString()).toBe(textB.toString());
    expect(textA.toString()).toBe('Hello Beautiful World!');
  });

  it('handles simultaneous insertions at the same position without data loss', () => {
    const doc1 = new Y.Doc();
    const doc2 = new Y.Doc();

    const text1 = doc1.getText('content');
    const text2 = doc2.getText('content');

    // Both insert at position 0 concurrently
    text1.insert(0, 'Alpha');
    text2.insert(0, 'Beta');

    // Cross-sync
    const u1 = Y.encodeStateAsUpdate(doc1);
    const u2 = Y.encodeStateAsUpdate(doc2);

    Y.applyUpdate(doc2, u1);
    Y.applyUpdate(doc1, u2);

    expect(doc1.getText('content').toString()).toBe(doc2.getText('content').toString());
    // Both words are preserved
    expect(doc1.getText('content').toString().includes('Alpha')).toBe(true);
    expect(doc1.getText('content').toString().includes('Beta')).toBe(true);
  });

  it('tracks line authorship attributes reliably in shared metadata', () => {
    const doc = new Y.Doc();
    const lineAuthors = doc.getMap('lineAuthors');

    doc.transact(() => {
      lineAuthors.set('1', {
        authorId: 'user-123',
        authorName: 'Sarah',
        color: '#3B82F6',
        timestamp: 1672531199000,
      });
    }, 'line-authorship');

    expect(lineAuthors.get('1')).toEqual({
      authorId: 'user-123',
      authorName: 'Sarah',
      color: '#3B82F6',
      timestamp: 1672531199000,
    });
  });
});
