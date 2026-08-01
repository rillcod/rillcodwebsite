"use client";

import dynamic from "next/dynamic";
import { useSearchParams, useRouter } from "next/navigation";
import { Suspense } from "react";
import { useAuth } from "@/contexts/auth-context";
import { ChatBubbleLeftRightIcon, ShieldCheckIcon } from "@/lib/icons";

const SafetyOverview = dynamic<{ embedded?: boolean }>(
  () => import("../progression/communication-safety/panel"),
  { ssr: false }
);
const SafetyCases = dynamic<{ embedded?: boolean }>(
  () => import("../progression/communication-reports/panel"),
  { ssr: false }
);

function LearnerSafetyContent() {
  const { profile, loading } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const view = searchParams.get("view") === "cases" ? "cases" : "overview";

  if (loading)
    return (
      <div className="p-8 text-sm text-muted-foreground">
        Opening Learner Safety…
      </div>
    );
  if (!profile || !["admin", "teacher"].includes(profile.role)) return null;

  return (
    <main className="min-h-screen bg-background text-foreground mobile-page-root">
      <div className="mx-auto max-w-[96rem] space-y-5 px-3 py-5 sm:px-6">
        <header className="rounded-2xl border border-border bg-card p-5 sm:p-6">
          <p className="text-xs font-black uppercase tracking-widest text-primary">
            Learner Support
          </p>
          <h1 className="mt-2 text-2xl font-black sm:text-3xl">
            Learner Safety
          </h1>
          <p className="mt-2 max-w-3xl text-sm leading-relaxed text-muted-foreground">
            Monitor communication safeguards and resolve reported concerns in
            one protected workspace.
          </p>
        </header>
        <nav
          className="grid gap-2 rounded-2xl border border-border bg-card p-3 sm:grid-cols-2"
          aria-label="Learner safety tools"
        >
          {[
            {
              id: "overview",
              label: "Safety overview",
              purpose: "Rules, monitoring and protection status",
              icon: ShieldCheckIcon,
            },
            {
              id: "cases",
              label: "Safety cases",
              purpose: "Review and resolve reported concerns",
              icon: ChatBubbleLeftRightIcon,
            },
          ].map((item) => {
            const Icon = item.icon;
            const active = view === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() =>
                  router.replace(
                    item.id === "cases"
                      ? "/dashboard/learner-safety?view=cases"
                      : "/dashboard/learner-safety",
                    { scroll: false }
                  )
                }
                aria-pressed={active}
                className={`flex items-start gap-3 rounded-xl border p-3 text-left ${
                  active
                    ? "border-primary/40 bg-primary/10"
                    : "border-border bg-background/40 hover:border-primary/30"
                }`}
              >
                <Icon
                  className={`mt-0.5 h-4 w-4 ${
                    active ? "text-primary" : "text-muted-foreground"
                  }`}
                />
                <span>
                  <span className="block text-xs font-black">{item.label}</span>
                  <span className="mt-1 block text-[11px] text-muted-foreground">
                    {item.purpose}
                  </span>
                </span>
              </button>
            );
          })}
        </nav>
        <section className="min-w-0 overflow-hidden rounded-2xl border border-border bg-background">
          {view === "cases" ? (
            <SafetyCases embedded />
          ) : (
            <SafetyOverview embedded />
          )}
        </section>
      </div>
    </main>
  );
}

export default function LearnerSafetyPage() {
  return (
    <Suspense
      fallback={
        <div className="p-8 text-sm text-muted-foreground">
          Opening Learner Safety…
        </div>
      }
    >
      <LearnerSafetyContent />
    </Suspense>
  );
}
