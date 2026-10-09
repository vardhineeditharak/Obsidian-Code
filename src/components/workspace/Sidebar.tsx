import React, { useState } from 'react';
import {
  FilePlus,
  FolderPlus,
  ChevronRight,
  ChevronDown,
  Trash2,
  Edit2,
  FileCode,
  Folder,
  FolderOpen,
  Search,
  Code2,
  MoreVertical,
} from 'lucide-react';
import { ProjectFile, ProjectRole } from '../../lib/types';
import { notify } from '../../lib/notifications';

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
        return 'text-yellow-400';
      case 'ts':
      case 'tsx':
        return 'text-blue-400';
      case 'html':
        return 'text-orange-400';
      case 'css':
        return 'text-sky-400';
      case 'py':
        return 'text-emerald-400';
      case 'json':
        return 'text-amber-300';
      case 'md':
        return 'text-indigo-400';
      default:
        return 'text-slate-400';
    }
  };

  return (
    <aside className="w-64 border-r border-white/10 bg-[#0A0F1D]/80 flex flex-col select-none h-full">
      {/* Explorer Header */}
      <div className="p-3 border-b border-white/5 flex items-center justify-between">
        <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
          Explorer
        </span>
        {canEdit && (
          <div className="flex items-center gap-1">
            <button
              onClick={() => {
                setIsCreatingFile(true);
                setIsCreatingFolder(false);
              }}
              title="New File"
              className="p-1 rounded text-slate-400 hover:text-slate-200 hover:bg-white/5 transition"
            >
              <FilePlus className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => {
                setIsCreatingFolder(true);
                setIsCreatingFile(false);
              }}
              title="New Folder"
              className="p-1 rounded text-slate-400 hover:text-slate-200 hover:bg-white/5 transition"
            >
              <FolderPlus className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>

      {/* Filter / Search input */}
      <div className="px-2.5 py-1.5 border-b border-white/5">
        <div className="relative">
          <Search className="w-3 h-3 text-slate-500 absolute left-2 top-2" />
          <input
            type="text"
            placeholder="Filter files..."
            value={filterQuery}
            onChange={(e) => setFilterQuery(e.target.value)}
            className="w-full bg-slate-900/60 border border-white/5 rounded pl-6 pr-2 py-1 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-blue-500/50"
          />
        </div>
      </div>

      {/* Inline Create Input */}
      {(isCreatingFile || isCreatingFolder) && (
        <div className="p-2 border-b border-white/5 bg-slate-900/40">
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
            className="w-full bg-slate-950 border border-blue-500 rounded px-2 py-1 text-xs text-slate-100 focus:outline-none"
          />
        </div>
      )}

      {/* File Tree List */}
      <div className="flex-1 overflow-y-auto p-1.5 space-y-0.5">
        {filteredFiles.length === 0 && (
          <p className="text-center text-[11px] text-slate-500 py-6">
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
              className={`group flex items-center justify-between px-2 py-1 rounded text-xs transition ${
                isSelected
                  ? 'bg-blue-600/20 text-blue-200 font-medium'
                  : 'text-slate-300 hover:bg-white/5 hover:text-slate-100'
              }`}
            >
              <div
                className="flex items-center gap-1.5 flex-1 cursor-pointer truncate"
                onClick={() => {
                  if (isFolder) toggleFolder(file._id);
                  else onSelectFile(file._id);
                }}
              >
                {isFolder ? (
                  isOpen ? (
                    <FolderOpen className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                  ) : (
                    <Folder className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                  )
                ) : (
                  <FileCode className={`w-3.5 h-3.5 shrink-0 ${getFileIconColor(file.name)}`} />
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
                    className="bg-slate-800 border border-blue-500 rounded px-1 text-xs text-white focus:outline-none w-28"
                  />
                ) : (
                  <span className="truncate">{file.name}</span>
                )}
              </div>

              {/* Action buttons (Rename, Delete) */}
              {canEdit && (
                <div className="opacity-0 group-hover:opacity-100 flex items-center gap-1 shrink-0 transition">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setEditingFileId(file._id);
                      setEditingName(file.name);
                    }}
                    title="Rename"
                    className="p-0.5 rounded text-slate-400 hover:text-slate-200 hover:bg-white/10"
                  >
                    <Edit2 className="w-3 h-3" />
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      if (confirm(`Delete ${file.name}?`)) {
                        onDeleteFile(file._id);
                      }
                    }}
                    title="Delete"
                    className="p-0.5 rounded text-slate-400 hover:text-rose-400 hover:bg-white/10"
                  >
                    <Trash2 className="w-3 h-3" />
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
