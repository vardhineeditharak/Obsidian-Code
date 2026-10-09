import React, { useRef, useEffect, useState } from 'react';
import Editor, { OnMount } from '@monaco-editor/react';
import type * as Monaco from 'monaco-editor';
import { X, Columns2, Rows2, ShieldAlert } from 'lucide-react';
import { ProjectFile, ProjectRole, CollaboratorPresence, DiagnosticsItem } from '../../lib/types';
import { docManager } from '../../lib/crdt/docManager';
import { sound } from '../../lib/audio/soundEngine';
import { notify } from '../../lib/notifications';

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
}) => {
  const editorRef = useRef<Monaco.editor.IStandaloneCodeEditor | null>(null);
  const monacoRef = useRef<typeof Monaco | null>(null);
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

  const handleEditorMount: OnMount = async (editor, monaco) => {
    editorRef.current = editor;
    monacoRef.current = monaco;

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

      const color = '#3B82F6';
      docManager.bindMonaco(projectId, file._id, editor, {
        id: user.id,
        name: user.name,
        color,
        avatar: user.avatar,
        role: userRole,
        fileId: file._id,
      });
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
    <div className="flex-1 flex flex-col bg-[#0F172A] overflow-hidden select-none">
      {/* Editor Tabs Header Bar */}
      <div className="h-9 border-b border-white/10 bg-[#0A0F1D]/60 flex items-center justify-between px-2">
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
                className={`flex items-center gap-2 px-3 py-1.5 text-xs rounded-t border-t-2 cursor-pointer transition ${
                  isActive
                    ? 'bg-slate-900 border-blue-500 text-slate-100 font-medium'
                    : 'border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-900/40'
                }`}
              >
                <span>{file.name}</span>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onCloseTab(fileId);
                  }}
                  className="p-0.5 rounded-sm hover:bg-white/10 text-slate-500 hover:text-slate-300 transition"
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
            <span className="flex items-center gap-1 text-[11px] text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20">
              <ShieldAlert className="w-3 h-3" />
              <span>Read-only</span>
            </span>
          )}

          <div className="flex items-center bg-slate-800/80 rounded p-0.5 border border-white/5">
            <button
              onClick={() => setSplitMode(splitMode === 'vertical' ? 'single' : 'vertical')}
              title="Split Editor Right"
              className={`p-1 rounded ${
                splitMode === 'vertical' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Columns2 className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setSplitMode(splitMode === 'horizontal' ? 'single' : 'horizontal')}
              title="Split Editor Down"
              className={`p-1 rounded ${
                splitMode === 'horizontal' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-slate-200'
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
              <Editor
                height="100%"
                language={activeFile.language || 'javascript'}
                theme="vs-dark"
                value={activeFile.content || ''}
                onMount={handleEditorMount}
                options={{
                  readOnly: isViewer,
                  fontSize: 13,
                  fontFamily: 'JetBrains Mono, Fira Code, monospace',
                  lineHeight: 20,
                  minimap: { enabled: true },
                  scrollBeyondLastLine: false,
                  smoothScrolling: true,
                  cursorBlinking: 'smooth',
                  cursorSmoothCaretAnimation: 'on',
                  tabSize: 2,
                  automaticLayout: true,
                  renderLineHighlight: 'all',
                  bracketPairColorization: { enabled: true },
                }}
              />
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
                    ? 'w-1 h-full cursor-col-resize hover:bg-blue-500/70 border-x border-white/5'
                    : 'h-1 w-full cursor-row-resize hover:bg-blue-500/70 border-y border-white/5'
                } bg-slate-900 transition flex-shrink-0 z-20 group relative`}
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
                <Editor
                  height="100%"
                  language={activeFile.language || 'javascript'}
                  theme="vs-dark"
                  value={activeFile.content || ''}
                  options={{
                    readOnly: true,
                    fontSize: 13,
                    fontFamily: 'JetBrains Mono, Fira Code, monospace',
                    minimap: { enabled: false },
                    scrollBeyondLastLine: false,
                    automaticLayout: true,
                  }}
                />
              </div>
            )}
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-slate-500 space-y-2">
            <p className="text-sm">Select or create a file to start editing</p>
            <p className="text-xs text-slate-600">Press Ctrl+Shift+F to search across project</p>
          </div>
        )}
      </div>
    </div>
  );
};
