'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import {
  ArrowLeftIcon,
  ArrowPathIcon,
  CheckCircleIcon,
  ClipboardIcon,
  CloudArrowUpIcon,
  CreditCardIcon,
  MagnifyingGlassIcon,
  SparklesIcon,
  UserGroupIcon,
  UserPlusIcon,
  XMarkIcon,
} from '@/lib/icons';
import { useAuth } from '@/contexts/auth-context';
import { bandCoversGrade, canonicalGrade, parseBandLabel, SINGLE_GRADES } from '@/lib/classes/naming';
import { extractDocumentText } from '@/lib/files/extract-document-text';

type TabKey = 'pick' | 'quick' | 'confirm';
type PlacementFilter = 'all' | 'feeder' | 'unassigned' | 'sister' | 'other';
type SortKey = 'name' | 'unassigned' | 'grade' | 'class';
type GradeAction = 'promote' | 'demote' | 'retain';

function extractNameAndGrade(rawLine: string): { cleanName: string; parsedGrade: string | null } {
  const cleaned = rawLine.replace(/^\s*(?:\d+[\.\)\-]\s*|[-*•]\s*)/, '').trim();
  const gradeRe = /(?:\s*[-–—|,(]\s*|\s+)((?:jss|sss|ss|js|basic|primary|pry|grade|kg|nursery|year)\s*\d+[a-z]?)\)?\s*$/i;
  const m = cleaned.match(gradeRe);
  if (!m) return { cleanName: cleaned, parsedGrade: null };
  const candidateGrade = canonicalGrade(m[1]) || m[1].trim().toUpperCase();
  const cleanName = cleaned.slice(0, m.index).replace(/[-–—|,\s]+$/, '').trim();
  return cleanName.length >= 2
    ? { cleanName, parsedGrade: candidateGrade }
    : { cleanName: cleaned, parsedGrade: null };
}

function normalizeNameTokens(raw: string): string[] {
  return raw
    .toLowerCase()
    .replace(/[^a-z\s]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length >= 2);
}

function tokenNearEqual(a: string, b: string): boolean {
  if (a === b) return true;
  if (Math.abs(a.length - b.length) > 1 || Math.min(a.length, b.length) < 4) return false;
  let diffs = 0;
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { i++; j++; continue; }
    diffs++;
    if (diffs > 1) return false;
    if (a.length > b.length) i++;
    else if (b.length > a.length) j++;
    else { i++; j++; }
  }
  return diffs + (a.length - i) + (b.length - j) <= 1;
}

function nameMatchScore(inputRaw: string, candidateRaw: string): number {
  const aTokens = normalizeNameTokens(inputRaw);
  const bTokens = normalizeNameTokens(candidateRaw);
  if (aTokens.length === 0 || bTokens.length === 0) return 0;
  if (aTokens.join(' ') === bTokens.join(' ')) return 100;
  if ([...aTokens].sort().join(' ') === [...bTokens].sort().join(' ')) return 95;
  let matched = 0;
  for (const at of aTokens) {
    if (bTokens.some((bt) => tokenNearEqual(at, bt))) matched++;
  }
  if (matched === aTokens.length && aTokens.length >= 2) return 88;
  if (matched >= 2) return 75;
  if (aTokens.length === 1 && matched === 1 && aTokens[0].length >= 4) return 60;
  return 0;
}

type AvailableStudent = {
  id: string;
  full_name: string;
  email?: string | null;
  grade?: string | null;
  suggested_grade?: string | null;
  section_class?: string | null;
  class_id?: string | null;
  current_class_name?: string | null;
  sister_school_name?: string | null;
  current_teacher_name?: string | null;
  is_feeder_promotion?: boolean;
  requires_transfer_request?: boolean;
  pending_transfer_request_id?: string | null;
};

type SchoolClassSummary = {
  id: string;
  name: string;
  qa_grade_key: string | null;
  teacher_name: string | null;
  student_count: number;
};

type RosterStudent = {
  id: string;
  full_name: string;
  email?: string | null;
  grade?: string | null;
  is_current_term_active?: boolean;
};

export default function ClassEnrollWorkspacePage() {
  const params = useParams();
  const router = useRouter();
  const id = params?.id as string;
  const searchParams = useSearchParams();
  const { profile } = useAuth();
  const isStaff = ['admin', 'teacher', 'school'].includes(profile?.role ?? '');

  const initialTab = (searchParams.get('tab') as TabKey) || 'pick';
  const [tab, setTab] = useState<TabKey>(['pick', 'quick', 'confirm'].includes(initialTab) ? initialTab : 'pick');

  const [cls, setCls] = useState<any>(null);
  const [roster, setRoster] = useState<RosterStudent[]>([]);
  const [available, setAvailable] = useState<AvailableStudent[]>([]);
  const [schoolClasses, setSchoolClasses] = useState<SchoolClassSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  // Pick & Adopt state
  const [search, setSearch] = useState('');
  const [placement, setPlacement] = useState<PlacementFilter>('all');
  const [sortBy, setSortBy] = useState<SortKey>('name');
  const [sourceClassId, setSourceClassId] = useState('');
  const [gradeFilter, setGradeFilter] = useState('');
  const [gradeAction, setGradeAction] = useState<GradeAction>('promote');
  const [targetGradePitch, setTargetGradePitch] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [selectedSuggestionIds, setSelectedSuggestionIds] = useState<Set<string>>(new Set());
  const [lastAdoptBanner, setLastAdoptBanner] = useState<{ text: string; ids: string[] } | null>(null);
  const [undoingAdopt, setUndoingAdopt] = useState(false);
  const [lastSelectedId, setLastSelectedId] = useState<string | null>(null);
  const [perStudentAction, setPerStudentAction] = useState<Record<string, GradeAction>>({});
  const [showAllRows, setShowAllRows] = useState(false);

  // Quick-Add / Paste state + Real-Time Live Verification + AI Smart Parse
  const [quickInput, setQuickInput] = useState('');
  const [quickGrade, setQuickGrade] = useState('');
  const [quickUntickedKeys, setQuickUntickedKeys] = useState<Set<string>>(new Set());
  const [quickChoiceByKey, setQuickChoiceByKey] = useState<Record<string, string>>({}); // studentId or '__create_new__'
  const [aiParsing, setAiParsing] = useState(false);
  const [aiNotes, setAiNotes] = useState<string | null>(null);
  const [aiReasonByKey, setAiReasonByKey] = useState<Record<string, string>>({});
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [quickNotice, setQuickNotice] = useState<{
    summary: string;
    added: Array<{ fullName: string; grade: string | null; mode: string; email?: string; password?: string | null }>;
    ambiguous: Array<{ input: string; candidates: Array<{ id: string; full_name: string; grade: string | null; current_class_name: string | null }> }>;
    errors: Array<{ input: string; error: string }>;
  } | null>(null);

  // Confirm & Promote state
  const [confirmKeepIds, setConfirmKeepIds] = useState<Set<string>>(new Set());
  const [confirmGrades, setConfirmGrades] = useState<Record<string, string>>({});
  const [lastSnapshot, setLastSnapshot] = useState<Array<{ studentId: string; grade: string }> | null>(null);

  const classBand = useMemo(
    () => parseBandLabel(cls?.qa_grade_band || cls?.qa_grade_key || cls?.name?.split('·').pop()?.trim()),
    [cls],
  );

  const defaultEntryGrade = useMemo(() => {
    if (cls?.qa_grade_key && (SINGLE_GRADES as readonly string[]).includes(cls.qa_grade_key)) {
      return cls.qa_grade_key as string;
    }
    if (classBand) return `${classBand.lvl} ${classBand.low}`;
    return '';
  }, [cls, classBand]);

  const buildInitialGrades = useCallback((students: RosterStudent[], fallback: string) => {
    const map: Record<string, string> = {};
    for (const s of students) {
      map[s.id] = canonicalGrade(s.grade) || (s.grade || '').trim() || fallback;
    }
    return map;
  }, []);

  const loadAll = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      // Single-pull DB call: fetches class_info, current roster, eligible school + sister-school students, and school_classes in ONE round-trip
      const availRes = await fetch(`/api/classes/${id}/enroll`, { cache: 'no-store' });
      const availJson = await availRes.json().catch(() => ({}));
      if (!availRes.ok) throw new Error(availJson?.error || 'Could not load class enrollment data');

      let klass = availJson.class_info ?? null;
      let activeRoster: RosterStudent[] = Array.isArray(availJson.roster) ? availJson.roster : [];

      // Graceful fallback only if an older backend response lacks class_info
      if (!klass) {
        const [clsRes, stuRes] = await Promise.all([
          fetch(`/api/classes/${id}`, { cache: 'no-store' }),
          fetch(`/api/classes/${id}/students`, { cache: 'no-store' }),
        ]);
        const [clsJson, stuJson] = await Promise.all([
          clsRes.json().catch(() => ({})),
          stuRes.json().catch(() => ({})),
        ]);
        if (!clsRes.ok) throw new Error(clsJson?.error || 'Class not found');
        klass = clsJson.data;
        activeRoster = (stuJson.students ?? [])
          .filter((s: any) => s.is_current_term_active !== false)
          .sort((a: RosterStudent, b: RosterStudent) => (a.full_name || '').localeCompare(b.full_name || ''));
      }

      setCls(klass);
      setRoster(activeRoster);
      setAvailable(Array.isArray(availJson.students) ? availJson.students : []);
      setSchoolClasses(Array.isArray(availJson.school_classes) ? availJson.school_classes : []);

      const fallback = (klass?.qa_grade_key && (SINGLE_GRADES as readonly string[]).includes(klass.qa_grade_key))
        ? klass.qa_grade_key
        : (() => {
          const b = parseBandLabel(klass?.qa_grade_band || klass?.name?.split('·').pop()?.trim());
          return b ? `${b.lvl} ${b.low}` : '';
        })();
      setConfirmKeepIds(new Set(activeRoster.map((s) => s.id)));
      setConfirmGrades(buildInitialGrades(activeRoster, fallback));
      setQuickGrade((prev) => prev || fallback);
    } catch (e: any) {
      toast.error(e?.message || 'Could not load class enrollment data');
    } finally {
      setLoading(false);
    }
  }, [id, buildInitialGrades]);

  useEffect(() => {
    if (isStaff) void loadAll();
  }, [isStaff, loadAll]);

  // Derived stats
  const seatsLeft = cls?.max_students ? Math.max(0, cls.max_students - roster.length) : Infinity;
  const feederStudents = useMemo(() => available.filter((s) => s.is_feeder_promotion), [available]);
  const sisterStudents = useMemo(() => available.filter((s) => Boolean(s.sister_school_name)), [available]);
  const unassignedCount = useMemo(() => available.filter((s) => !s.class_id).length, [available]);
  const otherCount = useMemo(() => available.filter((s) => Boolean(s.class_id)).length, [available]);
  const distinctGrades = useMemo(
    () => Array.from(new Set(available.map((s) => s.grade || s.section_class).filter(Boolean) as string[])).sort(),
    [available],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const multiTerms = q.includes(',') || q.includes('\n') || q.includes(';')
      ? q.split(/[\n,;]+/).map((t) => t.trim()).filter((t) => t.length >= 2)
      : [];
    const list = available.filter((s) => {
      if (placement === 'feeder' && !s.is_feeder_promotion) return false;
      if (placement === 'unassigned' && s.class_id) return false;
      if (placement === 'sister' && !s.sister_school_name) return false;
      if (placement === 'other' && !s.class_id) return false;
      if (sourceClassId && s.class_id !== sourceClassId) return false;
      if (gradeFilter && (s.grade || s.section_class || '') !== gradeFilter) return false;
      if (!q) return true;
      const haystack = [s.full_name, s.email, s.grade, s.section_class, s.current_class_name, s.sister_school_name]
        .map((v) => String(v || '').toLowerCase())
        .join(' ');
      if (multiTerms.length > 0) {
        return multiTerms.some((term) => haystack.includes(term) || nameMatchScore(term, s.full_name || '') >= 60);
      }
      return haystack.includes(q) || nameMatchScore(q, s.full_name || '') >= 60;
    });
    return [...list].sort((a, b) => {
      if (sortBy === 'unassigned') {
        const aUn = a.class_id ? 1 : 0;
        const bUn = b.class_id ? 1 : 0;
        if (aUn !== bUn) return aUn - bUn;
      } else if (sortBy === 'grade') {
        const gCmp = String(a.grade || a.section_class || 'zzz').localeCompare(String(b.grade || b.section_class || 'zzz'));
        if (gCmp !== 0) return gCmp;
      } else if (sortBy === 'class') {
        const cCmp = String(a.current_class_name || 'zzz').localeCompare(String(b.current_class_name || 'zzz'));
        if (cCmp !== 0) return cCmp;
      }
      return String(a.full_name || '').localeCompare(String(b.full_name || ''));
    });
  }, [available, search, placement, sourceClassId, gradeFilter, sortBy]);

  // Real-time intelligent name matching for Quick-Add / Paste (newline or comma-separated)
  const liveQuickRows = useMemo(() => {
    const rawParts = quickInput
      .split(/[\n,;]+/)
      .map((p) => p.replace(/^\s*(?:\d+[\.\)\-]\s*|[-*•]\s*)/, '').trim())
      .filter((p) => p.length >= 2);
    const seen = new Set<string>();
    const uniqueLines: string[] = [];
    for (const line of rawParts) {
      const k = line.toLowerCase();
      if (!seen.has(k)) {
        seen.add(k);
        uniqueLines.push(line);
      }
    }

    return uniqueLines.map((rawLine) => {
      const key = rawLine.toLowerCase();
      const { cleanName, parsedGrade } = extractNameAndGrade(rawLine);
      const inRoster = roster.find((r) => nameMatchScore(cleanName, r.full_name || '') >= 88);
      if (inRoster) {
        return {
          key,
          rawLine,
          cleanName,
          parsedGrade,
          status: 'already_in_class' as const,
          matchedRoster: inRoster,
          candidates: [] as AvailableStudent[],
          chosenId: null as string | null,
          ticked: false,
        };
      }

      const scored = available
        .map((s) => ({ student: s, score: nameMatchScore(cleanName, s.full_name || '') }))
        .filter((x) => x.score >= 55)
        .sort((a, b) => b.score - a.score)
        .slice(0, 25);

      const override = quickChoiceByKey[key];
      const top = scored[0];
      const isSingleClear = scored.length === 1 || (top && top.score >= 95 && (!scored[1] || scored[1].score < 90));

      let status: 'adopt' | 'ambiguous' | 'create_new';
      let chosenId: string | null = null;

      if (override === '__create_new__') {
        status = 'create_new';
      } else if (override) {
        status = 'adopt';
        chosenId = override;
      } else if (isSingleClear && top) {
        status = 'adopt';
        chosenId = top.student.id;
      } else if (scored.length > 0) {
        status = 'ambiguous';
      } else {
        status = 'create_new';
      }

      const ticked = !quickUntickedKeys.has(key) && status !== 'ambiguous';
      return {
        key,
        rawLine,
        cleanName,
        parsedGrade,
        status,
        matchedRoster: null,
        candidates: scored.map((x) => x.student),
        chosenId,
        ticked,
      };
    });
  }, [quickInput, roster, available, quickChoiceByKey, quickUntickedKeys]);

  // Active typed fragment (last line / comma-separated piece) for unlimited inline system suggestions
  const activeTypedFragment = useMemo(() => {
    const parts = quickInput.split(/[\n,;]/);
    const last = (parts[parts.length - 1] || '').replace(/^\s*(?:\d+[\.\)\-]\s*|[-*•]\s*)/, '').trim();
    const { cleanName } = extractNameAndGrade(last);
    return cleanName;
  }, [quickInput]);

  // Unlimited inline system suggestions: surfaces EVERY matching record in the school system as you type
  const inlineSystemSuggestions = useMemo(() => {
    const q = activeTypedFragment.trim().toLowerCase();
    if (q.length < 2) return [];
    const tokens = q.split(/\s+/).filter((t) => t.length >= 2);
    const results: Array<{
      id: string;
      full_name: string;
      email?: string | null;
      grade?: string | null;
      current_class_name?: string | null;
      inThisClass: boolean;
      locked: boolean;
      score: number;
    }> = [];

    for (const r of roster) {
      const name = (r.full_name || '').toLowerCase();
      const email = (r.email || '').toLowerCase();
      const score = name.startsWith(q)
        ? 110
        : name.includes(q)
          ? 100
          : tokens.length > 0 && tokens.every((t) => name.includes(t) || email.includes(t))
            ? 92
            : nameMatchScore(q, r.full_name || '');
      if (score >= 55) {
        results.push({
          id: r.id,
          full_name: r.full_name,
          email: r.email,
          grade: r.grade,
          current_class_name: cls?.name || 'This class',
          inThisClass: true,
          locked: false,
          score,
        });
      }
    }

    for (const s of available) {
      const name = (s.full_name || '').toLowerCase();
      const blob = [s.full_name, s.email, s.grade, s.section_class, s.current_class_name]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      const score = name.startsWith(q)
        ? 115
        : name.includes(q)
          ? 102
          : tokens.length > 0 && tokens.every((t) => blob.includes(t))
            ? 94
            : nameMatchScore(q, s.full_name || '');
      if (score >= 55) {
        results.push({
          id: s.id,
          full_name: s.full_name,
          email: s.email,
          grade: s.grade || s.section_class,
          current_class_name: s.current_class_name,
          inThisClass: false,
          locked: Boolean(s.requires_transfer_request),
          score: score + (!s.class_id ? 3 : 0),
        });
      }
    }

    return results.sort((a, b) => {
      if (a.inThisClass !== b.inThisClass) return a.inThisClass ? 1 : -1;
      if (b.score !== a.score) return b.score - a.score;
      return a.full_name.localeCompare(b.full_name);
    });
  }, [activeTypedFragment, available, roster, cls?.name]);

  const pickInlineSuggestion = (student: { id: string; full_name: string }) => {
    const trimmed = quickInput;
    const lastSepIdx = Math.max(trimmed.lastIndexOf('\n'), trimmed.lastIndexOf(','), trimmed.lastIndexOf(';'));
    const prefix = lastSepIdx >= 0 ? trimmed.slice(0, lastSepIdx + 1) : '';
    const sep = lastSepIdx >= 0 && trimmed[lastSepIdx] === '\n' ? '\n' : prefix ? ' ' : '';
    const nextText = `${prefix}${sep}${student.full_name}\n`;
    setQuickInput(nextText);
    setQuickChoiceByKey((prev) => ({ ...prev, [student.full_name.toLowerCase()]: student.id }));
    setQuickUntickedKeys((prev) => {
      const n = new Set(prev);
      n.delete(student.full_name.toLowerCase());
      return n;
    });
  };

  const runAiSmartParse = async (overrideText?: string) => {
    const sourceText = (overrideText ?? quickInput).trim();
    if (sourceText.length < 2) {
      toast.error('Type, paste, or upload a student list first.');
      return;
    }
    setAiParsing(true);
    setAiNotes(null);
    try {
      const res = await fetch(`/api/classes/${id}/enroll/ai-parse`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rawText: sourceText,
          className: cls?.name || '',
          defaultGrade: quickGrade || defaultEntryGrade || '',
          availableStudents: available.map((s) => ({
            id: s.id,
            full_name: s.full_name,
            grade: s.grade || s.section_class || null,
            current_class_name: s.current_class_name || null,
          })),
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || 'AI parsing failed');
      const rows: Array<{
        extractedName: string;
        grade: string | null;
        matchedStudentId: string | null;
        confidence: string;
        reason: string | null;
      }> = Array.isArray(json.students) ? json.students : [];

      if (rows.length === 0) {
        toast.error('AI could not find any student names in that text.');
        return;
      }

      const nextLines: string[] = [];
      const nextChoices: Record<string, string> = {};
      const nextReasons: Record<string, string> = {};
      let matchedCount = 0;

      for (const r of rows) {
        const line = r.grade ? `${r.extractedName} — ${r.grade}` : r.extractedName;
        const key = line.toLowerCase();
        nextLines.push(line);
        if (r.matchedStudentId) {
          nextChoices[key] = r.matchedStudentId;
          matchedCount++;
        }
        if (r.reason) nextReasons[key] = r.reason;
      }

      setQuickInput(nextLines.join('\n'));
      setQuickChoiceByKey((prev) => ({ ...prev, ...nextChoices }));
      setAiReasonByKey((prev) => ({ ...prev, ...nextReasons }));
      setQuickUntickedKeys(new Set());
      setAiNotes(json.notes || `AI extracted ${rows.length} student${rows.length === 1 ? '' : 's'} & matched ${matchedCount} existing record${matchedCount === 1 ? '' : 's'}.`);
      if (rows.length > 1) setTab('quick');
      toast.success(`AI extracted ${rows.length} student${rows.length === 1 ? '' : 's'} (${matchedCount} matched in system)`);
    } catch (e: any) {
      toast.error(e?.message || 'AI parse failed — live local matching is still active.');
    } finally {
      setAiParsing(false);
    }
  };

  const handleClassListFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setAiParsing(true);
    try {
      const { text } = await extractDocumentText(file, 18_000);
      if (!text.trim()) {
        toast.error(`Could not extract readable text from ${file.name}.`);
        return;
      }
      setQuickInput(text);
      await runAiSmartParse(text);
    } catch (err: any) {
      toast.error(err?.message || `Failed to read ${file.name}`);
      setAiParsing(false);
    }
  };

  const applyVerifiedQuickRows = async () => {
    const adoptIds: string[] = [];
    const createLines: string[] = [];
    for (const row of liveQuickRows) {
      if (!row.ticked) continue;
      if (row.status === 'adopt' && row.chosenId) {
        if (!adoptIds.includes(row.chosenId)) adoptIds.push(row.chosenId);
      } else if (row.status === 'create_new') {
        createLines.push(row.rawLine);
      }
    }
    if (adoptIds.length === 0 && createLines.length === 0) {
      toast.error('Tick at least one student (or pick a match for ambiguous names) to continue.');
      return;
    }

    setBusy('quick');
    setQuickNotice(null);
    const addedSummary: Array<{ fullName: string; grade: string | null; mode: string; email?: string; password?: string | null }> = [];
    const errors: Array<{ input: string; error: string }> = [];

    try {
      if (adoptIds.length > 0) {
        const res = await fetch(`/api/classes/${id}/enroll`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            studentIds: adoptIds,
            promoteToClassGrade: gradeAction !== 'retain',
            gradeAction,
            targetGrade: quickGrade || targetGradePitch || undefined,
          }),
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(json?.error || 'Could not adopt matched students');
        for (const sid of adoptIds) {
          const st = available.find((a) => a.id === sid);
          if (st) {
            addedSummary.push({
              fullName: st.full_name,
              grade: quickGrade || st.suggested_grade || st.grade || defaultEntryGrade || null,
              mode: 'adopted',
              email: st.email || undefined,
            });
          }
        }
      }

      if (createLines.length > 0) {
        const res = await fetch(`/api/classes/${id}/enroll`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            quickAddNames: createLines.join('\n'),
            defaultGrade: quickGrade || defaultEntryGrade || undefined,
          }),
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(json?.error || 'Could not create new students');
        if (Array.isArray(json.quickAdded)) addedSummary.push(...json.quickAdded);
        if (Array.isArray(json.quickErrors)) errors.push(...json.quickErrors);
      }

      setQuickNotice({
        summary: `Done! Adopted ${adoptIds.length} existing & created ${Math.max(0, addedSummary.length - adoptIds.length)} new student${addedSummary.length === 1 ? '' : 's'} into ${cls?.name || 'this class'}.`,
        added: addedSummary,
        ambiguous: [],
        errors,
      });
      toast.success(`Synced ${addedSummary.length} student${addedSummary.length === 1 ? '' : 's'} into ${cls?.name || 'class'}`);
      setQuickInput('');
      setQuickUntickedKeys(new Set());
      setQuickChoiceByKey({});
      await loadAll();
    } catch (e: any) {
      toast.error(e?.message || 'Could not apply verified students');
    } finally {
      setBusy(null);
    }
  };

  const enrollableFiltered = useMemo(() => filtered.filter((s) => !s.requires_transfer_request), [filtered]);
  const allFilteredSelected = enrollableFiltered.length > 0 && enrollableFiltered.every((s) => selectedIds.has(s.id));
  const visibleRows = showAllRows ? filtered : filtered.slice(0, 60);

  const toggleSelect = (sid: string, shiftKey = false) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (shiftKey && lastSelectedId) {
        const ids = visibleRows.filter((r) => !r.requires_transfer_request).map((r) => r.id);
        const a = ids.indexOf(lastSelectedId);
        const b = ids.indexOf(sid);
        if (a >= 0 && b >= 0) {
          const [lo, hi] = a <= b ? [a, b] : [b, a];
          for (let i = lo; i <= hi; i++) {
            if (next.size >= seatsLeft) break;
            next.add(ids[i]);
          }
          return next;
        }
      }
      if (next.has(sid)) next.delete(sid);
      else if (next.size < seatsLeft) next.add(sid);
      else toast.error(`Class capacity reached (${cls?.max_students} max).`);
      return next;
    });
    setLastSelectedId(sid);
  };

  const toggleAllFiltered = () => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allFilteredSelected) {
        enrollableFiltered.forEach((s) => next.delete(s.id));
      } else {
        for (const s of enrollableFiltered) {
          if (next.size >= seatsLeft) break;
          next.add(s.id);
        }
      }
      return next;
    });
  };

  // Actions
  const adoptOne = async (studentId: string, overrideAction?: GradeAction, overrideGrade?: string) => {
    setBusy(studentId);
    try {
      const act = overrideAction ?? perStudentAction[studentId] ?? gradeAction;
      const res = await fetch(`/api/classes/${id}/enroll`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          studentId,
          promoteToClassGrade: act !== 'retain',
          gradeAction: act,
          targetGrade: (overrideGrade ?? targetGradePitch) || undefined,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || 'Could not adopt student');
      toast.success('Student adopted into class');
      setSelectedIds((prev) => { const n = new Set(prev); n.delete(studentId); return n; });
      await loadAll();
    } catch (e: any) {
      toast.error(e?.message || 'Could not adopt student');
    } finally {
      setBusy(null);
    }
  };

  const adoptSelected = async (idsOverride?: string[], actionOverride?: GradeAction) => {
    const ids = idsOverride ?? Array.from(selectedIds);
    if (!ids.length) return;
    setBusy('bulk');
    try {
      const act = actionOverride ?? gradeAction;
      const res = await fetch(`/api/classes/${id}/enroll`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          studentIds: ids,
          promoteToClassGrade: act !== 'retain',
          gradeAction: act,
          targetGrade: targetGradePitch || undefined,
          studentActions: perStudentAction,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || 'Could not enrol selected students');
      const enrolledIds: string[] = Array.isArray(json.enrolledIds) && json.enrolledIds.length > 0 ? json.enrolledIds : ids;
      const msg = `Adopted ${json.enrolled ?? enrolledIds.length} student${(json.enrolled ?? enrolledIds.length) === 1 ? '' : 's'} into ${cls?.name || 'class'}.`;
      toast.success(msg);
      setLastAdoptBanner({ text: msg, ids: enrolledIds });
      setSelectedIds(new Set());
      await loadAll();
    } catch (e: any) {
      toast.error(e?.message || 'Batch enrollment failed');
    } finally {
      setBusy(null);
    }
  };

  const undoLastAdopt = async () => {
    if (!lastAdoptBanner?.ids?.length) return;
    setUndoingAdopt(true);
    try {
      const res = await fetch(`/api/classes/${id}/enroll`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ studentIds: lastAdoptBanner.ids }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || 'Could not undo enrollment');
      toast.success(`Removed ${lastAdoptBanner.ids.length} student${lastAdoptBanner.ids.length === 1 ? '' : 's'} from ${cls?.name || 'class'}.`);
      setLastAdoptBanner(null);
      await loadAll();
    } catch (e: any) {
      toast.error(e?.message || 'Could not undo enrollment');
    } finally {
      setUndoingAdopt(false);
    }
  };

  const stepGrade = (current: string | null | undefined, dir: 1 | -1): string => {
    const canon = canonicalGrade(current) ?? (current || '').trim();
    if (!canon) return defaultEntryGrade;
    const idx = (SINGLE_GRADES as readonly string[]).indexOf(canon);
    if (idx < 0) return canon;
    const nextIdx = idx + dir;
    return nextIdx >= 0 && nextIdx < SINGLE_GRADES.length ? SINGLE_GRADES[nextIdx] : canon;
  };

  const applyBulkStep = (dir: 1 | -1) => {
    setConfirmGrades((prev) => {
      const next = { ...prev };
      for (const s of roster) {
        if (!confirmKeepIds.has(s.id)) continue;
        next[s.id] = stepGrade(next[s.id] || s.grade, dir);
      }
      return next;
    });
  };

  const saveConfirmRoster = async () => {
    setBusy('confirm');
    try {
      const updates: Array<{ studentId: string; grade: string }> = [];
      const prevSnap: Array<{ studentId: string; grade: string }> = [];
      const withdrawStudentIds: string[] = [];

      for (const s of roster) {
        if (confirmKeepIds.has(s.id)) {
          const targetG = (confirmGrades[s.id] || s.grade || '').trim();
          const prevG = (canonicalGrade(s.grade) || s.grade || '').trim();
          if (targetG) {
            updates.push({ studentId: s.id, grade: targetG });
            if (prevG && prevG !== targetG) prevSnap.push({ studentId: s.id, grade: prevG });
          }
        } else {
          withdrawStudentIds.push(s.id);
        }
      }

      const res = await fetch(`/api/classes/${id}/enroll`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ updates, withdrawStudentIds }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || 'Could not save roster grades');
      if (prevSnap.length > 0) setLastSnapshot(prevSnap);
      toast.success(`Saved: ${json.updatedCount ?? 0} confirmed${json.withdrawnCount ? ` · ${json.withdrawnCount} withdrawn` : ''}`);
      await loadAll();
    } catch (e: any) {
      toast.error(e?.message || 'Could not save grades');
    } finally {
      setBusy(null);
    }
  };

  const undoLastSave = async () => {
    if (!lastSnapshot?.length) return;
    setBusy('confirm');
    try {
      const res = await fetch(`/api/classes/${id}/enroll`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ updates: lastSnapshot }),
      });
      if (!res.ok) throw new Error('Could not undo last save');
      toast.success(`Reverted ${lastSnapshot.length} student grade${lastSnapshot.length === 1 ? '' : 's'}`);
      setLastSnapshot(null);
      await loadAll();
    } catch (e: any) {
      toast.error(e?.message || 'Undo failed');
    } finally {
      setBusy(null);
    }
  };

  if (!isStaff) {
    return <div className="p-6 text-sm text-muted-foreground">Only staff can manage class enrollment.</div>;
  }

  return (
    <div className="mx-auto w-full max-w-6xl space-y-5 px-3 py-4 pb-32 sm:px-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <Link
            href={`/dashboard/classes/${id}?operation=roster`}
            className="inline-flex items-center gap-1 text-xs font-bold text-muted-foreground hover:text-foreground"
          >
            <ArrowLeftIcon className="h-3.5 w-3.5" /> Back to {cls?.name || 'Class'}
          </Link>
          <h1 className="flex items-center gap-2 text-xl font-black tracking-tight text-foreground sm:text-2xl">
            <UserPlusIcon className="h-6 w-6 text-primary shrink-0" />
            Add, Adopt &amp; Promote Students
          </h1>
          <p className="text-xs sm:text-sm text-muted-foreground">
            {cls?.name || 'Class'}
            {cls?.schools?.name ? ` · ${cls.schools.name}` : ''}
            {` · ${roster.length} active`}
            {cls?.max_students ? ` / ${cls.max_students} seats` : ''}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {schoolClasses.length > 0 && (
            <select
              aria-label="Switch to another class enrollment workspace"
              value=""
              onChange={(e) => {
                if (e.target.value) router.push(`/dashboard/classes/${e.target.value}/enroll`);
              }}
              className="min-h-10 rounded-xl border border-border bg-card px-3 text-xs font-bold text-foreground hover:border-primary/40"
            >
              <option value="">Switch class…</option>
              {schoolClasses.map((sc) => (
                <option key={`jump-${sc.id}`} value={sc.id}>
                  {sc.name} ({sc.student_count})
                </option>
              ))}
            </select>
          )}
          <button
            type="button"
            onClick={() => void loadAll()}
            disabled={loading}
            className="inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-border bg-card px-3 text-xs font-bold text-foreground hover:bg-muted disabled:opacity-50"
          >
            <ArrowPathIcon className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </button>
          <Link
            href={`/dashboard/classes/${id}/cards`}
            className="inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-primary/35 bg-primary/10 px-3.5 text-xs font-black text-primary hover:bg-primary/20"
          >
            <CreditCardIcon className="h-4 w-4" /> Login PDF &amp; ID Cards
          </Link>
        </div>
      </div>

      {/* Mode Switcher */}
      <div className="grid grid-cols-3 gap-1.5 rounded-2xl border border-border bg-card p-1.5 shadow-sm">
        {([
          { id: 'pick' as TabKey, label: `Pick & Adopt (${available.length})`, short: 'Pick & Adopt' },
          { id: 'quick' as TabKey, label: 'Quick-Add / Paste', short: 'Quick-Add' },
          { id: 'confirm' as TabKey, label: `Promote Roster (${roster.length})`, short: 'Promote' },
        ]).map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`min-h-11 rounded-xl px-2.5 py-2 text-xs font-black transition-all ${tab === t.id
              ? 'bg-primary text-primary-foreground shadow-sm'
              : 'text-muted-foreground hover:bg-muted hover:text-foreground'
              }`}
          >
            <span className="hidden sm:inline">{t.label}</span>
            <span className="sm:hidden">{t.short}</span>
          </button>
        ))}
      </div>

      {/* Hidden file input for AI Class List upload (PDF/Word/PPTX/CSV/TXT) — always mounted across tabs */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf,.docx,.doc,.pptx,.ppt,.csv,.txt"
        onChange={(e) => void handleClassListFileUpload(e)}
        className="hidden"
        aria-label="Upload class list file for AI extraction"
      />

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-24 animate-pulse rounded-2xl border border-border bg-muted/40" />
          ))}
        </div>
      ) : tab === 'pick' ? (
        <div className="space-y-4">
          {lastAdoptBanner && (
            <div
              role="status"
              className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-emerald-500/35 bg-emerald-500/10 px-4 py-2.5 text-xs font-bold text-emerald-900 dark:text-emerald-200"
            >
              <span>✓ {lastAdoptBanner.text}</span>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  disabled={undoingAdopt}
                  onClick={() => void undoLastAdopt()}
                  className="rounded-lg border border-rose-500/35 bg-rose-500/10 hover:bg-rose-500/20 px-2.5 py-1 text-[10px] font-black uppercase text-rose-700 dark:text-rose-300 transition-colors disabled:opacity-50"
                >
                  {undoingAdopt ? 'Removing…' : `Undo / Remove (${lastAdoptBanner.ids.length})`}
                </button>
                <button
                  type="button"
                  onClick={() => setLastAdoptBanner(null)}
                  aria-label="Dismiss adoption banner"
                  className="opacity-70 hover:opacity-100"
                >
                  <XMarkIcon className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}
          {/* Always-visible Inline Quick-Add / Auto-Adopt Bar + Live System Suggestions + AI */}
          <div className="rounded-2xl border border-primary/25 bg-primary/[0.04] p-3.5 space-y-2.5 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs font-black text-foreground flex items-center gap-1.5">
                <SparklesIcon className="h-4 w-4 text-primary" />
                Smart Inline Add, Adopt &amp; AI Match
              </p>
              <div className="flex flex-wrap items-center gap-1.5">
                <button
                  type="button"
                  disabled={aiParsing}
                  onClick={() => fileInputRef.current?.click()}
                  className="inline-flex items-center gap-1 rounded-lg border border-border bg-card px-2.5 py-1 text-[11px] font-bold text-foreground hover:bg-muted disabled:opacity-50"
                >
                  <CloudArrowUpIcon className="h-3.5 w-3.5 text-primary" />
                  Upload List (PDF/Word/CSV)
                </button>
                <button
                  type="button"
                  disabled={aiParsing || !quickInput.trim()}
                  onClick={() => void runAiSmartParse()}
                  className="inline-flex items-center gap-1 rounded-lg border border-primary/40 bg-primary/10 px-2.5 py-1 text-[11px] font-black text-primary hover:bg-primary/20 disabled:opacity-40"
                >
                  {aiParsing ? <ArrowPathIcon className="h-3.5 w-3.5 animate-spin" /> : <SparklesIcon className="h-3.5 w-3.5" />}
                  {aiParsing ? 'AI Extracting…' : 'AI Clean & Match'}
                </button>
              </div>
            </div>
            <div className="flex flex-col sm:flex-row gap-2">
              <input
                type="text"
                aria-label="Quick-add student name inline"
                value={quickInput}
                onChange={(e) => setQuickInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && quickInput.trim() && busy !== 'quick') {
                    e.preventDefault();
                    void applyVerifiedQuickRows();
                  }
                }}
                placeholder="Type any name (e.g. Samuel, Ada, Okonkwo) or paste a messy WhatsApp list…"
                className="min-h-11 flex-1 rounded-xl border border-border bg-card px-3.5 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none"
              />
              <select
                aria-label="Grade for inline quick-add"
                value={quickGrade}
                onChange={(e) => setQuickGrade(e.target.value)}
                className="min-h-11 rounded-xl border border-border bg-card px-3 text-xs font-bold text-foreground"
              >
                <option value="">Auto ({defaultEntryGrade || 'Class'})</option>
                {SINGLE_GRADES.map((g) => (
                  <option key={`inline-g-${g}`} value={g}>{g}</option>
                ))}
              </select>
              <button
                type="button"
                disabled={busy === 'quick' || !quickInput.trim()}
                onClick={() => void applyVerifiedQuickRows()}
                className="min-h-11 shrink-0 rounded-xl bg-primary px-4 text-xs font-black text-primary-foreground hover:opacity-90 disabled:opacity-40 shadow-sm"
              >
                {busy === 'quick'
                  ? 'Applying…'
                  : liveQuickRows.length > 0
                    ? `Apply ${liveQuickRows.filter((r) => r.ticked).length} Verified`
                    : '+ Add / Adopt'}
              </button>
            </div>

            {/* Persistent Multi-Search Selection Basket (remembers ticked students even after you clear search!) */}
            {selectedSuggestionIds.size > 0 && (() => {
              const basket = available.filter((s) => selectedSuggestionIds.has(s.id));
              return (
                <div className="rounded-xl border border-emerald-500/40 bg-emerald-500/[0.07] p-3 space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-[11px] font-black text-emerald-900 dark:text-emerald-200">
                      ✓ {selectedSuggestionIds.size} Student{selectedSuggestionIds.size === 1 ? '' : 's'} Selected Across Searches
                    </span>
                    <button
                      type="button"
                      onClick={() => setSelectedSuggestionIds(new Set())}
                      className="text-[10px] font-bold text-muted-foreground hover:text-foreground underline"
                    >
                      Clear All
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-1.5 max-h-20 overflow-y-auto">
                    {basket.map((s) => (
                      <span
                        key={`sug-basket-${s.id}`}
                        className="inline-flex items-center gap-1 rounded-full border border-emerald-500/35 bg-card px-2 py-0.5 text-[10px] font-bold text-foreground"
                      >
                        <span>{s.full_name}</span>
                        <button
                          type="button"
                          aria-label={`Remove ${s.full_name}`}
                          onClick={() =>
                            setSelectedSuggestionIds((prev) => {
                              const next = new Set(prev);
                              next.delete(s.id);
                              return next;
                            })
                          }
                          className="text-rose-600 dark:text-rose-400 hover:opacity-80"
                        >
                          ×
                        </button>
                      </span>
                    ))}
                  </div>
                  <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-emerald-500/20">
                    <select
                      aria-label="Target grade for selected students"
                      value={targetGradePitch}
                      onChange={(e) => setTargetGradePitch(e.target.value)}
                      className="h-8 rounded-lg border border-primary/35 bg-card px-2.5 text-[11px] font-bold text-primary focus:border-primary focus:outline-none"
                    >
                      <option value="">Grade: Auto ({defaultEntryGrade || 'Class / +1'})</option>
                      {SINGLE_GRADES.map((g) => (
                        <option key={`sug-g-${g}`} value={g}>Set Grade: {g}</option>
                      ))}
                    </select>
                    <select
                      aria-label="Grade action when adopting selected students"
                      value={gradeAction}
                      onChange={(e) => setGradeAction(e.target.value as GradeAction)}
                      className="h-8 rounded-lg border border-border bg-card px-2.5 text-[11px] font-bold text-foreground focus:border-primary focus:outline-none"
                    >
                      <option value="promote">Action: Promote / Fit Class</option>
                      <option value="retain">Action: Keep Current Grade</option>
                      <option value="demote">Action: Step Down</option>
                    </select>
                    <button
                      type="button"
                      disabled={!!busy}
                      onClick={async () => {
                        await adoptSelected([...selectedSuggestionIds], gradeAction);
                        setSelectedSuggestionIds(new Set());
                        setQuickInput('');
                      }}
                      className="ml-auto h-8 rounded-lg bg-emerald-700 hover:bg-emerald-800 px-3.5 text-[11px] font-black text-white shadow-xs disabled:opacity-40"
                    >
                      {busy ? 'Adopting…' : `+ Adopt All (${selectedSuggestionIds.size}) into ${cls?.name || 'Class'}`}
                    </button>
                  </div>
                </div>
              );
            })()}

            {/* Unlimited Inline Live System Suggestions (every matching record in the school + multi-tick bulk adopt) */}
            {inlineSystemSuggestions.length > 0 && (() => {
              const adoptableSuggestions = inlineSystemSuggestions.filter((s) => !s.inThisClass && !s.locked);
              const selectedSugCount = adoptableSuggestions.filter((s) => selectedSuggestionIds.has(s.id)).length;
              const allSugSelected = adoptableSuggestions.length > 0 && selectedSugCount === adoptableSuggestions.length;
              return (
                <div className="rounded-xl border border-emerald-500/30 bg-card shadow-sm overflow-hidden">
                  <div className="flex flex-wrap items-center justify-between gap-2 bg-emerald-500/10 px-3 py-1.5 border-b border-emerald-500/20">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[11px] font-black text-emerald-900 dark:text-emerald-200">
                        System Suggestions for “{activeTypedFragment}” — {inlineSystemSuggestions.length} found
                      </span>
                      {adoptableSuggestions.length > 1 && (
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedSuggestionIds((prev) => {
                              const next = new Set(prev);
                              if (allSugSelected) adoptableSuggestions.forEach((s) => next.delete(s.id));
                              else adoptableSuggestions.forEach((s) => next.add(s.id));
                              return next;
                            });
                          }}
                          className="rounded-md border border-emerald-500/40 bg-card px-2 py-0.5 text-[10px] font-black text-emerald-800 dark:text-emerald-200 hover:bg-emerald-500/15"
                        >
                          {allSugSelected ? 'Untick All' : `Tick All (${adoptableSuggestions.length})`}
                        </button>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5">
                      {selectedSugCount > 0 ? (
                        <button
                          type="button"
                          disabled={!!busy}
                          onClick={async () => {
                            const ids = adoptableSuggestions.filter((s) => selectedSuggestionIds.has(s.id)).map((s) => s.id);
                            if (ids.length === 0) return;
                            await adoptSelected(ids, 'promote');
                            setSelectedSuggestionIds(new Set());
                            setQuickInput('');
                          }}
                          className="rounded-lg bg-emerald-700 hover:bg-emerald-800 px-3 py-1 text-[11px] font-black text-white shadow-xs disabled:opacity-40"
                        >
                          {busy ? 'Adopting…' : `+ Adopt Selected (${selectedSugCount})`}
                        </button>
                      ) : (
                        <span className="text-[10px] font-semibold text-muted-foreground">
                          Tick multiple to adopt at once, or click + Adopt
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="max-h-60 overflow-y-auto divide-y divide-border/60">
                    {inlineSystemSuggestions.map((s) => {
                      const canAdopt = !s.inThisClass && !s.locked;
                      const isTicked = canAdopt && selectedSuggestionIds.has(s.id);
                      return (
                        <div
                          key={`sug-${s.id}`}
                          className={`flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-xs transition-colors ${isTicked ? 'bg-emerald-500/10' : 'hover:bg-muted/40'
                            }`}
                        >
                          <div className="flex items-center gap-2.5 min-w-0 flex-1">
                            {canAdopt && (
                              <input
                                type="checkbox"
                                checked={isTicked}
                                aria-label={`Select ${s.full_name} to adopt`}
                                onChange={() =>
                                  setSelectedSuggestionIds((prev) => {
                                    const next = new Set(prev);
                                    if (next.has(s.id)) next.delete(s.id);
                                    else next.add(s.id);
                                    return next;
                                  })
                                }
                                className="h-4 w-4 shrink-0 rounded accent-emerald-600 cursor-pointer"
                              />
                            )}
                            <div className="min-w-0 flex-1">
                              <p className="font-bold text-foreground truncate">{s.full_name}</p>
                              <p className="text-[11px] text-muted-foreground truncate">
                                {s.grade ? `${s.grade} · ` : ''}
                                {s.inThisClass
                                  ? 'Already in this class'
                                  : s.current_class_name
                                    ? `From: ${s.current_class_name}`
                                    : 'Unassigned'}
                                {s.email ? ` · ${s.email}` : ''}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            {s.inThisClass ? (
                              <span className="rounded-md bg-muted px-2 py-1 text-[10px] font-bold text-muted-foreground">
                                On Roster
                              </span>
                            ) : s.locked ? (
                              <span className="rounded-md bg-amber-500/15 px-2 py-1 text-[10px] font-bold text-amber-800 dark:text-amber-300">
                                Other Teacher
                              </span>
                            ) : (
                              <>
                                <button
                                  type="button"
                                  onClick={() => pickInlineSuggestion(s)}
                                  className="rounded-lg border border-primary/35 bg-primary/10 px-2.5 py-1 text-[11px] font-bold text-primary hover:bg-primary/20"
                                >
                                  ✓ Pick
                                </button>
                                <button
                                  type="button"
                                  disabled={!!busy}
                                  onClick={async () => {
                                    await adoptOne(s.id, 'promote', quickGrade || undefined);
                                    setQuickInput('');
                                  }}
                                  className="rounded-lg bg-emerald-700 px-2.5 py-1 text-[11px] font-black text-white hover:bg-emerald-800 disabled:opacity-40"
                                >
                                  {busy === s.id ? 'Adopting…' : '+ Adopt'}
                                </button>
                              </>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })()}
            {liveQuickRows.length > 0 && (() => {
              const readyRows = liveQuickRows.filter((r) => r.status === 'adopt' || r.status === 'create_new');
              const allReadyTicked = readyRows.length > 0 && readyRows.every((r) => r.ticked);
              return (
                <div className="rounded-xl border border-border bg-card p-2.5 space-y-1.5 text-xs">
                  <div className="flex flex-wrap items-center justify-between gap-2 pb-1 border-b border-border/60">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[11px] font-black text-foreground">
                        Live Match Preview ({liveQuickRows.filter((r) => r.status === 'adopt').length} Adopt · {liveQuickRows.filter((r) => r.status === 'create_new').length} New{liveQuickRows.filter((r) => r.status === 'ambiguous').length > 0 ? ` · ${liveQuickRows.filter((r) => r.status === 'ambiguous').length} Pick` : ''})
                      </span>
                      {readyRows.length > 1 && (
                        <button
                          type="button"
                          onClick={() => {
                            setQuickUntickedKeys(allReadyTicked ? new Set(readyRows.map((r) => r.key)) : new Set());
                          }}
                          className="rounded-md border border-border bg-background hover:bg-muted px-2 py-0.5 text-[10px] font-black text-foreground"
                        >
                          {allReadyTicked ? 'Untick All' : `Tick All Ready (${readyRows.length})`}
                        </button>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => setTab('quick')}
                      className="text-[11px] font-bold text-primary hover:underline"
                    >
                      Open Full Verification Table →
                    </button>
                  </div>
                  <div className="max-h-60 overflow-y-auto divide-y divide-border/50 pr-1">
                    {liveQuickRows.slice(0, 12).map((row) => {
                      const chosen = row.chosenId ? row.candidates.find((c) => c.id === row.chosenId) : null;
                      return (
                        <div key={`inline-prev-${row.key}`} className="flex flex-wrap items-center justify-between gap-2 py-1.5">
                          <label className="inline-flex items-center gap-2 min-w-0 cursor-pointer">
                            <input
                              type="checkbox"
                              aria-label={`Include ${row.cleanName}`}
                              checked={row.ticked}
                              disabled={row.status === 'already_in_class' || row.status === 'ambiguous'}
                              onChange={() =>
                                setQuickUntickedKeys((prev) => {
                                  const n = new Set(prev);
                                  if (n.has(row.key)) n.delete(row.key);
                                  else n.add(row.key);
                                  return n;
                                })
                              }
                              className="h-4 w-4 rounded accent-primary"
                            />
                            <span className="font-bold text-foreground truncate">{row.rawLine}</span>
                          </label>
                          <div className="flex flex-wrap items-center gap-1.5">
                            {row.status === 'already_in_class' && (
                              <span className="rounded-md bg-muted px-2 py-0.5 text-[10px] font-bold text-muted-foreground">Already in class</span>
                            )}
                            {row.status === 'adopt' && chosen && (
                              <>
                                <span className="rounded-md bg-emerald-500/15 border border-emerald-500/30 px-2 py-0.5 text-[10px] font-black text-emerald-800 dark:text-emerald-300">
                                  ✓ Adopt: {chosen.full_name}{chosen.current_class_name ? ` (${chosen.current_class_name})` : ''}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => setQuickChoiceByKey((p) => ({ ...p, [row.key]: '__create_new__' }))}
                                  className="text-[10px] font-bold text-muted-foreground hover:text-foreground underline"
                                >
                                  New instead
                                </button>
                              </>
                            )}
                            {row.status === 'ambiguous' && (
                              <div className="flex flex-wrap items-center gap-1">
                                {row.candidates.slice(0, 2).map((c) => (
                                  <button
                                    key={c.id}
                                    type="button"
                                    onClick={() => setQuickChoiceByKey((p) => ({ ...p, [row.key]: c.id }))}
                                    className="rounded-md border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[10px] font-black text-amber-900 dark:text-amber-200 hover:bg-amber-500/20"
                                  >
                                    Pick {c.full_name}
                                  </button>
                                ))}
                                <button
                                  type="button"
                                  onClick={() => setQuickChoiceByKey((p) => ({ ...p, [row.key]: '__create_new__' }))}
                                  className="rounded-md border border-border bg-background px-2 py-0.5 text-[10px] font-bold text-foreground"
                                >
                                  + New
                                </button>
                              </div>
                            )}
                            {row.status === 'create_new' && (
                              <span className="rounded-md bg-primary/10 border border-primary/25 px-2 py-0.5 text-[10px] font-black text-primary">
                                + New Account
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  {liveQuickRows.length > 12 && (
                    <p className="text-[10px] text-muted-foreground">+{liveQuickRows.length - 12} more names ready…</p>
                  )}
                </div>
              );
            })()}
                      {quickNotice && (
                        <div className="rounded-xl border border-emerald-500/35 bg-emerald-500/10 px-3 py-2 text-xs flex flex-wrap items-center justify-between gap-2">
                          <span className="font-bold text-emerald-900 dark:text-emerald-200">{quickNotice.summary}</span>
                          <Link
                            href={`/dashboard/classes/${id}/cards`}
                            className="rounded-lg bg-emerald-700 px-2.5 py-1 text-[11px] font-black text-white hover:bg-emerald-800"
                          >
                            Login + RC PDF →
                          </Link>
                        </div>
                      )}
                    </div>

          {/* Simplified Search & Clean Filter Bar */ }
                  <div className="rounded-2xl border border-border bg-card p-3.5 sm:p-4 space-y-3 shadow-sm">
                    <div className="flex flex-col sm:flex-row gap-2.5">
                      <div className="relative flex-1">
                        <MagnifyingGlassIcon className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                        <input
                          type="text"
                          aria-label="Search school students"
                          value={search}
                          onChange={(e) => { setSearch(e.target.value); setShowAllRows(false); }}
                          placeholder="Type a student name to find & adopt…"
                          className="min-h-11 w-full rounded-xl border border-border bg-background pl-10 pr-9 text-sm font-medium text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none"
                        />
                        {search && (
                          <button
                            type="button"
                            aria-label="Clear search"
                            onClick={() => setSearch('')}
                            className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-md p-1 text-muted-foreground hover:bg-muted"
                          >
                            <XMarkIcon className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                      {feederStudents.length > 0 && (
                        <button
                          type="button"
                          disabled={!!busy}
                          onClick={() => void adoptSelected(feederStudents.slice(0, seatsLeft).map((s) => s.id), 'promote')}
                          className="min-h-11 shrink-0 rounded-xl bg-emerald-700 px-4 text-xs font-black text-white hover:bg-emerald-800 disabled:opacity-50 shadow-sm"
                        >
                          ⬆ Promote All {feederStudents[0]?.grade || 'Prior'} ({feederStudents.length})
                        </button>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      {([
                        { id: 'all' as PlacementFilter, label: `All (${available.length})` },
                        ...(feederStudents.length > 0 ? [{ id: 'feeder' as PlacementFilter, label: `Prior Grade (${feederStudents.length})` }] : []),
                        ...(sisterStudents.length > 0 ? [{ id: 'sister' as PlacementFilter, label: `Sister Schools (${sisterStudents.length})` }] : []),
                        { id: 'unassigned' as PlacementFilter, label: `Unassigned (${unassignedCount})` },
                        { id: 'other' as PlacementFilter, label: `Other Classes (${otherCount})` },
                      ]).map((chip) => (
                        <button
                          key={chip.id}
                          type="button"
                          onClick={() => { setPlacement(chip.id); setShowAllRows(false); }}
                          className={`rounded-full border px-3 py-1 text-xs font-bold transition-colors ${placement === chip.id
                            ? 'border-primary bg-primary text-primary-foreground'
                            : 'border-border bg-background text-muted-foreground hover:text-foreground'
                            }`}
                        >
                          {chip.label}
                        </button>
                      ))}
                      <div className="flex flex-wrap items-center gap-2 sm:ml-auto w-full sm:w-auto pt-1 sm:pt-0">
                        {schoolClasses.length > 0 && (
                          <select
                            aria-label="Filter by source class"
                            value={sourceClassId}
                            onChange={(e) => { setSourceClassId(e.target.value); setShowAllRows(false); }}
                            className="min-h-9 flex-1 sm:flex-none rounded-xl border border-border bg-background px-2.5 text-xs font-semibold text-foreground"
                          >
                            <option value="">All Classes</option>
                            {schoolClasses.map((sc) => (
                              <option key={sc.id} value={sc.id}>
                                {sc.name} ({sc.student_count})
                              </option>
                            ))}
                          </select>
                        )}
                        <select
                          aria-label="Sort students"
                          value={sortBy}
                          onChange={(e) => setSortBy(e.target.value as SortKey)}
                          className="min-h-9 flex-1 sm:flex-none rounded-xl border border-border bg-background px-2.5 text-xs font-semibold text-foreground"
                        >
                          <option value="name">Sort: Name A–Z</option>
                          <option value="unassigned">Sort: Unassigned First</option>
                          <option value="grade">Sort: Grade</option>
                          <option value="class">Sort: Source Class</option>
                        </select>
                        <select
                          aria-label="Target grade pitch"
                          value={targetGradePitch}
                          onChange={(e) => setTargetGradePitch(e.target.value)}
                          className="min-h-9 flex-1 sm:flex-none rounded-xl border border-primary/35 bg-primary/5 px-2.5 text-xs font-bold text-primary"
                        >
                          <option value="">Grade: Auto (+1)</option>
                          {SINGLE_GRADES.map((g) => (
                            <option key={`pitch-sel-${g}`} value={g}>Set Grade: {g}</option>
                          ))}
                        </select>
                      </div>
                    </div>

                    {distinctGrades.length > 1 && (
                      <div className="flex flex-wrap items-center gap-1.5 pt-1 border-t border-border/60">
                        <span className="text-[10px] font-black uppercase tracking-wider text-muted-foreground mr-1">Grade:</span>
                        <button
                          type="button"
                          onClick={() => { setGradeFilter(''); setShowAllRows(false); }}
                          className={`rounded-lg border px-2.5 py-0.5 text-[11px] font-bold transition-colors ${!gradeFilter
                            ? 'border-primary bg-primary/15 text-primary'
                            : 'border-border bg-background text-muted-foreground hover:text-foreground'
                            }`}
                        >
                          All
                        </button>
                        {distinctGrades.map((g) => (
                          <button
                            key={`gf-${g}`}
                            type="button"
                            onClick={() => { setGradeFilter(gradeFilter === g ? '' : g); setShowAllRows(false); }}
                            className={`rounded-lg border px-2.5 py-0.5 text-[11px] font-bold transition-colors ${gradeFilter === g
                              ? 'border-primary bg-primary/15 text-primary'
                              : 'border-border bg-background text-muted-foreground hover:text-foreground'
                              }`}
                          >
                            {g}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Toolbar */ }
                  {
                    filtered.length > 0 && (
                      <div className="flex flex-wrap items-center justify-between gap-2 px-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <button
                            type="button"
                            onClick={toggleAllFiltered}
                            className="rounded-xl border border-border bg-card px-3 py-1.5 text-xs font-bold text-foreground hover:bg-muted"
                          >
                            {allFilteredSelected ? `Deselect All (${enrollableFiltered.length})` : `Tick All Matching (${enrollableFiltered.length})`}
                          </button>
                          {selectedIds.size > 0 && (
                            <>
                              <button
                                type="button"
                                disabled={!!busy}
                                onClick={() => void adoptSelected([...selectedIds], gradeAction)}
                                className="rounded-xl bg-emerald-700 hover:bg-emerald-800 px-3.5 py-1.5 text-xs font-black text-white shadow-sm disabled:opacity-50"
                              >
                                {busy === 'bulk' ? 'Migrating…' : `+ Adopt Selected (${selectedIds.size})`}
                              </button>
                              <button
                                type="button"
                                onClick={() => setSelectedIds(new Set())}
                                className="text-xs font-bold text-muted-foreground underline hover:text-foreground"
                              >
                                Clear
                              </button>
                            </>
                          )}
                        </div>
                        <span className="text-xs font-semibold text-muted-foreground">
                          Showing {visibleRows.length} of {filtered.length} student{filtered.length === 1 ? '' : 's'}
                        </span>
                      </div>
                    )
                  }

                  {/* Spacious Student Cards Grid */ }
                  {
                    filtered.length === 0 ? (
                      <div className="rounded-2xl border border-dashed border-border bg-card p-10 text-center space-y-2">
                        <UserGroupIcon className="mx-auto h-10 w-10 text-muted-foreground/50" />
                        <p className="text-sm font-bold text-foreground">No matching students found</p>
                        <p className="text-xs text-muted-foreground">
                          Try clearing filters, or switch to the <strong>Quick-Add / Paste</strong> tab to add new students cleanly.
                        </p>
                      </div>
                    ) : (
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                      {visibleRows.map((s) => {
                        const checked = selectedIds.has(s.id);
                        const locked = Boolean(s.requires_transfer_request);
                        const gradeLabel = s.grade || s.section_class;
                        const initials = (s.full_name || '?')
                          .split(/\s+/)
                          .slice(0, 2)
                          .map((p) => p[0]?.toUpperCase() || '')
                          .join('') || '?';
                        return (
                          <div
                            key={s.id}
                            onClick={(e) => !locked && toggleSelect(s.id, e.shiftKey)}
                            className={`flex flex-col gap-3 rounded-2xl border p-4 transition-all select-none ${locked
                              ? 'border-amber-500/30 bg-amber-500/5'
                              : checked
                                ? 'border-primary bg-primary/5 shadow-sm cursor-pointer'
                                : 'border-border bg-card hover:border-primary/40 cursor-pointer'
                              }`}
                          >
                            <div className="flex items-start gap-3">
                              <input
                                type="checkbox"
                                checked={checked}
                                disabled={locked}
                                onChange={() => { }}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (!locked) toggleSelect(s.id, e.shiftKey);
                                }}
                                aria-label={`Select ${s.full_name}`}
                                className="mt-1 h-5 w-5 shrink-0 rounded accent-primary cursor-pointer"
                              />
                              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 border border-primary/20 text-xs font-black text-primary">
                                {initials}
                              </div>
                              <div className="min-w-0 flex-1">
                                <p className="text-sm sm:text-base font-black text-foreground break-words leading-snug">
                                  {s.full_name}
                                </p>
                                <div className="mt-1 flex flex-wrap items-center gap-1.5">
                                  {gradeLabel && (
                                    <span className="rounded-md border border-border bg-muted px-2 py-0.5 text-[10px] font-black text-foreground">
                                      {gradeLabel}
                                      {targetGradePitch
                                        ? ` → ${targetGradePitch}`
                                        : s.suggested_grade && s.suggested_grade !== gradeLabel
                                          ? ` → ${s.suggested_grade}`
                                          : ''}
                                    </span>
                                  )}
                                  {s.sister_school_name && (
                                    <span className="rounded-full border border-indigo-500/35 bg-indigo-500/10 px-2 py-0.5 text-[10px] font-black text-indigo-800 dark:text-indigo-300">
                                      Sister School: {s.sister_school_name}
                                    </span>
                                  )}
                                  {!s.class_id ? (
                                    <span className="rounded-full border border-emerald-500/35 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold text-emerald-800 dark:text-emerald-300">
                                      Unassigned
                                    </span>
                                  ) : (
                                    <span className="rounded-full border border-amber-500/35 bg-amber-500/10 px-2 py-0.5 text-[10px] font-bold text-amber-800 dark:text-amber-300">
                                      From: {s.current_class_name || 'Another class'}
                                    </span>
                                  )}
                                </div>
                                {s.email && (
                                  <p className="mt-1 text-xs font-mono text-muted-foreground break-all">{s.email}</p>
                                )}
                              </div>
                            </div>

                            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/60 pt-2.5" onClick={(e) => e.stopPropagation()}>
                              {checked && !locked ? (
                                <div className="flex items-center gap-1">
                                  {(['promote', 'demote', 'retain'] as GradeAction[]).map((act) => {
                                    const active = (perStudentAction[s.id] || gradeAction) === act;
                                    return (
                                      <button
                                        key={act}
                                        type="button"
                                        onClick={() => setPerStudentAction((prev) => ({ ...prev, [s.id]: act }))}
                                        className={`rounded-lg border px-2 py-1 text-[10px] font-black ${active
                                          ? 'border-emerald-700 bg-emerald-700 text-white'
                                          : 'border-border bg-background text-muted-foreground hover:text-foreground'
                                          }`}
                                      >
                                        {act === 'promote' ? '⬆ +1' : act === 'demote' ? '⬇ -1' : '↔ Keep'}
                                      </button>
                                    );
                                  })}
                                </div>
                              ) : (
                                <span className="text-[11px] text-muted-foreground">
                                  {s.current_teacher_name ? `Teacher: ${s.current_teacher_name}` : 'Ready to adopt'}
                                </span>
                              )}
                              {!locked ? (
                                <button
                                  type="button"
                                  disabled={!!busy}
                                  onClick={() => void adoptOne(s.id)}
                                  className="ml-auto inline-flex min-h-9 items-center gap-1 rounded-xl bg-emerald-700 px-3.5 py-1.5 text-xs font-black text-white hover:bg-emerald-800 disabled:opacity-40"
                                >
                                  {busy === s.id ? 'Adopting…' : 'Adopt Now'}
                                </button>
                              ) : (
                                <span className="ml-auto text-[11px] font-bold text-amber-800 dark:text-amber-300">
                                  Owned by another teacher
                                </span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )
                  }

                  {
                    filtered.length > visibleRows.length && (
                      <button
                        type="button"
                        onClick={() => setShowAllRows(true)}
                        className="w-full min-h-11 rounded-2xl border border-border bg-card text-xs font-black text-foreground hover:bg-muted"
                      >
                        Show all {filtered.length} matching students
                      </button>
                    )
                  }
        </div>
          ) : tab === 'quick' ? (
          <div className="rounded-2xl border border-border bg-card p-4 sm:p-6 space-y-4 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-base font-black text-foreground">Quick-Add or Paste Student Names</h2>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Automatically matches &amp; transfers existing school students (zero duplicates) or creates clean <code className="font-mono">firstname123@rillcod.com</code> + <code className="font-mono">rillcod@XXXX</code> accounts.
                </p>
              </div>
              <span className="rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-black text-primary">
                Pushing to: {quickGrade || `Auto (${defaultEntryGrade || 'Class'})`}
              </span>
            </div>

            {/* Clean 1-tap Target Grade Pitch (only class band grades as pills + dropdown for others) */}
            <div className="space-y-1.5">
              <p className="text-[11px] font-black uppercase tracking-wider text-muted-foreground">1. Target Grade</p>
              <div className="flex flex-wrap items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setQuickGrade('')}
                  className={`min-h-9 rounded-xl border px-3 text-xs font-bold ${!quickGrade ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-background text-muted-foreground hover:text-foreground'
                    }`}
                >
                  Auto
                </button>
                {SINGLE_GRADES.filter((g) => (classBand ? bandCoversGrade(classBand, g) : ['JSS 1', 'JSS 2', 'JSS 3', 'SS 1', 'SS 2', 'SS 3'].includes(g))).map((g) => {
                  const active = quickGrade === g;
                  return (
                    <button
                      key={`q-pitch-${g}`}
                      type="button"
                      onClick={() => setQuickGrade(g)}
                      className={`min-h-9 rounded-xl border px-3 text-xs font-bold transition-colors ${active
                        ? 'border-primary bg-primary text-primary-foreground shadow-sm'
                        : 'border-primary/35 bg-primary/5 text-primary hover:bg-primary/15'
                        }`}
                    >
                      {g}
                    </button>
                  );
                })}
                <select
                  aria-label="Other target grade"
                  value={quickGrade}
                  onChange={(e) => setQuickGrade(e.target.value)}
                  className="min-h-9 rounded-xl border border-border bg-background px-2.5 text-xs font-bold text-foreground"
                >
                  <option value="">Other grade…</option>
                  {SINGLE_GRADES.map((g) => (
                    <option key={`q-other-${g}`} value={g}>{g}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <label className="block text-[11px] font-black uppercase tracking-wider text-muted-foreground">
                  2. Type, Paste Anything (WhatsApp / Excel / Names) or Upload File — Verified Live Below
                </label>
                <div className="flex flex-wrap items-center gap-1.5">
                  <button
                    type="button"
                    disabled={aiParsing}
                    onClick={() => fileInputRef.current?.click()}
                    className="inline-flex items-center gap-1 rounded-lg border border-border bg-background px-2.5 py-1 text-[11px] font-bold text-foreground hover:bg-muted disabled:opacity-50"
                  >
                    <CloudArrowUpIcon className="h-3.5 w-3.5 text-primary" />
                    Upload PDF / Word / CSV
                  </button>
                  <button
                    type="button"
                    disabled={aiParsing || !quickInput.trim()}
                    onClick={() => void runAiSmartParse()}
                    className="inline-flex items-center gap-1 rounded-lg bg-primary px-3 py-1 text-[11px] font-black text-primary-foreground hover:opacity-90 disabled:opacity-40 shadow-sm"
                  >
                    {aiParsing ? <ArrowPathIcon className="h-3.5 w-3.5 animate-spin" /> : <SparklesIcon className="h-3.5 w-3.5" />}
                    {aiParsing ? 'AI Extracting & Matching…' : '✨ AI Smart Extract & Match'}
                  </button>
                  {quickInput.trim() && (
                    <button
                      type="button"
                      onClick={() => {
                        setQuickInput('');
                        setQuickUntickedKeys(new Set());
                        setQuickChoiceByKey({});
                        setAiReasonByKey({});
                        setAiNotes(null);
                      }}
                      className="text-[11px] font-bold text-rose-600 dark:text-rose-400 hover:underline ml-1"
                    >
                      Clear List
                    </button>
                  )}
                </div>
              </div>
              {aiNotes && (
                <div className="flex items-center justify-between gap-2 rounded-xl border border-primary/30 bg-primary/10 px-3 py-2 text-xs text-primary font-bold">
                  <span className="flex items-center gap-1.5">
                    <SparklesIcon className="h-4 w-4 shrink-0" />
                    {aiNotes}
                  </span>
                  <button type="button" onClick={() => setAiNotes(null)} className="text-[11px] underline">
                    Dismiss
                  </button>
                </div>
              )}
              <textarea
                rows={5}
                aria-label="Type or paste student names for real-time matching"
                value={quickInput}
                onChange={(e) => setQuickInput(e.target.value)}
                placeholder={`Paste a messy WhatsApp attendance message, Excel rows, or clean names:\n1. Samuel Agha - JSS 2 (paid)\n2. Adaeze Okonkwo\n3. Chinedu Eze\n(System suggestions appear live as you type, or click ✨ AI Smart Extract & Match!)`}
                className="w-full rounded-2xl border border-border bg-background p-3.5 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none"
              />

              {/* Unlimited Inline Live System Suggestions right below textarea */}
              {inlineSystemSuggestions.length > 0 && (
                <div className="rounded-xl border border-emerald-500/30 bg-card shadow-sm overflow-hidden">
                  <div className="flex flex-wrap items-center justify-between gap-2 bg-emerald-500/10 px-3 py-1.5 border-b border-emerald-500/20">
                    <span className="text-[11px] font-black text-emerald-900 dark:text-emerald-200">
                      Live System Suggestions for “{activeTypedFragment}” — {inlineSystemSuggestions.length} record{inlineSystemSuggestions.length === 1 ? '' : 's'} in system
                    </span>
                  </div>
                  <div className="max-h-52 overflow-y-auto divide-y divide-border/60">
                    {inlineSystemSuggestions.map((s) => (
                      <div key={`qsug-${s.id}`} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-xs hover:bg-muted/40">
                        <div className="min-w-0 flex-1">
                          <p className="font-bold text-foreground truncate">{s.full_name}</p>
                          <p className="text-[11px] text-muted-foreground truncate">
                            {s.grade ? `${s.grade} · ` : ''}
                            {s.inThisClass ? 'Already in this class' : s.current_class_name ? `From: ${s.current_class_name}` : 'Unassigned'}
                            {s.email ? ` · ${s.email}` : ''}
                          </p>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          {s.inThisClass ? (
                            <span className="rounded-md bg-muted px-2 py-1 text-[10px] font-bold text-muted-foreground">On Roster</span>
                          ) : s.locked ? (
                            <span className="rounded-md bg-amber-500/15 px-2 py-1 text-[10px] font-bold text-amber-800 dark:text-amber-300">Other Teacher</span>
                          ) : (
                            <>
                              <button
                                type="button"
                                onClick={() => pickInlineSuggestion(s)}
                                className="rounded-lg border border-primary/35 bg-primary/10 px-2.5 py-1 text-[11px] font-bold text-primary hover:bg-primary/20"
                              >
                                ✓ Pick &amp; Lock
                              </button>
                              <button
                                type="button"
                                disabled={!!busy}
                                onClick={() => void adoptOne(s.id, 'promote', quickGrade || undefined)}
                                className="rounded-lg bg-emerald-700 px-2.5 py-1 text-[11px] font-black text-white hover:bg-emerald-800 disabled:opacity-40"
                              >
                                + Adopt Now
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Real-Time Intelligent Verification & Tick Table */}
              {liveQuickRows.length > 0 && (() => {
                const adoptCount = liveQuickRows.filter((r) => r.ticked && r.status === 'adopt').length;
                const newCount = liveQuickRows.filter((r) => r.ticked && r.status === 'create_new').length;
                const ambCount = liveQuickRows.filter((r) => r.status === 'ambiguous').length;
                const alreadyCount = liveQuickRows.filter((r) => r.status === 'already_in_class').length;
                const actionableRows = liveQuickRows.filter((r) => r.status === 'adopt' || r.status === 'create_new');
                const allActionableTicked = actionableRows.length > 0 && actionableRows.every((r) => r.ticked);

                return (
                  <div className="rounded-2xl border border-primary/25 bg-muted/20 p-3.5 space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                        <span className="font-black text-foreground">Real-Time Verification ({liveQuickRows.length}):</span>
                        <span className="rounded-full bg-emerald-500/15 border border-emerald-500/30 px-2.5 py-0.5 font-black text-emerald-800 dark:text-emerald-300">
                          {adoptCount} Adopt Existing
                        </span>
                        <span className="rounded-full bg-primary/10 border border-primary/25 px-2.5 py-0.5 font-black text-primary">
                          {newCount} Create New
                        </span>
                        {ambCount > 0 && (
                          <span className="rounded-full bg-amber-500/15 border border-amber-500/35 px-2.5 py-0.5 font-black text-amber-800 dark:text-amber-300">
                            {ambCount} Need Pick
                          </span>
                        )}
                        {alreadyCount > 0 && (
                          <span className="rounded-full bg-muted border border-border px-2.5 py-0.5 font-bold text-muted-foreground">
                            {alreadyCount} Already in Class
                          </span>
                        )}
                      </div>
                      {actionableRows.length > 0 && (
                        <div className="flex flex-wrap items-center gap-1.5">
                          {liveQuickRows.some((r) => r.status === 'adopt') && liveQuickRows.some((r) => r.status === 'create_new') && (
                            <button
                              type="button"
                              onClick={() => {
                                setQuickUntickedKeys(
                                  new Set(liveQuickRows.filter((r) => r.status !== 'adopt').map((r) => r.key)),
                                );
                              }}
                              className="rounded-lg border border-emerald-500/35 bg-emerald-500/10 px-2.5 py-1 text-[11px] font-bold text-emerald-800 dark:text-emerald-300 hover:bg-emerald-500/20"
                            >
                              Tick Only Existing ({liveQuickRows.filter((r) => r.status === 'adopt').length})
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => {
                              if (allActionableTicked) {
                                setQuickUntickedKeys(new Set(actionableRows.map((r) => r.key)));
                              } else {
                                setQuickUntickedKeys(new Set());
                              }
                            }}
                            className="rounded-lg border border-border bg-card px-2.5 py-1 text-[11px] font-bold text-foreground hover:bg-muted"
                          >
                            {allActionableTicked ? 'Untick All' : 'Tick All Ready'}
                          </button>
                        </div>
                      )}
                    </div>

                    <div className="divide-y divide-border rounded-xl border border-border bg-card overflow-hidden">
                      {liveQuickRows.map((row) => {
                        const chosen = row.chosenId ? row.candidates.find((c) => c.id === row.chosenId) : null;
                        return (
                          <div key={`verify-${row.key}`} className="px-3.5 py-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
                            <div className="flex items-start gap-2.5 min-w-0 flex-1">
                              <input
                                type="checkbox"
                                checked={row.ticked}
                                disabled={row.status === 'already_in_class' || row.status === 'ambiguous'}
                                onChange={() =>
                                  setQuickUntickedKeys((prev) => {
                                    const n = new Set(prev);
                                    if (n.has(row.key)) n.delete(row.key);
                                    else n.add(row.key);
                                    return n;
                                  })
                                }
                                aria-label={`Verify ${row.rawLine}`}
                                className="mt-0.5 h-4 w-4 shrink-0 rounded accent-primary cursor-pointer"
                              />
                              <div className="min-w-0 flex-1">
                                <div className="flex flex-wrap items-center gap-1.5">
                                  <p className="font-bold text-foreground break-words">{row.cleanName}</p>
                                  {row.parsedGrade && (
                                    <span className="rounded-md border border-primary/30 bg-primary/10 px-1.5 py-0.5 text-[10px] font-black text-primary">
                                      {row.parsedGrade}
                                    </span>
                                  )}
                                  {aiReasonByKey[row.key] && (
                                    <span className="rounded-md border border-indigo-500/30 bg-indigo-500/10 px-1.5 py-0.5 text-[10px] font-bold text-indigo-700 dark:text-indigo-300">
                                      ✨ AI: {aiReasonByKey[row.key]}
                                    </span>
                                  )}
                                </div>
                                {row.status === 'already_in_class' && row.matchedRoster && (
                                  <p className="text-[11px] text-muted-foreground">
                                    Already active on this roster as <strong>{row.matchedRoster.full_name}</strong>
                                  </p>
                                )}
                                {row.status === 'adopt' && chosen && (
                                  <p className="text-[11px] text-emerald-800 dark:text-emerald-300 font-medium">
                                    Matched: <strong>{chosen.full_name}</strong>
                                    {chosen.grade ? ` · ${chosen.grade}` : ''}
                                    {chosen.current_class_name ? ` · From ${chosen.current_class_name}` : ' · Unassigned'}
                                    {chosen.email ? ` · ${chosen.email}` : ''}
                                  </p>
                                )}
                                {row.status === 'create_new' && (
                                  <p className="text-[11px] text-primary font-medium">
                                    No existing match — will create fresh account ({quickGrade || defaultEntryGrade || 'Class grade'})
                                  </p>
                                )}
                                {row.status === 'ambiguous' && (
                                  <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                                    <span className="text-[10px] font-black uppercase text-amber-800 dark:text-amber-300">Pick exact match:</span>
                                    {row.candidates.map((c) => (
                                      <button
                                        key={c.id}
                                        type="button"
                                        onClick={() => setQuickChoiceByKey((p) => ({ ...p, [row.key]: c.id }))}
                                        className="rounded-lg border border-amber-500/40 bg-amber-500/10 hover:bg-amber-500/20 px-2.5 py-1 text-[11px] font-bold text-amber-900 dark:text-amber-200"
                                      >
                                        ✓ {c.full_name}{c.grade ? ` (${c.grade})` : ''}{c.current_class_name ? ` · ${c.current_class_name}` : ''}
                                      </button>
                                    ))}
                                    <button
                                      type="button"
                                      onClick={() => setQuickChoiceByKey((p) => ({ ...p, [row.key]: '__create_new__' }))}
                                      className="rounded-lg border border-border bg-background hover:bg-muted px-2.5 py-1 text-[11px] font-bold text-foreground"
                                    >
                                      + Create New Instead
                                    </button>
                                  </div>
                                )}
                              </div>
                            </div>

                            <div className="flex items-center gap-1.5 shrink-0 pl-6 sm:pl-0">
                              {row.status === 'adopt' && (
                                <button
                                  type="button"
                                  onClick={() => setQuickChoiceByKey((p) => ({ ...p, [row.key]: '__create_new__' }))}
                                  className="rounded-lg border border-border bg-background hover:bg-muted px-2 py-1 text-[10px] font-bold text-muted-foreground hover:text-foreground"
                                >
                                  Create New Instead
                                </button>
                              )}
                              {row.status === 'create_new' && row.candidates.length > 0 && (
                                <button
                                  type="button"
                                  onClick={() => setQuickChoiceByKey((p) => { const n = { ...p }; delete n[row.key]; return n; })}
                                  className="rounded-lg border border-emerald-500/35 bg-emerald-500/10 px-2 py-1 text-[10px] font-bold text-emerald-800 dark:text-emerald-300"
                                >
                                  Use Existing Match
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
                      <button
                        type="button"
                        disabled={busy === 'quick' || (adoptCount + newCount === 0)}
                        onClick={() => void applyVerifiedQuickRows()}
                        className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-emerald-700 hover:bg-emerald-800 px-5 text-xs font-black text-white disabled:opacity-40 shadow-sm"
                      >
                        {busy === 'quick' ? <ArrowPathIcon className="h-4 w-4 animate-spin" /> : <CheckCircleIcon className="h-4 w-4" />}
                        Confirm &amp; Apply {adoptCount + newCount} Ticked ({adoptCount} Adopt · {newCount} New)
                      </button>
                    </div>
                  </div>
                );
              })()}
            </div>

            {quickNotice && (
              <div className="rounded-2xl border border-emerald-500/35 bg-emerald-500/10 p-4 space-y-3 text-xs">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-black text-emerald-900 dark:text-emerald-200">{quickNotice.summary}</p>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {quickNotice.added.length > 0 && (
                      <button
                        type="button"
                        onClick={() => {
                          const text = quickNotice.added
                            .map((a) => `${a.fullName}${a.grade ? ` (${a.grade})` : ''} — ${a.email || ''}${a.password ? ` / ${a.password}` : ''}`)
                            .join('\n');
                          void navigator.clipboard.writeText(text).then(() => toast.success('Copied student logins to clipboard'));
                        }}
                        className="inline-flex items-center gap-1 rounded-lg border border-emerald-600/40 bg-card px-3 py-1.5 text-[11px] font-black text-emerald-900 dark:text-emerald-200 hover:bg-emerald-500/15"
                      >
                        <ClipboardIcon className="h-3.5 w-3.5" /> Copy Logins
                      </button>
                    )}
                    <Link
                      href={`/dashboard/classes/${id}/cards`}
                      className="inline-flex items-center gap-1 rounded-lg bg-emerald-700 px-3 py-1.5 text-[11px] font-black text-white hover:bg-emerald-800"
                    >
                      Print Login + RC PDF →
                    </Link>
                  </div>
                </div>
                {quickNotice.added.length > 0 && (
                  <div className="overflow-x-auto rounded-xl border border-border bg-card">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-muted/60 text-[10px] font-black uppercase text-muted-foreground">
                        <tr>
                          <th className="px-3 py-2">Student</th>
                          <th className="px-3 py-2">Grade</th>
                          <th className="px-3 py-2">Status</th>
                          <th className="px-3 py-2">Username / Password</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border/60">
                        {quickNotice.added.map((a, idx) => (
                          <tr key={`${a.fullName}-${idx}`}>
                            <td className="px-3 py-2 font-bold text-foreground">{a.fullName}</td>
                            <td className="px-3 py-2 text-muted-foreground">{a.grade || '—'}</td>
                            <td className="px-3 py-2">
                              <span className="rounded-md bg-primary/10 px-2 py-0.5 text-[10px] font-black uppercase text-primary">
                                {a.mode === 'adopted' ? 'Adopted' : a.mode === 'created' ? 'New Account' : 'Confirmed'}
                              </span>
                            </td>
                            <td className="px-3 py-2 font-mono text-[11px]">
                              {a.email || '—'}{a.password ? ` / ${a.password}` : ''}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                {quickNotice.ambiguous.length > 0 && (
                  <div className="rounded-xl border border-amber-500/35 bg-amber-500/10 p-3 space-y-2">
                    <p className="font-black text-amber-900 dark:text-amber-200">
                      Multiple students in this school matched — click the exact student to adopt &amp; transfer:
                    </p>
                    {quickNotice.ambiguous.map((row) => (
                      <div key={row.input} className="space-y-1">
                        <p className="font-bold text-foreground">{row.input}:</p>
                        <div className="flex flex-wrap gap-1.5">
                          {row.candidates.map((c) => (
                            <button
                              key={c.id}
                              type="button"
                              disabled={!!busy}
                              onClick={() => void adoptOne(c.id, 'promote', quickGrade || undefined)}
                              className="rounded-lg border border-primary/40 bg-card px-3 py-1.5 text-xs font-bold text-primary hover:bg-primary/10"
                            >
                              + Adopt {c.full_name}{c.grade ? ` (${c.grade})` : ''}{c.current_class_name ? ` · ${c.current_class_name}` : ''}
                            </button>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
          ) : (
          <div className="rounded-2xl border border-border bg-card p-4 sm:p-6 space-y-4 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-base font-black text-foreground">Confirm &amp; Promote Current Roster</h2>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Promote steps each checked student up by +1 from their own grade (e.g. JSS 1 → JSS 2, SS 1 → SS 2). Untick anyone who left.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => applyBulkStep(1)}
                  className="min-h-10 rounded-xl bg-emerald-700 px-3.5 text-xs font-black text-white hover:bg-emerald-800"
                >
                  ⬆ Promote All (+1)
                </button>
                <button
                  type="button"
                  onClick={() => applyBulkStep(-1)}
                  className="min-h-10 rounded-xl border border-border bg-background px-3 text-xs font-bold text-foreground hover:bg-muted"
                >
                  ⬇ Demote (-1)
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setConfirmKeepIds(new Set(roster.map((s) => s.id)));
                    setConfirmGrades(buildInitialGrades(roster, defaultEntryGrade));
                  }}
                  className="min-h-10 rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 text-xs font-bold text-amber-900 dark:text-amber-200 hover:bg-amber-500/20"
                >
                  ↺ Revert
                </button>
                {lastSnapshot && lastSnapshot.length > 0 && (
                  <button
                    type="button"
                    disabled={busy === 'confirm'}
                    onClick={() => void undoLastSave()}
                    className="min-h-10 rounded-xl border border-primary/40 bg-primary/10 px-3 text-xs font-black text-primary hover:bg-primary/20"
                  >
                    ↺ Undo Last Save ({lastSnapshot.length})
                  </button>
                )}
              </div>
            </div>

            <div className="divide-y divide-border rounded-2xl border border-border overflow-hidden">
              {roster.map((s) => {
                const kept = confirmKeepIds.has(s.id);
                const chosen = confirmGrades[s.id] ?? s.grade ?? '';
                const changed = kept && chosen && s.grade && chosen !== canonicalGrade(s.grade) && chosen !== s.grade;
                return (
                  <div key={s.id} className={`flex flex-wrap items-center gap-3 px-4 py-3 ${kept ? 'bg-card' : 'bg-rose-500/5 opacity-75'}`}>
                    <input
                      type="checkbox"
                      checked={kept}
                      onChange={(e) => setConfirmKeepIds((prev) => {
                        const next = new Set(prev);
                        if (e.target.checked) next.add(s.id); else next.delete(s.id);
                        return next;
                      })}
                      aria-label={`Keep ${s.full_name}`}
                      className="h-5 w-5 shrink-0 accent-emerald-700"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-bold text-foreground break-words">{s.full_name}</p>
                      <p className="text-xs text-muted-foreground">
                        Current: {s.grade || 'No grade'}
                        {changed && <span className="ml-1.5 font-black text-emerald-700 dark:text-emerald-300">→ {chosen}</span>}
                        {!kept && <span className="ml-1.5 font-black text-rose-600 dark:text-rose-400">· Will withdraw</span>}
                      </p>
                    </div>
                    {kept ? (
                      <select
                        aria-label={`New grade for ${s.full_name}`}
                        value={chosen}
                        onChange={(e) => setConfirmGrades((prev) => ({ ...prev, [s.id]: e.target.value }))}
                        className="min-h-10 rounded-xl border border-border bg-background px-3 text-xs font-bold text-foreground"
                      >
                        <option value="">Select grade</option>
                        {SINGLE_GRADES.map((g) => <option key={g} value={g}>{g}</option>)}
                      </select>
                    ) : (
                      <span className="rounded-lg bg-rose-500/15 px-2.5 py-1 text-xs font-black text-rose-700 dark:text-rose-300">Withdraw</span>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="flex justify-end">
              <button
                type="button"
                disabled={busy === 'confirm' || roster.length === 0}
                onClick={() => void saveConfirmRoster()}
                className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-emerald-700 px-5 text-xs font-black text-white hover:bg-emerald-800 disabled:opacity-40 shadow-sm"
              >
                {busy === 'confirm' ? <ArrowPathIcon className="h-4 w-4 animate-spin" /> : <CheckCircleIcon className="h-4 w-4" />}
                Save &amp; Confirm Roster
              </button>
            </div>
          </div>
      )}

          {/* Sticky bottom action bar when students are ticked in Pick & Adopt */}
          {tab === 'pick' && selectedIds.size > 0 && (
            <div className="fixed inset-x-0 bottom-[var(--app-bottom-nav-height)] md:bottom-0 z-50 border-t border-border bg-card/95 px-4 py-3 shadow-2xl backdrop-blur pb-[max(0.75rem,env(safe-area-inset-bottom))]">
              <div className="mx-auto flex max-w-6xl items-center justify-between gap-3">
                <div className="text-xs font-semibold text-muted-foreground">
                  <span className="font-black text-foreground">{selectedIds.size}</span> student{selectedIds.size === 1 ? '' : 's'} selected
                  {targetGradePitch ? ` · Pitch: ${targetGradePitch}` : ''}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setSelectedIds(new Set())}
                    className="min-h-11 rounded-xl border border-border bg-background px-3.5 text-xs font-bold text-foreground hover:bg-muted"
                  >
                    Clear
                  </button>
                  <button
                    type="button"
                    disabled={!!busy}
                    onClick={() => void adoptSelected()}
                    className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-primary px-5 text-xs font-black text-primary-foreground hover:opacity-90 disabled:opacity-40 shadow-md"
                  >
                    {busy === 'bulk' ? <ArrowPathIcon className="h-4 w-4 animate-spin" /> : <SparklesIcon className="h-4 w-4" />}
                    Adopt &amp; Enrol ({selectedIds.size})
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      );
}
