"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { CheckCircleIcon } from "@/lib/icons";
import { mergeAssetLaneHref } from "@/lib/curriculum/href";
import { LANES, stagesInLane, type LaneId, type StageId } from "@/lib/academic/lanes";

/**
 * One stepper for a lane, built from the kernel. Any page inside a lane mounts
 * this instead of writing its own stage list, so the order and wording can
 * never disagree between screens.
 */
export function LaneChrome({
  lane,
  current,
}: {
  lane: LaneId;
  current?: StageId;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const stages = stagesInLane(lane);

  const activeIndex = (() => {
    if (current) {
      const byId = stages.findIndex((s) => s.id === current);
      if (byId >= 0) return byId;
    }
    // Longest matching href wins, so /studio/schools beats /studio.
    let best = -1;
    let bestLength = -1;
    stages.forEach((s, index) => {
      const path = s.href.split("?")[0];
      if (
        (pathname === path || pathname.startsWith(`${path}/`)) &&
        path.length > bestLength
      ) {
        best = index;
        bestLength = path.length;
      }
    });
    return best;
  })();

  // The Academic home shows Overview as the start of the lane.
  // Stage pages show their step. Guide/results show nothing.
  const isOverviewHome = pathname === "/dashboard/academic";
  if (activeIndex < 0 && !isOverviewHome) return null;

  const stageHref = (href: string) =>
    lane === "asset" ? mergeAssetLaneHref(href, searchParams) : href;

  const displayIndex = isOverviewHome ? -1 : activeIndex;

  return (
    <div className="sticky top-0 z-30 border-b border-border bg-background/95 px-4 py-3 backdrop-blur sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <div className="mb-2 flex items-center justify-between gap-3">
          <p className="text-sm font-black text-foreground">
            {LANES[lane].label}
          </p>
          <p className="text-xs text-muted-foreground">
            {isOverviewHome
              ? "Start at Overview"
              : `Step ${displayIndex + 1} of ${stages.length}`}
          </p>
        </div>
        <nav aria-label={`${LANES[lane].label} stages`} className="overflow-x-auto">
          <ol className="flex min-w-max items-center gap-2" role="list">
            <li>
              <Link
                href="/dashboard/academic"
                aria-current={isOverviewHome ? "page" : undefined}
                title="Academic Overview — start of the flow"
                className={`inline-flex min-h-11 items-center gap-2 rounded-xl border px-3 py-2 text-sm font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
                  isOverviewHome
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-card text-muted-foreground hover:bg-muted hover:text-foreground"
                }`}
              >
                <span
                  className={`flex h-6 w-6 items-center justify-center rounded-full text-xs ${
                    isOverviewHome
                      ? "bg-primary-foreground/20"
                      : "bg-muted text-muted-foreground"
                  }`}
                >
                  0
                </span>
                <span>Overview</span>
              </Link>
            </li>
            {stages.map((stage, index) => {
              const active = !isOverviewHome && index === activeIndex;
              const earlier = !isOverviewHome && activeIndex >= 0 && index < activeIndex;
              return (
                <li key={stage.id}>
                  <Link
                    href={stageHref(stage.href)}
                    aria-current={active ? "step" : undefined}
                    title={stage.purpose}
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
                        stage.step
                      )}
                    </span>
                    <span>{stage.label}</span>
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
