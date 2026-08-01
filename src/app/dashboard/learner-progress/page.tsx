"use client";

import dynamic from "next/dynamic";
import { Suspense, type ComponentType } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/contexts/auth-context";
import MobilePageHero from "@/components/mobile/MobilePageHero";
import MobileScrollStrip from "@/components/mobile/MobileScrollStrip";
import { MOBILE_PAGE_BOTTOM } from "@/components/mobile/mobile-styles";
import {
  ArrowTrendingUpIcon,
  BookOpenIcon,
  ChartBarIcon,
  ClipboardDocumentListIcon,
  Cog6ToothIcon,
  PresentationChartLineIcon,
  RocketLaunchIcon,
} from "@/lib/icons";

const LearnerOverview = dynamic<{ embedded?: boolean }>(
  () => import("../progress/panel"),
  { ssr: false }
);
const TeachingCoverage = dynamic<{ embedded?: boolean }>(
  () => import("../academic/build/progress/panel"),
  { ssr: false }
);
const PromotionDecisions = dynamic<{ embedded?: boolean }>(
  () => import("../progression/panel"),
  { ssr: false }
);
const LearningInsights = dynamic<{ embedded?: boolean }>(
  () => import("../progression/analytics/panel"),
  { ssr: false }
);
const ProjectsAndActivities = dynamic<{ embedded?: boolean }>(
  () => import("../progression/project-registry/panel"),
  { ssr: false }
);
const AcademicChangeHistory = dynamic<{ embedded?: boolean }>(
  () => import("../progression/audit/panel"),
  { ssr: false }
);
const AcademicSettings = dynamic<{ embedded?: boolean; forcedTab?: string }>(
  () => import("../settings/panel"),
  { ssr: false }
);

type ViewId =
  | "overview"
  | "delivery"
  | "decisions"
  | "insights"
  | "projects"
  | "history"
  | "rules"
  | "templates";

const VIEWS = [
  {
    id: "overview" as const,
    label: "Learner overview",
    purpose: "Scores, submissions and current evidence",
    icon: ChartBarIcon,
    roles: ["admin", "teacher", "school"],
  },
  {
    id: "delivery" as const,
    label: "Teaching coverage",
    purpose: "What was planned, taught, missed or moved",
    icon: PresentationChartLineIcon,
    roles: ["admin", "teacher", "school"],
  },
  {
    id: "decisions" as const,
    label: "Promotion decisions",
    purpose: "End-of-term advance, repeat or complete",
    icon: RocketLaunchIcon,
    roles: ["admin", "teacher"],
  },
  {
    id: "insights" as const,
    label: "Learning insights",
    purpose: "Patterns and topics needing attention",
    icon: ArrowTrendingUpIcon,
    roles: ["admin", "teacher"],
  },
  {
    id: "projects" as const,
    label: "Projects & activities",
    purpose: "Practical evidence of learning",
    icon: BookOpenIcon,
    roles: ["admin", "teacher"],
  },
  {
    id: "history" as const,
    label: "Change history",
    purpose: "Who changed academic records and rules",
    icon: ClipboardDocumentListIcon,
    roles: ["admin"],
  },
  {
    id: "rules" as const,
    label: "Academic rules",
    purpose: "Term, promotion and delivery settings",
    icon: Cog6ToothIcon,
    roles: ["admin", "teacher"],
  },
  {
    id: "templates" as const,
    label: "Teaching templates",
    purpose: "Reusable teaching patterns and materials",
    icon: BookOpenIcon,
    roles: ["admin", "teacher"],
  },
];

const PANELS: Record<ViewId, ComponentType<{ embedded?: boolean }>> = {
  overview: LearnerOverview,
  delivery: TeachingCoverage,
  decisions: PromotionDecisions,
  insights: LearningInsights,
  projects: ProjectsAndActivities,
  history: AcademicChangeHistory,
  rules: AcademicSettings,
  templates: AcademicSettings,
};

function LearnerProgressOfficePageContent() {
  const { profile, loading } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const role = profile?.role ?? "";
  const available = VIEWS.filter((view) => view.roles.includes(role));
  const requested = searchParams.get("view") as ViewId | null;
  const active = available.some((view) => view.id === requested)
    ? requested!
    : available[0]?.id ?? "overview";
  const ActivePanel = PANELS[active];

  if (loading)
    return (
      <div className="p-8 text-sm text-muted-foreground">
        Opening Learner Progress…
      </div>
    );
  if (!profile || available.length === 0) return null;

  function choose(view: ViewId) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("view", view);
    if (view === "rules") params.set("tab", "academic-rules");
    else params.delete("tab");
    router.replace(`/dashboard/learner-progress?${params.toString()}`, {
      scroll: false,
    });
  }

  return (
    <main className={`min-h-screen bg-background text-foreground ${MOBILE_PAGE_BOTTOM}`}>
      <div className="mx-auto max-w-[96rem] space-y-4 px-3 py-4 sm:space-y-5 sm:px-6 sm:py-5">
        <MobilePageHero
          badge="Academic Office"
          title="Learner Progress"
          description="One flow from teaching evidence to learner outcomes and term decisions."
          icon={ChartBarIcon}
        >
          <ol
            className="mt-4 hidden gap-2 text-xs sm:grid sm:grid-cols-5"
            aria-label="Academic progress flow"
          >
            {[
              "Plan teaching",
              "Record delivery",
              "Collect learner evidence",
              "Review progress",
              "Decide & report",
            ].map((step, index) => (
              <li
                key={step}
                className="flex items-center gap-2 rounded-xl border border-border bg-background/50 px-3 py-2"
              >
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 font-black text-primary">
                  {index + 1}
                </span>
                <span className="font-bold">{step}</span>
              </li>
            ))}
          </ol>
        </MobilePageHero>

        {/* Mobile: thumb-friendly horizontal strip */}
        <MobileScrollStrip
          label="Choose view"
          ariaLabel="Learner Progress views"
          items={available.map((view) => ({
            id: view.id,
            label: view.label,
            hint: view.purpose,
            icon: view.icon,
            selected: view.id === active,
            onClick: () => choose(view.id),
          }))}
        />

        {/* Desktop: grid picker */}
        <section
          className="hidden rounded-2xl border border-border bg-card p-3 sm:p-4 md:block"
          aria-label="Learner Progress tools"
        >
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {available.map((view) => {
              const Icon = view.icon;
              const selected = view.id === active;
              return (
                <button
                  key={view.id}
                  type="button"
                  onClick={() => choose(view.id)}
                  aria-pressed={selected}
                  className={`flex items-start gap-3 rounded-xl border p-3 text-left transition-colors ${
                    selected
                      ? "border-primary/40 bg-primary/10"
                      : "border-border bg-background/40 hover:border-primary/30 hover:bg-muted/40"
                  }`}
                >
                  <span
                    className={`rounded-lg p-2 ${
                      selected
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-muted-foreground"
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                  </span>
                  <span>
                    <span className="block text-xs font-black text-foreground">
                      {view.label}
                    </span>
                    <span className="mt-1 block text-[11px] leading-snug text-muted-foreground">
                      {view.purpose}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        </section>

        <section
          className="min-w-0 overflow-hidden rounded-2xl border border-border bg-background"
          aria-live="polite"
        >
          {active === "rules" ? (
            <AcademicSettings embedded forcedTab="academic-rules" />
          ) : active === "templates" ? (
            <AcademicSettings embedded forcedTab="teaching-templates" />
          ) : (
            <ActivePanel embedded />
          )}
        </section>
      </div>
    </main>
  );
}

export default function LearnerProgressOfficePage() {
  return (
    <Suspense
      fallback={
        <div className="p-8 text-sm text-muted-foreground">
          Opening Learner Progress…
        </div>
      }
    >
      <LearnerProgressOfficePageContent />
    </Suspense>
  );
}
