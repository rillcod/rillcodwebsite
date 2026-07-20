import type { SupabaseClient } from '@supabase/supabase-js';
import { chooseDutyAssignee, rankDutyCandidates, type DutyCandidate, type DutyRoutingContext, type RankedDutyCandidate } from './duty-routing';

type AnyClient = SupabaseClient<any>;

export interface DutyCapacitySnapshot {
  generatedAt: string;
  totalEligible: number;
  available: number;
  expectedActiveStaff: number;
  staffingDifference: number;
  atCapacity: number;
  primaryDuty: number;
  backupDuty: number;
  ranked: RankedDutyCandidate[];
  selected: RankedDutyCandidate | null;
  warnings: string[];
}

export async function loadDutyCapacity(
  admin: AnyClient,
  context: Omit<DutyRoutingContext, 'now'> & { now?: string } = {},
): Promise<DutyCapacitySnapshot> {
  const now = context.now || new Date().toISOString();
  const warnings: string[] = [];

  const { data: staff, error: staffError } = await admin
    .from('portal_users')
    .select('id, full_name, role, school_id, is_active, is_deleted')
    .in('role', ['admin', 'teacher'])
    .eq('is_active', true)
    .or('is_deleted.is.null,is_deleted.eq.false');
  if (staffError) throw new Error(`Unable to load active operations staff: ${staffError.message}`);

  const staffIds = (staff ?? []).map((row: any) => row.id);
  if (!staffIds.length) {
    return { generatedAt: now, totalEligible: 0, expectedActiveStaff: 8, staffingDifference: -8, available: 0, atCapacity: 0, primaryDuty: 0, backupDuty: 0, ranked: [], selected: null, warnings: ['No active administrator or teacher records are available.'] };
  }

  const nextHour = new Date(new Date(now).getTime() + 60 * 60 * 1000).toISOString();
  const [settingsResult, rotaResult, feedbackResult, casesResult, sessionsResult, schoolsResult] = await Promise.all([
    admin.from('operations_staff_settings').select('*').in('user_id', staffIds),
    admin.from('operations_duty_rota').select('*').in('staff_id', staffIds).neq('status', 'cancelled').lte('starts_at', now).gt('ends_at', now),
    admin.from('feedback').select('assigned_to, status').in('assigned_to', staffIds).in('status', ['new', 'reopened', 'in_progress']),
    admin.from('communication_cases').select('assigned_to,status').in('assigned_to', staffIds).in('status', ['open', 'reopened', 'pending_customer', 'in_progress']),
    admin.from('live_sessions').select('host_id, scheduled_at').in('host_id', staffIds).eq('status', 'scheduled').gte('scheduled_at', now).lte('scheduled_at', nextHour),
    admin.from('teacher_schools').select('teacher_id, school_id').in('teacher_id', staffIds),
  ]);

  if (casesResult.error) warnings.push('Help-request workload unavailable; feedback workload is being used.');
  if (settingsResult.error) warnings.push('Staff settings unavailable; safe defaults are being used.');
  if (rotaResult.error) warnings.push('Duty rota unavailable; class ownership and workload will decide.');
  if (feedbackResult.error) warnings.push('Active feedback workload unavailable; workload defaults to zero.');
  if (sessionsResult.error) warnings.push('Upcoming teaching schedule unavailable.');
  if (schoolsResult.error) warnings.push('Additional teacher-school scope unavailable.');

  const settingsByUser = new Map((settingsResult.data ?? []).map((row: any) => [row.user_id, row]));
  const dutiesByUser = new Map<string, any[]>();
  const adminRows = (staff ?? []).filter((row: any) => row.role === 'admin');
  const effectiveAdmin = adminRows.find((row: any) => (settingsByUser.get(row.id) as any)?.is_primary_admin === true)
    ?? [...adminRows].sort((a: any, b: any) => String(a.id).localeCompare(String(b.id)))[0];
  if (adminRows.length > 1) {
    warnings.push(`Found ${adminRows.length} admin logins; treating ${effectiveAdmin?.full_name || 'the selected primary account'} as one administrator.`);
  }
  const operationalStaff = (staff ?? []).filter((row: any) => row.role !== 'admin' || row.id === effectiveAdmin?.id);

  for (const row of rotaResult.data ?? []) {
    const list = dutiesByUser.get((row as any).staff_id) ?? [];
    list.push(row);
    dutiesByUser.set((row as any).staff_id, list);
  }
  const feedbackWorkload = new Map<string, number>();
  for (const row of feedbackResult.data ?? []) {
    if (!(row as any).assigned_to) continue;
    feedbackWorkload.set((row as any).assigned_to, (feedbackWorkload.get((row as any).assigned_to) ?? 0) + 1);
  }
  const caseWorkload = new Map<string, number>();
  for (const row of casesResult.data ?? []) {
    if (!(row as any).assigned_to) continue;
    caseWorkload.set((row as any).assigned_to, (caseWorkload.get((row as any).assigned_to) ?? 0) + 1);
  }
  const activeCases = new Map<string, number>();
  for (const staffId of staffIds) {
    activeCases.set(staffId, Math.max(feedbackWorkload.get(staffId) ?? 0, caseWorkload.get(staffId) ?? 0));
  }
  const nextSession = new Map<string, number>();
  for (const row of sessionsResult.data ?? []) {
    const minutes = Math.max(0, Math.round((new Date((row as any).scheduled_at).getTime() - new Date(now).getTime()) / 60000));
    const prior = nextSession.get((row as any).host_id);
    if (prior === undefined || minutes < prior) nextSession.set((row as any).host_id, minutes);
  }
  const schoolIds = new Map<string, string[]>();
  for (const row of schoolsResult.data ?? []) {
    const list = schoolIds.get((row as any).teacher_id) ?? [];
    list.push((row as any).school_id);
    schoolIds.set((row as any).teacher_id, list);
  }

  const candidates: DutyCandidate[] = operationalStaff.map((row: any) => {
    const setting = settingsByUser.get(row.id) as any;
    const duties = dutiesByUser.get(row.id) ?? [];
    return {
      id: row.id,
      fullName: row.full_name || row.email || 'Staff member',
      role: row.role,
      canHandleAdmin: row.id === effectiveAdmin?.id,
      schoolId: row.school_id ?? null,
      additionalSchoolIds: schoolIds.get(row.id) ?? [],
      isActive: row.is_active !== false,
      isDeleted: row.is_deleted === true,
      acceptsGeneralQueue: setting?.accepts_general_queue ?? true,
      isAvailable: setting?.is_available ?? true,
      unavailableUntil: setting?.unavailable_until ?? null,
      maxActiveCases: setting?.max_active_cases ?? 8,
      activeCases: activeCases.get(row.id) ?? 0,
      skillTags: Array.isArray(setting?.skill_tags) ? setting.skill_tags.map(String) : [],
      isPrimaryDuty: duties.some((d: any) => d.is_primary === true),
      isBackupDuty: duties.some((d: any) => d.is_primary === false),
      teachesWithinMinutes: nextSession.get(row.id) ?? null,
    };
  });

  const routingContext: DutyRoutingContext = { ...context, now };
  const ranked = rankDutyCandidates(candidates, routingContext);
  const selected = chooseDutyAssignee(candidates, routingContext);

  return {
    generatedAt: now,
    totalEligible: candidates.length,
    expectedActiveStaff: 8,
    staffingDifference: candidates.length - 8,
    available: ranked.length,
    atCapacity: ranked.filter((row) => row.atCapacity).length,
    primaryDuty: ranked.filter((row) => row.isPrimaryDuty).length,
    backupDuty: ranked.filter((row) => row.isBackupDuty).length,
    ranked,
    selected,
    warnings,
  };
}

export async function assignFeedbackOwner(admin: AnyClient, feedback: {
  id: string;
  type: string;
  user_id: string | null;
}): Promise<{ assigneeId: string | null; assignmentSaved: boolean; snapshot: DutyCapacitySnapshot }> {
  let targetSchoolId: string | null = null;
  let classOwnerId: string | null = null;
  if (feedback.user_id) {
    const { data: profile } = await admin
      .from('portal_users')
      .select('school_id, primary_teacher_id, class_id')
      .eq('id', feedback.user_id)
      .maybeSingle();
    targetSchoolId = profile?.school_id ?? null;
    classOwnerId = profile?.primary_teacher_id ?? null;
    if (!classOwnerId && profile?.class_id) {
      const { data: cls } = await admin.from('classes').select('teacher_id').eq('id', profile.class_id).maybeSingle();
      classOwnerId = cls?.teacher_id ?? null;
    }
  }

  const restrictedToAdmin = feedback.type === 'complaint';
  const snapshot = await loadDutyCapacity(admin, {
    targetSchoolId,
    classOwnerId,
    requiredSkill: restrictedToAdmin ? null : 'customer_care',
    restrictedToAdmin,
  });
  const assigneeId = snapshot.selected?.id ?? null;

  let assignmentSaved = false;
  if (assigneeId) {
    const now = new Date();
    const firstResponseHours = feedback.type === 'complaint' ? 2 : 4;
    const { error } = await admin.from('feedback').update({
      assigned_to: assigneeId,
      assigned_at: now.toISOString(),
      department: restrictedToAdmin ? 'complaints_quality' : 'customer_care',
      priority: restrictedToAdmin ? 'high' : 'normal',
      first_response_due_at: new Date(now.getTime() + firstResponseHours * 60 * 60 * 1000).toISOString(),
    }).eq('id', feedback.id);
    if (error) snapshot.warnings.push(`Feedback assignment could not be saved: ${error.message}`);
    else assignmentSaved = true;
  } else {
    snapshot.warnings.push('No eligible duty owner was available; administrator review is required.');
  }

  return { assigneeId, assignmentSaved, snapshot };
}
