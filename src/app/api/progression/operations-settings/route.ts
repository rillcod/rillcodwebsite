import { NextRequest, NextResponse } from 'next/server';
import { createClient as createSupabase } from '@supabase/supabase-js';
import { createClient as createServerClient } from '@/lib/supabase/server';

function adminClient() {
  return createSupabase(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

type Caller = { id: string; role: string };

const SETTINGS_KEYS = [
  'lms.ops.calendar',
  'lms.ops.permissions',
  'lms.ops.approvals',
  'lms.ops.assessment',
  'lms.ops.promotion',
  'lms.ops.alerts',
  'lms.ops.communication',
  'lms.ops.integrity',
  'lms.ops.pwa',
] as const;

type SettingsKey = (typeof SETTINGS_KEYS)[number];

const DEFAULTS: Record<SettingsKey, Record<string, unknown>> = {
  'lms.ops.calendar': {
    term_lock_after_days: 7,
    grading_grace_days: 3,
    reports_lock_after_publish_days: 5,
    holidays_enabled: true,
  },
  'lms.ops.permissions': {
    teacher_can_publish_lessons: true,
    teacher_can_override_locked_progression: false,
    school_can_export_csv: true,
    grade_override_requires_reason: true,
  },
  'lms.ops.approvals': {
    lesson_publish_needs_approval: false,
    report_publish_needs_approval: true,
    promotion_needs_approval: true,
    policy_change_needs_approval: true,
  },
  'lms.ops.assessment': {
    pass_mark_pct: 50,
    retake_allowed: true,
    attendance_weight_pct: 10,
    practical_weight_pct: 30,
    theory_weight_pct: 60,
  },
  'lms.ops.promotion': {
    min_attendance_pct: 70,
    min_assessment_avg_pct: 50,
    allow_conditional_promotion: true,
    conditional_promotion_min_pct: 45,
  },
  'lms.ops.alerts': {
    inactive_student_days: 7,
    notify_parent_on_risk: true,
    notify_teacher_on_overdue_work: true,
    notify_admin_on_school_drop: true,
  },
  'lms.ops.communication': {
    parent_digest_frequency: 'weekly',
    quiet_hours_start: '21:00',
    quiet_hours_end: '06:00',
    allow_whatsapp_notifications: true,
    allow_email_notifications: true,
    whatsapp_primary_mode: true,
    allow_inapp_fallback: true,
    student_dm_daily_limit: 12,
    parent_dm_daily_limit: 20,
    cooldown_seconds_between_messages: 20,
    blocked_keywords_enabled: true,
    blocked_keywords_list: 'abuse,insult,threat,spam',
    auto_escalate_after_reports: 3,
    require_staff_assignment_for_external_wa: true,
  },
  'lms.ops.integrity': {
    weekly_integrity_scan: true,
    duplicate_marker_block: true,
    weekly_backup_export: true,
    audit_retention_days: 365,
  },
  'lms.ops.pwa': {
    force_update_banner: true,
    allow_dashboard_install_prompt: true,
    show_offline_fallback_hint: true,
    allow_manual_cache_reset: true,
  },
};

async function getCaller(): Promise<Caller | null> {
  const supabase = await createServerClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return null;
  const { data: profile } = await adminClient()
    .from('portal_users')
    .select('id, role')
    .eq('id', user.id)
    .maybeSingle();
  if (!profile || !['admin', 'teacher', 'school'].includes(profile.role ?? '')) return null;
  return profile as Caller;
}

export async function GET() {
  const caller = await getCaller();
  if (!caller) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data, error } = await adminClient()
    .from('app_settings')
    .select('key, value, updated_at')
    .in('key', [...SETTINGS_KEYS]);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const byKey = new Map((data ?? []).map((row: any) => [row.key as SettingsKey, row]));
  const payload: Record<string, Record<string, unknown>> = {};
  for (const key of SETTINGS_KEYS) {
    const row = byKey.get(key);
    if (!row) {
      payload[key] = DEFAULTS[key];
      continue;
    }
    try {
      payload[key] = { ...DEFAULTS[key], ...(JSON.parse(row.value || '{}') as Record<string, unknown>) };
    } catch {
      payload[key] = DEFAULTS[key];
    }
  }

  return NextResponse.json({ data: payload, readonly: caller.role === 'school' });
}

export async function PUT(req: NextRequest) {
  const caller = await getCaller();
  if (!caller || !['admin', 'teacher'].includes(caller.role)) {
    return NextResponse.json({ error: 'Admin/Teacher access required' }, { status: 403 });
  }

  const body = await req.json().catch(() => ({} as Record<string, unknown>));
  const settings = (body.settings ?? {}) as Record<string, Record<string, unknown>>;
  const rows = SETTINGS_KEYS
    .filter((key) => typeof settings[key] === 'object' && settings[key] !== null)
    .map((key) => ({
      key,
      value: JSON.stringify(settings[key]),
      updated_at: new Date().toISOString(),
    }));

  if (rows.length === 0) {
    return NextResponse.json({ error: 'No valid settings payload' }, { status: 400 });
  }

  const { error } = await adminClient()
    .from('app_settings')
    .upsert(rows, { onConflict: 'key' });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true });
}
