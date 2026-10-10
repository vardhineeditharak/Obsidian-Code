import { describe, it, expect } from 'vitest';
import {
  editorOptions,
  baseEditorOptions,
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

  it('primary and mirror panes derive from the same shared options base (mirror only overrides readOnly/minimap)', () => {
    // Both baseEditorOptions and editorOptions point to the shared configuration
    expect(baseEditorOptions).toEqual(editorOptions);

    // Verify shared properties match exactly across base and mirror
    expect(mirrorEditorOptions.fontFamily).toBe(editorOptions.fontFamily);
    expect(mirrorEditorOptions.fontSize).toBe(editorOptions.fontSize);
    expect(mirrorEditorOptions.lineHeight).toBe(editorOptions.lineHeight);
    expect(mirrorEditorOptions.fontLigatures).toBe(editorOptions.fontLigatures);
    expect(mirrorEditorOptions.automaticLayout).toBe(editorOptions.automaticLayout);
    expect(mirrorEditorOptions.scrollBeyondLastLine).toBe(editorOptions.scrollBeyondLastLine);

    // Verify mirror overrides only readOnly and minimap
    expect(mirrorEditorOptions.readOnly).toBe(true);
    expect(mirrorEditorOptions.minimap).toEqual({ enabled: false });

    // Verify that stripping the intentional overrides yields equality to the base options
    const { readOnly: _r, minimap: _m, ...mirrorBase } = mirrorEditorOptions;
    const { minimap: _bm, ...expectedBase } = editorOptions;

    expect(mirrorBase).toMatchObject(expectedBase);
  });
});
