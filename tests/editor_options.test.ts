import { describe, it, expect } from 'vitest';
import {
  editorOptions,
  baseEditorOptions,
  splitEditorOptions,
  mirrorEditorOptions,
} from '../src/components/workspace/editorOptions';

describe('Shared Monaco Editor Options (EditorWorkspace)', () => {
  it("the shared editorOptions object used by both panes declares fontFamily whose primary family is 'JetBrains Mono'", () => {
    expect(editorOptions).toBeDefined();
    expect(editorOptions.fontFamily).toBeDefined();

    const fontFamily = editorOptions.fontFamily as string;
    const primaryFont = fontFamily.split(',')[0].trim().replace(/['"]/g, '');

    expect(primaryFont).toBe('JetBrains Mono');
    expect(fontFamily).toContain('JetBrains Mono');

    // fontLigatures should be explicitly disabled for unambiguous measurement
    expect(editorOptions.fontLigatures).toBe(false);
  });

  it('configures accurate autocomplete suggestions in editorOptions (Issue #12)', () => {
    expect(editorOptions.quickSuggestions).toEqual({
      other: true,
      comments: false,
      strings: false,
    });
    expect(editorOptions.wordBasedSuggestions).toBe('currentDocument');
    expect(editorOptions.suggestOnTriggerCharacters).toBe(true);
    expect(editorOptions.tabCompletion).toBe('on');
    expect(editorOptions.suggest).toMatchObject({
      localityBonus: true,
      shareSuggestSelections: true,
    });
  });

  it('split and primary panes derive from shared options base, and split editor is fully editable (Issues #9 & #10)', () => {
    expect(baseEditorOptions).toEqual(editorOptions);

    // Verify shared properties match exactly across base and split/mirror
    expect(splitEditorOptions.fontFamily).toBe(editorOptions.fontFamily);
    expect(splitEditorOptions.fontSize).toBe(editorOptions.fontSize);
    expect(splitEditorOptions.lineHeight).toBe(editorOptions.lineHeight);
    expect(splitEditorOptions.fontLigatures).toBe(editorOptions.fontLigatures);
    expect(splitEditorOptions.automaticLayout).toBe(editorOptions.automaticLayout);
    expect(splitEditorOptions.scrollBeyondLastLine).toBe(editorOptions.scrollBeyondLastLine);

    // Verify split editor is editable (readOnly is false, not true) and disables only minimap
    expect(splitEditorOptions.readOnly).toBe(false);
    expect(mirrorEditorOptions.readOnly).toBe(false);
    expect(splitEditorOptions.minimap).toEqual({ enabled: false });

    // Verify stripping minimap and readOnly yields equality to base options
    const { readOnly: _r, minimap: _m, ...splitBase } = splitEditorOptions;
    const { minimap: _bm, ...expectedBase } = editorOptions;

    expect(splitBase).toMatchObject(expectedBase);
  });
});

