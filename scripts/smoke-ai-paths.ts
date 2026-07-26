/**
 * Smoke-test every AI path the school report depends on, against the LIVE model.
 *
 *   npx tsx scripts/smoke-ai-paths.ts
 *
 * Why this exists: all three of these paths were broken at once while the whole
 * unit-test suite was green.
 *
 *   - week expansion  : model returned 9 of 10 weeks, so it fell back to
 *                       boilerplate on every single call
 *   - section leads   : generated, but described sections it had guessed at
 *   - report narrative: OpenRouter model id had been retired -> 404 -> template
 *                       text on every report a partner school received
 *
 * None of it surfaced, because each failure produced a plausible-looking report.
 * Mocked tests prove the parsing is right; only a real call proves the model
 * still answers the way we assumed. Anything that falls back here is a FAILURE,
 * not a warning — a silent fallback is exactly the thing this is here to catch.
 */
import { config as loadEnv } from 'dotenv';

loadEnv({ path: '.env.local' });
loadEnv({ path: '.env' });

type Result = { name: string; ok: boolean; detail: string };
const results: Result[] = [];

function pass(name: string, detail: string) {
  results.push({ name, ok: true, detail });
  console.log(`  ✓ ${name} — ${detail}`);
}
function fail(name: string, detail: string) {
  results.push({ name, ok: false, detail });
  console.log(`  ✗ ${name} — ${detail}`);
}

const SNAPSHOT: any = {
  generatedAt: new Date().toISOString(),
  school: { id: 'smoke', name: 'Smoke Test Academy' },
  period: {
    startDate: '2026-01-01', endDate: '2026-03-31', academicTermId: 't1',
    academicYear: '2026/2027', termLabel: 'First Term', academicTermNumber: 1,
    curriculumStart: { term: 1, week: 1 }, curriculumEnd: { term: 1, week: 10 },
  },
  summary: {
    activeStudents: 24, activeStaff: 3, activeTeachers: 3, schoolAccounts: 1,
    averageScore: 72, attendanceRate: 91, curriculumCoverage: 80,
    assignmentsCreated: 12, submissionsReceived: 210, studentsWithScores: 22,
  },
  scoreBands: [], attendanceBands: [], classPerformance: [], learners: [],
  programmeCoursePerformance: [],
  curriculum: { plannedWeeks: 10, completedWeeks: 8, inProgressWeeks: 1, skippedWeeks: 1, courses: [] },
  finance: {
    currency: 'NGN', invoiceCount: 1, totalInvoiced: 100000, totalPaid: 100000,
    totalOutstanding: 0, attached: true, requestMessage: null, billingHref: '/x', invoices: [],
  },
  completeness: { readyToPublish: true, score: 100, totalRequired: 1, completedRequired: 1, items: [] },
  dataNotes: [],
};

async function checkWeekExpansion() {
  const name = 'week expansion';
  try {
    const { expandCourseDeliveryWeeks } = await import('../src/lib/school-reports/week-expansion');
    const weeks = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const result = await expandCourseDeliveryWeeks({
      courseTitle: 'Robotics & Automation',
      programme: 'Young Innovators',
      schoolName: SNAPSHOT.school.name,
      termLabel: 'First Term',
      termNumber: 1,
      weekNumbers: weeks,
      reachedTopics: ['Introduction to sensors'],
    });

    if (result.source !== 'ai') {
      return fail(name, 'fell back to placeholder — the model is not producing usable week plans');
    }
    if (result.weeks.length !== weeks.length) {
      return fail(name, `returned ${result.weeks.length} of ${weeks.length} weeks`);
    }
    // The exact failure that made this useless: generic filler passed off as a plan.
    const generic = result.weeks.filter((w) => /^Week \d+:/i.test(w.topic));
    if (generic.length) {
      return fail(name, `${generic.length} week(s) came back as generic filler`);
    }
    pass(name, `${result.weeks.length} course-specific weeks via ${result.model}`);
  } catch (error) {
    fail(name, error instanceof Error ? error.message : String(error));
  }
}

async function checkSectionLeads() {
  const name = 'section leads';
  try {
    const { generateSectionLeads, LEAD_SECTION_KEYS } = await import('../src/lib/school-reports/pdf/section-leads');
    const leads = await generateSectionLeads({ snapshot: SNAPSHOT } as any);
    const got = Object.keys(leads);
    if (!got.length) return fail(name, 'no leads returned — every one was rejected or the call failed');
    if (got.length < LEAD_SECTION_KEYS.length) {
      return fail(name, `only ${got.length} of ${LEAD_SECTION_KEYS.length} leads survived validation`);
    }
    pass(name, `${got.length} leads, all figure-free and position-free`);
  } catch (error) {
    fail(name, error instanceof Error ? error.message : String(error));
  }
}

async function checkNarrative() {
  const name = 'report narrative';
  try {
    const { createSchoolReportNarrative, fallbackNarrative } = await import('../src/lib/school-reports/narrative');
    const template = fallbackNarrative(SNAPSHOT);
    const generated = await createSchoolReportNarrative(SNAPSHOT);

    // The retired-model bug produced output identical to the template, and
    // looked completely normal in the PDF.
    if (generated.executiveSummary === template.executiveSummary) {
      return fail(name, 'identical to the template — the model call failed and fell back silently');
    }
    if (!generated.executiveSummary?.trim()) {
      return fail(name, 'empty executive summary');
    }
    pass(name, `AI narrative (${generated.achievements?.length ?? 0} achievements, ${generated.concerns?.length ?? 0} concerns)`);
  } catch (error) {
    fail(name, error instanceof Error ? error.message : String(error));
  }
}

async function main() {
  if (!process.env.GEMINI_API_KEY) {
    console.error('GEMINI_API_KEY is not set — cannot verify any AI path.');
    process.exit(1);
  }

  console.log('\n── School report AI paths (live) ──');
  await checkWeekExpansion();
  await checkSectionLeads();
  await checkNarrative();

  const failed = results.filter((row) => !row.ok);
  console.log(`\nResults: ${results.length - failed.length}/${results.length} passed`);
  if (failed.length) {
    console.log('\nA fallback here means schools are receiving template content that looks fine.');
    process.exit(1);
  }
  console.log('All AI paths are live.');
}

main().catch((error) => {
  console.error('Smoke run failed:', error);
  process.exit(1);
});
