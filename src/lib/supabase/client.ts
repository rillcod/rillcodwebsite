import { createBrowserClient } from '@supabase/ssr';
import type { Database } from '@/types/supabase';

// Safely wrap the database type to prevent deep recursion in TypeScript
// while maintaining full autocomplete for tables and columns.
export type SafeDatabase = {
  [K in keyof Database]: Database[K] extends { Tables: any }
  ? {
    [T in keyof Database[K]]: T extends 'Tables'
    ? {
      [Table in keyof Database[K]['Tables']]: Omit<Database[K]['Tables'][Table], 'Relationships'> & {
        Relationships: []
      }
    }
    : Database[K][T]
  }
  : Database[K]
};

export function createClient() {
  return createBrowserClient<SafeDatabase>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
