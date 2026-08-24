// @refresh reset
"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { buildCurriculumHref } from "@/lib/curriculum/href";
import { useAuth } from "@/contexts/auth-context";
import ThisWeekPanel from "@/components/lesson-plans/ThisWeekPanel";
import {
  ArrowLeftIcon,
  PencilIcon,
  CheckCircleIcon,
  PrinterIcon,
  PlusIcon,
  TrashIcon,
  ArrowPathIcon,
  BookOpenIcon,
  SparklesIcon,
  BoltIcon,
  LockOpenIcon,
  XMarkIcon,
  TrophyIcon,
  AcademicCapIcon,
  ArrowUpTrayIcon,
  ClipboardDocumentListIcon,
  RocketLaunchIcon,
  StarIcon,
} from "@/lib/icons";
import { toast } from "sonner";
import PipelineStepper from "@/components/pipeline/PipelineStepper";
import {
  SyllabusPreview,
  type SyllabusContent,
} from "@/components/curriculum/SyllabusPreview";
import WeekAIGenerator from "@/components/ai/WeekAIGenerator";
import {
  DEFAULT_AUTO_GENERATE_SETTINGS,
  WEEK_CONTENT_TYPES,
  WEEK_CONTENT_TYPE_LABELS,
  describeAutoGenerateSettings,
  parseAutoGenerateSettings,
  type AutoGenerateSettings,
} from "@/lib/academic/auto-generate-settings";
import { requestTrackedWeekGeneration } from "@/lib/academic/week-generation-client";
import { MOBILE_PAGE_BOTTOM } from '@/components/mobile/mobile-styles';
import {
  buildAddLessonQueryFromCurriculum,
  type CurriculumWeekPlanSlice,
} from "@/lib/curriculum/add-lesson-from-curriculum";
import { brandContact } from "@/config/brand";
import {
  findSyllabusWeek,
  inferTermNumberFromPlanTerm,
  type SyllabusContentImport,
} from "@/lib/lesson-plans/syllabusImport";

interface WeekEntry {
  week: number;
  session?: number;
  session_number?: number;
  topic: string;
  completed?: boolean;
  mastery_mode?: "strict" | "soft";
  gating_state?: "locked" | "unlocked" | "mastered";
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
  syllabus_ref?: {
    year_number?: number | null;
    term_number?: number | null;
    week_number?: number | null;
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
  plan_data?: { weeks?: WeekEntry[]; curriculum_year?: number } | null;
  metadata?: Record<string, unknown> | null;
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
  curriculum?: {
    id: string;
    version: number;
    course_id?: string;
    content?: unknown;
    school_id?: string | null;
  } | null;
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
    const cy = plan.plan_data?.curriculum_year ?? 1;
    const syWeek = findSyllabusWeek(content, tn, w.week, cy);
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
        classwork: lp.classwork as CurriculumWeekPlanSlice["classwork"],
        resources: lp.resources,
        engagement_tips: lp.engagement_tips,
        assignment: lp.assignment as CurriculumWeekPlanSlice["assignment"],
        project: lp.project as CurriculumWeekPlanSlice["project"],
      };
    } else if (w.objectives?.trim() || w.activities?.trim()) {
      planSlice = {
        objectives: (w.objectives ?? "")
          .split(/[,\n]/)
          .map((s) => s.trim())
          .filter(Boolean),
        student_activities: w.activities?.trim()
          ? [w.activities.trim()]
          : undefined,
      };
    }

    const params = buildAddLessonQueryFromCurriculum({
      curriculumId: plan.curriculum_version_id,
      term: tn,
      weekNumber: w.week,
      courseId: plan.course_id,
      programId: plan.courses?.program_id ?? undefined,
      title: (w.topic || `Week ${w.week}`).slice(0, 240),
      description: [w.objectives, w.activities]
        .filter(Boolean)
        .join("\n\n")
        .slice(0, 800),
      durationMinutes:
        typeof lp?.duration_minutes === "number" &&
        Number.isFinite(lp.duration_minutes)
          ? Math.min(240, Math.max(15, lp.duration_minutes))
          : 60,
      plan: planSlice,
    });
    params.set("lesson_plan_id", plan.id);
    const session = Number(w.session ?? w.session_number ?? 0);
    if (Number.isInteger(session) && session > 0) {
      params.set("session", String(session));
    }
    params.set("flow_origin", "lesson-plan");
    return `/dashboard/lessons/add?${params.toString()}`;
  }

  const weekDescription = [w.objectives, w.activities]
    .filter(Boolean)
    .join("\n\n");
  const weekNotes = [
    w.notes ? `Teacher Notes:\n${w.notes}` : null,
    w.objectives ? `Learning Objectives:\n${w.objectives}` : null,
    w.activities ? `Planned Activities:\n${w.activities}` : null,
  ]
    .filter(Boolean)
    .join("\n\n");
  return (
    `/dashboard/lessons/add?` +
    new URLSearchParams({
      lesson_plan_id: plan.id,
      week: String(w.week),
      ...((w.session ?? w.session_number)
        ? { session: String(w.session ?? w.session_number) }
        : {}),
      ...(plan.course_id ? { course_id: plan.course_id } : {}),
      ...(w.topic ? { title: w.topic } : {}),
      ...(w.topic ? { topic: w.topic } : {}),
      ...(courseTitle ? { subject: courseTitle } : {}),
      ...(weekDescription
        ? { description: weekDescription.slice(0, 2000) }
        : {}),
      ...(weekNotes ? { lesson_notes: weekNotes.slice(0, 8000) } : {}),
      flow_origin: "lesson-plan",
    }).toString()
  );
}

function buildPlanWeekCreateCbtUrl(opts: {
  plan: LessonPlan;
  week: WeekEntry;
  courseTitle: string;
}): string {
  const { plan, week: w } = opts;
  const q = new URLSearchParams({
    course_id: plan.course_id ?? "",
    program_id: plan.courses?.program_id ?? "",
    curriculum_id: plan.curriculum_version_id ?? "",
    week: String(w.week),
    topic: w.topic || "",
    minimal: "true",
  });
  const isAssessmentWeek = [3, 6].includes(w.week);
  const isExamWeek = w.week >= 8;
  if (isExamWeek || isAssessmentWeek) {
    q.set("exam_type", "examination");
  } else {
    q.set("exam_type", "evaluation");
  }
  return `/dashboard/cbt/new?${q.toString()}`;
}

function buildPlanWeekFlashcardUrl(opts: {
  plan: LessonPlan;
  week: WeekEntry;
}): string {
  const { plan, week: w } = opts;
  const q = new URLSearchParams({
    course_id: plan.course_id ?? "",
    lesson_plan_id: plan.id,
    program_id: plan.courses?.program_id ?? "",
    curriculum_id: plan.curriculum_version_id ?? "",
    week: String(w.week),
    topic: w.topic || "",
    source: "lesson-plan-week",
  });
  return `/dashboard/flashcards?${q.toString()}`;
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
  repetition_risk?: "low" | "medium" | "high";
  warnings?: string[];
  preflight?: {
    status: "ready" | "warning" | "blocked";
    blocking: boolean;
    summary: {
      pass: number;
      warn: number;
      fail: number;
    };
    checks: Array<{
      key: string;
      label: string;
      status: "pass" | "warn" | "fail";
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
type ProgressionScope = "week" | "term" | "session" | "full_program";

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
  overall_readiness: "excellent" | "good" | "watch" | "critical";
  coverage_pct: number;
  total_terms: number;
  issues: Array<{
    key: string;
    severity: "info" | "warn" | "fail";
    message: string;
    week?: number | null;
  }>;
  terms: Array<{
    key: string;
    year_number: number;
    term_number: number;
    score: number;
    coverage_pct: number;
    readiness: "excellent" | "good" | "watch" | "critical";
    generated_weeks: number;
    syllabus_weeks: number;
    missing_week_types: number;
    assessment_drift_count: number;
    exam_drift_count: number;
    five_step_break_count: number;
    issues: Array<{
      key: string;
      severity: "info" | "warn" | "fail";
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
    session_number: number;
    topic: string;
    release_status: "pending" | "draft" | "partial" | "released";
    prepared_count: number;
    total_count: 5;
    missing_assets: string[];
    held_assets: string[];
    lessons_total: number;
    lessons_published: number;
    assignments_total: number;
    assignments_active: number;
    projects_total: number;
    projects_active: number;
    slides_total: number;
    slides_public: number;
    flashcards_total: number;
    flashcards_public: number;
    latest_release_at: string | null;
    history: Array<{ type: string; at: string; status: string }>;
  }>;
  generation: {
    available: boolean;
    state: "idle" | "running" | "healthy" | "attention";
    message: string;
    week: number | null;
    session: number | null;
    failedTypes: string[];
    lastAttemptAt: string | null;
  };
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
  draft: ["published"],
  published: ["archived"],
  archived: [],
};

const STATUS_BADGE: Record<string, { label: string; cls: string }> = {
  draft: {
    label: "Draft",
    cls: "bg-zinc-500/20 text-muted-foreground/70 border-zinc-500/30",
  },
  published: {
    label: "Published",
    cls: "bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border-emerald-500/30",
  },
  archived: {
    label: "Archived",
    cls: "bg-amber-500/20 text-amber-600 dark:text-amber-400 border-amber-500/30",
  },
};

function metadataMatchesWeek(
  metadata: Record<string, unknown> | null | undefined,
  week: WeekEntry
): boolean {
  const weekNumber = Number(metadata?.week_number ?? metadata?.week ?? -1);
  if (weekNumber !== week.week) return false;

  const weekYear = Number(week.syllabus_ref?.year_number ?? 0);
  const weekTerm = Number(week.syllabus_ref?.term_number ?? 0);
  const metadataYear = Number(metadata?.year_number ?? 0);
  const metadataTerm = Number(metadata?.term_number ?? 0);

  const yearMatches = !weekYear || !metadataYear || weekYear === metadataYear;
  const termMatches = !weekTerm || !metadataTerm || weekTerm === metadataTerm;
  return yearMatches && termMatches;
}

const PROGRESSION_SCOPE_OPTIONS: Array<{
  id: ProgressionScope;
  title: string;
  eyebrow: string;
  description: string;
}> = [
  {
    id: "week",
    title: "Single Week",
    eyebrow: "Precise repair",
    description: "Generate or replace one week in a specific year and term.",
  },
  {
    id: "term",
    title: "Single Term",
    eyebrow: "Focused build",
    description: "Build one term route with curriculum-aligned week structure.",
  },
  {
    id: "session",
    title: "Full Session",
    eyebrow: "Three-term build",
    description: "Generate all three terms for one academic session/year.",
  },
  {
    id: "full_program",
    title: "Three Years",
    eyebrow: "Whole pathway",
    description: "Auto-build the full 3-year teaching map end to end.",
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
  const [weekPanelOpen, setWeekPanelOpen] = useState(false);
  const [weekDraft, setWeekDraft] = useState<WeekEntry | null>(null);
  const [viewWeek, setViewWeek] = useState<WeekEntry | null>(null);
  const [creatingAssignment, setCreatingAssignment] = useState(false);
  const [creatingProject, setCreatingProject] = useState(false);
  const [practicalModal, setPracticalModal] = useState<{
    weekNum: number;
    passScore: number;
  } | null>(null);
  const [practicalInput, setPracticalInput] = useState("0");
  const [overrideModal, setOverrideModal] = useState<{
    weekNum: number;
  } | null>(null);
  const [overrideReason, setOverrideReason] = useState("");
  const [activeTab, setActiveTab] = useState<
    "plan" | "release" | "advanced"
  >("plan");
  const [generating, setGenerating] = useState<
    "lessons" | "assignments" | "projects" | "progression" | "package" | null
  >(null);
  const [genProgress, setGenProgress] = useState<{
    generated: number;
    total: number;
    status: string;
  } | null>(null);
  const [linkedLessons, setLinkedLessons] = useState<
    {
      id: string;
      title: string;
      status: string;
      metadata?: Record<string, unknown> | null;
    }[]
  >([]);
  const [linkedAssignments, setLinkedAssignments] = useState<
    {
      id: string;
      title: string;
      assignment_type: string;
      metadata?: Record<string, unknown> | null;
    }[]
  >([]);
  const [linkedProjects, setLinkedProjects] = useState<
    { id: string; title: string; metadata?: Record<string, unknown> | null }[]
  >([]);
  const [progressionScope, setProgressionScope] =
    useState<ProgressionScope>("term");
  const [progressionYear, setProgressionYear] = useState(1);
  const [progressionTerm, setProgressionTerm] = useState(1);
  const [progressionWeek, setProgressionWeek] = useState(1);
  const [progressionSession, setProgressionSession] = useState(1);
  const [progressionOverwrite, setProgressionOverwrite] = useState(false);
  const [progressionPreview, setProgressionPreview] =
    useState<ProgressionPreview | null>(null);
  const [statusYear, setStatusYear] = useState(1);
  const [statusTerm, setStatusTerm] = useState(1);
  const [statusSaving, setStatusSaving] = useState(false);
  const [scheduleSaving, setScheduleSaving] = useState(false);
  const [releaseSaving, setReleaseSaving] = useState(false);
  const [guidePanelOpen, setGuidePanelOpen] = useState(false);
  const [guideLoading, setGuideLoading] = useState(false);
  const [guideError, setGuideError] = useState<string | null>(null);
  const [guideData, setGuideData] =
    useState<ProgressionWeekGuidePayload | null>(null);
  const [qaLoading, setQaLoading] = useState(false);
  const [qaError, setQaError] = useState<string | null>(null);
  const [qaReport, setQaReport] = useState<SyllabusQaReport | null>(null);
  const [opsLoading, setOpsLoading] = useState(false);
  const [opsError, setOpsError] = useState<string | null>(null);
  const [operations, setOperations] = useState<LessonPlanOperations | null>(
    null
  );
  const [genConfirm, setGenConfirm] = useState<{
    type: "lessons" | "assignments" | "projects";
    preview: {
      total_weeks: number;
      projected_generations: number;
      projected_skips: number;
    };
  } | null>(null);
  const [lmsOpen, setLmsOpen] = useState(false);
  const [aiWeek, setAiWeek] = useState<WeekEntry | null>(null);
  const [myClasses, setMyClasses] = useState<
    {
      id: string;
      name: string;
      teacher_id?: string | null;
      school_id?: string | null;
      schools?: { id: string; name: string } | null;
    }[]
  >([]);
  const [assigningClass, setAssigningClass] = useState(false);
  const [classPickerOpen, setClassPickerOpen] = useState(false);
  const [classLoadError, setClassLoadError] = useState<string | null>(null);
  const [cloneModalOpen, setCloneModalOpen] = useState(false);
  const [cloning, setCloning] = useState(false);
  const [progressionRunConfirm, setProgressionRunConfirm] = useState<{
    scopeLabel: string;
    preview: ProgressionPreview;
  } | null>(null);
  // Shape and defaults come from the same module the cron and the readiness
  // automation read, so this panel cannot drift from what actually runs.
  const [lmsSettings, setLmsSettings] = useState<AutoGenerateSettings>({
    ...DEFAULT_AUTO_GENERATE_SETTINGS,
    enabled: false,
  });
  const [savingLms, setSavingLms] = useState(false);
  const [previewLesson, setPreviewLesson] = useState<any | null>(null);
  const [previewAssignment, setPreviewAssignment] = useState<any | null>(null);
  const [previewProject, setPreviewProject] = useState<any | null>(null);
  const [fetchingPreview, setFetchingPreview] = useState(false);
  const [activePreviewTab, setActivePreviewTab] = useState<
    "plan" | "lesson" | "assignment" | "project"
  >("plan");
  const canGenerateProgression = ["teacher", "admin"].includes(
    profile?.role ?? ""
  );

  function printWeek() {
    setTimeout(() => window.print(), 50);
  }

  async function createAssignmentFromWeek(week: WeekEntry) {
    if (!plan || !plan.course_id) return;
    setCreatingAssignment(true);
    try {
      const weekTag = `Week ${week.week}: ${week.topic}`;
      const dueDate = new Date(Date.now() + 7 * 864e5)
        .toISOString()
        .split("T")[0];
      const res = await fetch("/api/assignments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: week.assignment?.title || `${weekTag} — Assignment`,
          instructions:
            week.assignment?.brief ||
            week.activities ||
            `Assignment for ${weekTag}`,
          assignment_type: "homework",
          due_date: dueDate,
          max_points: 100,
          is_active: true,
          course_id: plan.course_id,
          class_id: plan.class_id,
          lesson_plan_id: plan.id,
          metadata: {
            source: "lesson-plan",
            lesson_plan_id: plan.id,
            curriculum_id: plan.curriculum_version_id,
            term: plan.term,
            week: week.week,
            week_number: week.week,
            year_number: week.syllabus_ref?.year_number ?? null,
            term_number: week.syllabus_ref?.term_number ?? null,
          },
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to create assignment");
      router.push(`/dashboard/assignments/${json.data.id}`);
    } catch (e: any) {
      toast.error(e.message || "Could not create assignment");
    } finally {
      setCreatingAssignment(false);
    }
  }

  async function createProjectFromWeek(week: WeekEntry) {
    if (!plan || !plan.course_id) return;
    setCreatingProject(true);
    try {
      const weekTag = `Week ${week.week}: ${week.topic}`;
      const dueDate = new Date(Date.now() + 14 * 864e5)
        .toISOString()
        .split("T")[0];
      const res = await fetch("/api/assignments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: week.project?.title || `${weekTag} — Project`,
          instructions:
            week.project?.description ||
            week.activities ||
            `Project for ${weekTag}`,
          assignment_type: "project",
          due_date: dueDate,
          max_points: 100,
          is_active: true,
          course_id: plan.course_id,
          class_id: plan.class_id,
          lesson_plan_id: plan.id,
          metadata: {
            source: "lesson-plan",
            lesson_plan_id: plan.id,
            curriculum_id: plan.curriculum_version_id,
            term: plan.term,
            week: week.week,
            week_number: week.week,
            year_number: week.syllabus_ref?.year_number ?? null,
            term_number: week.syllabus_ref?.term_number ?? null,
          },
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to create project");
      router.push(`/dashboard/assignments/${json.data.id}`);
    } catch (e: any) {
      toast.error(e.message || "Could not create project");
    } finally {
      setCreatingProject(false);
    }
  }

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [planRes, lessonsRes, assignmentsRes] = await Promise.all([
        fetch(`/api/lesson-plans/${id}`),
        fetch(`/api/lessons?lesson_plan_id=${id}`),
        fetch(`/api/assignments?lesson_plan_id=${id}`),
      ]);
      if (!planRes.ok) {
        toast.error("Plan not found");
        router.push("/dashboard/lesson-plans");
        return;
      }
      const j = await planRes.json();
      const p: LessonPlan = j.data;
      setPlan(p);
      setWeeks(
        [...((p.plan_data?.weeks ?? []) as WeekEntry[])].sort(
          (a, b) => a.week - b.week
        )
      );
      setLmsSettings(
        parseAutoGenerateSettings(p.metadata?.auto_generate_settings)
      );
      if (lessonsRes.ok) {
        const lj = await lessonsRes.json();
        setLinkedLessons(lj.data ?? []);
      }
      if (assignmentsRes.ok) {
        const aj = await assignmentsRes.json();
        const all: {
          id: string;
          title: string;
          assignment_type: string;
          metadata?: Record<string, unknown> | null;
        }[] = aj.data ?? [];
        setLinkedAssignments(
          all.filter((a) => a.assignment_type !== "project")
        );
        setLinkedProjects(all.filter((a) => a.assignment_type === "project"));
      }
    } catch {
      toast.error("Failed to load plan");
    } finally {
      setLoading(false);
    }
  }, [id, router]);

  useEffect(() => {
    if (!authLoading && profile) load();
  }, [authLoading, profile, load]);

  useEffect(() => {
    if (!viewWeek) {
      setPreviewLesson(null);
      setPreviewAssignment(null);
      setPreviewProject(null);
      setActivePreviewTab("plan");
      return;
    }

    const weekLesson = linkedLessons.find((l) =>
      metadataMatchesWeek(l.metadata, viewWeek)
    );
    const weekAssignment = linkedAssignments.find((a) =>
      metadataMatchesWeek(a.metadata, viewWeek)
    );
    const weekProject = linkedProjects.find((p) =>
      metadataMatchesWeek(p.metadata, viewWeek)
    );

    if (weekLesson || weekAssignment || weekProject) {
      setFetchingPreview(true);
      Promise.all([
        weekLesson
          ? fetch(`/api/lessons/${weekLesson.id}`)
              .then((res) => res.json())
              .catch(() => null)
          : Promise.resolve(null),
        weekAssignment
          ? fetch(`/api/assignments/${weekAssignment.id}`)
              .then((res) => res.json())
              .catch(() => null)
          : Promise.resolve(null),
        weekProject
          ? fetch(`/api/assignments/${weekProject.id}`)
              .then((res) => res.json())
              .catch(() => null)
          : Promise.resolve(null),
      ])
        .then(([lessonRes, assignmentRes, projectRes]) => {
          if (lessonRes?.data) setPreviewLesson(lessonRes.data);
          if (assignmentRes?.data) setPreviewAssignment(assignmentRes.data);
          if (projectRes?.data) setPreviewProject(projectRes.data);
        })
        .catch((err) => {
          console.error("Failed to fetch inline previews", err);
        })
        .finally(() => {
          setFetchingPreview(false);
        });
    } else {
      setPreviewLesson(null);
      setPreviewAssignment(null);
      setPreviewProject(null);
    }
  }, [viewWeek, linkedLessons, linkedAssignments, linkedProjects]);

  useEffect(() => {
    if (!guidePanelOpen || !canGenerateProgression || !id) return;
    let cancelled = false;
    setGuideLoading(true);
    setGuideError(null);
    fetch(`/api/lesson-plans/${id}/progression-week-guide`)
      .then(async (res) => {
        const j = await res.json().catch(() => ({}));
        if (!res.ok)
          throw new Error(
            typeof j.error === "string"
              ? j.error
              : "Failed to load teaching guide"
          );
        if (!cancelled)
          setGuideData((j.data ?? null) as ProgressionWeekGuidePayload | null);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setGuideData(null);
          setGuideError(
            err instanceof Error ? err.message : "Failed to load teaching guide"
          );
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
  }, [
    progressionScope,
    progressionYear,
    progressionTerm,
    progressionWeek,
    progressionSession,
    progressionOverwrite,
    weeks.length,
  ]);

  useEffect(() => {
    if (activeTab !== "advanced" || !canGenerateProgression || !id) return;
    let cancelled = false;
    setQaLoading(true);
    setQaError(null);
    fetch(`/api/lesson-plans/${id}/syllabus-qa`)
      .then(async (res) => {
        const j = await res.json().catch(() => ({}));
        if (!res.ok)
          throw new Error(
            typeof j.error === "string" ? j.error : "Failed to load syllabus QA"
          );
        if (!cancelled)
          setQaReport((j.data ?? null) as SyllabusQaReport | null);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setQaReport(null);
          setQaError(
            err instanceof Error ? err.message : "Failed to load syllabus QA"
          );
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
    if (
      (activeTab !== "release" && activeTab !== "advanced") ||
      !canGenerateProgression ||
      !id
    )
      return;
    let cancelled = false;
    setOpsLoading(true);
    setOpsError(null);
    fetch(`/api/lesson-plans/${id}/operations`)
      .then(async (res) => {
        const j = await res.json().catch(() => ({}));
        if (!res.ok)
          throw new Error(
            typeof j.error === "string"
              ? j.error
              : "Failed to load operations center"
          );
        if (!cancelled)
          setOperations((j.data ?? null) as LessonPlanOperations | null);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setOperations(null);
          setOpsError(
            err instanceof Error
              ? err.message
              : "Failed to load operations center"
          );
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
    if (
      !plan?.curriculum?.content ||
      typeof plan.curriculum.content !== "object"
    )
      return null;
    const c = plan.curriculum.content as SyllabusContent;
    return c;
  }, [plan?.curriculum?.content]);

  async function saveWeeks(updatedWeeks: WeekEntry[]) {
    setSaving(true);
    try {
      const res = await fetch(`/api/lesson-plans/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan_data: { weeks: updatedWeeks } }),
      });
      if (!res.ok) throw new Error("Save failed");
      setWeeks(updatedWeeks);
      toast.success("Saved");
    } catch {
      toast.error("Failed to save");
    } finally {
      setSaving(false);
    }
  }

  async function transitionStatus(newStatus: string) {
    if (!plan) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/lesson-plans/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: newStatus,
          version:
            newStatus === "published" ? (plan.version ?? 1) + 1 : plan.version,
        }),
      });
      if (!res.ok) throw new Error("Status update failed");
      toast.success(`Plan ${newStatus}`);
      load();
    } catch {
      toast.error("Failed to update status");
    } finally {
      setSaving(false);
    }
  }

  function addWeek() {
    const newWeek: WeekEntry = {
      week: weeks.length + 1,
      topic: "",
      completed: false,
      objectives: "",
      activities: "",
      notes: "",
      project: { title: "", description: "" },
      assignment: { title: "", brief: "" },
      practical_assessment: {
        max_score: 100,
        pass_score: 60,
        practical_score: 0,
      },
    };
    setWeeks((prev) => [...prev, newWeek]);
    setWeekDraft(newWeek);
    setWeekPanelOpen(true);
  }

  function startEdit(w: WeekEntry) {
    setWeekDraft({ ...w });
    setWeekPanelOpen(true);
  }

  function cancelEdit() {
    setWeekPanelOpen(false);
    setWeekDraft(null);
    setWeeks((prev) =>
      prev.filter((w) => w.topic.trim() !== "" || w.week !== prev.length)
    );
  }

  function saveWeekEdit() {
    if (!weekDraft) return;
    const updated = weeks.map((w) =>
      w.week === weekDraft.week ? weekDraft : w
    );
    setWeekPanelOpen(false);
    setWeekDraft(null);
    saveWeeks(updated);
  }

  async function updateTermStatus(status: "draft" | "approved" | "locked") {
    setStatusSaving(true);
    try {
      const res = await fetch(`/api/lesson-plans/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          progression_term_status_update: {
            year_number: statusYear,
            term_number: statusTerm,
            status,
            reason:
              status === "locked"
                ? "Locking term after review"
                : "Status update",
          },
        }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || "Failed to update term status");
      toast.success(`Set Y${statusYear}T${statusTerm} to ${status}`);
      load();
    } catch (err: unknown) {
      toast.error(
        err instanceof Error ? err.message : "Failed to update term status"
      );
    } finally {
      setStatusSaving(false);
    }
  }

  function deleteWeek(weekNum: number) {
    const updated = weeks
      .filter((w) => w.week !== weekNum)
      .map((w, i) => ({ ...w, week: i + 1 }));
    saveWeeks(updated);
  }

  function toggleWeekCompleted(weekNum: number) {
    const target = weeks.find((w) => w.week === weekNum);
    if (!target) return;
    if ((target.gating_state ?? "unlocked") === "locked") {
      toast.error("This week is locked. Use override unlock if needed.");
      return;
    }
    const markingDone = !target.completed;
    const isStrict = (target.mastery_mode ?? "strict") === "strict";
    if (markingDone && isStrict) {
      setPracticalModal({
        weekNum,
        passScore: Number(target.practical_assessment?.pass_score ?? 60),
      });
      setPracticalInput(
        String(target.practical_assessment?.practical_score ?? "0")
      );
      return;
    }
    applyWeekCompletion(weekNum, markingDone, 0);
  }

  function applyWeekCompletion(
    weekNum: number,
    markingDone: boolean,
    practicalScore: number
  ) {
    const target = weeks.find((w) => w.week === weekNum);
    if (!target) return;
    const isStrict = (target.mastery_mode ?? "strict") === "strict";
    const passScore = Number(target.practical_assessment?.pass_score ?? 60);
    const shouldMaster = markingDone
      ? isStrict
        ? practicalScore >= passScore
        : true
      : false;
    const updated = weeks.map((w) => {
      if (w.week === weekNum) {
        return {
          ...w,
          completed: markingDone,
          gating_state: shouldMaster
            ? ("mastered" as const)
            : ("unlocked" as const),
          practical_assessment: {
            ...(w.practical_assessment ?? {}),
            practical_score: markingDone
              ? practicalScore
              : w.practical_assessment?.practical_score ?? 0,
          },
        };
      }
      if (
        shouldMaster &&
        w.week === weekNum + 1 &&
        (w.gating_state ?? "locked") === "locked"
      ) {
        return { ...w, gating_state: "unlocked" as const };
      }
      return w;
    });
    saveWeeks(updated);
  }

  function confirmPracticalScore() {
    if (!practicalModal) return;
    const parsed = Number(practicalInput);
    const score = Number.isFinite(parsed)
      ? Math.min(Math.max(parsed, 0), 100)
      : 0;
    const { weekNum } = practicalModal;
    setPracticalModal(null);
    applyWeekCompletion(weekNum, true, score);
  }

  function unlockWeekWithOverride(weekNum: number) {
    setOverrideModal({ weekNum });
    setOverrideReason("");
  }

  function confirmOverride() {
    if (!overrideModal) return;
    const trimmed = overrideReason.trim();
    if (!trimmed) {
      toast.error("Override reason is required.");
      return;
    }
    const { weekNum } = overrideModal;
    setOverrideModal(null);
    setOverrideReason("");
    const updated = weeks.map((w) =>
      w.week === weekNum
        ? {
            ...w,
            gating_state: "unlocked" as const,
            override_reason: trimmed,
            overridden_by: profile?.role ?? "teacher",
            overridden_at: new Date().toISOString(),
          }
        : w
    );
    saveWeeks(updated);
  }

  async function bulkGenerate(
    type: "lessons" | "assignments" | "projects" | "cbt" | "flashcards"
  ) {
    if (!plan) return;

    if (!plan.course_id || !plan.school_id) {
      toast.error(
        "This plan needs a course and school linked before generating content — click Edit Plan to add them."
      );
      return;
    }

    if (!plan.class_id) {
      toast.error(
        "Assign this plan to a class first — click the class badge in the header above."
      );
      setClassPickerOpen(true);
      return;
    }

    if (type === "cbt" || type === "flashcards") {
      const q = new URLSearchParams({
        course_id: plan.course_id || "",
        lesson_plan_id: id,
        program_id: plan.courses?.program_id || "",
        curriculum_id: plan.curriculum_version_id || "",
        source: "lesson-plan-bulk",
      });
      const target =
        type === "cbt" ? "/dashboard/cbt/new" : "/dashboard/flashcards";
      router.push(`${target}?${q.toString()}`);
      return;
    }

    const labels: Record<"lessons" | "assignments" | "projects", string> = {
      lessons: "lessons",
      assignments: "assignments",
      projects: "projects",
    };
    const previewRes = await fetch(`/api/lesson-plans/${id}/generate-${type}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dry_run: true }),
    });
    const previewJson = await previewRes.json().catch(() => ({}));
    if (!previewRes.ok) {
      toast.error(previewJson.error || "Preview failed");
      return;
    }
    const preview = (previewJson.data ?? {}) as {
      total_weeks?: number;
      projected_generations?: number;
      projected_skips?: number;
    };
    // Show a non-blocking confirmation modal instead of window.confirm
    setGenConfirm({
      type: type as "lessons" | "assignments" | "projects",
      preview: {
        total_weeks: preview.total_weeks ?? weeks.length,
        projected_generations: preview.projected_generations ?? 0,
        projected_skips: preview.projected_skips ?? 0,
      },
    });
    return; // execution resumes in confirmAndGenerate() when user approves
  }

  async function generateCompletePackages() {
    if (!plan?.course_id || !plan.school_id) {
      toast.error("Link this plan to a course and school before preparing teaching packages.");
      return;
    }
    if (!plan.class_id) {
      toast.error("Assign this plan to a class first so every item has one teaching destination.");
      setClassPickerOpen(true);
      return;
    }
    if (weeks.length === 0) {
      toast.error("Add or import curriculum weeks before generating content.");
      return;
    }

    setGenerating("package");
    setGenProgress({ generated: 0, total: weeks.length, status: "Preparing the first complete package…" });
    let generated = 0;
    let skipped = 0;
    const failures: string[] = [];
    try {
      for (let index = 0; index < weeks.length; index++) {
        const week = weeks[index];
        const session = Math.max(1, Number(week.session_number ?? week.session ?? 1) || 1);
        setGenProgress({
          generated: index,
          total: weeks.length,
          status: `Week ${week.week}${session > 1 ? ` · Session ${session}` : ""}: preparing all learning content`,
        });
        const result = await requestTrackedWeekGeneration({
          planId: id,
          week: week.week,
          session,
          types: WEEK_CONTENT_TYPES,
        });
        generated += Number(result.generated) || 0;
        skipped += Number(result.skipped) || 0;
        if (result.success === false) {
          failures.push(`Week ${week.week}: ${result.error || "package generation did not finish"}`);
        } else if (Array.isArray(result.failedTypes) && result.failedTypes.length > 0) {
          failures.push(`Week ${week.week}: ${result.failedTypes.join(", ")} still need attention`);
        }
      }
      await load();
      if (failures.length > 0) {
        toast.warning(`${generated} content item${generated === 1 ? "" : "s"} saved; ${failures.length} week${failures.length === 1 ? "" : "s"} still need attention.`, {
          description: failures.slice(0, 3).join(" · "),
          duration: 9000,
        });
      } else {
        toast.success(
          generated > 0
            ? `${generated} content item${generated === 1 ? "" : "s"} prepared across complete weekly packages${skipped ? `; ${skipped} existing item${skipped === 1 ? " was" : "s were"} kept.` : "."}`
            : "Every weekly teaching package was already prepared. Nothing was duplicated."
        );
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Teaching package generation was interrupted. Saved content has been kept.");
    } finally {
      setGenerating(null);
      setGenProgress(null);
    }
  }

  async function confirmAndGenerate() {
    if (!genConfirm) return;
    const { type } = genConfirm;
    setGenConfirm(null);
    setGenerating(type);
    setGenProgress({
      generated: 0,
      total: weeks.length,
      status: "Starting...",
    });

    try {
      const batchSize =
        lmsSettings.maxWeeksPerBatch > 0
          ? lmsSettings.maxWeeksPerBatch
          : undefined;
      let generated = 0;
      let skipped = 0;
      let alreadyRunning = 0;
      const failures: string[] = [];

      // Use the same per-meeting authority as Prepare this week and the cron.
      // The former bulk routes checked for existing rows, but two concurrent
      // requests could still pay for the same AI work before the database
      // rejected the second save. The tracked route claims the meeting first,
      // inventories it, and asks only for the missing selected content kind.
      for (let index = 0; index < weeks.length; index++) {
        if (batchSize && generated >= batchSize) break;
        const week = weeks[index];
        const session = Math.max(
          1,
          Number(week.session_number ?? week.session ?? 1) || 1
        );
        setGenProgress({
          generated,
          total: weeks.length,
          status: `Week ${week.week}${session > 1 ? ` · Session ${session}` : ""}: checking existing ${type}`,
        });
        const result = await requestTrackedWeekGeneration({
          planId: id,
          week: week.week,
          session,
          types: [type],
        });
        if (result.alreadyRunning === true) {
          alreadyRunning++;
          continue;
        }
        generated += Number(result.generated) || 0;
        skipped += Number(result.skipped) || 0;
        if (result.success === false) {
          failures.push(
            `Week ${week.week}: ${result.error || `${type} did not finish`}`
          );
        } else if (
          Array.isArray(result.failedTypes) &&
          result.failedTypes.includes(type)
        ) {
          failures.push(`Week ${week.week}: ${type} still needs attention`);
        }
      }

      await load();
      if (failures.length > 0) {
        toast.warning(
          `${generated} ${type} prepared; ${failures.length} week${failures.length === 1 ? "" : "s"} still need attention.`,
          { description: failures.slice(0, 3).join(" · "), duration: 9000 }
        );
      } else if (alreadyRunning > 0) {
        toast.info(
          `${alreadyRunning} meeting${alreadyRunning === 1 ? " is" : "s are"} already being prepared. No duplicate AI run was started.`
        );
      } else if (generated > 0) {
        toast.success(
          `${generated} ${type} prepared${skipped ? `; ${skipped} existing item${skipped === 1 ? " was" : "s were"} kept.` : "."}`
        );
      } else {
        toast.success(`All ${type} were already prepared. Nothing was duplicated.`);
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Generation failed";
      toast.error(message);
      setGenProgress(null);
      setGenerating(null);
    }
  }

  async function saveLmsSettings() {
    setSavingLms(true);
    try {
      const res = await fetch(`/api/lesson-plans/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          metadata: { auto_generate_settings: lmsSettings },
        }),
      });
      if (!res.ok) throw new Error("Save failed");
      toast.success("Week prep settings saved");
    } catch {
      toast.error("Couldn’t save week prep settings");
    } finally {
      setSavingLms(false);
    }
  }

  function getProgressionWeeksCount() {
    return weeks.length > 0 ? weeks.length : 8;
  }

  function getProgressionScopeLabel(
    scope: ProgressionScope = progressionScope
  ) {
    if (scope === "week")
      return `Week ${progressionWeek}, Term ${progressionTerm}, Year ${progressionYear}`;
    if (scope === "term")
      return `Term ${progressionTerm}, Year ${progressionYear}`;
    if (scope === "session") return `Session ${progressionSession}`;
    return "Full 3-Year Program";
  }

  function buildProgressionPayload(
    overrides?: Partial<Record<string, unknown>>
  ) {
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

  async function previewProgressionBuilder(
    overrides?: Partial<Record<string, unknown>>
  ) {
    if (!plan) return null;
    setGenerating("progression");
    try {
      const payload = buildProgressionPayload(overrides);
      const res = await fetch(`/api/lesson-plans/${id}/generate-progression`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...payload,
          dry_run: true,
        }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || "Preview failed");
      const preview = (j.data ?? {}) as ProgressionPreview;
      setProgressionPreview(preview);
      toast.success(
        `Preview ready for ${getProgressionScopeLabel(
          (overrides?.scope as ProgressionScope | undefined) ?? progressionScope
        )}.`
      );
      return preview;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Preview failed";
      toast.error(message);
      return null;
    } finally {
      setGenerating(null);
    }
  }

  async function runProgressionBuilder() {
    if (!plan) return;
    setGenerating("progression");
    try {
      const payload = buildProgressionPayload();
      const preview = progressionPreview ?? (await previewProgressionBuilder());
      if (!preview) return;
      if (preview.preflight?.blocking) {
        toast.error("Resolve the blocking readiness issues before generation.");
        return;
      }
      setProgressionRunConfirm({
        scopeLabel: getProgressionScopeLabel(),
        preview,
      });
      return; // execution resumes in executeProgressionGeneration()
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Plan generation failed";
      toast.error(message);
    } finally {
      setGenerating(null);
    }
  }

  async function executeProgressionGeneration() {
    if (!progressionRunConfirm || !plan) return;
    setProgressionRunConfirm(null);
    setGenerating("progression");
    try {
      const payload = buildProgressionPayload();
      const res = await fetch(`/api/lesson-plans/${id}/generate-progression`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || "Progression generation failed");
      toast.success(
        `Generated progression route for ${getProgressionScopeLabel()}.`
      );
      load();
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Plan generation failed";
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
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          term_start: plan.term_start ?? new Date().toISOString(),
          cadence_days: 7,
        }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || "Failed to activate schedule");
      toast.success("Term scheduler activated for this lesson plan.");
      load();
    } catch (err: unknown) {
      toast.error(
        err instanceof Error ? err.message : "Failed to activate schedule"
      );
    } finally {
      setScheduleSaving(false);
    }
  }

  async function releaseProgressionWeek() {
    setReleaseSaving(true);
    try {
      const res = await fetch(`/api/lesson-plans/${id}/release-week`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          week_number: progressionWeek,
          year_number: progressionYear,
          term_number: progressionTerm,
          ...(Number(progressionSession) > 0
            ? { session: Number(progressionSession) }
            : {}),
        }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || "Failed to release week");
      toast.success(
        Number(progressionSession) > 0
          ? `Released Week ${progressionWeek} · Class ${progressionSession}.`
          : `Released week ${progressionWeek} lessons and assignments.`,
      );
      load();
    } catch (err: unknown) {
      toast.error(
        err instanceof Error ? err.message : "Failed to release week"
      );
    } finally {
      setReleaseSaving(false);
    }
  }

  const loadAssignableClasses = useCallback(async () => {
    if (!profile?.id || !["teacher", "admin"].includes(profile.role ?? ""))
      return;
    const url =
      profile.role === "teacher" ? "/api/classes?mine=true" : "/api/classes";
    setClassLoadError(null);
    try {
      const response = await fetch(url, { cache: "no-store" });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error("Classes could not be loaded.");
      setMyClasses(
        (payload.data ?? []) as {
          id: string;
          name: string;
          teacher_id?: string | null;
        }[]
      );
    } catch {
      setClassLoadError(
        "Class options could not be loaded. The lesson plan is unchanged."
      );
    }
  }, [profile?.id, profile?.role]);

  // Load teacher's own classes for inline class assignment.
  useEffect(() => {
    void loadAssignableClasses();
  }, [loadAssignableClasses]);

  async function assignClass(classId: string | null) {
    setAssigningClass(true);
    try {
      const res = await fetch(`/api/lesson-plans/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ class_id: classId }),
      });
      if (!res.ok) throw new Error("Save failed");
      toast.success(classId ? "Class assigned" : "Class removed");
      setClassPickerOpen(false);
      load();
    } catch {
      toast.error("Failed to assign class");
    } finally {
      setAssigningClass(false);
    }
  }

  async function cloneToClass(targetClass: {
    id: string;
    school_id?: string | null;
  }) {
    if (!plan) return;
    setCloning(true);
    try {
      const targetSchoolId = targetClass.school_id ?? null;
      // Only carry curriculum_version_id if it's platform-wide (school_id = null) or same school as target
      const curriculumIdToUse =
        plan.curriculum_version_id &&
        (plan.curriculum?.school_id == null ||
          plan.curriculum.school_id === targetSchoolId)
          ? plan.curriculum_version_id
          : null;

      const res = await fetch("/api/lesson-plans", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          course_id: plan.course_id,
          class_id: targetClass.id,
          school_id: targetSchoolId,
          term: plan.term,
          term_start: plan.term_start,
          term_end: plan.term_end,
          sessions_per_week: plan.sessions_per_week,
          curriculum_version_id: null,
          plan_data: plan.plan_data,
          status: "draft",
          version: 1,
        }),
      });
      const json = await res.json();
      if (res.status === 409 && json.existing_id) {
        toast.success(
          "That class already has this lesson plan. Opening it now."
        );
        setCloneModalOpen(false);
        router.push(`/dashboard/lesson-plans/${json.existing_id}`);
        return;
      }
      if (!res.ok) throw new Error(json.error || "Deploy failed");
      toast.success("Plan deployed — opening new plan");
      setCloneModalOpen(false);
      router.push(`/dashboard/lesson-plans/${json.data.id}`);
    } catch (e: any) {
      toast.error(e.message || "Failed to deploy plan");
    } finally {
      setCloning(false);
    }
  }

  if (authLoading || loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!plan) return null;

  const status = plan.status ?? "draft";
  const badge = STATUS_BADGE[status] ?? STATUS_BADGE.draft;
  const nextStatuses = STATUS_TRANSITIONS[status] ?? [];
  const courseTitle = plan.courses?.title ?? "Unknown Course";
  const completedWeeks = weeks.filter((w) => w.completed).length;
  const contentSummary = {
    weeks: weeks.length,
    lessons: linkedLessons.length,
    assignments: linkedAssignments.length,
    projects: linkedProjects.length,
  };
  const selectedScopeConfig =
    PROGRESSION_SCOPE_OPTIONS.find(
      (option) => option.id === progressionScope
    ) ?? PROGRESSION_SCOPE_OPTIONS[1];
  const builderWeeksCount = getProgressionWeeksCount();
  const builderScopeLabel = getProgressionScopeLabel();
  const programPolicy = plan.courses?.programs?.progression_policy ?? null;
  const builderQuickLinks = [
    {
      label: "Analytics",
      href: `/dashboard/learner-progress?view=insights&year_number=${progressionYear}&term_number=${progressionTerm}&course_id=${
        plan.course_id ?? ""
      }&class_id=${plan.class_id ?? ""}`,
    },
    {
      label: "Audit",
      href: `/dashboard/learner-progress?view=history&lesson_plan_id=${id}`,
    },
    {
      label: "Schedule",
      href: "/dashboard/lesson-plans",
    },
    {
      label: "Release",
      href: `/dashboard/lessons?lesson_plan_id=${id}`,
    },
  ];
  const builderReadiness = [
    {
      key: "program",
      label: "Teaching Path",
      status:
        plan.courses?.programs?.school_progression_enabled === true
          ? "pass"
          : "fail",
      detail:
        plan.courses?.programs?.school_progression_enabled === true
          ? "Enabled on linked program."
          : "Enable teaching path automation on the linked program.",
    },
    {
      key: "curriculum",
      label: "Curriculum linked",
      status: syllabusTermContent ? "pass" : "warn",
      detail: syllabusTermContent
        ? "Curriculum term content is linked to this plan."
        : "No curriculum term content is linked yet.",
    },
    {
      key: "policy",
      label: "Policy configured",
      status:
        programPolicy && Object.keys(programPolicy).length > 0
          ? "pass"
          : "warn",
      detail:
        programPolicy && Object.keys(programPolicy).length > 0
          ? "Teaching path rules are available."
          : "Program rules are thin, so more runtime defaults will be used.",
    },
    {
      key: "guide",
      label: "Registry guide",
      status: guideError
        ? "fail"
        : guideData?.weeks_count
        ? "pass"
        : guideLoading
        ? "warn"
        : "warn",
      detail: guideError
        ? guideError
        : guideData?.weeks_count
        ? `${guideData.weeks_count} seeded guide rows loaded.`
        : guideLoading
        ? "Loading seeded guide rows."
        : "Seeded guide has not loaded yet.",
    },
  ] as const;
  const preflightChecks = progressionPreview?.preflight?.checks ?? [];
  const hasBlockingPreflight = progressionPreview?.preflight?.blocking === true;
  const linearOpsFlow = [
    {
      step: "01",
      title: "Policies",
      detail:
        programPolicy && Object.keys(programPolicy).length > 0
          ? "Rules are configured."
          : "Rules need stronger defaults.",
      state:
        programPolicy && Object.keys(programPolicy).length > 0
          ? "live"
          : "watch",
    },
    {
      step: "02",
      title: "Syllabus",
      detail: syllabusTermContent
        ? "Syllabus is linked as the academic truth."
        : "Link syllabus content to anchor the plan.",
      state: syllabusTermContent ? "live" : "watch",
    },
    {
      step: "03",
      title: "QA",
      detail: qaReport
        ? `${qaReport.overall_score}% compliance score.`
        : "Run syllabus QA and validate rhythm.",
      state: qaReport
        ? qaReport.overall_readiness === "critical"
          ? "risk"
          : "live"
        : "watch",
    },
    {
      step: "04",
      title: "Builder",
      detail: progressionPreview?.preflight
        ? "Preview and hard preflight are active."
        : "Choose scope and generate a preview.",
      state: hasBlockingPreflight
        ? "risk"
        : progressionPreview?.preflight
        ? "live"
        : "watch",
    },
    {
      step: "05",
      title: "Plan Ops",
      detail: "Write route into the lesson plan and keep execution controlled.",
      state: "live",
    },
    {
      step: "06",
      title: "Content",
      detail:
        "Generate lessons, assignments, and projects from the same route.",
      state: "live",
    },
    {
      step: "07",
      title: "Release",
      detail: operations?.schedule
        ? "Schedule and release controls are connected."
        : "Operations center will surface release controls here.",
      state: operations?.schedule ? "live" : "watch",
    },
    {
      step: "08",
      title: "Analytics",
      detail: operations?.analytics
        ? "Analytics and audit are attached to this plan."
        : "Analytics will populate once operations sync.",
      state: operations?.analytics ? "live" : "watch",
    },
  ] as const;

  return (
    <div className={`p-4 sm:p-6 space-y-6 max-w-7xl mx-auto print:p-0 print:space-y-4 ${MOBILE_PAGE_BOTTOM}`}>
      {/* Print letterhead */}
      <div className="hidden print:block border-b border-black pb-3 mb-2">
        <div className="flex items-start gap-3">
          <img
            src="/logo.png"
            alt="Rillcod Technologies"
            className="w-14 h-14 object-contain"
          />
          <div className="flex-1 min-w-0 text-foreground">
            <p className="text-lg font-black leading-tight">
              RILLCOD TECHNOLOGIES
            </p>
            <p className="text-[11px] leading-tight">
              Coding Today, Innovating Tomorrow
            </p>
            <p className="text-[10px] leading-tight mt-1">
              26 Ogiesoba Avenue, Off Airport Road, GRA, Benin City ·{" "}
              {brandContact.phoneShort} · {brandContact.email}
            </p>
          </div>
          <div className="text-right text-foreground">
            <p className="text-[10px] font-bold uppercase tracking-wider">
              Document
            </p>
            <p className="text-xs font-black uppercase">Term Lesson Plan</p>
            <p className="text-[10px] mt-1">
              {new Date().toLocaleDateString("en-GB")}
            </p>
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
        {weeks.some(
          (w) => !linkedLessons.find((l) => metadataMatchesWeek(l.metadata, w))
        ) && (
          <div className="mt-3 flex items-center justify-between gap-3 p-3 rounded-lg border border-primary/30 bg-primary/[0.05]">
            <div className="flex items-start gap-3 min-w-0">
              <div className="w-8 h-8 rounded-md bg-primary/20 flex items-center justify-center shrink-0">
                <SparklesIcon className="w-4 h-4 text-violet-700 dark:text-violet-300" />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-black uppercase tracking-widest text-violet-700 dark:text-violet-300">
                  AI Lesson Assistant
                </p>
                <p className="text-xs text-card-foreground/70 mt-0.5 leading-snug">
                  Click{" "}
                  <span className="font-bold text-violet-700 dark:text-violet-300">
                    Create Lesson
                  </span>{" "}
                  on any week below — with a linked syllabus, student activities
                  and objectives are carried into the builder automatically.
                  Pick a mode (Academic · Project · Interactive) and generate a
                  full rich lesson in seconds.
                </p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Back + Print */}
      <div className="flex items-center justify-between print:hidden">
        <Link
          href="/dashboard/lesson-plans"
          className="flex items-center gap-2 text-card-foreground/50 hover:text-card-foreground text-sm font-bold transition-colors min-h-[44px]"
        >
          <ArrowLeftIcon className="w-4 h-4" /> Back to Plans
        </Link>
        <button
          onClick={() => window.print()}
          className="flex items-center gap-2 px-3 py-1.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-sm text-card-foreground/70 font-bold transition-all min-h-[44px]"
        >
          <PrinterIcon className="w-4 h-4" /> Export PDF
        </button>
      </div>

      {/* Header */}
      <div className="bg-card/90 backdrop-blur-2xl border border-border/80 rounded-3xl p-6 sm:p-8 shadow-xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-48 h-48 bg-primary/10 rounded-full blur-3xl pointer-events-none" />
        <div className="relative z-10 flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="flex items-center gap-2 mb-2 flex-wrap">
              <span
                className={`text-xs px-2 py-0.5 rounded-full border font-bold ${badge.cls}`}
              >
                {badge.label}
              </span>
              {(plan.version ?? 1) > 1 && (
                <span className="text-xs text-primary bg-primary/10 px-2 py-0.5 rounded-full border border-primary/20">
                  v{plan.version}
                </span>
              )}
            </div>
            <h1 className="text-xl font-black text-card-foreground">
              {plan.term ?? "Term Plan"} — {courseTitle}
            </h1>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              {plan.classes?.name ? (
                <button
                  onClick={() => setClassPickerOpen((v) => !v)}
                  className="flex items-center gap-1.5 text-sm text-card-foreground/60 hover:text-card-foreground transition-colors group"
                >
                  <AcademicCapIcon className="w-3.5 h-3.5" />
                  <span>{plan.classes.name}</span>
                  <span className="text-xs text-primary/60 group-hover:text-primary">
                    (change)
                  </span>
                </button>
              ) : (
                <button
                  onClick={() => setClassPickerOpen((v) => !v)}
                  className="flex items-center gap-1.5 text-sm text-amber-600 dark:text-amber-400 hover:text-amber-700 dark:hover:text-amber-300 transition-colors bg-amber-500/10 px-2 py-0.5 rounded-lg border border-amber-500/20"
                >
                  <AcademicCapIcon className="w-3.5 h-3.5" />
                  No class assigned — click to assign
                </button>
              )}
            </div>
            {classPickerOpen && (
              <div className="mt-2 p-3 bg-card border border-white/[0.12] rounded-xl shadow-xl z-10 w-full max-w-xs">
                <p className="text-[10px] font-black uppercase tracking-widest text-card-foreground/50 mb-2">
                  Assign to class
                </p>
                <div className="space-y-1 max-h-48 overflow-y-auto">
                  {classLoadError ? (
                    <div className="space-y-2 rounded-lg border border-amber-500/25 bg-amber-500/10 p-2.5">
                      <p className="text-xs font-semibold text-amber-700 dark:text-amber-300">
                        {classLoadError}
                      </p>
                      <button
                        type="button"
                        onClick={() => void loadAssignableClasses()}
                        className="text-xs font-black text-primary hover:underline"
                      >
                        Retry classes
                      </button>
                    </div>
                  ) : myClasses.length === 0 ? (
                    <p className="text-xs text-card-foreground/40">
                      No classes found — ensure you are assigned as teacher to a
                      class first.
                    </p>
                  ) : null}
                  {myClasses.map((cls) => (
                    <button
                      key={cls.id}
                      onClick={() => assignClass(cls.id)}
                      disabled={assigningClass}
                      className={`w-full text-left px-3 py-2 rounded-lg text-sm font-bold transition-colors ${
                        plan.class_id === cls.id
                          ? "bg-primary/20 text-primary"
                          : "hover:bg-white/[0.06] text-card-foreground/80"
                      }`}
                    >
                      {cls.name}
                    </button>
                  ))}
                  {plan.class_id && (
                    <button
                      onClick={() => assignClass(null)}
                      disabled={assigningClass}
                      className="w-full text-left px-3 py-2 rounded-lg text-xs text-rose-600/70 dark:text-rose-400/70 hover:text-rose-600 dark:hover:text-rose-400 transition-colors"
                    >
                      Remove class
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
          <div className="flex items-center gap-2 print:hidden">
            {(profile?.role === "teacher" || profile?.role === "admin") &&
              myClasses.filter((c) => c.id !== plan.class_id).length > 0 && (
                <button
                  onClick={() => setCloneModalOpen(true)}
                  title="Copy this plan to another class"
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-white/5 hover:bg-white/10 border border-white/10 text-card-foreground/70 hover:text-card-foreground text-sm font-bold rounded-xl transition-all"
                >
                  <ArrowUpTrayIcon className="w-3.5 h-3.5" />
                  Copy to class…
                </button>
              )}
            {nextStatuses.map((ns) => (
              <button
                key={ns}
                onClick={() => transitionStatus(ns)}
                disabled={saving}
                className="px-3 py-1.5 bg-primary hover:bg-primary disabled:opacity-50 text-white text-sm font-bold rounded-xl transition-all capitalize"
              >
                {ns === "published"
                  ? "Publish"
                  : ns === "archived"
                  ? "Archive"
                  : ns}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-6 gap-3 mt-5">
          {[
            ["Weeks", contentSummary.weeks],
            ["Complete", `${completedWeeks}/${weeks.length || 0}`],
            ["Lessons", contentSummary.lessons],
            ["Assignments", contentSummary.assignments],
            ["Projects", contentSummary.projects],
            ["Classes / week", plan.sessions_per_week ?? "-"],
          ].map(([label, value]) => (
            <div
              key={label}
              className="rounded-lg border border-white/[0.08] bg-white/[0.03] p-3"
            >
              <p className="text-[10px] font-black uppercase tracking-wider text-card-foreground/40">
                {label}
              </p>
              <p className="text-base font-black text-card-foreground mt-1">
                {value}
              </p>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-3 text-xs text-card-foreground/55">
          {plan.term_start && (
            <div>
              <span className="font-bold text-card-foreground/70">Start:</span>{" "}
              {new Date(plan.term_start).toLocaleDateString("en-GB")}
            </div>
          )}
          {plan.term_end && (
            <div>
              <span className="font-bold text-card-foreground/70">End:</span>{" "}
              {new Date(plan.term_end).toLocaleDateString("en-GB")}
            </div>
          )}
          {plan.schools?.name && (
            <div>
              <span className="font-bold text-card-foreground/70">School:</span>{" "}
              {plan.schools.name}
            </div>
          )}
        </div>

        {/* Linked curriculum + visible syllabus (this term) */}
        {plan.curriculum_version_id && (
          <div className="mt-3 space-y-2">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-xs text-primary bg-primary/10 border border-primary/20 rounded-lg px-3 py-2">
              <div className="flex items-center gap-2 min-w-0">
                <BookOpenIcon className="w-4 h-4 flex-shrink-0" />
                <span className="min-w-0">
                  Linked syllabus v{plan.curriculum?.version ?? "—"} — term
                  inferred from &ldquo;{plan.term ?? "Term"}&rdquo;.
                </span>
              </div>
              {plan.course_id && (
                <Link
                  href={buildCurriculumHref({
                    courseId: plan.course_id,
                    programId: plan.courses?.program_id ?? null,
                  })}
                  className="font-bold text-sky-700 dark:text-sky-300 hover:text-sky-800 dark:hover:text-sky-200 underline underline-offset-2 shrink-0"
                >
                  View syllabus
                </Link>
              )}
            </div>
            {syllabusTermContent ? (
              <details className="print:hidden rounded-lg border border-primary/25 bg-primary/[0.04] overflow-hidden">
                <summary className="cursor-pointer list-none px-3 py-2.5 text-xs font-black text-blue-800 dark:text-blue-200 uppercase tracking-widest hover:bg-white/[0.03] [&::-webkit-details-marker]:hidden flex items-center justify-between gap-2">
                  <span>Show syllabus for this term (reference)</span>
                  <BookOpenIcon className="w-4 h-4 opacity-70" />
                </summary>
                <div className="border-t border-primary/20 px-2 py-3 max-h-[min(32rem,70vh)] overflow-y-auto bg-background/40">
                  <SyllabusPreview
                    content={syllabusTermContent}
                    courseTitle={courseTitle}
                    hideCourseHeader={true}
                  />
                </div>
              </details>
            ) : (
              <p className="text-[11px] text-card-foreground/50">
                Syllabus JSON not loaded on this plan yet — republish or re-link
                curriculum, or open the curriculum hub to confirm content.
              </p>
            )}
          </div>
        )}
      </div>

      {canGenerateProgression && (
        <details
          className="print:hidden bg-card border border-white/[0.08] rounded-2xl overflow-hidden"
          onToggle={(e) =>
            setGuidePanelOpen((e.currentTarget as HTMLDetailsElement).open)
          }
        >
          <summary className="cursor-pointer list-none px-4 py-3 flex items-center justify-between gap-3 hover:bg-white/[0.03] [&::-webkit-details-marker]:hidden">
            <div className="min-w-0">
              <p className="text-xs font-black uppercase tracking-widest text-amber-700/90 dark:text-amber-300/90">
                Teaching Reference
              </p>
              <p className="text-sm font-bold text-card-foreground mt-0.5">
                Week-by-week topic guide for this grade
              </p>
              <p className="text-[11px] text-card-foreground/55 mt-1 leading-snug">
                Suggested weekly topics in the order they should be taught. Use
                this to check your plan matches the expected teaching sequence.
              </p>
            </div>
            <BookOpenIcon className="w-5 h-5 text-amber-600/80 dark:text-amber-400/80 shrink-0" />
          </summary>
          <div className="px-4 pb-4 border-t border-white/[0.06] pt-3 space-y-3">
            {guideLoading && (
              <div className="flex items-center gap-2 text-xs text-card-foreground/50">
                <ArrowPathIcon className="w-4 h-4 animate-spin" /> Loading
                seeded weeks…
              </div>
            )}
            {guideError && !guideLoading && (
              <p className="text-xs text-rose-600 dark:text-rose-400 leading-relaxed">
                {guideError}
              </p>
            )}
            {guideData && !guideLoading && (
              <>
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-card-foreground/60">
                  <span>
                    <span className="font-bold text-card-foreground/75">
                      Track:
                    </span>{" "}
                    {guideData.track}
                  </span>
                  <span>
                    <span className="font-bold text-card-foreground/75">
                      Grade key:
                    </span>{" "}
                    {guideData.grade_key ?? "—"}
                  </span>
                  <span>
                    <span className="font-bold text-card-foreground/75">
                      Phase:
                    </span>{" "}
                    {guideData.syllabus_phase}
                  </span>
                  <span>
                    <span className="font-bold text-card-foreground/75">
                      Weeks:
                    </span>{" "}
                    {guideData.weeks_count}
                  </span>
                  <span className="text-card-foreground/45">
                    ({guideData.source.replace(/_/g, " ")})
                  </span>
                </div>
                <div className="max-h-[min(28rem,55vh)] overflow-auto rounded-xl border border-white/[0.08]">
                  <table className="w-full text-left text-[11px]">
                    <thead className="sticky top-0 bg-zinc-900/95 backdrop-blur border-b border-white/[0.08]">
                      <tr className="text-card-foreground/50 uppercase tracking-wide">
                        <th className="px-2 py-2 font-bold">Yr</th>
                        <th className="px-2 py-2 font-bold">Term</th>
                        <th className="px-2 py-2 font-bold">Wk</th>
                        <th className="px-2 py-2 font-bold">#</th>
                        <th className="px-2 py-2 font-bold min-w-[8rem]">
                          Topic
                        </th>
                        <th className="px-2 py-2 font-bold hidden sm:table-cell">
                          Classwork
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {guideData.weeks.map((row) => (
                        <tr
                          key={`${row.project_key}-${row.sequence}`}
                          className="border-b border-white/[0.04] hover:bg-white/[0.02] align-top"
                        >
                          <td className="px-2 py-1.5 text-card-foreground/70 whitespace-nowrap">
                            {row.year_number ?? "—"}
                          </td>
                          <td className="px-2 py-1.5 text-card-foreground/70 whitespace-nowrap">
                            {row.term_number ?? "—"}
                          </td>
                          <td className="px-2 py-1.5 text-card-foreground/70 whitespace-nowrap">
                            {row.week_number ?? "—"}
                          </td>
                          <td className="px-2 py-1.5 text-card-foreground/70 whitespace-nowrap">
                            {row.week_index ?? "—"}
                          </td>
                          <td className="px-2 py-1.5 text-card-foreground font-medium">
                            {row.title}
                          </td>
                          <td className="px-2 py-1.5 text-card-foreground/55 hidden sm:table-cell max-w-md">
                            {row.classwork_prompt ? (
                              <span className="line-clamp-2">
                                {row.classwork_prompt}
                              </span>
                            ) : (
                              "—"
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

      {/* Teacher workflow: everyday work stays visible; specialist controls do not compete with it. */}
      <nav
        aria-label="Lesson plan workspace"
        className="sticky top-0 z-20 grid grid-cols-3 gap-1.5 rounded-2xl border border-border bg-background/95 p-1.5 shadow-sm backdrop-blur-xl print:hidden"
      >
        {(
          [
            ["plan", "Plan & teach", "Weeks and packages"],
            ["release", "Review & release", "Student visibility"],
            ["advanced", "Advanced", "QA and automation"],
          ] as const
        ).map(([tab, label, detail]) => {
          const selected = activeTab === tab;
          return (
            <button
              key={tab}
              type="button"
              aria-current={selected ? "page" : undefined}
              onClick={() => setActiveTab(tab)}
              className={`min-h-14 min-w-0 rounded-xl px-2 py-2 text-center transition-colors sm:px-4 ${
                selected
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              }`}
            >
              <span className="block truncate text-[10px] font-black uppercase tracking-wide sm:text-xs">
                {label}
              </span>
              <span className={`mt-0.5 hidden text-[10px] sm:block ${selected ? "text-primary-foreground/75" : "text-muted-foreground"}`}>
                {detail}
              </span>
            </button>
          );
        })}
      </nav>

      {/* Week Entries */}
      {activeTab === "plan" && (
        <div className="space-y-3">
          {/* This week: prepare it and see how the class is doing, without leaving the tab. */}
          <ThisWeekPanel
            planId={id}
            termStart={plan.term_start ?? null}
            canGenerate={canGenerateProgression}
          />

          {/* Daily path: one complete package action. Type-by-type repair stays in Advanced. */}
          {canGenerateProgression && plan.course_id && plan.school_id && (
            <div className="print:hidden flex flex-col gap-3 rounded-2xl border border-primary/20 bg-primary/5 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <p className="text-xs font-black text-card-foreground">Prepare complete teaching packages</p>
                <p className="mt-1 text-xs leading-5 text-card-foreground/60">
                  Builds lessons, slides, flashcards, assignments and projects together. Existing work is preserved; held content waits for review.
                </p>
              </div>
              <button
                onClick={() => void generateCompletePackages()}
                disabled={generating !== null}
                className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-xs font-black text-primary-foreground shadow-sm disabled:opacity-40"
              >
                {generating === "package" ? <ArrowPathIcon className="h-4 w-4 animate-spin" /> : <SparklesIcon className="h-4 w-4" />}
                {generating === "package" ? "Preparing packages…" : "Prepare all weeks"}
              </button>
              {genProgress && (
                <p className="text-xs text-card-foreground/60 sm:basis-full">
                  {genProgress.status} — {genProgress.generated}/
                  {genProgress.total}
                </p>
              )}
            </div>
          )}

          <div className="flex items-center justify-between print:hidden">
            <h2 className="text-base font-black text-card-foreground">
              Week-by-Week Plan
            </h2>
            <button
              onClick={addWeek}
              disabled={saving || weekDraft !== null}
              className="flex items-center gap-2 px-3 py-1.5 bg-primary hover:bg-primary disabled:opacity-50 text-white text-sm font-bold rounded-xl transition-all"
            >
              <PlusIcon className="w-4 h-4" /> Add Week
            </button>
          </div>

          {weeks.length === 0 ? (
            <div className="bg-card border border-white/[0.08] rounded-2xl p-8 text-center print:hidden">
              <p className="text-card-foreground/40 text-sm">
                No weeks added yet. Click "Add Week" to start building your
                plan.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {weeks.map((w) => {
                const weekLesson = linkedLessons.find((l) =>
                  metadataMatchesWeek(l.metadata, w)
                );
                const weekAssignment = linkedAssignments.find((a) =>
                  metadataMatchesWeek(a.metadata, w)
                );
                const weekProject = linkedProjects.find((p) =>
                  metadataMatchesWeek(p.metadata, w)
                );
                const addLessonHref = buildPlanWeekCreateLessonUrl({
                  plan: plan!,
                  week: w,
                  courseTitle,
                });
                const addAssignmentHref = `/dashboard/assignments/new?lesson_plan_id=${id}&week=${
                  w.week
                }${plan?.course_id ? `&course_id=${plan.course_id}` : ""}`;
                const addProjectHref = `/dashboard/assignments/new?lesson_plan_id=${id}&week=${
                  w.week
                }&type=project${
                  plan?.course_id ? `&course_id=${plan.course_id}` : ""
                }`;
                const hasAllContent =
                  weekLesson && weekAssignment && weekProject;

                return (
                  <div
                    key={w.week}
                    className={`bg-gradient-to-b from-white/[0.03] to-white/[0.01] hover:from-white/[0.06] hover:to-white/[0.02] border rounded-[24px] overflow-hidden hover:border-primary/30 transition-all duration-300 group shadow-xl hover:shadow-primary/5 ${
                      w.completed
                        ? "border-emerald-500/25 bg-emerald-500/[0.01]"
                        : "border-white/[0.08]"
                    }`}
                  >
                    <div className="p-5 space-y-4">
                      {/* Card Header area: Title, progress indicator */}
                      <div
                        className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 cursor-pointer"
                        onClick={() => setViewWeek(w)}
                      >
                        <div className="space-y-1">
                          <div className="flex items-center flex-wrap gap-2">
                            <span className="text-xs font-black text-primary bg-primary/10 px-2.5 py-0.5 rounded-full border border-primary/20">
                              Week {w.week}
                            </span>
                            {(w.gating_state ?? "unlocked") === "locked" && (
                              <span className="text-[10px] font-black text-amber-700 dark:text-amber-300 bg-amber-500/10 px-2 py-0.5 rounded-full border border-amber-500/30">
                                Locked
                              </span>
                            )}
                            {(w.gating_state ?? "unlocked") === "mastered" && (
                              <span className="text-[10px] font-black text-emerald-700 dark:text-emerald-300 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/30">
                                Mastered
                              </span>
                            )}
                            {w.completed && (
                              <span className="text-[10px] font-black text-emerald-700 dark:text-emerald-300 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/30">
                                Completed
                              </span>
                            )}
                            {w.progression_badge?.label && (
                              <span className="text-[10px] font-black text-cyan-700 dark:text-cyan-300 bg-cyan-500/10 px-2 py-0.5 rounded-full border border-cyan-500/30">
                                {w.progression_badge.label}
                              </span>
                            )}
                          </div>
                          <h3 className="font-black text-card-foreground text-base tracking-tight mt-1">
                            {w.topic || (
                              <span className="text-card-foreground/30 italic font-medium">
                                No topic assigned
                              </span>
                            )}
                          </h3>
                          {w.objectives && (
                            <p className="text-xs text-card-foreground/50 line-clamp-1 leading-normal">
                              {w.objectives}
                            </p>
                          )}
                        </div>

                        {/* Visual Progress Tag */}
                        <div className="flex items-center gap-1.5 text-[9px] font-black uppercase tracking-wider text-muted-foreground bg-black/40 px-3 py-1.5 rounded-full border border-white/5 font-mono shrink-0 sm:self-start">
                          <span>SYNC:</span>
                          <span
                            className={
                              weekLesson
                                ? "text-emerald-600 dark:text-emerald-400 font-black"
                                : "opacity-35"
                            }
                          >
                            LESSON
                          </span>
                          <span className="opacity-25">•</span>
                          <span
                            className={
                              weekAssignment
                                ? "text-cyan-600 dark:text-cyan-400 font-black"
                                : "opacity-35"
                            }
                          >
                            ASSIGN
                          </span>
                          <span className="opacity-25">•</span>
                          <span
                            className={
                              weekProject
                                ? "text-primary font-black"
                                : "opacity-35"
                            }
                          >
                            PROJECT
                          </span>
                        </div>
                      </div>

                      {/* Interactive Curriculum Workflow cockpit */}
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-1">
                        {/* 1. Lesson Cockpit Column */}
                        {weekLesson ? (
                          <Link
                            href={`/dashboard/lessons/${weekLesson.id}`}
                            className="flex flex-col p-3 bg-emerald-500/[0.02] hover:bg-emerald-500/[0.06] border border-emerald-500/25 rounded-2xl transition-all group/item text-left"
                          >
                            <span className="text-[9px] font-black text-emerald-600 dark:text-emerald-400 uppercase tracking-widest font-mono">
                              1. Teaching Content
                            </span>
                            <span className="text-xs font-bold text-emerald-800/90 dark:text-emerald-100/90 mt-1 truncate">
                              ✓ Lesson Notes Ready
                            </span>
                            <span className="text-[10px] text-emerald-700/40 dark:text-emerald-300/40 mt-0.5 group-hover/item:text-emerald-300/70 transition-colors">
                              Click to open workspace →
                            </span>
                          </Link>
                        ) : (
                          <Link
                            href={addLessonHref}
                            className="flex flex-col p-3 bg-white/[0.01] hover:bg-white/[0.03] border border-white/5 hover:border-emerald-500/30 rounded-2xl transition-all group/item text-left text-muted-foreground hover:text-emerald-600 dark:hover:text-emerald-400"
                          >
                            <span className="text-[9px] font-black uppercase tracking-widest font-mono">
                              1. Teaching Content
                            </span>
                            <span className="text-xs font-bold mt-1 text-card-foreground/50 group-hover/item:text-emerald-400">
                              Missing Lesson
                            </span>
                            <span className="text-[10px] text-muted-foreground/40 mt-0.5 group-hover/item:text-emerald-400/50 transition-colors">
                              + Build standard notes
                            </span>
                          </Link>
                        )}

                        {/* 2. Assignment Cockpit Column */}
                        {weekAssignment ? (
                          <Link
                            href={`/dashboard/assignments/${weekAssignment.id}`}
                            className="flex flex-col p-3 bg-cyan-500/[0.02] hover:bg-cyan-500/[0.06] border border-cyan-500/25 rounded-2xl transition-all group/item text-left"
                          >
                            <span className="text-[9px] font-black text-cyan-600 dark:text-cyan-400 uppercase tracking-widest font-mono">
                              2. Task & Evaluation
                            </span>
                            <span className="text-xs font-bold text-cyan-800/90 dark:text-cyan-100/90 mt-1 truncate">
                              ✓ Assignment Loaded
                            </span>
                            <span className="text-[10px] text-cyan-700/40 dark:text-cyan-300/40 mt-0.5 group-hover/item:text-cyan-300/70 transition-colors">
                              Click to grade submissions →
                            </span>
                          </Link>
                        ) : (
                          <Link
                            href={addAssignmentHref}
                            className="flex flex-col p-3 bg-white/[0.01] hover:bg-white/[0.03] border border-white/5 hover:border-cyan-500/30 rounded-2xl transition-all group/item text-left text-muted-foreground hover:text-cyan-600 dark:hover:text-cyan-400"
                          >
                            <span className="text-[9px] font-black uppercase tracking-widest font-mono">
                              2. Task & Evaluation
                            </span>
                            <span className="text-xs font-bold mt-1 text-card-foreground/50 group-hover/item:text-cyan-400">
                              No Assignment
                            </span>
                            <span className="text-[10px] text-muted-foreground/40 mt-0.5 group-hover/item:text-cyan-400/50 transition-colors">
                              + Generate homework task
                            </span>
                          </Link>
                        )}

                        {/* 3. Project Cockpit Column */}
                        {weekProject ? (
                          <Link
                            href={`/dashboard/assignments/${weekProject.id}`}
                            className="flex flex-col p-3 bg-primary/[0.02] hover:bg-primary/[0.06] border border-primary/25 rounded-2xl transition-all group/item text-left"
                          >
                            <span className="text-[9px] font-black text-primary uppercase tracking-widest font-mono">
                              3. Capstone Activity
                            </span>
                            <span className="text-xs font-bold text-blue-800/90 dark:text-blue-100/90 mt-1 truncate">
                              ✓ Project Active
                            </span>
                            <span className="text-[10px] text-primary/40 mt-0.5 group-hover/item:text-primary/70 transition-colors">
                              Click to grade rubrics →
                            </span>
                          </Link>
                        ) : (
                          <Link
                            href={addProjectHref}
                            className="flex flex-col p-3 bg-white/[0.01] hover:bg-white/[0.03] border border-white/5 hover:border-primary/30 rounded-2xl transition-all group/item text-left text-muted-foreground hover:text-primary"
                          >
                            <span className="text-[9px] font-black uppercase tracking-widest font-mono">
                              3. Capstone Activity
                            </span>
                            <span className="text-xs font-bold mt-1 text-card-foreground/50 group-hover/item:text-primary">
                              No Project
                            </span>
                            <span className="text-[10px] text-muted-foreground/40 mt-0.5 group-hover/item:text-primary/50 transition-colors">
                              + Create builder handbook
                            </span>
                          </Link>
                        )}
                      </div>

                      {/* Interactive AI Synthesis or Status pack capsule */}
                      {!hasAllContent ? (
                        <button
                          onClick={() => setAiWeek(w)}
                          disabled={generating !== null}
                          className="w-full flex items-center justify-center gap-2 py-2.5 bg-gradient-to-r from-primary/10 via-fuchsia-600/10 to-primary/10 hover:from-primary/25 hover:via-fuchsia-600/25 hover:to-primary/25 border border-primary/25 hover:border-primary/50 text-[10px] font-black uppercase tracking-widest text-primary hover:text-foreground rounded-xl transition-all duration-300"
                        >
                          <SparklesIcon className="w-3.5 h-3.5" />{" "}
                          Auto-Synthesize AI Materials Pack (Lesson + Flashcards
                          + Assignment + Capstone Project)
                        </button>
                      ) : (
                        <div className="w-full flex items-center justify-center gap-2 py-2 bg-emerald-500/5 border border-emerald-500/10 text-[10px] font-black uppercase tracking-widest text-emerald-600 dark:text-emerald-400 rounded-xl">
                          <CheckCircleIcon className="w-3.5 h-3.5" /> Curriculum
                          Pack Fully Generated & Synced
                        </div>
                      )}

                      {/* Timeline Card Footer - Expandable seeds and secondary toolbar controls */}
                      <div className="flex flex-col gap-3 pt-2.5 border-t border-white/[0.04]">
                        {/* Seed Brief details inside collapsible / visual block */}
                        {(w.project?.title || w.assignment?.title) && (
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px] leading-relaxed">
                            {w.project?.title && (
                              <div className="text-muted-foreground/75">
                                <span className="font-bold text-emerald-600/80 dark:text-emerald-400/80">
                                  Project Mission Seed:
                                </span>{" "}
                                {w.project.title}
                              </div>
                            )}
                            {w.assignment?.title && (
                              <div className="text-muted-foreground/75">
                                <span className="font-bold text-cyan-600/80 dark:text-cyan-400/80">
                                  Assignment Concept:
                                </span>{" "}
                                {w.assignment.title}
                              </div>
                            )}
                          </div>
                        )}

                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 text-card-foreground/50 group-hover:text-card-foreground/70 transition-colors">
                          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                            <button
                              onClick={() => setViewWeek(w)}
                              className="flex items-center gap-1.5 hover:text-primary text-xs font-black uppercase tracking-wider transition-colors"
                            >
                              <BookOpenIcon className="w-3.5 h-3.5" /> View
                              Notes & Inline Previews
                            </button>
                            {w.practical_assessment && (
                              <div className="flex items-center gap-1.5 bg-amber-500/5 border border-amber-500/10 px-2 py-0.5 rounded-lg text-[10px] font-black text-amber-600 dark:text-amber-400 uppercase tracking-wider">
                                Practical:{" "}
                                {w.practical_assessment.practical_score ?? 0}/
                                {w.practical_assessment.max_score ?? 100}
                              </div>
                            )}
                          </div>

                          <div className="flex items-center gap-2 print:hidden self-end sm:self-auto">
                            <button
                              onClick={() => toggleWeekCompleted(w.week)}
                              className={`p-1.5 rounded-lg border transition-all ${
                                w.completed
                                  ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/20"
                                  : "bg-white/5 border-white/5 hover:bg-white/10 hover:text-white"
                              }`}
                              title={
                                w.completed
                                  ? "Mark incomplete"
                                  : "Mark complete"
                              }
                            >
                              <CheckCircleIcon className="w-4 h-4" />
                            </button>
                            {(w.gating_state ?? "unlocked") === "locked" &&
                              canGenerateProgression && (
                                <button
                                  onClick={() => unlockWeekWithOverride(w.week)}
                                  className="p-1.5 bg-cyan-500/10 border border-cyan-500/30 text-cyan-600 dark:text-cyan-400 hover:bg-cyan-500/20 rounded-lg transition-all"
                                  title="Override unlock this locked week"
                                >
                                  <LockOpenIcon className="w-4 h-4" />
                                </button>
                              )}
                            <button
                              onClick={() => startEdit(w)}
                              className="p-1.5 bg-white/5 border border-white/5 hover:bg-white/10 hover:text-white rounded-lg transition-all"
                              title="Edit Week Settings"
                            >
                              <PencilIcon className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => deleteWeek(w.week)}
                              className="p-1.5 bg-rose-500/10 border border-rose-500/30 text-rose-600 dark:text-rose-400 hover:bg-rose-500/20 rounded-lg transition-all"
                              title="Delete Week"
                            >
                              <TrashIcon className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {saving && (
            <div className="flex items-center gap-2 text-xs text-card-foreground/40 print:hidden">
              <ArrowPathIcon className="w-3.5 h-3.5 animate-spin" /> Saving…
            </div>
          )}
        </div>
      )}

      {activeTab === "release" && (
        <div className="space-y-4">
          {(() => {
            const visibleLessons = linkedLessons.filter((lesson) =>
              ["active", "published"].includes(lesson.status)
            ).length;
            const heldLessons = Math.max(0, linkedLessons.length - visibleLessons);
            const releasedWeeks =
              operations?.release_board.filter(
                (row) => row.release_status === "released"
              ).length ?? 0;
            const attentionWeeks =
              operations?.release_board.filter(
                (row) => row.release_status !== "released"
              ).length ?? 0;

            return (
              <>
                <section className="overflow-hidden rounded-2xl border border-border bg-card">
                  <div className="border-b border-border bg-gradient-to-br from-primary/10 via-transparent to-emerald-500/10 p-4 sm:p-6">
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                      <div className="max-w-2xl">
                        <p className="text-[10px] font-black uppercase tracking-widest text-primary">
                          Student delivery gate
                        </p>
                        <h2 className="mt-1 text-xl font-black text-foreground sm:text-2xl">
                          Review once, release the complete package
                        </h2>
                        <p className="mt-2 text-sm leading-6 text-muted-foreground">
                          Lessons, learning slides, flashcards, homework and projects stay together. Review held work before students see it; released work remains available from the same week record.
                        </p>
                      </div>
                      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:min-w-[30rem]">
                        {[
                          ["Held lessons", heldLessons],
                          ["Visible lessons", visibleLessons],
                          ["Released weeks", releasedWeeks],
                          ["Need attention", attentionWeeks],
                        ].map(([label, value]) => (
                          <div key={label} className="rounded-xl border border-border bg-background/80 p-3">
                            <p className="text-xl font-black text-foreground">{value}</p>
                            <p className="mt-1 text-[9px] font-black uppercase tracking-wide text-muted-foreground">{label}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="grid gap-3 p-4 sm:grid-cols-2 sm:p-6 lg:grid-cols-4">
                    <Link
                      href="/dashboard/teaching/approvals"
                      className="flex min-h-20 flex-col justify-center rounded-xl bg-primary p-4 text-primary-foreground shadow-sm"
                    >
                      <span className="text-sm font-black">Review held packages</span>
                      <span className="mt-1 text-xs text-primary-foreground/75">Approve what students will receive →</span>
                    </Link>
                    {plan.class_id ? (
                      <Link
                        href={`/dashboard/classes/${plan.class_id}?course_id=${encodeURIComponent(plan.course_id ?? "")}#teaching`}
                        className="flex min-h-20 flex-col justify-center rounded-xl border border-border bg-background p-4"
                      >
                        <span className="text-sm font-black text-foreground">Open class teaching</span>
                        <span className="mt-1 text-xs text-muted-foreground">Teach, attend and track delivery →</span>
                      </Link>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setClassPickerOpen(true)}
                        className="flex min-h-20 flex-col justify-center rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-left"
                      >
                        <span className="text-sm font-black text-foreground">Assign a class</span>
                        <span className="mt-1 text-xs text-muted-foreground">Required before student delivery →</span>
                      </button>
                    )}
                    <Link
                      href={`/dashboard/lessons?lesson_plan_id=${id}`}
                      className="flex min-h-20 flex-col justify-center rounded-xl border border-border bg-background p-4"
                    >
                      <span className="text-sm font-black text-foreground">Lesson library</span>
                      <span className="mt-1 text-xs text-muted-foreground">Open the exact student lesson content →</span>
                    </Link>
                    <Link
                      href={`/dashboard/assignments?lesson_plan_id=${id}`}
                      className="flex min-h-20 flex-col justify-center rounded-xl border border-border bg-background p-4"
                    >
                      <span className="text-sm font-black text-foreground">Tasks & submissions</span>
                      <span className="mt-1 text-xs text-muted-foreground">Homework, projects and grading →</span>
                    </Link>
                  </div>
                </section>

                <section className="rounded-2xl border border-border bg-card p-4 sm:p-6">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Weekly visibility</p>
                      <h3 className="mt-1 text-lg font-black text-foreground">What is ready and what students can see</h3>
                    </div>
                    {opsLoading && (
                      <span className="inline-flex items-center gap-2 text-xs text-muted-foreground">
                        <ArrowPathIcon className="h-4 w-4 animate-spin" /> Refreshing…
                      </span>
                    )}
                  </div>
                  {opsError && (
                    <p className="mt-4 rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-700 dark:text-rose-300">{opsError}</p>
                  )}
                  {operations?.generation?.available &&
                    ["running", "attention"].includes(operations.generation.state) && (
                      <div className={`mt-4 flex flex-col gap-3 rounded-xl border p-4 sm:flex-row sm:items-center sm:justify-between ${
                        operations.generation.state === "attention"
                          ? "border-amber-500/30 bg-amber-500/10"
                          : "border-primary/25 bg-primary/5"
                      }`}>
                        <div>
                          <p className="text-xs font-black text-foreground">
                            {operations.generation.week
                              ? `Week ${operations.generation.week} · Class ${operations.generation.session ?? 1}`
                              : "Teaching package"}
                          </p>
                          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                            {operations.generation.message}
                          </p>
                        </div>
                        {operations.generation.state === "attention" && (
                          <button
                            type="button"
                            onClick={() => setActiveTab("plan")}
                            className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-xl border border-amber-500/30 bg-background px-4 text-xs font-black text-foreground"
                          >
                            Review and retry
                          </button>
                        )}
                      </div>
                    )}
                  {!opsLoading && !opsError && !operations?.release_board.length && (
                    <p className="mt-4 rounded-xl border border-border bg-muted/30 p-4 text-sm text-muted-foreground">
                      No teaching weeks are ready yet. Return to Plan &amp; teach to prepare the first complete package.
                    </p>
                  )}
                  <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                    {operations?.release_board.map((row) => (
                      <div key={row.key} className="rounded-xl border border-border bg-background p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-[10px] font-black uppercase tracking-widest text-primary">Week {row.week_number} · Class {row.session_number}</p>
                            <p className="mt-1 truncate text-sm font-black text-foreground">{row.topic}</p>
                          </div>
                          <span className={`rounded-full px-2 py-1 text-[9px] font-black uppercase tracking-wide ${
                            row.release_status === "released"
                              ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                              : row.release_status === "partial"
                                ? "bg-amber-500/15 text-amber-700 dark:text-amber-300"
                                : "bg-muted text-muted-foreground"
                          }`}>
                            {row.release_status}
                          </span>
                        </div>
                        <div className="mt-3 grid grid-cols-2 gap-2 text-[10px] text-muted-foreground">
                          <span>{row.lessons_published}/{row.lessons_total} lessons live</span>
                          <span>{row.assignments_active}/{row.assignments_total} assignments live</span>
                          <span>{row.projects_active}/{row.projects_total} projects live</span>
                          <span>{row.slides_public}/{row.slides_total} slide decks live</span>
                          <span>{row.flashcards_public}/{row.flashcards_total} card decks live</span>
                        </div>
                        {(row.missing_assets.length > 0 || row.held_assets.length > 0) && (
                          <p className="mt-3 border-t border-border pt-3 text-[10px] leading-relaxed text-muted-foreground">
                            {row.prepared_count}/{row.total_count} prepared
                            {row.missing_assets.length > 0 ? ` · Add ${row.missing_assets.join(", ")}` : ""}
                            {row.held_assets.length > 0 ? ` · Release ${row.held_assets.join(", ")}` : ""}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                </section>
              </>
            );
          })()}
        </div>
      )}

      {/* ── Week AI Generator modal ── */}
      {aiWeek && (
        <WeekAIGenerator
          week={aiWeek}
          planId={id}
          courseId={plan?.course_id}
          classId={plan?.class_id}
          existing={{
            lessonId: linkedLessons.find((l) =>
              metadataMatchesWeek(l.metadata, aiWeek)
            )?.id,
            assignmentId: linkedAssignments.find((a) =>
              metadataMatchesWeek(a.metadata, aiWeek)
            )?.id,
            projectId: linkedProjects.find((p) =>
              metadataMatchesWeek(p.metadata, aiWeek)
            )?.id,
          }}
          onDone={(res) => {
            if (
              res.lessonId &&
              !linkedLessons.find((l) => l.id === res.lessonId)
            ) {
              setLinkedLessons((prev) => [
                ...prev,
                {
                  id: res.lessonId!,
                  title: `Week ${aiWeek.week} Lesson`,
                  status: "draft",
                  metadata: { week: aiWeek.week, week_number: aiWeek.week },
                },
              ]);
            }
            if (
              res.assignmentId &&
              !linkedAssignments.find((a) => a.id === res.assignmentId)
            ) {
              setLinkedAssignments((prev) => [
                ...prev,
                {
                  id: res.assignmentId!,
                  title: `Week ${aiWeek.week} Assignment`,
                  assignment_type: "homework",
                  metadata: { week: aiWeek.week, week_number: aiWeek.week },
                },
              ]);
            }
            if (
              res.projectId &&
              !linkedProjects.find((p) => p.id === res.projectId)
            ) {
              setLinkedProjects((prev) => [
                ...prev,
                {
                  id: res.projectId!,
                  title: `Week ${aiWeek.week} Project`,
                  metadata: { week: aiWeek.week, week_number: aiWeek.week },
                },
              ]);
            }
            load(); // Reload the whole plan data to grab newly generated records
            toast.success(
              "This week is ready — lesson, practice cards, homework & project are waiting for you."
            );
          }}
          onClose={() => setAiWeek(null)}
        />
      )}

      {/* Content Dashboard Tab */}
      {activeTab === "advanced" && (
        <div className="space-y-4">
          {(() => {
            const nextOps = linearOpsFlow.find((item) => item.state !== "live") ?? linearOpsFlow[0];
            const blockedCount = linearOpsFlow.filter((item) => item.state === "risk").length;
            const watchCount = linearOpsFlow.filter((item) => item.state === "watch").length;
            return (
              <div className="bg-card border border-border rounded-2xl p-4 sm:p-5 space-y-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <p className="text-[10px] font-black uppercase tracking-widest text-primary">Do this next</p>
                    <h3 className="text-lg sm:text-xl font-black text-foreground mt-1">
                      {nextOps?.title ?? "Open the Weeks tab"}
                    </h3>
                    <p className="text-sm text-muted-foreground mt-1 leading-relaxed max-w-2xl">
                      {nextOps?.detail ?? "Build or teach week by week from the Weeks tab."}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setActiveTab("plan")}
                    className="shrink-0 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-black"
                  >
                    Go to Weeks
                  </button>
                </div>
                <p className="text-xs text-muted-foreground">
                  {blockedCount > 0
                    ? `${blockedCount} item${blockedCount === 1 ? "" : "s"} blocked`
                    : watchCount > 0
                    ? `${watchCount} item${watchCount === 1 ? "" : "s"} need attention`
                    : "Everything looks ready — teach from Weeks."}
                </p>
                <details className="rounded-xl border border-border bg-muted/30">
                  <summary className="cursor-pointer list-none px-4 py-3 text-sm font-bold text-foreground flex items-center justify-between gap-2">
                    <span>Advanced status (8 checks)</span>
                    <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Optional</span>
                  </summary>
                  <div className="px-4 pb-4 grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {linearOpsFlow.map((item) => (
                      <div
                        key={item.step}
                        className={`rounded-xl border p-3 ${
                          item.state === "risk"
                            ? "border-rose-400/25 bg-rose-500/[0.06]"
                            : item.state === "watch"
                            ? "border-amber-400/25 bg-amber-500/[0.06]"
                            : "border-border bg-card"
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                            {item.step}
                          </span>
                          <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                            {item.state}
                          </span>
                        </div>
                        <p className="text-sm font-bold text-foreground mt-1">{item.title}</p>
                      </div>
                    ))}
                  </div>
                </details>
              </div>
            );
          })()}

          {status === "published" && (
            <>
              <div className="bg-card border border-white/[0.08] rounded-[28px] overflow-hidden">
                <div className="p-5 sm:p-6 border-b border-white/[0.06] bg-[radial-gradient(circle_at_top_left,rgba(14,165,233,0.18),transparent_30%),radial-gradient(circle_at_top_right,rgba(236,72,153,0.12),transparent_30%),linear-gradient(180deg,rgba(255,255,255,0.05),rgba(255,255,255,0.01))]">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="max-w-2xl">
                      <p className="text-[11px] font-black uppercase tracking-[0.25em] text-cyan-700/90 dark:text-cyan-300/90">
                        Live Activity
                      </p>
                      <h3 className="text-xl sm:text-2xl font-black text-card-foreground mt-2">
                        Schedule, releases, results, and activity in one view
                      </h3>
                      <p className="text-sm text-card-foreground/65 mt-2 leading-relaxed">
                        Everything happening on this plan right now — when
                        content releases to students, how they are performing,
                        and a log of changes made by the team.
                      </p>
                    </div>
                    <div className="grid grid-cols-2 gap-3 min-w-0 sm:min-w-[18rem]">
                      <div className="rounded-2xl border border-white/10 bg-black/20 p-3">
                        <p className="text-[10px] uppercase tracking-[0.2em] text-card-foreground/45 font-black">
                          Scheduler
                        </p>
                        <p className="text-sm font-black text-card-foreground mt-1">
                          {operations?.schedule?.is_active
                            ? "Active"
                            : "Inactive"}
                        </p>
                      </div>
                      <div className="rounded-2xl border border-white/10 bg-black/20 p-3">
                        <p className="text-[10px] uppercase tracking-[0.2em] text-card-foreground/45 font-black">
                          Current Week
                        </p>
                        <p className="text-sm font-black text-card-foreground mt-1">
                          {operations?.schedule?.current_week ?? 0}
                        </p>
                      </div>
                      <div className="rounded-2xl border border-white/10 bg-black/20 p-3">
                        <p className="text-[10px] uppercase tracking-[0.2em] text-card-foreground/45 font-black">
                          Weeks tracked
                        </p>
                        <p className="text-sm font-black text-card-foreground mt-1">
                          {operations?.release_board?.length ?? 0}
                        </p>
                      </div>
                      <div className="rounded-2xl border border-white/10 bg-black/20 p-3">
                        <p className="text-[10px] uppercase tracking-[0.2em] text-card-foreground/45 font-black">
                          Activity log
                        </p>
                        <p className="text-sm font-black text-card-foreground mt-1">
                          {operations?.audit.summary.total_events ?? 0}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="p-5 sm:p-6 space-y-4">
                  {opsLoading && (
                    <div className="flex items-center gap-2 text-sm text-card-foreground/55">
                      <ArrowPathIcon className="w-4 h-4 animate-spin" /> Loading
                      operations center...
                    </div>
                  )}
                  {opsError && !opsLoading && (
                    <div className="rounded-2xl border border-rose-400/25 bg-rose-500/[0.08] p-4 text-sm text-rose-800 dark:text-rose-200">
                      {opsError}
                    </div>
                  )}
                  {operations && !opsLoading && (
                    <>
                      <div className="grid grid-cols-1 xl:grid-cols-[0.9fr_1.1fr] gap-4">
                        <section className="rounded-[24px] border border-white/[0.08] bg-white/[0.03] p-4">
                          <p className="text-[11px] font-black uppercase tracking-[0.22em] text-card-foreground/45">
                            Schedule
                          </p>
                          <div className="mt-4 grid grid-cols-2 gap-3 text-xs">
                            <div className="rounded-2xl border border-white/[0.08] bg-black/20 p-3">
                              <p className="text-card-foreground/45 uppercase tracking-[0.18em] font-black">
                                Status
                              </p>
                              <p className="text-card-foreground font-black mt-2">
                                {operations.schedule?.is_active
                                  ? "Active"
                                  : "Not active"}
                              </p>
                            </div>
                            <div className="rounded-2xl border border-white/[0.08] bg-black/20 p-3">
                              <p className="text-card-foreground/45 uppercase tracking-[0.18em] font-black">
                                Every
                              </p>
                              <p className="text-card-foreground font-black mt-2">
                                {operations.schedule?.cadence_days ?? 7} days
                              </p>
                            </div>
                            <div className="rounded-2xl border border-white/[0.08] bg-black/20 p-3">
                              <p className="text-card-foreground/45 uppercase tracking-[0.18em] font-black">
                                Term Start
                              </p>
                              <p className="text-card-foreground font-black mt-2">
                                {operations.schedule?.term_start
                                  ? new Date(
                                      operations.schedule.term_start
                                    ).toLocaleDateString()
                                  : "Not set"}
                              </p>
                            </div>
                            <div className="rounded-2xl border border-white/[0.08] bg-black/20 p-3">
                              <p className="text-card-foreground/45 uppercase tracking-[0.18em] font-black">
                                Last Sync
                              </p>
                              <p className="text-card-foreground font-black mt-2">
                                {operations.schedule?.updated_at
                                  ? new Date(
                                      operations.schedule.updated_at
                                    ).toLocaleString()
                                  : "—"}
                              </p>
                            </div>
                          </div>
                        </section>

                        <section className="rounded-[24px] border border-white/[0.08] bg-white/[0.03] p-4">
                          <div className="flex items-center justify-between gap-3">
                            <p className="text-[11px] font-black uppercase tracking-[0.22em] text-card-foreground/45">
                              Weekly releases
                            </p>
                            <span className="text-xs text-card-foreground/55">
                              What has been released to students each week
                            </span>
                          </div>
                          <div className="mt-4 space-y-3 max-h-[28rem] overflow-auto pr-1">
                            {operations.release_board.map((row) => (
                              <div
                                key={row.key}
                                className="rounded-2xl border border-white/[0.08] bg-black/20 p-3"
                              >
                                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                                  <div>
                                    <p className="text-xs font-black text-card-foreground">
                                      Y{row.year_number} T{row.term_number} W
                                      {row.week_number} · Class {row.session_number}
                                    </p>
                                    <p className="text-sm text-card-foreground/80 mt-1">
                                      {row.topic}
                                    </p>
                                  </div>
                                  <span
                                    className={`px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-[0.18em] ${
                                      row.release_status === "released"
                                        ? "bg-emerald-500/15 text-emerald-800 dark:text-emerald-200 border border-emerald-400/20"
                                        : row.release_status === "partial"
                                        ? "bg-amber-500/15 text-amber-800 dark:text-amber-200 border border-amber-400/20"
                                        : row.release_status === "draft"
                                        ? "bg-zinc-500/15 text-zinc-800 dark:text-zinc-200 border border-zinc-400/20"
                                        : "bg-rose-500/15 text-rose-800 dark:text-rose-200 border border-rose-400/20"
                                    }`}
                                  >
                                    {row.release_status}
                                  </span>
                                </div>
                                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-3 text-xs">
                                  <div className="rounded-xl border border-white/[0.08] px-3 py-2">
                                    Lessons {row.lessons_published}/
                                    {row.lessons_total}
                                  </div>
                                  <div className="rounded-xl border border-white/[0.08] px-3 py-2">
                                    Assignments {row.assignments_active}/
                                    {row.assignments_total}
                                  </div>
                                  <div className="rounded-xl border border-white/[0.08] px-3 py-2">
                                    Projects {row.projects_active}/
                                    {row.projects_total}
                                  </div>
                                  <div className="rounded-xl border border-white/[0.08] px-3 py-2">
                                    Slides {row.slides_public}/{row.slides_total}
                                  </div>
                                  <div className="rounded-xl border border-white/[0.08] px-3 py-2">
                                    Flashcards {row.flashcards_public}/{row.flashcards_total}
                                  </div>
                                  <div className="rounded-xl border border-white/[0.08] px-3 py-2">
                                    Prepared {row.prepared_count}/{row.total_count}
                                  </div>
                                  <div className="rounded-xl border border-white/[0.08] px-3 py-2 sm:col-span-3">
                                    Latest{" "}
                                    {row.latest_release_at
                                      ? new Date(
                                          row.latest_release_at
                                        ).toLocaleString()
                                      : "No release yet"}
                                  </div>
                                </div>
                                {row.history.length > 0 && (
                                  <div className="mt-3 space-y-1">
                                    {row.history.map((event, idx) => (
                                      <div
                                        key={`${row.key}-${idx}`}
                                        className="text-[11px] text-card-foreground/60"
                                      >
                                        {new Date(event.at).toLocaleString()} ·{" "}
                                        {event.type} · {event.status}
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
                          <p className="text-[11px] font-black uppercase tracking-[0.22em] text-card-foreground/45">
                            Student Results
                          </p>
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4 text-xs">
                            <div className="rounded-2xl border border-white/[0.08] bg-black/20 p-3">
                              <p className="text-card-foreground/45 uppercase tracking-[0.18em] font-black">
                                Students
                              </p>
                              <p className="text-card-foreground font-black mt-2">
                                {operations.analytics.summary.total_records}
                              </p>
                            </div>
                            <div className="rounded-2xl border border-white/[0.08] bg-black/20 p-3">
                              <p className="text-card-foreground/45 uppercase tracking-[0.18em] font-black">
                                Completion
                              </p>
                              <p className="text-card-foreground font-black mt-2">
                                {operations.analytics.summary.completion_pct}%
                              </p>
                            </div>
                            <div className="rounded-2xl border border-white/[0.08] bg-black/20 p-3">
                              <p className="text-card-foreground/45 uppercase tracking-[0.18em] font-black">
                                Avg Score
                              </p>
                              <p className="text-card-foreground font-black mt-2">
                                {
                                  operations.analytics.summary
                                    .average_practical_score
                                }
                              </p>
                            </div>
                            <div className="rounded-2xl border border-white/[0.08] bg-black/20 p-3">
                              <p className="text-card-foreground/45 uppercase tracking-[0.18em] font-black">
                                Avg Retries
                              </p>
                              <p className="text-card-foreground font-black mt-2">
                                {
                                  operations.analytics.summary
                                    .average_retry_count
                                }
                              </p>
                            </div>
                          </div>
                          <div className="mt-4 space-y-2">
                            {operations.analytics.terms.map((term) => (
                              <div
                                key={term.key}
                                className="rounded-xl border border-white/[0.08] bg-black/20 p-3 text-xs"
                              >
                                <div className="flex items-center justify-between gap-3">
                                  <p className="font-black text-card-foreground">
                                    Y{term.year_number} T{term.term_number}
                                  </p>
                                  <p className="text-card-foreground/60">
                                    {term.total_records} record(s)
                                  </p>
                                </div>
                                <div className="grid grid-cols-3 gap-2 mt-3 text-card-foreground/75">
                                  <div>Completion {term.completion_pct}%</div>
                                  <div>
                                    Score {term.average_practical_score}
                                  </div>
                                  <div>Retry {term.average_retry_count}</div>
                                </div>
                              </div>
                            ))}
                          </div>
                        </section>

                        <section className="rounded-[24px] border border-white/[0.08] bg-white/[0.03] p-4">
                          <p className="text-[11px] font-black uppercase tracking-[0.22em] text-card-foreground/45">
                            Activity log
                          </p>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-4 text-xs">
                            <div className="rounded-2xl border border-white/[0.08] bg-black/20 p-3">
                              <p className="text-card-foreground/45 uppercase tracking-[0.18em] font-black">
                                By Action
                              </p>
                              <div className="mt-3 space-y-2">
                                {operations.audit.summary.by_action.map(
                                  (row) => (
                                    <div
                                      key={row.action_type}
                                      className="flex items-center justify-between gap-3"
                                    >
                                      <span className="text-card-foreground/70">
                                        {row.action_type}
                                      </span>
                                      <span className="font-black text-card-foreground">
                                        {row.count}
                                      </span>
                                    </div>
                                  )
                                )}
                              </div>
                            </div>
                            <div className="rounded-2xl border border-white/[0.08] bg-black/20 p-3">
                              <p className="text-card-foreground/45 uppercase tracking-[0.18em] font-black">
                                By Role
                              </p>
                              <div className="mt-3 space-y-2">
                                {operations.audit.summary.by_role.map((row) => (
                                  <div
                                    key={row.actor_role}
                                    className="flex items-center justify-between gap-3"
                                  >
                                    <span className="text-card-foreground/70">
                                      {row.actor_role}
                                    </span>
                                    <span className="font-black text-card-foreground">
                                      {row.count}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          </div>
                          <div className="mt-4 rounded-2xl border border-white/[0.08] bg-black/20 p-3 max-h-[22rem] overflow-auto">
                            <div className="space-y-2">
                              {operations.audit.timeline.map((event) => (
                                <div
                                  key={event.id}
                                  className="rounded-xl border border-white/[0.08] p-3 text-xs"
                                >
                                  <div className="flex items-center justify-between gap-3">
                                    <p className="font-black text-card-foreground">
                                      {event.action_type}
                                    </p>
                                    <span className="text-card-foreground/55">
                                      {new Date(
                                        event.created_at
                                      ).toLocaleString()}
                                    </span>
                                  </div>
                                  <p className="text-card-foreground/65 mt-1">
                                    {event.actor_role ?? "unknown"} · Y
                                    {event.year_number ?? "-"} T
                                    {event.term_number ?? "-"} W
                                    {event.week_number ?? "-"}
                                  </p>
                                  {event.reason && (
                                    <p className="text-card-foreground/75 mt-2 leading-relaxed">
                                      {event.reason}
                                    </p>
                                  )}
                                </div>
                              ))}
                              {operations.audit.timeline.length === 0 && (
                                <p className="text-sm text-card-foreground/55">
                                  No audit activity for this lesson plan yet.
                                </p>
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
                      <p className="text-[11px] font-black uppercase tracking-[0.25em] text-amber-700/90 dark:text-amber-300/90">
                        Syllabus QA
                      </p>
                      <h3 className="text-xl sm:text-2xl font-black text-card-foreground mt-2">
                        Coverage, rhythm, and 5-step compliance
                      </h3>
                      <p className="text-sm text-card-foreground/65 mt-2 leading-relaxed">
                        This QA layer compares your generated lesson-plan route
                        against the linked syllabus and flags missing week
                        types, assessment drift, exam placement drift, and weak
                        5-step lesson structure.
                      </p>
                    </div>
                    <div className="grid grid-cols-2 gap-3 min-w-0 sm:min-w-[18rem]">
                      <div className="rounded-2xl border border-white/10 bg-black/20 p-3">
                        <p className="text-[10px] uppercase tracking-[0.2em] text-card-foreground/45 font-black">
                          QA Score
                        </p>
                        <p className="text-sm font-black text-card-foreground mt-1">
                          {qaReport?.overall_score ?? 0}/100
                        </p>
                      </div>
                      <div className="rounded-2xl border border-white/10 bg-black/20 p-3">
                        <p className="text-[10px] uppercase tracking-[0.2em] text-card-foreground/45 font-black">
                          Coverage
                        </p>
                        <p className="text-sm font-black text-card-foreground mt-1">
                          {qaReport?.coverage_pct ?? 0}%
                        </p>
                      </div>
                      <div className="rounded-2xl border border-white/10 bg-black/20 p-3">
                        <p className="text-[10px] uppercase tracking-[0.2em] text-card-foreground/45 font-black">
                          Terms Checked
                        </p>
                        <p className="text-sm font-black text-card-foreground mt-1">
                          {qaReport?.total_terms ?? 0}
                        </p>
                      </div>
                      <div className="rounded-2xl border border-white/10 bg-black/20 p-3">
                        <p className="text-[10px] uppercase tracking-[0.2em] text-card-foreground/45 font-black">
                          Readiness
                        </p>
                        <p className="text-sm font-black text-card-foreground mt-1">
                          {qaReport?.overall_readiness ?? "critical"}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="p-5 sm:p-6 space-y-4">
                  {qaLoading && (
                    <div className="flex items-center gap-2 text-sm text-card-foreground/55">
                      <ArrowPathIcon className="w-4 h-4 animate-spin" /> Running
                      syllabus QA...
                    </div>
                  )}
                  {qaError && !qaLoading && (
                    <div className="rounded-2xl border border-rose-400/25 bg-rose-500/[0.08] p-4 text-sm text-rose-800 dark:text-rose-200">
                      {qaError}
                    </div>
                  )}
                  {qaReport && !qaLoading && (
                    <>
                      {qaReport.issues.length > 0 && (
                        <div className="rounded-2xl border border-amber-500/25 bg-amber-500/[0.06] p-4 flex items-start gap-3">
                          <span className="text-xl">💡</span>
                          <div className="space-y-1">
                            <h4 className="text-xs font-bold text-amber-800 dark:text-amber-200">
                              Curriculum Drift / Gaps Detected
                            </h4>
                            <p className="text-xs text-amber-700/80 dark:text-amber-300/80 leading-relaxed">
                              There are differences between your class lesson
                              plan and the active curriculum/QA spine. To align
                              them, scroll down to the{" "}
                              <strong>Auto-Plan Builder</strong>, toggle{" "}
                              <strong>Overwrite existing</strong> ON, and click{" "}
                              <strong>Generate</strong>.
                            </p>
                          </div>
                        </div>
                      )}
                      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                        {qaReport.terms.map((term) => (
                          <div
                            key={term.key}
                            className="rounded-[24px] border border-white/[0.08] bg-white/[0.03] p-4"
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <p className="text-[11px] font-black uppercase tracking-[0.2em] text-card-foreground/45">
                                  Year {term.year_number} · Term{" "}
                                  {term.term_number}
                                </p>
                                <p className="text-lg font-black text-card-foreground mt-2">
                                  {term.score}/100
                                </p>
                              </div>
                              <span
                                className={`px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-[0.18em] ${
                                  term.readiness === "excellent"
                                    ? "bg-emerald-500/15 text-emerald-800 dark:text-emerald-200 border border-emerald-400/20"
                                    : term.readiness === "good"
                                    ? "bg-cyan-500/15 text-cyan-800 dark:text-cyan-200 border border-cyan-400/20"
                                    : term.readiness === "watch"
                                    ? "bg-amber-500/15 text-amber-800 dark:text-amber-200 border border-amber-400/20"
                                    : "bg-rose-500/15 text-rose-800 dark:text-rose-200 border border-rose-400/20"
                                }`}
                              >
                                {term.readiness}
                              </span>
                            </div>
                            <div className="grid grid-cols-2 gap-3 mt-4 text-xs">
                              <div className="rounded-2xl border border-white/[0.08] bg-black/20 p-3">
                                <p className="text-card-foreground/45 uppercase tracking-[0.18em] font-black">
                                  Coverage
                                </p>
                                <p className="text-card-foreground font-black mt-2">
                                  {term.coverage_pct}%
                                </p>
                              </div>
                              <div className="rounded-2xl border border-white/[0.08] bg-black/20 p-3">
                                <p className="text-card-foreground/45 uppercase tracking-[0.18em] font-black">
                                  Weeks
                                </p>
                                <p className="text-card-foreground font-black mt-2">
                                  {term.generated_weeks}/{term.syllabus_weeks}
                                </p>
                              </div>
                              <div className="rounded-2xl border border-white/[0.08] bg-black/20 p-3">
                                <p className="text-card-foreground/45 uppercase tracking-[0.18em] font-black">
                                  Assessment Drift
                                </p>
                                <p className="text-card-foreground font-black mt-2">
                                  {term.assessment_drift_count}
                                </p>
                              </div>
                              <div className="rounded-2xl border border-white/[0.08] bg-black/20 p-3">
                                <p className="text-card-foreground/45 uppercase tracking-[0.18em] font-black">
                                  5-Step Breaks
                                </p>
                                <p className="text-card-foreground font-black mt-2">
                                  {term.five_step_break_count}
                                </p>
                              </div>
                            </div>
                            {term.issues.length > 0 && (
                              <div className="mt-4 space-y-2">
                                {term.issues.slice(0, 5).map((issue) => (
                                  <div
                                    key={issue.key}
                                    className="rounded-xl border border-white/[0.08] bg-black/20 p-3"
                                  >
                                    <div className="flex items-center justify-between gap-3">
                                      <p className="text-xs font-black text-card-foreground">
                                        {issue.week
                                          ? `Week ${issue.week}`
                                          : "Term rule"}
                                      </p>
                                      <span
                                        className={`text-[10px] font-black uppercase tracking-[0.18em] ${
                                          issue.severity === "fail"
                                            ? "text-rose-800 dark:text-rose-200"
                                            : issue.severity === "warn"
                                            ? "text-amber-800 dark:text-amber-200"
                                            : "text-cyan-800 dark:text-cyan-200"
                                        }`}
                                      >
                                        {issue.severity}
                                      </span>
                                    </div>
                                    <p className="text-xs text-card-foreground/70 mt-2 leading-relaxed">
                                      {issue.message}
                                    </p>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                      {qaReport.issues.length > 0 && (
                        <div className="rounded-[24px] border border-white/[0.08] bg-white/[0.03] p-4">
                          <p className="text-[11px] font-black uppercase tracking-[0.22em] text-card-foreground/45">
                            Global QA Flags
                          </p>
                          <div className="mt-3 space-y-2">
                            {qaReport.issues.slice(0, 8).map((issue) => (
                              <div
                                key={issue.key}
                                className="rounded-xl border border-white/[0.08] bg-black/20 p-3"
                              >
                                <p className="text-xs text-card-foreground/75">
                                  {issue.message}
                                </p>
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
                      <p className="text-[11px] font-black uppercase tracking-[0.25em] text-cyan-700/90 dark:text-cyan-300/90">
                        Auto-Plan Builder
                      </p>
                      <h3 className="text-xl sm:text-2xl font-black text-card-foreground mt-2">
                        Design the route, preview the output, then generate with
                        confidence.
                      </h3>
                      <p className="text-sm text-card-foreground/65 mt-2 leading-relaxed">
                        This builder keeps curriculum, teaching paths, and daily
                        lesson generation aligned. Choose how much to build,
                        tune the route, preview the impact, then publish the
                        structure your content tools will use.
                      </p>
                    </div>
                    <div className="grid grid-cols-2 gap-3 min-w-0 sm:min-w-[18rem]">
                      <div className="rounded-2xl border border-white/10 bg-black/20 p-3">
                        <p className="text-[10px] uppercase tracking-[0.2em] text-card-foreground/45 font-black">
                          Current Scope
                        </p>
                        <p className="text-sm font-black text-card-foreground mt-1">
                          {builderScopeLabel}
                        </p>
                      </div>
                      <div className="rounded-2xl border border-white/10 bg-black/20 p-3">
                        <p className="text-[10px] uppercase tracking-[0.2em] text-card-foreground/45 font-black">
                          Weeks / Term
                        </p>
                        <p className="text-sm font-black text-card-foreground mt-1">
                          {builderWeeksCount}
                        </p>
                      </div>
                      <div className="rounded-2xl border border-white/10 bg-black/20 p-3">
                        <p className="text-[10px] uppercase tracking-[0.2em] text-card-foreground/45 font-black">
                          Teaching Guide
                        </p>
                        <p className="text-sm font-black text-card-foreground mt-1">
                          {guideData?.track ?? "Ready on open"}
                        </p>
                      </div>
                      <div className="rounded-2xl border border-white/10 bg-black/20 p-3">
                        <p className="text-[10px] uppercase tracking-[0.2em] text-card-foreground/45 font-black">
                          Mode
                        </p>
                        <p className="text-sm font-black text-card-foreground mt-1">
                          {progressionOverwrite
                            ? "Replace existing"
                            : "Preserve existing"}
                        </p>
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
                              <p className="text-[11px] font-black uppercase tracking-[0.22em] text-card-foreground/45">
                                Step 1
                              </p>
                              <h4 className="text-base font-black text-card-foreground mt-1">
                                Choose the build scope
                              </h4>
                            </div>
                            <Link
                              href="/dashboard/learner-progress?view=rules&tab=academic-rules"
                              className="inline-flex items-center gap-2 px-3 py-2 bg-white/5 hover:bg-white/10 border border-white/10 text-card-foreground text-xs font-black rounded-xl transition-all"
                            >
                              Academic Rules
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
                                      ? "border-cyan-400/70 bg-cyan-500/[0.12] shadow-[0_0_0_1px_rgba(34,211,238,0.15)]"
                                      : "border-white/[0.08] bg-black/20 hover:bg-white/[0.04]"
                                  }`}
                                >
                                  <p
                                    className={`text-[10px] font-black uppercase tracking-[0.22em] ${
                                      active
                                        ? "text-cyan-800 dark:text-cyan-200"
                                        : "text-card-foreground/45"
                                    }`}
                                  >
                                    {option.eyebrow}
                                  </p>
                                  <p className="text-sm font-black text-card-foreground mt-2">
                                    {option.title}
                                  </p>
                                  <p className="text-xs text-card-foreground/60 mt-2 leading-relaxed">
                                    {option.description}
                                  </p>
                                </button>
                              );
                            })}
                          </div>
                        </section>

                        <section className="rounded-[24px] border border-white/[0.08] bg-zinc-950/60 p-4 sm:p-5">
                          <p className="text-[11px] font-black uppercase tracking-[0.22em] text-card-foreground/45">
                            Step 2
                          </p>
                          <h4 className="text-base font-black text-card-foreground mt-1">
                            Configure the route
                          </h4>
                          <p className="text-xs text-card-foreground/60 mt-2 leading-relaxed">
                            {selectedScopeConfig.description} The builder
                            follows linked curriculum weeks first, then your
                            school progression policy.
                          </p>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-4">
                            {(progressionScope === "week" ||
                              progressionScope === "term") && (
                              <label className="block">
                                <span className="block text-[10px] font-black uppercase tracking-[0.2em] text-card-foreground/45 mb-2">
                                  Year
                                </span>
                                <input
                                  type="number"
                                  min={1}
                                  max={10}
                                  value={progressionYear}
                                  onChange={(e) =>
                                    setProgressionYear(
                                      Math.min(
                                        Math.max(
                                          Number(e.target.value || 1),
                                          1
                                        ),
                                        10
                                      )
                                    )
                                  }
                                  className="w-full px-3 py-2.5 bg-background border border-border rounded-2xl text-sm font-bold"
                                />
                              </label>
                            )}
                            {(progressionScope === "week" ||
                              progressionScope === "term") && (
                              <label className="block">
                                <span className="block text-[10px] font-black uppercase tracking-[0.2em] text-card-foreground/45 mb-2">
                                  Term
                                </span>
                                <input
                                  type="number"
                                  min={1}
                                  max={3}
                                  value={progressionTerm}
                                  onChange={(e) =>
                                    setProgressionTerm(
                                      Math.min(
                                        Math.max(
                                          Number(e.target.value || 1),
                                          1
                                        ),
                                        3
                                      )
                                    )
                                  }
                                  className="w-full px-3 py-2.5 bg-background border border-border rounded-2xl text-sm font-bold"
                                />
                              </label>
                            )}
                            {progressionScope === "week" && (
                              <label className="block">
                                <span className="block text-[10px] font-black uppercase tracking-[0.2em] text-card-foreground/45 mb-2">
                                  Week
                                </span>
                                <input
                                  type="number"
                                  min={1}
                                  max={200}
                                  value={progressionWeek}
                                  onChange={(e) =>
                                    setProgressionWeek(
                                      Math.min(
                                        Math.max(
                                          Number(e.target.value || 1),
                                          1
                                        ),
                                        200
                                      )
                                    )
                                  }
                                  className="w-full px-3 py-2.5 bg-background border border-border rounded-2xl text-sm font-bold"
                                />
                              </label>
                            )}
                            {progressionScope === "session" && (
                              <label className="block">
                                <span className="block text-[10px] font-black uppercase tracking-[0.2em] text-card-foreground/45 mb-2">
                                  Session / Year
                                </span>
                                <input
                                  type="number"
                                  min={1}
                                  max={10}
                                  value={progressionSession}
                                  onChange={(e) =>
                                    setProgressionSession(
                                      Math.min(
                                        Math.max(
                                          Number(e.target.value || 1),
                                          1
                                        ),
                                        10
                                      )
                                    )
                                  }
                                  className="w-full px-3 py-2.5 bg-background border border-border rounded-2xl text-sm font-bold"
                                />
                              </label>
                            )}
                            <div className="rounded-2xl border border-white/[0.08] bg-black/20 p-3 sm:col-span-2">
                              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-card-foreground/45">
                                Execution mode
                              </p>
                              <label className="mt-3 flex items-start gap-3 cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={progressionOverwrite}
                                  onChange={(e) =>
                                    setProgressionOverwrite(e.target.checked)
                                  }
                                  className="mt-1"
                                />
                                <span className="text-sm text-card-foreground/75 leading-relaxed">
                                  Replace existing generated terms for this
                                  scope instead of preserving the current route.
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
                              <p className="text-[11px] font-black uppercase tracking-[0.22em] text-card-foreground/45">
                                Step 3
                              </p>
                              <h4 className="text-base font-black text-card-foreground mt-1">
                                Preview and readiness
                              </h4>
                              <p className="text-xs text-card-foreground/60 mt-2">
                                Validate seeds, policy, curriculum fit, and
                                generation impact before this route is allowed
                                to write into the plan.
                              </p>
                            </div>
                            <button
                              type="button"
                              onClick={() => previewProgressionBuilder()}
                              disabled={generating !== null}
                              className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-emerald-700 hover:bg-emerald-800 disabled:opacity-50 text-white text-sm font-black rounded-2xl transition-all"
                            >
                              <SparklesIcon className="w-4 h-4" /> Run Preview
                            </button>
                          </div>

                          <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
                            {builderReadiness.map((item) => (
                              <div
                                key={item.key}
                                className={`rounded-2xl border p-3 ${
                                  item.status === "fail"
                                    ? "border-rose-400/25 bg-rose-500/[0.08]"
                                    : item.status === "warn"
                                    ? "border-amber-400/25 bg-amber-500/[0.08]"
                                    : "border-emerald-400/20 bg-emerald-500/[0.07]"
                                }`}
                              >
                                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-card-foreground/45">
                                  {item.label}
                                </p>
                                <p
                                  className={`text-sm font-black mt-2 ${
                                    item.status === "fail"
                                      ? "text-rose-800 dark:text-rose-200"
                                      : item.status === "warn"
                                      ? "text-amber-800 dark:text-amber-200"
                                      : "text-emerald-800 dark:text-emerald-200"
                                  }`}
                                >
                                  {item.status === "fail"
                                    ? "Needs attention"
                                    : item.status === "warn"
                                    ? "Watch closely"
                                    : "Ready"}
                                </p>
                                <p className="text-xs text-card-foreground/70 mt-2 leading-relaxed">
                                  {item.detail}
                                </p>
                              </div>
                            ))}
                          </div>

                          {progressionPreview ? (
                            <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                              <div className="rounded-2xl border border-white/[0.08] bg-black/20 p-3">
                                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-card-foreground/45">
                                  Terms
                                </p>
                                <p className="text-lg font-black text-card-foreground mt-2">
                                  {progressionPreview.projected_terms?.length ??
                                    0}
                                </p>
                              </div>
                              <div className="rounded-2xl border border-white/[0.08] bg-black/20 p-3">
                                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-card-foreground/45">
                                  Project Weeks
                                </p>
                                <p className="text-lg font-black text-card-foreground mt-2">
                                  {progressionPreview.projected_projects ?? 0}
                                </p>
                              </div>
                              <div className="rounded-2xl border border-white/[0.08] bg-black/20 p-3">
                                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-card-foreground/45">
                                  Assignments
                                </p>
                                <p className="text-lg font-black text-card-foreground mt-2">
                                  {progressionPreview.projected_assignments ??
                                    0}
                                </p>
                              </div>
                              <div className="rounded-2xl border border-white/[0.08] bg-black/20 p-3">
                                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-card-foreground/45">
                                  Repetition Risk
                                </p>
                                <p
                                  className={`text-lg font-black mt-2 ${
                                    progressionPreview.repetition_risk ===
                                    "high"
                                      ? "text-rose-700 dark:text-rose-300"
                                      : progressionPreview.repetition_risk ===
                                        "medium"
                                      ? "text-amber-700 dark:text-amber-300"
                                      : "text-emerald-700 dark:text-emerald-300"
                                  }`}
                                >
                                  {progressionPreview.repetition_risk ?? "low"}
                                </p>
                              </div>
                            </div>
                          ) : (
                            <div className="mt-4 rounded-2xl border border-dashed border-white/[0.12] bg-black/20 p-4 text-sm text-card-foreground/55">
                              No preview yet. Run preview to inspect the
                              generated scope before writing it into the plan.
                            </div>
                          )}

                          {progressionPreview?.preflight && (
                            <div
                              className={`mt-4 rounded-2xl border p-4 ${
                                progressionPreview.preflight.blocking
                                  ? "border-rose-400/25 bg-rose-500/[0.08]"
                                  : progressionPreview.preflight.status ===
                                    "warning"
                                  ? "border-amber-400/25 bg-amber-500/[0.08]"
                                  : "border-emerald-400/20 bg-emerald-500/[0.07]"
                              }`}
                            >
                              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                                <div>
                                  <p className="text-[11px] font-black uppercase tracking-[0.22em] text-card-foreground/45">
                                    Hard preflight
                                  </p>
                                  <p className="text-sm font-black text-card-foreground mt-1">
                                    {progressionPreview.preflight.blocking
                                      ? "Generation is blocked until these issues are fixed."
                                      : progressionPreview.preflight.status ===
                                        "warning"
                                      ? "Generation can continue, but the builder found setup gaps."
                                      : "All critical readiness checks passed."}
                                  </p>
                                </div>
                                <p className="text-xs text-card-foreground/65">
                                  Pass{" "}
                                  {progressionPreview.preflight.summary.pass} ·
                                  Warn{" "}
                                  {progressionPreview.preflight.summary.warn} ·
                                  Fail{" "}
                                  {progressionPreview.preflight.summary.fail}
                                </p>
                              </div>
                              <div className="mt-3 space-y-2">
                                {preflightChecks.map((check) => (
                                  <div
                                    key={check.key}
                                    className="rounded-xl border border-white/[0.08] bg-black/20 p-3"
                                  >
                                    <div className="flex items-center justify-between gap-3">
                                      <p className="text-xs font-black text-card-foreground">
                                        {check.label}
                                      </p>
                                      <span
                                        className={`text-[10px] font-black uppercase tracking-[0.18em] ${
                                          check.status === "fail"
                                            ? "text-rose-800 dark:text-rose-200"
                                            : check.status === "warn"
                                            ? "text-amber-800 dark:text-amber-200"
                                            : "text-emerald-800 dark:text-emerald-200"
                                        }`}
                                      >
                                        {check.status}
                                      </span>
                                    </div>
                                    <p className="text-xs text-card-foreground/70 mt-2 leading-relaxed">
                                      {check.detail}
                                    </p>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {progressionPreview?.policy_runtime && (
                            <div className="mt-4 rounded-2xl border border-white/[0.08] bg-black/20 p-4">
                              <p className="text-[11px] font-black uppercase tracking-[0.22em] text-card-foreground/45">
                                Policy runtime
                              </p>
                              <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-card-foreground/75">
                                <span className="rounded-full border border-white/[0.08] px-2.5 py-1">
                                  Strict path:{" "}
                                  {progressionPreview.policy_runtime
                                    .strict_route
                                    ? "on"
                                    : "off"}
                                </span>
                                <span className="rounded-full border border-white/[0.08] px-2.5 py-1">
                                  Project based:{" "}
                                  {progressionPreview.policy_runtime
                                    .project_based
                                    ? "on"
                                    : "off"}
                                </span>
                                <span className="rounded-full border border-white/[0.08] px-2.5 py-1">
                                  Standard only:{" "}
                                  {progressionPreview.policy_runtime
                                    .essential_routes_only
                                    ? "on"
                                    : "off"}
                                </span>
                                <span className="rounded-full border border-white/[0.08] px-2.5 py-1">
                                  Weeks/term:{" "}
                                  {progressionPreview.policy_runtime
                                    .standard_weeks_per_term ??
                                    builderWeeksCount}
                                </span>
                                {progressionPreview.policy_runtime
                                  .track_candidates?.length ? (
                                  <span className="rounded-full border border-white/[0.08] px-2.5 py-1">
                                    Track order:{" "}
                                    {progressionPreview.policy_runtime.track_candidates.join(
                                      " → "
                                    )}
                                  </span>
                                ) : null}
                              </div>
                            </div>
                          )}

                          {progressionPreview?.warnings &&
                            progressionPreview.warnings.length > 0 && (
                              <div className="mt-4 rounded-2xl border border-amber-400/20 bg-amber-500/[0.08] p-4">
                                <p className="text-[11px] font-black uppercase tracking-[0.22em] text-amber-800 dark:text-amber-200">
                                  Warnings
                                </p>
                                <div className="mt-2 space-y-1">
                                  {progressionPreview.warnings.map(
                                    (warning, index) => (
                                      <p
                                        key={`${warning}-${index}`}
                                        className="text-xs text-amber-800/85 dark:text-amber-100/85"
                                      >
                                        {warning}
                                      </p>
                                    )
                                  )}
                                </div>
                              </div>
                            )}
                        </section>

                        <section className="rounded-[24px] border border-white/[0.08] bg-zinc-950/60 p-4 sm:p-5">
                          <p className="text-[11px] font-black uppercase tracking-[0.22em] text-card-foreground/45">
                            Step 4
                          </p>
                          <h4 className="text-base font-black text-card-foreground mt-1">
                            Execute and control
                          </h4>
                          <div className="mt-4 space-y-3">
                            <button
                              type="button"
                              onClick={runProgressionBuilder}
                              disabled={
                                generating !== null || hasBlockingPreflight
                              }
                              className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 bg-cyan-700 hover:bg-cyan-800 disabled:opacity-50 text-white text-sm font-black rounded-2xl transition-all"
                            >
                              <SparklesIcon className="w-4 h-4" /> Generate{" "}
                              {selectedScopeConfig.title}
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setProgressionScope("full_program");
                                setProgressionPreview(null);
                              }}
                              disabled={generating !== null}
                              className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 bg-indigo-600/90 hover:bg-indigo-500 disabled:opacity-50 text-white text-sm font-black rounded-2xl transition-all"
                            >
                              <BookOpenIcon className="w-4 h-4" /> Switch To
                              3-Year Build
                            </button>
                          </div>

                          <div className="mt-4 rounded-2xl border border-white/[0.08] bg-black/20 p-4">
                            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-card-foreground/45">
                              Current execution
                            </p>
                            <p className="text-sm font-black text-card-foreground mt-2">
                              {builderScopeLabel}
                            </p>
                            <p className="text-xs text-card-foreground/60 mt-2 leading-relaxed">
                              {progressionOverwrite
                                ? "Existing generated terms in this scope will be replaced."
                                : "Existing generated terms will be preserved unless the target slot is empty."}
                            </p>
                            {hasBlockingPreflight && (
                              <p className="text-xs text-rose-700 dark:text-rose-300 mt-2">
                                Preview has blocking issues, so generation is
                                paused until those gaps are fixed.
                              </p>
                            )}
                          </div>

                          <div className="mt-4 rounded-2xl border border-white/[0.08] bg-black/20 p-4">
                            <p className="text-[11px] font-black uppercase tracking-[0.22em] text-card-foreground/45">
                              Connected operations
                            </p>
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
                            <p className="text-[11px] font-black uppercase tracking-[0.22em] text-card-foreground/45">
                              Schedule and release
                            </p>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-3">
                              <button
                                type="button"
                                onClick={activateTermSchedule}
                                disabled={scheduleSaving}
                                className="px-3 py-2.5 text-xs font-black rounded-2xl bg-emerald-700 hover:bg-emerald-800 text-white disabled:opacity-50"
                              >
                                {scheduleSaving
                                  ? "Activating..."
                                  : "Activate Scheduler"}
                              </button>
                              <button
                                type="button"
                                onClick={releaseProgressionWeek}
                                disabled={releaseSaving}
                                className="px-3 py-2.5 text-xs font-black rounded-2xl bg-fuchsia-600 hover:bg-fuchsia-700 text-white disabled:opacity-50"
                              >
                                {releaseSaving
                                  ? `Releasing W${progressionWeek}...`
                                  : `Release Week ${progressionWeek}`}
                              </button>
                            </div>
                            <p className="text-xs text-card-foreground/60 mt-3 leading-relaxed">
                              Scheduler uses the plan term start date and weekly
                              cadence. Week release publishes the selected
                              week&apos;s lessons and assignments.
                            </p>
                          </div>

                          <div className="mt-4 rounded-2xl border border-white/[0.08] bg-black/20 p-4">
                            <p className="text-[11px] font-black uppercase tracking-[0.22em] text-card-foreground/45">
                              Term lock workflow
                            </p>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
                              <input
                                type="number"
                                min={1}
                                max={10}
                                value={statusYear}
                                onChange={(e) =>
                                  setStatusYear(
                                    Math.min(
                                      Math.max(Number(e.target.value || 1), 1),
                                      10
                                    )
                                  )
                                }
                                className="px-3 py-2.5 bg-background border border-border rounded-2xl text-sm font-bold"
                                placeholder="Year"
                              />
                              <input
                                type="number"
                                min={1}
                                max={3}
                                value={statusTerm}
                                onChange={(e) =>
                                  setStatusTerm(
                                    Math.min(
                                      Math.max(Number(e.target.value || 1), 1),
                                      3
                                    )
                                  )
                                }
                                className="px-3 py-2.5 bg-background border border-border rounded-2xl text-sm font-bold"
                                placeholder="Term"
                              />
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mt-3">
                              <button
                                type="button"
                                onClick={() => updateTermStatus("draft")}
                                disabled={statusSaving}
                                className="px-3 py-2.5 text-xs font-black rounded-2xl bg-zinc-600 hover:bg-zinc-500 text-white disabled:opacity-50"
                              >
                                Set Draft
                              </button>
                              <button
                                type="button"
                                onClick={() => updateTermStatus("approved")}
                                disabled={statusSaving}
                                className="px-3 py-2.5 text-xs font-black rounded-2xl bg-primary hover:bg-primary text-white disabled:opacity-50"
                              >
                                Set Approved
                              </button>
                              <button
                                type="button"
                                onClick={() => updateTermStatus("locked")}
                                disabled={statusSaving}
                                className="px-3 py-2.5 text-xs font-black rounded-2xl bg-amber-700 hover:bg-amber-800 text-white disabled:opacity-50"
                              >
                                Set Locked
                              </button>
                            </div>
                          </div>
                        </section>
                      </div>

                      <section className="rounded-[24px] border border-white/[0.08] bg-white/[0.03] p-4 sm:p-5 space-y-4">
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                          <div>
                            <p className="text-[11px] font-black uppercase tracking-[0.22em] text-card-foreground/45">
                              Step 5
                            </p>
                            <h4 className="text-base font-black text-card-foreground mt-1">
                              Prepare several weeks at once
                            </h4>
                            <p className="text-xs text-card-foreground/60 mt-2">
                              Build lessons, homework, and projects from this
                              plan. Use week prep settings to choose how many
                              weeks and what to include.
                            </p>
                          </div>
                          <div className="flex flex-wrap gap-2 items-start">
                            <button
                              onClick={() => bulkGenerate("lessons")}
                              disabled={generating !== null}
                              className="flex items-center gap-2 px-4 py-2.5 bg-primary hover:bg-primary disabled:opacity-50 text-white text-sm font-black rounded-2xl transition-all"
                            >
                              <SparklesIcon className="w-4 h-4" /> Generate
                              Lessons
                            </button>
                            <button
                              onClick={() => bulkGenerate("assignments")}
                              disabled={generating !== null}
                              className="flex items-center gap-2 px-4 py-2.5 bg-primary hover:bg-primary disabled:opacity-50 text-white text-sm font-black rounded-2xl transition-all"
                            >
                              <SparklesIcon className="w-4 h-4" /> Generate
                              Assignments
                            </button>
                            <button
                              onClick={() => bulkGenerate("projects")}
                              disabled={generating !== null}
                              className="flex items-center gap-2 px-4 py-2.5 bg-emerald-700 hover:bg-emerald-800 disabled:opacity-50 text-white text-sm font-black rounded-2xl transition-all"
                            >
                              <SparklesIcon className="w-4 h-4" /> Generate
                              Projects
                            </button>
                            <button
                              onClick={() => bulkGenerate("cbt")}
                              disabled={generating !== null}
                              className="flex items-center gap-2 px-4 py-2.5 bg-primary hover:bg-primary disabled:opacity-50 text-white text-sm font-black rounded-2xl transition-all"
                            >
                              <SparklesIcon className="w-4 h-4" /> Generate CBTs
                            </button>
                            <button
                              onClick={() => bulkGenerate("flashcards")}
                              disabled={generating !== null}
                              className="flex items-center gap-2 px-4 py-2.5 bg-yellow-700 hover:bg-yellow-800 disabled:opacity-50 text-white text-sm font-black rounded-2xl transition-all"
                            >
                              <SparklesIcon className="w-4 h-4" /> Generate
                              Flashcards
                            </button>
                            <button
                              onClick={() => setLmsOpen((o) => !o)}
                              className={`flex items-center gap-2 px-4 py-2.5 text-sm font-black rounded-2xl transition-all border ${
                                lmsOpen
                                  ? "bg-white/10 border-white/20 text-card-foreground"
                                  : "bg-transparent border-white/[0.12] text-card-foreground/60 hover:text-card-foreground hover:border-white/20"
                              }`}
                            >
                              <BoltIcon className="w-4 h-4" /> Week prep settings
                            </button>
                          </div>
                        </div>

                        {lmsOpen && (
                          <div className="rounded-2xl border border-white/[0.10] bg-white/[0.04] p-5 space-y-5">
                            <div className="flex items-center justify-between flex-wrap gap-3">
                              <div>
                                <p className="text-sm font-black text-card-foreground">
                                  Prepare weeks automatically
                                </p>
                                <p className="text-xs text-card-foreground/55 mt-0.5">
                                  Overnight, we quietly draft this week&apos;s
                                  materials for you. You still choose when
                                  students see them.
                                </p>
                              </div>
                              <button
                                type="button"
                                onClick={() =>
                                  setLmsSettings((s) => ({
                                    ...s,
                                    enabled: !s.enabled,
                                  }))
                                }
                                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                                  lmsSettings.enabled
                                    ? "bg-primary"
                                    : "bg-white/10"
                                }`}
                                role="switch"
                                aria-checked={lmsSettings.enabled}
                              >
                                <span
                                  className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                                    lmsSettings.enabled
                                      ? "translate-x-6"
                                      : "translate-x-1"
                                  }`}
                                />
                              </button>
                            </div>

                            <div className="space-y-3">
                              <p className="text-[10px] font-black uppercase tracking-widest text-primary/70">
                                What to prepare
                              </p>
                              <div className="flex flex-wrap gap-2">
                                {WEEK_CONTENT_TYPES.map((t) => {
                                  const checked = lmsSettings.types.includes(t);
                                  return (
                                    <button
                                      key={t}
                                      type="button"
                                      onClick={() =>
                                        setLmsSettings((s) => ({
                                          ...s,
                                          types: checked
                                            ? s.types.filter((x) => x !== t)
                                            : [...s.types, t],
                                        }))
                                      }
                                      className={`px-3 py-1.5 text-xs font-black rounded-xl transition-all ${
                                        checked
                                          ? "bg-primary/20 text-violet-700 dark:text-violet-300 border border-primary/40"
                                          : "bg-white/5 text-card-foreground/50 border border-white/10 hover:bg-white/10"
                                      }`}
                                    >
                                      {checked ? "✓ " : ""}
                                      {WEEK_CONTENT_TYPE_LABELS[t]}
                                    </button>
                                  );
                                })}
                              </div>
                            </div>

                            <div className="space-y-3">
                              <p className="text-[10px] font-black uppercase tracking-widest text-primary/70">
                                When you prepare several weeks yourself
                              </p>
                              <p className="text-[10px] text-card-foreground/50">
                                The overnight run always covers the current week.
                                Use this when you press prepare for more than one
                                week at once.
                              </p>
                              <div className="flex flex-wrap gap-2">
                                {[
                                  { n: 0, label: "Whole term" },
                                  { n: 1, label: "Just one week" },
                                  { n: 3, label: "3 weeks" },
                                  { n: 5, label: "5 weeks" },
                                  { n: 10, label: "Up to 10" },
                                ].map(({ n, label }) => (
                                  <button
                                    key={n}
                                    type="button"
                                    onClick={() =>
                                      setLmsSettings((s) => ({
                                        ...s,
                                        maxWeeksPerBatch: n,
                                      }))
                                    }
                                    className={`px-3 py-1.5 text-xs font-black rounded-xl transition-all ${
                                      lmsSettings.maxWeeksPerBatch === n
                                        ? "bg-primary text-white"
                                        : "bg-white/5 text-card-foreground/60 border border-white/10 hover:bg-white/10"
                                    }`}
                                  >
                                    {label}
                                  </button>
                                ))}
                              </div>
                            </div>

                            {/* The one setting that decides whether a learner
                                ever sees unreviewed AI writing. */}
                            <div className="space-y-3">
                              <p className="text-[10px] font-black uppercase tracking-widest text-primary/70">
                                When a week is ready
                              </p>
                              <div className="flex flex-wrap gap-2">
                                {[
                                  {
                                    value: false,
                                    label: "Hold for my approval",
                                    hint: "You review first, then release",
                                  },
                                  {
                                    value: true,
                                    label: "Trusted auto-release",
                                    hint:
                                      profile?.role === "admin" ||
                                      lmsSettings.auto_publish
                                        ? "Goes live with no weekly release step"
                                        : "An administrator must approve this once",
                                  },
                                ].map(({ value, label, hint }) => (
                                  <button
                                    key={String(value)}
                                    type="button"
                                    disabled={
                                      value &&
                                      profile?.role !== "admin" &&
                                      !lmsSettings.auto_publish
                                    }
                                    onClick={() =>
                                      setLmsSettings((s) => ({
                                        ...s,
                                        auto_publish: value,
                                      }))
                                    }
                                    className={`px-3 py-2 text-xs font-black rounded-xl transition-all text-left ${
                                      lmsSettings.auto_publish === value
                                        ? value
                                          ? "bg-amber-500/20 text-amber-700 dark:text-amber-300 border border-amber-500/40"
                                          : "bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border border-emerald-500/40"
                                        : "bg-white/5 text-card-foreground/50 border border-white/10 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
                                    }`}
                                  >
                                    <span className="block">
                                      {lmsSettings.auto_publish === value
                                        ? "✓ "
                                        : ""}
                                      {label}
                                    </span>
                                    <span className="block text-[9px] font-bold opacity-70">
                                      {hint}
                                    </span>
                                  </button>
                                ))}
                              </div>
                            </div>

                            <div className="flex items-center gap-3 pt-2">
                              <button
                                type="button"
                                onClick={saveLmsSettings}
                                disabled={savingLms}
                                className="px-6 py-2 text-sm font-black rounded-2xl bg-primary hover:bg-primary text-white disabled:opacity-50 transition-all shadow-lg shadow-primary/20"
                              >
                                {savingLms
                                  ? "Saving…"
                                  : "Save week prep settings"}
                              </button>
                              <p className="text-[10px] text-card-foreground/40 leading-tight">
                                {describeAutoGenerateSettings(lmsSettings)}
                              </p>
                            </div>
                          </div>
                        )}
                      </section>
                    </>
                  ) : (
                    <div className="p-4 rounded-2xl border border-white/[0.08] bg-white/[0.03] text-sm text-card-foreground/60">
                      Only teachers and admins can open the progression builder
                      for this plan.
                    </div>
                  )}

                  {genProgress && (
                    <div className="space-y-1">
                      <div className="flex items-center justify-between text-xs text-card-foreground/70">
                        <span>{genProgress.status}</span>
                        <span>
                          {genProgress.generated} / {genProgress.total}
                        </span>
                      </div>
                      <div className="w-full bg-white/5 rounded-full h-2 overflow-hidden">
                        <div
                          className="bg-primary h-full transition-all duration-300"
                          style={{
                            width: `${
                              (genProgress.generated / genProgress.total) * 100
                            }%`,
                          }}
                        />
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </>
          )}

          <div className="bg-card border border-white/[0.08] rounded-2xl p-4">
            <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
              <h3 className="text-sm font-black text-card-foreground">
                Content Overview
              </h3>
              <div className="flex items-center gap-3 flex-wrap">
                {linkedLessons.length > 0 && (
                  <Link
                    href={`/dashboard/lessons?lesson_plan_id=${id}`}
                    className="text-xs text-primary hover:text-violet-700 dark:hover:text-violet-300 font-bold transition-colors"
                  >
                    {linkedLessons.length} lesson
                    {linkedLessons.length !== 1 ? "s" : ""} →
                  </Link>
                )}
                {linkedAssignments.length > 0 && (
                  <Link
                    href={`/dashboard/assignments?lesson_plan_id=${id}`}
                    className="text-xs text-primary hover:text-blue-700 dark:hover:text-blue-300 font-bold transition-colors"
                  >
                    {linkedAssignments.length} assignment
                    {linkedAssignments.length !== 1 ? "s" : ""} →
                  </Link>
                )}
                {linkedProjects.length > 0 && (
                  <Link
                    href={`/dashboard/assignments?lesson_plan_id=${id}&type=project`}
                    className="text-xs text-emerald-600 dark:text-emerald-400 hover:text-emerald-700 dark:hover:text-emerald-300 font-bold transition-colors"
                  >
                    {linkedProjects.length} project
                    {linkedProjects.length !== 1 ? "s" : ""} →
                  </Link>
                )}
              </div>
            </div>
            {weeks.length === 0 ? (
              <p className="text-card-foreground/40 text-sm">
                No weeks defined yet.
              </p>
            ) : (
              <div className="space-y-2">
                {weeks.map((w) => {
                  const weekLesson = linkedLessons.find((l) =>
                    metadataMatchesWeek(l.metadata, w)
                  );
                  const weekAssignment = linkedAssignments.find((a) =>
                    metadataMatchesWeek(a.metadata, w)
                  );
                  const weekProject = linkedProjects.find((p) =>
                    metadataMatchesWeek(p.metadata, w)
                  );
                  const addLessonHref = buildPlanWeekCreateLessonUrl({
                    plan,
                    week: w,
                    courseTitle,
                  });
                  const addAssignmentHref = `/dashboard/assignments/new?lesson_plan_id=${id}&week=${
                    w.week
                  }${plan.course_id ? `&course_id=${plan.course_id}` : ""}`;
                  const addProjectHref = `/dashboard/projects/new?lesson_plan_id=${id}&week=${
                    w.week
                  }${plan.course_id ? `&course_id=${plan.course_id}` : ""}`;
                  return (
                    <div
                      key={w.week}
                      className="flex flex-col gap-2 p-3 bg-white/5 rounded-xl"
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-black text-primary">
                          Week {w.week}
                        </span>
                        {w.completed && (
                          <span className="text-[10px] font-black text-emerald-700 dark:text-emerald-300">
                            ✓ Completed
                          </span>
                        )}
                        <span className="text-sm text-card-foreground truncate">
                          {w.topic}
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {weekLesson ? (
                          <Link
                            href={`/dashboard/lessons/${weekLesson.id}`}
                            className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-bold text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 rounded hover:bg-emerald-500/10 transition-colors"
                          >
                            ✓ Lesson
                          </Link>
                        ) : (
                          <Link
                            href={addLessonHref}
                            className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-bold text-card-foreground/50 border border-white/10 rounded hover:border-emerald-500/30 hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors"
                          >
                            + Lesson
                          </Link>
                        )}
                        {weekAssignment ? (
                          <Link
                            href={`/dashboard/assignments/${weekAssignment.id}`}
                            className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-bold text-primary border border-primary/30 rounded hover:bg-primary/10 transition-colors"
                          >
                            ✓ Assignment
                          </Link>
                        ) : (
                          <Link
                            href={addAssignmentHref}
                            className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-bold text-card-foreground/50 border border-white/10 rounded hover:border-primary/30 hover:text-primary transition-colors"
                          >
                            + Assignment
                          </Link>
                        )}
                        {weekProject ? (
                          <Link
                            href={`/dashboard/assignments/${weekProject.id}`}
                            className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-bold text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 rounded hover:bg-emerald-500/10 transition-colors"
                          >
                            ✓ Project
                          </Link>
                        ) : (
                          <Link
                            href={addProjectHref}
                            className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-bold text-card-foreground/50 border border-white/10 rounded hover:border-emerald-500/30 hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors"
                          >
                            + Project
                          </Link>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Generate confirmation modal — replaces window.confirm for dry-run preview */}
      {genConfirm && (
        <div className="app-fixed-overlay fixed inset-0 z-[120] flex items-end justify-center bg-black/75 p-0 sm:items-center sm:p-4">
          <div role="dialog" aria-modal="true" className="bg-card border border-white/[0.12] w-full sm:max-w-sm rounded-t-2xl sm:rounded-2xl shadow-2xl overflow-hidden">
            <div className="p-6 space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-primary/15 flex items-center justify-center shrink-0">
                  <SparklesIcon className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <p className="text-[10px] font-black uppercase tracking-widest text-primary">
                    AI Generation
                  </p>
                  <h3 className="text-base font-black text-card-foreground capitalize">
                    Generate {genConfirm.type}
                  </h3>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div className="bg-white/5 border border-white/[0.08] rounded-xl p-3 text-center">
                  <p className="text-xl font-black text-card-foreground">
                    {genConfirm.preview.total_weeks}
                  </p>
                  <p className="text-[9px] font-black uppercase tracking-widest text-card-foreground/40 mt-0.5">
                    Weeks
                  </p>
                </div>
                <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-3 text-center">
                  <p className="text-xl font-black text-emerald-700 dark:text-emerald-300">
                    {genConfirm.preview.projected_generations}
                  </p>
                  <p className="text-[9px] font-black uppercase tracking-widest text-emerald-600/60 dark:text-emerald-400/60 mt-0.5">
                    Will Generate
                  </p>
                </div>
                <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-3 text-center">
                  <p className="text-xl font-black text-amber-700 dark:text-amber-300">
                    {genConfirm.preview.projected_skips}
                  </p>
                  <p className="text-[9px] font-black uppercase tracking-widest text-amber-600/60 dark:text-amber-400/60 mt-0.5">
                    Already Exist
                  </p>
                </div>
              </div>

              {genConfirm.preview.projected_generations === 0 ? (
                <p className="text-xs text-amber-600 dark:text-amber-400 font-medium bg-amber-500/10 border border-amber-500/20 rounded-xl px-4 py-3">
                  All weeks already have {genConfirm.type} — nothing to
                  generate.
                </p>
              ) : (
                <p className="text-xs text-card-foreground/50 leading-relaxed">
                  This will use AI to create{" "}
                  {genConfirm.preview.projected_generations} new{" "}
                  {genConfirm.type}. Already-existing weeks are skipped
                  automatically.
                </p>
              )}
            </div>

            <div className="flex gap-3 px-6 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
              <button
                onClick={() => setGenConfirm(null)}
                className="flex-1 py-3 bg-white/5 hover:bg-white/10 text-card-foreground/60 font-bold rounded-xl min-h-[44px] transition-all"
              >
                Cancel
              </button>
              <button
                onClick={confirmAndGenerate}
                disabled={genConfirm.preview.projected_generations === 0}
                className="flex-1 py-3 bg-primary hover:bg-primary disabled:opacity-40 text-white font-black rounded-xl min-h-[44px] transition-all"
              >
                Generate {genConfirm.preview.projected_generations}{" "}
                {genConfirm.type}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Progression Run Confirmation Modal */}
      {progressionRunConfirm && (
        <div className="app-fixed-overlay fixed inset-0 z-[120] flex items-end justify-center bg-black/75 p-0 sm:items-center sm:p-4">
          <div role="dialog" aria-modal="true" className="bg-card border border-white/[0.12] w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl shadow-2xl overflow-hidden">
            <div className="p-6 space-y-5">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-cyan-500/15 flex items-center justify-center shrink-0">
                  <SparklesIcon className="w-5 h-5 text-cyan-600 dark:text-cyan-400" />
                </div>
                <div>
                  <p className="text-[10px] font-black uppercase tracking-widest text-cyan-600 dark:text-cyan-400">
                    Auto-Plan Builder
                  </p>
                  <h3 className="text-base font-black text-card-foreground">
                    Generate {progressionRunConfirm.scopeLabel}
                  </h3>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="bg-white/5 border border-white/[0.08] rounded-xl p-3 text-center">
                  <p className="text-xl font-black text-card-foreground">
                    {progressionRunConfirm.preview.projected_terms?.length ?? 0}
                  </p>
                  <p className="text-[9px] font-black uppercase tracking-widest text-card-foreground/40 mt-0.5">
                    Terms
                  </p>
                </div>
                <div className="bg-white/5 border border-white/[0.08] rounded-xl p-3 text-center">
                  <p className="text-xl font-black text-card-foreground">
                    {progressionRunConfirm.preview.projected_projects ?? 0}
                  </p>
                  <p className="text-[9px] font-black uppercase tracking-widest text-card-foreground/40 mt-0.5">
                    Project Weeks
                  </p>
                </div>
                <div className="bg-white/5 border border-white/[0.08] rounded-xl p-3 text-center">
                  <p className="text-xl font-black text-card-foreground">
                    {progressionRunConfirm.preview.projected_assignments ?? 0}
                  </p>
                  <p className="text-[9px] font-black uppercase tracking-widest text-card-foreground/40 mt-0.5">
                    Assignments
                  </p>
                </div>
                <div
                  className={`border rounded-xl p-3 text-center ${
                    progressionRunConfirm.preview.repetition_risk === "high"
                      ? "bg-rose-500/10 border-rose-500/20"
                      : progressionRunConfirm.preview.repetition_risk ===
                        "medium"
                      ? "bg-amber-500/10 border-amber-500/20"
                      : "bg-emerald-500/10 border-emerald-500/20"
                  }`}
                >
                  <p
                    className={`text-xl font-black capitalize ${
                      progressionRunConfirm.preview.repetition_risk === "high"
                        ? "text-rose-700 dark:text-rose-300"
                        : progressionRunConfirm.preview.repetition_risk ===
                          "medium"
                        ? "text-amber-700 dark:text-amber-300"
                        : "text-emerald-700 dark:text-emerald-300"
                    }`}
                  >
                    {progressionRunConfirm.preview.repetition_risk ?? "low"}
                  </p>
                  <p className="text-[9px] font-black uppercase tracking-widest text-card-foreground/40 mt-0.5">
                    Repetition Risk
                  </p>
                </div>
              </div>

              {progressionRunConfirm.preview.warnings &&
                progressionRunConfirm.preview.warnings.length > 0 && (
                  <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl px-4 py-3 text-xs text-amber-700 dark:text-amber-300 space-y-1">
                    {progressionRunConfirm.preview.warnings.map((w, i) => (
                      <p key={i}>{w}</p>
                    ))}
                  </div>
                )}

              <p className="text-xs text-card-foreground/50 leading-relaxed">
                This will write the progression route into the plan. Existing
                terms are {progressionOverwrite ? "replaced" : "preserved"}.
              </p>
            </div>
            <div className="flex gap-3 px-6 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
              <button
                onClick={() => setProgressionRunConfirm(null)}
                className="flex-1 py-3 bg-white/5 hover:bg-white/10 text-card-foreground/60 font-bold rounded-xl min-h-[44px] transition-all"
              >
                Cancel
              </button>
              <button
                onClick={executeProgressionGeneration}
                className="flex-1 py-3 bg-cyan-700 hover:bg-cyan-800 text-white font-black rounded-xl min-h-[44px] transition-all"
              >
                Confirm & Generate
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Clone / Deploy Plan Modal ─────────────────────────────────────── */}
      {cloneModalOpen && (
        <div className="app-fixed-overlay fixed inset-0 z-[120] flex items-end justify-center bg-black/70 p-0 sm:items-center sm:p-4">
          <div role="dialog" aria-modal="true" className="bg-card border border-white/10 w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl shadow-2xl overflow-hidden">
            <div className="px-5 py-4 border-b border-white/10 flex items-center justify-between">
              <div>
                <h2 className="text-base font-black text-card-foreground">
                  Deploy to Another Class
                </h2>
                <p className="text-xs text-card-foreground/50 mt-0.5">
                  Copies plan content and week schedule to a new class. Opens as
                  a draft.
                </p>
              </div>
              <button
                onClick={() => setCloneModalOpen(false)}
                className="p-2 hover:bg-white/10 rounded-xl transition-all min-h-[44px] min-w-[44px] flex items-center justify-center"
              >
                <XMarkIcon className="w-5 h-5 text-card-foreground/40" />
              </button>
            </div>
            <div className="p-5 max-h-[60vh] overflow-y-auto space-y-4">
              {/* Group classes by school */}
              {(() => {
                const otherClasses = myClasses.filter(
                  (c) => c.id !== plan.class_id
                );
                const bySchool: Record<
                  string,
                  { schoolName: string; classes: typeof otherClasses }
                > = {};
                otherClasses.forEach((c) => {
                  const sid = c.school_id ?? "unknown";
                  if (!bySchool[sid])
                    bySchool[sid] = {
                      schoolName: c.schools?.name ?? "Unknown School",
                      classes: [],
                    };
                  bySchool[sid].classes.push(c);
                });
                const groups = Object.entries(bySchool);
                if (groups.length === 0)
                  return (
                    <p className="text-sm text-card-foreground/50 text-center py-4">
                      No other classes found. You need to be assigned as teacher
                      to other classes first.
                    </p>
                  );
                return groups.map(([sid, { schoolName, classes }]) => (
                  <div key={sid} className="space-y-2">
                    <p className="text-[10px] font-black uppercase tracking-widest text-card-foreground/40">
                      {schoolName}
                    </p>
                    {classes.map((cls) => (
                      <button
                        key={cls.id}
                        onClick={() =>
                          cloneToClass({ id: cls.id, school_id: cls.school_id })
                        }
                        disabled={cloning}
                        className="w-full flex items-center justify-between gap-3 px-4 py-3 bg-white/[0.03] hover:bg-white/[0.07] border border-white/10 hover:border-primary/40 rounded-xl text-left transition-all disabled:opacity-50 group"
                      >
                        <div>
                          <p className="text-sm font-bold text-card-foreground group-hover:text-primary transition-colors">
                            {cls.name}
                          </p>
                          <p className="text-[10px] text-card-foreground/40 mt-0.5">
                            {schoolName}
                          </p>
                        </div>
                        <ArrowUpTrayIcon className="w-4 h-4 text-card-foreground/30 group-hover:text-primary shrink-0 transition-colors" />
                      </button>
                    ))}
                  </div>
                ));
              })()}
            </div>
            {cloning && (
              <div className="px-5 py-3 border-t border-white/10 flex items-center gap-2 text-xs text-card-foreground/50">
                <ArrowPathIcon className="w-3.5 h-3.5 animate-spin" /> Deploying
                plan…
              </div>
            )}
          </div>
        </div>
      )}

      {/* Week View Panel */}
      {viewWeek && (
        <div className="app-fixed-overlay fixed inset-0 z-[120] flex flex-col justify-end md:flex-row md:justify-end">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setViewWeek(null)}
          />
          <div
            className={`relative w-full md:h-full flex flex-col max-h-[92vh] md:max-h-none bg-card md:border-l border-t md:border-t-0 border-white/10 shadow-2xl rounded-t-2xl md:rounded-none overflow-hidden transition-all duration-300 ${
              activePreviewTab === "plan" ? "md:max-w-md" : "md:max-w-2xl"
            }`}
          >
            {/* Mobile drag handle */}
            <div className="md:hidden flex justify-center pt-2.5 pb-1 shrink-0">
              <div className="w-10 h-1 rounded-full bg-white/20" />
            </div>

            <div className="px-5 py-4 border-b border-white/10 flex items-center justify-between shrink-0">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs font-black text-primary bg-primary/10 px-2 py-0.5 rounded-full">
                    Week {viewWeek.week}
                  </span>
                  {(viewWeek.gating_state ?? "unlocked") === "locked" && (
                    <span className="text-[10px] font-black text-amber-700 dark:text-amber-300 bg-amber-500/10 px-2 py-0.5 rounded-full border border-amber-500/30">
                      Locked
                    </span>
                  )}
                  {viewWeek.completed && (
                    <span className="text-[10px] font-black text-emerald-700 dark:text-emerald-300 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/30">
                      Completed
                    </span>
                  )}
                </div>
                <h2 className="text-base font-black text-card-foreground">
                  {viewWeek.topic || "Untitled Week"}
                </h2>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => {
                    setViewWeek(null);
                    startEdit(viewWeek);
                  }}
                  className="p-2 hover:bg-white/10 rounded-xl transition-all flex items-center justify-center"
                >
                  <PencilIcon className="w-5 h-5 text-card-foreground/40" />
                </button>
                <button
                  onClick={() => setViewWeek(null)}
                  className="p-2 hover:bg-white/10 rounded-xl transition-all flex items-center justify-center"
                >
                  <XMarkIcon className="w-5 h-5 text-card-foreground/40" />
                </button>
              </div>
            </div>

            {/* Horizontal Preview Tabs */}
            <div className="flex border-b border-white/5 bg-black/10 px-2 shrink-0">
              <button
                onClick={() => setActivePreviewTab("plan")}
                className={`flex-1 py-2 text-center text-xs font-black transition-all border-b-2 ${
                  activePreviewTab === "plan"
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                Plan Brief
              </button>
              {(previewLesson || fetchingPreview) && (
                <button
                  onClick={() => setActivePreviewTab("lesson")}
                  className={`flex-1 py-2 text-center text-xs font-black transition-all border-b-2 ${
                    activePreviewTab === "lesson"
                      ? "border-emerald-500 text-emerald-600 dark:text-emerald-400"
                      : "border-transparent text-muted-foreground hover:text-emerald-600/80 dark:hover:text-emerald-400/80"
                  }`}
                >
                  {fetchingPreview && !previewLesson ? (
                    <span className="flex items-center justify-center gap-1">
                      <div className="w-2.5 h-2.5 border border-emerald-400 border-t-transparent rounded-full animate-spin" />
                      Lesson
                    </span>
                  ) : (
                    "Lesson Notes"
                  )}
                </button>
              )}
              {(previewAssignment || fetchingPreview) && (
                <button
                  onClick={() => setActivePreviewTab("assignment")}
                  className={`flex-1 py-2 text-center text-xs font-black transition-all border-b-2 ${
                    activePreviewTab === "assignment"
                      ? "border-cyan-500 text-cyan-600 dark:text-cyan-400"
                      : "border-transparent text-muted-foreground hover:text-cyan-600/80 dark:hover:text-cyan-400/80"
                  }`}
                >
                  {fetchingPreview && !previewAssignment ? (
                    <span className="flex items-center justify-center gap-1">
                      <div className="w-2.5 h-2.5 border border-cyan-400 border-t-transparent rounded-full animate-spin" />
                      Assignment
                    </span>
                  ) : (
                    "Assignment"
                  )}
                </button>
              )}
              {(previewProject || fetchingPreview) && (
                <button
                  onClick={() => setActivePreviewTab("project")}
                  className={`flex-1 py-2 text-center text-xs font-black transition-all border-b-2 ${
                    activePreviewTab === "project"
                      ? "border-primary text-primary"
                      : "border-transparent text-muted-foreground hover:text-primary/80"
                  }`}
                >
                  {fetchingPreview && !previewProject ? (
                    <span className="flex items-center justify-center gap-1">
                      <div className="w-2.5 h-2.5 border border-primary border-t-transparent rounded-full animate-spin" />
                      Project
                    </span>
                  ) : (
                    "Project"
                  )}
                </button>
              )}
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-6">
              {activePreviewTab === "plan" && (
                <>
                  {/* Content Generation Actions */}
                  <div className="space-y-3">
                    <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">
                      Add content for this week
                    </p>
                    <div className="grid grid-cols-2 gap-2">
                      <Link
                        href={buildPlanWeekCreateLessonUrl({
                          plan: plan!,
                          week: viewWeek,
                          courseTitle: plan?.courses?.title || "",
                        })}
                        className="flex flex-col items-start gap-0.5 px-3 py-2.5 text-left border border-emerald-500/30 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/10 transition-colors min-h-[52px] rounded-xl"
                      >
                        <span className="flex items-center gap-1.5 text-xs font-bold">
                          <BookOpenIcon className="w-3.5 h-3.5" />
                          Lesson
                        </span>
                        <span className="text-[10px] text-muted-foreground leading-snug">
                          Write & deliver teaching content
                        </span>
                      </Link>
                      <button
                        onClick={() => createAssignmentFromWeek(viewWeek)}
                        disabled={creatingAssignment}
                        className="flex flex-col items-start gap-0.5 px-3 py-2.5 text-left border border-cyan-500/30 text-cyan-600 dark:text-cyan-400 hover:bg-cyan-500/10 transition-colors disabled:opacity-40 min-h-[52px] rounded-xl"
                      >
                        <span className="flex items-center gap-1.5 text-xs font-bold">
                          <ClipboardDocumentListIcon className="w-3.5 h-3.5" />
                          {creatingAssignment ? "Creating…" : "Assignment"}
                        </span>
                        <span className="text-[10px] text-muted-foreground leading-snug">
                          Set task for submission
                        </span>
                      </button>
                      <button
                        onClick={() => createProjectFromWeek(viewWeek)}
                        disabled={creatingProject}
                        className="flex flex-col items-start gap-0.5 px-3 py-2.5 text-left border border-primary/30 text-primary hover:bg-primary/10 transition-colors disabled:opacity-40 min-h-[52px] rounded-xl"
                      >
                        <span className="flex items-center gap-1.5 text-xs font-bold">
                          <RocketLaunchIcon className="w-3.5 h-3.5" />
                          {creatingProject ? "Creating…" : "Project"}
                        </span>
                        <span className="text-[10px] text-muted-foreground leading-snug">
                          Longer-form hands-on project
                        </span>
                      </button>
                      <Link
                        href={buildPlanWeekCreateCbtUrl({
                          plan: plan!,
                          week: viewWeek,
                          courseTitle: plan?.courses?.title || "",
                        })}
                        className="flex flex-col items-start gap-0.5 px-3 py-2.5 text-left border border-rose-500/30 text-rose-600 dark:text-rose-400 hover:bg-rose-500/10 transition-colors min-h-[52px] rounded-xl"
                      >
                        <span className="flex items-center gap-1.5 text-xs font-bold">
                          <BoltIcon className="w-3.5 h-3.5" />
                          CBT Quiz
                        </span>
                        <span className="text-[10px] text-muted-foreground leading-snug">
                          Auto-marked multiple choice test
                        </span>
                      </Link>
                      <Link
                        href={buildPlanWeekFlashcardUrl({
                          plan: plan!,
                          week: viewWeek,
                        })}
                        className="flex flex-col items-start gap-0.5 px-3 py-2.5 text-left border border-yellow-500/30 text-yellow-600 dark:text-yellow-400 hover:bg-yellow-500/10 transition-colors min-h-[52px] rounded-xl"
                      >
                        <span className="flex items-center gap-1.5 text-xs font-bold">
                          <StarIcon className="w-3.5 h-3.5" />
                          Flashcards
                        </span>
                        <span className="text-[10px] text-muted-foreground leading-snug">
                          Quick revision cards
                        </span>
                      </Link>
                      <button
                        onClick={printWeek}
                        className="flex flex-col items-start gap-0.5 px-3 py-2.5 text-left border border-border text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors min-h-[52px] rounded-xl"
                      >
                        <span className="flex items-center gap-1.5 text-xs font-bold">
                          <PrinterIcon className="w-3.5 h-3.5" />
                          Print Plan
                        </span>
                        <span className="text-[10px] text-muted-foreground leading-snug">
                          Print plan as PDF
                        </span>
                      </button>
                    </div>
                  </div>

                  {/* Seed Data Previews */}
                  <div className="space-y-3">
                    {(viewWeek.project?.title ||
                      viewWeek.project?.description) && (
                      <div className="bg-emerald-500/[0.03] border border-emerald-500/10 rounded-xl p-3 space-y-2">
                        <p className="text-[10px] font-black text-emerald-600 dark:text-emerald-400 uppercase tracking-widest">
                          Project Seed
                        </p>
                        <p className="text-sm font-bold text-emerald-800 dark:text-emerald-100">
                          {viewWeek.project.title || "Untitled Project"}
                        </p>
                        {viewWeek.project.description && (
                          <p className="text-xs text-emerald-700/60 dark:text-emerald-300/60 leading-relaxed">
                            {viewWeek.project.description}
                          </p>
                        )}
                      </div>
                    )}
                    {(viewWeek.assignment?.title ||
                      viewWeek.assignment?.brief) && (
                      <div className="bg-primary/[0.03] border border-primary/10 rounded-xl p-3 space-y-2">
                        <p className="text-[10px] font-black text-primary uppercase tracking-widest">
                          Assignment Brief
                        </p>
                        <p className="text-sm font-bold text-blue-800 dark:text-blue-100">
                          {viewWeek.assignment.title || "Untitled Task"}
                        </p>
                        {viewWeek.assignment.brief && (
                          <p className="text-xs text-blue-700/60 dark:text-blue-300/60 leading-relaxed">
                            {viewWeek.assignment.brief}
                          </p>
                        )}
                      </div>
                    )}
                    {viewWeek.objectives && (
                      <div className="bg-white/[0.02] border border-white/5 rounded-xl p-3 space-y-2">
                        <p className="text-[10px] font-black text-card-foreground/40 uppercase tracking-widest">
                          Objectives
                        </p>
                        <p className="text-xs text-card-foreground/70 leading-relaxed">
                          {viewWeek.objectives}
                        </p>
                      </div>
                    )}
                    {viewWeek.activities && (
                      <div className="bg-white/[0.02] border border-white/5 rounded-xl p-3 space-y-2">
                        <p className="text-[10px] font-black text-card-foreground/40 uppercase tracking-widest">
                          Activities
                        </p>
                        <p className="text-xs text-card-foreground/70 leading-relaxed">
                          {viewWeek.activities}
                        </p>
                      </div>
                    )}
                  </div>
                </>
              )}

              {activePreviewTab === "lesson" && (
                <div className="space-y-5 animate-[fadeIn_0.3s_ease]">
                  {fetchingPreview && !previewLesson ? (
                    <div className="space-y-4">
                      <div className="h-6 w-3/4 bg-white/5 rounded animate-pulse" />
                      <div className="h-4 w-1/2 bg-white/5 rounded animate-pulse" />
                      <div className="space-y-2 pt-4">
                        <div className="h-4 w-full bg-white/5 rounded animate-pulse" />
                        <div className="h-4 w-full bg-white/5 rounded animate-pulse" />
                        <div className="h-4 w-5/6 bg-white/5 rounded animate-pulse" />
                      </div>
                    </div>
                  ) : previewLesson ? (
                    <>
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-emerald-500/[0.03] border border-emerald-500/10 rounded-xl p-3">
                        <div>
                          <p className="text-[10px] font-black text-emerald-600 dark:text-emerald-400 uppercase tracking-widest">
                            Lesson Status
                          </p>
                          <p className="text-xs text-card-foreground/80 font-bold mt-0.5">
                            {previewLesson.title || "Untitled Lesson"} ·{" "}
                            {previewLesson.duration_minutes || 60} mins
                          </p>
                        </div>
                        <Link
                          href={`/dashboard/lessons/${previewLesson.id}`}
                          className="flex items-center justify-center gap-1.5 py-1.5 px-3 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 rounded-lg transition-all text-[11px] font-black whitespace-nowrap"
                        >
                          <BookOpenIcon className="w-3.5 h-3.5" /> Workspace
                        </Link>
                      </div>

                      {previewLesson.description && (
                        <div className="bg-white/[0.02] border border-white/5 rounded-xl p-3.5">
                          <p className="text-[10px] font-black text-card-foreground/40 uppercase tracking-widest mb-1.5">
                            Overview
                          </p>
                          <p className="text-xs text-card-foreground/75 leading-relaxed">
                            {previewLesson.description}
                          </p>
                        </div>
                      )}

                      <div className="space-y-1">
                        <p className="text-[10px] font-black text-emerald-600 dark:text-emerald-400 uppercase tracking-widest">
                          Generated Lesson Notes
                        </p>
                        <div className="space-y-4 pt-2">
                          {previewLesson.lesson_notes ? (
                            renderInlineMarkdown(previewLesson.lesson_notes)
                          ) : (
                            <p className="text-xs text-muted-foreground italic">
                              No lesson notes generated for this lesson yet.
                            </p>
                          )}
                        </div>
                      </div>

                      {previewLesson.content &&
                        typeof previewLesson.content === "string" && (
                          <div className="space-y-2 mt-6">
                            <p className="text-[10px] font-black text-emerald-600 dark:text-emerald-400 uppercase tracking-widest">
                              Monaco Code Script
                            </p>
                            <div className="bg-black/40 border border-white/5 rounded-xl overflow-hidden font-mono text-[11px] p-4 text-cyan-700 dark:text-cyan-300 whitespace-pre overflow-x-auto">
                              <code>{previewLesson.content}</code>
                            </div>
                          </div>
                        )}
                    </>
                  ) : (
                    <div className="py-8 text-center">
                      <p className="text-xs text-muted-foreground">
                        Could not load lesson preview.
                      </p>
                    </div>
                  )}
                </div>
              )}

              {activePreviewTab === "assignment" && (
                <div className="space-y-5 animate-[fadeIn_0.3s_ease]">
                  {fetchingPreview && !previewAssignment ? (
                    <div className="space-y-4">
                      <div className="h-6 w-3/4 bg-white/5 rounded animate-pulse" />
                      <div className="h-4 w-1/2 bg-white/5 rounded animate-pulse" />
                      <div className="space-y-2 pt-4">
                        <div className="h-4 w-full bg-white/5 rounded animate-pulse" />
                        <div className="h-4 w-full bg-white/5 rounded animate-pulse" />
                      </div>
                    </div>
                  ) : previewAssignment ? (
                    <>
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-cyan-500/[0.03] border border-cyan-500/10 rounded-xl p-3">
                        <div>
                          <p className="text-[10px] font-black text-cyan-600 dark:text-cyan-400 uppercase tracking-widest">
                            Assignment Status
                          </p>
                          <p className="text-xs text-card-foreground/80 font-bold mt-0.5">
                            {previewAssignment.title || "Untitled Assignment"} ·{" "}
                            {previewAssignment.max_points ?? 100} pts
                          </p>
                        </div>
                        <Link
                          href={`/dashboard/assignments/${previewAssignment.id}`}
                          className="flex items-center justify-center gap-1.5 py-1.5 px-3 bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-600 dark:text-cyan-400 border border-cyan-500/20 rounded-lg transition-all text-[11px] font-black whitespace-nowrap"
                        >
                          <ClipboardDocumentListIcon className="w-3.5 h-3.5" />{" "}
                          Workspace
                        </Link>
                      </div>

                      {previewAssignment.instructions && (
                        <div className="bg-white/[0.02] border border-white/5 rounded-xl p-3.5 space-y-1.5">
                          <p className="text-[10px] font-black text-cyan-600 dark:text-cyan-400 uppercase tracking-widest font-mono">
                            Instructions
                          </p>
                          <div className="text-xs text-card-foreground/75 leading-relaxed whitespace-pre-wrap">
                            {previewAssignment.instructions}
                          </div>
                        </div>
                      )}

                      {previewAssignment.questions &&
                        Array.isArray(previewAssignment.questions) && (
                          <div className="space-y-4">
                            <p className="text-[10px] font-black text-cyan-600 dark:text-cyan-400 uppercase tracking-widest font-mono">
                              Questions ({previewAssignment.questions.length})
                            </p>
                            <div className="space-y-3">
                              {previewAssignment.questions.map(
                                (q: any, idx: number) => {
                                  const isMultipleChoice = [
                                    "multiple_choice",
                                    "true_false",
                                  ].includes(q.question_type);
                                  return (
                                    <div
                                      key={idx}
                                      className="bg-white/[0.02] border border-white/5 rounded-xl p-3.5 space-y-2.5 hover:border-cyan-500/20 transition-all"
                                    >
                                      <div className="flex justify-between items-start gap-3">
                                        <span className="text-xs font-black text-cyan-600 dark:text-cyan-400">
                                          Q{idx + 1}.
                                        </span>
                                        <p className="flex-1 text-xs font-bold text-card-foreground leading-normal">
                                          {q.question_text}
                                        </p>
                                        {q.points && (
                                          <span className="text-[10px] bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 px-2 py-0.5 rounded-full shrink-0 border border-cyan-500/20 font-bold font-mono">
                                            {q.points} pts
                                          </span>
                                        )}
                                      </div>
                                      {isMultipleChoice &&
                                        q.options &&
                                        Array.isArray(q.options) && (
                                          <div className="grid grid-cols-1 gap-1.5 pl-6 mt-2">
                                            {q.options.map(
                                              (opt: string, optIdx: number) => {
                                                const isCorrect =
                                                  String(opt)
                                                    .trim()
                                                    .toLowerCase() ===
                                                    String(q.correct_answer)
                                                      .trim()
                                                      .toLowerCase() ||
                                                  String(optIdx) ===
                                                    String(q.correct_answer) ||
                                                  String(optIdx + 1) ===
                                                    String(q.correct_answer);
                                                return (
                                                  <div
                                                    key={optIdx}
                                                    className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg border text-xs leading-normal ${
                                                      isCorrect
                                                        ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-600 dark:text-emerald-400 font-medium"
                                                        : "bg-black/10 border-white/5 text-muted-foreground"
                                                    }`}
                                                  >
                                                    <div
                                                      className={`w-3.5 h-3.5 rounded-full border flex items-center justify-center shrink-0 ${
                                                        isCorrect
                                                          ? "border-emerald-500 bg-emerald-500/20 text-emerald-600 dark:text-emerald-400"
                                                          : "border-white/20"
                                                      }`}
                                                    >
                                                      {isCorrect && (
                                                        <span className="text-[8px] font-black">
                                                          ✓
                                                        </span>
                                                      )}
                                                    </div>
                                                    <span>{opt}</span>
                                                  </div>
                                                );
                                              }
                                            )}
                                          </div>
                                        )}
                                      {!isMultipleChoice && (
                                        <div className="pl-6 mt-1 space-y-1.5">
                                          <div className="bg-black/20 border border-white/5 rounded-lg p-2.5 font-mono text-[10px] text-muted-foreground">
                                            <p className="font-sans font-bold text-foreground mb-1 uppercase tracking-wide text-[9px]">
                                              Expected Answer:
                                            </p>
                                            <p className="text-cyan-700 dark:text-cyan-300 whitespace-pre-wrap">
                                              {q.correct_answer ||
                                                "Essay / Student Response"}
                                            </p>
                                          </div>
                                        </div>
                                      )}
                                    </div>
                                  );
                                }
                              )}
                            </div>
                          </div>
                        )}
                    </>
                  ) : (
                    <div className="py-8 text-center">
                      <p className="text-xs text-muted-foreground">
                        Could not load assignment preview.
                      </p>
                    </div>
                  )}
                </div>
              )}

              {activePreviewTab === "project" && (
                <div className="space-y-5 animate-[fadeIn_0.3s_ease]">
                  {fetchingPreview && !previewProject ? (
                    <div className="space-y-4">
                      <div className="h-6 w-3/4 bg-white/5 rounded animate-pulse" />
                      <div className="h-4 w-1/2 bg-white/5 rounded animate-pulse" />
                      <div className="space-y-2 pt-4">
                        <div className="h-4 w-full bg-white/5 rounded animate-pulse" />
                        <div className="h-4 w-full bg-white/5 rounded animate-pulse" />
                      </div>
                    </div>
                  ) : previewProject ? (
                    <>
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-primary/[0.03] border border-primary/10 rounded-xl p-3">
                        <div>
                          <p className="text-[10px] font-black text-primary uppercase tracking-widest">
                            Project Status
                          </p>
                          <p className="text-xs text-card-foreground/80 font-bold mt-0.5">
                            {previewProject.title || "Untitled Project"} ·{" "}
                            {previewProject.max_points ?? 100} pts
                          </p>
                        </div>
                        <Link
                          href={`/dashboard/assignments/${previewProject.id}`}
                          className="flex items-center justify-center gap-1.5 py-1.5 px-3 bg-primary/10 hover:bg-primary/20 text-primary border border-primary/20 rounded-lg transition-all text-[11px] font-black whitespace-nowrap"
                        >
                          <RocketLaunchIcon className="w-3.5 h-3.5" /> Workspace
                        </Link>
                      </div>

                      {previewProject.instructions && (
                        <div className="bg-white/[0.02] border border-white/5 rounded-xl p-3.5 space-y-1.5">
                          <p className="text-[10px] font-black text-primary uppercase tracking-widest font-mono">
                            Project Mission & Brief
                          </p>
                          <div className="text-xs text-card-foreground/75 leading-relaxed whitespace-pre-wrap">
                            {previewProject.instructions}
                          </div>
                        </div>
                      )}

                      {previewProject.metadata?.deliverables &&
                        Array.isArray(previewProject.metadata.deliverables) && (
                          <div className="bg-white/[0.02] border border-white/5 rounded-xl p-3.5 space-y-2">
                            <p className="text-[10px] font-black text-primary uppercase tracking-widest font-mono">
                              Deliverables Checklist
                            </p>
                            <ul className="space-y-2 pl-0">
                              {previewProject.metadata.deliverables.map(
                                (item: string, idx: number) => (
                                  <li
                                    key={idx}
                                    className="flex gap-2.5 items-start text-xs text-card-foreground/75 leading-relaxed"
                                  >
                                    <span className="w-4 h-4 rounded border border-white/20 bg-white/5 text-[9px] font-black flex items-center justify-center shrink-0 mt-0.5 text-primary">
                                      ✓
                                    </span>
                                    <span>{item}</span>
                                  </li>
                                )
                              )}
                            </ul>
                          </div>
                        )}

                      {previewProject.metadata?.rubric &&
                        Array.isArray(previewProject.metadata.rubric) && (
                          <div className="bg-white/[0.02] border border-white/5 rounded-xl p-3.5 space-y-3">
                            <p className="text-[10px] font-black text-primary uppercase tracking-widest font-mono">
                              Grading Rubric
                            </p>
                            <div className="overflow-x-auto">
                              <table className="w-full text-left text-xs border-collapse">
                                <thead>
                                  <tr className="border-b border-white/10 text-muted-foreground font-bold">
                                    <th className="py-2 pr-4 font-black">
                                      Criterion
                                    </th>
                                    <th className="py-2 px-2 font-black">
                                      Description
                                    </th>
                                    <th className="py-2 pl-4 text-right font-black">
                                      Max Pts
                                    </th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-white/5">
                                  {previewProject.metadata.rubric.map(
                                    (item: any, idx: number) => (
                                      <tr
                                        key={idx}
                                        className="text-card-foreground/80 hover:bg-white/[0.01]"
                                      >
                                        <td className="py-2.5 pr-4 font-bold text-foreground whitespace-nowrap">
                                          {item.criterion}
                                        </td>
                                        <td className="py-2.5 px-2 text-muted-foreground leading-normal">
                                          {item.description}
                                        </td>
                                        <td className="py-2.5 pl-4 text-right font-bold text-primary">
                                          {item.maxPoints ?? item.max_points}
                                        </td>
                                      </tr>
                                    )
                                  )}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        )}
                    </>
                  ) : (
                    <div className="py-8 text-center">
                      <p className="text-xs text-muted-foreground">
                        Could not load project preview.
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="p-5 border-t border-white/10 bg-white/[0.02] flex flex-col gap-3">
              <button
                onClick={() => {
                  setViewWeek(null);
                  setAiWeek(viewWeek);
                }}
                className="w-full flex items-center justify-center gap-2 py-3 bg-gradient-to-r from-primary/20 to-fuchsia-600/20 hover:from-primary/30 hover:to-fuchsia-600/30 text-primary font-black rounded-xl border border-primary/40 hover:border-primary transition-all"
              >
                <SparklesIcon className="w-4 h-4" /> AI Generate
              </button>
              <button
                onClick={() => {
                  toggleWeekCompleted(viewWeek.week);
                  setViewWeek((prev) =>
                    prev ? { ...prev, completed: !prev.completed } : null
                  );
                }}
                className={`w-full flex items-center justify-center gap-2 py-3 font-black rounded-xl border transition-all ${
                  viewWeek.completed
                    ? "bg-white/5 border-white/10 text-card-foreground/60 hover:bg-white/10"
                    : "bg-emerald-500/10 border-emerald-500/30 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/20"
                }`}
              >
                <CheckCircleIcon className="w-4 h-4" />{" "}
                {viewWeek.completed ? "Mark as Incomplete" : "Mark as Complete"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Week Edit Panel — bottom sheet on mobile, side panel on md+ */}
      {weekPanelOpen && weekDraft && (
        <div className="app-fixed-overlay fixed inset-0 z-[120] flex flex-col justify-end md:flex-row md:justify-end">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={cancelEdit}
          />
          <div className="relative w-full md:max-w-2xl md:h-full flex flex-col max-h-[92vh] md:max-h-none bg-card md:border-l border-t md:border-t-0 border-white/10 shadow-2xl rounded-t-2xl md:rounded-none overflow-hidden">
            {/* Mobile drag handle */}
            <div className="md:hidden flex justify-center pt-2.5 pb-1 shrink-0">
              <div className="w-10 h-1 rounded-full bg-white/20" />
            </div>
            <div className="px-5 py-4 border-b border-white/10 flex items-center justify-between bg-[radial-gradient(circle_at_top_right,rgba(139,92,246,0.1),transparent_50%)] shrink-0">
              <div>
                <h2 className="text-base font-black text-card-foreground">
                  Edit Week {weekDraft.week}
                </h2>
                <p className="text-xs text-card-foreground/50 mt-0.5">
                  Topic, objectives, activities, project & assignment.
                </p>
              </div>
              <button
                onClick={cancelEdit}
                className="p-2 hover:bg-white/10 rounded-xl transition-all min-h-[44px] min-w-[44px] flex items-center justify-center"
              >
                <XMarkIcon className="w-5 h-5 text-card-foreground/40" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-8">
              {/* General Details */}
              <section className="space-y-4">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-primary" />
                  <h3 className="text-xs font-black uppercase tracking-widest text-violet-700/70 dark:text-violet-300/70">
                    Curriculum Foundation
                  </h3>
                </div>
                <div className="space-y-4 bg-white/[0.02] border border-white/[0.05] p-4 rounded-2xl">
                  <label className="block space-y-1.5">
                    <span className="text-[10px] font-black uppercase tracking-wider text-card-foreground/40 ml-1">
                      Week Topic
                    </span>
                    <input
                      type="text"
                      value={weekDraft.topic}
                      onChange={(e) =>
                        setWeekDraft({ ...weekDraft, topic: e.target.value })
                      }
                      placeholder="e.g., Introduction to Neural Networks"
                      className="w-full bg-black/20 border border-white/10 rounded-xl px-4 py-2.5 text-sm font-bold text-card-foreground focus:border-primary/50 focus:ring-0 transition-all"
                    />
                  </label>
                  <label className="block space-y-1.5">
                    <span className="text-[10px] font-black uppercase tracking-wider text-card-foreground/40 ml-1">
                      Learning Objectives
                    </span>
                    <textarea
                      rows={3}
                      value={weekDraft.objectives}
                      onChange={(e) =>
                        setWeekDraft({
                          ...weekDraft,
                          objectives: e.target.value,
                        })
                      }
                      placeholder="What should students master this week?"
                      className="w-full bg-black/20 border border-white/10 rounded-xl px-4 py-2.5 text-sm font-medium text-card-foreground/80 focus:border-primary/50 focus:ring-0 transition-all resize-none"
                    />
                  </label>
                  <label className="block space-y-1.5">
                    <span className="text-[10px] font-black uppercase tracking-wider text-card-foreground/40 ml-1">
                      Classroom Activities
                    </span>
                    <textarea
                      rows={3}
                      value={weekDraft.activities}
                      onChange={(e) =>
                        setWeekDraft({
                          ...weekDraft,
                          activities: e.target.value,
                        })
                      }
                      placeholder="Detail the planned flow and exercises."
                      className="w-full bg-black/20 border border-white/10 rounded-xl px-4 py-2.5 text-sm font-medium text-card-foreground/80 focus:border-primary/50 focus:ring-0 transition-all resize-none"
                    />
                  </label>
                  <label className="block space-y-1.5">
                    <span className="text-[10px] font-black uppercase tracking-wider text-card-foreground/40 ml-1">
                      Teacher Notes
                    </span>
                    <textarea
                      rows={2}
                      value={weekDraft.notes ?? ""}
                      onChange={(e) =>
                        setWeekDraft({ ...weekDraft, notes: e.target.value })
                      }
                      placeholder="Internal notes visible only to teachers."
                      className="w-full bg-black/20 border border-white/10 rounded-xl px-4 py-2.5 text-sm font-medium text-card-foreground/80 focus:border-primary/50 focus:ring-0 transition-all resize-none"
                    />
                  </label>
                </div>
              </section>

              {/* Project Section */}
              <section className="space-y-4">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                  <h3 className="text-xs font-black uppercase tracking-widest text-emerald-700/70 dark:text-emerald-300/70">
                    Project Seed
                  </h3>
                </div>
                <div className="space-y-4 bg-emerald-500/[0.02] border border-emerald-500/10 p-4 rounded-2xl">
                  <label className="block space-y-1.5">
                    <span className="text-[10px] font-black uppercase tracking-wider text-emerald-600/60 dark:text-emerald-400/60 ml-1">
                      Project Title
                    </span>
                    <input
                      type="text"
                      value={weekDraft.project?.title || ""}
                      onChange={(e) =>
                        setWeekDraft({
                          ...weekDraft,
                          project: {
                            ...(weekDraft.project || {}),
                            title: e.target.value,
                          },
                        })
                      }
                      className="w-full bg-black/20 border border-white/10 rounded-xl px-4 py-2.5 text-sm font-bold text-card-foreground focus:border-emerald-500/50 focus:ring-0 transition-all"
                    />
                  </label>
                  <label className="block space-y-1.5">
                    <span className="text-[10px] font-black uppercase tracking-wider text-emerald-600/60 dark:text-emerald-400/60 ml-1">
                      Project Description
                    </span>
                    <textarea
                      rows={4}
                      value={weekDraft.project?.description || ""}
                      onChange={(e) =>
                        setWeekDraft({
                          ...weekDraft,
                          project: {
                            ...(weekDraft.project || {}),
                            description: e.target.value,
                          },
                        })
                      }
                      className="w-full bg-black/20 border border-white/10 rounded-xl px-4 py-2.5 text-sm font-medium text-card-foreground/80 focus:border-emerald-500/50 focus:ring-0 transition-all resize-none"
                    />
                  </label>
                </div>
              </section>

              {/* Assignment Section */}
              <section className="space-y-4">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-primary" />
                  <h3 className="text-xs font-black uppercase tracking-widest text-blue-700/70 dark:text-blue-300/70">
                    Assignment Brief
                  </h3>
                </div>
                <div className="space-y-4 bg-primary/[0.02] border border-primary/10 p-4 rounded-2xl">
                  <label className="block space-y-1.5">
                    <span className="text-[10px] font-black uppercase tracking-wider text-primary/60 ml-1">
                      Task Title
                    </span>
                    <input
                      type="text"
                      value={weekDraft.assignment?.title || ""}
                      onChange={(e) =>
                        setWeekDraft({
                          ...weekDraft,
                          assignment: {
                            ...(weekDraft.assignment || {}),
                            title: e.target.value,
                          },
                        })
                      }
                      className="w-full bg-black/20 border border-white/10 rounded-xl px-4 py-2.5 text-sm font-bold text-card-foreground focus:border-primary/50 focus:ring-0 transition-all"
                    />
                  </label>
                  <label className="block space-y-1.5">
                    <span className="text-[10px] font-black uppercase tracking-wider text-primary/60 ml-1">
                      Submission Brief
                    </span>
                    <textarea
                      rows={4}
                      value={weekDraft.assignment?.brief || ""}
                      onChange={(e) =>
                        setWeekDraft({
                          ...weekDraft,
                          assignment: {
                            ...(weekDraft.assignment || {}),
                            brief: e.target.value,
                          },
                        })
                      }
                      className="w-full bg-black/20 border border-white/10 rounded-xl px-4 py-2.5 text-sm font-medium text-card-foreground/80 focus:border-primary/50 focus:ring-0 transition-all resize-none"
                    />
                  </label>
                </div>
              </section>

              {/* Practical Assessment */}
              <section className="space-y-4">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                  <h3 className="text-xs font-black uppercase tracking-widest text-amber-700/70 dark:text-amber-300/70">
                    Practical Assessment
                  </h3>
                </div>
                <div className="grid grid-cols-1 gap-3 bg-amber-500/[0.02] sm:grid-cols-3 border border-amber-500/10 p-4 rounded-2xl">
                  <label className="block space-y-1.5">
                    <span className="text-[10px] font-black uppercase tracking-wider text-amber-600/60 dark:text-amber-400/60 ml-1">
                      Max Score
                    </span>
                    <input
                      type="number"
                      value={weekDraft.practical_assessment?.max_score ?? 100}
                      onChange={(e) =>
                        setWeekDraft({
                          ...weekDraft,
                          practical_assessment: {
                            ...(weekDraft.practical_assessment || {}),
                            max_score: Number(e.target.value),
                          },
                        })
                      }
                      className="w-full bg-black/20 border border-white/10 rounded-xl px-4 py-2.5 text-sm font-bold text-card-foreground focus:border-amber-500/50 focus:ring-0 transition-all"
                    />
                  </label>
                  <label className="block space-y-1.5">
                    <span className="text-[10px] font-black uppercase tracking-wider text-amber-600/60 dark:text-amber-400/60 ml-1">
                      Pass %
                    </span>
                    <input
                      type="number"
                      value={weekDraft.practical_assessment?.pass_score ?? 60}
                      onChange={(e) =>
                        setWeekDraft({
                          ...weekDraft,
                          practical_assessment: {
                            ...(weekDraft.practical_assessment || {}),
                            pass_score: Number(e.target.value),
                          },
                        })
                      }
                      className="w-full bg-black/20 border border-white/10 rounded-xl px-4 py-2.5 text-sm font-bold text-card-foreground focus:border-amber-500/50 focus:ring-0 transition-all"
                    />
                  </label>
                  <label className="block space-y-1.5">
                    <span className="text-[10px] font-black uppercase tracking-wider text-amber-600/60 dark:text-amber-400/60 ml-1">
                      Score
                    </span>
                    <input
                      type="number"
                      value={
                        weekDraft.practical_assessment?.practical_score ?? 0
                      }
                      onChange={(e) =>
                        setWeekDraft({
                          ...weekDraft,
                          practical_assessment: {
                            ...(weekDraft.practical_assessment || {}),
                            practical_score: Number(e.target.value),
                          },
                        })
                      }
                      className="w-full bg-black/20 border border-white/10 rounded-xl px-4 py-2.5 text-sm font-bold text-card-foreground focus:border-amber-500/50 focus:ring-0 transition-all"
                    />
                  </label>
                </div>
              </section>
            </div>

            <div className="p-6 border-t border-white/10 bg-white/[0.02] flex items-center gap-3">
              <button
                onClick={cancelEdit}
                className="flex-1 py-3 bg-white/5 hover:bg-white/10 text-card-foreground/60 font-bold rounded-2xl transition-all"
              >
                Cancel Changes
              </button>
              <button
                onClick={saveWeekEdit}
                className="flex-1 py-3 bg-primary hover:bg-primary text-white font-black rounded-2xl shadow-lg shadow-primary/20 transition-all"
              >
                Save Week
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Practical Score Modal */}
      {practicalModal && (
        <div className="mobile-native-dialog fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div role="dialog" aria-modal="true" className="bg-card border border-white/10 rounded-[32px] w-full max-w-sm shadow-2xl overflow-hidden">
            <div className="p-8 text-center space-y-6">
              <div className="w-16 h-16 bg-amber-500/20 rounded-2xl flex items-center justify-center mx-auto">
                <TrophyIcon className="w-8 h-8 text-amber-600 dark:text-amber-400" />
              </div>
              <div>
                <h3 className="text-xl font-black text-card-foreground">
                  Practical Assessment
                </h3>
                <p className="text-sm text-card-foreground/50 mt-2">
                  Enter the student's score for Week {practicalModal.weekNum}
                </p>
              </div>
              <div className="relative">
                <input
                  autoFocus
                  type="number"
                  value={practicalInput}
                  onChange={(e) => setPracticalInput(e.target.value)}
                  className="w-full bg-black/40 border-2 border-white/10 rounded-2xl px-6 py-4 text-3xl font-black text-center text-card-foreground focus:border-amber-500/50 focus:ring-0 transition-all"
                />
                <span className="absolute right-6 top-1/2 -translate-y-1/2 text-sm font-black text-card-foreground/30">
                  / 100
                </span>
              </div>
              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => setPracticalModal(null)}
                  className="flex-1 py-4 bg-white/5 hover:bg-white/10 text-card-foreground/60 font-bold rounded-2xl transition-all"
                >
                  Cancel
                </button>
                <button
                  onClick={confirmPracticalScore}
                  className="flex-1 py-4 bg-amber-500 hover:bg-amber-400 text-black font-black rounded-2xl transition-all"
                >
                  Save Score
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Override Reason Modal */}
      {overrideModal && (
        <div className="mobile-native-dialog fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div role="dialog" aria-modal="true" className="bg-card border border-white/10 rounded-[32px] w-full max-w-md shadow-2xl overflow-hidden">
            <div className="p-8 space-y-6">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-cyan-500/20 rounded-2xl flex items-center justify-center shrink-0">
                  <LockOpenIcon className="w-6 h-6 text-cyan-600 dark:text-cyan-400" />
                </div>
                <div>
                  <h3 className="text-xl font-black text-card-foreground">
                    Override Unlock
                  </h3>
                  <p className="text-sm text-card-foreground/50">
                    Week {overrideModal.weekNum} · Manual Gating Bypass
                  </p>
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-card-foreground/40 ml-1">
                  Reason for override
                </label>
                <textarea
                  autoFocus
                  rows={4}
                  value={overrideReason}
                  onChange={(e) => setOverrideReason(e.target.value)}
                  placeholder="e.g., Student has fully learned the concept through external project..."
                  className="w-full bg-black/40 border-2 border-white/10 rounded-2xl px-5 py-4 text-sm font-medium text-card-foreground focus:border-cyan-500/50 focus:ring-0 transition-all resize-none"
                />
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => setOverrideModal(null)}
                  className="flex-1 py-4 bg-white/5 hover:bg-white/10 text-card-foreground/60 font-bold rounded-2xl transition-all"
                >
                  Cancel
                </button>
                <button
                  onClick={confirmOverride}
                  className="flex-1 py-4 bg-cyan-700 hover:bg-cyan-800 text-white font-black rounded-2xl transition-all"
                >
                  Confirm Override
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function renderInlineMarkdown(md: string) {
  if (!md) return null;

  // Split by code blocks first
  const parts = md.split(/(```[\s\S]*?```)/g);

  return parts.map((part, index) => {
    // If it's a code block
    if (part.startsWith("```")) {
      const match = part.match(/^```(\w*)\n([\s\S]*?)\n?```$/);
      const lang = match ? match[1] : "";
      const code = match ? match[2] : part.slice(3, -3);

      const LANG_COLOR: Record<string, string> = {
        python: "text-emerald-600 dark:text-emerald-400 bg-emerald-500/10",
        javascript: "text-yellow-600 dark:text-yellow-400 bg-yellow-500/10",
        js: "text-yellow-600 dark:text-yellow-400 bg-yellow-500/10",
        html: "text-primary bg-primary/10",
        css: "text-primary bg-primary/10",
        robotics: "text-primary bg-primary/10",
        bash: "text-muted-foreground bg-muted/50",
        json: "text-cyan-600 dark:text-cyan-400 bg-cyan-500/10",
      };
      const langClass =
        LANG_COLOR[lang?.toLowerCase()] ?? "text-cyan-600 dark:text-cyan-400 bg-cyan-500/10";

      return (
        <div
          key={index}
          className="my-4 bg-black/40 border border-white/5 rounded-xl overflow-hidden shadow-xl shrink-0"
        >
          <div className="flex items-center justify-between px-4 py-2 bg-white/[0.02] border-b border-white/5">
            <span
              className={`px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-widest ${langClass}`}
            >
              {lang || "code"}
            </span>
            <button
              onClick={() => navigator.clipboard.writeText(code)}
              className="text-[9px] font-black uppercase tracking-widest text-muted-foreground/60 hover:text-muted-foreground transition-colors"
            >
              Copy
            </button>
          </div>
          <pre className="p-4 overflow-x-auto text-[11px] font-mono leading-relaxed text-cyan-700 dark:text-cyan-300">
            <code>{code}</code>
          </pre>
        </div>
      );
    }

    // Otherwise, parse paragraphs, headings, lists, quotes, bold
    const lines = part.split("\n");
    let inList = false;
    let listItems: string[] = [];
    const renderedElements: React.ReactNode[] = [];

    const flushList = (key: string) => {
      if (listItems.length > 0) {
        renderedElements.push(
          <ul key={key} className="list-disc pl-5 my-2 space-y-1">
            {listItems.map((item, idx) => (
              <li
                key={idx}
                className="text-xs text-card-foreground/75 leading-relaxed"
              >
                {parseInlineFormatting(item)}
              </li>
            ))}
          </ul>
        );
        listItems = [];
        inList = false;
      }
    };

    lines.forEach((line, lineIdx) => {
      const trimmed = line.trim();
      const key = `${index}-${lineIdx}`;

      if (trimmed.startsWith("## ")) {
        flushList(key);
        renderedElements.push(
          <h2
            key={key}
            className="text-sm font-black text-foreground pt-4 pb-1 border-b border-white/5 uppercase tracking-widest mt-3"
          >
            {parseInlineFormatting(trimmed.slice(3))}
          </h2>
        );
      } else if (trimmed.startsWith("### ")) {
        flushList(key);
        renderedElements.push(
          <h3
            key={key}
            className="text-xs font-black text-foreground/90 pt-3 pb-1 flex items-center gap-1.5 mt-2"
          >
            <span className="w-1 h-1 rounded-full bg-cyan-500 inline-block shrink-0" />
            {parseInlineFormatting(trimmed.slice(4))}
          </h3>
        );
      } else if (trimmed.startsWith("#### ")) {
        flushList(key);
        renderedElements.push(
          <h4
            key={key}
            className="text-[11px] font-black text-foreground/75 pt-2 pb-0.5 uppercase tracking-wider"
          >
            {parseInlineFormatting(trimmed.slice(5))}
          </h4>
        );
      } else if (
        trimmed.startsWith("- ") ||
        trimmed.startsWith("* ") ||
        trimmed.match(/^\d+\.\s/)
      ) {
        inList = true;
        const cleanItem =
          trimmed.startsWith("- ") || trimmed.startsWith("* ")
            ? trimmed.slice(2)
            : trimmed.replace(/^\d+\.\s/, "");
        listItems.push(cleanItem);
      } else if (trimmed.startsWith(">")) {
        flushList(key);
        const quoteContent = trimmed.replace(/^>\s*/, "");
        renderedElements.push(
          <blockquote
            key={key}
            className="my-3 pl-4 border-l-3 border-primary/50 bg-primary/5 py-2 pr-3 rounded-r-lg"
          >
            <div className="text-xs text-foreground/75 italic leading-relaxed">
              {parseInlineFormatting(quoteContent)}
            </div>
          </blockquote>
        );
      } else if (trimmed === "") {
        flushList(key);
      } else {
        flushList(key);
        renderedElements.push(
          <p
            key={key}
            className="text-xs text-card-foreground/75 leading-relaxed my-2"
          >
            {parseInlineFormatting(trimmed)}
          </p>
        );
      }
    });

    flushList(`${index}-end`);
    return <div key={index}>{renderedElements}</div>;
  });
}

function parseInlineFormatting(text: string) {
  // Simple regex to parse **bold** and `code` inline formatting
  const parts = text.split(/(\*\*.*?\*\*|`.*?`)/g);
  return parts.map((part, idx) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return (
        <strong key={idx} className="font-bold text-foreground">
          {part.slice(2, -2)}
        </strong>
      );
    }
    if (part.startsWith("`") && part.endsWith("`")) {
      return (
        <code
          key={idx}
          className="px-1.5 py-0.5 rounded bg-white/5 border border-white/10 font-mono text-[10px] text-cyan-700 dark:text-cyan-300"
        >
          {part.slice(1, -1)}
        </code>
      );
    }
    return part;
  });
}
