import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import {
  AlertCircle,
  ArrowRight,
  Binary,
  Clock,
  Globe,
  Link as LinkIcon,
  Search,
  Sparkles,
  Terminal,
  X,
} from 'lucide-react';
import {
  FolderOpen,
  LogOut,
  Plus,
  ThemeToggle,
  Trash,
  Users,
} from '../ui/AnimatedIcon';
import { ConfirmDialog, Modal } from '../ui/Dialog';
import { SkeletonGrid } from '../ui/Skeleton';
import { BrandMark } from '../ui/BrandMark';
import type { Project, User } from '../../lib/types';
import { api } from '../../lib/api';
import { notify } from '../../lib/notifications';
import { sound } from '../../lib/audio/soundEngine';

type ProjectTemplate = 'blank' | 'web' | 'node' | 'algorithms';

interface TemplateOption {
  id: ProjectTemplate;
  label: string;
  sub: string;
  icon: React.ReactNode;
}

const TEMPLATE_OPTIONS: TemplateOption[] = [
  {
    id: 'web',
    label: 'Web App',
    sub: 'HTML, CSS, JS',
    icon: <Globe className="w-4 h-4 text-ash mb-1.5" />,
  },
  {
    id: 'node',
    label: 'Node.js',
    sub: 'Package & script',
    icon: <Terminal className="w-4 h-4 text-ash mb-1.5" />,
  },
  {
    id: 'algorithms',
    label: 'Algorithms',
    sub: 'Data structures',
    icon: <Binary className="w-4 h-4 text-ash mb-1.5" />,
  },
  {
    id: 'blank',
    label: 'Blank',
    sub: 'Clean slate',
    icon: <Sparkles className="w-4 h-4 text-amber mb-1.5" />,
  },
];

function getErrorMessage(err: unknown, fallback: string): string {
  return err instanceof Error && err.message ? err.message : fallback;
}

function extractInviteToken(rawToken: string): string {
  if (rawToken.includes('/join/')) {
    return rawToken.split('/join/').pop()?.trim() ?? '';
  }
  return rawToken.trim();
}

export interface DashboardProps {
  user: User;
  onOpenProject: (projectId: string) => void;
  onLogout: () => void;
  initialInviteToken?: string | null;
  onClearInviteToken?: () => void;
}

export function Dashboard({
  user,
  onOpenProject,
  onLogout,
  initialInviteToken,
  onClearInviteToken,
}: DashboardProps) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showJoinModal, setShowJoinModal] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [newProjectDesc, setNewProjectDesc] = useState('');
  const [selectedTemplate, setSelectedTemplate] = useState<ProjectTemplate>('web');
  const [inviteToken, setInviteToken] = useState('');
  const [creating, setCreating] = useState(false);
  const [joining, setJoining] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);
  const [projectToDelete, setProjectToDelete] = useState<{ id: string; name: string } | null>(
    null
  );
  const [searchQuery, setSearchQuery] = useState('');

  const lastAutoJoinedTokenRef = useRef<string | null>(null);

  const loadProjects = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.getProjects();
      setProjects(data);
    } catch (err: unknown) {
      notify.error('Failed to load projects', getErrorMessage(err, 'Unable to load projects'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadProjects();
  }, [loadProjects]);

  const executeJoin = useCallback(
    async (rawToken: string) => {
      const token = extractInviteToken(rawToken);
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
          try {
            sessionStorage.removeItem('pending_invite');
          } catch {
            // Ignore sessionStorage errors
          }
        }
        onClearInviteToken?.();
        loadProjects();
        onOpenProject(res.projectId);
      } catch (err: unknown) {
        const message = getErrorMessage(err, 'Failed to join workspace');
        setJoinError(message);
        notify.error('Failed to join workspace', message);
      } finally {
        setJoining(false);
      }
    },
    [loadProjects, onClearInviteToken, onOpenProject]
  );

  useEffect(() => {
    if (!initialInviteToken) {
      lastAutoJoinedTokenRef.current = null;
      return;
    }
    if (lastAutoJoinedTokenRef.current === initialInviteToken) {
      return;
    }
    lastAutoJoinedTokenRef.current = initialInviteToken;
    setInviteToken(initialInviteToken);
    setShowJoinModal(true);
    executeJoin(initialInviteToken);
  }, [initialInviteToken, executeJoin]);

  const filteredProjects = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return projects;
    return projects.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        (p.description || '').toLowerCase().includes(q)
    );
  }, [projects, searchQuery]);

  const handleCreateProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProjectName.trim()) return;

    setCreating(true);
    try {
      const created = await api.createProject(
        newProjectName.trim(),
        newProjectDesc.trim(),
        selectedTemplate
      );
      notify.success('Project created', `"${created.name}" is ready for collaboration`);
      sound.checkpointSaved();
      setShowCreateModal(false);
      setNewProjectName('');
      setNewProjectDesc('');
      loadProjects();
      onOpenProject(created._id);
    } catch (err: unknown) {
      notify.error('Failed to create project', getErrorMessage(err, 'Unable to create project'));
    } finally {
      setCreating(false);
    }
  };

  const handleJoinProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteToken.trim()) return;
    await executeJoin(inviteToken);
  };

  const handleConfirmDeleteProject = async () => {
    if (!projectToDelete) return;
    try {
      await api.deleteProject(projectToDelete.id);
      notify.info(`Project "${projectToDelete.name}" deleted`);
      loadProjects();
    } catch (err: unknown) {
      notify.error('Failed to delete project', getErrorMessage(err, 'Unable to delete project'));
    } finally {
      setProjectToDelete(null);
    }
  };

  return (
    <div className="min-h-screen bg-parchment text-ink flex flex-col select-none transition-colors duration-150">
      <nav className="h-14 apple-glass-header sticky top-0 z-20 border-b border-(--border-subtle) px-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <BrandMark className="w-8 h-8 text-ink shrink-0" />
          <span className="font-brand text-xl font-semibold tracking-tight text-ink">
            Obsidian Code
          </span>
        </div>

        <div className="flex items-center gap-3">
          <div className="hidden">
            <ThemeToggle size={16} />
          </div>

          <div className="flex items-center gap-2 pl-3 border-l border-stone">
            <img
              src={
                user.avatar ||
                `https://api.dicebear.com/7.x/identicon/svg?seed=${encodeURIComponent(user.name)}`
              }
              alt={user.name}
              className="w-6 h-6 rounded-full border border-stone"
            />
            <span className="font-mono text-xs text-driftwood">{user.name}</span>
          </div>

          <button
            type="button"
            onClick={onLogout}
            title="Sign out"
            aria-label="Sign out"
            className="btn-ghost text-xs p-1.5 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber cursor-pointer"
          >
            <LogOut size={15} className="text-ash hover:text-ink" />
          </button>
        </div>
      </nav>

      <main className="flex-1 max-w-6xl w-full mx-auto px-6 sm:px-8 py-8 flex flex-col">
        <div className="flex items-start justify-between mb-7 pb-5 border-b border-(--border-subtle) gap-4 flex-wrap">
          <div>
            <div className="text-eyebrow mb-1.5">Workspaces</div>
            <h1 className="headline-md text-ink">Your Projects</h1>
            <p className="text-sm text-driftwood mt-1">
              Collaborate in real time with peers or jump into your personal code ateliers.
            </p>
          </div>

          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={() => setShowJoinModal(true)}
              className="btn-secondary text-xs"
            >
              <LinkIcon className="w-3.5 h-3.5" />
              <span>Join with invite →</span>
            </button>

            <button
              type="button"
              onClick={() => setShowCreateModal(true)}
              className="btn-primary text-xs"
            >
              <Plus size={14} />
              <span>New Project</span>
            </button>
          </div>
        </div>

        {loading ? (
          <SkeletonGrid count={6} />
        ) : projects.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center p-12 bg-bone border border-(--border-subtle) inset-glow rounded-2xl text-center">
            <div className="w-11 h-11 rounded-xl bg-white/[0.05] border border-white/[0.08] inset-glow flex items-center justify-center text-ash mb-3.5">
              <Sparkles className="w-5 h-5" />
            </div>
            <h2 className="headline-sm text-ink mb-1.5">No Projects Found</h2>
            <p className="text-[13.5px] text-driftwood max-w-sm leading-relaxed mb-6">
              Create a new collaborative project or join an existing workspace with an invitation
              link.
            </p>
            <button
              type="button"
              onClick={() => setShowCreateModal(true)}
              className="btn-primary text-[13px]"
            >
              Create Your First Project
            </button>
          </div>
        ) : (
          <>
            {projects.length > 1 ? (
              <div className="mb-5 flex items-center justify-between gap-3">
                <div className="relative w-full max-w-xs">
                  <Search className="w-3.5 h-3.5 text-ash absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Filter projects..."
                    aria-label="Filter projects"
                    className="input-atelier w-full h-9 pl-9 pr-8 text-[13px] font-sans"
                  />
                  {searchQuery ? (
                    <button
                      type="button"
                      onClick={() => setSearchQuery('')}
                      aria-label="Clear project filter"
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-ash hover:text-ink cursor-pointer p-0.5 rounded"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  ) : null}
                </div>
                <span className="text-[12px] font-medium font-sans tabular-nums text-ash shrink-0">
                  {filteredProjects.length} of {projects.length}
                </span>
              </div>
            ) : null}

            {filteredProjects.length === 0 ? (
              <div className="flex flex-col items-center justify-center p-10 bg-bone border border-(--border-subtle) rounded-2xl text-center">
                <p className="text-[13.5px] text-driftwood mb-3.5">
                  No projects match &ldquo;{searchQuery.trim()}&rdquo;.
                </p>
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="btn-secondary text-[13px]"
                >
                  Clear Filter
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredProjects.map((project) => (
                  <div
                    key={project._id}
                    role="button"
                    tabIndex={0}
                    onClick={() => onOpenProject(project._id)}
                    onKeyDown={(e) => {
                      // Ignore Enter/Space bubbling from the nested delete button.
                      if (e.target !== e.currentTarget) return;
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        onOpenProject(project._id);
                      }
                    }}
                    className="bg-bone p-5 rounded-xl border border-(--border-subtle) inset-glow hover:border-white/20 hover:bg-linen/50 hover:-translate-y-0.5 hover:shadow-[0_14px_30px_-12px_rgba(0,0,0,0.55)] transition-all duration-150 group cursor-pointer flex flex-col justify-between focus:outline-none focus-visible:ring-2 focus-visible:ring-amber"
                  >
                    <div>
                      <div className="flex items-start justify-between mb-3.5">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-9 h-9 rounded-[9px] bg-white/[0.045] border border-white/[0.08] inset-glow flex items-center justify-center text-ash group-hover:text-ink transition shrink-0">
                            <FolderOpen size={15} />
                          </div>
                          <div className="min-w-0">
                            <h3 className="text-[14.5px] font-semibold tracking-[-0.015em] text-ink truncate transition">
                              {project.name}
                            </h3>
                            <span className="font-sans text-[11.5px] tabular-nums text-ash flex items-center gap-1 mt-0.5">
                              <Clock className="w-3 h-3 text-ash/80" />
                              {new Date(project.updatedAt).toLocaleDateString()}
                            </span>
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setProjectToDelete({ id: project._id, name: project.name });
                          }}
                          title={`Delete ${project.name}`}
                          aria-label={`Delete project ${project.name}`}
                          className="opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 focus-visible:opacity-100 p-1.5 rounded-lg text-ash hover:text-crimson hover:bg-white/[0.06] focus:outline-none focus-visible:ring-2 focus-visible:ring-crimson transition cursor-pointer shrink-0"
                        >
                          <Trash size={14} />
                        </button>
                      </div>

                      {project.description ? (
                        <p className="text-[13px] text-driftwood leading-relaxed line-clamp-2 mb-4">
                          {project.description}
                        </p>
                      ) : null}
                    </div>

                    <div className="flex items-center justify-between pt-3.5 border-t border-(--border-subtle) text-[11.5px] font-sans text-ash">
                      <span className="flex items-center gap-1.5">
                        <Users size={12} className="text-ash" />
                        Collaborative Workspace
                      </span>
                      <span className="text-ink group-hover:text-amber transition flex items-center gap-1 font-medium text-[12px]">
                        Open <ArrowRight className="w-3 h-3" />
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </main>

      <Modal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        maxWidth="max-w-lg"
        title="Create Collaborative Project"
      >
        <div className="p-6">
          <p className="text-[13px] text-driftwood mb-5 leading-relaxed">
            Choose a template to scaffold your shared project environment.
          </p>

          <form onSubmit={handleCreateProject} className="space-y-4">
            <div>
              <label
                htmlFor="project-name-input"
                className="text-[12px] font-medium text-driftwood block mb-1.5"
              >
                Project Name
              </label>
              <input
                id="project-name-input"
                type="text"
                required
                placeholder="e.g. NextGen Web App"
                value={newProjectName}
                onChange={(e) => setNewProjectName(e.target.value)}
                className="input-atelier w-full"
              />
            </div>

            <div>
              <label
                htmlFor="project-desc-input"
                className="text-[12px] font-medium text-driftwood block mb-1.5"
              >
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

            <div>
              <span className="text-[12px] font-medium text-driftwood block mb-2">
                Starter Template
              </span>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                {TEMPLATE_OPTIONS.map((tpl) => {
                  const isSelected = selectedTemplate === tpl.id;
                  return (
                    <button
                      key={tpl.id}
                      type="button"
                      aria-pressed={isSelected}
                      onClick={() => setSelectedTemplate(tpl.id)}
                      className={`p-3 rounded-[10px] border cursor-pointer transition text-left inset-glow focus:outline-none focus-visible:ring-2 focus-visible:ring-amber ${
                        isSelected
                          ? 'border-amber/80 bg-linen text-ink shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]'
                          : 'border-white/[0.08] bg-white/[0.025] text-driftwood hover:bg-white/[0.05]'
                      }`}
                    >
                      {tpl.icon}
                      <p className="text-[12.5px] font-medium text-ink">{tpl.label}</p>
                      <p className="font-sans text-[11px] text-ash mt-0.5">{tpl.sub}</p>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-4 border-t border-(--border-subtle)">
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                className="btn-ghost px-3 py-1.5 text-[13px]"
              >
                Cancel
              </button>
              <button type="submit" disabled={creating} className="btn-primary text-[13px]">
                {creating ? 'Creating...' : 'Create Project'}
              </button>
            </div>
          </form>
        </div>
      </Modal>

      <Modal
        isOpen={showJoinModal}
        onClose={() => setShowJoinModal(false)}
        maxWidth="max-w-md"
        title="Join Workspace"
      >
        <div className="p-6">
          <p className="text-[13px] text-driftwood mb-5 leading-relaxed">
            Paste your invitation token or share link to join a team&apos;s code workspace.
          </p>

          {joinError ? (
            <div role="alert" className="mb-4 text-[12.5px] text-crimson bg-crimson/10 border border-crimson/20 rounded-lg px-3 py-2 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-crimson" />
              <span>{joinError}</span>
            </div>
          ) : null}

          <form onSubmit={handleJoinProject} className="space-y-4">
            <div>
              <label
                htmlFor="join-token-input"
                className="text-[12px] font-medium text-driftwood block mb-1.5"
              >
                Invitation Link or Token
              </label>
              <input
                id="join-token-input"
                type="text"
                required
                placeholder="Paste token or link (e.g. 5a9b...)"
                value={inviteToken}
                onChange={(e) => {
                  setInviteToken(e.target.value);
                  if (joinError) setJoinError(null);
                }}
                className="input-atelier w-full font-mono text-[12.5px]"
              />
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-3.5 border-t border-(--border-subtle)">
              <button
                type="button"
                onClick={() => setShowJoinModal(false)}
                className="btn-ghost px-3 py-1.5 text-[13px]"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={joining}
                className="btn-primary text-[13px] disabled:opacity-50"
              >
                {joining ? 'Joining...' : 'Join Workspace'}
              </button>
            </div>
          </form>
        </div>
      </Modal>

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
}
