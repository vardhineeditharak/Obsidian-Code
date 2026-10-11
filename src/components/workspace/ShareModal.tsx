import React, { useState } from 'react';
import { Copy, Check, Users, Link as LinkIcon, Trash2, LogOut } from 'lucide-react';
import { ProjectMember, ProjectRole } from '../../lib/types';
import { api } from '../../lib/api';
import { notify } from '../../lib/notifications';
import { sound } from '../../lib/audio/soundEngine';
import { Modal, ConfirmDialog } from '../ui/Dialog';

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
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      maxWidth="max-w-xl"
      title={
        <div className="flex items-center space-x-2">
          <Users className="w-5 h-5 text-ash" />
          <h2 className="text-base font-normal text-ink">Share "{projectName}"</h2>
        </div>
      }
    >
      {/* Modal Body */}
      <div className="p-6 space-y-6">
        {/* Link Generation Section */}
        <div className="space-y-3">
          <label htmlFor="invite-url-field" className="text-xs font-mono text-ash uppercase tracking-wider block">
            Invite Collaborators via Link
          </label>
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <input
                id="invite-url-field"
                type="text"
                readOnly
                placeholder="Click generate to create an invite link..."
                value={inviteUrl}
                aria-label="Generated invitation URL"
                className="w-full bg-parchment border border-stone rounded-md px-3 py-2 text-xs font-mono text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-ink dark:focus-visible:ring-parchment placeholder-mist"
              />
            </div>

            {isOwner && (
              <select
                aria-label="Invite collaborator role"
                value={selectedRole}
                onChange={(e) => setSelectedRole(e.target.value as any)}
                className="bg-bone border border-stone rounded-md px-3 py-2 text-xs text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-ink dark:focus-visible:ring-parchment cursor-pointer"
              >
                <option value="editor">Editor (Can edit)</option>
                <option value="viewer">Viewer (Read-only)</option>
              </select>
            )}

            {inviteUrl ? (
              <button
                type="button"
                onClick={handleCopy}
                className="btn-primary text-xs px-3 py-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-ink dark:focus-visible:ring-parchment"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-verdant" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copied ? 'Copied' : 'Copy'}</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={handleGenerateLink}
                disabled={isLoading || !isOwner}
                className="btn-primary text-xs px-3 py-2 disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-ink dark:focus-visible:ring-parchment"
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
            <span className="text-xs font-mono text-ash uppercase tracking-wider block">
              Workspace Members ({members.length})
            </span>
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
                      className="w-8 h-8 rounded-md border border-stone bg-linen object-cover"
                    />
                    <div>
                      <div className="flex items-center gap-1.5">
                        <p className="text-sm font-normal text-ink">{member.name}</p>
                        {isSelf && (
                          <span className="text-[10px] font-mono text-ash bg-linen px-1.5 py-0.5 rounded-sm">
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
                          aria-label={`Role for member ${member.name}`}
                          value={member.role}
                          onChange={(e) => handleRoleChange(member.userId, e.target.value as ProjectRole)}
                          className="bg-bone border border-stone rounded-md px-2 py-1 text-xs text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-ink dark:focus-visible:ring-parchment cursor-pointer"
                        >
                          <option value="owner">Owner</option>
                          <option value="editor">Editor</option>
                          <option value="viewer">Viewer</option>
                        </select>
                        <button
                          type="button"
                          onClick={() => setMemberToRemove({ id: member.userId, name: member.name, isSelf: false })}
                          title={`Remove ${member.name}`}
                          aria-label={`Remove member ${member.name}`}
                          className="p-1 rounded-md text-ash hover:text-crimson hover:bg-linen focus:outline-none focus-visible:ring-2 focus-visible:ring-crimson transition cursor-pointer"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </>
                    ) : (
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-mono px-2 py-0.5 rounded-md border border-stone text-ash">
                          {member.role.charAt(0).toUpperCase() + member.role.slice(1)}
                        </span>
                        {isSelf && member.role !== 'owner' && (
                          <button
                            type="button"
                            onClick={() => setMemberToRemove({ id: member.userId, name: member.name, isSelf: true })}
                            aria-label="Leave workspace"
                            className="flex items-center gap-1 text-[11px] text-crimson hover:opacity-80 px-2 py-1 rounded-md transition cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-crimson"
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
          type="button"
          onClick={onClose}
          className="btn-secondary text-xs px-4 py-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-ink dark:focus-visible:ring-parchment"
        >
          Done
        </button>
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
    </Modal>
  );
};
