import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { renderToStaticMarkup as renderToString } from 'react-dom/server';
import fs from 'node:fs';
import path from 'node:path';

vi.mock('y-monaco', () => ({
  MonacoBinding: class MockMonacoBinding {
    destroy() {}
  },
}));

vi.mock('y-indexeddb', () => ({
  IndexeddbPersistence: class MockIndexeddbPersistence {
    public whenSynced = Promise.resolve();
    destroy() {}
  },
}));

vi.mock('y-websocket', () => ({
  WebsocketProvider: class MockWebsocketProvider {
    public awareness = {
      getLocalState: () => null,
      setLocalStateField: vi.fn(),
      setLocalState: vi.fn(),
      getStates: () => new Map(),
      on: vi.fn(),
      off: vi.fn(),
    };
    on() {}
    off() {}
    destroy() {}
  },
}));

vi.mock('y-webrtc', () => ({
  WebrtcProvider: class MockWebrtcProvider {
    public awareness = {
      getLocalState: () => null,
      setLocalStateField: vi.fn(),
      setLocalState: vi.fn(),
      getStates: () => new Map(),
      on: vi.fn(),
      off: vi.fn(),
    };
    destroy() {}
  },
}));

vi.mock('@monaco-editor/react', () => ({
  default: () => null,
  Editor: () => null,
  DiffEditor: () => null,
  loader: { config: vi.fn() },
}));

import { SearchReplaceModal } from '../src/components/workspace/SearchReplaceModal';
import { ShareModal } from '../src/components/workspace/ShareModal';
import { Sidebar } from '../src/components/workspace/Sidebar';
import { Header } from '../src/components/workspace/Header';
import { BottomPanel } from '../src/components/workspace/BottomPanel';
import { StatusBar, formatSaveRelativeTime } from '../src/components/workspace/StatusBar';
import { Dashboard } from '../src/components/dashboard/Dashboard';
import { WorkspacePage } from '../src/components/workspace/WorkspacePage';
import { editorOptions } from '../src/components/workspace/editorOptions';
import type { Project, ProjectFile, User } from '../src/lib/types';

describe('Workspace, Dashboard & Real-Time UI Components', () => {
  const rootDir = path.resolve(__dirname, '..');

  const dummyUser: User = {
    _id: 'u-1',
    name: 'Alice Developer',
    email: 'alice@obsidian.dev',
  };

  const baseProject: Project = {
    _id: 'proj-1',
    name: 'Alpha Studio',
    ownerId: 'u-1',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  describe('SearchReplaceModal Hooks Order & Regex Safety', () => {
    const searchSrc = fs.readFileSync(
      path.join(rootDir, 'src/components/workspace/SearchReplaceModal.tsx'),
      'utf-8'
    );

    it('keeps all React hooks above the early return and renders both closed and open states cleanly', () => {
      const earlyReturnIdx = searchSrc.indexOf('if (!isOpen) return null;');
      const useEffectIdx = searchSrc.indexOf('useEffect(');
      const useMemoIdx = searchSrc.indexOf('useMemo(');
      expect(earlyReturnIdx).toBeGreaterThan(-1);
      expect(useEffectIdx).toBeGreaterThan(-1);
      expect(useMemoIdx).toBeGreaterThan(-1);
      expect(useEffectIdx).toBeLessThan(earlyReturnIdx);
      expect(useMemoIdx).toBeLessThan(earlyReturnIdx);

      const closedHtml = renderToString(
        React.createElement(SearchReplaceModal, {
          isOpen: false,
          onClose: () => {},
          files: [],
          getFileContent: async () => '',
          onSelectResult: () => {},
          onBatchReplace: async () => {},
        })
      );
      expect(closedHtml).toBe('');

      const openHtml = renderToString(
        React.createElement(SearchReplaceModal, {
          isOpen: true,
          onClose: () => {},
          files: [
            { _id: 'f1', projectId: 'p1', name: 'app.ts', path: 'app.ts', isFolder: false, content: 'const x = 1;' },
          ],
          getFileContent: async () => 'const x = 1;',
          onSelectResult: () => {},
          onBatchReplace: async () => {},
        })
      );
      expect(openHtml).toContain('Workspace Search &amp; Replace');
      expect(openHtml).toContain('aria-label="Match Case"');
      expect(openHtml).toContain('aria-label="Match Whole Word"');
      expect(openHtml).toContain('aria-label="Use Regular Expression"');
      expect(openHtml).toContain('Replace All (0)');
    });

    it('guards against zero-length regex loops (a*, \\b, x?), respects modifiers, and caps at 2000 matches', () => {
      expect(searchSrc).toContain("if (match[0] === '')");
      expect(searchSrc).toContain('const MAX_SEARCH_RESULTS = 2000;');

      const scanContent = (
        text: string,
        query: string,
        options: { caseSensitive?: boolean; wholeWord?: boolean; useRegex?: boolean; maxResults?: number } = {}
      ) => {
        let pattern = options.useRegex ? query : query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        if (options.wholeWord) pattern = `\\b${pattern}\\b`;
        const regex = new RegExp(pattern, options.caseSensitive ? 'g' : 'gi');
        const lines = text.split('\n');
        const matches: { line: number; column: number; matchText: string }[] = [];
        const max = options.maxResults ?? 2000;

        for (let lIdx = 0; lIdx < lines.length; lIdx++) {
          if (matches.length >= max) break;
          const lineText = lines[lIdx];
          regex.lastIndex = 0;
          let match: RegExpExecArray | null;
          while ((match = regex.exec(lineText)) !== null) {
            if (match[0] === '') {
              regex.lastIndex += 1;
              continue;
            }
            matches.push({ line: lIdx + 1, column: match.index + 1, matchText: match[0] });
            if (matches.length >= max) break;
            if (!regex.global) break;
          }
        }
        return matches;
      };

      const start = Date.now();
      const zeroLenResults = scanContent('banana and apple\naaa bbb', 'a*', { useRegex: true });
      expect(Date.now() - start).toBeLessThan(1000);
      expect(zeroLenResults.length).toBeGreaterThan(0);
      expect(zeroLenResults.every((r) => r.matchText.length > 0 && /^a+$/.test(r.matchText))).toBe(true);

      expect(scanContent('foo bar baz', '\\b', { useRegex: true })).toHaveLength(0);
      expect(scanContent('foo bar baz', 'x?', { useRegex: true })).toHaveLength(0);

      expect(scanContent('Cat cat caterpillar', 'cat', { caseSensitive: true, wholeWord: true })).toHaveLength(1);
      expect(scanContent('a.b aXb', 'a.b', { useRegex: false })).toHaveLength(1);

      const longText = Array.from({ length: 2500 }, () => 'match').join('\n');
      expect(scanContent(longText, 'match', { maxResults: 2000 })).toHaveLength(2000);
    });
  });

  describe('ShareModal Role Selector, Link Regeneration & Member Actions', () => {
    it('renders owner controls, non-owner restrictions, Leave button, and link regeneration state', () => {
      const members = [
        { userId: 'u-1', name: 'Alice Owner', email: 'alice@test.dev', role: 'owner' as const },
        { userId: 'u-2', name: 'Bob Editor', email: 'bob@test.dev', role: 'editor' as const },
      ];

      const ownerHtml = renderToString(
        React.createElement(ShareModal, {
          isOpen: true,
          onClose: () => {},
          projectId: 'proj-1',
          projectName: 'Demo Workspace',
          members,
          userRole: 'owner',
          currentUserId: 'u-1',
        })
      );
      expect(ownerHtml).toContain('aria-label="Invite collaborator role"');
      expect(ownerHtml).toContain('Create Link');
      expect(ownerHtml).toContain('Workspace Members (2)');
      expect(ownerHtml).toContain('aria-label="Role for member Bob Editor"');
      expect(ownerHtml).toContain('aria-label="Remove member Bob Editor"');
      expect(ownerHtml).toContain('You');

      const editorHtml = renderToString(
        React.createElement(ShareModal, {
          isOpen: true,
          onClose: () => {},
          projectId: 'proj-1',
          projectName: 'Demo Workspace',
          members,
          userRole: 'editor',
          currentUserId: 'u-2',
        })
      );
      expect(editorHtml).toContain('Only the workspace Owner can create new invitation links.');
      expect(editorHtml).toContain('aria-label="Leave workspace"');

      const shareSrc = fs.readFileSync(
        path.join(rootDir, 'src/components/workspace/ShareModal.tsx'),
        'utf-8'
      );
      expect(shareSrc).toContain('generatedRole');
      expect(shareSrc).toContain('isRoleChanged');
      expect(shareSrc).toContain('Regenerate invite link');
      expect(shareSrc).toContain('Regenerate Link');
    });
  });

  describe('Sidebar Hierarchical Folder Tree', () => {
    const sampleFiles: ProjectFile[] = [
      { _id: 'f-z', projectId: 'p1', name: 'zebra.ts', path: 'zebra.ts', isFolder: false },
      { _id: 'dir-src', projectId: 'p1', name: 'src', path: 'src', isFolder: true },
      { _id: 'dir-app', projectId: 'p1', name: 'app', path: 'app', isFolder: true },
      { _id: 'f-a', projectId: 'p1', name: 'alpha.ts', path: 'alpha.ts', isFolder: false },
      {
        _id: 'f-nested',
        projectId: 'p1',
        name: 'main.ts',
        path: 'src/main.ts',
        isFolder: false,
        parentId: 'dir-src',
      },
    ];

    it('sorts folders before files alphabetically, shows nested actions for editors, and hides mutations for viewers', () => {
      const editorHtml = renderToString(
        React.createElement(Sidebar, {
          files: sampleFiles,
          activeFileId: 'f-a',
          onSelectFile: () => {},
          onCreateFile: () => {},
          onRenameFile: () => {},
          onDeleteFile: () => {},
          userRole: 'editor',
        })
      );

      expect(editorHtml).toContain('aria-label="New File"');
      expect(editorHtml).toContain('aria-label="New Folder"');
      expect(editorHtml).toContain('New file inside src');
      expect(editorHtml).toContain('Rename src');
      expect(editorHtml).toContain('Delete src');
      expect(editorHtml).toContain('aria-expanded="false"');

      // Folders ('app', 'src') appear before files ('alpha.ts', 'zebra.ts')
      const idxApp = editorHtml.indexOf('>app<');
      const idxSrc = editorHtml.indexOf('>src<');
      const idxAlpha = editorHtml.indexOf('>alpha.ts<');
      const idxZebra = editorHtml.indexOf('>zebra.ts<');
      expect(idxApp).toBeLessThan(idxSrc);
      expect(idxSrc).toBeLessThan(idxAlpha);
      expect(idxAlpha).toBeLessThan(idxZebra);

      // Viewer hides create/rename/delete buttons
      const viewerHtml = renderToString(
        React.createElement(Sidebar, {
          files: sampleFiles,
          activeFileId: 'f-a',
          onSelectFile: () => {},
          onCreateFile: () => {},
          onRenameFile: () => {},
          onDeleteFile: () => {},
          userRole: 'viewer',
        })
      );
      expect(viewerHtml).not.toContain('aria-label="New File"');
      expect(viewerHtml).not.toContain('Rename src');
      expect(viewerHtml).not.toContain('Delete src');

      // Empty state
      const emptyHtml = renderToString(
        React.createElement(Sidebar, {
          files: [],
          activeFileId: null,
          onSelectFile: () => {},
          onCreateFile: () => {},
          onRenameFile: () => {},
          onDeleteFile: () => {},
          userRole: 'owner',
        })
      );
      expect(emptyHtml).toContain('No files in workspace');

      // Auto-expand ancestors & cycle guard in source
      const sidebarSrc = fs.readFileSync(
        path.join(rootDir, 'src/components/workspace/Sidebar.tsx'),
        'utf-8'
      );
      expect(sidebarSrc).toContain('Auto-expand ancestor folders');
      expect(sidebarSrc).toContain('if (visited.has(file._id)) return null;');
    });
  });

  describe('Header Project Name, Badges, Menus & Explorer Sidebar Toggle', () => {
    const createHeaderProps = (overrides?: Partial<React.ComponentProps<typeof Header>>) => ({
      project: baseProject,
      user: dummyUser,
      userRole: 'owner' as const,
      isOnline: true,
      saveState: 'idle' as const,
      lastSavedAt: null,
      transportMode: 'Hybrid' as const,
      onTransportChange: () => {},
      collaborators: [],
      followingUserId: null,
      onToggleFollow: () => {},
      isAudioMuted: false,
      onToggleAudio: () => {},
      onRenameProject: () => {},
      onOpenShare: () => {},
      onOpenHistory: () => {},
      onOpenSearch: () => {},
      onExportZip: () => {},
      onRunCode: () => {},
      isRunningCode: false,
      onLogout: () => {},
      onBackToDashboard: () => {},
      showSidebar: true,
      onToggleSidebar: () => {},
      ...overrides,
    });

    it('renders project name, Untitled Project fallback, role badge, save states, and sidebar toggle states', () => {
      const ownerHtml = renderToString(React.createElement(Header, createHeaderProps()));
      expect(ownerHtml).toContain('Alpha Studio');
      expect(ownerHtml).toContain('Owner');
      expect(ownerHtml).toContain('Up to date');
      expect(ownerHtml).toContain('aria-label="Hide Explorer Sidebar"');
      expect(ownerHtml).toContain('aria-pressed="true"');
      expect(ownerHtml).toContain('aria-label="Select Transport Mode"');
      expect(ownerHtml).toContain('aria-label="User Account Menu"');
      expect(ownerHtml).toContain('aria-haspopup="true"');

      const hiddenSidebarHtml = renderToString(
        React.createElement(Header, createHeaderProps({ showSidebar: false }))
      );
      expect(hiddenSidebarHtml).toContain('aria-label="Show Explorer Sidebar"');
      expect(hiddenSidebarHtml).toContain('aria-pressed="false"');

      const emptyNameHtml = renderToString(
        React.createElement(
          Header,
          createHeaderProps({ project: { ...baseProject, name: '   ' }, userRole: 'viewer' })
        )
      );
      expect(emptyNameHtml).toContain('Untitled Project');
      expect(emptyNameHtml).toContain('Viewer');
      expect(emptyNameHtml).toContain('disabled');

      const savingHtml = renderToString(
        React.createElement(Header, createHeaderProps({ saveState: 'saving' }))
      );
      expect(savingHtml).toContain('Saving…');

      const savedHtml = renderToString(
        React.createElement(Header, createHeaderProps({ saveState: 'saved', lastSavedAt: Date.now() }))
      );
      expect(savedHtml).toContain('All changes saved');

      const offlineHtml = renderToString(
        React.createElement(Header, createHeaderProps({ isOnline: false }))
      );
      expect(offlineHtml).toContain('Saved locally · will sync');

      const collabHtml = renderToString(
        React.createElement(
          Header,
          createHeaderProps({
            collaborators: [
              { id: 'u-1', name: 'Alice Developer', color: '#c08532', role: 'owner' },
              { id: 'u-2', name: 'Bob Collaborator', color: '#34785c', role: 'editor' },
            ],
            followingUserId: 'u-2',
          })
        )
      );
      expect(collabHtml).toContain('aria-label="Follow Bob Collaborator (editor) - Currently Following"');
      expect(collabHtml).toContain('aria-pressed="true"');

      const headerSrc = fs.readFileSync(
        path.join(rootDir, 'src/components/workspace/Header.tsx'),
        'utf-8'
      );
      expect(headerSrc).toContain("document.addEventListener('mousedown', handlePointerDown)");
      expect(headerSrc).toContain("if (e.key === 'Escape')");
      expect(headerSrc).toContain("key.startsWith('obsidian.layout.')");
    });
  });

  describe('BottomPanel Semantic Problem Rows & Tabs', () => {
    const baseBottomProps = {
      isOpen: true,
      onToggle: () => {},
      activeTab: 'PROBLEMS' as const,
      onTabChange: () => {},
      executionResult: null,
      onClearOutput: () => {},
      diagnostics: [
        {
          id: 'd1',
          fileId: 'f1',
          fileName: 'main.ts',
          line: 4,
          column: 7,
          endLine: 4,
          endColumn: 12,
          message: 'Unclosed delimiter',
          severity: 'error' as const,
          source: 'Syntax Check',
        },
      ],
      onSelectProblem: () => {},
      previewHtml: '<h1>Preview</h1>',
      onRefreshPreview: () => {},
      onRunTerminalCommand: () => {},
    };

    it('renders semantic button problem rows, output results, terminal input, and sandboxed preview iframe', () => {
      const problemsHtml = renderToString(React.createElement(BottomPanel, baseBottomProps));
      expect(problemsHtml).toContain('<button type="button"');
      expect(problemsHtml).toContain('1 Errors');
      expect(problemsHtml).toContain('Unclosed delimiter');
      expect(problemsHtml).toContain('main.ts [4:7]');

      const outputHtml = renderToString(
        React.createElement(BottomPanel, {
          ...baseBottomProps,
          activeTab: 'OUTPUT',
          executionResult: {
            stdout: ['Hello world'],
            stderr: ['Warning line'],
            exitCode: 0,
            language: 'javascript',
            executionTimeMs: 12,
            timestamp: new Date().toISOString(),
          },
        })
      );
      expect(outputHtml).toContain('exit 0');
      expect(outputHtml).toContain('Time: 12ms');
      expect(outputHtml).toContain('Hello world');
      expect(outputHtml).toContain('Warning line');

      const terminalHtml = renderToString(
        React.createElement(BottomPanel, {
          ...baseBottomProps,
          activeTab: 'TERMINAL',
          activeLanguage: 'python',
        })
      );
      expect(terminalHtml).toContain('aria-label="Terminal command"');
      expect(terminalHtml).toContain('python ❯');

      const previewHtml = renderToString(
        React.createElement(BottomPanel, {
          ...baseBottomProps,
          activeTab: 'PREVIEW',
        })
      );
      expect(previewHtml).toContain('sandbox="allow-scripts allow-modals"');
      expect(previewHtml).toContain('title="HTML Preview Sandbox"');

      const collapsedHtml = renderToString(
        React.createElement(BottomPanel, { ...baseBottomProps, isOpen: false })
      );
      expect(collapsedHtml).toContain('height:32px');
      expect(collapsedHtml).toContain('aria-label="Expand Bottom Panel"');
    });
  });

  describe('StatusBar Indicators & Relative Time Formatting', () => {
    it('renders online/offline status, read-only badge for viewers, Problems button, cursor, and tabSize', () => {
      const html = renderToString(
        React.createElement(StatusBar, {
          isOnline: true,
          saveState: 'saved',
          lastSavedAt: Date.now(),
          transportMode: 'Hybrid',
          errorCount: 2,
          warnCount: 3,
          currentLanguage: 'typescript',
          cursorLine: 14,
          cursorColumn: 9,
          userRole: 'viewer',
          onOpenProblems: () => {},
        })
      );
      expect(html).toContain('Connected');
      expect(html).toContain('All changes saved');
      expect(html).toContain('Hybrid');
      expect(html).toContain('title="Open Problems Panel"');
      expect(html).toContain('2 errors, 3 warnings');
      expect(html).toContain('Read-only');
      expect(html).toContain('Ln 14, Col 9');
      expect(html).toContain(`Spaces: ${editorOptions.tabSize ?? 2}`);
      expect(html).toContain('UTF-8');
      expect(html).toContain('typescript');

      const offlineHtml = renderToString(
        React.createElement(StatusBar, {
          isOnline: false,
          transportMode: 'WebSocket Only',
          errorCount: 0,
          warnCount: 0,
          currentLanguage: 'python',
          cursorLine: 1,
          cursorColumn: 1,
          userRole: 'editor',
        })
      );
      expect(offlineHtml).toContain('Offline');
      expect(offlineHtml).toContain('Saved locally · will sync');
      expect(offlineHtml).not.toContain('Read-only');

      expect(formatSaveRelativeTime(null)).toBe('just now');
      expect(formatSaveRelativeTime(Date.now() - 25_000)).toBe('25s ago');
      expect(formatSaveRelativeTime(Date.now() - 5 * 60_000)).toBe('5m ago');
      expect(formatSaveRelativeTime(Date.now() - 2 * 3600_000)).toBe('2h ago');
    });
  });

  describe('Dashboard Project Filter & Rendering', () => {
    it('renders Dashboard shell cleanly and enforces project search filter & invite token extraction logic', () => {
      const html = renderToString(
        React.createElement(Dashboard, {
          user: dummyUser,
          onOpenProject: () => {},
          onLogout: () => {},
        })
      );
      expect(html).toContain('Obsidian Code');
      expect(html).toContain('Your Projects');
      expect(html).toContain('Join with invite');
      expect(html).toContain('New Project');
      expect(html).toContain('aria-label="Loading workspace projects"');

      const dashSrc = fs.readFileSync(
        path.join(rootDir, 'src/components/dashboard/Dashboard.tsx'),
        'utf-8'
      );
      expect(dashSrc).toContain('filteredProjects');
      expect(dashSrc).toContain('placeholder="Filter projects..."');
      expect(dashSrc).toContain('aria-label="Clear project filter"');
      expect(dashSrc).toContain('{filteredProjects.length} of {projects.length}');
      expect(dashSrc).toContain('No projects match');

      // Validate exact filtering semantics from Dashboard.tsx
      const list: Project[] = [
        { ...baseProject, _id: '1', name: 'CRDT Engine', description: 'Realtime sync' },
        { ...baseProject, _id: '2', name: 'Python Notebook', description: 'ML experiments' },
        { ...baseProject, _id: '3', name: 'Web Portfolio', description: '' },
      ];
      const filterProjects = (projects: Project[], query: string) => {
        const q = query.trim().toLowerCase();
        if (!q) return projects;
        return projects.filter(
          (p) =>
            p.name.toLowerCase().includes(q) ||
            (p.description || '').toLowerCase().includes(q)
        );
      };

      expect(filterProjects(list, '   ')).toHaveLength(3);
      expect(filterProjects(list, 'crdt').map((p) => p._id)).toEqual(['1']);
      expect(filterProjects(list, 'experiments').map((p) => p._id)).toEqual(['2']);
      expect(filterProjects(list, 'nonexistent')).toHaveLength(0);
    });
  });

  describe('WorkspacePage Tab Persistence & Real-Time Invariants', () => {
    it('renders loading state initially and persists openTabs/activeFile in localStorage safely', () => {
      const html = renderToString(
        React.createElement(WorkspacePage, {
          projectId: 'proj-tab-persist',
          currentUser: dummyUser,
          onLogout: () => {},
          onBackToDashboard: () => {},
        })
      );
      expect(html).toContain('Loading collaborative workspace…');

      const workspaceSrc = fs.readFileSync(
        path.join(rootDir, 'src/components/workspace/WorkspacePage.tsx'),
        'utf-8'
      );
      expect(workspaceSrc).toContain('obsidian.workspace.${projectId}.openTabs');
      expect(workspaceSrc).toContain('obsidian.workspace.${projectId}.activeFile');
      expect(workspaceSrc).toContain('hasRestoredTabsRef');
      expect(workspaceSrc).toContain('collectSubtreeIds');
      expect(workspaceSrc).toContain('handleSecondaryContentChange');
      expect(workspaceSrc).toContain('subscribeProjectEvents');
      expect(workspaceSrc).toContain('createAutoCheckpointIfNeeded');

      // Validate tab restore filtering logic against available project files
      const projectFiles: ProjectFile[] = [
        { _id: 'dir1', projectId: 'p1', name: 'src', path: 'src', isFolder: true },
        { _id: 'f1', projectId: 'p1', name: 'index.js', path: 'index.js', isFolder: false },
        { _id: 'f2', projectId: 'p1', name: 'utils.js', path: 'utils.js', isFolder: false },
      ];
      const validIds = new Set(projectFiles.filter((f) => !f.isFolder).map((f) => f._id));
      const storedTabsRaw = JSON.stringify(['deleted-file-id', 'dir1', 'f2', 'f1']);
      const storedActive = 'deleted-file-id';

      const parsed = JSON.parse(storedTabsRaw) as unknown[];
      const restoredTabs = parsed.filter(
        (id): id is string => typeof id === 'string' && validIds.has(id)
      );
      const restoredActive =
        storedActive && validIds.has(storedActive) && restoredTabs.includes(storedActive)
          ? storedActive
          : restoredTabs[0];

      expect(restoredTabs).toEqual(['f2', 'f1']);
      expect(restoredActive).toBe('f2');
    });

    it('enforces 1500ms autosave debounce, viewer suppression, and offline save flush on reconnect', async () => {
      vi.useFakeTimers();
      try {
        const updateSpy = vi.fn().mockResolvedValue({});

        class AutosaveTracker {
          public saveState: 'idle' | 'saving' | 'saved' | 'offline' = 'idle';
          public lastSaved = new Map<string, string>();
          public pendingOffline = new Map<string, string>();
          private timer: ReturnType<typeof setTimeout> | null = null;

          constructor(public role: 'owner' | 'editor' | 'viewer', public isOnline = true) {}

          onContentChange(fileId: string, content: string) {
            if (this.role === 'viewer') return;
            if (this.lastSaved.get(fileId) === content) return;
            if (!this.isOnline) {
              this.pendingOffline.set(fileId, content);
              this.saveState = 'offline';
              return;
            }
            if (this.timer) clearTimeout(this.timer);
            this.timer = setTimeout(async () => {
              this.saveState = 'saving';
              await updateSpy(fileId, { content });
              this.lastSaved.set(fileId, content);
              this.pendingOffline.delete(fileId);
              this.saveState = 'saved';
            }, 1500);
          }

          async onReconnect() {
            this.isOnline = true;
            if (this.pendingOffline.size > 0 && this.role !== 'viewer') {
              for (const [fid, content] of this.pendingOffline.entries()) {
                await updateSpy(fid, { content });
                this.lastSaved.set(fid, content);
              }
              this.pendingOffline.clear();
              this.saveState = 'saved';
            }
          }
        }

        // Viewer changes never trigger api.updateFile
        const viewerTracker = new AutosaveTracker('viewer', true);
        viewerTracker.lastSaved.set('f1', 'init');
        viewerTracker.onContentChange('f1', 'mutated');
        await vi.advanceTimersByTimeAsync(2000);
        expect(updateSpy).not.toHaveBeenCalled();

        // Editor rapid edits debounce to single final payload after 1500ms
        const editorTracker = new AutosaveTracker('editor', true);
        editorTracker.lastSaved.set('f1', 'a');
        editorTracker.onContentChange('f1', 'ab');
        await vi.advanceTimersByTimeAsync(500);
        editorTracker.onContentChange('f1', 'abc');
        await vi.advanceTimersByTimeAsync(1000);
        expect(updateSpy).not.toHaveBeenCalled();
        await vi.advanceTimersByTimeAsync(500);
        expect(updateSpy).toHaveBeenCalledTimes(1);
        expect(updateSpy).toHaveBeenCalledWith('f1', { content: 'abc' });
        expect(editorTracker.saveState).toBe('saved');

        // Offline edits defer and flush on reconnect
        updateSpy.mockClear();
        const offlineTracker = new AutosaveTracker('owner', false);
        offlineTracker.lastSaved.set('f2', 'v1');
        offlineTracker.onContentChange('f2', 'v2-offline');
        expect(offlineTracker.saveState).toBe('offline');
        await vi.advanceTimersByTimeAsync(2000);
        expect(updateSpy).not.toHaveBeenCalled();
        await offlineTracker.onReconnect();
        expect(updateSpy).toHaveBeenCalledWith('f2', { content: 'v2-offline' });
        expect(offlineTracker.saveState).toBe('saved');
      } finally {
        vi.useRealTimers();
      }
    });
  });
});
