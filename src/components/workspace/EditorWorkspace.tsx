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
}) => {
  const editorRef = useRef<Monaco.editor.IStandaloneCodeEditor | null>(null);
  const monacoRef = useRef<typeof Monaco | null>(null);
  const [splitMode, setSplitMode] = useState<'single' | 'vertical' | 'horizontal'>('single');
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
        file.content || ''
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
        className={`flex-1 relative ${
          splitMode === 'vertical'
            ? 'flex flex-row'
            : splitMode === 'horizontal'
            ? 'flex flex-col'
            : ''
        }`}
      >
        {activeFile ? (
          <>
            <div className="flex-1 relative h-full">
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

            {/* Split Pane Mirror */}
            {splitMode !== 'single' && (
              <div className="flex-1 relative h-full border-l border-white/10">
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
