import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createAdmin } from '@supabase/supabase-js';
import { canAccessSchool } from '@/lib/auth/school-scope';

export const dynamic = 'force-dynamic';
function adminClient() {
  return createAdmin(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
}

function tokens(name: string): string[] {
  return (name || '').toLowerCase().replace(/^\d+\.\s*/, '').replace(/[^a-z\s]/g, '').split(/\s+/).filter(t => t.length > 1);
}

// GET /api/consent-forms/leads/[leadId]/match-students?child_index=0
// Returns students in the LEAD'S school, ranked by name similarity to the child —
// the correct, scoped candidate list for the "Link Child" picker.
export async function GET(req: NextRequest, context: { params: Promise<{ leadId: string }> }) {
  const { leadId } = await context.params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await supabase.from('portal_users').select('role, school_id').eq('id', user.id).single();
  if (!profile || !['teacher', 'admin', 'school'].includes(profile.role ?? '')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const sb = adminClient();
  const { data: lead } = await (sb as any)
    .from('form_leads').select('id, school_id, matched_school_id, response_data').eq('id', leadId).single();
  if (!lead) return NextResponse.json({ error: 'Lead not found' }, { status: 404 });
  if (!(await canAccessSchool(user.id, profile, lead.school_id))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // Which child on this lead are we matching?
  const rd = (lead.response_data ?? {}) as Record<string, any>;
  const idx = Number(new URL(req.url).searchParams.get('child_index') ?? 0);
  const childrenArr = Array.isArray(rd.children) ? rd.children : null;
  const childName = (childrenArr?.[idx]?.name || rd.child_name || '').toString();
  const childClass = (childrenArr?.[idx]?.class || rd.child_class || '').toString();

  // Candidate students from the schools tied to this lead (form school + matched school).
  const schoolIds = [...new Set([lead.school_id, lead.matched_school_id].filter(Boolean))] as string[];
  let q = (sb as any).from('portal_users')
    .select('id, full_name, section_class, school_name, school_id, is_active')
    .eq('role', 'student').neq('is_deleted', true).order('full_name').limit(1000);
  if (schoolIds.length > 0) q = q.in('school_id', schoolIds);
  const { data: studentsRaw } = await q;

  // Rank by name-token overlap with the child's name (best matches first).
  const ct = tokens(childName);
  const ranked = (studentsRaw ?? []).map((s: any) => {
    const st = new Set(tokens(s.full_name));
    const overlap = ct.filter(t => st.has(t)).length;
    return { ...s, _score: overlap };
  }).sort((a: any, b: any) => (b._score - a._score) || a.full_name.localeCompare(b.full_name));

  // Flag candidates that are already linked to a parent so the picker can grey them
  // (an existing link — e.g. from a consent form — is shown, not silently overwritten).
  const candidateIds = ranked.map((s: any) => s.id);
  const linkedParent = new Map<string, string>();
  if (candidateIds.length > 0) {
    const { data: linkedRows } = await (sb as any)
      .from('students')
      .select('user_id, parent_email, parent_name')
      .in('user_id', candidateIds)
      .not('parent_email', 'is', null);
    for (const r of linkedRows ?? []) {
      if (r.user_id) linkedParent.set(r.user_id, r.parent_name || r.parent_email);
    }
  }

  const students = ranked.map((s: any) => ({
    id: s.id, full_name: s.full_name, section_class: s.section_class || null,
    school_name: s.school_name || null, suggested: s._score > 0,
    already_linked: linkedParent.has(s.id),
    linked_parent: linkedParent.get(s.id) ?? null,
  }));

  return NextResponse.json({ students, childName, childClass, count: students.length });
}
