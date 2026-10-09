import React, { useState, useEffect, useRef } from 'react';
import { AuthPage } from './components/auth/AuthPage';
import { Dashboard } from './components/dashboard/Dashboard';
import { WorkspacePage } from './components/workspace/WorkspacePage';
import { User } from './lib/types';
import { api } from './lib/api';
import { notify } from './lib/notifications';

export const App: React.FC = () => {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const currentUserRef = useRef<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [currentRoute, setCurrentRoute] = useState<'auth' | 'dashboard' | 'workspace'>('auth');
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const updateUser = (u: User | null) => {
    currentUserRef.current = u;
    setCurrentUser(u);
  };

  useEffect(() => {
    // Check initial authentication or OAuth callback redirect
    const urlParams = new URLSearchParams(window.location.search);
    const queryToken = urlParams.get('token');
    if (queryToken) {
      localStorage.setItem('obsidian_token', queryToken);
      window.history.replaceState({}, document.title, window.location.pathname);
    }

    const savedToken = queryToken || localStorage.getItem('obsidian_token');
    if (savedToken) {
      setToken(savedToken);
      api
        .getMe()
        .then((user) => {
          updateUser(user);
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
        .catch(() => {
          localStorage.removeItem('obsidian_token');
          updateUser(null);
          setCurrentRoute('auth');
        })
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
      setCurrentRoute('auth');
    }

    // Handle browser popstate with ref to avoid stale closure
    const handlePopState = () => {
      const path = window.location.pathname;
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
  }, []);

  const handleAuthSuccess = (user: User, userToken: string) => {
    updateUser(user);
    setToken(userToken);
    setCurrentRoute('dashboard');
    window.history.pushState({}, '', '/dashboard');
  };

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
    await api.logout();
    updateUser(null);
    setToken(null);
    setActiveProjectId(null);
    setCurrentRoute('auth');
    window.history.pushState({}, '', '/login');
    notify.info('Logged out');
  };

  if (loading) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-[#0F172A] text-slate-400 text-xs">
        Initializing Obsidian Code...
      </div>
    );
  }

  if (currentRoute === 'auth' || !currentUser) {
    return <AuthPage onAuthSuccess={handleAuthSuccess} />;
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
    />
  );
};

export default App;
