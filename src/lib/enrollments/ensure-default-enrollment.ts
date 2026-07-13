import type { SupabaseClient } from '@supabase/supabase-js';
import { isAlwaysPublicProgramName } from '@/lib/courses/visibility';
import { isAdultOrIndividualGrade, resolveProgramFromInterest } from '@/lib/registration/programme-map';

/**
 * Give a freshly-onboarded student an actual learning path (idempotent).
 * Uses the central course_interest → programme map so marketing promises match LMS placement.
 */

type Tier = 'kids' | 'secondary' | 'adult';

export function classifyLearnerTier(grade?: string | null, enrollmentType?: string | null): Tier {
  const g = (grade || enrollmentType || '').toLowerCase().trim();
  if (!g) return 'secondary';
  if (isAdultOrIndividualGrade(g)) return 'adult';
  if (/\b(nursery|kg|kindergarten|pre-?school|basic\s*[1-6]|primary|grade\s*[1-6]|year\s*[1-6]|class\s*[1-6]|kid|p[1-6]\b)/i.test(g)) return 'kids';
  if (/\b(jss|ss\s*[1-3]|junior\s*sec|senior\s*sec|secondary|form\s*[1-6]|year\s*[7-9]|year\s*1[0-3])/i.test(g)) return 'secondary';
  if (/\b(adult|hnd|ond|nce|pgde|university|uni|tertiary|professional|degree|postgrad|masters|phd|ndp|diploma|college|individual)/i.test(g)) return 'adult';
  if (g.includes('basic') || g.includes('primary') || g.includes('kid') || g.includes('grade')) return 'kids';
  return 'secondary';
}

export interface EnsureEnrollmentResult {
  enrolled: boolean;
  programId: string | null;
  programName: string | null;
  reason?: string;
}

function isTrackEnrollment(enrollmentType?: string | null): boolean {
  const t = (enrollmentType || '').toLowerCase();
  return t.includes('summer') || t.includes('online') || t.includes('bootcamp') || t.includes('in_person') || t.includes('in-person');
}

function isSummerEnrollment(enrollmentType?: string | null, courseInterest?: string | null): boolean {
  const t = `${enrollmentType ?? ''} ${courseInterest ?? ''}`.toLowerCase();
  return t.includes('summer');
}

function resolveSummerProgram(
  programs: Array<{ id: string; name: string }>,
): { id: string; name: string } | null {
  return programs.find((p) => p.name.toLowerCase().includes('summer school')) ?? null;
}

const ONLINE_DEFAULT_PROGRAMS = ['ai engineering', 'data analysis'] as const;

function resolveOnlineProgram(
  programs: Array<{ id: string; name: string }>,
  courseInterest?: string | null,
): { id: string; name: string } | null {
  const mapped = resolveProgramFromInterest(programs, courseInterest);
  if (mapped) return mapped;

  const interest = (courseInterest || '').toLowerCase().trim();
  if (interest) {
    const direct = programs.find((p) => {
      const n = p.name.toLowerCase();
      return interest.includes(n) || n.includes(interest);
    });
    if (direct) return direct;
  }
  for (const name of ONLINE_DEFAULT_PROGRAMS) {
    const match = programs.find((p) => p.name.toLowerCase() === name || p.name.toLowerCase().includes(name));
    if (match) return match;
  }
  return null;
}

export async function ensureDefaultEnrollment(
  admin: SupabaseClient,
  userId: string,
  opts: {
    grade?: string | null;
    enrollmentType?: string | null;
    courseInterest?: string | null;
    /** Prefer this programme id when set (e.g. special_program_pages.program_id). */
    preferredProgramId?: string | null;
  } = {},
): Promise<EnsureEnrollmentResult> {
  try {
    const { data: existing } = await admin
      .from('enrollments')
      .select('id, program_id')
      .eq('user_id', userId)
      .limit(1)
      .maybeSingle();

    if (existing) {
      return { enrolled: false, programId: existing.program_id ?? null, programName: null, reason: 'already_enrolled' };
    }

    const { data: programs } = await admin
      .from('programs')
      .select('id, name, is_active')
      .eq('is_active', true);

    const allActive = (programs ?? []) as Array<{ id: string; name: string }>;

    let target: { id: string; name: string } | null = null;

    if (opts.preferredProgramId) {
      const preferred = allActive.find((p) => p.id === opts.preferredProgramId);
      if (preferred) target = preferred;
    }

    if (!target && isSummerEnrollment(opts.enrollmentType, opts.courseInterest)) {
      target = resolveSummerProgram(allActive);
    }

    if (!target && opts.enrollmentType === 'school' && opts.courseInterest) {
      target = resolveProgramFromInterest(allActive, opts.courseInterest);
    }

    if (!target && (isTrackEnrollment(opts.enrollmentType) || opts.courseInterest)) {
      target = resolveOnlineProgram(allActive, opts.courseInterest);
    }

    if (!target) {
      const flagship = allActive.filter((p) => isAlwaysPublicProgramName(p.name));
      if (flagship.length === 0) {
        return { enrolled: false, programId: null, programName: null, reason: 'no_flagship_program' };
      }
      const tier = classifyLearnerTier(opts.grade, opts.enrollmentType);
      const wantsYoung = tier === 'kids';
      const byTier = flagship.find((p) => {
        const n = p.name.toLowerCase();
        return wantsYoung ? n.includes('young') : n.includes('teen');
      });
      target = byTier ?? flagship[0];
    }

    const { error } = await admin.from('enrollments').insert({
      user_id: userId,
      program_id: target.id,
      role: 'student',
      status: 'active',
      enrollment_date: new Date().toISOString(),
    });

    if (error) {
      return { enrolled: false, programId: target.id, programName: target.name, reason: error.message };
    }
    return { enrolled: true, programId: target.id, programName: target.name };
  } catch (err: any) {
    return { enrolled: false, programId: null, programName: null, reason: err?.message ?? 'unknown_error' };
  }
}
