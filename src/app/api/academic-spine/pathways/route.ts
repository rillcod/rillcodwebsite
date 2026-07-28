import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

async function caller() {
  const auth = await createClient();
  const { data: { user } } = await auth.auth.getUser();
  if (!user) return null;
  const db: any = createAdminClient();
  const { data } = await db.from('portal_users').select('id,role,school_id').eq('id', user.id).maybeSingle();
  return data as { id: string; role: string; school_id: string | null } | null;
}

export async function GET() {
  const user = await caller();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!['admin', 'teacher', 'school'].includes(user.role)) return NextResponse.json({ error: 'Academic staff access required' }, { status: 403 });
  const db: any = createAdminClient();
  let offeringsQuery = db.from('academic_offerings').select(`
    id,title,pathway,enrollment_type,academic_model,delivery_mode,special_programme_kind,
    learner_account_model,parent_onboarding_model,calendar_mode,result_destination,
    starts_on,ends_on,status,awards_certificate,settings,school_id,schools(name),
    academic_offering_periods(id,label,sequence_number,starts_on,ends_on,status),
    classes(id,name,teacher_id,school_id,term_id),
    academic_offering_curriculum_directions(id,course_id,release_id,status,courses(title),academic_curriculum_releases(title,release_number))
  `).order('title');
  if (user.role === 'school') offeringsQuery = offeringsQuery.eq('school_id', user.school_id);
  if (user.role === 'teacher') {
    const { data: assigned } = await db.from('classes').select('academic_offering_id')
      .eq('teacher_id', user.id).not('academic_offering_id', 'is', null);
    const offeringIds = Array.from(new Set((assigned ?? []).map((item: any) => item.academic_offering_id)));
    if (!offeringIds.length) return NextResponse.json({ data: { offerings: [], releases: [], pathway_issues: [] } });
    offeringsQuery = offeringsQuery.in('id', offeringIds);
  }
  const [offerings, releases, issues] = await Promise.all([
    offeringsQuery,
    db.from('academic_curriculum_releases').select('id,title,release_number,course_id,courses(title)').eq('status', 'published').order('published_at', { ascending: false }),
    user.role === 'admin'
      ? db.from('academic_enrollment_pathway_issues').select('*').limit(100)
      : Promise.resolve({ data: [], error: null }),
  ]);
  const error = offerings.error || releases.error || issues.error;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const scopedOfferings = (offerings.data ?? []).map((offering: any) => ({
    ...offering,
    classes: (offering.classes ?? []).filter((klass: any) =>
      user.role === 'admin' || (user.role === 'teacher' && klass.teacher_id === user.id)
      || (user.role === 'school' && klass.school_id === user.school_id)),
  }));
  return NextResponse.json({ data: { offerings: scopedOfferings, releases: releases.data ?? [], pathway_issues: issues.data ?? [] } });
}

export async function POST(req: NextRequest) {
  const user = await caller();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (user.role !== 'admin') return NextResponse.json({ error: 'Only the Academic Office can change central pathway settings.' }, { status: 403 });
  const body = await req.json();
  const db: any = createAdminClient();

  if (body.action === 'set_direction') {
    if (!body.academic_offering_id || !body.course_id || !body.release_id) {
      return NextResponse.json({ error: 'Pathway, course and curriculum edition are required.' }, { status: 400 });
    }
    const { data, error } = await db.rpc('publish_offering_curriculum_direction', {
      p_academic_offering_id: body.academic_offering_id,
      p_course_id: body.course_id,
      p_release_id: body.release_id,
      p_actor_id: user.id,
    });
    if (error) return NextResponse.json({ error: error.message, detail: error.details }, { status: 400 });
    return NextResponse.json({ data, message: 'Official curriculum direction assigned. Future teaching plans will inherit it.' }, { status: 201 });
  }

  if (body.action === 'update_offering') {
    const id = typeof body.academic_offering_id === 'string' ? body.academic_offering_id : '';
    if (!id) return NextResponse.json({ error: 'Academic pathway is required.' }, { status: 400 });
    const { data: current } = await db.from('academic_offerings').select('settings').eq('id', id).maybeSingle();
    if (!current) return NextResponse.json({ error: 'Academic pathway not found.' }, { status: 404 });
    const passScore = Number(body.certificate_pass_score);
    if (!Number.isFinite(passScore) || passScore < 0 || passScore > 100) {
      return NextResponse.json({ error: 'Certificate pass score must be between 0 and 100.' }, { status: 400 });
    }
    const delivery = ['in_school', 'virtual', 'onsite', 'hybrid'].includes(body.delivery_mode) ? body.delivery_mode : undefined;
    const patch: Record<string, unknown> = {
      awards_certificate: body.awards_certificate !== false,
      settings: { ...(current.settings ?? {}), certificate_pass_score: passScore },
      updated_at: new Date().toISOString(),
    };
    if (delivery) patch.delivery_mode = delivery;
    const { data, error } = await db.from('academic_offerings').update(patch).eq('id', id).select().single();
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ data, message: 'Pathway settings saved.' });
  }

  if (body.action === 'update_period') {
    if (!body.period_id || !String(body.label ?? '').trim()) return NextResponse.json({ error: 'Period and human-readable label are required.' }, { status: 400 });
    const { data, error } = await db.from('academic_offering_periods').update({
      label: String(body.label).trim(), starts_on: body.starts_on || null, ends_on: body.ends_on || null,
      status: body.status || 'active', updated_at: new Date().toISOString(),
    }).eq('id', body.period_id).select().single();
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ data, message: 'Learning period updated.' });
  }
  return NextResponse.json({ error: 'Unknown pathway action.' }, { status: 400 });
}
