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

  // Guide and diagnostic pages are supporting tools, not workflow stages.
  if (pathname === "/dashboard/academic/guide") return null;

  const activeIndex = ACADEMIC_WORKFLOW.findIndex((item) => {
    if (item.id === "overview") return pathname === item.href;
    return pathname === item.href || pathname.startsWith(`${item.href}/`);
  });

  const workflowHref = (id: string, href: string) =>
    lane === "asset" && (id === "curriculum" || id === "approval")
      ? mergeAssetLaneHref(href, searchParams)
      : href;

  return (
    <div className="border-b border-border bg-background/95 px-4 py-3 sm:px-6 md:sticky md:top-0 md:z-30 md:backdrop-blur lg:px-8">
      <div className="mx-auto max-w-7xl">
        <div className="mb-2 flex items-center justify-between gap-3">
          <p className="text-sm font-black text-foreground">Academic journey</p>
          <p className="text-xs text-muted-foreground">
            {activeIndex <= 0 ? "Start here" : `Step ${activeIndex} of 4`}
          </p>
        </div>
        <nav aria-label="Academic workflow" className="overflow-x-auto">
          <ol className="flex min-w-max items-center gap-2" role="list">
            {ACADEMIC_WORKFLOW.map((item, index) => {
              const active = index === activeIndex;
              const earlier = activeIndex > index;
              return (
                <li key={item.id}>
                  <Link
                    href={workflowHref(item.id, item.href)}
                    aria-current={active ? (item.id === "overview" ? "page" : "step") : undefined}
                    title={item.purpose}
                    className={`inline-flex min-h-11 items-center gap-2 rounded-xl border px-3 py-2 text-sm font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
                      active
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border bg-card text-muted-foreground hover:bg-muted hover:text-foreground"
                    }`}
                  >
                    <span
                      className={`flex h-6 w-6 items-center justify-center rounded-full text-xs ${
                        active
                          ? "bg-primary-foreground/20"
                          : earlier
                            ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                            : "bg-muted text-muted-foreground"
                      }`}
                    >
                      {earlier ? (
                        <CheckCircleIcon className="h-4 w-4" />
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
      </div>
    </div>
  );
}
