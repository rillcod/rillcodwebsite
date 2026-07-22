import { DEFAULT_SCHOOL_REPORT_POLICY, schoolReportPhaseLabel } from './report-policy';
import type { DeliveryDeclaration } from './delivery-declaration';

export type TopicsCoveredCourseSection = {
  course: string;
  topics: Array<{ weekNumber: number; label: string }>;
};

export type TopicsCoveredProgrammeSection = {
  programme: string;
  courses: TopicsCoveredCourseSection[];
};

export type TopicsCoveredPresentation = {
  intro: string;
  sections: TopicsCoveredProgrammeSection[];
  pacingLine?: string;
  closing?: string;
  plainText: string;
};

const SYNTHETIC_WEEK_FOCUS = [
  'Core concepts & guided practice',
  'Hands-on lab & class exercises',
  'Projects & collaborative problem-solving',
  'Progress check & practical demonstration',
] as const;

/** Leadership-friendly week label for generated checklists. */
export function syntheticWeekTopicLabel(courseTitle: string, weekNumber: number): string {
  const focus = SYNTHETIC_WEEK_FOCUS[(Math.max(1, weekNumber) - 1) % SYNTHETIC_WEEK_FOCUS.length];
  return `Week ${weekNumber}: ${focus}`;
}

/** Strip noisy prefixes so topic lines read cleanly in reports. */
export function cleanTopicTitle(topic: string, course: string): string {
  let label = String(topic || '').trim();
  if (!label) return 'Topic';

  const coursePrefix = new RegExp(`^${escapeRegExp(course)}\\s*(?:—|–|-|:)\\s*`, 'i');
  label = label.replace(coursePrefix, '');
  label = label.replace(new RegExp(`^${escapeRegExp(course)}\\s+Module\\s+\\d+\\s*:\\s*`, 'i'), '');
  label = label.replace(/^Module\s+\d+\s*:\s*/i, '');
  label = label.replace(/Practical Application\s*&\s*Hands-On Exercises/i, 'Hands-on practice & exercises');
  label = label.replace(/Progress Check\s*&\s*Practical Demonstration\s+\d+/i, 'Progress check & demonstration');

  if (/^Week\s+\d+\s*:/i.test(label)) return label;
  return label.replace(/\s+/g, ' ').trim() || String(topic).trim();
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function groupDeclarationTopics(declaration: DeliveryDeclaration): TopicsCoveredProgrammeSection[] {
  const byProgramme = new Map<string, Map<string, Array<{ weekNumber: number; label: string }>>>();

  for (const row of declaration.selectedTopics) {
    const programmes = byProgramme.get(row.programme) || new Map();
    const courses = programmes.get(row.course) || [];
    courses.push({
      weekNumber: row.weekNumber,
      label: cleanTopicTitle(row.topic, row.course),
    });
    programmes.set(row.course, courses);
    byProgramme.set(row.programme, programmes);
  }

  return [...byProgramme.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([programme, courses]) => ({
      programme,
      courses: [...courses.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([course, topics]) => ({
          course,
          topics: topics.sort((a, b) => a.weekNumber - b.weekNumber || a.label.localeCompare(b.label)),
        })),
    }));
}

function buildPacingLine(declaration: DeliveryDeclaration): string | undefined {
  const filled = declaration.spannedWeeks.filter((row) => row.topics.length > 0);
  if (!filled.length) return undefined;
  const first = filled[0];
  const last = filled[filled.length - 1];
  if (first.week === last.week) {
    return `Term pacing: focused delivery in ${first.label.toLowerCase()}.`;
  }
  return `Term pacing: ${first.label} through ${last.label} across the ${declaration.reportingWeeks}-week reporting window.`;
}

function formatPlainText(input: {
  intro: string;
  sections: TopicsCoveredProgrammeSection[];
  pacingLine?: string;
  closing?: string;
}): string {
  const blocks: string[] = [input.intro];

  for (const section of input.sections) {
    blocks.push('');
    blocks.push(section.programme);
    for (const course of section.courses) {
      blocks.push(`${course.course}`);
      for (const topic of course.topics) {
        const prefix = topic.label.match(/^Week\s+\d+\s*:/i) ? '' : `Week ${topic.weekNumber}: `;
        blocks.push(`• ${prefix}${topic.label}`);
      }
    }
  }

  if (input.pacingLine) {
    blocks.push('');
    blocks.push(input.pacingLine);
  }
  if (input.closing) {
    blocks.push('');
    blocks.push(input.closing);
  }

  return blocks.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

/** Structured, presentable “what we taught” copy for narrative, UI, and PDF. */
export function buildTopicsCoveredPresentation(
  declaration: DeliveryDeclaration,
  input: {
    schoolName: string;
    termLabel: string;
    academicTermNumber: number;
  },
): TopicsCoveredPresentation {
  const phase = schoolReportPhaseLabel(DEFAULT_SCHOOL_REPORT_POLICY, input.academicTermNumber);
  const { selectedTopics, reportingWeeks } = declaration;

  if (!selectedTopics.length) {
    const intro = `Learner-centred delivery for ${input.termLabel} at ${input.schoolName} is being recorded. Tick the topics handled on this report, then apply to span them across the ${reportingWeeks}-week window.`;
    return { intro, sections: [], plainText: intro };
  }

  const sections = groupDeclarationTopics(declaration);
  const courseCount = sections.reduce((sum, section) => sum + section.courses.length, 0);
  const intro = `During ${input.termLabel} (${phase} phase), ${input.schoolName} learners worked through ${selectedTopics.length} focused topic${selectedTopics.length === 1 ? '' : 's'} across ${courseCount} course${courseCount === 1 ? '' : 's'} in a ${reportingWeeks}-week delivery window.`;

  const pacingLine = buildPacingLine(declaration);
  let closing: string | undefined;
  if (declaration.nextTermCheckpoint) {
    const cp = declaration.nextTermCheckpoint;
    closing = `Next term can continue from ${cp.programme} · ${cp.course} — "${cleanTopicTitle(cp.topic, cp.course)}" (Week ${cp.weekNumber}).`;
  }

  const plainText = formatPlainText({ intro, sections, pacingLine, closing });
  return { intro, sections, pacingLine, closing, plainText };
}

/** pdfmake stack body for the “What we taught” panel. */
export function buildTopicsCoveredPdfStack(
  presentation: TopicsCoveredPresentation,
  colors: { ink: string; brand: string; muted: string },
): object[] {
  if (!presentation.sections.length) {
    return [{ text: presentation.plainText, fontSize: 9.5, color: colors.ink, lineHeight: 1.45 }];
  }

  const body: object[] = [
    { text: presentation.intro, fontSize: 9.5, color: colors.ink, lineHeight: 1.45, margin: [0, 0, 0, 8] },
  ];

  for (const section of presentation.sections) {
    body.push({
      text: section.programme,
      fontSize: 8.75,
      bold: true,
      color: colors.brand,
      margin: [0, 6, 0, 3],
    });
    for (const course of section.courses) {
      body.push({
        text: course.course,
        fontSize: 8.25,
        bold: true,
        color: colors.ink,
        margin: [0, 2, 0, 2],
      });
      body.push({
        ul: course.topics.map((topic) => {
          const prefix = topic.label.match(/^Week\s+\d+\s*:/i) ? '' : `Week ${topic.weekNumber}: `;
          return `${prefix}${topic.label}`;
        }),
        fontSize: 8.5,
        color: colors.ink,
        lineHeight: 1.35,
        margin: [0, 0, 0, 6],
      });
    }
  }

  if (presentation.pacingLine) {
    body.push({
      text: presentation.pacingLine,
      fontSize: 8.25,
      color: colors.muted,
      italics: true,
      margin: [0, 4, 0, 0],
    });
  }
  if (presentation.closing) {
    body.push({
      text: presentation.closing,
      fontSize: 8.25,
      color: colors.muted,
      margin: [0, 6, 0, 0],
    });
  }

  return body;
}
