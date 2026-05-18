import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createAdmin } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

function adminClient() {
  return createAdmin(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
}

const PROGRAMME_LABELS: Record<string, string> = {
  young_innovators: 'Young Innovators',
  teen_developers:  'Teen Developers',
};

function labelProgramme(raw: string | null | undefined): string {
  if (!raw) return 'Unspecified';
  return PROGRAMME_LABELS[raw] ?? raw;
}

// GET /api/consent-forms/analytics
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await supabase
    .from('portal_users')
    .select('role, school_id')
    .eq('id', user.id)
    .single();

  if (!profile || !['teacher', 'admin', 'school'].includes(profile.role ?? '')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const sb = adminClient();
  const isAdmin = profile.role === 'admin';

  // ── Fetch form_leads ───────────────────────────────────────────────────────
  let leadsQuery = sb
    .from('form_leads')
    .select('id, form_id, school_id, status, match_status, submitted_at, response_data, email, contact_id, prospect_id');

  if (!isAdmin && profile.school_id) {
    leadsQuery = leadsQuery.eq('school_id', profile.school_id);
  }

  const { data: leadsRaw, error: leadsErr } = await leadsQuery;
  if (leadsErr) return NextResponse.json({ error: leadsErr.message }, { status: 500 });

  const leads = (leadsRaw ?? []) as Array<{
    id: string;
    form_id: string | null;
    school_id: string | null;
    status: string | null;
    match_status: string | null;
    submitted_at: string | null;
    response_data: Record<string, string> | null;
    email: string | null;
    contact_id: string | null;
    prospect_id: string | null;
  }>;

  // ── Fetch consent_forms ────────────────────────────────────────────────────
  let formsQuery = sb
    .from('consent_forms')
    .select('id, title, form_type, school_id, created_at');

  if (!isAdmin && profile.school_id) {
    formsQuery = formsQuery.eq('school_id', profile.school_id);
  }

  const { data: formsRaw, error: formsErr } = await formsQuery;
  if (formsErr) return NextResponse.json({ error: formsErr.message }, { status: 500 });

  const forms = (formsRaw ?? []) as Array<{
    id: string;
    title: string | null;
    form_type: string | null;
    school_id: string | null;
    created_at: string | null;
  }>;

  // ── Compute summary ────────────────────────────────────────────────────────
  const total_leads    = leads.length;
  const newCount       = leads.filter(l => l.status === 'new').length;
  const contacted      = leads.filter(l => l.status === 'contacted').length;
  const enrolled       = leads.filter(l => l.status === 'enrolled').length;
  const lost           = leads.filter(l => l.status === 'lost').length;
  const crm_linked     = leads.filter(l => l.contact_id != null).length;
  const pending_review = leads.filter(l => l.match_status === 'pending_review').length;
  const conversion_rate = total_leads > 0
    ? Math.round((enrolled / total_leads) * 1000) / 10
    : 0;

  const summary = {
    total_leads,
    new: newCount,
    contacted,
    enrolled,
    lost,
    conversion_rate,
    crm_linked,
    pending_review,
  };

  // ── By programme ──────────────────────────────────────────────────────────
  const progMap = new Map<string, { count: number; enrolled: number }>();
  for (const lead of leads) {
    const raw   = lead.response_data?.program_category ?? null;
    const label = labelProgramme(raw);
    const entry = progMap.get(label) ?? { count: 0, enrolled: 0 };
    entry.count++;
    if (lead.status === 'enrolled') entry.enrolled++;
    progMap.set(label, entry);
  }
  const by_programme = Array.from(progMap.entries())
    .map(([programme, v]) => ({ programme, count: v.count, enrolled: v.enrolled }))
    .sort((a, b) => b.count - a.count);

  // ── By source ─────────────────────────────────────────────────────────────
  const sourceMap = new Map<string, number>();
  for (const lead of leads) {
    const src = lead.response_data?.referral_source ?? 'Unknown';
    sourceMap.set(src, (sourceMap.get(src) ?? 0) + 1);
  }
  const by_source = Array.from(sourceMap.entries())
    .map(([source, count]) => ({ source, count }))
    .sort((a, b) => b.count - a.count);

  // ── By form ───────────────────────────────────────────────────────────────
  const formTitleMap = new Map<string, string>(
    forms.map(f => [f.id, f.title ?? '(Untitled)'])
  );
  const formStatsMap = new Map<string, { total: number; enrolled: number; newL: number }>();
  for (const lead of leads) {
    const fid = lead.form_id ?? 'unknown';
    const entry = formStatsMap.get(fid) ?? { total: 0, enrolled: 0, newL: 0 };
    entry.total++;
    if (lead.status === 'enrolled') entry.enrolled++;
    if (lead.status === 'new') entry.newL++;
    formStatsMap.set(fid, entry);
  }
  const by_form = Array.from(formStatsMap.entries())
    .map(([form_id, v]) => ({
      form_id,
      title: formTitleMap.get(form_id) ?? '(Untitled)',
      total: v.total,
      enrolled: v.enrolled,
      new: v.newL,
    }))
    .sort((a, b) => b.total - a.total);

  // ── Daily submissions (last 30 days) ──────────────────────────────────────
  const now       = new Date();
  const cutoff    = new Date(now);
  cutoff.setDate(cutoff.getDate() - 30);

  const dayMap = new Map<string, number>();
  for (const lead of leads) {
    if (!lead.submitted_at) continue;
    const d = new Date(lead.submitted_at);
    if (d < cutoff) continue;
    const key = d.toISOString().slice(0, 10); // YYYY-MM-DD
    dayMap.set(key, (dayMap.get(key) ?? 0) + 1);
  }
  const daily_submissions = Array.from(dayMap.entries())
    .map(([date, count]) => ({ date, count }))
    .sort((a, b) => a.date.localeCompare(b.date));

  // ── Funnel ────────────────────────────────────────────────────────────────
  const funnel = [
    { stage: 'Submitted',  count: total_leads },
    { stage: 'CRM Saved',  count: crm_linked },
    { stage: 'Contacted',  count: leads.filter(l => l.status === 'contacted' || l.status === 'enrolled').length },
    { stage: 'Trial',      count: leads.filter(l => l.match_status === 'approved').length },
    { stage: 'Enrolled',   count: enrolled },
  ];

  return NextResponse.json({
    summary,
    by_programme,
    by_source,
    by_form,
    daily_submissions,
    funnel,
  });
}
