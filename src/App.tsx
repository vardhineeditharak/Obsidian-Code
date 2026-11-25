import React, { useState, useEffect, useRef, useCallback } from 'react';
import { AuthenticateWithRedirectCallback, useClerk, useUser } from '@clerk/react';
import { AuthPage } from './components/auth/AuthPage';
import { Dashboard } from './components/dashboard/Dashboard';
import { WorkspacePage } from './components/workspace/WorkspacePage';
import type { User } from './lib/types';
import { api } from './lib/api';
import { notify } from './lib/notifications';
import { LoadingState } from './components/ui/LoadingState';

type AppRoute = 'auth' | 'dashboard' | 'workspace';

function getInviteTokenFromPath(): string | null {
  if (typeof window === 'undefined') return null;
  const match = window.location.pathname.match(/\/join\/([a-zA-Z0-9_-]+)/);
  return match ? match[1] : null;
}

function getWorkspaceIdFromPath(): string | null {
  if (typeof window === 'undefined') return null;
  const match = window.location.pathname.match(/\/workspace\/([a-zA-Z0-9_-]+)/);
  return match ? match[1] : null;
}

export function App() {
  const { isLoaded: isClerkLoaded, isSignedIn, user: clerkUser } = useUser();
  const { signOut } = useClerk();

  const clerkUserRef = useRef(clerkUser);
  clerkUserRef.current = clerkUser;

  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const currentUserRef = useRef<User | null>(null);
  const [currentRoute, setCurrentRoute] = useState<AppRoute>('auth');
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [pendingInviteToken, setPendingInviteToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const updateUser = useCallback((user: User | null) => {
    currentUserRef.current = user;
    setCurrentUser(user);
  }, []);

  // Capture /join/<token> from URL on initial mount
  useEffect(() => {
    const initialToken = getInviteTokenFromPath();
    if (initialToken && typeof window !== 'undefined') {
      try {
        sessionStorage.setItem('pending_invite', initialToken);
      } catch {
        // Ignore sessionStorage errors
      }
    }
  }, []);

  // Sync Clerk session with backend using primitive clerkUser?.id so token refreshes do not re-run routing
  useEffect(() => {
    if (!isClerkLoaded) return;

    let cancelled = false;
    const userSnapshot = clerkUserRef.current;

    if (isSignedIn && userSnapshot && userSnapshot.id) {
      const email = userSnapshot.primaryEmailAddress?.emailAddress || '';
      const name =
        userSnapshot.fullName ||
        userSnapshot.firstName ||
        userSnapshot.username ||
        email.split('@')[0] ||
        'Obsidian Developer';
      const avatar = userSnapshot.imageUrl;

      api
        .syncClerkUser({
          clerkId: userSnapshot.id,
          email,
          name,
          avatar,
        })
        .then(({ user }) => {
          if (cancelled) return;
          updateUser(user);

          let inviteToken = getInviteTokenFromPath();
          if (!inviteToken && typeof window !== 'undefined') {
            try {
              inviteToken = sessionStorage.getItem('pending_invite');
            } catch {
              inviteToken = null;
            }
          }

          if (inviteToken) {
            setPendingInviteToken(inviteToken);
            setCurrentRoute('dashboard');
            return;
          }

          const workspaceId = getWorkspaceIdFromPath();
          if (workspaceId) {
            setActiveProjectId(workspaceId);
            setCurrentRoute('workspace');
          } else {
            setCurrentRoute('dashboard');
          }
        })
        .catch((err: unknown) => {
          if (cancelled) return;
          console.error('Failed to sync Clerk user with backend:', err);
          updateUser(null);
          setCurrentRoute('auth');
        })
        .finally(() => {
          if (!cancelled) {
            setLoading(false);
          }
        });
    } else {
      updateUser(null);
      setLoading(false);
      setCurrentRoute('auth');
    }

    const handlePopState = () => {
      const joinTok = getInviteTokenFromPath();
      if (joinTok) {
        if (currentUserRef.current) {
          setPendingInviteToken(joinTok);
          setCurrentRoute('dashboard');
        } else if (typeof window !== 'undefined') {
          try {
            sessionStorage.setItem('pending_invite', joinTok);
          } catch {
            // Ignore sessionStorage errors
          }
        }
        return;
      }

      const workspaceId = getWorkspaceIdFromPath();
      if (workspaceId) {
        setActiveProjectId(workspaceId);
        setCurrentRoute('workspace');
      } else if (currentUserRef.current) {
        setCurrentRoute('dashboard');
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => {
      cancelled = true;
      window.removeEventListener('popstate', handlePopState);
    };
  }, [isClerkLoaded, isSignedIn, clerkUser?.id, updateUser]);

  const handleOpenProject = useCallback((projectId: string) => {
    setActiveProjectId(projectId);
    setCurrentRoute('workspace');
    window.history.pushState({}, '', `/workspace/${projectId}`);
  }, []);

  const handleBackToDashboard = useCallback(() => {
    setActiveProjectId(null);
    setCurrentRoute('dashboard');
    window.history.pushState({}, '', '/dashboard');
  }, []);

  const handleLogout = useCallback(async () => {
    try {
      await signOut();
    } catch (err) {
      console.error('Error during Clerk signOut:', err);
    }
    await api.logout();
    updateUser(null);
    setActiveProjectId(null);
    setCurrentRoute('auth');
    window.history.pushState({}, '', '/login');
    notify.info('Logged out');
  }, [signOut, updateUser]);

  const handleClearInviteToken = useCallback(() => {
    setPendingInviteToken(null);
  }, []);

  if (typeof window !== 'undefined' && window.location.pathname === '/sso-callback') {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-parchment text-driftwood font-mono text-xs">
        <AuthenticateWithRedirectCallback
          signInUrl="/"
          signUpUrl="/"
          continueSignUpUrl="/"
          signInForceRedirectUrl="/"
          signUpForceRedirectUrl="/"
          signInFallbackRedirectUrl="/"
          signUpFallbackRedirectUrl="/"
        />
      </div>
    );
  }

  if (loading || !isClerkLoaded) {
    return <LoadingState fullscreen label="Initializing Obsidian Code…" />;
  }

  if (currentRoute === 'auth' || !currentUser) {
    return <AuthPage />;
  }

  if (currentRoute === 'workspace' && activeProjectId) {
    return (
      <WorkspacePage
        projectId={activeProjectId}
        currentUser={currentUser}
        onLogout={handleLogout}
        onBackToDashboard={handleBackToDashboard}
      />
    );
  }

  return (
    <Dashboard
      user={currentUser}
      onOpenProject={handleOpenProject}
      onLogout={handleLogout}
      initialInviteToken={pendingInviteToken}
      onClearInviteToken={handleClearInviteToken}
    />
  );
}

export default App;
