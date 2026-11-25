import type * as Monaco from 'monaco-editor';

/**
 * Shared base editor configuration across primary and split editor panes.
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
  wordBasedSuggestions: 'currentDocument',
  suggest: {
    showKeywords: true,
    showFunctions: true,
    showSnippets: true,
    snippetsPreventQuickSuggestions: false,
  },
};

export const baseEditorOptions = editorOptions;

/**
 * Editable split-pane options inheriting shared font/layout settings with minimap disabled.
 */
export const splitEditorOptions: Monaco.editor.IStandaloneEditorConstructionOptions = {
  ...editorOptions,
  minimap: { enabled: false },
};

/**
 * Read-only mirror options preserved for compatibility and read-only diff/preview contexts.
 */
export const mirrorEditorOptions: Monaco.editor.IStandaloneEditorConstructionOptions = {
  ...editorOptions,
  readOnly: true,
  minimap: { enabled: false },
};
