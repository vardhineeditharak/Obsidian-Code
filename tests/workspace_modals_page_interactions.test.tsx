// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, waitFor, cleanup, within } from '@testing-library/react';

const { mockApi, mockNotify, mockSound, mockDocManager, mockExportZip } = vi.hoisted(() => ({
  mockApi: {
    createInvitation: vi.fn(),
    updateMemberRole: vi.fn(),
    removeMember: vi.fn(),
    getVersions: vi.fn(),
    createVersion: vi.fn(),
    restoreVersion: vi.fn(),
    getProject: vi.fn(),
    getProjectFiles: vi.fn(),
    updateProject: vi.fn(),
    createFile: vi.fn(),
    updateFile: vi.fn(),
    deleteFile: vi.fn(),
    executeCode: vi.fn(),
    getRuntimes: vi.fn(),
  },
  mockNotify: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    inviteCopied: vi.fn(),
    checkpointCreated: vi.fn(),
    checkpointRestored: vi.fn(),
    permissionDenied: vi.fn(),
    fileCreated: vi.fn(),
    fileRenamed: vi.fn(),
    fileDeleted: vi.fn(),
    transportChanged: vi.fn(),
    followMode: vi.fn(),
    roleChanged: vi.fn(),
    networkStatus: vi.fn(),
    executionStarted: vi.fn(),
    executionSuccess: vi.fn(),
    executionFailed: vi.fn(),
  },
  mockSound: {
    getMuted: vi.fn(() => false),
    toggleMute: vi.fn(() => true),
    checkpointSaved: vi.fn(),
    executionSuccess: vi.fn(),
    executionFailed: vi.fn(),
    networkReconnected: vi.fn(),
    networkDisconnected: vi.fn(),
    followMode: vi.fn(),
    roleChanged: vi.fn(),
  },
  mockDocManager: {
    getSession: vi.fn(),
    getOrCreateSession: vi.fn(),
    setLocalAwareness: vi.fn(),
    subscribeAwareness: vi.fn(() => () => {}),
    bindMonaco: vi.fn(),
    destroyBinding: vi.fn(),
    destroySession: vi.fn(),
    updateCursorAwareness: vi.fn(),
    setTransportMode: vi.fn(),
  },
  mockExportZip: vi.fn(),
}));

vi.mock('../src/lib/api', () => ({ api: mockApi }));
vi.mock('../src/lib/notifications', () => ({ notify: mockNotify }));
vi.mock('../src/lib/audio/soundEngine', () => ({ sound: mockSound }));
vi.mock('../src/lib/crdt/docManager', () => ({ docManager: mockDocManager }));
vi.mock('../src/lib/crdt/projectEvents', () => ({
  subscribeProjectEvents: vi.fn(() => () => {}),
}));
vi.mock('../src/lib/exportWorkspace', () => ({
  exportWorkspaceAsZip: mockExportZip,
}));
vi.mock('../src/lib/monacoSetup', () => ({ default: {} }));
vi.mock('../src/lib/fonts', () => ({
  ensureFontsReady: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('../src/lib/monacoCompletions', () => ({
  registerMonacoCompletions: vi.fn(),
}));
vi.mock('@monaco-editor/react', () => ({
  default: () => React.createElement('div', { 'data-testid': 'mock-monaco-editor' }, 'Monaco Editor'),
  Editor: () => React.createElement('div', { 'data-testid': 'mock-monaco-editor' }, 'Monaco Editor'),
  DiffEditor: ({ original, modified, language }: any) =>
    React.createElement(
      'div',
      { 'data-testid': 'mock-diff-editor', 'data-language': language },
      `ORIG:${original} | MOD:${modified}`
    ),
}));

import { ShareModal } from '../src/components/workspace/ShareModal';
import { VersionHistoryModal } from '../src/components/workspace/VersionHistoryModal';
import { SearchReplaceModal } from '../src/components/workspace/SearchReplaceModal';
import { WorkspacePage } from '../src/components/workspace/WorkspacePage';
import type { Project, ProjectFile, ProjectMember, User, VersionCheckpoint } from '../src/lib/types';

function ensureDomShims() {
  if (!window.matchMedia) {
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: query.includes('dark'),
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    });
  }
  if (!Element.prototype.scrollIntoView) {
    Element.prototype.scrollIntoView = vi.fn();
  }
}

describe('Workspace Modals & Full WorkspacePage Feature/Button Interactions', () => {
  const user: User = {
    _id: 'u-1',
    name: 'Alice Owner',
    email: 'alice@obsidian.dev',
  };

  const project: Project = {
    _id: 'proj-1',
    name: 'Obsidian Core',
    ownerId: 'u-1',
    members: [
      { userId: 'u-1', name: 'Alice Owner', email: 'alice@obsidian.dev', role: 'owner' },
      { userId: 'u-2', name: 'Bob Editor', email: 'bob@obsidian.dev', role: 'editor' },
    ],
    createdAt: '2026-11-01T00:00:00.000Z',
    updatedAt: '2026-11-20T00:00:00.000Z',
  };

  const files: ProjectFile[] = [
    { _id: 'dir-src', projectId: 'proj-1', name: 'src', path: 'src', isFolder: true },
    {
      _id: 'f-1',
      projectId: 'proj-1',
      name: 'index.js',
      path: 'src/index.js',
      isFolder: false,
      parentId: 'dir-src',
      content: 'const greeting = "hello";\nconsole.log(greeting);',
    },
    {
      _id: 'f-2',
      projectId: 'proj-1',
      name: 'helper.js',
      path: 'helper.js',
      isFolder: false,
      content: 'export const greeting = "hello world";',
    },
  ];

  beforeEach(() => {
    ensureDomShims();
    vi.clearAllMocks();
    localStorage.clear();
    mockDocManager.getSession.mockReturnValue(undefined);
    mockDocManager.getOrCreateSession.mockResolvedValue({
      ytext: { length: 0, toString: () => '' },
    });
    mockExportZip.mockResolvedValue(undefined);
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  describe('ShareModal All Buttons & Member Actions', () => {
    it('creates invite link, regenerates on role change, copies to clipboard, updates member role, removes member, and supports non-owner Leave', async () => {
      const writeText = vi.fn().mockResolvedValue(undefined);
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: { writeText },
      });

      mockApi.createInvitation
        .mockResolvedValueOnce({ token: 't1', inviteUrl: 'http://localhost:3000/join/t1' })
        .mockResolvedValueOnce({ token: 't2', inviteUrl: 'http://localhost:3000/join/t2' });
      mockApi.updateMemberRole.mockResolvedValue({ message: 'Updated' });
      mockApi.removeMember.mockResolvedValue({ message: 'Removed' });

      const onClose = vi.fn();
      const onMembersChanged = vi.fn();
      const onLeaveWorkspace = vi.fn();

      const members: ProjectMember[] = project.members!;

      const { rerender } = render(
        <ShareModal
          isOpen={true}
          onClose={onClose}
          projectId="proj-1"
          projectName="Obsidian Core"
          members={members}
          userRole="owner"
          currentUserId="u-1"
          onMembersChanged={onMembersChanged}
          onLeaveWorkspace={onLeaveWorkspace}
        />
      );

      // Create Link button
      fireEvent.click(screen.getByRole('button', { name: 'Create Link' }));
      await waitFor(() => {
        expect(mockApi.createInvitation).toHaveBeenCalledWith('proj-1', 'editor');
        expect((screen.getByLabelText('Generated invitation URL') as HTMLInputElement).value).toBe(
          'http://localhost:3000/join/t1'
        );
      });

      // Copy button
      fireEvent.click(screen.getByRole('button', { name: 'Copy' }));
      await waitFor(() => {
        expect(writeText).toHaveBeenCalledWith('http://localhost:3000/join/t1');
        expect(screen.getByRole('button', { name: 'Copied' })).toBeTruthy();
      });

      // Changing role shows Regenerate Link prompt & button
      fireEvent.change(screen.getByLabelText('Invite collaborator role'), {
        target: { value: 'viewer' },
      });
      expect(screen.getByText(/Permission changed to viewer/)).toBeTruthy();
      fireEvent.click(screen.getByRole('button', { name: 'Regenerate Link' }));
      await waitFor(() => {
        expect(mockApi.createInvitation).toHaveBeenCalledWith('proj-1', 'viewer');
      });

      // Change Bob's role
      fireEvent.change(screen.getByLabelText('Role for member Bob Editor'), {
        target: { value: 'viewer' },
      });
      await waitFor(() => {
        expect(mockApi.updateMemberRole).toHaveBeenCalledWith('proj-1', 'u-2', 'viewer');
        expect(onMembersChanged).toHaveBeenCalledTimes(1);
      });

      // Remove Bob -> ConfirmDialog -> Remove
      fireEvent.click(screen.getByRole('button', { name: 'Remove member Bob Editor' }));
      expect(screen.getByText('Remove Bob Editor?')).toBeTruthy();
      fireEvent.click(screen.getByRole('button', { name: 'Remove' }));
      await waitFor(() => {
        expect(mockApi.removeMember).toHaveBeenCalledWith('proj-1', 'u-2');
      });

      // Non-owner Leave workspace flow
      rerender(
        <ShareModal
          isOpen={true}
          onClose={onClose}
          projectId="proj-1"
          projectName="Obsidian Core"
          members={members}
          userRole="editor"
          currentUserId="u-2"
          onMembersChanged={onMembersChanged}
          onLeaveWorkspace={onLeaveWorkspace}
        />
      );
      fireEvent.click(screen.getByRole('button', { name: 'Leave workspace' }));
      expect(screen.getByText('Leave "Obsidian Core"?')).toBeTruthy();
      fireEvent.click(screen.getByRole('button', { name: 'Leave' }));
      await waitFor(() => {
        expect(mockApi.removeMember).toHaveBeenCalledWith('proj-1', 'u-2');
        expect(onLeaveWorkspace).toHaveBeenCalledTimes(1);
      });

      // Done button closes
      fireEvent.click(screen.getByRole('button', { name: 'Done' }));
      expect(onClose).toHaveBeenCalled();
    });
  });

  describe('VersionHistoryModal Checkpoints, File Selector & Restore', () => {
    it('loads checkpoints, selects checkpoint, switches file, syncs activeFileId on reopen, and restores version', async () => {
      const versions: VersionCheckpoint[] = [
        {
          _id: 'v-2',
          projectId: 'proj-1',
          name: 'Auto-save checkpoint',
          type: 'auto',
          createdBy: { userId: 'u-1', name: 'Alice Owner' },
          files: [{ fileId: 'f-1', fileName: 'index.js', content: 'console.log("v2");' }],
          createdAt: new Date().toISOString(),
        },
        {
          _id: 'v-1',
          projectId: 'proj-1',
          name: 'Initial Release',
          note: 'First stable build',
          type: 'manual',
          createdBy: { userId: 'u-1', name: 'Alice Owner' },
          files: [
            { fileId: 'f-1', fileName: 'index.js', content: 'console.log("v1");' },
            { fileId: 'f-2', fileName: 'helper.js', content: 'export const x = 1;' },
          ],
          createdAt: new Date(Date.now() - 120_000).toISOString(),
        },
      ];
      mockApi.getVersions.mockResolvedValue(versions);
      const onRestoreVersion = vi.fn().mockResolvedValue(undefined);
      const onClose = vi.fn();

      const { rerender } = render(
        <VersionHistoryModal
          isOpen={true}
          onClose={onClose}
          projectId="proj-1"
          files={files}
          activeFileId="f-1"
          currentContent="console.log('live');"
          userRole="owner"
          onRestoreContent={vi.fn()}
          onRestoreVersion={onRestoreVersion}
        />
      );

      await screen.findByText('Initial Release');
      expect(screen.getByTestId('mock-diff-editor').textContent).toContain('ORIG:console.log("v2");');

      // Select v-1 checkpoint
      fireEvent.click(screen.getByRole('button', { name: /Initial Release/ }));
      expect(screen.getByTestId('mock-diff-editor').textContent).toContain('ORIG:console.log("v1");');

      // Switch comparison file
      fireEvent.change(screen.getByLabelText('Select file to compare'), { target: { value: 'f-2' } });
      expect(screen.getByTestId('mock-diff-editor').textContent).toContain('ORIG:export const x = 1;');

      // Restore This Version -> ConfirmDialog -> Confirm Restore
      fireEvent.click(screen.getByRole('button', { name: 'Restore This Version' }));
      expect(screen.getByText('Restore Checkpoint')).toBeTruthy();
      fireEvent.click(screen.getByRole('button', { name: 'Confirm Restore' }));

      await waitFor(() => {
        expect(onRestoreVersion).toHaveBeenCalledWith(versions[1]);
        expect(onClose).toHaveBeenCalled();
      });

      // Reopening with a different activeFileId resets selectedFileId to activeFileId
      rerender(
        <VersionHistoryModal
          isOpen={false}
          onClose={onClose}
          projectId="proj-1"
          files={files}
          activeFileId="f-2"
          currentContent="live-2"
          userRole="owner"
          onRestoreContent={vi.fn()}
          onRestoreVersion={onRestoreVersion}
        />
      );
      rerender(
        <VersionHistoryModal
          isOpen={true}
          onClose={onClose}
          projectId="proj-1"
          files={files}
          activeFileId="f-2"
          currentContent="live-2"
          userRole="owner"
          onRestoreContent={vi.fn()}
          onRestoreVersion={onRestoreVersion}
        />
      );
      await waitFor(() => {
        expect((screen.getByLabelText('Select file to compare') as HTMLSelectElement).value).toBe('f-2');
      });
    });
  });

  describe('SearchReplaceModal Find, Toggles, Collapse, Jump & Batch Replace', () => {
    it('searches with modifiers, collapses file results, jumps to match, and executes Replace All', async () => {
      const contents = new Map<string, string>([
        ['f-1', 'const Foo = 1;\nconst foo = 2;\nconst foobar = 3;'],
        ['f-2', 'export const foo = "bar";'],
      ]);
      const onSelectResult = vi.fn();
      const onBatchReplace = vi.fn().mockResolvedValue(undefined);
      const onClose = vi.fn();

      render(
        <SearchReplaceModal
          isOpen={true}
          onClose={onClose}
          files={files}
          getFileContent={async (id) => contents.get(id) ?? ''}
          onSelectResult={onSelectResult}
          onBatchReplace={onBatchReplace}
        />
      );

      // Toggle Case Sensitive (Aa) and Whole Word (\b)
      const caseBtn = screen.getByRole('button', { name: 'Match Case' });
      const wordBtn = screen.getByRole('button', { name: 'Match Whole Word' });
      fireEvent.click(caseBtn);
      fireEvent.click(wordBtn);
      expect(caseBtn.getAttribute('aria-pressed')).toBe('true');
      expect(wordBtn.getAttribute('aria-pressed')).toBe('true');

      fireEvent.change(screen.getByLabelText('Search across files'), { target: { value: 'foo' } });
      fireEvent.click(screen.getByRole('button', { name: 'Find' }));

      // Case-sensitive + whole word should match `foo` on line 2 of index.js and line 1 of helper.js (2 results)
      await screen.findByText('Replace All (2)');

      // Collapse & expand index.js group
      const groupToggle = screen.getByRole('button', { name: /index\.js/i });
      fireEvent.click(groupToggle);
      expect(groupToggle.getAttribute('aria-expanded')).toBe('false');
      fireEvent.click(groupToggle);
      expect(groupToggle.getAttribute('aria-expanded')).toBe('true');

      // Click first match row to jump
      const lineBtn = screen.getByRole('button', { name: /2:/ });
      fireEvent.click(lineBtn);
      expect(onSelectResult).toHaveBeenCalledWith('f-1', 2, 7, 3);
      expect(onClose).toHaveBeenCalledTimes(1);

      // Run Replace All
      onClose.mockClear();
      fireEvent.change(screen.getByLabelText('Replace with'), { target: { value: 'baz' } });
      fireEvent.click(screen.getByRole('button', { name: 'Replace All (2)' }));

      await waitFor(() => {
        expect(onBatchReplace).toHaveBeenCalledWith([
          { fileId: 'f-1', newContent: 'const Foo = 1;\nconst baz = 2;\nconst foobar = 3;' },
          { fileId: 'f-2', newContent: 'export const baz = "bar";' },
        ]);
        expect(onClose).toHaveBeenCalledTimes(1);
      });
    });
  });

  describe('WorkspacePage Full Integration: Shortcuts, Quick Open, Checkpoint Dialog, Run & Export', () => {
    it('loads project, handles Quick Open (Ctrl+P), Named Checkpoint (Ctrl+S), Sidebar/Search/Terminal shortcuts, Run, and Export ZIP', async () => {
      mockApi.getProject.mockResolvedValue({ project, userRole: 'owner' });
      mockApi.getProjectFiles.mockResolvedValue(files);
      mockApi.executeCode.mockResolvedValue({
        stdout: ['"hello"'],
        stderr: [],
        exitCode: 0,
        language: 'javascript',
        executionTimeMs: 9,
        timestamp: new Date().toISOString(),
      });
      mockApi.createVersion.mockResolvedValue({
        _id: 'v-new',
        projectId: 'proj-1',
        name: 'Checkpoint Alpha',
        files: [],
        createdBy: { userId: 'u-1', name: 'Alice Owner' },
        createdAt: new Date().toISOString(),
      });

      render(
        <WorkspacePage
          projectId="proj-1"
          currentUser={user}
          onLogout={vi.fn()}
          onBackToDashboard={vi.fn()}
        />
      );

      // Wait for workspace load & initial file open (after fontsReady resolves)
      await screen.findByText('Obsidian Core');
      expect(await screen.findByTestId('mock-monaco-editor')).toBeTruthy();

      // Run button executes active file
      fireEvent.click(screen.getByRole('button', { name: 'Execute Code (Sandbox)' }));
      await waitFor(() => {
        expect(mockApi.executeCode).toHaveBeenCalledWith(
          'const greeting = "hello";\nconsole.log(greeting);',
          'javascript',
          'index.js'
        );
        expect(screen.getByText('"hello"')).toBeTruthy();
      });

      // Export ZIP button
      fireEvent.click(screen.getByRole('button', { name: 'Export Workspace as ZIP' }));
      expect(mockExportZip).toHaveBeenCalledTimes(1);

      // Ctrl+P Quick Open filters by path and selects helper.js inside the Quick Open dialog
      fireEvent.keyDown(window, { key: 'p', ctrlKey: true });
      const quickOpenDialog = await screen.findByRole('dialog');
      const quickInput = within(quickOpenDialog).getByLabelText('Filter files by name');
      fireEvent.change(quickInput, { target: { value: 'helper' } });
      fireEvent.click(within(quickOpenDialog).getByRole('button', { name: /helper\.js/i }));
      expect(screen.queryByLabelText('Filter files by name')).toBeNull();

      // Ctrl+S opens Named Checkpoint dialog and submits checkpoint
      fireEvent.keyDown(window, { key: 's', ctrlKey: true });
      await screen.findByText('Create Named Checkpoint');
      fireEvent.change(screen.getByLabelText(/Checkpoint Name/), { target: { value: 'Checkpoint Alpha' } });
      fireEvent.click(screen.getByRole('button', { name: 'Save Checkpoint' }));
      await waitFor(() => {
        expect(mockApi.createVersion).toHaveBeenCalledWith(
          'proj-1',
          'Checkpoint Alpha',
          '',
          expect.any(Array),
          'manual',
          'manual'
        );
      });

      // Ctrl+Shift+F opens SearchReplaceModal
      fireEvent.keyDown(window, { key: 'F', ctrlKey: true, shiftKey: true });
      expect(await screen.findByRole('dialog', { name: 'Workspace Search & Replace' })).toBeTruthy();
      fireEvent.keyDown(window, { key: 'Escape' });

      // Ctrl+` opens Terminal tab
      fireEvent.keyDown(window, { key: '`', ctrlKey: true });
      expect(screen.getByLabelText('Terminal command')).toBeTruthy();

      // Ctrl+B toggles Sidebar off and on
      expect(screen.getByText('Explorer')).toBeTruthy();
      fireEvent.keyDown(window, { key: 'b', ctrlKey: true });
      expect(screen.queryByText('Explorer')).toBeNull();
      fireEvent.keyDown(window, { key: 'b', ctrlKey: true });
      expect(screen.getByText('Explorer')).toBeTruthy();

      // StatusBar Problems button opens PROBLEMS tab
      fireEvent.click(screen.getByRole('button', { name: /Click to open Problems panel/i }));
      expect(screen.getByText(/0 Errors/i)).toBeTruthy();
    });
  });
});
