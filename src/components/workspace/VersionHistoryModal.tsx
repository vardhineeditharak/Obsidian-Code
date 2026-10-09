import React, { useState, useEffect } from 'react';
import { X, History, RotateCcw, Clock, User as UserIcon, FileCode, Check } from 'lucide-react';
import { DiffEditor } from '@monaco-editor/react';
import { VersionCheckpoint, ProjectFile } from '../../lib/types';
import { api } from '../../lib/api';
import { notify } from '../../lib/notifications';
import { sound } from '../../lib/audio/soundEngine';

interface VersionHistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  projectId: string;
  files: ProjectFile[];
  activeFileId: string | null;
  currentContent: string;
  onRestoreContent: (fileId: string, restoredContent: string) => void;
}

export const VersionHistoryModal: React.FC<VersionHistoryModalProps> = ({
  isOpen,
  onClose,
  projectId,
  files,
  activeFileId,
  currentContent,
  onRestoreContent,
}) => {
  const [versions, setVersions] = useState<VersionCheckpoint[]>([]);
  const [selectedVersion, setSelectedVersion] = useState<VersionCheckpoint | null>(null);
  const [selectedFileId, setSelectedFileId] = useState<string>(activeFileId || '');
  const [loading, setLoading] = useState(false);
  const [restoring, setRestoring] = useState(false);

  useEffect(() => {
    if (isOpen) {
      loadVersions();
      if (activeFileId) setSelectedFileId(activeFileId);
    }
  }, [isOpen, projectId, activeFileId]);

  const loadVersions = async () => {
    setLoading(true);
    try {
      const data = await api.getVersions(projectId);
      setVersions(data);
      if (data.length > 0) {
        setSelectedVersion(data[0]);
      }
    } catch (err: any) {
      notify.error('Failed to load version history', err.message);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  const currentFile = files.find((f) => f._id === selectedFileId);
  const historicalFile = selectedVersion?.files.find((f) => f.fileId === selectedFileId);
  const historicalContent = historicalFile ? historicalFile.content : '';

  const handleRestore = async () => {
    if (!selectedVersion || !historicalFile) return;
    setRestoring(true);
    try {
      await api.restoreVersion(selectedVersion._id);
      onRestoreContent(selectedFileId, historicalContent);
      notify.checkpointRestored(selectedVersion.name);
      sound.checkpointSaved();
      onClose();
    } catch (err: any) {
      notify.error('Restore failed', err.message);
    } finally {
      setRestoring(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-md p-6">
      <div className="glass-modal w-full max-w-6xl h-[85vh] rounded-xl overflow-hidden border border-white/10 shadow-2xl flex flex-col">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-3.5 border-b border-white/10 bg-slate-900/80">
          <div className="flex items-center space-x-2.5">
            <History className="w-5 h-5 text-indigo-400" />
            <h2 className="text-base font-semibold text-slate-100">Version History & Diff Comparison</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-md text-slate-400 hover:text-slate-200 hover:bg-white/5 transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Workspace Grid */}
        <div className="flex-1 flex overflow-hidden">
          {/* Left Checkpoint List Drawer */}
          <div className="w-80 border-r border-white/10 bg-slate-950/60 flex flex-col">
            <div className="p-3 border-b border-white/5">
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                Checkpoints ({versions.length})
              </span>
            </div>

            <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
              {loading && <p className="text-xs text-slate-500 p-4">Loading checkpoints...</p>}
              {!loading && versions.length === 0 && (
                <div className="text-center p-6 text-slate-500 text-xs">
                  No named checkpoints created yet. Press Ctrl+S in the editor or create a checkpoint.
                </div>
              )}
              {versions.map((v) => {
                const isSelected = selectedVersion?._id === v._id;
                return (
                  <button
                    key={v._id}
                    onClick={() => setSelectedVersion(v)}
                    className={`w-full text-left p-3 rounded-lg border transition ${
                      isSelected
                        ? 'bg-blue-600/15 border-blue-500/40 text-blue-200'
                        : 'bg-slate-900/40 border-white/5 text-slate-300 hover:bg-slate-800/60'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-medium text-sm text-slate-100">{v.name}</span>
                      <span className="text-[11px] text-slate-500 flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {new Date(v.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                    {v.note && <p className="text-xs text-slate-400 line-clamp-1 mb-1">{v.note}</p>}
                    <div className="flex items-center gap-1 text-[11px] text-slate-500">
                      <UserIcon className="w-3 h-3" />
                      <span>{v.createdBy.name}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Right Diff Comparison Area */}
          <div className="flex-1 flex flex-col bg-slate-900/40">
            {/* Diff Controls Header */}
            <div className="flex items-center justify-between px-4 py-2 border-b border-white/10 bg-slate-900/60 text-xs">
              <div className="flex items-center gap-2">
                <span className="text-slate-400">Comparing file:</span>
                <select
                  value={selectedFileId}
                  onChange={(e) => setSelectedFileId(e.target.value)}
                  className="bg-slate-800 text-slate-200 border border-white/10 rounded px-2.5 py-1 focus:outline-none"
                >
                  {files
                    .filter((f) => !f.isFolder)
                    .map((f) => (
                      <option key={f._id} value={f._id}>
                        {f.name}
                      </option>
                    ))}
                </select>
              </div>

              <div className="flex items-center gap-4">
                <span className="text-slate-400 text-[11px]">
                  Original (Checkpoint) ⟷ Modified (Current Workspace)
                </span>
                {selectedVersion && historicalFile && (
                  <button
                    onClick={handleRestore}
                    disabled={restoring}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-md font-medium transition shadow-sm"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    {restoring ? 'Restoring...' : 'Restore This Version'}
                  </button>
                )}
              </div>
            </div>

            {/* Monaco Diff Editor */}
            <div className="flex-1">
              <DiffEditor
                original={historicalContent}
                modified={selectedFileId === activeFileId ? currentContent : (currentFile?.content || '')}
                language={currentFile?.language || 'javascript'}
                theme="vs-dark"
                options={{
                  readOnly: true,
                  renderSideBySide: true,
                  minimap: { enabled: false },
                  fontSize: 13,
                  lineNumbers: 'on',
                  scrollBeyondLastLine: false,
                }}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
