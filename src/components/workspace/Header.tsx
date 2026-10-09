import React, { useState } from 'react';
import {
  Users,
  Share2,
  Download,
  History,
  Search,
  Check,
  ChevronDown,
  LogOut,
  Play,
  RotateCw,
  FolderOpen,
  RotateCcw,
} from 'lucide-react';
import { Project, ProjectRole, TransportMode, CollaboratorPresence, User } from '../../lib/types';
import { AnimatedIcon } from '../ui/AnimatedIcon';
import { sound } from '../../lib/audio/soundEngine';
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
    <header className="h-12 border-b border-white/10 bg-slate-900/95 backdrop-blur-md px-3 flex items-center justify-between select-none z-30">
      {/* Left: Brand & Project Name */}
      <div className="flex items-center gap-3">
        <button
          onClick={onBackToDashboard}
          title="Back to Dashboard"
          className="flex items-center gap-2 px-2 py-1 rounded hover:bg-white/5 text-slate-300 hover:text-white transition group"
        >
          <div className="w-6 h-6 rounded-md bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-sm">
            <span className="text-white font-bold text-xs">O</span>
          </div>
          <span className="text-xs font-semibold tracking-wide text-slate-200 group-hover:text-white">
            Obsidian
          </span>
        </button>

        <span className="text-slate-600">/</span>

        {/* Inline editable project name */}
        {isEditingName ? (
          <input
            type="text"
            value={projectName}
            onChange={(e) => setProjectName(e.target.value)}
            onBlur={handleNameSubmit}
            onKeyDown={(e) => e.key === 'Enter' && handleNameSubmit()}
            autoFocus
            className="bg-slate-800 text-slate-100 text-xs px-2 py-1 rounded border border-blue-500 focus:outline-none"
          />
        ) : (
          <button
            onClick={() => userRole === 'owner' && setIsEditingName(true)}
            title={userRole === 'owner' ? 'Click to rename' : undefined}
            className={`text-xs font-medium text-slate-200 px-1.5 py-0.5 rounded hover:bg-white/5 transition flex items-center gap-1.5 ${
              userRole === 'owner' ? 'cursor-pointer' : 'cursor-default'
            }`}
          >
            <span>{project.name}</span>
            <span className="text-[10px] text-slate-500">
              {userRole === 'owner' ? '(Owner)' : `(${userRole})`}
            </span>
          </button>
        )}

        {/* Sync Pill Indicator */}
        <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-slate-800/80 border border-white/5 text-[11px]">
          <span
            className={`w-2 h-2 rounded-full ${
              isOnline ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'
            }`}
          />
          <span className="text-slate-400">
            {isOnline ? 'Synced' : 'Offline (Local IDB)'}
          </span>
        </div>
      </div>

      {/* Center: Action Controls (Run Code, Search, Version Diff) */}
      <div className="flex items-center gap-2">
        <button
          onClick={onRunCode}
          disabled={isRunningCode || userRole === 'viewer'}
          title={userRole === 'viewer' ? 'Viewers cannot execute code' : 'Execute Code (Sandbox)'}
          className="flex items-center gap-1.5 px-3 py-1 bg-emerald-600/90 hover:bg-emerald-500 disabled:opacity-40 text-white rounded-md text-xs font-medium transition shadow-sm"
        >
          {isRunningCode ? (
            <RotateCw className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Play className="w-3.5 h-3.5 fill-current" />
          )}
          <span>Run</span>
        </button>

        <button
          onClick={onOpenSearch}
          title="Search in Project (Ctrl+Shift+F)"
          className="p-1.5 rounded-md text-slate-400 hover:text-slate-200 hover:bg-white/5 transition"
        >
          <Search className="w-4 h-4" />
        </button>

        <button
          onClick={onOpenHistory}
          title="Version History & Diff"
          className="p-1.5 rounded-md text-slate-400 hover:text-slate-200 hover:bg-white/5 transition"
        >
          <History className="w-4 h-4" />
        </button>

        <button
          onClick={onExportZip}
          title="Export Workspace as ZIP"
          className="p-1.5 rounded-md text-slate-400 hover:text-slate-200 hover:bg-white/5 transition"
        >
          <Download className="w-4 h-4" />
        </button>
      </div>

      {/* Right: Presence, Transport, Audio, Role Switcher, Share, Profile */}
      <div className="flex items-center gap-2.5">
        {/* Collaborator Avatars & Follow Mode */}
        <div className="flex items-center -space-x-1.5">
          {collaborators.map((c) => {
            const isFollowed = followingUserId === c.id;
            return (
              <button
                key={c.id}
                onClick={() => onToggleFollow(c.id)}
                title={`Collaborator: ${c.name} (${c.role})${isFollowed ? ' - Currently Following' : ' - Click to Follow'}`}
                className={`relative w-6 h-6 rounded-full border-2 transition transform hover:scale-110 ${
                  isFollowed ? 'border-amber-400 ring-2 ring-amber-400/50' : 'border-slate-800'
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
            className="flex items-center gap-1 px-2 py-1 rounded bg-slate-800/80 hover:bg-slate-800 border border-white/5 text-[11px] text-slate-300 transition"
          >
            <AnimatedIcon
              iconKey={isOnline ? 'wifi' : 'wifiOff'}
              size={13}
              color={isOnline ? '#38BDF8' : '#FBBF24'}
            />
            <span>{transportMode}</span>
            <ChevronDown className="w-3 h-3 text-slate-500" />
          </button>

          {showTransportMenu && (
            <div className="absolute right-0 top-full mt-1 w-44 rounded-lg bg-slate-900 border border-white/10 shadow-xl py-1 z-50 text-xs">
              {(['Hybrid', 'WebSocket Only', 'P2P Mesh Only'] as TransportMode[]).map((mode) => (
                <button
                  key={mode}
                  onClick={() => {
                    onTransportChange(mode);
                    setShowTransportMenu(false);
                  }}
                  className={`w-full text-left px-3 py-1.5 flex items-center justify-between hover:bg-white/5 transition ${
                    transportMode === mode ? 'text-blue-400 font-medium' : 'text-slate-300'
                  }`}
                >
                  <span>{mode}</span>
                  {transportMode === mode && <Check className="w-3.5 h-3.5" />}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* User Role Badge */}
        <div className="px-2 py-0.5 rounded border border-white/10 bg-slate-800/60 text-slate-300 text-[10px] font-mono capitalize select-none">
          {userRole}
        </div>

        {/* Audio Mute/Unmute */}
        <button
          onClick={onToggleAudio}
          title={isAudioMuted ? 'Unmute Sound Effects' : 'Mute Sound Effects'}
          className="p-1 rounded text-slate-400 hover:text-slate-200 hover:bg-white/5 transition"
        >
          <AnimatedIcon
            iconKey={isAudioMuted ? 'volumeMute' : 'volumeHigh'}
            spring="bouncy"
            size={16}
          />
        </button>

        {/* Share Button (Google Docs style) */}
        <button
          onClick={onOpenShare}
          className="flex items-center gap-1.5 px-3 py-1 bg-blue-600 hover:bg-blue-500 text-white rounded-md text-xs font-medium transition shadow-sm"
        >
          <Share2 className="w-3.5 h-3.5" />
          <span>Share</span>
        </button>

        {/* User Avatar Menu */}
        <div className="relative">
          <button
            onClick={() => setShowUserMenu(!showUserMenu)}
            className="w-7 h-7 rounded-full overflow-hidden border border-white/20 focus:outline-none"
          >
            <img
              src={user.avatar || `https://api.dicebear.com/7.x/identicon/svg?seed=${user.name}`}
              alt={user.name}
              className="w-full h-full object-cover"
            />
          </button>

          {showUserMenu && (
            <div className="absolute right-0 top-full mt-1 w-48 rounded-lg bg-slate-900 border border-white/10 shadow-xl py-1 z-50 text-xs">
              <div className="px-3 py-2 border-b border-white/5">
                <p className="font-semibold text-slate-200">{user.name}</p>
                <p className="text-[11px] text-slate-500 truncate">{user.email}</p>
              </div>
              <button
                onClick={() => {
                  setShowUserMenu(false);
                  onBackToDashboard();
                }}
                className="w-full text-left px-3 py-2 text-slate-300 hover:bg-white/5 flex items-center gap-2"
              >
                <FolderOpen className="w-3.5 h-3.5 text-slate-400" />
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
                className="w-full text-left px-3 py-2 text-slate-300 hover:bg-white/5 flex items-center gap-2 border-b border-white/5"
              >
                <RotateCcw className="w-3.5 h-3.5 text-slate-400" />
                <span>Reset Layout</span>
              </button>
              <button
                onClick={() => {
                  setShowUserMenu(false);
                  onLogout();
                }}
                className="w-full text-left px-3 py-2 text-rose-400 hover:bg-rose-500/10 flex items-center gap-2"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>Log out</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};
