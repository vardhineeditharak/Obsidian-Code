import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { Header } from '../src/components/workspace/Header';
import { Project, User } from '../src/lib/types';

describe('Workspace Header Project Name & Role Badge (Step 1)', () => {
  const dummyUser: User = {
    _id: 'user-1',
    name: 'Alice Developer',
    email: 'alice@example.com',
  };

  const createProps = (overrides?: { projectName?: string; role?: 'owner' | 'editor' | 'viewer' }) => {
    const project: Project = {
      _id: 'proj-1',
      name: overrides?.projectName !== undefined ? overrides.projectName : 'Alpha Project',
      ownerId: 'user-1',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    return {
      project,
      user: dummyUser,
      userRole: overrides?.role || 'owner',
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
    };
  };

  it('renders project.name as the primary label and owner role in a distinct secondary badge pill', () => {
    const props = createProps({ projectName: 'Super Cool App', role: 'owner' });
    const html = renderToString(React.createElement(Header, props));

    // Must prominently display project name
    expect(html).toContain('Super Cool App');

    // Must render Owner in secondary pill
    expect(html).toContain('Owner');

    // Role badge should be wrapped in font-mono uppercase pill styling
    expect(html).toMatch(/<span[^>]*font-mono[^>]*text-\[10px\][^>]*>Owner<\/span>/);
  });

  it("renders 'Untitled Project' fallback when project.name is empty or whitespace", () => {
    const propsEmpty = createProps({ projectName: '', role: 'owner' });
    const htmlEmpty = renderToString(React.createElement(Header, propsEmpty));
    expect(htmlEmpty).toContain('Untitled Project');

    const propsWhitespace = createProps({ projectName: '   ', role: 'owner' });
    const htmlWhitespace = renderToString(React.createElement(Header, propsWhitespace));
    expect(htmlWhitespace).toContain('Untitled Project');
  });

  it('renders editor and viewer roles in secondary badge pill without mistaking role for title', () => {
    const propsEditor = createProps({ projectName: 'Docs Portal', role: 'editor' });
    const htmlEditor = renderToString(React.createElement(Header, propsEditor));
    expect(htmlEditor).toContain('Docs Portal');
    expect(htmlEditor).toContain('Editor');

    const propsViewer = createProps({ projectName: 'Read Only Project', role: 'viewer' });
    const htmlViewer = renderToString(React.createElement(Header, propsViewer));
    expect(htmlViewer).toContain('Read Only Project');
    expect(htmlViewer).toContain('Viewer');
  });

  it('shows save state in the header indicator (saving, saved, offline, idle)', () => {
    const propsSaving = { ...createProps(), saveState: 'saving' as const };
    const htmlSaving = renderToString(React.createElement(Header, propsSaving));
    expect(htmlSaving).toContain('Saving…');

    const propsSaved = { ...createProps(), saveState: 'saved' as const, lastSavedAt: Date.now() };
    const htmlSaved = renderToString(React.createElement(Header, propsSaved));
    expect(htmlSaved).toContain('All changes saved');

    const propsOffline = { ...createProps(), saveState: 'offline' as const };
    const htmlOffline = renderToString(React.createElement(Header, propsOffline));
    expect(htmlOffline).toContain('Saved locally · will sync');
  });

  it('renders project name even when provided through Mongoose-style _doc property', () => {
    const mongooseLikeProject: any = {
      _id: 'proj-mongoose-1',
      ownerId: 'user-1',
      _doc: { name: 'Mongoose Preserved Project' },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    const resolvedName = mongooseLikeProject.name ?? mongooseLikeProject._doc?.name;
    const props = createProps({ projectName: resolvedName, role: 'owner' });
    const html = renderToString(React.createElement(Header, props));
    expect(html).toContain('Mongoose Preserved Project');
    expect(html).not.toContain('Untitled Project');
  });
});

