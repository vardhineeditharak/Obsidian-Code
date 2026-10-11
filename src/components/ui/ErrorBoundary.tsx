import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertCircle, RotateCcw, Home, ChevronDown } from 'lucide-react';
import { BrandMark } from './BrandMark';
import { notify } from '../../lib/notifications';

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
  showDetails: boolean;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  public state: ErrorBoundaryState = {
    hasError: false,
    error: null,
    errorInfo: null,
    showDetails: false,
  };

  public static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('[Obsidian Code ErrorBoundary]', error, errorInfo);
    try {
      notify.error('Application Error', error?.message || 'An unexpected rendering error occurred');
    } catch {}
    this.setState({ errorInfo });
  }

  private handleReload = () => {
    window.location.reload();
  };

  private handleBackToDashboard = () => {
    window.location.href = '/dashboard';
  };

  public render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      const { error, showDetails } = this.state;

      return (
        <div className="min-h-screen w-full flex items-center justify-center bg-parchment p-6 select-none transition-colors duration-150">
          <div className="w-full max-w-lg bg-bone rounded-xl border border-stone p-8 shadow-2xl space-y-6 text-center">
            {/* Header Brand */}
            <div className="flex flex-col items-center gap-3">
              <BrandMark className="w-12 h-12 text-ink" />
              <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-crimson/10 border border-crimson/20 text-crimson text-xs font-mono">
                <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                <span>Renderer Encountered an Exception</span>
              </div>
              <h1 className="headline-md font-normal text-ink mt-1">
                Workspace Interrupted
              </h1>
              <p className="font-editorial text-[16px] text-driftwood leading-relaxed max-w-md">
                An unexpected error occurred while rendering the workspace. Your CRDT changes and snapshots remain intact.
              </p>
            </div>

            {/* Error Message Box */}
            {error && (
              <div className="text-left bg-parchment border border-stone rounded-md p-3.5 text-xs font-mono text-ink">
                <p className="text-crimson font-medium break-words">
                  {error.name}: {error.message}
                </p>

                <div className="mt-2 pt-2 border-t border-stone/50">
                  <button
                    type="button"
                    onClick={() => this.setState((prev) => ({ showDetails: !prev.showDetails }))}
                    className="flex items-center gap-1 text-[11px] text-ash hover:text-ink transition cursor-pointer"
                  >
                    <span>{showDetails ? 'Hide stack trace' : 'View stack trace'}</span>
                    <ChevronDown className={`w-3 h-3 transform transition-transform ${showDetails ? 'rotate-180' : ''}`} />
                  </button>
                  {showDetails && error.stack && (
                    <pre className="mt-2 p-2 bg-bone rounded text-[10px] text-driftwood overflow-x-auto max-h-40 whitespace-pre">
                      {error.stack}
                    </pre>
                  )}
                </div>
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex items-center justify-center gap-3 pt-2">
              <button
                type="button"
                onClick={this.handleBackToDashboard}
                className="btn-secondary text-xs px-4 py-2"
              >
                <Home className="w-3.5 h-3.5" />
                <span>Back to Dashboard</span>
              </button>

              <button
                type="button"
                onClick={this.handleReload}
                className="btn-primary text-xs px-4 py-2"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Reload Application</span>
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
