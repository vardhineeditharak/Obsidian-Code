import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Header } from './Header';
import { Sidebar } from './Sidebar';
import { EditorWorkspace } from './EditorWorkspace';
import { BottomPanel } from './BottomPanel';
import { StatusBar } from './StatusBar';
import { ShareModal } from './ShareModal';
import { VersionHistoryModal } from './VersionHistoryModal';
import { SearchReplaceModal } from './SearchReplaceModal';
import { PromptDialog, Modal } from '../ui/Dialog';
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
import { analyzeCode } from '../../lib/diagnostics/codeDiagnostics';
import { exportWorkspaceAsZip } from '../../lib/exportWorkspace';
import { sound } from '../../lib/audio/soundEngine';
import { notify } from '../../lib/notifications';
import { detectLanguage } from '../../lib/language';

interface WorkspacePageProps {
  projectId: string;
  currentUser: User;
  onLogout: () => void;
  onBackToDashboard: () => void;
}

const COLLAB_COLORS = ['#c08532', '#34785c', '#d4994a', '#1f8a65', '#84847e', '#4a9e7c'];

export const WorkspacePage: React.FC<WorkspacePageProps> = ({
  projectId,
  currentUser,
  onLogout,
  onBackToDashboard,
}) => {
  const [project, setProject] = useState<Project | null>(null);
  const [userRole, setUserRole] = useState<ProjectRole>('editor');
  const [files, setFiles] = useState<ProjectFile[]>([]);
  const [openFileIds, setOpenFileIds] = useState<string[]>([]);
  const [activeFileId, setActiveFileId] = useState<string | null>(null);
  const [activeContent, setActiveContent] = useState<string>('');

  // Transport & Connectivity
  const [isOnline, setIsOnline] = useState<boolean>(navigator.onLine);
  const [transportMode, setTransportMode] = useState<TransportMode>('Hybrid');

  // Autosave state machine & checkpoint refs
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);
  const autosaveTimeoutRef = useRef<any>(null);
  const lastSavedContentMapRef = useRef<Map<string, string>>(new Map());
  const pendingAutosaveRef = useRef<{ fileId: string; content: string } | null>(null);
  const lastCheckpointHashRef = useRef<string>('');

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

  // Modals
  const [isShareOpen, setIsShareOpen] = useState(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [showCheckpointDialog, setShowCheckpointDialog] = useState(false);
  const [showQuickOpen, setShowQuickOpen] = useState(false);
  const [quickOpenFilter, setQuickOpenFilter] = useState('');
  const [showSidebar, setShowSidebar] = useState(true);

  // Navigation and content sync
  const [revealTarget, setRevealTarget] = useState<{ fileId: string; line: number; column: number; endColumn?: number; nonce: number } | null>(null);
  const [replaceModelContent, setReplaceModelContent] = useState<{ fileId: string; content: string; nonce: number } | null>(null);
  const [previewNonce, setPreviewNonce] = useState(0);

  // Audio mute
  const [isAudioMuted, setIsAudioMuted] = useState(sound.getMuted());

  // Debounce ref for diagnostics
  const diagTimeoutRef = useRef<any>(null);

  // Reflect active project name in browser tab title (Step 2)
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

  // Load project details and files
  useEffect(() => {
    loadWorkspace();

    const handleOnline = async () => {
      setIsOnline(true);
      notify.networkStatus(true, transportMode);
      sound.networkReconnected();

      // Flush offline pending autosave if any
      if (pendingAutosaveRef.current && userRole !== 'viewer') {
        const { fileId, content } = pendingAutosaveRef.current;
        pendingAutosaveRef.current = null;
        setSaveState('saving');
        try {
          await api.updateFile(fileId, { content });
          lastSavedContentMapRef.current.set(fileId, content);
          setFiles((prev) => prev.map((f) => (f._id === fileId ? { ...f, content } : f)));
          setSaveState('saved');
          setLastSavedAt(Date.now());
        } catch (err) {
          console.warn('Failed to flush offline pending save:', err);
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

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Global keyboard shortcuts: Ctrl+Shift+F (Search), Ctrl+B (Sidebar), Ctrl+` (Terminal), Ctrl+P (Quick Open)
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'F' || e.key === 'f')) {
        e.preventDefault();
        setIsSearchOpen(true);
      } else if ((e.ctrlKey || e.metaKey) && (e.key === 'b' || e.key === 'B')) {
        e.preventDefault();
        setShowSidebar((prev) => !prev);
      } else if ((e.ctrlKey || e.metaKey) && e.key === '`') {
        e.preventDefault();
        setIsBottomOpen(true);
        setBottomTab('TERMINAL');
      } else if ((e.ctrlKey || e.metaKey) && (e.key === 'p' || e.key === 'P')) {
        e.preventDefault();
        setShowQuickOpen(true);
      }
    };
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [projectId]);

  const loadWorkspace = async () => {
    try {
      const { project: p, userRole: role } = await api.getProject(projectId);
      if (p) {
        p.name = typeof p.name === 'string' ? p.name : '';
      }
      setProject(p);
      setUserRole(role);

      const fList = await api.getProjectFiles(projectId);
      setFiles(fList);

      // Initialize lastSavedContentMap
      fList.forEach((f) => {
        if (!f.isFolder) {
          lastSavedContentMapRef.current.set(f._id, f.content || '');
        }
      });

      // Open first non-folder file by default
      const firstFile = fList.find((f) => !f.isFolder);
      if (firstFile) {
        setOpenFileIds([firstFile._id]);
        setActiveFileId(firstFile._id);
        setActiveContent(firstFile.content || '');
      }
    } catch (err: any) {
      notify.error('Failed to load workspace', err.message);
    }
  };

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
        const file = files.find((f) => f._id === activeFileId);
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
  }, [activeFileId, projectId, currentUser._id, currentUser.name, userRole, project?.isPublic]);

  // Run diagnostics when active content or active file changes
  useEffect(() => {
    if (!activeFileId) return;
    const file = files.find((f) => f._id === activeFileId);
    if (!file) return;

    if (diagTimeoutRef.current) clearTimeout(diagTimeoutRef.current);
    diagTimeoutRef.current = setTimeout(() => {
      const items = analyzeCode(activeContent, file._id, file.name, file.language || 'javascript');
      setDiagnostics(items);
    }, 400);

    return () => {
      if (diagTimeoutRef.current) clearTimeout(diagTimeoutRef.current);
    };
  }, [activeContent, activeFileId, files]);

  // Debounced per-file autosave to server (Step 4)
  useEffect(() => {
    if (!activeFileId || userRole === 'viewer') {
      return;
    }

    const lastSaved = lastSavedContentMapRef.current.get(activeFileId);
    if (activeContent === lastSaved) {
      return;
    }

    if (!navigator.onLine || !isOnline) {
      pendingAutosaveRef.current = { fileId: activeFileId, content: activeContent };
      setSaveState('offline');
      return;
    }

    if (autosaveTimeoutRef.current) {
      clearTimeout(autosaveTimeoutRef.current);
    }

    autosaveTimeoutRef.current = setTimeout(async () => {
      setSaveState('saving');
      try {
        await api.updateFile(activeFileId, { content: activeContent });
        lastSavedContentMapRef.current.set(activeFileId, activeContent);
        setFiles((prev) =>
          prev.map((f) => (f._id === activeFileId ? { ...f, content: activeContent } : f))
        );
        pendingAutosaveRef.current = null;
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

  // File Selection & Tab Management
  const handleSelectFile = (fileId: string) => {
    // Flush pending changes of active file if switching
    if (activeFileId && activeFileId !== fileId && userRole !== 'viewer') {
      const prevSaved = lastSavedContentMapRef.current.get(activeFileId);
      if (activeContent !== prevSaved && isOnline && navigator.onLine) {
        api.updateFile(activeFileId, { content: activeContent }).then(() => {
          lastSavedContentMapRef.current.set(activeFileId, activeContent);
          setFiles((prev) =>
            prev.map((f) => (f._id === activeFileId ? { ...f, content: activeContent } : f))
          );
        }).catch((e) => console.warn('Flush on file switch failed:', e));
      }
    }

    if (activeFileId && activeFileId !== fileId) {
      setExecutionResult(null);
    }

    if (!openFileIds.includes(fileId)) {
      setOpenFileIds((prev) => [...prev, fileId]);
    }
    setActiveFileId(fileId);
    const file = files.find((f) => f._id === fileId);
    if (file) {
      setActiveContent(file.content || '');
    }
  };

  const handleCloseTab = (fileId: string) => {
    docManager.destroyBinding(fileId);
    const nextTabs = openFileIds.filter((id) => id !== fileId);
    setOpenFileIds(nextTabs);
    if (activeFileId === fileId) {
      setExecutionResult(null);
      setActiveFileId(nextTabs.length > 0 ? nextTabs[nextTabs.length - 1] : null);
    }
  };

  // File Operations (Create, Rename, Delete)
  const handleCreateFile = async (name: string, isFolder: boolean) => {
    try {
      const newFile = await api.createFile(projectId, name, isFolder);
      lastSavedContentMapRef.current.set(newFile._id, newFile.content || '');
      setFiles((prev) => [...prev, newFile]);
      notify.fileCreated(name);
      if (!isFolder) {
        handleSelectFile(newFile._id);
      }
    } catch (err: any) {
      notify.error('Could not create file', err.message);
    }
  };

  const handleRenameFile = async (fileId: string, newName: string) => {
    try {
      const oldFile = files.find((f) => f._id === fileId);
      const updated = await api.updateFile(fileId, { name: newName });
      lastSavedContentMapRef.current.set(fileId, updated.content || '');
      setFiles((prev) => prev.map((f) => (f._id === fileId ? updated : f)));
      if (oldFile) notify.fileRenamed(oldFile.name, newName);
    } catch (err: any) {
      notify.error('Could not rename file', err.message);
    }
  };

  const handleDeleteFile = async (fileId: string) => {
    try {
      const file = files.find((f) => f._id === fileId);
      await api.deleteFile(fileId);
      lastSavedContentMapRef.current.delete(fileId);
      setFiles((prev) => prev.filter((f) => f._id !== fileId));
      handleCloseTab(fileId);
      if (file) notify.fileDeleted(file.name);
    } catch (err: any) {
      notify.error('Could not delete file', err.message);
    }
  };

  // Rename Project (Step 3)
  const handleRenameProject = async (newName: string) => {
    try {
      const updated = await api.updateProject(projectId, { name: newName });
      if (updated) {
        updated.name = typeof updated.name === 'string' ? updated.name : '';
        setProject(updated);
      }
      notify.success(`Workspace renamed to "${newName}"`);
    } catch (err: any) {
      notify.error('Failed to rename workspace', err.message);
    }
  };

  // Transport Switcher
  const handleTransportChange = (mode: TransportMode) => {
    setTransportMode(mode);
    docManager.setTransportMode(mode);
    notify.transportChanged(mode);
  };

  // Follow Mode Toggle
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

  // Audio Mute Toggle
  const handleToggleAudio = () => {
    const isMuted = sound.toggleMute();
    setIsAudioMuted(isMuted);
    notify.info(isMuted ? 'Audio muted' : 'Audio unmuted');
  };

  // Execute Code Sandbox (Multi-language)
  const handleRunCode = async () => {
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
    } catch (err: any) {
      sound.executionFailed();
      notify.executionFailed(err.message);
    } finally {
      setIsRunningCode(false);
    }
  };

  // Terminal Command Execution (Multi-language Command Console)
  const handleRunTerminalCommand = async (command: string): Promise<ExecutionResult | null> => {
    const parts = command.trim().split(/\s+/);
    const cmd = parts[0].toLowerCase();
    const arg = parts.slice(1).join(' ').trim();

    let targetFile: ProjectFile | undefined;
    let targetLang = 'javascript';

    if (cmd === 'run') {
      if (arg) {
        targetFile = files.find((f) => f.name.toLowerCase() === arg.toLowerCase() || f.path.toLowerCase() === arg.toLowerCase());
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
      // <lang> <file>
      targetLang = cmd === 'node' || cmd === 'js' ? 'javascript' : (cmd === 'py' ? 'python' : cmd);
      if (arg) {
        targetFile = files.find((f) => f.name.toLowerCase() === arg.toLowerCase() || f.path.toLowerCase() === arg.toLowerCase());
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

    const codeToRun = targetFile._id === activeFileId ? activeContent : (targetFile.content || '');
    const result = await api.executeCode(codeToRun, targetLang, targetFile.name);
    setExecutionResult(result);
    if (result.error) sound.executionFailed();
    else sound.executionSuccess();
    return result;
  };

  // Live content collector across active file and open CRDT sessions (T1)
  const getLiveFiles = () => {
    return files
      .filter((f) => !f.isFolder)
      .map((f) => {
        let content = f.content || '';
        if (f._id === activeFileId) {
          content = activeContent;
        } else {
          const session = docManager.getSession(projectId, f._id);
          if (session) {
            content = session.ytext.toString();
          }
        }
        return {
          fileId: f._id,
          fileName: f.name,
          content,
        };
      });
  };

  // Checkpoint Creation (Ctrl+S or Manual)
  const handleCreateNamedCheckpoint = () => {
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
    } catch (err: any) {
      notify.error('Failed to create checkpoint', err.message);
    }
  };

  // Periodic auto checkpoints (Step 7)
  const createAutoCheckpointIfNeeded = async (trigger: string = 'periodic') => {
    if (!projectId || userRole === 'viewer' || !isOnline || !navigator.onLine) {
      return;
    }
    const liveFiles = getLiveFiles();
    if (liveFiles.length === 0) return;

    // Check if content has changed since last checkpoint
    const currentHash = liveFiles.map((f) => `${f.fileId}:${f.content}`).join('|');
    if (lastCheckpointHashRef.current === currentHash) {
      return;
    }

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
  };

  // Periodic checkpoint timer (Step 7: every 5 minutes)
  useEffect(() => {
    if (!projectId || userRole === 'viewer') return;

    const interval = setInterval(() => {
      createAutoCheckpointIfNeeded('interval');
    }, 300000);

    return () => clearInterval(interval);
  }, [projectId, userRole, isOnline, files, activeFileId, activeContent]);

  // Restore Entire Checkpoint (Step 8)
  const handleRestoreVersion = async (version: VersionCheckpoint) => {
    await api.restoreVersion(version._id);

    // Apply restored content to all files in the version snapshot
    for (const f of version.files) {
      if (f.fileId === activeFileId) {
        setActiveContent(f.content);
        setReplaceModelContent({ fileId: f.fileId, content: f.content, nonce: Date.now() });
      }
      const session = docManager.getSession(projectId, f.fileId);
      if (session) {
        session.doc.transact(() => {
          session.ytext.delete(0, session.ytext.length);
          session.ytext.insert(0, f.content);
        });
      }
      lastSavedContentMapRef.current.set(f.fileId, f.content);
    }

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

  // Restore Checkpoint Content (T2)
  const handleRestoreContent = (fileId: string, restoredContent: string) => {
    if (activeFileId === fileId) {
      setActiveContent(restoredContent);
      setReplaceModelContent({ fileId, content: restoredContent, nonce: Date.now() });
    }
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

  // Adopt live CRDT content when a file is opened (T4)
  const handleAdoptFileContent = (fileId: string, content: string) => {
    if (activeFileId === fileId) {
      setActiveContent(content);
    }
    setFiles((prev) =>
      prev.map((f) => (f._id === fileId ? { ...f, content } : f))
    );
  };

  // Refresh files list before workspace search (S3)
  const handleRefreshFiles = async () => {
    try {
      const fresh = await api.getProjectFiles(projectId);
      setFiles(fresh);
    } catch (err) {
      console.warn('Failed to refresh project files:', err);
    }
  };

  // Batch Replace (Ctrl+Shift+F)
  const handleBatchReplace = async (replacements: { fileId: string; newContent: string }[]) => {
    for (const r of replacements) {
      await api.updateFile(r.fileId, { content: r.newContent });
      if (activeFileId === r.fileId) {
        setActiveContent(r.newContent);
      }
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

  // Export Workspace ZIP with live contents (T1)
  const handleExportZip = async () => {
    if (!project) return;
    await exportWorkspaceAsZip(project.name, files, async (fileId) => {
      if (fileId === activeFileId) return activeContent;
      const session = docManager.getSession(projectId, fileId);
      if (session) return session.ytext.toString();
      const f = files.find((file) => file._id === fileId);
      return f?.content || '';
    });
  };

  // HTML Preview Document Generator
  const previewHtml = useMemo(() => {
    const htmlFile = files.find((f) => f.name.toLowerCase().endsWith('.html'));
    const cssFile = files.find((f) => f.name.toLowerCase().endsWith('.css'));
    const jsFile = files.find((f) => f.name.toLowerCase().endsWith('.js'));

    const htmlContent = htmlFile?._id === activeFileId ? activeContent : (htmlFile?.content || '');
    const cssContent = cssFile?._id === activeFileId ? activeContent : (cssFile?.content || '');
    const jsContent = jsFile?._id === activeFileId ? activeContent : (jsFile?.content || '');

    if (!htmlContent && !cssContent && !jsContent) {
      return `<!DOCTYPE html><html><body style="font-family:sans-serif;text-align:center;padding:40px;background:#f7f7f4;color:#84847e;"><h3>No HTML/CSS/JS files found in workspace</h3></body></html>`;
    }

    // Embed CSS and JS into HTML
    let output = htmlContent || `<!DOCTYPE html><html><head></head><body></body></html>`;
    if (cssContent) {
      output = output.replace('</head>', `<style>${cssContent}</style></head>`);
    }
    if (jsContent) {
      output = output.replace('</body>', `<script>${jsContent}</script></body>`);
    }
    return output;
  }, [files, activeFileId, activeContent]);

  if (!project) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-parchment text-driftwood font-mono text-xs">
        Loading collaborative workspace...
      </div>
    );
  }

  const activeFile = files.find((f) => f._id === activeFileId);
  const errorCount = diagnostics.filter((d) => d.severity === 'error').length;
  const warnCount = diagnostics.filter((d) => d.severity === 'warning').length;

  return (
    <div className="h-screen w-screen flex flex-col bg-parchment text-ink overflow-hidden transition-colors duration-200">
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
      />

      {/* Main Center Area: Sidebar + EditorWorkspace */}
      <div className="flex-1 flex overflow-hidden">
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

        <div className="flex-1 flex flex-col overflow-hidden">
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
          />

          <BottomPanel
            isOpen={isBottomOpen}
            onToggle={() => setIsBottomOpen(!isBottomOpen)}
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
            onRefreshPreview={() => {
              setPreviewNonce((prev) => prev + 1);
            }}
            onRunTerminalCommand={handleRunTerminalCommand}
            activeLanguage={activeFile ? (detectLanguage(activeFile.name) || activeFile.language || 'javascript') : 'javascript'}
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
        currentLanguage={activeFile ? (detectLanguage(activeFile.name) || activeFile.language || 'plaintext') : 'plaintext'}
        cursorLine={cursorLine}
        cursorColumn={cursorColumn}
        userRole={userRole}
      />

      {/* Share Workspace Modal */}
      <ShareModal
        isOpen={isShareOpen}
        onClose={() => setIsShareOpen(false)}
        projectId={projectId}
        projectName={project.name}
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
      />

      {/* Workspace Search & Replace Modal */}
      <SearchReplaceModal
        isOpen={isSearchOpen}
        onClose={() => setIsSearchOpen(false)}
        files={files}
        onBeforeSearch={handleRefreshFiles}
        getFileContent={async (fileId) => {
          if (fileId === activeFileId) return activeContent;
          const session = docManager.getSession(projectId, fileId);
          if (session) return session.ytext.toString();
          const f = files.find((file) => file._id === fileId);
          return f?.content || '';
        }}
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

      {/* Checkpoint Creation In-App Dialog (D1) */}
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

      {/* Quick Open File (Ctrl+P - X1) */}
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
            placeholder="Search file by name..."
            value={quickOpenFilter}
            onChange={(e) => setQuickOpenFilter(e.target.value)}
            className="w-full bg-parchment border border-stone rounded-md px-3 py-2 text-xs font-mono text-ink placeholder-mist focus:outline-none focus:ring-1 focus:ring-ink"
          />
          <div className="max-h-60 overflow-y-auto space-y-1">
            {files
              .filter((f) => !f.isFolder && f.name.toLowerCase().includes(quickOpenFilter.toLowerCase()))
              .map((file) => (
                <button
                  key={file._id}
                  onClick={() => {
                    handleSelectFile(file._id);
                    setShowQuickOpen(false);
                    setQuickOpenFilter('');
                  }}
                  className="w-full flex items-center justify-between px-3 py-2 rounded-md text-left hover:bg-linen/60 text-xs font-mono text-driftwood hover:text-ink transition cursor-pointer"
                >
                  <span className="font-normal text-ink">{file.name}</span>
                  <span className="text-[10px] text-mist font-mono">{file.path}</span>
                </button>
              ))}
            {files.filter((f) => !f.isFolder && f.name.toLowerCase().includes(quickOpenFilter.toLowerCase())).length === 0 && (
              <p className="text-center text-xs font-editorial text-mist py-4">No matching files</p>
            )}
          </div>
        </div>
      </Modal>
    </div>
  );
};
