import { ClerkProvider } from '@clerk/react';
import React from 'react';
import ReactDOM from 'react-dom/client';
import { Toaster } from 'sonner';
import { ErrorBoundary } from './components/ui/ErrorBoundary';
import App from './App';
import './index.css';
import './lib/monacoSetup';

const PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;

// Mount single Toaster at the root with dark theme and richColors as instructed by ask-sonner
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
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