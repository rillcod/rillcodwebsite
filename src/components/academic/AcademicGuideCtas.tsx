"use client";

import Link from "next/link";
import { useAuth } from "@/contexts/auth-context";
import { ArrowLeftIcon, ArrowRightIcon } from "@/lib/icons";

/**
 * Guide actions follow the role. Teachers teach from classes. Admins write
 * and roll out the official curriculum. One page, two doors — never show
 * Rollout to a teacher.
 */
export function AcademicGuideHeaderBack() {
  const { profile } = useAuth();
  const isAdmin = profile?.role === "admin";
  return (
    <Link
      href={isAdmin ? "/dashboard/academic" : "/dashboard/classes"}
      className="inline-flex items-center gap-2 text-sm font-bold text-primary"
    >
      <ArrowLeftIcon className="h-4 w-4" />
      {isAdmin ? "Back to Academic Office" : "Back to My Classes"}
    </Link>
  );
}

export function AcademicGuideCtas() {
  const { profile } = useAuth();
  const isAdmin = profile?.role === "admin";

  return (
    <div className="mt-6 flex flex-wrap gap-3">
      <Link
        href="/dashboard/classes"
        className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-black text-primary-foreground"
      >
        Open My Classes <ArrowRightIcon className="h-4 w-4" />
      </Link>
      {isAdmin ? (
        <>
          <Link
            href="/dashboard/academic/build"
            className="inline-flex items-center gap-2 rounded-xl border border-border bg-card px-4 py-2.5 text-sm font-bold text-foreground"
          >
            Build curriculum
          </Link>
          <Link
            href="/dashboard/academic/rollout"
            className="inline-flex items-center gap-2 rounded-xl border border-border bg-card px-4 py-2.5 text-sm font-bold text-foreground"
          >
            Roll out / make official
          </Link>
        </>
      ) : (
        <Link
          href="/dashboard/academic/build"
          className="inline-flex items-center gap-2 rounded-xl border border-border bg-card px-4 py-2.5 text-sm font-bold text-foreground"
        >
          See official curriculum
        </Link>
      )}
    </div>
  );
}

export function AcademicGuideFooter() {
  const { profile } = useAuth();
  const isAdmin = profile?.role === "admin";

  if (!isAdmin) {
    return (
      <footer className="flex flex-col gap-3 rounded-3xl border border-border bg-card p-6 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="font-black text-foreground">Ready to teach?</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Open a class. The official weeks are already there.
          </p>
        </div>
        <Link
          href="/dashboard/classes"
          className="rounded-xl bg-primary px-4 py-3 text-center text-sm font-bold text-primary-foreground"
        >
          Open My Classes
        </Link>
      </footer>
    );
  }

  return (
    <footer className="flex flex-col gap-3 rounded-3xl border border-border bg-card p-6 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <p className="font-black text-foreground">Ready to work?</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Return to the Academic Office or manage independent learning pathways.
        </p>
      </div>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Link
          href="/dashboard/academic"
          className="rounded-xl border border-border px-4 py-3 text-center text-sm font-bold text-foreground"
        >
          Academic Office
        </Link>
        <Link
          href="/dashboard/academic/pathways"
          className="rounded-xl bg-primary px-4 py-3 text-center text-sm font-bold text-primary-foreground"
        >
          Learning pathways
        </Link>
      </div>
    </footer>
  );
}
