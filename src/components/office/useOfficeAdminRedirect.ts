'use client';

import { useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/contexts/auth-context';
import { useOfficeOptional } from './OfficeContext';
import type { InboxSection, OfficeWorkspace, SettingsSection } from './types';

type RedirectTarget = {
  workspace: OfficeWorkspace;
  section?: InboxSection | SettingsSection;
  /** Preserve `id` query as case id when workspace is cases */
  preserveCaseId?: boolean;
  /** Preserve path segment or feedbackId query */
  preserveFeedbackId?: boolean;
  feedbackIdFromPath?: string | null;
};

/**
 * When an admin opens a legacy standalone office URL outside the shell,
 * send them into Office Center so work stays one integrated product.
 * Non-admins and already-embedded panels are left alone.
 */
export function useOfficeAdminRedirect(target: RedirectTarget) {
  const { profile } = useAuth();
  const office = useOfficeOptional();
  const router = useRouter();
  const searchParams = useSearchParams();
  const shouldRedirect = !office && profile?.role === 'admin';

  useEffect(() => {
    if (!shouldRedirect) return;
    const params = new URLSearchParams();
    params.set('workspace', target.workspace);
    if (target.section) params.set('section', target.section);
    if (target.preserveCaseId) {
      const id = searchParams.get('id');
      if (id) params.set('id', id);
    }
    if (target.preserveFeedbackId) {
      const id = target.feedbackIdFromPath || searchParams.get('feedbackId');
      if (id) params.set('feedbackId', id);
    }
    router.replace(`/dashboard/office?${params.toString()}`);
  }, [shouldRedirect, router, searchParams, target.workspace, target.section, target.preserveCaseId, target.preserveFeedbackId, target.feedbackIdFromPath]);

  return shouldRedirect;
}
