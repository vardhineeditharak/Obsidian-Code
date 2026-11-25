import React, { useState, useRef, useMemo, useEffect } from 'react';
import { X, ChevronRight, ChevronDown } from 'lucide-react';
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

export interface SidebarProps {
  files: ProjectFile[];
  activeFileId: string | null;
  onSelectFile: (fileId: string) => void;
  onCreateFile: (name: string, isFolder: boolean, parentId?: string | null) => void;
  onRenameFile: (fileId: string, newName: string) => void;
  onDeleteFile: (fileId: string) => void;
  userRole: ProjectRole;
}

function sortFileEntries(list: ProjectFile[]): ProjectFile[] {
  return [...list].sort((a, b) => {
    if (a.isFolder !== b.isFolder) return a.isFolder ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
}

function getFileIconColor(name: string): string {
  const ext = name.split('.').pop()?.toLowerCase();
  switch (ext) {
    case 'ts':
    case 'tsx':
      return 'text-amber';
    case 'js':
    case 'jsx':
      return 'text-yellow-400';
    case 'py':
      return 'text-verdant';
    case 'json':
      return 'text-amber';
    case 'html':
      return 'text-orange-400';
    case 'css':
      return 'text-sky-400';
    case 'md':
      return 'text-driftwood';
    default:
      return 'text-ash';
  }
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
  const [fileToDelete, setFileToDelete] = useState<{ id: string; name: string; isFolder?: boolean } | null>(null);
  const [filterQuery, setFilterQuery] = useState('');
  const [isCreatingFile, setIsCreatingFile] = useState(false);
  const [isCreatingFolder, setIsCreatingFolder] = useState(false);
  const [createParentId, setCreateParentId] = useState<string | null>(null);
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [newEntityName, setNewEntityName] = useState('');
  const [editingFileId, setEditingFileId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [openFolders, setOpenFolders] = useState<Record<string, boolean>>({});
  const cancelCreateRef = useRef(false);
  const cancelRenameRef = useRef(false);

  const { size, dragHandleProps } = useResizable({
    key: 'sidebar',
    initial: 256,
    min: 180,
    max: 480,
    axis: 'x',
  });

  const canEdit = userRole === 'owner' || userRole === 'editor';

  // Auto-expand ancestor folders when the active file changes (e.g. via Quick Open, Search, or Problems)
  useEffect(() => {
    if (!activeFileId) return;
    const byId = new Map(files.map((f) => [f._id, f]));
    const ancestors: string[] = [];
    const seen = new Set<string>();
    let current = byId.get(activeFileId);
    while (current?.parentId && !seen.has(current.parentId)) {
      seen.add(current.parentId);
      if (byId.has(current.parentId)) {
        ancestors.push(current.parentId);
      }
      current = byId.get(current.parentId);
    }
    if (ancestors.length > 0) {
      setOpenFolders((prev) => {
        let changed = false;
        const next = { ...prev };
        for (const id of ancestors) {
          if (!next[id]) {
            next[id] = true;
            changed = true;
          }
        }
        return changed ? next : prev;
      });
    }
  }, [activeFileId, files]);

  const toggleFolder = (folderId: string) => {
    const willOpen = !openFolders[folderId];
    setOpenFolders((prev) => ({ ...prev, [folderId]: willOpen }));
    setSelectedFolderId(willOpen ? folderId : null);
  };

  const handleStartCreate = (isFolder: boolean, explicitParentId?: string | null) => {
    cancelCreateRef.current = false;
    setEditingFileId(null);
    const targetParent = explicitParentId !== undefined ? explicitParentId : selectedFolderId;
    const validParent = targetParent && files.some((f) => f._id === targetParent && f.isFolder) ? targetParent : null;
    setCreateParentId(validParent);
    if (validParent) {
      setOpenFolders((prev) => ({ ...prev, [validParent]: true }));
    }
    setIsCreatingFile(!isFolder);
    setIsCreatingFolder(isFolder);
    setNewEntityName('');
  };

  const handleCreateSubmit = (isFolder: boolean) => {
    if (cancelCreateRef.current) {
      cancelCreateRef.current = false;
      setIsCreatingFile(false);
      setIsCreatingFolder(false);
      setNewEntityName('');
      return;
    }
    const trimmed = newEntityName.trim();
    const validParent =
      createParentId && files.some((f) => f._id === createParentId && f.isFolder) ? createParentId : null;
    setIsCreatingFile(false);
    setIsCreatingFolder(false);
    setNewEntityName('');
    if (!trimmed) return;
    onCreateFile(trimmed, isFolder, validParent);
  };

  const handleRenameSubmit = (fileId: string, originalName: string) => {
    if (cancelRenameRef.current) {
      cancelRenameRef.current = false;
      setEditingFileId(null);
      return;
    }
    const trimmed = editingName.trim();
    setEditingFileId(null);
    if (trimmed && trimmed !== originalName) {
      onRenameFile(fileId, trimmed);
    }
  };

  const childrenByParent = useMemo(() => {
    const map = new Map<string, ProjectFile[]>();
    const validIds = new Set(files.map((f) => f._id));
    for (const file of files) {
      const key = file.parentId && validIds.has(file.parentId) ? file.parentId : '__root__';
      const bucket = map.get(key) || [];
      bucket.push(file);
      map.set(key, bucket);
    }
    for (const [k, bucket] of map.entries()) {
      map.set(k, sortFileEntries(bucket));
    }
    return map;
  }, [files]);

  const filteredFiles = useMemo(() => {
    const q = filterQuery.trim().toLowerCase();
    if (!q) return [];
    return sortFileEntries(
      files.filter(
        (f) => f.name.toLowerCase().includes(q) || f.path.toLowerCase().includes(q)
      )
    );
  }, [files, filterQuery]);

  const targetParentFolder = createParentId
    ? files.find((f) => f._id === createParentId && f.isFolder) || null
    : null;

  const renderFileRow = (
    file: ProjectFile,
    depth: number,
    showPathSub: boolean = false,
    visited: Set<string> = new Set()
  ): React.ReactNode => {
    if (visited.has(file._id)) return null;
    const nextVisited = new Set(visited);
    nextVisited.add(file._id);

    const isSelected = activeFileId === file._id;
    const isFolder = file.isFolder;
    const isOpen = !!openFolders[file._id];
    const isFolderSelected = isFolder && selectedFolderId === file._id;
    const children = isFolder ? childrenByParent.get(file._id) || [] : [];

    return (
      <React.Fragment key={file._id}>
        <div
          style={{ paddingLeft: `${depth * 14 + 8}px` }}
          className={`group flex items-center justify-between pr-2 py-1.5 rounded-sm text-[13px] font-normal transition ${
            isSelected
              ? 'bg-linen text-ink border-l-2 border-amber'
              : isFolderSelected
              ? 'bg-linen/60 text-ink'
              : 'text-ink hover:bg-linen'
          }`}
        >
          {editingFileId === file._id ? (
            <div className="flex items-center gap-1.5 flex-1 min-w-0">
              {isFolder ? (
                <>
                  {isOpen ? (
                    <ChevronDown size={12} className="text-ash shrink-0" />
                  ) : (
                    <ChevronRight size={12} className="text-ash shrink-0" />
                  )}
                  {isOpen ? (
                    <FolderOpen size={14} className="text-amber shrink-0" />
                  ) : (
                    <Folder size={14} className="text-ash shrink-0" />
                  )}
                </>
              ) : (
                <FileCode size={14} className={`shrink-0 ml-3.5 ${getFileIconColor(file.name)}`} />
              )}
              <input
                type="text"
                value={editingName}
                onChange={(e) => setEditingName(e.target.value)}
                onClick={(e) => e.stopPropagation()}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleRenameSubmit(file._id, file.name);
                  } else if (e.key === 'Escape') {
                    e.preventDefault();
                    cancelRenameRef.current = true;
                    setEditingFileId(null);
                  }
                }}
                onBlur={() => handleRenameSubmit(file._id, file.name)}
                autoFocus
                aria-label="Rename file"
                className="bg-parchment border border-stone rounded-md px-1.5 py-0.5 text-xs font-mono text-ink focus-visible:outline-none focus-visible:border-amber focus-visible:ring-1 focus-visible:ring-amber w-full min-w-0"
              />
            </div>
          ) : (
            <button
              type="button"
              aria-expanded={isFolder ? isOpen : undefined}
              onClick={() => {
                if (isFolder) {
                  toggleFolder(file._id);
                } else {
                  setSelectedFolderId(file.parentId || null);
                  onSelectFile(file._id);
                }
              }}
              className="flex items-center gap-1.5 flex-1 min-w-0 text-left cursor-pointer focus:outline-none focus-visible:ring-1 focus-visible:ring-amber rounded-sm"
            >
              {isFolder ? (
                <>
                  {isOpen ? (
                    <ChevronDown size={12} className="text-ash shrink-0" />
                  ) : (
                    <ChevronRight size={12} className="text-ash shrink-0" />
                  )}
                  {isOpen ? (
                    <FolderOpen size={14} className="text-amber shrink-0" />
                  ) : (
                    <Folder size={14} className="text-ash shrink-0" />
                  )}
                </>
              ) : (
                <FileCode size={14} className={`shrink-0 ml-3.5 ${getFileIconColor(file.name)}`} />
              )}
              <span className="flex items-baseline gap-1.5 min-w-0 flex-1">
                <span className="truncate">{file.name}</span>
                {showPathSub && file.path !== file.name && (
                  <span className="text-[10px] font-mono text-mist truncate">{file.path}</span>
                )}
              </span>
            </button>
          )}

          {canEdit && (
            <div className="opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 focus-within:opacity-100 flex items-center gap-0.5 shrink-0 transition">
              {isFolder && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleStartCreate(false, file._id);
                  }}
                  title={`New file inside ${file.name}`}
                  aria-label={`New file inside ${file.name}`}
                  className="p-1 rounded-md text-ash hover:text-ink hover:bg-bone focus:outline-none focus-visible:ring-1 focus-visible:ring-amber transition cursor-pointer"
                >
                  <FilePlus size={12} />
                </button>
              )}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  cancelRenameRef.current = false;
                  setIsCreatingFile(false);
                  setIsCreatingFolder(false);
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
                  setFileToDelete({ id: file._id, name: file.name, isFolder: file.isFolder });
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

        {isFolder &&
          isOpen &&
          !showPathSub &&
          children.map((child) => renderFileRow(child, depth + 1, false, nextVisited))}
      </React.Fragment>
    );
  };

  const rootItems = childrenByParent.get('__root__') || [];

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
              onClick={() => handleStartCreate(false)}
              title={selectedFolderId ? 'New File in Selected Folder' : 'New File'}
              aria-label="New File"
              className="p-1 rounded-md text-ash hover:text-ink hover:bg-linen focus:outline-none focus-visible:ring-2 focus-visible:ring-ink dark:focus-visible:ring-parchment transition cursor-pointer"
            >
              <FilePlus size={14} />
            </button>
            <button
              type="button"
              onClick={() => handleStartCreate(true)}
              title={selectedFolderId ? 'New Folder in Selected Folder' : 'New Folder'}
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
            className="w-full bg-parchment border border-stone rounded-md pl-7 pr-6 py-1 text-xs text-ink placeholder-mist focus:outline-none focus:border-amber focus-visible:ring-1 focus-visible:ring-amber font-mono"
          />
          {filterQuery && (
            <button
              type="button"
              onClick={() => setFilterQuery('')}
              aria-label="Clear file filter"
              className="absolute right-1.5 p-0.5 rounded text-ash hover:text-ink cursor-pointer"
            >
              <X className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>

      {/* Inline Create Input */}
      {(isCreatingFile || isCreatingFolder) && (
        <div className="p-2 border-b border-stone bg-linen space-y-1">
          {targetParentFolder && (
            <div className="flex items-center justify-between text-[10px] font-mono text-ash px-0.5">
              <span className="truncate">in /{targetParentFolder.path}</span>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => setCreateParentId(null)}
                className="text-amber hover:underline shrink-0 ml-1 cursor-pointer"
              >
                root
              </button>
            </div>
          )}
          <input
            type="text"
            placeholder={isCreatingFolder ? 'folder-name' : 'filename.js'}
            value={newEntityName}
            onChange={(e) => setNewEntityName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleCreateSubmit(isCreatingFolder);
              } else if (e.key === 'Escape') {
                e.preventDefault();
                cancelCreateRef.current = true;
                setIsCreatingFile(false);
                setIsCreatingFolder(false);
                setNewEntityName('');
              }
            }}
            onBlur={() => handleCreateSubmit(isCreatingFolder)}
            autoFocus
            aria-label={isCreatingFolder ? 'Folder name' : 'File name'}
            className="w-full bg-parchment border border-stone rounded-md px-2 py-1 text-xs font-mono text-ink focus-visible:outline-none focus-visible:border-amber focus-visible:ring-1 focus-visible:ring-amber"
          />
        </div>
      )}

      {/* File Tree List */}
      <div
        className="flex-1 overflow-y-auto p-1.5 space-y-0.5"
        onClick={(e) => {
          if (e.target === e.currentTarget) setSelectedFolderId(null);
        }}
      >
        {filterQuery.trim() ? (
          filteredFiles.length === 0 ? (
            <p className="text-center font-mono text-micro text-ash py-8">No matching files</p>
          ) : (
            filteredFiles.map((file) => renderFileRow(file, 0, true))
          )
        ) : rootItems.length === 0 ? (
          <p className="text-center font-mono text-micro text-ash py-8">No files in workspace</p>
        ) : (
          rootItems.map((file) => renderFileRow(file, 0))
        )}
      </div>

      <ConfirmDialog
        isOpen={!!fileToDelete}
        title={`Delete ${fileToDelete?.name}?`}
        message={
          fileToDelete?.isFolder
            ? 'Are you sure you want to delete this folder and all files inside it? This action cannot be undone.'
            : 'Are you sure you want to delete this file? This action cannot be undone.'
        }
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
