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
      <div className="h-12 animate-pulse rounded-xl border border-border bg-card" />
    );
  }

  if (!release) {
    return (
      <div className="flex items-start gap-3 rounded-xl border border-border bg-card px-4 py-3">
        <ShieldCheckIcon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground opacity-50" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-foreground">Draft · not published yet</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Classes cannot teach this until you publish it on Rollout.
          </p>
        </div>
        {publishHref && (
          <Link
            href={publishHref}
            className="shrink-0 text-xs font-bold text-primary hover:underline"
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
      <div className="flex items-start gap-3 rounded-xl border border-emerald-500/25 bg-emerald-500/5 px-4 py-3">
        <ShieldCheckIcon className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
        <div className="min-w-0">
          <p className="text-sm font-bold text-foreground">
            Published · available to this school
          </p>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">
            {releaseMeta(release)}
          </p>
        </div>
      </div>
    );
  }

  if (stale) {
    return (
      <div className="flex items-start gap-3 rounded-xl border border-amber-500/25 bg-amber-500/5 px-4 py-3">
        <ExclamationTriangleIcon className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
        <div className="min-w-0">
          <p className="text-sm font-bold text-foreground">
            Newer edition published
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {releaseMeta(release)} — this school is still on an older one.
          </p>
        </div>
      </div>
    );
  }

  if (unassigned) {
    return (
      <div className="flex items-start gap-3 rounded-xl border border-amber-500/25 bg-amber-500/5 px-4 py-3">
        <ExclamationTriangleIcon className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-foreground">
            Published · not yet with this school
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {releaseMeta(release)}
          </p>
        </div>
        <Link
          href={assignHref}
          className="shrink-0 text-xs font-bold text-primary hover:underline"
        >
          Open rollout →
        </Link>
      </div>
    );
  }

  return (
    <div className="flex items-start gap-3 rounded-xl border border-border bg-card px-4 py-3">
      <ShieldCheckIcon className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold text-foreground">Published</p>
        <p className="mt-0.5 truncate text-xs text-muted-foreground">
          {releaseMeta(release)}
        </p>
      </div>
      <Link
        href={assignHref}
        className="shrink-0 text-xs font-bold text-primary hover:underline"
      >
        Schools →
      </Link>
    </div>
  );
}
