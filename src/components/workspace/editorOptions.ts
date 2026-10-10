import type * as Monaco from 'monaco-editor';

/**
 * Shared base editor configuration across primary and mirror split panes.
 * Enforces single source of truth for font-family, ligatures, metrics, and cursor settings.
 */
export const editorOptions: Monaco.editor.IStandaloneEditorConstructionOptions = {
  fontSize: 13,
  fontFamily: 'JetBrains Mono, Fira Code, monospace',
  fontLigatures: false,
  lineHeight: 20,
  scrollBeyondLastLine: false,
  smoothScrolling: true,
  cursorBlinking: 'smooth',
  cursorSmoothCaretAnimation: 'on',
  tabSize: 2,
  automaticLayout: true,
  renderLineHighlight: 'all',
  bracketPairColorization: { enabled: true },
};

export const baseEditorOptions = editorOptions;

export const mirrorEditorOptions: Monaco.editor.IStandaloneEditorConstructionOptions = {
  ...editorOptions,
  readOnly: true,
  minimap: { enabled: false },
};
