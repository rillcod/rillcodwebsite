export type AcademicQualitySeverity = 'must_fix' | 'improve';
export type AcademicQualityDimension =
  | 'academic_foundation'
  | 'structure'
  | 'learning_sequence'
  | 'teacher_usability'
  | 'assessment'
  | 'human_clarity';

export type AcademicQualityIssue = {
  code: string;
  severity: AcademicQualitySeverity;
  dimension: AcademicQualityDimension;
  location: string;
  message: string;
  action: string;
};

export type AcademicQualityReport = {
  engineVersion: 'academic_quality_v2';
  readiness: 'ready' | 'needs_attention' | 'not_ready';
  score: number;
  heading: string;
  summary: string;
  mustFix: AcademicQualityIssue[];
  improvements: AcademicQualityIssue[];
  dimensions: Record<AcademicQualityDimension, { score: number; issueCount: number }>;
  coverage: { years: number; terms: number; weeks: number };
  provenance: { sourceName: string | null; framework: string | null; qaCatalogVersion: string | null };
};

type QualityContext = {
  sourceMetadata?: unknown;
  academicSession?: string | null;
  audienceLabel?: string | null;
};

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function list(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function positiveInteger(value: unknown, fallback?: number): number | null {
  const candidate = value == null ? fallback : Number(value);
  return Number.isInteger(candidate) && Number(candidate) > 0 ? Number(candidate) : null;
}

function ordinalTerm(term: number | null): string {
  return term === 1 ? 'First Term' : term === 2 ? 'Second Term' : term === 3 ? 'Third Term' : 'Term';
}

const DIMENSIONS: AcademicQualityDimension[] = [
  'academic_foundation',
  'structure',
  'learning_sequence',
  'teacher_usability',
  'assessment',
  'human_clarity',
];

const PLACEHOLDER = /\b(todo|tbd|lorem ipsum|missing|replace me|week \d+ topic)\b/i;

export function runAcademicQualityEngine(contentValue: unknown, context: QualityContext = {}): AcademicQualityReport {
  const content = record(contentValue);
  const source = record(context.sourceMetadata);
  const metadata = record(content.metadata);
  const qaSpine = record(metadata.qa_spine);
  const issues: AcademicQualityIssue[] = [];
  const seenPositions = new Set<string>();
  const yearSet = new Set<number>();
  let termCount = 0;
  let weekCount = 0;

  const add = (
    severity: AcademicQualitySeverity,
    dimension: AcademicQualityDimension,
    code: string,
    location: string,
    message: string,
    action: string,
  ) => issues.push({ severity, dimension, code, location, message, action });

  const sourceName = text(source.name);
  const framework = text(source.framework);
  if (!sourceName) {
    add('must_fix', 'academic_foundation', 'source_name_missing', 'Academic foundation',
      'The curriculum source is not identified.', 'Name the approved academic source or framework owner.');
  }
  if (!framework) {
    add('must_fix', 'academic_foundation', 'framework_missing', 'Academic foundation',
      'The academic standard is not identified.', 'State the framework or standard this curriculum follows.');
  }
  if (!text(content.overview)) {
    add('improve', 'human_clarity', 'overview_missing', 'Curriculum overview',
      'Teachers do not yet have a short explanation of the learning journey.', 'Add a concise, plain-language overview.');
  }
  if (!context.academicSession) {
    add('improve', 'academic_foundation', 'session_missing', 'Academic context',
      'The academic session is not shown.', 'Add a label such as “2026/2027 Academic Session”.');
  }
  if (!context.audienceLabel) {
    add('improve', 'human_clarity', 'audience_missing', 'Learner level',
      'The intended learner level is not clear.', 'Add a familiar label such as “Basic 1” or “Year 1”.');
  }

  const terms = list(content.terms);
  if (terms.length === 0) {
    add('must_fix', 'structure', 'terms_missing', 'Curriculum structure',
      'No curriculum sections were found.', 'Add at least one year and term of learning.');
  }

  for (const rawTerm of terms) {
    const term = record(rawTerm);
    const year = positiveInteger(term.year, 1);
    const termNumber = positiveInteger(term.term);
    const termLocation = year && termNumber ? `Year ${year}, ${ordinalTerm(termNumber)}` : 'Curriculum section';
    if (!termNumber) {
      add('must_fix', 'structure', 'term_position_invalid', termLocation,
        'This curriculum section has no valid term position.', 'Choose First Term, Second Term, or Third Term.');
      continue;
    }
    termCount += 1;
    if (year) yearSet.add(year);
    const weeks = list(term.weeks);
    if (weeks.length === 0) {
      add('must_fix', 'structure', 'weeks_missing', termLocation,
        'There are no teaching weeks in this section.', 'Add the weeks that form this part of the learning journey.');
      continue;
    }
    const orderedWeekNumbers: number[] = [];
    let previousTopic = '';

    for (const rawWeek of weeks) {
      const week = record(rawWeek);
      const weekNumber = positiveInteger(week.week);
      const location = weekNumber ? `${termLocation}, Week ${weekNumber}` : termLocation;
      if (!weekNumber) {
        add('must_fix', 'structure', 'week_position_invalid', location,
          'A teaching week has no valid number.', 'Choose a valid week number.');
        continue;
      }
      weekCount += 1;
      orderedWeekNumbers.push(weekNumber);
      const key = `${year}:${termNumber}:${weekNumber}`;
      if (seenPositions.has(key)) {
        add('must_fix', 'structure', 'week_duplicated', location,
          'This teaching position appears more than once.', 'Keep one week here and merge any useful details.');
      }
      seenPositions.add(key);

      const topic = text(week.topic);
      if (!topic) {
        add('must_fix', 'structure', 'topic_missing', location,
          'The teaching focus is blank.', 'Add one clear topic for the week.');
      } else {
        if (PLACEHOLDER.test(topic)) {
          add('must_fix', 'human_clarity', 'placeholder_topic', location,
            'The topic still contains draft placeholder text.', 'Replace it with the real learner-facing topic.');
        }
        if (topic.length > 140) {
          add('improve', 'human_clarity', 'topic_too_long', location,
            'The topic is difficult to scan quickly.', 'Shorten the title and move detail into focus points.');
        }
        if (previousTopic && previousTopic.toLowerCase() === topic.toLowerCase()) {
          add('improve', 'learning_sequence', 'topic_repeated', location,
            'The same topic appears in consecutive weeks.', 'Clarify the new skill, depth, or outcome for this week.');
        }
        previousTopic = topic;
      }

      if (list(week.subtopics).filter((item) => text(item)).length === 0) {
        add('improve', 'teacher_usability', 'focus_points_missing', location,
          'The teacher has no supporting focus points.', 'Add two or three small concepts or skills to cover.');
      }
      const lessonPlan = record(week.lesson_plan);
      const activityPresent = list(lessonPlan.activities).length > 0
        || list(week.activities).length > 0
        || text(lessonPlan.activity).length > 0;
      if (!activityPresent) {
        add('improve', 'teacher_usability', 'activity_missing', location,
          'No practical learning activity is suggested.', 'Add one achievable hands-on or discussion activity.');
      }
      const assessmentPresent = Object.keys(record(week.assessment_plan)).length > 0
        || list(week.assessments).length > 0
        || text(week.assessment).length > 0;
      if (!assessmentPresent) {
        add('improve', 'assessment', 'assessment_missing', location,
          'There is no simple evidence of learning for this week.', 'Add a check, demonstration, project milestone, or reflection.');
      }
    }

    const sorted = [...orderedWeekNumbers].sort((a, b) => a - b);
    for (let index = 1; index < sorted.length; index += 1) {
      if (sorted[index] - sorted[index - 1] > 1) {
        add('improve', 'learning_sequence', 'week_gap', termLocation,
          `The sequence moves from Week ${sorted[index - 1]} to Week ${sorted[index]}.`,
          'Confirm that the gap is intentional, such as a holiday or examination period.');
      }
    }
  }

  if (metadata.delivery_entry || metadata.program_start_term || metadata.entry_week) {
    add('improve', 'academic_foundation', 'school_timing_in_core', 'Academic timing',
      'A school-specific start point is stored inside the central curriculum.',
      'Move it to that school’s delivery schedule so the official curriculum stays reusable.');
  }

  const mustFix = issues.filter((issue) => issue.severity === 'must_fix');
  const improvements = issues.filter((issue) => issue.severity === 'improve');
  const dimensions = Object.fromEntries(DIMENSIONS.map((dimension) => {
    const dimensionIssues = issues.filter((issue) => issue.dimension === dimension);
    const deduction = dimensionIssues.reduce((sum, issue) => sum + (issue.severity === 'must_fix' ? 18 : 4), 0);
    return [dimension, { score: Math.max(0, 100 - deduction), issueCount: dimensionIssues.length }];
  })) as AcademicQualityReport['dimensions'];
  const score = Math.round(DIMENSIONS.reduce((sum, dimension) => sum + dimensions[dimension].score, 0) / DIMENSIONS.length);
  const readiness: AcademicQualityReport['readiness'] = mustFix.length > 0
    ? 'not_ready'
    : score >= 85 ? 'ready' : 'needs_attention';

  return {
    engineVersion: 'academic_quality_v2',
    readiness,
    score,
    heading: readiness === 'ready'
      ? 'Ready to become the official academic direction'
      : readiness === 'needs_attention'
        ? 'Academically sound, with useful improvements recommended'
        : 'A few academic gaps must be corrected before publication',
    summary: mustFix.length > 0
      ? `${mustFix.length} must-fix ${mustFix.length === 1 ? 'item' : 'items'} and ${improvements.length} improvement suggestions found.`
      : `${weekCount} teaching weeks checked. ${improvements.length} non-blocking improvement suggestions found.`,
    mustFix,
    improvements,
    dimensions,
    coverage: { years: yearSet.size, terms: termCount, weeks: weekCount },
    provenance: {
      sourceName: sourceName || null,
      framework: framework || null,
      qaCatalogVersion: text(qaSpine.catalog_version) || null,
    },
  };
}

