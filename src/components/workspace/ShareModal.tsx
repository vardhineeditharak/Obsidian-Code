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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(38,37,30,0.35)] dark:bg-[rgba(10,10,8,0.65)] p-4">
      <div className="w-full max-w-xl rounded-lg overflow-hidden border border-stone bg-bone shadow-2xl flex flex-col">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-stone bg-bone">
          <div className="flex items-center space-x-2">
            <Users className="w-5 h-5 text-ash" />
            <h2 className="text-base font-normal text-ink">Share "{projectName}"</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-md text-ash hover:text-ink hover:bg-linen transition cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 space-y-6">
          {/* Link Generation Section */}
          <div className="space-y-3">
            <label className="text-xs font-mono text-ash uppercase tracking-wider block">
              Invite Collaborators via Link
            </label>
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <input
                  type="text"
                  readOnly
                  placeholder="Click generate to create an invite link..."
                  value={inviteUrl}
                  className="w-full bg-parchment border border-stone rounded-md px-3 py-2 text-xs font-mono text-ink focus:outline-none focus:ring-1 focus:ring-ink placeholder-mist"
                />
              </div>

              {isOwner && (
                <select
                  value={selectedRole}
                  onChange={(e) => setSelectedRole(e.target.value as any)}
                  className="bg-bone border border-stone rounded-md px-3 py-2 text-xs text-ink focus:outline-none cursor-pointer"
                >
                  <option value="editor">Editor (Can edit)</option>
                  <option value="viewer">Viewer (Read-only)</option>
                </select>
              )}

              {inviteUrl ? (
                <button
                  onClick={handleCopy}
                  className="btn-primary text-xs px-3 py-2"
                >
                  {copied ? <Check className="w-3.5 h-3.5 text-verdant" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copied ? 'Copied' : 'Copy'}</span>
                </button>
              ) : (
                <button
                  onClick={handleGenerateLink}
                  disabled={isLoading || !isOwner}
                  className="btn-primary text-xs px-3 py-2 disabled:opacity-50"
                >
                  <LinkIcon className="w-3.5 h-3.5" />
                  <span>{isLoading ? 'Creating...' : 'Create Link'}</span>
                </button>
              )}
            </div>
            {!isOwner && (
              <p className="text-xs font-editorial text-amber">
                Only the workspace Owner can create new invitation links.
              </p>
            )}
          </div>

          {/* Members List */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-xs font-mono text-ash uppercase tracking-wider block">
                Workspace Members ({members.length})
              </label>
            </div>

            <div className="max-h-56 overflow-y-auto space-y-2 pr-1">
              {members.map((member) => {
                const isSelf = member.userId === currentUserId;

                return (
                  <div
                    key={member.userId}
                    className="flex items-center justify-between p-2.5 rounded-md bg-parchment border border-stone"
                  >
                    <div className="flex items-center gap-3">
                      <img
                        src={member.avatar || `https://api.dicebear.com/7.x/identicon/svg?seed=${member.name}`}
                        alt={member.name}
                        className="w-8 h-8 rounded-md border border-stone bg-linen"
                      />
                      <div>
                        <div className="flex items-center gap-1.5">
                          <p className="text-sm font-normal text-ink">{member.name}</p>
                          {isSelf && (
                            <span className="text-[10px] font-mono text-ash bg-linen px-1.5 py-0.5 rounded-xs">
                              You
                            </span>
                          )}
                        </div>
                        <p className="text-xs font-mono text-mist">{member.email}</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      {isOwner && !isSelf ? (
                        <>
                          <select
                            value={member.role}
                            onChange={(e) => handleRoleChange(member.userId, e.target.value as ProjectRole)}
                            className="bg-bone border border-stone rounded-md px-2 py-1 text-xs text-ink focus:outline-none cursor-pointer"
                          >
                            <option value="owner">Owner</option>
                            <option value="editor">Editor</option>
                            <option value="viewer">Viewer</option>
                          </select>
                          <button
                            onClick={() => setMemberToRemove({ id: member.userId, name: member.name, isSelf: false })}
                            title="Remove member"
                            className="p-1 rounded-md text-ash hover:text-crimson transition cursor-pointer"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </>
                      ) : (
                        <div className="flex items-center gap-2">
                          <span
                            className="text-xs font-mono px-2 py-0.5 rounded-md border border-stone text-ash"
                          >
                            {member.role.charAt(0).toUpperCase() + member.role.slice(1)}
                          </span>
                          {isSelf && member.role !== 'owner' && (
                            <button
                              onClick={() => setMemberToRemove({ id: member.userId, name: member.name, isSelf: true })}
                              className="flex items-center gap-1 text-[11px] text-crimson hover:opacity-80 px-2 py-1 rounded-md transition cursor-pointer"
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
        <div className="px-6 py-3 border-t border-stone bg-bone flex justify-end">
          <button
            onClick={onClose}
            className="btn-secondary text-xs px-4 py-2"
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
