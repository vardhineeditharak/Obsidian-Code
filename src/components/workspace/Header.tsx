import React, { useState } from 'react';
import { Project, ProjectRole, TransportMode, CollaboratorPresence, User } from '../../lib/types';
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

interface HeaderProps {
  project: Project;
  user: User;
  userRole: ProjectRole;
  isOnline: boolean;
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

export const Header: React.FC<HeaderProps> = ({
  project,
  user,
  userRole,
  isOnline,
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
  const [projectName, setProjectName] = useState(project.name);
  const [showTransportMenu, setShowTransportMenu] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);

  const handleNameSubmit = () => {
    setIsEditingName(false);
    if (projectName.trim() && projectName !== project.name) {
      onRenameProject(projectName.trim());
    } else {
      setProjectName(project.name);
    }
  };

  return (
    <header className="h-13 border-b border-stone bg-parchment px-3 flex items-center justify-between select-none z-30 transition-colors duration-150">
      {/* Left: Brand, Project Name & Sync Pill */}
      <div className="flex items-center gap-2">
        <button
          onClick={onBackToDashboard}
          title="Back to Dashboard"
          className="flex items-center gap-2 px-2 py-1 rounded hover:bg-linen text-ink transition group cursor-pointer"
        >
          <img
            src="/logo.svg"
            alt="Obsidian Code"
            className="w-6 h-6 object-contain dark:invert"
          />
          <span className="font-brand text-lg font-medium tracking-tight text-ink">
            Obsidian
          </span>
        </button>

        <span className="text-stone text-xs font-light">/</span>

        {/* Inline editable project name */}
        {isEditingName ? (
          <input
            type="text"
            value={projectName}
            onChange={(e) => setProjectName(e.target.value)}
            onBlur={handleNameSubmit}
            onKeyDown={(e) => e.key === 'Enter' && handleNameSubmit()}
            autoFocus
            className="input-atelier text-xs px-2 py-0.5 rounded"
          />
        ) : (
          <button
            onClick={() => userRole === 'owner' && setIsEditingName(true)}
            title={userRole === 'owner' ? 'Click to rename' : undefined}
            className={`text-xs font-medium text-ink px-2 py-0.5 rounded hover:bg-linen transition flex items-center gap-1.5 ${
              userRole === 'owner' ? 'cursor-pointer' : 'cursor-default'
            }`}
          >
            <span>{project.name}</span>
            <span className="font-mono text-[10px] text-ash">
              {userRole === 'owner' ? '(Owner)' : `(${userRole})`}
            </span>
          </button>
        )}

        {/* Sync Indicator */}
        <div className="flex items-center gap-1.5 px-2 py-0.5 rounded bg-bone border border-(--border-subtle) text-[11px] font-mono">
          <span
            className={`w-1.5 h-1.5 rounded-full ${
              isOnline ? 'bg-verdant' : 'bg-amber'
            }`}
          />
          <span className={isOnline ? 'text-verdant text-[10px]' : 'text-amber text-[10px]'}>
            {isOnline ? 'Synced' : 'Offline'}
          </span>
        </div>
      </div>

      {/* Center: Action Controls (Run Code, Search, Version Diff, Export) */}
      <div className="flex items-center gap-1">
        <button
          onClick={onRunCode}
          disabled={isRunningCode || userRole === 'viewer'}
          title={userRole === 'viewer' ? 'Viewers cannot execute code' : 'Execute Code (Sandbox)'}
          className="btn-amber text-xs py-1 px-3 rounded font-medium disabled:opacity-40"
        >
          {isRunningCode ? (
            <RotateCw className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Play size={13} color="currentColor" strokeWidth={2} />
          )}
          <span>Run</span>
        </button>

        <button
          onClick={onOpenSearch}
          title="Search in Project (Ctrl+Shift+F)"
          className="btn-ghost p-1.5 rounded text-ash hover:text-ink"
        >
          <Search size={15} />
        </button>

        <button
          onClick={onOpenHistory}
          title="Version History & Diff"
          className="btn-ghost p-1.5 rounded text-ash hover:text-ink"
        >
          <History size={15} />
        </button>

        <button
          onClick={onExportZip}
          title="Export Workspace as ZIP"
          className="btn-ghost p-1.5 rounded text-ash hover:text-ink"
        >
          <Download size={15} />
        </button>
      </div>

      {/* Right: Presence, Transport, Audio, Theme Toggle, Share, Profile */}
      <div className="flex items-center gap-2">
        {/* Collaborator Avatars & Follow Mode */}
        <div className="flex items-center -space-x-1 mr-0.5">
          {collaborators.map((c) => {
            const isFollowed = followingUserId === c.id;
            return (
              <button
                key={c.id}
                onClick={() => onToggleFollow(c.id)}
                title={`Collaborator: ${c.name} (${c.role})${isFollowed ? ' - Currently Following' : ' - Click to Follow'}`}
                className={`relative w-5 h-5 rounded border transition transform hover:scale-105 ${
                  isFollowed ? 'border-amber ring-2 ring-amber/40' : 'border-parchment'
                }`}
                style={{ backgroundColor: c.color }}
              >
                <span className="text-[10px] font-mono font-medium text-white flex items-center justify-center h-full">
                  {c.name.charAt(0).toUpperCase()}
                </span>
              </button>
            );
          })}
        </div>

        {/* Transport Selector */}
        <div className="relative">
          <button
            onClick={() => setShowTransportMenu(!showTransportMenu)}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-bone hover:bg-linen border border-(--border-subtle) text-[11px] font-mono text-driftwood transition cursor-pointer"
          >
            {isOnline ? (
              <Wifi size={13} color="var(--color-verdant)" strokeWidth={2} />
            ) : (
              <WifiOff size={13} color="var(--color-amber)" strokeWidth={2} />
            )}
            <span className="font-mono text-[10px]">{transportMode}</span>
            <ChevronDown size={11} className="text-ash" />
          </button>

          {showTransportMenu && (
            <div className="absolute right-0 top-full mt-1.5 w-44 rounded bg-bone border border-(--border-subtle) shadow-xl py-1 z-50 text-xs">
              {(['Hybrid', 'WebSocket Only', 'P2P Mesh Only'] as TransportMode[]).map((mode) => (
                <button
                  key={mode}
                  onClick={() => {
                    onTransportChange(mode);
                    setShowTransportMenu(false);
                  }}
                  className={`w-full text-left px-3 py-1.5 flex items-center justify-between hover:bg-linen transition ${
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

        {/* User Role Badge */}
        <div className="px-2 py-0.5 rounded border border-(--border-subtle) bg-bone text-ash text-[10px] font-mono capitalize select-none">
          {userRole}
        </div>

        {/* Audio Mute/Unmute */}
        <button
          onClick={onToggleAudio}
          title={isAudioMuted ? 'Unmute Sound Effects' : 'Mute Sound Effects'}
          className="btn-ghost p-1.5 rounded text-ash hover:text-ink"
        >
          {isAudioMuted ? (
            <VolumeMute size={15} strokeWidth={2} />
          ) : (
            <VolumeHigh size={15} strokeWidth={2} />
          )}
        </button>

        {/* Light / Dark Mode Toggle using Morphicons */}
        <ThemeToggle size={16} />

        {/* Share Button */}
        <button
          onClick={onOpenShare}
          className="btn-primary text-xs py-1 px-3 rounded font-normal"
        >
          <Share size={13} color="currentColor" strokeWidth={2} />
          <span>Share</span>
        </button>

        {/* User Avatar Menu */}
        <div className="relative">
          <button
            onClick={() => setShowUserMenu(!showUserMenu)}
            className="w-6 h-6 rounded overflow-hidden border border-(--border-subtle) focus:outline-none hover:border-(--border-active) transition cursor-pointer"
          >
            <img
              src={user.avatar || `https://api.dicebear.com/7.x/identicon/svg?seed=${user.name}`}
              alt={user.name}
              className="w-full h-full object-cover"
            />
          </button>

          {showUserMenu && (
            <div className="absolute right-0 top-full mt-1.5 w-48 rounded bg-bone border border-(--border-subtle) shadow-xl py-1 z-50 text-xs">
              <div className="px-3 py-2 border-b border-(--border-subtle)">
                <p className="font-medium text-ink">{user.name}</p>
                <p className="font-mono text-[11px] text-ash truncate">{user.email}</p>
              </div>
              <button
                onClick={() => {
                  setShowUserMenu(false);
                  onBackToDashboard();
                }}
                className="w-full text-left px-3 py-2 text-driftwood hover:text-ink hover:bg-linen flex items-center gap-2 transition"
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
                className="w-full text-left px-3 py-2 text-driftwood hover:text-ink hover:bg-linen flex items-center gap-2 border-b border-(--border-subtle) transition"
              >
                <RotateCcw className="w-3.5 h-3.5 text-ash" />
                <span>Reset Layout</span>
              </button>
              <button
                onClick={() => {
                  setShowUserMenu(false);
                  onLogout();
                }}
                className="w-full text-left px-3 py-2 text-crimson hover:bg-linen flex items-center gap-2 transition"
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
