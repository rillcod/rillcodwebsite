import { createHash } from 'crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { SchoolPerformanceReportRow, SchoolReportSnapshot } from './types';

type AnyClient = SupabaseClient<any>;

export type SchoolReportRevisionStatus = 'working' | 'published' | 'withdrawn';

export type SchoolReportRevisionRow = {
  id: string;
  report_id: string;
  revision_number: number;
  status: SchoolReportRevisionStatus;
  snapshot: SchoolReportSnapshot;
  narrative: SchoolPerformanceReportRow['narrative'];
  design: SchoolPerformanceReportRow['design'];
  data_sources: unknown;
  created_by: string;
  published_by: string | null;
  published_at: string | null;
  change_reason: string | null;
  pdf_hash: string | null;
  force_publish_override: {
    reason: string;
    missing: string[];
    actorId: string;
    at: string;
  } | null;
  created_at: string;
  updated_at: string;
};

export type SchoolReportEventType =
  | 'revision_created'
  | 'published'
  | 'unlocked'
  | 'force_published'
  | 'withdrawn'
  | 'regenerated'
  | 'deleted'
  | 'conflict';

export function hashReportPayload(report: Pick<SchoolPerformanceReportRow, 'snapshot' | 'narrative' | 'design'>): string {
  const payload = JSON.stringify({
    snapshot: report.snapshot,
    narrative: report.narrative,
    design: report.design ?? null,
  });
  return createHash('sha256').update(payload).digest('hex');
}

export async function recordSchoolReportEvent(
  admin: AnyClient,
  input: {
    reportId: string;
    revisionId?: string | null;
    eventType: SchoolReportEventType;
    actorId: string;
    payload?: Record<string, unknown>;
  },
): Promise<void> {
  await admin.from('school_report_events').insert({
    report_id: input.reportId,
    revision_id: input.revisionId ?? null,
    event_type: input.eventType,
    actor_id: input.actorId,
    payload: input.payload ?? {},
  });
}

export async function ensureWorkingRevision(
  admin: AnyClient,
  report: SchoolPerformanceReportRow,
  actorUserId: string,
): Promise<SchoolReportRevisionRow> {
  const workingNumber = report.working_revision_number;
  if (workingNumber) {
    const { data } = await admin
      .from('school_report_revisions')
      .select('*')
      .eq('report_id', report.id)
      .eq('revision_number', workingNumber)
      .eq('status', 'working')
      .maybeSingle();
    if (data) return data as SchoolReportRevisionRow;
  }

  const nextNumber = workingNumber ?? Math.max(1, (await maxRevisionNumber(admin, report.id)) + 1);

  const { data, error } = await admin
    .from('school_report_revisions')
    .insert({
      report_id: report.id,
      revision_number: nextNumber,
      status: 'working',
      snapshot: report.snapshot,
      narrative: report.narrative,
      design: report.design ?? null,
      data_sources: report.snapshot?.dataSources ?? null,
      created_by: actorUserId,
      change_reason: 'Working draft revision',
    })
    .select('*')
    .single();

  if (error) throw new Error(error.message);

  await admin
    .from('school_performance_reports')
    .update({ working_revision_number: nextNumber, updated_at: new Date().toISOString() })
    .eq('id', report.id);

  await recordSchoolReportEvent(admin, {
    reportId: report.id,
    revisionId: data.id,
    eventType: 'revision_created',
    actorId: actorUserId,
    payload: { revision_number: nextNumber },
  });

  return data as SchoolReportRevisionRow;
}

async function maxRevisionNumber(admin: AnyClient, reportId: string): Promise<number> {
  const { data } = await admin
    .from('school_report_revisions')
    .select('revision_number')
    .eq('report_id', reportId)
    .order('revision_number', { ascending: false })
    .limit(1)
    .maybeSingle();
  return Number(data?.revision_number) || 0;
}

/** Freeze current report content into an immutable published revision. */
export async function publishSchoolReportRevision(
  admin: AnyClient,
  report: SchoolPerformanceReportRow,
  actorUserId: string,
  opts?: {
    changeReason?: string;
    forceOverride?: { reason: string; missing: string[] };
    pdfHash?: string;
  },
): Promise<SchoolReportRevisionRow> {
  const working = await ensureWorkingRevision(admin, report, actorUserId);
  const publishedAt = new Date().toISOString();
  const pdfHash = opts?.pdfHash ?? hashReportPayload(report);

  const { data: published, error } = await admin
    .from('school_report_revisions')
    .update({
      status: 'published',
      snapshot: report.snapshot,
      narrative: report.narrative,
      design: report.design ?? null,
      data_sources: report.snapshot?.dataSources ?? null,
      published_by: actorUserId,
      published_at: publishedAt,
      change_reason: opts?.changeReason || opts?.forceOverride?.reason || 'Published to school',
      pdf_hash: pdfHash,
      force_publish_override: opts?.forceOverride
        ? {
            reason: opts.forceOverride.reason,
            missing: opts.forceOverride.missing,
            actorId: actorUserId,
            at: publishedAt,
          }
        : null,
      updated_at: publishedAt,
    })
    .eq('id', working.id)
    .eq('status', 'working')
    .select('*')
    .single();

  if (error || !published) throw new Error(error?.message || 'Unable to publish revision.');

  await admin
    .from('school_performance_reports')
    .update({
      status: 'published',
      published_at: publishedAt,
      published_by: actorUserId,
      published_revision_number: published.revision_number,
      working_revision_number: null,
      updated_at: publishedAt,
    })
    .eq('id', report.id);

  await recordSchoolReportEvent(admin, {
    reportId: report.id,
    revisionId: published.id,
    eventType: opts?.forceOverride ? 'force_published' : 'published',
    actorId: actorUserId,
    payload: {
      revision_number: published.revision_number,
      pdf_hash: pdfHash,
      ...(opts?.forceOverride
        ? { override_reason: opts.forceOverride.reason, missing: opts.forceOverride.missing }
        : {}),
    },
  });

  return published as SchoolReportRevisionRow;
}

/** Unlock a published report for editing — preserves published revision, creates new working revision. */
export async function unlockSchoolReportForEditing(
  admin: AnyClient,
  report: SchoolPerformanceReportRow,
  actorUserId: string,
  changeReason?: string,
): Promise<SchoolReportRevisionRow> {
  if (report.status !== 'published') {
    return ensureWorkingRevision(admin, report, actorUserId);
  }

  const nextNumber = (await maxRevisionNumber(admin, report.id)) + 1;
  const now = new Date().toISOString();

  const { data: working, error } = await admin
    .from('school_report_revisions')
    .insert({
      report_id: report.id,
      revision_number: nextNumber,
      status: 'working',
      snapshot: report.snapshot,
      narrative: report.narrative,
      design: report.design ?? null,
      data_sources: report.snapshot?.dataSources ?? null,
      created_by: actorUserId,
      change_reason: changeReason || 'Unlocked for editing',
    })
    .select('*')
    .single();

  if (error || !working) throw new Error(error?.message || 'Unable to create working revision.');

  await admin
    .from('school_performance_reports')
    .update({
      status: 'draft',
      published_at: null,
      published_by: null,
      working_revision_number: nextNumber,
      updated_at: now,
    })
    .eq('id', report.id);

  await recordSchoolReportEvent(admin, {
    reportId: report.id,
    revisionId: working.id,
    eventType: 'unlocked',
    actorId: actorUserId,
    payload: {
      new_working_revision: nextNumber,
      preserved_published_revision: report.published_revision_number,
      reason: changeReason || null,
    },
  });

  return working as SchoolReportRevisionRow;
}

export async function listSchoolReportRevisions(
  admin: AnyClient,
  reportId: string,
): Promise<SchoolReportRevisionRow[]> {
  const { data, error } = await admin
    .from('school_report_revisions')
    .select('*')
    .eq('report_id', reportId)
    .order('revision_number', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as SchoolReportRevisionRow[];
}

export async function getPublishedRevision(
  admin: AnyClient,
  report: Pick<SchoolPerformanceReportRow, 'id' | 'published_revision_number'>,
): Promise<SchoolReportRevisionRow | null> {
  if (!report.published_revision_number) return null;
  const { data } = await admin
    .from('school_report_revisions')
    .select('*')
    .eq('report_id', report.id)
    .eq('revision_number', report.published_revision_number)
    .eq('status', 'published')
    .maybeSingle();
  return (data as SchoolReportRevisionRow) ?? null;
}

/** Admin-only: withdraw a live publication — marks revision withdrawn and archives the report book. */
export async function withdrawSchoolReportPublication(
  admin: AnyClient,
  report: SchoolPerformanceReportRow,
  actorUserId: string,
  reason: string,
): Promise<void> {
  if (report.status !== 'published') {
    throw new Error('Only published reports can be withdrawn.');
  }
  const trimmed = reason.trim();
  if (trimmed.length < 8) {
    throw new Error('Enter a clear withdrawal reason (at least 8 characters).');
  }
  if (!report.published_revision_number) {
    throw new Error('No published revision found for this report.');
  }

  const now = new Date().toISOString();
  const { error: revisionError } = await admin
    .from('school_report_revisions')
    .update({
      status: 'withdrawn',
      change_reason: trimmed,
      updated_at: now,
    })
    .eq('report_id', report.id)
    .eq('revision_number', report.published_revision_number)
    .eq('status', 'published');

  if (revisionError) throw new Error(revisionError.message);

  const { error: reportError } = await admin
    .from('school_performance_reports')
    .update({
      status: 'archived',
      published_at: null,
      published_by: null,
      working_revision_number: null,
      updated_at: now,
      lock_version: Number(report.lock_version ?? 1) + 1,
    })
    .eq('id', report.id);

  if (reportError) throw new Error(reportError.message);

  await recordSchoolReportEvent(admin, {
    reportId: report.id,
    eventType: 'withdrawn',
    actorId: actorUserId,
    payload: {
      reason: trimmed,
      revision_number: report.published_revision_number,
    },
  });
}
