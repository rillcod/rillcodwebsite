'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchWithTimeoutOrThrow } from '@/lib/async-timeout';
import { hasUnsavedReportChanges } from '@/lib/school-reports/editor-save-state';
import { designStatesEqual, normalizeSchoolReportDesign, type SchoolReportDesignSettings } from '@/lib/school-reports/design';
import {
  editorStatesEqual,
  narrativeFromEditor,
  type SchoolReportEditorState,
} from '@/lib/school-reports/editor-state';

export type SchoolReportSavedSnapshot = {
  editor: SchoolReportEditorState;
  design: SchoolReportDesignSettings;
};

type LocalDraft = SchoolReportSavedSnapshot & {
  savedAt: string;
  lockVersion: number;
};

type Options = {
  reportId: string | null;
  editor: SchoolReportEditorState;
  design: SchoolReportDesignSettings;
  enabled: boolean;
  published: boolean;
  lockVersion: number;
  /** Changes only when a fresh server representation has been loaded. */
  baselineVersion: string | null;
  onLockVersionChange?: (next: number) => void;
  onSaveFailed?: (message: string) => void;
  onConflict?: (serverLock: number, message: string) => void;
};

const draftKey = (reportId: string) => `school-report-draft:${reportId}`;

function readLocalDraft(reportId: string): LocalDraft | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(draftKey(reportId));
    if (!raw) return null;
    return JSON.parse(raw) as LocalDraft;
  } catch {
    return null;
  }
}

function writeLocalDraft(reportId: string, draft: LocalDraft) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(draftKey(reportId), JSON.stringify(draft));
  } catch {
    // Storage full or blocked — ignore.
  }
}

function clearLocalDraft(reportId: string) {
  if (typeof window === 'undefined') return;
  try { window.localStorage.removeItem(draftKey(reportId)); } catch { /* Storage may be blocked. */ }
}

export function useSchoolReportEditor({
  reportId,
  editor,
  design,
  enabled,
  published,
  lockVersion,
  baselineVersion,
  onLockVersionChange,
  onSaveFailed,
  onConflict,
}: Options) {
  const snapRef = useRef<SchoolReportSavedSnapshot>({
    editor,
    design: normalizeSchoolReportDesign(design),
  });
  const baselineVersionRef = useRef<string | null>(null);
  const currentRef = useRef({ reportId, editor, design, lockVersion });
  currentRef.current = { reportId, editor, design, lockVersion };
  const savingRef = useRef(false);
  const [isDirty, setIsDirty] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const [autosaving, setAutosaving] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);
  const [offline, setOffline] = useState(false);
  const [hasLocalDraft, setHasLocalDraft] = useState(false);

  useEffect(() => {
    setIsDirty(false);
    setLastSavedAt(null);
    setSaveFailed(false);
    setHasLocalDraft(false);
    if (reportId) setHasLocalDraft(Boolean(readLocalDraft(reportId)));
  }, [reportId]);

  useEffect(() => {
    if (!reportId || !baselineVersion || baselineVersionRef.current === baselineVersion) return;
    baselineVersionRef.current = baselineVersion;
    snapRef.current = {
      editor: { ...editor },
      design: normalizeSchoolReportDesign(design),
    };
    setIsDirty(false);
    setSaveFailed(false);
  }, [baselineVersion, design, editor, reportId]);

  useEffect(() => {
    const editorDirty = !editorStatesEqual(editor, snapRef.current.editor);
    const designDirty = !designStatesEqual(design, snapRef.current.design);
    setIsDirty(editorDirty || designDirty);
  }, [editor, design]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const syncOnline = () => setOffline(!navigator.onLine);
    syncOnline();
    window.addEventListener('online', syncOnline);
    window.addEventListener('offline', syncOnline);
    return () => {
      window.removeEventListener('online', syncOnline);
      window.removeEventListener('offline', syncOnline);
    };
  }, []);

  useEffect(() => {
    if (!reportId || !enabled || published || !isDirty) return;
    writeLocalDraft(reportId, {
      editor: { ...editor },
      design: normalizeSchoolReportDesign(design),
      savedAt: new Date().toISOString(),
      lockVersion,
    });
    setHasLocalDraft(true);
  }, [design, editor, enabled, isDirty, lockVersion, published, reportId]);

  const markSaved = useCallback((state: SchoolReportSavedSnapshot) => {
    if (currentRef.current.reportId !== reportId) return;
    snapRef.current = {
      editor: { ...state.editor },
      design: normalizeSchoolReportDesign(state.design),
    };
    setLastSavedAt(new Date());
    const changed = hasUnsavedReportChanges(currentRef.current, state);
    setIsDirty(changed);
    setSaveFailed(false);
    if (reportId) {
      if (changed) {
        writeLocalDraft(reportId, {
          editor: { ...currentRef.current.editor },
          design: normalizeSchoolReportDesign(currentRef.current.design),
          savedAt: new Date().toISOString(),
          lockVersion: currentRef.current.lockVersion,
        });
      } else {
        clearLocalDraft(reportId);
      }
      setHasLocalDraft(changed);
    }
  }, [reportId]);

  const autosave = useCallback(async () => {
    if (!reportId || !enabled || published || savingRef.current) return;
    if (offline) {
      setSaveFailed(true);
      onSaveFailed?.('Offline — changes saved locally until connection returns.');
      return;
    }
    const editorDirty = !editorStatesEqual(editor, snapRef.current.editor);
    const designDirty = !designStatesEqual(design, snapRef.current.design);
    if (!editorDirty && !designDirty) return;
    savingRef.current = true;
    setAutosaving(true);
    try {
      const response = await fetchWithTimeoutOrThrow(`/api/school-performance-reports/${reportId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          narrative: narrativeFromEditor(editor),
          design: normalizeSchoolReportDesign(design),
          autosave: true,
          expectedRevision: lockVersion,
        }),
      });
      const json = await response.json().catch(() => ({}));
      if (currentRef.current.reportId !== reportId) return;
      if (response.status === 409) {
        setSaveFailed(true);
        const message =
          json.code === 'REPORT_CONFLICT'
            ? `${json.error} Reload the report to continue.`
            : json.error || 'Conflict detected.';
        onConflict?.(Number(json.lockVersion ?? lockVersion), message);
        onSaveFailed?.(message);
        return;
      }
      if (!response.ok) {
        setSaveFailed(true);
        onSaveFailed?.(json.error || 'Autosave failed.');
        return;
      }
      if (json.lockVersion) onLockVersionChange?.(Number(json.lockVersion));
      markSaved({ editor, design });
    } catch (saveError) {
      if (currentRef.current.reportId !== reportId) return;
      setSaveFailed(true);
      onSaveFailed?.(
        saveError instanceof Error
          ? `Autosave could not reach the server: ${saveError.message}`
          : 'Autosave could not reach the server. Your local recovery draft is safe.',
      );
    } finally {
      savingRef.current = false;
      setAutosaving(false);
    }
  }, [
    autosaving,
    design,
    editor,
    enabled,
    lockVersion,
    markSaved,
    offline,
    onConflict,
    onLockVersionChange,
    onSaveFailed,
    published,
    reportId,
  ]);

  useEffect(() => {
    if (!enabled || published || !isDirty || offline) return;
    const timer = window.setTimeout(() => {
      void autosave();
    }, 8000);
    return () => window.clearTimeout(timer);
  }, [autosave, enabled, isDirty, offline, published, editor, design]);

  useEffect(() => {
    if (!enabled || !isDirty) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [enabled, isDirty]);

  const retrySave = useCallback(async () => {
    setSaveFailed(false);
    await autosave();
  }, [autosave]);

  const restoreLocalDraft = useCallback((): LocalDraft | null => {
    if (!reportId) return null;
    return readLocalDraft(reportId);
  }, [reportId]);

  return {
    isDirty,
    lastSavedAt,
    autosaving,
    saveFailed,
    offline,
    hasLocalDraft,
    markSaved,
    retrySave,
    restoreLocalDraft,
  };
}
