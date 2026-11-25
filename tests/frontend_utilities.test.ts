import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import JSZip from 'jszip';
import { ensureFontsReady, resetFontsPromise } from '../src/lib/fonts';
import { getStoredTheme, applyTheme, toggleTheme } from '../src/lib/theme';
import { detectLanguage } from '../src/lib/language';
import { analyzeCode } from '../src/lib/diagnostics/codeDiagnostics';
import { exportWorkspaceAsZip } from '../src/lib/exportWorkspace';
import { notify } from '../src/lib/notifications';
import {
  getLanguageCompletions,
  registerMonacoCompletions,
} from '../src/lib/monacoCompletions';
import {
  editorOptions,
  baseEditorOptions,
  splitEditorOptions,
  mirrorEditorOptions,
} from '../src/components/workspace/editorOptions';
import type { ProjectFile } from '../src/lib/types';

describe('Frontend Core Modules, Utilities & Editor Configuration', () => {
  describe('Font Readiness Coordinator (src/lib/fonts.ts)', () => {
    const originalDocument = globalThis.document;

    beforeEach(() => {
      resetFontsPromise();
      vi.restoreAllMocks();
    });

    afterEach(() => {
      resetFontsPromise();
      vi.useRealTimers();
      if (originalDocument !== undefined) {
        globalThis.document = originalDocument;
      } else {
        delete (globalThis as unknown as { document?: unknown }).document;
      }
    });

    it('resolves immediately when document.fonts is unavailable', async () => {
      (globalThis as unknown as { document?: unknown }).document = undefined;
      const start = Date.now();
      await expect(ensureFontsReady(3000)).resolves.toBeUndefined();
      expect(Date.now() - start).toBeLessThan(100);
    });

    it('resolves cleanly when document.fonts.load rejects without unhandled rejection', async () => {
      const mockLoad = vi.fn().mockRejectedValue(new Error('ERR_NAME_NOT_RESOLVED'));
      (globalThis as unknown as { document?: unknown }).document = {
        fonts: {
          load: mockLoad,
          ready: Promise.resolve(),
        },
      };

      await expect(ensureFontsReady(1000)).resolves.toBeUndefined();
      expect(mockLoad).toHaveBeenCalledWith('13px "JetBrains Mono"');
    });

    it('resolves via timeout fallback if fonts.ready never settles', async () => {
      vi.useFakeTimers();
      (globalThis as unknown as { document?: unknown }).document = {
        fonts: {
          load: vi.fn().mockResolvedValue([]),
          ready: new Promise<void>(() => {}),
        },
      };

      const p = ensureFontsReady(500);
      await vi.advanceTimersByTimeAsync(550);
      await expect(p).resolves.toBeUndefined();
    });

    it('caches and returns the same promise across repeated calls', async () => {
      (globalThis as unknown as { document?: unknown }).document = {
        fonts: {
          load: vi.fn().mockResolvedValue([]),
          ready: Promise.resolve(),
        },
      };

      const p1 = ensureFontsReady(3000);
      const p2 = ensureFontsReady(3000);
      expect(p1).toBe(p2);
      await expect(p1).resolves.toBeUndefined();
    });
  });

  describe('Theme Persistence & Toggle (src/lib/theme.ts)', () => {
    let mockStorage: Record<string, string>;
    let rootClasses: Set<string>;
    let dispatchEventSpy: ReturnType<typeof vi.fn>;

    beforeEach(() => {
      mockStorage = {};
      rootClasses = new Set<string>(['dark']);
      dispatchEventSpy = vi.fn();

      vi.stubGlobal('document', {
        documentElement: {
          classList: {
            add: (cls: string) => rootClasses.add(cls),
            remove: (cls: string) => rootClasses.delete(cls),
            contains: (cls: string) => rootClasses.has(cls),
          },
        },
      });
      vi.stubGlobal('localStorage', {
        getItem: (k: string) => mockStorage[k] ?? null,
        setItem: (k: string, v: string) => {
          mockStorage[k] = v;
        },
        removeItem: (k: string) => {
          delete mockStorage[k];
        },
      });
      vi.stubGlobal('window', {
        dispatchEvent: dispatchEventSpy,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        matchMedia: vi.fn().mockReturnValue({ matches: true }),
      });
    });

    afterEach(() => {
      vi.unstubAllGlobals();
    });

    it('defaults to dark, updates DOM + localStorage + CustomEvent on applyTheme, and toggles sequentially', () => {
      expect(getStoredTheme()).toBe('dark');

      applyTheme('light');
      expect(rootClasses.has('dark')).toBe(false);
      expect(mockStorage['obsidian.theme']).toBe('light');
      expect(getStoredTheme()).toBe('light');
      expect(dispatchEventSpy).toHaveBeenCalledTimes(1);

      applyTheme('dark');
      expect(rootClasses.has('dark')).toBe(true);
      expect(mockStorage['obsidian.theme']).toBe('dark');

      expect(toggleTheme()).toBe('light');
      expect(rootClasses.has('dark')).toBe(false);

      expect(toggleTheme()).toBe('dark');
      expect(rootClasses.has('dark')).toBe(true);
    });
  });

  describe('Language Detection & Code Diagnostics (src/lib/language.ts & codeDiagnostics.ts)', () => {
    it('maps file extensions to authoritative languages and falls back to plaintext', () => {
      expect(detectLanguage('index.js')).toBe('javascript');
      expect(detectLanguage('app.tsx')).toBe('typescript');
      expect(detectLanguage('script.py')).toBe('python');
      expect(detectLanguage('main.c')).toBe('c');
      expect(detectLanguage('engine.cpp')).toBe('cpp');
      expect(detectLanguage('App.java')).toBe('java');
      expect(detectLanguage('server.go')).toBe('go');
      expect(detectLanguage('task.rb')).toBe('ruby');
      expect(detectLanguage('api.php')).toBe('php');
      expect(detectLanguage('run.sh')).toBe('bash');
      expect(detectLanguage('index.html')).toBe('html');
      expect(detectLanguage('styles.scss')).toBe('css');
      expect(detectLanguage('config.json')).toBe('json');
      expect(detectLanguage('README.md')).toBe('markdown');
      expect(detectLanguage('schema.sql')).toBe('sql');
      expect(detectLanguage('.gitignore')).toBe('plaintext');
      expect(detectLanguage('Makefile')).toBe('plaintext');
      expect(detectLanguage('file.unknown')).toBe('plaintext');
    });

    it('detects delimiter mismatches while ignoring delimiters inside strings and comments', () => {
      const cleanWithStringsAndComments = [
        '// ignored unmatched ( { [',
        'const str = "also ignored ( [ {";',
        'const escaped = "quote \\" inside (";',
        '/* block comment [ { ( */',
        'function ok(a) { return [a]; }',
      ].join('\n');
      expect(
        analyzeCode(cleanWithStringsAndComments, 'f-clean', 'ok.js', 'javascript').filter(
          (d) => d.severity === 'error'
        )
      ).toHaveLength(0);

      const broken = 'function test() {\n  const x = (1 + 2;\n}';
      const items = analyzeCode(broken, 'f-broken', 'broken.js', 'javascript');
      const unclosedParen = items.find((i) => i.message.includes("Unclosed delimiter '('"));
      expect(unclosedParen).toBeDefined();
      expect(unclosedParen?.line).toBe(2);

      const extraClose = 'const a = 1; }';
      const extraItems = analyzeCode(extraClose, 'f-extra', 'extra.js', 'javascript');
      expect(extraItems.some((i) => i.message.includes("Unmatched closing delimiter '}'"))).toBe(true);
    });

    it('diagnoses JSON parse errors, JS/TS lints, Python missing colons, and avoids JS lints in C', () => {
      const badJson = '{\n  "name": "Obsidian",\n  "version":\n}';
      const jsonItems = analyzeCode(badJson, 'f-json', 'package.json', 'json');
      expect(jsonItems.length).toBeGreaterThan(0);
      expect(jsonItems[0].source).toBe('JSON Parser');
      expect(jsonItems[0].severity).toBe('error');

      const jsLintCode = '// var ignored = 1 == 2;\nvar total = 100;\nif (total == 100) {\n  debugger;\n  console.log(total);\n}';
      const jsItems = analyzeCode(jsLintCode, 'f-js', 'main.js', 'javascript');
      expect(jsItems.some((i) => i.source.includes('no-var') && i.line === 2)).toBe(true);
      expect(jsItems.some((i) => i.source.includes('eqeqeq') && i.line === 3)).toBe(true);
      expect(jsItems.some((i) => i.source.includes('no-debugger') && i.line === 4)).toBe(true);
      expect(jsItems.some((i) => i.source === 'Code Smell' && i.line === 5)).toBe(true);
      expect(jsItems.some((i) => i.line === 1)).toBe(false);

      const pyCode = 'def calc(x, y)\n    if x > y\n        return x\n';
      const pyItems = analyzeCode(pyCode, 'f-py', 'calc.py', 'python');
      const colonErrs = pyItems.filter((i) => i.source === 'Python Syntax');
      expect(colonErrs.map((e) => e.line)).toEqual([1, 2]);

      const cItems = analyzeCode('printf("hi");', 'f-c', 'main.c', detectLanguage('main.c'));
      expect(cItems).toHaveLength(0);
    });
  });

  describe('Workspace ZIP Export (src/lib/exportWorkspace.ts)', () => {
    afterEach(() => {
      vi.unstubAllGlobals();
      vi.restoreAllMocks();
    });

    it('packages folders and live file contents into a valid ZIP, triggers download, and revokes object URL', async () => {
      let capturedBlob: Blob | null = null;
      let clickedDownload = '';
      let appended = false;
      let removed = false;

      const fakeAnchor: any = {
        href: '',
        download: '',
        parentNode: null as any,
        click: vi.fn(() => {
          clickedDownload = fakeAnchor.download;
        }),
      };

      const fakeBody = {
        appendChild: vi.fn((node: any) => {
          appended = true;
          node.parentNode = fakeBody;
        }),
        removeChild: vi.fn((node: any) => {
          removed = true;
          node.parentNode = null;
        }),
      };

      vi.stubGlobal('document', {
        createElement: vi.fn(() => fakeAnchor),
        body: fakeBody,
      });

      const createObjectURLSpy = vi.spyOn(URL, 'createObjectURL').mockImplementation((blob: Blob | MediaSource) => {
        capturedBlob = blob as Blob;
        return 'blob:obsidian-test-zip';
      });
      const revokeObjectURLSpy = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
      const startSpy = vi.spyOn(notify, 'exportStarted').mockImplementation(() => 'id' as any);
      const completedSpy = vi.spyOn(notify, 'exportCompleted').mockImplementation(() => {});

      const files: ProjectFile[] = [
        { _id: 'dir1', projectId: 'p1', name: 'src', path: 'src', isFolder: true },
        { _id: 'f1', projectId: 'p1', name: 'index.html', path: '/index.html', isFolder: false },
        { _id: 'f2', projectId: 'p1', name: 'app.ts', path: 'src/app.ts', isFolder: false },
      ];

      const getContent = vi.fn(async (id: string) =>
        id === 'f1' ? '<h1>Obsidian</h1>' : 'export const ready = true;'
      );

      await exportWorkspaceAsZip('My Cool Project!', files, getContent);

      expect(startSpy).toHaveBeenCalledTimes(1);
      expect(getContent).toHaveBeenCalledTimes(2);
      expect(createObjectURLSpy).toHaveBeenCalledTimes(1);
      expect(appended).toBe(true);
      expect(fakeAnchor.click).toHaveBeenCalledTimes(1);
      expect(clickedDownload).toBe('my-cool-project-workspace.zip');
      expect(removed).toBe(true);
      expect(revokeObjectURLSpy).toHaveBeenCalledWith('blob:obsidian-test-zip');
      expect(completedSpy).toHaveBeenCalledWith('my-cool-project-workspace.zip');

      expect(capturedBlob).not.toBeNull();
      const loadedZip = await JSZip.loadAsync(await capturedBlob!.arrayBuffer());
      expect(await loadedZip.file('My Cool Project!/index.html')?.async('string')).toBe('<h1>Obsidian</h1>');
      expect(await loadedZip.file('My Cool Project!/src/app.ts')?.async('string')).toBe(
        'export const ready = true;'
      );
    });

    it('reports export failure via notify.error when getFileContent throws and still cleans up', async () => {
      vi.spyOn(notify, 'exportStarted').mockImplementation(() => 'id' as any);
      const errorSpy = vi.spyOn(notify, 'error').mockImplementation(() => {});

      await exportWorkspaceAsZip(
        'Broken Proj',
        [{ _id: 'f1', projectId: 'p1', name: 'a.js', path: 'a.js', isFolder: false }],
        async () => {
          throw new Error('Disk read failed');
        }
      );

      expect(errorSpy).toHaveBeenCalledWith('Export Failed', 'Disk read failed');
    });
  });

  describe('Curated Monaco Completions (src/lib/monacoCompletions.ts)', () => {
    it('returns curated completions per language without cross-language leakage', () => {
      const py = getLanguageCompletions('python').map((c) => c.label);
      expect(py).toContain('print');
      expect(py).toContain('def');
      expect(py).not.toContain('printf');

      const java = getLanguageCompletions('java').map((c) => c.label);
      expect(java).toContain('System.out.println');
      expect(java).toContain('println');

      const c = getLanguageCompletions('c').map((c) => c.label);
      expect(c).toContain('printf');
      expect(c).toContain('#include <stdio.h>');

      const cpp = getLanguageCompletions('cpp').map((c) => c.label);
      expect(cpp).toContain('std::cout');
      expect(cpp).toContain('std::vector');

      const go = getLanguageCompletions('go').map((c) => c.label);
      expect(go).toContain('fmt.Println');
      expect(getLanguageCompletions('unknown')).toEqual([]);
    });

    it('registers providers once per Monaco instance, suppresses inside comments, and resolves qualifier ranges', () => {
      const providers = new Map<string, any>();
      const registerMock = vi.fn((lang: string, provider: any) => {
        providers.set(lang, provider);
        return { dispose: vi.fn() };
      });

      const mockMonaco = {
        languages: {
          CompletionItemKind: { Keyword: 17, Function: 1, Snippet: 27, Class: 5 },
          CompletionItemInsertTextRule: { InsertAsSnippet: 4 },
          registerCompletionItemProvider: registerMock,
        },
      } as any;

      registerMonacoCompletions(mockMonaco);
      registerMonacoCompletions(mockMonaco); // Idempotent second call
      expect(registerMock).toHaveBeenCalledTimes(5);
      expect(Array.from(providers.keys())).toEqual(['python', 'java', 'c', 'cpp', 'go']);

      // Python comment suppresses suggestions
      const pyProvider = providers.get('python');
      expect(pyProvider.triggerCharacters).toEqual(['.', ':', '#']);
      const commentRes = pyProvider.provideCompletionItems(
        {
          getValueInRange: () => '  # print(',
          getWordUntilPosition: () => ({ startColumn: 5, endColumn: 10 }),
        },
        { lineNumber: 1, column: 10 }
      );
      expect(commentRes.suggestions).toEqual([]);

      // C++ qualifier "std::" resets replacement startColumn and filters to std:: entries
      const cppProvider = providers.get('cpp');
      const cppRes = cppProvider.provideCompletionItems(
        {
          getValueInRange: () => '  std::co',
          getWordUntilPosition: () => ({ startColumn: 8, endColumn: 10 }),
        },
        { lineNumber: 1, column: 10 }
      );
      expect(cppRes.suggestions.length).toBeGreaterThan(0);
      expect(cppRes.suggestions.every((s: any) => s.label.startsWith('std'))).toBe(true);
      expect(cppRes.suggestions[0].range.startColumn).toBe(3);

      // Java qualifier "System.out."
      const javaProvider = providers.get('java');
      const javaRes = javaProvider.provideCompletionItems(
        {
          getValueInRange: () => 'System.out.pri',
          getWordUntilPosition: () => ({ startColumn: 12, endColumn: 15 }),
        },
        { lineNumber: 1, column: 15 }
      );
      expect(javaRes.suggestions.some((s: any) => s.label === 'System.out.println')).toBe(true);
      expect(javaRes.suggestions[0].range.startColumn).toBe(1);
    });
  });

  describe('Shared Monaco Editor Options (src/components/workspace/editorOptions.ts)', () => {
    it('shares JetBrains Mono metrics, wordBasedSuggestions=currentDocument, editable splitEditorOptions, and read-only mirrorEditorOptions', () => {
      const primaryFont = String(editorOptions.fontFamily).split(',')[0].trim().replace(/['"]/g, '');
      expect(primaryFont).toBe('JetBrains Mono');
      expect(editorOptions.fontLigatures).toBe(false);
      expect(editorOptions.wordBasedSuggestions).toBe('currentDocument');
      expect(baseEditorOptions).toEqual(editorOptions);

      // Split editor is editable with minimap disabled and shares base config
      expect(splitEditorOptions.readOnly).not.toBe(true);
      expect(splitEditorOptions.minimap).toEqual({ enabled: false });
      expect(splitEditorOptions.fontFamily).toBe(editorOptions.fontFamily);
      expect(splitEditorOptions.wordBasedSuggestions).toBe('currentDocument');

      // Mirror editor is read-only with minimap disabled and shares base config
      expect(mirrorEditorOptions.readOnly).toBe(true);
      expect(mirrorEditorOptions.minimap).toEqual({ enabled: false });
      const { readOnly: _r, minimap: _m, ...mirrorRest } = mirrorEditorOptions;
      expect(mirrorRest).toMatchObject(editorOptions);
    });
  });
});
