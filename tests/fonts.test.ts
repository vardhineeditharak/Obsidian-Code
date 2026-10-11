import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ensureFontsReady, resetFontsPromise } from '../src/lib/fonts';

describe('Font Readiness Coordinator (src/lib/fonts.ts)', () => {
  const originalDocument = globalThis.document;

  beforeEach(() => {
    resetFontsPromise();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    resetFontsPromise();
    vi.useRealTimers();
    if (originalDocument !== undefined) {
      globalThis.document = originalDocument;
    } else {
      delete (globalThis as unknown as { document?: unknown }).document;
    }
  });

  it('ensureFontsReady resolves immediately when document.fonts is undefined', async () => {
    (globalThis as unknown as { document?: unknown }).document = undefined;

    const start = Date.now();
    await expect(ensureFontsReady(3000)).resolves.toBeUndefined();
    const elapsed = Date.now() - start;
    expect(elapsed).toBeLessThan(100);
  });

  it('ensureFontsReady resolves when mocked fonts.load rejects (Google Fonts blocked) — no unhandled rejection', async () => {
    const mockLoad = vi.fn().mockRejectedValue(new Error('ERR_NAME_NOT_RESOLVED: Google Fonts blocked'));
    (globalThis as unknown as { document?: unknown }).document = {
      fonts: {
        load: mockLoad,
        ready: Promise.resolve(),
      },
    };

    await expect(ensureFontsReady(1000)).resolves.toBeUndefined();
    expect(mockLoad).toHaveBeenCalledWith('13px "JetBrains Mono"');
  });

  it('ensureFontsReady resolves after the timeout even if fonts.ready never settles (fake timers)', async () => {
    vi.useFakeTimers();

    (globalThis as unknown as { document?: unknown }).document = {
      fonts: {
        load: vi.fn().mockResolvedValue([]),
        // A promise that never resolves or settles
        ready: new Promise<void>(() => {}),
      },
    };

    const promise = ensureFontsReady(500);

    // Fast-forward past the 500ms timeout threshold
    await vi.advanceTimersByTimeAsync(550);

    await expect(promise).resolves.toBeUndefined();
  });

  it('ensureFontsReady returns the same promise on repeated calls (idempotent)', async () => {
    (globalThis as unknown as { document?: unknown }).document = {
      fonts: {
        load: vi.fn().mockResolvedValue([]),
        ready: Promise.resolve(),
      },
    };

    const p1 = ensureFontsReady(3000);
    const p2 = ensureFontsReady(3000);

    expect(p1).toBe(p2);
    await expect(p1).resolves.toBeUndefined();
  });
});
