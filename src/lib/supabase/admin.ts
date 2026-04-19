import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/types/supabase';

/** Typed admin client — only use for tables in the generated Database type */
export function createAdminClient() {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  );
}

/**
 * Untyped admin client — use for newly migrated tables that are not yet
 * in the generated Database type (e.g. engagement, showcase, XP tables).
 * Once Supabase types are regenerated, switch callers back to createAdminClient().
 */
export function createEngagementAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  );
}
