/**
 * GET /api/curricula/[id]/dependents
 *
 * What is actually holding this curriculum copy, itemised rather than counted.
 *
 * The DELETE endpoint returns totals ("3 teaching plans still use it"), which tells you
 * a delete is blocked but not WHICH records to look at. This lists each blocker with a
 * label, where it lives, whether removing it is safe, and a link to open it — so the
 * blockers can be cleared from the app instead of from a SQL console.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

/** Same gate as the sibling curricula routes: signed-in admin or teacher. */
async function requireTeacher() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const admin = createAdminClient() as any;
  const { data: profile } = await admin
    .from('portal_users')
    .select('id, role, school_id')
    .eq('id', user.id)
    .single();
  if (!profile || !['admin', 'teacher'].includes(profile.role)) return null;
  return profile;
}

async function callerCanManageCurriculumSchool(
  admin: any,
  caller: { id: string; role: string; school_id: string | null },
  curriculumSchoolId: string | null,
): Promise<boolean> {
  if (caller.role === 'admin') return true;
  if (!curriculumSchoolId) return false;
  if (caller.school_id === curriculumSchoolId) return true;
  const { data: ts } = await admin
    .from('teacher_schools')
    .select('school_id')
    .eq('teacher_id', caller.id)
    .eq('school_id', curriculumSchoolId)
    .maybeSingle();
  return !!ts;
}

/** One thing standing between this curriculum and deletion. */
export interface CurriculumDependent {
  kind: 'official_edition' | 'teaching_plan' | 'delivery_record';
  id: string;
  label: string;
  detail: string;
  /** What happens to it when the blockers are cleared. */
  onCleanup: 'unlinked' | 'deleted' | 'detached';
  /** Safe to clear without losing teaching history. */
  safe: boolean;
  href?: string;
}

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const caller = await requireTeacher();
  if (!caller) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await ctx.params;
  const admin = createAdminClient() as any;

  const { data: row, error: rowErr } = await admin
    .from('course_curricula')
    .select('id, school_id, version, course_id')
    .eq('id', id)
    .maybeSingle();
  if (rowErr) return NextResponse.json({ error: rowErr.message }, { status: 500 });
  if (!row) return NextResponse.json({ error: 'Curriculum not found' }, { status: 404 });

  if (!(await callerCanManageCurriculumSchool(admin, caller, row.school_id ?? null))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const [releasesRes, plansRes, weeksRes] = await Promise.all([
    admin
      .from('academic_curriculum_releases')
      .select('id, title, release_number, status, academic_session, audience_label, published_at')
      .eq('source_curriculum_id', id)
      .order('release_number', { ascending: true }),
    admin
      .from('lesson_plans')
      .select('id, status, term, class_id, classes!lesson_plans_class_id_fkey(name)')
      .eq('curriculum_version_id', id),
    admin
      .from('curriculum_week_tracking')
      .select('id, term_number, week_number, status, class_id, classes!curriculum_week_tracking_class_id_fkey(name)')
      .eq('curriculum_id', id)
      .order('term_number', { ascending: true })
      .order('week_number', { ascending: true }),
  ]);

  const dependents: CurriculumDependent[] = [];

  for (const r of releasesRes.data ?? []) {
    const rel = r as any;
    const published = rel.published_at
      ? new Date(rel.published_at).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
      : null;
    dependents.push({
      kind: 'official_edition',
      id: rel.id,
      label: rel.title || `Edition ${rel.release_number ?? '—'}`,
      // There is no single-edition page, so everything identifying it is shown inline.
      detail: [
        rel.release_number != null ? `Edition #${rel.release_number}` : null,
        rel.academic_session,
        rel.audience_label,
        rel.status,
        published ? `published ${published}` : null,
      ].filter(Boolean).join(' · ') || 'Published edition',
      // The edition keeps its own copy of the content; only the "made from" link goes.
      onCleanup: 'unlinked',
      safe: true,
      // Send them to where the edition is AUTHORED, not where it is distributed:
      // the curriculum step shows the live official edition (OfficialDirectionStatus)
      // for the course, which is what you want in view before building the next one.
      href: row.course_id ? `/dashboard/academic/build?course_id=${row.course_id}` : '/dashboard/academic/build',
    });
  }

  for (const p of plansRes.data ?? []) {
    const plan = p as any;
    const klass = Array.isArray(plan.classes) ? plan.classes[0] : plan.classes;
    const isDraft = plan.status === 'draft' || plan.status === 'archived';
    dependents.push({
      kind: 'teaching_plan',
      id: plan.id,
      label: klass?.name ? `${klass.name} teaching plan` : 'Teaching plan (no class)',
      detail: [plan.status, plan.term ? `Term ${plan.term}` : null].filter(Boolean).join(' · '),
      // Drafts are throwaway; anything live keeps its content and simply stops
      // pointing at this copy, so no teaching history is lost.
      onCleanup: isDraft ? 'deleted' : 'detached',
      safe: isDraft,
      href: `/dashboard/lesson-plans/${plan.id}`,
    });
  }

  const weeks = (weeksRes.data ?? []) as any[];
  // Weeks are numerous and individually meaningless — group them per class.
  const byClass = new Map<string, { name: string; weeks: string[]; classId: string | null }>();
  for (const w of weeks) {
    const klass = Array.isArray(w.classes) ? w.classes[0] : w.classes;
    const key = w.class_id ?? 'unassigned';
    if (!byClass.has(key)) {
      byClass.set(key, { name: klass?.name ?? 'No class attached', weeks: [], classId: w.class_id ?? null });
    }
    byClass.get(key)!.weeks.push(`T${w.term_number}W${w.week_number}`);
  }
  for (const [key, group] of byClass) {
    dependents.push({
      kind: 'delivery_record',
      id: key,
      label: `${group.name} — ${group.weeks.length} delivered week${group.weeks.length === 1 ? '' : 's'}`,
      detail: group.weeks.slice(0, 12).join(', ') + (group.weeks.length > 12 ? ` +${group.weeks.length - 12} more` : ''),
      onCleanup: 'deleted',
      safe: false, // this is real delivery history — worth a second look
      href: group.classId ? `/dashboard/classes/${group.classId}` : undefined,
    });
  }

  const livePlans = (plansRes.data ?? []).filter((p: any) => p.status !== 'draft' && p.status !== 'archived');

  return NextResponse.json({
    curriculum: { id: row.id, version: row.version, course_id: row.course_id },
    dependents,
    summary: {
      total: dependents.length,
      official_editions: (releasesRes.data ?? []).length,
      teaching_plans: (plansRes.data ?? []).length,
      live_plans: livePlans.length,
      delivery_weeks: weeks.length,
      /** Nothing irreversible: no live plans and no delivery history. */
      fully_safe: livePlans.length === 0 && weeks.length === 0,
    },
  });
}
