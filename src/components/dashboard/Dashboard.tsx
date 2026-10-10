import React, { useState, useEffect } from 'react';
import {
  Sparkles,
  Link as LinkIcon,
  Clock,
  ArrowRight,
  Globe,
  Binary,
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
import { Project, User } from '../../lib/types';
import { api } from '../../lib/api';
import { notify } from '../../lib/notifications';
import { sound } from '../../lib/audio/soundEngine';

interface DashboardProps {
  user: User;
  onOpenProject: (projectId: string) => void;
  onLogout: () => void;
}

export const Dashboard: React.FC<DashboardProps> = ({ user, onOpenProject, onLogout }) => {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showJoinModal, setShowJoinModal] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [newProjectDesc, setNewProjectDesc] = useState('');
  const [selectedTemplate, setSelectedTemplate] = useState<'blank' | 'web' | 'algorithms'>('web');
  const [inviteToken, setInviteToken] = useState('');
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    loadProjects();
  }, []);

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

  const handleJoinProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteToken.trim()) return;

    try {
      const token = inviteToken.includes('/join/') ? inviteToken.split('/join/').pop()! : inviteToken.trim();
      const res = await api.acceptInvitation(token);
      notify.success('Joined Workspace', res.message);
      sound.checkpointSaved();
      setShowJoinModal(false);
      setInviteToken('');
      loadProjects();
      onOpenProject(res.projectId);
    } catch (err: any) {
      notify.error('Failed to join workspace', err.message);
    }
  };

  const handleDeleteProject = async (projectId: string, projectName: string) => {
    if (!confirm(`Are you sure you want to delete "${projectName}"? This action cannot be undone.`)) {
      return;
    }
    try {
      await api.deleteProject(projectId);
      notify.info(`Project "${projectName}" deleted`);
      loadProjects();
    } catch (err: any) {
      notify.error('Failed to delete project', err.message);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#0F172A] text-slate-900 dark:text-slate-100 flex flex-col select-none transition-colors duration-200">
      {/* Top Navbar */}
      <nav className="h-14 border-b border-black/[0.06] dark:border-white/[0.08] bg-white/75 dark:bg-slate-900/80 backdrop-blur-xl px-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-600 flex items-center justify-center shadow-xs">
            <Code size={18} color="white" />
          </div>
          <span className="font-bold text-base tracking-tight text-slate-900 dark:text-white">Obsidian Code</span>
        </div>

        <div className="flex items-center gap-3">
          {/* Apple-style Light / Dark Mode Toggle */}
          <ThemeToggle size={18} />

          <div className="flex items-center gap-2 pl-2 border-l border-black/[0.06] dark:border-white/[0.08]">
            <img
              src={user.avatar || `https://api.dicebear.com/7.x/identicon/svg?seed=${user.name}`}
              alt={user.name}
              className="w-7 h-7 rounded-full border border-black/[0.08] dark:border-white/[0.1]"
            />
            <span className="text-xs font-medium text-slate-700 dark:text-slate-300">{user.name}</span>
          </div>

          <button
            onClick={onLogout}
            title="Sign out"
            className="p-1.5 rounded-full text-slate-400 hover:text-rose-500 dark:hover:text-rose-400 hover:bg-black/[0.04] dark:hover:bg-white/[0.06] transition cursor-pointer"
          >
            <LogOut size={16} />
          </button>
        </div>
      </nav>

      {/* Main Content Area */}
      <main className="flex-1 max-w-6xl w-full mx-auto p-8 flex flex-col">
        {/* Welcome & Action Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight">Your Workspaces</h1>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Collaborate in real time with peers or jump into your personal code playgrounds
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => setShowJoinModal(true)}
              className="flex items-center gap-2 px-4 py-2 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-full text-xs font-semibold transition border border-black/[0.08] dark:border-white/[0.08] shadow-2xs active:scale-95 cursor-pointer"
            >
              <LinkIcon className="w-3.5 h-3.5" />
              <span>Join Workspace</span>
            </button>

            <button
              onClick={() => setShowCreateModal(true)}
              className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white rounded-full text-xs font-semibold transition shadow-xs active:scale-95 cursor-pointer"
            >
              <Plus size={15} color="white" />
              <span>New Project</span>
            </button>
          </div>
        </div>

        {/* Project Grid */}
        {loading ? (
          <div className="flex-1 flex items-center justify-center text-slate-400 dark:text-slate-500 text-xs">
            Loading workspaces...
          </div>
        ) : projects.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center p-12 glass-panel rounded-2xl text-center">
            <div className="w-12 h-12 rounded-2xl bg-blue-500/10 flex items-center justify-center text-blue-500 dark:text-blue-400 mb-4">
              <Sparkles className="w-6 h-6" />
            </div>
            <h2 className="text-base font-semibold text-slate-900 dark:text-white mb-1">No Projects Found</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm mb-6">
              Create a new collaborative project or join an existing workspace with an invitation link.
            </p>
            <button
              onClick={() => setShowCreateModal(true)}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-full text-xs font-semibold transition shadow-xs cursor-pointer"
            >
              Create Your First Project
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {projects.map((p) => (
              <div
                key={p._id}
                onClick={() => onOpenProject(p._id)}
                className="glass-panel p-5 rounded-2xl hover:border-blue-500/40 hover:shadow-md transition-all group cursor-pointer flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-2.5">
                      <div className="w-9 h-9 rounded-xl bg-blue-500/10 dark:bg-slate-800 flex items-center justify-center text-blue-600 dark:text-blue-400 border border-black/[0.04] dark:border-white/[0.06] group-hover:scale-105 transition">
                        <FolderOpen size={16} />
                      </div>
                      <div>
                        <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition">
                          {p.name}
                        </h3>
                        <span className="text-[10px] text-slate-400 dark:text-slate-500 flex items-center gap-1">
                          <Clock className="w-2.5 h-2.5" />
                          {new Date(p.updatedAt).toLocaleDateString()}
                        </span>
                      </div>
                    </div>

                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteProject(p._id, p.name);
                      }}
                      title="Delete Project"
                      className="opacity-0 group-hover:opacity-100 p-1.5 rounded-lg text-slate-400 hover:text-rose-500 dark:hover:text-rose-400 hover:bg-black/[0.04] dark:hover:bg-white/[0.06] transition cursor-pointer"
                    >
                      <Trash size={14} />
                    </button>
                  </div>

                  {p.description && (
                    <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-2 mb-4">{p.description}</p>
                  )}
                </div>

                <div className="flex items-center justify-between pt-4 border-t border-black/[0.04] dark:border-white/[0.06] text-[11px] text-slate-400 dark:text-slate-500">
                  <span className="flex items-center gap-1">
                    <Users size={13} className="text-slate-400 dark:text-slate-500" />
                    Collaborative Workspace
                  </span>
                  <span className="text-blue-600 dark:text-blue-400 group-hover:translate-x-1 transition flex items-center gap-1 font-medium">
                    Open <ArrowRight className="w-3 h-3" />
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {/* New Project Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="glass-modal w-full max-w-lg rounded-2xl p-6">
            <h2 className="text-base font-semibold text-slate-900 dark:text-white mb-1">Create Collaborative Project</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-5">
              Choose a template to scaffold your shared project environment.
            </p>

            <form onSubmit={handleCreateProject} className="space-y-4">
              <div>
                <label className="text-xs font-medium text-slate-700 dark:text-slate-300 block mb-1">Project Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. NextGen Web App"
                  value={newProjectName}
                  onChange={(e) => setNewProjectName(e.target.value)}
                  className="w-full bg-slate-100/80 dark:bg-slate-950/80 border border-black/[0.08] dark:border-white/[0.1] rounded-xl px-3 py-2 text-sm text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="text-xs font-medium text-slate-700 dark:text-slate-300 block mb-1">Description (Optional)</label>
                <input
                  type="text"
                  placeholder="Short workspace description..."
                  value={newProjectDesc}
                  onChange={(e) => setNewProjectDesc(e.target.value)}
                  className="w-full bg-slate-100/80 dark:bg-slate-950/80 border border-black/[0.08] dark:border-white/[0.1] rounded-xl px-3 py-2 text-sm text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:border-blue-500"
                />
              </div>

              {/* Starter Templates */}
              <div>
                <label className="text-xs font-medium text-slate-700 dark:text-slate-300 block mb-2">Starter Template</label>
                <div className="grid grid-cols-3 gap-2.5">
                  <div
                    onClick={() => setSelectedTemplate('web')}
                    className={`p-3 rounded-xl border cursor-pointer transition text-left ${
                      selectedTemplate === 'web'
                        ? 'border-blue-500 bg-blue-500/10 text-slate-900 dark:text-white'
                        : 'border-black/[0.06] dark:border-white/[0.06] bg-black/[0.02] dark:bg-slate-900/60 text-slate-600 dark:text-slate-400 hover:bg-black/[0.04] dark:hover:bg-slate-800'
                    }`}
                  >
                    <Globe className="w-5 h-5 text-blue-500 mb-1.5" />
                    <p className="text-xs font-semibold text-slate-800 dark:text-slate-200">Web App</p>
                    <p className="text-[10px] text-slate-500">HTML, CSS, JS</p>
                  </div>

                  <div
                    onClick={() => setSelectedTemplate('algorithms')}
                    className={`p-3 rounded-xl border cursor-pointer transition text-left ${
                      selectedTemplate === 'algorithms'
                        ? 'border-blue-500 bg-blue-500/10 text-slate-900 dark:text-white'
                        : 'border-black/[0.06] dark:border-white/[0.06] bg-black/[0.02] dark:bg-slate-900/60 text-slate-600 dark:text-slate-400 hover:bg-black/[0.04] dark:hover:bg-slate-800'
                    }`}
                  >
                    <Binary className="w-5 h-5 text-indigo-500 mb-1.5" />
                    <p className="text-xs font-semibold text-slate-800 dark:text-slate-200">Algorithms</p>
                    <p className="text-[10px] text-slate-500">Data structures</p>
                  </div>

                  <div
                    onClick={() => setSelectedTemplate('blank')}
                    className={`p-3 rounded-xl border cursor-pointer transition text-left ${
                      selectedTemplate === 'blank'
                        ? 'border-blue-500 bg-blue-500/10 text-slate-900 dark:text-white'
                        : 'border-black/[0.06] dark:border-white/[0.06] bg-black/[0.02] dark:bg-slate-900/60 text-slate-600 dark:text-slate-400 hover:bg-black/[0.04] dark:hover:bg-slate-800'
                    }`}
                  >
                    <Code size={20} className="text-emerald-500 mb-1.5" />
                    <p className="text-xs font-semibold text-slate-800 dark:text-slate-200">Blank</p>
                    <p className="text-[10px] text-slate-500">Clean slate</p>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-black/[0.06] dark:border-white/[0.1]">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 rounded-full text-xs bg-black/[0.05] dark:bg-slate-800 hover:bg-black/[0.08] dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creating}
                  className="px-4 py-2 rounded-full text-xs bg-blue-600 hover:bg-blue-500 text-white font-semibold transition shadow-xs cursor-pointer"
                >
                  {creating ? 'Creating...' : 'Create Project'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Join Project Modal */}
      {showJoinModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="glass-modal w-full max-w-md rounded-2xl p-6">
            <h2 className="text-base font-semibold text-slate-900 dark:text-white mb-1">Join Workspace</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-5">
              Paste your invitation token or share link to join a team's code workspace.
            </p>

            <form onSubmit={handleJoinProject} className="space-y-4">
              <div>
                <label className="text-xs font-medium text-slate-700 dark:text-slate-300 block mb-1">Invitation Link or Token</label>
                <input
                  type="text"
                  required
                  placeholder="Paste token or link (e.g. 5a9b...)"
                  value={inviteToken}
                  onChange={(e) => setInviteToken(e.target.value)}
                  className="w-full bg-slate-100/80 dark:bg-slate-950/80 border border-black/[0.08] dark:border-white/[0.1] rounded-xl px-3 py-2 text-sm text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:border-blue-500"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-black/[0.06] dark:border-white/[0.1]">
                <button
                  type="button"
                  onClick={() => setShowJoinModal(false)}
                  className="px-4 py-2 rounded-full text-xs bg-black/[0.05] dark:bg-slate-800 hover:bg-black/[0.08] dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-full text-xs bg-blue-600 hover:bg-blue-500 text-white font-semibold transition shadow-xs cursor-pointer"
                >
                  Join Workspace
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
