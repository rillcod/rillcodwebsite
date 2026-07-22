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

export type CourseDeliveryPresentationInput = {
  schoolName: string;
  termLabel: string;
  academicTermNumber: number;
  windowWeeks: number;
  programmes: Array<{
    programme: string;
    courses: Array<{
      course: string;
      weekRangeLabel: string;
      evidenceLabel: string;
    }>;
  }>;
};

function stripLeadingWeekPrefix(label: string): string {
  return String(label || '')
    .replace(/^Weeks?\s+\d+(?:\s*[–-]\s*\d+)?\s*:\s*/i, '')
    .replace(/\bwithin the \d+-week term\b/gi, 'this reporting period')
    .replace(/\(\d+-week window\)/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Structured “what we taught” from programme/course evidence when staff have not ticked delivery topics. */
export function buildTopicsCoveredPresentationFromCourses(
  input: CourseDeliveryPresentationInput,
): TopicsCoveredPresentation {
  const phase = schoolReportPhaseLabel(DEFAULT_SCHOOL_REPORT_POLICY, input.academicTermNumber);
  const sections: TopicsCoveredProgrammeSection[] = input.programmes
    .filter((group) => group.courses.length)
    .map((group) => ({
      programme: group.programme,
      courses: group.courses.map((course) => ({
        course: course.course,
        topics: [
          {
            weekNumber: 1,
            label: stripLeadingWeekPrefix(course.weekRangeLabel) || course.weekRangeLabel,
          },
          ...(course.evidenceLabel && course.evidenceLabel !== 'Term delivery confirmed'
            ? [{ weekNumber: 0, label: course.evidenceLabel }]
            : []),
        ],
      })),
    }));

  const courseCount = sections.reduce((sum, section) => sum + section.courses.length, 0);
  if (!courseCount) {
    const intro = `Delivery at ${input.schoolName} is being captured from class teaching and learner evidence for this reporting period.`;
    return { intro, sections: [], plainText: intro };
  }

  const intro = `During ${input.termLabel} (${phase} phase), ${input.schoolName} learners worked across ${courseCount} active course${courseCount === 1 ? '' : 's'} with progressive module delivery.`;
  const pacingLine = 'Delivery followed structured module pacing across this reporting period.';
  const plainText = formatPlainText({ intro, sections, pacingLine });
  return { intro, sections, pacingLine, plainText };
}

type FlatCourseSection = {
  programme: string;
  course: TopicsCoveredCourseSection;
};

function flattenPresentationCourses(presentation: TopicsCoveredPresentation): FlatCourseSection[] {
  return presentation.sections.flatMap((section) =>
    section.courses.map((course) => ({ programme: section.programme, course })),
  );
}

function buildCoursePanel(flat: FlatCourseSection, colors: { ink: string; brand: string; muted: string }) {
  return {
    stack: [
      { text: flat.programme, fontSize: 7, bold: true, color: colors.brand },
      { text: flat.course.course, fontSize: 8.75, bold: true, color: colors.ink, margin: [0, 2, 0, 4] as [number, number, number, number] },
      {
        ul: flat.course.topics.map((topic) => cleanTopicTitle(topic.label, flat.course.course)),
        fontSize: 8.25,
        color: colors.ink,
        lineHeight: 1.35,
      },
    ],
  };
}

function buildMultiColumnCourseLayout(
  flatCourses: FlatCourseSection[],
  colors: { ink: string; brand: string; muted: string },
): object[] {
  const rows: object[] = [];
  for (let index = 0; index < flatCourses.length; index += 2) {
    const pair = flatCourses.slice(index, index + 2);
    rows.push({
      columns:
        pair.length === 2
          ? [
              { width: '*', ...buildCoursePanel(pair[0], colors) },
              { width: 10, text: '' },
              { width: '*', ...buildCoursePanel(pair[1], colors) },
            ]
          : [{ width: '*', ...buildCoursePanel(pair[0], colors) }],
      margin: [0, 0, 0, 8] as [number, number, number, number],
    });
  }
  return rows;
}

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
  label = stripLeadingWeekPrefix(label);

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
  if (!declaration.selectedTopics.length) return undefined;
  return 'Delivery followed progressive module pacing across this reporting period.';
}

export function buildDeclarativeCheckpointClosing(
  checkpoint: DeliveryDeclaration['nextTermCheckpoint'],
): string | undefined {
  if (!checkpoint) return undefined;
  const topic = cleanTopicTitle(checkpoint.topic, checkpoint.course);
  const programme = String(checkpoint.programme || 'Programme').trim();
  const course = String(checkpoint.course || 'Course').trim();
  return `The next learning period will continue from ${programme} · ${course}, beginning with "${topic}".`;
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
        blocks.push(`• ${cleanTopicTitle(topic.label, course.course)}`);
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
    const intro = `Learner-centred delivery at ${input.schoolName} is being recorded for this reporting period. Confirm the module topics covered, then apply to update this section.`;
    return { intro, sections: [], plainText: intro };
  }

  const sections = groupDeclarationTopics(declaration);
  const courseCount = sections.reduce((sum, section) => sum + section.courses.length, 0);
  const intro = `During ${input.termLabel} (${phase} phase), ${input.schoolName} learners engaged with focused module delivery across ${courseCount} course${courseCount === 1 ? '' : 's'} this reporting period.`;

  const pacingLine = buildPacingLine(declaration);
  const closing = buildDeclarativeCheckpointClosing(declaration.nextTermCheckpoint);

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

  const flatCourses = flattenPresentationCourses(presentation);
  if (flatCourses.length >= 2 && flatCourses.length <= 4) {
    body.push(...buildMultiColumnCourseLayout(flatCourses, colors));
  } else {
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
          ul: course.topics.map((topic) => cleanTopicTitle(topic.label, course.course)),
          fontSize: 8.5,
          color: colors.ink,
          lineHeight: 1.35,
          margin: [0, 0, 0, 6],
        });
      }
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
