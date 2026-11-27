import type * as Monaco from 'monaco-editor';

/**
 * Shared base editor configuration across primary and split editor panes.
 * Keeps font, spacing, and cursor settings aligned.
 */
export const editorOptions: Monaco.editor.IStandaloneEditorConstructionOptions = {
  fontSize: 13,
  fontFamily: 'JetBrains Mono, SF Mono, Menlo, monospace',
  fontLigatures: false,
  lineHeight: 21,
  padding: { top: 12, bottom: 12 },
  roundedSelection: true,
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
 * Read-only options for diff and preview views.
 */
export const mirrorEditorOptions: Monaco.editor.IStandaloneEditorConstructionOptions = {
  ...editorOptions,
  readOnly: true,
  minimap: { enabled: false },
};
