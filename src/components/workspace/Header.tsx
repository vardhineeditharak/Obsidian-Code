import React, { useState, useEffect } from 'react';
import { Project, ProjectRole, TransportMode, CollaboratorPresence, User, SaveState } from '../../lib/types';
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
import { RotateCw, RotateCcw } from 'lucide-react';
import { notify } from '../../lib/notifications';
import { BrandMark } from '../ui/BrandMark';

interface HeaderProps {
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
}

function formatSaveRelativeTime(timestamp: number | null | undefined): string {
  if (!timestamp) return 'just now';
  const diffSec = Math.floor((Date.now() - timestamp) / 1000);
  if (diffSec < 10) return 'just now';
  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  return `${Math.floor(diffMin / 60)}h ago`;
}

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
}) => {
  const [isEditingName, setIsEditingName] = useState(false);
  const [projectName, setProjectName] = useState(project.name || '');
  const [showTransportMenu, setShowTransportMenu] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);

  // Sync internal edit buffer when incoming project.name changes
  useEffect(() => {
    setProjectName(project?.name || '');
  }, [project?.name]);

  const handleNameSubmit = () => {
    setIsEditingName(false);
    const trimmed = projectName.trim();
    if (trimmed && trimmed !== project.name) {
      onRenameProject(trimmed);
    } else {
      setProjectName(project.name || '');
    }
  };

  const displayName = project.name && project.name.trim() ? project.name : 'Untitled Project';
  const effectiveSaveState = !isOnline ? 'offline' : saveState;
  const isMacDesktop = typeof window !== 'undefined' && window.obsidianDesktop?.platform === 'darwin';
  const isDesktop = typeof window !== 'undefined' && Boolean(window.obsidianDesktop?.isDesktop);

  return (
    <header className={`h-12 border-b border-stone bg-parchment/95 backdrop-blur-md px-3.5 flex items-center justify-between select-none z-30 transition-colors duration-150 gap-2 ${isDesktop ? 'app-drag-region' : ''} ${isMacDesktop ? 'pl-20' : ''}`}>
      {/* Left: Brand, Project Name & Sync Pill */}
      <div className="flex items-center gap-2.5 min-w-0 shrink app-no-drag">
        <button
          onClick={onBackToDashboard}
          title="Back to Dashboard"
          aria-label="Back to Projects Dashboard"
          className="flex items-center gap-2 px-1.5 py-1 rounded-md hover:bg-linen/80 text-ink transition group cursor-pointer shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber active:scale-[0.97]"
        >
          <BrandMark className="w-5.5 h-5.5 text-ink shrink-0 group-hover:scale-105 transition-transform" />
          <span className="font-brand text-[15px] font-semibold tracking-tight text-ink hidden sm:inline">
            Obsidian
          </span>
        </button>

        <span className="text-mist text-xs font-light shrink-0">/</span>

        {/* Project name with 'Untitled Project' fallback and separate role badge */}
        {isEditingName ? (
          <input
            type="text"
            value={projectName}
            onChange={(e) => setProjectName(e.target.value)}
            onBlur={handleNameSubmit}
            onKeyDown={(e) => e.key === 'Enter' && handleNameSubmit()}
            autoFocus
            aria-label="Project Name"
            className="input-atelier text-xs px-2 py-0.5 rounded-md min-w-[120px] max-w-[200px]"
          />
        ) : (
          <div className="flex items-center gap-2 min-w-0">
            {userRole === 'owner' ? (
              <button
                onClick={() => setIsEditingName(true)}
                title="Click to rename"
                aria-label={`Rename project ${displayName}`}
                className="text-xs font-medium text-ink px-2 py-0.5 rounded-md hover:bg-linen/80 transition flex items-center cursor-pointer truncate max-w-[130px] sm:max-w-[200px] md:max-w-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber active:scale-[0.98]"
              >
                <span className="truncate">{displayName}</span>
              </button>
            ) : (
              <span className="text-xs font-medium text-ink px-2 py-0.5 cursor-default truncate max-w-[130px] sm:max-w-[200px] md:max-w-xs">
                {displayName}
              </span>
            )}

            {/* Clearly secondary, visually separated role badge pill */}
            <span className="tag-badge font-mono text-[10px] uppercase tracking-wider shrink-0">
              {userRole === 'owner' ? 'Owner' : userRole === 'editor' ? 'Editor' : 'Viewer'}
            </span>
          </div>
        )}

        {/* Google Docs-style Save-State Indicator */}
        <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-bone/80 border border-stone/80 inset-glow text-micro font-mono shrink-0 shadow-2xs">
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
              <span className="w-1.5 h-1.5 rounded-full bg-verdant animate-pulse" />
              <span className="text-verdant text-micro">Up to date</span>
            </>
          )}
        </div>
      </div>

      {/* Center: Action Controls (Run Code, Search, Version Diff, Export) */}
      <div className="flex items-center gap-0.5 bg-bone/90 border border-stone/90 inset-glow p-0.5 rounded-lg shrink-0 shadow-2xs">
        <button
          onClick={onRunCode}
          disabled={isRunningCode || userRole === 'viewer'}
          title={userRole === 'viewer' ? 'Viewers cannot execute code' : 'Execute Code (Sandbox) · Ctrl+Enter'}
          aria-label={isRunningCode ? 'Running Code' : 'Execute Code (Sandbox)'}
          className="btn-amber text-xs py-1 px-3.5 rounded-md font-medium disabled:opacity-40 flex items-center gap-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber shadow-xs"
        >
          {isRunningCode ? (
            <RotateCw className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Play size={13} color="currentColor" strokeWidth={2.2} />
          )}
          <span>Run</span>
        </button>

        <div className="h-4 w-px bg-stone mx-0.5" aria-hidden="true" />

        <button
          onClick={onOpenSearch}
          title="Search in Project (Ctrl+Shift+F)"
          aria-label="Search in Project (Ctrl+Shift+F)"
          className="btn-ghost p-1.5 rounded-md text-driftwood hover:text-ink hover:bg-linen/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber"
        >
          <Search size={14} />
        </button>

        <button
          onClick={onOpenHistory}
          title="Version History & Diff"
          aria-label="Version History & Diff"
          className="btn-ghost p-1.5 rounded-md text-driftwood hover:text-ink hover:bg-linen/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber"
        >
          <History size={14} />
        </button>

        <button
          onClick={onExportZip}
          title="Export Workspace as ZIP"
          aria-label="Export Workspace as ZIP"
          className="btn-ghost p-1.5 rounded-md text-driftwood hover:text-ink hover:bg-linen/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber"
        >
          <Download size={14} />
        </button>
      </div>

      {/* Right: Presence, Transport, Audio, Theme Toggle, Share, Profile */}
      <div className="flex items-center gap-2 shrink-0 app-no-drag">
        {/* Collaborator Avatars & Follow Mode */}
        {collaborators.length > 0 && (
          <div className="flex items-center -space-x-1 mr-0.5">
            {collaborators.map((c) => {
              const isFollowed = followingUserId === c.id;
              return (
                <button
                  key={c.id}
                  onClick={() => onToggleFollow(c.id)}
                  title={`Collaborator: ${c.name} (${c.role})${isFollowed ? ' - Currently Following' : ' - Click to Follow'}`}
                  aria-label={`Follow ${c.name} (${c.role})${isFollowed ? ' - Currently Following' : ''}`}
                  className={`relative w-5 h-5 rounded-full border transition transform hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber ${
                    isFollowed ? 'border-amber ring-2 ring-amber/40' : 'border-stone'
                  }`}
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
        <div className="relative">
          <button
            onClick={() => setShowTransportMenu(!showTransportMenu)}
            aria-label="Select Transport Mode"
            aria-haspopup="true"
            aria-expanded={showTransportMenu}
            className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-bone/80 hover:bg-linen border border-stone/80 inset-glow text-micro font-mono text-driftwood transition cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber active:scale-[0.97]"
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
            <div className="absolute right-0 top-full mt-1.5 w-44 rounded-xl bg-surface border border-stone inset-glow shadow-xl py-1 z-50 text-xs">
              {(['Hybrid', 'WebSocket Only', 'P2P Mesh Only'] as TransportMode[]).map((mode) => (
                <button
                  key={mode}
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
          onClick={onToggleAudio}
          title={isAudioMuted ? 'Unmute Sound Effects' : 'Mute Sound Effects'}
          aria-label={isAudioMuted ? 'Unmute Sound Effects' : 'Mute Sound Effects'}
          className="btn-ghost p-1.5 rounded-md text-driftwood hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber active:scale-[0.95]"
        >
          {isAudioMuted ? (
            <VolumeMute size={14} strokeWidth={2} />
          ) : (
            <VolumeHigh size={14} strokeWidth={2} />
          )}
        </button>

        {/* Theme Toggle hidden in dark-only mode */}
        <div className="hidden">
          <ThemeToggle size={16} />
        </div>

        {/* Share Button */}
        <button
          onClick={onOpenShare}
          aria-label="Share workspace"
          className="btn-primary text-xs py-1 px-3.5 rounded-md font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber active:scale-[0.97]"
        >
          <Share size={12} color="currentColor" strokeWidth={2.2} />
          <span>Share</span>
        </button>

        {/* User Avatar Menu */}
        <div className="relative">
          <button
            onClick={() => setShowUserMenu(!showUserMenu)}
            aria-label="User Account Menu"
            aria-haspopup="true"
            aria-expanded={showUserMenu}
            className="w-6.5 h-6.5 rounded-full overflow-hidden ring-1 ring-stone/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber hover:ring-amber/50 transition cursor-pointer active:scale-[0.95]"
          >
            <img
              src={user.avatar || `https://api.dicebear.com/7.x/identicon/svg?seed=${user.name}`}
              alt={user.name}
              className="w-full h-full object-cover"
            />
          </button>

          {showUserMenu && (
            <div className="absolute right-0 top-full mt-1.5 w-48 rounded-lg bg-bone border border-(--border-subtle) shadow-xl py-1 z-50 text-xs">
              <div className="px-3 py-2 border-b border-(--border-subtle)">
                <p className="font-medium text-ink">{user.name}</p>
                <p className="font-mono text-micro text-ash truncate">{user.email}</p>
              </div>
              <button
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
