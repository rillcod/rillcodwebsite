import { createHash } from 'node:crypto';

export type CurriculumProposalScope = 'class' | 'school' | 'official';
export type CurriculumPolicyClassification =
  | 'delivery_safe'
  | 'school_operational'
  | 'academic_core';

const DELIVERY_SAFE_SEGMENTS = new Set([
  'activities',
  'teacher_activities',
  'student_activities',
  'engagement_tips',
  'examples',
  'resources',
  'materials',
  'notes',
  'teacher_notes',
  'duration_minutes',
]);

const SCHOOL_OPERATIONAL_SEGMENTS = new Set([
  'start_date',
  'end_date',
  'term_start_dates',
  'notification_settings',
  'recommended_tools',
  'local_resources',
  'sessions_per_week',
]);

export function normalizeChangedPaths(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(value
    .filter((entry): entry is string => typeof entry === 'string')
    .map((entry) => entry.trim().replace(/^\.+|\.+$/g, ''))
    .filter(Boolean)))
    .slice(0, 100);
}

export function classifyCurriculumChange(
  paths: string[],
  scope: CurriculumProposalScope,
): CurriculumPolicyClassification {
  if (scope === 'official' || paths.length === 0) return 'academic_core';
  const segments = paths.flatMap((path) => path.toLowerCase().split(/[.\[\]]+/).filter(Boolean));
  if (segments.some((segment) => SCHOOL_OPERATIONAL_SEGMENTS.has(segment))) {
    return segments.every((segment) =>
      /^\d+$/.test(segment)
      || ['content', 'terms', 'weeks', 'metadata'].includes(segment)
      || SCHOOL_OPERATIONAL_SEGMENTS.has(segment)
      || DELIVERY_SAFE_SEGMENTS.has(segment))
      ? 'school_operational'
      : 'academic_core';
  }
  return segments.every((segment) =>
    /^\d+$/.test(segment)
    || ['content', 'terms', 'weeks', 'lesson_plan'].includes(segment)
    || DELIVERY_SAFE_SEGMENTS.has(segment))
    ? 'delivery_safe'
    : 'academic_core';
}

export function proposalInitialStatus(
  classification: CurriculumPolicyClassification,
  scope: CurriculumProposalScope,
): 'auto_approved' | 'pending' {
  return classification === 'delivery_safe' && scope === 'class'
    ? 'auto_approved'
    : 'pending';
}

function sortJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortJson);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, entry]) => [key, sortJson(entry)]),
  );
}

export function curriculumContentHash(content: unknown): string {
  return createHash('sha256')
    .update(JSON.stringify(sortJson(content ?? {})))
    .digest('hex');
}

export function validateSourceMetadata(value: unknown): {
  ok: boolean;
  source: Record<string, unknown>;
  error?: string;
} {
  const source = value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
  const name = typeof source.name === 'string' ? source.name.trim() : '';
  const framework = typeof source.framework === 'string' ? source.framework.trim() : '';
  if (!name) return { ok: false, source, error: 'Source name is required.' };
  if (!framework) return { ok: false, source, error: 'Source framework or standard is required.' };
  return {
    ok: true,
    source: {
      ...source,
      name: name.slice(0, 200),
      framework: framework.slice(0, 200),
      reference_url: typeof source.reference_url === 'string'
        ? source.reference_url.trim().slice(0, 1000)
        : null,
    },
  };
}

export function determineRolloutStatus(input: {
  autoUpdate: boolean;
  adoptionStatus?: string | null;
  requested: boolean;
}): { status: 'eligible' | 'skipped' | 'conflict'; reason: string } {
  if (!input.requested) return { status: 'skipped', reason: 'School was not selected.' };
  if (input.adoptionStatus === 'conflict') {
    return { status: 'conflict', reason: 'Existing adoption has an unresolved conflict.' };
  }
  if (input.adoptionStatus === 'paused' || !input.autoUpdate) {
    return { status: 'skipped', reason: 'Automatic curriculum updates are paused for this school.' };
  }
  return { status: 'eligible', reason: 'Safe to adopt for future class-term plans.' };
}
