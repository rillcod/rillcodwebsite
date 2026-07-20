'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
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

type Options = {
  reportId: string | null;
  editor: SchoolReportEditorState;
  design: SchoolReportDesignSettings;
  enabled: boolean;
  published: boolean;
};

export function useSchoolReportEditor({ reportId, editor, design, enabled, published }: Options) {
  const snapRef = useRef<SchoolReportSavedSnapshot>({
    editor,
    design: normalizeSchoolReportDesign(design),
  });
  const [isDirty, setIsDirty] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const [autosaving, setAutosaving] = useState(false);

  useEffect(() => {
    setIsDirty(false);
    setLastSavedAt(null);
  }, [reportId]);

  useEffect(() => {
    const editorDirty = !editorStatesEqual(editor, snapRef.current.editor);
    const designDirty = !designStatesEqual(design, snapRef.current.design);
    setIsDirty(editorDirty || designDirty);
  }, [editor, design]);

  const markSaved = useCallback((state: SchoolReportSavedSnapshot) => {
    snapRef.current = {
      editor: { ...state.editor },
      design: normalizeSchoolReportDesign(state.design),
    };
    setLastSavedAt(new Date());
    setIsDirty(false);
  }, []);

  const autosave = useCallback(async () => {
    if (!reportId || !enabled || published || autosaving) return;
    const editorDirty = !editorStatesEqual(editor, snapRef.current.editor);
    const designDirty = !designStatesEqual(design, snapRef.current.design);
    if (!editorDirty && !designDirty) return;
    setAutosaving(true);
    try {
      const response = await fetch(`/api/school-performance-reports/${reportId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          narrative: narrativeFromEditor(editor),
          design: normalizeSchoolReportDesign(design),
          autosave: true,
        }),
      });
      if (!response.ok) return;
      markSaved({ editor, design });
    } finally {
      setAutosaving(false);
    }
  }, [autosaving, design, editor, enabled, markSaved, published, reportId]);

  useEffect(() => {
    if (!enabled || published || !isDirty) return;
    const timer = window.setTimeout(() => {
      void autosave();
    }, 8000);
    return () => window.clearTimeout(timer);
  }, [autosave, enabled, isDirty, published, editor, design]);

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
