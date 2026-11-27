import React, { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertCircle, ChevronDown, Home, RotateCcw } from 'lucide-react';
import { BrandMark } from './BrandMark';
import { notify } from '../../lib/notifications';

export interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
}

export interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
  showDetails?: boolean;
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

  public componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error('[Obsidian Code ErrorBoundary]', error, errorInfo);
    try {
      notify.error(
        'Application Error',
        error?.message || 'An unexpected rendering error occurred'
      );
    } catch {
      // Ignore notification errors during crash recovery
    }
    this.setState({ errorInfo });
  }

  private handleReload = (): void => {
    window.location.reload();
  };

  private handleBackToDashboard = (): void => {
    window.location.href = '/dashboard';
  };

  public render(): ReactNode {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      const { error, showDetails = false } = this.state;

      return (
        <div className="min-h-screen w-full flex items-center justify-center bg-parchment p-6 select-none transition-colors duration-150">
          <div className="w-full max-w-lg glass-modal rounded-2xl p-8 space-y-6 text-center">
            <div className="flex flex-col items-center gap-3">
              <BrandMark className="w-11 h-11 text-ink" />
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-crimson/12 border border-crimson/25 text-crimson text-[11px] font-medium tracking-[0.01em]">
                <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                <span>Render Error</span>
              </div>
              <h1 className="headline-md text-ink mt-1">
                Workspace Interrupted
              </h1>
              <p className="text-[14px] text-driftwood leading-relaxed max-w-md">
                Something went wrong while rendering the editor. Saved checkpoints and synced
                local edits remain stored.
              </p>
            </div>

            {error ? (
              <div className="text-left bg-parchment/80 border border-(--border-subtle) rounded-xl p-3.5 text-xs font-mono text-ink">
                <p className="text-crimson font-medium break-words">
                  {error.name}: {error.message}
                </p>

                <div className="mt-2 pt-2 border-t border-stone/50">
                  <button
                    type="button"
                    onClick={() =>
                      this.setState((prev) => ({ showDetails: !prev.showDetails }))
                    }
                    className="flex items-center gap-1 text-[11px] text-ash hover:text-ink transition cursor-pointer"
                  >
                    <span>{showDetails ? 'Hide stack trace' : 'View stack trace'}</span>
                    <ChevronDown
                      className={`w-3 h-3 transform transition-transform ${
                        showDetails ? 'rotate-180' : ''
                      }`}
                    />
                  </button>
                  {showDetails && error.stack ? (
                    <pre className="mt-2 p-2 bg-bone rounded text-[10px] text-driftwood overflow-x-auto max-h-40 whitespace-pre">
                      {error.stack}
                    </pre>
                  ) : null}
                </div>
              </div>
            ) : null}

            <div className="flex items-center justify-center gap-3 pt-2">
              <button
                type="button"
                onClick={this.handleBackToDashboard}
                className="btn-secondary text-[13px] px-4 py-2"
              >
                <Home className="w-3.5 h-3.5" />
                <span>Back to Dashboard</span>
              </button>

              <button
                type="button"
                onClick={this.handleReload}
                className="btn-primary text-[13px] px-4 py-2"
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
