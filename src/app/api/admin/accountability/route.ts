import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createClient as createServerClient } from '@/lib/supabase/server';
import type { Database } from '@/types/supabase';
import { roleHasCapability } from '@/lib/auth/capabilities';
import { fetchAllSupabaseRows } from '@/lib/supabase/fetch-all-rows';
import { logAudit } from '@/lib/audit/log';
import { classifyStudentSessionStatus, getSessionBoundary } from '@/lib/academic/session-scope';

/**
 * Full accountability census: every school, every account, where they are placed,
 * cleanly separated into Current Session vs Prior Session / Archive.
 *
 * Refresh: POST /api/admin/accountability -> refresh_accountability_cache().
 */

export const dynamic = 'force-dynamic';

const RPC_TIMEOUT_MS = 60_000;

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      'Server misconfiguration: NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is not set.',
    );
  }
  return createClient<Database>(url, key);
}

function timeout(ms: number): Promise<never> {
  return new Promise((_, reject) =>
    setTimeout(() => reject(new Error(`Database query timed out after ${ms / 1000}s`)), ms),
  );
}

async function accountabilityActor(): Promise<{ actorId: string | null; error: NextResponse | null }> {
  const supabase = await createServerClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return { actorId: null, error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }
  const { data: caller } = await supabase
    .from('portal_users')
    .select('id, role')
    .eq('id', user.id)
    .maybeSingle();
  if (!roleHasCapability(caller?.role, 'view_accountability')) {
    return { actorId: null, error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  }
  return { actorId: user.id, error: null };
}

const NO_STORE = { headers: { 'Cache-Control': 'no-store' } };

function countByRole(rows: Array<{ role?: string | null }>) {
  const m: Record<string, number> = {};
  for (const row of rows) {
    const r = String(row.role || 'unknown').toLowerCase();
    m[r] = (m[r] || 0) + 1;
  }
  return m;
}

export async function GET() {
  const actor = await accountabilityActor();
  if (actor.error) return actor.error;

  let db: ReturnType<typeof adminClient>;
  try {
    db = adminClient();
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Server misconfiguration' },
      { status: 500 },
    );
  }

  let coverageRes: Awaited<ReturnType<typeof db.rpc>>;
  let peopleRes: { data: any[]; error: { message: string } | null };
  let backlogRes: Awaited<ReturnType<typeof db.rpc>>;
  let liveRoleRes: { data: Array<{ id: string; role: string; school_id: string | null; class_id: string | null; created_at: string | null; metadata: any }> | null; error: { message: string } | null };
  let settingsRes: { data: { value?: string | null } | null; error: { message: string } | null };
  let schoolsRes: { data: Array<{ id: string; name: string; city: string | null; state: string | null; status: string | null }> | null; error: { message: string } | null };
  let classesRes: { data: Array<{ id: string; name: string; school_id: string | null; term_id: string | null; teacher_id: string | null; status: string | null }> | null; error: { message: string } | null };
  let rostersRes: { data: Array<{ student_id: string; class_id: string; status: string | null; started_at: string | null; reinstated_at: string | null; term_id: string | null }> | null; error: { message: string } | null };

  try {
    [coverageRes, peopleRes, backlogRes, liveRoleRes, settingsRes, schoolsRes, classesRes, rostersRes] = await Promise.race([
      Promise.all([
        db.rpc('get_academic_coverage' as never),
        fetchAllSupabaseRows<any>((from, to) =>
          db.from('accountability_people_mv' as never).select('*').range(from, to),
        ),
        db.rpc('get_report_backlog' as never),
        fetchAllSupabaseRows<{ id: string; role: string; school_id: string | null; class_id: string | null; created_at: string | null; metadata: any }>((from, to) =>
          db
            .from('portal_users')
            .select('id, role, school_id, class_id, created_at, metadata')
            .eq('is_deleted', false)
            .range(from, to),
        ),
        db.from('app_settings')
          .select('value')
          .eq('key', 'lms.ops.permissions')
          .maybeSingle(),
        db
          .from('schools')
          .select('id, name, city, state, status')
          .neq('is_deleted', true)
          .order('name'),
        fetchAllSupabaseRows<{ id: string; name: string; school_id: string | null; term_id: string | null; teacher_id: string | null; status: string | null }>((from, to) =>
          db
            .from('classes')
            .select('id, name, school_id, term_id, teacher_id, status')
            .range(from, to),
        ),
        fetchAllSupabaseRows<{ student_id: string; class_id: string; status: string | null; started_at: string | null; reinstated_at: string | null; term_id: string | null }>((from, to) =>
          (db as any)
            .from('class_term_rosters')
            .select('student_id, class_id, status, started_at, reinstated_at, term_id')
            .eq('status', 'active')
            .range(from, to),
        ),
      ]),
      timeout(RPC_TIMEOUT_MS),
    ]);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Database query failed' },
      { status: 500 },
    );
  }

  if (coverageRes.error) {
    return NextResponse.json({ error: coverageRes.error.message }, { status: 500 });
  }
  if (peopleRes.error) {
    return NextResponse.json({ error: peopleRes.error.message }, { status: 500 });
  }

  const coverageData = (coverageRes.data ?? null) as any;
  const activeTermId: string | null = coverageData?.term_context?.term_id ?? null;

  const allSchools = schoolsRes.data ?? [];
  const schoolById = new Map(allSchools.map((s) => [s.id, s]));
  const schoolIdByName = new Map(allSchools.map((s) => [s.name.trim().toLowerCase(), s.id]));

  const allClasses = (classesRes.data ?? []).filter((c) => {
    const st = String(c.status || 'active').toLowerCase();
    return st !== 'deleted' && st !== 'archived';
  });
  const classById = new Map(allClasses.map((c) => [c.id, c]));
  const liveUserMap = new Map((liveRoleRes.data ?? []).map((u) => [u.id, u]));
  const sessionBoundary = getSessionBoundary(coverageData?.term_context?.academic_year ?? null);
  const activeRosterByStudent = new Map<
    string,
    { class_id: string; status: string | null; started_at: string | null; reinstated_at: string | null; term_id: string | null }
  >();
  for (const r of rostersRes.data ?? []) {
    const existing = activeRosterByStudent.get(r.student_id);
    const liveClassId = liveUserMap.get(r.student_id)?.class_id;
    // Prefer the active roster matching portal_users.class_id, or the most recently reinstated/started row.
    if (!existing || (liveClassId && r.class_id === liveClassId)) {
      activeRosterByStudent.set(r.student_id, r);
    }
  }

  // Enrich every person with authoritative school_id/school_name AND strict session_scope
  // using the canonical session-scope classifier so unconfirmed 3rd-term carryover students
  // are NEVER falsely counted as placed/enrolled for the current session.
  const people = (peopleRes.data ?? []).map((p: any) => {
    const live = liveUserMap.get(p.id);
    const resolvedSchoolId =
      live?.school_id
      ?? (p.school_name ? schoolIdByName.get(String(p.school_name).trim().toLowerCase()) ?? null : null);
    const resolvedSchoolName =
      p.school_name
      || (resolvedSchoolId ? schoolById.get(resolvedSchoolId)?.name ?? null : null);

    const roleNorm = String(p.role || '').toLowerCase();
    const flags: string[] = Array.isArray(p.flags) ? p.flags : [];
    const rosterStatus = String(p.roster_status || '').toLowerCase();
    const liveClass = live?.class_id ? classById.get(live.class_id) : null;
    const activeRoster = activeRosterByStudent.get(p.id) ?? null;

    let session_scope: 'current' | 'archive' | 'unassigned' = 'current';
    if (roleNorm === 'student') {
      const isWithdrawnOrInactive =
        !p.is_active
        || flags.includes('withdrawn')
        || ['withdrawn', 'ended', 'removed', 'completed'].includes(rosterStatus);

      const meta = live?.metadata && typeof live.metadata === 'object' ? (live.metadata as Record<string, any>) : {};
      const confirmedByMeta =
        String(meta.confirmed_session || '') === sessionBoundary.periodLabel ||
        String(meta.rollover_session || '') === sessionBoundary.periodLabel ||
        (Array.isArray(meta.session_history) &&
          meta.session_history.some((h: any) => String(h?.session || '') === sessionBoundary.periodLabel));

      const sessionStatus = classifyStudentSessionStatus(
        {
          is_active: Boolean(p.is_active) && !isWithdrawnOrInactive,
          created_at: live?.created_at ?? null,
          metadata: meta,
        },
        activeRoster
          ? {
              status: activeRoster.status,
              term_id: activeRoster.term_id ?? liveClass?.term_id ?? null,
              started_at: activeRoster.reinstated_at ?? activeRoster.started_at ?? null,
            }
          : null,
        {
          canonicalTermId: activeTermId,
          boundary: sessionBoundary,
        },
      );

      if (isWithdrawnOrInactive) {
        session_scope = 'archive';
      } else if (!confirmedByMeta && sessionStatus === 'carryover_unconfirmed') {
        // Prior-session (e.g. 3rd term) student NOT YET confirmed for this session → keep in Archive/Unconfirmed!
        session_scope = 'archive';
      } else if (!p.class_from_roster && !live?.class_id) {
        session_scope = 'unassigned';
      } else {
        session_scope = 'current';
      }
    } else if (!p.is_active) {
      session_scope = 'archive';
    }

    return {
      ...p,
      school_id: resolvedSchoolId,
      school_name: resolvedSchoolName,
      session_scope,
    };
  });

  // Complete per-school accountability summary covering EVERY school in public.schools
  // (never omitting schools with 0 students or 0 classes yet).
  const schoolsSummary = allSchools.map((s) => {
    const sClasses = allClasses.filter((c) => c.school_id === s.id);
    const sPeople = people.filter(
      (p) => p.school_id === s.id || (p.school_name && p.school_name.trim().toLowerCase() === s.name.trim().toLowerCase()),
    );
    const sStudents = sPeople.filter((p) => String(p.role || '').toLowerCase() === 'student' && p.session_scope !== 'archive');
    const sTeachers = sPeople.filter((p) => String(p.role || '').toLowerCase() === 'teacher' && p.is_active);
    const placed = sStudents.filter((p) => Boolean(p.class_from_roster)).length;
    const unplaced = Math.max(0, sStudents.length - placed);
    const published = sStudents.reduce((sum, p) => sum + (Number(p.reports_published) || 0), 0);
    const draft = sStudents.reduce((sum, p) => sum + (Number(p.reports_draft) || 0), 0);
    const emailMatched = sStudents.filter((p) => Boolean(p.has_parent_email)).length;
    const placedPct = sStudents.length > 0 ? Math.round((placed / sStudents.length) * 100) : 0;
    const reportDenom = Math.max(placed, published + draft, 1);
    const pubPct = placed > 0 ? Math.min(100, Math.round((published / reportDenom) * 100)) : 0;
    const emailPct = sStudents.length > 0 ? Math.round((emailMatched / sStudents.length) * 100) : 0;
    const healthScore = sStudents.length === 0
      ? (sClasses.length > 0 ? 50 : 0)
      : Math.min(100, Math.round(placedPct * 0.35 + pubPct * 0.35 + emailPct * 0.3));

    const gaps: string[] = [];
    if (sClasses.length === 0) gaps.push('No active classes');
    if (sStudents.length === 0) gaps.push('No current-session students');
    if (sTeachers.length === 0 && !sClasses.some((c) => c.teacher_id)) gaps.push('No teacher assigned');
    if (unplaced > 0) gaps.push(`${unplaced} unplaced`);
    if (draft > 0) gaps.push(`${draft} draft reports`);

    return {
      id: s.id,
      name: s.name,
      city: s.city,
      state: s.state,
      status: s.status,
      classes_count: sClasses.length,
      teachers_count: sTeachers.length,
      students_total: sStudents.length,
      students_placed: placed,
      students_unplaced: unplaced,
      reports_published: published,
      reports_draft: draft,
      parent_email_pct: emailPct,
      health_score: healthScore,
      gaps,
    };
  });

  const mvRoleCounts = countByRole(people);
  const liveRoleCounts = liveRoleRes.error ? null : countByRole(liveRoleRes.data ?? []);
  const liveTotal = liveRoleCounts
    ? Object.values(liveRoleCounts).reduce((a, b) => a + b, 0)
    : null;
  const dataQualityWarnings: string[] = [];
  if (backlogRes.error) dataQualityWarnings.push(`Report backlog unavailable: ${backlogRes.error.message}`);
  if (liveRoleRes.error) dataQualityWarnings.push(`Live account census unavailable: ${liveRoleRes.error.message}`);
  if (settingsRes.error) dataQualityWarnings.push('Accountability automation settings could not be read. Automatic repair is safely off.');
  if (liveTotal !== null && liveTotal !== people.length) {
    dataQualityWarnings.push(`The accountability cache contains ${people.length} people while the live account source contains ${liveTotal}. Refresh the cache before acting on totals.`);
  }
  let accountabilityAutoFix = false;
  if (!settingsRes.error && settingsRes.data?.value) {
    try {
      const configured = JSON.parse(settingsRes.data.value) as Record<string, unknown>;
      accountabilityAutoFix = configured.accountability_auto_fix_class_mismatch === true;
    } catch {
      dataQualityWarnings.push('Accountability automation settings are invalid. Automatic repair is safely off.');
    }
  }

  return NextResponse.json(
    {
      coverage: coverageData,
      people,
      schools_summary: schoolsSummary,
      backlog: backlogRes.error ? null : (backlogRes.data ?? null),
      census: {
        total: people.length,
        by_role: mvRoleCounts,
        live_total: liveTotal,
        live_by_role: liveRoleCounts,
        source: 'accountability_people_mv',
      },
      data_quality: {
        complete: dataQualityWarnings.length === 0,
        warnings: dataQualityWarnings,
        checked_at: new Date().toISOString(),
      },
      automation: {
        auto_fix_class_mismatch: accountabilityAutoFix,
      },
    },
    NO_STORE,
  );
}

export async function POST() {
  const actor = await accountabilityActor();
  if (actor.error) return actor.error;

  let db: ReturnType<typeof adminClient>;
  try {
    db = adminClient();
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Server misconfiguration' },
      { status: 500 },
    );
  }

  let refreshRes: Awaited<ReturnType<typeof db.rpc>>;
  try {
    [refreshRes] = await Promise.race([
      Promise.all([db.rpc('refresh_accountability_cache' as never)]),
      timeout(RPC_TIMEOUT_MS),
    ]);
  } catch (e) {
    await logAudit(db as any, {
      action: 'refresh_accountability_cache_failed', actorId: actor.actorId,
      resourceType: 'accountability_cache',
      newValue: e instanceof Error ? e.message : 'Refresh timed out',
    });
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Refresh timed out' },
      { status: 500 },
    );
  }

  if (refreshRes.error) {
    await logAudit(db as any, {
      action: 'refresh_accountability_cache_failed', actorId: actor.actorId,
      resourceType: 'accountability_cache', newValue: refreshRes.error.message,
    });
    return NextResponse.json({ error: refreshRes.error.message }, { status: 500 });
  }

  await logAudit(db as any, {
    action: 'refresh_accountability_cache', actorId: actor.actorId,
    resourceType: 'accountability_cache',
    newValue: 'Refreshed the central administrative accountability census',
    newValues: { refreshed_at: refreshRes.data },
  });

  return NextResponse.json({ refreshed_at: refreshRes.data }, NO_STORE);
}
