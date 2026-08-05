/**
 * Admin readiness for special-programme teaching: programme, school, cohort class.
 * Pure helpers so the builder can show the same checklist the API enforces.
 */

export type TeachingReadinessStepId =
  | 'programme'
  | 'school'
  | 'cohort'
  | 'published'
  | 'dates';

export type TeachingReadinessStep = {
  id: TeachingReadinessStepId;
  label: string;
  ok: boolean;
  detail: string;
};

export type CohortClassSummary = {
  id: string;
  name: string;
  status: string;
  teacher_id: string | null;
  teacher_name: string | null;
};

export type TeachingReadiness = {
  ready: boolean;
  can_prepare: boolean;
  steps: TeachingReadinessStep[];
  missing: string[];
  cohort_class: CohortClassSummary | null;
};

export function buildTeachingReadiness(input: {
  programId?: string | null;
  schoolId?: string | null;
  isPublished?: boolean;
  startsOn?: string | null;
  cohortClass?: CohortClassSummary | null;
}): TeachingReadiness {
  const cohort = input.cohortClass ?? null;
  const steps: TeachingReadinessStep[] = [
    {
      id: 'programme',
      label: 'Programme linked',
      ok: Boolean(input.programId),
      detail: input.programId
        ? 'Modules can match courses on this programme.'
        : 'Choose the programme these modules belong to.',
    },
    {
      id: 'school',
      label: 'School linked',
      ok: Boolean(input.schoolId),
      detail: input.schoolId
        ? 'Teaching plans will sit on this school.'
        : 'Choose the school that runs this cohort.',
    },
    {
      id: 'cohort',
      label: 'Cohort class ready',
      ok: Boolean(cohort?.id && cohort.status === 'active'),
      detail: cohort?.id
        ? cohort.status === 'active'
          ? `${cohort.name}${cohort.teacher_name ? ` · Teacher: ${cohort.teacher_name}` : ''}`
          : `${cohort.name} exists but is ${cohort.status} — activate it or create a new active class.`
        : 'Created automatically when teaching is prepared. Create it now to pick the teacher yourself.',
    },
    {
      id: 'dates',
      label: 'Start date set',
      ok: Boolean(input.startsOn),
      detail: input.startsOn
        ? `Starts ${input.startsOn}`
        : 'Set a start date so teaching weeks can advance.',
    },
    {
      id: 'published',
      label: 'Page published',
      ok: Boolean(input.isPublished),
      detail: input.isPublished
        ? 'Parents can register; teaching can be prepared.'
        : 'Publish when the page write-up is ready.',
    },
  ];

  const missing = steps.filter((s) => !s.ok).map((s) => s.label);
  // Prepare needs the choices only a human can make: programme, school, publish.
  // The cohort class is created automatically by the launch pipeline, and the
  // start date only affects week timing — neither should block the button.
  const can_prepare =
    steps.find((s) => s.id === 'programme')!.ok &&
    steps.find((s) => s.id === 'school')!.ok &&
    steps.find((s) => s.id === 'published')!.ok;

  return {
    ready: missing.length === 0,
    can_prepare,
    steps,
    missing,
    cohort_class: cohort,
  };
}
