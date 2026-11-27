"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { CheckCircleIcon } from "@/lib/icons";
import { useAuth } from "@/contexts/auth-context";
import { mergeAssetLaneHref } from "@/lib/curriculum/href";
import { canSeeAssetLaneChrome, type AcademicRole, type LaneId, type StageId } from "@/lib/academic/lanes";
import { ACADEMIC_WORKFLOW } from "@/lib/academic/object-model";

/**
 * One quiet, end-to-end path for Academic Office work. Detailed business
 * states remain in the kernel; people see only the five places they actually
 * move through. Teachers and schools enter through Classes instead.
 */
export function LaneChrome({
  lane,
  current,
}: {
  lane: LaneId;
  current?: StageId;
}) {
  const { profile, loading } = useAuth();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  if (loading) return null;
  if (lane === "asset" && !canSeeAssetLaneChrome(profile?.role as AcademicRole | undefined)) {
    return null;
  }

  // Supporting tools, settings, and diagnostic subpages have their own back-links and are not workflow stages.
  if (
    pathname === "/dashboard/academic/guide" ||
    pathname === "/dashboard/academic/pathways" ||
    pathname === "/dashboard/academic/weights" ||
    pathname.startsWith("/dashboard/academic/build/progress")
  ) {
    return null;
  }

  const activeIndex = ACADEMIC_WORKFLOW.findIndex((item) => {
    if (item.id === "overview") return pathname === item.href;
    return pathname === item.href || pathname.startsWith(`${item.href}/`);
  });

  if (activeIndex === -1) return null;

  const workflowHref = (id: string, href: string) =>
    lane === "asset" && (id === "curriculum" || id === "approval")
      ? mergeAssetLaneHref(href, searchParams)
      : href;

  return (
    <div className="border-b border-border bg-background/95 px-3 py-2 sm:px-6 md:sticky md:top-0 md:z-30 md:backdrop-blur lg:px-8 print:hidden">
      <div className="mx-auto flex max-w-[1800px] items-center justify-between gap-3">
        <nav aria-label="Academic workflow" className="min-w-0 flex-1 overflow-x-auto no-scrollbar">
          <ol className="flex min-w-max items-center gap-1.5" role="list">
            <li className="mr-1.5 hidden items-center lg:flex">
              <span className="text-[11px] font-black uppercase tracking-widest text-muted-foreground">
                Academic Office
              </span>
            </li>
            {ACADEMIC_WORKFLOW.map((item, index) => {
              const active = index === activeIndex;
              const earlier = activeIndex > index;
              return (
                <li key={item.id}>
                  <Link
                    href={workflowHref(item.id, item.href)}
                    aria-current={active ? (item.id === "overview" ? "page" : "step") : undefined}
                    title={item.purpose}
                    className={`inline-flex min-h-9 items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
                      active
                        ? "border-primary bg-primary text-primary-foreground shadow-sm"
                        : "border-border bg-card text-muted-foreground hover:bg-muted hover:text-foreground"
                    }`}
                  >
                    <span
                      className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-black ${
                        active
                          ? "bg-primary-foreground/20"
                          : earlier
                            ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                            : "bg-muted text-muted-foreground"
                      }`}
                    >
                      {earlier ? (
                        <CheckCircleIcon className="h-3.5 w-3.5" />
                      ) : (
                        item.step
                      )}
                    </span>
                    <span className="sm:hidden">{item.shortLabel}</span>
                    <span className="hidden sm:inline">{item.label}</span>
                  </Link>
                </li>
              );
            })}
          </ol>
        </nav>
        <p className="hidden shrink-0 text-[11px] font-bold text-muted-foreground md:block">
          {activeIndex <= 0 ? "Overview" : `Step ${activeIndex} of 4`}
        </p>
      </div>
    </div>
  );
}
