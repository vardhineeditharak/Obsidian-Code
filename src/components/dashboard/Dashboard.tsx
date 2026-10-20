import React, { useState, useEffect } from 'react';
import {
  Sparkles,
  Link as LinkIcon,
  Clock,
  ArrowRight,
  Globe,
  Binary,
  Terminal,
  AlertCircle,
} from 'lucide-react';
import {
  Plus,
  FolderOpen,
  Trash,
  Users,
  Code,
  LogOut,
  ThemeToggle,
} from '../ui/AnimatedIcon';
import { ConfirmDialog, Modal } from '../ui/Dialog';
import { SkeletonGrid } from '../ui/Skeleton';
import { BrandMark } from '../ui/BrandMark';
import { Project, User } from '../../lib/types';
import { api } from '../../lib/api';
import { notify } from '../../lib/notifications';
import { sound } from '../../lib/audio/soundEngine';

interface DashboardProps {
  user: User;
  onOpenProject: (projectId: string) => void;
  onLogout: () => void;
  initialInviteToken?: string | null;
  onClearInviteToken?: () => void;
}

export const Dashboard: React.FC<DashboardProps> = ({
  user,
  onOpenProject,
  onLogout,
  initialInviteToken,
  onClearInviteToken,
}) => {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showJoinModal, setShowJoinModal] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [newProjectDesc, setNewProjectDesc] = useState('');
  const [selectedTemplate, setSelectedTemplate] = useState<'blank' | 'web' | 'node' | 'algorithms'>('web');
  const [inviteToken, setInviteToken] = useState('');
  const [creating, setCreating] = useState(false);
  const [joining, setJoining] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);
  const [projectToDelete, setProjectToDelete] = useState<{ id: string; name: string } | null>(null);

  useEffect(() => {
    loadProjects();
  }, []);

  // Prefill invite token and open join modal if initialInviteToken provided (D3/B2)
  useEffect(() => {
    if (initialInviteToken) {
      setInviteToken(initialInviteToken);
      setShowJoinModal(true);
      executeJoin(initialInviteToken);
    }
  }, [initialInviteToken]);

  const loadProjects = async () => {
    setLoading(true);
    try {
      const data = await api.getProjects();
      setProjects(data);
    } catch (err: any) {
      notify.error('Failed to load projects', err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProjectName.trim()) return;

    setCreating(true);
    try {
      const p = await api.createProject(newProjectName.trim(), newProjectDesc.trim(), selectedTemplate);
      notify.success('Project created', `"${p.name}" is ready for collaboration`);
      sound.checkpointSaved();
      setShowCreateModal(false);
      setNewProjectName('');
      setNewProjectDesc('');
      loadProjects();
      onOpenProject(p._id);
    } catch (err: any) {
      notify.error('Failed to create project', err.message);
    } finally {
      setCreating(false);
    }
  };

  const executeJoin = async (rawToken: string) => {
    const token = rawToken.includes('/join/') ? rawToken.split('/join/').pop()! : rawToken.trim();
    if (!token) return;

    setJoining(true);
    setJoinError(null);
    try {
      const res = await api.acceptInvitation(token);
      notify.success('Joined Workspace', res.message);
      sound.checkpointSaved();
      setShowJoinModal(false);
      setInviteToken('');
      window.history.replaceState({}, '', '/dashboard');
      if (typeof window !== 'undefined') {
        sessionStorage.removeItem('pending_invite');
      }
      onClearInviteToken?.();
      loadProjects();
      onOpenProject(res.projectId);
    } catch (err: any) {
      setJoinError(err.message || 'Failed to join workspace');
      notify.error('Failed to join workspace', err.message);
    } finally {
      setJoining(false);
    }
  };

  const handleJoinProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteToken.trim()) return;
    await executeJoin(inviteToken);
  };

  const handleDeleteProject = (projectId: string, projectName: string) => {
    setProjectToDelete({ id: projectId, name: projectName });
  };

  const handleConfirmDeleteProject = async () => {
    if (!projectToDelete) return;
    try {
      await api.deleteProject(projectToDelete.id);
      notify.info(`Project "${projectToDelete.name}" deleted`);
      loadProjects();
    } catch (err: any) {
      notify.error('Failed to delete project', err.message);
    } finally {
      setProjectToDelete(null);
    }
  };

  const isMacDesktop = typeof window !== 'undefined' && window.obsidianDesktop?.platform === 'darwin';
  const isDesktop = typeof window !== 'undefined' && Boolean(window.obsidianDesktop?.isDesktop);

  return (
    <div className="min-h-screen bg-parchment text-ink flex flex-col select-none transition-colors duration-150">
      {/* Top Navbar */}
      <nav className={`h-13 border-b border-stone px-6 flex items-center justify-between ${isDesktop ? 'app-drag-region' : ''} ${isMacDesktop ? 'pl-20' : ''}`}>
        <div className="flex items-center gap-3 app-no-drag">
          <BrandMark className="w-8 h-8 text-ink shrink-0" />
          <span className="font-brand text-xl font-semibold tracking-tight text-ink">
            Obsidian Code
          </span>
        </div>

        <div className="flex items-center gap-3 app-no-drag">
          <div className="hidden">
            <ThemeToggle size={16} />
          </div>

          <div className="flex items-center gap-2 pl-3 border-l border-stone">
            <img
              src={user.avatar || `https://api.dicebear.com/7.x/identicon/svg?seed=${user.name}`}
              alt={user.name}
              className="w-6 h-6 rounded-full border border-stone"
            />
            <span className="font-mono text-xs text-driftwood">{user.name}</span>
          </div>

          <button
            onClick={onLogout}
            title="Sign out"
            aria-label="Sign out"
            className="btn-ghost text-xs p-1.5 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber cursor-pointer"
          >
            <LogOut size={15} className="text-ash hover:text-ink" />
          </button>
        </div>
      </nav>

      {/* Main Content Area */}
      <main className="flex-1 max-w-6xl w-full mx-auto p-8 flex flex-col">
        {/* Welcome & Action Header */}
        <div className="flex items-start justify-between mb-8 pb-4 border-b border-stone">
          <div>
            <div className="text-eyebrow mb-1">Workspaces</div>
            <h1 className="headline-md font-semibold text-ink">Your Projects</h1>
            <p className="text-sm text-driftwood mt-1">
              Collaborate in real time with peers or jump into your personal code ateliers.
            </p>
          </div>

          <div className="flex items-center gap-2.5">
            <button
              onClick={() => setShowJoinModal(true)}
              className="btn-secondary text-xs"
            >
              <LinkIcon className="w-3.5 h-3.5" />
              <span>Join with invite →</span>
            </button>

            <button
              onClick={() => setShowCreateModal(true)}
              className="btn-primary text-xs"
            >
              <Plus size={14} />
              <span>New Project</span>
            </button>
          </div>
        </div>

        {/* Project Grid */}
        {loading ? (
          <SkeletonGrid count={6} />
        ) : projects.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center p-12 bg-bone border border-stone inset-glow rounded-xl text-center">
            <div className="w-10 h-10 rounded-lg bg-linen inset-glow flex items-center justify-center text-ash mb-3">
              <Sparkles className="w-5 h-5" />
            </div>
            <h2 className="headline-sm font-semibold text-ink mb-1">No Projects Found</h2>
            <p className="text-sm text-driftwood max-w-sm mb-6">
              Create a new collaborative project or join an existing workspace with an invitation link.
            </p>
            <button
              type="button"
              onClick={() => setShowCreateModal(true)}
              className="btn-primary text-xs"
            >
              Create Your First Project
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {projects.map((p) => (
              <div
                key={p._id}
                role="button"
                tabIndex={0}
                onClick={() => onOpenProject(p._id)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onOpenProject(p._id);
                  }
                }}
                className="bg-bone p-5 rounded-xl border border-stone inset-glow hover:border-(--border-active) transition group cursor-pointer flex flex-col justify-between focus:outline-none focus-visible:ring-2 focus-visible:ring-amber"
              >
                <div>
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-lg bg-linen border border-stone inset-glow flex items-center justify-center text-ash group-hover:text-ink transition">
                        <FolderOpen size={15} />
                      </div>
                      <div>
                        <h3 className="text-sm font-medium text-ink transition">
                          {p.name}
                        </h3>
                        <span className="font-mono text-[11px] text-ash flex items-center gap-1">
                          <Clock className="w-2.5 h-2.5" />
                          {new Date(p.updatedAt).toLocaleDateString()}
                        </span>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteProject(p._id, p.name);
                      }}
                      title={`Delete ${p.name}`}
                      aria-label={`Delete project ${p.name}`}
                      className="opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 focus-visible:opacity-100 p-1 rounded-md text-ash hover:text-crimson hover:bg-linen focus:outline-none focus-visible:ring-2 focus-visible:ring-crimson transition cursor-pointer"
                    >
                      <Trash size={14} />
                    </button>
                  </div>

                  {p.description && (
                    <p className="text-sm text-driftwood line-clamp-2 mb-4">
                      {p.description}
                    </p>
                  )}
                </div>

                <div className="flex items-center justify-between pt-3 border-t border-stone text-[11px] font-mono text-ash">
                  <span className="flex items-center gap-1">
                    <Users size={12} className="text-ash" />
                    Collaborative Workspace
                  </span>
                  <span className="text-ink group-hover:text-amber transition flex items-center gap-1 font-sans text-xs">
                    Open <ArrowRight className="w-3 h-3" />
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {/* New Project Modal */}
      <Modal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        maxWidth="max-w-lg"
        title="Create Collaborative Project"
      >
        <div className="p-6">
          <p className="text-sm text-driftwood mb-5">
            Choose a template to scaffold your shared project environment.
          </p>

          <form onSubmit={handleCreateProject} className="space-y-4">
            <div>
              <label htmlFor="project-name-input" className="text-xs font-normal text-driftwood block mb-1">
                Project Name
              </label>
              <input
                id="project-name-input"
                type="text"
                required
                autoFocus
                placeholder="e.g. NextGen Web App"
                value={newProjectName}
                onChange={(e) => setNewProjectName(e.target.value)}
                className="input-atelier w-full"
              />
            </div>

            <div>
              <label htmlFor="project-desc-input" className="text-xs font-normal text-driftwood block mb-1">
                Description (Optional)
              </label>
              <input
                id="project-desc-input"
                type="text"
                placeholder="Short workspace description..."
                value={newProjectDesc}
                onChange={(e) => setNewProjectDesc(e.target.value)}
                className="input-atelier w-full"
              />
            </div>

            {/* Starter Templates */}
            <div>
              <label className="text-xs font-normal text-driftwood block mb-2">Starter Template</label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {[
                  { id: 'web', label: 'Web App', sub: 'HTML, CSS, JS', icon: <Globe className="w-4 h-4 text-ash mb-1.5" /> },
                  { id: 'node', label: 'Node.js', sub: 'Package & script', icon: <Terminal className="w-4 h-4 text-ash mb-1.5" /> },
                  { id: 'algorithms', label: 'Algorithms', sub: 'Data structures', icon: <Binary className="w-4 h-4 text-ash mb-1.5" /> },
                  { id: 'blank', label: 'Blank', sub: 'Clean slate', icon: <Sparkles className="w-4 h-4 text-amber mb-1.5" /> },
                ].map((tpl) => (
                  <button
                    key={tpl.id}
                    type="button"
                    onClick={() => setSelectedTemplate(tpl.id as any)}
                    className={`p-3 rounded-lg border cursor-pointer transition text-left inset-glow focus:outline-none focus-visible:ring-2 focus-visible:ring-amber ${
                      selectedTemplate === tpl.id
                        ? 'border-amber bg-linen text-ink'
                        : 'border-stone bg-bone text-driftwood hover:bg-linen'
                    }`}
                  >
                    {tpl.icon}
                    <p className="text-xs font-medium text-ink">{tpl.label}</p>
                    <p className="font-mono text-[10px] text-ash">{tpl.sub}</p>
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-4 border-t border-stone">
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                className="btn-ghost text-xs"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={creating}
                className="btn-primary text-xs"
              >
                {creating ? 'Creating...' : 'Create Project'}
              </button>
            </div>
          </form>
        </div>
      </Modal>

      {/* Join Project Modal */}
      <Modal
        isOpen={showJoinModal}
        onClose={() => setShowJoinModal(false)}
        maxWidth="max-w-md"
        title="Join Workspace"
      >
        <div className="p-6">
          <p className="text-sm text-driftwood mb-5">
            Paste your invitation token or share link to join a team's code workspace.
          </p>

          {joinError && (
            <div role="alert" className="mb-4 text-[13px] text-crimson flex items-center gap-1.5">
              <AlertCircle className="w-4 h-4 shrink-0 text-crimson" />
              <span>{joinError}</span>
            </div>
          )}

          <form onSubmit={handleJoinProject} className="space-y-4">
            <div>
              <label htmlFor="join-token-input" className="text-xs font-normal text-driftwood block mb-1">
                Invitation Link or Token
              </label>
              <input
                id="join-token-input"
                type="text"
                required
                autoFocus
                placeholder="Paste token or link (e.g. 5a9b...)"
                value={inviteToken}
                onChange={(e) => {
                  setInviteToken(e.target.value);
                  if (joinError) setJoinError(null);
                }}
                className="input-atelier w-full font-mono text-xs"
              />
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-(--border-subtle)">
              <button
                type="button"
                onClick={() => setShowJoinModal(false)}
                className="btn-ghost text-xs"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={joining}
                className="btn-primary text-xs disabled:opacity-50"
              >
                {joining ? 'Joining...' : 'Join Workspace'}
              </button>
            </div>
          </form>
        </div>
      </Modal>

      {/* Delete Project Confirm Dialog (D1) */}
      <ConfirmDialog
        isOpen={!!projectToDelete}
        title={`Delete "${projectToDelete?.name}"?`}
        message="Are you sure you want to delete this workspace? This action cannot be undone."
        confirmText="Delete Workspace"
        isDestructive
        onConfirm={handleConfirmDeleteProject}
        onCancel={() => setProjectToDelete(null)}
      />
    </div>
  );
};
