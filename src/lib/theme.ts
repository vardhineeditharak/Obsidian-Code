import { useState, useEffect } from 'react';

export type Theme = 'light' | 'dark';

const THEME_KEY = 'obsidian.theme';
const THEME_EVENT = 'obsidian-theme-change';

/**
 * Reads the current theme preference from localStorage or document class.
 */
export function getStoredTheme(): Theme {
  if (typeof window === 'undefined') return 'dark';
  try {
    const saved = localStorage.getItem(THEME_KEY);
    if (saved === 'light' || saved === 'dark') return saved;
    if (document.documentElement.classList.contains('dark')) return 'dark';
    if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
      return 'dark';
    }
  } catch {}
  return 'dark';
}

/**
 * Applies the theme to document.documentElement and persists it.
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
  } catch {}

  // Broadcast change to all mounted components
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(THEME_EVENT, { detail: { theme } }));
  }
}

/**
 * Toggles between light and dark themes.
 */
export function toggleTheme(): Theme {
  const current = getStoredTheme();
  const next: Theme = current === 'dark' ? 'light' : 'dark';
  applyTheme(next);
  return next;
}

// Immediately apply theme on initial module load
if (typeof window !== 'undefined') {
  applyTheme(getStoredTheme());
}

/**
 * React hook to access and toggle light/dark theme.
 */
export function useTheme() {
  const [theme, setThemeState] = useState<Theme>(getStoredTheme);

  useEffect(() => {
    const handleThemeChange = (e: Event) => {
      const customEvent = e as CustomEvent<{ theme: Theme }>;
      if (customEvent.detail?.theme) {
        setThemeState(customEvent.detail.theme);
      } else {
        setThemeState(getStoredTheme());
      }
    };

    window.addEventListener(THEME_EVENT, handleThemeChange);
    return () => window.removeEventListener(THEME_EVENT, handleThemeChange);
  }, []);

  const handleToggle = () => {
    const next = toggleTheme();
    setThemeState(next);
  };

  const handleSetTheme = (next: Theme) => {
    applyTheme(next);
    setThemeState(next);
  };

  return {
    theme,
    isDark: theme === 'dark',
    toggleTheme: handleToggle,
    setTheme: handleSetTheme,
  };
}
