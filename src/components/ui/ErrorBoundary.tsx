"use client";
import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw, Home } from 'lucide-react';
import Link from 'next/link';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
}

interface State {
  hasError: boolean;
  error?: Error;
}

class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error:', error, errorInfo);
    this.props.onError?.(error, errorInfo);
  }

  public reset() {
    this.setState({ hasError: false, error: undefined });
  }

  /**
   * A deploy replaces every chunk hash, so a tab opened before it asks for files
   * that no longer exist. That is not a bug in the page — it only needs the new
   * build — but it used to surface as the same generic "something went wrong",
   * which sent people hunting for a code fault that was not there.
   */
  private isStaleBuildError(): boolean {
    const error = this.state.error;
    if (!error) return false;
    return /ChunkLoadError|Loading chunk|dynamically imported module|module script failed/i.test(
      `${error.name} ${error.message}`
    );
  }

  /** Bypass the service worker cache, which is what pins a tab to the old build. */
  private hardReload = () => {
    if (typeof window === 'undefined') return;
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker
        .getRegistrations()
        .then((regs) => Promise.all(regs.map((r) => r.unregister())))
        .catch(() => {})
        .finally(() => window.location.reload());
      return;
    }
    window.location.reload();
  };

  public render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="min-h-screen flex items-center justify-center bg-background px-4">
          <div className="max-w-md w-full text-center">
            <div className="bg-card rounded-lg shadow-lg p-8">
              <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <AlertTriangle className="w-8 h-8 text-red-600 dark:text-red-400" />
              </div>
              
              <h1 className="text-2xl font-bold text-foreground mb-2">
                {this.isStaleBuildError()
                  ? 'This page was updated.'
                  : 'Something went wrong on this page.'}
              </h1>

              <p className="text-muted-foreground mb-6">
                {this.isStaleBuildError()
                  ? 'A newer version was released while this tab was open, so part of the old one could not load. Reloading picks up the new build.'
                  : 'We’re sorry, but something unexpected happened. Please try again or contact support if the problem persists.'}
              </p>

              <div className="space-y-3">
                {this.isStaleBuildError() && (
                  <button
                    onClick={this.hardReload}
                    className="w-full inline-flex items-center justify-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-primary hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary"
                  >
                    <RefreshCw className="w-4 h-4 mr-2" />
                    Reload for the new version
                  </button>
                )}
                {/* Re-rendering the same stale bundle just fails again, so this is
                    only offered when a reload is not the actual fix. */}
                {!this.isStaleBuildError() && (
                  <button
                    onClick={() => this.reset()}
                    className="w-full inline-flex items-center justify-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-primary hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary"
                  >
                    <RefreshCw className="w-4 h-4 mr-2" />
                    Try Again
                  </button>
                )}

                <Link
                  href="/"
                  className="w-full inline-flex items-center justify-center px-4 py-2 border border-border text-sm font-medium rounded-md text-foreground/80 bg-card hover:bg-background focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary"
                >
                  <Home className="w-4 h-4 mr-2" />
                  Go Home
                </Link>
              </div>

              {/* Shown in production too, collapsed. This is a staff-only portal, and
                  hiding the message meant every report arrived as "it broke" with no
                  way to tell a stale bundle apart from a real fault. */}
              {this.state.error && (
                <details className="mt-6 text-left">
                  <summary className="cursor-pointer text-sm text-muted-foreground hover:text-foreground/80">
                    Error details (for support)
                  </summary>
                  <pre className="mt-2 max-h-64 text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/30 p-3 rounded overflow-auto whitespace-pre-wrap break-words">
                    {this.state.error.toString()}
                    {this.state.error.stack ? `\n\n${this.state.error.stack}` : ''}
                  </pre>
                </details>
              )}
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;