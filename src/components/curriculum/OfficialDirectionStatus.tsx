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
  /** Admin-only: when set, offers a direct "Publish this course" link from the draft-only state. */
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
 * Shows where a course's teaching content stands against the official
 * curriculum engine (course_curricula draft -> academic_curriculum_releases
 * -> school adoption). Reusable anywhere a course/release/adoption triple
 * needs to be surfaced, not just the Curriculum Guide page.
 */
export function OfficialDirectionStatus({
  loading,
  release,
  adoption,
  isSchoolScoped,
  assignHref = "/dashboard/academic/distribute",
  publishHref,
}: OfficialDirectionStatusProps) {
  if (loading) {
    return (
      <div className="animate-pulse rounded-2xl border border-border bg-card p-4 h-16" />
    );
  }

  if (!release) {
    return (
      <div className="rounded-2xl border border-border bg-card p-4 flex items-start gap-3">
        <ShieldCheckIcon className="w-5 h-5 text-muted-foreground shrink-0 mt-0.5 opacity-50" />
        <div className="min-w-0 flex-1">
          <p className="text-xs font-black uppercase tracking-widest text-muted-foreground">
            Draft only
          </p>
          <p className="text-sm text-muted-foreground mt-0.5">
            This course has no published official edition yet. Teaching plans
            can&apos;t be created for it until the Academic Office publishes
            one.
          </p>
        </div>
        {publishHref && (
          <Link
            href={publishHref}
            className="shrink-0 text-[10px] font-black uppercase tracking-widest text-primary hover:text-primary/70 transition-colors"
          >
            Review &amp; certify &rarr;
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
      <div className="rounded-2xl border border-emerald-500/25 bg-emerald-500/5 p-4 flex items-start gap-3">
        <ShieldCheckIcon className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
        <div className="min-w-0">
          <p className="text-xs font-black uppercase tracking-widest text-emerald-600 dark:text-emerald-400">
            Official curriculum source &middot; available to this school
          </p>
          <p className="text-sm font-bold text-foreground mt-0.5 truncate">
            {release.title}
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Source edition: {releaseMeta(release)}
          </p>
        </div>
      </div>
    );
  }

  if (stale) {
    return (
      <div className="rounded-2xl border border-amber-500/25 bg-amber-500/5 p-4 flex items-start gap-3">
        <ExclamationTriangleIcon className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
        <div className="min-w-0">
          <p className="text-xs font-black uppercase tracking-widest text-amber-600 dark:text-amber-400">
            Newer official edition published
          </p>
          <p className="text-sm font-bold text-foreground mt-0.5 truncate">
            {release.title}
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {releaseMeta(release)} — your school is still assigned to an earlier
            edition. Ask the Academic Office to update it.
          </p>
        </div>
      </div>
    );
  }

  if (unassigned) {
    return (
      <div className="rounded-2xl border border-amber-500/25 bg-amber-500/5 p-4 flex items-start gap-3">
        <ExclamationTriangleIcon className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
        <div className="min-w-0">
          <p className="text-xs font-black uppercase tracking-widest text-amber-600 dark:text-amber-400">
            Curriculum source published &middot; not yet available to this
            school
          </p>
          <p className="text-sm font-bold text-foreground mt-0.5 truncate">
            {release.title}
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {releaseMeta(release)} — deploying to a class will be blocked until
            the Academic Office assigns this edition to your school.
          </p>
        </div>
      </div>
    );
  }

  // Admin / no single school in scope — informational only, no assignment claim.
  return (
    <div className="rounded-2xl border border-primary/20 bg-gradient-to-br from-primary/10 to-transparent p-4 flex items-start gap-3">
      <ShieldCheckIcon className="w-5 h-5 text-primary shrink-0 mt-0.5" />
      <div className="min-w-0 flex-1">
        <p className="text-xs font-black uppercase tracking-widest text-primary">
          Official curriculum source published
        </p>
        <p className="text-sm font-bold text-foreground mt-0.5 truncate">
          {release.title}
        </p>
        <p className="text-xs text-muted-foreground mt-0.5">
          Source edition: {releaseMeta(release)}
        </p>
      </div>
      <Link
        href={assignHref}
        className="shrink-0 text-[10px] font-black uppercase tracking-widest text-primary hover:text-primary/70 transition-colors"
      >
        Check schools &rarr;
      </Link>
    </div>
  );
}
