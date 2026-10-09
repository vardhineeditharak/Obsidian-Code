import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Header } from './Header';
import { Sidebar } from './Sidebar';
import { EditorWorkspace } from './EditorWorkspace';
import { BottomPanel } from './BottomPanel';
import { StatusBar } from './StatusBar';
import { ShareModal } from './ShareModal';
import { VersionHistoryModal } from './VersionHistoryModal';
import { SearchReplaceModal } from './SearchReplaceModal';
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
} from '../../lib/types';
import { api } from '../../lib/api';
import { docManager } from '../../lib/crdt/docManager';
import { analyzeCode } from '../../lib/diagnostics/codeDiagnostics';
import { exportWorkspaceAsZip } from '../../lib/exportWorkspace';
import { sound } from '../../lib/audio/soundEngine';
import { notify } from '../../lib/notifications';

interface WorkspacePageProps {
  projectId: string;
  currentUser: User;
  onLogout: () => void;
  onBackToDashboard: () => void;
}

const COLLAB_COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#8B5CF6', '#EC4899', '#06B6D4'];

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

  // Audio mute
  const [isAudioMuted, setIsAudioMuted] = useState(sound.getMuted());

  // Debounce ref for diagnostics
  const diagTimeoutRef = useRef<any>(null);

  // Load project details and files
  useEffect(() => {
    loadWorkspace();

    const handleOnline = () => {
      setIsOnline(true);
      notify.networkStatus(true, transportMode);
      sound.networkReconnected();
    };

    const handleOffline = () => {
      setIsOnline(false);
      notify.networkStatus(false);
      sound.networkDisconnected();
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Global keyboard shortcut: Ctrl+Shift+F for Search
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'F' || e.key === 'f')) {
        e.preventDefault();
        setIsSearchOpen(true);
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
      setProject(p);
      setUserRole(role);

      const fList = await api.getProjectFiles(projectId);
      setFiles(fList);

      // Open first non-folder file by default
      const firstFile = fList.find((f) => !f.isFolder);
      if (firstFile) {
        setOpenFileIds([firstFile._id]);
        setActiveFileId(firstFile._id);
        setActiveContent(firstFile.content || '');
      }

      // Simulate simulated collaborators for multiplayer experience
      const simulatedCollabs: CollaboratorPresence[] = [
        {
          id: 'collab-1',
          name: 'Sarah Chen',
          color: COLLAB_COLORS[0],
          role: 'editor',
          cursor: { line: 4, column: 12 },
        },
        {
          id: 'collab-2',
          name: 'Alex Rivera',
          color: COLLAB_COLORS[1],
          role: 'viewer',
          cursor: { line: 8, column: 2 },
        },
      ];
      setCollaborators(simulatedCollabs);
    } catch (err: any) {
      notify.error('Failed to load workspace', err.message);
    }
  };

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

  // File Selection & Tab Management
  const handleSelectFile = (fileId: string) => {
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
    const nextTabs = openFileIds.filter((id) => id !== fileId);
    setOpenFileIds(nextTabs);
    if (activeFileId === fileId) {
      setActiveFileId(nextTabs.length > 0 ? nextTabs[nextTabs.length - 1] : null);
    }
  };

  // File Operations (Create, Rename, Delete)
  const handleCreateFile = async (name: string, isFolder: boolean) => {
    try {
      const newFile = await api.createFile(projectId, name, isFolder);
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
      setFiles((prev) => prev.filter((f) => f._id !== fileId));
      handleCloseTab(fileId);
      if (file) notify.fileDeleted(file.name);
    } catch (err: any) {
      notify.error('Could not delete file', err.message);
    }
  };

  // Rename Project
  const handleRenameProject = async (newName: string) => {
    try {
      const updated = await api.updateProject(projectId, { name: newName });
      setProject(updated);
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

  // Execute Code Sandbox
  const handleRunCode = async () => {
    if (!activeFileId) return;
    const file = files.find((f) => f._id === activeFileId);
    if (!file) return;

    setIsRunningCode(true);
    notify.executionStarted();
    try {
      const result = await api.executeCode(activeContent, file.language || 'javascript');
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

  // Terminal Command Execution
  const handleRunTerminalCommand = async (command: string) => {
    try {
      const result = await api.executeCode(command, 'javascript');
      setExecutionResult(result);
      if (result.error) sound.executionFailed();
      else sound.executionSuccess();
    } catch (err: any) {
      notify.error('Command Execution Failed', err.message);
    }
  };

  // Checkpoint Creation (Ctrl+S or Manual)
  const handleCreateNamedCheckpoint = async () => {
    const name = prompt('Enter a checkpoint name (e.g. "feat: add user authentication"):');
    if (!name?.trim()) return;

    try {
      const note = prompt('Optional checkpoint notes:') || '';
      const version = await api.createVersion(projectId, name.trim(), note);
      notify.checkpointCreated(version.name);
      sound.checkpointSaved();
    } catch (err: any) {
      notify.error('Failed to create checkpoint', err.message);
    }
  };

  // Restore Checkpoint Content
  const handleRestoreContent = (fileId: string, restoredContent: string) => {
    if (activeFileId === fileId) {
      setActiveContent(restoredContent);
    }
    setFiles((prev) =>
      prev.map((f) => (f._id === fileId ? { ...f, content: restoredContent } : f))
    );
  };

  // Batch Replace (Ctrl+Shift+F)
  const handleBatchReplace = async (replacements: { fileId: string; newContent: string }[]) => {
    for (const r of replacements) {
      await api.updateFile(r.fileId, { content: r.newContent });
      if (activeFileId === r.fileId) {
        setActiveContent(r.newContent);
      }
    }
    setFiles((prev) =>
      prev.map((f) => {
        const found = replacements.find((r) => r.fileId === f._id);
        return found ? { ...f, content: found.newContent } : f;
      })
    );
  };

  // Export Workspace ZIP
  const handleExportZip = async () => {
    if (!project) return;
    await exportWorkspaceAsZip(project.name, files, async (fileId) => {
      const f = files.find((file) => file._id === fileId);
      return f?._id === activeFileId ? activeContent : (f?.content || '');
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
      return `<!DOCTYPE html><html><body style="font-family:sans-serif;text-align:center;padding:40px;color:#64748b;"><h3>No HTML/CSS/JS files found in workspace</h3></body></html>`;
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
      <div className="h-screen w-screen flex items-center justify-center bg-[#0F172A] text-slate-400 text-xs">
        Loading collaborative workspace...
      </div>
    );
  }

  const activeFile = files.find((f) => f._id === activeFileId);
  const errorCount = diagnostics.filter((d) => d.severity === 'error').length;
  const warnCount = diagnostics.filter((d) => d.severity === 'warning').length;

  return (
    <div className="h-screen w-screen flex flex-col bg-[#0F172A] overflow-hidden">
      {/* Workspace Header */}
      <Header
        project={project}
        user={currentUser}
        userRole={userRole}
        isOnline={isOnline}
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
        onRoleSwitchSimulated={(simRole) => {
          setUserRole(simRole);
          notify.roleChanged(simRole);
          sound.roleChanged();
        }}
        onRunCode={handleRunCode}
        isRunningCode={isRunningCode}
        onLogout={onLogout}
        onBackToDashboard={onBackToDashboard}
      />

      {/* Main Center Area: Sidebar + EditorWorkspace */}
      <div className="flex-1 flex overflow-hidden">
        <Sidebar
          files={files}
          activeFileId={activeFileId}
          onSelectFile={handleSelectFile}
          onCreateFile={handleCreateFile}
          onRenameFile={handleRenameFile}
          onDeleteFile={handleDeleteFile}
          userRole={userRole}
        />

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
            }}
            onContentChange={setActiveContent}
            onCreateCheckpoint={handleCreateNamedCheckpoint}
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
            }}
            previewHtml={previewHtml}
            onRefreshPreview={() => {
              notify.info('Refreshed sandboxed preview');
            }}
            onRunTerminalCommand={handleRunTerminalCommand}
          />
        </div>
      </div>

      {/* Status Bar */}
      <StatusBar
        isOnline={isOnline}
        transportMode={transportMode}
        errorCount={errorCount}
        warnCount={warnCount}
        currentLanguage={activeFile?.language || 'plaintext'}
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
      />

      {/* Version History & Diff Modal */}
      <VersionHistoryModal
        isOpen={isHistoryOpen}
        onClose={() => setIsHistoryOpen(false)}
        projectId={projectId}
        files={files}
        activeFileId={activeFileId}
        currentContent={activeContent}
        onRestoreContent={handleRestoreContent}
      />

      {/* Workspace Search & Replace Modal */}
      <SearchReplaceModal
        isOpen={isSearchOpen}
        onClose={() => setIsSearchOpen(false)}
        files={files}
        getFileContent={async (fileId) => {
          const f = files.find((file) => file._id === fileId);
          return f?._id === activeFileId ? activeContent : (f?.content || '');
        }}
        onSelectResult={(fileId, line, col) => {
          handleSelectFile(fileId);
          setCursorLine(line);
          setCursorColumn(col);
        }}
        onBatchReplace={handleBatchReplace}
      />
    </div>
  );
};
