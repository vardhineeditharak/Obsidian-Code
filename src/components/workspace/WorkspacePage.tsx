import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { Header } from './Header';
import { Sidebar } from './Sidebar';
import { EditorWorkspace } from './EditorWorkspace';
import { BottomPanel } from './BottomPanel';
import { StatusBar } from './StatusBar';
import { ShareModal } from './ShareModal';
import { VersionHistoryModal } from './VersionHistoryModal';
import { SearchReplaceModal } from './SearchReplaceModal';
import { PromptDialog, Modal } from '../ui/Dialog';
import { LoadingState } from '../ui/LoadingState';
import {
  Project,
  ProjectFile,
  ProjectRole,
  User,
  TransportMode,
  CollaboratorPresence,
  BottomTab,
  DiagnosticsItem,
  ExecutionResult,
  SaveState,
  VersionCheckpoint,
} from '../../lib/types';
import { api } from '../../lib/api';
import { docManager } from '../../lib/crdt/docManager';
import { subscribeProjectEvents } from '../../lib/crdt/projectEvents';
import { analyzeCode } from '../../lib/diagnostics/codeDiagnostics';
import { exportWorkspaceAsZip } from '../../lib/exportWorkspace';
import { sound } from '../../lib/audio/soundEngine';
import { notify } from '../../lib/notifications';
import { detectLanguage } from '../../lib/language';

export interface WorkspacePageProps {
  projectId: string;
  currentUser: User;
  onLogout: () => void;
  onBackToDashboard: () => void;
}

const COLLAB_COLORS = ['#c08532', '#34785c', '#d4994a', '#1f8a65', '#84847e', '#4a9e7c'];

function collectSubtreeIds(allFiles: ProjectFile[], rootId: string): string[] {
  const byParent = new Map<string, string[]>();
  for (const f of allFiles) {
    if (f.parentId) {
      const children = byParent.get(f.parentId) || [];
      children.push(f._id);
      byParent.set(f.parentId, children);
    }
  }
  const result: string[] = [];
  const queue = [rootId];
  const seen = new Set<string>();
  while (queue.length > 0) {
    const id = queue.shift()!;
    if (seen.has(id)) continue;
    seen.add(id);
    result.push(id);
    const children = byParent.get(id);
    if (children) {
      for (const childId of children) {
        if (!seen.has(childId)) queue.push(childId);
      }
    }
  }
  return result;
}

export const WorkspacePage: React.FC<WorkspacePageProps> = ({
  projectId,
  currentUser,
  onLogout,
  onBackToDashboard,
}) => {
  const [project, setProject] = useState<Project | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [userRole, setUserRole] = useState<ProjectRole>('editor');
  const [files, setFiles] = useState<ProjectFile[]>([]);
  const [openFileIds, setOpenFileIds] = useState<string[]>([]);
  const [activeFileId, setActiveFileId] = useState<string | null>(null);
  const [activeContent, setActiveContent] = useState<string>('');

  // Transport & Connectivity
  const [isOnline, setIsOnline] = useState<boolean>(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );
  const [transportMode, setTransportMode] = useState<TransportMode>('Hybrid');

  // Autosave & Checkpoints
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);
  const autosaveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const secondarySaveTimersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const lastSavedContentMapRef = useRef<Map<string, string>>(new Map());
  const pendingOfflineSavesRef = useRef<Map<string, string>>(new Map());
  const lastCheckpointHashRef = useRef<string>('');
  const hasRestoredTabsRef = useRef(false);

  // Presence & Follow Mode
  const [collaborators, setCollaborators] = useState<CollaboratorPresence[]>([]);
  const [followingUserId, setFollowingUserId] = useState<string | null>(null);

  // Bottom Drawer
  const [isBottomOpen, setIsBottomOpen] = useState(true);
  const [bottomTab, setBottomTab] = useState<BottomTab>('OUTPUT');
  const [executionResult, setExecutionResult] = useState<ExecutionResult | null>(null);
  const [isRunningCode, setIsRunningCode] = useState(false);

  // Diagnostics & Cursor
  const [diagnostics, setDiagnostics] = useState<DiagnosticsItem[]>([]);
  const [cursorLine, setCursorLine] = useState(1);
  const [cursorColumn, setCursorColumn] = useState(1);

  // Modals & Layout
  const [isShareOpen, setIsShareOpen] = useState(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [showCheckpointDialog, setShowCheckpointDialog] = useState(false);
  const [showQuickOpen, setShowQuickOpen] = useState(false);
  const [quickOpenFilter, setQuickOpenFilter] = useState('');
  const [showSidebar, setShowSidebar] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth >= 768 : true
  );
  const [showMobileNotice, setShowMobileNotice] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth < 640 : false
  );

  // Navigation & Sync Triggers
  const [revealTarget, setRevealTarget] = useState<{
    fileId: string;
    line: number;
    column: number;
    endColumn?: number;
    nonce: number;
  } | null>(null);
  const [replaceModelContent, setReplaceModelContent] = useState<{
    fileId: string;
    content: string;
    nonce: number;
  } | null>(null);
  const [previewNonce, setPreviewNonce] = useState(0);
  const [isAudioMuted, setIsAudioMuted] = useState(sound.getMuted());

  const diagTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Fresh state refs for event listeners and background timers
  const userRoleRef = useRef<ProjectRole>(userRole);
  const transportModeRef = useRef<TransportMode>(transportMode);
  const isOnlineRef = useRef<boolean>(isOnline);
  const activeFileIdRef = useRef<string | null>(activeFileId);
  const activeContentRef = useRef<string>(activeContent);
  const filesRef = useRef<ProjectFile[]>(files);

  userRoleRef.current = userRole;
  transportModeRef.current = transportMode;
  isOnlineRef.current = isOnline;
  activeFileIdRef.current = activeFileId;
  activeContentRef.current = activeContent;
  filesRef.current = files;

  const getLiveFileContent = useCallback(
    (fileId: string): string => {
      if (fileId === activeFileIdRef.current) {
        return activeContentRef.current;
      }
      const session = docManager.getSession(projectId, fileId);
      if (session) {
        return session.ytext.toString();
      }
      const f = filesRef.current.find((file) => file._id === fileId);
      return f?.content || '';
    },
    [projectId]
  );

  const loadWorkspace = useCallback(async () => {
    try {
      setLoadError(null);
      const { project: p, userRole: role } = await api.getProject(projectId);
      if (p) {
        p.name = typeof p.name === 'string' ? p.name : '';
      }
      setProject(p);
      setUserRole(role);

      const fList = await api.getProjectFiles(projectId);
      setFiles(fList);

      fList.forEach((f) => {
        if (!f.isFolder) {
          lastSavedContentMapRef.current.set(f._id, f.content || '');
        }
      });

      const fileIds = new Set(fList.filter((f) => !f.isFolder).map((f) => f._id));
      let restoredTabs: string[] = [];
      let restoredActive: string | null = null;

      if (typeof window !== 'undefined') {
        try {
          const savedTabsRaw = localStorage.getItem(`obsidian.workspace.${projectId}.openTabs`);
          if (savedTabsRaw) {
            const parsed: unknown = JSON.parse(savedTabsRaw);
            if (Array.isArray(parsed)) {
              restoredTabs = parsed.filter(
                (id): id is string => typeof id === 'string' && fileIds.has(id)
              );
            }
          }
          const savedActive = localStorage.getItem(`obsidian.workspace.${projectId}.activeFile`);
          if (savedActive && fileIds.has(savedActive)) {
            restoredActive = savedActive;
          }
        } catch {}
      }

      if (restoredTabs.length > 0) {
        const activeId =
          restoredActive && restoredTabs.includes(restoredActive)
            ? restoredActive
            : restoredTabs[0];
        const activeTarget = fList.find((f) => f._id === activeId);
        setOpenFileIds(restoredTabs);
        setActiveFileId(activeId);
        setActiveContent(activeTarget?.content || '');
      } else {
        const firstFile = fList.find((f) => !f.isFolder);
        if (firstFile) {
          setOpenFileIds([firstFile._id]);
          setActiveFileId(firstFile._id);
          setActiveContent(firstFile.content || '');
        } else {
          setOpenFileIds([]);
          setActiveFileId(null);
          setActiveContent('');
        }
      }
      hasRestoredTabsRef.current = true;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unable to load project';
      setLoadError(msg);
      notify.error('Failed to load workspace', msg);
    }
  }, [projectId]);

  // Reflect active project name in browser tab title
  useEffect(() => {
    const defaultTitle = 'Obsidian Code — Real-Time Collaborative Code Editor';
    if (project) {
      const displayName = project.name && project.name.trim() ? project.name : 'Untitled Project';
      document.title = `${displayName} — Obsidian Code`;
    }
    return () => {
      document.title = defaultTitle;
    };
  }, [project?.name]);

  // Persist open tabs & active file per projectId only after initial restore completes
  useEffect(() => {
    if (!projectId || !hasRestoredTabsRef.current || typeof window === 'undefined') return;
    try {
      localStorage.setItem(`obsidian.workspace.${projectId}.openTabs`, JSON.stringify(openFileIds));
      if (activeFileId) {
        localStorage.setItem(`obsidian.workspace.${projectId}.activeFile`, activeFileId);
      } else {
        localStorage.removeItem(`obsidian.workspace.${projectId}.activeFile`);
      }
    } catch {}
  }, [projectId, openFileIds, activeFileId]);

  // Load workspace, network listeners, global shortcuts, and unmount cleanup
  useEffect(() => {
    hasRestoredTabsRef.current = false;
    setProject(null);
    loadWorkspace();

    const handleOnline = async () => {
      setIsOnline(true);
      notify.networkStatus(true, transportModeRef.current);
      sound.networkReconnected();

      if (pendingOfflineSavesRef.current.size > 0 && userRoleRef.current !== 'viewer') {
        const pendingEntries = Array.from(pendingOfflineSavesRef.current.entries());
        pendingOfflineSavesRef.current.clear();
        setSaveState('saving');
        try {
          for (const [fileId, content] of pendingEntries) {
            await api.updateFile(fileId, { content });
            lastSavedContentMapRef.current.set(fileId, content);
            setFiles((prev) => prev.map((f) => (f._id === fileId ? { ...f, content } : f)));
          }
          setSaveState('saved');
          setLastSavedAt(Date.now());
        } catch (err) {
          console.warn('Failed to flush offline pending save:', err);
          for (const [fileId, content] of pendingEntries) {
            if (!pendingOfflineSavesRef.current.has(fileId)) {
              pendingOfflineSavesRef.current.set(fileId, content);
            }
          }
          setSaveState('idle');
        }
      } else {
        setSaveState('idle');
      }
    };

    const handleOffline = () => {
      setIsOnline(false);
      setSaveState('offline');
      notify.networkStatus(false);
      sound.networkDisconnected();
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'f') {
        e.preventDefault();
        setIsSearchOpen(true);
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'b') {
        e.preventDefault();
        setShowSidebar((prev) => !prev);
      } else if ((e.ctrlKey || e.metaKey) && e.key === '`') {
        e.preventDefault();
        setIsBottomOpen(true);
        setBottomTab('TERMINAL');
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'p') {
        e.preventDefault();
        setShowQuickOpen(true);
      }
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('keydown', handleKeyDown);

      if (autosaveTimeoutRef.current) {
        clearTimeout(autosaveTimeoutRef.current);
      }
      Object.values(secondarySaveTimersRef.current).forEach((t) => clearTimeout(t));
      secondarySaveTimersRef.current = {};

      // Tear down Yjs sessions for this project on navigation away / unmount
      filesRef.current.forEach((f) => {
        if (!f.isFolder) {
          docManager.destroySession(projectId, f._id);
        }
      });
    };
  }, [projectId, loadWorkspace]);

  // Subscribe to real-time project events
  useEffect(() => {
    if (!projectId) return;

    const unsubscribe = subscribeProjectEvents(projectId, (event) => {
      if (event.type === 'file:created') {
        const created = event.file;
        setFiles((prev) => (prev.some((f) => f._id === created._id) ? prev : [...prev, created]));
        if (!created.isFolder) {
          lastSavedContentMapRef.current.set(created._id, created.content || '');
        }
      } else if (event.type === 'file:updated') {
        const updated = event.file;
        setFiles((prev) => prev.map((f) => (f._id === updated._id ? updated : f)));
        if (!updated.isFolder && updated.content !== undefined) {
          lastSavedContentMapRef.current.set(updated._id, updated.content);
        }
      } else if (event.type === 'file:deleted') {
        const deletedId = event.fileId;
        const removedIds = new Set(collectSubtreeIds(filesRef.current, deletedId));
        removedIds.forEach((id) => {
          lastSavedContentMapRef.current.delete(id);
          pendingOfflineSavesRef.current.delete(id);
          docManager.destroyBinding(id);
        });
        setFiles((prev) => prev.filter((f) => !removedIds.has(f._id)));
        setOpenFileIds((prev) => {
          const next = prev.filter((id) => !removedIds.has(id));
          setActiveFileId((currActive) => {
            if (currActive && removedIds.has(currActive)) {
              const fallbackId = next.length > 0 ? next[next.length - 1] : null;
              setActiveContent(fallbackId ? getLiveFileContent(fallbackId) : '');
              return fallbackId;
            }
            return currActive;
          });
          return next;
        });
      } else if (event.type === 'project:updated') {
        setProject((prev) => (prev ? { ...prev, ...event.project } : prev));
      } else if (event.type === 'member:role-updated') {
        if (event.userId === currentUser._id) {
          setUserRole(event.role);
          notify.roleChanged(event.role.charAt(0).toUpperCase() + event.role.slice(1));
          sound.roleChanged();
        }
        api
          .getProject(projectId)
          .then(({ project: freshProject, userRole: freshRole }) => {
            setProject(freshProject);
            setUserRole(freshRole);
          })
          .catch(() => {});
      } else if (event.type === 'member:removed') {
        if (event.userId === currentUser._id) {
          notify.error('Access Revoked', 'You have been removed from this workspace.');
          onBackToDashboard();
        } else {
          setProject((prev) =>
            prev && prev.members
              ? { ...prev, members: prev.members.filter((m) => m.userId !== event.userId) }
              : prev
          );
        }
      } else if (event.type === 'member:joined') {
        api
          .getProject(projectId)
          .then(({ project: freshProject }) => {
            setProject(freshProject);
          })
          .catch(() => {});
      }
    });

    return unsubscribe;
  }, [projectId, currentUser._id, onBackToDashboard, getLiveFileContent]);

  // Subscribe to real Yjs awareness presence for the active file
  useEffect(() => {
    if (!activeFileId || !projectId) {
      setCollaborators([]);
      return;
    }

    let unsubscribe: (() => void) | undefined;
    let isCancelled = false;

    const initAwareness = async () => {
      try {
        const file = filesRef.current.find((f) => f._id === activeFileId);
        await docManager.getOrCreateSession(
          projectId,
          activeFileId,
          file?.content || '',
          undefined,
          project?.isPublic ?? false
        );

        if (isCancelled) return;

        let hash = 0;
        const uid = currentUser._id;
        for (let i = 0; i < uid.length; i++) {
          hash = (hash << 5) - hash + uid.charCodeAt(i);
          hash |= 0;
        }
        const userColor = COLLAB_COLORS[Math.abs(hash) % COLLAB_COLORS.length];

        docManager.setLocalAwareness(projectId, activeFileId, {
          id: currentUser._id,
          name: currentUser.name,
          color: userColor,
          role: userRole,
          avatar: currentUser.avatar,
        });

        unsubscribe = docManager.subscribeAwareness(projectId, activeFileId, (collabs) => {
          if (!isCancelled) {
            setCollaborators(collabs);
          }
        });
      } catch (err) {
        console.warn('Real awareness initialization notice:', err);
      }
    };

    initAwareness();

    return () => {
      isCancelled = true;
      if (unsubscribe) unsubscribe();
    };
  }, [activeFileId, projectId, currentUser._id, currentUser.name, currentUser.avatar, userRole, project?.isPublic]);

  // Debounced code diagnostics on active file changes
  useEffect(() => {
    if (!activeFileId) {
      setDiagnostics([]);
      return;
    }
    const file = files.find((f) => f._id === activeFileId);
    if (!file) return;

    if (diagTimeoutRef.current) clearTimeout(diagTimeoutRef.current);
    diagTimeoutRef.current = setTimeout(() => {
      const items = analyzeCode(
        activeContent,
        file._id,
        file.name,
        detectLanguage(file.name) || file.language || 'plaintext'
      );
      setDiagnostics(items);
    }, 400);

    return () => {
      if (diagTimeoutRef.current) clearTimeout(diagTimeoutRef.current);
    };
  }, [activeContent, activeFileId, files]);

  // Debounced primary file autosave
  useEffect(() => {
    if (!activeFileId || userRole === 'viewer') return;

    const lastSaved = lastSavedContentMapRef.current.get(activeFileId);
    if (activeContent === lastSaved) return;

    if (!navigator.onLine || !isOnline) {
      pendingOfflineSavesRef.current.set(activeFileId, activeContent);
      setSaveState('offline');
      return;
    }

    if (autosaveTimeoutRef.current) {
      clearTimeout(autosaveTimeoutRef.current);
    }

    const targetId = activeFileId;
    const targetContent = activeContent;

    autosaveTimeoutRef.current = setTimeout(async () => {
      setSaveState('saving');
      try {
        await api.updateFile(targetId, { content: targetContent });
        lastSavedContentMapRef.current.set(targetId, targetContent);
        pendingOfflineSavesRef.current.delete(targetId);
        setFiles((prev) =>
          prev.map((f) => (f._id === targetId ? { ...f, content: targetContent } : f))
        );
        setSaveState('saved');
        setLastSavedAt(Date.now());
      } catch (err) {
        console.warn('Autosave failed, will retry on next change:', err);
        setSaveState('idle');
      }
    }, 1500);

    return () => {
      if (autosaveTimeoutRef.current) {
        clearTimeout(autosaveTimeoutRef.current);
      }
    };
  }, [activeFileId, activeContent, userRole, isOnline]);

  // Flush unsaved changes for a file immediately when switching away or closing
  const flushFileIfDirty = (fileId: string, content: string) => {
    if (userRoleRef.current === 'viewer') return;
    const prevSaved = lastSavedContentMapRef.current.get(fileId);
    if (content === prevSaved) return;

    if (!isOnlineRef.current || (typeof navigator !== 'undefined' && !navigator.onLine)) {
      pendingOfflineSavesRef.current.set(fileId, content);
      setSaveState('offline');
      return;
    }

    api
      .updateFile(fileId, { content })
      .then(() => {
        lastSavedContentMapRef.current.set(fileId, content);
        pendingOfflineSavesRef.current.delete(fileId);
        setFiles((prev) => prev.map((f) => (f._id === fileId ? { ...f, content } : f)));
      })
      .catch((e) => console.warn('Flush on file switch failed:', e));
  };

  // File Selection & Tab Management
  const handleSelectFile = (fileId: string) => {
    if (activeFileId && activeFileId !== fileId) {
      flushFileIfDirty(activeFileId, activeContent);
      setExecutionResult(null);
    }

    if (!openFileIds.includes(fileId)) {
      setOpenFileIds((prev) => [...prev, fileId]);
    }
    setActiveFileId(fileId);

    const session = docManager.getSession(projectId, fileId);
    const file = files.find((f) => f._id === fileId);
    const nextContent =
      session && session.ytext.length > 0 ? session.ytext.toString() : file?.content || '';
    setActiveContent(nextContent);
  };

  const handleCloseTab = (fileId: string) => {
    if (activeFileId === fileId) {
      flushFileIfDirty(fileId, activeContent);
    }
    const nextTabs = openFileIds.filter((id) => id !== fileId);
    setOpenFileIds(nextTabs);
    if (activeFileId === fileId) {
      setExecutionResult(null);
      const nextActiveId = nextTabs.length > 0 ? nextTabs[nextTabs.length - 1] : null;
      setActiveFileId(nextActiveId);
      setActiveContent(nextActiveId ? getLiveFileContent(nextActiveId) : '');
    }
  };

  // File Operations (Create, Rename, Delete)
  const handleCreateFile = async (name: string, isFolder: boolean, parentId?: string | null) => {
    if (userRole === 'viewer') {
      notify.permissionDenied('create files');
      return;
    }
    try {
      const newFile = await api.createFile(projectId, name, isFolder, parentId);
      if (!newFile.isFolder) {
        lastSavedContentMapRef.current.set(newFile._id, newFile.content || '');
      }
      setFiles((prev) => (prev.some((f) => f._id === newFile._id) ? prev : [...prev, newFile]));
      notify.fileCreated(name);
      if (!isFolder) {
        handleSelectFile(newFile._id);
      }
    } catch (err: unknown) {
      notify.error('Could not create file', err instanceof Error ? err.message : 'Creation failed');
    }
  };

  const handleRenameFile = async (fileId: string, newName: string) => {
    if (userRole === 'viewer') {
      notify.permissionDenied('rename files');
      return;
    }
    try {
      const oldFile = files.find((f) => f._id === fileId);
      const updated = await api.updateFile(fileId, { name: newName });
      if (!updated.isFolder) {
        lastSavedContentMapRef.current.set(fileId, updated.content || '');
      }
      // Refresh project files when renaming a folder so descendant paths update immediately
      if (oldFile?.isFolder) {
        await handleRefreshFiles();
      } else {
        setFiles((prev) => prev.map((f) => (f._id === fileId ? updated : f)));
      }
      if (oldFile) notify.fileRenamed(oldFile.name, newName);
    } catch (err: unknown) {
      notify.error('Could not rename file', err instanceof Error ? err.message : 'Rename failed');
    }
  };

  const handleDeleteFile = async (fileId: string) => {
    if (userRole === 'viewer') {
      notify.permissionDenied('delete files');
      return;
    }
    try {
      const file = files.find((f) => f._id === fileId);
      const removedIds = collectSubtreeIds(files, fileId);
      await api.deleteFile(fileId);
      const removedSet = new Set(removedIds);
      removedIds.forEach((id) => {
        lastSavedContentMapRef.current.delete(id);
        pendingOfflineSavesRef.current.delete(id);
        docManager.destroyBinding(id);
      });
      setFiles((prev) => prev.filter((f) => !removedSet.has(f._id)));
      setOpenFileIds((prev) => {
        const nextTabs = prev.filter((id) => !removedSet.has(id));
        if (activeFileId && removedSet.has(activeFileId)) {
          setExecutionResult(null);
          const nextActiveId = nextTabs.length > 0 ? nextTabs[nextTabs.length - 1] : null;
          setActiveFileId(nextActiveId);
          setActiveContent(nextActiveId ? getLiveFileContent(nextActiveId) : '');
        }
        return nextTabs;
      });
      if (file) notify.fileDeleted(file.name);
    } catch (err: unknown) {
      notify.error('Could not delete file', err instanceof Error ? err.message : 'Delete failed');
    }
  };

  const handleRenameProject = async (newName: string) => {
    try {
      const updated = await api.updateProject(projectId, { name: newName });
      if (updated) {
        updated.name = typeof updated.name === 'string' ? updated.name : '';
        setProject(updated);
      }
      notify.success(`Workspace renamed to "${newName}"`);
    } catch (err: unknown) {
      notify.error(
        'Failed to rename workspace',
        err instanceof Error ? err.message : 'Rename failed'
      );
    }
  };

  const handleTransportChange = (mode: TransportMode) => {
    setTransportMode(mode);
    docManager.setTransportMode(mode);
    notify.transportChanged(mode);
  };

  const handleToggleFollow = (userId: string) => {
    if (userId === currentUser._id) return;
    if (followingUserId === userId) {
      setFollowingUserId(null);
      notify.followMode(false);
      sound.followMode(false);
    } else {
      setFollowingUserId(userId);
      const target = collaborators.find((c) => c.id === userId);
      notify.followMode(true, target?.name);
      sound.followMode(true);
    }
  };

  const handleToggleAudio = () => {
    const isMuted = sound.toggleMute();
    setIsAudioMuted(isMuted);
    notify.info(isMuted ? 'Audio muted' : 'Audio unmuted');
  };

  // Code Execution Sandbox
  const handleRunCode = async () => {
    if (userRole === 'viewer') {
      notify.permissionDenied('execute code');
      return;
    }
    if (!activeFileId) return;
    const file = files.find((f) => f._id === activeFileId);
    if (!file) return;

    const lang = detectLanguage(file.name) || file.language || 'plaintext';
    setIsRunningCode(true);
    notify.executionStarted();
    try {
      const result = await api.executeCode(activeContent, lang, file.name);
      setExecutionResult(result);
      setIsBottomOpen(true);
      setBottomTab('OUTPUT');

      if (result.error) {
        sound.executionFailed();
        notify.executionFailed(result.error);
      } else {
        sound.executionSuccess();
        notify.executionSuccess(result.executionTimeMs);
      }
    } catch (err: unknown) {
      sound.executionFailed();
      notify.executionFailed(err instanceof Error ? err.message : 'Execution error');
    } finally {
      setIsRunningCode(false);
    }
  };

  // Terminal Command Execution
  const handleRunTerminalCommand = async (command: string): Promise<ExecutionResult | null> => {
    if (userRoleRef.current === 'viewer') {
      throw new Error('Viewers do not have permission to execute code.');
    }
    const parts = command.trim().split(/\s+/);
    const cmd = parts[0].toLowerCase();
    const arg = parts.slice(1).join(' ').trim();

    let targetFile: ProjectFile | undefined;
    let targetLang = 'javascript';

    if (cmd === 'run') {
      if (arg) {
        targetFile = files.find(
          (f) =>
            !f.isFolder &&
            (f.name.toLowerCase() === arg.toLowerCase() || f.path.toLowerCase() === arg.toLowerCase())
        );
        if (!targetFile) {
          throw new Error(`File '${arg}' not found in workspace.`);
        }
      } else {
        targetFile = files.find((f) => f._id === activeFileId);
        if (!targetFile) {
          throw new Error('No active file to run.');
        }
      }
      targetLang = detectLanguage(targetFile.name) || targetFile.language || 'plaintext';
    } else {
      targetLang =
        cmd === 'node' || cmd === 'js'
          ? 'javascript'
          : cmd === 'ts'
          ? 'typescript'
          : cmd === 'py'
          ? 'python'
          : cmd === 'sh'
          ? 'bash'
          : cmd;
      if (arg) {
        targetFile = files.find(
          (f) =>
            !f.isFolder &&
            (f.name.toLowerCase() === arg.toLowerCase() || f.path.toLowerCase() === arg.toLowerCase())
        );
        if (!targetFile) {
          throw new Error(`File '${arg}' not found in workspace.`);
        }
      } else {
        targetFile = files.find((f) => f._id === activeFileId);
        if (!targetFile) {
          throw new Error('No file specified.');
        }
      }
    }

    const codeToRun = getLiveFileContent(targetFile._id);
    const result = await api.executeCode(codeToRun, targetLang, targetFile.name);
    setExecutionResult(result);
    if (result.error) sound.executionFailed();
    else sound.executionSuccess();
    return result;
  };

  // Live snapshot collector across active file and open CRDT sessions
  const getLiveFiles = useCallback(() => {
    return filesRef.current
      .filter((f) => !f.isFolder)
      .map((f) => ({
        fileId: f._id,
        fileName: f.name,
        content: getLiveFileContent(f._id),
      }));
  }, [getLiveFileContent]);

  const handleCreateNamedCheckpoint = () => {
    if (userRoleRef.current === 'viewer') {
      notify.permissionDenied('create checkpoints');
      return;
    }
    setShowCheckpointDialog(true);
  };

  const handleCreateCheckpointSubmit = async (values: Record<string, string>) => {
    const name = values.name?.trim();
    if (!name) return;
    const note = values.note?.trim() || '';
    setShowCheckpointDialog(false);

    try {
      const liveFiles = getLiveFiles();
      const version = await api.createVersion(projectId, name, note, liveFiles, 'manual', 'manual');
      lastCheckpointHashRef.current = liveFiles.map((f) => `${f.fileId}:${f.content}`).join('|');
      notify.checkpointCreated(version.name);
      sound.checkpointSaved();
    } catch (err: unknown) {
      notify.error(
        'Failed to create checkpoint',
        err instanceof Error ? err.message : 'Unable to save checkpoint'
      );
    }
  };

  const createAutoCheckpointIfNeeded = useCallback(
    async (trigger: string = 'periodic') => {
      if (
        !projectId ||
        userRoleRef.current === 'viewer' ||
        !isOnlineRef.current ||
        (typeof navigator !== 'undefined' && !navigator.onLine)
      ) {
        return;
      }
      const liveFiles = getLiveFiles();
      if (liveFiles.length === 0) return;

      const currentHash = liveFiles.map((f) => `${f.fileId}:${f.content}`).join('|');
      if (lastCheckpointHashRef.current === currentHash) return;

      try {
        const now = new Date();
        const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        const autoName = `Auto-save checkpoint (${timeStr})`;
        await api.createVersion(
          projectId,
          autoName,
          'Automatic periodic checkpoint',
          liveFiles,
          'auto',
          trigger
        );
        lastCheckpointHashRef.current = currentHash;
      } catch (err) {
        console.warn('Auto checkpoint failed:', err);
      }
    },
    [projectId, getLiveFiles]
  );

  // Periodic auto-checkpoint every 5 minutes
  useEffect(() => {
    if (!projectId || userRole === 'viewer') return;
    const interval = setInterval(() => {
      createAutoCheckpointIfNeeded('interval');
    }, 300000);
    return () => clearInterval(interval);
  }, [projectId, userRole, createAutoCheckpointIfNeeded]);

  const handleRefreshFiles = async () => {
    try {
      const fresh = await api.getProjectFiles(projectId);
      setFiles(fresh);
    } catch (err) {
      console.warn('Failed to refresh project files:', err);
    }
  };

  // Restore full checkpoint across active editor, Yjs sessions, and file state
  const handleRestoreVersion = async (version: VersionCheckpoint) => {
    await api.restoreVersion(version._id);
    const nonceBase = Date.now();

    version.files.forEach((f, idx) => {
      if (f.fileId === activeFileId) {
        setActiveContent(f.content);
      }
      setReplaceModelContent({ fileId: f.fileId, content: f.content, nonce: nonceBase + idx });
      const session = docManager.getSession(projectId, f.fileId);
      if (session) {
        session.doc.transact(() => {
          session.ytext.delete(0, session.ytext.length);
          session.ytext.insert(0, f.content);
        });
      }
      lastSavedContentMapRef.current.set(f.fileId, f.content);
    });

    setFiles((prev) =>
      prev.map((file) => {
        const matching = version.files.find((vf) => vf.fileId === file._id);
        return matching ? { ...file, content: matching.content } : file;
      })
    );

    await handleRefreshFiles();
    notify.checkpointRestored(version.name);
    sound.checkpointSaved();
  };

  const handleRestoreContent = (fileId: string, restoredContent: string) => {
    if (activeFileId === fileId) {
      setActiveContent(restoredContent);
    }
    setReplaceModelContent({ fileId, content: restoredContent, nonce: Date.now() });
    const session = docManager.getSession(projectId, fileId);
    if (session) {
      session.doc.transact(() => {
        session.ytext.delete(0, session.ytext.length);
        session.ytext.insert(0, restoredContent);
      });
    }
    lastSavedContentMapRef.current.set(fileId, restoredContent);
    setFiles((prev) =>
      prev.map((f) => (f._id === fileId ? { ...f, content: restoredContent } : f))
    );
  };

  const handleAdoptFileContent = useCallback((fileId: string, content: string) => {
    if (activeFileIdRef.current === fileId) {
      setActiveContent(content);
    }
    setFiles((prev) => prev.map((f) => (f._id === fileId ? { ...f, content } : f)));
  }, []);

  // Debounced save for edits made inside the secondary split pane
  const handleSecondaryContentChange = useCallback((fileId: string, content: string) => {
    setFiles((prev) => prev.map((f) => (f._id === fileId ? { ...f, content } : f)));
    if (userRoleRef.current === 'viewer') return;

    const prevSaved = lastSavedContentMapRef.current.get(fileId);
    if (content === prevSaved) return;

    if (!isOnlineRef.current || (typeof navigator !== 'undefined' && !navigator.onLine)) {
      pendingOfflineSavesRef.current.set(fileId, content);
      setSaveState('offline');
      return;
    }

    if (secondarySaveTimersRef.current[fileId]) {
      clearTimeout(secondarySaveTimersRef.current[fileId]);
    }

    secondarySaveTimersRef.current[fileId] = setTimeout(async () => {
      setSaveState('saving');
      try {
        await api.updateFile(fileId, { content });
        lastSavedContentMapRef.current.set(fileId, content);
        pendingOfflineSavesRef.current.delete(fileId);
        setSaveState('saved');
        setLastSavedAt(Date.now());
      } catch (err) {
        console.warn('Secondary pane autosave failed:', err);
        setSaveState('idle');
      }
    }, 1500);
  }, []);

  // Batch Replace across workspace files
  const handleBatchReplace = async (replacements: { fileId: string; newContent: string }[]) => {
    if (userRole === 'viewer') {
      notify.permissionDenied('replace across files');
      return;
    }
    const nonceBase = Date.now();
    for (let idx = 0; idx < replacements.length; idx++) {
      const r = replacements[idx];
      await api.updateFile(r.fileId, { content: r.newContent });
      lastSavedContentMapRef.current.set(r.fileId, r.newContent);
      if (activeFileId === r.fileId) {
        setActiveContent(r.newContent);
      }
      setReplaceModelContent({ fileId: r.fileId, content: r.newContent, nonce: nonceBase + idx });
      const session = docManager.getSession(projectId, r.fileId);
      if (session) {
        session.doc.transact(() => {
          session.ytext.delete(0, session.ytext.length);
          session.ytext.insert(0, r.newContent);
        });
      }
    }
    setFiles((prev) =>
      prev.map((f) => {
        const found = replacements.find((r) => r.fileId === f._id);
        return found ? { ...f, content: found.newContent } : f;
      })
    );
  };

  // Export Workspace ZIP using live editor/CRDT contents
  const handleExportZip = async () => {
    if (!project) return;
    await exportWorkspaceAsZip(project.name || 'workspace', files, async (fileId) =>
      getLiveFileContent(fileId)
    );
  };

  // HTML/CSS/JS Sandboxed Live Preview Generator
  const previewHtml = useMemo(() => {
    const htmlFile =
      files.find((f) => !f.isFolder && f.name.toLowerCase() === 'index.html') ||
      files.find((f) => !f.isFolder && f.name.toLowerCase().endsWith('.html'));
    const cssFiles = files.filter((f) => !f.isFolder && f.name.toLowerCase().endsWith('.css'));
    const jsFiles = files.filter((f) => !f.isFolder && f.name.toLowerCase().endsWith('.js'));

    const getLive = (file?: ProjectFile) => {
      if (!file) return '';
      if (file._id === activeFileId) return activeContent;
      const session = docManager.getSession(projectId, file._id);
      return session ? session.ytext.toString() : file.content || '';
    };

    const htmlContent = getLive(htmlFile);
    const cssContent = cssFiles.map(getLive).filter(Boolean).join('\n');
    const jsContent = jsFiles
      .map(getLive)
      .filter(Boolean)
      .join('\n')
      .replace(/<\/script>/gi, '<\\/script>');

    if (!htmlContent && !cssContent && !jsContent) {
      return `<!DOCTYPE html><html><body style="font-family:system-ui,sans-serif;text-align:center;padding:48px 24px;background:#171717;color:#a3a3a3;margin:0;"><h3 style="color:#eeeeee;font-weight:500;margin-bottom:6px;">No HTML / CSS / JS previewable files</h3><p style="font-size:13px;margin:0;">Create an index.html file to preview your web app live.</p></body></html>`;
    }

    let output = htmlContent || `<!DOCTYPE html><html><head></head><body></body></html>`;
    if (cssContent) {
      if (output.includes('</head>')) {
        output = output.replace('</head>', `<style>${cssContent}</style></head>`);
      } else {
        output = `<style>${cssContent}</style>${output}`;
      }
    }
    if (jsContent) {
      if (output.includes('</body>')) {
        output = output.replace('</body>', `<script>${jsContent}</script></body>`);
      } else {
        output = `${output}<script>${jsContent}</script>`;
      }
    }
    return output;
  }, [files, activeFileId, activeContent, projectId]);

  if (loadError && !project) {
    return (
      <div className="h-screen w-screen flex flex-col items-center justify-center bg-parchment text-ink p-6 gap-4">
        <p className="text-sm font-medium text-crimson">Unable to load workspace</p>
        <p className="text-xs font-mono text-ash max-w-md text-center">{loadError}</p>
        <button
          type="button"
          onClick={onBackToDashboard}
          className="btn-primary text-xs px-4 py-2"
        >
          Back to Dashboard
        </button>
      </div>
    );
  }

  if (!project) {
    return <LoadingState fullscreen label="Loading collaborative workspace…" />;
  }

  const activeFile = files.find((f) => f._id === activeFileId);
  const errorCount = diagnostics.filter((d) => d.severity === 'error').length;
  const warnCount = diagnostics.filter((d) => d.severity === 'warning').length;
  const quickOpenMatches = files.filter(
    (f) => !f.isFolder && f.name.toLowerCase().includes(quickOpenFilter.toLowerCase())
  );

  return (
    <div className="h-screen w-screen flex flex-col bg-parchment text-ink overflow-hidden transition-colors duration-200">
      {/* Mobile viewport notice */}
      {showMobileNotice && (
        <aside
          aria-label="Mobile viewport notice"
          className="bg-linen border-b border-stone px-3 py-1.5 flex items-center justify-between text-xs text-driftwood z-40 shrink-0"
        >
          <span className="truncate pr-2">
            Obsidian Code is desktop-optimized. Code editing is best experienced on wider displays.
          </span>
          <button
            type="button"
            onClick={() => setShowMobileNotice(false)}
            aria-label="Dismiss mobile notice"
            className="text-ash hover:text-ink font-mono text-xs px-1.5 py-0.5 rounded-md hover:bg-stone/20 shrink-0 cursor-pointer"
          >
            ✕
          </button>
        </aside>
      )}

      {/* Workspace Header */}
      <Header
        project={project}
        user={currentUser}
        userRole={userRole}
        isOnline={isOnline}
        saveState={saveState}
        lastSavedAt={lastSavedAt}
        transportMode={transportMode}
        onTransportChange={handleTransportChange}
        collaborators={collaborators}
        followingUserId={followingUserId}
        onToggleFollow={handleToggleFollow}
        isAudioMuted={isAudioMuted}
        onToggleAudio={handleToggleAudio}
        onRenameProject={handleRenameProject}
        onOpenShare={() => setIsShareOpen(true)}
        onOpenHistory={() => setIsHistoryOpen(true)}
        onOpenSearch={() => setIsSearchOpen(true)}
        onExportZip={handleExportZip}
        onRunCode={handleRunCode}
        isRunningCode={isRunningCode}
        onLogout={onLogout}
        onBackToDashboard={onBackToDashboard}
        showSidebar={showSidebar}
        onToggleSidebar={() => setShowSidebar((prev) => !prev)}
      />

      {/* Main Center Area: Sidebar + EditorWorkspace + BottomPanel */}
      <div className="flex-1 flex overflow-hidden min-h-0">
        {showSidebar && (
          <Sidebar
            files={files}
            activeFileId={activeFileId}
            onSelectFile={handleSelectFile}
            onCreateFile={handleCreateFile}
            onRenameFile={handleRenameFile}
            onDeleteFile={handleDeleteFile}
            userRole={userRole}
          />
        )}

        <div className="flex-1 flex flex-col overflow-hidden min-w-0">
          <EditorWorkspace
            projectId={projectId}
            files={files}
            openFileIds={openFileIds}
            activeFileId={activeFileId}
            onSelectFile={handleSelectFile}
            onCloseTab={handleCloseTab}
            userRole={userRole}
            user={{ id: currentUser._id, name: currentUser.name, avatar: currentUser.avatar }}
            collaborators={collaborators}
            followingUserId={followingUserId}
            diagnostics={diagnostics}
            onCursorChange={(line, col) => {
              setCursorLine(line);
              setCursorColumn(col);
              if (activeFileId) {
                docManager.updateCursorAwareness(projectId, activeFileId, { line, column: col });
              }
            }}
            onContentChange={setActiveContent}
            onCreateCheckpoint={handleCreateNamedCheckpoint}
            isPublic={project.isPublic ?? false}
            revealTarget={revealTarget}
            replaceModelContent={replaceModelContent}
            onAdoptFileContent={handleAdoptFileContent}
            onSecondaryContentChange={handleSecondaryContentChange}
            onStopFollowing={() => {
              setFollowingUserId(null);
              notify.followMode(false);
              sound.followMode(false);
            }}
          />

          <BottomPanel
            isOpen={isBottomOpen}
            onToggle={() => setIsBottomOpen((prev) => !prev)}
            activeTab={bottomTab}
            onTabChange={setBottomTab}
            executionResult={executionResult}
            onClearOutput={() => setExecutionResult(null)}
            diagnostics={diagnostics}
            onSelectProblem={(fileId, line, col) => {
              handleSelectFile(fileId);
              setCursorLine(line);
              setCursorColumn(col);
              setRevealTarget({
                fileId,
                line,
                column: col,
                endColumn: undefined,
                nonce: Date.now(),
              });
            }}
            previewHtml={previewHtml}
            previewNonce={previewNonce}
            onRefreshPreview={() => setPreviewNonce((prev) => prev + 1)}
            onRunTerminalCommand={handleRunTerminalCommand}
            activeLanguage={
              activeFile
                ? detectLanguage(activeFile.name) || activeFile.language || 'javascript'
                : 'javascript'
            }
            activeFileName={activeFile?.name}
          />
        </div>
      </div>

      {/* Status Bar */}
      <StatusBar
        isOnline={isOnline}
        saveState={saveState}
        lastSavedAt={lastSavedAt}
        transportMode={transportMode}
        errorCount={errorCount}
        warnCount={warnCount}
        currentLanguage={
          activeFile
            ? detectLanguage(activeFile.name) || activeFile.language || 'plaintext'
            : 'plaintext'
        }
        cursorLine={cursorLine}
        cursorColumn={cursorColumn}
        userRole={userRole}
        onOpenProblems={() => {
          setIsBottomOpen(true);
          setBottomTab('PROBLEMS');
        }}
      />

      {/* Share Workspace Modal */}
      <ShareModal
        isOpen={isShareOpen}
        onClose={() => setIsShareOpen(false)}
        projectId={projectId}
        projectName={project.name || 'Untitled Project'}
        members={project.members || []}
        userRole={userRole}
        currentUserId={currentUser._id}
        onMembersChanged={loadWorkspace}
        onLeaveWorkspace={onBackToDashboard}
      />

      {/* Version History & Diff Modal */}
      <VersionHistoryModal
        isOpen={isHistoryOpen}
        onClose={() => setIsHistoryOpen(false)}
        projectId={projectId}
        files={files}
        activeFileId={activeFileId}
        currentContent={activeContent}
        userRole={userRole}
        onRestoreContent={handleRestoreContent}
        onRestoreVersion={handleRestoreVersion}
        getFileContent={getLiveFileContent}
      />

      {/* Workspace Search & Replace Modal */}
      <SearchReplaceModal
        isOpen={isSearchOpen}
        onClose={() => setIsSearchOpen(false)}
        files={files}
        onBeforeSearch={handleRefreshFiles}
        getFileContent={async (fileId) => getLiveFileContent(fileId)}
        onSelectResult={(fileId, line, col, matchLength) => {
          handleSelectFile(fileId);
          setCursorLine(line);
          setCursorColumn(col);
          setRevealTarget({
            fileId,
            line,
            column: col,
            endColumn: col + (matchLength ?? 0),
            nonce: Date.now(),
          });
        }}
        onBatchReplace={handleBatchReplace}
      />

      {/* Named Checkpoint Dialog */}
      <PromptDialog
        isOpen={showCheckpointDialog}
        title="Create Named Checkpoint"
        message="Snapshot live workspace contents into version history."
        fields={[
          {
            id: 'name',
            label: 'Checkpoint Name',
            placeholder: 'e.g. feat: add user authentication',
            required: true,
          },
          {
            id: 'note',
            label: 'Optional Notes',
            placeholder: 'Summary of changes...',
            type: 'textarea',
          },
        ]}
        submitText="Save Checkpoint"
        onSubmit={handleCreateCheckpointSubmit}
        onCancel={() => setShowCheckpointDialog(false)}
      />

      {/* Quick Open File (Ctrl+P) */}
      <Modal
        isOpen={showQuickOpen}
        onClose={() => {
          setShowQuickOpen(false);
          setQuickOpenFilter('');
        }}
        maxWidth="max-w-md"
        title="Quick Open File (Ctrl+P)"
      >
        <div className="p-4 space-y-3">
          <input
            type="text"
            autoFocus
            aria-label="Filter files by name"
            placeholder="Search file by name..."
            value={quickOpenFilter}
            onChange={(e) => setQuickOpenFilter(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && quickOpenMatches.length > 0) {
                e.preventDefault();
                handleSelectFile(quickOpenMatches[0]._id);
                setShowQuickOpen(false);
                setQuickOpenFilter('');
              }
            }}
            className="w-full bg-parchment border border-stone rounded-md px-3 py-2 text-xs font-mono text-ink placeholder-mist focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink dark:focus-visible:ring-parchment"
          />
          <div className="max-h-60 overflow-y-auto space-y-1">
            {quickOpenMatches.map((file) => (
              <button
                key={file._id}
                type="button"
                onClick={() => {
                  handleSelectFile(file._id);
                  setShowQuickOpen(false);
                  setQuickOpenFilter('');
                }}
                className="w-full flex items-center justify-between px-3 py-2 rounded-md text-left hover:bg-linen/60 text-xs font-mono text-driftwood hover:text-ink transition cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink dark:focus-visible:ring-parchment"
              >
                <span className="font-normal text-ink">{file.name}</span>
                <span className="text-micro text-mist font-mono">{file.path}</span>
              </button>
            ))}
            {quickOpenMatches.length === 0 && (
              <p className="text-center text-xs font-sans text-mist py-4">No matching files</p>
            )}
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default WorkspacePage;
