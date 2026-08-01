'use client';

import { Suspense } from 'react';
import { useParams } from 'next/navigation';
import { useOfficeAdminRedirect } from '@/components/office/useOfficeAdminRedirect';
import FeedbackDetailStandalone from './FeedbackDetailStandalone';

function FeedbackDetailGate() {
  const params = useParams<{ id: string }>();
  const redirecting = useOfficeAdminRedirect({
    workspace: 'feedback',
    preserveFeedbackId: true,
    feedbackIdFromPath: params.id,
  });

  if (redirecting) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-sm text-muted-foreground mobile-page-root">
        Opening feedback in Office Center...
      </div>
    );
  }

  return <FeedbackDetailStandalone />;
}

export default function FeedbackDetailPage() {
  return (
    <Suspense fallback={<div className="p-8 text-sm text-muted-foreground">Loading feedback...</div>}>
      <FeedbackDetailGate />
    </Suspense>
  );
}
