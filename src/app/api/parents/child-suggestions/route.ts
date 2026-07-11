import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

function admin() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
}

// GET /api/parents/child-suggestions
// Returns candidate student matches for the logged-in parent based on their
// consent form lead data (child name, class, school they entered on the form).
export async function GET(_req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await supabase
    .from('portal_users')
    .select('id, email, full_name, role, school_id')
    .eq('id', user.id).single();

  if (!profile || profile.role !== 'parent') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const sb = admin();

  // Check if parent already has linked children
  const { data: existingLinks } = await (sb as any)
    .from('parent_student_links')
    .select('student_id')
    .eq('parent_id', profile.id)
    .limit(1);

  if (existingLinks && existingLinks.length > 0) {
    return NextResponse.json({ suggestions: [], alreadyLinked: true });
  }

  // Find the parent's consent form lead(s) to get child info they entered
  const { data: leads } = await (sb as any)
    .from('form_leads')
    .select('id, response_data, child_current_school, matched_student_id')
    .or(`email.eq.${profile.email},response_data->>parent_email.eq.${profile.email}`)
    .order('submitted_at', { ascending: false })
    .limit(5);

  if (!leads || leads.length === 0) {
    return NextResponse.json({ suggestions: [], noLead: true });
  }

  // Build search terms from the most recent lead
  const lead = leads[0];
  const rd        = (lead.response_data ?? {}) as Record<string, string>;
  const childName = (rd.child_name || '').trim();
  const childClass = (rd.child_class || '').trim();
  const schoolName = lead.child_current_school || rd.child_current_school || '';

  if (!childName) {
    return NextResponse.json({ suggestions: [], noChildName: true });
  }

  // Search students by name similarity
  const nameParts = childName.toLowerCase().split(' ').filter(Boolean);
  const { data: candidates } = await (sb as any)
    .from('portal_users')
    .select('id, full_name, section_class, school_name, school_id')
    .eq('role', 'student')
    .ilike('full_name', `%${nameParts[0]}%`)
    .limit(20);

  if (!candidates || candidates.length === 0) {
    return NextResponse.json({ suggestions: [], childName, childClass, leadId: lead.id });
  }

  // Score each candidate for relevance
  const candidatePortalIds = candidates.map((candidate: any) => candidate.id);
  const { data: studentRows } = await (sb as any)
    .from('students')
    .select('id, user_id')
    .in('user_id', candidatePortalIds);
  const studentRowByPortal = new Map((studentRows ?? []).map((row: any) => [row.user_id, row.id]));
  const candidateStudentRowIds = [...studentRowByPortal.values()] as string[];
  const { data: existingCandidateLinks } = candidateStudentRowIds.length
    ? await (sb as any).from('parent_student_links').select('student_id, parent_id').in('student_id', candidateStudentRowIds)
    : { data: [] };
  const linkedByStudentRow = new Map((existingCandidateLinks ?? []).map((link: any) => [link.student_id, link.parent_id]));

  const scored = candidates.map((c: any) => {
    let score = 0;
    const cn = (c.full_name ?? '').toLowerCase();
    // Name token overlap
    nameParts.forEach((t: string) => { if (cn.includes(t)) score += 10; });
    if (cn === childName.toLowerCase()) score += 30;
    // Class match
    if (childClass && c.section_class?.toLowerCase().includes(childClass.toLowerCase())) score += 15;
    // School match (current school the child is at, or Rillcod school)
    if (schoolName && c.school_name?.toLowerCase().includes(schoolName.toLowerCase())) score += 10;
    // Penalise if already linked elsewhere
    const studentRowId = studentRowByPortal.get(c.id);
    const linkedParentId = studentRowId ? linkedByStudentRow.get(studentRowId) : null;
    return { ...c, score, already_linked: Boolean(linkedParentId), linked_to_current_parent: linkedParentId === profile.id };
  }).filter((c: any) => c.score >= 10)
    .sort((a: any, b: any) => b.score - a.score)
    .slice(0, 5);

  return NextResponse.json({
    suggestions: scored.map((c: any) => ({
      id:           c.id,
      full_name:    c.full_name,
      section_class: c.section_class,
      school_name:  c.school_name,
      score:        c.score,
      already_linked: c.already_linked,
      linked_to_current_parent: c.linked_to_current_parent,
    })),
    childName,
    childClass,
    schoolName,
    leadId: lead.id,
  });
}

// POST /api/parents/child-suggestions
// Parent confirms a suggested student. This records a pending staff review;
// public/self-service consent flows never create parent-child links directly.
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await supabase
    .from('portal_users')
    .select('id, email, full_name, phone, role')
    .eq('id', user.id).single();

  if (!profile || profile.role !== 'parent') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { student_portal_id, lead_id } = await req.json();
  if (!student_portal_id) return NextResponse.json({ error: 'student_portal_id is required' }, { status: 400 });

  const sb = admin();

  if (!lead_id) return NextResponse.json({ error: 'lead_id is required for staff review' }, { status: 400 });
  const { data: ownedLead } = await (sb as any)
    .from('form_leads')
    .select('id, email, response_data')
    .eq('id', lead_id)
    .maybeSingle();
  const leadEmail = String(ownedLead?.email ?? ownedLead?.response_data?.parent_email ?? '').trim().toLowerCase();
  if (!ownedLead || !profile.email || leadEmail !== profile.email.trim().toLowerCase()) {
    return NextResponse.json({ error: 'This consent submission does not belong to your account.' }, { status: 403 });
  }
  const { error: updateError } = await (sb as any).from('form_leads').update({
    match_candidate_id: student_portal_id,
    match_status: 'pending_review',
    matched_student_id: null,
    matched_parent_id: null,
  }).eq('id', lead_id);
  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });

  return NextResponse.json({ success: true, pending_review: true });
}
