import type { SupabaseClient } from '@supabase/supabase-js';
import { isAlwaysPublicProgramName } from '@/lib/courses/visibility';

/**
 * Give a freshly-onboarded student an actual learning path.
 *
 * Onboarding (activation / approval / summer-school webhook) creates the
 * `portal_users` + `students` rows and an `@rillcod.com` login — but it never
 * created an `enrollments` row. The student dashboard derives the entire
 * learning experience (programmes → courses → lessons, "Up Next", progress)
 * from `enrollments`, so without one the learner logs in to an empty path:
 * "You are not enrolled in any programme yet."
 *
 * This helper closes that gap idempotently:
 *   • If the student already has ANY enrollment, it does nothing.
 *   • Otherwise, for online / summer / bootcamp learners it enrols them into the
 *     TRACK they signed up for (course_interest → e.g. "AI Engineering &
 *     Automation", "Data Analysis with Python"), and for everyone else it picks
 *     the best flagship programme for their level (Young Innovator(s) for younger
 *     learners, Teen Developer(s) otherwise).
 *
 * The programme chosen here is only a DEFAULT — an admin can override it later by
 * changing the student's enrollment. Because this helper no-ops whenever any
 * enrollment already exists, it never overwrites an admin's deliberate choice.
 *
 * It is intentionally defensive and non-throwing for callers: enrolment is a
 * nice-to-have side effect of onboarding, never a reason to fail the account
 * creation. Callers should `void` it or wrap in try/catch.
 *
 * NOTE: `enrollments` has a NOT NULL `role` column (always 'student' here).
 */

type Tier = 'kids' | 'secondary' | 'adult';

function classifyTier(grade?: string | null, enrollmentType?: string | null): Tier {
  const g = (grade || enrollmentType || '').toLowerCase().trim();
  if (!g) return 'secondary';
  if (/\b(nursery|kg|kindergarten|pre-?school|basic\s*[1-6]|primary|grade\s*[1-6]|year\s*[1-6]|class\s*[1-6]|kid|p[1-6]\b)/i.test(g)) return 'kids';
  if (/\b(jss|ss\s*[1-3]|junior\s*sec|senior\s*sec|secondary|form\s*[1-6]|year\s*[7-9]|year\s*1[0-3])/i.test(g)) return 'secondary';
  if (/\b(adult|hnd|ond|nce|pgde|university|uni|tertiary|professional|degree|postgrad|masters|phd|ndp|diploma|college)/i.test(g)) return 'adult';
  if (g.includes('basic') || g.includes('primary') || g.includes('kid') || g.includes('grade')) return 'kids';
  return 'secondary';
}

export interface EnsureEnrollmentResult {
  enrolled: boolean;
  programId: string | null;
  programName: string | null;
  reason?: string;
}

/** Online / summer / bootcamp learners belong to a real track, not a flagship programme. */
function isOnlineEnrollment(enrollmentType?: string | null): boolean {
  const t = (enrollmentType || '').toLowerCase();
  return t.includes('summer') || t.includes('online') || t.includes('bootcamp');
}

/**
 * Default online tracks, in priority order, when course_interest doesn't pin one
 * down. Substrings (not full names) so they tolerate the real programme titles
 * e.g. "AI Engineering & Automation", "Data Analysis with Python".
 */
const ONLINE_DEFAULT_PROGRAMS = ['ai engineering', 'data analysis'] as const;

/**
 * Resolve the bootcamp/online programme a learner should join from their chosen
 * track (`course_interest`), falling back to the first available default track.
 * Returns null when none of the online programmes exist yet (caller then uses the
 * flagship logic).
 */
function resolveOnlineProgram(
  programs: Array<{ id: string; name: string }>,
  courseInterest?: string | null,
): { id: string; name: string } | null {
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
  opts: { grade?: string | null; enrollmentType?: string | null; courseInterest?: string | null } = {},
): Promise<EnsureEnrollmentResult> {
  try {
    // 1. Idempotent: never double-enrol.
    const { data: existing } = await admin
      .from('enrollments')
      .select('id, program_id')
      .eq('user_id', userId)
      .limit(1)
      .maybeSingle();

    if (existing) {
      return { enrolled: false, programId: existing.program_id ?? null, programName: null, reason: 'already_enrolled' };
    }

    // 2. Pull active programmes.
    const { data: programs } = await admin
      .from('programs')
      .select('id, name, is_active')
      .eq('is_active', true);

    const allActive = (programs ?? []) as Array<{ id: string; name: string }>;

    // 2b. Online / summer / bootcamp learners belong to their chosen TRACK
    //     (AI Engineering, Data Analysis with Python, …), NOT a flagship programme.
    //     Enrolling them into a flagship is what hid programme-tagged bootcamp
    //     assignments from them.
    let target: { id: string; name: string } | null = null;
    if (isOnlineEnrollment(opts.enrollmentType)) {
      target = resolveOnlineProgram(allActive, opts.courseInterest);
    }

    // 3. Otherwise (or if no online track exists yet) fall back to the flagship
    //    programmes, matched by learner tier: younger → "Young Innovator", else "Teen Developer".
    if (!target) {
      const flagship = allActive.filter((p) => isAlwaysPublicProgramName(p.name));
      if (flagship.length === 0) {
        return { enrolled: false, programId: null, programName: null, reason: 'no_flagship_program' };
      }
      const tier = classifyTier(opts.grade, opts.enrollmentType);
      const wantsYoung = tier === 'kids';
      const byTier = flagship.find((p) => {
        const n = p.name.toLowerCase();
        return wantsYoung ? n.includes('young') : n.includes('teen');
      });
      target = byTier ?? flagship[0];
    }

    // 4. Enrol.
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
