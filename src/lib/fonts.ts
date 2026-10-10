/**
 * Font readiness coordinator for Monaco Editor.
 *
 * Prevents Monaco from measuring canvas glyph widths with fallback fonts
 * before JetBrains Mono and Inter have settled into document.fonts.
 */

let fontsPromise: Promise<void> | null = null;

/**
 * Resets the cached promise. Primarily used by unit tests to test
 * cold/offline/error states independently.
 */
export function resetFontsPromise(): void {
  fontsPromise = null;
}

/**
 * Ensures that the required editor fonts are fully loaded before Monaco renders.
 * - Resolves immediately if document.fonts is unavailable (Node test env / older browsers).
 * - Awaits JetBrains Mono and Inter font loading and document.fonts.ready.
 * - Races against timeoutMs (default 3000ms) to ensure offline-safe fallback.
 * - Idempotent: returns the same promise on repeated invocations.
 */
export function ensureFontsReady(timeoutMs: number = 3000): Promise<void> {
  if (fontsPromise) {
    return fontsPromise;
  }

  fontsPromise = (async () => {
    if (typeof document === 'undefined' || !('fonts' in document) || !document.fonts) {
      return;
    }

    const fontCheck = async () => {
      try {
        const pMono = Promise.resolve()
          .then(() => document.fonts.load('13px "JetBrains Mono"'))
          .catch(() => []);
        const pInter = Promise.resolve()
          .then(() => document.fonts.load('13px "Inter"'))
          .catch(() => []);
        const pGaramond = Promise.resolve()
          .then(() => document.fonts.load('17px "EB Garamond"'))
          .catch(() => []);
        const pBrand = Promise.resolve()
          .then(() => document.fonts.load('24px "Instrument Serif"'))
          .catch(() => []);

        await Promise.all([pMono, pInter, pGaramond, pBrand]);

        if (document.fonts.ready) {
          await document.fonts.ready.catch(() => undefined);
        }
      } catch {
        // Fallback gracefully on font loading issues
      }
    };

    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeoutPromise = new Promise<void>((resolve) => {
      timer = setTimeout(() => {
        resolve();
      }, timeoutMs);
    });

    try {
      await Promise.race([fontCheck(), timeoutPromise]);
    } finally {
      if (timer) {
        clearTimeout(timer);
      }
    }
  })();

  return fontsPromise;
}
