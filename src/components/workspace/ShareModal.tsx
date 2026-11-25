import React, { useState, useEffect, useRef } from 'react';
import { Copy, Check, Users, Link as LinkIcon, Trash2, LogOut, RotateCw } from 'lucide-react';
import { ProjectMember, ProjectRole } from '../../lib/types';
import { api } from '../../lib/api';
import { notify } from '../../lib/notifications';
import { sound } from '../../lib/audio/soundEngine';
import { Modal, ConfirmDialog } from '../ui/Dialog';

export interface ShareModalProps {
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
  const [generatedRole, setGeneratedRole] = useState<'editor' | 'viewer' | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [memberToRemove, setMemberToRemove] = useState<{
    id: string;
    name: string;
    isSelf: boolean;
  } | null>(null);
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setInviteUrl('');
    setGeneratedRole(null);
    setCopied(false);
  }, [projectId]);

  useEffect(() => {
    return () => {
      if (copyTimerRef.current) {
        clearTimeout(copyTimerRef.current);
      }
    };
  }, []);

  if (!isOpen) return null;

  const isOwner = userRole === 'owner';
  const isRoleChanged = Boolean(inviteUrl && generatedRole && selectedRole !== generatedRole);

  const handleGenerateLink = async (roleToCreate: 'editor' | 'viewer' = selectedRole) => {
    setIsLoading(true);
    setCopied(false);
    try {
      const res = await api.createInvitation(projectId, roleToCreate);
      setInviteUrl(res.inviteUrl);
      setGeneratedRole(roleToCreate);
      notify.success('Invite link generated', `Anyone with this link can join as ${roleToCreate}`);
    } catch (err: unknown) {
      notify.error('Failed to create invite', err instanceof Error ? err.message : 'Unable to generate link');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCopy = async () => {
    if (!inviteUrl) return;
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setCopied(true);
      notify.inviteCopied();
      sound.checkpointSaved();
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
      copyTimerRef.current = setTimeout(() => setCopied(false), 2000);
    } catch {
      notify.error('Copy failed', 'Unable to access clipboard. Please copy the URL manually.');
    }
  };

  const handleRoleChange = async (targetUserId: string, newRole: ProjectRole) => {
    try {
      await api.updateMemberRole(projectId, targetUserId, newRole);
      notify.success('Member Role Updated', `Role changed to ${newRole}`);
      onMembersChanged?.();
    } catch (err: unknown) {
      notify.error('Failed to update role', err instanceof Error ? err.message : 'Unable to update role');
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
    } catch (err: unknown) {
      notify.error('Failed to remove member', err instanceof Error ? err.message : 'Unable to remove member');
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
        <div className="flex items-center gap-2.5">
          <Users className="w-4 h-4 text-ash" />
          <h2 className="text-[15px] font-medium tracking-[-0.015em] text-ink">Share "{projectName}"</h2>
        </div>
      }
    >
      {/* Modal Body */}
      <div className="p-6 space-y-6">
        {/* Link Generation Section */}
        <div className="space-y-2.5">
          <label
            htmlFor="invite-url-field"
            className="text-eyebrow block"
          >
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
                className="input-atelier w-full h-9 text-[12px] font-mono"
              />
            </div>

            {isOwner && (
              <select
                aria-label="Invite collaborator role"
                value={selectedRole}
                onChange={(e) => {
                  const nextRole = e.target.value as 'editor' | 'viewer';
                  setSelectedRole(nextRole);
                  setCopied(false);
                }}
                className="h-9 bg-white/[0.04] border border-white/[0.1] rounded-[9px] px-3 text-[12.5px] font-sans text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-amber cursor-pointer"
              >
                <option value="editor">Editor (Can edit)</option>
                <option value="viewer">Viewer (Read-only)</option>
              </select>
            )}

            {inviteUrl && !isRoleChanged ? (
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={handleCopy}
                  className="btn-primary min-h-0 h-9 px-3.5 text-[12.5px] focus:outline-none focus-visible:ring-2 focus-visible:ring-amber"
                >
                  {copied ? (
                    <Check className="w-3.5 h-3.5 text-verdant" />
                  ) : (
                    <Copy className="w-3.5 h-3.5" />
                  )}
                  <span>{copied ? 'Copied' : 'Copy'}</span>
                </button>
                {isOwner && (
                  <button
                    type="button"
                    onClick={() => handleGenerateLink(selectedRole)}
                    disabled={isLoading}
                    title="Regenerate invite link"
                    aria-label="Regenerate invite link"
                    className="btn-secondary min-h-0 h-9 px-2.5 text-[12.5px] disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber"
                  >
                    <RotateCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
                  </button>
                )}
              </div>
            ) : (
              <button
                type="button"
                onClick={() => handleGenerateLink(selectedRole)}
                disabled={isLoading || !isOwner}
                className="btn-primary min-h-0 h-9 px-3.5 text-[12.5px] disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber"
              >
                {isRoleChanged ? (
                  <RotateCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
                ) : (
                  <LinkIcon className="w-3.5 h-3.5" />
                )}
                <span>
                  {isLoading ? 'Creating...' : isRoleChanged ? 'Regenerate Link' : 'Create Link'}
                </span>
              </button>
            )}
          </div>
          {isRoleChanged && (
            <p className="text-[11.5px] font-sans text-amber">
              Permission changed to {selectedRole}. Regenerate Link to create an updated invite.
            </p>
          )}
          {!isOwner && (
            <p className="text-[12px] text-amber">
              Only the workspace Owner can create new invitation links.
            </p>
          )}
        </div>

        {/* Members List */}
        <div className="space-y-2.5">
          <div className="flex items-center justify-between">
            <span className="text-eyebrow block tabular-nums">
              Workspace Members ({members.length})
            </span>
          </div>

          <div className="max-h-56 overflow-y-auto space-y-2 pr-1">
            {members.map((member) => {
              const isSelf = member.userId === currentUserId;

              return (
                <div
                  key={member.userId}
                  className="flex items-center justify-between px-3 py-2.5 rounded-xl bg-white/[0.025] border border-white/[0.08] inset-glow"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <img
                      src={
                        member.avatar ||
                        `https://api.dicebear.com/7.x/identicon/svg?seed=${encodeURIComponent(member.name)}`
                      }
                      alt={member.name}
                      className="w-8 h-8 rounded-full border border-white/15 bg-linen object-cover shrink-0"
                    />
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <p className="text-[13.5px] font-medium text-ink truncate">{member.name}</p>
                        {isSelf && (
                          <span className="text-[10.5px] font-sans font-medium text-ash bg-white/[0.07] px-1.5 py-0.5 rounded-full shrink-0">
                            You
                          </span>
                        )}
                      </div>
                      <p className="text-[12px] font-sans text-mist truncate">{member.email}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {isOwner && !isSelf ? (
                      <>
                        <select
                          aria-label={`Role for member ${member.name}`}
                          value={member.role}
                          onChange={(e) =>
                            handleRoleChange(member.userId, e.target.value as ProjectRole)
                          }
                          className="h-7 bg-white/[0.04] border border-white/[0.1] rounded-lg px-2 text-[12px] font-sans text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-amber cursor-pointer"
                        >
                          <option value="owner">Owner</option>
                          <option value="editor">Editor</option>
                          <option value="viewer">Viewer</option>
                        </select>
                        <button
                          type="button"
                          onClick={() =>
                            setMemberToRemove({
                              id: member.userId,
                              name: member.name,
                              isSelf: false,
                            })
                          }
                          title={`Remove ${member.name}`}
                          aria-label={`Remove member ${member.name}`}
                          className="w-7 h-7 flex items-center justify-center rounded-lg text-ash hover:text-crimson hover:bg-crimson/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-crimson transition cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </>
                    ) : (
                      <div className="flex items-center gap-2">
                        <span className="tag-badge text-[11px] font-sans px-2.5 py-0.5">
                          {member.role.charAt(0).toUpperCase() + member.role.slice(1)}
                        </span>
                        {isSelf && member.role !== 'owner' && (
                          <button
                            type="button"
                            onClick={() =>
                              setMemberToRemove({
                                id: member.userId,
                                name: member.name,
                                isSelf: true,
                              })
                            }
                            aria-label="Leave workspace"
                            className="flex items-center gap-1 text-[12px] font-medium text-crimson hover:bg-crimson/10 px-2.5 py-1 rounded-lg transition cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-crimson"
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
      <div className="px-6 py-3.5 border-t border-(--border-subtle) bg-bone/60 flex justify-end">
        <button
          type="button"
          onClick={onClose}
          className="btn-secondary min-h-0 h-8 px-4 text-[12.5px] focus:outline-none focus-visible:ring-2 focus-visible:ring-amber"
        >
          Done
        </button>
      </div>

      <ConfirmDialog
        isOpen={!!memberToRemove}
        title={
          memberToRemove?.isSelf
            ? `Leave "${projectName}"?`
            : `Remove ${memberToRemove?.name}?`
        }
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
