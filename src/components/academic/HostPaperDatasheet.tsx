'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent, type MouseEvent } from 'react';
import Link from 'next/link';
import { useAuth } from '@/contexts/auth-context';
import { createClient } from '@/lib/supabase/client';
import {
  ArrowLeftIcon,
  ChartBarIcon,
  ClipboardDocumentListIcon,
  MagnifyingGlassIcon,
  PrinterIcon,
  SparklesIcon,
  UserGroupIcon,
} from '@/lib/icons';
import { MOBILE_PAGE_BOTTOM } from '@/components/mobile/mobile-styles';
import CbtMarkdown from '@/components/cbt/CbtMarkdown';
import {
  buildCbtPrintHtml,
  isObjectiveQuestion,
  isTheoryQuestion,
  openCbtPrintWindow,
} from '@/lib/cbt/print-utils';
import { sessionAllowsPaperOverwrite } from '@/lib/cbt/paper-capture';
import {
  SUGGESTED_HOST_PAPER_MAX,
  hallMarkDraftError,
  hostMaxFromExam,
  hostPaperLabel,
  markFromPercent,
  parsePaperMarkAnswers,
  pickHostPaperExamIds,
  type HostAssessmentKind,
} from '@/lib/academic/host-marks';
import { getWAECGrade } from '@/lib/grading';
import { openOfficialOfficePrintable } from '@/lib/reports/office-printables';
import { buildCbtNewHref, buildClassTeachingHref, hostPaperDatasheetHref } from '@/lib/curriculum/href';

type StudentRow = { id: string; full_name: string | null };

type SessionRow = {
  id?: string;
  user_id: string;
  answers?: unknown;
  score?: number | null;
  grading_version?: number | null;
};

type RowFeedback = { tone: 'saved' | 'warning' | 'error'; message: string };
type SegmentFilter = 'all' | 'missing' | 'distinction' | 'credit' | 'at_risk' | 'cbt';
type SortMode = 'name' | 'score_desc' | 'score_asc' | 'missing_first';

type PaperSnapshot = {
  examId: string | null;
  max: number;
  byStudent: Record<string, { earned: number; max: number; percent: number; isCbt: boolean }>;
};

type ExamRow = {
  id: string;
  title?: string;
  description?: string | null;
  class_id?: string | null;
  course_id?: string | null;
  program_id?: string | null;
  school_id?: string | null;
  is_active?: boolean;
  duration_minutes?: number | null;
  passing_score?: number | null;
  metadata?: Record<string, unknown> | null;
  programs?: { name?: string | null } | null;
  courses?: { title?: string | null } | null;
  cbt_questions?: Array<{
    id: string;
    question_text: string;
    question_type?: string;
    options?: unknown;
    correct_answer?: string;
    points?: number;
    order_index?: number;
  }>;
};

const ALL_KINDS: HostAssessmentKind[] = ['first_test', 'second_test', 'examination'];

function waecToneClasses(pct: number): string {
  if (pct >= 70) return 'border-emerald-500/35 bg-emerald-500/10 text-emerald-800 dark:text-emerald-300';
  if (pct >= 50) return 'border-primary/35 bg-primary/10 text-primary';
  return 'border-rose-500/35 bg-rose-500/10 text-rose-700 dark:text-rose-300';
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function normalizeTokens(raw: string): string[] {
  return raw
    .toLowerCase()
    .replace(/[^a-z\s]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length >= 2);
}

export function HostPaperDatasheet(props: {
  classId: string;
  kind: HostAssessmentKind;
  courseId?: string | null;
  programId?: string | null;
  schoolId?: string | null;
  studentId?: string | null;
  from?: string | null;
}) {
  const { profile, loading: authLoading } = useAuth();
  const paperName = hostPaperLabel(props.kind);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [className, setClassName] = useState('');
  const [schoolName, setSchoolName] = useState('');
  const [courseName, setCourseName] = useState('');
  const [programName, setProgramName] = useState('');
  const [courseId, setCourseId] = useState(props.courseId || '');
  const [programId, setProgramId] = useState(props.programId || '');
  const [schoolId, setSchoolId] = useState(props.schoolId || '');
  const [exam, setExam] = useState<ExamRow | null>(null);
  const [roster, setRoster] = useState<StudentRow[]>([]);
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [paperSnapshots, setPaperSnapshots] = useState<Record<HostAssessmentKind, PaperSnapshot>>({
    first_test: { examId: null, max: SUGGESTED_HOST_PAPER_MAX.first_test, byStudent: {} },
    second_test: { examId: null, max: SUGGESTED_HOST_PAPER_MAX.second_test, byStudent: {} },
    examination: { examId: null, max: SUGGESTED_HOST_PAPER_MAX.examination, byStudent: {} },
  });
  const [hallDraft, setHallDraft] = useState<Record<string, string>>({});
  const [baselineDraft, setBaselineDraft] = useState<Record<string, string>>({});
  const [paperOutOf, setPaperOutOf] = useState(String(SUGGESTED_HOST_PAPER_MAX[props.kind]));
  const [baselineMax, setBaselineMax] = useState(SUGGESTED_HOST_PAPER_MAX[props.kind]);
  const [saving, setSaving] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [noticeTone, setNoticeTone] = useState<'success' | 'warning'>('success');
  const [rowFeedback, setRowFeedback] = useState<Record<string, RowFeedback>>({});
  const [learnerSearch, setLearnerSearch] = useState('');
  const [segment, setSegment] = useState<SegmentFilter>('all');
  const [sortMode, setSortMode] = useState<SortMode>('name');
  const [showPasteBox, setShowPasteBox] = useState(false);
  const [pasteRaw, setPasteRaw] = useState('');

  const mobileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const desktopInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const questions = useMemo(
    () => [...(exam?.cbt_questions ?? [])].sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0)),
    [exam],
  );
  const parsedPaperMax = Number(paperOutOf);
  const paperMaxError = !Number.isInteger(parsedPaperMax) || parsedPaperMax < 1 || parsedPaperMax > 1000
    ? 'Use a whole-number paper total from 1 to 1000.'
    : null;
  const hallMax = paperMaxError ? SUGGESTED_HOST_PAPER_MAX[props.kind] : parsedPaperMax;

  const quickPresetMarks = useMemo(() => {
    const pcts = [0.5, 0.7, 0.85, 1];
    const seen = new Set<number>();
    const vals: number[] = [];
    for (const p of pcts) {
      const m = Math.round(hallMax * p);
      if (m >= 0 && m <= hallMax && !seen.has(m)) {
        seen.add(m);
        vals.push(m);
      }
    }
    return vals;
  }, [hallMax]);

  const markedCount = roster.filter((row) => String(hallDraft[row.id] ?? '').trim() !== '').length;
  const invalidRows = useMemo(() => roster
    .map((student) => ({ student, error: hallMarkDraftError(hallDraft[student.id], paperMaxError ? null : hallMax) }))
    .filter((row): row is { student: StudentRow; error: string } => !!row.error), [hallDraft, hallMax, paperMaxError, roster]);
  const clearedRows = useMemo(() => roster.filter((student) =>
    String(baselineDraft[student.id] ?? '').trim() !== ''
    && String(hallDraft[student.id] ?? '').trim() === ''), [baselineDraft, hallDraft, roster]);
  const paperTotalChanged = hallMax !== baselineMax;
  const dirtyStudentIds = useMemo(() => new Set(roster
    .filter((student) => {
      const next = String(hallDraft[student.id] ?? '').trim();
      const previous = String(baselineDraft[student.id] ?? '').trim();
      return next !== '' && (next !== previous || paperTotalChanged);
    })
    .map((student) => student.id)), [baselineDraft, hallDraft, paperTotalChanged, roster]);

  // Live per-student analytics + 3-paper combined sync
  const studentMetrics = useMemo(() => {
    const map: Record<string, {
      earned: number | null;
      pct: number | null;
      waec: ReturnType<typeof getWAECGrade> | null;
      isCbt: boolean;
      combinedEarned: number;
      combinedMax: number;
      combinedPct: number | null;
      combinedWaec: ReturnType<typeof getWAECGrade> | null;
      papersEntered: number;
    }> = {};

    for (const s of roster) {
      const raw = String(hallDraft[s.id] ?? '').trim();
      const num = raw !== '' && Number.isFinite(Number(raw)) ? Number(raw) : null;
      const pct = num !== null && hallMax > 0 ? Math.round((num / hallMax) * 100) : null;
      const existing = sessions.find((row) => row.user_id === s.id);
      const isCbt = !!existing && !sessionAllowsPaperOverwrite(existing);

      let combinedEarned = 0;
      let combinedMax = 0;
      let papersEntered = 0;
      for (const k of ALL_KINDS) {
        if (k === props.kind) {
          if (num !== null && num >= 0 && num <= hallMax) {
            combinedEarned += num;
            combinedMax += hallMax;
            papersEntered++;
          }
        } else {
          const snap = paperSnapshots[k]?.byStudent[s.id];
          if (snap) {
            combinedEarned += snap.earned;
            combinedMax += snap.max;
            papersEntered++;
          }
        }
      }
      const combinedPct = combinedMax > 0 ? Math.round((combinedEarned / combinedMax) * 100) : null;

      map[s.id] = {
        earned: num,
        pct,
        waec: pct !== null ? getWAECGrade(pct) : null,
        isCbt,
        combinedEarned,
        combinedMax,
        combinedPct,
        combinedWaec: combinedPct !== null ? getWAECGrade(combinedPct) : null,
        papersEntered,
      };
    }
    return map;
  }, [roster, hallDraft, hallMax, sessions, paperSnapshots, props.kind]);

  // Teacher monitoring & segmentation KPIs
  const analytics = useMemo(() => {
    let sumPct = 0;
    let entered = 0;
    let passed = 0;
    let distinction = 0;
    let credit = 0;
    let atRisk = 0;
    let cbtCount = 0;
    let highest: number | null = null;
    let lowest: number | null = null;

    for (const s of roster) {
      const m = studentMetrics[s.id];
      if (!m) continue;
      if (m.isCbt) cbtCount++;
      if (m.pct !== null && m.earned !== null) {
        entered++;
        sumPct += m.pct;
        if (m.pct >= 50) passed++;
        if (m.pct >= 65) distinction++;
        else if (m.pct >= 50) credit++;
        else atRisk++;
        if (highest === null || m.earned > highest) highest = m.earned;
        if (lowest === null || m.earned < lowest) lowest = m.earned;
      }
    }
    const avgPct = entered > 0 ? Math.round(sumPct / entered) : null;
    const passRate = entered > 0 ? Math.round((passed / entered) * 100) : null;
    return {
      entered,
      missing: Math.max(0, roster.length - entered),
      avgPct,
      avgWaec: avgPct !== null ? getWAECGrade(avgPct) : null,
      passRate,
      distinction,
      credit,
      atRisk,
      cbtCount,
      highest,
      lowest,
    };
  }, [roster, studentMetrics]);

  const visibleRoster = useMemo(() => {
    const query = learnerSearch.trim().toLowerCase();
    const list = roster.filter((student) => {
      if (query && !String(student.full_name ?? '').toLowerCase().includes(query)) return false;
      const m = studentMetrics[student.id];
      if (segment === 'missing') return m?.earned === null;
      if (segment === 'distinction') return m?.pct !== null && m.pct >= 65;
      if (segment === 'credit') return m?.pct !== null && m.pct >= 50 && m.pct < 65;
      if (segment === 'at_risk') return m?.pct !== null && m.pct < 50;
      if (segment === 'cbt') return Boolean(m?.isCbt);
      return true;
    });

    return [...list].sort((a, b) => {
      const ma = studentMetrics[a.id];
      const mb = studentMetrics[b.id];
      if (sortMode === 'score_desc') {
        const va = ma?.earned ?? -1;
        const vb = mb?.earned ?? -1;
        if (vb !== va) return vb - va;
      } else if (sortMode === 'score_asc') {
        const va = ma?.earned ?? 999999;
        const vb = mb?.earned ?? 999999;
        if (va !== vb) return va - vb;
      } else if (sortMode === 'missing_first') {
        const missA = ma?.earned === null ? 0 : 1;
        const missB = mb?.earned === null ? 0 : 1;
        if (missA !== missB) return missA - missB;
      }
      return String(a.full_name ?? '').localeCompare(String(b.full_name ?? ''));
    });
  }, [learnerSearch, roster, segment, sortMode, studentMetrics]);

  const hasUnsavedChanges = dirtyStudentIds.size > 0 || clearedRows.length > 0;

  const backHref =
    props.from === 'write'
      ? '/dashboard/reports/builder'
      : buildClassTeachingHref({ classId: props.classId, courseId: courseId || props.courseId });

  const generateHref = buildCbtNewHref({
    classId: props.classId,
    courseId: courseId || props.courseId,
    programId: programId || props.programId,
    schoolId: schoolId || props.schoolId,
    hostAssessment: props.kind,
    title: paperName,
    examType: props.kind === 'examination' ? 'examination' : 'evaluation',
    sit: 'print',
  });

  const load = useCallback(async (options?: {
    background?: boolean;
    preserveDraft?: Record<string, string>;
    preserveStudentIds?: Set<string>;
  }) => {
    if (!options?.background) setLoading(true);
    setError(null);
    try {
      const db = createClient();
      const [klassRes, rosterRes] = await Promise.all([
        db.from('classes').select('id,name,school_id,program_id,current_course_id,schools(name)').eq('id', props.classId).maybeSingle(),
        fetch(`/api/portal-users?role=student&scoped=true&class_id=${props.classId}`, { cache: 'no-store' }).then(async (r) => {
          const json = await r.json().catch(() => ({}));
          if (!r.ok) throw new Error(json.error || 'The class roster could not be loaded');
          return json;
        }),
      ]);
      if (klassRes.error) throw new Error(klassRes.error.message);
      const klass = klassRes.data as any;
      if (!klass) throw new Error('Class not found');
      setClassName(klass.name || '');
      setSchoolName(klass.schools?.name || '');
      setSchoolId(klass.school_id || props.schoolId || '');
      setProgramId(klass.program_id || props.programId || '');
      const nextCourseId = props.courseId || klass.current_course_id || '';
      setCourseId(nextCourseId);

      let examQuery = db.from('cbt_exams').select('id,title,metadata,class_id,course_id,created_at');
      examQuery = nextCourseId
        ? examQuery.or(`class_id.eq.${props.classId},course_id.eq.${nextCourseId}`)
        : examQuery.eq('class_id', props.classId);
      const { data: examRows, error: examListError } = await examQuery;
      if (examListError) throw new Error(examListError.message);
      const scoped = ((examRows ?? []) as ExamRow[]).filter((row) => {
        const examClass = String(row.class_id || (row.metadata as any)?.target_class_id || '');
        return !examClass || examClass === props.classId;
      });
      const picked = pickHostPaperExamIds(scoped, {
        classId: props.classId,
        courseId: nextCourseId || null,
      });

      const classRoster = ((rosterRes.data ?? []) as StudentRow[]).sort((a, b) =>
        String(a.full_name ?? '').localeCompare(String(b.full_name ?? '')),
      );
      setRoster(classRoster);

      // Load active paper detail + ALL 3 papers' sessions in parallel for live 3-paper sync
      const activeExamId = picked[props.kind];
      const [detailRes, ...sessionResults] = await Promise.all([
        activeExamId
          ? fetch(`/api/cbt/exams/${activeExamId}`, { cache: 'no-store' }).then(async (r) => {
              const json = await r.json().catch(() => ({}));
              if (!r.ok) throw new Error(json.error || 'Paper not available');
              return json.data as ExamRow;
            })
          : Promise.resolve(null),
        ...ALL_KINDS.map((k) => {
          const eid = picked[k];
          if (!eid) return Promise.resolve([] as SessionRow[]);
          return fetch(`/api/cbt/sessions?exam_id=${eid}`, { cache: 'no-store' })
            .then(async (r) => {
              const json = await r.json().catch(() => ({}));
              return r.ok && Array.isArray(json.data) ? (json.data as SessionRow[]) : [];
            })
            .catch(() => [] as SessionRow[]);
        }),
      ]);

      const loadedExam = detailRes;
      const nextSnapshots: Record<HostAssessmentKind, PaperSnapshot> = {
        first_test: { examId: picked.first_test ?? null, max: SUGGESTED_HOST_PAPER_MAX.first_test, byStudent: {} },
        second_test: { examId: picked.second_test ?? null, max: SUGGESTED_HOST_PAPER_MAX.second_test, byStudent: {} },
        examination: { examId: picked.examination ?? null, max: SUGGESTED_HOST_PAPER_MAX.examination, byStudent: {} },
      };

      ALL_KINDS.forEach((k, idx) => {
        const eid = picked[k];
        const metaExam = k === props.kind ? loadedExam : scoped.find((r) => r.id === eid);
        const kMax = hostMaxFromExam({
          metadata: metaExam?.metadata,
          cbt_questions: (metaExam as ExamRow | null)?.cbt_questions,
        }) || SUGGESTED_HOST_PAPER_MAX[k];
        const kSessions = sessionResults[idx] ?? [];
        const byStudent: PaperSnapshot['byStudent'] = {};
        for (const student of classRoster) {
          const existing = kSessions.find((row) => row.user_id === student.id);
          const paper = parsePaperMarkAnswers(existing?.answers) || markFromPercent(existing?.score, kMax);
          if (paper) {
            byStudent[student.id] = {
              earned: paper.earned,
              max: paper.max || kMax,
              percent: Math.round((paper.earned / (paper.max || kMax)) * 100),
              isCbt: !!existing && !sessionAllowsPaperOverwrite(existing),
            };
          }
        }
        nextSnapshots[k] = { examId: eid ?? null, max: kMax, byStudent };
      });

      const activeIdx = ALL_KINDS.indexOf(props.kind);
      const loadedSessions = sessionResults[activeIdx] ?? [];
      const paperMax = nextSnapshots[props.kind].max;

      setPaperSnapshots(nextSnapshots);
      setExam(loadedExam);
      setSessions(loadedSessions);
      setCourseName(loadedExam?.courses?.title || '');
      setProgramName(loadedExam?.programs?.name || '');
      setPaperOutOf(String(paperMax));
      setBaselineMax(paperMax);

      const draft: Record<string, string> = {};
      for (const student of classRoster) {
        const existing = loadedSessions.find((row) => row.user_id === student.id);
        const paper = parsePaperMarkAnswers(existing?.answers) || markFromPercent(existing?.score, paperMax);
        if (paper) draft[student.id] = String(paper.earned);
      }
      const displayDraft = { ...draft };
      for (const studentId of options?.preserveStudentIds ?? []) {
        if (options?.preserveDraft && studentId in options.preserveDraft) {
          displayDraft[studentId] = options.preserveDraft[studentId];
        }
      }
      setBaselineDraft(draft);
      setHallDraft(displayDraft);
    } catch (err: any) {
      setError(err.message || 'Could not load this paper');
    } finally {
      if (!options?.background) setLoading(false);
    }
  }, [props.classId, props.courseId, props.kind, props.programId, props.schoolId]);

  useEffect(() => {
    if (authLoading || !profile) return;
    void load();
  }, [authLoading, profile, load]);

  useEffect(() => {
    if (!hasUnsavedChanges) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [hasUnsavedChanges]);

  const ensureExam = async () => {
    if (exam?.id) return exam.id;
    setPreparing(true);
    try {
      const res = await fetch('/api/cbt/exams', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: `${courseName || 'Coding'} — ${paperName}`,
          description: `${paperName} for ${className}`.trim(),
          class_id: props.classId,
          course_id: courseId || props.courseId || null,
          program_id: programId || props.programId || null,
          school_id: schoolId || props.schoolId || null,
          is_active: false,
          exam_type: props.kind === 'examination' ? 'examination' : 'evaluation',
          metadata: {
            host_assessment: props.kind,
            host_max: hallMax,
            sit: 'print',
            generated_from: 'taught_weeks',
            target_class_id: props.classId,
            visibility: 'class',
          },
          questions: [],
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'Could not open this paper');
      const id = json.data?.id as string;
      if (!id) throw new Error('Paper was not created');
      setExam((current) => ({ ...(current ?? {}), ...(json.data ?? {}), id }));
      return id;
    } finally {
      setPreparing(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    setNotice(null);
    setRowFeedback({});
    try {
      if (paperMaxError) throw new Error(paperMaxError);
      if (invalidRows.length > 0) {
        const names = invalidRows.slice(0, 3).map((row) => row.student.full_name || 'Learner').join(', ');
        throw new Error(`Correct the highlighted ${paperName} mark${invalidRows.length === 1 ? '' : 's'} for ${names}${invalidRows.length > 3 ? ` and ${invalidRows.length - 3} more` : ''}. No marks were changed.`);
      }
      if (clearedRows.length > 0) {
        const names = clearedRows.slice(0, 3).map((row) => row.full_name || 'Learner').join(', ');
        throw new Error(`A saved mark was left blank for ${names}${clearedRows.length > 3 ? ` and ${clearedRows.length - 3} more` : ''}. Enter the corrected mark; blank fields do not delete recorded scores.`);
      }
      if (dirtyStudentIds.size === 0) {
        setNoticeTone('success');
        setNotice(`All entered ${paperName} marks are already saved.`);
        return;
      }
      const draftAtSave = { ...hallDraft };
      const examId = await ensureExam();
      const scores = roster
        .filter((student) => dirtyStudentIds.has(student.id))
        .map((student) => ({
          user_id: student.id,
          earned: draftAtSave[student.id],
          expected_version: sessions.find((row) => row.user_id === student.id)?.grading_version ?? null,
        }))
        .filter((row) => String(row.earned ?? '').trim() !== '')
        .map((row) => ({
          user_id: row.user_id,
          earned: Number(row.earned),
          max: hallMax,
          expected_version: row.expected_version,
        }));
      if (scores.length === 0) throw new Error('Enter at least one mark.');
      const outcome: {
        saved: Array<{ user_id: string }>;
        skipped: Array<{ user_id: string; reason?: string }>;
        failed: Array<{ user_id: string; reason?: string }>;
        warnings: string[];
      } = { saved: [], skipped: [], failed: [], warnings: [] };

      for (let offset = 0; offset < scores.length; offset += 80) {
        const batch = scores.slice(offset, offset + 80);
        try {
          const res = await fetch('/api/cbt/sessions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              action: 'record_paper',
              exam_id: examId,
              paper_kind: props.kind,
              paper_max: hallMax,
              scores: batch,
            }),
          });
          const payload = await res.json().catch(() => ({}));
          if (!res.ok) {
            const reason = payload.error || 'This batch could not be saved; retry these learners.';
            outcome.failed.push(...batch.map((row) => ({ user_id: row.user_id, reason })));
            continue;
          }
          outcome.saved.push(...(payload.data?.saved ?? []));
          outcome.skipped.push(...(payload.data?.skipped ?? []));
          outcome.failed.push(...(payload.data?.failed ?? []));
          outcome.warnings.push(...(payload.data?.warnings ?? []));
        } catch {
          outcome.failed.push(...batch.map((row) => ({
            user_id: row.user_id,
            reason: 'The connection was interrupted. This mark was kept on screen; retry it.',
          })));
        }
      }
      const savedCount = outcome.saved.length;
      const skippedCount = outcome.skipped.length;
      const failedCount = outcome.failed.length;
      const warningText = outcome.warnings.join(' ');
      setNoticeTone(failedCount > 0 || skippedCount > 0 || !!warningText ? 'warning' : 'success');
      const nextFeedback: Record<string, RowFeedback> = {};
      for (const row of outcome.saved) nextFeedback[row.user_id] = { tone: 'saved', message: 'Saved' };
      for (const row of outcome.skipped) nextFeedback[row.user_id] = { tone: 'warning', message: row.reason || 'Refresh and review this mark' };
      for (const row of outcome.failed) nextFeedback[row.user_id] = { tone: 'error', message: row.reason || 'Not saved; retry this mark' };
      setRowFeedback(nextFeedback);
      setNotice(failedCount > 0
        ? `${savedCount} marks saved. ${failedCount} could not be saved and ${skippedCount} newer or protected marks were left untouched. ${warningText}`.trim()
        : skippedCount > 0
          ? `${savedCount} marks saved. ${skippedCount} changed elsewhere or belong to an online sitting and were left untouched. ${warningText}`.trim()
          : `${savedCount} ${paperName} marks saved & synced to reports. ${warningText}`.trim());
      const failedIds = new Set<string>(outcome.failed.map((row) => row.user_id));
      await load({
        background: true,
        preserveDraft: draftAtSave,
        preserveStudentIds: failedIds,
      });
    } catch (err: any) {
      setError(err.message || 'Could not save marks');
    } finally {
      setSaving(false);
    }
  };

  // Smart Bulk Paste Scores (handles "Name 18" OR plain column of numbers from Excel)
  const applyPastedScores = () => {
    const lines = pasteRaw.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    if (lines.length === 0) return;

    const allNumbersOnly = lines.every((l) => /^\d+(\.\d+)?$/.test(l));
    const nextDraft = { ...hallDraft };
    let applied = 0;

    if (allNumbersOnly) {
      visibleRoster.forEach((student, idx) => {
        if (idx >= lines.length) return;
        const existing = sessions.find((row) => row.user_id === student.id);
        if (existing && !sessionAllowsPaperOverwrite(existing)) return;
        nextDraft[student.id] = String(Math.round(Number(lines[idx])));
        applied++;
      });
    } else {
      for (const line of lines) {
        const match = line.match(/(\d+(?:\.\d+)?)\s*(?:\/\s*\d+)?\s*$/);
        if (!match) continue;
        const scoreVal = String(Math.round(Number(match[1])));
        const namePart = line.slice(0, match.index).replace(/^\d+[\.\)\-]\s*/, '').replace(/[-:,|\t]+$/, '').trim();
        const tokens = normalizeTokens(namePart);
        if (tokens.length === 0) continue;

        let best: StudentRow | null = null;
        let bestScore = 0;
        for (const student of roster) {
          const sTokens = normalizeTokens(student.full_name || '');
          let hits = 0;
          for (const t of tokens) {
            if (sTokens.some((st) => st === t || st.startsWith(t) || t.startsWith(st))) hits++;
          }
          const sc = hits / Math.max(tokens.length, 1);
          if (hits > 0 && sc > bestScore) {
            bestScore = sc;
            best = student;
          }
        }
        if (best && bestScore >= 0.5) {
          const existing = sessions.find((row) => row.user_id === best!.id);
          if (existing && !sessionAllowsPaperOverwrite(existing)) continue;
          nextDraft[best.id] = scoreVal;
          applied++;
        }
      }
    }

    if (applied === 0) {
      setError('No scores could be matched from that paste. Try "Student Name 18" per line, or a plain column of numbers.');
      return;
    }
    setHallDraft(nextDraft);
    setPasteRaw('');
    setShowPasteBox(false);
    setNoticeTone('success');
    setNotice(`Filled ${applied} ${paperName} score${applied === 1 ? '' : 's'} from paste — review and click Save.`);
  };

  const handlePrintPaper = (mode: 'student' | 'staff') => {
    if (questions.length === 0) {
      setError('Generate the paper first, then print it.');
      return;
    }
    openCbtPrintWindow(buildCbtPrintHtml({
      title: exam?.title || paperName,
      schoolName: schoolName || profile?.school_name || 'RILLCOD TECHNOLOGIES',
      subtitle: [className, courseName || exam?.courses?.title].filter(Boolean).join(' · ') || undefined,
      description: exam?.description?.trim() || undefined,
      durationMinutes: exam?.duration_minutes || 60,
      passingScore: exam?.passing_score ?? 70,
      dateStr: new Date().toLocaleDateString('en-GB', { year: 'numeric', month: 'long', day: 'numeric' }),
      docRef: `${paperName.replace(/\s+/g, '-').toUpperCase()}-${props.classId.slice(0, 8)}`,
      logoUrl: `${window.location.origin}/logo.png`,
      mcqQuestions: questions.filter((q) => isObjectiveQuestion(q)),
      theoryQuestions: questions.filter((q) => isTheoryQuestion(q)),
      mode,
      examTypeLabel: paperName.toUpperCase(),
    }));
  };

  // Executive Branded Single-Paper Mark Sheet PDF
  const handlePrintSheet = () => {
    const rowsHtml = roster.map((student, index) => {
      const m = studentMetrics[student.id];
      const earnedText = m?.earned !== null ? `${m.earned} / ${hallMax}` : '—';
      const pctText = m?.pct !== null ? `${m.pct}%` : '—';
      const gradeCode = m?.waec?.code ?? '—';
      const remark = m?.waec?.label ?? 'Pending';
      const source = m?.isCbt ? 'Online CBT' : m?.earned !== null ? 'Hall Paper' : 'Missing';
      return `<tr>
        <td style="text-align:center;font-weight:700;color:#64748b;">${index + 1}</td>
        <td style="font-weight:700;">${escapeHtml(student.full_name || 'Student')}</td>
        <td style="text-align:right;font-weight:800;">${earnedText}</td>
        <td style="text-align:right;font-weight:700;">${pctText}</td>
        <td style="text-align:center;font-weight:900;">${escapeHtml(gradeCode)}</td>
        <td>${escapeHtml(remark)}</td>
        <td style="text-align:center;font-size:10px;color:#475569;">${source}</td>
      </tr>`;
    }).join('');

    const ok = openOfficialOfficePrintable({
      title: `${paperName} Official Mark Sheet`,
      subtitle: [className, courseName || programName].filter(Boolean).join(' · ') || 'Class Assessment Record',
      docCodePrefix: props.kind === 'examination' ? 'RC-EXAM' : 'RC-TEST',
      orientation: 'portrait',
      schoolName: schoolName || profile?.school_name || 'Partner School',
      metaItems: [
        { label: 'Class', value: className || 'Class' },
        { label: 'Course / Subject', value: courseName || programName || 'Coding & Robotics' },
        { label: 'Assessment', value: `${paperName} (Max ${hallMax})` },
        { label: 'Recorded By', value: profile?.full_name || 'Instructor' },
      ],
      kpis: [
        { label: 'Learners Entered', value: `${analytics.entered} / ${roster.length}`, tone: 'indigo' },
        { label: 'Class Average', value: analytics.avgPct !== null ? `${analytics.avgPct}% (${analytics.avgWaec?.code})` : '—', tone: 'emerald' },
        { label: 'Pass Rate (≥50%)', value: analytics.passRate !== null ? `${analytics.passRate}%` : '—', tone: 'default' },
        { label: 'Distinctions (A1–B3)', value: analytics.distinction, sub: `At-risk: ${analytics.atRisk}`, tone: analytics.atRisk > 0 ? 'amber' : 'emerald' },
      ],
      headers: [
        { label: '#', align: 'center', width: '36px' },
        { label: 'Learner Full Name', align: 'left' },
        { label: `Score / ${hallMax}`, align: 'right', width: '88px' },
        { label: '%', align: 'right', width: '58px' },
        { label: 'Grade', align: 'center', width: '60px' },
        { label: 'Remark', align: 'left', width: '110px' },
        { label: 'Source', align: 'center', width: '78px' },
      ],
      rowsHtml,
    });
    if (!ok) setError('Allow pop-ups to open the printable PDF mark sheet.');
  };

  // Executive Combined 3-Paper Master Broadsheet PDF (1st Test + 2nd Test + Exam + Total + Rank)
  const handlePrintCombinedBroadsheet = () => {
    const f1Max = props.kind === 'first_test' ? hallMax : paperSnapshots.first_test.max;
    const f2Max = props.kind === 'second_test' ? hallMax : paperSnapshots.second_test.max;
    const exMax = props.kind === 'examination' ? hallMax : paperSnapshots.examination.max;

    const ranked = roster.map((s) => {
      const m = studentMetrics[s.id];
      const f1 = props.kind === 'first_test' ? m?.earned : (paperSnapshots.first_test.byStudent[s.id]?.earned ?? null);
      const f2 = props.kind === 'second_test' ? m?.earned : (paperSnapshots.second_test.byStudent[s.id]?.earned ?? null);
      const ex = props.kind === 'examination' ? m?.earned : (paperSnapshots.examination.byStudent[s.id]?.earned ?? null);
      return {
        student: s,
        f1,
        f2,
        ex,
        total: m?.combinedEarned ?? 0,
        max: m?.combinedMax ?? 0,
        pct: m?.combinedPct ?? null,
        waec: m?.combinedWaec ?? null,
      };
    });

    const sortedForRank = [...ranked]
      .filter((r) => r.pct !== null)
      .sort((a, b) => (b.pct ?? -1) - (a.pct ?? -1));
    const rankById = new Map<string, number>();
    sortedForRank.forEach((r, idx) => rankById.set(r.student.id, idx + 1));

    const rowsHtml = ranked.map((r, idx) => {
      const pos = rankById.get(r.student.id);
      return `<tr>
        <td style="text-align:center;color:#64748b;font-weight:700;">${idx + 1}</td>
        <td style="font-weight:700;">${escapeHtml(r.student.full_name || 'Student')}</td>
        <td style="text-align:right;">${r.f1 !== null ? r.f1 : '—'}</td>
        <td style="text-align:right;">${r.f2 !== null ? r.f2 : '—'}</td>
        <td style="text-align:right;">${r.ex !== null ? r.ex : '—'}</td>
        <td style="text-align:right;font-weight:800;">${r.max > 0 ? `${r.total}/${r.max}` : '—'}</td>
        <td style="text-align:right;font-weight:800;">${r.pct !== null ? `${r.pct}%` : '—'}</td>
        <td style="text-align:center;font-weight:900;">${escapeHtml(r.waec?.code ?? '—')}</td>
        <td style="text-align:center;font-weight:700;">${pos ? `#${pos}` : '—'}</td>
      </tr>`;
    }).join('');

    const combinedPcts = ranked.map((r) => r.pct).filter((p): p is number => p !== null);
    const overallAvg = combinedPcts.length ? Math.round(combinedPcts.reduce((a, b) => a + b, 0) / combinedPcts.length) : null;
    const overallPass = combinedPcts.length ? Math.round((combinedPcts.filter((p) => p >= 50).length / combinedPcts.length) * 100) : null;

    const ok = openOfficialOfficePrintable({
      title: 'Combined Assessment Master Broadsheet',
      subtitle: `${[className, courseName || programName].filter(Boolean).join(' · ')} — First Test + Second Test + Examination`,
      docCodePrefix: 'RC-BROADSHEET',
      orientation: 'landscape',
      schoolName: schoolName || profile?.school_name || 'Partner School',
      metaItems: [
        { label: 'Class', value: className || 'Class' },
        { label: 'Course', value: courseName || programName || 'Coding & Robotics' },
        { label: 'Weighting', value: `1st (${f1Max}) + 2nd (${f2Max}) + Exam (${exMax})` },
        { label: 'Prepared By', value: profile?.full_name || 'Instructor' },
      ],
      kpis: [
        { label: 'Class Size', value: roster.length, tone: 'indigo' },
        { label: 'Combined Average', value: overallAvg !== null ? `${overallAvg}% (${getWAECGrade(overallAvg).code})` : '—', tone: 'emerald' },
        { label: 'Combined Pass Rate', value: overallPass !== null ? `${overallPass}%` : '—', tone: 'default' },
        { label: 'Graded Learners', value: combinedPcts.length, tone: 'default' },
      ],
      headers: [
        { label: '#', align: 'center', width: '34px' },
        { label: 'Learner Full Name', align: 'left' },
        { label: `1st Test (/${f1Max})`, align: 'right', width: '84px' },
        { label: `2nd Test (/${f2Max})`, align: 'right', width: '84px' },
        { label: `Exam (/${exMax})`, align: 'right', width: '80px' },
        { label: 'Total', align: 'right', width: '84px' },
        { label: 'Overall %', align: 'right', width: '74px' },
        { label: 'WAEC', align: 'center', width: '58px' },
        { label: 'Rank', align: 'center', width: '56px' },
      ],
      rowsHtml,
    });
    if (!ok) setError('Allow pop-ups to print the combined broadsheet PDF.');
  };

  const updateHallDraft = (studentId: string, value: string) => {
    setHallDraft((currentDraft) => ({ ...currentDraft, [studentId]: value }));
    setRowFeedback((current) => {
      if (!(studentId in current)) return current;
      const next = { ...current };
      delete next[studentId];
      return next;
    });
    setNotice(null);
  };

  const stepMark = (studentId: string, delta: number) => {
    const cur = Number(hallDraft[studentId]);
    const base = Number.isFinite(cur) && String(hallDraft[studentId] ?? '').trim() !== '' ? cur : 0;
    const next = Math.max(0, Math.min(hallMax, base + delta));
    updateHallDraft(studentId, String(next));
  };

  const handleInputKeyDown = (event: KeyboardEvent<HTMLInputElement>, index: number, mode: 'mobile' | 'desktop') => {
    const refMap = mode === 'mobile' ? mobileInputRefs.current : desktopInputRefs.current;
    if (event.key === 'Enter' || event.key === 'ArrowDown') {
      event.preventDefault();
      const nextStudent = visibleRoster[index + 1];
      if (nextStudent) refMap[nextStudent.id]?.focus();
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      const prevStudent = visibleRoster[index - 1];
      if (prevStudent) refMap[prevStudent.id]?.focus();
    }
  };

  const guardNavigation = (event: MouseEvent<HTMLAnchorElement>) => {
    if (!hasUnsavedChanges) return;
    const unsavedCount = dirtyStudentIds.size + clearedRows.length;
    if (!window.confirm(`Leave this ${paperName} sheet? ${unsavedCount} unsaved change${unsavedCount === 1 ? '' : 's'} will be lost.`)) {
      event.preventDefault();
    }
  };

  if (authLoading || loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className={`max-w-6xl mx-auto px-3.5 sm:px-6 py-5 sm:py-6 space-y-5 ${MOBILE_PAGE_BOTTOM}`}>
      <Link href={backHref} onClick={guardNavigation} className="inline-flex items-center gap-2 text-sm font-semibold text-muted-foreground hover:text-foreground">
        <ArrowLeftIcon className="h-4 w-4" />
        {props.from === 'write' ? 'Back to Write' : 'Back to class'}
      </Link>

      {/* Modern Hero Header + Synced 3-Paper Switcher */}
      <header className="rounded-2xl border border-border bg-card p-4 sm:p-6 shadow-sm space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <p className="text-[11px] font-black uppercase tracking-[0.2em] text-primary">
              Official Assessment Hub · Synced Live
            </p>
            <h1 className="mt-1 text-2xl sm:text-3xl font-black tracking-tight text-foreground">{paperName}</h1>
            <p className="mt-1 text-xs sm:text-sm text-muted-foreground">
              {[schoolName, className, courseName || programName].filter(Boolean).join(' · ') || 'This class'} · Only changed rows are saved.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={handlePrintSheet}
              className="inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-border bg-background px-3 text-xs font-black text-foreground hover:border-primary/40"
            >
              <PrinterIcon className="h-4 w-4 text-primary" /> Mark Sheet PDF
            </button>
            <button
              type="button"
              onClick={handlePrintCombinedBroadsheet}
              className="inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-emerald-500/35 bg-emerald-500/10 px-3 text-xs font-black text-emerald-800 dark:text-emerald-300 hover:bg-emerald-500/20"
            >
              <ClipboardDocumentListIcon className="h-4 w-4" /> Broadsheet PDF
            </button>
            <button
              type="button"
              onClick={() => handlePrintPaper('student')}
              className="inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-border bg-background px-3 text-xs font-bold text-muted-foreground hover:text-foreground"
            >
              <PrinterIcon className="h-4 w-4" /> Exam Paper
            </button>
            <Link
              href={generateHref}
              onClick={guardNavigation}
              className="inline-flex min-h-10 items-center gap-1.5 rounded-xl bg-primary px-3.5 text-xs font-black text-primary-foreground hover:opacity-90 shadow-sm"
            >
              <SparklesIcon className="h-4 w-4" />
              {questions.length > 0 ? 'Refresh Paper' : 'Generate Paper'}
            </Link>
          </div>
        </div>

        {/* Synced 3-Paper Tabs (First Test · Second Test · Examination) with live completion counts */}
        <nav aria-label="School paper mark sheets" className="grid grid-cols-3 gap-2">
          {ALL_KINDS.map((kind) => {
            const active = kind === props.kind;
            const snapCount = kind === props.kind
              ? markedCount
              : Object.keys(paperSnapshots[kind]?.byStudent ?? {}).length;
            const complete = roster.length > 0 && snapCount >= roster.length;
            return (
              <Link
                key={kind}
                href={hostPaperDatasheetHref({
                  kind,
                  classId: props.classId,
                  courseId: courseId || props.courseId,
                  programId: programId || props.programId,
                  schoolId: schoolId || props.schoolId,
                  from: props.from,
                })}
                aria-current={active ? 'page' : undefined}
                onClick={guardNavigation}
                className={`flex flex-col sm:flex-row sm:items-center sm:justify-between gap-0.5 sm:gap-2 rounded-xl border px-3 py-2.5 text-left transition-all ${
                  active
                    ? 'border-primary bg-primary text-primary-foreground shadow-sm'
                    : 'border-border bg-background text-foreground hover:border-primary/40'
                }`}
              >
                <span className="text-xs font-black truncate">{hostPaperLabel(kind)}</span>
                <span className={`text-[10px] font-bold tabular-nums ${
                  active
                    ? 'text-primary-foreground/85'
                    : complete
                      ? 'text-emerald-700 dark:text-emerald-300'
                      : 'text-muted-foreground'
                }`}>
                  {snapCount}/{roster.length}{complete ? ' ✓' : ''}
                </span>
              </Link>
            );
          })}
        </nav>
      </header>

      {/* Teacher Monitoring & Performance KPI Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-3">
        <div className="rounded-2xl border border-border bg-card p-3.5 shadow-sm">
          <p className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">Entered Progress</p>
          <p className="mt-1 text-xl font-black text-foreground tabular-nums">
            {analytics.entered}<span className="text-sm font-bold text-muted-foreground">/{roster.length}</span>
          </p>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${roster.length ? Math.round((analytics.entered / roster.length) * 100) : 0}%` }} />
          </div>
        </div>
        <div className="rounded-2xl border border-border bg-card p-3.5 shadow-sm">
          <p className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">Class Average</p>
          <div className="mt-1 flex items-baseline gap-2">
            <p className="text-xl font-black text-foreground tabular-nums">
              {analytics.avgPct !== null ? `${analytics.avgPct}%` : '—'}
            </p>
            {analytics.avgWaec && (
              <span className={`rounded-md border px-1.5 py-0.5 text-[10px] font-black ${waecToneClasses(analytics.avgPct!)}`}>
                {analytics.avgWaec.code}
              </span>
            )}
          </div>
          <p className="mt-1 text-[11px] text-muted-foreground">
            {analytics.highest !== null ? `High ${analytics.highest}/${hallMax} · Low ${analytics.lowest}/${hallMax}` : 'Enter marks to compute'}
          </p>
        </div>
        <div className="rounded-2xl border border-border bg-card p-3.5 shadow-sm">
          <p className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">Pass Rate (≥50%)</p>
          <p className="mt-1 text-xl font-black text-emerald-700 dark:text-emerald-300 tabular-nums">
            {analytics.passRate !== null ? `${analytics.passRate}%` : '—'}
          </p>
          <p className="mt-1 text-[11px] text-muted-foreground">
            {analytics.distinction} Distinction · {analytics.credit} Credit
          </p>
        </div>
        <div className="rounded-2xl border border-border bg-card p-3.5 shadow-sm">
          <p className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">Needs Attention</p>
          <p className={`mt-1 text-xl font-black tabular-nums ${analytics.atRisk > 0 ? 'text-rose-600 dark:text-rose-400' : 'text-foreground'}`}>
            {analytics.atRisk} <span className="text-xs font-bold text-muted-foreground">at-risk</span>
          </p>
          <p className="mt-1 text-[11px] text-muted-foreground">
            {analytics.missing} missing · {analytics.cbtCount} CBT online
          </p>
        </div>
      </div>

      {error ? (
        <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-700 dark:text-rose-300">{error}</div>
      ) : null}
      {notice ? (
        <div className={`rounded-xl border px-4 py-3 text-sm font-medium ${
          noticeTone === 'warning'
            ? 'border-amber-500/30 bg-amber-500/10 text-amber-800 dark:text-amber-300'
            : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-800 dark:text-emerald-300'
        }`}>{notice}</div>
      ) : null}

      {/* Main Mark Entry Sheet */}
      <section className="rounded-2xl border border-border bg-card shadow-sm overflow-hidden">
        <div className="border-b border-border p-4 sm:px-5 space-y-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="font-black flex items-center gap-2 text-foreground">
                <UserGroupIcon className="h-5 w-5 text-primary" />
                {paperName} Score Entry &amp; Sync
              </h2>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Tip: Press <kbd className="rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[10px]">Enter</kbd> or <kbd className="rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[10px]">↓</kbd> to jump smoothly to the next student.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setShowPasteBox((v) => !v)}
                className="inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-primary/35 bg-primary/10 px-3 text-xs font-black text-primary hover:bg-primary/20"
              >
                <ChartBarIcon className="h-4 w-4" />
                {showPasteBox ? 'Close Paste' : 'Bulk Paste Scores'}
              </button>
              <label htmlFor="school-paper-total" className="flex items-center gap-2 text-xs font-bold text-muted-foreground">
                Max
                <input
                  id="school-paper-total"
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={1000}
                  step={1}
                  value={paperOutOf}
                  onChange={(e) => { setPaperOutOf(e.target.value); setNotice(null); }}
                  aria-invalid={!!paperMaxError}
                  aria-describedby={paperMaxError ? 'school-paper-total-error' : undefined}
                  className={`h-10 w-20 rounded-xl border bg-background px-2 text-right text-sm font-black text-foreground ${paperMaxError ? 'border-rose-500' : 'border-border'}`}
                />
              </label>
            </div>
          </div>
          {paperMaxError ? <p id="school-paper-total-error" className="text-xs text-rose-600 dark:text-rose-400">{paperMaxError}</p> : null}

          {/* Smart Bulk Paste Scores Drawer */}
          {showPasteBox && (
            <div className="rounded-xl border border-primary/30 bg-primary/[0.04] p-3.5 space-y-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs font-black text-foreground">
                  Paste Scores from Excel, WhatsApp, or Paper List
                </p>
                <span className="text-[11px] text-muted-foreground">
                  Supports <code>Name 18</code> per line OR a plain column of numbers in roster order
                </span>
              </div>
              <textarea
                rows={4}
                aria-label="Paste scores from Excel or WhatsApp"
                value={pasteRaw}
                onChange={(e) => setPasteRaw(e.target.value)}
                placeholder={`Samuel Agha 18\nAdaeze Okonkwo 15\n(or just paste a column of scores: 18, 15, 19…)`}
                className="w-full rounded-xl border border-border bg-card p-3 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none"
              />
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => { setShowPasteBox(false); setPasteRaw(''); }}
                  className="min-h-9 rounded-xl border border-border bg-card px-3 text-xs font-bold text-muted-foreground"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={!pasteRaw.trim()}
                  onClick={applyPastedScores}
                  className="min-h-9 rounded-xl bg-primary px-4 text-xs font-black text-primary-foreground hover:opacity-90 disabled:opacity-40"
                >
                  Auto-Fill Scores
                </button>
              </div>
            </div>
          )}

          {/* Search + Sort + Performance Segmentation Pills */}
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <label className="relative flex-1">
              <span className="sr-only">Find a learner</span>
              <MagnifyingGlassIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                type="search"
                value={learnerSearch}
                onChange={(event) => setLearnerSearch(event.target.value)}
                placeholder="Find learner by name…"
                className="h-11 w-full rounded-xl border border-border bg-background pl-9 pr-3 text-sm text-foreground outline-none focus:border-primary"
              />
            </label>
            <select
              aria-label="Sort learners on mark sheet"
              value={sortMode}
              onChange={(e) => setSortMode(e.target.value as SortMode)}
              className="h-11 rounded-xl border border-border bg-background px-3 text-xs font-bold text-foreground"
            >
              <option value="name">Sort: Name A–Z</option>
              <option value="missing_first">Sort: Missing First</option>
              <option value="score_desc">Sort: Highest Score</option>
              <option value="score_asc">Sort: Lowest Score</option>
            </select>
          </div>

          {/* Clickable Performance Segmentation Chips */}
          <div className="flex flex-wrap items-center gap-1.5">
            {([
              { id: 'all' as SegmentFilter, label: `All (${roster.length})` },
              { id: 'missing' as SegmentFilter, label: `Missing (${analytics.missing})` },
              { id: 'distinction' as SegmentFilter, label: `Distinction A1–B3 (${analytics.distinction})` },
              { id: 'credit' as SegmentFilter, label: `Credit C4–C6 (${analytics.credit})` },
              { id: 'at_risk' as SegmentFilter, label: `At-Risk <50% (${analytics.atRisk})` },
              ...(analytics.cbtCount > 0 ? [{ id: 'cbt' as SegmentFilter, label: `Online CBT (${analytics.cbtCount})` }] : []),
            ]).map((chip) => (
              <button
                key={chip.id}
                type="button"
                aria-pressed={segment === chip.id}
                onClick={() => setSegment(chip.id)}
                className={`rounded-full border px-3 py-1 text-[11px] font-bold transition-colors ${
                  segment === chip.id
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'border-border bg-background text-muted-foreground hover:text-foreground'
                }`}
              >
                {chip.label}
              </button>
            ))}
          </div>

          {invalidRows.length > 0 || clearedRows.length > 0 ? (
            <div role="alert" className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs leading-5 text-rose-700 dark:text-rose-300">
              {invalidRows.length > 0 ? `${invalidRows.length} mark${invalidRows.length === 1 ? '' : 's'} need correction. ` : ''}
              {clearedRows.length > 0 ? `${clearedRows.length} saved mark${clearedRows.length === 1 ? ' is' : 's are'} blank; type the corrected score instead.` : ''}
              {' '}Nothing will save until these rows are resolved.
            </div>
          ) : null}
        </div>

        {/* Mobile-First Touch Score Entry Cards (with Stepper, 1-Tap Presets, Live WAEC & 3-Paper Sync) */}
        <div className="divide-y divide-border md:hidden">
          {visibleRoster.map((student, index) => {
            const m = studentMetrics[student.id];
            const locked = Boolean(m?.isCbt);
            const current = props.studentId === student.id;
            const inputError = hallMarkDraftError(hallDraft[student.id], paperMaxError ? null : hallMax);
            const cleared = String(baselineDraft[student.id] ?? '').trim() !== '' && String(hallDraft[student.id] ?? '').trim() === '';
            const feedback = rowFeedback[student.id];
            const f1 = props.kind === 'first_test' ? m?.earned : (paperSnapshots.first_test.byStudent[student.id]?.earned ?? null);
            const f2 = props.kind === 'second_test' ? m?.earned : (paperSnapshots.second_test.byStudent[student.id]?.earned ?? null);
            const ex = props.kind === 'examination' ? m?.earned : (paperSnapshots.examination.byStudent[student.id]?.earned ?? null);

            return (
              <div key={student.id} className={`p-4 space-y-2.5 ${current ? 'bg-primary/5' : ''}`}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-black text-foreground break-words">
                      <span className="mr-1.5 text-xs font-bold text-muted-foreground">{index + 1}.</span>
                      {student.full_name || 'Student'}
                    </p>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">
                      1st: <strong>{f1 ?? '—'}</strong> · 2nd: <strong>{f2 ?? '—'}</strong> · Exam: <strong>{ex ?? '—'}</strong>
                      {m?.combinedPct !== null ? ` → Total ${m.combinedPct}% (${m.combinedWaec?.code})` : ''}
                    </p>
                  </div>
                  {m?.waec && m.pct !== null ? (
                    <span className={`shrink-0 rounded-lg border px-2 py-0.5 text-xs font-black tabular-nums ${waecToneClasses(m.pct)}`}>
                      {m.pct}% · {m.waec.code}
                    </span>
                  ) : null}
                </div>

                <div className="flex items-center gap-1.5">
                  {!locked && (
                    <button
                      type="button"
                      aria-label={`Decrease score for ${student.full_name || 'learner'}`}
                      disabled={saving || preparing}
                      onClick={() => stepMark(student.id, -1)}
                      className="h-12 w-11 shrink-0 rounded-xl border border-border bg-background text-lg font-black text-foreground active:bg-muted disabled:opacity-40"
                    >
                      −
                    </button>
                  )}
                  <input
                    ref={(el) => { mobileInputRefs.current[student.id] = el; }}
                    type="number"
                    inputMode="numeric"
                    min={0}
                    max={hallMax}
                    step={1}
                    disabled={locked || saving || preparing}
                    value={hallDraft[student.id] ?? ''}
                    onChange={(event) => updateHallDraft(student.id, event.target.value)}
                    onKeyDown={(e) => handleInputKeyDown(e, index, 'mobile')}
                    aria-label={`${paperName} mark for ${student.full_name || 'this learner'}, out of ${hallMax}`}
                    aria-invalid={!!inputError || cleared}
                    className={`h-12 min-w-0 flex-1 rounded-xl border bg-background px-3 text-center text-lg font-black tabular-nums ${inputError || cleared ? 'border-rose-500' : dirtyStudentIds.has(student.id) ? 'border-primary ring-2 ring-primary/15' : 'border-border'}`}
                  />
                  {!locked && (
                    <button
                      type="button"
                      aria-label={`Increase score for ${student.full_name || 'learner'}`}
                      disabled={saving || preparing}
                      onClick={() => stepMark(student.id, 1)}
                      className="h-12 w-11 shrink-0 rounded-xl border border-border bg-background text-lg font-black text-foreground active:bg-muted disabled:opacity-40"
                    >
                      +
                    </button>
                  )}
                  <span className="w-12 text-right text-xs font-bold text-muted-foreground">/ {hallMax}</span>
                </div>

                {/* 1-Tap Quick Score Presets on Mobile */}
                {!locked && (
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-[10px] font-bold text-muted-foreground">Quick:</span>
                    {quickPresetMarks.map((val) => (
                      <button
                        key={`preset-${student.id}-${val}`}
                        type="button"
                        onClick={() => updateHallDraft(student.id, String(val))}
                        className={`rounded-lg border px-2.5 py-1 text-[11px] font-black transition-colors ${
                          String(hallDraft[student.id] ?? '').trim() === String(val)
                            ? 'border-primary bg-primary text-primary-foreground'
                            : 'border-border bg-background text-foreground hover:border-primary/40'
                        }`}
                      >
                        {val}
                      </button>
                    ))}
                  </div>
                )}

                {locked ? <p className="text-xs text-muted-foreground">Online CBT sitting recorded; review it in CBT grading.</p> : null}
                {inputError || cleared ? <p className="text-xs font-semibold text-rose-600 dark:text-rose-400">{inputError || 'Enter a corrected score; blank does not delete a saved mark.'}</p> : null}
                {feedback ? <p className={`text-xs font-semibold ${feedback.tone === 'saved' ? 'text-emerald-600 dark:text-emerald-400' : feedback.tone === 'warning' ? 'text-amber-700 dark:text-amber-300' : 'text-rose-600 dark:text-rose-400'}`}>{feedback.message}</p> : null}
                {!feedback && dirtyStudentIds.has(student.id) && !inputError ? <p className="text-xs font-semibold text-primary">Unsaved change</p> : null}
              </div>
            );
          })}
          {visibleRoster.length === 0 ? <p className="px-4 py-8 text-sm text-muted-foreground">No learners match this view.</p> : null}
        </div>

        {/* Desktop Fast-Entry Table (with Live WAEC + 3-Paper Sync Column + Keyboard Enter/Arrow Flow) */}
        <div className="hidden overflow-x-auto md:block">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-left text-[11px] font-black uppercase tracking-widest text-muted-foreground">
              <tr>
                <th className="px-4 py-3 w-12">#</th>
                <th className="px-4 py-3">Learner</th>
                <th className="px-4 py-3 w-44 text-right">{paperName} (/{hallMax})</th>
                <th className="px-4 py-3 w-28 text-center">Grade</th>
                <th className="px-4 py-3 w-56">All 3 Papers Sync</th>
                <th className="px-4 py-3 w-36">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {visibleRoster.map((student, index) => {
                const m = studentMetrics[student.id];
                const locked = Boolean(m?.isCbt);
                const current = props.studentId === student.id;
                const inputError = hallMarkDraftError(hallDraft[student.id], paperMaxError ? null : hallMax);
                const cleared = String(baselineDraft[student.id] ?? '').trim() !== '' && String(hallDraft[student.id] ?? '').trim() === '';
                const feedback = rowFeedback[student.id];
                const f1 = props.kind === 'first_test' ? m?.earned : (paperSnapshots.first_test.byStudent[student.id]?.earned ?? null);
                const f2 = props.kind === 'second_test' ? m?.earned : (paperSnapshots.second_test.byStudent[student.id]?.earned ?? null);
                const ex = props.kind === 'examination' ? m?.earned : (paperSnapshots.examination.byStudent[student.id]?.earned ?? null);

                return (
                  <tr key={student.id} className={`transition-colors hover:bg-muted/25 ${current ? 'bg-primary/5' : ''}`}>
                    <td className="px-4 py-3 tabular-nums text-muted-foreground font-semibold">{index + 1}</td>
                    <td className="px-4 py-3 font-bold text-foreground">
                      {student.full_name || 'Student'}
                      {current ? <span className="ml-2 text-[10px] font-black uppercase tracking-widest text-primary">Selected</span> : null}
                      {locked ? <p className="text-[11px] font-normal text-muted-foreground">CBT sitting already recorded</p> : null}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-2">
                        <input
                          ref={(el) => { desktopInputRefs.current[student.id] = el; }}
                          type="number"
                          min={0}
                          max={hallMax}
                          step={1}
                          disabled={locked || saving || preparing}
                          value={hallDraft[student.id] ?? ''}
                          onChange={(e) => updateHallDraft(student.id, e.target.value)}
                          onKeyDown={(e) => handleInputKeyDown(e, index, 'desktop')}
                          aria-label={`${hostPaperLabel(props.kind)} mark for ${student.full_name || 'this learner'}, out of ${hallMax}`}
                          aria-invalid={!!inputError || cleared}
                          className={`h-10 w-24 rounded-xl border bg-background px-2.5 text-right text-sm font-black tabular-nums focus:border-primary focus:outline-none ${inputError || cleared ? 'border-rose-500' : dirtyStudentIds.has(student.id) ? 'border-primary ring-2 ring-primary/15' : 'border-border'}`}
                        />
                        <span className="w-10 text-xs font-semibold text-muted-foreground">/{hallMax}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-center">
                      {m?.waec && m.pct !== null ? (
                        <span className={`inline-flex items-center rounded-lg border px-2 py-0.5 text-xs font-black tabular-nums ${waecToneClasses(m.pct)}`}>
                          {m.pct}% · {m.waec.code}
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground tabular-nums">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span>1st: <strong className="text-foreground">{f1 ?? '—'}</strong></span>
                        <span>·</span>
                        <span>2nd: <strong className="text-foreground">{f2 ?? '—'}</strong></span>
                        <span>·</span>
                        <span>Ex: <strong className="text-foreground">{ex ?? '—'}</strong></span>
                      </div>
                      {m?.combinedPct !== null && (
                        <p className="mt-0.5 text-[11px] font-black text-primary">
                          Combined: {m.combinedEarned}/{m.combinedMax} ({m.combinedPct}% · {m.combinedWaec?.code})
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs">
                      {locked ? <span className="text-muted-foreground font-semibold">Online CBT</span>
                        : inputError || cleared ? <span className="font-semibold text-rose-600 dark:text-rose-400">{inputError || 'Enter corrected mark'}</span>
                          : feedback ? <span className={feedback.tone === 'saved' ? 'font-semibold text-emerald-600 dark:text-emerald-400' : feedback.tone === 'warning' ? 'font-semibold text-amber-700 dark:text-amber-300' : 'font-semibold text-rose-600 dark:text-rose-400'}>{feedback.message}</span>
                            : dirtyStudentIds.has(student.id) ? <span className="font-semibold text-primary">Unsaved</span>
                              : String(hallDraft[student.id] ?? '').trim() !== '' ? <span className="text-emerald-600 dark:text-emerald-400 font-semibold">Saved ✓</span>
                                : <span className="text-muted-foreground">Not entered</span>}
                    </td>
                  </tr>
                );
              })}
              {visibleRoster.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-sm text-muted-foreground">{roster.length === 0 ? 'No learners on this class yet.' : 'No learners match this filter.'}</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>

        {/* Mobile-Safe Sticky Save Bar */}
        <div className="sticky bottom-[calc(var(--app-bottom-nav-height)+0.25rem)] md:bottom-2 z-20 flex flex-col gap-3 border-t border-border bg-card/95 px-4 sm:px-5 py-3.5 shadow-[0_-12px_30px_rgba(0,0,0,0.08)] backdrop-blur sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs leading-5 text-muted-foreground">
            {exam?.id
              ? dirtyStudentIds.size > 0
                ? `${dirtyStudentIds.size} changed ${paperName} mark${dirtyStudentIds.size === 1 ? '' : 's'} ready to save & sync.`
                : `${paperName} is synced live with student reports, parent portal & PDF broadsheets.`
              : `First save creates this ${paperName} sheet without losing what you entered.`}
          </p>
          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={saving || preparing || roster.length === 0 || dirtyStudentIds.size === 0 || invalidRows.length > 0 || clearedRows.length > 0 || !!paperMaxError}
            className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-xl bg-primary px-5 text-xs font-black uppercase tracking-wider text-primary-foreground disabled:opacity-50 shadow-sm"
          >
            {saving || preparing ? 'Saving & Syncing…' : dirtyStudentIds.size > 0 ? `Save ${dirtyStudentIds.size} Mark${dirtyStudentIds.size === 1 ? '' : 's'}` : 'All Changes Saved'}
          </button>
        </div>
      </section>

      {/* Collapsible Question Paper Preview */}
      <details className="rounded-2xl border border-border bg-card shadow-sm overflow-hidden">
        <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-3 px-5 py-4 [&::-webkit-details-marker]:hidden">
          <div>
            <h2 className="font-black text-foreground">View {paperName} Questions</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {questions.length > 0
                ? `${questions.length} question${questions.length === 1 ? '' : 's'} · ${questions.reduce((sum, q) => sum + (Number(q.points) || 0), 0) || hallMax} marks`
                : 'No questions yet. Generate the paper when the taught weeks are ready.'}
            </p>
          </div>
          <span className="shrink-0 text-xs font-black text-primary">Open preview</span>
        </summary>
        {questions.length > 0 ? (
          <ol className="divide-y divide-border border-t border-border">
            {questions.map((question, index) => (
              <li key={question.id || index} className="px-5 py-4">
                <div className="flex gap-3">
                  <span className="w-6 shrink-0 text-sm font-black text-muted-foreground">{index + 1}.</span>
                  <div className="min-w-0 flex-1">
                    <CbtMarkdown text={question.question_text} className="text-sm text-foreground" />
                    {Array.isArray(question.options) && question.options.length > 0 ? (
                      <div className="mt-2 space-y-1">
                        {question.options.map((option: any, optionIndex: number) => (
                          <p key={optionIndex} className="text-sm text-muted-foreground">
                            {String.fromCharCode(65 + optionIndex)}. {typeof option === 'string' ? option : String(option?.text ?? option ?? '')}
                          </p>
                        ))}
                      </div>
                    ) : null}
                    <p className="mt-2 text-xs text-muted-foreground">{question.points || 0} marks</p>
                  </div>
                </div>
              </li>
            ))}
          </ol>
        ) : (
          <div className="border-t border-border px-5 py-4 text-sm text-muted-foreground">
            You do not need generated questions to record hall marks. Use <strong>Generate Paper</strong> above whenever you want a printable exam paper.
          </div>
        )}
      </details>
    </div>
  );
}
