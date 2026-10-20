import React, { useState, useEffect } from 'react';
import { History, RotateCcw, Clock, User as UserIcon } from 'lucide-react';
import { DiffEditor } from '@monaco-editor/react';
import { VersionCheckpoint, ProjectFile, ProjectRole } from '../../lib/types';
import { detectLanguage } from '../../lib/language';
import { api } from '../../lib/api';
import { notify } from '../../lib/notifications';
import { sound } from '../../lib/audio/soundEngine';
import { useTheme } from '../../lib/theme';
import { Modal, ConfirmDialog } from '../ui/Dialog';

interface VersionHistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  projectId: string;
  files: ProjectFile[];
  activeFileId: string | null;
  currentContent: string;
  userRole?: ProjectRole;
  onRestoreContent: (fileId: string, restoredContent: string) => void;
  onRestoreVersion?: (version: VersionCheckpoint) => Promise<void>;
}

function formatRelativeTime(dateInput: string | number | Date): string {
  const time = new Date(dateInput).getTime();
  const diffSec = Math.floor((Date.now() - time) / 1000);
  if (diffSec < 10) return 'just now';
  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin === 1) return '1 min ago';
  if (diffMin < 60) return `${diffMin} mins ago`;
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour === 1) return '1 hr ago';
  if (diffHour < 24) return `${diffHour} hrs ago`;
  const diffDays = Math.floor(diffHour / 24);
  if (diffDays === 1) return 'yesterday';
  return `${diffDays}d ago`;
}

export const VersionHistoryModal: React.FC<VersionHistoryModalProps> = ({
  isOpen,
  onClose,
  projectId,
  files,
  activeFileId,
  currentContent,
  userRole = 'editor',
  onRestoreContent,
  onRestoreVersion,
}) => {
  const { isDark } = useTheme();
  const [versions, setVersions] = useState<VersionCheckpoint[]>([]);
  const [selectedVersion, setSelectedVersion] = useState<VersionCheckpoint | null>(null);
  const [selectedFileId, setSelectedFileId] = useState<string>(activeFileId || '');
  const [loading, setLoading] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [showConfirmRestore, setShowConfirmRestore] = useState(false);

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

  const handleConfirmRestore = async () => {
    if (!selectedVersion) return;
    setRestoring(true);
    try {
      if (onRestoreVersion) {
        await onRestoreVersion(selectedVersion);
      } else {
        await api.restoreVersion(selectedVersion._id);
        if (historicalFile) {
          onRestoreContent(selectedFileId, historicalContent);
        }
        notify.checkpointRestored(selectedVersion.name);
        sound.checkpointSaved();
      }
      setShowConfirmRestore(false);
      onClose();
    } catch (err: any) {
      notify.error('Restore failed', err.message);
    } finally {
      setRestoring(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      maxWidth="max-w-6xl"
      className="h-[85vh] p-0"
      title={
        <div className="flex items-center space-x-2.5">
          <History className="w-5 h-5 text-ash" />
          <h2 className="text-base font-normal text-ink">Version History & Diff Comparison</h2>
        </div>
      }
    >
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
              <div className="text-center p-6 text-mist text-xs font-sans">
                No named checkpoints created yet. Press Ctrl+S in the editor or create a checkpoint.
              </div>
            )}
            {versions.map((v) => {
              const isSelected = selectedVersion?._id === v._id;
              return (
                <button
                  key={v._id}
                  onClick={() => setSelectedVersion(v)}
                  className={`w-full text-left p-3 rounded-lg border transition cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-amber ${
                    isSelected
                      ? 'bg-bone border-amber text-ink shadow-none inset-glow'
                      : 'bg-transparent border-transparent text-driftwood hover:bg-linen/50'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="font-normal text-sm text-ink truncate">{v.name}</span>
                      <span
                        className={`tag-badge shrink-0 ${
                          v.type === 'auto'
                            ? 'bg-linen text-ash border border-stone'
                            : 'bg-amber/15 text-amber border border-amber/30'
                        }`}
                      >
                        {v.type === 'auto' ? 'Auto' : 'Manual'}
                      </span>
                    </div>
                    <span
                      className="text-micro font-mono text-mist flex items-center gap-1 shrink-0 ml-2"
                      title={new Date(v.createdAt).toLocaleString()}
                    >
                      <Clock className="w-3 h-3" />
                      {formatRelativeTime(v.createdAt)}
                    </span>
                  </div>
                  {v.note && <p className="text-xs text-driftwood line-clamp-1 mb-1">{v.note}</p>}
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
              <label htmlFor="compare-file-select" className="text-driftwood font-mono text-xs">
                Comparing:
              </label>
              <select
                id="compare-file-select"
                aria-label="Select file to compare"
                value={selectedFileId}
                onChange={(e) => setSelectedFileId(e.target.value)}
                className="bg-surface text-ink border border-stone rounded-lg px-2.5 py-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber font-mono text-xs cursor-pointer"
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
              {selectedVersion && (
                <button
                  type="button"
                  onClick={() => setShowConfirmRestore(true)}
                  disabled={restoring || userRole === 'viewer'}
                  title={userRole === 'viewer' ? 'Viewers cannot restore checkpoints' : 'Restore this checkpoint to workspace'}
                  className="btn-primary text-xs px-3 py-1.5 flex items-center gap-1.5 disabled:opacity-40 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-amber"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>{restoring ? 'Restoring…' : 'Restore This Version'}</span>
                </button>
              )}
            </div>
          </div>

          {/* Monaco Diff Editor */}
          <div className="flex-1 selectable-text">
            <DiffEditor
              original={historicalContent}
              modified={selectedFileId === activeFileId ? currentContent : (currentFile?.content || '')}
              language={(currentFile?.name && detectLanguage(currentFile.name)) || currentFile?.language || 'plaintext'}
              theme="obsidian-crystalline"
              beforeMount={(monaco) => {
                monaco.editor.defineTheme('obsidian-crystalline', {
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
                });
              }}
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

      {/* Restore Confirmation Dialog (BUG-3 fix: shared ConfirmDialog, no z-60) */}
      <ConfirmDialog
        isOpen={showConfirmRestore && !!selectedVersion}
        title="Restore Checkpoint"
        message={`Are you sure you want to restore checkpoint "${selectedVersion?.name}"? All workspace files will be reverted to this saved version.`}
        confirmText={restoring ? 'Restoring…' : 'Confirm Restore'}
        cancelText="Cancel"
        isDestructive
        onConfirm={handleConfirmRestore}
        onCancel={() => setShowConfirmRestore(false)}
      />
    </Modal>
  );
};
