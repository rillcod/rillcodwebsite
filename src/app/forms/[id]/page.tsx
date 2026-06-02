import { createClient } from '@supabase/supabase-js';
import PublicConsentForm from './PublicConsentForm';
import Image from 'next/image';

export const dynamic = 'force-dynamic';

interface PublicForm {
  id: string;
  title: string;
  body: string;
  form_type: string;
  due_date: string | null;
  school_id: string | null;
  is_public: boolean;
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
    .select('id, title, body, form_type, due_date, is_public, school_id, schools(name)')
    .eq('id', id)
    .single();
  return data as PublicForm | null;
}

function FormUnavailable({ title, school }: { title?: string; school?: string }) {
  return (
    <div className="min-h-screen bg-[#0b0c0e] text-white flex items-center justify-center px-4">
      <div className="max-w-sm w-full text-center space-y-6">
        <div className="flex justify-center">
          <Image src="/images/logoB.png" alt="Rillcod" width={48} height={48} className="object-contain" />
        </div>
        <div className="w-14 h-14 rounded-full bg-amber-500/10 border border-amber-500/20 flex items-center justify-center mx-auto">
          <svg className="w-7 h-7 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
          </svg>
        </div>
        <div>
          <p className="text-[10px] font-black uppercase tracking-widest text-amber-400 mb-2">Form Unavailable</p>
          <h1 className="text-xl font-black text-white leading-tight">{title ?? 'This form is not currently available'}</h1>
          {school && <p className="text-sm text-[#71717a] mt-2">{school}</p>}
          <p className="text-sm text-[#71717a] mt-4 leading-relaxed">
            This form is not currently accepting responses. It may have been closed or temporarily taken offline.
            Please contact the school or Rillcod directly for assistance.
          </p>
        </div>
        <div className="border border-[#1f2025] rounded-2xl p-4 text-left space-y-1">
          <p className="text-[10px] font-black uppercase tracking-widest text-[#52525b]">Need Help?</p>
          <p className="text-sm font-bold text-white">+234 811 660 0091</p>
          <p className="text-xs text-[#71717a]">support@rillcod.com &nbsp;·&nbsp; www.rillcod.com</p>
        </div>
      </div>
    </div>
  );
}

export default async function PublicFormPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const form = await fetchForm(id);

  // Form doesn't exist at all
  if (!form) {
    return <FormUnavailable />;
  }

  // Form exists but is private — show friendly screen instead of 404
  if (!form.is_public) {
    return <FormUnavailable title={form.title} school={form.schools?.name ?? undefined} />;
  }

  // Fetch active school names to support autocomplete school suggestions in client component
  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
  const { data: schoolsData } = await sb
    .from('schools')
    .select('name')
    .order('name');
  const schoolsList = (schoolsData ?? []).map((s: any) => s.name).filter(Boolean);

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
        <div className="flex items-center gap-4 mb-8">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/images/logoB.png"
            alt="Rillcod Technologies"
            className="h-14 w-auto shrink-0 object-contain"
          />
          {form.schools?.name && (
            <div className="border-l border-[#2a2d33] pl-4">
              <p className="text-[9px] text-[#52525b] font-bold uppercase tracking-widest">Location</p>
              <p className="text-sm font-black text-amber-400 leading-tight">{form.schools.name}</p>
            </div>
          )}
        </div>

        <PublicConsentForm form={form} publicUrl={publicUrl} schoolsList={schoolsList} />
      </div>
    </div>
  );
}
