'use client';

/**
 * Thin client wrapper that wires the ErrorBoundary to the server action that
 * logs errors to activity_logs (Req 9.1, 9.2).
 */

import { ErrorInfo, ReactNode } from 'react';
import ErrorBoundary from '@/components/ui/ErrorBoundary';
import { logDashboardError } from '../../app/dashboard/actions';

export default function DashboardErrorBoundary({ children }: { children: ReactNode }) {
  function handleError(error: Error, errorInfo: ErrorInfo) {
    // Fire-and-forget — we don't want a logging failure to affect the UI
    logDashboardError({
      message: error.message,
      componentStack: errorInfo.componentStack ?? '',
    }).catch(() => {});
  }

  return <ErrorBoundary onError={handleError}>{children}</ErrorBoundary>;
}
