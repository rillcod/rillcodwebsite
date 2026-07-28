import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import { resolveConsentGateway } from '@/lib/consent/pathway-gateway';

export const dynamic = 'force-dynamic';

function adminClient() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
}

// POST /api/consent-forms/[id]/clone
// Body: { target_school_id: string }
// Copies a form to a target school. Prevents duplicates (same title + school).
// Teachers can only target schools they are assigned to.
export async function POST(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await supabase
    .from('portal_users').select('role, school_id').eq('id', user.id).single();
  if (!profile || !['teacher', 'admin', 'school'].includes(profile.role ?? '')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const targetAcademicOfferingId: string | null = body.target_academic_offering_id || null;
  const target_school_id: string | undefined = body.target_school_id;
  if (!target_school_id) {
    return NextResponse.json({ error: 'target_school_id is required' }, { status: 400 });
  }

  const sb = adminClient();

  // Fetch the original form
  const { data: original } = await (sb as any)
    .from('consent_forms')
    .select('title, body, form_type, school_id, enrollment_type, academic_offering_id')
    .eq('id', id).single();

  if (!original) return NextResponse.json({ error: 'Form not found' }, { status: 404 });

  // Teachers must own either the source form's school OR be in teacher_schools for it
  if (profile.role !== 'admin') {
    // Collect all schools this user can access
    const allowedSchools = new Set<string>();
    if (profile.school_id) allowedSchools.add(profile.school_id);
    const { data: tsRows } = await (sb as any)
      .from('teacher_schools').select('school_id').eq('teacher_id', user.id);
    for (const r of (tsRows ?? [])) allowedSchools.add(r.school_id);

    if (!allowedSchools.has(target_school_id)) {
      return NextResponse.json({ error: 'You are not assigned to that school' }, { status: 403 });
    }
  }

  // Duplicate check: same title already exists for target school
  const { data: existing } = await (sb as any)
    .from('consent_forms')
    .select('id')
    .eq('school_id', target_school_id)
    .ilike('title', original.title)
    .maybeSingle();

  if (existing) {
    return NextResponse.json(
      { error: 'A form with this title already exists for the selected school', duplicate: true },
      { status: 409 },

    );
  }

  let gateway;
  try {
    gateway = await resolveConsentGateway(sb as any, {
      schoolId: target_school_id,
      enrollmentType: original.enrollment_type,
      academicOfferingId: targetAcademicOfferingId
        || (original.enrollment_type === 'school' ? null : original.academic_offering_id),
      classId: null,
      actorId: user.id,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Choose a compatible pathway for the target school.' },
      { status: 400 },
    );
  }

  const { data: clone, error } = await (sb as any)
    .from('consent_forms')
    .insert({
      title:      original.title,
      body:       original.body,
      form_type:  original.form_type,
      school_id:  target_school_id,
      created_by: user.id,
      is_public:  false,
      due_date:   null,
      enrollment_type: gateway.enrollmentType,
      academic_offering_id: gateway.academicOfferingId,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data: clone });
}
