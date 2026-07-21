import type { SchoolReportSnapshot } from './types';
import {
  buildTopicsCoveredFromDeclaration,
  type DeliveryDeclaration,
} from './delivery-declaration';

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

function topicKey(programme: string, course: string) {
  return `${programme.trim().toLowerCase()}::${course.trim().toLowerCase()}`;
}

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
      topic.weeksPlanned > 0
        ? `${topic.weeksCompleted}/${topic.weeksPlanned} curriculum week(s) logged`
        : `${topic.weeksCompleted} curriculum week(s) logged`,
    );
  } else if (topic.weeksInProgress > 0) {
    bits.push(`${topic.weeksInProgress} week(s) in progress`);
  }
  if (topic.learners > 0) bits.push(`${topic.learners} learner(s) with term evidence`);
  if (topic.submissions > 0) bits.push(`${topic.submissions} graded submission(s)`);
  if (topic.averageScore != null && topic.averageScore > 0) {
    bits.push(`${topic.averageScore}% term average`);
  }
  if (topic.source === 'learner_evidence' && topic.weeksCompleted <= 0 && topic.weeksInProgress <= 0) {
    bits.push('tracked through teaching & results — school delivery path');
  }
  return bits.join(' — ');
}

function formatTopicShort(topic: DeliveredTopic): string {
  const base = `${topic.programme} · ${topic.course}`;
  if (topic.weeksCompleted > 0) return `${base} (${topic.weeksCompleted} week(s) delivered)`;
  if (topic.learners > 0) return `${base} (${topic.learners} learners evidenced)`;
  return base;
}

function sourceLabel(source: DeliveredTopicSource): string {
  if (source === 'both') return 'both';
  if (source === 'curriculum') return 'curriculum_weeks';
  return 'learner_results';
}

function formatWeekRange(topic: DeliveredTopic, windowWeeks: number): string {
  const { weeksCompleted, weeksPlanned, weeksInProgress, source } = topic;
  if (weeksCompleted > 0) {
    const cap = weeksPlanned > 0 ? weeksPlanned : windowWeeks > 0 ? windowWeeks : weeksCompleted;
    if (cap > weeksCompleted) {
      return `Weeks 1–${weeksCompleted} delivered (${weeksCompleted} of ${cap} on curriculum map)`;
    }
    return `${weeksCompleted} curriculum week(s) completed`;
  }
  if (weeksInProgress > 0) {
    return `${weeksInProgress} week(s) in progress on curriculum map`;
  }
  if (source === 'learner_evidence') {
    return windowWeeks > 0
      ? `Evidence from teaching & results (school path — not full ${windowWeeks}-week map)`
      : 'Evidence from teaching & results (school delivery path)';
  }
  return 'No week range logged';
}

function formatEvidenceLabel(topic: DeliveredTopic): string {
  const bits: string[] = [];
  if (topic.learners > 0) bits.push(`${topic.learners} learner${topic.learners === 1 ? '' : 's'}`);
  if (topic.submissions > 0) bits.push(`${topic.submissions} graded submission${topic.submissions === 1 ? '' : 's'}`);
  if (topic.averageScore != null && topic.averageScore > 0) bits.push(`${topic.averageScore}% term average`);
  return bits.length ? bits.join(' · ') : 'Curriculum weeks logged';
}

function buildTopicCard(topic: DeliveredTopic, windowWeeks: number): DeliveryTopicCard {
  const weekRangeLabel = formatWeekRange(topic, windowWeeks);
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
    'curriculum' | 'programmeCoursePerformance' | 'summary' | 'period' | 'school' | 'deliveryDeclaration'
  >,
): string {
  const declaration = snapshot.deliveryDeclaration;
  if (declaration?.selectedTopics?.length) {
    return buildTopicsCoveredFromDeclaration(declaration, {
      schoolName: snapshot.school?.name || 'this school',
      termLabel: snapshot.period?.termLabel || 'this term',
      academicTermNumber: snapshot.period?.academicTermNumber || 1,
    });
  }

  const summary = buildDeliveredTopicsSummary(snapshot);
  const termLabel = snapshot.period?.termLabel || 'this term';
  const windowWeeks = snapshot.curriculum?.plannedWeeks || 0;
  const topicCount = summary.topics.length;
  const cards = summary.topics.map((topic) => buildTopicCard(topic, windowWeeks));
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
      `Within the ${windowWeeks}-week reporting window, the school followed its own delivery path rather than completing the full curriculum map — partial, focused coverage is normal and reflects how partner schools pace STEM modules.`,
    );
  } else {
    parts.push(summary.deliveryPathNote);
  }

  return parts.join(' ').replace(/\s+/g, ' ').trim();
}

/** Full delivery context — programme/course ranges for UI and AI. */
export function buildDeliveryContext(
  snapshot: Pick<SchoolReportSnapshot, 'curriculum' | 'programmeCoursePerformance' | 'summary' | 'period' | 'school'>,
): DeliveryContext {
  const summary = buildDeliveredTopicsSummary(snapshot);
  const termLabel = snapshot.period?.termLabel || 'this term';
  const windowWeeks = snapshot.curriculum?.plannedWeeks || 0;
  const cards = summary.topics.map((topic) => buildTopicCard(topic, windowWeeks));
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
    const key = topicKey(row.programme, row.course);
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

/** Topics actually delivered — declaration first, then learner evidence + curriculum weeks. */
export function buildDeliveredTopicsSummary(
  snapshot: Pick<
    SchoolReportSnapshot,
    'curriculum' | 'programmeCoursePerformance' | 'summary' | 'period' | 'deliveryDeclaration'
  >,
): DeliveredTopicsSummary {
  const declaration = snapshot.deliveryDeclaration;
  if (declaration?.selectedTopics?.length) {
    const topics = mergeTopicsByCourseName(topicsFromDeclaration(declaration));
    const termLabel = snapshot.period?.termLabel || 'this term';
    const windowWeeks = declaration.reportingWeeks;
    const deliveryPathNote =
      'Topics below were ticked on this report (Manual Report Entry) and spanned across the term window — honest partial coverage paced for learner success.';
    const summaryLines = [
      `${topics.length} topic area${topics.length === 1 ? '' : 's'} declared for ${termLabel} across a ${windowWeeks}-week delivery window.`,
      ...topics.map((topic) => `• ${formatTopicDetail(topic)}`),
      deliveryPathNote,
    ];
    const proseSeed = buildTopicsCoveredFromDeclaration(declaration, {
      schoolName: 'the school',
      termLabel,
      academicTermNumber: snapshot.period?.academicTermNumber || 1,
    });
    return { topics, summaryLines, proseSeed, deliveryPathNote };
  }

  const byKey = new Map<string, DeliveredTopic>();
  const termLabel = snapshot.period?.termLabel || 'this term';
  const windowWeeks = snapshot.curriculum?.plannedWeeks || 0;

  for (const row of snapshot.programmeCoursePerformance || []) {
    const programme = String(row.programme || 'Programme').trim();
    const course = String(row.course || 'Course').trim();
    if (!course || course === 'Unassigned course') continue;
    byKey.set(topicKey(programme, course), {
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

  for (const course of snapshot.curriculum?.courses || []) {
    const completed = Number(course.completed || 0);
    const inProgress = Number(course.inProgress || 0);
    const planned = Number(course.planned || 0);
    if (planned <= 0 && completed <= 0 && inProgress <= 0) continue;
    const programme = String(course.programme || 'Programme').trim();
    const courseName = String(course.course || 'Course').trim();
    const key = topicKey(programme, courseName);
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

  const topics = mergeTopicsByCourseName([...byKey.values()]).sort(
    (a, b) =>
      b.weeksCompleted + b.learners + b.submissions - (a.weeksCompleted + a.learners + a.submissions) ||
      a.programme.localeCompare(b.programme) ||
      a.course.localeCompare(b.course),
  );

  const deliveryPathNote =
    'Schools often follow their own delivery path — topics below reflect what was actually taught and evidenced this term, not necessarily every week on the curriculum map.';
  const summaryLines: string[] = [];

  if (!topics.length) {
    summaryLines.push(
      `No specific delivery topics have been ticked or evidenced for ${termLabel} yet. Delivery is progressive — select topics in the Delivery Declaration panel or enter class results to reflect progress.`,
    );
  } else if (topics.length === 1) {
    summaryLines.push(`This term, delivery focused on one topic area: ${formatTopicDetail(topics[0])}.`);
    summaryLines.push(
      windowWeeks > 0
        ? `Within the ${windowWeeks}-week reporting window, the school followed its own path rather than the full curriculum map.`
        : 'Delivery followed the school’s own path this term.',
    );
  } else if (topics.length <= 3) {
    summaryLines.push(
      `Across ${windowWeeks > 0 ? `the ${windowWeeks}-week window` : termLabel}, ${topics.length} topic area(s) were actively delivered:`,
    );
    for (const topic of topics) {
      summaryLines.push(`• ${formatTopicDetail(topic)}`);
    }
    summaryLines.push('These topics reflect the school’s actual path — partial coverage is normal and honest.');
  } else {
    summaryLines.push(`${topics.length} topic areas evidenced this term (school delivery path):`);
    for (const topic of topics) {
      summaryLines.push(`• ${formatTopicDetail(topic)}`);
    }
  }

  const curriculumPct = snapshot.summary?.curriculumCoverage ?? 0;
  if (topics.length > 0 && curriculumPct > 0 && curriculumPct < 50 && windowWeeks > 0) {
    summaryLines.push(
      `Curriculum week tracking shows ${curriculumPct}% of the mapped window — learner evidence above is the clearer picture of what was taught.`,
    );
  }

  const proseSeed = topics.length
    ? `During ${termLabel}, delivery centred on ${topics.map((topic) => formatTopicShort(topic)).join('; ')}. ${deliveryPathNote}`
    : '';

  return { topics, summaryLines, proseSeed, deliveryPathNote };
}
