import React, { useState } from 'react';
import { Lock, Mail, User as UserIcon, Code2, ArrowRight } from 'lucide-react';
import { api } from '../../lib/api';
import { notify } from '../../lib/notifications';
import { sound } from '../../lib/audio/soundEngine';

interface AuthPageProps {
  onAuthSuccess: (user: any, token: string) => void;
}

export const AuthPage: React.FC<AuthPageProps> = ({ onAuthSuccess }) => {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      if (isLogin) {
        const res = await api.login(email, password);
        notify.success(`Welcome back, ${res.user.name}!`);
        sound.checkpointSaved();
        onAuthSuccess(res.user, res.token);
      } else {
        const res = await api.register(email, password, name);
        notify.success(`Welcome to Obsidian Code, ${res.user.name}!`);
        sound.checkpointSaved();
        onAuthSuccess(res.user, res.token);
      }
    } catch (err: any) {
      notify.error('Authentication Failed', err.message);
      sound.executionFailed();
    } finally {
      setLoading(false);
    }
  };

  const handleQuickDemo = async () => {
    setEmail('developer@obsidian.local');
    setPassword('demo123456');
    setName('Staff Engineer');
    setIsLogin(true);
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-gradient-to-br from-[#0A0F1D] via-[#0F172A] to-[#1E293B] p-4 select-none">
      <div className="w-full max-w-md glass-modal rounded-2xl p-8 border border-white/10 shadow-2xl relative overflow-hidden">
        {/* Glow accent */}
        <div className="absolute -top-24 -left-24 w-48 h-48 bg-blue-500/20 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-24 -right-24 w-48 h-48 bg-indigo-500/20 rounded-full blur-3xl pointer-events-none" />

        {/* Brand Header */}
        <div className="text-center mb-8 relative">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-600 shadow-lg mb-3">
            <Code2 className="w-6 h-6 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Obsidian Code</h1>
          <p className="text-xs text-slate-400 mt-1">Your team's shared workspace for code</p>
        </div>

        {/* Tab switch */}
        <div className="flex bg-slate-900/80 p-1 rounded-xl mb-6 border border-white/5">
          <button
            type="button"
            onClick={() => setIsLogin(true)}
            className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition ${
              isLogin ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Sign In
          </button>
          <button
            type="button"
            onClick={() => setIsLogin(false)}
            className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition ${
              !isLogin ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Create Account
          </button>
        </div>

        {/* Auth Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          {!isLogin && (
            <div>
              <label className="text-xs font-medium text-slate-300 block mb-1.5">Full Name</label>
              <div className="relative">
                <UserIcon className="w-4 h-4 text-slate-500 absolute left-3 top-3" />
                <input
                  type="text"
                  required
                  placeholder="Ada Lovelace"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full bg-slate-950/70 border border-white/10 rounded-xl pl-9 pr-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-blue-500"
                />
              </div>
            </div>
          )}

          <div>
            <label className="text-xs font-medium text-slate-300 block mb-1.5">Email Address</label>
            <div className="relative">
              <Mail className="w-4 h-4 text-slate-500 absolute left-3 top-3" />
              <input
                type="email"
                required
                placeholder="developer@obsidian.local"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-slate-950/70 border border-white/10 rounded-xl pl-9 pr-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-blue-500"
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-slate-300 block mb-1.5">Password</label>
            <div className="relative">
              <Lock className="w-4 h-4 text-slate-500 absolute left-3 top-3" />
              <input
                type="password"
                required
                placeholder="••••••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-slate-950/70 border border-white/10 rounded-xl pl-9 pr-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-blue-500"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white rounded-xl text-sm font-semibold transition shadow-md flex items-center justify-center gap-2 mt-2 disabled:opacity-50"
          >
            <span>{loading ? 'Authenticating...' : isLogin ? 'Sign In' : 'Get Started'}</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </form>

        {/* Demo Fast Autofill */}
        <div className="mt-6 text-center border-t border-white/5 pt-4">
          <button
            type="button"
            onClick={handleQuickDemo}
            className="text-xs text-blue-400 hover:text-blue-300 hover:underline"
          >
            Fill sample credentials (developer@obsidian.local)
          </button>
        </div>
      </div>
    </div>
  );
};
