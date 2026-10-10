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
    <header className="h-11 border-b border-black/[0.06] dark:border-white/[0.08] bg-white/75 dark:bg-slate-900/80 backdrop-blur-xl px-3 flex items-center justify-between select-none z-30 transition-colors duration-200">
      {/* Left: Brand, Project Name & Sync Pill */}
      <div className="flex items-center gap-2.5">
        <button
          onClick={onBackToDashboard}
          title="Back to Dashboard"
          className="flex items-center gap-2 px-2 py-1 rounded-lg hover:bg-black/[0.04] dark:hover:bg-white/[0.06] text-slate-700 dark:text-slate-200 active:scale-95 transition-all group"
        >
          <div className="w-5 h-5 rounded-md bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-xs">
            <span className="text-white font-bold text-[11px] leading-none">O</span>
          </div>
          <span className="text-xs font-semibold tracking-tight text-slate-800 dark:text-slate-200 group-hover:text-black dark:group-hover:text-white">
            Obsidian
          </span>
        </button>

        <span className="text-slate-300 dark:text-slate-700 text-xs font-light">/</span>

        {/* Inline editable project name */}
        {isEditingName ? (
          <input
            type="text"
            value={projectName}
            onChange={(e) => setProjectName(e.target.value)}
            onBlur={handleNameSubmit}
            onKeyDown={(e) => e.key === 'Enter' && handleNameSubmit()}
            autoFocus
            className="bg-black/[0.04] dark:bg-white/[0.06] text-slate-900 dark:text-slate-100 text-xs px-2 py-0.5 rounded-md border border-blue-500 focus:outline-none"
          />
        ) : (
          <button
            onClick={() => userRole === 'owner' && setIsEditingName(true)}
            title={userRole === 'owner' ? 'Click to rename' : undefined}
            className={`text-xs font-medium text-slate-800 dark:text-slate-200 px-2 py-0.5 rounded-md hover:bg-black/[0.04] dark:hover:bg-white/[0.06] transition flex items-center gap-1.5 ${
              userRole === 'owner' ? 'cursor-pointer' : 'cursor-default'
            }`}
          >
            <span>{project.name}</span>
            <span className="text-[10px] text-slate-400 dark:text-slate-500 font-normal">
              {userRole === 'owner' ? '(Owner)' : `(${userRole})`}
            </span>
          </button>
        )}

        {/* Sync Pill Indicator */}
        <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-black/[0.03] dark:bg-white/[0.05] border border-black/[0.04] dark:border-white/[0.06] text-[11px]">
          <span
            className={`w-1.5 h-1.5 rounded-full ${
              isOnline ? 'bg-emerald-500 dark:bg-emerald-400 animate-pulse' : 'bg-amber-500 dark:bg-amber-400'
            }`}
          />
          <span className="text-slate-500 dark:text-slate-400 text-[10px] font-medium">
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
          className="flex items-center gap-1.5 px-3 py-1 bg-emerald-600 hover:bg-emerald-500 active:scale-[0.98] disabled:opacity-40 text-white rounded-full text-xs font-medium transition shadow-xs cursor-pointer mr-1"
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
          className="p-1.5 rounded-full text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100 hover:bg-black/[0.05] dark:hover:bg-white/[0.08] active:scale-95 transition cursor-pointer"
        >
          <Search size={15} />
        </button>

        <button
          onClick={onOpenHistory}
          title="Version History & Diff"
          className="p-1.5 rounded-full text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100 hover:bg-black/[0.05] dark:hover:bg-white/[0.08] active:scale-95 transition cursor-pointer"
        >
          <History size={15} />
        </button>

        <button
          onClick={onExportZip}
          title="Export Workspace as ZIP"
          className="p-1.5 rounded-full text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100 hover:bg-black/[0.05] dark:hover:bg-white/[0.08] active:scale-95 transition cursor-pointer"
        >
          <Download size={15} />
        </button>
      </div>

      {/* Right: Presence, Transport, Audio, Theme Toggle, Share, Profile */}
      <div className="flex items-center gap-2">
        {/* Collaborator Avatars & Follow Mode */}
        <div className="flex items-center -space-x-1.5 mr-0.5">
          {collaborators.map((c) => {
            const isFollowed = followingUserId === c.id;
            return (
              <button
                key={c.id}
                onClick={() => onToggleFollow(c.id)}
                title={`Collaborator: ${c.name} (${c.role})${isFollowed ? ' - Currently Following' : ' - Click to Follow'}`}
                className={`relative w-6 h-6 rounded-full border-2 transition transform hover:scale-110 ${
                  isFollowed ? 'border-amber-400 ring-2 ring-amber-400/50' : 'border-white dark:border-slate-800'
                }`}
                style={{ backgroundColor: c.color }}
              >
                <span className="text-[10px] font-bold text-white flex items-center justify-center h-full">
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
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-black/[0.03] dark:bg-white/[0.05] hover:bg-black/[0.06] dark:hover:bg-white/[0.08] border border-black/[0.04] dark:border-white/[0.06] text-[11px] text-slate-600 dark:text-slate-300 transition cursor-pointer"
          >
            {isOnline ? (
              <Wifi size={13} color="#0284C7" strokeWidth={2} />
            ) : (
              <WifiOff size={13} color="#D97706" strokeWidth={2} />
            )}
            <span className="font-medium text-[10px]">{transportMode}</span>
            <ChevronDown size={11} className="text-slate-400" />
          </button>

          {showTransportMenu && (
            <div className="absolute right-0 top-full mt-1.5 w-44 rounded-xl bg-white dark:bg-slate-900 border border-black/[0.08] dark:border-white/[0.1] shadow-xl py-1 z-50 text-xs backdrop-blur-xl">
              {(['Hybrid', 'WebSocket Only', 'P2P Mesh Only'] as TransportMode[]).map((mode) => (
                <button
                  key={mode}
                  onClick={() => {
                    onTransportChange(mode);
                    setShowTransportMenu(false);
                  }}
                  className={`w-full text-left px-3 py-1.5 flex items-center justify-between hover:bg-black/[0.04] dark:hover:bg-white/[0.06] transition ${
                    transportMode === mode ? 'text-blue-600 dark:text-blue-400 font-medium' : 'text-slate-700 dark:text-slate-300'
                  }`}
                >
                  <span>{mode}</span>
                  {transportMode === mode && <Check size={13} />}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* User Role Badge */}
        <div className="px-2 py-0.5 rounded-full border border-black/[0.06] dark:border-white/[0.08] bg-black/[0.02] dark:bg-white/[0.04] text-slate-500 dark:text-slate-400 text-[10px] font-mono capitalize select-none">
          {userRole}
        </div>

        {/* Audio Mute/Unmute */}
        <button
          onClick={onToggleAudio}
          title={isAudioMuted ? 'Unmute Sound Effects' : 'Mute Sound Effects'}
          className="p-1.5 rounded-full text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100 hover:bg-black/[0.05] dark:hover:bg-white/[0.08] active:scale-95 transition cursor-pointer"
        >
          {isAudioMuted ? (
            <VolumeMute size={15} strokeWidth={2} />
          ) : (
            <VolumeHigh size={15} strokeWidth={2} />
          )}
        </button>

        {/* Apple-style Light / Dark Mode Toggle using Morphicons */}
        <ThemeToggle size={16} />

        {/* Share Button (Apple System Blue pill) */}
        <button
          onClick={onOpenShare}
          className="flex items-center gap-1.5 px-3 py-1 bg-blue-600 hover:bg-blue-500 active:scale-[0.98] text-white rounded-full text-xs font-medium transition shadow-xs cursor-pointer"
        >
          <Share size={13} color="currentColor" strokeWidth={2} />
          <span>Share</span>
        </button>

        {/* User Avatar Menu */}
        <div className="relative">
          <button
            onClick={() => setShowUserMenu(!showUserMenu)}
            className="w-7 h-7 rounded-full overflow-hidden border border-black/[0.1] dark:border-white/[0.2] focus:outline-none hover:ring-2 hover:ring-blue-500/30 transition cursor-pointer"
          >
            <img
              src={user.avatar || `https://api.dicebear.com/7.x/identicon/svg?seed=${user.name}`}
              alt={user.name}
              className="w-full h-full object-cover"
            />
          </button>

          {showUserMenu && (
            <div className="absolute right-0 top-full mt-1.5 w-48 rounded-xl bg-white dark:bg-slate-900 border border-black/[0.08] dark:border-white/[0.1] shadow-xl py-1 z-50 text-xs backdrop-blur-xl">
              <div className="px-3 py-2 border-b border-black/[0.06] dark:border-white/[0.06]">
                <p className="font-semibold text-slate-900 dark:text-slate-100">{user.name}</p>
                <p className="text-[11px] text-slate-500 truncate">{user.email}</p>
              </div>
              <button
                onClick={() => {
                  setShowUserMenu(false);
                  onBackToDashboard();
                }}
                className="w-full text-left px-3 py-2 text-slate-700 dark:text-slate-300 hover:bg-black/[0.04] dark:hover:bg-white/[0.06] flex items-center gap-2 transition"
              >
                <FolderOpen size={14} className="text-slate-400" />
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
                className="w-full text-left px-3 py-2 text-slate-700 dark:text-slate-300 hover:bg-black/[0.04] dark:hover:bg-white/[0.06] flex items-center gap-2 border-b border-black/[0.06] dark:border-white/[0.06] transition"
              >
                <RotateCcw className="w-3.5 h-3.5 text-slate-400" />
                <span>Reset Layout</span>
              </button>
              <button
                onClick={() => {
                  setShowUserMenu(false);
                  onLogout();
                }}
                className="w-full text-left px-3 py-2 text-rose-600 dark:text-rose-400 hover:bg-rose-500/10 flex items-center gap-2 transition"
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
