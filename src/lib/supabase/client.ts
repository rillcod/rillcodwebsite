import { createBrowserClient } from '@supabase/ssr';
import type { Database } from '@/types/supabase';

/** Strip heavy Relationships arrays to avoid TS deep recursion; map only `public.Tables`. */
type PublicTablesSafe = {
  [T in keyof Database['public']['Tables']]: Omit<
    Database['public']['Tables'][T],
    'Relationships'
  > & { Relationships: [] };
};

// Map top-level keys except `public` unchanged; rebuild `public.Tables` so every table (e.g. announcement_reads) stays in the `.from()` union.
export type SafeDatabase = Omit<Database, 'public'> & {
  public: Omit<Database['public'], 'Tables'> & { Tables: PublicTablesSafe };
};

export function createClient() {
  return createBrowserClient<SafeDatabase>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
