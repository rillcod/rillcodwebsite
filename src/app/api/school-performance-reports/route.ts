import { NextRequest, NextResponse } from 'next/server';
import { getSchoolReportActor, canManageSchoolReport } from '@/lib/school-reports/access';
import { buildSchoolReportSnapshot } from '@/lib/school-reports/aggregate';
import { createSchoolReportNarrative } from '@/lib/school-reports/narrative';
import { openSchoolReportBook } from '@/lib/school-reports/registry';
import { ensureWorkingRevision } from '@/lib/school-reports/revisions';

export const dynamic = 'force-dynamic';

function validDate(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(new Date(`${value}T00:00:00Z`).getTime());
}

function boundedInt(value: unknown, min: number, max: number): number | null {
  const number = Number(value);
  return Number.isInteger(number) && number >= min && number <= max ? number : null;
}

export async function GET() {
  const actor = await getSchoolReportActor();
  if (!actor) return NextResponse.json({ error: 'Access denied.' }, { status: 403 });
  let query = actor.admin.from('school_performance_reports')
    .select('id,school_id,title,period_start,period_end,academic_term_id,academic_year,term_label,status,published_at,created_at,updated_at,created_by,published_revision_number,working_revision_number')
    .order('created_at', { ascending: false }).limit(200);
  if (actor.profile.role === 'school') query = query.eq('school_id', actor.profile.school_id).eq('status', 'published');
  if (actor.profile.role === 'school' && !actor.profile.school_id) return NextResponse.json({ data: [], schools: [], terms: [], role: actor.profile.role });
  else if (actor.profile.role === 'teacher') {
    if (!actor.schoolIds.length) return NextResponse.json({ data: [], schools: [], role: actor.profile.role });
    query = query.in('school_id', actor.schoolIds);
  }
  const { data: reports, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const schoolIds = Array.from(new Set((reports ?? []).map((row: any) => row.school_id)));
  const creatorIds = Array.from(new Set((reports ?? []).map((row: any) => row.created_by)));
  const [{ data: schools }, { data: creators }] = await Promise.all([
    schoolIds.length ? actor.admin.from('schools').select('id,name').in('id', schoolIds) : Promise.resolve({ data: [] }),
    creatorIds.length ? actor.admin.from('portal_users').select('id,full_name').in('id', creatorIds) : Promise.resolve({ data: [] }),
  ]);
  const schoolNames = new Map((schools ?? []).map((row: any) => [row.id, row.name]));
  const creatorNames = new Map((creators ?? []).map((row: any) => [row.id, row.full_name]));
  let availableSchools = schools ?? [];
  if (actor.profile.role === 'admin') {
    const { data } = await actor.admin.from('schools').select('id,name').eq('status', 'approved').or('is_deleted.is.null,is_deleted.eq.false').order('name');
    availableSchools = data ?? [];
  } else if (actor.profile.role === 'teacher' && actor.schoolIds.length) {
    const { data } = await actor.admin.from('schools').select('id,name').in('id', actor.schoolIds).order('name');
    availableSchools = data ?? [];
  }
  const { data: terms } = await actor.admin.from('academic_terms').select('id,academic_year,term_label,term_number,start_date,end_date,is_current').order('start_date', { ascending: false }).limit(30);

  const activeBooks = actor.profile.role !== 'school' && actor.schoolIds.length
    ? await Promise.all(
        actor.schoolIds.slice(0, 50).map(async (schoolId) => {
          const { data } = await actor.admin
            .from('school_performance_reports')
            .select('id,school_id,academic_term_id,status,term_label,academic_year,updated_at')
            .eq('school_id', schoolId)
            .in('status', ['draft', 'published'])
            .order('updated_at', { ascending: false })
            .limit(20);
          return data ?? [];
        }),
      ).then((groups) => groups.flat())
    : [];

  return NextResponse.json({
    data: (reports ?? []).map((row: any) => ({ ...row, school_name: schoolNames.get(row.school_id) || 'School', creator_name: creatorNames.get(row.created_by) || 'Staff' })),
    schools: availableSchools,
    terms: terms ?? [],
    role: actor.profile.role,
    activeBooks,
  });
}

export async function POST(req: NextRequest) {
  const actor = await getSchoolReportActor();
  if (!actor || !['admin', 'teacher'].includes(actor.profile.role)) return NextResponse.json({ error: 'Only authorised staff can create a report.' }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  const schoolId = typeof body.schoolId === 'string' ? body.schoolId : '';
  const title = typeof body.title === 'string' ? body.title.trim().slice(0, 180) : '';
  if (!schoolId || !canManageSchoolReport(actor, schoolId)) return NextResponse.json({ error: 'Choose a school you are allowed to report on.' }, { status: 403 });
  if (title.length < 3) return NextResponse.json({ error: 'Enter a clear report title.' }, { status: 400 });
  if (!validDate(body.startDate) || !validDate(body.endDate) || body.endDate < body.startDate) return NextResponse.json({ error: 'Choose a valid report date range.' }, { status: 400 });
  const daySpan = (new Date(`${body.endDate}T00:00:00Z`).getTime() - new Date(`${body.startDate}T00:00:00Z`).getTime()) / 86400000;
  if (daySpan > 730) return NextResponse.json({ error: 'The report range cannot be longer than two years.' }, { status: 400 });
  const startTerm = boundedInt(body.curriculumStartTerm, 1, 20);
  const startWeek = boundedInt(body.curriculumStartWeek, 1, 60);
  const endTerm = boundedInt(body.curriculumEndTerm, 1, 20);
  const endWeek = boundedInt(body.curriculumEndWeek, 1, 60);
  if (!startTerm || !startWeek || !endTerm || !endWeek || endTerm * 100 + endWeek < startTerm * 100 + startWeek) {
    return NextResponse.json({ error: 'Choose a valid curriculum term and week range.' }, { status: 400 });
  }
  const academicTermId = typeof body.academicTermId === 'string' ? body.academicTermId : '';
  if (!academicTermId) return NextResponse.json({ error: 'Choose the academic term and year for this report.' }, { status: 400 });
  const { data: academicTerm, error: academicTermError } = await actor.admin.from('academic_terms')
    .select('id,academic_year,term_label,term_number,start_date,end_date')
    .eq('id', academicTermId).maybeSingle();
  if (academicTermError || !academicTerm) {
    return NextResponse.json({ error: 'The selected academic term is not available.' }, { status: 400 });
  }
  try {
    const range = {
      startDate: body.startDate,
      endDate: body.endDate,
      curriculumStartTerm: startTerm,
      curriculumStartWeek: startWeek,
      academicTermId: academicTerm.id,
      academicYear: academicTerm.academic_year,
      termLabel: academicTerm.term_label,
      academicTermNumber: academicTerm.term_number,
      curriculumEndTerm: endTerm,
      curriculumEndWeek: endWeek,
    };

    const result = await openSchoolReportBook(actor.admin, {
      schoolId,
      academicTermId: academicTerm.id,
      create: async () => {
        const snapshot = await buildSchoolReportSnapshot(actor.admin, schoolId, range);
        const narrative = await createSchoolReportNarrative(snapshot);
        const { data, error } = await actor.admin
          .from('school_performance_reports')
          .insert({
            school_id: schoolId,
            title,
            period_start: body.startDate,
            period_end: body.endDate,
            curriculum_start_term: startTerm,
            curriculum_start_week: startWeek,
            academic_term_id: academicTerm.id,
            academic_year: academicTerm.academic_year,
            term_label: academicTerm.term_label,
            curriculum_end_term: endTerm,
            curriculum_end_week: endWeek,
            snapshot,
            narrative,
            status: 'draft',
            created_by: actor.user.id,
            updated_at: new Date().toISOString(),
          })
          .select('id')
          .single();
        if (error) {
          if (error.code === '23505') {
            const { data: existing } = await actor.admin
              .from('school_performance_reports')
              .select('id')
              .eq('school_id', schoolId)
              .eq('academic_term_id', academicTerm.id)
              .in('status', ['draft', 'published'])
              .maybeSingle();
            if (existing?.id) return existing.id;
          }
          throw new Error(error.message);
        }
        const reportId = data.id as string;
        const { data: inserted } = await actor.admin
          .from('school_performance_reports')
          .select('*')
          .eq('id', reportId)
          .single();
        if (inserted) {
          await ensureWorkingRevision(actor.admin, inserted as any, actor.user.id);
        }
        return reportId;
      },
    });

    return NextResponse.json(
      {
        success: true,
        id: result.id,
        reused: result.action === 'reused',
        status: result.action === 'reused' ? result.status : 'draft',
        message: result.action === 'reused' ? result.message : 'Report book created.',
      },
      { status: result.action === 'created' ? 201 : 200 },
    );
  } catch (error) {
    console.error('[school-report] create failed:', error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to create report.' }, { status: 500 });
  }
}
