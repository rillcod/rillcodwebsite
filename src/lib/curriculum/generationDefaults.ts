export type CurriculumDeliveryFormat =
  | "school"
  | "bootcamp"
  | "online"
  | "selfpaced";

export type BootcampSchedule = "fulltime" | "parttime" | "weekend" | "evening";

const FORMATS = new Set<CurriculumDeliveryFormat>([
  "school",
  "bootcamp",
  "online",
  "selfpaced",
]);

function positiveInteger(value: unknown, fallback: number): string {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0
    ? String(parsed)
    : String(fallback);
}

export function inferCurriculumFormat(input: {
  metadataFormat?: unknown;
  programmeName?: string | null;
}): CurriculumDeliveryFormat {
  if (
    typeof input.metadataFormat === "string" &&
    FORMATS.has(input.metadataFormat as CurriculumDeliveryFormat)
  ) {
    return input.metadataFormat as CurriculumDeliveryFormat;
  }

  const programme = (input.programmeName ?? "").toLowerCase();
  if (/self[ -]?paced|independent learning/.test(programme)) return "selfpaced";
  if (/online|virtual/.test(programme)) return "online";
  if (
    /summer|holiday|bootcamp|boot camp|special|short course|training/.test(
      programme
    )
  ) {
    return "bootcamp";
  }
  return "school";
}

export function getCurriculumGenerationDefaults(input: {
  content?: { metadata?: Record<string, unknown> | null } | null;
  programmeName?: string | null;
  courseTitle?: string | null;
  rememberedGrade?: string | null;
  officialAudience?: string | null;
}) {
  const metadata = input.content?.metadata ?? {};
  const format = inferCurriculumFormat({
    metadataFormat: metadata.format,
    programmeName: input.programmeName,
  });
  const savedGrade =
    typeof metadata.grade_level === "string" ? metadata.grade_level.trim() : "";
  const gradeLevel =
    savedGrade ||
    input.officialAudience?.trim() ||
    input.rememberedGrade?.trim() ||
    (format === "school" ? "JSS1" : "General audience");
  const savedSubject =
    typeof metadata.subject_area === "string"
      ? metadata.subject_area.trim()
      : "";
  const savedSchedule =
    typeof metadata.bootcamp_schedule === "string"
      ? metadata.bootcamp_schedule
      : "";
  const bootcampSchedule: BootcampSchedule = [
    "fulltime",
    "parttime",
    "weekend",
    "evening",
  ].includes(savedSchedule)
    ? (savedSchedule as BootcampSchedule)
    : "fulltime";

  const startTerm = Number(metadata.program_start_term);
  return {
    format,
    gradeLevel,
    subjectArea: savedSubject || input.courseTitle?.trim() || "",
    weeksPerTerm: positiveInteger(metadata.weeks_per_term, 8),
    programStartTerm: ([1, 2, 3].includes(startTerm) ? startTerm : 1) as
      | 1
      | 2
      | 3,
    bootcampDurationWeeks: positiveInteger(metadata.bootcamp_duration_weeks, 4),
    bootcampSchedule,
    onlineDurationWeeks: positiveInteger(metadata.online_duration_weeks, 8),
    onlineSessionsPerWeek: positiveInteger(
      metadata.online_sessions_per_week,
      2
    ),
    selfpacedModules: positiveInteger(metadata.selfpaced_modules, 6),
    selfpacedHoursPerModule: positiveInteger(
      metadata.selfpaced_hours_per_module,
      2
    ),
  };
}
