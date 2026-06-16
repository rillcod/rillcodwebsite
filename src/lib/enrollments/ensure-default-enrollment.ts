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
 *   • Otherwise it picks the best flagship programme for their level
 *     (Young Innovator(s) for younger learners, Teen Developer(s) otherwise)
 *     — the two always-public, content-bearing programmes — and enrols them.
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

export async function ensureDefaultEnrollment(
  admin: SupabaseClient,
  userId: string,
  opts: { grade?: string | null; enrollmentType?: string | null } = {},
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

    // 2. Pull active flagship programmes (the only learner-visible, content-bearing ones).
    const { data: programs } = await admin
      .from('programs')
      .select('id, name, is_active')
      .eq('is_active', true);

    const flagship = (programs ?? []).filter((p: any) => isAlwaysPublicProgramName(p.name)) as Array<{ id: string; name: string }>;

    if (flagship.length === 0) {
      return { enrolled: false, programId: null, programName: null, reason: 'no_flagship_program' };
    }

    // 3. Match by learner tier; younger learners → "Young Innovator", else "Teen Developer".
    const tier = classifyTier(opts.grade, opts.enrollmentType);
    const wantsYoung = tier === 'kids';
    const byTier = flagship.find((p) => {
      const n = p.name.toLowerCase();
      return wantsYoung ? n.includes('young') : n.includes('teen');
    });
    const target = byTier ?? flagship[0];

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
