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
    <nav aria-label="Report workflow" className="rounded-2xl border border-border bg-card px-3.5 py-2.5 flex flex-wrap items-center justify-between gap-2">
      <ol className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
        {EDITOR_WORKFLOW_STEPS.map((step) => {
          const isActive = step.key === activeStep;
          const href = stepLinks[step.key];
          const pill = (
            <span className="inline-flex items-center gap-1.5">
              <span
                className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-black ${
                  isActive
                    ? 'bg-primary text-primary-foreground'
                    : published && step.key === 'publish'
                      ? 'bg-emerald-700 text-white'
                      : 'bg-muted text-muted-foreground'
                }`}
              >
                {step.id}
              </span>
              <span className="text-xs font-black whitespace-nowrap">{step.label}</span>
            </span>
          );

          return (
            <li key={step.key} className="shrink-0">
              {href ? (
                <Link
                  href={href}
                  aria-current={isActive ? 'step' : undefined}
                  title={step.description}
                  className={`inline-flex items-center rounded-xl border px-3 py-1.5 transition-colors ${
                    isActive
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-border bg-background text-muted-foreground hover:text-foreground hover:border-primary/40'
                  }`}
                >
                  {pill}
                </Link>
              ) : (
                <div className="inline-flex items-center rounded-xl border border-border px-3 py-1.5 text-muted-foreground">
                  {pill}
                </div>
              )}
            </li>
          );
        })}
      </ol>
      <span className="text-[11px] font-bold text-muted-foreground shrink-0">
        {published ? (
          <span className="text-emerald-700 dark:text-emerald-400">Published ✓</span>
        ) : (
          'Draft — review & publish from toolbar'
        )}
      </span>
    </nav>
  );
}
