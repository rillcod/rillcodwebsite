'use server';

import { createClient } from '@/lib/supabase/server';

/**
 * Server action: writes an activity_logs row when the dashboard ErrorBoundary
 * catches a render error (Req 9.2).
 */
export async function logDashboardError(params: {
  message: string;
  componentStack: string;
}) {
  try {
    const supabase = await createClient();

    // Get the current user — may be null if the session expired
    const { data: { user } } = await supabase.auth.getUser();

    await supabase.from('activity_logs').insert({
      user_id: user?.id ?? null,
      event_type: 'dashboard_render_error',
      metadata: {
        message: params.message,
        component_stack: params.componentStack,
      },
    });
  } catch {
    // Swallow — logging must never throw
  }
}
