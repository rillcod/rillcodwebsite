"use client";

import {
  AcademicCapIcon,
  ArrowPathIcon,
  XMarkIcon,
} from "@/lib/icons";

export type AdoptionClassOption = {
  id: string;
  name: string;
  school_id?: string | null;
  schools?: { id: string; name: string } | null;
};

type Props = {
  open: boolean;
  classes: AdoptionClassOption[];
  courseTitle: string;
  busy: boolean;
  loading?: boolean;
  loadError?: string | null;
  actionError?: string | null;
  onClose: () => void;
  onRetryClasses: () => void;
  onAdopt: (target: AdoptionClassOption) => void;
};

export function HistoricalPlanAdoptionDialog({
  open,
  classes,
  courseTitle,
  busy,
  loading = false,
  loadError,
  actionError,
  onClose,
  onRetryClasses,
  onAdopt,
}: Props) {
  if (!open) return null;

  const bySchool = classes.reduce<
    Record<string, { name: string; classes: AdoptionClassOption[] }>
  >((groups, item) => {
    const id = item.school_id || "unassigned";
    if (!groups[id]) {
      groups[id] = {
        name: item.schools?.name || "School not labelled",
        classes: [],
      };
    }
    groups[id].classes.push(item);
    return groups;
  }, {});

  return (
    <div className="app-fixed-overlay fixed inset-0 z-[120] flex items-end justify-center bg-black/65 p-0 sm:items-center sm:p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="adopt-plan-title"
        className="max-h-[90dvh] w-full overflow-hidden rounded-t-3xl border border-border bg-card shadow-2xl sm:max-w-lg sm:rounded-3xl"
      >
        <div className="flex items-start justify-between gap-4 border-b border-border p-5">
          <div className="min-w-0">
            <p className="text-[10px] font-black uppercase tracking-widest text-primary">
              Complete the merge
            </p>
            <h2 id="adopt-plan-title" className="mt-1 text-lg font-black text-foreground">
              Move this plan into one class
            </h2>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              Choose the class teaching {courseTitle}. The same plan and its existing learning content will move into that class—no copy is created.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            aria-label="Close class selection"
            className="inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-xl border border-border text-muted-foreground hover:bg-muted disabled:opacity-50"
          >
            <XMarkIcon className="h-5 w-5" />
          </button>
        </div>

        <div className="max-h-[62dvh] space-y-4 overflow-y-auto p-5">
          <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/10 p-3 text-xs leading-5 text-emerald-800 dark:text-emerald-200">
            Lessons, slides, practice cards, assignments and projects keep their existing IDs and content. Everything is held for review before students can see it.
          </div>

          {(loadError || actionError) && (
            <div className="rounded-xl border border-rose-500/25 bg-rose-500/10 p-3 text-xs leading-5 text-rose-700 dark:text-rose-300">
              <p className="font-bold">{actionError || loadError}</p>
              {loadError && (
                <button
                  type="button"
                  onClick={onRetryClasses}
                  className="mt-2 font-black text-primary hover:underline"
                >
                  Retry class list
                </button>
              )}
            </div>
          )}

          {loading ? (
            <div className="rounded-xl border border-border bg-muted/30 px-4 py-8 text-center">
              <ArrowPathIcon className="mx-auto h-7 w-7 animate-spin text-primary" />
              <p className="mt-3 text-sm font-black text-foreground">Loading your classes…</p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                We are checking the classes you can teach this plan in.
              </p>
            </div>
          ) : Object.keys(bySchool).length === 0 && !loadError ? (
            <div className="rounded-xl border border-dashed border-border px-4 py-8 text-center">
              <AcademicCapIcon className="mx-auto h-8 w-8 text-muted-foreground/40" />
              <p className="mt-3 text-sm font-black text-foreground">No compatible class is available</p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                Create or assign the class first, then return here. This plan remains unchanged.
              </p>
            </div>
          ) : (
            Object.entries(bySchool).map(([schoolId, group]) => (
              <section key={schoolId} className="space-y-2">
                <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                  {group.name}
                </p>
                {group.classes.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => onAdopt(item)}
                    disabled={busy}
                    className="flex min-h-14 w-full items-center justify-between gap-3 rounded-xl border border-border bg-background px-4 py-3 text-left transition-colors hover:border-primary/40 hover:bg-primary/5 disabled:opacity-50"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-black text-foreground">
                        {item.name}
                      </span>
                      <span className="mt-0.5 block text-[10px] text-muted-foreground">
                        Becomes this class&apos;s single plan
                      </span>
                    </span>
                    {busy ? (
                      <ArrowPathIcon className="h-4 w-4 shrink-0 animate-spin text-primary" />
                    ) : (
                      <AcademicCapIcon className="h-4 w-4 shrink-0 text-primary" />
                    )}
                  </button>
                ))}
              </section>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
