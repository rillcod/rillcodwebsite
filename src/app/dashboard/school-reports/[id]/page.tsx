'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { use } from 'react';
import { SchoolReportWorkspace } from '@/components/school-reports/SchoolReportWorkspace';
import { useSchoolReportEditorPage } from '@/hooks/useSchoolReportEditorPage';

export default function SchoolReportEditorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const editor = useSchoolReportEditorPage(id);

  useEffect(() => {
    if (!editor.loading && editor.role === 'school' && editor.report) {
      router.replace(`/dashboard/school-reports/${id}/preview`);
    }
  }, [editor.loading, editor.report, editor.role, id, router]);

  if (editor.loading) {
    return (
      <div className="mx-auto max-w-[1600px] p-8">
        <p className="rounded-2xl border border-border p-8 text-center text-muted-foreground">Opening report…</p>
      </div>
    );
  }

  if (!editor.report) {
    return (
      <div className="mx-auto max-w-3xl space-y-4 p-8">
        <p role="alert" className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-600">
          {editor.error || 'Report not found.'}
        </p>
        <Link href="/dashboard/school-reports" className="text-sm font-black text-primary underline">
          Back to reports
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1600px] space-y-7 p-4 md:p-8">
      <header>
        <p className="text-xs font-black uppercase tracking-[0.25em] text-primary">Report editor</p>
        <h1 className="mt-2 text-2xl font-black text-foreground">{editor.report.title}</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          AI writing studio with live preview — generate, edit and publish with speed.
        </p>
      </header>

      {editor.error ? (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-600">
          <span>{editor.error}</span>
          {editor.error.includes('Reload') ? (
            <button
              type="button"
              onClick={() => void editor.reload()}
              className="rounded-lg border border-rose-500/40 px-3 py-1 text-xs font-black"
            >
              Reload report
            </button>
          ) : null}
        </div>
      ) : null}

      <SchoolReportWorkspace
        report={editor.report}
        canManage={editor.canManage}
        role={editor.role}
        editor={editor.editor}
        setEditor={editor.setEditor}
        design={editor.design}
        setDesign={editor.setDesign}
        working={editor.working}
        saveStatus={{
          isDirty: editor.isDirty,
          lastSavedAt: editor.lastSavedAt,
          autosaving: editor.autosaving,
          saveFailed: editor.saveFailed,
          offline: editor.offline,
          hasLocalDraft: editor.hasLocalDraft,
        }}
        onSave={editor.save}
        onDelete={editor.deleteReport}
        onTitleChange={editor.updateTitle}
        onRegenerate={editor.regenerate}
        onRefreshAndReady={editor.refreshAndReady}
        onEditorSynced={() => editor.markSaved({ editor: editor.editor, design: editor.design })}
        onDeliveryApplied={async () => {
          await editor.reload();
        }}
        onLockVersionChange={editor.onLockVersionChange}
        onRetrySave={editor.retrySave}
        onReload={async () => {
          await editor.reload();
        }}
        onRestoreLocalDraft={() => {
          const draft = editor.restoreLocalDraft();
          if (!draft) return;
          editor.setEditor(draft.editor);
          editor.setDesign(draft.design);
        }}
      />
    </div>
  );
}
