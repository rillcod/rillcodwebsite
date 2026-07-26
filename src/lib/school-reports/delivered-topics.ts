import type { SchoolReportSnapshot } from './types';
import { normalizeProgrammeLabel, programmeCourseKey } from './school-curriculum-scope';
import {
  buildTopicsCoveredFromDeclaration,
  type DeliveryDeclaration,
} from './delivery-declaration';
import {
  buildTopicsCoveredPresentation,
  buildTopicsCoveredPresentationFromCourses,
  cleanTopicTitle,
  type TopicsCoveredPresentation,
} from './topics-covered-presentation';
import { countNoun, nounFor } from './wording';

export type DeliveredTopicSource = 'curriculum' | 'learner_evidence' | 'both';

export type DeliveredTopic = {
  programme: string;
  course: string;
  source: DeliveredTopicSource;
  weeksCompleted: number;
  weeksPlanned: number;
  weeksInProgress: number;
  learners: number;
  submissions: number;
  averageScore: number | null;
};

export type DeliveryTopicCard = {
  programme: string;
  course: string;
  source: DeliveredTopicSource;
  weekRangeLabel: string;
  evidenceLabel: string;
  detailLine: string;
};

export type DeliveryProgrammeGroup = {
  programme: string;
  courses: DeliveryTopicCard[];
};

export type DeliveredTopicsSummary = {
  topics: DeliveredTopic[];
  summaryLines: string[];
  /** Seed text for AI / fallback narrative — names what was actually delivered. */
  proseSeed: string;
  deliveryPathNote: string;
};

export type DeliveryContext = {
  termLabel: string;
  windowWeeks: number;
  windowLabel: string;
  topicCount: number;
  programmes: DeliveryProgrammeGroup[];
  summary: DeliveredTopicsSummary;
  /** Ready-to-use paragraph from aggregate data — no AI required. */
  draftParagraph: string;
  /** Structured brief for AI — programme/course ranges matched to snapshot. */
  aiBrief: {
    termLabel: string;
    reportingWindowWeeks: number;
    curriculumWeeksCompleted: number;
    curriculumCoveragePct: number;
    activeStudents: number;
    studentsWithScores: number;
    deliveryPathNote: string;
    programmeDelivery: Array<{
      programme: string;
      courses: Array<{
        name: string;
        weekRange: string;
        learners: number;
        submissions: number;
        averageScore: number | null;
        evidenceSource: 'curriculum_weeks' | 'learner_results' | 'both';
      }>;
    }>;
  };
};

const GENERIC_PROGRAMME_LABELS = new Set([
  'school programmes',
  'programme',
  'unassigned programme',
]);

function isGenericProgramme(programme: string): boolean {
  return GENERIC_PROGRAMME_LABELS.has(programme.trim().toLowerCase());
}

/** Merge duplicate rows that share a course name but use generic vs real programme labels. */
function mergeTopicsByCourseName(topics: DeliveredTopic[]): DeliveredTopic[] {
  const byCourse = new Map<string, DeliveredTopic>();
  for (const topic of topics) {
    const courseKey = topic.course.trim().toLowerCase();
    const existing = byCourse.get(courseKey);
    if (!existing) {
      byCourse.set(courseKey, { ...topic });
      continue;
    }
    const keep =
      isGenericProgramme(existing.programme) && !isGenericProgramme(topic.programme)
        ? topic
        : !isGenericProgramme(existing.programme) && isGenericProgramme(topic.programme)
          ? existing
          : existing.learners + existing.submissions >= topic.learners + topic.submissions
            ? existing
            : topic;
    const drop = keep === existing ? topic : existing;
    byCourse.set(courseKey, {
      programme: keep.programme,
      course: keep.course,
      source: keep.source === drop.source || keep.source === 'both' || drop.source === 'both'
        ? keep.source === 'both' || drop.source === 'both'
          ? 'both'
          : keep.source
        : 'both',
      weeksCompleted: Math.max(keep.weeksCompleted, drop.weeksCompleted),
      weeksPlanned: Math.max(keep.weeksPlanned, drop.weeksPlanned),
      weeksInProgress: Math.max(keep.weeksInProgress, drop.weeksInProgress),
      learners: Math.max(keep.learners, drop.learners),
      submissions: Math.max(keep.submissions, drop.submissions),
      averageScore:
        keep.averageScore != null && drop.averageScore != null
          ? Math.round((keep.averageScore + drop.averageScore) / 2)
          : keep.averageScore ?? drop.averageScore,
    });
  }
  return [...byCourse.values()];
}

function formatTopicDetail(topic: DeliveredTopic): string {
  const label = `${topic.programme} · ${topic.course}`;
  const bits: string[] = [label];
  if (topic.weeksCompleted > 0) {
    bits.push(
      topic.weeksInProgress > 0
        ? `${countNoun(topic.weeksCompleted, 'week')} delivered; ${topic.weeksInProgress} in progress`
        : `${countNoun(topic.weeksCompleted, 'week')} of focused module delivery this term`,
    );
  } else if (topic.weeksInProgress > 0) {
    bits.push(`${countNoun(topic.weeksInProgress, 'week')} actively in progress`);
  }
  if (topic.learners > 0) bits.push(`${countNoun(topic.learners, 'learner')} with term evidence`);
  if (topic.submissions > 0) bits.push(`${topic.submissions} graded ${nounFor(topic.submissions, 'submission')}`);
  if (topic.averageScore != null && topic.averageScore > 0) {
    bits.push(`${topic.averageScore}% term average`);
  }
  if (topic.source === 'learner_evidence' && topic.weeksCompleted <= 0 && topic.weeksInProgress <= 0) {
    bits.push('delivery evidenced through class teaching & term results');
  }
  return bits.join(' — ');
}

function formatTopicShort(topic: DeliveredTopic): string {
  const base = `${topic.programme} · ${topic.course}`;
  if (topic.weeksCompleted > 0) return `${base} (${countNoun(topic.weeksCompleted, 'week')} delivered)`;
  if (topic.learners > 0) return `${base} (${topic.learners} learners evidenced)`;
  return base;
}

function sourceLabel(source: DeliveredTopicSource): string {
  if (source === 'both') return 'both';
  if (source === 'curriculum') return 'curriculum_weeks';
  return 'learner_results';
}

function formatWeekRange(
  topic: DeliveredTopic,
  windowWeeks: number,
  declaration?: DeliveryDeclaration | null,
): string {
  const declarationSpan = declaration
    ? weekRangeCommentFromDeclaration(declaration, topic.programme, topic.course)
    : '';
  if (declarationSpan) return declarationSpan;

  const { weeksCompleted, weeksInProgress, source, course } = topic;

  if (weeksCompleted > 0) {
    if (weeksInProgress > 0) {
      return `${course}: core modules delivered; additional modules actively in progress this period`;
    }
    if (windowWeeks > 0 && weeksCompleted < windowWeeks) {
      return `${course}: focused module delivery with progressive pacing this reporting period`;
    }
    return `${course}: modules delivered and evidenced this reporting period`;
  }

  if (weeksInProgress > 0) {
    return `${course}: delivery actively in progress this reporting period`;
  }

  if (source === 'learner_evidence' || source === 'both') {
    return `${course}: taught through class sessions, projects, and term assessments this period`;
  }

  return `${course}: delivery recorded through class teaching this reporting period`;
}

/** Leadership-friendly range line from staff-ticked topics — module-level, no week numbering. */
function weekRangeCommentFromDeclaration(
  declaration: DeliveryDeclaration,
  programme: string,
  course: string,
): string {
  const topics = declaration.selectedTopics.filter(
    (row) => row.programme === programme && row.course === course,
  );
  if (!topics.length) return '';

  const topicNames = topics.map((row) => cleanTopicTitle(row.topic, course));
  const preview = topicNames.slice(0, 3).join('; ');
  const tail = topicNames.length > 3 ? ` (+${topicNames.length - 3} more)` : '';
  return `${course}: ${topics.length} module topic${topics.length === 1 ? '' : 's'} delivered this period (${preview}${tail})`;
}

function formatEvidenceLabel(topic: DeliveredTopic): string {
  const bits: string[] = [];
  if (topic.learners > 0) bits.push(`${topic.learners} learner${topic.learners === 1 ? '' : 's'}`);
  if (topic.submissions > 0) bits.push(`${topic.submissions} graded submission${topic.submissions === 1 ? '' : 's'}`);
  if (topic.averageScore != null && topic.averageScore > 0) bits.push(`${topic.averageScore}% term average`);
  return bits.length ? bits.join(' · ') : 'Term delivery confirmed';
}

function buildTopicCard(
  topic: DeliveredTopic,
  windowWeeks: number,
  declaration?: DeliveryDeclaration | null,
): DeliveryTopicCard {
  const weekRangeLabel = formatWeekRange(topic, windowWeeks, declaration);
  const evidenceLabel = formatEvidenceLabel(topic);
  return {
    programme: topic.programme,
    course: topic.course,
    source: topic.source,
    weekRangeLabel,
    evidenceLabel,
    detailLine: `${topic.programme} · ${topic.course} — ${weekRangeLabel}. ${evidenceLabel}.`,
  };
}

function groupTopicsByProgramme(cards: DeliveryTopicCard[]): DeliveryProgrammeGroup[] {
  const byProgramme = new Map<string, DeliveryTopicCard[]>();
  for (const card of cards) {
    const list = byProgramme.get(card.programme) || [];
    list.push(card);
    byProgramme.set(card.programme, list);
  }
  return [...byProgramme.entries()]
    .map(([programme, courses]) => ({ programme, courses }))
    .sort((a, b) => a.programme.localeCompare(b.programme));
}

/** Intelligent paragraph from aggregate — prefers staff-ticked delivery declaration. */
export function buildTopicsCoveredDraft(
  snapshot: Pick<
    SchoolReportSnapshot,
    | 'curriculum'
    | 'programmeCoursePerformance'
    | 'schoolProgrammes'
    | 'summary'
    | 'period'
    | 'school'
    | 'deliveryDeclaration'
  >,
): string {
  const declaration = snapshot.deliveryDeclaration;
  if (declaration?.selectedTopics?.length) {
    const base = buildTopicsCoveredFromDeclaration(declaration, {
      schoolName: snapshot.school?.name || 'this school',
      termLabel: snapshot.period?.termLabel || 'this term',
      academicTermNumber: snapshot.period?.academicTermNumber || 1,
    });
    const evidenceTopics = buildEvidenceDeliveredTopics(snapshot);
    const declarationTopics = mergeTopicsByCourseName(topicsFromDeclaration(declaration));
    const merged = mergeDeliveredTopicLists(declarationTopics, evidenceTopics);
    const declaredKeys = new Set(
      declaration.selectedTopics.map((row) => programmeCourseKey(row.programme, row.course)),
    );
    const evidenceOnly = merged.filter(
      (topic) =>
        !declaredKeys.has(programmeCourseKey(topic.programme, topic.course))
        && (topic.learners > 0 || topic.submissions > 0),
    );
    if (!evidenceOnly.length) return base;
    const extras = evidenceOnly.map((topic) => formatTopicShort(topic)).join('; ');
    return `${base} Published learner reports also cover ${extras}.`;
  }

  const summary = buildDeliveredTopicsSummary(snapshot);
  const termLabel = snapshot.period?.termLabel || 'this term';
  const windowWeeks = snapshot.curriculum?.plannedWeeks || 0;
  const topicCount = summary.topics.length;
  const cards = summary.topics.map((topic) =>
    buildTopicCard(topic, windowWeeks, snapshot.deliveryDeclaration),
  );
  const programmes = groupTopicsByProgramme(cards);

  if (!topicCount) {
    return `Progressive curriculum delivery for ${termLabel} at ${snapshot.school?.name || 'this school'} is actively tracked as teachers log weekly topics and result entries. As STEM education is progressive, delivery focuses on core concepts paced for student mastery rather than attempting to cover all modules simultaneously.`;
  }

  const school = snapshot.school?.name || 'the school';
  const parts: string[] = [];

  if (topicCount === 1) {
    const card = programmes[0]?.courses[0];
    if (card) {
      parts.push(
        `During ${termLabel}, delivery at ${school} focused on ${card.programme} — ${card.course}. ${card.weekRangeLabel.replace(/\.$/, '')}, with ${card.evidenceLabel.toLowerCase()}.`,
      );
    }
  } else if (topicCount <= 3) {
    const courseLines = programmes.flatMap((group) =>
      group.courses.map((c) => `${group.programme} (${c.course}: ${c.weekRangeLabel.toLowerCase()})`),
    );
    parts.push(
      `During ${termLabel}, ${school} worked through ${topicCount} topic area${topicCount === 1 ? '' : 's'} across ${courseLines.join('; ')}.`,
    );
    const evidenceBits = summary.topics
      .filter((t) => t.learners > 0)
      .map((t) => `${t.learners} learners in ${t.programme} · ${t.course}`);
    if (evidenceBits.length) parts.push(`Learner evidence: ${evidenceBits.join('; ')}.`);
  } else {
    const programmeNames = programmes.map((g) => g.programme).slice(0, 4);
    parts.push(
      `During ${termLabel}, delivery at ${school} spanned ${topicCount} topic areas across ${programmeNames.join(', ')}${programmes.length > 4 ? ', and more' : ''}.`,
    );
  }

  if (windowWeeks > 0 && summary.topics.every((t) => t.weeksCompleted <= 2)) {
    parts.push(
      `Within the ${windowWeeks}-week reporting window, delivery focused on core modules paced for learner mastery — progressive STEM pacing by design.`,
    );
  } else {
    parts.push(summary.deliveryPathNote);
  }

  return parts.join(' ').replace(/\s+/g, ' ').trim();
}

/** Full delivery context — programme/course ranges for UI and AI. */
export function buildDeliveryContext(
  snapshot: Pick<
    SchoolReportSnapshot,
    | 'curriculum'
    | 'programmeCoursePerformance'
    | 'schoolProgrammes'
    | 'summary'
    | 'period'
    | 'school'
    | 'deliveryDeclaration'
  >,
): DeliveryContext {
  const summary = buildDeliveredTopicsSummary(snapshot);
  const termLabel = snapshot.period?.termLabel || 'this term';
  const windowWeeks = snapshot.curriculum?.plannedWeeks || 0;
  const cards = summary.topics.map((topic) =>
    buildTopicCard(topic, windowWeeks, snapshot.deliveryDeclaration),
  );
  const programmes = groupTopicsByProgramme(cards);

  return {
    termLabel,
    windowWeeks,
    windowLabel: windowWeeks > 0 ? `${windowWeeks}-week reporting window` : termLabel,
    topicCount: summary.topics.length,
    programmes,
    summary,
    draftParagraph: buildTopicsCoveredDraft(snapshot),
    aiBrief: {
      termLabel,
      reportingWindowWeeks: windowWeeks,
      curriculumWeeksCompleted: snapshot.curriculum?.completedWeeks || 0,
      curriculumCoveragePct: snapshot.summary?.curriculumCoverage ?? 0,
      activeStudents: snapshot.summary?.activeStudents ?? 0,
      studentsWithScores: snapshot.summary?.studentsWithScores ?? 0,
      deliveryPathNote: summary.deliveryPathNote,
      programmeDelivery: programmes.map((group) => ({
        programme: group.programme,
        courses: group.courses.map((course) => {
          const topic = summary.topics.find(
            (t) => t.programme === course.programme && t.course === course.course,
          );
          return {
            name: course.course,
            weekRange: course.weekRangeLabel,
            learners: topic?.learners ?? 0,
            submissions: topic?.submissions ?? 0,
            averageScore: topic?.averageScore ?? null,
            evidenceSource: sourceLabel(course.source) as 'curriculum_weeks' | 'learner_results' | 'both',
          };
        }),
      })),
    },
  };
}

function topicsFromDeclaration(declaration: DeliveryDeclaration): DeliveredTopic[] {
  const byKey = new Map<string, DeliveredTopic>();
  for (const row of declaration.selectedTopics) {
    const key = programmeCourseKey(row.programme, row.course);
    const existing = byKey.get(key);
    if (existing) {
      existing.weeksCompleted += 1;
    } else {
      byKey.set(key, {
        programme: row.programme,
        course: row.course,
        source: 'curriculum',
        weeksCompleted: 1,
        weeksPlanned: declaration.reportingWeeks,
        weeksInProgress: 0,
        learners: 0,
        submissions: 0,
        averageScore: null,
      });
    }
  }
  return [...byKey.values()];
}

function mergeDeliveredTopicLists(primary: DeliveredTopic[], supplemental: DeliveredTopic[]): DeliveredTopic[] {
  const merged = new Map<string, DeliveredTopic>();
  for (const topic of primary) {
    merged.set(programmeCourseKey(topic.programme, topic.course), { ...topic });
  }
  for (const topic of supplemental) {
    const key = programmeCourseKey(topic.programme, topic.course);
    const existing = merged.get(key);
    if (existing) {
      existing.learners = Math.max(existing.learners, topic.learners);
      existing.submissions = Math.max(existing.submissions, topic.submissions);
      existing.weeksCompleted = Math.max(existing.weeksCompleted, topic.weeksCompleted);
      existing.weeksPlanned = Math.max(existing.weeksPlanned, topic.weeksPlanned);
      existing.weeksInProgress = Math.max(existing.weeksInProgress, topic.weeksInProgress);
      if (topic.averageScore != null && existing.averageScore == null) {
        existing.averageScore = topic.averageScore;
      }
      if (existing.source !== topic.source) existing.source = 'both';
    } else if (topic.learners > 0 || topic.submissions > 0) {
      merged.set(key, { ...topic });
    }
  }
  return mergeTopicsByCourseName([...merged.values()]);
}

function buildEvidenceDeliveredTopics(
  snapshot: Pick<
    SchoolReportSnapshot,
    'curriculum' | 'programmeCoursePerformance' | 'schoolProgrammes'
  >,
): DeliveredTopic[] {
  const byKey = new Map<string, DeliveredTopic>();

  for (const row of snapshot.programmeCoursePerformance || []) {
    const programme = normalizeProgrammeLabel(String(row.programme || 'Programme'));
    const course = String(row.course || 'Course').trim();
    const students = Number(row.students || 0);
    const submissions = Number(row.submissions || 0);
    if (!course || course === 'Unassigned course') continue;
    if (students <= 0 && submissions <= 0) continue;
    byKey.set(programmeCourseKey(programme, course), {
      programme,
      course,
      source: 'learner_evidence',
      weeksCompleted: 0,
      weeksPlanned: 0,
      weeksInProgress: 0,
      learners: Math.max(Number(row.students || 0), Number(row.enrolledStudents || 0)),
      submissions: Number(row.submissions || 0),
      averageScore: Number.isFinite(Number(row.averageScore)) ? Number(row.averageScore) : null,
    });
  }

  for (const row of snapshot.schoolProgrammes || []) {
    const programme = normalizeProgrammeLabel(String(row.programme || 'Programme'));
    const course = String(row.course || 'Course').trim();
    const enrolled = Number(row.enrolledStudents || 0);
    if (!course || enrolled <= 0) continue;
    const key = programmeCourseKey(programme, course);
    const existing = byKey.get(key);
    if (existing) {
      existing.learners = Math.max(existing.learners, enrolled);
      if (existing.source === 'curriculum') existing.source = 'both';
    } else {
      byKey.set(key, {
        programme,
        course,
        source: 'curriculum',
        weeksCompleted: 0,
        weeksPlanned: 0,
        weeksInProgress: 0,
        learners: enrolled,
        submissions: 0,
        averageScore: null,
      });
    }
  }

  for (const course of snapshot.curriculum?.courses || []) {
    const completed = Number(course.completed || 0);
    const inProgress = Number(course.inProgress || 0);
    const planned = Number(course.planned || 0);
    if (planned <= 0 && completed <= 0 && inProgress <= 0) continue;
    const programme = String(course.programme || 'Programme').trim();
    const courseName = String(course.course || 'Course').trim();
    const key = programmeCourseKey(programme, courseName);
    const existing = byKey.get(key);
    if (existing) {
      existing.source = existing.source === 'learner_evidence' || existing.source === 'both' ? 'both' : 'curriculum';
      existing.weeksCompleted = completed;
      existing.weeksPlanned = planned;
      existing.weeksInProgress = inProgress;
      if (existing.learners <= 0 && Number((course as { enrolledStudents?: number }).enrolledStudents || 0) > 0) {
        existing.learners = Number((course as { enrolledStudents?: number }).enrolledStudents);
      }
    } else {
      byKey.set(key, {
        programme,
        course: courseName,
        source: 'curriculum',
        weeksCompleted: completed,
        weeksPlanned: planned,
        weeksInProgress: inProgress,
        learners: Number((course as { enrolledStudents?: number }).enrolledStudents || 0),
        submissions: 0,
        averageScore: null,
      });
    }
  }

  return [...byKey.values()];
}

/** Report preview/PDF “what we taught” — merges ticked topics with published-report courses. */
export function buildReportTopicsPresentation(
  snapshot: Pick<
    SchoolReportSnapshot,
    | 'curriculum'
    | 'programmeCoursePerformance'
    | 'schoolProgrammes'
    | 'summary'
    | 'period'
    | 'school'
    | 'deliveryDeclaration'
  >,
): TopicsCoveredPresentation | null {
  const declaration = snapshot.deliveryDeclaration;
  const presentationInput = {
    schoolName: snapshot.school?.name || 'School',
    termLabel: snapshot.period?.termLabel || 'this term',
    academicTermNumber: snapshot.period?.academicTermNumber || 1,
  };

  if (declaration?.selectedTopics?.length) {
    const base = buildTopicsCoveredPresentation(declaration, presentationInput);
    const ctx = buildDeliveryContext(snapshot);
    const declaredKeys = new Set(
      declaration.selectedTopics.map((row) => programmeCourseKey(row.programme, row.course)),
    );
    const extraProgrammes = ctx.programmes
      .map((group) => ({
        programme: group.programme,
        courses: group.courses.filter(
          (course) => !declaredKeys.has(programmeCourseKey(group.programme, course.course)),
        ),
      }))
      .filter((group) => group.courses.length > 0);

    if (!extraProgrammes.length) return base;

    const evidencePresentation = buildTopicsCoveredPresentationFromCourses({
      ...presentationInput,
      windowWeeks: ctx.windowWeeks,
      programmes: extraProgrammes.map((group) => ({
        programme: group.programme,
        courses: group.courses.map((course) => ({
          course: course.course,
          weekRangeLabel: course.weekRangeLabel,
          evidenceLabel: course.evidenceLabel,
        })),
      })),
    });

    return {
      intro: base.intro,
      sections: [...base.sections, ...evidencePresentation.sections],
      pacingLine: base.pacingLine || evidencePresentation.pacingLine,
      closing: base.closing,
      plainText: `${base.plainText}\n\n${evidencePresentation.plainText}`.replace(/\n{3,}/g, '\n\n').trim(),
    };
  }

  const ctx = buildDeliveryContext(snapshot);
  if (!ctx.programmes.some((group) => group.courses.length)) return null;
  return buildTopicsCoveredPresentationFromCourses({
    ...presentationInput,
    windowWeeks: ctx.windowWeeks,
    programmes: ctx.programmes.map((group) => ({
      programme: group.programme,
      courses: group.courses.map((course) => ({
        course: course.course,
        weekRangeLabel: course.weekRangeLabel,
        evidenceLabel: course.evidenceLabel,
      })),
    })),
  });
}

/** Topics actually delivered — declaration first, then learner evidence + curriculum weeks. */
export function buildDeliveredTopicsSummary(
  snapshot: Pick<
    SchoolReportSnapshot,
    | 'curriculum'
    | 'programmeCoursePerformance'
    | 'schoolProgrammes'
    | 'summary'
    | 'period'
    | 'deliveryDeclaration'
  >,
): DeliveredTopicsSummary {
  const declaration = snapshot.deliveryDeclaration;
  const evidenceTopics = buildEvidenceDeliveredTopics(snapshot);

  if (declaration?.selectedTopics?.length) {
    const declarationTopics = mergeTopicsByCourseName(topicsFromDeclaration(declaration));
    const topics = mergeDeliveredTopicLists(declarationTopics, evidenceTopics);
    const termLabel = snapshot.period?.termLabel || 'this term';
    const windowWeeks = declaration.reportingWeeks;
    const deliveryPathNote =
      'Confirmed topics define delivery depth for this period; remaining syllabus content continues in the next learning period.';
    const summaryLines = [
      `${declaration.selectedTopics.length} module topic${declaration.selectedTopics.length === 1 ? '' : 's'} confirmed for ${termLabel}.`,
    ];
    const byProgramme = new Map<string, Map<string, typeof declaration.selectedTopics>>();
    for (const row of declaration.selectedTopics) {
      const programmes = byProgramme.get(row.programme) || new Map();
      const list = programmes.get(row.course) || [];
      list.push(row);
      programmes.set(row.course, list);
      byProgramme.set(row.programme, programmes);
    }
    for (const [programme, courses] of [...byProgramme.entries()].sort(([a], [b]) => a.localeCompare(b))) {
      summaryLines.push(programme);
      for (const [course, rows] of [...courses.entries()].sort(([a], [b]) => a.localeCompare(b))) {
        for (const row of rows.sort((a, b) => a.weekNumber - b.weekNumber)) {
          summaryLines.push(`• ${cleanTopicTitle(row.topic, course)} (${course})`);
        }
      }
    }
    const declaredKeys = new Set(
      declaration.selectedTopics.map((row) => programmeCourseKey(row.programme, row.course)),
    );
    const evidenceOnly = topics.filter(
      (topic) =>
        !declaredKeys.has(programmeCourseKey(topic.programme, topic.course))
        && (topic.learners > 0 || topic.submissions > 0),
    );
    if (evidenceOnly.length) {
      summaryLines.push('Additional courses with published learner reports this term:');
      for (const topic of evidenceOnly) {
        summaryLines.push(`• ${formatTopicDetail(topic)}`);
      }
    }
    summaryLines.push(deliveryPathNote);
    let proseSeed = buildTopicsCoveredFromDeclaration(declaration, {
      schoolName: 'the school',
      termLabel,
      academicTermNumber: snapshot.period?.academicTermNumber || 1,
    });
    if (evidenceOnly.length) {
      proseSeed += ` Published learner reports also cover ${evidenceOnly.map((topic) => formatTopicShort(topic)).join('; ')}.`;
    }
    return { topics, summaryLines, proseSeed, deliveryPathNote };
  }

  const byKey = new Map<string, DeliveredTopic>();
  const termLabel = snapshot.period?.termLabel || 'this term';
  const windowWeeks = snapshot.curriculum?.plannedWeeks || 0;

  for (const topic of evidenceTopics) {
    byKey.set(programmeCourseKey(topic.programme, topic.course), { ...topic });
  }

  const topics = mergeTopicsByCourseName([...byKey.values()]).sort(
    (a, b) =>
      b.weeksCompleted + b.learners + b.submissions - (a.weeksCompleted + a.learners + a.submissions) ||
      a.programme.localeCompare(b.programme) ||
      a.course.localeCompare(b.course),
  );

  const deliveryPathNote =
    'Delivery ranges describe what was taught and evidenced this term. Partner schools pace STEM progressively — focused module delivery within the term window is expected and healthy.';
  const summaryLines: string[] = [];

  if (!topics.length) {
    summaryLines.push(
      `No specific delivery topics have been ticked or evidenced for ${termLabel} yet. Delivery is progressive — select topics in the Delivery Declaration panel or enter class results to reflect progress.`,
    );
  } else if (topics.length === 1) {
    summaryLines.push(`This term, delivery focused on one topic area: ${formatTopicDetail(topics[0])}.`);
    summaryLines.push(
      windowWeeks > 0
        ? `Within the ${windowWeeks}-week reporting window, delivery focused on core modules paced for learner mastery.`
        : 'Delivery focused on core modules paced for learner mastery this term.',
    );
  } else if (topics.length <= 3) {
    summaryLines.push(
      `Across ${windowWeeks > 0 ? `the ${windowWeeks}-week window` : termLabel}, ${topics.length} topic ${nounFor(topics.length, 'area')} were actively delivered:`,
    );
    for (const topic of topics) {
      summaryLines.push(`• ${formatTopicDetail(topic)}`);
    }
    summaryLines.push('These topics reflect confirmed term delivery — focused pacing is expected in partner schools.');
  } else {
    summaryLines.push(`${topics.length} topic areas evidenced this term (school delivery path):`);
    for (const topic of topics) {
      summaryLines.push(`• ${formatTopicDetail(topic)}`);
    }
  }

  const curriculumPct = snapshot.summary?.curriculumCoverage ?? 0;
  if (topics.length > 0 && curriculumPct > 0 && curriculumPct < 50 && windowWeeks > 0) {
    summaryLines.push(
      `Platform week ticks show ${curriculumPct}% of the full syllabus bank — the delivery ranges and learner evidence above are the authoritative story for this report.`,
    );
  }

  const proseSeed = topics.length
    ? `During ${termLabel}, delivery centred on ${topics.map((topic) => formatTopicShort(topic)).join('; ')}. ${deliveryPathNote}`
    : '';

  return { topics, summaryLines, proseSeed, deliveryPathNote };
}
