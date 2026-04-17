'use client';

import { useSessionExpiry } from '@/hooks/useSessionExpiry';
import SessionExpiryBanner from '@/components/ui/SessionExpiryBanner';

/**
 * Thin client wrapper that uses the useSessionExpiry hook and renders
 * the SessionExpiryBanner when the session is expiring soon (Req 16.1–16.3).
 *
 * This is a client component so it can be imported into the server-component
 * dashboard layout without making the layout itself a client component.
 */
export default function SessionExpiryWrapper() {
  const { isExpiringSoon, refreshSession } = useSessionExpiry();

  if (!isExpiringSoon) return null;

  return <SessionExpiryBanner onStaySignedIn={refreshSession} />;
}
