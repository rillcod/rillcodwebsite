'use client';

import Link from 'next/link';
import { EDITOR_WORKFLOW_STEPS, type EditorWorkflowStep } from '@/lib/school-reports/ui/workflow-steps';

export function SchoolReportWorkflowRail({
  reportId,
  activeStep,
  published,
  canManage,
}: {
  reportId: string;
  activeStep: EditorWorkflowStep;
  published: boolean;
  canManage: boolean;
}) {
  if (!canManage) return null;

  const stepLinks: Record<EditorWorkflowStep, string | null> = {
    review: `/dashboard/school-reports/${reportId}`,
    analytics: `/dashboard/school-reports/${reportId}/analytics`,
    preview: `/dashboard/school-reports/${reportId}/preview`,
    publish: `/dashboard/school-reports/${reportId}`,
  };

  return (
    <nav aria-label="Report workflow" className="rounded-2xl border border-border bg-card p-4">
      <p className="text-xs font-black uppercase tracking-[0.2em] text-primary">Guided workflow</p>
      <ol className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {EDITOR_WORKFLOW_STEPS.map((step) => {
          const isActive = step.key === activeStep;
          const href = stepLinks[step.key];
          const content = (
            <>
              <span
                className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-black ${
                  isActive
                    ? 'bg-primary text-primary-foreground'
                    : published && step.key === 'publish'
                      ? 'bg-emerald-600 text-white'
                      : 'bg-muted text-muted-foreground'
                }`}
              >
                {step.id}
              </span>
              <span>
                <span className="block text-sm font-black text-foreground">{step.label}</span>
                <span className="mt-0.5 block text-[11px] text-muted-foreground">{step.description}</span>
              </span>
            </>
          );

          return (
            <li key={step.key}>
              {href ? (
                <Link
                  href={href}
                  aria-current={isActive ? 'step' : undefined}
                  className={`flex items-start gap-3 rounded-xl border p-3 transition ${
                    isActive ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/40'
                  }`}
                >
                  {content}
                </Link>
              ) : (
                <div className="flex items-start gap-3 rounded-xl border border-border p-3">{content}</div>
              )}
            </li>
          );
        })}
      </ol>
      {published ? (
        <p className="mt-3 text-[11px] font-bold text-emerald-700 dark:text-emerald-300">Published — unlock to restart the edit cycle.</p>
      ) : (
        <p className="mt-3 text-[11px] text-muted-foreground">
          Step 8: publish from the builder toolbar when the completeness checklist passes.
        </p>
      )}
    </nav>
  );
}
