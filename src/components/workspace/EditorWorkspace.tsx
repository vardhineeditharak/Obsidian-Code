/**
 * Root Cause Diagnosis & Fix (Monaco Caret End-Of-Line Misalignment):
 * Confirmed Hypothesis: H1 (Cached font metric drift from async webfont loading)
 * Evidence:
 * - document.fonts.check('13px "JetBrains Mono"') evaluates to false if Monaco measures
 *   character widths before webfonts finish loading, causing Monaco to cache fallback font
 *   metrics (e.g. Consolas ~0.55em vs JetBrains Mono 0.60em at 13px ≈ 0.65px/char drift,
 *   accumulating to ~1 character offset by end-of-line).
 * - Calling monaco.editor.remeasureFonts() immediately snaps the painted caret to the true logical column.
 * - @monaco-editor/react was fetching Monaco from jsdelivr CDN without local loader configuration (H2).
 * Fix applied:
 * 1. ensureFontsReady() gates editor mounting on document.fonts.ready with a 3s offline timeout fallback.
 * 2. Self-hosted Inter and JetBrains Mono woff2 fonts in /fonts with preload in index.html and @font-face rules.
 * 3. Configured @monaco-editor/react loader to use local pinned monaco-editor 0.57 + web worker.
 * 4. Wired document.fonts 'loadingdone' listener and post-mount remeasureFonts() calls.
 * 5. Unified editorOptions across primary and mirror split panes with fontLigatures: false.
 */

import React, { useRef, useEffect, useState } from 'react';
import Editor, { OnMount } from '@monaco-editor/react';
import type * as Monaco from 'monaco-editor';
import { X, Columns2, Rows2, ShieldAlert } from 'lucide-react';
import { ProjectFile, ProjectRole, CollaboratorPresence, DiagnosticsItem } from '../../lib/types';
import { docManager } from '../../lib/crdt/docManager';
import { sound } from '../../lib/audio/soundEngine';
import { notify } from '../../lib/notifications';
import { ensureFontsReady } from '../../lib/fonts';
import { useTheme } from '../../lib/theme';
import '../../lib/monacoSetup';

import { editorOptions, baseEditorOptions, mirrorEditorOptions } from './editorOptions';
export { editorOptions, baseEditorOptions, mirrorEditorOptions };

interface EditorWorkspaceProps {
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
}) => {
  const { isDark } = useTheme();
  const editorRef = useRef<Monaco.editor.IStandaloneCodeEditor | null>(null);
  const monacoRef = useRef<typeof Monaco | null>(null);
  const [fontsReady, setFontsReady] = useState(false);
  const revealPendingRef = useRef<{ fileId: string; line: number; column: number; endColumn?: number; nonce: number } | null>(null);

  // Remount-safe font measurement: gate editor on font readiness + remeasure on font load events (Task 1.1)
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
      if (typeof document !== 'undefined' && document.fonts) {
        document.fonts.removeEventListener('loadingdone', handleLoadingDone);
      }
    };
  }, []);
  const [splitMode, setSplitMode] = useState<'single' | 'vertical' | 'horizontal'>('single');
  const [splitRatio, setSplitRatio] = useState<number>(() => {
    if (typeof window === 'undefined') return 50;
    try {
      const stored = localStorage.getItem('obsidian.layout.splitRatio');
      if (stored !== null) {
        const parsed = Number(stored);
        if (!isNaN(parsed) && parsed >= 20 && parsed <= 80) return parsed;
      }
    } catch {}
    return 50;
  });

  const isDraggingSplitRef = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const rAFSplitRef = useRef<number | null>(null);

  const handleSplitPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    isDraggingSplitRef.current = true;
    document.body.style.userSelect = 'none';
  };

  const handleSplitPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDraggingSplitRef.current || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    let newRatio = splitRatio;
    if (splitMode === 'vertical') {
      const x = e.clientX - rect.left;
      newRatio = (x / rect.width) * 100;
    } else if (splitMode === 'horizontal') {
      const y = e.clientY - rect.top;
      newRatio = (y / rect.height) * 100;
    }
    const clamped = Math.max(20, Math.min(80, Math.round(newRatio)));

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
    try {
      localStorage.setItem('obsidian.layout.splitRatio', String(splitRatio));
    } catch {}
  };

  const handleSplitDoubleClick = () => {
    setSplitRatio(50);
    try {
      localStorage.setItem('obsidian.layout.splitRatio', '50');
    } catch {}
  };

  const [isViewer, setIsViewer] = useState(userRole === 'viewer');

  useEffect(() => {
    setIsViewer(userRole === 'viewer');
  }, [userRole]);

  const activeFile = files.find((f) => f._id === activeFileId);

  // Set up Monaco markers when diagnostics change
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
  }, [diagnostics, activeFile]);

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

  // Reveal Target jumping & selection (Search result + Problems navigation)
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

  // Model content replacement (Restore checkpoint)
  useEffect(() => {
    if (
      replaceModelContent &&
      replaceModelContent.fileId === activeFileId &&
      editorRef.current
    ) {
      const model = editorRef.current.getModel();
      if (model && model.getValue() !== replaceModelContent.content) {
        editorRef.current.executeEdits('replace-model-content', [
          {
            range: model.getFullModelRange(),
            text: replaceModelContent.content,
          },
        ]);
      }
    }
  }, [replaceModelContent, activeFileId]);

  const handleEditorMount: OnMount = async (editor, monaco) => {
    editorRef.current = editor;
    monacoRef.current = monaco;

    // Expose Monaco instance for developer console runtime inspection (Diagnostics 0.1/0.2)
    if (typeof window !== 'undefined') {
      (window as unknown as { __monaco: typeof Monaco }).__monaco = monaco;
    }

    // Remeasure fonts immediately upon mount to ensure caret geometry matches loaded webfont metrics (Task 1.1)
    try {
      monaco.editor.remeasureFonts();
    } catch {}

    // Track cursor changes
    editor.onDidChangeCursorPosition((e) => {
      onCursorChange(e.position.lineNumber, e.position.column);
      if (activeFileId) {
        docManager.updateCursorAwareness(
          projectId,
          activeFileId,
          { line: e.position.lineNumber, column: e.position.column }
        );
      }
    });

    // Track content changes
    editor.onDidChangeModelContent(() => {
      const val = editor.getValue();
      onContentChange(val);
    });

    // Keyboard shortcut: Ctrl+S / Cmd+S for named checkpoint
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
      onCreateCheckpoint();
    });

    // Bind Yjs CRDT doc session
    if (activeFile) {
      bindActiveFile(editor, activeFile);
    }
  };

  const bindActiveFile = async (editor: Monaco.editor.IStandaloneCodeEditor, file: ProjectFile) => {
    try {
      const session = await docManager.getOrCreateSession(
        projectId,
        file._id,
        file.content || '',
        undefined,
        isPublic
      );

      // Adopt canonical CRDT text if newer than files[].content (Task T4)
      const liveText = session.ytext.toString();
      if (liveText && liveText !== file.content) {
        onAdoptFileContent?.(file._id, liveText);
      }

      const color = '#3B82F6';
      docManager.bindMonaco(projectId, file._id, editor, {
        id: user.id,
        name: user.name,
        color,
        avatar: user.avatar,
        role: userRole,
        fileId: file._id,
      });

      // If a reveal target is pending for this file, execute it after binding
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
  };

  useEffect(() => {
    if (editorRef.current && activeFile) {
      bindActiveFile(editorRef.current, activeFile);
    }
  }, [activeFileId]);

  return (
    <div className="flex-1 flex flex-col bg-slate-100/50 dark:bg-[#0F172A] overflow-hidden select-none transition-colors duration-200">
      {/* Editor Tabs Header Bar */}
      <div className="h-9 border-b border-black/[0.06] dark:border-white/[0.08] bg-slate-100/80 dark:bg-[#0A0F1D]/60 backdrop-blur-md flex items-center justify-between px-2">
        {/* Open Tabs */}
        <div className="flex items-center gap-1 overflow-x-auto max-w-[80vw]">
          {openFileIds.map((fileId) => {
            const file = files.find((f) => f._id === fileId);
            if (!file) return null;
            const isActive = activeFileId === fileId;

            return (
              <div
                key={fileId}
                onClick={() => onSelectFile(fileId)}
                className={`flex items-center gap-2 px-3 py-1.5 text-xs rounded-t-md border-t-2 cursor-pointer transition ${
                  isActive
                    ? 'bg-white dark:bg-slate-900 border-blue-500 text-slate-900 dark:text-slate-100 font-medium shadow-2xs'
                    : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-black/[0.03] dark:hover:bg-white/[0.04]'
                }`}
              >
                <span>{file.name}</span>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onCloseTab(fileId);
                  }}
                  className="p-0.5 rounded-sm hover:bg-black/[0.08] dark:hover:bg-white/10 text-slate-400 hover:text-slate-700 dark:hover:text-slate-300 transition"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            );
          })}
        </div>

        {/* Split Controls & Viewer Warning */}
        <div className="flex items-center gap-2">
          {isViewer && (
            <span className="flex items-center gap-1 text-[11px] text-amber-500 dark:text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-full border border-amber-500/20">
              <ShieldAlert className="w-3 h-3" />
              <span>Read-only</span>
            </span>
          )}

          <div className="flex items-center bg-black/[0.04] dark:bg-slate-800/80 rounded-md p-0.5 border border-black/[0.05] dark:border-white/[0.05]">
            <button
              onClick={() => setSplitMode(splitMode === 'vertical' ? 'single' : 'vertical')}
              title="Split Editor Right"
              className={`p-1 rounded ${
                splitMode === 'vertical' ? 'bg-blue-600 text-white shadow-xs' : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              <Columns2 className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setSplitMode(splitMode === 'horizontal' ? 'single' : 'horizontal')}
              title="Split Editor Down"
              className={`p-1 rounded ${
                splitMode === 'horizontal' ? 'bg-blue-600 text-white shadow-xs' : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              <Rows2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Main Monaco Container */}
      <div
        ref={containerRef}
        className={`flex-1 relative overflow-hidden ${
          splitMode === 'vertical'
            ? 'flex flex-row'
            : splitMode === 'horizontal'
            ? 'flex flex-col'
            : ''
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
              className={`${splitMode === 'single' ? 'flex-1' : ''} relative h-full overflow-hidden`}
            >
              {!fontsReady ? (
                <div className="w-full h-full bg-slate-100 dark:bg-[#0F172A] flex items-center justify-center text-slate-500">
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-4 border-2 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" />
                    <span className="text-xs text-slate-400">Loading editor fonts...</span>
                  </div>
                </div>
              ) : (
                <Editor
                  height="100%"
                  language={activeFile.language || 'javascript'}
                  theme={isDark ? 'vs-dark' : 'vs'}
                  value={activeFile.content || ''}
                  onMount={handleEditorMount}
                  options={{
                    ...baseEditorOptions,
                    readOnly: isViewer,
                    minimap: { enabled: true },
                  }}
                />
              )}
            </div>

            {/* Draggable Divider Between Split Panes */}
            {splitMode !== 'single' && (
              <div
                onPointerDown={handleSplitPointerDown}
                onPointerMove={handleSplitPointerMove}
                onPointerUp={handleSplitPointerUp}
                onPointerCancel={handleSplitPointerUp}
                onDoubleClick={handleSplitDoubleClick}
                title="Drag to adjust split ratio (double-click to reset 50/50)"
                className={`${
                  splitMode === 'vertical'
                    ? 'w-1 h-full cursor-col-resize hover:bg-blue-500/70 border-x border-black/[0.06] dark:border-white/[0.08]'
                    : 'h-1 w-full cursor-row-resize hover:bg-blue-500/70 border-y border-black/[0.06] dark:border-white/[0.08]'
                } bg-slate-200 dark:bg-slate-900 transition flex-shrink-0 z-20 group relative`}
              />
            )}

            {/* Split Pane Mirror */}
            {splitMode !== 'single' && (
              <div
                style={
                  splitMode === 'vertical'
                    ? { flexBasis: `${100 - splitRatio}%`, width: `${100 - splitRatio}%` }
                    : { flexBasis: `${100 - splitRatio}%`, height: `${100 - splitRatio}%` }
                }
                className="relative h-full overflow-hidden"
              >
                {!fontsReady ? (
                  <div className="w-full h-full bg-slate-100 dark:bg-[#0F172A] flex items-center justify-center text-slate-500">
                    <span className="text-xs text-slate-400">Loading editor...</span>
                  </div>
                ) : (
                  <Editor
                    height="100%"
                    language={activeFile.language || 'javascript'}
                    theme={isDark ? 'vs-dark' : 'vs'}
                    value={activeFile.content || ''}
                    options={mirrorEditorOptions}
                  />
                )}
              </div>
            )}
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-slate-400 dark:text-slate-500 space-y-2">
            <p className="text-sm text-slate-700 dark:text-slate-300 font-medium">Select or create a file to start editing</p>
            <p className="text-xs text-slate-400 dark:text-slate-600">Press Ctrl+Shift+F to search across project</p>
          </div>
        )}
      </div>
    </div>
  );
};
