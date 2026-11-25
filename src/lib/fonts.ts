/**
 * Font readiness coordinator for Monaco Editor.
 *
 * Prevents Monaco from measuring canvas glyph widths with fallback fonts
 * before JetBrains Mono has settled into document.fonts.
 */

let fontsPromise: Promise<void> | null = null;

/**
 * Resets the cached font readiness promise (used by tests to isolate cold/offline states).
 */
export function resetFontsPromise(): void {
  fontsPromise = null;
}

/**
 * Ensures required editor fonts are ready before Monaco mounts.
 * Resolves immediately if `document.fonts` is unavailable and falls back cleanly on timeout or load errors.
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
        await Promise.resolve()
          .then(() => document.fonts.load('13px "JetBrains Mono"'))
          .catch(() => []);

        if (document.fonts.ready) {
          await document.fonts.ready.catch(() => undefined);
        }
      } catch {
        // Fallback gracefully if browser font API rejects
      }
    };

    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeoutPromise = new Promise<void>((resolve) => {
      timer = setTimeout(resolve, timeoutMs);
    });

    try {
      await Promise.race([fontCheck(), timeoutPromise]);
    } finally {
      if (timer !== undefined) {
        clearTimeout(timer);
      }
    }
  })();

  return fontsPromise;
}
