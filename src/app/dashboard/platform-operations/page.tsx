"use client";

import dynamic from "next/dynamic";
import { Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/contexts/auth-context";
import {
  ClipboardDocumentListIcon,
  Cog6ToothIcon,
  CpuChipIcon,
  DocumentTextIcon,
  ShieldCheckIcon,
} from "@/lib/icons";

const SettingsPanel = dynamic<{ embedded?: boolean; forcedTab?: string }>(
  () => import("../settings/page"),
  { ssr: false }
);
const SystemActivity = dynamic<{ embedded?: boolean }>(
  () => import("../activity-logs/page"),
  { ssr: false }
);
const SystemHealth = dynamic<{ embedded?: boolean }>(
  () => import("../progression/marker-integrity/page"),
  { ssr: false }
);

type ViewId = "lms" | "ai" | "templates" | "activity" | "health";

const VIEWS = [
  {
    id: "lms" as const,
    label: "LMS controls",
    purpose: "Learning features and platform behaviour",
    icon: Cog6ToothIcon,
  },
  {
    id: "ai" as const,
    label: "AI controls",
    purpose: "AI provider, model and safety configuration",
    icon: CpuChipIcon,
  },
  {
    id: "templates" as const,
    label: "Message templates",
    purpose: "System email wording and delivery templates",
    icon: DocumentTextIcon,
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

function PlatformOperationsContent() {
  const { profile, loading } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const requested = searchParams.get("view") as ViewId | null;
  const view = VIEWS.some((item) => item.id === requested) ? requested! : "lms";

  if (loading)
    return (
      <div className="p-8 text-sm text-muted-foreground">
        Opening Platform Operations…
      </div>
    );
  if (profile?.role !== "admin") return null;

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-[96rem] space-y-5 px-3 py-5 sm:px-6">
        <header className="rounded-2xl border border-border bg-card p-5 sm:p-6">
          <p className="text-xs font-black uppercase tracking-widest text-primary">
            Administration
          </p>
          <h1 className="mt-2 text-2xl font-black sm:text-3xl">
            Platform Operations
          </h1>
          <p className="mt-2 max-w-3xl text-sm leading-relaxed text-muted-foreground">
            One place for LMS behaviour, AI configuration, system messages,
            operational history and health checks. Personal settings remain
            under Account Settings.
          </p>
        </header>

        <nav
          className="grid gap-2 rounded-2xl border border-border bg-card p-3 sm:grid-cols-2 lg:grid-cols-5"
          aria-label="Platform operation tools"
        >
          {VIEWS.map((item) => {
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

        <section className="min-w-0 overflow-hidden rounded-2xl border border-border bg-background">
          {view === "lms" && <SettingsPanel embedded forcedTab="lms-config" />}
          {view === "ai" && <SettingsPanel embedded forcedTab="ai-config" />}
          {view === "templates" && (
            <SettingsPanel embedded forcedTab="templates" />
          )}
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
          Opening Platform Operations…
        </div>
      }
    >
      <PlatformOperationsContent />
    </Suspense>
  );
}
