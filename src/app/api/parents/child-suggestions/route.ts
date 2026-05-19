import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import { syncExplicitParentStudentLink } from '@/lib/parents/links';

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
    return { ...c, score };
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
    })),
    childName,
    childClass,
    schoolName,
    leadId: lead.id,
  });
}

// POST /api/parents/child-suggestions
// Parent confirms a suggested student — creates the parent-child link.
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

  // Resolve portal_users.id → students.id
  const { data: studentRow } = await (sb as any)
    .from('students')
    .select('id')
    .eq('user_id', student_portal_id)
    .maybeSingle();

  if (!studentRow) {
    return NextResponse.json({ error: 'Student record not found. Contact your school to complete the link.' }, { status: 404 });
  }

  // Get gender from the lead if available
  let leadGender: string | null = null;
  if (lead_id) {
    const { data: leadRow } = await (sb as any)
      .from('form_leads').select('response_data').eq('id', lead_id).maybeSingle();
    leadGender = (leadRow?.response_data as Record<string, string>)?.child_gender || null;
  }

  // Create parent_student_links
  await syncExplicitParentStudentLink(sb as any, profile.id, studentRow.id);

  // Denormalise parent info + gender onto the student row
  await (sb as any).from('students').update({
    parent_email: profile.email,
    parent_name:  profile.full_name,
    parent_phone: profile.phone ?? null,
    ...(leadGender ? { gender: leadGender } : {}),
    updated_at:   new Date().toISOString(),
  }).eq('id', studentRow.id);

  // If we know which lead this came from, update matched_student_id on it
  if (lead_id) {
    await (sb as any).from('form_leads').update({ matched_student_id: studentRow.id }).eq('id', lead_id);
  }

  return NextResponse.json({ success: true, student_id: studentRow.id });
}
