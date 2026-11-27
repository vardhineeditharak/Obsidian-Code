// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';

const { mockDocManager, mockApi } = vi.hoisted(() => ({
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
  mockApi: {
    getRuntimes: vi.fn(),
  },
}));

vi.mock('../src/lib/crdt/docManager', () => ({
  docManager: mockDocManager,
}));

vi.mock('../src/lib/api', () => ({
  api: mockApi,
}));

vi.mock('../src/lib/monacoSetup', () => ({
  default: {},
}));

vi.mock('../src/lib/fonts', () => ({
  ensureFontsReady: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../src/lib/monacoCompletions', () => ({
  registerMonacoCompletions: vi.fn(),
}));

vi.mock('@monaco-editor/react', () => ({
  default: ({ onMount, beforeMount, language }: any) => {
    React.useEffect(() => {
      const mockModel = {
        getValue: () => '// mock code',
        setValue: vi.fn(),
        getFullModelRange: () => ({ startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 1 }),
        pushEditOperations: vi.fn(),
      };
      const mockMonaco = {
        Uri: { parse: (s: string) => ({ toString: () => s }) },
        KeyMod: { CtrlCmd: 2048 },
        KeyCode: { KeyS: 49 },
        MarkerSeverity: { Error: 8, Warning: 4, Info: 2 },
        editor: {
          defineTheme: vi.fn(),
          setTheme: vi.fn(),
          remeasureFonts: vi.fn(),
          getModel: vi.fn(() => mockModel),
          createModel: vi.fn(() => mockModel),
          setModelLanguage: vi.fn(),
          setModelMarkers: vi.fn(),
        },
      };
      const mockEditor = {
        getModel: vi.fn(() => mockModel),
        setModel: vi.fn(),
        getValue: vi.fn(() => '// mock code'),
        updateOptions: vi.fn(),
        onDidChangeCursorPosition: vi.fn(),
        onDidChangeModelContent: vi.fn(),
        addCommand: vi.fn(),
        saveViewState: vi.fn(),
        restoreViewState: vi.fn(),
        revealLineInCenter: vi.fn(),
        setPosition: vi.fn(),
        setSelection: vi.fn(),
        focus: vi.fn(),
        executeEdits: vi.fn(),
      };
      beforeMount?.(mockMonaco);
      onMount?.(mockEditor, mockMonaco);
    }, []);
    return React.createElement('div', { 'data-testid': `mock-monaco-${language}` }, `Editor:${language}`);
  },
  Editor: () => null,
}));

import { Header } from '../src/components/workspace/Header';
import { Sidebar } from '../src/components/workspace/Sidebar';
import { EditorWorkspace } from '../src/components/workspace/EditorWorkspace';
import { BottomPanel } from '../src/components/workspace/BottomPanel';
import { StatusBar } from '../src/components/workspace/StatusBar';
import type { Project, ProjectFile, User, CollaboratorPresence, DiagnosticsItem } from '../src/lib/types';

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

describe('Workspace Controls: Header, Sidebar, EditorWorkspace, BottomPanel & StatusBar', () => {
  const user: User = {
    _id: 'u-1',
    name: 'Alice Owner',
    email: 'alice@obsidian.dev',
  };

  const project: Project = {
    _id: 'proj-1',
    name: 'Obsidian Workspace',
    ownerId: 'u-1',
    createdAt: '2026-11-01T00:00:00.000Z',
    updatedAt: '2026-11-20T00:00:00.000Z',
  };

  const files: ProjectFile[] = [
    { _id: 'dir-src', projectId: 'proj-1', name: 'src', path: 'src', isFolder: true },
    { _id: 'f-main', projectId: 'proj-1', name: 'main.ts', path: 'src/main.ts', isFolder: false, parentId: 'dir-src', content: 'console.log(1);' },
    { _id: 'f-readme', projectId: 'proj-1', name: 'README.md', path: 'README.md', isFolder: false, content: '# Docs' },
  ];

  beforeEach(() => {
    ensureDomShims();
    vi.clearAllMocks();
    localStorage.clear();
    mockDocManager.getSession.mockReturnValue(undefined);
    mockDocManager.getOrCreateSession.mockResolvedValue({
      ytext: { length: 0, toString: () => '' },
    });
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  describe('Header All Buttons, Menus & Project Rename', () => {
    it('triggers sidebar toggle, dashboard back, project rename (Enter/Escape), center toolbar buttons, presence follow, transport menu, audio toggle, share, and user menu', () => {
      const callbacks = {
        onToggleSidebar: vi.fn(),
        onBackToDashboard: vi.fn(),
        onRenameProject: vi.fn(),
        onRunCode: vi.fn(),
        onOpenSearch: vi.fn(),
        onOpenHistory: vi.fn(),
        onExportZip: vi.fn(),
        onToggleFollow: vi.fn(),
        onTransportChange: vi.fn(),
        onToggleAudio: vi.fn(),
        onOpenShare: vi.fn(),
        onLogout: vi.fn(),
      };

      const collaborators: CollaboratorPresence[] = [
        { id: 'u-1', name: 'Alice Owner', color: '#c08532', role: 'owner' },
        { id: 'u-2', name: 'Bob Dev', color: '#34785c', role: 'editor' },
        { id: 'u-3', name: 'Cara QA', color: '#1f8a65', role: 'viewer' },
        { id: 'u-4', name: 'Dan Ops', color: '#84847e', role: 'editor' },
        { id: 'u-5', name: 'Eve Sec', color: '#4a9e7c', role: 'viewer' },
      ];

      render(
        <Header
          project={project}
          user={user}
          userRole="owner"
          isOnline={true}
          saveState="idle"
          transportMode="Hybrid"
          collaborators={collaborators}
          followingUserId={null}
          isAudioMuted={false}
          isRunningCode={false}
          showSidebar={true}
          {...callbacks}
        />
      );

      // Left controls: Sidebar toggle + Back to dashboard + Rename
      fireEvent.click(screen.getByRole('button', { name: 'Hide Explorer Sidebar' }));
      expect(callbacks.onToggleSidebar).toHaveBeenCalledTimes(1);

      fireEvent.click(screen.getByRole('button', { name: 'Back to Projects Dashboard' }));
      expect(callbacks.onBackToDashboard).toHaveBeenCalledTimes(1);

      // Rename project (Escape cancels, Enter submits)
      fireEvent.click(screen.getByRole('button', { name: 'Rename project Obsidian Workspace' }));
      const nameInput = screen.getByLabelText('Project Name');
      fireEvent.change(nameInput, { target: { value: 'Temp Name' } });
      fireEvent.keyDown(nameInput, { key: 'Escape' });
      expect(callbacks.onRenameProject).not.toHaveBeenCalled();

      fireEvent.click(screen.getByRole('button', { name: 'Rename project Obsidian Workspace' }));
      const nameInput2 = screen.getByLabelText('Project Name');
      fireEvent.change(nameInput2, { target: { value: 'Obsidian Studio v2' } });
      fireEvent.keyDown(nameInput2, { key: 'Enter' });
      expect(callbacks.onRenameProject).toHaveBeenCalledWith('Obsidian Studio v2');

      // Center action bar buttons
      fireEvent.click(screen.getByRole('button', { name: 'Execute Code (Sandbox)' }));
      expect(callbacks.onRunCode).toHaveBeenCalledTimes(1);

      fireEvent.click(screen.getByRole('button', { name: 'Search in Project (Ctrl+Shift+F)' }));
      expect(callbacks.onOpenSearch).toHaveBeenCalledTimes(1);

      fireEvent.click(screen.getByRole('button', { name: 'Version History & Diff' }));
      expect(callbacks.onOpenHistory).toHaveBeenCalledTimes(1);

      fireEvent.click(screen.getByRole('button', { name: 'Export Workspace as ZIP' }));
      expect(callbacks.onExportZip).toHaveBeenCalledTimes(1);

      // Collaborator stack (+1 overflow badge, self disabled, follow click)
      expect(screen.getByText('+1')).toBeTruthy();
      const selfAvatar = screen.getByRole('button', { name: 'Alice Owner (You)' }) as HTMLButtonElement;
      expect(selfAvatar.disabled).toBe(true);
      fireEvent.click(screen.getByRole('button', { name: /Follow Bob Dev/ }));
      expect(callbacks.onToggleFollow).toHaveBeenCalledWith('u-2');

      // Transport menu open + select + Escape close
      const transportBtn = screen.getByRole('button', { name: 'Select Transport Mode' });
      fireEvent.click(transportBtn);
      fireEvent.click(screen.getByRole('menuitemradio', { name: 'WebSocket Only' }));
      expect(callbacks.onTransportChange).toHaveBeenCalledWith('WebSocket Only');
      expect(screen.queryByRole('menu', { name: 'Transport modes' })).toBeNull();

      fireEvent.click(transportBtn);
      expect(screen.getByRole('menu', { name: 'Transport modes' })).toBeTruthy();
      fireEvent.keyDown(window, { key: 'Escape' });
      expect(screen.queryByRole('menu', { name: 'Transport modes' })).toBeNull();

      // Audio toggle + Share button
      fireEvent.click(screen.getByRole('button', { name: 'Mute Sound Effects' }));
      expect(callbacks.onToggleAudio).toHaveBeenCalledTimes(1);

      fireEvent.click(screen.getByRole('button', { name: 'Share workspace' }));
      expect(callbacks.onOpenShare).toHaveBeenCalledTimes(1);

      // User menu: Projects Dashboard, Reset Layout, Log out
      const userMenuBtn = screen.getByRole('button', { name: 'User Account Menu' });
      fireEvent.click(userMenuBtn);
      fireEvent.click(screen.getByRole('menuitem', { name: 'Projects Dashboard' }));
      expect(callbacks.onBackToDashboard).toHaveBeenCalledTimes(2);

      // Reset Layout clears obsidian.layout.* keys
      localStorage.setItem('obsidian.layout.sidebar', '300');
      localStorage.setItem('obsidian.keep', 'yes');
      const originalLocation = window.location;
      const reloadSpy = vi.fn();
      Object.defineProperty(window, 'location', {
        configurable: true,
        value: { ...originalLocation, reload: reloadSpy },
      });
      try {
        fireEvent.click(userMenuBtn);
        fireEvent.click(screen.getByRole('menuitem', { name: 'Reset Layout' }));
        expect(localStorage.getItem('obsidian.layout.sidebar')).toBeNull();
        expect(localStorage.getItem('obsidian.keep')).toBe('yes');
        expect(reloadSpy).toHaveBeenCalledTimes(1);
      } finally {
        Object.defineProperty(window, 'location', {
          configurable: true,
          value: originalLocation,
        });
      }

      fireEvent.click(userMenuBtn);
      fireEvent.click(screen.getByRole('menuitem', { name: 'Log out' }));
      expect(callbacks.onLogout).toHaveBeenCalledTimes(1);
    });
  });

  describe('Sidebar File/Folder Creation, Tree Navigation, Filtering, Rename & Delete', () => {
    it('exercises New File, New Folder, folder expand, root reset, filter, rename, delete confirm, and separator resize keys', () => {
      const onSelectFile = vi.fn();
      const onCreateFile = vi.fn();
      const onRenameFile = vi.fn();
      const onDeleteFile = vi.fn();

      render(
        <Sidebar
          files={files}
          activeFileId="f-main"
          onSelectFile={onSelectFile}
          onCreateFile={onCreateFile}
          onRenameFile={onRenameFile}
          onDeleteFile={onDeleteFile}
          userRole="editor"
        />
      );

      // Ancestor folder `src` auto-expanded for activeFileId="f-main"
      expect(screen.getByText('main.ts')).toBeTruthy();

      // Create file inside `src` folder using row New File button, then reset to root
      fireEvent.click(screen.getByRole('button', { name: 'New file inside src' }));
      expect(screen.getByText('in /src')).toBeTruthy();
      fireEvent.click(screen.getByRole('button', { name: 'root' }));
      expect(screen.queryByText('in /src')).toBeNull();

      const createInput = screen.getByLabelText('File name');
      fireEvent.change(createInput, { target: { value: 'app.ts' } });
      fireEvent.keyDown(createInput, { key: 'Enter' });
      expect(onCreateFile).toHaveBeenCalledWith('app.ts', false, null);

      // Create Folder inside `src` after selecting folder via click
      const srcBtn = screen.getByRole('button', { name: /^src$/i });
      // src is currently open; click twice to toggle closed then open (selected)
      fireEvent.click(srcBtn);
      fireEvent.click(srcBtn);
      fireEvent.click(screen.getByRole('button', { name: 'New Folder' }));
      const folderInput = screen.getByLabelText('Folder name');
      fireEvent.change(folderInput, { target: { value: 'utils' } });
      fireEvent.keyDown(folderInput, { key: 'Enter' });
      expect(onCreateFile).toHaveBeenCalledWith('utils', true, 'dir-src');

      // Filter files & clear filter
      const filterInput = screen.getByLabelText('Filter files');
      fireEvent.change(filterInput, { target: { value: 'readme' } });
      expect(screen.queryByText('main.ts')).toBeNull();
      expect(screen.getByText('README.md')).toBeTruthy();
      fireEvent.click(screen.getByRole('button', { name: 'Clear file filter' }));
      expect(screen.getByText('main.ts')).toBeTruthy();

      // Select file
      fireEvent.click(screen.getByRole('button', { name: /^README\.md$/i }));
      expect(onSelectFile).toHaveBeenCalledWith('f-readme');

      // Rename file (hides row buttons while editing, Enter submits)
      fireEvent.click(screen.getByRole('button', { name: 'Rename README.md' }));
      expect(screen.queryByRole('button', { name: 'Delete README.md' })).toBeNull();
      const renameInput = screen.getByLabelText('Rename file');
      fireEvent.change(renameInput, { target: { value: 'GUIDE.md' } });
      fireEvent.keyDown(renameInput, { key: 'Enter' });
      expect(onRenameFile).toHaveBeenCalledWith('f-readme', 'GUIDE.md');

      // Delete file -> ConfirmDialog -> Delete
      fireEvent.click(screen.getByRole('button', { name: 'Delete README.md' }));
      expect(screen.getByText('Delete README.md?')).toBeTruthy();
      fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
      expect(onDeleteFile).toHaveBeenCalledWith('f-readme');

      // Separator keyboard resize
      const separator = screen.getByRole('separator');
      fireEvent.keyDown(separator, { key: 'ArrowRight' });
      expect(Number(separator.getAttribute('aria-valuenow'))).toBe(272);
      fireEvent.keyDown(separator, { key: 'Home' });
      expect(Number(separator.getAttribute('aria-valuenow'))).toBe(256);
    });
  });

  describe('EditorWorkspace Tabs, Split Panes & Follow Banner', () => {
    it('switches tabs, closes tabs, toggles vertical/horizontal split, changes split file, resizes splitter, and stops following', async () => {
      const onSelectFile = vi.fn();
      const onCloseTab = vi.fn();
      const onStopFollowing = vi.fn();

      render(
        <EditorWorkspace
          projectId="proj-1"
          files={files}
          openFileIds={['f-main', 'f-readme']}
          activeFileId="f-main"
          onSelectFile={onSelectFile}
          onCloseTab={onCloseTab}
          userRole="viewer"
          user={{ id: 'u-1', name: 'Alice' }}
          collaborators={[
            { id: 'u-2', name: 'Bob', color: '#34785c', role: 'editor', cursor: { line: 4, column: 2 } },
          ]}
          followingUserId="u-2"
          diagnostics={[]}
          onCursorChange={vi.fn()}
          onContentChange={vi.fn()}
          onCreateCheckpoint={vi.fn()}
          onStopFollowing={onStopFollowing}
        />
      );

      // Viewer read-only badge and Follow banner
      expect(screen.getByText('Read-only')).toBeTruthy();
      expect(screen.getByText('Bob')).toBeTruthy();
      fireEvent.click(screen.getByRole('button', { name: 'Stop Following' }));
      expect(onStopFollowing).toHaveBeenCalledTimes(1);

      // Select README tab & close main tab
      fireEvent.click(screen.getByRole('tab', { name: 'File README.md' }));
      expect(onSelectFile).toHaveBeenCalledWith('f-readme');

      fireEvent.click(screen.getByRole('button', { name: 'Close tab main.ts' }));
      expect(onCloseTab).toHaveBeenCalledWith('f-main');

      // Split Editor Right & Down
      const splitRightBtn = screen.getByRole('button', { name: 'Split Editor Right' });
      fireEvent.click(splitRightBtn);
      expect(splitRightBtn.getAttribute('aria-pressed')).toBe('true');
      expect(screen.getByText('Split Pane')).toBeTruthy();

      const splitSelect = screen.getByLabelText('Select file for split pane') as HTMLSelectElement;
      fireEvent.change(splitSelect, { target: { value: 'f-main' } });
      expect(splitSelect.value).toBe('f-main');

      const splitSeparator = screen.getByRole('separator', { name: 'Resize split editor panes' });
      fireEvent.keyDown(splitSeparator, { key: 'ArrowRight' });
      expect(splitSeparator.getAttribute('aria-valuenow')).toBe('55');
      fireEvent.keyDown(splitSeparator, { key: 'Home' });
      expect(splitSeparator.getAttribute('aria-valuenow')).toBe('50');

      const splitDownBtn = screen.getByRole('button', { name: 'Split Editor Down' });
      fireEvent.click(splitDownBtn);
      expect(splitDownBtn.getAttribute('aria-pressed')).toBe('true');
      fireEvent.keyDown(screen.getByRole('separator', { name: 'Resize split editor panes' }), { key: 'ArrowDown' });
      expect(screen.getByRole('separator', { name: 'Resize split editor panes' }).getAttribute('aria-valuenow')).toBe('55');

      // Close Split Pane button
      fireEvent.click(screen.getByRole('button', { name: 'Close Split Pane' }));
      expect(screen.queryByText('Split Pane')).toBeNull();
    });
  });

  describe('BottomPanel Tabs, Terminal Commands, Problems & Preview + StatusBar', () => {
    it('exercises OUTPUT clear, TERMINAL commands/history/clear, PROBLEMS row click, PREVIEW refresh, collapse toggle, and StatusBar', async () => {
      mockApi.getRuntimes.mockResolvedValue({
        runtimes: [{ language: 'javascript', available: true, version: 'v24.0.0' }],
      });
      const onToggle = vi.fn();
      const onTabChange = vi.fn();
      const onClearOutput = vi.fn();
      const onSelectProblem = vi.fn();
      const onRefreshPreview = vi.fn();
      const onRunTerminalCommand = vi.fn().mockResolvedValue({
        stdout: ['Ran ok'],
        stderr: [],
        exitCode: 0,
        language: 'javascript',
        executionTimeMs: 8,
        timestamp: new Date().toISOString(),
      });

      const diagnostics: DiagnosticsItem[] = [
        {
          id: 'd-1',
          fileId: 'f-main',
          fileName: 'main.ts',
          line: 3,
          column: 5,
          endLine: 3,
          endColumn: 10,
          message: 'Unexpected var',
          severity: 'warning',
          source: 'Lint Rule',
        },
      ];

      const { rerender } = render(
        <div>
          <BottomPanel
            isOpen={true}
            onToggle={onToggle}
            activeTab="OUTPUT"
            onTabChange={onTabChange}
            executionResult={{
              stdout: ['Hello'],
              stderr: [],
              exitCode: 0,
              language: 'javascript',
              executionTimeMs: 5,
              timestamp: new Date().toISOString(),
            }}
            onClearOutput={onClearOutput}
            diagnostics={diagnostics}
            onSelectProblem={onSelectProblem}
            previewHtml="<h1>Hi</h1>"
            onRefreshPreview={onRefreshPreview}
            onRunTerminalCommand={onRunTerminalCommand}
          />
          <StatusBar
            isOnline={true}
            saveState="saved"
            lastSavedAt={Date.now()}
            transportMode="Hybrid"
            errorCount={0}
            warnCount={1}
            currentLanguage="typescript"
            cursorLine={3}
            cursorColumn={5}
            userRole="editor"
            onOpenProblems={() => onTabChange('PROBLEMS')}
          />
        </div>
      );

      // OUTPUT Clear button
      fireEvent.click(screen.getByRole('button', { name: 'Clear Output' }));
      expect(onClearOutput).toHaveBeenCalledTimes(1);

      // StatusBar Problems button
      fireEvent.click(screen.getByRole('button', { name: /0 errors, 1 warnings/ }));
      expect(onTabChange).toHaveBeenCalledWith('PROBLEMS');

      // Switch to TERMINAL
      fireEvent.click(screen.getByRole('tab', { name: 'TERMINAL' }));
      expect(onTabChange).toHaveBeenCalledWith('TERMINAL');

      rerender(
        <BottomPanel
          isOpen={true}
          onToggle={onToggle}
          activeTab="TERMINAL"
          onTabChange={onTabChange}
          executionResult={null}
          onClearOutput={onClearOutput}
          diagnostics={diagnostics}
          onSelectProblem={onSelectProblem}
          previewHtml="<h1>Hi</h1>"
          onRefreshPreview={onRefreshPreview}
          onRunTerminalCommand={onRunTerminalCommand}
        />
      );

      const termInput = screen.getByLabelText('Terminal command') as HTMLInputElement;
      const form = termInput.closest('form')!;

      // help command
      fireEvent.change(termInput, { target: { value: 'help' } });
      fireEvent.submit(form);
      expect(screen.getByText(/Available commands:/)).toBeTruthy();

      // runtimes command
      fireEvent.change(termInput, { target: { value: 'runtimes' } });
      fireEvent.submit(form);
      await waitFor(() => {
        expect(screen.getByText(/Server Runtimes:/)).toBeTruthy();
        expect(screen.getByText(/v24\.0\.0/)).toBeTruthy();
      });

      // run command
      fireEvent.change(termInput, { target: { value: 'run main.ts' } });
      fireEvent.submit(form);
      await waitFor(() => {
        expect(onRunTerminalCommand).toHaveBeenCalledWith('run main.ts');
        expect(screen.getByText('Ran ok')).toBeTruthy();
      });

      // ArrowUp history recall
      fireEvent.keyDown(termInput, { key: 'ArrowUp' });
      expect(termInput.value).toBe('run main.ts');
      fireEvent.keyDown(termInput, { key: 'ArrowUp' });
      expect(termInput.value).toBe('runtimes');
      fireEvent.keyDown(termInput, { key: 'ArrowDown' });
      expect(termInput.value).toBe('run main.ts');

      // Clear Terminal button
      fireEvent.click(screen.getByRole('button', { name: 'Clear Terminal Console' }));
      expect(screen.queryByText('Ran ok')).toBeNull();

      // Switch to PROBLEMS and click problem row
      rerender(
        <BottomPanel
          isOpen={true}
          onToggle={onToggle}
          activeTab="PROBLEMS"
          onTabChange={onTabChange}
          executionResult={null}
          onClearOutput={onClearOutput}
          diagnostics={diagnostics}
          onSelectProblem={onSelectProblem}
          previewHtml="<h1>Hi</h1>"
          onRefreshPreview={onRefreshPreview}
          onRunTerminalCommand={onRunTerminalCommand}
        />
      );
      fireEvent.click(screen.getByRole('button', { name: /Unexpected var/ }));
      expect(onSelectProblem).toHaveBeenCalledWith('f-main', 3, 5);

      // Switch to PREVIEW and click Refresh Preview + Collapse panel
      rerender(
        <BottomPanel
          isOpen={true}
          onToggle={onToggle}
          activeTab="PREVIEW"
          onTabChange={onTabChange}
          executionResult={null}
          onClearOutput={onClearOutput}
          diagnostics={diagnostics}
          onSelectProblem={onSelectProblem}
          previewHtml="<h1>Hi</h1>"
          onRefreshPreview={onRefreshPreview}
          onRunTerminalCommand={onRunTerminalCommand}
        />
      );
      fireEvent.click(screen.getByRole('button', { name: 'Refresh Preview' }));
      expect(onRefreshPreview).toHaveBeenCalledTimes(1);

      fireEvent.click(screen.getByRole('button', { name: 'Collapse Bottom Panel' }));
      expect(onToggle).toHaveBeenCalledTimes(1);
    });
  });
});
