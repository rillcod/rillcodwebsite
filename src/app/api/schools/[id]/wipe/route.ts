import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { r2Delete } from '@/lib/r2/client';
import { logAudit } from '@/lib/audit/log';

export const dynamic = 'force-dynamic';

function adminClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

// ADMIN ONLY. A school wipe is total and irreversible, so it's locked to platform admins.
async function requireAdmin() {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Unauthorized', status: 401 as const };
  const admin = adminClient();
  const { data: caller } = await admin.from('portal_users').select('id, role').eq('id', user.id).single();
  if (!caller || caller.role !== 'admin') return { error: 'Only a platform admin can remove a school.', status: 403 as const };
  return { admin, caller };
}

async function countWhere(admin: ReturnType<typeof adminClient>, table: string, schoolId: string) {
  const { count } = await admin.from(table as any).select('id', { count: 'exact', head: true }).eq('school_id', schoolId);
  return count ?? 0;
}

// GET — non-destructive scan: what would be removed. Powers the confirmation preview.
export async function GET(_req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const ctx = await requireAdmin();
  if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  const { admin } = ctx;

  const { data: school } = await admin.from('schools').select('id, name').eq('id', id).maybeSingle();
  if (!school) return NextResponse.json({ error: 'School not found' }, { status: 404 });

  // Headline categories for the preview (the wipe itself removes ALL school-scoped rows).
  const [
    students, staff, classes, cards, reports, batches, sessions, recordings, consentForms, leads, invoices, payments,
  ] = await Promise.all([
    admin.from('portal_users').select('id', { count: 'exact', head: true }).eq('school_id', id).eq('role', 'student').then(r => r.count ?? 0),
    admin.from('portal_users').select('id', { count: 'exact', head: true }).eq('school_id', id).in('role', ['teacher', 'school']).then(r => r.count ?? 0),
    countWhere(admin, 'classes', id),
    countWhere(admin, 'identity_cards', id),
    countWhere(admin, 'student_progress_reports', id),
    countWhere(admin, 'registration_batches', id),
    countWhere(admin, 'live_sessions', id),
    countWhere(admin, 'session_recordings', id),
    countWhere(admin, 'consent_forms', id),
    countWhere(admin, 'form_leads', id),
    countWhere(admin, 'invoices', id),
    countWhere(admin, 'payment_transactions', id),
  ]);

  return NextResponse.json({
    school: { id: school.id, name: school.name },
    counts: { students, staff, classes, cards, reports, batches, sessions, recordings, consentForms, leads, invoices, payments },
  });
}

// POST — perform the wipe. Body: { confirmName } must exactly match the school name.
export async function POST(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const ctx = await requireAdmin();
  if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  const { admin, caller } = ctx;

  const { data: school } = await admin.from('schools').select('id, name').eq('id', id).maybeSingle();
  if (!school) return NextResponse.json({ error: 'School not found' }, { status: 404 });

  const body = await req.json().catch(() => ({} as Record<string, unknown>));
  const confirmName = typeof body.confirmName === 'string' ? body.confirmName.trim() : '';
  if (confirmName.toLowerCase() !== String(school.name ?? '').trim().toLowerCase()) {
    return NextResponse.json({ error: 'Confirmation text does not match the school name.' }, { status: 400 });
  }

  // 1. Delete R2 objects first (SQL can't reach object storage) — recordings + card assets + files.
  const r2Keys: string[] = [];
  const { data: recs } = await admin.from('session_recordings').select('r2_key').eq('school_id', id);
  for (const rec of recs ?? []) if ((rec as any).r2_key) r2Keys.push((rec as any).r2_key);
  // Library files store their object key in storage_path.
  const { data: files } = await admin.from('files').select('storage_path').eq('school_id', id);
  for (const f of files ?? []) { const k = (f as any).storage_path; if (k) r2Keys.push(k); }
  let r2Deleted = 0;
  for (const key of r2Keys) { try { await r2Delete(key); r2Deleted++; } catch { /* already gone */ } }

  // 2. Snapshot the headline for the audit record BEFORE the rows vanish.
  const [students, staff] = await Promise.all([
    admin.from('portal_users').select('id', { count: 'exact', head: true }).eq('school_id', id).eq('role', 'student').then(r => r.count ?? 0),
    admin.from('portal_users').select('id', { count: 'exact', head: true }).eq('school_id', id).in('role', ['teacher', 'school']).then(r => r.count ?? 0),
  ]);

  // 3. The total cascade (users + every school-scoped row + the school itself).
  const { data: result, error } = await (admin as any).rpc('hard_delete_school', { p_school: id });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // 4. Audit the wipe — this record survives (it's not scoped to the deleted school).
  await logAudit(admin as any, {
    action: 'delete_school',
    actorId: caller.id,
    resourceType: 'school',
    resourceId: id,
    oldValue: school.name,
    newValue: `Deleted school ${school.name}`,
    newValues: {
      summary: `Deleted school ${school.name}`,
      school_name: school.name,
      students,
      staff,
      r2_objects_deleted: r2Deleted,
      ...(result ?? {}),
    },
  });

  return NextResponse.json({ success: true, school: school.name, r2Deleted, ...(result ?? {}) });
}
