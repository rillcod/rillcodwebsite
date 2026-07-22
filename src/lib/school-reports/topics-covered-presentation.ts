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

function cardBorderLayout(borderColor = '#e5e7eb') {
  return {
    hLineWidth: () => 1,
    vLineWidth: () => 1,
    hLineColor: () => borderColor,
    vLineColor: () => borderColor,
    paddingLeft: () => 0,
    paddingRight: () => 0,
    paddingTop: () => 0,
    paddingBottom: () => 0,
  };
}

function buildTopicBulletRows(
  topics: TopicsCoveredCourseSection['topics'],
  courseName: string,
  colors: { ink: string; brand: string },
) {
  return topics.map((topic) => ({
    columns: [
      {
        width: 10,
        text: '•',
        color: colors.brand,
        bold: true,
        fontSize: 9,
        margin: [0, 1, 0, 0] as [number, number, number, number],
      },
      {
        width: '*',
        text: cleanTopicTitle(topic.label, courseName),
        fontSize: 8.25,
        color: colors.ink,
        lineHeight: 1.35,
      },
    ],
    margin: [0, 0, 0, 3] as [number, number, number, number],
  }));
}

/** Bordered course card — mirrors the live preview “What we taught” tiles. */
function buildCourseCardPanel(
  flat: FlatCourseSection,
  colors: { ink: string; brand: string; muted: string },
) {
  const topicRows = buildTopicBulletRows(flat.course.topics, flat.course.course, colors);
  return {
    table: {
      widths: ['*'],
      body: [
        [
          {
            stack: [
              {
                text: flat.programme.toUpperCase(),
                fontSize: 6.75,
                bold: true,
                color: colors.brand,
                characterSpacing: 0.45,
              },
              {
                text: flat.course.course,
                fontSize: 9,
                bold: true,
                color: colors.ink,
                margin: [0, 2, 0, topicRows.length ? 5 : 0] as [number, number, number, number],
              },
              ...(topicRows.length
                ? [
                    {
                      canvas: [
                        {
                          type: 'line',
                          x1: 0,
                          y1: 0,
                          x2: 220,
                          y2: 0,
                          lineWidth: 0.5,
                          lineColor: '#e5e7eb',
                        },
                      ],
                      margin: [0, 0, 0, 5] as [number, number, number, number],
                    },
                    ...topicRows,
                  ]
                : []),
            ],
            margin: [9, 9, 9, 9],
            fillColor: '#ffffff',
          },
        ],
      ],
    },
    layout: cardBorderLayout('#e5e7eb'),
  };
}

function buildCalloutPanel(
  text: string,
  variant: 'muted' | 'amber',
  colors: { ink: string; brand: string; muted: string },
) {
  const fill = variant === 'amber' ? '#fffbeb' : '#f9fafb';
  const border = variant === 'amber' ? '#fcd34d' : '#e5e7eb';
  return {
    table: {
      widths: ['*'],
      body: [
        [
          {
            text,
            fontSize: 8.25,
            color: variant === 'amber' ? '#78350f' : colors.muted,
            italics: variant === 'muted',
            lineHeight: 1.35,
            margin: [8, 7, 8, 7],
            fillColor: fill,
          },
        ],
      ],
    },
    layout: cardBorderLayout(border),
    margin: [0, 6, 0, 0] as [number, number, number, number],
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
              { width: '*', stack: [buildCourseCardPanel(pair[0], colors)] },
              { width: 10, text: '' },
              { width: '*', stack: [buildCourseCardPanel(pair[1], colors)] },
            ]
          : [{ width: '*', stack: [buildCourseCardPanel(pair[0], colors)] }],
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

/** pdfmake stack for leadership narrative beneath structured delivery cards. */
export function buildExpandedNarrativePdfStack(
  body: string,
  colors: { ink: string; brand: string; muted: string },
): object[] {
  const trimmed = String(body || '').trim();
  if (!trimmed) return [];

  const lines = trimmed.split('\n').map((line) => line.trim()).filter(Boolean);
  const bulletLines = lines.filter((line) => /^[-•*]\s/.test(line) || line.startsWith('•'));
  const proseLines = lines.filter((line) => !/^[-•*]\s/.test(line) && !line.startsWith('•'));
  const stack: object[] = [];

  if (proseLines.length) {
    for (const paragraph of proseLines) {
      stack.push({
        text: paragraph,
        fontSize: 8.5,
        color: colors.ink,
        lineHeight: 1.4,
        margin: [0, 0, 0, 4] as [number, number, number, number],
      });
    }
  }

  if (bulletLines.length) {
    stack.push({
      table: {
        widths: ['*'],
        body: [
          [
            {
              stack: bulletLines.map((line) => ({
                columns: [
                  {
                    width: 10,
                    text: '•',
                    color: '#059669',
                    bold: true,
                    fontSize: 9,
                  },
                  {
                    width: '*',
                    text: line.replace(/^[-•*]\s*/, ''),
                    fontSize: 8.25,
                    color: colors.ink,
                    lineHeight: 1.35,
                  },
                ],
                margin: [0, 0, 0, 3] as [number, number, number, number],
              })),
              margin: [8, 7, 8, 7],
              fillColor: '#f9fafb',
            },
          ],
        ],
      },
      layout: cardBorderLayout('#e5e7eb'),
      margin: [0, proseLines.length ? 4 : 0, 0, 0] as [number, number, number, number],
    });
  }

  if (!proseLines.length && !bulletLines.length) {
    stack.push({
      text: trimmed,
      fontSize: 8.5,
      color: colors.ink,
      lineHeight: 1.4,
    });
  }

  return stack;
}

/** pdfmake stack body for the “What we taught” panel. */
export function buildTopicsCoveredPdfStack(
  presentation: TopicsCoveredPresentation,
  colors: { ink: string; brand: string; muted: string },
  opts?: { enrolledCourseLabels?: string[] },
): object[] {
  if (!presentation.sections.length) {
    return [{ text: presentation.plainText, fontSize: 9.5, color: colors.ink, lineHeight: 1.45 }];
  }

  const body: object[] = [
    { text: presentation.intro, fontSize: 9.5, color: colors.ink, lineHeight: 1.45, margin: [0, 0, 0, 8] },
  ];

  if (opts?.enrolledCourseLabels?.length) {
    body.push({
      text: `${opts.enrolledCourseLabels.length} course${opts.enrolledCourseLabels.length === 1 ? '' : 's'} in scope: ${opts.enrolledCourseLabels.join(' · ')}`,
      fontSize: 7.75,
      color: colors.muted,
      margin: [0, 0, 0, 8] as [number, number, number, number],
    });
  }

  const flatCourses = flattenPresentationCourses(presentation);
  if (flatCourses.length >= 2 && flatCourses.length <= 4) {
    body.push(...buildMultiColumnCourseLayout(flatCourses, colors));
  } else {
    for (const flat of flatCourses) {
      body.push({
        ...buildCourseCardPanel(flat, colors),
        margin: [0, 0, 0, 8] as [number, number, number, number],
      });
    }
  }

  if (presentation.pacingLine) {
    body.push(buildCalloutPanel(presentation.pacingLine, 'muted', colors));
  }
  if (presentation.closing) {
    body.push(buildCalloutPanel(presentation.closing, 'amber', colors));
  }

  return body;
}

/** Match live preview: structured cards first, leadership narrative appended when both exist. */
export function buildTopicsCoveredPdfBodyForReport(
  narrative: { topicsCovered?: string | null },
  presentation: TopicsCoveredPresentation | null,
  colors: { ink: string; brand: string; muted: string },
  opts?: { enrolledCourseLabels?: string[]; fallbackDraft?: string; nextLines?: string[] },
): object[] {
  const custom = String(narrative.topicsCovered || '').trim();
  const body: object[] = [];

  if (presentation?.sections?.length) {
    body.push(...buildTopicsCoveredPdfStack(presentation, colors, opts));
  } else if (presentation?.intro) {
    body.push(...buildTopicsCoveredPdfStack(presentation, colors, opts));
  } else if (custom) {
    body.push({ text: custom, fontSize: 9.5, color: colors.ink, lineHeight: 1.45 });
  } else if (opts?.fallbackDraft?.trim()) {
    body.push({ text: opts.fallbackDraft.trim(), fontSize: 9.5, color: colors.ink, lineHeight: 1.45 });
  }

  if (custom && presentation?.sections?.length) {
    body.push({
      text: 'Leadership narrative',
      fontSize: 7.25,
      bold: true,
      color: colors.muted,
      characterSpacing: 0.6,
      margin: [0, 10, 0, 5] as [number, number, number, number],
    });
    body.push(...buildExpandedNarrativePdfStack(custom, colors));
  }

  if (opts?.nextLines?.length) {
    body.push(...buildNextLinesPdfCallout(opts.nextLines, colors));
  }

  return body;
}

/** “What opens next” callout — mirrors preview delivery footer. */
export function buildNextLinesPdfCallout(
  lines: string[],
  colors: { ink: string; brand: string; muted: string },
  max = 4,
): object[] {
  const items = lines.map(String).filter(Boolean).slice(0, max);
  if (!items.length) return [];

  return [
    {
      text: 'What opens next',
      fontSize: 7.25,
      bold: true,
      color: colors.muted,
      characterSpacing: 0.55,
      margin: [0, 10, 0, 5] as [number, number, number, number],
    },
    buildCalloutPanel(
      items.map((line) => `• ${line}`).join('\n'),
      'muted',
      colors,
    ),
  ];
}

/** Celebration wall rows with star markers — keeps PDF print-friendly layout. */
export function buildCelebrationWallPdfStack(
  rows: Array<{ name: string; classLabel: string; highlight: string }>,
  colors: { ink: string; brand: string; muted: string },
  max = 5,
): object[] {
  const slice = rows.slice(0, max);
  if (!slice.length) {
    return [{ text: 'No Excellent band learners this term.', color: colors.muted, italics: true, fontSize: 8 }];
  }

  return slice.map((row) => ({
    columns: [
      { width: 12, text: '★', color: colors.brand, bold: true, fontSize: 9, margin: [0, 1, 0, 0] as [number, number, number, number] },
      {
        width: '*',
        text: [
          { text: row.name, bold: true, color: colors.ink },
          { text: ` (${row.classLabel}) — ${row.highlight}`, color: colors.ink, fontSize: 8.25 },
        ],
        fontSize: 8.25,
        lineHeight: 1.35,
      },
    ],
    margin: [0, 0, 0, 4] as [number, number, number, number],
  }));
}

/** Programme spotlight cards — narrative cards alongside the delivery evidence table. */
export function buildProgrammeSpotlightPdfStack(
  spotlights: Array<{ programme: string; course: string; summary: string; nextIntro: string }>,
  colors: { ink: string; brand: string; muted: string },
): object[] {
  if (!spotlights.length) return [];

  const cards = spotlights.slice(0, 4).map((spotlight) => ({
    table: {
      widths: ['*'],
      body: [
        [
          {
            stack: [
              {
                text: spotlight.programme.toUpperCase(),
                fontSize: 6.75,
                bold: true,
                color: colors.brand,
                characterSpacing: 0.45,
              },
              {
                text: spotlight.course,
                fontSize: 9,
                bold: true,
                color: colors.ink,
                margin: [0, 2, 0, 4] as [number, number, number, number],
              },
              {
                canvas: [
                  {
                    type: 'line',
                    x1: 0,
                    y1: 0,
                    x2: 220,
                    y2: 0,
                    lineWidth: 0.5,
                    lineColor: '#e5e7eb',
                  },
                ],
                margin: [0, 0, 0, 5] as [number, number, number, number],
              },
              { text: spotlight.summary, fontSize: 8, color: colors.muted, lineHeight: 1.35, margin: [0, 0, 0, 4] },
              { text: spotlight.nextIntro, fontSize: 8, color: colors.ink, lineHeight: 1.35 },
            ],
            margin: [9, 9, 9, 9],
            fillColor: '#ffffff',
          },
        ],
      ],
    },
    layout: cardBorderLayout('#e5e7eb'),
  }));

  if (cards.length === 1) {
    return [cards[0]];
  }

  const rows: object[] = [];
  for (let index = 0; index < cards.length; index += 2) {
    const pair = cards.slice(index, index + 2);
    rows.push({
      columns:
        pair.length === 2
          ? [
              { width: '*', stack: [pair[0]] },
              { width: 10, text: '' },
              { width: '*', stack: [pair[1]] },
            ]
          : [{ width: '*', stack: [pair[0]] }],
      margin: [0, 0, 0, 8] as [number, number, number, number],
    });
  }
  return rows;
}
