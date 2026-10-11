import React, { useState, useEffect, useRef } from 'react';
import { useUser, useClerk, AuthenticateWithRedirectCallback } from '@clerk/react';
import { AuthPage } from './components/auth/AuthPage';
import { Dashboard } from './components/dashboard/Dashboard';
import { WorkspacePage } from './components/workspace/WorkspacePage';
import { User } from './lib/types';
import { api } from './lib/api';
import { notify } from './lib/notifications';
import { LoadingState } from './components/ui/LoadingState';

export const App: React.FC = () => {
  const { isLoaded: isClerkLoaded, isSignedIn, user: clerkUser } = useUser();
  const { signOut } = useClerk();

  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const currentUserRef = useRef<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [currentRoute, setCurrentRoute] = useState<'auth' | 'dashboard' | 'workspace'>('auth');
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [pendingInviteToken, setPendingInviteToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const updateUser = (u: User | null) => {
    currentUserRef.current = u;
    setCurrentUser(u);
  };

  // Helper to detect /join/<token> in URL path
  const getInviteTokenFromPath = () => {
    if (typeof window === 'undefined') return null;
    const match = window.location.pathname.match(/\/join\/([a-zA-Z0-9_-]+)/);
    return match ? match[1] : null;
  };

  useEffect(() => {
    // Initial check for /join/<token> on mount
    const initialToken = getInviteTokenFromPath();
    if (initialToken && typeof window !== 'undefined') {
      sessionStorage.setItem('pending_invite', initialToken);
    }
  }, []);

  useEffect(() => {
    if (!isClerkLoaded) return;

    if (isSignedIn && clerkUser) {
      const email = clerkUser.primaryEmailAddress?.emailAddress || '';
      const name =
        clerkUser.fullName ||
        clerkUser.firstName ||
        clerkUser.username ||
        email.split('@')[0] ||
        'Obsidian Developer';
      const avatar = clerkUser.imageUrl;

      api
        .syncClerkUser({
          clerkId: clerkUser.id,
          email,
          name,
          avatar,
        })
        .then(({ user, token: userToken }) => {
          updateUser(user);
          setToken(userToken);

          // Check for pending invite token (either from URL or sessionStorage)
          let inviteToken = getInviteTokenFromPath();
          if (!inviteToken && typeof window !== 'undefined') {
            inviteToken = sessionStorage.getItem('pending_invite');
          }

          if (inviteToken) {
            setPendingInviteToken(inviteToken);
            setCurrentRoute('dashboard');
            return;
          }

          // Check URL for project routing: /workspace/:id
          const path = window.location.pathname;
          const match = path.match(/\/workspace\/([a-zA-Z0-9_-]+)/);
          if (match) {
            setActiveProjectId(match[1]);
            setCurrentRoute('workspace');
          } else {
            setCurrentRoute('dashboard');
          }
        })
        .catch((err) => {
          console.error('Failed to sync Clerk user with backend:', err);
          updateUser(null);
          setToken(null);
          setCurrentRoute('auth');
        })
        .finally(() => setLoading(false));
    } else {
      updateUser(null);
      setToken(null);
      setLoading(false);
      setCurrentRoute('auth');
    }

    // Handle browser popstate with ref to avoid stale closure
    const handlePopState = () => {
      const path = window.location.pathname;

      const joinMatch = path.match(/\/join\/([a-zA-Z0-9_-]+)/);
      if (joinMatch) {
        const inviteTok = joinMatch[1];
        if (currentUserRef.current) {
          setPendingInviteToken(inviteTok);
          setCurrentRoute('dashboard');
        } else if (typeof window !== 'undefined') {
          sessionStorage.setItem('pending_invite', inviteTok);
        }
        return;
      }

      const match = path.match(/\/workspace\/([a-zA-Z0-9_-]+)/);
      if (match) {
        setActiveProjectId(match[1]);
        setCurrentRoute('workspace');
      } else if (currentUserRef.current) {
        setCurrentRoute('dashboard');
      }
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [isClerkLoaded, isSignedIn, clerkUser]);

  const handleOpenProject = (projectId: string) => {
    setActiveProjectId(projectId);
    setCurrentRoute('workspace');
    window.history.pushState({}, '', `/workspace/${projectId}`);
  };

  const handleBackToDashboard = () => {
    setActiveProjectId(null);
    setCurrentRoute('dashboard');
    window.history.pushState({}, '', '/dashboard');
  };

  const handleLogout = async () => {
    try {
      await signOut();
    } catch (e) {
      console.error('Error during Clerk signOut:', e);
    }
    await api.logout();
    updateUser(null);
    setToken(null);
    setActiveProjectId(null);
    setCurrentRoute('auth');
    window.history.pushState({}, '', '/login');
    notify.info('Logged out');
  };

  // Handle SSO Callback route for OAuth
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
      onClearInviteToken={() => setPendingInviteToken(null)}
    />
  );
};

export default App;
