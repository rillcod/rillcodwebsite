import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import type { Database } from '@/lib/supabase/client';

/**
 * Supabase client for Next.js middleware: refreshes auth cookies and exposes
 * an authenticated PostgREST client (same JWT) for lightweight role checks.
 */
export function createMiddlewareSupabase(request: NextRequest) {
  const cookieState = {
    current: NextResponse.next({
      request: { headers: request.headers },
    }),
  };

  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => {
            request.cookies.set(name, value);
          });
          cookieState.current = NextResponse.next({
            request: { headers: request.headers },
          });
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieState.current.cookies.set(name, value, options);
          });
        },
      },
    }
  );

  return { supabase, getResponse: () => cookieState.current };
}
