import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { listUnlinkedStudents, sendUnlinkedParentInvite } from '@/lib/parent-claim/portal-access';
import { recordParentClaimAudit } from '@/lib/parent-claim/audit';

export const dynamic = 'force-dynamic';

const STAFF_ROLES = new Set(['admin', 'teacher', 'school']);

async function requireStaff() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Unauthorized', status: 401 as const };

  const admin = createAdminClient();
  const { data: profile } = await admin
    .from('portal_users')
    .select('id, role, school_id, school_name')
    .eq('id', user.id)
    .maybeSingle();

  if (!profile?.role || !STAFF_ROLES.has(profile.role)) {
    return { error: 'Forbidden', status: 403 as const };
  }
  return { admin, profile };
}

// GET /api/parent-claim/unlinked?limit=100
export async function GET(req: NextRequest) {
  const guard = await requireStaff();
  if ('error' in guard) return NextResponse.json({ error: guard.error }, { status: guard.status });

  const { searchParams } = new URL(req.url);
  const limit = parseInt(searchParams.get('limit') || '100', 10);

  const schoolId = guard.profile.role === 'school' ? guard.profile.school_id : null;
  const schoolName = guard.profile.role === 'teacher' ? guard.profile.school_name : searchParams.get('school');

  const rows = await listUnlinkedStudents(guard.admin as any, {
    schoolId,
    schoolName: schoolName ?? undefined,
    limit,
  });

  return NextResponse.json({ rows, total: rows.length });
}

// POST /api/parent-claim/unlinked  Body: { studentUserIds: string[] }
export async function POST(req: NextRequest) {
  const guard = await requireStaff();
  if ('error' in guard) return NextResponse.json({ error: guard.error }, { status: guard.status });

  const body = await req.json().catch(() => ({}));
  const ids: string[] = Array.isArray(body.studentUserIds) ? body.studentUserIds.filter(Boolean) : [];
  if (ids.length === 0) {
    return NextResponse.json({ error: 'studentUserIds array is required' }, { status: 400 });
  }
  if (ids.length > 50) {
    return NextResponse.json({ error: 'Maximum 50 invites per batch' }, { status: 400 });
  }

  const schoolId = guard.profile.role === 'school' ? guard.profile.school_id : null;
  const schoolName = guard.profile.role === 'teacher' ? guard.profile.school_name : null;
  const pool = await listUnlinkedStudents(guard.admin as any, { schoolId, schoolName: schoolName ?? undefined, limit: 500 });
  const byUserId = new Map(pool.map(r => [r.studentUserId, r]));

  const results: Array<{ studentUserId: string; ok: boolean; email?: boolean; whatsapp?: boolean; error?: string }> = [];

  for (const uid of ids) {
    const row = byUserId.get(uid);
    if (!row) {
      results.push({ studentUserId: uid, ok: false, error: 'Not found or already linked' });
      continue;
    }
    if (!row.parentEmail) {
      results.push({ studentUserId: uid, ok: false, error: 'No parent email on file' });
      continue;
    }
    const sent = await sendUnlinkedParentInvite(guard.admin as any, row);
    await recordParentClaimAudit(guard.admin as any, {
      studentId: row.studentUserId,
      actorId: guard.profile.id,
      email: row.parentEmail,
      phone: row.parentPhone,
      action: 'code_sent',
      note: `Staff invite: ${sent.email ? 'email' : ''}${sent.email && sent.whatsapp ? '+' : ''}${sent.whatsapp ? 'WhatsApp' : ''}`,
    });
    results.push({ studentUserId: uid, ok: sent.email || sent.whatsapp, ...sent });
  }

  const okCount = results.filter(r => r.ok).length;
  return NextResponse.json({ results, sent: okCount, failed: results.length - okCount });
}
