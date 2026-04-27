'use client';

/**
 * PipelineStepper — single source of truth for the 5-step Content Pipeline UI.
 *
 * Flow:   1 Syllabus  →  2 Lesson Plans  →  3 Lessons  →  4 Flashcards  →  5 Library
 *
 * Context (course_id, program_id, curriculum_id) is preserved across steps via
 * query params so the user doesn't have to re-pick a course on every step.
 *
 * Mobile-first:
 *  - Horizontal scroll strip on small screens (numbered pill + label)
 *  - Expanded labels from `sm` breakpoint up
 *  - Current step has high-contrast ring + bold type
 *  - Completed steps show a subtle check; upcoming steps are muted
 */

import Link from 'next/link';
import {
  BookOpenIcon,
  ClipboardDocumentListIcon,
  SparklesIcon,
  BoltIcon,
  ArchiveBoxIcon,
  CheckCircleIcon,
} from '@/lib/icons';

export type PipelineStep = 'syllabus' | 'plans' | 'lessons' | 'flashcards' | 'library';

const ORDER: PipelineStep[] = ['syllabus', 'plans', 'lessons', 'flashcards', 'library'];

const META: Record<PipelineStep, {
  num: number;
  short: string;
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
  ring: string;
}> = {
  syllabus:   { num: 1, short: 'Syllabus',   label: 'Course & Syllabus', href: '/dashboard/curriculum',    icon: BookOpenIcon,              color: 'text-primary',  ring: 'ring-primary/40 bg-primary/10 border-primary/40'  },
  plans:      { num: 2, short: 'Plans',      label: 'Lesson Plans',      href: '/dashboard/lesson-plans',  icon: ClipboardDocumentListIcon, color: 'text-primary',  ring: 'ring-primary/40 bg-primary/10 border-primary/40'  },
  lessons:    { num: 3, short: 'Lessons',    label: 'Lessons',           href: '/dashboard/lessons',       icon: SparklesIcon,              color: 'text-emerald-400', ring: 'ring-emerald-500/40 bg-emerald-500/10 border-emerald-500/40' },
  flashcards: { num: 4, short: 'Cards',      label: 'Flashcards & CBT',  href: '/dashboard/flashcards',    icon: BoltIcon,                  color: 'text-amber-400',   ring: 'ring-amber-500/40 bg-amber-500/10 border-amber-500/40'    },
  library:    { num: 5, short: 'Library',    label: 'Content Library',   href: '/dashboard/library',       icon: ArchiveBoxIcon,            color: 'text-cyan-400',    ring: 'ring-cyan-500/40 bg-cyan-500/10 border-cyan-500/40'        },
};

export interface PipelineStepperProps {
  current: PipelineStep;
  /** Course context preserved across steps. */
  courseId?: string | null;
  /** Program context (helps scope course pickers in later steps). */
  programId?: string | null;
  /** Optional current course title shown as a context chip. */
  courseTitle?: string | null;
  /** Optional curriculum version id (from curriculum page) — lesson plans will prefill `curriculum_version_id`. */
  curriculumId?: string | null;
  /** Optional lesson-plan id, populated when navigating from Step 2 detail. */
  lessonPlanId?: string | null;
  /** Extra wrapper classes. */
  className?: string;
}

function buildHref(step: PipelineStep, p: PipelineStepperProps): string {
  const base = META[step].href;
  const q = new URLSearchParams();
  if (p.courseId) q.set('course_id', p.courseId);
  if (p.programId) q.set('program_id', p.programId);
  if (p.curriculumId) q.set('curriculum_id', p.curriculumId);
  if (p.lessonPlanId && step === 'lessons') q.set('lesson_plan_id', p.lessonPlanId);
  const qs = q.toString();
  return qs ? `${base}?${qs}` : base;
}

export default function PipelineStepper(props: PipelineStepperProps) {
  const { current, courseTitle, className = '' } = props;
  const currentIdx = ORDER.indexOf(current);

  return (
    <nav
      aria-label="Content pipeline"
      className={`w-full ${className}`}
    >
      {/* Optional course context chip */}
      {courseTitle && (
        <div className="flex items-center gap-2 mb-2 text-[10px] font-black uppercase tracking-widest">
          <span className="text-muted-foreground">Course</span>
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-muted/60 border border-border text-foreground truncate max-w-[260px]">
            <BookOpenIcon className="w-3 h-3 shrink-0" />
            <span className="truncate">{courseTitle}</span>
          </span>
        </div>
      )}

      {/* Step strip — scroll on mobile, flex-row on sm+ */}
      <ol
        className="flex items-stretch gap-1.5 overflow-x-auto snap-x snap-mandatory [-webkit-overflow-scrolling:touch] bg-card border border-border rounded-xl p-1"
        role="list"
      >
        {ORDER.map((step, idx) => {
          const meta = META[step];
          const Icon = meta.icon;
          const isCurrent = step === current;
          const isDone = idx < currentIdx;
          const isUpcoming = idx > currentIdx;

          const href = buildHref(step, props);

          const numClasses = isCurrent
            ? `bg-gradient-to-br from-white/20 to-transparent ring-2 ${meta.ring} ${meta.color}`
            : isDone
              ? 'bg-emerald-500/15 border border-emerald-500/30 text-emerald-400'
              : 'bg-muted/40 border border-border text-muted-foreground';

          const wrapperBase = 'snap-start shrink-0 flex items-center gap-2 rounded-lg px-2.5 sm:px-3 py-2 min-h-[44px] transition-all focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary';

          const content = (
            <div className="flex items-center gap-2">
              <span
                className={`w-7 h-7 shrink-0 rounded-full inline-flex items-center justify-center text-[11px] font-black ${numClasses}`}
                aria-hidden
              >
                {isDone ? <CheckCircleIcon className="w-4 h-4" /> : meta.num}
              </span>
              <span className="flex flex-col leading-tight">
                <span
                  className={`text-[10px] font-black uppercase tracking-widest ${
                    isCurrent ? meta.color : 'text-muted-foreground'
                  }`}
                >
                  Step {meta.num}
                </span>
                <span
                  className={`text-xs sm:text-sm font-bold whitespace-nowrap ${
                    isCurrent ? 'text-foreground' : isUpcoming ? 'text-muted-foreground' : 'text-foreground/80'
                  }`}
                >
                  <Icon className={`inline-block w-3.5 h-3.5 mr-1 align-[-2px] ${isCurrent ? meta.color : 'opacity-60'}`} />
                  <span className="hidden sm:inline">{meta.label}</span>
                  <span className="sm:hidden">{meta.short}</span>
                </span>
              </span>
            </div>
          );

          if (isCurrent) {
            return (
              <li key={step} className={`${wrapperBase} bg-gradient-to-b from-white/[0.04] to-transparent border border-border`} aria-current="step">
                {content}
              </li>
            );
          }

          return (
            <li key={step} className="contents">
              <Link
                href={href}
                prefetch={false}
                aria-label={`Go to Step ${meta.num}: ${meta.label}`}
                className={`${wrapperBase} ${
                  isDone
                    ? 'hover:bg-emerald-500/5'
                    : 'hover:bg-muted/40'
                } hover:border hover:border-border`}
              >
                {content}
              </Link>
            </li>
          );
        })}
      </ol>

      <p className="mt-2 text-[10px] text-muted-foreground">
        <Link
          href="/dashboard/curriculum/learning-system"
          className="inline-flex items-center gap-1 text-cyan-500/90 hover:underline font-bold"
        >
          <span className="opacity-80">Wiring</span> — how DB, QA spine, and this pipeline connect →
        </Link>
      </p>

      {/* Tiny helper line on mobile */}
      <p className="mt-1.5 text-[10px] text-muted-foreground sm:hidden">
        Swipe steps →
      </p>
    </nav>
  );
}
