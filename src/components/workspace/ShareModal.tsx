import React, { useState, useEffect } from 'react';
import { X, Copy, Check, Users, Link as LinkIcon, Trash2, LogOut } from 'lucide-react';
import { ProjectMember, ProjectRole } from '../../lib/types';
import { api } from '../../lib/api';
import { notify } from '../../lib/notifications';
import { sound } from '../../lib/audio/soundEngine';
import { ConfirmDialog } from '../ui/Dialog';

interface ShareModalProps {
  isOpen: boolean;
  onClose: () => void;
  projectId: string;
  projectName: string;
  members: ProjectMember[];
  userRole: ProjectRole;
  currentUserId?: string;
  onMembersChanged?: () => void;
  onLeaveWorkspace?: () => void;
}

export const ShareModal: React.FC<ShareModalProps> = ({
  isOpen,
  onClose,
  projectId,
  projectName,
  members,
  userRole,
  currentUserId,
  onMembersChanged,
  onLeaveWorkspace,
}) => {
  const [selectedRole, setSelectedRole] = useState<'editor' | 'viewer'>('editor');
  const [inviteUrl, setInviteUrl] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [memberToRemove, setMemberToRemove] = useState<{ id: string; name: string; isSelf: boolean } | null>(null);

  // ESC keydown listener (D2)
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const isOwner = userRole === 'owner';

  const handleGenerateLink = async () => {
    setIsLoading(true);
    try {
      const res = await api.createInvitation(projectId, selectedRole);
      setInviteUrl(res.inviteUrl);
      notify.success('Invite link generated', `Anyone with this link can join as ${selectedRole}`);
    } catch (err: any) {
      notify.error('Failed to create invite', err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCopy = () => {
    if (!inviteUrl) return;
    navigator.clipboard.writeText(inviteUrl);
    setCopied(true);
    notify.inviteCopied();
    sound.checkpointSaved();
    setTimeout(() => setCopied(false), 2000);
  };

  const handleRoleChange = async (targetUserId: string, newRole: ProjectRole) => {
    try {
      await api.updateMemberRole(projectId, targetUserId, newRole);
      notify.success('Member Role Updated', `Role changed to ${newRole}`);
      onMembersChanged?.();
    } catch (err: any) {
      notify.error('Failed to update role', err.message);
    }
  };

  const handleConfirmRemove = async () => {
    if (!memberToRemove) return;
    try {
      await api.removeMember(projectId, memberToRemove.id);
      if (memberToRemove.isSelf) {
        notify.info('Left Workspace', `You left "${projectName}"`);
        onClose();
        onLeaveWorkspace?.();
      } else {
        notify.success('Member Removed', `${memberToRemove.name} was removed from this workspace`);
        onMembersChanged?.();
      }
    } catch (err: any) {
      notify.error('Failed to remove member', err.message);
    } finally {
      setMemberToRemove(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="glass-modal w-full max-w-xl rounded-xl overflow-hidden border border-white/10 shadow-2xl flex flex-col">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 bg-slate-900/60">
          <div className="flex items-center space-x-2">
            <Users className="w-5 h-5 text-blue-400" />
            <h2 className="text-base font-semibold text-slate-100">Share "{projectName}"</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-md text-slate-400 hover:text-slate-200 hover:bg-white/5 transition cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 space-y-6">
          {/* Link Generation Section */}
          <div className="space-y-3">
            <label className="text-xs font-medium text-slate-400 uppercase tracking-wider block">
              Invite Collaborators via Link
            </label>
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <input
                  type="text"
                  readOnly
                  placeholder="Click generate to create an invite link..."
                  value={inviteUrl}
                  className="w-full bg-slate-950/80 border border-white/10 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-blue-500 placeholder-slate-500"
                />
              </div>

              {isOwner && (
                <select
                  value={selectedRole}
                  onChange={(e) => setSelectedRole(e.target.value as any)}
                  className="bg-slate-800 border border-white/10 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-blue-500 cursor-pointer"
                >
                  <option value="editor">Editor (Can edit)</option>
                  <option value="viewer">Viewer (Read-only)</option>
                </select>
              )}

              {inviteUrl ? (
                <button
                  onClick={handleCopy}
                  className="flex items-center gap-1.5 px-3 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm font-medium transition shadow-sm cursor-pointer"
                >
                  {copied ? <Check className="w-4 h-4 text-emerald-300" /> : <Copy className="w-4 h-4" />}
                  {copied ? 'Copied' : 'Copy'}
                </button>
              ) : (
                <button
                  onClick={handleGenerateLink}
                  disabled={isLoading || !isOwner}
                  className="flex items-center gap-1.5 px-3 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition shadow-sm cursor-pointer"
                >
                  <LinkIcon className="w-4 h-4" />
                  {isLoading ? 'Creating...' : 'Create Link'}
                </button>
              )}
            </div>
            {!isOwner && (
              <p className="text-xs text-amber-400/80">
                Only the workspace Owner can create new invitation links.
              </p>
            )}
          </div>

          {/* Members List */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium text-slate-400 uppercase tracking-wider block">
                Workspace Members ({members.length})
              </label>
            </div>

            <div className="max-h-56 overflow-y-auto space-y-2 pr-1">
              {members.map((member) => {
                const isSelf = member.userId === currentUserId;

                return (
                  <div
                    key={member.userId}
                    className="flex items-center justify-between p-2.5 rounded-lg bg-slate-900/40 border border-white/5"
                  >
                    <div className="flex items-center gap-3">
                      <img
                        src={member.avatar || `https://api.dicebear.com/7.x/identicon/svg?seed=${member.name}`}
                        alt={member.name}
                        className="w-8 h-8 rounded-full border border-white/10 bg-slate-800"
                      />
                      <div>
                        <div className="flex items-center gap-1.5">
                          <p className="text-sm font-medium text-slate-200">{member.name}</p>
                          {isSelf && (
                            <span className="text-[10px] text-blue-400 bg-blue-500/10 px-1.5 py-0.5 rounded font-medium">
                              You
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-slate-500">{member.email}</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      {isOwner && !isSelf ? (
                        <>
                          <select
                            value={member.role}
                            onChange={(e) => handleRoleChange(member.userId, e.target.value as ProjectRole)}
                            className="bg-slate-800 border border-white/10 rounded-lg px-2 py-1 text-xs text-slate-200 focus:outline-none focus:border-blue-500 cursor-pointer"
                          >
                            <option value="owner">Owner</option>
                            <option value="editor">Editor</option>
                            <option value="viewer">Viewer</option>
                          </select>
                          <button
                            onClick={() => setMemberToRemove({ id: member.userId, name: member.name, isSelf: false })}
                            title="Remove member"
                            className="p-1 rounded text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition cursor-pointer"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </>
                      ) : (
                        <div className="flex items-center gap-2">
                          <span
                            className={`text-xs px-2.5 py-1 rounded-full font-medium ${
                              member.role === 'owner'
                                ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                                : member.role === 'editor'
                                ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20'
                                : 'bg-slate-700/50 text-slate-300 border border-white/10'
                            }`}
                          >
                            {member.role.charAt(0).toUpperCase() + member.role.slice(1)}
                          </span>
                          {isSelf && member.role !== 'owner' && (
                            <button
                              onClick={() => setMemberToRemove({ id: member.userId, name: member.name, isSelf: true })}
                              className="flex items-center gap-1 text-[11px] text-rose-400 hover:text-rose-300 bg-rose-500/10 hover:bg-rose-500/20 px-2 py-1 rounded transition cursor-pointer"
                            >
                              <LogOut className="w-3 h-3" />
                              <span>Leave</span>
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-3 border-t border-white/10 bg-slate-900/60 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg text-sm bg-slate-800 hover:bg-slate-700 text-slate-200 transition cursor-pointer"
          >
            Done
          </button>
        </div>
      </div>

      <ConfirmDialog
        isOpen={!!memberToRemove}
        title={memberToRemove?.isSelf ? `Leave "${projectName}"?` : `Remove ${memberToRemove?.name}?`}
        message={
          memberToRemove?.isSelf
            ? 'Are you sure you want to leave this workspace? You will lose access unless invited again.'
            : `Are you sure you want to remove ${memberToRemove?.name} from this workspace?`
        }
        confirmText={memberToRemove?.isSelf ? 'Leave' : 'Remove'}
        isDestructive
        onConfirm={handleConfirmRemove}
        onCancel={() => setMemberToRemove(null)}
      />
    </div>
  );
};
