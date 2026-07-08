import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createClient as createServerClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

type CredentialStatus = { status: string | null; created_at: string | null; password: string | null };

// GET /api/students/credentials-list
// Approved students with their latest credential status, for the Resend Login Credentials page.
// Role-aware (server-side, service role — never depends on client RLS):
//   admin   → all approved students
//   teacher → approved students in the schools they are assigned to (teacher_schools + primary)
//   others  → 403
// School-level (not class isolation): unactivated students have no class yet, so class scoping
// would hide the very students a teacher needs to activate.
export async function GET() {
  try {
    const supabase = await createServerClient();
    const { data: { user }, error: authErr } = await supabase.auth.getUser();
    if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const admin = adminClient();
    const { data: caller } = await admin
      .from('portal_users')
      .select('role, id, school_id')
      .eq('id', user.id)
      .single();
    if (!caller || !['admin', 'teacher'].includes(caller.role)) {
      return NextResponse.json({ error: 'Admin or teacher access required' }, { status: 403 });
    }

    let q = admin
      .from('students')
      .select('id, full_name, student_email, parent_email, school_name, school_id, status, enrollment_type, user_id, created_at')
      .in('status', ['approved', 'paid', 'partially_paid'])
      .order('created_at', { ascending: false });

    if (caller.role === 'teacher') {
      const schoolIds: string[] = [];
      if (caller.school_id) schoolIds.push(caller.school_id);
      const { data: ts } = await admin.from('teacher_schools').select('school_id').eq('teacher_id', caller.id);
      (ts ?? []).forEach((r: any) => { if (r.school_id && !schoolIds.includes(r.school_id)) schoolIds.push(r.school_id); });
      if (schoolIds.length === 0) return NextResponse.json({ students: [] });
      // Match by school_id OR school_name (some legacy student rows only carry the name).
      const { data: schs } = await admin.from('schools').select('name').in('id', schoolIds);
      const names = (schs ?? []).map((s: any) => s.name).filter(Boolean) as string[];
      const orParts = [`school_id.in.(${schoolIds.join(',')})`, ...names.map((n) => `school_name.eq.${JSON.stringify(n)}`)];
      q = q.or(orParts.join(',')) as any;
    }

    const { data: rows, error } = await q;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    const students = rows ?? [];

    // Enrich with latest credential status/password from registration_results — CHUNKED so the
    // request URL never blows up (the bug that hung the page).
    const emails = Array.from(new Set(
      students.flatMap((s: any) => [s.student_email, s.parent_email]).filter(Boolean) as string[],
    ));
    const latestByEmail: Record<string, CredentialStatus> = {};
    const CHUNK = 200;
    for (let i = 0; i < emails.length; i += CHUNK) {
      const batch = emails.slice(i, i + CHUNK);
      const { data: results } = await admin
        .from('registration_results')
        .select('email, status, password, created_at')
        .in('email', batch)
        .order('created_at', { ascending: false });
      for (const r of results ?? []) {
        const key = (r.email || '').trim().toLowerCase();
        if (!key) continue;
        if (!latestByEmail[key]) {
          latestByEmail[key] = { status: r.status, created_at: r.created_at, password: r.password ?? null };
        } else if (!latestByEmail[key].password && r.password) {
          latestByEmail[key].password = r.password;
        }
      }
    }

    const enriched = students.map((s: any) => {
      const sKey = (s.student_email || '').trim().toLowerCase();
      const pKey = (s.parent_email || '').trim().toLowerCase();
      return {
        ...s,
        credEmail: sKey && latestByEmail[sKey] ? latestByEmail[sKey] : null,
        parentCred: pKey && latestByEmail[pKey] ? latestByEmail[pKey] : null,
      };
    });

    return NextResponse.json({ students: enriched }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Unexpected error' }, { status: 500 });
  }
}
