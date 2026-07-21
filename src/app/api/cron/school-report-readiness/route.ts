import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { extractCronSecret, isValidCronSecret } from '@/lib/server/cron-auth';
import { runMonitoredCron } from '@/lib/operations/cron-monitor';
import { termNumberFromLabel } from '@/lib/reports/academic-period';
import { runReportPreflight } from '@/lib/school-reports/preflight';
import {
  classifyReadinessStatus,
  readinessNotificationCopy,
  shouldNotifyReadiness,
} from '@/lib/school-reports/readiness-scan';
import { logAuditEvent } from '@/lib/observability/audit-events';
import { notificationsService } from '@/services/notifications.service';

export const dynamic = 'force-dynamic';

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

export async function GET(req: NextRequest) {
  return runMonitoredCron('school-report-readiness', 1440, () => handleRequest(req));
}

export async function POST(req: NextRequest) {
  return runMonitoredCron('school-report-readiness', 1440, () => handleRequest(req));
}

async function handleRequest(req: NextRequest) {
  if (!isValidCronSecret(extractCronSecret(req))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = adminClient();
  const today = new Date().toISOString().slice(0, 10);

  const { data: drafts, error: draftError } = await supabase
    .from('school_performance_reports')
    .select(
      'id,school_id,title,academic_term_id,academic_year,term_label,period_start,period_end,created_by,status,schools(name)',
    )
    .eq('status', 'draft')
    .order('updated_at', { ascending: false })
    .limit(100);

  if (draftError) {
    return NextResponse.json({ error: draftError.message }, { status: 500 });
  }

  const reportIds = (drafts ?? []).map((row: { id: string }) => row.id);
  const { data: recentLogs } = reportIds.length
    ? await supabase
        .from('school_report_readiness_log')
        .select('report_id,status,notified_at,checked_at')
        .in('report_id', reportIds)
        .gte('checked_at', `${today}T00:00:00.000Z`)
        .limit(500)
    : { data: [] };

  let scanned = 0;
  let ready = 0;
  let notified = 0;
  let blocked = 0;
  const errors: string[] = [];

  for (const report of drafts ?? []) {
    scanned += 1;
    try {
      const termNumber = parseInt(termNumberFromLabel(report.term_label), 10) || 1;
      const preflight = await runReportPreflight(supabase, {
        schoolId: report.school_id,
        academicTermId: report.academic_term_id || '',
        academicYear: report.academic_year,
        termLabel: report.term_label,
        academicTermNumber: termNumber,
        startDate: report.period_start,
        endDate: report.period_end,
      });

      const status = classifyReadinessStatus(preflight);
      if (status === 'ready') ready += 1;
      else blocked += 1;

      const { data: logRow, error: logError } = await supabase
        .from('school_report_readiness_log')
        .insert({
          report_id: report.id,
          school_id: report.school_id,
          academic_term_id: report.academic_term_id,
          status,
          payload: {
            checks: preflight.checks.map((check) => ({ key: check.key, status: check.status })),
            readyToGenerate: preflight.readyToGenerate,
          },
        })
        .select('id')
        .single();

      if (logError) {
        errors.push(`${report.id}: ${logError.message}`);
        continue;
      }

      if (
        shouldNotifyReadiness(report.id, status, recentLogs ?? []) &&
        report.created_by
      ) {
        const schoolName = (report as any).schools?.name || 'School';
        const copy = readinessNotificationCopy({
          schoolName,
          termLabel: report.term_label,
          academicYear: report.academic_year,
          reportId: report.id,
        });

        await notificationsService.logNotification(
          report.created_by,
          copy.title,
          copy.message,
          'success',
        );

        await supabase
          .from('school_report_readiness_log')
          .update({ notified_at: new Date().toISOString() })
          .eq('id', logRow.id);

        logAuditEvent('report.readiness.notify', {
          reportId: report.id,
          schoolId: report.school_id,
          userId: report.created_by,
        });

        notified += 1;
      }
    } catch (err) {
      errors.push(`${report.id}: ${err instanceof Error ? err.message : 'scan failed'}`);
    }
  }

  return NextResponse.json({
    scanned,
    ready,
    blocked,
    notified,
    errors: errors.slice(0, 20),
  });
}
