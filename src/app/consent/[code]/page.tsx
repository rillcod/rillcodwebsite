import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';
import ResultCheckShell from '@/components/result-check/ResultCheckShell';
import { normalizeConsentAccessCode } from '@/lib/consent/access-code';

export const dynamic = 'force-dynamic';

export default async function ConsentCodePage({
  params,
  searchParams,
}: {
  params: Promise<{ code: string }>;
  searchParams: Promise<{ via?: string }>;
}) {
  const [{ code: rawCode }, { via }] = await Promise.all([params, searchParams]);
  const code = normalizeConsentAccessCode(rawCode);

  if (code) {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false } },
    );
    const { data } = await supabase
      .from('consent_forms')
      .select('id, is_public')
      .eq('access_code', code)
      .maybeSingle();

    if (data?.is_public) {
      const method = via === 'qr' ? 'qr' : 'typed';
      redirect(`/forms/${data.id}?via=${method}`);
    }
  }

  return (
    <ResultCheckShell portalLabel="Secure Onboarding">
      <section className="mx-auto max-w-lg text-center">
        <div className="rc-panel rounded-[1.75rem] p-6 sm:p-8">
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-amber-600 dark:text-amber-400">Form unavailable</p>
          <h1 className="mt-3 text-2xl font-bold tracking-tight text-foreground">Check the consent reference</h1>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
            This reference is not active. Check the printed card for typing errors or ask the school for the current onboarding form.
          </p>
          <Link href="/consent" className="rc-cta mt-6 inline-flex w-full items-center justify-center rounded-2xl px-5 py-4 text-sm font-bold">
            Try another reference
          </Link>
        </div>
      </section>
    </ResultCheckShell>
  );
}
