'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  editorStatesEqual,
  narrativeFromEditor,
  type SchoolReportEditorState,
} from '@/lib/school-reports/editor-state';

type Options = {
  reportId: string | null;
  editor: SchoolReportEditorState;
  enabled: boolean;
  published: boolean;
};

export function useSchoolReportEditor({ reportId, editor, enabled, published }: Options) {
  const snapRef = useRef<SchoolReportEditorState>(editor);
  const [isDirty, setIsDirty] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const [autosaving, setAutosaving] = useState(false);

  useEffect(() => {
    setIsDirty(false);
    setLastSavedAt(null);
  }, [reportId]);

  useEffect(() => {
    setIsDirty(!editorStatesEqual(editor, snapRef.current));
  }, [editor]);

  const markSaved = useCallback((state: SchoolReportEditorState) => {
    snapRef.current = state;
    setLastSavedAt(new Date());
    setIsDirty(false);
  }, []);

  const autosave = useCallback(async () => {
    if (!reportId || !enabled || published || autosaving) return;
    if (editorStatesEqual(editor, snapRef.current)) return;
    setAutosaving(true);
    try {
      const response = await fetch(`/api/school-performance-reports/${reportId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ narrative: narrativeFromEditor(editor), autosave: true }),
      });
      if (!response.ok) return;
      markSaved(editor);
    } finally {
      setAutosaving(false);
    }
  }, [autosaving, editor, enabled, markSaved, published, reportId]);

  useEffect(() => {
    if (!enabled || published || !isDirty) return;
    const timer = window.setTimeout(() => {
      void autosave();
    }, 8000);
    return () => window.clearTimeout(timer);
  }, [autosave, enabled, isDirty, published, editor]);

  useEffect(() => {
    if (!enabled || !isDirty) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [enabled, isDirty]);

  return { isDirty, lastSavedAt, autosaving, markSaved };
}
