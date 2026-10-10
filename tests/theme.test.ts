import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { getStoredTheme, applyTheme, toggleTheme } from '../src/lib/theme';

describe('Theme Management and Dark Mode Switching (src/lib/theme.ts)', () => {
  let mockStorage: Record<string, string> = {};
  let rootClasses = new Set<string>();

  const fakeDocument = {
    documentElement: {
      classList: {
        add: (cls: string) => rootClasses.add(cls),
        remove: (cls: string) => rootClasses.delete(cls),
        contains: (cls: string) => rootClasses.has(cls),
      },
    },
  };

  const fakeLocalStorage = {
    getItem: (key: string) => mockStorage[key] ?? null,
    setItem: (key: string, val: string) => {
      mockStorage[key] = val;
    },
    removeItem: (key: string) => {
      delete mockStorage[key];
    },
    clear: () => {
      mockStorage = {};
    },
  };

  beforeEach(() => {
    mockStorage = {};
    rootClasses = new Set<string>(['dark']);

    vi.stubGlobal('document', fakeDocument);
    vi.stubGlobal('localStorage', fakeLocalStorage);
    vi.stubGlobal('window', {
      dispatchEvent: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      matchMedia: vi.fn().mockReturnValue({ matches: true }),
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("defaults to 'dark' when no theme is persisted in localStorage", () => {
    expect(getStoredTheme()).toBe('dark');
  });

  it("applyTheme('light') removes 'dark' class from documentElement and saves to localStorage", () => {
    applyTheme('light');

    expect(fakeDocument.documentElement.classList.contains('dark')).toBe(false);
    expect(fakeLocalStorage.getItem('obsidian.theme')).toBe('light');
    expect(getStoredTheme()).toBe('light');
  });

  it("applyTheme('dark') adds 'dark' class to documentElement and saves to localStorage", () => {
    applyTheme('light');
    expect(fakeDocument.documentElement.classList.contains('dark')).toBe(false);

    applyTheme('dark');
    expect(fakeDocument.documentElement.classList.contains('dark')).toBe(true);
    expect(fakeLocalStorage.getItem('obsidian.theme')).toBe('dark');
    expect(getStoredTheme()).toBe('dark');
  });

  it('toggleTheme switches between dark and light modes sequentially', () => {
    applyTheme('dark');
    expect(fakeDocument.documentElement.classList.contains('dark')).toBe(true);

    const firstToggle = toggleTheme();
    expect(firstToggle).toBe('light');
    expect(fakeDocument.documentElement.classList.contains('dark')).toBe(false);
    expect(fakeLocalStorage.getItem('obsidian.theme')).toBe('light');

    const secondToggle = toggleTheme();
    expect(secondToggle).toBe('dark');
    expect(fakeDocument.documentElement.classList.contains('dark')).toBe(true);
    expect(fakeLocalStorage.getItem('obsidian.theme')).toBe('dark');
  });
});
