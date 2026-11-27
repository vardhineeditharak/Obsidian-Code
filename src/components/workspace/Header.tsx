import React, { useState, useEffect, useRef } from 'react';
import { RotateCw, RotateCcw, PanelLeft } from 'lucide-react';
import { Project, ProjectRole, TransportMode, CollaboratorPresence, User, SaveState } from '../../lib/types';
import { BrandMark } from '../ui/BrandMark';
import {
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

  const visibleCollaborators = collaborators.slice(0, 4);
  const overflowCollaborators = Math.max(0, collaborators.length - visibleCollaborators.length);

  return (
    <header className="h-12 apple-glass-header border-b border-(--border-subtle) px-3 flex items-center justify-between select-none z-40 transition-colors duration-150 gap-2">
      {/* Left: Explorer Toggle, Brand, Project Name, Role Badge & Save-State Pill */}
      <div className="flex items-center gap-2 min-w-0 shrink">
        {onToggleSidebar && (
          <button
            type="button"
            onClick={onToggleSidebar}
            title={showSidebar ? 'Hide Explorer (Ctrl+B)' : 'Show Explorer (Ctrl+B)'}
            aria-label={showSidebar ? 'Hide Explorer Sidebar' : 'Show Explorer Sidebar'}
            aria-pressed={showSidebar}
            className={`w-7 h-7 flex items-center justify-center rounded-[7px] transition cursor-pointer shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber ${
              showSidebar ? 'text-ink bg-white/[0.08] hover:bg-white/[0.12]' : 'text-ash hover:text-ink hover:bg-white/[0.07]'
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
          className="flex items-center gap-2 px-2 h-7 rounded-[7px] hover:bg-white/[0.07] text-ink transition group cursor-pointer shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber"
        >
          <BrandMark className="w-5 h-5 text-ink shrink-0" />
          <span className="font-brand text-[14.5px] font-semibold tracking-[-0.02em] text-ink hidden sm:inline">
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
            className="input-atelier min-h-0 h-7 text-xs px-2 py-0.5 rounded-md min-w-[120px] max-w-[200px]"
          />
        ) : (
          <div className="flex items-center gap-2 min-w-0">
            {userRole === 'owner' ? (
              <button
                type="button"
                onClick={handleStartEditName}
                title="Click to rename"
                aria-label={`Rename project ${displayName}`}
                className="text-xs font-medium text-ink px-2 py-0.5 rounded-md hover:bg-linen transition flex items-center cursor-pointer truncate max-w-[100px] sm:max-w-[180px] md:max-w-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber"
              >
                <span className="truncate">{displayName}</span>
              </button>
            ) : (
              <span className="text-[13px] font-medium tracking-[-0.01em] text-ink px-2 py-0.5 cursor-default truncate max-w-[100px] sm:max-w-[180px] md:max-w-xs">
                {displayName}
              </span>
            )}

            <span className="tag-badge hidden sm:inline-flex font-sans text-[10.5px] font-medium uppercase tracking-[0.04em] shrink-0">
              {roleLabel}
            </span>
          </div>
        )}

        {/* Save-State Indicator */}
        <div className="hidden lg:flex items-center gap-1.5 h-7 px-2.5 rounded-full bg-white/[0.03] border border-white/[0.08] text-[11.5px] font-sans tabular-nums shrink-0">
          {effectiveSaveState === 'saving' ? (
            <>
              <RotateCw className="w-3 h-3 animate-spin text-ash" />
              <span className="text-ash text-[11.5px]">Saving…</span>
            </>
          ) : effectiveSaveState === 'saved' ? (
            <>
              <Check className="w-3 h-3 text-verdant" />
              <span className="text-verdant text-[11.5px]">
                All changes saved · {formatSaveRelativeTime(lastSavedAt)}
              </span>
            </>
          ) : effectiveSaveState === 'offline' ? (
            <>
              <span className="w-1.5 h-1.5 rounded-full bg-warning-yellow" />
              <span className="text-warning-yellow text-[11.5px]">Saved locally · will sync</span>
            </>
          ) : (
            <>
              <span className="w-1.5 h-1.5 rounded-full bg-verdant" />
              <span className="text-verdant text-[11.5px]">Up to date</span>
            </>
          )}
        </div>
      </div>

      {/* Center: Run, Search, History, Export */}
      <div className="flex items-center gap-0.5 apple-segmented p-0.5 rounded-[9px] shrink-0">
        <button
          type="button"
          onClick={onRunCode}
          disabled={isRunningCode || userRole === 'viewer'}
          title={userRole === 'viewer' ? 'Viewers cannot execute code' : 'Execute Code (Sandbox)'}
          aria-label={isRunningCode ? 'Running Code' : 'Execute Code (Sandbox)'}
          className="btn-amber h-[26px] px-2.5 rounded-[6.5px] text-[12px] font-medium disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber"
        >
          {isRunningCode ? (
            <RotateCw className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Play size={13} color="currentColor" strokeWidth={2} />
          )}
          <span>Run</span>
        </button>

        <div className="h-3.5 w-px bg-white/10 mx-0.5" aria-hidden="true" />

        <button
          type="button"
          onClick={onOpenSearch}
          title="Search in Project (Ctrl+Shift+F)"
          aria-label="Search in Project (Ctrl+Shift+F)"
          className="btn-ghost w-7 h-[26px] justify-center rounded-[6.5px] text-ash hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber"
        >
          <Search size={14} />
        </button>

        <button
          type="button"
          onClick={onOpenHistory}
          title="Version History & Diff"
          aria-label="Version History & Diff"
          className="btn-ghost w-7 h-[26px] justify-center rounded-[6.5px] text-ash hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber"
        >
          <History size={14} />
        </button>

        <button
          type="button"
          onClick={onExportZip}
          title="Export Workspace as ZIP"
          aria-label="Export Workspace as ZIP"
          className="btn-ghost w-7 h-[26px] justify-center rounded-[6.5px] text-ash hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber"
        >
          <Download size={14} />
        </button>
      </div>

      {/* Right: Presence, Transport, Audio, Theme Toggle, Share, Profile */}
      <div className="flex items-center gap-2 shrink-0">
        {visibleCollaborators.length > 0 && (
          <div className="flex items-center -space-x-1 mr-0.5">
            {visibleCollaborators.map((c) => {
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
                  className={`relative w-6 h-6 rounded-full border transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber ${
                    isSelf ? 'cursor-default opacity-90' : 'transform hover:scale-105 cursor-pointer'
                  } ${isFollowed ? 'border-amber ring-2 ring-amber/40' : 'border-stone'}`}
                  style={{ backgroundColor: c.color }}
                >
                  <span className="text-[11px] font-sans font-semibold text-white flex items-center justify-center h-full">
                    {c.name.charAt(0).toUpperCase()}
                  </span>
                </button>
              );
            })}
            {overflowCollaborators > 0 && (
              <span
                title={`${overflowCollaborators} more collaborator${overflowCollaborators === 1 ? '' : 's'}`}
                className="relative w-6 h-6 rounded-full border border-stone bg-linen text-[10px] font-sans font-semibold text-driftwood flex items-center justify-center tabular-nums"
              >
                +{overflowCollaborators}
              </span>
            )}
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
            className="flex items-center gap-1.5 h-7 px-2.5 rounded-lg bg-white/[0.035] hover:bg-white/[0.075] border border-white/[0.09] text-[11.5px] font-sans font-medium text-driftwood transition cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber"
          >
            {isOnline ? (
              <Wifi size={13} color="var(--color-verdant)" strokeWidth={2} />
            ) : (
              <WifiOff size={13} color="var(--color-warning-yellow)" strokeWidth={2} />
            )}
            <span className="font-sans text-[11.5px] hidden md:inline">{transportMode}</span>
            <ChevronDown size={11} className="text-ash" />
          </button>

          {showTransportMenu && (
            <div
              role="menu"
              aria-label="Transport modes"
              className="absolute right-0 top-full mt-1.5 w-46 rounded-xl apple-popover p-1 z-50 text-[12.5px] modal-dialog"
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
                  className={`w-full text-left px-2.5 py-1.5 rounded-[7px] flex items-center justify-between hover:bg-white/[0.08] transition cursor-pointer ${
                    transportMode === mode ? 'text-ink font-medium' : 'text-driftwood'
                  }`}
                >
                  <span className="font-sans text-[12.5px]">{mode}</span>
                  {transportMode === mode && <Check size={13} className="text-amber" />}
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
          className="btn-ghost w-7 h-7 justify-center rounded-[7px] text-ash hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber"
        >
          {isAudioMuted ? (
            <VolumeMute size={14} strokeWidth={2} />
          ) : (
            <VolumeHigh size={14} strokeWidth={2} />
          )}
        </button>


        {/* Share Button */}
        <button
          type="button"
          onClick={onOpenShare}
          aria-label="Share workspace"
          className="btn-primary min-h-0 h-7 px-2.5 sm:px-3 rounded-[7px] text-[12px] font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber"
        >
          <Share size={12.5} color="currentColor" strokeWidth={2} />
          <span className="hidden sm:inline">Share</span>
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
            className="w-7 h-7 rounded-full overflow-hidden border border-white/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber hover:border-white/30 transition cursor-pointer"
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
              className="absolute right-0 top-full mt-1.5 w-52 rounded-xl apple-popover p-1 z-50 text-[12.5px] modal-dialog"
            >
              <div className="px-2.5 py-2 border-b border-(--border-subtle) mb-1">
                <p className="font-medium text-ink truncate text-[12.5px]">{user.name}</p>
                <p className="font-sans text-[11px] text-ash truncate">{user.email}</p>
              </div>
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setShowUserMenu(false);
                  onBackToDashboard();
                }}
                className="w-full text-left px-2.5 py-1.5 rounded-[7px] text-driftwood hover:text-ink hover:bg-white/[0.08] flex items-center gap-2 transition cursor-pointer"
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
                className="w-full text-left px-2.5 py-1.5 rounded-[7px] text-driftwood hover:text-ink hover:bg-white/[0.08] flex items-center gap-2 transition cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5 text-ash" />
                <span>Reset Layout</span>
              </button>
              <div className="my-1 border-t border-(--border-subtle)" />
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setShowUserMenu(false);
                  onLogout();
                }}
                className="w-full text-left px-2.5 py-1.5 rounded-[7px] text-crimson hover:bg-crimson/10 flex items-center gap-2 transition cursor-pointer"
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
