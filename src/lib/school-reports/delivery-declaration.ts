import type { SchoolReportSnapshot } from './types';

export type DeliveryTopicOption = {
  key: string;
  curriculumId: string;
  programme: string;
  course: string;
  termNumber: number;
  weekNumber: number;
  topic: string;
  weekType?: string;
};

export type DeliveryWeekSpan = {
  week: number;
  label: string;
  topics: string[];
  programme: string;
  course: string;
};

export type DeliveryCheckpoint = {
  programme: string;
  course: string;
  topic: string;
  termNumber: number;
  weekNumber: number;
  academicYear?: string;
  termLabel?: string;
};

export type DeliveryDeclaration = {
  reportingWeeks: number;
  selectedTopicKeys: string[];
  selectedTopics: Array<Pick<DeliveryTopicOption, 'key' | 'programme' | 'course' | 'topic' | 'weekNumber'>>;
  spannedWeeks: DeliveryWeekSpan[];
  nextTermCheckpoint: DeliveryCheckpoint | null;
  updatedAt: string;
};

const NIGERIA_TECH_PHASES = ['Foundations', 'Application', 'Innovation'] as const;

export function nigeriaTechPhaseLabel(termNumber: number): string {
  const idx = Math.max(0, Math.min(2, (Number(termNumber) || 1) - 1));
  return NIGERIA_TECH_PHASES[idx];
}

/** Weeks in the report delivery window (same-term range). */
export function reportingWeekCount(input: {
  startTerm: number;
  startWeek: number;
  endTerm: number;
  endWeek: number;
}): number {
  if (input.startTerm === input.endTerm) {
    return Math.max(1, input.endWeek - input.startWeek + 1);
  }
  return Math.max(1, input.endWeek + (12 - input.startWeek + 1));
}

export function topicInReportRange(
  termNumber: number,
  weekNumber: number,
  range: { startTerm: number; startWeek: number; endTerm: number; endWeek: number },
): boolean {
  const point = termNumber * 100 + weekNumber;
  return point >= range.startTerm * 100 + range.startWeek && point <= range.endTerm * 100 + range.endWeek;
}

/** Pull tickable topics from school syllabi — report delivery only, no week tracking. */
export function extractDeliveryTopicCatalog(
  curricula: Array<{
    id: string;
    content: unknown;
    courses?:
      | { title?: string; programs?: { name?: string } | Array<{ name?: string }> }
      | Array<{ title?: string; programs?: { name?: string } | Array<{ name?: string }> }>
      | null;
  }>,
  academicTermNumber: number,
  range: { startTerm: number; startWeek: number; endTerm: number; endWeek: number },
): DeliveryTopicOption[] {
  const options: DeliveryTopicOption[] = [];
  for (const row of curricula) {
    const content = row.content && typeof row.content === 'object' ? (row.content as Record<string, unknown>) : {};
    const terms = Array.isArray(content.terms) ? content.terms : [];
    const courseRel = Array.isArray(row.courses) ? row.courses[0] : row.courses;
    const programmeRel = Array.isArray(courseRel?.programs) ? courseRel.programs[0] : courseRel?.programs;
    const programme = String(programmeRel?.name || 'Programme');
    const course = String(courseRel?.title || 'Course');

    for (const term of terms) {
      const termNumber = Number((term as any).term ?? (term as any).term_number ?? (term as any).national_term ?? 0);
      if (termNumber !== academicTermNumber) continue;
      const weeks = Array.isArray((term as any).weeks) ? (term as any).weeks : [];
      for (const week of weeks) {
        const weekNumber = Number(week.week ?? week.week_number ?? 0);
        const topic = String(week.topic || '').trim();
        if (!topic || weekNumber <= 0) continue;
        if (!topicInReportRange(termNumber, weekNumber, range)) continue;
        options.push({
          key: `${row.id}::${termNumber}::${weekNumber}`,
          curriculumId: row.id,
          programme,
          course,
          termNumber,
          weekNumber,
          topic,
          weekType: week.type ? String(week.type) : undefined,
        });
      }
    }
  }
  return options.sort(
    (a, b) =>
      a.programme.localeCompare(b.programme) ||
      a.course.localeCompare(b.course) ||
      a.weekNumber - b.weekNumber,
  );
}

/** Spread selected topics evenly across the report week window for narrative/PDF. */
export function spanTopicsAcrossWeeks(
  selected: DeliveryTopicOption[],
  reportingWeeks: number,
  rangeStartWeek = 1,
): DeliveryWeekSpan[] {
  if (!selected.length || reportingWeeks <= 0) return [];
  const weeks: DeliveryWeekSpan[] = Array.from({ length: reportingWeeks }, (_, index) => ({
    week: rangeStartWeek + index,
    label: `Week ${rangeStartWeek + index}`,
    topics: [],
    programme: '',
    course: '',
  }));

  selected.forEach((topic, index) => {
    const slot = Math.min(reportingWeeks - 1, Math.floor((index * reportingWeeks) / selected.length));
    weeks[slot].topics.push(topic.topic);
    if (!weeks[slot].programme) weeks[slot].programme = topic.programme;
    if (!weeks[slot].course) weeks[slot].course = topic.course;
  });

  return weeks.filter((row) => row.topics.length > 0);
}

export function buildNextTermCheckpoint(
  catalog: DeliveryTopicOption[],
  selectedKeys: string[],
): DeliveryCheckpoint | null {
  if (!catalog.length) return null;
  const selectedSet = new Set(selectedKeys);
  const firstUnhandled = catalog.find((row) => !selectedSet.has(row.key));
  if (firstUnhandled) {
    return {
      programme: firstUnhandled.programme,
      course: firstUnhandled.course,
      topic: firstUnhandled.topic,
      termNumber: firstUnhandled.termNumber,
      weekNumber: firstUnhandled.weekNumber,
    };
  }
  const last = catalog[catalog.length - 1];
  return {
    programme: last.programme,
    course: last.course,
    topic: last.topic,
    termNumber: last.termNumber,
    weekNumber: last.weekNumber,
  };
}

export function buildDeliveryDeclaration(input: {
  catalog: DeliveryTopicOption[];
  selectedTopicKeys: string[];
  reportingWeeks: number;
  rangeStartWeek?: number;
  academicYear?: string;
  termLabel?: string;
}): DeliveryDeclaration {
  const selected = input.catalog.filter((row) => input.selectedTopicKeys.includes(row.key));
  const spannedWeeks = spanTopicsAcrossWeeks(selected, input.reportingWeeks, input.rangeStartWeek ?? 1);
  const checkpoint = buildNextTermCheckpoint(input.catalog, input.selectedTopicKeys);
  return {
    reportingWeeks: input.reportingWeeks,
    selectedTopicKeys: input.selectedTopicKeys,
    selectedTopics: selected.map((row) => ({
      key: row.key,
      programme: row.programme,
      course: row.course,
      topic: row.topic,
      weekNumber: row.weekNumber,
    })),
    spannedWeeks,
    nextTermCheckpoint: checkpoint
      ? {
          ...checkpoint,
          academicYear: input.academicYear,
          termLabel: input.termLabel,
        }
      : null,
    updatedAt: new Date().toISOString(),
  };
}

/** Student-centered delivery prose from ticked topics — no syllabus week tracking required. */
export function buildTopicsCoveredFromDeclaration(
  declaration: DeliveryDeclaration,
  input: {
    schoolName: string;
    termLabel: string;
    academicTermNumber: number;
  },
): string {
  const phase = nigeriaTechPhaseLabel(input.academicTermNumber);
  const { selectedTopics, spannedWeeks, reportingWeeks } = declaration;
  if (!selectedTopics.length) {
    return `Learner-centred delivery for ${input.termLabel} at ${input.schoolName} is being recorded — tick the topics handled on this report, then apply to span them across the ${reportingWeeks}-week window.`;
  }

  const byCourse = new Map<string, string[]>();
  for (const row of selectedTopics) {
    const label = `${row.programme} · ${row.course}`;
    const list = byCourse.get(label) || [];
    list.push(row.topic);
    byCourse.set(label, list);
  }

  const courseLines = [...byCourse.entries()].map(
    ([label, topics]) => `${label}: ${topics.join(', ')}`,
  );

  const weekLines = spannedWeeks
    .slice(0, 6)
    .map((row) => `${row.label} — ${row.topics.join('; ')}`);
  const weekTail =
    spannedWeeks.length > 6 ? ` …through Week ${spannedWeeks[spannedWeeks.length - 1]?.week}.` : '.';

  const parts = [
    `During ${input.termLabel} (${phase} phase), ${input.schoolName} learners worked through ${selectedTopics.length} topic area${selectedTopics.length === 1 ? '' : 's'} across a ${reportingWeeks}-week delivery window.`,
    `Topics handled: ${courseLines.join(' · ')}.`,
    `Across the term we paced this as ${weekLines.join(' · ')}${weekTail}`,
    `This reflects what learners actually experienced — focused, progressive Nigerian tech learning rather than every syllabus week ticked in the platform.`,
  ];

  if (declaration.nextTermCheckpoint) {
    parts.push(
      `Next term can pick up from ${declaration.nextTermCheckpoint.programme} · ${declaration.nextTermCheckpoint.course} — "${declaration.nextTermCheckpoint.topic}" (Week ${declaration.nextTermCheckpoint.weekNumber}).`,
    );
  }

  return parts.join(' ').replace(/\s+/g, ' ').trim();
}

/** Overlay declared delivery onto snapshot stats for PDF/Data tab. */
export function applyDeliveryDeclarationToSnapshot(
  snapshot: SchoolReportSnapshot,
  declaration: DeliveryDeclaration,
  catalogSize: number,
): SchoolReportSnapshot {
  const reportingWeeks = declaration.reportingWeeks;
  const selectedCount = declaration.selectedTopics.length;
  const coverage =
    catalogSize > 0 ? Math.round((selectedCount / catalogSize) * 100) : selectedCount > 0 ? 100 : 0;

  const courseMap = new Map<
    string,
    { programme: string; course: string; completed: number; planned: number; topics: string[] }
  >();
  for (const topic of declaration.selectedTopics) {
    const key = `${topic.programme}::${topic.course}`;
    const row = courseMap.get(key) || {
      programme: topic.programme,
      course: topic.course,
      completed: 0,
      planned: 0,
      topics: [],
    };
    row.completed += 1;
    row.topics.push(topic.topic);
    courseMap.set(key, row);
  }

  const courses = [...courseMap.values()].map((row) => ({
    programme: row.programme,
    course: row.course,
    planned: reportingWeeks,
    completed: Math.min(reportingWeeks, row.completed),
    inProgress: 0,
    skipped: 0,
    coverage: reportingWeeks > 0 ? Math.round((Math.min(reportingWeeks, row.completed) / reportingWeeks) * 100) : 0,
  }));

  return {
    ...snapshot,
    deliveryDeclaration: declaration,
    summary: {
      ...snapshot.summary,
      curriculumCoverage: coverage,
    },
    curriculum: {
      ...snapshot.curriculum,
      plannedWeeks: reportingWeeks,
      completedWeeks: reportingWeeks,
      inProgressWeeks: 0,
      skippedWeeks: Math.max(0, catalogSize - selectedCount),
      courses: courses.length ? courses : snapshot.curriculum.courses,
    },
  };
}
