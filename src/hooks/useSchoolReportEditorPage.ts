'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { designFromRow } from '@/lib/school-reports/design-state';
import { DEFAULT_SCHOOL_REPORT_DESIGN, normalizeSchoolReportDesign, type SchoolReportDesignSettings } from '@/lib/school-reports/design';
import { EMPTY_EDITOR, editorFromNarrative, narrativeFromEditor, type SchoolReportEditorState } from '@/lib/school-reports/editor-state';
import type { SchoolPerformanceReportRow } from '@/lib/school-reports/types';
import { useSchoolReportEditor } from '@/hooks/useSchoolReportEditor';

export function useSchoolReportEditorPage(reportId: string, opts?: { role?: string }) {
  const router = useRouter();
  const [report, setReport] = useState<SchoolPerformanceReportRow | null>(null);
  const [editor, setEditor] = useState<SchoolReportEditorState>(EMPTY_EDITOR);
  const [design, setDesign] = useState<SchoolReportDesignSettings>(DEFAULT_SCHOOL_REPORT_DESIGN);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [working, setWorking] = useState('');
  const [error, setError] = useState('');
  const [role, setRole] = useState(opts?.role || '');
  const reportRef = useRef(report);
  reportRef.current = report;

  const canManage = role === 'admin' || role === 'teacher';

  const loadReport = useCallback(async () => {
    // Soft refresh: keep the current report painted so save/regenerate don't blank the UI.
    setError('');
    if (reportRef.current) setRefreshing(true);
    else setLoading(true);
    try {
      const response = await fetch(`/api/school-performance-reports/${reportId}`, { cache: 'no-store' });
      const json = await response.json().catch(() => ({} as Record<string, unknown>));
      if (!response.ok) throw new Error((json.error as string | undefined) || `Unable to open report (HTTP ${response.status}).`);
      const row = json.data as SchoolPerformanceReportRow;
      setReport(row);
      setRole(json.role || role);
      const nextEditor = editorFromNarrative(row.narrative);
      const nextDesign = designFromRow(row);
      setEditor(nextEditor);
      setDesign(nextDesign);
      return row;
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Unable to open report.');
      return null;
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [reportId, role]);

  useEffect(() => {
    void loadReport();
  }, [loadReport]);

  const { isDirty, lastSavedAt, autosaving, saveFailed, offline, hasLocalDraft, markSaved, retrySave, restoreLocalDraft } =
    useSchoolReportEditor({
      reportId: report?.id ?? null,
      editor,
      design,
      enabled: canManage && report?.status !== 'published',
      published: report?.status === 'published',
      lockVersion: report?.lock_version ?? 1,
      baselineVersion: report
        ? `${report.id}:${report.updated_at}:${report.lock_version ?? 1}:${report.snapshot?.snapshotVersion ?? 1}`
        : null,
      onLockVersionChange: (next) => {
        setReport((current) => (current ? { ...current, lock_version: next } : current));
      },
      onSaveFailed: (message) => setError(message),
      onConflict: (_serverLock, message) => setError(message),
    });

  const save = useCallback(
    async (saveOpts?: {
      status?: 'draft' | 'published' | 'archived';
      forcePublish?: boolean;
      forcePublishReason?: string;
      statusOnly?: boolean;
      withdrawReason?: string;
    }): Promise<{ ok: boolean; published?: boolean; lockVersion?: number }> => {
      if (!report) return { ok: false };
      const status = saveOpts?.status;
      setWorking(status || 'save');
      setError('');
      const narrative = narrativeFromEditor(editor);
      try {
        const payload: Record<string, unknown> = saveOpts?.statusOnly && status
          ? {
              status,
              expectedRevision: report.lock_version ?? 1,
              ...(saveOpts.withdrawReason ? { withdrawReason: saveOpts.withdrawReason } : {}),
            }
          : {
              narrative,
              design: normalizeSchoolReportDesign(design),
              ...(status ? { status } : {}),
              ...(saveOpts?.forcePublish ? { forcePublish: true } : {}),
              ...(saveOpts?.forcePublishReason ? { forcePublishReason: saveOpts.forcePublishReason } : {}),
              ...(saveOpts?.withdrawReason ? { withdrawReason: saveOpts.withdrawReason } : {}),
              expectedRevision: report.lock_version ?? 1,
            };
        const response = await fetch(`/api/school-performance-reports/${report.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        const json = await response.json().catch(() => ({} as Record<string, unknown>));
        if (!response.ok) {
          const missing = Array.isArray(json.missing) ? json.missing.join(', ') : '';
          if (response.status === 409 && json.code === 'REPORT_CONFLICT') {
            throw new Error(`${json.error} Reload this report to continue.`);
          }
          throw new Error(missing ? `${json.error} (${missing})` : json.error || 'Unable to save report.');
        }
        const savedLockVersion = Number(json.lockVersion || report.lock_version || 1);
        setReport((current) => (current ? { ...current, lock_version: savedLockVersion } : current));
        if (status === 'archived') {
          router.push('/dashboard/school-reports');
          return { ok: true, lockVersion: savedLockVersion };
        }
        markSaved({ editor, design });
        await loadReport();
        return { ok: true, published: status === 'published', lockVersion: savedLockVersion };
      } catch (saveError) {
        setError(saveError instanceof Error ? saveError.message : 'Unable to save report.');
        return { ok: false };
      } finally {
        setWorking('');
      }
    },
    [design, editor, loadReport, markSaved, report, router],
  );

  const updateTitle = useCallback(
    async (title: string) => {
      if (!report) return;
      const trimmed = title.trim().slice(0, 180);
      if (trimmed.length < 3) throw new Error('Enter a clear title.');
      setWorking('title');
      setError('');
      try {
        const response = await fetch(`/api/school-performance-reports/${report.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title: trimmed, expectedRevision: report.lock_version ?? 1 }),
        });
        const json = await response.json().catch(() => ({} as Record<string, unknown>));
        if (!response.ok) throw new Error((json.error as string | undefined) || `Unable to update title (HTTP ${response.status}).`);
        await loadReport();
      } finally {
        setWorking('');
      }
    },
    [loadReport, report],
  );

  const regenerate = useCallback(
    async (refreshNarrative = false) => {
      if (!report) return;
      setWorking(refreshNarrative ? 'regenerate-ai' : 'regenerate');
      setError('');
      try {
        let expectedRevision = Number(report.lock_version ?? 1);
        if (isDirty) {
          const saved = await save();
          if (!saved.ok || !saved.lockVersion) return;
          expectedRevision = saved.lockVersion;
          setWorking(refreshNarrative ? 'regenerate-ai' : 'regenerate');
        }
        const response = await fetch(`/api/school-performance-reports/${report.id}/regenerate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refreshNarrative, expectedRevision }),
        });
        const json = await response.json().catch(() => ({} as Record<string, unknown>));
        if (!response.ok) throw new Error((json.error as string | undefined) || `Unable to refresh report data (HTTP ${response.status}).`);
        await loadReport();
      } catch (regenError) {
        setError(regenError instanceof Error ? regenError.message : 'Unable to refresh report data.');
      } finally {
        setWorking('');
      }
    },
    [isDirty, loadReport, report, save],
  );

  const refreshAndReady = useCallback(async () => {
    if (!report) return;
    setWorking('refresh-ready');
    setError('');
    try {
      let expectedRevision = Number(report.lock_version ?? 1);
      if (isDirty) {
        const saved = await save();
        if (!saved.ok || !saved.lockVersion) return;
        expectedRevision = saved.lockVersion;
        setWorking('refresh-ready');
      }
      const response = await fetch(`/api/school-performance-reports/${report.id}/regenerate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshAndReady: true, expectedRevision }),
      });
      const json = await response.json().catch(() => ({} as Record<string, unknown>));
      if (!response.ok) throw new Error((json.error as string | undefined) || `Unable to refresh and prepare report (HTTP ${response.status}).`);
      await loadReport();
    } catch (regenError) {
      setError(regenError instanceof Error ? regenError.message : 'Unable to refresh and prepare report.');
    } finally {
      setWorking('');
    }
  }, [isDirty, loadReport, report, save]);

  const deleteReport = useCallback(async () => {
    if (!report) return;
    if (report.status === 'published') {
      setError('Withdraw or unlock this published report before deleting.');
      return;
    }
    if (!window.confirm(`Delete "${report.title}" permanently? This cannot be undone.`)) return;
    setWorking('delete');
    setError('');
    try {
      const response = await fetch(`/api/school-performance-reports/${report.id}`, { method: 'DELETE' });
      const json = await response.json().catch(() => ({} as Record<string, unknown>));
      if (!response.ok) throw new Error((json.error as string | undefined) || `Unable to delete report (HTTP ${response.status}).`);
      router.push('/dashboard/school-reports');
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : 'Unable to delete report.');
    } finally {
      setWorking('');
    }
  }, [report, router]);

  const withdrawPublication = useCallback(async () => {
    if (!report || role !== 'admin') return;
    const reason = window.prompt('Withdrawal reason (required, at least 8 characters):');
    if (!reason || reason.trim().length < 8) return;
    await save({ status: 'archived', statusOnly: true, withdrawReason: reason.trim() });
  }, [report, role, save]);

  return {
    report,
    role,
    canManage,
    loading,
    refreshing,
    working,
    error,
    setError,
    editor,
    setEditor,
    design,
    setDesign,
    isDirty,
    lastSavedAt,
    autosaving,
    saveFailed,
    offline,
    hasLocalDraft,
    markSaved,
    retrySave,
    restoreLocalDraft,
    save,
    updateTitle,
    regenerate,
    refreshAndReady,
    deleteReport,
    withdrawPublication,
    reload: loadReport,
    onLockVersionChange: (next: number) => {
      setReport((current) => (current ? { ...current, lock_version: next } : current));
    },
  };
}
