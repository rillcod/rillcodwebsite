import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import type { Database } from '@/types/supabase';

export const dynamic = 'force-dynamic';

function resetPage(origin: string, params: Record<string, string>) {
  const url = new URL('/reset-password', origin);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  return url;
}

/** Exchange a one-time password-recovery code on the server before showing the form. */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  if (!code) {
    return NextResponse.redirect(resetPage(url.origin, { recovery_error: 'invalid' }));
  }

  const cookieStore = await cookies();
  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (items) => {
          for (const { name, value, options } of items) cookieStore.set(name, value, options);
        },
      },
    },
  );

  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    console.warn('[auth/recovery] recovery code exchange failed:', error.message);
    return NextResponse.redirect(resetPage(url.origin, { recovery_error: 'expired' }));
  }

  return NextResponse.redirect(resetPage(url.origin, { step: 'reset' }));
}
