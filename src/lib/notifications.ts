import { toast } from 'sonner';

/**
 * Obsidian Code Notification Manager
 * Encapsulates Sonner notifications with application-wide styling,
 * duration standards, and semantic action triggers.
 */

export const notify = {
  // Save confirmations
  saved: (fileName?: string) => {
    toast.success(fileName ? `Saved ${fileName}` : 'All changes saved', {
      id: 'doc-save',
      description: 'Synchronized with local storage and collaborative mesh',
      duration: 2500,
    });
  },

  checkpointCreated: (checkpointName: string) => {
    toast.success(`Checkpoint created`, {
      description: `"${checkpointName}" is recorded in version history`,
      duration: 3000,
    });
  },

  checkpointRestored: (checkpointName: string) => {
    toast.info(`Checkpoint restored`, {
      description: `Reverted to "${checkpointName}"`,
      duration: 3500,
    });
  },

  // Network & Transport transitions
  networkStatus: (online: boolean, transport?: string) => {
    if (online) {
      toast.success('Connected', {
        id: 'network-status',
        description: transport ? `Synchronizing via ${transport}` : 'Reconnected to collaborative network',
        duration: 3000,
      });
    } else {
      toast.warning('Offline mode active', {
        id: 'network-status',
        description: 'Changes will be saved locally in IndexedDB and synchronized once reconnected',
        duration: 5000,
      });
    }
  },

  transportChanged: (mode: string) => {
    toast.info(`Transport Mode: ${mode}`, {
      id: 'transport-mode',
      description: `Active sync channel updated to ${mode}`,
      duration: 2500,
    });
  },

  // Collaboration & Permissions
  collaboratorJoined: (userName: string) => {
    toast.info(`${userName} joined the workspace`, {
      id: `collab-join-${userName}`,
      duration: 2500,
    });
  },

  collaboratorLeft: (userName: string) => {
    toast.info(`${userName} left the workspace`, {
      id: `collab-leave-${userName}`,
      duration: 2000,
    });
  },

  followMode: (isFollowing: boolean, collaboratorName?: string) => {
    if (isFollowing) {
      toast.info(`Following ${collaboratorName || 'collaborator'}`, {
        id: 'follow-mode',
        description: 'Your editor will track their active viewport and cursor position',
        duration: 2500,
      });
    } else {
      toast.info('Stopped following', {
        id: 'follow-mode',
        duration: 1500,
      });
    }
  },

  roleChanged: (newRole: string) => {
    toast.info(`Workspace Role: ${newRole}`, {
      id: 'user-role',
      description: newRole === 'Viewer' 
        ? 'Read-only mode active. You can observe cursors but cannot edit.' 
        : `You now have ${newRole} privileges.`,
      duration: 4000,
    });
  },

  permissionDenied: (action: string) => {
    toast.error('Permission Denied', {
      description: `Viewers are not permitted to ${action}.`,
      duration: 3500,
    });
  },

  // File Operations
  fileCreated: (fileName: string) => {
    toast.success(`Created ${fileName}`, { duration: 2500 });
  },

  fileDeleted: (fileName: string) => {
    toast.info(`Deleted ${fileName}`, { duration: 2500 });
  },

  fileRenamed: (oldName: string, newName: string) => {
    toast.success(`Renamed ${oldName} to ${newName}`, { duration: 2500 });
  },

  // Code Execution
  executionStarted: () => {
    return toast.loading('Executing code in sandbox...', { id: 'code-exec' });
  },

  executionSuccess: (durationMs: number) => {
    toast.success(`Execution completed in ${durationMs}ms`, {
      id: 'code-exec',
      duration: 3000,
    });
  },

  executionFailed: (errorMsg: string) => {
    toast.error('Execution Failed', {
      id: 'code-exec',
      description: errorMsg,
      duration: 4000,
    });
  },

  // Sharing & Invitations
  inviteCopied: () => {
    toast.success('Invitation link copied to clipboard', {
      description: 'Anyone with this link can join with specified role permissions',
      duration: 3000,
    });
  },

  // Export
  exportStarted: () => {
    return toast.loading('Packaging workspace files into ZIP...', { id: 'export-zip' });
  },

  exportCompleted: (fileName: string) => {
    toast.success('Workspace exported', {
      id: 'export-zip',
      description: `Downloaded ${fileName}`,
      duration: 3000,
    });
  },

  // General Error / Info / Success
  error: (title: string, description?: string) => {
    toast.error(title, { description, duration: 4000 });
  },

  success: (title: string, description?: string) => {
    toast.success(title, { description, duration: 3000 });
  },

  info: (title: string, description?: string) => {
    toast.info(title, { description, duration: 3000 });
  },
};
