import React, { useState, useEffect, useRef } from 'react';
import { RotateCw, RotateCcw, PanelLeft } from 'lucide-react';
import { Project, ProjectRole, TransportMode, CollaboratorPresence, User, SaveState } from '../../lib/types';
import { BrandMark } from '../ui/BrandMark';
import {
  ThemeToggle,
  Search,
  History,
  Download,
  Share,
  Play,
  Check,
  ChevronDown,
  LogOut,
  FolderOpen,
  VolumeHigh,
  VolumeMute,
  Wifi,
  WifiOff,
} from '../ui/AnimatedIcon';
import { formatSaveRelativeTime } from './StatusBar';

export interface HeaderProps {
  project: Project;
  user: User;
  userRole: ProjectRole;
  isOnline: boolean;
  saveState?: SaveState;
  lastSavedAt?: number | null;
  transportMode: TransportMode;
  onTransportChange: (mode: TransportMode) => void;
  collaborators: CollaboratorPresence[];
  followingUserId: string | null;
  onToggleFollow: (userId: string) => void;
  isAudioMuted: boolean;
  onToggleAudio: () => void;
  onRenameProject: (name: string) => void;
  onOpenShare: () => void;
  onOpenHistory: () => void;
  onOpenSearch: () => void;
  onExportZip: () => void;
  onRunCode: () => void;
  isRunningCode: boolean;
  onLogout: () => void;
  onBackToDashboard: () => void;
  showSidebar?: boolean;
  onToggleSidebar?: () => void;
}

// WebRTC P2P is disabled for RBAC-protected documents; only server-backed modes are offered.
const TRANSPORT_MODES: TransportMode[] = ['Hybrid', 'WebSocket Only'];

export const Header: React.FC<HeaderProps> = ({
  project,
  user,
  userRole,
  isOnline,
  saveState = 'idle',
  lastSavedAt = null,
  transportMode,
  onTransportChange,
  collaborators,
  followingUserId,
  onToggleFollow,
  isAudioMuted,
  onToggleAudio,
  onRenameProject,
  onOpenShare,
  onOpenHistory,
  onOpenSearch,
  onExportZip,
  onRunCode,
  isRunningCode,
  onLogout,
  onBackToDashboard,
  showSidebar = true,
  onToggleSidebar,
}) => {
  const [isEditingName, setIsEditingName] = useState(false);
  const [projectName, setProjectName] = useState(project.name || '');
  const [showTransportMenu, setShowTransportMenu] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [, setTimeTick] = useState(0);

  const cancelRenameRef = useRef(false);
  const transportMenuRef = useRef<HTMLDivElement>(null);
  const userMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setProjectName(project?.name || '');
  }, [project?.name]);

  useEffect(() => {
    if (!lastSavedAt) return;
    const timer = setInterval(() => setTimeTick((t) => t + 1), 15000);
    return () => clearInterval(timer);
  }, [lastSavedAt]);

  // Close open dropdown menus on outside click or Escape
  useEffect(() => {
    if (!showTransportMenu && !showUserMenu) return;

    const handlePointerDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (showTransportMenu && transportMenuRef.current && !transportMenuRef.current.contains(target)) {
        setShowTransportMenu(false);
      }
      if (showUserMenu && userMenuRef.current && !userMenuRef.current.contains(target)) {
        setShowUserMenu(false);
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        setShowTransportMenu(false);
        setShowUserMenu(false);
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [showTransportMenu, showUserMenu]);

  const handleStartEditName = () => {
    cancelRenameRef.current = false;
    setProjectName(project.name || '');
    setIsEditingName(true);
  };

  const handleNameSubmit = () => {
    if (cancelRenameRef.current) {
      cancelRenameRef.current = false;
      setProjectName(project.name || '');
      setIsEditingName(false);
      return;
    }
    setIsEditingName(false);
    const trimmed = projectName.trim();
    if (trimmed && trimmed !== project.name) {
      onRenameProject(trimmed);
    } else {
      setProjectName(project.name || '');
    }
  };

  const displayName = project.name && project.name.trim() ? project.name : 'Untitled Project';
  const effectiveSaveState: SaveState = !isOnline ? 'offline' : saveState;
  const roleLabel = userRole === 'owner' ? 'Owner' : userRole === 'editor' ? 'Editor' : 'Viewer';

  return (
    <header className="h-13 border-b border-stone bg-parchment px-3 flex items-center justify-between select-none z-30 transition-colors duration-150 gap-2">
      {/* Left: Explorer Toggle, Brand, Project Name, Role Badge & Save-State Pill */}
      <div className="flex items-center gap-2 min-w-0 shrink">
        {onToggleSidebar && (
          <button
            type="button"
            onClick={onToggleSidebar}
            title={showSidebar ? 'Hide Explorer (Ctrl+B)' : 'Show Explorer (Ctrl+B)'}
            aria-label={showSidebar ? 'Hide Explorer Sidebar' : 'Show Explorer Sidebar'}
            aria-pressed={showSidebar}
            className={`p-1.5 rounded-md transition cursor-pointer shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber ${
              showSidebar ? 'text-ink bg-surface hover:bg-linen' : 'text-ash hover:text-ink hover:bg-linen'
            }`}
          >
            <PanelLeft className="w-4 h-4" />
          </button>
        )}

        <button
          type="button"
          onClick={onBackToDashboard}
          title="Back to Dashboard"
          aria-label="Back to Projects Dashboard"
          className="flex items-center gap-2 px-2 py-1 rounded-md hover:bg-linen text-ink transition group cursor-pointer shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink dark:focus-visible:ring-parchment"
        >
          <BrandMark className="w-6 h-6 text-ink shrink-0" />
          <span className="font-brand text-lg font-medium tracking-tight text-ink hidden sm:inline">
            Obsidian
          </span>
        </button>

        <span className="text-stone text-xs font-light shrink-0" aria-hidden="true">/</span>

        {isEditingName ? (
          <input
            type="text"
            value={projectName}
            onChange={(e) => setProjectName(e.target.value)}
            onBlur={handleNameSubmit}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleNameSubmit();
              } else if (e.key === 'Escape') {
                e.preventDefault();
                cancelRenameRef.current = true;
                setProjectName(project.name || '');
                setIsEditingName(false);
              }
            }}
            autoFocus
            aria-label="Project Name"
            className="input-atelier text-xs px-2 py-0.5 rounded-md min-w-[120px] max-w-[200px]"
          />
        ) : (
          <div className="flex items-center gap-2 min-w-0">
            {userRole === 'owner' ? (
              <button
                type="button"
                onClick={handleStartEditName}
                title="Click to rename"
                aria-label={`Rename project ${displayName}`}
                className="text-xs font-medium text-ink px-2 py-0.5 rounded-md hover:bg-linen transition flex items-center cursor-pointer truncate max-w-[130px] sm:max-w-[200px] md:max-w-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink dark:focus-visible:ring-parchment"
              >
                <span className="truncate">{displayName}</span>
              </button>
            ) : (
              <span className="text-xs font-medium text-ink px-2 py-0.5 cursor-default truncate max-w-[130px] sm:max-w-[200px] md:max-w-xs">
                {displayName}
              </span>
            )}

            <span className="tag-badge font-mono text-[10px] uppercase tracking-wider shrink-0">
              {roleLabel}
            </span>
          </div>
        )}

        {/* Save-State Indicator */}
        <div className="hidden sm:flex items-center gap-1.5 px-2 py-0.5 rounded-lg bg-surface border border-stone inset-glow text-micro font-mono shrink-0">
          {effectiveSaveState === 'saving' ? (
            <>
              <RotateCw className="w-3 h-3 animate-spin text-ash" />
              <span className="text-ash text-micro">Saving…</span>
            </>
          ) : effectiveSaveState === 'saved' ? (
            <>
              <Check className="w-3 h-3 text-verdant" />
              <span className="text-verdant text-micro">
                All changes saved · {formatSaveRelativeTime(lastSavedAt)}
              </span>
            </>
          ) : effectiveSaveState === 'offline' ? (
            <>
              <span className="w-1.5 h-1.5 rounded-full bg-warning-yellow" />
              <span className="text-warning-yellow text-micro">Saved locally · will sync</span>
            </>
          ) : (
            <>
              <span className="w-1.5 h-1.5 rounded-full bg-verdant" />
              <span className="text-verdant text-micro">Up to date</span>
            </>
          )}
        </div>
      </div>

      {/* Center: Run, Search, History, Export */}
      <div className="flex items-center gap-1 bg-surface border border-stone inset-glow p-0.5 rounded-lg shrink-0">
        <button
          type="button"
          onClick={onRunCode}
          disabled={isRunningCode || userRole === 'viewer'}
          title={userRole === 'viewer' ? 'Viewers cannot execute code' : 'Execute Code (Sandbox)'}
          aria-label={isRunningCode ? 'Running Code' : 'Execute Code (Sandbox)'}
          className="btn-amber text-xs py-1 px-3 rounded-md font-medium disabled:opacity-40 flex items-center gap-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber"
        >
          {isRunningCode ? (
            <RotateCw className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Play size={13} color="currentColor" strokeWidth={2} />
          )}
          <span>Run</span>
        </button>

        <div className="h-4 w-px bg-stone mx-0.5" aria-hidden="true" />

        <button
          type="button"
          onClick={onOpenSearch}
          title="Search in Project (Ctrl+Shift+F)"
          aria-label="Search in Project (Ctrl+Shift+F)"
          className="btn-ghost p-1.5 rounded-md text-ash hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber"
        >
          <Search size={15} />
        </button>

        <button
          type="button"
          onClick={onOpenHistory}
          title="Version History & Diff"
          aria-label="Version History & Diff"
          className="btn-ghost p-1.5 rounded-md text-ash hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber"
        >
          <History size={15} />
        </button>

        <button
          type="button"
          onClick={onExportZip}
          title="Export Workspace as ZIP"
          aria-label="Export Workspace as ZIP"
          className="btn-ghost p-1.5 rounded-md text-ash hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber"
        >
          <Download size={15} />
        </button>
      </div>

      {/* Right: Presence, Transport, Audio, Theme Toggle, Share, Profile */}
      <div className="flex items-center gap-2 shrink-0">
        {collaborators.length > 0 && (
          <div className="flex items-center -space-x-1 mr-0.5">
            {collaborators.map((c) => {
              const isSelf = c.id === user._id;
              const isFollowed = !isSelf && followingUserId === c.id;
              return (
                <button
                  key={c.id}
                  type="button"
                  disabled={isSelf}
                  onClick={() => {
                    if (!isSelf) onToggleFollow(c.id);
                  }}
                  title={
                    isSelf
                      ? `${c.name} (You · ${c.role})`
                      : `Collaborator: ${c.name} (${c.role})${isFollowed ? ' - Currently Following' : ' - Click to Follow'}`
                  }
                  aria-label={
                    isSelf
                      ? `${c.name} (You)`
                      : `Follow ${c.name} (${c.role})${isFollowed ? ' - Currently Following' : ''}`
                  }
                  aria-pressed={isSelf ? undefined : isFollowed}
                  className={`relative w-5 h-5 rounded-full border transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber ${
                    isSelf ? 'cursor-default opacity-90' : 'transform hover:scale-105 cursor-pointer'
                  } ${isFollowed ? 'border-amber ring-2 ring-amber/40' : 'border-stone'}`}
                  style={{ backgroundColor: c.color }}
                >
                  <span className="text-micro font-mono font-medium text-white flex items-center justify-center h-full">
                    {c.name.charAt(0).toUpperCase()}
                  </span>
                </button>
              );
            })}
          </div>
        )}

        {/* Transport Selector */}
        <div className="relative" ref={transportMenuRef}>
          <button
            type="button"
            onClick={() => {
              setShowUserMenu(false);
              setShowTransportMenu((prev) => !prev);
            }}
            aria-label="Select Transport Mode"
            aria-haspopup="true"
            aria-expanded={showTransportMenu}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-surface hover:bg-linen border border-stone inset-glow text-micro font-mono text-driftwood transition cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber"
          >
            {isOnline ? (
              <Wifi size={13} color="var(--color-verdant)" strokeWidth={2} />
            ) : (
              <WifiOff size={13} color="var(--color-warning-yellow)" strokeWidth={2} />
            )}
            <span className="font-mono text-micro hidden md:inline">{transportMode}</span>
            <ChevronDown size={11} className="text-ash" />
          </button>

          {showTransportMenu && (
            <div
              role="menu"
              aria-label="Transport modes"
              className="absolute right-0 top-full mt-1.5 w-44 rounded-xl bg-surface border border-stone inset-glow shadow-xl py-1 z-50 text-xs"
            >
              {TRANSPORT_MODES.map((mode) => (
                <button
                  key={mode}
                  type="button"
                  role="menuitemradio"
                  aria-checked={transportMode === mode}
                  onClick={() => {
                    onTransportChange(mode);
                    setShowTransportMenu(false);
                  }}
                  className={`w-full text-left px-3 py-1.5 flex items-center justify-between hover:bg-linen transition cursor-pointer ${
                    transportMode === mode ? 'text-ink font-medium' : 'text-driftwood'
                  }`}
                >
                  <span className="font-mono text-xs">{mode}</span>
                  {transportMode === mode && <Check size={13} />}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Audio Mute/Unmute */}
        <button
          type="button"
          onClick={onToggleAudio}
          title={isAudioMuted ? 'Unmute Sound Effects' : 'Mute Sound Effects'}
          aria-label={isAudioMuted ? 'Unmute Sound Effects' : 'Mute Sound Effects'}
          aria-pressed={isAudioMuted}
          className="btn-ghost p-1.5 rounded-md text-ash hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber"
        >
          {isAudioMuted ? (
            <VolumeMute size={15} strokeWidth={2} />
          ) : (
            <VolumeHigh size={15} strokeWidth={2} />
          )}
        </button>

        <div className="hidden">
          <ThemeToggle size={16} />
        </div>

        {/* Share Button */}
        <button
          type="button"
          onClick={onOpenShare}
          aria-label="Share workspace"
          className="btn-primary text-xs py-1 px-3 rounded-lg font-normal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber"
        >
          <Share size={13} color="currentColor" strokeWidth={2} />
          <span>Share</span>
        </button>

        {/* User Account Menu */}
        <div className="relative" ref={userMenuRef}>
          <button
            type="button"
            onClick={() => {
              setShowTransportMenu(false);
              setShowUserMenu((prev) => !prev);
            }}
            aria-label="User Account Menu"
            aria-haspopup="true"
            aria-expanded={showUserMenu}
            className="w-6 h-6 rounded-full overflow-hidden border border-(--border-subtle) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink dark:focus-visible:ring-parchment hover:border-(--border-active) transition cursor-pointer"
          >
            <img
              src={user.avatar || `https://api.dicebear.com/7.x/identicon/svg?seed=${encodeURIComponent(user.name)}`}
              alt={user.name}
              className="w-full h-full object-cover"
            />
          </button>

          {showUserMenu && (
            <div
              role="menu"
              aria-label="User account actions"
              className="absolute right-0 top-full mt-1.5 w-48 rounded-lg bg-bone border border-(--border-subtle) shadow-xl py-1 z-50 text-xs"
            >
              <div className="px-3 py-2 border-b border-(--border-subtle)">
                <p className="font-medium text-ink truncate">{user.name}</p>
                <p className="font-mono text-micro text-ash truncate">{user.email}</p>
              </div>
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setShowUserMenu(false);
                  onBackToDashboard();
                }}
                className="w-full text-left px-3 py-2 text-driftwood hover:text-ink hover:bg-linen flex items-center gap-2 transition cursor-pointer"
              >
                <FolderOpen size={14} className="text-ash" />
                <span>Projects Dashboard</span>
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setShowUserMenu(false);
                  try {
                    Object.keys(localStorage).forEach((key) => {
                      if (key.startsWith('obsidian.layout.')) {
                        localStorage.removeItem(key);
                      }
                    });
                  } catch {}
                  window.location.reload();
                }}
                className="w-full text-left px-3 py-2 text-driftwood hover:text-ink hover:bg-linen flex items-center gap-2 border-b border-(--border-subtle) transition cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5 text-ash" />
                <span>Reset Layout</span>
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setShowUserMenu(false);
                  onLogout();
                }}
                className="w-full text-left px-3 py-2 text-crimson hover:bg-linen flex items-center gap-2 transition cursor-pointer"
              >
                <LogOut size={14} />
                <span>Log out</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};
