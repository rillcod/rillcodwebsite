// @refresh reset
'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/contexts/auth-context';
import {
  ArrowLeftIcon, PencilIcon, CheckCircleIcon, PrinterIcon,
  PlusIcon, TrashIcon, ArrowPathIcon, BookOpenIcon, SparklesIcon,
} from '@/lib/icons';
import { toast } from 'sonner';
import PipelineStepper from '@/components/pipeline/PipelineStepper';
import { SyllabusPreview, type SyllabusContent } from '@/components/curriculum/SyllabusPreview';
import {
  buildAddLessonQueryFromCurriculum,
  type CurriculumWeekPlanSlice,
} from '@/lib/curriculum/add-lesson-from-curriculum';
import {
  findSyllabusWeek,
  inferTermNumberFromPlanTerm,
  type SyllabusContentImport,
} from '@/lib/lesson-plans/syllabusImport';

interface WeekEntry {
  week: number;
  topic: string;
  completed?: boolean;
  mastery_mode?: 'strict' | 'soft';
  gating_state?: 'locked' | 'unlocked' | 'mastered';
  override_reason?: string;
  overridden_by?: string;
  overridden_at?: string;
  objectives?: string;
  activities?: string;
  notes?: string;
  progression_badge?: {
    id?: string;
    label?: string;
    variant?: string;
  };
  assignment?: {
    title?: string;
    brief?: string;
  };
  project?: {
    title?: string;
    description?: string;
  };
  practical_assessment?: {
    max_score?: number;
    pass_score?: number;
    practical_score?: number;
  };
}

interface LessonPlan {
  id: string;
  course_id?: string | null;
  class_id?: string | null;
  school_id?: string | null;
  term?: string | null;
  term_start?: string | null;
  term_end?: string | null;
  sessions_per_week?: number | null;
  curriculum_version_id?: string | null;
  status?: string | null;
  version?: number | null;
  plan_data?: { weeks?: WeekEntry[] } | null;
  objectives?: string | null;
  activities?: string | null;
  created_at: string;
  updated_at: string;
  courses?: {
    id: string;
    title: string;
    program_id?: string | null;
    programs?: {
      id: string;
      name: string | null;
      school_progression_enabled?: boolean | null;
      session_frequency_per_week?: number | null;
      progression_policy?: Record<string, unknown> | null;
    } | null;
  } | null;
  classes?: { id: string; name: string } | null;
  schools?: { id: string; name: string } | null;
  curriculum?: { id: string; version: number; course_id?: string; content?: unknown } | null;
}

function buildPlanWeekCreateLessonUrl(opts: {
  plan: LessonPlan;
  week: WeekEntry;
  courseTitle: string;
}): string {
  const { plan, week: w, courseTitle } = opts;
  const rawContent = plan.curriculum?.content;
  const content = rawContent as SyllabusContentImport | undefined;
  const hasTerms = Array.isArray(content?.terms) && content!.terms!.length > 0;

  if (plan.curriculum_version_id && plan.course_id && hasTerms) {
    const tn = inferTermNumberFromPlanTerm(plan.term);
    const syWeek = findSyllabusWeek(content, tn, w.week);
    const lp = syWeek?.lesson_plan;
    let planSlice: CurriculumWeekPlanSlice | null = null;
    if (lp) {
      planSlice = {
        objectives: lp.objectives?.length ? lp.objectives : undefined,
        teacher_activities: lp.teacher_activities,
        student_activities: lp.student_activities?.length
          ? lp.student_activities
          : w.activities?.trim()
            ? [w.activities.trim()]
            : undefined,
        classwork: lp.classwork as CurriculumWeekPlanSlice['classwork'],
        resources: lp.resources,
        engagement_tips: lp.engagement_tips,
        assignment: lp.assignment as CurriculumWeekPlanSlice['assignment'],
        project: lp.project as CurriculumWeekPlanSlice['project'],
      };
    } else if (w.objectives?.trim() || w.activities?.trim()) {
      planSlice = {
        objectives: (w.objectives ?? '')
          .split(/[,\n]/)
          .map((s) => s.trim())
          .filter(Boolean),
        student_activities: w.activities?.trim() ? [w.activities.trim()] : undefined,
      };
    }

    const params = buildAddLessonQueryFromCurriculum({
      curriculumId: plan.curriculum_version_id,
      term: tn,
      weekNumber: w.week,
      courseId: plan.course_id,
      programId: plan.courses?.program_id ?? undefined,
      title: (w.topic || `Week ${w.week}`).slice(0, 240),
      description: [w.objectives, w.activities].filter(Boolean).join('\n\n').slice(0, 800),
      durationMinutes:
        typeof lp?.duration_minutes === 'number' && Number.isFinite(lp.duration_minutes)
          ? Math.min(240, Math.max(15, lp.duration_minutes))
          : 60,
      plan: planSlice,
    });
    params.set('lesson_plan_id', plan.id);
    params.set('flow_origin', 'lesson-plan');
    return `/dashboard/lessons/add?${params.toString()}`;
  }

  const weekDescription = [w.objectives, w.activities].filter(Boolean).join('\n\n');
  const weekNotes = [
    w.notes ? `Teacher Notes:\n${w.notes}` : null,
    w.objectives ? `Learning Objectives:\n${w.objectives}` : null,
    w.activities ? `Planned Activities:\n${w.activities}` : null,
  ]
    .filter(Boolean)
    .join('\n\n');
  return (
    `/dashboard/lessons/add?` +
    new URLSearchParams({
      lesson_plan_id: plan.id,
      week: String(w.week),
      ...(plan.course_id ? { course_id: plan.course_id } : {}),
      ...(w.topic ? { title: w.topic } : {}),
      ...(w.topic ? { topic: w.topic } : {}),
      ...(courseTitle ? { subject: courseTitle } : {}),
      ...(weekDescription ? { description: weekDescription.slice(0, 2000) } : {}),
      ...(weekNotes ? { lesson_notes: weekNotes.slice(0, 8000) } : {}),
      flow_origin: 'lesson-plan',
    }).toString()
  );
}

type ProgressionPreview = {
  projected_terms?: Array<{
    key: string;
    total_weeks: number;
    repeated_weeks: number;
  }>;
  projected_assignments?: number;
  projected_projects?: number;
  projected_flashcard_decks?: number;
  repetition_risk?: 'low' | 'medium' | 'high';
  warnings?: string[];
  preflight?: {
    status: 'ready' | 'warning' | 'blocked';
    blocking: boolean;
    summary: {
      pass: number;
      warn: number;
      fail: number;
    };
    checks: Array<{
      key: string;
      label: string;
      status: 'pass' | 'warn' | 'fail';
      detail: string;
      blocking?: boolean;
    }>;
  };
  policy_runtime?: {
    strict_route?: boolean;
    project_based?: boolean;
    essential_routes_only?: boolean;
    track_candidates?: string[];
    standard_weeks_per_term?: number;
  };
};
type ProgressionScope = 'week' | 'term' | 'session' | 'full_program';

type ProgressionGuideWeek = {
  sequence: number;
  project_key: string;
  title: string;
  track: string;
  year_number: number | null;
  term_number: number | null;
  week_number: number | null;
  week_index: number | null;
  classwork_prompt: string | null;
  estimated_minutes: number | null;
};

type SyllabusQaReport = {
  overall_score: number;
  overall_readiness: 'excellent' | 'good' | 'watch' | 'critical';
  coverage_pct: number;
  total_terms: number;
  issues: Array<{
    key: string;
    severity: 'info' | 'warn' | 'fail';
    message: string;
    week?: number | null;
  }>;
  terms: Array<{
    key: string;
    year_number: number;
    term_number: number;
    score: number;
    coverage_pct: number;
    readiness: 'excellent' | 'good' | 'watch' | 'critical';
    generated_weeks: number;
    syllabus_weeks: number;
    missing_week_types: number;
    assessment_drift_count: number;
    exam_drift_count: number;
    five_step_break_count: number;
    issues: Array<{
      key: string;
      severity: 'info' | 'warn' | 'fail';
      message: string;
      week?: number | null;
    }>;
  }>;
};

type LessonPlanOperations = {
  schedule: {
    id: string;
    is_active: boolean;
    current_week: number;
    term_start: string;
    cadence_days: number;
    updated_at: string;
  } | null;
  release_board: Array<{
    key: string;
    year_number: number;
    term_number: number;
    week_number: number;
    topic: string;
    release_status: 'pending' | 'draft' | 'partial' | 'released';
    lessons_total: number;
    lessons_published: number;
    assignments_total: number;
    assignments_active: number;
    latest_release_at: string | null;
    history: Array<{ type: string; at: string; status: string }>;
  }>;
  analytics: {
    summary: {
      total_records: number;
      completion_pct: number;
      average_practical_score: number;
      average_retry_count: number;
    };
    terms: Array<{
      key: string;
      year_number: number;
      term_number: number;
      total_records: number;
      completion_pct: number;
      average_practical_score: number;
      average_retry_count: number;
    }>;
  };
  audit: {
    summary: {
      total_events: number;
      by_action: Array<{ action_type: string; count: number }>;
      by_role: Array<{ actor_role: string; count: number }>;
    };
    timeline: Array<{
      id: string;
      action_type: string;
      actor_role: string | null;
      year_number: number | null;
      term_number: number | null;
      week_number: number | null;
      reason: string | null;
      created_at: string;
    }>;
  };
};

type ProgressionWeekGuidePayload = {
  class_name: string | null;
  grade_key: string | null;
  track: string;
  syllabus_phase: string;
  program_name: string | null;
  source: string;
  weeks_count: number;
  weeks: ProgressionGuideWeek[];
};

const STATUS_TRANSITIONS: Record<string, string[]> = {
  draft: ['published'],
  published: ['archived'],
  archived: [],
};

const STATUS_BADGE: Record<string, { label: string; cls: string }> = {
  draft:     { label: 'Draft',     cls: 'bg-zinc-500/20 text-zinc-400 border-zinc-500/30' },
  published: { label: 'Published', cls: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' },
  archived:  { label: 'Archived',  cls: 'bg-amber-500/20 text-amber-400 border-amber-500/30' },
};

const PROGRESSION_SCOPE_OPTIONS: Array<{
  id: ProgressionScope;
  title: string;
  eyebrow: string;
  description: string;
}> = [
  {
    id: 'week',
    title: 'Single Week',
    eyebrow: 'Precise repair',
    description: 'Generate or replace one week in a specific year and term.',
  },
  {
    id: 'term',
    title: 'Single Term',
    eyebrow: 'Focused build',
    description: 'Build one term route with curriculum-aligned week structure.',
  },
  {
    id: 'session',
    title: 'Full Session',
    eyebrow: 'Three-term build',
    description: 'Generate all three terms for one academic session/year.',
  },
  {
    id: 'full_program',
    title: 'Three Years',
    eyebrow: 'Whole pathway',
    description: 'Auto-build the full 3-year progression map end to end.',
  },
];

export default function LessonPlanDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { profile, loading: authLoading } = useAuth();
  const [plan, setPlan] = useState<LessonPlan | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [weeks, setWeeks] = useState<WeekEntry[]>([]);
  const [editingWeek, setEditingWeek] = useState<number | null>(null);
  const [weekDraft, setWeekDraft] = useState<WeekEntry | null>(null);
  const [activeTab, setActiveTab] = useState<'weeks' | 'content'>('weeks');
  const [generating, setGenerating] = useState<'lessons' | 'assignments' | 'projects' | 'progression' | null>(null);
  const [genProgress, setGenProgress] = useState<{ generated: number; total: number; status: string } | null>(null);
  const [linkedLessons, setLinkedLessons] = useState<{ id: string; title: string; status: string; metadata?: { week?: number } | null }[]>([]);
  const [progressionScope, setProgressionScope] = useState<ProgressionScope>('term');
  const [progressionYear, setProgressionYear] = useState(1);
  const [progressionTerm, setProgressionTerm] = useState(1);
  const [progressionWeek, setProgressionWeek] = useState(1);
  const [progressionSession, setProgressionSession] = useState(1);
  const [progressionOverwrite, setProgressionOverwrite] = useState(false);
  const [progressionPreview, setProgressionPreview] = useState<ProgressionPreview | null>(null);
  const [statusYear, setStatusYear] = useState(1);
  const [statusTerm, setStatusTerm] = useState(1);
  const [statusSaving, setStatusSaving] = useState(false);
  const [scheduleSaving, setScheduleSaving] = useState(false);
  const [releaseSaving, setReleaseSaving] = useState(false);
  const [guidePanelOpen, setGuidePanelOpen] = useState(false);
  const [guideLoading, setGuideLoading] = useState(false);
  const [guideError, setGuideError] = useState<string | null>(null);
  const [guideData, setGuideData] = useState<ProgressionWeekGuidePayload | null>(null);
  const [qaLoading, setQaLoading] = useState(false);
  const [qaError, setQaError] = useState<string | null>(null);
  const [qaReport, setQaReport] = useState<SyllabusQaReport | null>(null);
  const [opsLoading, setOpsLoading] = useState(false);
  const [opsError, setOpsError] = useState<string | null>(null);
  const [operations, setOperations] = useState<LessonPlanOperations | null>(null);
  const canGenerateProgression = ['teacher', 'admin'].includes(profile?.role ?? '');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [planRes, lessonsRes] = await Promise.all([
        fetch(`/api/lesson-plans/${id}`),
        fetch(`/api/lessons?lesson_plan_id=${id}`),
      ]);
      if (!planRes.ok) { toast.error('Plan not found'); router.push('/dashboard/lesson-plans'); return; }
      const j = await planRes.json();
      const p: LessonPlan = j.data;
      setPlan(p);
      setWeeks([...(p.plan_data?.weeks ?? []) as WeekEntry[]].sort((a, b) => a.week - b.week));
      if (lessonsRes.ok) {
        const lj = await lessonsRes.json();
        setLinkedLessons(lj.data ?? []);
      }
    } catch {
      toast.error('Failed to load plan');
    } finally {
      setLoading(false);
    }
  }, [id, router]);

  useEffect(() => {
    if (!authLoading && profile) load();
  }, [authLoading, profile, load]);

  useEffect(() => {
    if (!guidePanelOpen || !canGenerateProgression || !id) return;
    let cancelled = false;
    setGuideLoading(true);
    setGuideError(null);
    fetch(`/api/lesson-plans/${id}/progression-week-guide`)
      .then(async (res) => {
        const j = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(typeof j.error === 'string' ? j.error : 'Failed to load progression guide');
        if (!cancelled) setGuideData((j.data ?? null) as ProgressionWeekGuidePayload | null);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setGuideData(null);
          setGuideError(err instanceof Error ? err.message : 'Failed to load progression guide');
        }
      })
      .finally(() => {
        if (!cancelled) setGuideLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [guidePanelOpen, canGenerateProgression, id]);

  useEffect(() => {
    setProgressionPreview(null);
  }, [progressionScope, progressionYear, progressionTerm, progressionWeek, progressionSession, progressionOverwrite, weeks.length]);

  useEffect(() => {
    if (activeTab !== 'content' || !canGenerateProgression || !id) return;
    let cancelled = false;
    setQaLoading(true);
    setQaError(null);
    fetch(`/api/lesson-plans/${id}/syllabus-qa`)
      .then(async (res) => {
        const j = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(typeof j.error === 'string' ? j.error : 'Failed to load syllabus QA');
        if (!cancelled) setQaReport((j.data ?? null) as SyllabusQaReport | null);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setQaReport(null);
          setQaError(err instanceof Error ? err.message : 'Failed to load syllabus QA');
        }
      })
      .finally(() => {
        if (!cancelled) setQaLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, canGenerateProgression, id]);

  useEffect(() => {
    if (activeTab !== 'content' || !canGenerateProgression || !id) return;
    let cancelled = false;
    setOpsLoading(true);
    setOpsError(null);
    fetch(`/api/lesson-plans/${id}/operations`)
      .then(async (res) => {
        const j = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(typeof j.error === 'string' ? j.error : 'Failed to load operations center');
        if (!cancelled) setOperations((j.data ?? null) as LessonPlanOperations | null);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setOperations(null);
          setOpsError(err instanceof Error ? err.message : 'Failed to load operations center');
        }
      })
      .finally(() => {
        if (!cancelled) setOpsLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, canGenerateProgression, id]);

  const syllabusTermContent = useMemo((): SyllabusContent | null => {
    if (!plan?.curriculum?.content || typeof plan.curriculum.content !== 'object') return null;
    const c = plan.curriculum.content as SyllabusContent;
    if (!c.terms?.length) return null;
    const tn = inferTermNumberFromPlanTerm(plan.term);
    const term = c.terms.find((t) => t.term === tn) ?? c.terms[0];
    return { ...c, terms: [term] };
  }, [plan?.curriculum?.content, plan?.term]);

  async function saveWeeks(updatedWeeks: WeekEntry[]) {
    setSaving(true);
    try {
      const res = await fetch(`/api/lesson-plans/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan_data: { weeks: updatedWeeks } }),
      });
      if (!res.ok) throw new Error('Save failed');
      setWeeks(updatedWeeks);
      toast.success('Saved');
    } catch {
      toast.error('Failed to save');
    } finally {
      setSaving(false);
    }
  }

  async function transitionStatus(newStatus: string) {
    if (!plan) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/lesson-plans/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus, version: newStatus === 'published' ? (plan.version ?? 1) + 1 : plan.version }),
      });
      if (!res.ok) throw new Error('Status update failed');
      toast.success(`Plan ${newStatus}`);
      load();
    } catch {
      toast.error('Failed to update status');
    } finally {
      setSaving(false);
    }
  }

  function addWeek() {
    const newWeek: WeekEntry = { week: weeks.length + 1, topic: '', completed: false, objectives: '', activities: '', notes: '' };
    setWeeks(prev => [...prev, newWeek]);
    setEditingWeek(newWeek.week);
    setWeekDraft(newWeek);
  }

  function startEdit(w: WeekEntry) {
    setEditingWeek(w.week);
    setWeekDraft({ ...w });
  }

  function cancelEdit() {
    setEditingWeek(null);
    setWeekDraft(null);
    // Remove unsaved empty weeks
    setWeeks(prev => prev.filter(w => w.topic.trim() !== '' || w.week !== (weeks.length)));
  }

  function saveWeekEdit() {
    if (!weekDraft) return;
    const updated = weeks.map(w => w.week === weekDraft.week ? weekDraft : w);
    setEditingWeek(null);
    setWeekDraft(null);
    saveWeeks(updated);
  }

  async function updateTermStatus(status: 'draft' | 'approved' | 'locked') {
    setStatusSaving(true);
    try {
      const res = await fetch(`/api/lesson-plans/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          progression_term_status_update: {
            year_number: statusYear,
            term_number: statusTerm,
            status,
            reason: status === 'locked' ? 'Locking term after review' : 'Status update',
          },
        }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || 'Failed to update term status');
      toast.success(`Set Y${statusYear}T${statusTerm} to ${status}`);
      load();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to update term status');
    } finally {
      setStatusSaving(false);
    }
  }

  function deleteWeek(weekNum: number) {
    const updated = weeks
      .filter(w => w.week !== weekNum)
      .map((w, i) => ({ ...w, week: i + 1 }));
    saveWeeks(updated);
  }

  function toggleWeekCompleted(weekNum: number) {
    const target = weeks.find((w) => w.week === weekNum);
    if (!target) return;
    if ((target.gating_state ?? 'unlocked') === 'locked') {
      toast.error('This week is locked. Use override unlock if needed.');
      return;
    }

    const markingDone = !target.completed;
    const isStrict = (target.mastery_mode ?? 'strict') === 'strict';
    let practicalScore = Number(target.practical_assessment?.practical_score ?? 0);
    const passScore = Number(target.practical_assessment?.pass_score ?? 60);
    if (markingDone && isStrict) {
      const input = window.prompt(`Enter practical score for Week ${weekNum} (0-100):`, String(practicalScore || '0'));
      if (input === null) return;
      const parsed = Number(input);
      practicalScore = Number.isFinite(parsed) ? Math.min(Math.max(parsed, 0), 100) : 0;
    }

    const shouldMaster = markingDone
      ? (isStrict ? practicalScore >= passScore : true)
      : false;

    const updated = weeks.map((w) => {
      if (w.week === weekNum) {
        return {
          ...w,
          completed: markingDone,
          gating_state: shouldMaster ? ('mastered' as const) : ('unlocked' as const),
          practical_assessment: {
            ...(w.practical_assessment ?? {}),
            practical_score: markingDone ? practicalScore : (w.practical_assessment?.practical_score ?? 0),
          },
        };
      }
      if (shouldMaster && w.week === weekNum + 1 && (w.gating_state ?? 'locked') === 'locked') {
        return { ...w, gating_state: 'unlocked' as const };
      }
      return w;
    });
    saveWeeks(updated);
  }

  function unlockWeekWithOverride(weekNum: number) {
    const reason = window.prompt(`Override unlock reason for Week ${weekNum}:`, '');
    if (reason === null) return;
    const trimmed = reason.trim();
    if (!trimmed) {
      toast.error('Override reason is required.');
      return;
    }
    const updated = weeks.map((w) =>
      w.week === weekNum
        ? {
            ...w,
            gating_state: 'unlocked' as const,
            override_reason: trimmed,
            overridden_by: profile?.role ?? 'teacher',
            overridden_at: new Date().toISOString(),
          }
        : w,
    );
    saveWeeks(updated);
  }

  async function bulkGenerate(type: 'lessons' | 'assignments' | 'projects' | 'cbt' | 'flashcards') {
    if (!plan || plan.status !== 'published') {
      toast.error('Only published plans can generate content');
      return;
    }

    if (type === 'cbt' || type === 'flashcards') {
      const q = new URLSearchParams({
        course_id: plan.course_id || '',
        lesson_plan_id: id,
        program_id: plan.courses?.program_id || '',
        curriculum_id: plan.curriculum_version_id || '',
        source: 'lesson-plan-bulk'
      });
      const target = type === 'cbt' ? '/dashboard/cbt/new' : '/dashboard/flashcards';
      router.push(`${target}?${q.toString()}`);
      return;
    }

    const labels: Record<'lessons' | 'assignments' | 'projects', string> = {
      lessons: 'lessons',
      assignments: 'assignments',
      projects: 'projects',
    };
    const previewRes = await fetch(`/api/lesson-plans/${id}/generate-${type}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dry_run: true }),
    });
    const previewJson = await previewRes.json().catch(() => ({}));
    if (!previewRes.ok) {
      toast.error(previewJson.error || 'Preview failed');
      return;
    }
    const preview = (previewJson.data ?? {}) as { total_weeks?: number; projected_generations?: number; projected_skips?: number };
    const approved = window.confirm(
      `Preview: total ${preview.total_weeks ?? weeks.length}, generate ${preview.projected_generations ?? 0}, skip ${preview.projected_skips ?? 0}. Continue generating ${labels[type]}?`,
    );
    if (!approved) return;

    setGenerating(type);
    setGenProgress({ generated: 0, total: weeks.length, status: 'Starting...' });

    try {
      const res = await fetch(`/api/lesson-plans/${id}/generate-${type}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dry_run: false }),
      });
      if (!res.ok) throw new Error('Generation failed');

      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      if (!reader) throw new Error('No stream');

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value);
        const lines = chunk.split('\n').filter(l => l.startsWith('data: '));
        for (const line of lines) {
          const data = JSON.parse(line.slice(6));
          if (data.done) {
            toast.success(`Generated ${data.generated} ${type}, skipped ${data.skipped}`);
            setGenProgress(null);
            setGenerating(null);
            load();
            return;
          }
          setGenProgress({ generated: data.generated, total: data.total, status: data.status });
        }
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Generation failed';
      toast.error(message);
      setGenProgress(null);
      setGenerating(null);
    }
  }


  function getProgressionWeeksCount() {
    return weeks.length > 0 ? weeks.length : 8;
  }

  function getProgressionScopeLabel(scope: ProgressionScope = progressionScope) {
    if (scope === 'week') return `Week ${progressionWeek}, Term ${progressionTerm}, Year ${progressionYear}`;
    if (scope === 'term') return `Term ${progressionTerm}, Year ${progressionYear}`;
    if (scope === 'session') return `Session ${progressionSession}`;
    return 'Full 3-Year Program';
  }

  function buildProgressionPayload(overrides?: Partial<Record<string, unknown>>) {
    return {
      strict_route: true,
      scope: progressionScope,
      year_number: progressionYear,
      term_number: progressionTerm,
      week_number: progressionWeek,
      session_number: progressionSession,
      overwrite_existing: progressionOverwrite,
      weeks_count: getProgressionWeeksCount(),
      ...overrides,
    };
  }

  async function previewProgressionBuilder(overrides?: Partial<Record<string, unknown>>) {
    if (!plan) return null;
    setGenerating('progression');
    try {
      const payload = buildProgressionPayload(overrides);
      const res = await fetch(`/api/lesson-plans/${id}/generate-progression`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...payload,
          dry_run: true,
        }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || 'Preview failed');
      const preview = (j.data ?? {}) as ProgressionPreview;
      setProgressionPreview(preview);
      toast.success(`Preview ready for ${getProgressionScopeLabel((overrides?.scope as ProgressionScope | undefined) ?? progressionScope)}.`);
      return preview;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Preview failed';
      toast.error(message);
      return null;
    } finally {
      setGenerating(null);
    }
  }

  async function runProgressionBuilder() {
    if (!plan) return;
    setGenerating('progression');
    try {
      const payload = buildProgressionPayload();
      const preview = progressionPreview ?? await previewProgressionBuilder();
      if (!preview) return;
      if (preview.preflight?.blocking) {
        toast.error('Resolve the blocking readiness issues before generation.');
        return;
      }
      const approved = window.confirm(
        `Scope: ${getProgressionScopeLabel()}\nPreview: ${preview.projected_terms?.length ?? 0} term(s), ${preview.projected_projects ?? 0} project weeks, ${preview.projected_assignments ?? 0} assignments, ${preview.projected_flashcard_decks ?? 0} flashcard decks, repetition risk: ${preview.repetition_risk ?? 'low'}. Continue generation?`,
      );
      if (!approved) return;
      const res = await fetch(`/api/lesson-plans/${id}/generate-progression`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || 'Progression generation failed');
      toast.success(`Generated progression route for ${getProgressionScopeLabel()}.`);
      load();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Progression generation failed';
      toast.error(message);
    } finally {
      setGenerating(null);
    }
  }

  async function activateTermSchedule() {
    if (!plan) return;
    setScheduleSaving(true);
    try {
      const res = await fetch(`/api/lesson-plans/${id}/schedule`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          term_start: plan.term_start ?? new Date().toISOString(),
          cadence_days: 7,
        }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || 'Failed to activate schedule');
      toast.success('Term scheduler activated for this lesson plan.');
      load();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to activate schedule');
    } finally {
      setScheduleSaving(false);
    }
  }

  async function releaseProgressionWeek() {
    setReleaseSaving(true);
    try {
      const res = await fetch(`/api/lesson-plans/${id}/release-week`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ week_number: progressionWeek }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || 'Failed to release week');
      toast.success(`Released week ${progressionWeek} lessons and assignments.`);
      load();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to release week');
    } finally {
      setReleaseSaving(false);
    }
  }


  if (authLoading || loading) {
    return <div className="flex items-center justify-center min-h-[60vh]"><div className="w-10 h-10 border-4 border-violet-500 border-t-transparent rounded-full animate-spin" /></div>;
  }

  if (!plan) return null;

  const status = plan.status ?? 'draft';
  const badge = STATUS_BADGE[status] ?? STATUS_BADGE.draft;
  const nextStatuses = STATUS_TRANSITIONS[status] ?? [];
  const courseTitle = plan.courses?.title ?? 'Unknown Course';
  const completedWeeks = weeks.filter((w) => w.completed).length;
  const selectedScopeConfig = PROGRESSION_SCOPE_OPTIONS.find((option) => option.id === progressionScope) ?? PROGRESSION_SCOPE_OPTIONS[1];
  const builderWeeksCount = getProgressionWeeksCount();
  const builderScopeLabel = getProgressionScopeLabel();
  const programPolicy = plan.courses?.programs?.progression_policy ?? null;
  const builderQuickLinks = [
    {
      label: 'Analytics',
      href: `/dashboard/progression/analytics?year_number=${progressionYear}&term_number=${progressionTerm}&course_id=${plan.course_id ?? ''}&class_id=${plan.class_id ?? ''}`,
    },
    {
      label: 'Audit',
      href: `/dashboard/progression/audit?lesson_plan_id=${id}`,
    },
    {
      label: 'Schedule',
      href: '/dashboard/lesson-plans',
    },
    {
      label: 'Release',
      href: `/dashboard/lessons?lesson_plan_id=${id}`,
    },
  ];
  const builderReadiness = [
    {
      key: 'program',
      label: 'Program progression',
      status: plan.courses?.programs?.school_progression_enabled === true ? 'pass' : 'fail',
      detail: plan.courses?.programs?.school_progression_enabled === true ? 'Enabled on linked program.' : 'Enable school progression on the linked program.',
    },
    {
      key: 'curriculum',
      label: 'Curriculum linked',
      status: syllabusTermContent ? 'pass' : 'warn',
      detail: syllabusTermContent ? 'Curriculum term content is linked to this plan.' : 'No curriculum term content is linked yet.',
    },
    {
      key: 'policy',
      label: 'Policy configured',
      status: programPolicy && Object.keys(programPolicy).length > 0 ? 'pass' : 'warn',
      detail: programPolicy && Object.keys(programPolicy).length > 0 ? 'Progression policy defaults are available.' : 'Program policy is thin, so more runtime defaults will be used.',
    },
    {
      key: 'guide',
      label: 'Registry guide',
      status: guideError ? 'fail' : guideData?.weeks_count ? 'pass' : guideLoading ? 'warn' : 'warn',
      detail: guideError ? guideError : guideData?.weeks_count ? `${guideData.weeks_count} seeded guide rows loaded.` : guideLoading ? 'Loading seeded guide rows.' : 'Seeded guide has not loaded yet.',
    },
  ] as const;
  const preflightChecks = progressionPreview?.preflight?.checks ?? [];
  const hasBlockingPreflight = progressionPreview?.preflight?.blocking === true;
  const linearOpsFlow = [
    {
      step: '01',
      title: 'Policies',
      detail: programPolicy && Object.keys(programPolicy).length > 0 ? 'Rules are configured.' : 'Rules need stronger defaults.',
      state: programPolicy && Object.keys(programPolicy).length > 0 ? 'live' : 'watch',
    },
    {
      step: '02',
      title: 'Syllabus',
      detail: syllabusTermContent ? 'Syllabus is linked as the academic truth.' : 'Link syllabus content to anchor the plan.',
      state: syllabusTermContent ? 'live' : 'watch',
    },
    {
      step: '03',
      title: 'QA',
      detail: qaReport ? `${qaReport.overall_score}% compliance score.` : 'Run syllabus QA and validate rhythm.',
      state: qaReport ? (qaReport.overall_readiness === 'critical' ? 'risk' : 'live') : 'watch',
    },
    {
      step: '04',
      title: 'Builder',
      detail: progressionPreview?.preflight ? 'Preview and hard preflight are active.' : 'Choose scope and generate a preview.',
      state: hasBlockingPreflight ? 'risk' : progressionPreview?.preflight ? 'live' : 'watch',
    },
    {
      step: '05',
      title: 'Plan Ops',
      detail: 'Write route into the lesson plan and keep execution controlled.',
      state: 'live',
    },
    {
      step: '06',
      title: 'Content',
      detail: 'Generate lessons, assignments, and projects from the same route.',
      state: 'live',
    },
    {
      step: '07',
      title: 'Release',
      detail: operations?.schedule ? 'Schedule and release controls are connected.' : 'Operations center will surface release controls here.',
      state: operations?.schedule ? 'live' : 'watch',
    },
    {
      step: '08',
      title: 'Analytics',
      detail: operations?.analytics ? 'Analytics and audit are attached to this plan.' : 'Analytics will populate once operations sync.',
      state: operations?.analytics ? 'live' : 'watch',
    },
  ] as const;

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-4xl mx-auto print:p-0 print:space-y-4">
      {/* Print letterhead */}
      <div className="hidden print:block border-b border-black pb-3 mb-2">
        <div className="flex items-start gap-3">
          <img src="/logo.png" alt="Rillcod Technologies" className="w-14 h-14 object-contain" />
          <div className="flex-1 min-w-0 text-black">
            <p className="text-lg font-black leading-tight">RILLCOD TECHNOLOGIES</p>
            <p className="text-[11px] leading-tight">Coding Today, Innovating Tomorrow</p>
            <p className="text-[10px] leading-tight mt-1">
              26 Ogiesoba Avenue, Off Airport Road, GRA, Benin City · 08116600091 · support@rillcod.com
            </p>
          </div>
          <div className="text-right text-black">
            <p className="text-[10px] font-bold uppercase tracking-wider">Document</p>
            <p className="text-xs font-black uppercase">Term Lesson Plan</p>
            <p className="text-[10px] mt-1">{new Date().toLocaleDateString('en-GB')}</p>
          </div>
        </div>
      </div>

      {/* Shared pipeline */}
      <div className="print:hidden">
        <PipelineStepper
          current="plans"
          courseId={plan.course_id ?? null}
          courseTitle={courseTitle}
          curriculumId={plan.curriculum_version_id ?? null}
          lessonPlanId={plan.id}
        />

        {/* AI Lesson Assistant banner — discoverable entry point */}
        {weeks.some(w => !linkedLessons.find(l => l.metadata?.week === w.week)) && (
          <div className="mt-3 flex items-center justify-between gap-3 p-3 rounded-xl border border-violet-500/30 bg-gradient-to-r from-violet-500/10 to-fuchsia-500/10">
            <div className="flex items-start gap-3 min-w-0">
              <div className="w-8 h-8 rounded-lg bg-violet-500/20 flex items-center justify-center shrink-0">
                <SparklesIcon className="w-4 h-4 text-violet-300" />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-black uppercase tracking-widest text-violet-300">AI Lesson Assistant</p>
                <p className="text-xs text-card-foreground/70 mt-0.5 leading-snug">
                  Click <span className="font-bold text-violet-300">Create Lesson</span> on any week below — with a linked syllabus, student activities and objectives are carried into the builder automatically. Pick a mode (Academic · Project · Interactive) and generate a full rich lesson in seconds.
                </p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Back + Print */}
      <div className="flex items-center justify-between print:hidden">
        <Link href="/dashboard/lesson-plans" className="flex items-center gap-2 text-card-foreground/50 hover:text-card-foreground text-sm font-bold transition-colors min-h-[44px]">
          <ArrowLeftIcon className="w-4 h-4" /> Back to Plans
        </Link>
        <button onClick={() => window.print()} className="flex items-center gap-2 px-3 py-1.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-sm text-card-foreground/70 font-bold transition-all min-h-[44px]">
          <PrinterIcon className="w-4 h-4" /> Export PDF
        </button>
      </div>

      {/* Header */}
      <div className="bg-card border border-white/[0.08] rounded-2xl p-5">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="flex items-center gap-2 mb-2 flex-wrap">
              <span className={`text-xs px-2 py-0.5 rounded-full border font-bold ${badge.cls}`}>{badge.label}</span>
              {(plan.version ?? 1) > 1 && (
                <span className="text-xs text-blue-400 bg-blue-500/10 px-2 py-0.5 rounded-full border border-blue-500/20">v{plan.version}</span>
              )}
            </div>
            <h1 className="text-xl font-black text-card-foreground">
              {plan.term ?? 'Term Plan'} — {courseTitle}
            </h1>
            {plan.classes?.name && <p className="text-card-foreground/50 text-sm mt-0.5">{plan.classes.name}</p>}
          </div>
          <div className="flex items-center gap-2 print:hidden">
            {nextStatuses.map(ns => (
              <button key={ns} onClick={() => transitionStatus(ns)} disabled={saving}
                className="px-3 py-1.5 bg-violet-500 hover:bg-violet-400 disabled:opacity-50 text-white text-sm font-bold rounded-xl transition-all capitalize">
                {ns === 'published' ? 'Publish' : ns === 'archived' ? 'Archive' : ns}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4 text-xs text-card-foreground/50">
          {plan.term_start && <div><span className="font-bold text-card-foreground/70">Start:</span> {new Date(plan.term_start).toLocaleDateString('en-GB')}</div>}
          {plan.term_end && <div><span className="font-bold text-card-foreground/70">End:</span> {new Date(plan.term_end).toLocaleDateString('en-GB')}</div>}
          {plan.sessions_per_week && <div><span className="font-bold text-card-foreground/70">Sessions/wk:</span> {plan.sessions_per_week}</div>}
          <div><span className="font-bold text-card-foreground/70">Path Progress:</span> {completedWeeks}/{weeks.length || 0}</div>
          {plan.schools?.name && <div><span className="font-bold text-card-foreground/70">School:</span> {plan.schools.name}</div>}
        </div>

        {/* Linked curriculum + visible syllabus (this term) */}
        {plan.curriculum_version_id && (
          <div className="mt-3 space-y-2">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-xs text-blue-400 bg-blue-500/10 border border-blue-500/20 rounded-xl px-3 py-2">
              <div className="flex items-center gap-2 min-w-0">
                <BookOpenIcon className="w-4 h-4 flex-shrink-0" />
                <span className="min-w-0">
                  Linked syllabus v{plan.curriculum?.version ?? '—'} — term inferred from &ldquo;{plan.term ?? 'Term'}&rdquo;.
                </span>
              </div>
              {plan.course_id && (
                <Link
                  href={`/dashboard/curriculum?course=${plan.course_id}${plan.courses?.program_id ? `&program=${plan.courses.program_id}` : ''}`}
                  className="font-bold text-sky-300 hover:text-sky-200 underline underline-offset-2 shrink-0"
                >
                  Open in curriculum hub
                </Link>
              )}
            </div>
            {syllabusTermContent ? (
              <details className="print:hidden rounded-xl border border-blue-500/25 bg-blue-500/[0.04] overflow-hidden">
                <summary className="cursor-pointer list-none px-3 py-2.5 text-xs font-black text-blue-200 uppercase tracking-widest hover:bg-white/[0.03] [&::-webkit-details-marker]:hidden flex items-center justify-between gap-2">
                  <span>Show syllabus for this term (reference)</span>
                  <BookOpenIcon className="w-4 h-4 opacity-70" />
                </summary>
                <div className="border-t border-blue-500/20 px-2 py-3 max-h-[min(32rem,70vh)] overflow-y-auto bg-background/40">
                  <SyllabusPreview content={syllabusTermContent} courseTitle={courseTitle} />
                </div>
              </details>
            ) : (
              <p className="text-[11px] text-card-foreground/50">
                Syllabus JSON not loaded on this plan yet — republish or re-link curriculum, or open the curriculum hub to confirm content.
              </p>
            )}
          </div>
        )}
      </div>

      {canGenerateProgression && (
        <details
          className="print:hidden bg-card border border-white/[0.08] rounded-2xl overflow-hidden"
          onToggle={(e) => setGuidePanelOpen((e.currentTarget as HTMLDetailsElement).open)}
        >
          <summary className="cursor-pointer list-none px-4 py-3 flex items-center justify-between gap-3 hover:bg-white/[0.03] [&::-webkit-details-marker]:hidden">
            <div className="min-w-0">
              <p className="text-xs font-black uppercase tracking-widest text-amber-300/90">Progression seed</p>
              <p className="text-sm font-bold text-card-foreground mt-0.5">Grade week-by-week guide (registry)</p>
              <p className="text-[11px] text-card-foreground/55 mt-1 leading-snug">
                Same catalogue &ldquo;Generate progression&rdquo; uses — ordered by year, term, and week. Use it to align your plan topics before or after syllabus import.
              </p>
            </div>
            <BookOpenIcon className="w-5 h-5 text-amber-400/80 shrink-0" />
          </summary>
          <div className="px-4 pb-4 border-t border-white/[0.06] pt-3 space-y-3">
            {guideLoading && (
              <div className="flex items-center gap-2 text-xs text-card-foreground/50">
                <ArrowPathIcon className="w-4 h-4 animate-spin" /> Loading seeded weeks…
              </div>
            )}
            {guideError && !guideLoading && (
              <p className="text-xs text-rose-400 leading-relaxed">{guideError}</p>
            )}
            {guideData && !guideLoading && (
              <>
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-card-foreground/60">
                  <span><span className="font-bold text-card-foreground/75">Track:</span> {guideData.track}</span>
                  <span><span className="font-bold text-card-foreground/75">Grade key:</span> {guideData.grade_key ?? '—'}</span>
                  <span><span className="font-bold text-card-foreground/75">Phase:</span> {guideData.syllabus_phase}</span>
                  <span><span className="font-bold text-card-foreground/75">Weeks:</span> {guideData.weeks_count}</span>
                  <span className="text-card-foreground/45">({guideData.source.replace(/_/g, ' ')})</span>
                </div>
                <div className="max-h-[min(28rem,55vh)] overflow-auto rounded-xl border border-white/[0.08]">
                  <table className="w-full text-left text-[11px]">
                    <thead className="sticky top-0 bg-zinc-900/95 backdrop-blur border-b border-white/[0.08]">
                      <tr className="text-card-foreground/50 uppercase tracking-wide">
                        <th className="px-2 py-2 font-bold">Y</th>
                        <th className="px-2 py-2 font-bold">T</th>
                        <th className="px-2 py-2 font-bold">W</th>
                        <th className="px-2 py-2 font-bold">Idx</th>
                        <th className="px-2 py-2 font-bold min-w-[8rem]">Title</th>
                        <th className="px-2 py-2 font-bold hidden sm:table-cell">Classwork focus</th>
                      </tr>
                    </thead>
                    <tbody>
                      {guideData.weeks.map((row) => (
                        <tr key={`${row.project_key}-${row.sequence}`} className="border-b border-white/[0.04] hover:bg-white/[0.02] align-top">
                          <td className="px-2 py-1.5 text-card-foreground/70 whitespace-nowrap">{row.year_number ?? '—'}</td>
                          <td className="px-2 py-1.5 text-card-foreground/70 whitespace-nowrap">{row.term_number ?? '—'}</td>
                          <td className="px-2 py-1.5 text-card-foreground/70 whitespace-nowrap">{row.week_number ?? '—'}</td>
                          <td className="px-2 py-1.5 text-card-foreground/70 whitespace-nowrap">{row.week_index ?? '—'}</td>
                          <td className="px-2 py-1.5 text-card-foreground font-medium">{row.title}</td>
                          <td className="px-2 py-1.5 text-card-foreground/55 hidden sm:table-cell max-w-md">
                            {row.classwork_prompt ? (
                              <span className="line-clamp-2">{row.classwork_prompt}</span>
                            ) : (
                              '—'
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        </details>
      )}

      <style jsx global>{`
        @media print {
          @page {
            size: A4;
            margin: 14mm 12mm;
          }
          body {
            background: #fff !important;
            color: #111 !important;
          }
        }
      `}</style>

      {/* Tabs */}
      <div className="flex gap-2 border-b border-white/[0.08] print:hidden">
        <button
          onClick={() => setActiveTab('weeks')}
          className={`px-4 py-2 text-sm font-bold transition-all ${
            activeTab === 'weeks'
              ? 'text-violet-400 border-b-2 border-violet-400'
              : 'text-card-foreground/50 hover:text-card-foreground/70'
          }`}
        >
          Week-by-Week Plan
        </button>
        <button
          onClick={() => setActiveTab('content')}
          className={`px-4 py-2 text-sm font-bold transition-all ${
            activeTab === 'content'
              ? 'text-violet-400 border-b-2 border-violet-400'
              : 'text-card-foreground/50 hover:text-card-foreground/70'
          }`}
        >
          Content Dashboard
        </button>
      </div>

      {/* Week Entries */}
      {activeTab === 'weeks' && (
        <div className="space-y-3">
        <div className="flex items-center justify-between print:hidden">
          <h2 className="text-base font-black text-card-foreground">Week-by-Week Plan</h2>
          <button onClick={addWeek} disabled={saving || editingWeek !== null}
            className="flex items-center gap-2 px-3 py-1.5 bg-violet-500 hover:bg-violet-400 disabled:opacity-50 text-white text-sm font-bold rounded-xl transition-all">
            <PlusIcon className="w-4 h-4" /> Add Week
          </button>
        </div>

        {weeks.length === 0 ? (
          <div className="bg-card border border-white/[0.08] rounded-2xl p-8 text-center print:hidden">
            <p className="text-card-foreground/40 text-sm">No weeks added yet. Click "Add Week" to start building your plan.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {weeks.map(w => (
              <div key={w.week} className="bg-card border border-white/[0.08] rounded-2xl overflow-hidden">
                {editingWeek === w.week && weekDraft ? (
                  <div className="p-4 space-y-3">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-xs font-black text-violet-400 bg-violet-500/10 px-2 py-0.5 rounded-full">Week {w.week}</span>
                      {w.completed && (
                        <span className="text-[10px] font-black text-emerald-300 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/30">
                          Completed
                        </span>
                      )}
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-card-foreground/50 uppercase mb-1">Topic <span className="text-rose-400">*</span></label>
                      <input value={weekDraft.topic} onChange={e => setWeekDraft(d => d ? { ...d, topic: e.target.value } : d)}
                        placeholder="Week topic…"
                        className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-xl text-sm text-card-foreground focus:outline-none focus:border-violet-500/50" />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-card-foreground/50 uppercase mb-1">Objectives</label>
                      <textarea value={weekDraft.objectives ?? ''} onChange={e => setWeekDraft(d => d ? { ...d, objectives: e.target.value } : d)}
                        rows={2} placeholder="Learning objectives…"
                        className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-xl text-sm text-card-foreground focus:outline-none focus:border-violet-500/50 resize-none" />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-card-foreground/50 uppercase mb-1">Activities</label>
                      <textarea value={weekDraft.activities ?? ''} onChange={e => setWeekDraft(d => d ? { ...d, activities: e.target.value } : d)}
                        rows={2} placeholder="Teaching activities…"
                        className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-xl text-sm text-card-foreground focus:outline-none focus:border-violet-500/50 resize-none" />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-card-foreground/50 uppercase mb-1">Teacher Notes</label>
                      <textarea value={weekDraft.notes ?? ''} onChange={e => setWeekDraft(d => d ? { ...d, notes: e.target.value } : d)}
                        rows={2} placeholder="Internal notes…"
                        className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-xl text-sm text-card-foreground focus:outline-none focus:border-violet-500/50 resize-none" />
                    </div>
                    {(weekDraft.gating_state ?? 'unlocked') === 'locked' && (
                      <div>
                        <label className="block text-xs font-bold text-card-foreground/50 uppercase mb-1">Override Reason (required for locked term edit)</label>
                        <input
                          value={weekDraft.override_reason ?? ''}
                          onChange={e => setWeekDraft(d => d ? { ...d, override_reason: e.target.value } : d)}
                          placeholder="Reason for editing locked term..."
                          className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-xl text-sm text-card-foreground focus:outline-none focus:border-cyan-500/50"
                        />
                      </div>
                    )}
                    <div className="flex gap-2 pt-1">
                      <button onClick={saveWeekEdit} disabled={!weekDraft.topic.trim() || saving}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-white text-xs font-bold rounded-xl transition-all">
                        <CheckCircleIcon className="w-3.5 h-3.5" /> Save
                      </button>
                      <button onClick={cancelEdit} className="px-3 py-1.5 bg-white/5 hover:bg-white/10 text-card-foreground/70 text-xs font-bold rounded-xl transition-all">Cancel</button>
                    </div>
                  </div>
                ) : (
                  <div className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-xs font-black text-violet-400 bg-violet-500/10 px-2 py-0.5 rounded-full">Week {w.week}</span>
                          {(w.gating_state ?? 'unlocked') === 'locked' && (
                            <span className="text-[10px] font-black text-amber-300 bg-amber-500/10 px-2 py-0.5 rounded-full border border-amber-500/30">
                              Locked
                            </span>
                          )}
                          {(w.gating_state ?? 'unlocked') === 'mastered' && (
                            <span className="text-[10px] font-black text-emerald-300 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/30">
                              Mastered
                            </span>
                          )}
                          {w.completed && (
                            <span className="text-[10px] font-black text-emerald-300 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/30">
                              Completed
                            </span>
                          )}
                          {w.progression_badge?.label && (
                            <span className="text-[10px] font-black text-cyan-300 bg-cyan-500/10 px-2 py-0.5 rounded-full border border-cyan-500/30">
                              {w.progression_badge.label}
                            </span>
                          )}
                        </div>
                        <h3 className="font-bold text-card-foreground text-sm">{w.topic || <span className="text-card-foreground/30 italic">No topic</span>}</h3>
                        {w.objectives && <p className="text-xs text-card-foreground/50 mt-1 line-clamp-1">{w.objectives}</p>}
                        {typeof w.practical_assessment?.practical_score === 'number' && (
                          <p className="text-[11px] text-amber-300/90 mt-0.5">
                            Practical Score: {w.practical_assessment.practical_score}/{w.practical_assessment?.max_score ?? 100}
                          </p>
                        )}
                        {w.override_reason && (
                          <p className="text-[11px] text-cyan-300/90 mt-0.5">
                            Override: {w.override_reason}
                          </p>
                        )}
                        {w.assignment?.title && (
                          <p className="text-[11px] text-blue-300/90 mt-1">Assignment: {w.assignment.title}</p>
                        )}
                        {w.project?.title && (
                          <p className="text-[11px] text-emerald-300/90 mt-0.5">Project: {w.project.title}</p>
                        )}
                      </div>
                      <div className="flex items-center gap-1 print:hidden">
                        <button
                          onClick={() => toggleWeekCompleted(w.week)}
                          className={`p-1.5 rounded-lg transition-all ${
                            w.completed ? 'hover:bg-emerald-500/15' : 'hover:bg-white/10'
                          }`}
                          title={w.completed ? 'Mark as not completed' : 'Mark as completed'}
                        >
                          <CheckCircleIcon className={`w-3.5 h-3.5 ${w.completed ? 'text-emerald-400' : 'text-card-foreground/40'}`} />
                        </button>
                        {(w.gating_state ?? 'unlocked') === 'locked' && canGenerateProgression && (
                          <button
                            onClick={() => unlockWeekWithOverride(w.week)}
                            className="p-1.5 hover:bg-cyan-500/10 rounded-lg transition-all"
                            title="Override unlock"
                          >
                            <SparklesIcon className="w-3.5 h-3.5 text-cyan-400" />
                          </button>
                        )}
                        <button onClick={() => startEdit(w)} className="p-1.5 hover:bg-white/10 rounded-lg transition-all">
                          <PencilIcon className="w-3.5 h-3.5 text-card-foreground/40" />
                        </button>
                        <button onClick={() => deleteWeek(w.week)} className="p-1.5 hover:bg-rose-500/10 rounded-lg transition-all">
                          <TrashIcon className="w-3.5 h-3.5 text-rose-400/60" />
                        </button>
                      </div>
                    </div>
                    {/* Print view: show all fields */}
                    <div className="hidden print:block mt-2 space-y-1 text-xs text-card-foreground/70">
                      {w.objectives && <p><strong>Objectives:</strong> {w.objectives}</p>}
                      {w.activities && <p><strong>Activities:</strong> {w.activities}</p>}
                      {w.notes && <p><strong>Notes:</strong> {w.notes}</p>}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {saving && (
          <div className="flex items-center gap-2 text-xs text-card-foreground/40 print:hidden">
            <ArrowPathIcon className="w-3.5 h-3.5 animate-spin" /> Saving…
          </div>
        )}
      </div>
      )}

      {/* Content Dashboard Tab */}
      {activeTab === 'content' && (
        <div className="space-y-4">
          <div className="bg-card border border-white/[0.08] rounded-[28px] overflow-hidden">
            <div className="p-5 sm:p-6 border-b border-white/[0.06] bg-[radial-gradient(circle_at_top_left,rgba(245,158,11,0.14),transparent_30%),radial-gradient(circle_at_top_right,rgba(34,197,94,0.10),transparent_28%),linear-gradient(180deg,rgba(255,255,255,0.04),rgba(255,255,255,0.01))]">
              <div className="max-w-3xl">
                <p className="text-[11px] font-black uppercase tracking-[0.25em] text-amber-300/90">Linear Operating Flow</p>
                <h3 className="text-xl sm:text-2xl font-black text-card-foreground mt-2">Policies define rules → syllabus defines truth → QA checks → builder routes → lesson tools generate → release and analytics track</h3>
                <p className="text-sm text-card-foreground/65 mt-2 leading-relaxed">
                  This strip is the direct operating line for this plan. Read it left to right whenever you want to know what comes first, what validates it, what generates it, and what monitors it after release.
                </p>
              </div>
            </div>
            <div className="p-5 sm:p-6">
              <div className="grid grid-cols-1 gap-6">
                {/* Phases Mapping */}
                {[
                  { name: 'Academic Design', steps: ['01', '02'], icon: 'DesignIcon', color: 'blue' },
                  { name: 'Instructional Building', steps: ['03', '04'], icon: 'BuildIcon', color: 'indigo' },
                  { name: 'Classroom Delivery', steps: ['05', '06'], icon: 'DeliverIcon', color: 'violet' },
                  { name: 'Operational Audit', steps: ['07', '08'], icon: 'AuditIcon', color: 'fuchsia' }
                ].map((phase, pIdx) => (
                  <div key={phase.name} className="space-y-3">
                    <div className="flex items-center gap-2 mb-1">
                      <div className={`w-1.5 h-1.5 rounded-full bg-${phase.color}-400/60 shadow-[0_0_8px_rgba(129,140,248,0.4)]`} />
                      <span className={`text-[10px] font-black uppercase tracking-[0.2em] text-${phase.color}-300/80`}>
                        Phase {pIdx + 1}: {phase.name}
                      </span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {linearOpsFlow.filter(item => phase.steps.includes(item.step)).map((item) => (
                        <div
                          key={item.step}
                          className={`rounded-2xl border p-4 transition-all duration-300 hover:scale-[1.02] ${
                            item.state === 'risk'
                              ? 'border-rose-400/25 bg-rose-500/[0.08]'
                              : item.state === 'watch'
                                ? 'border-amber-400/25 bg-amber-500/[0.08]'
                                : 'border-emerald-400/20 bg-emerald-500/[0.06]'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-3">
                            <span className="text-[10px] font-black uppercase tracking-[0.24em] text-card-foreground/45">Step {item.step}</span>
                            <span className={`text-[10px] font-black uppercase tracking-[0.2em] ${
                              item.state === 'risk'
                                ? 'text-rose-200'
                                : item.state === 'watch'
                                  ? 'text-amber-200'
                                  : 'text-emerald-200'
                            }`}>
                              {item.state}
                            </span>
                          </div>
                          <h4 className="text-base font-black text-card-foreground mt-2">{item.title}</h4>
                          <p className="text-xs text-card-foreground/65 mt-2 leading-relaxed">{item.detail}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {status === 'published' && (
            <>
              <div className="bg-card border border-white/[0.08] rounded-[28px] overflow-hidden">
                <div className="p-5 sm:p-6 border-b border-white/[0.06] bg-[radial-gradient(circle_at_top_left,rgba(14,165,233,0.18),transparent_30%),radial-gradient(circle_at_top_right,rgba(236,72,153,0.12),transparent_30%),linear-gradient(180deg,rgba(255,255,255,0.05),rgba(255,255,255,0.01))]">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="max-w-2xl">
                      <p className="text-[11px] font-black uppercase tracking-[0.25em] text-cyan-300/90">Operations Center</p>
                      <h3 className="text-xl sm:text-2xl font-black text-card-foreground mt-2">Schedule, release, analytics, and audit in one lesson-plan view</h3>
                      <p className="text-sm text-card-foreground/65 mt-2 leading-relaxed">
                        This board gives your operators one place to monitor cadence, release state, performance, and override activity without leaving the lesson-plan workflow.
                      </p>
                    </div>
                    <div className="grid grid-cols-2 gap-3 min-w-0 sm:min-w-[18rem]">
                      <div className="rounded-2xl border border-white/10 bg-black/20 p-3">
                        <p className="text-[10px] uppercase tracking-[0.2em] text-card-foreground/45 font-black">Scheduler</p>
                        <p className="text-sm font-black text-card-foreground mt-1">{operations?.schedule?.is_active ? 'Active' : 'Inactive'}</p>
                      </div>
                      <div className="rounded-2xl border border-white/10 bg-black/20 p-3">
                        <p className="text-[10px] uppercase tracking-[0.2em] text-card-foreground/45 font-black">Current Week</p>
                        <p className="text-sm font-black text-card-foreground mt-1">{operations?.schedule?.current_week ?? 0}</p>
                      </div>
                      <div className="rounded-2xl border border-white/10 bg-black/20 p-3">
                        <p className="text-[10px] uppercase tracking-[0.2em] text-card-foreground/45 font-black">Release Rows</p>
                        <p className="text-sm font-black text-card-foreground mt-1">{operations?.release_board?.length ?? 0}</p>
                      </div>
                      <div className="rounded-2xl border border-white/10 bg-black/20 p-3">
                        <p className="text-[10px] uppercase tracking-[0.2em] text-card-foreground/45 font-black">Audit Events</p>
                        <p className="text-sm font-black text-card-foreground mt-1">{operations?.audit.summary.total_events ?? 0}</p>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="p-5 sm:p-6 space-y-4">
                  {opsLoading && (
                    <div className="flex items-center gap-2 text-sm text-card-foreground/55">
                      <ArrowPathIcon className="w-4 h-4 animate-spin" /> Loading operations center...
                    </div>
                  )}
                  {opsError && !opsLoading && (
                    <div className="rounded-2xl border border-rose-400/25 bg-rose-500/[0.08] p-4 text-sm text-rose-200">
                      {opsError}
                    </div>
                  )}
                  {operations && !opsLoading && (
                    <>
                      <div className="grid grid-cols-1 xl:grid-cols-[0.9fr_1.1fr] gap-4">
                        <section className="rounded-[24px] border border-white/[0.08] bg-white/[0.03] p-4">
                          <p className="text-[11px] font-black uppercase tracking-[0.22em] text-card-foreground/45">Schedule Dashboard</p>
                          <div className="mt-4 grid grid-cols-2 gap-3 text-xs">
                            <div className="rounded-2xl border border-white/[0.08] bg-black/20 p-3">
                              <p className="text-card-foreground/45 uppercase tracking-[0.18em] font-black">Status</p>
                              <p className="text-card-foreground font-black mt-2">{operations.schedule?.is_active ? 'Active' : 'Not active'}</p>
                            </div>
                            <div className="rounded-2xl border border-white/[0.08] bg-black/20 p-3">
                              <p className="text-card-foreground/45 uppercase tracking-[0.18em] font-black">Cadence</p>
                              <p className="text-card-foreground font-black mt-2">{operations.schedule?.cadence_days ?? 7} day(s)</p>
                            </div>
                            <div className="rounded-2xl border border-white/[0.08] bg-black/20 p-3">
                              <p className="text-card-foreground/45 uppercase tracking-[0.18em] font-black">Term Start</p>
                              <p className="text-card-foreground font-black mt-2">{operations.schedule?.term_start ? new Date(operations.schedule.term_start).toLocaleDateString() : 'Not set'}</p>
                            </div>
                            <div className="rounded-2xl border border-white/[0.08] bg-black/20 p-3">
                              <p className="text-card-foreground/45 uppercase tracking-[0.18em] font-black">Last Sync</p>
                              <p className="text-card-foreground font-black mt-2">{operations.schedule?.updated_at ? new Date(operations.schedule.updated_at).toLocaleString() : '—'}</p>
                            </div>
                          </div>
                        </section>

                        <section className="rounded-[24px] border border-white/[0.08] bg-white/[0.03] p-4">
                          <div className="flex items-center justify-between gap-3">
                            <p className="text-[11px] font-black uppercase tracking-[0.22em] text-card-foreground/45">Release Board</p>
                            <span className="text-xs text-card-foreground/55">Draft, partial, and fully released week state</span>
                          </div>
                          <div className="mt-4 space-y-3 max-h-[28rem] overflow-auto pr-1">
                            {operations.release_board.map((row) => (
                              <div key={row.key} className="rounded-2xl border border-white/[0.08] bg-black/20 p-3">
                                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                                  <div>
                                    <p className="text-xs font-black text-card-foreground">Y{row.year_number} T{row.term_number} W{row.week_number}</p>
                                    <p className="text-sm text-card-foreground/80 mt-1">{row.topic}</p>
                                  </div>
                                  <span className={`px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-[0.18em] ${
                                    row.release_status === 'released'
                                      ? 'bg-emerald-500/15 text-emerald-200 border border-emerald-400/20'
                                      : row.release_status === 'partial'
                                        ? 'bg-amber-500/15 text-amber-200 border border-amber-400/20'
                                        : row.release_status === 'draft'
                                          ? 'bg-zinc-500/15 text-zinc-200 border border-zinc-400/20'
                                          : 'bg-rose-500/15 text-rose-200 border border-rose-400/20'
                                  }`}>
                                    {row.release_status}
                                  </span>
                                </div>
                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-3 text-xs">
                                  <div className="rounded-xl border border-white/[0.08] px-3 py-2">Lessons {row.lessons_published}/{row.lessons_total}</div>
                                  <div className="rounded-xl border border-white/[0.08] px-3 py-2">Assignments {row.assignments_active}/{row.assignments_total}</div>
                                  <div className="rounded-xl border border-white/[0.08] px-3 py-2 sm:col-span-2">Latest {row.latest_release_at ? new Date(row.latest_release_at).toLocaleString() : 'No release yet'}</div>
                                </div>
                                {row.history.length > 0 && (
                                  <div className="mt-3 space-y-1">
                                    {row.history.map((event, idx) => (
                                      <div key={`${row.key}-${idx}`} className="text-[11px] text-card-foreground/60">
                                        {new Date(event.at).toLocaleString()} · {event.type} · {event.status}
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        </section>
                      </div>

                      <div className="grid grid-cols-1 xl:grid-cols-[0.95fr_1.05fr] gap-4">
                        <section className="rounded-[24px] border border-white/[0.08] bg-white/[0.03] p-4">
                          <p className="text-[11px] font-black uppercase tracking-[0.22em] text-card-foreground/45">Plan Analytics</p>
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4 text-xs">
                            <div className="rounded-2xl border border-white/[0.08] bg-black/20 p-3">
                              <p className="text-card-foreground/45 uppercase tracking-[0.18em] font-black">Records</p>
                              <p className="text-card-foreground font-black mt-2">{operations.analytics.summary.total_records}</p>
                            </div>
                            <div className="rounded-2xl border border-white/[0.08] bg-black/20 p-3">
                              <p className="text-card-foreground/45 uppercase tracking-[0.18em] font-black">Completion</p>
                              <p className="text-card-foreground font-black mt-2">{operations.analytics.summary.completion_pct}%</p>
                            </div>
                            <div className="rounded-2xl border border-white/[0.08] bg-black/20 p-3">
                              <p className="text-card-foreground/45 uppercase tracking-[0.18em] font-black">Avg Score</p>
                              <p className="text-card-foreground font-black mt-2">{operations.analytics.summary.average_practical_score}</p>
                            </div>
                            <div className="rounded-2xl border border-white/[0.08] bg-black/20 p-3">
                              <p className="text-card-foreground/45 uppercase tracking-[0.18em] font-black">Avg Retry</p>
                              <p className="text-card-foreground font-black mt-2">{operations.analytics.summary.average_retry_count}</p>
                            </div>
                          </div>
                          <div className="mt-4 space-y-2">
                            {operations.analytics.terms.map((term) => (
                              <div key={term.key} className="rounded-xl border border-white/[0.08] bg-black/20 p-3 text-xs">
                                <div className="flex items-center justify-between gap-3">
                                  <p className="font-black text-card-foreground">Y{term.year_number} T{term.term_number}</p>
                                  <p className="text-card-foreground/60">{term.total_records} record(s)</p>
                                </div>
                                <div className="grid grid-cols-3 gap-2 mt-3 text-card-foreground/75">
                                  <div>Completion {term.completion_pct}%</div>
                                  <div>Score {term.average_practical_score}</div>
                                  <div>Retry {term.average_retry_count}</div>
                                </div>
                              </div>
                            ))}
                          </div>
                        </section>

                        <section className="rounded-[24px] border border-white/[0.08] bg-white/[0.03] p-4">
                          <p className="text-[11px] font-black uppercase tracking-[0.22em] text-card-foreground/45">Audit Visualization</p>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-4 text-xs">
                            <div className="rounded-2xl border border-white/[0.08] bg-black/20 p-3">
                              <p className="text-card-foreground/45 uppercase tracking-[0.18em] font-black">By Action</p>
                              <div className="mt-3 space-y-2">
                                {operations.audit.summary.by_action.map((row) => (
                                  <div key={row.action_type} className="flex items-center justify-between gap-3">
                                    <span className="text-card-foreground/70">{row.action_type}</span>
                                    <span className="font-black text-card-foreground">{row.count}</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                            <div className="rounded-2xl border border-white/[0.08] bg-black/20 p-3">
                              <p className="text-card-foreground/45 uppercase tracking-[0.18em] font-black">By Role</p>
                              <div className="mt-3 space-y-2">
                                {operations.audit.summary.by_role.map((row) => (
                                  <div key={row.actor_role} className="flex items-center justify-between gap-3">
                                    <span className="text-card-foreground/70">{row.actor_role}</span>
                                    <span className="font-black text-card-foreground">{row.count}</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          </div>
                          <div className="mt-4 rounded-2xl border border-white/[0.08] bg-black/20 p-3 max-h-[22rem] overflow-auto">
                            <div className="space-y-2">
                              {operations.audit.timeline.map((event) => (
                                <div key={event.id} className="rounded-xl border border-white/[0.08] p-3 text-xs">
                                  <div className="flex items-center justify-between gap-3">
                                    <p className="font-black text-card-foreground">{event.action_type}</p>
                                    <span className="text-card-foreground/55">{new Date(event.created_at).toLocaleString()}</span>
                                  </div>
                                  <p className="text-card-foreground/65 mt-1">
                                    {event.actor_role ?? 'unknown'} · Y{event.year_number ?? '-'} T{event.term_number ?? '-'} W{event.week_number ?? '-'}
                                  </p>
                                  {event.reason && <p className="text-card-foreground/75 mt-2 leading-relaxed">{event.reason}</p>}
                                </div>
                              ))}
                              {operations.audit.timeline.length === 0 && (
                                <p className="text-sm text-card-foreground/55">No audit activity for this lesson plan yet.</p>
                              )}
                            </div>
                          </div>
                        </section>
                      </div>
                    </>
                  )}
                </div>
              </div>

              <div className="bg-card border border-white/[0.08] rounded-[28px] overflow-hidden">
                <div className="p-5 sm:p-6 border-b border-white/[0.06] bg-[radial-gradient(circle_at_top_left,rgba(234,179,8,0.16),transparent_28%),radial-gradient(circle_at_top_right,rgba(34,197,94,0.12),transparent_28%),linear-gradient(180deg,rgba(255,255,255,0.05),rgba(255,255,255,0.01))]">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="max-w-2xl">
                      <p className="text-[11px] font-black uppercase tracking-[0.25em] text-amber-300/90">Syllabus QA</p>
                      <h3 className="text-xl sm:text-2xl font-black text-card-foreground mt-2">Coverage, rhythm, and 5-step compliance</h3>
                      <p className="text-sm text-card-foreground/65 mt-2 leading-relaxed">
                        This QA layer compares your generated lesson-plan route against the linked syllabus and flags missing week types, assessment drift, exam placement drift, and weak 5-step lesson structure.
                      </p>
                    </div>
                    <div className="grid grid-cols-2 gap-3 min-w-0 sm:min-w-[18rem]">
                      <div className="rounded-2xl border border-white/10 bg-black/20 p-3">
                        <p className="text-[10px] uppercase tracking-[0.2em] text-card-foreground/45 font-black">QA Score</p>
                        <p className="text-sm font-black text-card-foreground mt-1">{qaReport?.overall_score ?? 0}/100</p>
                      </div>
                      <div className="rounded-2xl border border-white/10 bg-black/20 p-3">
                        <p className="text-[10px] uppercase tracking-[0.2em] text-card-foreground/45 font-black">Coverage</p>
                        <p className="text-sm font-black text-card-foreground mt-1">{qaReport?.coverage_pct ?? 0}%</p>
                      </div>
                      <div className="rounded-2xl border border-white/10 bg-black/20 p-3">
                        <p className="text-[10px] uppercase tracking-[0.2em] text-card-foreground/45 font-black">Terms Checked</p>
                        <p className="text-sm font-black text-card-foreground mt-1">{qaReport?.total_terms ?? 0}</p>
                      </div>
                      <div className="rounded-2xl border border-white/10 bg-black/20 p-3">
                        <p className="text-[10px] uppercase tracking-[0.2em] text-card-foreground/45 font-black">Readiness</p>
                        <p className="text-sm font-black text-card-foreground mt-1">{qaReport?.overall_readiness ?? 'critical'}</p>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="p-5 sm:p-6 space-y-4">
                  {qaLoading && (
                    <div className="flex items-center gap-2 text-sm text-card-foreground/55">
                      <ArrowPathIcon className="w-4 h-4 animate-spin" /> Running syllabus QA...
                    </div>
                  )}
                  {qaError && !qaLoading && (
                    <div className="rounded-2xl border border-rose-400/25 bg-rose-500/[0.08] p-4 text-sm text-rose-200">
                      {qaError}
                    </div>
                  )}
                  {qaReport && !qaLoading && (
                    <>
                      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                        {qaReport.terms.map((term) => (
                          <div key={term.key} className="rounded-[24px] border border-white/[0.08] bg-white/[0.03] p-4">
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <p className="text-[11px] font-black uppercase tracking-[0.2em] text-card-foreground/45">
                                  Year {term.year_number} · Term {term.term_number}
                                </p>
                                <p className="text-lg font-black text-card-foreground mt-2">{term.score}/100</p>
                              </div>
                              <span className={`px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-[0.18em] ${
                                term.readiness === 'excellent'
                                  ? 'bg-emerald-500/15 text-emerald-200 border border-emerald-400/20'
                                  : term.readiness === 'good'
                                    ? 'bg-cyan-500/15 text-cyan-200 border border-cyan-400/20'
                                    : term.readiness === 'watch'
                                      ? 'bg-amber-500/15 text-amber-200 border border-amber-400/20'
                                      : 'bg-rose-500/15 text-rose-200 border border-rose-400/20'
                              }`}>
                                {term.readiness}
                              </span>
                            </div>
                            <div className="grid grid-cols-2 gap-3 mt-4 text-xs">
                              <div className="rounded-2xl border border-white/[0.08] bg-black/20 p-3">
                                <p className="text-card-foreground/45 uppercase tracking-[0.18em] font-black">Coverage</p>
                                <p className="text-card-foreground font-black mt-2">{term.coverage_pct}%</p>
                              </div>
                              <div className="rounded-2xl border border-white/[0.08] bg-black/20 p-3">
                                <p className="text-card-foreground/45 uppercase tracking-[0.18em] font-black">Weeks</p>
                                <p className="text-card-foreground font-black mt-2">{term.generated_weeks}/{term.syllabus_weeks}</p>
                              </div>
                              <div className="rounded-2xl border border-white/[0.08] bg-black/20 p-3">
                                <p className="text-card-foreground/45 uppercase tracking-[0.18em] font-black">Assessment Drift</p>
                                <p className="text-card-foreground font-black mt-2">{term.assessment_drift_count}</p>
                              </div>
                              <div className="rounded-2xl border border-white/[0.08] bg-black/20 p-3">
                                <p className="text-card-foreground/45 uppercase tracking-[0.18em] font-black">5-Step Breaks</p>
                                <p className="text-card-foreground font-black mt-2">{term.five_step_break_count}</p>
                              </div>
                            </div>
                            {term.issues.length > 0 && (
                              <div className="mt-4 space-y-2">
                                {term.issues.slice(0, 5).map((issue) => (
                                  <div key={issue.key} className="rounded-xl border border-white/[0.08] bg-black/20 p-3">
                                    <div className="flex items-center justify-between gap-3">
                                      <p className="text-xs font-black text-card-foreground">
                                        {issue.week ? `Week ${issue.week}` : 'Term rule'}
                                      </p>
                                      <span className={`text-[10px] font-black uppercase tracking-[0.18em] ${
                                        issue.severity === 'fail'
                                          ? 'text-rose-200'
                                          : issue.severity === 'warn'
                                            ? 'text-amber-200'
                                            : 'text-cyan-200'
                                      }`}>
                                        {issue.severity}
                                      </span>
                                    </div>
                                    <p className="text-xs text-card-foreground/70 mt-2 leading-relaxed">{issue.message}</p>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                      {qaReport.issues.length > 0 && (
                        <div className="rounded-[24px] border border-white/[0.08] bg-white/[0.03] p-4">
                          <p className="text-[11px] font-black uppercase tracking-[0.22em] text-card-foreground/45">Global QA Flags</p>
                          <div className="mt-3 space-y-2">
                            {qaReport.issues.slice(0, 8).map((issue) => (
                              <div key={issue.key} className="rounded-xl border border-white/[0.08] bg-black/20 p-3">
                                <p className="text-xs text-card-foreground/75">{issue.message}</p>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>

              <div className="bg-card border border-white/[0.08] rounded-[28px] overflow-hidden">
                <div className="relative p-5 sm:p-6 border-b border-white/[0.06] bg-[radial-gradient(circle_at_top_left,rgba(56,189,248,0.18),transparent_32%),radial-gradient(circle_at_top_right,rgba(167,139,250,0.16),transparent_30%),linear-gradient(180deg,rgba(255,255,255,0.05),rgba(255,255,255,0.01))]">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="max-w-2xl">
                      <p className="text-[11px] font-black uppercase tracking-[0.25em] text-cyan-300/90">Progression Builder</p>
                      <h3 className="text-xl sm:text-2xl font-black text-card-foreground mt-2">Design the route, preview the output, then generate with confidence.</h3>
                      <p className="text-sm text-card-foreground/65 mt-2 leading-relaxed">
                        This builder keeps curriculum, progression, and daily lesson generation aligned. Choose scope, tune the route, preview the impact, then publish the structure your content tools will use.
                      </p>
                    </div>
                    <div className="grid grid-cols-2 gap-3 min-w-0 sm:min-w-[18rem]">
                      <div className="rounded-2xl border border-white/10 bg-black/20 p-3">
                        <p className="text-[10px] uppercase tracking-[0.2em] text-card-foreground/45 font-black">Current Scope</p>
                        <p className="text-sm font-black text-card-foreground mt-1">{builderScopeLabel}</p>
                      </div>
                      <div className="rounded-2xl border border-white/10 bg-black/20 p-3">
                        <p className="text-[10px] uppercase tracking-[0.2em] text-card-foreground/45 font-black">Weeks / Term</p>
                        <p className="text-sm font-black text-card-foreground mt-1">{builderWeeksCount}</p>
                      </div>
                      <div className="rounded-2xl border border-white/10 bg-black/20 p-3">
                        <p className="text-[10px] uppercase tracking-[0.2em] text-card-foreground/45 font-black">Registry Guide</p>
                        <p className="text-sm font-black text-card-foreground mt-1">{guideData?.track ?? 'Ready on open'}</p>
                      </div>
                      <div className="rounded-2xl border border-white/10 bg-black/20 p-3">
                        <p className="text-[10px] uppercase tracking-[0.2em] text-card-foreground/45 font-black">Mode</p>
                        <p className="text-sm font-black text-card-foreground mt-1">{progressionOverwrite ? 'Replace existing' : 'Preserve existing'}</p>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="p-5 sm:p-6 space-y-5">
                  {canGenerateProgression ? (
                    <>
                      <div className="grid grid-cols-1 xl:grid-cols-[1.4fr_1fr] gap-5">
                        <section className="rounded-[24px] border border-white/[0.08] bg-white/[0.03] p-4 sm:p-5">
                          <div className="flex items-center justify-between gap-3 mb-4">
                            <div>
                              <p className="text-[11px] font-black uppercase tracking-[0.22em] text-card-foreground/45">Step 1</p>
                              <h4 className="text-base font-black text-card-foreground mt-1">Choose the build scope</h4>
                            </div>
                            <Link
                              href="/dashboard/progression/policies"
                              className="inline-flex items-center gap-2 px-3 py-2 bg-white/5 hover:bg-white/10 border border-white/10 text-card-foreground text-xs font-black rounded-xl transition-all"
                            >
                              Policy Controls
                            </Link>
                          </div>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            {PROGRESSION_SCOPE_OPTIONS.map((option) => {
                              const active = progressionScope === option.id;
                              return (
                                <button
                                  key={option.id}
                                  type="button"
                                  onClick={() => setProgressionScope(option.id)}
                                  className={`text-left rounded-[20px] border p-4 transition-all ${
                                    active
                                      ? 'border-cyan-400/70 bg-cyan-500/[0.12] shadow-[0_0_0_1px_rgba(34,211,238,0.15)]'
                                      : 'border-white/[0.08] bg-black/20 hover:bg-white/[0.04]'
                                  }`}
                                >
                                  <p className={`text-[10px] font-black uppercase tracking-[0.22em] ${active ? 'text-cyan-200' : 'text-card-foreground/45'}`}>{option.eyebrow}</p>
                                  <p className="text-sm font-black text-card-foreground mt-2">{option.title}</p>
                                  <p className="text-xs text-card-foreground/60 mt-2 leading-relaxed">{option.description}</p>
                                </button>
                              );
                            })}
                          </div>
                        </section>

                        <section className="rounded-[24px] border border-white/[0.08] bg-zinc-950/60 p-4 sm:p-5">
                          <p className="text-[11px] font-black uppercase tracking-[0.22em] text-card-foreground/45">Step 2</p>
                          <h4 className="text-base font-black text-card-foreground mt-1">Configure the route</h4>
                          <p className="text-xs text-card-foreground/60 mt-2 leading-relaxed">
                            {selectedScopeConfig.description} The builder follows linked curriculum weeks first, then your school progression policy.
                          </p>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-4">
                            {(progressionScope === 'week' || progressionScope === 'term') && (
                              <label className="block">
                                <span className="block text-[10px] font-black uppercase tracking-[0.2em] text-card-foreground/45 mb-2">Year</span>
                                <input
                                  type="number"
                                  min={1}
                                  max={10}
                                  value={progressionYear}
                                  onChange={(e) => setProgressionYear(Math.min(Math.max(Number(e.target.value || 1), 1), 10))}
                                  className="w-full px-3 py-2.5 bg-background border border-border rounded-2xl text-sm font-bold"
                                />
                              </label>
                            )}
                            {(progressionScope === 'week' || progressionScope === 'term') && (
                              <label className="block">
                                <span className="block text-[10px] font-black uppercase tracking-[0.2em] text-card-foreground/45 mb-2">Term</span>
                                <input
                                  type="number"
                                  min={1}
                                  max={3}
                                  value={progressionTerm}
                                  onChange={(e) => setProgressionTerm(Math.min(Math.max(Number(e.target.value || 1), 1), 3))}
                                  className="w-full px-3 py-2.5 bg-background border border-border rounded-2xl text-sm font-bold"
                                />
                              </label>
                            )}
                            {progressionScope === 'week' && (
                              <label className="block">
                                <span className="block text-[10px] font-black uppercase tracking-[0.2em] text-card-foreground/45 mb-2">Week</span>
                                <input
                                  type="number"
                                  min={1}
                                  max={200}
                                  value={progressionWeek}
                                  onChange={(e) => setProgressionWeek(Math.min(Math.max(Number(e.target.value || 1), 1), 200))}
                                  className="w-full px-3 py-2.5 bg-background border border-border rounded-2xl text-sm font-bold"
                                />
                              </label>
                            )}
                            {progressionScope === 'session' && (
                              <label className="block">
                                <span className="block text-[10px] font-black uppercase tracking-[0.2em] text-card-foreground/45 mb-2">Session / Year</span>
                                <input
                                  type="number"
                                  min={1}
                                  max={10}
                                  value={progressionSession}
                                  onChange={(e) => setProgressionSession(Math.min(Math.max(Number(e.target.value || 1), 1), 10))}
                                  className="w-full px-3 py-2.5 bg-background border border-border rounded-2xl text-sm font-bold"
                                />
                              </label>
                            )}
                            <div className="rounded-2xl border border-white/[0.08] bg-black/20 p-3 sm:col-span-2">
                              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-card-foreground/45">Execution mode</p>
                              <label className="mt-3 flex items-start gap-3 cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={progressionOverwrite}
                                  onChange={(e) => setProgressionOverwrite(e.target.checked)}
                                  className="mt-1"
                                />
                                <span className="text-sm text-card-foreground/75 leading-relaxed">
                                  Replace existing generated terms for this scope instead of preserving the current route.
                                </span>
                              </label>
                            </div>
                          </div>
                        </section>
                      </div>

                      <div className="grid grid-cols-1 xl:grid-cols-[1.15fr_0.85fr] gap-5">
                        <section className="rounded-[24px] border border-white/[0.08] bg-white/[0.03] p-4 sm:p-5">
                          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                            <div>
                              <p className="text-[11px] font-black uppercase tracking-[0.22em] text-card-foreground/45">Step 3</p>
                              <h4 className="text-base font-black text-card-foreground mt-1">Preview and readiness</h4>
                              <p className="text-xs text-card-foreground/60 mt-2">Validate seeds, policy, curriculum fit, and generation impact before this route is allowed to write into the plan.</p>
                            </div>
                            <button
                              type="button"
                              onClick={() => previewProgressionBuilder()}
                              disabled={generating !== null}
                              className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-sm font-black rounded-2xl transition-all"
                            >
                              <SparklesIcon className="w-4 h-4" /> Run Preview
                            </button>
                          </div>

                          <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
                            {builderReadiness.map((item) => (
                              <div
                                key={item.key}
                                className={`rounded-2xl border p-3 ${
                                  item.status === 'fail'
                                    ? 'border-rose-400/25 bg-rose-500/[0.08]'
                                    : item.status === 'warn'
                                      ? 'border-amber-400/25 bg-amber-500/[0.08]'
                                      : 'border-emerald-400/20 bg-emerald-500/[0.07]'
                                }`}
                              >
                                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-card-foreground/45">{item.label}</p>
                                <p className={`text-sm font-black mt-2 ${
                                  item.status === 'fail'
                                    ? 'text-rose-200'
                                    : item.status === 'warn'
                                      ? 'text-amber-200'
                                      : 'text-emerald-200'
                                }`}>
                                  {item.status === 'fail' ? 'Needs attention' : item.status === 'warn' ? 'Watch closely' : 'Ready'}
                                </p>
                                <p className="text-xs text-card-foreground/70 mt-2 leading-relaxed">{item.detail}</p>
                              </div>
                            ))}
                          </div>

                          {progressionPreview ? (
                            <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                              <div className="rounded-2xl border border-white/[0.08] bg-black/20 p-3">
                                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-card-foreground/45">Terms</p>
                                <p className="text-lg font-black text-card-foreground mt-2">{progressionPreview.projected_terms?.length ?? 0}</p>
                              </div>
                              <div className="rounded-2xl border border-white/[0.08] bg-black/20 p-3">
                                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-card-foreground/45">Project Weeks</p>
                                <p className="text-lg font-black text-card-foreground mt-2">{progressionPreview.projected_projects ?? 0}</p>
                              </div>
                              <div className="rounded-2xl border border-white/[0.08] bg-black/20 p-3">
                                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-card-foreground/45">Assignments</p>
                                <p className="text-lg font-black text-card-foreground mt-2">{progressionPreview.projected_assignments ?? 0}</p>
                              </div>
                              <div className="rounded-2xl border border-white/[0.08] bg-black/20 p-3">
                                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-card-foreground/45">Repetition Risk</p>
                                <p className={`text-lg font-black mt-2 ${
                                  progressionPreview.repetition_risk === 'high'
                                    ? 'text-rose-300'
                                    : progressionPreview.repetition_risk === 'medium'
                                      ? 'text-amber-300'
                                      : 'text-emerald-300'
                                }`}>{progressionPreview.repetition_risk ?? 'low'}</p>
                              </div>
                            </div>
                          ) : (
                            <div className="mt-4 rounded-2xl border border-dashed border-white/[0.12] bg-black/20 p-4 text-sm text-card-foreground/55">
                              No preview yet. Run preview to inspect the generated scope before writing it into the plan.
                            </div>
                          )}

                          {progressionPreview?.preflight && (
                            <div className={`mt-4 rounded-2xl border p-4 ${
                              progressionPreview.preflight.blocking
                                ? 'border-rose-400/25 bg-rose-500/[0.08]'
                                : progressionPreview.preflight.status === 'warning'
                                  ? 'border-amber-400/25 bg-amber-500/[0.08]'
                                  : 'border-emerald-400/20 bg-emerald-500/[0.07]'
                            }`}>
                              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                                <div>
                                  <p className="text-[11px] font-black uppercase tracking-[0.22em] text-card-foreground/45">Hard preflight</p>
                                  <p className="text-sm font-black text-card-foreground mt-1">
                                    {progressionPreview.preflight.blocking
                                      ? 'Generation is blocked until these issues are fixed.'
                                      : progressionPreview.preflight.status === 'warning'
                                        ? 'Generation can continue, but the builder found setup gaps.'
                                        : 'All critical readiness checks passed.'}
                                  </p>
                                </div>
                                <p className="text-xs text-card-foreground/65">
                                  Pass {progressionPreview.preflight.summary.pass} · Warn {progressionPreview.preflight.summary.warn} · Fail {progressionPreview.preflight.summary.fail}
                                </p>
                              </div>
                              <div className="mt-3 space-y-2">
                                {preflightChecks.map((check) => (
                                  <div key={check.key} className="rounded-xl border border-white/[0.08] bg-black/20 p-3">
                                    <div className="flex items-center justify-between gap-3">
                                      <p className="text-xs font-black text-card-foreground">{check.label}</p>
                                      <span className={`text-[10px] font-black uppercase tracking-[0.18em] ${
                                        check.status === 'fail'
                                          ? 'text-rose-200'
                                          : check.status === 'warn'
                                            ? 'text-amber-200'
                                            : 'text-emerald-200'
                                      }`}>
                                        {check.status}
                                      </span>
                                    </div>
                                    <p className="text-xs text-card-foreground/70 mt-2 leading-relaxed">{check.detail}</p>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {progressionPreview?.policy_runtime && (
                            <div className="mt-4 rounded-2xl border border-white/[0.08] bg-black/20 p-4">
                              <p className="text-[11px] font-black uppercase tracking-[0.22em] text-card-foreground/45">Policy runtime</p>
                              <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-card-foreground/75">
                                <span className="rounded-full border border-white/[0.08] px-2.5 py-1">Strict route: {progressionPreview.policy_runtime.strict_route ? 'on' : 'off'}</span>
                                <span className="rounded-full border border-white/[0.08] px-2.5 py-1">Project based: {progressionPreview.policy_runtime.project_based ? 'on' : 'off'}</span>
                                <span className="rounded-full border border-white/[0.08] px-2.5 py-1">Essential only: {progressionPreview.policy_runtime.essential_routes_only ? 'on' : 'off'}</span>
                                <span className="rounded-full border border-white/[0.08] px-2.5 py-1">Weeks/term: {progressionPreview.policy_runtime.standard_weeks_per_term ?? builderWeeksCount}</span>
                                {progressionPreview.policy_runtime.track_candidates?.length ? (
                                  <span className="rounded-full border border-white/[0.08] px-2.5 py-1">
                                    Track order: {progressionPreview.policy_runtime.track_candidates.join(' → ')}
                                  </span>
                                ) : null}
                              </div>
                            </div>
                          )}

                          {progressionPreview?.warnings && progressionPreview.warnings.length > 0 && (
                            <div className="mt-4 rounded-2xl border border-amber-400/20 bg-amber-500/[0.08] p-4">
                              <p className="text-[11px] font-black uppercase tracking-[0.22em] text-amber-200">Warnings</p>
                              <div className="mt-2 space-y-1">
                                {progressionPreview.warnings.map((warning, index) => (
                                  <p key={`${warning}-${index}`} className="text-xs text-amber-100/85">{warning}</p>
                                ))}
                              </div>
                            </div>
                          )}
                        </section>

                        <section className="rounded-[24px] border border-white/[0.08] bg-zinc-950/60 p-4 sm:p-5">
                          <p className="text-[11px] font-black uppercase tracking-[0.22em] text-card-foreground/45">Step 4</p>
                          <h4 className="text-base font-black text-card-foreground mt-1">Execute and control</h4>
                          <div className="mt-4 space-y-3">
                            <button
                              type="button"
                              onClick={runProgressionBuilder}
                              disabled={generating !== null || hasBlockingPreflight}
                              className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-white text-sm font-black rounded-2xl transition-all"
                            >
                              <SparklesIcon className="w-4 h-4" /> Generate {selectedScopeConfig.title}
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setProgressionScope('full_program');
                                setProgressionPreview(null);
                              }}
                              disabled={generating !== null}
                              className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 bg-indigo-600/90 hover:bg-indigo-500 disabled:opacity-50 text-white text-sm font-black rounded-2xl transition-all"
                            >
                              <BookOpenIcon className="w-4 h-4" /> Switch To 3-Year Build
                            </button>
                          </div>

                          <div className="mt-4 rounded-2xl border border-white/[0.08] bg-black/20 p-4">
                            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-card-foreground/45">Current execution</p>
                            <p className="text-sm font-black text-card-foreground mt-2">{builderScopeLabel}</p>
                            <p className="text-xs text-card-foreground/60 mt-2 leading-relaxed">
                              {progressionOverwrite ? 'Existing generated terms in this scope will be replaced.' : 'Existing generated terms will be preserved unless the target slot is empty.'}
                            </p>
                            {hasBlockingPreflight && (
                              <p className="text-xs text-rose-300 mt-2">Preview has blocking issues, so generation is paused until those gaps are fixed.</p>
                            )}
                          </div>

                          <div className="mt-4 rounded-2xl border border-white/[0.08] bg-black/20 p-4">
                            <p className="text-[11px] font-black uppercase tracking-[0.22em] text-card-foreground/45">Connected operations</p>
                            <div className="grid grid-cols-2 gap-2 mt-3">
                              {builderQuickLinks.map((item) => (
                                <Link
                                  key={item.label}
                                  href={item.href}
                                  className="inline-flex items-center justify-center px-3 py-2.5 text-xs font-black rounded-2xl border border-white/[0.08] bg-white/[0.03] hover:bg-white/[0.06] text-card-foreground transition-all"
                                >
                                  {item.label}
                                </Link>
                              ))}
                            </div>
                          </div>

                          <div className="mt-4 rounded-2xl border border-white/[0.08] bg-black/20 p-4">
                            <p className="text-[11px] font-black uppercase tracking-[0.22em] text-card-foreground/45">Schedule and release</p>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-3">
                              <button
                                type="button"
                                onClick={activateTermSchedule}
                                disabled={scheduleSaving}
                                className="px-3 py-2.5 text-xs font-black rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white disabled:opacity-50"
                              >
                                {scheduleSaving ? 'Activating...' : 'Activate Scheduler'}
                              </button>
                              <button
                                type="button"
                                onClick={releaseProgressionWeek}
                                disabled={releaseSaving}
                                className="px-3 py-2.5 text-xs font-black rounded-2xl bg-fuchsia-600 hover:bg-fuchsia-500 text-white disabled:opacity-50"
                              >
                                {releaseSaving ? `Releasing W${progressionWeek}...` : `Release Week ${progressionWeek}`}
                              </button>
                            </div>
                            <p className="text-xs text-card-foreground/60 mt-3 leading-relaxed">
                              Scheduler uses the plan term start date and weekly cadence. Week release publishes the selected week&apos;s lessons and assignments.
                            </p>
                          </div>

                          <div className="mt-4 rounded-2xl border border-white/[0.08] bg-black/20 p-4">
                            <p className="text-[11px] font-black uppercase tracking-[0.22em] text-card-foreground/45">Term lock workflow</p>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
                              <input
                                type="number"
                                min={1}
                                max={10}
                                value={statusYear}
                                onChange={(e) => setStatusYear(Math.min(Math.max(Number(e.target.value || 1), 1), 10))}
                                className="px-3 py-2.5 bg-background border border-border rounded-2xl text-sm font-bold"
                                placeholder="Year"
                              />
                              <input
                                type="number"
                                min={1}
                                max={3}
                                value={statusTerm}
                                onChange={(e) => setStatusTerm(Math.min(Math.max(Number(e.target.value || 1), 1), 3))}
                                className="px-3 py-2.5 bg-background border border-border rounded-2xl text-sm font-bold"
                                placeholder="Term"
                              />
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mt-3">
                              <button
                                type="button"
                                onClick={() => updateTermStatus('draft')}
                                disabled={statusSaving}
                                className="px-3 py-2.5 text-xs font-black rounded-2xl bg-zinc-600 hover:bg-zinc-500 text-white disabled:opacity-50"
                              >
                                Set Draft
                              </button>
                              <button
                                type="button"
                                onClick={() => updateTermStatus('approved')}
                                disabled={statusSaving}
                                className="px-3 py-2.5 text-xs font-black rounded-2xl bg-blue-600 hover:bg-blue-500 text-white disabled:opacity-50"
                              >
                                Set Approved
                              </button>
                              <button
                                type="button"
                                onClick={() => updateTermStatus('locked')}
                                disabled={statusSaving}
                                className="px-3 py-2.5 text-xs font-black rounded-2xl bg-amber-600 hover:bg-amber-500 text-white disabled:opacity-50"
                              >
                                Set Locked
                              </button>
                            </div>
                          </div>
                        </section>
                      </div>

                      <section className="rounded-[24px] border border-white/[0.08] bg-white/[0.03] p-4 sm:p-5">
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                          <div>
                            <p className="text-[11px] font-black uppercase tracking-[0.22em] text-card-foreground/45">Step 5</p>
                            <h4 className="text-base font-black text-card-foreground mt-1">Generate day-to-day content</h4>
                            <p className="text-xs text-card-foreground/60 mt-2">Once the route is ready, create lessons, assignments, and projects from the same plan.</p>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            <button
                              onClick={() => bulkGenerate('lessons')}
                              disabled={generating !== null}
                              className="flex items-center gap-2 px-4 py-2.5 bg-violet-500 hover:bg-violet-400 disabled:opacity-50 text-white text-sm font-black rounded-2xl transition-all"
                            >
                              <SparklesIcon className="w-4 h-4" /> Generate Lessons
                            </button>
                            <button
                              onClick={() => bulkGenerate('assignments')}
                              disabled={generating !== null}
                              className="flex items-center gap-2 px-4 py-2.5 bg-blue-500 hover:bg-blue-400 disabled:opacity-50 text-white text-sm font-black rounded-2xl transition-all"
                            >
                              <SparklesIcon className="w-4 h-4" /> Generate Assignments
                            </button>
                            <button
                              onClick={() => bulkGenerate('projects')}
                              disabled={generating !== null}
                              className="flex items-center gap-2 px-4 py-2.5 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-white text-sm font-black rounded-2xl transition-all"
                            >
                              <SparklesIcon className="w-4 h-4" /> Generate Projects
                            </button>
                            <button
                              onClick={() => bulkGenerate('cbt')}
                              disabled={generating !== null}
                              className="flex items-center gap-2 px-4 py-2.5 bg-orange-500 hover:bg-orange-400 disabled:opacity-50 text-white text-sm font-black rounded-2xl transition-all"
                            >
                              <SparklesIcon className="w-4 h-4" /> Generate CBTs
                            </button>
                            <button
                              onClick={() => bulkGenerate('flashcards')}
                              disabled={generating !== null}
                              className="flex items-center gap-2 px-4 py-2.5 bg-yellow-500 hover:bg-yellow-400 disabled:opacity-50 text-white text-sm font-black rounded-2xl transition-all"
                            >
                              <SparklesIcon className="w-4 h-4" /> Generate Flashcards
                            </button>
                          </div>
                        </div>
                      </section>
                    </>
                  ) : (
                    <div className="p-4 rounded-2xl border border-white/[0.08] bg-white/[0.03] text-sm text-card-foreground/60">
                      Only teachers and admins can open the progression builder for this plan.
                    </div>
                  )}

                  {genProgress && (
                    <div className="space-y-1">
                      <div className="flex items-center justify-between text-xs text-card-foreground/70">
                        <span>{genProgress.status}</span>
                        <span>{genProgress.generated} / {genProgress.total}</span>
                      </div>
                      <div className="w-full bg-white/5 rounded-full h-2 overflow-hidden">
                        <div
                          className="bg-violet-500 h-full transition-all duration-300"
                          style={{ width: `${(genProgress.generated / genProgress.total) * 100}%` }}
                        />
                      </div>
                    </div>
                  )}
                </div>
              </div>

            </>
          )}

          <div className="bg-card border border-white/[0.08] rounded-2xl p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-black text-card-foreground">Content Overview</h3>
              {linkedLessons.length > 0 && (
                <Link
                  href={`/dashboard/lessons?lesson_plan_id=${id}`}
                  className="text-xs text-violet-400 hover:text-violet-300 font-bold transition-colors"
                >
                  View all {linkedLessons.length} lesson{linkedLessons.length !== 1 ? 's' : ''} →
                </Link>
              )}
            </div>
            {weeks.length === 0 ? (
              <p className="text-card-foreground/40 text-sm">No weeks defined yet.</p>
            ) : (
              <div className="space-y-2">
                {weeks.map(w => {
                  const weekLesson = linkedLessons.find(l => l.metadata?.week === w.week);
                  const addLessonHref = buildPlanWeekCreateLessonUrl({ plan, week: w, courseTitle });
                  return (
                    <div key={w.week} className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 p-3 bg-white/5 rounded-xl">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-xs font-black text-violet-400">Week {w.week}</span>
                          {w.completed && <span className="text-[10px] font-black text-emerald-300">✓ Completed</span>}
                          <span className="text-sm text-card-foreground truncate">{w.topic}</span>
                        </div>
                        <div className="flex gap-3 text-xs text-card-foreground/50">
                          {weekLesson ? (
                            <Link
                              href={`/dashboard/lessons/${weekLesson.id}`}
                              className="text-emerald-400 font-bold hover:text-emerald-300 transition-colors"
                            >
                              ✓ Lesson ({weekLesson.status})
                            </Link>
                          ) : (
                            <span className="text-card-foreground/30">No lesson yet</span>
                          )}
                        </div>
                      </div>
                      {!weekLesson && (
                        <Link
                          href={addLessonHref}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] font-bold border border-emerald-500/30 text-emerald-400 rounded-md hover:bg-emerald-500/10 transition-colors whitespace-nowrap min-h-[36px]"
                          title="Create lesson for this week"
                        >
                          <SparklesIcon className="w-3.5 h-3.5" />
                          Create Lesson
                        </Link>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
