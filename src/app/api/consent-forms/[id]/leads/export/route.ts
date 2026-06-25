import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createAdminSupabase } from '@supabase/supabase-js';
import { canAccessSchool } from '@/lib/auth/school-scope';

export const dynamic = 'force-dynamic';

function adminClient() {
  return createAdminSupabase(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
}

function csvCell(v: unknown): string {
  if (v === null || v === undefined) return '';
  const s = String(v).replace(/"/g, '""');
  return /[",\n\r]/.test(s) ? `"${s}"` : s;
}

function row(...cells: unknown[]): string {
  return cells.map(csvCell).join(',');
}

// GET /api/consent-forms/[id]/leads/export — downloads all form_leads as CSV
export async function GET(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await supabase
    .from('portal_users').select('role, school_id').eq('id', user.id).single();
  if (!profile || !['teacher', 'admin', 'school'].includes(profile.role ?? '')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { data: form } = await supabase
    .from('consent_forms').select('title, school_id').eq('id', id).single();
  if (!form) return NextResponse.json({ error: 'Form not found' }, { status: 404 });
  if (!(await canAccessSchool(user.id, profile, form.school_id))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const sb = adminClient();

  // Optional status filter from query
  const url = new URL(req.url);
  const statusFilter = url.searchParams.get('status');

  let query = (sb as any)
    .from('form_leads')
    .select('id, submitted_at, email, child_current_school, response_data, status, match_status, match_confidence, contact_id, prospect_id, matched_student_id, matched_parent_id')
    .eq('form_id', id)
    .order('submitted_at', { ascending: false });

  if (statusFilter && ['new', 'contacted', 'enrolled', 'lost'].includes(statusFilter)) {
    query = query.eq('status', statusFilter);
  }

  const { data: leads, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const progLabel = (cat: string) =>
    cat === 'young_innovators' ? 'Young Innovators'
    : cat === 'teen_developers'  ? 'Teen Developers'
    : cat || '';

  const headers = [
    '#', 'Date', 'Time',
    'Parent / Guardian', 'Email', 'WhatsApp',
    'Child Name', 'Age', 'Class / Grade', 'Current School',
    'Programme', 'Status', 'Match Status', 'Confidence',
    'CRM Contact', 'Prospect', 'Portal Linked',
    'Prior Coding', 'Devices', 'Learning Goal', 'Schedule', 'Referral Source', 'Special Notes',
  ];

  const csvRows: string[] = [headers.join(',')];

  for (let i = 0; i < (leads ?? []).length; i++) {
    const lead = leads[i];
    const rd   = (lead.response_data ?? {}) as Record<string, unknown>;
    const sub  = new Date(lead.submitted_at);
    const devicesVal = Array.isArray(rd.devices) ? (rd.devices as string[]).join('; ') : '';

    csvRows.push(row(
      i + 1,
      sub.toLocaleDateString('en-GB'),
      sub.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }),
      rd.parent_name ?? '',
      lead.email ?? rd.parent_email ?? '',
      rd.parent_whatsapp ?? '',
      rd.child_name ?? '',
      rd.child_age ?? '',
      rd.child_class ?? '',
      lead.child_current_school ?? rd.child_current_school ?? '',
      progLabel(String(rd.program_category ?? '')),
      lead.status ?? '',
      lead.match_status ?? '',
      lead.match_confidence ?? '',
      lead.contact_id ? 'Yes' : 'No',
      lead.prospect_id ? 'Yes' : 'No',
      lead.matched_parent_id ? 'Yes' : 'No',
      rd.prior_coding ?? '',
      devicesVal,
      rd.learning_goal ?? '',
      rd.preferred_schedule ?? '',
      rd.referral_source ?? rd.hear_about_us ?? '',
      rd.special_notes ?? '',
    ));
  }

  const csv = csvRows.join('\r\n');
  const safeTitle = form.title.replace(/[^a-z0-9]/gi, '_').slice(0, 40);
  const filename  = `${safeTitle}_leads_${new Date().toISOString().slice(0, 10)}.csv`;

  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  });
}
