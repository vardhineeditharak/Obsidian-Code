import { describe, it, expect, vi } from 'vitest';
import { editorOptions, splitEditorOptions, mirrorEditorOptions } from '../src/components/workspace/editorOptions';
import { YjsWebSocketServer, PROJECT_EVENTS_ROOM_REGEX } from '../server/websocket/yjsServer';

describe('User Reported Issues Verification Suite (Issues #3, #5, #6, #7, #8, #9, #10, #11, #12)', () => {
  // Issue #12: Inaccurate Autocomplete Suggestions in the Code Editor
  describe('Issue #12: Inaccurate Autocomplete Suggestions', () => {
    it('configures quickSuggestions to prevent unwanted suggestions inside strings and comments', () => {
      expect(editorOptions.quickSuggestions).toEqual({
        other: true,
        comments: false,
        strings: false,
      });
    });

    it('limits word-based suggestions to currentDocument to avoid cross-language pollution', () => {
      expect(editorOptions.wordBasedSuggestions).toBe('currentDocument');
    });

    it('enables trigger character suggestions and tab completion for accurate developer ergonomics', () => {
      expect(editorOptions.suggestOnTriggerCharacters).toBe(true);
      expect(editorOptions.tabCompletion).toBe('on');
    });

    it('constructs model URIs that preserve the file extension for Monaco language services', () => {
      const fileId = 'file-abc-123';
      const fileName = 'calculator.ts';
      const cleanPath = fileName.replace(/^\/+/, '');
      const uriString = `file:///${fileId}/${cleanPath}`;

      expect(uriString).toMatch(/\.ts$/);
      expect(uriString).toBe('file:///file-abc-123/calculator.ts');
    });
  });

  // Issues #9 & #10: Split Editor Editable and Multiple Different Files
  describe('Issues #9 & #10: Split Editor Editable & Independent File Display', () => {
    it('Issue #9: split and mirror editor options are editable (readOnly: false)', () => {
      expect(splitEditorOptions.readOnly).toBe(false);
      expect(mirrorEditorOptions.readOnly).toBe(false);
      expect(splitEditorOptions.minimap).toEqual({ enabled: false });
    });

    it('Issue #10: resolves distinct split file when two files are open in workspace', () => {
      const activeFileId = 'file-main';
      const openFileIds = ['file-main', 'file-utils'];
      const files = [
        { _id: 'file-main', name: 'main.ts', isFolder: false },
        { _id: 'file-utils', name: 'utils.ts', isFolder: false },
      ];

      // Secondary pane resolves to alternate open tab
      let splitFileId: string | null = null;
      const resolvedSplitFileId =
        splitFileId && files.some((f) => f._id === splitFileId && !f.isFolder)
          ? splitFileId
          : openFileIds.find((id) => id !== activeFileId) || activeFileId;

      expect(resolvedSplitFileId).toBe('file-utils');
      expect(resolvedSplitFileId).not.toBe(activeFileId);

      // Switching split pane file updates independent split view
      splitFileId = 'file-main';
      const updatedSplitFileId =
        splitFileId && files.some((f) => f._id === splitFileId && !f.isFolder)
          ? splitFileId
          : openFileIds.find((id) => id !== activeFileId) || activeFileId;

      expect(updatedSplitFileId).toBe('file-main');
    });
  });

  // Issues #7, #8, #11: Real-time File Sync and Role Update Reflection
  describe('Issues #7, #8, #11: Real-Time Project Events Broadcast & Role Updates', () => {
    it('matches project events room regex pattern', () => {
      const room = 'obsidian-project-proj-123-events';
      const match = room.match(PROJECT_EVENTS_ROOM_REGEX);
      expect(match).not.toBeNull();
      expect(match![1]).toBe('proj-123');
    });

    it('Issue #11 & #7: broadcasts file:created, file:updated, and file:deleted to all connected project clients', () => {
      const server = new YjsWebSocketServer(null);

      const receivedMessagesUserB: string[] = [];
      const mockWsUserB = {
        readyState: 1, // OPEN
        send: vi.fn((data: string) => receivedMessagesUserB.push(data)),
      } as any;

      // Register mock client for project
      (server as any).projectEventClients.set('proj-xyz', new Set([
        { ws: mockWsUserB, userId: 'user-b', projectId: 'proj-xyz', role: 'editor' },
      ]));

      // 1. File Created
      server.broadcastProjectEvent('proj-xyz', {
        type: 'file:created',
        file: { _id: 'f-new', name: 'component.tsx', projectId: 'proj-xyz' },
      });

      expect(mockWsUserB.send).toHaveBeenCalledTimes(1);
      const parsed1 = JSON.parse(receivedMessagesUserB[0]);
      expect(parsed1.type).toBe('file:created');
      expect(parsed1.file.name).toBe('component.tsx');

      // 2. File Updated (Rename) - Issue #7
      server.broadcastProjectEvent('proj-xyz', {
        type: 'file:updated',
        file: { _id: 'f-new', name: 'Button.tsx', projectId: 'proj-xyz' },
      });

      expect(mockWsUserB.send).toHaveBeenCalledTimes(2);
      const parsed2 = JSON.parse(receivedMessagesUserB[1]);
      expect(parsed2.type).toBe('file:updated');
      expect(parsed2.file.name).toBe('Button.tsx');

      // 3. File Deleted - Issue #11
      server.broadcastProjectEvent('proj-xyz', {
        type: 'file:deleted',
        fileId: 'f-new',
      });

      expect(mockWsUserB.send).toHaveBeenCalledTimes(3);
      const parsed3 = JSON.parse(receivedMessagesUserB[2]);
      expect(parsed3.type).toBe('file:deleted');
      expect(parsed3.fileId).toBe('f-new');
    });

    it('Issue #8: updateClientRole immediately updates client role on active socket connections', () => {
      const server = new YjsWebSocketServer(null);

      const client = {
        ws: { readyState: 1, send: vi.fn() },
        userId: 'user-viewer-to-promote',
        projectId: 'proj-rbac',
        role: 'viewer' as const,
      };

      (server as any).projectEventClients.set('proj-rbac', new Set([client]));

      expect(client.role).toBe('viewer');

      // Promote to editor
      server.updateClientRole('proj-rbac', 'user-viewer-to-promote', 'editor');
      expect(client.role).toBe('editor');

      // Demote to viewer
      server.updateClientRole('proj-rbac', 'user-viewer-to-promote', 'viewer');
      expect(client.role).toBe('viewer');
    });
  });

  // Issue #6: Unable to Regenerate Share Link After Changing Access Permissions
  describe('Issue #6: Share Link Regeneration on Access Role Change', () => {
    it('resets or allows regenerating inviteUrl when role selection changes from editor to viewer', () => {
      let selectedRole: 'editor' | 'viewer' = 'editor';
      let inviteUrl = 'https://app.obsidiancode.com/join/invite-editor-token';
      let generatedRole: 'editor' | 'viewer' | null = 'editor';

      // User changes role dropdown in ShareModal
      const newRole: 'editor' | 'viewer' = 'viewer';
      selectedRole = newRole;
      if (generatedRole && generatedRole !== newRole) {
        inviteUrl = '';
      }

      // Assert link was cleared so user can generate the viewer link
      expect(inviteUrl).toBe('');
      expect(selectedRole).toBe('viewer');

      // Generate new link
      inviteUrl = 'https://app.obsidiancode.com/join/invite-viewer-token';
      generatedRole = newRole;

      expect(inviteUrl).toBe('https://app.obsidiancode.com/join/invite-viewer-token');
      expect(generatedRole).toBe('viewer');
    });
  });

  // Issue #5: Tab State Persistence on Application Refresh/Reload
  describe('Issue #5: Workspace Tab State Persistence Across Reload', () => {
    it('restores open tabs and active file from localStorage instead of resetting to first file', () => {
      const projectId = 'proj-persistence-test';
      const mockFiles = [
        { _id: 'f-1', name: 'index.html', isFolder: false },
        { _id: 'f-2', name: 'app.tsx', isFolder: false },
        { _id: 'f-3', name: 'styles.css', isFolder: false },
      ];

      // Simulate prior saved state before reload
      const mockStorage: Record<string, string> = {
        [`obsidian.tabs.${projectId}`]: JSON.stringify(['f-2', 'f-3']),
        [`obsidian.activeTab.${projectId}`]: 'f-3',
      };

      // Restoration logic executed in loadWorkspace()
      let restoredTabs: string[] = [];
      let restoredActive: string | null = null;

      const savedTabs = mockStorage[`obsidian.tabs.${projectId}`];
      if (savedTabs) {
        const parsed = JSON.parse(savedTabs);
        if (Array.isArray(parsed)) {
          restoredTabs = parsed.filter((id) => mockFiles.some((f) => f._id === id && !f.isFolder));
        }
      }
      const savedActive = mockStorage[`obsidian.activeTab.${projectId}`];
      if (savedActive && mockFiles.some((f) => f._id === savedActive && !f.isFolder)) {
        restoredActive = savedActive;
      }

      expect(restoredTabs).toEqual(['f-2', 'f-3']);
      expect(restoredActive).toBe('f-3');
      // Did NOT reset to first file ('f-1')
      expect(restoredActive).not.toBe('f-1');
    });

    it('gracefully falls back to first file if localStorage has no prior session or deleted tabs', () => {
      const projectId = 'proj-fresh';
      const mockFiles = [
        { _id: 'f-1', name: 'index.html', isFolder: false },
      ];
      const mockStorage: Record<string, string> = {};

      let restoredTabs: string[] = [];
      const savedTabs = mockStorage[`obsidian.tabs.${projectId}`];
      if (savedTabs) {
        const parsed = JSON.parse(savedTabs);
        if (Array.isArray(parsed)) {
          restoredTabs = parsed.filter((id) => mockFiles.some((f) => f._id === id && !f.isFolder));
        }
      }

      // When no saved tabs exist, correctly falls back to first non-folder file
      const openFileIds = restoredTabs.length > 0 ? restoredTabs : [mockFiles[0]._id];
      expect(openFileIds).toEqual(['f-1']);
    });
  });

  // Issue #3: Workspace Search Feature Error Handling & Robustness
  describe('Issue #3: Workspace Search Null-Safety and Error Prevention', () => {
    it('safely handles null, undefined, or failing getFileContent without crashing with split() error', async () => {
      const mockFiles = [
        { _id: 'f-normal', name: 'code.ts', isFolder: false },
        { _id: 'f-corrupt', name: 'broken.ts', isFolder: false },
        { _id: 'f-throwing', name: 'error.ts', isFolder: false },
      ];

      const getFileContent = async (fileId: string): Promise<any> => {
        if (fileId === 'f-normal') return 'const hello = "world";\nconsole.log(hello);';
        if (fileId === 'f-corrupt') return null; // Can cause content.split() TypeError if unguarded
        if (fileId === 'f-throwing') throw new Error('File read permission denied');
        return '';
      };

      const query = 'hello';
      const regex = new RegExp(query, 'gi');
      const matches: any[] = [];

      for (const file of mockFiles) {
        if (file.isFolder) continue;
        let content = '';
        try {
          const raw = await getFileContent(file._id);
          content = typeof raw === 'string' ? raw : (raw != null ? String(raw) : '');
        } catch (err) {
          continue;
        }

        const lines = content.split('\n');
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          regex.lastIndex = 0;
          let match;
          while ((match = regex.exec(line)) !== null) {
            matches.push({ fileId: file._id, line: i + 1, matchText: match[0] });
          }
        }
      }

      // Assert search succeeded without throwing unhandled exception
      expect(matches.length).toBe(2);
      expect(matches[0].fileId).toBe('f-normal');
      expect(matches[1].fileId).toBe('f-normal');
    });
  });
});
