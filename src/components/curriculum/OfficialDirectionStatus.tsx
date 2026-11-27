"use client";

import Link from "next/link";
import { ShieldCheckIcon, ExclamationTriangleIcon } from "@/lib/icons";

const TERM_LABEL: Record<number, string> = {
  1: "First Term",
  2: "Second Term",
  3: "Third Term",
};

export type OfficialRelease = {
  id: string;
  title: string;
  release_number: number | null;
  change_summary: string | null;
  published_at: string | null;
  academic_session: string | null;
  effective_term_number: number | null;
  audience_label?: string | null;
  grade_key?: string | null;
};

export type OfficialAdoption = {
  id: string;
  release_id: string;
  academic_session: string | null;
  effective_term_number: number | null;
};

interface OfficialDirectionStatusProps {
  loading: boolean;
  release: OfficialRelease | null;
  adoption: OfficialAdoption | null;
  isSchoolScoped: boolean;
  assignHref?: string;
  /** Admin-only: when set, offers a direct publish link from the draft-only state. */
  publishHref?: string;
}

function releaseMeta(release: OfficialRelease) {
  const parts: string[] = [];
  if (release.release_number) parts.push(`Edition ${release.release_number}`);
  if (release.academic_session) {
    const term = release.effective_term_number
      ? TERM_LABEL[release.effective_term_number] ??
        `Term ${release.effective_term_number}`
      : null;
    parts.push(
      term ? `${term} ${release.academic_session}` : release.academic_session
    );
  }
  if (release.published_at) {
    parts.push(
      `Published ${new Date(release.published_at).toLocaleDateString()}`
    );
  }
  return parts.join(" · ");
}

/**
 * One quiet status line for a course: draft, published, or needs attention.
 */
export function OfficialDirectionStatus({
  loading,
  release,
  adoption,
  isSchoolScoped,
  assignHref = "/dashboard/academic/rollout",
  publishHref,
}: OfficialDirectionStatusProps) {
  if (loading) {
    return (
      <div className="h-9 animate-pulse rounded-xl border border-border bg-muted/40" />
    );
  }

  if (!release) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-muted/30 px-3.5 py-2 text-xs">
        <div className="flex items-center gap-2 min-w-0">
          <ShieldCheckIcon className="h-4 w-4 shrink-0 text-muted-foreground opacity-60" />
          <span className="font-bold text-foreground">Draft · not published yet</span>
          <span className="hidden sm:inline text-muted-foreground">
            — publish on Rollout before classes can teach it
          </span>
        </div>
        {publishHref && (
          <Link
            href={publishHref}
            className="shrink-0 font-bold text-primary hover:underline"
          >
            Publish →
          </Link>
        )}
      </div>
    );
  }

  const assigned = isSchoolScoped && adoption?.release_id === release.id;
  const stale =
    isSchoolScoped && !!adoption && adoption.release_id !== release.id;
  const unassigned = isSchoolScoped && !adoption;

  if (assigned) {
    return (
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-emerald-500/25 bg-emerald-500/5 px-3.5 py-2 text-xs">
        <ShieldCheckIcon className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
        <span className="font-bold text-foreground">Published · active for this school</span>
        <span className="truncate text-muted-foreground">· {releaseMeta(release)}</span>
      </div>
    );
  }

  if (stale) {
    return (
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-amber-500/25 bg-amber-500/5 px-3.5 py-2 text-xs">
        <ExclamationTriangleIcon className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
        <span className="font-bold text-foreground">Newer edition published</span>
        <span className="text-muted-foreground">
          · {releaseMeta(release)} — school stays on its current version until updated
        </span>
      </div>
    );
  }

  if (unassigned) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-500/25 bg-amber-500/5 px-3.5 py-2 text-xs">
        <div className="flex items-center gap-2 min-w-0">
          <ExclamationTriangleIcon className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
          <span className="font-bold text-foreground">Published · not yet assigned to this school</span>
          <span className="hidden sm:inline truncate text-muted-foreground">· {releaseMeta(release)}</span>
        </div>
        <Link
          href={assignHref}
          className="shrink-0 font-bold text-primary hover:underline"
        >
          Open rollout →
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-emerald-500/25 bg-emerald-500/5 px-3.5 py-2 text-xs">
      <div className="flex items-center gap-2 min-w-0">
        <ShieldCheckIcon className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
        <span className="font-bold text-foreground">Published</span>
        <span className="truncate text-muted-foreground">· {releaseMeta(release)}</span>
      </div>
      <Link
        href={assignHref}
        className="shrink-0 font-bold text-primary hover:underline"
      >
        Rollout →
      </Link>
    </div>
  );
}
