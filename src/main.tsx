import { ClerkProvider } from '@clerk/react';
import React from 'react';
import ReactDOM from 'react-dom/client';
import { Toaster } from 'sonner';
import { ErrorBoundary } from './components/ui/ErrorBoundary';
import { BrandMark } from './components/ui/BrandMark';
import App from './App';
import './index.css';
import './lib/monacoSetup';

const PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;

const ClerkConfigNotice: React.FC = () => (
  <div className="min-h-screen w-full flex items-center justify-center bg-parchment p-6 select-none transition-colors duration-150">
    <div className="w-full max-w-lg bg-bone rounded-xl border border-stone p-8 shadow-2xl space-y-6 text-center">
      <div className="flex flex-col items-center gap-3">
        <BrandMark className="w-12 h-12 text-ink" />
        <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-ember/10 border border-ember/20 text-ember text-xs font-mono">
          <span>Configuration Required</span>
        </div>
        <h1 className="headline-md font-normal text-ink mt-1">
          Clerk Authentication Setup
        </h1>
        <p className="text-[15px] text-driftwood leading-relaxed max-w-md">
          Obsidian Code requires Clerk for secure authentication and multi-user synchronization.
          Please configure your Clerk Publishable Key in your environment file.
        </p>
      </div>

      <div className="text-left bg-parchment border border-stone rounded-md p-4 text-xs font-mono text-ink space-y-2">
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

// Mount single Toaster at the root with dark theme and richColors as instructed by ask-sonner
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
      theme="system"
      position="bottom-right"
      toastOptions={{
        className: 'border border-stone bg-bone text-ink text-sm rounded-md shadow-2xl font-sans',
        descriptionClassName: 'text-driftwood text-xs font-sans',
      }}
    />
  </React.StrictMode>
);