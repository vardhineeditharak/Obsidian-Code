import React from 'react';
import ReactDOM from 'react-dom/client';
import { ClerkProvider } from '@clerk/react';
import { Toaster } from 'sonner';
import { ErrorBoundary } from './components/ui/ErrorBoundary';
import { BrandMark } from './components/ui/BrandMark';
import App from './App';
import './index.css';
import './lib/monacoSetup';

const PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;

function ClerkConfigNotice() {
  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-parchment p-6 select-none transition-colors duration-150">
      <div className="w-full max-w-lg glass-modal rounded-2xl p-8 space-y-6 text-center">
        <div className="flex flex-col items-center gap-3">
          <BrandMark className="w-11 h-11 text-ink" />
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-ember/12 border border-ember/25 text-amber text-[11px] font-medium tracking-[0.01em]">
            <span>Configuration Required</span>
          </div>
          <h1 className="headline-md text-ink mt-1">
            Clerk Authentication Setup
          </h1>
          <p className="text-[14px] text-driftwood leading-relaxed max-w-md">
            Obsidian Code uses Clerk for authentication. Set your Clerk publishable key in
            .env to continue.
          </p>
        </div>

        <div className="text-left bg-parchment/80 border border-(--border-subtle) rounded-xl p-4 text-xs font-mono text-ink space-y-2">
          <p className="text-driftwood text-[11px] font-sans">
            Add this to your root <code className="text-ember font-mono">.env</code> file:
          </p>
          <pre className="p-2.5 bg-bone rounded border border-stone/50 overflow-x-auto text-ember text-[12px]">
            VITE_CLERK_PUBLISHABLE_KEY=pk_test_...
          </pre>
          <p className="text-driftwood text-[11px] font-sans pt-1">
            Obtain your key from the{' '}
            <a
              href="https://dashboard.clerk.com"
              target="_blank"
              rel="noreferrer"
              className="text-ember underline underline-offset-2 hover:text-ember/80"
            >
              Clerk Dashboard
            </a>{' '}
            under <strong>API Keys</strong>.
          </p>
        </div>

        <div className="flex items-center justify-center gap-3 pt-2">
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="btn-primary text-xs px-5 py-2.5"
          >
            Reload Application
          </button>
        </div>
      </div>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      {PUBLISHABLE_KEY ? (
        <ClerkProvider
          publishableKey={PUBLISHABLE_KEY}
          signInUrl="/"
          signUpUrl="/"
          signInFallbackRedirectUrl="/"
          signUpFallbackRedirectUrl="/"
          afterSignOutUrl="/"
        >
          <App />
        </ClerkProvider>
      ) : (
        <ClerkConfigNotice />
      )}
    </ErrorBoundary>
    <Toaster
      theme="dark"
      richColors
      position="bottom-right"
      toastOptions={{
        classNames: {
          toast:
            'text-[13px]! rounded-xl! shadow-2xl! font-sans!',
          description: 'text-driftwood! text-[12px]! font-sans!',
        },
      }}
    />
  </React.StrictMode>
);
