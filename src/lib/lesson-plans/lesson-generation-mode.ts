export type LessonGenerationMode = "academic" | "project" | "interactive";

type PlanWeekLike = {
  topic?: unknown;
  objectives?: unknown;
  activities?: unknown;
  notes?: unknown;
  assignment?: unknown;
  project?: unknown;
};

function searchable(value: unknown): string {
  if (typeof value === "string") return value;
  if (!value || typeof value !== "object") return "";
  try {
    return JSON.stringify(value);
  } catch {
    return "";
  }
}

/** Pick the rich standalone builder mode from official week intent. */
export function inferLessonGenerationMode(
  week: PlanWeekLike
): LessonGenerationMode {
  const project = searchable(week.project).toLowerCase();
  const text = [
    searchable(week.topic),
    searchable(week.objectives),
    searchable(week.activities),
    searchable(week.notes),
    searchable(week.assignment),
    project,
  ]
    .join(" ")
    .toLowerCase();

  if (
    project.trim() &&
    !/^\s*(null|\{\}|\[\])\s*$/.test(project)
  ) {
    return "project";
  }
  if (/\b(project|capstone|prototype|build|design challenge|maker)\b/.test(text)) {
    return "project";
  }
  if (
    /\b(interactive|game|simulation|role[- ]?play|scratch|blockly|quiz|hands[- ]?on|experiment|lab)\b/.test(
      text
    )
  ) {
    return "interactive";
  }
  return "academic";
}

export function contentTypeForLessonMode(mode: LessonGenerationMode): string {
  if (mode === "project") return "project";
  if (mode === "interactive") return "interactive";
  return "lesson";
}

