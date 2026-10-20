import React, { useState, useEffect } from 'react';
import { useSignIn, useSignUp } from '@clerk/react/legacy';
import {
  Lock,
  Mail,
  User as UserIcon,
  Code2,
  ArrowRight,
  Eye,
  EyeOff,
  AlertCircle,
  KeyRound,
  RotateCw,
  ExternalLink,
} from 'lucide-react';
import { api } from '../../lib/api';
import { notify } from '../../lib/notifications';
import { sound } from '../../lib/audio/soundEngine';
import { ThemeToggle } from '../ui/AnimatedIcon';
import { BrandMark } from '../ui/BrandMark';

interface AuthPageProps {
  onAuthSuccess?: (user: any, token: string) => void;
}

export const AuthPage: React.FC<AuthPageProps> = ({ onAuthSuccess }) => {
  const { isLoaded: isSignInLoaded, signIn, setActive: setSignInActive } = useSignIn();
  const { isLoaded: isSignUpLoaded, signUp, setActive: setSignUpActive } = useSignUp();

  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Email verification state
  const [verifying, setVerifying] = useState(false);
  const [verificationCode, setVerificationCode] = useState('');
  const [resending, setResending] = useState(false);

  // Desktop browser OAuth state
  const [desktopAuthActive, setDesktopAuthActive] = useState(false);
  const [desktopProvider, setDesktopProvider] = useState<'Google' | 'GitHub'>('Google');
  const [desktopSessionId, setDesktopSessionId] = useState<string | null>(null);

  // Listen for desktop authentication completion via polling and protocol deep links
  useEffect(() => {
    if (!desktopAuthActive || !desktopSessionId) return;

    let cancelled = false;
    let pollTimer: any = null;

    const handleSuccessfulSession = async (sessionData: { token?: string; user?: any; ticket?: string }) => {
      cancelled = true;
      if (pollTimer) clearInterval(pollTimer);
      setDesktopAuthActive(false);
      setLoading(false);

      if (sessionData.user && sessionData.token) {
        if (sessionData.ticket && signIn) {
          try {
            const ticketRes = await signIn.create({
              strategy: 'ticket',
              ticket: sessionData.ticket,
            });
            if (ticketRes.status === 'complete' && ticketRes.createdSessionId) {
              await setSignInActive({ session: ticketRes.createdSessionId });
            }
          } catch (ticketErr) {
            console.warn('[DesktopAuth] Clerk ticket sign-in notice:', ticketErr);
          }
        }

        localStorage.setItem('obsidian_token', sessionData.token);
        localStorage.setItem('obsidian_user', JSON.stringify(sessionData.user));

        if ((window as any).obsidianDesktop?.focusWindow) {
          (window as any).obsidianDesktop.focusWindow();
        }

        notify.success(`Welcome to Obsidian Code, ${sessionData.user.name}!`);
        sound.checkpointSaved();

        if (onAuthSuccess) {
          onAuthSuccess(sessionData.user, sessionData.token);
        }
      }
    };

    // Deep-link protocol listener (obsidian-code://auth-callback?sessionId=...)
    let unsubProtocol: (() => void) | undefined;
    if ((window as any).obsidianDesktop?.onProtocolUrl) {
      unsubProtocol = (window as any).obsidianDesktop.onProtocolUrl((url: string) => {
        try {
          const parsed = new URL(url);
          const protoSessionId = parsed.searchParams.get('sessionId');
          if (protoSessionId === desktopSessionId) {
            api.pollDesktopAuth(desktopSessionId).then((res) => {
              if (res.status === 'completed') {
                handleSuccessfulSession(res);
              }
            });
          }
        } catch (e) {
          console.warn('Protocol URL parse notice:', e);
        }
      });
    }

    // Polling channel as fallback / direct loopback communication
    pollTimer = setInterval(async () => {
      if (cancelled) return;
      try {
        const res = await api.pollDesktopAuth(desktopSessionId);
        if (cancelled) return;

        if (res.status === 'completed') {
          handleSuccessfulSession(res);
        } else if (res.status === 'expired') {
          cancelled = true;
          clearInterval(pollTimer);
          setDesktopAuthActive(false);
          setLoading(false);
          setError('Authentication session expired in browser. Please try again.');
        }
      } catch (err) {
        // Retry next interval
      }
    }, 1000);

    return () => {
      cancelled = true;
      if (pollTimer) clearInterval(pollTimer);
      if (unsubProtocol) unsubProtocol();
    };
  }, [desktopAuthActive, desktopSessionId, signIn, setSignInActive, onAuthSuccess]);

  // Reset errors when switching mode
  const switchMode = (login: boolean) => {
    setIsLogin(login);
    setError(null);
    setVerifying(false);
  };

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isSignInLoaded) return;
    setLoading(true);
    setError(null);

    try {
      const result = await signIn.create({
        identifier: email.trim(),
        password,
      });

      if (result.status === 'complete') {
        await setSignInActive({ session: result.createdSessionId });
        notify.success('Welcome back to Obsidian Code!');
        sound.checkpointSaved();
      } else {
        setError(`Additional verification required (${result.status})`);
      }
    } catch (err: any) {
      const msg =
        err?.errors?.[0]?.longMessage ||
        err?.errors?.[0]?.message ||
        err?.message ||
        'Authentication failed. Please check your credentials.';
      setError(msg);
      notify.error('Sign In Failed', msg);
      sound.executionFailed();
    } finally {
      setLoading(false);
    }
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isSignUpLoaded) return;
    setLoading(true);
    setError(null);

    if (password.length < 8) {
      const msg = 'Password must be at least 8 characters long.';
      setError(msg);
      notify.error('Sign Up Failed', msg);
      setLoading(false);
      return;
    }

    try {
      const result = await signUp.create({
        emailAddress: email.trim(),
        password,
        firstName: name.trim(),
      });

      if (result.status === 'complete') {
        await setSignUpActive({ session: result.createdSessionId });
        notify.success(`Welcome to Obsidian Code, ${name}!`);
        sound.checkpointSaved();
      } else if (result.status === 'missing_requirements') {
        await signUp.prepareEmailAddressVerification({ strategy: 'email_code' });
        setVerifying(true);
        notify.info(`Verification code sent to ${email}`);
      } else {
        setError(`Sign up status: ${result.status}`);
      }
    } catch (err: any) {
      const msg =
        err?.errors?.[0]?.longMessage ||
        err?.errors?.[0]?.message ||
        err?.message ||
        'Failed to create account. Please check your details.';
      setError(msg);
      notify.error('Sign Up Failed', msg);
      sound.executionFailed();
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isSignUpLoaded) return;
    setLoading(true);
    setError(null);

    try {
      const result = await signUp.attemptEmailAddressVerification({
        code: verificationCode.trim(),
      });

      if (result.status === 'complete') {
        await setSignUpActive({ session: result.createdSessionId });
        notify.success('Email verified successfully! Welcome to Obsidian Code.');
        sound.checkpointSaved();
      } else {
        setError('Verification status: ' + result.status);
      }
    } catch (err: any) {
      const msg =
        err?.errors?.[0]?.longMessage ||
        err?.errors?.[0]?.message ||
        err?.message ||
        'Invalid or expired verification code.';
      setError(msg);
      notify.error('Verification Failed', msg);
      sound.executionFailed();
    } finally {
      setLoading(false);
    }
  };

  const handleResendCode = async () => {
    if (!isSignUpLoaded) return;
    setResending(true);
    setError(null);
    try {
      await signUp.prepareEmailAddressVerification({ strategy: 'email_code' });
      notify.success('A new verification code has been sent to your email.');
    } catch (err: any) {
      const msg = err?.errors?.[0]?.message || err?.message || 'Failed to resend code';
      setError(msg);
    } finally {
      setResending(false);
    }
  };

  const handleReopenBrowser = async () => {
    if (!desktopSessionId) return;
    const browserOrigin =
      typeof window !== 'undefined' && window.location.origin && window.location.origin.startsWith('http')
        ? window.location.origin
        : 'http://localhost:3000';
    const strategy = desktopProvider === 'Google' ? 'oauth_google' : 'oauth_github';
    const browserAuthUrl = `${browserOrigin}/desktop-auth?sessionId=${encodeURIComponent(
      desktopSessionId
    )}&strategy=${encodeURIComponent(strategy)}`;
    if ((window as any).obsidianDesktop?.openExternal) {
      await (window as any).obsidianDesktop.openExternal(browserAuthUrl);
      notify.info(`Re-opening ${desktopProvider} sign-in in your browser…`);
    }
  };

  const handleCancelDesktopAuth = () => {
    setDesktopAuthActive(false);
    setLoading(false);
    setDesktopSessionId(null);
  };

  const handleOAuth = async (strategy: 'oauth_google' | 'oauth_github') => {
    setError(null);
    setLoading(true);
    const providerName = strategy === 'oauth_google' ? 'Google' : 'GitHub';

    const isDesktop = Boolean(typeof window !== 'undefined' && (window as any).obsidianDesktop?.isDesktop);

    if (isDesktop) {
      try {
        setDesktopProvider(providerName);
        setDesktopAuthActive(true);

        const { sessionId } = await api.initiateDesktopAuth(strategy);
        setDesktopSessionId(sessionId);

        const browserOrigin =
          typeof window !== 'undefined' && window.location.origin && window.location.origin.startsWith('http')
            ? window.location.origin
            : 'http://localhost:3000';
        const browserAuthUrl = `${browserOrigin}/desktop-auth?sessionId=${encodeURIComponent(
          sessionId
        )}&strategy=${encodeURIComponent(strategy)}`;

        await (window as any).obsidianDesktop.openExternal(browserAuthUrl);
        notify.info(`Opening ${providerName} sign-in in your default browser…`);
      } catch (err: any) {
        console.error('Failed to initiate desktop OAuth:', err);
        setError(err?.message || `Failed to initiate ${providerName} authentication.`);
        setDesktopAuthActive(false);
        setLoading(false);
      }
      return;
    }

    const origin = (typeof window !== 'undefined' && window.location.origin && window.location.origin.startsWith('http'))
      ? window.location.origin
      : 'http://localhost:3000';
    const redirectUrl = `${origin}/sso-callback`;
    const redirectUrlComplete = `${origin}/`;

    try {
      if (isLogin) {
        if (!isSignInLoaded || !signIn) return;
        await signIn.authenticateWithRedirect({
          strategy,
          redirectUrl,
          redirectUrlComplete,
          continueSignUp: true,
        });
      } else {
        if (!isSignUpLoaded || !signUp) return;
        await signUp.authenticateWithRedirect({
          strategy,
          redirectUrl,
          redirectUrlComplete,
          continueSignIn: true,
        });
      }
    } catch (err: any) {
      const msg =
        err?.errors?.[0]?.longMessage ||
        err?.errors?.[0]?.message ||
        err?.message ||
        `${providerName} authentication failed`;
      setError(msg);
      notify.error('OAuth Failed', msg);
      setLoading(false);
    }
  };

  return (
    <div className="h-dvh w-full overflow-y-auto bg-parchment p-4 flex select-none relative transition-colors duration-150">
      {/* Top right theme toggle (hidden for dark-only mode) */}
      <div className="hidden">
        <ThemeToggle size={16} />
      </div>

      <div className="m-auto w-full max-w-md bg-bone rounded-xl p-6 sm:p-8 border border-stone inset-glow shadow-xl relative">
        {/* Brand Header */}
        <div className="text-center mb-6">
          <BrandMark className="w-12 h-12 text-ink mx-auto mb-3" />
          <h1 className="font-brand text-3xl font-semibold tracking-tight text-ink">
            Obsidian Code
          </h1>
          <p className="text-sm text-driftwood mt-1">
            Your team's shared workspace for code
          </p>
        </div>

        {/* Desktop Browser Waiting Screen */}
        {desktopAuthActive ? (
          <div className="space-y-5 text-center py-4">
            <div className="relative inline-flex items-center justify-center">
              <div className="w-12 h-12 rounded-xl bg-linen text-amber flex items-center justify-center border border-stone shadow-inner">
                <RotateCw className="w-6 h-6 animate-spin text-amber" />
              </div>
            </div>

            <div>
              <h2 className="headline-sm text-lg font-semibold text-ink">
                Authenticating in Browser…
              </h2>
              <p className="text-sm text-driftwood mt-1.5 leading-relaxed">
                We opened your default browser to sign in with{' '}
                <span className="text-ink font-medium">{desktopProvider}</span>.
              </p>
              <p className="text-xs text-ash mt-1">
                Once authorized, Obsidian Code will automatically resume.
              </p>
            </div>

            {error && (
              <div
                role="alert"
                className="text-xs text-crimson p-3 bg-crimson/10 border border-crimson/20 rounded-md text-left"
              >
                {error}
              </div>
            )}

            <div className="pt-2 flex flex-col gap-2">
              <button
                type="button"
                onClick={handleReopenBrowser}
                className="btn-primary w-full py-2.5 rounded-lg text-xs font-medium flex items-center justify-center gap-2 cursor-pointer shadow-md"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                <span>Re-open Browser</span>
              </button>
              <button
                type="button"
                onClick={handleCancelDesktopAuth}
                className="w-full py-2 text-xs font-medium text-driftwood hover:text-ink cursor-pointer transition"
              >
                <span>Cancel and Return</span>
              </button>
            </div>
          </div>
        ) : verifying ? (
          <form onSubmit={handleVerifyCode} className="space-y-4">
            <div className="text-center mb-4">
              <div className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-linen text-amber mb-2 inset-glow">
                <KeyRound className="w-4 h-4" />
              </div>
              <h2 className="headline-sm text-base font-semibold text-ink">Verify Your Email</h2>
              <p className="text-sm text-driftwood mt-1">
                Enter the 6-digit code sent to <span className="font-mono text-xs text-ink font-normal">{email}</span>
              </p>
            </div>

            {error && (
              <div
                role="alert"
                id="auth-error-message"
                className="text-xs text-crimson flex items-center gap-1.5"
              >
                <AlertCircle className="w-4 h-4 shrink-0 text-crimson" />
                <span>{error}</span>
              </div>
            )}

            <div>
              <label htmlFor="verification-code" className="text-xs font-normal text-driftwood block mb-1.5">
                Verification Code
              </label>
              <input
                id="verification-code"
                type="text"
                required
                maxLength={6}
                autoFocus
                placeholder="123456"
                value={verificationCode}
                onChange={(e) => setVerificationCode(e.target.value)}
                className="w-full bg-surface border border-stone rounded-lg px-4 py-2 text-center text-lg font-mono tracking-widest text-ink placeholder-mist focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber"
              />
            </div>

            <button
              type="submit"
              disabled={loading || verificationCode.trim().length === 0}
              className="btn-primary w-full py-2.5 text-sm rounded-lg disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber cursor-pointer"
            >
              <span>{loading ? 'Verifying...' : 'Verify & Continue'}</span>
              <ArrowRight className="w-4 h-4" />
            </button>

            <div className="flex items-center justify-between pt-2 text-xs">
              <button
                type="button"
                onClick={() => setVerifying(false)}
                className="btn-ghost"
              >
                ← Back to Sign Up
              </button>
              <button
                type="button"
                onClick={handleResendCode}
                disabled={resending}
                className="text-amber hover:underline flex items-center gap-1"
              >
                <RotateCw className={`w-3 h-3 ${resending ? 'animate-spin' : ''}`} />
                <span>{resending ? 'Sending...' : 'Resend Code'}</span>
              </button>
            </div>
          </form>
        ) : (
          <>
            {/* Tab switch */}
            <div
              role="tablist"
              aria-label="Authentication mode"
              className="flex bg-surface p-1 rounded-lg mb-6 border border-stone"
            >
              <button
                type="button"
                role="tab"
                aria-selected={isLogin}
                onClick={() => switchMode(true)}
                className={`flex-1 py-1.5 text-xs font-medium rounded-md transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber cursor-pointer ${
                  isLogin
                    ? 'bg-linen text-ink border border-stone inset-glow'
                    : 'text-driftwood hover:text-ink'
                }`}
              >
                Sign In
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={!isLogin}
                onClick={() => switchMode(false)}
                className={`flex-1 py-1.5 text-xs font-medium rounded-md transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber cursor-pointer ${
                  !isLogin
                    ? 'bg-linen text-ink border border-stone inset-glow'
                    : 'text-driftwood hover:text-ink'
                }`}
              >
                Create Account
              </button>
            </div>

            {/* Error message */}
            {error && (
              <div
                role="alert"
                id="auth-error-message"
                className="text-xs text-crimson flex items-center gap-1.5 mb-4"
              >
                <AlertCircle className="w-4 h-4 shrink-0 text-crimson" />
                <span>{error}</span>
              </div>
            )}

            {/* Auth Form */}
            <form onSubmit={isLogin ? handleSignIn : handleSignUp} className="space-y-4">
              {!isLogin && (
                <div>
                  <label htmlFor="auth-name" className="text-xs font-normal text-driftwood block mb-1.5">
                    Full Name
                  </label>
                  <div className="relative">
                    <UserIcon className="w-4 h-4 text-ash absolute left-3 top-3 pointer-events-none" />
                    <input
                      id="auth-name"
                      type="text"
                      required
                      autoComplete="name"
                      placeholder="John Doe"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      aria-invalid={!!error}
                      aria-describedby={error ? 'auth-error-message' : undefined}
                      className="w-full bg-surface border border-stone rounded-lg pl-9 pr-3 py-2 text-sm text-ink placeholder-mist focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber"
                    />
                  </div>
                </div>
              )}

              <div>
                <label htmlFor="auth-email" className="text-xs font-normal text-driftwood block mb-1.5">
                  Email Address
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-ash absolute left-3 top-3 pointer-events-none" />
                  <input
                    id="auth-email"
                    type="email"
                    required
                    autoComplete="email"
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    aria-invalid={!!error}
                    aria-describedby={error ? 'auth-error-message' : undefined}
                    className="w-full bg-surface border border-stone rounded-lg pl-9 pr-3 py-2 text-sm text-ink placeholder-mist focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="auth-password" className="text-xs font-normal text-driftwood block mb-1.5">
                  Password
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-ash absolute left-3 top-3 pointer-events-none" />
                  <input
                    id="auth-password"
                    type={showPassword ? 'text' : 'password'}
                    required
                    autoComplete={isLogin ? 'current-password' : 'new-password'}
                    placeholder={isLogin ? '••••••••••••' : 'Min 8 characters'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    aria-invalid={!!error}
                    aria-describedby={error ? 'auth-error-message' : undefined}
                    className="w-full bg-surface border border-stone rounded-lg pl-9 pr-10 py-2 text-sm text-ink placeholder-mist focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    className="absolute right-3 top-2.5 text-ash hover:text-ink transition p-0.5 rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber cursor-pointer"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="btn-primary w-full py-2.5 text-sm rounded-lg mt-2 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber cursor-pointer"
              >
                <span>{loading ? 'Authenticating...' : isLogin ? 'Sign In' : 'Get Started'}</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </form>

            {/* OAuth Buttons */}
            <div className="mt-5 space-y-2.5">
              <div className="flex items-center gap-3 mb-4" aria-hidden="true">
                <div className="flex-1 h-px bg-stone" />
                <span className="text-micro text-ash uppercase font-mono tracking-wider whitespace-nowrap">
                  or continue with
                </span>
                <div className="flex-1 h-px bg-stone" />
              </div>

              {/* Google OAuth Button */}
              <button
                type="button"
                onClick={() => handleOAuth('oauth_google')}
                disabled={loading}
                aria-label="Continue with Google"
                className="w-full py-2.5 bg-surface hover:bg-linen border border-stone text-ink rounded-lg text-sm font-medium transition flex items-center justify-center gap-2.5 disabled:opacity-50 cursor-pointer inset-glow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber"
              >
                <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24">
                  <path
                    fill="#4285F4"
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                  />
                  <path
                    fill="#EA4335"
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                  />
                </svg>
                <span>Continue with Google</span>
              </button>

              {/* GitHub OAuth Button */}
              <button
                type="button"
                onClick={() => handleOAuth('oauth_github')}
                disabled={loading}
                aria-label="Continue with GitHub"
                className="w-full py-2.5 bg-surface hover:bg-linen border border-stone text-ink rounded-lg text-sm font-medium transition flex items-center justify-center gap-2.5 disabled:opacity-50 cursor-pointer inset-glow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber"
              >
                <svg className="w-4 h-4 fill-current shrink-0 text-ink" viewBox="0 0 24 24">
                  <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
                </svg>
                <span>Continue with GitHub</span>
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};
