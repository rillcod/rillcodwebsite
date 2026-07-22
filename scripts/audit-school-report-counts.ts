/**
 * Audit student/enrolment counts the same way school reports do.
 * Usage: npx tsx scripts/audit-school-report-counts.ts [school name fragment]
 * Example: npx tsx scripts/audit-school-report-counts.ts hill
 */
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });
dotenv.config({ path: '.env' });

import { createAdminClient } from '../src/lib/supabase/admin';
import { buildSchoolReportSnapshot } from '../src/lib/school-reports/aggregate';
import { reconcileSchoolReportEnrolments } from '../src/lib/school-reports/enrolment-counts';
import type { SchoolReportRange } from '../src/lib/school-reports/loaders/types';

const schoolQuery = (process.argv[2] || 'hill').trim();

async function resolveReportRange(
  admin: ReturnType<typeof createAdminClient>,
  schoolId: string,
): Promise<SchoolReportRange | null> {
  const { data: report } = await admin
    .from('school_performance_reports')
    .select(
      'period_start,period_end,academic_term_id,academic_year,term_label,curriculum_start_term,curriculum_start_week,curriculum_end_term,curriculum_end_week',
    )
    .eq('school_id', schoolId)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (report?.period_start && report?.period_end && report?.academic_term_id) {
    return {
      startDate: report.period_start,
      endDate: report.period_end,
      academicTermId: report.academic_term_id,
      academicYear: report.academic_year || '',
      termLabel: report.term_label || 'Term',
      academicTermNumber: 1,
      curriculumStartTerm: Number(report.curriculum_start_term || 1),
      curriculumStartWeek: Number(report.curriculum_start_week || 1),
      curriculumEndTerm: Number(report.curriculum_end_term || 1),
      curriculumEndWeek: Number(report.curriculum_end_week || 8),
    };
  }

  const { data: term } = await admin
    .from('academic_terms')
    .select('id,label,academic_year,start_date,end_date,term_number')
    .eq('is_active', true)
    .order('start_date', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!term?.id || !term.start_date || !term.end_date) return null;

  return {
    startDate: String(term.start_date).slice(0, 10),
    endDate: String(term.end_date).slice(0, 10),
    academicTermId: term.id,
    academicYear: term.academic_year || '',
    termLabel: term.label || 'Term',
    academicTermNumber: Number(term.term_number || 1),
    curriculumStartTerm: Number(term.term_number || 1),
    curriculumStartWeek: 1,
    curriculumEndTerm: Number(term.term_number || 1),
    curriculumEndWeek: 8,
  };
}

async function main() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local');
    process.exit(1);
  }

  let dbHost = 'unknown';
  try {
    dbHost = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).host;
  } catch {
    dbHost = 'invalid-url';
  }
  console.log(`Connecting to database host: ${dbHost}`);

  const admin = createAdminClient();
  const { data: schools, error } = await admin
    .from('schools')
    .select('id,name')
    .ilike('name', `%${schoolQuery}%`)
    .order('name');

  if (error) {
    console.error('Database error:', error.message);
    process.exit(1);
  }

  if (!schools?.length) {
    console.log(`No schools matched "${schoolQuery}".`);
    process.exit(0);
  }

  for (const school of schools) {
    console.log('\n' + '='.repeat(60));
    console.log(`School: ${school.name}`);
    console.log(`ID: ${school.id}`);

    const { count: rosterCount } = await admin
      .from('portal_users')
      .select('id', { count: 'exact', head: true })
      .eq('role', 'student')
      .eq('school_id', school.id)
      .eq('is_active', true)
      .or('is_deleted.is.null,is_deleted.eq.false');

    console.log(`Roster (active portal students): ${rosterCount ?? 0}`);

    const range = await resolveReportRange(admin, school.id);
    if (!range) {
      console.log('No report or academic term found — cannot build school-report snapshot.');
      continue;
    }

    console.log(`Term: ${range.termLabel} (${range.academicYear}) ${range.startDate} → ${range.endDate}`);

    const snapshot = await buildSchoolReportSnapshot(admin, school.id, range);
    const enrolments = reconcileSchoolReportEnrolments({
      schoolProgrammes: snapshot.schoolProgrammes,
      programmeCoursePerformance: snapshot.programmeCoursePerformance,
      learnerIds: snapshot.learners.map((row) => row.id),
      activeStudents: snapshot.summary.activeStudents,
    });

    console.log('\n--- School report snapshot (same as PDF/builder) ---');
    console.log(`Active students (attendance-backed): ${snapshot.summary.activeStudents}`);
    console.log(`Learners on roster appendix: ${snapshot.learners.length}`);
    console.log(`Students with term scores: ${snapshot.summary.studentsWithScores}`);
    console.log(`School average score: ${snapshot.summary.averageScore}%`);
    console.log(`School attendance average: ${snapshot.summary.attendanceRate}%`);
    console.log(`Enrolments | Unique learners: ${enrolments.programmeEnrolments} | ${enrolments.totalStudents}`);

    if (snapshot.schoolProgrammes?.length) {
      console.log('\nProgramme / course enrolments:');
      for (const row of snapshot.schoolProgrammes) {
        console.log(`  • ${row.programme} · ${row.course}: ${row.enrolledStudents} enrolled`);
      }
    }

    if (snapshot.programmeCoursePerformance?.length) {
      console.log('\nProgramme / course evidence:');
      for (const row of snapshot.programmeCoursePerformance) {
        console.log(
          `  • ${row.programme} · ${row.course}: ${row.students} with scores, avg ${row.averageScore}%`,
        );
      }
    }

    if (snapshot.classPerformance?.length) {
      console.log('\nClasses:');
      for (const row of snapshot.classPerformance) {
        console.log(`  • ${row.className}: ${row.students} learners`);
      }
    }

    if (snapshot.dataNotes?.length) {
      console.log('\nNotes:');
      for (const note of snapshot.dataNotes.slice(0, 4)) {
        console.log(`  - ${note}`);
      }
    }
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  if (err instanceof Error && err.cause) console.error(String(err.cause));
  process.exit(1);
});
