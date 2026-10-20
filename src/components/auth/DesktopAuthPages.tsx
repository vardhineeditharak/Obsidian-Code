import React, { useEffect, useState, useRef } from 'react';
import { useSignIn } from '@clerk/react/legacy';
import { useUser, AuthenticateWithRedirectCallback } from '@clerk/react';
import { BrandMark } from '../ui/BrandMark';
import { LatticeLoader } from '../ui/LatticeLoader';
import { api } from '../../lib/api';
import { CheckCircle2, RotateCw, ArrowRight } from 'lucide-react';

/**
 * Page rendered in the external browser to initiate Clerk OAuth for the Desktop App.
 * Route: /desktop-auth?sessionId=...&strategy=oauth_google|oauth_github
 */
export const DesktopAuthInitiatePage: React.FC = () => {
  const { isLoaded, signIn } = useSignIn();
  const [error, setError] = useState<string | null>(null);
  const [isRedirecting, setIsRedirecting] = useState(false);
  const hasTriggeredRef = useRef(false);

  const searchParams = new URLSearchParams(window.location.search);
  const sessionId = searchParams.get('sessionId') || '';
  const strategy = (searchParams.get('strategy') || 'oauth_google') as 'oauth_google' | 'oauth_github';
  const providerLabel = strategy === 'oauth_google' ? 'Google' : 'GitHub';

  useEffect(() => {
    if (sessionId) {
      sessionStorage.setItem('obsidian_desktop_session_id', sessionId);
    }
  }, [sessionId]);

  const triggerRedirect = async () => {
    if (!isLoaded || !signIn) return;
    setError(null);
    setIsRedirecting(true);

    const redirectUrl = `${window.location.origin}/desktop-callback?sessionId=${encodeURIComponent(sessionId)}`;
    try {
      // 1. First attempt to create OAuth attempt and extract direct OAuth URL
      const attempt = await signIn.create({
        strategy,
        redirectUrl,
      });

      const directUrl = (attempt as any)?.firstFactorVerification?.externalVerificationRedirectURL;
      if (directUrl) {
        window.location.href = directUrl;
        return;
      }

      // 2. Standard redirect fallback
      await signIn.authenticateWithRedirect({
        strategy,
        redirectUrl,
        redirectUrlComplete: redirectUrl,
        continueSignUp: true,
      });
    } catch (err: any) {
      console.error('Desktop OAuth redirect failed:', err);
      const msg =
        err?.errors?.[0]?.longMessage ||
        err?.errors?.[0]?.message ||
        err?.message ||
        'Failed to start authentication';
      setError(msg);
      setIsRedirecting(false);
    }
  };

  useEffect(() => {
    if (isLoaded && signIn && !hasTriggeredRef.current) {
      hasTriggeredRef.current = true;
      triggerRedirect();
    }
  }, [isLoaded, signIn]);

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-parchment p-6 select-none font-sans">
      <div className="w-full max-w-md bg-bone rounded-xl border border-stone p-8 shadow-xl text-center space-y-6">
        <BrandMark className="w-12 h-12 text-ink mx-auto" />
        <div>
          <h1 className="font-brand text-2xl font-semibold text-ink">
            Obsidian Code Desktop
          </h1>
          <p className="text-sm text-driftwood mt-1.5">
            Connecting to {providerLabel} for desktop authentication…
          </p>
        </div>

        {error ? (
          <div className="p-4 rounded-lg bg-crimson/10 border border-crimson/20 text-crimson text-xs text-left space-y-2">
            <p className="font-semibold">Sign-in Notice</p>
            <p>{error}</p>
            <div className="pt-2">
              <button
                type="button"
                onClick={() => {
                  hasTriggeredRef.current = false;
                  triggerRedirect();
                }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-crimson text-white rounded-md text-xs font-medium cursor-pointer hover:bg-crimson/90 transition"
              >
                <RotateCw className="w-3.5 h-3.5" />
                <span>Retry Sign In</span>
              </button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-4 py-4">
            <div className="p-4 rounded-xl bg-linen/50 border border-stone inline-flex items-center justify-center">
              <LatticeLoader
                label={isRedirecting ? `Opening ${providerLabel}` : 'Preparing OAuth'}
                doneLabel="Redirecting in"
                errorLabel="Failed after"
                pattern="orbit"
                grid={3}
                shape="round"
                color="var(--color-amber, #d97736)"
                doneColor="#4ade80"
                errorColor="#f87171"
                cellSize={6}
                gap={2.5}
                fontSize={13}
                glow
                glowColor="rgba(217, 119, 54, 0.4)"
                showTimer
              />
            </div>
            <button
              type="button"
              onClick={() => {
                hasTriggeredRef.current = false;
                triggerRedirect();
              }}
              className="text-xs text-driftwood hover:text-ink underline cursor-pointer"
            >
              Click here if not redirected automatically
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

/**
 * Page rendered in the external browser after OAuth completion.
 * Syncs user to desktop auth session and redirects back to obsidian-code://
 * Route: /desktop-callback?sessionId=...
 */
export const DesktopAuthCallbackPage: React.FC = () => {
  const { isLoaded, isSignedIn, user: clerkUser } = useUser();
  const [synced, setSynced] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);

  const searchParams = new URLSearchParams(window.location.search);
  const sessionId = searchParams.get('sessionId') || sessionStorage.getItem('obsidian_desktop_session_id') || '';
  const protocolUrl = `obsidian-code://auth-callback?sessionId=${encodeURIComponent(sessionId)}`;

  const performSync = async () => {
    if (!sessionId) {
      setSyncError('Missing desktop session ID. Please restart sign-in from the Obsidian Code desktop app.');
      return;
    }
    if (!clerkUser) return;

    setSyncError(null);
    setIsSyncing(true);

    const email = clerkUser.primaryEmailAddress?.emailAddress || '';
    const name =
      clerkUser.fullName ||
      clerkUser.firstName ||
      clerkUser.username ||
      email.split('@')[0] ||
      'Obsidian Developer';
    const avatar = clerkUser.imageUrl;

    try {
      await api.completeDesktopAuth({
        sessionId,
        clerkId: clerkUser.id,
        email,
        name,
        avatar,
      });

      setSynced(true);
      setIsSyncing(false);

      // Attempt immediate deep link redirect to bring the desktop app to the front
      try {
        window.location.href = protocolUrl;
      } catch (e) {
        console.warn('Protocol launch notice:', e);
      }
    } catch (err: any) {
      console.error('Failed to complete desktop authentication:', err);
      setIsSyncing(false);
      setSyncError(err?.message || 'Failed to sync authentication with desktop app');
    }
  };

  useEffect(() => {
    if (!isLoaded || !isSignedIn || !clerkUser || synced) return;
    performSync();
  }, [isLoaded, isSignedIn, clerkUser, sessionId, synced]);

  const handleOpenApp = () => {
    window.location.href = protocolUrl;
  };

  if (!isLoaded || !isSignedIn) {
    return (
      <div className="min-h-screen w-full flex items-center justify-center bg-parchment p-6 select-none font-sans">
        <AuthenticateWithRedirectCallback
          signInUrl="/desktop-auth"
          signUpUrl="/desktop-auth"
          continueSignUpUrl="/desktop-callback"
          signInForceRedirectUrl="/desktop-callback"
          signUpForceRedirectUrl="/desktop-callback"
          signInFallbackRedirectUrl="/desktop-callback"
          signUpFallbackRedirectUrl="/desktop-callback"
        />
        <div className="w-full max-w-md bg-bone rounded-xl border border-stone p-8 shadow-xl text-center space-y-4">
          <div className="py-2 inline-flex justify-center">
            <LatticeLoader
              label="Finalizing authentication"
              doneLabel="Verified in"
              errorLabel="Failed after"
              pattern="sweep"
              grid={4}
              shape="round"
              color="var(--color-amber, #d97736)"
              doneColor="#4ade80"
              errorColor="#f87171"
              cellSize={6}
              gap={2}
              fontSize={14}
              glow
              showTimer
            />
          </div>
          <p className="text-xs text-driftwood">
            Processing OAuth response with Clerk…
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-parchment p-6 select-none font-sans">
      <div className="w-full max-w-md bg-bone rounded-xl border border-stone p-8 shadow-xl text-center space-y-6">
        <BrandMark className="w-12 h-12 text-ink mx-auto" />

        {syncError ? (
          <div className="space-y-4">
            <h1 className="font-brand text-xl font-semibold text-crimson">
              Authentication Sync Failed
            </h1>
            <p className="text-xs text-driftwood">{syncError}</p>
            <button
              type="button"
              disabled={isSyncing}
              onClick={() => {
                if (!sessionId) {
                  window.location.reload();
                } else {
                  performSync();
                }
              }}
              className="btn-primary text-xs px-4 py-2 inline-flex items-center gap-2 cursor-pointer disabled:opacity-50"
            >
              <RotateCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
              <span>{isSyncing ? 'Retrying…' : 'Retry'}</span>
            </button>
          </div>
        ) : synced ? (
          <div className="space-y-4">
            <div className="w-12 h-12 rounded-full bg-verdant/15 text-verdant flex items-center justify-center mx-auto">
              <CheckCircle2 className="w-7 h-7" />
            </div>
            <div>
              <h1 className="font-brand text-2xl font-semibold text-ink">
                Authentication Successful!
              </h1>
              <p className="text-sm text-driftwood mt-1.5">
                Signed in as <span className="font-medium text-ink">{clerkUser?.fullName || clerkUser?.primaryEmailAddress?.emailAddress}</span>.
              </p>
              <p className="text-xs text-ash mt-1">
                You can now return to the Obsidian Code desktop app.
              </p>
            </div>

            <div className="pt-2 flex flex-col gap-2">
              <button
                type="button"
                onClick={handleOpenApp}
                className="btn-primary w-full py-2.5 rounded-lg text-xs font-medium flex items-center justify-center gap-2 cursor-pointer shadow-md"
              >
                <span>Open Obsidian Code</span>
                <ArrowRight className="w-4 h-4" />
              </button>
              <span className="text-[11px] text-driftwood">
                You can safely close this browser window.
              </span>
            </div>
          </div>
        ) : (
          <div className="space-y-4 py-4 flex flex-col items-center">
            <div className="p-4 rounded-xl bg-linen/50 border border-stone inline-flex items-center justify-center">
              <LatticeLoader
                label="Connecting to Desktop App"
                doneLabel="Connected in"
                errorLabel="Failed after"
                pattern="pulse"
                grid={4}
                shape="round"
                color="var(--color-amber, #d97736)"
                doneColor="#4ade80"
                errorColor="#f87171"
                cellSize={6}
                gap={2}
                fontSize={13}
                glow
                showTimer
              />
            </div>
            <p className="text-xs text-driftwood">
              Linking your browser session to Obsidian Code…
            </p>
          </div>
        )}
      </div>
    </div>
  );
};
