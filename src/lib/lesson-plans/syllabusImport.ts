/**
 * Shared helpers for matching stored lesson plan `term` strings to syllabus
 * JSON (`course_curricula.content.terms[].term`) and mapping syllabus weeks
 * into `plan_data.weeks` rows (objectives, student activities, teacher notes).
 */

export type SyllabusLessonPlanSlice = {
  duration_minutes?: number;
  objectives?: string[];
  teacher_activities?: string[];
  student_activities?: string[];
  classwork?: unknown;
  resources?: string[];
  engagement_tips?: string[];
  assignment?: unknown;
  project?: unknown;
};

export type SyllabusWeekImport = {
  week: number;
  topic?: string;
  type?: string;
  subtopics?: string[];
  activities?: string[];
  assessment?: string;
  lesson_plan?: SyllabusLessonPlanSlice | null;
};

export type SyllabusContentImport = {
  terms?: Array<{ term: number; weeks?: SyllabusWeekImport[] }>;
};

/** Plan `term` is stored like "First Term 2025/2026" — match syllabus `terms[].term` (1–3). */
export function inferTermNumberFromPlanTerm(term: string | null | undefined): number {
  if (!term) return 1;
  const s = term.trim().toLowerCase();
  if (s.startsWith('first') || /\b1st\b/.test(s) || /\bterm\s*1\b/.test(s)) return 1;
  if (s.startsWith('second') || /\b2nd\b/.test(s) || /\bterm\s*2\b/.test(s)) return 2;
  if (s.startsWith('third') || /\b3rd\b/.test(s) || /\bterm\s*3\b/.test(s)) return 3;
  return 1;
}

export function getSyllabusTermWeeks(
  content: SyllabusContentImport | null | undefined,
  termNumber: number,
): SyllabusWeekImport[] {
  const terms = content?.terms;
  if (!terms?.length) return [];
  const termData = terms.find((t) => t.term === termNumber) ?? terms[0];
  return termData?.weeks ?? [];
}

export function findSyllabusWeek(
  content: SyllabusContentImport | null | undefined,
  termNumber: number,
  weekNumber: number,
): SyllabusWeekImport | undefined {
  return getSyllabusTermWeeks(content, termNumber).find((w) => w.week === weekNumber);
}

/** Text block for AI prompts — syllabus-backed student + teacher lines. */
export function buildSyllabusAnchorText(sw: SyllabusWeekImport | undefined): string | undefined {
  if (!sw) return undefined;
  const lp = sw.lesson_plan;
  const parts: string[] = [];
  if (sw.topic) parts.push(`Week topic: ${sw.topic}`);
  if (Array.isArray(sw.subtopics) && sw.subtopics.length) {
    parts.push(`Subtopics: ${sw.subtopics.join('; ')}`);
  }
  if (lp?.objectives?.length) parts.push(`Objectives: ${lp.objectives.join(' | ')}`);
  if (lp?.student_activities?.length) {
    parts.push(`Student activities (follow as spine):\n${lp.student_activities.map((a, i) => `${i + 1}. ${a}`).join('\n')}`);
  }
  if (lp?.teacher_activities?.length) {
    parts.push(`Teacher activities:\n${lp.teacher_activities.map((a, i) => `${i + 1}. ${a}`).join('\n')}`);
  }
  if (lp?.classwork && typeof lp.classwork === 'object') {
    const cw = lp.classwork as { title?: string; instructions?: string };
    if (cw.title || cw.instructions) {
      parts.push(`Classwork: ${cw.title ?? ''} — ${cw.instructions ?? ''}`.trim());
    }
  }
  if (lp?.resources?.length) parts.push(`Resources: ${lp.resources.join('; ')}`);
  if (lp?.engagement_tips?.length) parts.push(`Engagement tips: ${lp.engagement_tips.join(' | ')}`);
  if (sw.assessment) parts.push(`Assessment note: ${sw.assessment}`);
  if (!parts.length) return undefined;
  return parts.join('\n\n');
}

export function mapSyllabusWeekToPlanRow(w: SyllabusWeekImport): Record<string, unknown> {
  const lp = w.lesson_plan;
  const objectivesFromLp = lp?.objectives?.filter(Boolean) ?? [];
  const objectives =
    objectivesFromLp.length > 0
      ? objectivesFromLp.join('\n')
      : Array.isArray(w.subtopics)
        ? w.subtopics.join(', ')
        : '';

  const studentFromLp = lp?.student_activities?.filter(Boolean).join('\n\n') ?? '';
  const studentFromWeek = Array.isArray(w.activities) ? w.activities.filter(Boolean).join('\n') : '';
  const activities = studentFromLp || studentFromWeek;

  const teacherBlock = lp?.teacher_activities?.filter(Boolean).join('\n\n') ?? '';
  const notesParts: string[] = [];
  if (teacherBlock) notesParts.push(`Teacher activities:\n${teacherBlock}`);
  if (lp?.classwork && typeof lp.classwork === 'object') {
    const cw = lp.classwork as { title?: string; instructions?: string; materials?: string[] };
    const line = [cw.title, cw.instructions].filter(Boolean).join(' — ');
    if (line) notesParts.push(`Classwork: ${line}`);
    if (cw.materials?.length) notesParts.push(`Materials: ${cw.materials.join(', ')}`);
  }
  if (lp?.resources?.length) notesParts.push(`Resources:\n${lp.resources.join('\n')}`);
  if (lp?.engagement_tips?.length) notesParts.push(`Engagement:\n${lp.engagement_tips.join('\n')}`);
  if (w.assessment) notesParts.push(`Assessment / notes: ${w.assessment}`);

  const row: Record<string, unknown> = {
    week: w.week,
    topic: w.topic || '',
    objectives,
    activities,
    notes: notesParts.join('\n\n'),
    syllabus_week_type: w.type ?? 'lesson',
  };

  if (typeof lp?.duration_minutes === 'number' && Number.isFinite(lp.duration_minutes)) {
    row.syllabus_duration_minutes = lp.duration_minutes;
  }
  if (lp?.student_activities?.length) row.syllabus_student_activities = lp.student_activities;
  if (lp?.teacher_activities?.length) row.syllabus_teacher_activities = lp.teacher_activities;

  return row;
}
