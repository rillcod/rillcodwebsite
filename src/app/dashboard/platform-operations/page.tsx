"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/contexts/auth-context";
import {
  ClipboardDocumentListIcon,
  AcademicCapIcon,
  BanknotesIcon,
  BoltIcon,
  Cog6ToothIcon,
  CpuChipIcon,
  DocumentTextIcon,
  ShieldCheckIcon,
} from "@/lib/icons";

const SettingsPanel = dynamic<{ embedded?: boolean; forcedTab?: string }>(
  () => import("../settings/panel"),
  { ssr: false }
);
const SystemActivity = dynamic<{ embedded?: boolean }>(
  () => import("../activity-logs/panel"),
  { ssr: false }
);
const SystemHealth = dynamic<{ embedded?: boolean }>(
  () => import("../progression/marker-integrity/panel"),
  { ssr: false }
);

type ViewId = "lms" | "ai" | "activity" | "health";

const VIEWS = [
  {
    id: "lms" as const,
    label: "Platform behaviour",
    purpose: "App-wide learning and access defaults",
    icon: Cog6ToothIcon,
  },
  {
    id: "ai" as const,
    label: "AI provider",
    purpose: "Models, limits and safety defaults",
    icon: CpuChipIcon,
  },
  {
    id: "activity" as const,
    label: "System activity",
    purpose: "Operational events across the platform",
    icon: ClipboardDocumentListIcon,
  },
  {
    id: "health" as const,
    label: "System health",
    purpose: "Integrity checks and repair guidance",
    icon: ShieldCheckIcon,
  },
];

const CONFIGURATION_VIEWS = VIEWS.filter((item) =>
  ["lms", "ai"].includes(item.id)
);
const MONITORING_VIEWS = VIEWS.filter((item) =>
  ["activity", "health"].includes(item.id)
);

function PlatformOperationsContent() {
  const { profile, loading } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const requested = searchParams.get("view") as ViewId | null;
  const view = VIEWS.some((item) => item.id === requested) ? requested! : "lms";

  if (loading)
    return (
      <div className="p-8 text-sm text-muted-foreground">
        Opening Platform Configuration…
      </div>
    );
  if (profile?.role !== "admin") return null;

  return (
    <main className="min-h-screen bg-background text-foreground mobile-page-root">
      <div className="mx-auto max-w-[96rem] space-y-5 px-3 py-5 sm:px-6">
        <header className="rounded-2xl border border-border bg-card p-5 sm:p-6">
          <p className="text-xs font-black uppercase tracking-widest text-primary">
            Administration
          </p>
          <h1 className="mt-2 text-2xl font-black sm:text-3xl">
            Platform Configuration
          </h1>
          <p className="mt-2 max-w-3xl text-sm leading-relaxed text-muted-foreground">
            One owner for app-wide behaviour, brand and AI provider settings.
            Message templates live in Office; academic and finance rules stay with the workflows they
            govern; personal controls remain under Account Settings.
          </p>
        </header>

        <nav
          className="grid gap-2 rounded-2xl border border-border bg-card p-3 sm:grid-cols-2"
          aria-label="Platform configuration"
        >
          {CONFIGURATION_VIEWS.map((item) => {
            const Icon = item.icon;
            const active = view === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() =>
                  router.replace(
                    `/dashboard/platform-operations?view=${item.id}`,
                    {
                      scroll: false,
                    }
                  )
                }
                aria-pressed={active}
                className={`flex items-start gap-3 rounded-xl border p-3 text-left transition-colors ${
                  active
                    ? "border-primary/40 bg-primary/10"
                    : "border-border bg-background/40 hover:border-primary/30 hover:bg-muted/40"
                }`}
              >
                <Icon
                  className={`mt-0.5 h-4 w-4 shrink-0 ${
                    active ? "text-primary" : "text-muted-foreground"
                  }`}
                />
                <span>
                  <span className="block text-xs font-black">{item.label}</span>
                  <span className="mt-1 block text-[11px] leading-snug text-muted-foreground">
                    {item.purpose}
                  </span>
                </span>
              </button>
            );
          })}
        </nav>

        <details
          className="rounded-2xl border border-border bg-card"
          open={MONITORING_VIEWS.some((item) => item.id === view) || undefined}
        >
          <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-black [&::-webkit-details-marker]:hidden">
            <span>Monitoring & related rules</span>
            <span className="text-xs font-medium text-muted-foreground">
              Health, history and workflow-owned settings
            </span>
          </summary>
          <div className="grid gap-2 border-t border-border p-3 sm:grid-cols-2 lg:grid-cols-5">
            {MONITORING_VIEWS.map((item) => {
              const Icon = item.icon;
              const active = view === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() =>
                    router.replace(
                      `/dashboard/platform-operations?view=${item.id}`,
                      { scroll: false }
                    )
                  }
                  aria-pressed={active}
                  className={`flex items-start gap-3 rounded-xl border p-3 text-left transition-colors ${
                    active
                      ? "border-primary/40 bg-primary/10"
                      : "border-border bg-background/40 hover:border-primary/30 hover:bg-muted/40"
                  }`}
                >
                  <Icon className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                  <span>
                    <span className="block text-xs font-black">{item.label}</span>
                    <span className="mt-1 block text-[11px] text-muted-foreground">
                      {item.purpose}
                    </span>
                  </span>
                </button>
              );
            })}
            {[
              {
                href: "/dashboard/learner-progress?view=rules",
                label: "Academic rules",
                purpose: "Terms, progression and teaching policy",
                icon: AcademicCapIcon,
              },
              {
                href: "/dashboard/office?workspace=settings&section=automation",
                label: "Office automation",
                purpose: "Communication jobs and event controls",
                icon: BoltIcon,
              },
              {
                href: "/dashboard/office?workspace=settings&section=templates",
                label: "Message templates",
                purpose: "Wording, versions, approval and delivery evidence",
                icon: DocumentTextIcon,
              },
              {
                href: "/dashboard/finance?workspace=settings",
                label: "Finance settings",
                purpose: "Accounts, billing and reminder rules",
                icon: BanknotesIcon,
              },
            ].map((item) => {
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className="flex items-start gap-3 rounded-xl border border-border bg-background/40 p-3 text-left transition-colors hover:border-primary/30 hover:bg-muted/40"
                >
                  <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                  <span>
                    <span className="block text-xs font-black">{item.label}</span>
                    <span className="mt-1 block text-[11px] text-muted-foreground">
                      {item.purpose}
                    </span>
                  </span>
                </Link>
              );
            })}
          </div>
        </details>

        <section className="min-w-0 overflow-hidden rounded-2xl border border-border bg-background">
          {view === "lms" && <SettingsPanel embedded forcedTab="lms-config" />}
          {view === "ai" && <SettingsPanel embedded forcedTab="ai-config" />}
          {view === "activity" && <SystemActivity embedded />}
          {view === "health" && <SystemHealth embedded />}
        </section>
      </div>
    </main>
  );
}

export default function PlatformOperationsPage() {
  return (
    <Suspense
      fallback={
        <div className="p-8 text-sm text-muted-foreground">
          Opening Platform Configuration…
        </div>
      }
    >
      <PlatformOperationsContent />
    </Suspense>
  );
}
