import { createBrowserClient } from '@supabase/ssr';
import type { Database } from '@/types/supabase';

// Re-export so other modules can use the exact DB type.
export type { Database };

export function createClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
