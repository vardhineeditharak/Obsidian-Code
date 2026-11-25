import React, { useRef, useEffect, useState, useCallback } from 'react';
import Editor, { OnMount, BeforeMount } from '@monaco-editor/react';
import type * as Monaco from 'monaco-editor';
import { X, Columns2, Rows2, ShieldAlert } from 'lucide-react';
import { ProjectFile, ProjectRole, CollaboratorPresence, DiagnosticsItem } from '../../lib/types';
import { docManager } from '../../lib/crdt/docManager';
import { ensureFontsReady } from '../../lib/fonts';
import { useTheme } from '../../lib/theme';
import { detectLanguage } from '../../lib/language';
import { registerMonacoCompletions } from '../../lib/monacoCompletions';
import '../../lib/monacoSetup';

import {
  editorOptions,
  baseEditorOptions,
  splitEditorOptions,
  mirrorEditorOptions,
} from './editorOptions';
export { editorOptions, baseEditorOptions, splitEditorOptions, mirrorEditorOptions };

export interface EditorWorkspaceProps {
  projectId: string;
  files: ProjectFile[];
  openFileIds: string[];
  activeFileId: string | null;
  onSelectFile: (fileId: string) => void;
  onCloseTab: (fileId: string) => void;
  userRole: ProjectRole;
  user: { id: string; name: string; avatar?: string };
  collaborators: CollaboratorPresence[];
  followingUserId: string | null;
  diagnostics: DiagnosticsItem[];
  onCursorChange: (line: number, column: number) => void;
  onContentChange: (content: string) => void;
  onCreateCheckpoint: () => void;
  isPublic?: boolean;
  revealTarget?: { fileId: string; line: number; column: number; endColumn?: number; nonce: number } | null;
  replaceModelContent?: { fileId: string; content: string; nonce: number } | null;
  onAdoptFileContent?: (fileId: string, content: string) => void;
  onSecondaryContentChange?: (fileId: string, content: string) => void;
  onStopFollowing?: () => void;
}

const CRYSTALLINE_THEME: Monaco.editor.IStandaloneThemeData = {
  base: 'vs-dark',
  inherit: true,
  rules: [
    { token: '', foreground: 'eeeeee', background: '171717' },
    { token: 'comment', foreground: '6b6b6b', fontStyle: 'italic' },
    { token: 'keyword', foreground: 'a78bfa', fontStyle: 'bold' },
    { token: 'string', foreground: '4ade80' },
    { token: 'number', foreground: 'facc15' },
    { token: 'function', foreground: 'eeeeee' },
    { token: 'type', foreground: 'bcbcbc' },
    { token: 'variable', foreground: 'eeeeee' },
    { token: 'delimiter', foreground: 'a3a3a3' },
  ],
  colors: {
    'editor.background': '#171717',
    'editor.foreground': '#eeeeee',
    'editorLineNumber.foreground': '#6b6b6b',
    'editorLineNumber.activeForeground': '#eeeeee',
    'editorCursor.foreground': '#a78bfa',
    'editor.selectionBackground': '#7c3aed59',
    'editor.inactiveSelectionBackground': '#7c3aed26',
    'editor.lineHighlightBackground': '#1e1e1e',
    'editorIndentGuide.background': '#2a2a2a',
    'editorIndentGuide.activeBackground': '#3f3f3f',
    'editorGutter.background': '#171717',
  },
};

function defineObsidianThemes(monaco: typeof Monaco): void {
  monaco.editor.defineTheme('obsidian-crystalline', CRYSTALLINE_THEME);
  monaco.editor.defineTheme('cursor-parchment-dark', CRYSTALLINE_THEME);
  monaco.editor.defineTheme('cursor-parchment-light', CRYSTALLINE_THEME);
  monaco.editor.setTheme('obsidian-crystalline');
}

export const EditorWorkspace: React.FC<EditorWorkspaceProps> = ({
  projectId,
  files,
  openFileIds,
  activeFileId,
  onSelectFile,
  onCloseTab,
  userRole,
  user,
  collaborators,
  followingUserId,
  diagnostics,
  onCursorChange,
  onContentChange,
  onCreateCheckpoint,
  isPublic = false,
  revealTarget,
  replaceModelContent,
  onAdoptFileContent,
  onSecondaryContentChange,
  onStopFollowing,
}) => {
  const { isDark } = useTheme();
  const editorRef = useRef<Monaco.editor.IStandaloneCodeEditor | null>(null);
  const splitEditorRef = useRef<Monaco.editor.IStandaloneCodeEditor | null>(null);
  const monacoRef = useRef<typeof Monaco | null>(null);

  const prevActiveFileIdRef = useRef<string | null>(null);
  const activeFileIdRef = useRef<string | null>(activeFileId);
  const [splitFileId, setSplitFileId] = useState<string | null>(null);
  const splitFileIdRef = useRef<string | null>(null);
  const prevSplitFileIdRef = useRef<string | null>(null);
  const filesRef = useRef<ProjectFile[]>(files);

  const viewStatesRef = useRef<Map<string, Monaco.editor.ICodeEditorViewState>>(new Map());
  const [fontsReady, setFontsReady] = useState(false);
  const revealPendingRef = useRef<{
    fileId: string;
    line: number;
    column: number;
    endColumn?: number;
    nonce: number;
  } | null>(null);

  // Latest callback refs so Monaco mount listeners never close over stale props
  const onCursorChangeRef = useRef(onCursorChange);
  const onContentChangeRef = useRef(onContentChange);
  const onSecondaryContentChangeRef = useRef(onSecondaryContentChange);
  const onCreateCheckpointRef = useRef(onCreateCheckpoint);
  const onAdoptFileContentRef = useRef(onAdoptFileContent);

  onCursorChangeRef.current = onCursorChange;
  onContentChangeRef.current = onContentChange;
  onSecondaryContentChangeRef.current = onSecondaryContentChange;
  onCreateCheckpointRef.current = onCreateCheckpoint;
  onAdoptFileContentRef.current = onAdoptFileContent;

  activeFileIdRef.current = activeFileId;
  splitFileIdRef.current = splitFileId;
  filesRef.current = files;

  const [splitMode, setSplitMode] = useState<'single' | 'vertical' | 'horizontal'>('single');
  const [splitRatio, setSplitRatio] = useState<number>(() => {
    if (typeof window === 'undefined') return 50;
    try {
      const stored = localStorage.getItem('obsidian.layout.splitRatio');
      if (stored !== null) {
        const parsed = Number(stored);
        if (!Number.isNaN(parsed) && parsed >= 20 && parsed <= 80) return parsed;
      }
    } catch {}
    return 50;
  });

  const isDraggingSplitRef = useRef(false);
  const splitRatioRef = useRef(splitRatio);
  splitRatioRef.current = splitRatio;
  const containerRef = useRef<HTMLDivElement>(null);
  const rAFSplitRef = useRef<number | null>(null);

  const isViewer = userRole === 'viewer';
  const nonFolderFiles = files.filter((f) => !f.isFolder);
  const activeFile = files.find((f) => f._id === activeFileId) || null;
  const splitFile = nonFolderFiles.find((f) => f._id === splitFileId) || activeFile || null;

  // Font readiness gating + live remeasurement when fonts finish loading
  useEffect(() => {
    let active = true;
    ensureFontsReady().finally(() => {
      if (active) {
        setFontsReady(true);
        if (monacoRef.current) {
          try {
            monacoRef.current.editor.remeasureFonts();
          } catch {}
        }
      }
    });

    const handleLoadingDone = () => {
      if (monacoRef.current) {
        try {
          monacoRef.current.editor.remeasureFonts();
        } catch {}
      }
    };

    if (typeof document !== 'undefined' && document.fonts) {
      document.fonts.addEventListener('loadingdone', handleLoadingDone);
    }

    return () => {
      active = false;
      if (rAFSplitRef.current) {
        cancelAnimationFrame(rAFSplitRef.current);
      }
      if (isDraggingSplitRef.current && typeof document !== 'undefined') {
        document.body.style.userSelect = '';
        isDraggingSplitRef.current = false;
      }
      if (typeof document !== 'undefined' && document.fonts) {
        document.fonts.removeEventListener('loadingdone', handleLoadingDone);
      }
    };
  }, []);

  // Reset primary editor ref when all tabs are closed so reopening remounts cleanly
  useEffect(() => {
    if (!activeFile) {
      editorRef.current = null;
      prevActiveFileIdRef.current = null;
    }
  }, [activeFile]);

  // Synchronize live readOnly option on role transitions
  useEffect(() => {
    editorRef.current?.updateOptions({ readOnly: isViewer });
    splitEditorRef.current?.updateOptions({ readOnly: isViewer });
  }, [isViewer]);

  // Authoritative per-file Monaco model registry keyed by file://<fileId>
  const getOrCreateModel = useCallback(
    (monaco: typeof Monaco, file: ProjectFile): Monaco.editor.ITextModel => {
      const uri = monaco.Uri.parse(`file://${file._id}`);
      let model = monaco.editor.getModel(uri);
      const lang = detectLanguage(file.name) || file.language || 'plaintext';
      if (!model) {
        const session = docManager.getSession(projectId, file._id);
        const initialText = session && session.ytext.length > 0 ? session.ytext.toString() : '';
        model = monaco.editor.createModel(initialText, lang, uri);
      } else {
        monaco.editor.setModelLanguage(model, lang);
      }
      return model;
    },
    [projectId]
  );

  // Update Monaco diagnostic markers for the active file
  useEffect(() => {
    if (!monacoRef.current || !editorRef.current || !activeFile) return;
    const model = editorRef.current.getModel();
    if (!model) return;

    const fileDiagnostics = diagnostics.filter((d) => d.fileId === activeFile._id);
    const markers: Monaco.editor.IMarkerData[] = fileDiagnostics.map((d) => ({
      startLineNumber: d.line,
      startColumn: d.column,
      endLineNumber: d.endLine,
      endColumn: d.endColumn,
      message: d.message,
      severity:
        d.severity === 'error'
          ? monacoRef.current!.MarkerSeverity.Error
          : d.severity === 'warning'
          ? monacoRef.current!.MarkerSeverity.Warning
          : monacoRef.current!.MarkerSeverity.Info,
      source: d.source,
    }));

    monacoRef.current.editor.setModelMarkers(model, 'obsidian-diagnostics', markers);
  }, [diagnostics, activeFile, fontsReady]);

  // Follow Mode viewport tracking
  useEffect(() => {
    if (!followingUserId || !editorRef.current) return;
    const target = collaborators.find((c) => c.id === followingUserId);
    if (target?.cursor && target.fileId === activeFileId) {
      editorRef.current.revealLineInCenter(target.cursor.line);
      editorRef.current.setPosition({
        lineNumber: target.cursor.line,
        column: target.cursor.column,
      });
    }
  }, [collaborators, followingUserId, activeFileId]);

  // Queue and apply revealTarget (Search result & Problems jump-to-line)
  useEffect(() => {
    if (revealTarget) {
      revealPendingRef.current = revealTarget;
    }
  }, [revealTarget]);

  useEffect(() => {
    if (
      revealPendingRef.current &&
      revealPendingRef.current.fileId === activeFileId &&
      editorRef.current
    ) {
      const { line, column, endColumn } = revealPendingRef.current;
      editorRef.current.setSelection({
        startLineNumber: line,
        startColumn: column,
        endLineNumber: line,
        endColumn: endColumn ?? column,
      });
      editorRef.current.revealLineInCenter(line);
      editorRef.current.focus();
      revealPendingRef.current = null;
    }
  }, [revealTarget, activeFileId]);

  // Apply explicit model content replacements (Checkpoint restore / Batch replace)
  useEffect(() => {
    if (!replaceModelContent || !monacoRef.current) return;
    const uri = monacoRef.current.Uri.parse(`file://${replaceModelContent.fileId}`);
    const model = monacoRef.current.editor.getModel(uri);
    if (model && model.getValue() !== replaceModelContent.content) {
      if (editorRef.current && replaceModelContent.fileId === activeFileId) {
        editorRef.current.executeEdits('replace-model-content', [
          {
            range: model.getFullModelRange(),
            text: replaceModelContent.content,
          },
        ]);
      } else if (splitEditorRef.current && replaceModelContent.fileId === splitFileId) {
        splitEditorRef.current.executeEdits('replace-model-content', [
          {
            range: model.getFullModelRange(),
            text: replaceModelContent.content,
          },
        ]);
      } else {
        model.pushEditOperations(
          [],
          [
            {
              range: model.getFullModelRange(),
              text: replaceModelContent.content,
            },
          ],
          () => null
        );
      }
    }
  }, [replaceModelContent, activeFileId, splitFileId]);

  const bindActiveFile = useCallback(
    async (
      editor: Monaco.editor.IStandaloneCodeEditor,
      file: ProjectFile,
      model: Monaco.editor.ITextModel
    ) => {
      try {
        const session = await docManager.getOrCreateSession(
          projectId,
          file._id,
          file.content || '',
          undefined,
          isPublic
        );

        // Guard against rapid tab switch while awaiting session hydration
        if (activeFileIdRef.current !== file._id) {
          return;
        }

        const liveText = session.ytext.toString();
        if (liveText && liveText !== file.content) {
          onAdoptFileContentRef.current?.(file._id, liveText);
        }

        docManager.bindMonaco(
          projectId,
          file._id,
          editor,
          {
            id: user.id,
            name: user.name,
            color: '#c08532',
            avatar: user.avatar,
            role: userRole,
            fileId: file._id,
          },
          model,
          'primary'
        );

        onContentChangeRef.current(model.getValue());

        if (revealPendingRef.current && revealPendingRef.current.fileId === file._id) {
          const { line, column, endColumn } = revealPendingRef.current;
          editor.setSelection({
            startLineNumber: line,
            startColumn: column,
            endLineNumber: line,
            endColumn: endColumn ?? column,
          });
          editor.revealLineInCenter(line);
          editor.focus();
          revealPendingRef.current = null;
        }
      } catch (err) {
        console.warn('Yjs Monaco binding initialized locally:', err);
      }
    },
    [projectId, isPublic, user.id, user.name, user.avatar, userRole]
  );

  const bindSplitFile = useCallback(
    async (
      editor: Monaco.editor.IStandaloneCodeEditor,
      file: ProjectFile,
      model: Monaco.editor.ITextModel
    ) => {
      try {
        // When both panes view the same file, share the primary pane's bound ITextModel
        // and ensure no duplicate secondary MonacoBinding exists for either old or current file.
        if (file._id === activeFileIdRef.current) {
          if (prevSplitFileIdRef.current) {
            docManager.destroyBinding(prevSplitFileIdRef.current, 'secondary');
          }
          docManager.destroyBinding(file._id, 'secondary');
          prevSplitFileIdRef.current = file._id;
          return;
        }

        const session = await docManager.getOrCreateSession(
          projectId,
          file._id,
          file.content || '',
          undefined,
          isPublic
        );

        if (splitFileIdRef.current !== file._id) {
          return;
        }

        const liveText = session.ytext.toString();
        if (liveText && liveText !== file.content) {
          onAdoptFileContentRef.current?.(file._id, liveText);
        }

        docManager.bindMonaco(
          projectId,
          file._id,
          editor,
          {
            id: user.id,
            name: user.name,
            color: '#c08532',
            avatar: user.avatar,
            role: userRole,
            fileId: file._id,
          },
          model,
          'secondary'
        );
        prevSplitFileIdRef.current = file._id;
      } catch (err) {
        console.warn('Split pane Yjs binding initialized locally:', err);
      }
    },
    [projectId, isPublic, user.id, user.name, user.avatar, userRole]
  );

  const handleBeforeMount: BeforeMount = (monaco) => {
    monacoRef.current = monaco;
    defineObsidianThemes(monaco);
  };

  const handleEditorMount: OnMount = (editor, monaco) => {
    editorRef.current = editor;
    monacoRef.current = monaco;

    if (typeof window !== 'undefined') {
      (window as unknown as { __monaco: typeof Monaco }).__monaco = monaco;
    }

    try {
      monaco.editor.remeasureFonts();
    } catch {}

    registerMonacoCompletions(monaco);
    defineObsidianThemes(monaco);

    editor.onDidChangeCursorPosition((e) => {
      onCursorChangeRef.current(e.position.lineNumber, e.position.column);
      const currentId = activeFileIdRef.current;
      if (currentId) {
        docManager.updateCursorAwareness(projectId, currentId, {
          line: e.position.lineNumber,
          column: e.position.column,
        });
      }
    });

    editor.onDidChangeModelContent(() => {
      onContentChangeRef.current(editor.getValue());
    });

    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
      onCreateCheckpointRef.current();
    });

    const currentFile = filesRef.current.find((f) => f._id === activeFileIdRef.current);
    if (currentFile) {
      const model = getOrCreateModel(monaco, currentFile);
      const lang = detectLanguage(currentFile.name) || currentFile.language || 'plaintext';
      monaco.editor.setModelLanguage(model, lang);
      editor.setModel(model);
      prevActiveFileIdRef.current = currentFile._id;
      if (docManager.getSession(projectId, currentFile._id) || !currentFile.content) {
        onContentChangeRef.current(model.getValue());
      }
      bindActiveFile(editor, currentFile, model);
    }
  };

  const handleSplitEditorMount: OnMount = (editor, monaco) => {
    splitEditorRef.current = editor;
    if (!monacoRef.current) {
      monacoRef.current = monaco;
    }

    try {
      monaco.editor.remeasureFonts();
    } catch {}

    registerMonacoCompletions(monaco);
    defineObsidianThemes(monaco);

    editor.onDidChangeModelContent(() => {
      const targetId = splitFileIdRef.current || activeFileIdRef.current;
      if (!targetId) return;
      if (targetId === activeFileIdRef.current) {
        onContentChangeRef.current(editor.getValue());
      } else {
        onSecondaryContentChangeRef.current?.(targetId, editor.getValue());
      }
    });

    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
      onCreateCheckpointRef.current();
    });

    const currentSplitId = splitFileIdRef.current || activeFileIdRef.current;
    const target =
      filesRef.current.find((f) => !f.isFolder && f._id === currentSplitId) ||
      filesRef.current.find((f) => f._id === activeFileIdRef.current);

    if (target) {
      const model = getOrCreateModel(monaco, target);
      editor.setModel(model);
      bindSplitFile(editor, target, model);
    }
  };

  // Switch primary editor model on tab change
  useEffect(() => {
    if (!editorRef.current || !monacoRef.current || !activeFile) return;

    if (prevActiveFileIdRef.current && prevActiveFileIdRef.current !== activeFile._id) {
      const vs = editorRef.current.saveViewState();
      if (vs) {
        viewStatesRef.current.set(prevActiveFileIdRef.current, vs);
      }
    }
    prevActiveFileIdRef.current = activeFile._id;

    const model = getOrCreateModel(monacoRef.current, activeFile);
    const lang = detectLanguage(activeFile.name) || activeFile.language || 'plaintext';
    monacoRef.current.editor.setModelLanguage(model, lang);

    if (editorRef.current.getModel() !== model) {
      editorRef.current.setModel(model);
    }

    const savedVs = viewStatesRef.current.get(activeFile._id);
    if (savedVs) {
      editorRef.current.restoreViewState(savedVs);
    }

    if (docManager.getSession(projectId, activeFile._id) || !activeFile.content) {
      onContentChangeRef.current(model.getValue());
    }

    bindActiveFile(editorRef.current, activeFile, model);
  }, [activeFileId]);

  // Keep primary model language synced if file is renamed
  useEffect(() => {
    if (!editorRef.current || !monacoRef.current || !activeFile) return;
    const model = getOrCreateModel(monacoRef.current, activeFile);
    const lang = detectLanguage(activeFile.name) || activeFile.language || 'plaintext';
    monacoRef.current.editor.setModelLanguage(model, lang);
  }, [activeFile?.name, activeFile?.language, getOrCreateModel, activeFile]);

  // Sync splitFileId when entering/leaving split mode or when files change
  useEffect(() => {
    if (splitMode === 'single') {
      if (prevSplitFileIdRef.current) {
        docManager.destroyBinding(prevSplitFileIdRef.current, 'secondary');
        prevSplitFileIdRef.current = null;
      }
      splitEditorRef.current = null;
      return;
    }

    if (!splitFileId || !nonFolderFiles.some((f) => f._id === splitFileId)) {
      const otherOpen = openFileIds.find(
        (id) => id !== activeFileId && nonFolderFiles.some((f) => f._id === id)
      );
      setSplitFileId(otherOpen || activeFileId || nonFolderFiles[0]?._id || null);
    }
  }, [splitMode, activeFileId, files, openFileIds, splitFileId, nonFolderFiles]);

  // Swap split pane model & binding when splitFile or primary activeFile changes
  useEffect(() => {
    if (splitMode === 'single' || !splitEditorRef.current || !monacoRef.current || !splitFile) return;

    const model = getOrCreateModel(monacoRef.current, splitFile);
    const lang = detectLanguage(splitFile.name) || splitFile.language || 'plaintext';
    monacoRef.current.editor.setModelLanguage(model, lang);
    if (splitEditorRef.current.getModel() !== model) {
      splitEditorRef.current.setModel(model);
    }
    bindSplitFile(splitEditorRef.current, splitFile, model);
  }, [splitFile?._id, splitFile?.name, splitMode, activeFileId, fontsReady, getOrCreateModel, bindSplitFile, splitFile]);

  useEffect(() => {
    if (monacoRef.current) {
      monacoRef.current.editor.setTheme('obsidian-crystalline');
    }
  }, [isDark]);

  // Close tab cleanly without breaking split pane if it still holds the same file
  const handleTabClose = (fileId: string) => {
    const stillUsedInSplit = splitMode !== 'single' && splitFileId === fileId;
    docManager.destroyBinding(fileId, stillUsedInSplit ? 'primary' : undefined);
    viewStatesRef.current.delete(fileId);
    if (!stillUsedInSplit && monacoRef.current) {
      const uri = monacoRef.current.Uri.parse(`file://${fileId}`);
      const model = monacoRef.current.editor.getModel(uri);
      if (model) {
        model.dispose();
      }
    }
    onCloseTab(fileId);
  };

  // Dispose models & bindings for files no longer open in either pane
  useEffect(() => {
    if (!monacoRef.current) return;
    const openSet = new Set(openFileIds);
    files.forEach((f) => {
      const inSplit = splitMode !== 'single' && f._id === splitFileId;
      if (!openSet.has(f._id)) {
        docManager.destroyBinding(f._id, inSplit ? 'primary' : undefined);
        viewStatesRef.current.delete(f._id);
        if (!inSplit) {
          const uri = monacoRef.current!.Uri.parse(`file://${f._id}`);
          const model = monacoRef.current!.editor.getModel(uri);
          if (model) {
            model.dispose();
          }
        }
      }
    });
  }, [openFileIds, files, splitFileId, splitMode]);

  // Split handle pointer & keyboard controls
  const updateAndPersistSplitRatio = (next: number) => {
    const clamped = Math.max(20, Math.min(80, Math.round(next)));
    splitRatioRef.current = clamped;
    setSplitRatio(clamped);
    try {
      localStorage.setItem('obsidian.layout.splitRatio', String(clamped));
    } catch {}
  };

  const handleSplitPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    isDraggingSplitRef.current = true;
    document.body.style.userSelect = 'none';
  };

  const handleSplitPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDraggingSplitRef.current || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    let newRatio = splitRatio;
    if (splitMode === 'vertical' && rect.width > 0) {
      newRatio = ((e.clientX - rect.left) / rect.width) * 100;
    } else if (splitMode === 'horizontal' && rect.height > 0) {
      newRatio = ((e.clientY - rect.top) / rect.height) * 100;
    }
    const clamped = Math.max(20, Math.min(80, Math.round(newRatio)));
    splitRatioRef.current = clamped;

    if (rAFSplitRef.current) cancelAnimationFrame(rAFSplitRef.current);
    rAFSplitRef.current = requestAnimationFrame(() => {
      setSplitRatio(clamped);
    });
  };

  const handleSplitPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDraggingSplitRef.current) return;
    isDraggingSplitRef.current = false;
    document.body.style.userSelect = '';
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {}
    if (rAFSplitRef.current) {
      cancelAnimationFrame(rAFSplitRef.current);
      rAFSplitRef.current = null;
    }
    updateAndPersistSplitRatio(splitRatioRef.current);
  };

  const handleSplitKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Home') {
      e.preventDefault();
      updateAndPersistSplitRatio(50);
      return;
    }
    if (splitMode === 'vertical') {
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        updateAndPersistSplitRatio(splitRatio - 5);
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        updateAndPersistSplitRatio(splitRatio + 5);
      }
    } else if (splitMode === 'horizontal') {
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        updateAndPersistSplitRatio(splitRatio - 5);
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        updateAndPersistSplitRatio(splitRatio + 5);
      }
    }
  };

  const followedCollaborator = followingUserId
    ? collaborators.find((c) => c.id === followingUserId) || null
    : null;

  return (
    <div className="flex-1 flex flex-col bg-parchment overflow-hidden select-none transition-colors duration-200">
      {/* Editor Tabs Header Bar */}
      <div className="h-9 border-b border-(--border-subtle) bg-parchment/90 flex items-center justify-between px-2 gap-2 shrink-0">
        {/* Open Tabs */}
        <div
          role="tablist"
          aria-label="Open editor tabs"
          className="flex items-center gap-1 overflow-x-auto flex-1 min-w-0"
        >
          {openFileIds.map((fileId) => {
            const file = files.find((f) => f._id === fileId);
            if (!file) return null;
            const isActive = activeFileId === fileId;

            return (
              <div
                key={fileId}
                role="tab"
                tabIndex={0}
                aria-selected={isActive}
                aria-label={`File ${file.name}`}
                onClick={() => onSelectFile(fileId)}
                onAuxClick={(e) => {
                  if (e.button === 1) {
                    e.preventDefault();
                    handleTabClose(fileId);
                  }
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onSelectFile(fileId);
                  }
                }}
                className={`flex items-center gap-2 h-7 px-2.5 text-[12px] font-sans font-medium rounded-[7px] cursor-pointer transition shrink-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber ${
                  isActive
                    ? 'bg-bone border border-white/[0.09] text-ink shadow-[0_1px_2px_rgba(0,0,0,0.28),inset_0_1px_0_rgba(255,255,255,0.06)]'
                    : 'border border-transparent text-driftwood hover:text-ink hover:bg-white/[0.05]'
                }`}
              >
                <span className="truncate max-w-[160px]">{file.name}</span>
                <button
                  type="button"
                  aria-label={`Close tab ${file.name}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleTabClose(fileId);
                  }}
                  className="p-0.5 rounded-[5px] hover:bg-white/[0.1] text-ash hover:text-ink focus:outline-none focus-visible:ring-1 focus-visible:ring-amber transition cursor-pointer shrink-0"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            );
          })}
        </div>

        {/* Split Controls & Viewer Read-Only Badge */}
        <div className="flex items-center gap-2 shrink-0">
          {isViewer && (
            <span className="tag-badge flex items-center gap-1 text-[11px] font-sans font-medium text-warning-yellow bg-warning-yellow/10 border border-warning-yellow/30">
              <ShieldAlert className="w-3 h-3" />
              <span>Read-only</span>
            </span>
          )}

          <div
            className="flex items-center apple-segmented rounded-[8px] p-0.5"
            role="group"
            aria-label="Editor split options"
          >
            <button
              type="button"
              onClick={() => setSplitMode(splitMode === 'vertical' ? 'single' : 'vertical')}
              title="Split Editor Right"
              aria-label="Split Editor Right"
              aria-pressed={splitMode === 'vertical'}
              className={`w-6 h-6 flex items-center justify-center rounded-[6px] transition focus:outline-none focus-visible:ring-1 focus-visible:ring-amber cursor-pointer ${
                splitMode === 'vertical'
                  ? 'apple-segment-active text-ink'
                  : 'text-ash hover:text-ink'
              }`}
            >
              <Columns2 className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setSplitMode(splitMode === 'horizontal' ? 'single' : 'horizontal')}
              title="Split Editor Down"
              aria-label="Split Editor Down"
              aria-pressed={splitMode === 'horizontal'}
              className={`w-6 h-6 flex items-center justify-center rounded-[6px] transition focus:outline-none focus-visible:ring-1 focus-visible:ring-amber cursor-pointer ${
                splitMode === 'horizontal'
                  ? 'apple-segment-active text-ink'
                  : 'text-ash hover:text-ink'
              }`}
            >
              <Rows2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Follow Mode Banner */}
      {followedCollaborator && (
        <div className="h-7 px-3 border-b border-amber/30 bg-amber/10 flex items-center justify-between text-xs font-mono text-ink shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <span
              className="w-2 h-2 rounded-full shrink-0"
              style={{ backgroundColor: followedCollaborator.color }}
            />
            <span className="truncate">
              Following <strong className="font-medium text-amber">{followedCollaborator.name}</strong>
              {followedCollaborator.cursor
                ? ` · Ln ${followedCollaborator.cursor.line}, Col ${followedCollaborator.cursor.column}`
                : ''}
            </span>
          </div>
          {onStopFollowing && (
            <button
              type="button"
              onClick={onStopFollowing}
              className="text-[11px] px-2 py-0.5 rounded bg-bone border border-stone text-driftwood hover:text-ink hover:bg-linen transition cursor-pointer shrink-0"
            >
              Stop Following
            </button>
          )}
        </div>
      )}

      {/* Main Monaco Container */}
      <div
        ref={containerRef}
        className={`flex-1 relative overflow-hidden ${
          splitMode === 'vertical'
            ? 'flex flex-row'
            : splitMode === 'horizontal'
            ? 'flex flex-col'
            : 'flex'
        }`}
      >
        {activeFile ? (
          <>
            <div
              style={
                splitMode !== 'single'
                  ? splitMode === 'vertical'
                    ? { flexBasis: `${splitRatio}%`, width: `${splitRatio}%` }
                    : { flexBasis: `${splitRatio}%`, height: `${splitRatio}%` }
                  : undefined
              }
              className={`${
                splitMode === 'single' ? 'flex-1' : ''
              } relative h-full min-w-0 min-h-0 overflow-hidden`}
            >
              {!fontsReady ? (
                <div className="w-full h-full bg-parchment flex items-center justify-center text-ash">
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-4 border-2 border-stone border-t-ink rounded-full animate-spin" />
                    <span className="text-xs font-mono text-mist">Loading editor fonts...</span>
                  </div>
                </div>
              ) : (
                <Editor
                  height="100%"
                  language={detectLanguage(activeFile.name) || activeFile.language || 'plaintext'}
                  theme="obsidian-crystalline"
                  beforeMount={handleBeforeMount}
                  onMount={handleEditorMount}
                  keepCurrentModel={true}
                  options={{
                    ...baseEditorOptions,
                    readOnly: isViewer,
                    minimap: { enabled: true },
                  }}
                />
              )}
            </div>

            {/* Draggable Splitter Between Primary and Split Panes */}
            {splitMode !== 'single' && (
              <div
                role="separator"
                tabIndex={0}
                aria-orientation={splitMode === 'vertical' ? 'vertical' : 'horizontal'}
                aria-valuenow={splitRatio}
                aria-valuemin={20}
                aria-valuemax={80}
                aria-label="Resize split editor panes"
                onPointerDown={handleSplitPointerDown}
                onPointerMove={handleSplitPointerMove}
                onPointerUp={handleSplitPointerUp}
                onPointerCancel={handleSplitPointerUp}
                onKeyDown={handleSplitKeyDown}
                onDoubleClick={() => updateAndPersistSplitRatio(50)}
                title="Drag to adjust split ratio (double-click to reset 50/50)"
                className={`${
                  splitMode === 'vertical'
                    ? 'w-1 h-full cursor-col-resize hover:bg-ink/40 border-x border-stone'
                    : 'h-1 w-full cursor-row-resize hover:bg-ink/40 border-y border-stone'
                } bg-stone transition shrink-0 z-20 group relative focus:outline-none focus-visible:ring-1 focus-visible:ring-amber`}
              />
            )}

            {/* Editable, Independent Split Editor Pane */}
            {splitMode !== 'single' && (
              <div
                style={
                  splitMode === 'vertical'
                    ? { flexBasis: `${100 - splitRatio}%`, width: `${100 - splitRatio}%` }
                    : { flexBasis: `${100 - splitRatio}%`, height: `${100 - splitRatio}%` }
                }
                className="relative h-full min-w-0 min-h-0 overflow-hidden flex flex-col"
              >
                <div className="h-9 border-b border-(--border-subtle) bg-parchment px-3 flex items-center justify-between shrink-0">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-[11px] font-sans font-semibold uppercase tracking-[0.06em] text-ash shrink-0">
                      Split Pane
                    </span>
                    <select
                      aria-label="Select file for split pane"
                      value={splitFile?._id || ''}
                      onChange={(e) => setSplitFileId(e.target.value)}
                      className="h-6 bg-white/[0.04] border border-white/[0.1] rounded-md px-2 text-[12px] font-sans text-ink focus:outline-none focus-visible:ring-1 focus-visible:ring-amber cursor-pointer max-w-[200px] truncate"
                    >
                      {nonFolderFiles.map((f) => (
                        <option key={f._id} value={f._id}>
                          {f.path || f.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSplitMode('single')}
                    title="Close Split Pane"
                    aria-label="Close Split Pane"
                    className="w-6 h-6 flex items-center justify-center rounded-md text-ash hover:text-ink hover:bg-white/[0.08] transition cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
                <div className="flex-1 relative overflow-hidden">
                  {!fontsReady ? (
                    <div className="w-full h-full bg-parchment flex items-center justify-center text-ash">
                      <span className="text-[12px] font-sans text-mist">Loading editor...</span>
                    </div>
                  ) : (
                    <Editor
                      height="100%"
                      language={
                        splitFile
                          ? detectLanguage(splitFile.name) || splitFile.language || 'plaintext'
                          : 'plaintext'
                      }
                      theme="obsidian-crystalline"
                      beforeMount={handleBeforeMount}
                      options={{
                        ...splitEditorOptions,
                        readOnly: isViewer,
                      }}
                      keepCurrentModel={true}
                      onMount={handleSplitEditorMount}
                    />
                  )}
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-ash space-y-2.5">
            <p className="text-[14px] text-ink font-medium tracking-[-0.01em]">Select or create a file to start editing</p>
            <p className="text-[12px] font-sans text-mist">
              Press <kbd className="font-mono text-[11px] px-1.5 py-0.5 rounded bg-white/[0.05] border border-white/[0.09] text-driftwood">Ctrl+Shift+F</kbd> to search across project
            </p>
          </div>
        )}
      </div>
    </div>
  );
};
