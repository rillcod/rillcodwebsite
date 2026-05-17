import { notFound } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';
import PublicConsentForm from './PublicConsentForm';

export const dynamic = 'force-dynamic';

interface PublicForm {
  id: string;
  title: string;
  body: string;
  form_type: string;
  due_date: string | null;
  school_id: string | null;
  schools: { name: string } | null;
}

async function fetchForm(id: string): Promise<PublicForm | null> {
  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
  const { data } = await sb
    .from('consent_forms')
    .select('id, title, body, form_type, due_date, school_id, schools(name)')
    .eq('id', id)
    .eq('is_public', true)
    .single();
  return data as PublicForm | null;
}

export default async function PublicFormPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const form = await fetchForm(id);
  if (!form) notFound();

  const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? '').replace(/\/$/, '');
  const publicUrl = `${appUrl}/forms/${id}`;

  return (
    <div className="min-h-screen bg-[#0b0c0e] text-white">
      {/* Ambient glows */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -top-32 -right-32 w-[500px] h-[500px] bg-amber-500/5 rounded-full blur-[120px]" />
        <div className="absolute -bottom-32 -left-32 w-[400px] h-[400px] bg-emerald-500/5 rounded-full blur-[100px]" />
      </div>

      <div className="relative z-10 max-w-xl mx-auto px-4 py-10">
        {/* Rillcod header */}
        <div className="flex items-center gap-3 mb-8">
          <div className="w-10 h-10 rounded-xl bg-amber-500 flex items-center justify-center font-black text-black text-lg shrink-0">
            R
          </div>
          <div>
            <p className="font-black text-white leading-tight">RILLCOD TECHNOLOGIES</p>
            <p className="text-[10px] text-amber-400/80 font-bold tracking-widest uppercase">
              {form.schools?.name ?? 'STEM & Coding Academy'}
            </p>
          </div>
        </div>

        <PublicConsentForm form={form} publicUrl={publicUrl} />
      </div>
    </div>
  );
}
