'use client';

/**
 * SyllabusPreview — the canonical read-only view of a term syllabus.
 *
 * Used by:
 *   - Students / parents / schools (when the teacher has published
 *     `course_curricula.is_visible_to_school = true`).
 *   - Teachers and admins, as a "Preview as student / parent / school"
 *     modal inside the curriculum builder so they can verify exactly
 *     what the learner sees BEFORE they publish.
 *
 * Design goals:
 *   - Mobile-first: single-column at any screen size smaller than md,
 *     no sticky desktop-only toolbars.
 *   - Zero side-effects: the component never writes. It is a pure
 *     visual projection of a `CurriculumContent` document.
 *   - Role-aware chrome: a subtle "Preview · as STUDENT" ribbon when
 *     `previewRole` is supplied.
 */

import { useMemo, useState } from 'react';
import {
  BookOpenIcon,
  ClipboardDocumentListIcon,
  DocumentTextIcon,
  SparklesIcon,
  CheckCircleIcon,
  AcademicCapIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  EyeIcon,
} from '@/lib/icons';

// ───────────────────────────────────────────────────────────────────────────
// Types (kept local so any caller can import without pulling builder code)
// ───────────────────────────────────────────────────────────────────────────

export type SyllabusWeekType = 'lesson' | 'assessment' | 'examination';

export interface SyllabusLessonPlan {
  duration_minutes?: number;
  objectives?: string[];
  teacher_activities?: string[];
  student_activities?: string[];
  classwork?: { title?: string; instructions?: string; materials?: string[] } | null;
  assignment?: { title?: string; instructions?: string; due?: string } | null;
  project?: { title?: string; description?: string; deliverables?: string[] } | null;
  resources?: string[];
  engagement_tips?: string[];
}

export interface SyllabusAssessmentPlan {
  type?: string;
  title?: string;
  coverage?: string[];
  format?: string;
  duration_minutes?: number;
  scoring_guide?: string;
  teacher_prep?: string[];
  sample_questions?: string[];
}

export interface SyllabusWeek {
  week: number;
  type: SyllabusWeekType;
  topic: string;
  subtopics?: string[];
  lesson_plan?: SyllabusLessonPlan | null;
  assessment_plan?: SyllabusAssessmentPlan | null;
}

export interface SyllabusTerm {
  term: number;
  title: string;
  objectives?: string[];
  weeks: SyllabusWeek[];
}

export interface SyllabusContent {
  course_title?: string;
  overview?: string;
  learning_outcomes?: string[];
  terms: SyllabusTerm[];
  assessment_strategy?: string;
  materials_required?: string[];
  recommended_tools?: string[];
}

export type SyllabusPreviewRole = 'student' | 'parent' | 'school';

export interface SyllabusPreviewProps {
  content: SyllabusContent;
  courseTitle?: string;
  /**
   * When provided, renders a ribbon indicating which audience this preview
   * is emulating. Staff-only UX.
   */
  previewRole?: SyllabusPreviewRole | null;
  /**
   * When true, hides teacher-only panels (teacher_activities, scoring
   * guides, prep checklists, sample questions). Students/parents never
   * need to see these even if the raw JSON contains them.
   */
  audienceIsLearner?: boolean;
  /**
   * Optional note rendered at the very top of the preview (e.g. "This
   * syllabus has not been published to learners yet").
   */
  topBanner?: React.ReactNode;
}

// ───────────────────────────────────────────────────────────────────────────

const WEEK_META: Record<
  SyllabusWeekType,
  { label: string; pill: string; icon: typeof BookOpenIcon }
> = {
  lesson: {
    label: 'Lesson',
    pill: 'text-violet-300 bg-primary/15 border-primary/30',
    icon: BookOpenIcon,
  },
  assessment: {
    label: 'Assessment',
    pill: 'text-amber-300 bg-amber-500/15 border-amber-500/30',
    icon: ClipboardDocumentListIcon,
  },
  examination: {
    label: 'Examination',
    pill: 'text-rose-300 bg-rose-500/15 border-rose-500/30',
    icon: DocumentTextIcon,
  },
};

const ROLE_LABEL: Record<SyllabusPreviewRole, string> = {
  student: 'Student',
  parent: 'Parent',
  school: 'Partner School',
};

// ───────────────────────────────────────────────────────────────────────────

export function SyllabusPreview({
  content,
  courseTitle,
  previewRole,
  audienceIsLearner = false,
  topBanner,
}: SyllabusPreviewProps) {
  const [activeTerm, setActiveTerm] = useState<number>(() => content.terms?.[0]?.term ?? 1);
  const [expandedWeek, setExpandedWeek] = useState<string | null>(null);

  const terms = useMemo(() => content.terms ?? [], [content.terms]);
  const currentTerm = useMemo(
    () => terms.find((t) => t.term === activeTerm) ?? terms[0] ?? null,
    [terms, activeTerm],
  );

  const title = content.course_title || courseTitle || 'Syllabus';

  return (
    <div className="space-y-5 sm:space-y-6 text-foreground">
      {/* Preview-as-role ribbon */}
      {previewRole && (
        <div className="rounded-md border border-sky-500/30 bg-sky-500/5 px-3 py-2 sm:px-4 sm:py-2.5 flex items-center gap-2 text-xs">
          <EyeIcon className="w-4 h-4 text-sky-400 shrink-0" />
          <span className="font-black uppercase tracking-widest text-sky-300">
            Preview · as {ROLE_LABEL[previewRole]}
          </span>
          <span className="text-muted-foreground hidden sm:inline">
            — this is exactly what {ROLE_LABEL[previewRole].toLowerCase()}s see.
          </span>
        </div>
      )}

      {topBanner}

      {/* Course overview */}
      <section className="rounded-lg border border-border bg-card/60 p-4 sm:p-5 space-y-3">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-md bg-primary/15 text-primary inline-flex items-center justify-center shrink-0">
            <AcademicCapIcon className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
              Course Syllabus
            </p>
            <h1 className="text-xl sm:text-2xl font-black italic tracking-tight truncate">
              {title}
            </h1>
          </div>
        </div>

        {content.overview && (
          <p className="text-sm leading-relaxed text-muted-foreground whitespace-pre-wrap">
            {content.overview}
          </p>
        )}

        {content.learning_outcomes && content.learning_outcomes.length > 0 && (
          <div className="space-y-2">
            <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
              What you&rsquo;ll achieve
            </p>
            <ul className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 text-sm">
              {content.learning_outcomes.map((o, i) => (
                <li key={i} className="flex items-start gap-2">
                  <CheckCircleIcon className="w-4 h-4 text-emerald-400 mt-0.5 shrink-0" />
                  <span className="text-foreground/90">{o}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      {/* Term tabs */}
      {terms.length > 1 && (
        <div className="flex gap-1.5 overflow-x-auto -mx-1 px-1 snap-x">
          {terms.map((t) => {
            const active = t.term === activeTerm;
            return (
              <button
                key={t.term}
                onClick={() => {
                  setActiveTerm(t.term);
                  setExpandedWeek(null);
                }}
                className={`snap-start shrink-0 px-3.5 py-2 rounded-full border text-[11px] font-black uppercase tracking-widest transition ${
                  active
                    ? 'bg-primary/15 border-primary/40 text-primary'
                    : 'bg-muted/20 border-border text-muted-foreground hover:bg-muted/40'
                }`}
              >
                Term {t.term}
              </button>
            );
          })}
        </div>
      )}

      {/* Term body */}
      {currentTerm && (
        <section className="space-y-4">
          <div className="rounded-lg border border-border bg-background/40 p-4 sm:p-5">
            <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
              Term {currentTerm.term}
            </p>
            <h2 className="text-base sm:text-lg font-black mt-0.5">{currentTerm.title}</h2>
            {currentTerm.objectives && currentTerm.objectives.length > 0 && (
              <ul className="mt-3 space-y-1.5 text-sm">
                {currentTerm.objectives.map((o, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <SparklesIcon className="w-4 h-4 text-primary mt-0.5 shrink-0" />
                    <span className="text-foreground/90">{o}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Weeks */}
          <ul className="space-y-2.5">
            {currentTerm.weeks.map((w) => {
              const key = `${currentTerm.term}-${w.week}`;
              const expanded = expandedWeek === key;
              const meta = WEEK_META[w.type] ?? WEEK_META.lesson;
              const Icon = meta.icon;
              return (
                <li key={key} className="rounded-lg border border-border bg-card/40 overflow-hidden">
                  <button
                    onClick={() => setExpandedWeek((prev) => (prev === key ? null : key))}
                    className="w-full flex items-start sm:items-center gap-3 px-3 py-3 sm:px-4 sm:py-3.5 text-left hover:bg-muted/10 transition"
                  >
                    {expanded ? (
                      <ChevronDownIcon className="w-4 h-4 text-primary mt-0.5 sm:mt-0 shrink-0" />
                    ) : (
                      <ChevronRightIcon className="w-4 h-4 text-muted-foreground mt-0.5 sm:mt-0 shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                          Week {w.week}
                        </span>
                        <span
                          className={`inline-flex items-center gap-1 text-[9px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded border ${meta.pill}`}
                        >
                          <Icon className="w-3 h-3" />
                          {meta.label}
                        </span>
                      </div>
                      <p className="text-sm font-black mt-0.5 truncate sm:whitespace-normal">
                        {w.topic}
                      </p>
                    </div>
                  </button>

                  {expanded && (
                    <div className="px-3 pb-4 sm:px-4 sm:pb-5 border-t border-border/60 bg-background/40 space-y-4">
                      {w.subtopics && w.subtopics.length > 0 && (
                        <div>
                          <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mt-3">
                            Subtopics
                          </p>
                          <ul className="mt-1 text-sm space-y-1">
                            {w.subtopics.map((s, i) => (
                              <li key={i} className="flex items-start gap-1.5">
                                <span className="w-1 h-1 rounded-full bg-primary mt-2 shrink-0" />
                                <span>{s}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {w.type === 'lesson' && w.lesson_plan && (
                        <LessonDetails plan={w.lesson_plan} audienceIsLearner={audienceIsLearner} />
                      )}

                      {(w.type === 'assessment' || w.type === 'examination') &&
                        w.assessment_plan && (
                          <AssessmentDetails
                            plan={w.assessment_plan}
                            audienceIsLearner={audienceIsLearner}
                          />
                        )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {/* Footer: strategy + materials + tools */}
      {(content.assessment_strategy ||
        (content.materials_required && content.materials_required.length > 0) ||
        (content.recommended_tools && content.recommended_tools.length > 0)) && (
        <section className="rounded-lg border border-border bg-card/60 p-4 sm:p-5 space-y-3">
          {content.assessment_strategy && (
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                Assessment strategy
              </p>
              <p className="text-sm text-foreground/90 mt-1 whitespace-pre-wrap">
                {content.assessment_strategy}
              </p>
            </div>
          )}
          {content.materials_required && content.materials_required.length > 0 && (
            <TagList label="Materials required" items={content.materials_required} />
          )}
          {content.recommended_tools && content.recommended_tools.length > 0 && (
            <TagList label="Recommended tools" items={content.recommended_tools} />
          )}
        </section>
      )}
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────────────

function LessonDetails({
  plan,
  audienceIsLearner,
}: {
  plan: SyllabusLessonPlan;
  audienceIsLearner: boolean;
}) {
  return (
    <div className="space-y-4 text-sm">
      {plan.objectives && plan.objectives.length > 0 && (
        <BlockList label="Learning objectives" items={plan.objectives} icon="check" />
      )}

      {plan.student_activities && plan.student_activities.length > 0 && (
        <BlockList
          label={audienceIsLearner ? 'What you will do' : 'Student activities'}
          items={plan.student_activities}
          icon="number"
        />
      )}

      {!audienceIsLearner &&
        plan.teacher_activities &&
        plan.teacher_activities.length > 0 && (
          <BlockList
            label="Teacher activities"
            items={plan.teacher_activities}
            icon="number"
            tone="muted"
          />
        )}

      {plan.classwork && (plan.classwork.title || plan.classwork.instructions) && (
        <div className="rounded-md border border-border/70 bg-background/40 p-3">
          <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
            Classwork
          </p>
          {plan.classwork.title && (
            <p className="text-sm font-black mt-0.5">{plan.classwork.title}</p>
          )}
          {plan.classwork.instructions && (
            <p className="text-sm mt-1 text-foreground/90">{plan.classwork.instructions}</p>
          )}
          {plan.classwork.materials && plan.classwork.materials.length > 0 && (
            <TagList label="Materials" items={plan.classwork.materials} compact />
          )}
        </div>
      )}

      {plan.assignment && (plan.assignment.title || plan.assignment.instructions) && (
        <div className="rounded-md border border-cyan-500/30 bg-cyan-500/5 p-3">
          <p className="text-[10px] font-black uppercase tracking-widest text-cyan-300">
            Assignment
          </p>
          {plan.assignment.title && (
            <p className="text-sm font-black mt-0.5">{plan.assignment.title}</p>
          )}
          {plan.assignment.instructions && (
            <p className="text-sm mt-1 text-foreground/90">{plan.assignment.instructions}</p>
          )}
          {plan.assignment.due && (
            <p className="text-[11px] text-muted-foreground mt-1">Due: {plan.assignment.due}</p>
          )}
        </div>
      )}

      {plan.project && (plan.project.title || plan.project.description) && (
        <div className="rounded-md border border-primary/30 bg-primary/5 p-3">
          <p className="text-[10px] font-black uppercase tracking-widest text-primary">
            Project
          </p>
          {plan.project.title && (
            <p className="text-sm font-black mt-0.5">{plan.project.title}</p>
          )}
          {plan.project.description && (
            <p className="text-sm mt-1 text-foreground/90">{plan.project.description}</p>
          )}
          {plan.project.deliverables && plan.project.deliverables.length > 0 && (
            <TagList label="Deliverables" items={plan.project.deliverables} compact />
          )}
        </div>
      )}

      {plan.resources && plan.resources.length > 0 && (
        <TagList label="Resources" items={plan.resources} />
      )}

      {!audienceIsLearner && plan.engagement_tips && plan.engagement_tips.length > 0 && (
        <BlockList
          label="Engagement tips"
          items={plan.engagement_tips}
          icon="sparkle"
          tone="muted"
        />
      )}
    </div>
  );
}

function AssessmentDetails({
  plan,
  audienceIsLearner,
}: {
  plan: SyllabusAssessmentPlan;
  audienceIsLearner: boolean;
}) {
  return (
    <div className="space-y-4 text-sm">
      {plan.title && (
        <p className="text-base font-black">{plan.title}</p>
      )}
      {plan.coverage && plan.coverage.length > 0 && (
        <TagList label="What it covers" items={plan.coverage} />
      )}
      <dl className="grid grid-cols-2 gap-3 text-xs">
        {plan.format && (
          <div>
            <dt className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
              Format
            </dt>
            <dd className="mt-0.5 text-sm">{plan.format}</dd>
          </div>
        )}
        {plan.duration_minutes && (
          <div>
            <dt className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
              Duration
            </dt>
            <dd className="mt-0.5 text-sm">{plan.duration_minutes} minutes</dd>
          </div>
        )}
      </dl>
      {!audienceIsLearner && plan.scoring_guide && (
        <div className="rounded-md border border-border/60 bg-background/40 p-3">
          <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
            Scoring guide
          </p>
          <p className="text-sm mt-0.5 text-foreground/90">{plan.scoring_guide}</p>
        </div>
      )}
      {!audienceIsLearner && plan.teacher_prep && plan.teacher_prep.length > 0 && (
        <BlockList label="Teacher preparation" items={plan.teacher_prep} tone="muted" />
      )}
      {!audienceIsLearner && plan.sample_questions && plan.sample_questions.length > 0 && (
        <BlockList label="Sample questions" items={plan.sample_questions} tone="muted" />
      )}
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────────────

function BlockList({
  label,
  items,
  icon = 'number',
  tone = 'default',
}: {
  label: string;
  items: string[];
  icon?: 'check' | 'number' | 'sparkle';
  tone?: 'default' | 'muted';
}) {
  return (
    <div>
      <p
        className={`text-[10px] font-black uppercase tracking-widest ${
          tone === 'muted' ? 'text-muted-foreground/70' : 'text-muted-foreground'
        }`}
      >
        {label}
      </p>
      <ul className="mt-1.5 space-y-1.5">
        {items.map((it, i) => (
          <li key={i} className="flex items-start gap-2 text-sm">
            {icon === 'check' && (
              <CheckCircleIcon className="w-4 h-4 text-emerald-400 mt-0.5 shrink-0" />
            )}
            {icon === 'sparkle' && (
              <SparklesIcon className="w-4 h-4 text-primary mt-0.5 shrink-0" />
            )}
            {icon === 'number' && (
              <span className="inline-flex items-center justify-center w-5 h-5 rounded-full border border-border text-[10px] font-black shrink-0 mt-0.5">
                {i + 1}
              </span>
            )}
            <span className={tone === 'muted' ? 'text-foreground/80' : 'text-foreground/90'}>
              {it}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function TagList({
  label,
  items,
  compact = false,
}: {
  label: string;
  items: string[];
  compact?: boolean;
}) {
  return (
    <div className={compact ? 'mt-2' : ''}>
      <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
        {label}
      </p>
      <div className="mt-1.5 flex flex-wrap gap-1.5">
        {items.map((x, i) => (
          <span
            key={i}
            className="inline-flex items-center text-[11px] px-2 py-0.5 rounded-full border border-border bg-muted/30 text-foreground/80"
          >
            {x}
          </span>
        ))}
      </div>
    </div>
  );
}

export default SyllabusPreview;
