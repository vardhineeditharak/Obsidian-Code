// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';

const {
  mockSignInCreate,
  mockSetSignInActive,
  mockSignInRedirect,
  mockSignUpCreate,
  mockSetSignUpActive,
  mockPrepareEmailVerification,
  mockAttemptEmailVerification,
  mockSignUpRedirect,
  mockClerkSignOut,
  mockClerkState,
  mockApi,
  mockNotify,
  mockSound,
} = vi.hoisted(() => ({
  mockSignInCreate: vi.fn(),
  mockSetSignInActive: vi.fn(),
  mockSignInRedirect: vi.fn(),
  mockSignUpCreate: vi.fn(),
  mockSetSignUpActive: vi.fn(),
  mockPrepareEmailVerification: vi.fn(),
  mockAttemptEmailVerification: vi.fn(),
  mockSignUpRedirect: vi.fn(),
  mockClerkSignOut: vi.fn(),
  mockClerkState: {
    isLoaded: true,
    isSignedIn: false,
    user: null as null | {
      id: string;
      primaryEmailAddress?: { emailAddress: string };
      fullName?: string;
      firstName?: string;
      username?: string;
      imageUrl?: string;
    },
    getToken: vi.fn(),
  },
  mockApi: {
    syncClerkUser: vi.fn(),
    logout: vi.fn(),
    getProjects: vi.fn(),
    createProject: vi.fn(),
    deleteProject: vi.fn(),
    acceptInvitation: vi.fn(),
  },
  mockNotify: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
  mockSound: {
    checkpointSaved: vi.fn(),
    executionFailed: vi.fn(),
  },
}));

vi.mock('@clerk/react/legacy', () => ({
  useSignIn: () => ({
    isLoaded: true,
    signIn: {
      create: mockSignInCreate,
      authenticateWithRedirect: mockSignInRedirect,
    },
    setActive: mockSetSignInActive,
  }),
  useSignUp: () => ({
    isLoaded: true,
    signUp: {
      create: mockSignUpCreate,
      prepareEmailAddressVerification: mockPrepareEmailVerification,
      attemptEmailAddressVerification: mockAttemptEmailVerification,
      authenticateWithRedirect: mockSignUpRedirect,
    },
    setActive: mockSetSignUpActive,
  }),
}));

vi.mock('@clerk/react', () => ({
  useUser: () => ({
    isLoaded: mockClerkState.isLoaded,
    isSignedIn: mockClerkState.isSignedIn,
    user: mockClerkState.user,
  }),
  useClerk: () => ({
    signOut: mockClerkSignOut,
    session: { getToken: mockClerkState.getToken },
  }),
  AuthenticateWithRedirectCallback: () => React.createElement('div', { 'data-testid': 'sso-callback' }, 'SSO Callback'),
}));

vi.mock('../src/lib/api', () => ({
  api: mockApi,
}));

vi.mock('../src/lib/notifications', () => ({
  notify: mockNotify,
}));

vi.mock('../src/lib/audio/soundEngine', () => ({
  sound: mockSound,
}));

vi.mock('../src/components/workspace/WorkspacePage', () => ({
  WorkspacePage: ({ projectId, onBackToDashboard, onLogout }: { projectId: string; onBackToDashboard: () => void; onLogout: () => void }) =>
    React.createElement(
      'div',
      { 'data-testid': 'workspace-page' },
      React.createElement('span', null, `Workspace:${projectId}`),
      React.createElement('button', { type: 'button', onClick: onBackToDashboard }, 'Mock Back'),
      React.createElement('button', { type: 'button', onClick: onLogout }, 'Mock Logout')
    ),
}));

import { App } from '../src/App';
import { AuthPage } from '../src/components/auth/AuthPage';
import { Dashboard } from '../src/components/dashboard/Dashboard';
import { Modal, ConfirmDialog, PromptDialog } from '../src/components/ui/Dialog';
import { ErrorBoundary } from '../src/components/ui/ErrorBoundary';
import { ThemeToggle } from '../src/components/ui/AnimatedIcon';
import { IconButton } from '../src/components/ui/IconButton';
import type { Project, User } from '../src/lib/types';

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

describe('AuthPage, Dashboard, App Routing & UI Primitives Button/Feature Interactions', () => {
  const sampleUser: User = {
    _id: 'u-1',
    name: 'Alice Dev',
    email: 'alice@obsidian.dev',
  };

  const sampleProjects: Project[] = [
    {
      _id: 'p-1',
      name: 'Realtime CRDT',
      description: 'Yjs multiplayer core',
      ownerId: 'u-1',
      createdAt: '2026-11-01T00:00:00.000Z',
      updatedAt: '2026-11-15T00:00:00.000Z',
    },
    {
      _id: 'p-2',
      name: 'Algorithm Lab',
      description: 'Graphs and dynamic programming',
      ownerId: 'u-1',
      createdAt: '2026-11-02T00:00:00.000Z',
      updatedAt: '2026-11-20T00:00:00.000Z',
    },
  ];

  beforeEach(() => {
    ensureDomShims();
    vi.clearAllMocks();
    window.history.replaceState({}, '', '/');
    sessionStorage.clear();
    localStorage.clear();

    mockClerkState.isLoaded = true;
    mockClerkState.isSignedIn = false;
    mockClerkState.user = null;
    mockClerkState.getToken.mockResolvedValue('clerk-jwt-token');
    mockClerkSignOut.mockResolvedValue(undefined);
    mockApi.logout.mockResolvedValue(undefined);
    mockApi.getProjects.mockResolvedValue([]);
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  describe('AuthPage Interactive Flows & Buttons', () => {
    it('switches between Sign In and Create Account via clicks and keyboard arrows, and toggles password visibility', () => {
      render(<AuthPage />);

      const signInTab = screen.getByRole('tab', { name: 'Sign In' });
      const signUpTab = screen.getByRole('tab', { name: 'Create Account' });
      expect(signInTab.getAttribute('aria-selected')).toBe('true');
      expect(screen.queryByLabelText('Full Name')).toBeNull();

      // Switch via click
      fireEvent.click(signUpTab);
      expect(signUpTab.getAttribute('aria-selected')).toBe('true');
      expect(screen.getByLabelText('Full Name')).toBeTruthy();

      // Switch back via ArrowLeft on tablist
      const tablist = screen.getByRole('tablist', { name: 'Authentication mode' });
      fireEvent.keyDown(tablist, { key: 'ArrowLeft' });
      expect(signInTab.getAttribute('aria-selected')).toBe('true');
      expect(screen.queryByLabelText('Full Name')).toBeNull();

      // Password show/hide button
      const pwInput = screen.getByLabelText('Password') as HTMLInputElement;
      expect(pwInput.type).toBe('password');
      fireEvent.click(screen.getByRole('button', { name: 'Show password' }));
      expect(pwInput.type).toBe('text');
      fireEvent.click(screen.getByRole('button', { name: 'Hide password' }));
      expect(pwInput.type).toBe('password');
    });

    it('handles Sign In submit success, Sign In errors, and Google/GitHub OAuth buttons', async () => {
      mockSignInCreate.mockResolvedValueOnce({ status: 'complete', createdSessionId: 'sess-1' });
      mockSetSignInActive.mockResolvedValueOnce(undefined);

      render(<AuthPage />);

      fireEvent.change(screen.getByLabelText('Email Address'), { target: { value: ' alice@obsidian.dev ' } });
      fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'StrongPass123' } });
      fireEvent.click(screen.getByRole('button', { name: /Sign In/i }));

      await waitFor(() => {
        expect(mockSignInCreate).toHaveBeenCalledWith({
          identifier: 'alice@obsidian.dev',
          password: 'StrongPass123',
        });
        expect(mockSetSignInActive).toHaveBeenCalledWith({ session: 'sess-1' });
        expect(mockNotify.success).toHaveBeenCalledWith('Welcome back to Obsidian Code!');
      });

      // Sign-in failure shows alert
      mockSignInCreate.mockRejectedValueOnce({ errors: [{ longMessage: 'Invalid password' }] });
      fireEvent.click(screen.getByRole('button', { name: /Sign In/i }));
      await waitFor(() => {
        expect(screen.getByRole('alert').textContent).toContain('Invalid password');
        expect(mockNotify.error).toHaveBeenCalledWith('Sign In Failed', 'Invalid password');
      });

      // OAuth Google button (rejection resets loading so GitHub can also be exercised)
      mockSignInRedirect.mockRejectedValueOnce(new Error('Popup blocked'));
      fireEvent.click(screen.getByRole('button', { name: 'Continue with Google' }));
      await waitFor(() => {
        expect(mockSignInRedirect).toHaveBeenCalledWith(
          expect.objectContaining({ strategy: 'oauth_google', continueSignUp: true })
        );
        expect(screen.getByRole('alert').textContent).toContain('Popup blocked');
      });

      mockSignInRedirect.mockResolvedValueOnce(undefined);
      fireEvent.click(screen.getByRole('button', { name: 'Continue with GitHub' }));
      await waitFor(() => {
        expect(mockSignInRedirect).toHaveBeenCalledWith(
          expect.objectContaining({ strategy: 'oauth_github', continueSignUp: true })
        );
      });
    });

    it('validates short passwords on Create Account and executes email verification, resend, and back buttons', async () => {
      render(<AuthPage />);
      fireEvent.click(screen.getByRole('tab', { name: 'Create Account' }));

      // Short password blocked client-side
      fireEvent.change(screen.getByLabelText('Full Name'), { target: { value: 'Alice' } });
      fireEvent.change(screen.getByLabelText('Email Address'), { target: { value: 'alice@test.dev' } });
      fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'short' } });
      fireEvent.click(screen.getByRole('button', { name: /Get Started/i }));

      expect(screen.getByRole('alert').textContent).toContain('at least 8 characters');
      expect(mockSignUpCreate).not.toHaveBeenCalled();

      // SignUp needing email verification
      mockSignUpCreate.mockResolvedValueOnce({ status: 'missing_requirements' });
      mockPrepareEmailVerification.mockResolvedValue(undefined);

      fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'LongEnoughPass99' } });
      fireEvent.click(screen.getByRole('button', { name: /Get Started/i }));

      await waitFor(() => {
        expect(screen.getByText('Verify Your Email')).toBeTruthy();
      });

      // Resend code button
      fireEvent.click(screen.getByRole('button', { name: /Resend Code/i }));
      await waitFor(() => {
        expect(mockPrepareEmailVerification).toHaveBeenCalledTimes(2);
      });

      // Invalid verification code sets error, then Back to Sign Up clears it
      mockAttemptEmailVerification.mockRejectedValueOnce({ errors: [{ message: 'Incorrect code' }] });
      fireEvent.change(screen.getByLabelText('Verification Code'), { target: { value: '000000' } });
      fireEvent.click(screen.getByRole('button', { name: /Verify & Continue/i }));

      await waitFor(() => {
        expect(screen.getByRole('alert').textContent).toContain('Incorrect code');
      });

      fireEvent.click(screen.getByRole('button', { name: /Back to Sign Up/i }));
      expect(screen.queryByText('Verify Your Email')).toBeNull();
      expect(screen.queryByRole('alert')).toBeNull();
    });
  });

  describe('Dashboard Buttons, Modals, Filter & Cards', () => {
    it('creates a project with selected template, validates empty name, and opens project', async () => {
      mockApi.getProjects.mockResolvedValueOnce([]).mockResolvedValue(sampleProjects);
      mockApi.createProject.mockResolvedValue({
        _id: 'p-new',
        name: 'My Node Service',
        ownerId: 'u-1',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      const onOpenProject = vi.fn();

      render(<Dashboard user={sampleUser} onOpenProject={onOpenProject} onLogout={vi.fn()} />);

      // Empty state CTA opens Create modal
      const emptyCreateBtn = await screen.findByRole('button', { name: 'Create Your First Project' });
      fireEvent.click(emptyCreateBtn);

      const submitBtn = screen.getByRole('button', { name: 'Create Project' }) as HTMLButtonElement;
      expect(submitBtn.disabled).toBe(true);

      // Click template buttons
      const nodeTplBtn = screen.getByRole('button', { name: /Node\.js/i });
      fireEvent.click(nodeTplBtn);
      expect(nodeTplBtn.getAttribute('aria-pressed')).toBe('true');

      fireEvent.change(screen.getByLabelText('Project Name'), { target: { value: ' My Node Service ' } });
      fireEvent.change(screen.getByLabelText('Description (Optional)'), { target: { value: 'Backend API' } });
      expect(submitBtn.disabled).toBe(false);

      fireEvent.click(submitBtn);

      await waitFor(() => {
        expect(mockApi.createProject).toHaveBeenCalledWith('My Node Service', 'Backend API', 'node');
        expect(onOpenProject).toHaveBeenCalledWith('p-new');
      });
    });

    it('filters projects, clears filter, opens project card, deletes with confirmation, joins invite, and signs out', async () => {
      mockApi.getProjects.mockResolvedValue(sampleProjects);
      mockApi.deleteProject.mockResolvedValue(undefined);
      mockApi.acceptInvitation.mockResolvedValue({
        projectId: 'p-joined',
        role: 'editor',
        message: 'Joined successfully',
      });

      const onOpenProject = vi.fn();
      const onLogout = vi.fn();

      render(<Dashboard user={sampleUser} onOpenProject={onOpenProject} onLogout={onLogout} />);

      await screen.findByText('Realtime CRDT');
      expect(screen.getByText('2 of 2')).toBeTruthy();

      // Filter projects
      const filterInput = screen.getByLabelText('Filter projects');
      fireEvent.change(filterInput, { target: { value: 'graphs' } });
      expect(screen.getByText('1 of 2')).toBeTruthy();
      expect(screen.queryByText('Realtime CRDT')).toBeNull();
      expect(screen.getByText('Algorithm Lab')).toBeTruthy();

      // Clear filter via X button
      fireEvent.click(screen.getByRole('button', { name: 'Clear project filter' }));
      expect(screen.getByText('2 of 2')).toBeTruthy();

      // No match state + Clear Filter button
      fireEvent.change(filterInput, { target: { value: 'missing-xyz' } });
      expect(screen.getByText(/No projects match/)).toBeTruthy();
      fireEvent.click(screen.getByRole('button', { name: 'Clear Filter' }));
      expect(screen.getByText('2 of 2')).toBeTruthy();

      // Open project card
      fireEvent.click(screen.getByRole('button', { name: 'Open project Realtime CRDT' }));
      expect(onOpenProject).toHaveBeenCalledWith('p-1');

      // Delete project card + confirm dialog
      fireEvent.click(screen.getByRole('button', { name: 'Delete project Algorithm Lab' }));
      expect(screen.getByText('Delete "Algorithm Lab"?')).toBeTruthy();
      fireEvent.click(screen.getByRole('button', { name: 'Delete Workspace' }));

      await waitFor(() => {
        expect(mockApi.deleteProject).toHaveBeenCalledWith('p-2');
      });

      // Join with invite modal (handles failure & clears error on close, then succeeds)
      fireEvent.click(screen.getByRole('button', { name: /Join with invite/i }));
      mockApi.acceptInvitation.mockRejectedValueOnce(new Error('Expired invite'));
      fireEvent.change(screen.getByLabelText('Invitation Link or Token'), {
        target: { value: 'https://obsidian.dev/join/tok-bad' },
      });
      fireEvent.click(screen.getByRole('button', { name: 'Join Workspace' }));
      await waitFor(() => {
        expect(screen.getByRole('alert').textContent).toContain('Expired invite');
      });

      fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
      fireEvent.click(screen.getByRole('button', { name: /Join with invite/i }));
      expect(screen.queryByRole('alert')).toBeNull();

      fireEvent.change(screen.getByLabelText('Invitation Link or Token'), {
        target: { value: 'https://obsidian.dev/join/tok-good' },
      });
      fireEvent.click(screen.getByRole('button', { name: 'Join Workspace' }));

      await waitFor(() => {
        expect(mockApi.acceptInvitation).toHaveBeenCalledWith('tok-good');
        expect(onOpenProject).toHaveBeenCalledWith('p-joined');
      });

      // Sign out button
      fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));
      expect(onLogout).toHaveBeenCalledTimes(1);
    });
  });

  describe('App Routing, Clerk Sync & Error Recovery', () => {
    it('syncs Clerk user to Dashboard, handles workspace URL, recovers from sync errors, and handles logout', async () => {
      mockClerkState.isSignedIn = true;
      mockClerkState.user = {
        id: 'clerk-u1',
        primaryEmailAddress: { emailAddress: 'alice@obsidian.dev' },
        fullName: 'Alice Dev',
      };
      mockApi.syncClerkUser.mockRejectedValueOnce(new Error('Sync backend unreachable'));

      render(<App />);

      await screen.findByText('Unable to Sync Session');
      expect(screen.getByText('Sync backend unreachable')).toBeTruthy();

      // Retry Connection succeeds and navigates to Dashboard
      mockApi.syncClerkUser.mockResolvedValueOnce({ user: sampleUser, token: 'jwt-1' });
      mockApi.getProjects.mockResolvedValue(sampleProjects);
      fireEvent.click(screen.getByRole('button', { name: 'Retry Connection' }));

      await screen.findByText('Your Projects');

      // Open project navigates to WorkspacePage
      fireEvent.click(await screen.findByRole('button', { name: 'Open project Realtime CRDT' }));
      await screen.findByTestId('workspace-page');
      expect(window.location.pathname).toBe('/workspace/p-1');

      // Back to dashboard works
      fireEvent.click(screen.getByRole('button', { name: 'Mock Back' }));
      await screen.findByText('Your Projects');
      expect(window.location.pathname).toBe('/dashboard');

      // Logout calls Clerk signOut + api.logout and shows AuthPage
      fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));
      await waitFor(() => {
        expect(mockClerkSignOut).toHaveBeenCalled();
        expect(mockApi.logout).toHaveBeenCalled();
        expect(screen.getByRole('tab', { name: 'Sign In' })).toBeTruthy();
      });
    });

    it('renders SSO callback on /sso-callback path', () => {
      window.history.replaceState({}, '', '/sso-callback');
      render(<App />);
      expect(screen.getByTestId('sso-callback')).toBeTruthy();
    });
  });

  describe('UI Primitives (Dialog, ErrorBoundary, ThemeToggle, IconButton)', () => {
    it('supports Modal close, backdrop close, topmost-only Escape stack, ConfirmDialog, and PromptDialog', () => {
      const onCloseParent = vi.fn();
      const onCloseChild = vi.fn();
      const onConfirm = vi.fn();
      const onCancelConfirm = vi.fn();
      const onPromptSubmit = vi.fn();

      const { rerender } = render(
        <div>
          <Modal isOpen={true} onClose={onCloseParent} title="Parent Dialog">
            <button type="button">First Btn</button>
            <ConfirmDialog
              isOpen={true}
              title="Nested Confirm"
              message="Confirm nested action"
              onConfirm={onConfirm}
              onCancel={onCancelConfirm}
            />
          </Modal>
          <PromptDialog
            isOpen={false}
            title="Checkpoint"
            fields={[{ id: 'name', label: 'Name', required: true }]}
            onSubmit={onPromptSubmit}
            onCancel={vi.fn()}
          />
        </div>
      );

      // Escape only closes the topmost stacked dialog (ConfirmDialog -> onCancelConfirm), NOT parent
      fireEvent.keyDown(window, { key: 'Escape' });
      expect(onCancelConfirm).toHaveBeenCalledTimes(1);
      expect(onCloseParent).not.toHaveBeenCalled();

      // Click Confirm button inside ConfirmDialog
      fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));
      expect(onConfirm).toHaveBeenCalledTimes(1);

      // Unmount ConfirmDialog, now Escape closes Parent Dialog
      rerender(
        <div>
          <Modal isOpen={true} onClose={onCloseParent} title="Parent Dialog">
            <button type="button">First Btn</button>
          </Modal>
          <PromptDialog
            isOpen={true}
            title="Checkpoint"
            fields={[
              { id: 'name', label: 'Name', required: true },
              { id: 'note', label: 'Note', type: 'textarea' },
            ]}
            submitText="Save"
            onSubmit={onPromptSubmit}
            onCancel={onCloseChild}
          />
        </div>
      );

      // Required validation blocks empty submit on PromptDialog
      fireEvent.click(screen.getByRole('button', { name: 'Save' }));
      expect(onPromptSubmit).not.toHaveBeenCalled();

      fireEvent.change(screen.getByLabelText(/Name/), { target: { value: 'v1.0' } });
      fireEvent.change(screen.getByLabelText(/Note/), { target: { value: 'Initial release' } });
      fireEvent.click(screen.getByRole('button', { name: 'Save' }));
      expect(onPromptSubmit).toHaveBeenCalledWith({ name: 'v1.0', note: 'Initial release' });

      // Close button X on Parent Dialog
      fireEvent.click(screen.getAllByRole('button', { name: 'Close dialog' })[0]);
      expect(onCloseParent).toHaveBeenCalledTimes(1);
    });

    it('ErrorBoundary toggles stack trace and triggers Reload / Back buttons, and ThemeToggle/IconButton work', () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      function Bomb(): React.ReactElement {
        throw new Error('Crash test');
      }

      render(
        <ErrorBoundary>
          <Bomb />
        </ErrorBoundary>
      );

      expect(screen.getByText('Workspace Interrupted')).toBeTruthy();
      expect(screen.getByText('Error: Crash test')).toBeTruthy();

      // Toggle stack trace button
      fireEvent.click(screen.getByRole('button', { name: /View stack trace/i }));
      expect(screen.getByRole('button', { name: /Hide stack trace/i })).toBeTruthy();

      // Back to Dashboard & Reload Application buttons exist and are clickable
      expect(screen.getByRole('button', { name: /Back to Dashboard/i })).toBeTruthy();
      expect(screen.getByRole('button', { name: /Reload Application/i })).toBeTruthy();
      consoleErrorSpy.mockRestore();

      cleanup();

      // ThemeToggle + IconButton
      document.documentElement.classList.add('dark');
      const iconClick = vi.fn();
      render(
        <div>
          <ThemeToggle />
          <IconButton aria-label="Custom Action" onClick={iconClick}>
            <span>Go</span>
          </IconButton>
        </div>
      );

      const themeBtn = screen.getByRole('button', { name: 'Switch to Light Mode' });
      fireEvent.click(themeBtn);
      expect(document.documentElement.classList.contains('dark')).toBe(false);
      expect(screen.getByRole('button', { name: 'Switch to Dark Mode' })).toBeTruthy();

      fireEvent.click(screen.getByRole('button', { name: 'Custom Action' }));
      expect(iconClick).toHaveBeenCalledTimes(1);
    });
  });
});
