import type * as Monaco from 'monaco-editor';

/**
 * Shared base editor configuration across primary and split panes.
 * Enforces single source of truth for font-family, ligatures, metrics, cursor settings,
 * and accurate language-aware autocomplete suggestions.
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

  // Accurate Autocomplete & Suggestions Configuration (Issue #12)
  quickSuggestions: { other: true, comments: false, strings: false },
  suggestOnTriggerCharacters: true,
  wordBasedSuggestions: 'currentDocument',
  tabCompletion: 'on',
  suggest: {
    localityBonus: true,
    shareSuggestSelections: true,
    snippetsPreventQuickSuggestions: false,
    showIcons: true,
  },
};

export const baseEditorOptions = editorOptions;

/**
 * Split editor configuration (Issues #9 & #10):
 * Fully editable (not read-only), inheriting base options without minimap.
 */
export const splitEditorOptions: Monaco.editor.IStandaloneEditorConstructionOptions = {
  ...editorOptions,
  readOnly: false,
  minimap: { enabled: false },
};

export const mirrorEditorOptions = splitEditorOptions;

