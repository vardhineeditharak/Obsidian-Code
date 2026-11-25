import { useState, useEffect, useCallback } from 'react';

export type Theme = 'light' | 'dark';

const THEME_KEY = 'obsidian.theme';
const THEME_EVENT = 'obsidian-theme-change';

/**
 * Reads the persisted theme preference from localStorage or document class, defaulting to 'dark'.
 */
export function getStoredTheme(): Theme {
  if (typeof window === 'undefined') return 'dark';
  try {
    const saved = localStorage.getItem(THEME_KEY);
    if (saved === 'light' || saved === 'dark') {
      return saved;
    }
    if (typeof document !== 'undefined' && document.documentElement.classList.contains('dark')) {
      return 'dark';
    }
    if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
      return 'dark';
    }
  } catch {
    // Ignore storage/DOM exceptions
  }
  return 'dark';
}

/**
 * Applies the selected theme to `document.documentElement`, persists it, and notifies listeners.
 */
export function applyTheme(theme: Theme): void {
  if (typeof document === 'undefined') return;

  const root = document.documentElement;
  if (theme === 'dark') {
    root.classList.add('dark');
  } else {
    root.classList.remove('dark');
  }

  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch {
    // Ignore storage exceptions
  }

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent<{ theme: Theme }>(THEME_EVENT, { detail: { theme } }));
  }
}

/**
 * Toggles between 'dark' and 'light' themes and returns the applied theme.
 */
export function toggleTheme(): Theme {
  const next: Theme = getStoredTheme() === 'dark' ? 'light' : 'dark';
  applyTheme(next);
  return next;
}

if (typeof window !== 'undefined') {
  applyTheme(getStoredTheme());
}

/**
 * React hook for reading and updating the application color theme.
 */
export function useTheme() {
  const [theme, setThemeState] = useState<Theme>(getStoredTheme);

  useEffect(() => {
    const handleThemeChange = (event: Event) => {
      const customEvent = event as CustomEvent<{ theme?: Theme }>;
      setThemeState(customEvent.detail?.theme ?? getStoredTheme());
    };

    window.addEventListener(THEME_EVENT, handleThemeChange);
    return () => window.removeEventListener(THEME_EVENT, handleThemeChange);
  }, []);

  const handleToggle = useCallback(() => {
    const next = toggleTheme();
    setThemeState(next);
  }, []);

  const handleSetTheme = useCallback((next: Theme) => {
    applyTheme(next);
    setThemeState(next);
  }, []);

  return {
    theme,
    isDark: theme === 'dark',
    toggleTheme: handleToggle,
    setTheme: handleSetTheme,
  };
}
