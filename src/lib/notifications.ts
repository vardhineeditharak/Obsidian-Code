import { toast } from 'sonner';

/**
 * Toast helpers wrapping Sonner with deduplicated IDs.
 */
export const notify = {
  // Save confirmations
  saved: (fileName?: string) => {
    toast.success(fileName ? `Saved ${fileName}` : 'All changes saved', {
      id: 'doc-save',
      description: 'Saved locally and synced',
      duration: 2500,
    });
  },

  checkpointCreated: (checkpointName: string) => {
    toast.success('Checkpoint created', {
      description: `Saved "${checkpointName}"`,
      duration: 3000,
    });
  },

  checkpointRestored: (checkpointName: string) => {
    toast.info('Checkpoint restored', {
      description: `Reverted to "${checkpointName}"`,
      duration: 3500,
    });
  },

  // Network & Transport transitions
  networkStatus: (online: boolean, transport?: string) => {
    if (online) {
      toast.success('Connected', {
        id: 'network-status',
        description: transport
          ? `Syncing via ${transport}`
          : 'Reconnected',
        duration: 3000,
      });
    } else {
      toast.warning('Offline', {
        id: 'network-status',
        description: 'Edits stay in IndexedDB and sync when you reconnect',
        duration: 5000,
      });
    }
  },

  transportChanged: (mode: string) => {
    toast.info(`Sync mode: ${mode}`, {
      id: 'transport-mode',
      description: `Switched sync to ${mode}`,
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
        description: 'Follows their cursor and scroll position',
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
    toast.info(`Role: ${newRole}`, {
      id: 'user-role',
      description:
        newRole === 'Viewer'
          ? 'Read-only mode. You can view files and cursors.'
          : `Your role is now ${newRole}.`,
      duration: 4000,
    });
  },

  permissionDenied: (action: string) => {
    toast.error('Permission Denied', {
      description: `Viewers cannot ${action}.`,
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
    return toast.loading('Running code...', { id: 'code-exec' });
  },

  executionSuccess: (durationMs: number) => {
    toast.success(`Finished in ${durationMs}ms`, {
      id: 'code-exec',
      duration: 3000,
    });
  },

  executionFailed: (errorMsg: string) => {
    toast.error('Run failed', {
      id: 'code-exec',
      description: errorMsg,
      duration: 4000,
    });
  },

  // Sharing & Invitations
  inviteCopied: () => {
    toast.success('Invite link copied', {
      description: 'Anyone with this link can join with that role',
      duration: 3000,
    });
  },

  // Export
  exportStarted: () => {
    return toast.loading('Creating ZIP...', { id: 'export-zip' });
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
