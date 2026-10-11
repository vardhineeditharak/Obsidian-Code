import React, { useState } from 'react';
import { ProjectFile, ProjectRole } from '../../lib/types';
import { useResizable } from '../../lib/useResizable';
import {
  FilePlus,
  FolderPlus,
  Folder,
  FolderOpen,
  FileCode,
  Search,
  Edit,
  Trash,
} from '../ui/AnimatedIcon';
import { ConfirmDialog } from '../ui/Dialog';

interface SidebarProps {
  files: ProjectFile[];
  activeFileId: string | null;
  onSelectFile: (fileId: string) => void;
  onCreateFile: (name: string, isFolder: boolean) => void;
  onRenameFile: (fileId: string, newName: string) => void;
  onDeleteFile: (fileId: string) => void;
  userRole: ProjectRole;
}

export const Sidebar: React.FC<SidebarProps> = ({
  files,
  activeFileId,
  onSelectFile,
  onCreateFile,
  onRenameFile,
  onDeleteFile,
  userRole,
}) => {
  const [fileToDelete, setFileToDelete] = useState<{ id: string; name: string } | null>(null);
  const [filterQuery, setFilterQuery] = useState('');
  const [isCreatingFile, setIsCreatingFile] = useState(false);
  const [isCreatingFolder, setIsCreatingFolder] = useState(false);
  const [newEntityName, setNewEntityName] = useState('');
  const [editingFileId, setEditingFileId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [openFolders, setOpenFolders] = useState<Record<string, boolean>>({});

  const { size, dragHandleProps } = useResizable({
    key: 'sidebar',
    initial: 256,
    min: 180,
    max: 480,
    axis: 'x',
  });

  const canEdit = userRole === 'owner' || userRole === 'editor';

  const toggleFolder = (folderId: string) => {
    setOpenFolders((prev) => ({ ...prev, [folderId]: !prev[folderId] }));
  };

  const handleCreateSubmit = (isFolder: boolean) => {
    if (!newEntityName.trim()) {
      setIsCreatingFile(false);
      setIsCreatingFolder(false);
      return;
    }
    onCreateFile(newEntityName.trim(), isFolder);
    setNewEntityName('');
    setIsCreatingFile(false);
    setIsCreatingFolder(false);
  };

  const handleRenameSubmit = (fileId: string) => {
    if (editingName.trim()) {
      onRenameFile(fileId, editingName.trim());
    }
    setEditingFileId(null);
  };

  const filteredFiles = files.filter((f) =>
    f.name.toLowerCase().includes(filterQuery.toLowerCase())
  );

  const getFileIconColor = (name: string) => {
    const ext = name.split('.').pop()?.toLowerCase();
    switch (ext) {
      case 'ts':
      case 'tsx':
        return 'text-amber'; // Lavender
      case 'js':
      case 'jsx':
        return 'text-yellow-400'; // Warning yellow
      case 'py':
        return 'text-verdant'; // Success green
      case 'json':
        return 'text-amber'; // Lavender
      case 'html':
        return 'text-orange-400';
      case 'css':
        return 'text-sky-400';
      case 'md':
        return 'text-driftwood';
      default:
        return 'text-ash';
    }
  };

  return (
    <aside
      style={{ width: `${size}px` }}
      className="relative border-r border-stone bg-bone flex flex-col select-none h-full shrink-0 transition-colors duration-150"
    >
      {/* Right-Edge Drag Handle */}
      <div
        {...dragHandleProps}
        title="Drag to resize sidebar (double-click to reset)"
        className="absolute -right-1 top-0 w-2 h-full cursor-col-resize hover:bg-stone transition z-30 group"
      />

      {/* Explorer Header */}
      <div className="px-3.5 py-2.5 border-b border-(--border-subtle) flex items-center justify-between">
        <span className="font-mono text-xs font-normal text-ash uppercase tracking-wider">
          Explorer
        </span>
        {canEdit && (
          <div className="flex items-center gap-0.5">
            <button
              type="button"
              onClick={() => {
                setIsCreatingFile(true);
                setIsCreatingFolder(false);
              }}
              title="New File"
              aria-label="New File"
              className="p-1 rounded-md text-ash hover:text-ink hover:bg-linen focus:outline-none focus-visible:ring-2 focus-visible:ring-ink dark:focus-visible:ring-parchment transition cursor-pointer"
            >
              <FilePlus size={14} />
            </button>
            <button
              type="button"
              onClick={() => {
                setIsCreatingFolder(true);
                setIsCreatingFile(false);
              }}
              title="New Folder"
              aria-label="New Folder"
              className="p-1 rounded-md text-ash hover:text-ink hover:bg-linen focus:outline-none focus-visible:ring-2 focus-visible:ring-ink dark:focus-visible:ring-parchment transition cursor-pointer"
            >
              <FolderPlus size={14} />
            </button>
          </div>
        )}
      </div>

      {/* Filter / Search Input */}
      <div className="px-2.5 py-2 border-b border-(--border-subtle)">
        <div className="relative flex items-center">
          <Search size={12} className="text-ash absolute left-2.5 pointer-events-none" />
          <input
            type="text"
            placeholder="Filter files..."
            aria-label="Filter files"
            value={filterQuery}
            onChange={(e) => setFilterQuery(e.target.value)}
            className="w-full bg-parchment border border-stone rounded-md pl-7 pr-2 py-1 text-xs text-ink placeholder-mist focus:outline-none focus:border-amber focus-visible:ring-1 focus-visible:ring-amber font-mono"
          />
        </div>
      </div>

      {/* Inline Create Input */}
      {(isCreatingFile || isCreatingFolder) && (
        <div className="p-2 border-b border-stone bg-linen">
          <input
            type="text"
            placeholder={isCreatingFolder ? 'folder-name' : 'filename.js'}
            value={newEntityName}
            onChange={(e) => setNewEntityName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleCreateSubmit(isCreatingFolder);
              if (e.key === 'Escape') {
                setIsCreatingFile(false);
                setIsCreatingFolder(false);
              }
            }}
            onBlur={() => handleCreateSubmit(isCreatingFolder)}
            autoFocus
            aria-label={isCreatingFolder ? "Folder name" : "File name"}
            className="w-full bg-parchment border border-stone rounded-md px-2 py-1 text-xs font-mono text-ink focus-visible:outline-none focus-visible:border-amber focus-visible:ring-1 focus-visible:ring-amber"
          />
        </div>
      )}

      {/* File Tree List */}
      <div className="flex-1 overflow-y-auto p-1.5 space-y-0.5">
        {filteredFiles.length === 0 && (
          <p className="text-center font-mono text-micro text-ash py-8">
            {filterQuery ? 'No matching files' : 'No files in workspace'}
          </p>
        )}

        {filteredFiles.map((file) => {
          const isSelected = activeFileId === file._id;
          const isFolder = file.isFolder;
          const isOpen = openFolders[file._id];

          return (
            <div
              key={file._id}
              className={`group flex items-center justify-between px-2.5 py-1.5 rounded-sm text-[13px] font-normal transition cursor-pointer ${
                isSelected
                  ? 'bg-linen text-ink border-l-2 border-amber'
                  : 'text-ink hover:bg-linen'
              }`}
            >
              <div
                className="flex items-center gap-2 flex-1 truncate"
                onClick={() => {
                  if (isFolder) toggleFolder(file._id);
                  else onSelectFile(file._id);
                }}
              >
                {isFolder ? (
                  isOpen ? (
                    <FolderOpen size={14} className="text-ash shrink-0" />
                  ) : (
                    <Folder size={14} className="text-ash shrink-0" />
                  )
                ) : (
                  <FileCode size={14} className={`shrink-0 ${getFileIconColor(file.name)}`} />
                )}

                {editingFileId === file._id ? (
                  <input
                    type="text"
                    value={editingName}
                    onChange={(e) => setEditingName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleRenameSubmit(file._id);
                      if (e.key === 'Escape') setEditingFileId(null);
                    }}
                    onBlur={() => handleRenameSubmit(file._id)}
                    autoFocus
                    aria-label="Rename file"
                    className="bg-parchment border border-stone rounded-md px-1.5 py-0.5 text-xs font-mono text-ink focus-visible:outline-none focus-visible:border-amber focus-visible:ring-1 focus-visible:ring-amber w-28"
                  />
                ) : (
                  <span className="truncate">{file.name}</span>
                )}
              </div>

              {/* Action buttons (Rename, Delete) */}
              {canEdit && (
                <div className="opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 focus-within:opacity-100 flex items-center gap-0.5 shrink-0 transition">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setEditingFileId(file._id);
                      setEditingName(file.name);
                    }}
                    title={`Rename ${file.name}`}
                    aria-label={`Rename ${file.name}`}
                    className="p-1 rounded-md text-ash hover:text-ink hover:bg-bone focus:outline-none focus-visible:ring-1 focus-visible:ring-amber transition cursor-pointer"
                  >
                    <Edit size={12} />
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setFileToDelete({ id: file._id, name: file.name });
                    }}
                    title={`Delete ${file.name}`}
                    aria-label={`Delete ${file.name}`}
                    className="p-1 rounded-md text-ash hover:text-crimson hover:bg-bone focus:outline-none focus-visible:ring-1 focus-visible:ring-crimson transition cursor-pointer"
                  >
                    <Trash size={12} />
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <ConfirmDialog
        isOpen={!!fileToDelete}
        title={`Delete ${fileToDelete?.name}?`}
        message="Are you sure you want to delete this file? This action cannot be undone."
        confirmText="Delete"
        isDestructive
        onConfirm={() => {
          if (fileToDelete) {
            onDeleteFile(fileToDelete.id);
          }
        }}
        onCancel={() => setFileToDelete(null)}
      />
    </aside>
  );
};
