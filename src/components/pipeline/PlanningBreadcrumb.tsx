'use client';

/**
 * PlanningBreadcrumb
 * ──────────────────
 * A compact, mobile-responsive trio-nav that appears at the top of each of the
 * three core planning pages (Course Syllabus, Lesson Plans, Term Progression).
 *
 * It shows:
 *   • A coloured pill for the current page (active)
 *   • Clickable links for the other two pages
 *   • Optional course/plan context chips when known
 *
 * The PipelineStepper is the full 6-step workflow bar used on detail views;
 * this component is the lightweight "trio" used on the list/overview pages.
 */

import Link from 'next/link';
import {
  BookOpenIcon,
  DocumentTextIcon,
  RocketLaunchIcon,
  ChevronRightIcon,
} from '@/lib/icons';

export type PlanningPage = 'syllabus' | 'lesson-plans' | 'progression';

const PAGES: Record<
  PlanningPage,
  { label: string; short: string; href: string; icon: React.ComponentType<{ className?: string }>; color: string; bg: string; border: string }
> = {
  'syllabus': {
    label:  'Course Syllabus',
    short:  'Syllabus',
    href:   '/dashboard/curriculum',
    icon:   BookOpenIcon,
    color:  'text-primary',
    bg:     'bg-primary/10',
    border: 'border-primary/30',
  },
  'lesson-plans': {
    label:  'Lesson Plans',
    short:  'Plans',
    href:   '/dashboard/lesson-plans',
    icon:   DocumentTextIcon,
    color:  'text-violet-400',
    bg:     'bg-violet-500/10',
    border: 'border-violet-500/30',
  },
  'progression': {
    label:  'Term Progression',
    short:  'Progression',
    href:   '/dashboard/progression',
    icon:   RocketLaunchIcon,
    color:  'text-emerald-400',
    bg:     'bg-emerald-500/10',
    border: 'border-emerald-500/30',
  },
};

const ORDER: PlanningPage[] = ['syllabus', 'lesson-plans', 'progression'];

interface PlanningBreadcrumbProps {
  current: PlanningPage;
  /** Extra CSS classes for the wrapper */
  className?: string;
}

export default function PlanningBreadcrumb({ current, className = '' }: PlanningBreadcrumbProps) {
  return (
    <nav
      aria-label="Planning navigation"
      className={`flex items-center gap-1.5 flex-wrap ${className}`}
    >
      {ORDER.map((page, idx) => {
        const meta = PAGES[page];
        const Icon = meta.icon;
        const isActive = page === current;
        const isLast = idx === ORDER.length - 1;

        return (
          <div key={page} className="flex items-center gap-1.5">
            {isActive ? (
              /* Active — filled pill, not clickable */
              <span
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-[11px] font-black uppercase tracking-widest ${meta.bg} ${meta.border} ${meta.color} shadow-sm`}
                aria-current="page"
              >
                <Icon className="w-3.5 h-3.5 shrink-0" />
                {/* Full label on md+, short on mobile */}
                <span className="hidden sm:inline">{meta.label}</span>
                <span className="sm:hidden">{meta.short}</span>
              </span>
            ) : (
              /* Inactive — ghost link */
              <Link
                href={meta.href}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-border text-[11px] font-black uppercase tracking-widest text-muted-foreground hover:text-foreground hover:border-border/80 hover:bg-muted/30 transition-all"
              >
                <Icon className="w-3.5 h-3.5 shrink-0 opacity-60" />
                <span className="hidden sm:inline">{meta.label}</span>
                <span className="sm:hidden">{meta.short}</span>
              </Link>
            )}

            {/* Chevron separator (not after the last item) */}
            {!isLast && (
              <ChevronRightIcon className="w-3 h-3 text-muted-foreground/40 shrink-0" />
            )}
          </div>
        );
      })}
    </nav>
  );
}
