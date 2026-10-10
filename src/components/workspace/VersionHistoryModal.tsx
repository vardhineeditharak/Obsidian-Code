import React, { useState, useEffect } from 'react';
import { X, History, RotateCcw, Clock, User as UserIcon, FileCode, Check } from 'lucide-react';
import { DiffEditor } from '@monaco-editor/react';
import { VersionCheckpoint, ProjectFile } from '../../lib/types';
import { api } from '../../lib/api';
import { notify } from '../../lib/notifications';
import { sound } from '../../lib/audio/soundEngine';
import { useTheme } from '../../lib/theme';

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
  const { isDark } = useTheme();
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

  // ESC keydown listener (D2)
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(38,37,30,0.35)] dark:bg-[rgba(10,10,8,0.65)] p-6">
      <div className="w-full max-w-6xl h-[85vh] rounded-lg overflow-hidden border border-stone bg-bone shadow-2xl flex flex-col">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-3.5 border-b border-stone bg-bone">
          <div className="flex items-center space-x-2.5">
            <History className="w-5 h-5 text-ash" />
            <h2 className="text-base font-normal text-ink">Version History & Diff Comparison</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-md text-ash hover:text-ink hover:bg-linen transition cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Workspace Grid */}
        <div className="flex-1 flex overflow-hidden">
          {/* Left Checkpoint List Drawer */}
          <div className="w-80 border-r border-stone bg-parchment flex flex-col">
            <div className="p-3 border-b border-stone">
              <span className="text-xs font-mono text-ash uppercase tracking-wider">
                Checkpoints ({versions.length})
              </span>
            </div>

            <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
              {loading && <p className="text-xs font-mono text-mist p-4">Loading checkpoints...</p>}
              {!loading && versions.length === 0 && (
                <div className="text-center p-6 text-mist text-xs font-editorial">
                  No named checkpoints created yet. Press Ctrl+S in the editor or create a checkpoint.
                </div>
              )}
              {versions.map((v) => {
                const isSelected = selectedVersion?._id === v._id;
                return (
                  <button
                    key={v._id}
                    onClick={() => setSelectedVersion(v)}
                    className={`w-full text-left p-3 rounded-md border transition cursor-pointer ${
                      isSelected
                        ? 'bg-bone border-ink text-ink shadow-none'
                        : 'bg-transparent border-transparent text-driftwood hover:bg-linen/50'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-normal text-sm text-ink">{v.name}</span>
                      <span className="text-[11px] font-mono text-mist flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {new Date(v.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                    {v.note && <p className="text-xs font-editorial text-driftwood line-clamp-1 mb-1">{v.note}</p>}
                    <div className="flex items-center gap-1 text-[11px] font-mono text-ash">
                      <UserIcon className="w-3 h-3" />
                      <span>{v.createdBy.name}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Right Diff Comparison Area */}
          <div className="flex-1 flex flex-col bg-parchment">
            {/* Diff Controls Header */}
            <div className="flex items-center justify-between px-4 py-2 border-b border-stone bg-bone text-xs">
              <div className="flex items-center gap-2">
                <span className="text-driftwood font-mono text-xs">Comparing:</span>
                <select
                  value={selectedFileId}
                  onChange={(e) => setSelectedFileId(e.target.value)}
                  className="bg-parchment text-ink border border-stone rounded-md px-2.5 py-1 focus:outline-none font-mono text-xs cursor-pointer"
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
                <span className="text-mist font-mono text-[11px]">
                  Original (Checkpoint) ⟷ Modified (Current)
                </span>
                {selectedVersion && historicalFile && (
                  <button
                    onClick={handleRestore}
                    disabled={restoring}
                    className="btn-forest text-xs px-3 py-1.5 flex items-center gap-1.5"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>{restoring ? 'Restoring...' : 'Restore This Version'}</span>
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
                theme={isDark ? 'cursor-parchment-dark' : 'cursor-parchment-light'}
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
