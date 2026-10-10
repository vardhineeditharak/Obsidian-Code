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
      case 'js':
      case 'jsx':
        return 'text-amber-500 dark:text-yellow-400';
      case 'ts':
      case 'tsx':
        return 'text-blue-500 dark:text-blue-400';
      case 'html':
        return 'text-orange-500 dark:text-orange-400';
      case 'css':
        return 'text-sky-500 dark:text-sky-400';
      case 'py':
        return 'text-emerald-500 dark:text-emerald-400';
      case 'json':
        return 'text-amber-600 dark:text-amber-300';
      case 'md':
        return 'text-indigo-500 dark:text-indigo-400';
      default:
        return 'text-slate-400';
    }
  };

  return (
    <aside
      style={{ width: `${size}px` }}
      className="relative border-r border-black/[0.06] dark:border-white/[0.08] bg-slate-50/70 dark:bg-[#0A0F1D]/75 backdrop-blur-xl flex flex-col select-none h-full flex-shrink-0 transition-colors duration-200"
    >
      {/* Right-Edge Drag Handle */}
      <div
        {...dragHandleProps}
        title="Drag to resize sidebar (double-click to reset)"
        className="absolute -right-1 top-0 w-2 h-full cursor-col-resize hover:bg-blue-500/50 transition z-30 group"
      />

      {/* Explorer Header */}
      <div className="px-3.5 py-2.5 border-b border-black/[0.04] dark:border-white/[0.04] flex items-center justify-between">
        <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
          Explorer
        </span>
        {canEdit && (
          <div className="flex items-center gap-0.5">
            <button
              onClick={() => {
                setIsCreatingFile(true);
                setIsCreatingFolder(false);
              }}
              title="New File"
              className="p-1 rounded-md text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-black/[0.05] dark:hover:bg-white/[0.08] active:scale-95 transition cursor-pointer"
            >
              <FilePlus size={14} />
            </button>
            <button
              onClick={() => {
                setIsCreatingFolder(true);
                setIsCreatingFile(false);
              }}
              title="New Folder"
              className="p-1 rounded-md text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-black/[0.05] dark:hover:bg-white/[0.08] active:scale-95 transition cursor-pointer"
            >
              <FolderPlus size={14} />
            </button>
          </div>
        )}
      </div>

      {/* macOS-style Filter / Search Input */}
      <div className="px-2.5 py-2 border-b border-black/[0.04] dark:border-white/[0.04]">
        <div className="relative flex items-center">
          <Search size={12} className="text-slate-400 absolute left-2.5 pointer-events-none" />
          <input
            type="text"
            placeholder="Filter files..."
            value={filterQuery}
            onChange={(e) => setFilterQuery(e.target.value)}
            className="w-full bg-black/[0.03] dark:bg-white/[0.05] border border-black/[0.05] dark:border-white/[0.06] rounded-lg pl-7 pr-2 py-1 text-xs text-slate-800 dark:text-slate-200 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-blue-500/40"
          />
        </div>
      </div>

      {/* Inline Create Input */}
      {(isCreatingFile || isCreatingFolder) && (
        <div className="p-2 border-b border-black/[0.05] dark:border-white/[0.05] bg-black/[0.02] dark:bg-white/[0.03]">
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
            className="w-full bg-white dark:bg-slate-950 border border-blue-500 rounded-md px-2 py-1 text-xs text-slate-900 dark:text-slate-100 focus:outline-none shadow-xs"
          />
        </div>
      )}

      {/* File Tree List */}
      <div className="flex-1 overflow-y-auto p-1.5 space-y-0.5">
        {filteredFiles.length === 0 && (
          <p className="text-center text-[11px] text-slate-400 dark:text-slate-500 py-8">
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
              className={`group flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs transition cursor-pointer ${
                isSelected
                  ? 'bg-blue-500/10 dark:bg-blue-500/20 text-blue-600 dark:text-blue-400 font-medium'
                  : 'text-slate-700 dark:text-slate-300 hover:bg-black/[0.04] dark:hover:bg-white/[0.05] hover:text-slate-900 dark:hover:text-slate-100'
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
                    <FolderOpen size={14} className="text-amber-500 shrink-0" />
                  ) : (
                    <Folder size={14} className="text-amber-500 shrink-0" />
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
                    className="bg-white dark:bg-slate-800 border border-blue-500 rounded px-1.5 py-0.5 text-xs text-slate-900 dark:text-white focus:outline-none w-28"
                  />
                ) : (
                  <span className="truncate">{file.name}</span>
                )}
              </div>

              {/* Action buttons (Rename, Delete) */}
              {canEdit && (
                <div className="opacity-0 group-hover:opacity-100 flex items-center gap-0.5 shrink-0 transition">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setEditingFileId(file._id);
                      setEditingName(file.name);
                    }}
                    title="Rename"
                    className="p-1 rounded text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-black/[0.06] dark:hover:bg-white/[0.1] transition cursor-pointer"
                  >
                    <Edit size={12} />
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      if (confirm(`Delete ${file.name}?`)) {
                        onDeleteFile(file._id);
                      }
                    }}
                    title="Delete"
                    className="p-1 rounded text-slate-400 hover:text-rose-500 dark:hover:text-rose-400 hover:bg-rose-500/10 transition cursor-pointer"
                  >
                    <Trash size={12} />
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </aside>
  );
};
