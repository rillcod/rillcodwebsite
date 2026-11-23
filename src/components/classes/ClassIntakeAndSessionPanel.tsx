'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import {
  ArrowLeftIcon,
  CheckCircleIcon,
  ClipboardDocumentListIcon,
  CloudArrowDownIcon,
  ExclamationTriangleIcon,
  LockClosedIcon,
  LockOpenIcon,
  PhoneIcon,
  PlusIcon,
  PrinterIcon,
  ShieldCheckIcon,
  UserGroupIcon,
  XMarkIcon,
} from '@/lib/icons';
import { SINGLE_GRADES, canonicalGrade, parseBandLabel } from '@/lib/classes/naming';
import { accessCardCodeForStudent, formatAccessCardCodeDisplay } from '@/lib/access-card-code';
import { openClassIntakeLetterheadPdf } from '@/lib/classes/print-intake-sheet';

export interface IntakeStudentRow {
  id: string;
  full_name: string;
  email?: string | null;
  grade?: string | null;
  parent_phone?: string | null;
  parent_name?: string | null;
  parent_verified?: boolean;
  parent_phone_source?: string | null;
  session_status?: 'confirmed_current' | 'carryover_unconfirmed';
  confirmed_session?: string | null;
  created_at?: string | null;
}

export interface DestinationClassOption {
  id: string;
  name: string;
  qa_grade_key?: string | null;
}

interface ClassIntakeAndSessionPanelProps {
  classId: string;
  className: string;
  schoolName?: string | null;
  classGradeKey?: string | null;
  classGradeBand?: string | null;
  currentSession: string;
  students: IntakeStudentRow[];
  formerStudents?: IntakeStudentRow[];
  destinationClasses: DestinationClassOption[];
  initialTab?: 'intake' | 'hygiene';
  onClose: () => void;
  onRefresh: () => void | Promise<void>;
}

function gradesForSectionBand(
  classGradeBand?: string | null,
  classGradeKey?: string | null,
  className?: string | null,
): string[] {
  const band =
    parseBandLabel(classGradeBand) ??
    parseBandLabel(classGradeKey) ??
    parseBandLabel(className?.includes('·') ? className.split('·').pop()?.trim() : className);
  if (!band) return [];
  const grades: string[] = [];
  for (let n = band.low; n <= band.high; n += 1) {
    const label = `${band.lvl} ${n}`;
    if ((SINGLE_GRADES as readonly string[]).includes(label)) {
      grades.push(label);
    }
  }
  return grades;
}

export interface DirectoryCandidate {
  id: string;
  full_name: string;
  grade?: string | null;
  class_id?: string | null;
  section_class?: string | null;
  is_active: boolean;
  in_this_class: boolean;
  parent_name?: string | null;
  parent_phone?: string | null;
  parent_verified: boolean;
  consent_signed?: boolean;
}

interface PendingIntakeEntry {
  localId: string;
  full_name: string;
  grade: string;
  parent_name?: string;
  parent_phone: string;
  matched_student_id: string | null;
  matched_label?: string | null;
  matched_verified?: boolean;
  consent_signed?: boolean;
}

interface IssuedStudentLogin {
  student_id: string;
  full_name: string;
  grade?: string | null;
  email: string;
  password: string | null;
  rc_code: string;
}

interface ParsedBulkLine {
  full_name: string;
  grade: string;
  parent_phone: string;
  matched: DirectoryCandidate | null;
}

function parseSmartBulkLines(
  rawText: string,
  defaultGrade: string,
  directory: DirectoryCandidate[],
): ParsedBulkLine[] {
  const lines = rawText.split(/\r?\n/);
  const seen = new Set<string>();
  const parsed: ParsedBulkLine[] = [];

  for (const raw of lines) {
    let line = raw
      .replace(/^\s*(?:\d+[.)\-:\s]+|[-•*]+\s+)/, '')
      .trim();
    if (!line) continue;

    // Extract phone number (10-14 digits, optionally starting with +)
    let phone = '';
    const phoneMatch = line.match(/(?:\+?234|0)[789]\d[\d\s\-()]{7,12}/) || line.match(/\+?\d[\d\s\-()]{9,14}/);
    if (phoneMatch) {
      const digits = phoneMatch[0].replace(/\D/g, '');
      if (digits.length >= 10) {
        phone = phoneMatch[0].trim();
        line = line.replace(phoneMatch[0], ' ');
      }
    }

    // Extract grade if mentioned on the line (e.g. Basic 1, JSS 2, SS1, Primary 3)
    let grade = defaultGrade;
    const gradeMatch = line.match(/\b((?:basic|primary|pry|jss|js|sss|ss)\s*[1-6])\b/i);
    if (gradeMatch) {
      const canon = canonicalGrade(gradeMatch[1]);
      if (canon) {
        grade = canon;
        line = line.replace(gradeMatch[0], ' ');
      }
    }

    // Clean leftover separators (, ; | - tab)
    const fullName = line
      .replace(/[,;|\t]+/g, ' ')
      .replace(/\s+-\s+/g, ' ')
      .replace(/\s+/g, ' ')
      .replace(/^[\-\s,]+|[\-\s,]+$/g, '')
      .trim();

    if (fullName.length < 2) continue;
    const dedupeKey = fullName.toLowerCase();
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);

    const match = findSmartCandidateMatches(fullName, directory, 1)[0] ?? null;
    const strongMatch =
      match &&
      (match.full_name.toLowerCase() === dedupeKey ||
        normalizeNameTokens(fullName).length >= 2);

    parsed.push({
      full_name: strongMatch ? match.full_name : fullName,
      grade,
      parent_phone: phone || (strongMatch ? match.parent_phone || '' : ''),
      matched: strongMatch ? match : null,
    });
  }

  return parsed;
}

function normalizeNameTokens(name: string): string[] {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .trim()
    .split(/\s+/)
    .filter((t) => t.length >= 2);
}

function findSmartCandidateMatches(
  query: string,
  candidates: DirectoryCandidate[],
  limit = 5,
): DirectoryCandidate[] {
  const q = query.trim().toLowerCase();
  if (q.length < 2) return [];
  const qTokens = normalizeNameTokens(q);
  const scored: Array<{ c: DirectoryCandidate; score: number }> = [];

  for (const c of candidates) {
    const nameLower = c.full_name.toLowerCase();
    if (nameLower === q) {
      scored.push({ c, score: 100 });
      continue;
    }
    if (nameLower.startsWith(q)) {
      scored.push({ c, score: 85 + (c.in_this_class ? 5 : 0) });
      continue;
    }
    if (nameLower.includes(q)) {
      scored.push({ c, score: 70 + (c.in_this_class ? 5 : 0) });
      continue;
    }
    if (qTokens.length >= 2) {
      const cTokens = normalizeNameTokens(c.full_name);
      const overlap = qTokens.filter((t) => cTokens.some((ct) => ct.startsWith(t) || t.startsWith(ct))).length;
      if (overlap >= 2) {
        scored.push({ c, score: 60 + overlap * 8 + (c.in_this_class ? 5 : 0) });
      }
    }
  }

  return scored
    .sort((a, b) => b.score - a.score || a.c.full_name.localeCompare(b.c.full_name))
    .slice(0, limit)
    .map((s) => s.c);
}

function formatWhatsAppDigits(phone?: string | null): string | null {
  const digits = String(phone ?? '').replace(/\D/g, '');
  if (digits.length < 10) return null;
  if (digits.length === 11 && digits.startsWith('0')) return `234${digits.slice(1)}`;
  if (digits.length === 10 && /^[789]/.test(digits)) return `234${digits}`;
  if (digits.startsWith('234')) return digits;
  return digits;
}

function suggestNextClass(
  className: string,
  classGradeKey: string | null | undefined,
  destinations: DestinationClassOption[],
): string {
  const cur = canonicalGrade(classGradeKey || className);
  if (!cur) return destinations[0]?.id ?? '';
  const idx = (SINGLE_GRADES as readonly string[]).indexOf(cur);
  const nextGrade = idx >= 0 && idx < SINGLE_GRADES.length - 1 ? SINGLE_GRADES[idx + 1] : null;
  if (!nextGrade) return destinations[0]?.id ?? '';
  const exact = destinations.find(
    (c) =>
      canonicalGrade(c.qa_grade_key || c.name) === nextGrade ||
      c.name.toLowerCase().includes(nextGrade.toLowerCase()),
  );
  return exact?.id ?? destinations[0]?.id ?? '';
}

export function ClassIntakeAndSessionPanel({
  classId,
  className,
  schoolName,
  classGradeKey,
  classGradeBand,
  currentSession,
  students,
  formerStudents = [],
  destinationClasses,
  initialTab = 'intake',
  onClose,
  onRefresh,
}: ClassIntakeAndSessionPanelProps) {
  const sectionGrades = useMemo(
    () => gradesForSectionBand(classGradeBand, classGradeKey, className),
    [classGradeBand, classGradeKey, className],
  );
  const isMultiGradeSection = sectionGrades.length > 1;
  const defaultGrade = sectionGrades[0] || canonicalGrade(classGradeKey || className) || SINGLE_GRADES[0];

  const [tab, setTab] = useState<'intake' | 'hygiene'>(initialTab);
  // Multi-grade sections (e.g. Basic 1-3, JSS 1-3) default to student/teacher grade selection;
  // single-grade classes (e.g. Basic 1) default to Grade Locked.
  const [lockGrade, setLockGrade] = useState<boolean>(!isMultiGradeSection && Boolean(sectionGrades.length === 1 || canonicalGrade(classGradeKey || className)));
  const [selectedGrade, setSelectedGrade] = useState<string>(defaultGrade);
  const [requirePhone, setRequirePhone] = useState<boolean>(false);
  const [gradeFilter, setGradeFilter] = useState<string>('all');
  // Kid-friendly Pass-Around Mode (full-screen zero-distraction classroom kiosk!)
  const [passAroundMode, setPassAroundMode] = useState(false);
  const [passAroundAddedCount, setPassAroundAddedCount] = useState(0);
  const [lastAddedName, setLastAddedName] = useState<string | null>(null);
  const [kioskCelebration, setKioskCelebration] = useState<string | null>(null);
  const [acknowledgeCandidate, setAcknowledgeCandidate] = useState<DirectoryCandidate | null>(null);
  const [ackPhoneOverride, setAckPhoneOverride] = useState<string>('');
  const [editingAckPhone, setEditingAckPhone] = useState<boolean>(false);
  const [ackGradeOverride, setAckGradeOverride] = useState<string>('');
  const [confirmingExit, setConfirmingExit] = useState(false);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [showBulkPaste, setShowBulkPaste] = useState(false);
  const [bulkPasteText, setBulkPasteText] = useState('');
  const [issuedLogins, setIssuedLogins] = useState<IssuedStudentLogin[]>([]);
  const [kioskNewLogin, setKioskNewLogin] = useState<IssuedStudentLogin | null>(null);
  const [instantAccountMode, setInstantAccountMode] = useState<boolean>(true);
  const kioskInputRef = useRef<HTMLInputElement>(null);

  const copyTextQuick = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(`Copied ${label}!`);
    } catch {
      toast.error('Could not copy to clipboard.');
    }
  };

  const acceptAllSmartMatches = () => {
    let matchedCount = 0;
    setPendingQueue((prev) =>
      prev.map((row) => {
        if (row.matched_student_id) return row;
        const suggestion = findSmartCandidateMatches(row.full_name, directory, 1)[0];
        if (!suggestion) return row;
        matchedCount += 1;
        return {
          ...row,
          full_name: suggestion.full_name,
          parent_name: row.parent_name || suggestion.parent_name || undefined,
          parent_phone: row.parent_phone || suggestion.parent_phone || '',
          matched_student_id: suggestion.id,
          matched_label: suggestion.grade || suggestion.section_class || 'Existing',
          matched_verified: suggestion.parent_verified,
          consent_signed: suggestion.consent_signed,
        };
      }),
    );
    if (matchedCount > 0) {
      toast.success(`Auto-linked ${matchedCount} existing student record${matchedCount === 1 ? '' : 's'}!`);
    }
  };

  const queueCandidateDirect = (cand: DirectoryCandidate, phoneOverride?: string, gradeOverride?: string) => {
    const finalPhone = (phoneOverride !== undefined ? phoneOverride.trim() : cand.parent_phone || '') || '';
    const finalGrade = (gradeOverride?.trim()) || (lockGrade ? selectedGrade : (cand.grade || selectedGrade));
    const alreadyQueued = pendingQueue.some(
      (item) =>
        item.matched_student_id === cand.id ||
        item.full_name.trim().toLowerCase() === cand.full_name.trim().toLowerCase(),
    );
    if (!alreadyQueued) {
      const entry: PendingIntakeEntry = {
        localId: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        full_name: cand.full_name,
        grade: finalGrade,
        parent_name: cand.parent_name || undefined,
        parent_phone: finalPhone,
        matched_student_id: cand.id,
        matched_label: `${cand.consent_signed ? 'Consent Form' : cand.in_this_class ? 'In this class' : cand.section_class || 'Returning'}${cand.grade ? ` · ${cand.grade}` : ''}`,
        matched_verified: Boolean(cand.parent_verified),
        consent_signed: Boolean(cand.consent_signed),
      };
      setPendingQueue((prev) => [entry, ...prev]);
      setPassAroundAddedCount((c) => c + 1);
    }
    setAcknowledgeCandidate(null);
    setEditingAckPhone(false);
    setAckPhoneOverride('');
    setAckGradeOverride('');
    setFullName('');
    setParentPhone('');
    setSelectedCandidate(null);
    setShowSuggestions(false);
    setLastAddedName(cand.full_name);
    setKioskCelebration(cand.full_name);
    setTimeout(() => {
      setKioskCelebration(null);
      kioskInputRef.current?.focus();
    }, 1150);
  };

  // Organize / filter / sort controls for Tab 1 live sheet
  const [sheetSearch, setSheetSearch] = useState('');
  const [sheetFilter, setSheetFilter] = useState<'all' | 'missing_phone' | 'pending_verify' | 'verified' | 'old_session'>('all');
  const [sheetSort, setSheetSort] = useState<'name' | 'grade' | 'phone' | 'session'>('name');
  const [reinstatingId, setReinstatingId] = useState<string | null>(null);

  // Quick intake form + Smart Autocomplete + Zero-Lag Teacher Verification Queue
  const queueStorageKey = `rillcod:intake-queue:${classId}`;
  const [directory, setDirectory] = useState<DirectoryCandidate[]>([]);
  const [fullName, setFullName] = useState('');
  const [parentPhone, setParentPhone] = useState('');
  const [selectedCandidate, setSelectedCandidate] = useState<DirectoryCandidate | null>(null);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [pendingQueue, setPendingQueue] = useState<PendingIntakeEntry[]>(() => {
    if (typeof window === 'undefined') return [];
    try {
      const raw = window.localStorage.getItem(`rillcod:intake-queue:${classId}`);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  });
  const [committingBatch, setCommittingBatch] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const nameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/classes/${classId}/intake`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((json) => {
        if (!cancelled && Array.isArray(json?.candidates)) {
          setDirectory(json.candidates);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [classId]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(queueStorageKey, JSON.stringify(pendingQueue));
    } catch {
      /* ignore storage quota errors */
    }
  }, [pendingQueue, queueStorageKey]);

  // Guard browser Back / Reload / Tab close so nobody loses unsaved entries or exits Kiosk by mistake
  useEffect(() => {
    if (!passAroundMode && pendingQueue.length === 0) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [passAroundMode, pendingQueue.length]);

  const handleSafeClose = () => {
    if (pendingQueue.length > 0) {
      if (!confirm(`You have ${pendingQueue.length} unverified student entr${pendingQueue.length === 1 ? 'y' : 'ies'} in the queue. Close anyway? (Your queue stays saved locally until you return.)`)) {
        return;
      }
    } else if (issuedLogins.length > 0) {
      if (!confirm('Have you finished copying the new student login credentials? Close now?')) {
        return;
      }
    }
    onClose();
  };

  const liveSuggestions = useMemo(
    () => findSmartCandidateMatches(fullName, directory, 5),
    [fullName, directory],
  );

  const parsedBulkPreview = useMemo(
    () => parseSmartBulkLines(bulkPasteText, selectedGrade, directory),
    [bulkPasteText, selectedGrade, directory],
  );

  const handleQueueBulkLines = () => {
    if (parsedBulkPreview.length === 0) {
      toast.error('Paste at least one student name first.');
      return;
    }
    const existingNames = new Set(pendingQueue.map((p) => p.full_name.trim().toLowerCase()));
    const additions: PendingIntakeEntry[] = [];
    for (const item of parsedBulkPreview) {
      if (existingNames.has(item.full_name.trim().toLowerCase())) continue;
      existingNames.add(item.full_name.trim().toLowerCase());
      additions.push({
        localId: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}-${additions.length}`,
        full_name: item.full_name,
        grade: item.grade,
        parent_name: item.matched?.parent_name || undefined,
        parent_phone: item.parent_phone,
        matched_student_id: item.matched?.id ?? null,
        matched_label: item.matched
          ? `${item.matched.consent_signed ? 'Consent Form' : item.matched.in_this_class ? 'In this class' : item.matched.section_class || 'Existing'}${item.matched.grade ? ` · ${item.matched.grade}` : ''}`
          : null,
        matched_verified: Boolean(item.matched?.parent_verified),
        consent_signed: Boolean(item.matched?.consent_signed),
      });
    }
    if (additions.length === 0) {
      toast.info('All pasted students are already in your verification queue.');
      return;
    }
    setPendingQueue((prev) => [...additions, ...prev]);
    setBulkPasteText('');
    setShowBulkPaste(false);
    toast.success(`Added ${additions.length} student${additions.length === 1 ? '' : 's'} to Teacher Verification Queue — review and click Verify & Save All!`);
  };

  // Inline phone edit
  const [editingPhoneId, setEditingPhoneId] = useState<string | null>(null);
  const [editingPhoneValue, setEditingPhoneValue] = useState('');
  const [savingPhoneId, setSavingPhoneId] = useState<string | null>(null);

  // Cohort hygiene (Old vs New Session)
  const carryoverStudents = useMemo(
    () => students.filter((s) => s.session_status === 'carryover_unconfirmed'),
    [students],
  );
  const currentSessionStudents = useMemo(
    () => students.filter((s) => s.session_status !== 'carryover_unconfirmed'),
    [students],
  );
  const [selectedHygieneIds, setSelectedHygieneIds] = useState<Set<string>>(
    () => new Set(carryoverStudents.map((s) => s.id)),
  );
  const [destClassId, setDestClassId] = useState<string>(() =>
    suggestNextClass(className, classGradeKey, destinationClasses),
  );
  const [upgradeTargetGrade, setUpgradeTargetGrade] = useState<string>(defaultGrade);
  const [hygieneBusy, setHygieneBusy] = useState<string | null>(null);
  // 1-click Migrate / Adopt students from other classes or archive into THIS class
  const [adoptSearch, setAdoptSearch] = useState('');
  const [adoptSelectedIds, setAdoptSelectedIds] = useState<Set<string>>(new Set());
  const [adoptGrade, setAdoptGrade] = useState<string>(defaultGrade);
  const [adoptingBusy, setAdoptingBusy] = useState(false);

  const adoptableSchoolStudents = useMemo(() => {
    const q = adoptSearch.trim().toLowerCase();
    return directory
      .filter((c) => !c.in_this_class && !c.id.startsWith('consent:'))
      .filter((c) => {
        if (!q) return true;
        return `${c.full_name} ${c.grade || ''} ${c.section_class || ''}`.toLowerCase().includes(q);
      })
      .slice(0, 60);
  }, [directory, adoptSearch]);

  const handleAdoptIntoThisClass = async () => {
    const ids = Array.from(adoptSelectedIds);
    if (ids.length === 0) {
      toast.error('Select at least one student to adopt into this class.');
      return;
    }
    const chosen = directory.filter((c) => ids.includes(c.id));
    if (
      !confirm(
        `Migrate & adopt ${chosen.length} student${chosen.length === 1 ? '' : 's'} into ${className} as ${adoptGrade}?\n\nTheir grade, class roster, and CBT exam access will immediately switch to ${className}.`,
      )
    ) {
      return;
    }
    setAdoptingBusy(true);
    try {
      const res = await fetch(`/api/classes/${classId}/intake`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'intake_batch_commit',
          entries: chosen.map((c) => ({
            full_name: c.full_name,
            grade: adoptGrade,
            parent_name: c.parent_name || undefined,
            parent_phone: c.parent_phone || undefined,
            matched_student_id: c.id,
          })),
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'Could not adopt students.');
      toast.success(
        `Adopted ${json.committed ?? chosen.length} student${chosen.length === 1 ? '' : 's'} into ${className} (${adoptGrade})! Exams & rosters synced.`,
      );
      setAdoptSelectedIds(new Set());
      setAdoptSearch('');
      await onRefresh();
    } catch (err: any) {
      toast.error(err?.message || 'Adoption failed.');
    } finally {
      setAdoptingBusy(false);
    }
  };

  // Support mobile swipe-back & browser Back button cleanly:
  // Push history state ONCE on mount (using refs for latest state so updates never trigger history.back!).
  const closedByPopstateRef = useRef(false);
  const passAroundRef = useRef(passAroundMode);
  const pendingCountRef = useRef(pendingQueue.length);
  const onCloseRef = useRef(onClose);
  passAroundRef.current = passAroundMode;
  pendingCountRef.current = pendingQueue.length;
  onCloseRef.current = onClose;

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.history.pushState({ rillcodIntakeModal: true }, '');
    const onPopState = () => {
      if (passAroundRef.current) {
        if (!confirm('Stop Student Pass-Around Mode and return to Teacher View?')) {
          window.history.pushState({ rillcodIntakeModal: true }, '');
          return;
        }
        setPassAroundMode(false);
        setAcknowledgeCandidate(null);
        setKioskCelebration(null);
        setKioskNewLogin(null);
        window.history.pushState({ rillcodIntakeModal: true }, '');
        return;
      }
      if (pendingCountRef.current > 0) {
        if (!confirm(`You have ${pendingCountRef.current} unverified entries in the queue. Close anyway?`)) {
          window.history.pushState({ rillcodIntakeModal: true }, '');
          return;
        }
      }
      closedByPopstateRef.current = true;
      onCloseRef.current();
    };
    window.addEventListener('popstate', onPopState);
    return () => {
      window.removeEventListener('popstate', onPopState);
      if (!closedByPopstateRef.current && window.history.state?.rillcodIntakeModal) {
        window.history.back();
      }
    };
  }, []);

  const withPhoneCount = useMemo(
    () => students.filter((s) => Boolean(formatWhatsAppDigits(s.parent_phone))).length,
    [students],
  );
  const verifiedCount = useMemo(
    () => students.filter((s) => s.parent_verified).length,
    [students],
  );
  const isEntryClass = /\b(basic\s*1|primary\s*1|jss\s*1|ss\s*1)\b/i.test(`${classGradeKey || ''} ${className}`);

  const distinctSectionGrades = useMemo(() => {
    const set = new Set<string>(sectionGrades);
    for (const s of students) {
      const g = canonicalGrade(s.grade) || String(s.grade || '').trim();
      if (g) set.add(g);
    }
    return Array.from(set).sort(
      (a, b) =>
        (SINGLE_GRADES as readonly string[]).indexOf(a) - (SINGLE_GRADES as readonly string[]).indexOf(b) ||
        a.localeCompare(b),
    );
  }, [sectionGrades, students]);

  const filteredStudents = useMemo(() => {
    const q = sheetSearch.trim().toLowerCase();
    const list = students.filter((s) => {
      if (gradeFilter !== 'all') {
        const sg = canonicalGrade(s.grade) || String(s.grade || '').trim();
        if (sg !== gradeFilter) return false;
      }
      if (q) {
        const hay = `${s.full_name} ${s.grade || ''} ${s.parent_phone || ''} ${s.parent_name || ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      const hasPhone = Boolean(formatWhatsAppDigits(s.parent_phone));
      if (sheetFilter === 'missing_phone') return !hasPhone;
      if (sheetFilter === 'pending_verify') return hasPhone && !s.parent_verified;
      if (sheetFilter === 'verified') return Boolean(s.parent_verified);
      if (sheetFilter === 'old_session') return s.session_status === 'carryover_unconfirmed';
      return true;
    });
    return [...list].sort((a, b) => {
      if (sheetSort === 'grade') return (a.grade || '').localeCompare(b.grade || '') || a.full_name.localeCompare(b.full_name);
      if (sheetSort === 'phone') {
        const score = (s: IntakeStudentRow) => (s.parent_verified ? 0 : formatWhatsAppDigits(s.parent_phone) ? 1 : 2);
        return score(a) - score(b) || a.full_name.localeCompare(b.full_name);
      }
      if (sheetSort === 'session') {
        const score = (s: IntakeStudentRow) => (s.session_status === 'carryover_unconfirmed' ? 0 : 1);
        return score(a) - score(b) || a.full_name.localeCompare(b.full_name);
      }
      return a.full_name.localeCompare(b.full_name);
    });
  }, [students, sheetSearch, sheetFilter, sheetSort, gradeFilter]);

  const copyGroupWelcomeMessage = async () => {
    const origin = typeof window !== 'undefined' ? window.location.origin : 'https://www.rillcod.com';
    const msg =
      `Welcome to the ${className} (${currentSession}) Rillcod Academy Parents WhatsApp Group! 🎓\n\n` +
      `To verify your contact and check your child's progress reports & results anytime:\n` +
      `1. Visit ${origin}/result-check\n` +
      `2. Enter your child's RC Number (printed on their class card/sheet)\n` +
      `3. Confirm your phone number & complete your parent details once.\n\n` +
      `Thank you for partnering with Rillcod Technologies!`;
    try {
      await navigator.clipboard.writeText(msg);
      toast.success('Copied WhatsApp group welcome & verification message!');
    } catch {
      toast.error('Could not copy message.');
    }
  };

  const buildParentWhatsAppHref = (student: IntakeStudentRow): string | null => {
    const digits = formatWhatsAppDigits(student.parent_phone);
    if (!digits) return null;
    const origin = typeof window !== 'undefined' ? window.location.origin : 'https://www.rillcod.com';
    const rc = formatAccessCardCodeDisplay(accessCardCodeForStudent(student.id));
    const text =
      `Hello! This is Rillcod Academy (${className}, ${currentSession}). ` +
      `We registered ${student.full_name} in ${student.grade || className}. ` +
      `To verify your parent contact and view results anytime, please visit ${origin}/result-check ` +
      `using RC Number: ${rc}. Thank you!`;
    return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
  };

  const handleReinstateStudent = async (student: IntakeStudentRow) => {
    if (!confirm(`Bring ${student.full_name} back into ${className} for ${currentSession}?`)) return;
    setReinstatingId(student.id);
    try {
      const res = await fetch(`/api/classes/${classId}/intake`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'cohort_hygiene',
          operation: 'reinstate_withdrawn',
          student_ids: [student.id],
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'Could not reinstate student.');
      toast.success(json.message || `${student.full_name} reinstated!`);
      await onRefresh();
    } catch (err: any) {
      toast.error(err?.message || 'Reinstate failed.');
    } finally {
      setReinstatingId(null);
    }
  };

  const handleSelectCandidate = (c: DirectoryCandidate) => {
    setSelectedCandidate(c);
    setFullName(c.full_name);
    if (c.parent_phone) {
      setParentPhone(c.parent_phone);
    }
    if (!lockGrade && c.grade && (SINGLE_GRADES as readonly string[]).includes(c.grade)) {
      setSelectedGrade(c.grade);
    }
    setShowSuggestions(false);
  };

  // Smart submit:
  // - Matched existing / consent student → 0ms queue (no re-verification)
  // - Brand-new student when instantAccountMode is ON → creates account immediately & shows giant copyable Username + Password!
  // - Otherwise → 0ms queue for teacher post-entry verification
  const handleIntakeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = fullName.trim();
    if (trimmed.length < 2) {
      toast.error('Please enter the student full name.');
      (passAroundMode ? kioskInputRef : nameInputRef).current?.focus();
      return;
    }

    const effectivePhone = parentPhone.trim() || selectedCandidate?.parent_phone || '';
    if (requirePhone && !selectedCandidate?.parent_verified && !selectedCandidate?.consent_signed && !formatWhatsAppDigits(effectivePhone)) {
      toast.error('Please enter a valid 10+ digit parent WhatsApp phone number.');
      return;
    }

    // Smart auto-match if exact match exists in school directory
    let matched = selectedCandidate;
    if (!matched) {
      const exact = directory.find(
        (c) => c.full_name.trim().toLowerCase() === trimmed.toLowerCase(),
      );
      if (exact) matched = exact;
    }

    // If brand-new student (not in system) and instantAccountMode is enabled → create account immediately
    // so their Username & Password are super visible to copy right away!
    if (!matched && instantAccountMode) {
      setSubmitting(true);
      try {
        const res = await fetch(`/api/classes/${classId}/intake`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'intake_add',
            full_name: trimmed,
            grade: selectedGrade,
            parent_phone: effectivePhone || undefined,
          }),
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(json.error || 'Could not create student account.');
        const st = json.student;
        const cred: IssuedStudentLogin | null = st?.email
          ? {
              student_id: st.id,
              full_name: st.full_name || trimmed,
              grade: st.grade || selectedGrade,
              email: st.email,
              password: st.password ?? null,
              rc_code: st.rc_code || formatAccessCardCodeDisplay(accessCardCodeForStudent(st.id)),
            }
          : null;
        if (cred) {
          setIssuedLogins((prev) => [cred, ...prev.filter((p) => p.student_id !== cred.student_id)]);
        }
        setFullName('');
        setParentPhone('');
        setSelectedCandidate(null);
        setShowSuggestions(false);
        setLastAddedName(st?.full_name || trimmed);
        if (passAroundMode) {
          setPassAroundAddedCount((c) => c + 1);
          if (cred && json.created) {
            setKioskNewLogin(cred);
          } else {
            setKioskCelebration(st?.full_name || trimmed);
            setTimeout(() => {
              setKioskCelebration(null);
              kioskInputRef.current?.focus();
            }, 1150);
          }
        } else {
          toast.success(`${st?.full_name || trimmed} account created — login credentials shown below!`);
          setTimeout(() => nameInputRef.current?.focus(), 20);
        }
        await onRefresh();
      } catch (err: any) {
        toast.error(err?.message || 'Could not create account.');
      } finally {
        setSubmitting(false);
      }
      return;
    }

    // Prevent duplicate entries in the local queue
    const alreadyQueued = pendingQueue.some(
      (item) => item.full_name.trim().toLowerCase() === trimmed.toLowerCase(),
    );
    if (alreadyQueued) {
      toast.info(`${trimmed} is already in the verification queue below.`);
      setFullName('');
      setParentPhone('');
      setSelectedCandidate(null);
      setTimeout(() => (passAroundMode ? kioskInputRef : nameInputRef).current?.focus(), 20);
      return;
    }

    const entry: PendingIntakeEntry = {
      localId: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      full_name: matched?.full_name || trimmed,
      grade: selectedGrade,
      parent_name: matched?.parent_name || undefined,
      parent_phone: effectivePhone,
      matched_student_id: matched?.id ?? null,
      matched_label: matched
        ? `${matched.in_this_class ? 'In this class' : matched.section_class || 'Returning'}${matched.grade ? ` · ${matched.grade}` : ''}`
        : null,
      matched_verified: Boolean(matched?.parent_verified),
      consent_signed: Boolean(matched?.consent_signed),
    };

    setPendingQueue((prev) => [entry, ...prev]);
    setFullName('');
    setParentPhone('');
    setSelectedCandidate(null);
    setShowSuggestions(false);
    setLastAddedName(entry.full_name);
    if (passAroundMode) {
      setPassAroundAddedCount((c) => c + 1);
      setKioskCelebration(entry.full_name);
      setTimeout(() => {
        setKioskCelebration(null);
        kioskInputRef.current?.focus();
      }, 1150);
    } else {
      setTimeout(() => nameInputRef.current?.focus(), 20);
    }
  };

  const handleCommitVerifiedQueue = async () => {
    if (pendingQueue.length === 0) return;
    setCommittingBatch(true);
    setSubmitting(true);
    try {
      const res = await fetch(`/api/classes/${classId}/intake`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'intake_batch_commit',
          entries: pendingQueue.map((item) => ({
            full_name: item.full_name,
            grade: item.grade,
            parent_name: item.parent_name || undefined,
            parent_phone: item.parent_phone || undefined,
            matched_student_id: item.matched_student_id,
          })),
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'Could not save verified batch.');
      if (Array.isArray(json.created_credentials) && json.created_credentials.length > 0) {
        setIssuedLogins((prev) => [...json.created_credentials, ...prev]);
      }
      toast.success(json.message || `Verified & saved ${pendingQueue.length} students!`);
      setPendingQueue([]);
      setLastAddedName(null);
      await onRefresh();
    } catch (err: any) {
      toast.error(err?.message || 'Batch verification failed.');
    } finally {
      setCommittingBatch(false);
      setSubmitting(false);
    }
  };

  const handleInlinePhoneSave = async (studentId: string) => {
    setSavingPhoneId(studentId);
    try {
      const res = await fetch(`/api/classes/${classId}/intake`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          student_id: studentId,
          parent_phone: editingPhoneValue.trim(),
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'Could not update phone.');
      toast.success('Parent phone updated.');
      setEditingPhoneId(null);
      await onRefresh();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to update phone.');
    } finally {
      setSavingPhoneId(null);
    }
  };

  const copyWhatsAppNumbers = async () => {
    const nums = students
      .map((s) => formatWhatsAppDigits(s.parent_phone))
      .filter((v): v is string => Boolean(v))
      .map((d) => `+${d}`);
    if (nums.length === 0) {
      toast.error('No parent phone numbers captured in this class yet.');
      return;
    }
    try {
      await navigator.clipboard.writeText(nums.join('\n'));
      toast.success(`Copied ${nums.length} WhatsApp parent number${nums.length === 1 ? '' : 's'}!`);
    } catch {
      toast.error('Could not copy to clipboard.');
    }
  };

  const downloadWhatsAppVCard = () => {
    const entries = students
      .map((s) => ({ student: s, digits: formatWhatsAppDigits(s.parent_phone) }))
      .filter((item): item is { student: IntakeStudentRow; digits: string } => Boolean(item.digits));
    if (entries.length === 0) {
      toast.error('No parent phone numbers captured in this class yet.');
      return;
    }
    const vcf = entries
      .map(({ student, digits }) => {
        const label = `Parent of ${student.full_name} (${student.grade || className})`;
        return [
          'BEGIN:VCARD',
          'VERSION:3.0',
          `FN:${label}`,
          `N:${label};;;;`,
          `TEL;TYPE=CELL,VOICE:+${digits}`,
          `ORG:Rillcod Academy - ${className}`,
          `NOTE:Student: ${student.full_name} | Class: ${className} | Session: ${currentSession}`,
          'END:VCARD',
        ].join('\r\n');
      })
      .join('\r\n');
    const blob = new Blob([vcf], { type: 'text/vcard;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${className.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}-whatsapp-parents.vcf`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`Downloaded ${entries.length} WhatsApp contact${entries.length === 1 ? '' : 's'} (.vcf) — open on phone to import into Contacts.`);
  };

  const exportIntakeCsv = () => {
    const header = ['S/N', 'Full Name', 'Grade', 'Parent Phone', 'WhatsApp Format', 'Parent Status', 'Session Status', 'RC Code'];
    const rows = students.map((s, idx) => {
      const wa = formatWhatsAppDigits(s.parent_phone);
      const pStatus = s.parent_verified
        ? 'Parent Verified'
        : wa
        ? 'Pending Parent Verification'
        : 'No Phone Yet';
      const sStatus = s.session_status === 'carryover_unconfirmed'
        ? 'Prior Session (Unconfirmed)'
        : `Active (${currentSession})`;
      const rc = formatAccessCardCodeDisplay(accessCardCodeForStudent(s.id));
      return [
        String(idx + 1),
        s.full_name,
        s.grade || classGradeKey || className,
        s.parent_phone || '',
        wa ? `+${wa}` : '',
        pStatus,
        sStatus,
        rc,
      ];
    });
    const csv = [header, ...rows]
      .map((r) => r.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
      .join('\r\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${className.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}-class-intake-${currentSession.replace('/', '-')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`Exported ${students.length} student record${students.length === 1 ? '' : 's'} to CSV.`);
  };

  const runCohortHygiene = async (
    operation: 'confirm_current' | 'archive_old' | 'promote_to_class' | 'sync_grades_to_class',
    explicitIds?: string[],
  ) => {
    const ids = explicitIds ?? Array.from(selectedHygieneIds);
    if (ids.length === 0) {
      toast.error('Select at least one student first.');
      return;
    }
    if (operation === 'promote_to_class' && !destClassId) {
      toast.error('Choose the destination class first.');
      return;
    }
    const labelMap = {
      confirm_current: `Confirm ${ids.length} student(s) as active in ${className} for ${currentSession}?`,
      archive_old: `Archive ${ids.length} prior-session student(s) out of ${className}'s active roster? Their past results and certificates stay 100% safe.`,
      promote_to_class: `Move ${ids.length} student(s) to the selected next class for ${currentSession}?`,
      sync_grades_to_class: `Upgrade ${ids.length} student(s) (including consent-form records) to ${upgradeTargetGrade} in ${className}?`,
    };
    if (!confirm(labelMap[operation])) return;

    setHygieneBusy(operation);
    try {
      const res = await fetch(`/api/classes/${classId}/intake`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'cohort_hygiene',
          operation,
          student_ids: ids,
          destination_class_id: operation === 'promote_to_class' ? destClassId : undefined,
          target_grade: operation === 'sync_grades_to_class' ? upgradeTargetGrade : undefined,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'Could not update session cohort.');
      toast.success(json.message || 'Session cohort updated.');
      setSelectedHygieneIds(new Set());
      await onRefresh();
    } catch (err: any) {
      toast.error(err?.message || 'Cohort cleanup failed.');
    } finally {
      setHygieneBusy(null);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`${className} Digital Class Intake and Session Workspace`}
      className="fixed inset-0 z-[9990] bg-background flex flex-col overflow-hidden"
    >
      {/* FULL-SCREEN ZERO-DISTRACTION KID-FRIENDLY PASS-AROUND KIOSK */}
      {passAroundMode && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Student Pass-Around Check-In"
          className="fixed inset-0 z-[9995] bg-background flex flex-col overflow-y-auto"
        >
          {/* Minimal distraction-free top bar */}
          <div className="px-4 sm:px-6 py-3 border-b border-border bg-card flex items-center justify-between gap-3 shrink-0">
            <div className="flex items-center gap-2.5 min-w-0">
              <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground font-black text-sm">
                RC
              </span>
              <div className="min-w-0">
                <p className="text-xs sm:text-sm font-black text-foreground truncate">
                  {className} {lockGrade ? `· ${selectedGrade}` : ''}
                </p>
                <p className="text-[11px] font-semibold text-muted-foreground">
                  {passAroundAddedCount > 0
                    ? `${passAroundAddedCount} classmate${passAroundAddedCount === 1 ? '' : 's'} checked in`
                    : `${currentSession} Class Check-In`}
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => {
                if (passAroundAddedCount > 0 && !confirmingExit) {
                  setConfirmingExit(true);
                  setTimeout(() => setConfirmingExit(false), 3500);
                  return;
                }
                setConfirmingExit(false);
                setPassAroundMode(false);
                setKioskCelebration(null);
                setAcknowledgeCandidate(null);
              }}
              className={`shrink-0 inline-flex items-center gap-1.5 min-h-10 px-3.5 py-2 rounded-xl border text-xs font-black transition-colors ${
                confirmingExit
                  ? 'border-amber-600 bg-amber-600 text-white shadow-sm'
                  : 'border-border bg-muted hover:bg-muted/80 text-foreground'
              }`}
            >
              {confirmingExit
                ? `Tap Again to Finish (${pendingQueue.length})`
                : `Teacher Finish (${pendingQueue.length})`}
            </button>
          </div>

          {/* Center Kid-Friendly Card */}
          <div className="flex-1 flex items-center justify-center p-4 sm:p-8">
            <div className="w-full max-w-2xl">
              {kioskNewLogin ? (
                <div className="rounded-3xl border-2 border-emerald-500 bg-card p-6 sm:p-8 shadow-2xl space-y-5">
                  <div className="text-center space-y-1.5">
                    <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-700 text-white shadow-md">
                      <CheckCircleIcon className="w-8 h-8" />
                    </div>
                    <p className="text-xs font-black uppercase tracking-widest text-emerald-700 dark:text-emerald-400">
                      Account Created — Save Your Login Details
                    </p>
                    <h2 className="text-2xl sm:text-3xl font-black text-foreground">
                      {kioskNewLogin.full_name}
                    </h2>
                    <p className="text-xs sm:text-sm text-muted-foreground">
                      Copy or write down your username and password below before passing the device!
                    </p>
                  </div>

                  <div className="space-y-3">
                    <div className="rounded-2xl border-2 border-primary/30 bg-primary/[0.06] p-4 flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-[10px] font-black uppercase tracking-widest text-primary">
                          Username / Login Email
                        </p>
                        <p className="text-lg sm:text-xl font-mono font-black text-foreground break-all mt-0.5">
                          {kioskNewLogin.email}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => void copyTextQuick(kioskNewLogin.email, 'Username')}
                        className="shrink-0 min-h-11 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-xs font-black uppercase tracking-wider shadow-sm"
                      >
                        Copy
                      </button>
                    </div>

                    {kioskNewLogin.password && (
                      <div className="rounded-2xl border-2 border-emerald-500/40 bg-emerald-500/[0.08] p-4 flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-[10px] font-black uppercase tracking-widest text-emerald-800 dark:text-emerald-300">
                            Password
                          </p>
                          <p className="text-xl sm:text-2xl font-mono font-black text-foreground mt-0.5">
                            {kioskNewLogin.password}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => void copyTextQuick(kioskNewLogin.password!, 'Password')}
                          className="shrink-0 min-h-11 px-4 py-2 rounded-xl bg-emerald-700 text-white text-xs font-black uppercase tracking-wider shadow-sm"
                        >
                          Copy
                        </button>
                      </div>
                    )}

                    <div className="rounded-2xl border border-border bg-muted/40 px-4 py-3 flex items-center justify-between gap-3">
                      <div>
                        <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                          Student RC Number (For Results)
                        </p>
                        <p className="text-base font-mono font-black text-foreground mt-0.5">
                          {kioskNewLogin.rc_code}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() =>
                          void copyTextQuick(
                            `${kioskNewLogin.full_name}\nUsername: ${kioskNewLogin.email}\nPassword: ${kioskNewLogin.password || ''}\nRC Code: ${kioskNewLogin.rc_code}`,
                            'All Login Details',
                          )
                        }
                        className="shrink-0 min-h-10 px-3 py-1.5 rounded-xl border border-border bg-card text-xs font-black text-foreground hover:bg-muted"
                      >
                        Copy All
                      </button>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      setKioskNewLogin(null);
                      setTimeout(() => kioskInputRef.current?.focus(), 20);
                    }}
                    className="w-full h-16 rounded-2xl bg-emerald-700 hover:bg-emerald-800 text-white text-lg font-black uppercase tracking-wider shadow-lg transition-all active:scale-[0.99]"
                  >
                    I&apos;ve Copied It — Next Classmate →
                  </button>
                </div>
              ) : kioskCelebration ? (
                <button
                  type="button"
                  onClick={() => {
                    setKioskCelebration(null);
                    setTimeout(() => kioskInputRef.current?.focus(), 20);
                  }}
                  className="w-full rounded-3xl border-2 border-emerald-500 bg-emerald-500/10 p-8 sm:p-12 text-center space-y-3 shadow-xl"
                >
                  <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-700 text-white shadow-lg">
                    <CheckCircleIcon className="w-10 h-10" />
                  </div>
                  <h2 className="text-2xl sm:text-3xl font-black text-foreground">
                    Well done, {kioskCelebration}!
                  </h2>
                  <p className="text-base sm:text-lg font-bold text-emerald-800 dark:text-emerald-300">
                    Pass the device to your next classmate 👉
                  </p>
                  <p className="text-xs text-muted-foreground pt-2">
                    Tap anywhere to continue immediately
                  </p>
                </button>
              ) : acknowledgeCandidate ? (
                <div className="rounded-3xl border-2 border-emerald-500/50 bg-card p-6 sm:p-8 shadow-2xl space-y-5 text-center">
                  <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-700 text-white shadow-md">
                    <ShieldCheckIcon className="w-8 h-8" />
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs font-black uppercase tracking-widest text-emerald-700 dark:text-emerald-400">
                      {acknowledgeCandidate.consent_signed
                        ? 'Parent Consent Form Found ✓'
                        : 'Student Record Found ✓'}
                    </p>
                    <h2 className="text-2xl sm:text-3xl font-black text-foreground">
                      {acknowledgeCandidate.full_name}
                    </h2>
                  </div>

                  <div className="rounded-2xl border border-border bg-muted/40 p-4 text-left space-y-2.5 text-sm">
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-muted-foreground font-semibold">Current Class / Grade</span>
                        <span className="font-black text-foreground">
                          {ackGradeOverride || (lockGrade ? selectedGrade : (acknowledgeCandidate.grade || selectedGrade))}
                        </span>
                      </div>
                      {!lockGrade && (
                        <div className="flex flex-wrap gap-1.5 pt-0.5">
                          {(sectionGrades.length > 1 ? sectionGrades : SINGLE_GRADES.slice(0, 6)).map((g) => {
                            const active = (ackGradeOverride || acknowledgeCandidate.grade || selectedGrade) === g;
                            return (
                              <button
                                key={g}
                                type="button"
                                onClick={() => setAckGradeOverride(g)}
                                className={`px-2.5 py-1 rounded-lg border text-xs font-black transition-colors ${
                                  active
                                    ? 'border-primary bg-primary text-primary-foreground'
                                    : 'border-border bg-card text-foreground hover:border-primary/50'
                                }`}
                              >
                                {g}
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                    {acknowledgeCandidate.parent_name && (
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-muted-foreground font-semibold">Parent / Guardian</span>
                        <span className="font-bold text-foreground">{acknowledgeCandidate.parent_name}</span>
                      </div>
                    )}
                    <div className="space-y-1.5 pt-1 border-t border-border/60">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-muted-foreground font-semibold">Parent WhatsApp</span>
                        {!editingAckPhone && (
                          <button
                            type="button"
                            onClick={() => {
                              setAckPhoneOverride(acknowledgeCandidate.parent_phone || '');
                              setEditingAckPhone(true);
                            }}
                            className="text-[11px] font-black text-primary hover:underline"
                          >
                            Change number
                          </button>
                        )}
                      </div>
                      {editingAckPhone ? (
                        <input
                          type="tel"
                          aria-label="Update parent WhatsApp number"
                          value={ackPhoneOverride}
                          onChange={(e) => setAckPhoneOverride(e.target.value)}
                          placeholder="0801 234 5678"
                          autoFocus
                          className="w-full h-12 rounded-xl border-2 border-primary bg-background px-3.5 text-base font-mono font-bold text-foreground"
                        />
                      ) : (
                        <p className="text-lg sm:text-xl font-mono font-black text-emerald-700 dark:text-emerald-400 tracking-wide">
                          {acknowledgeCandidate.parent_phone || 'Not added yet'}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="space-y-2.5 pt-1">
                    <button
                      type="button"
                      onClick={() =>
                        queueCandidateDirect(
                          acknowledgeCandidate,
                          editingAckPhone ? ackPhoneOverride : undefined,
                          ackGradeOverride || undefined,
                        )
                      }
                      className="w-full h-16 rounded-2xl bg-emerald-700 hover:bg-emerald-800 text-white text-lg font-black uppercase tracking-wider shadow-lg transition-all active:scale-[0.99]"
                    >
                      Yes, This Is My Record — Confirm ✓
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setAcknowledgeCandidate(null);
                        setEditingAckPhone(false);
                        setAckPhoneOverride('');
                        setTimeout(() => kioskInputRef.current?.focus(), 20);
                      }}
                      className="w-full h-12 rounded-xl border border-border bg-muted/50 hover:bg-muted text-xs font-black uppercase tracking-wider text-muted-foreground hover:text-foreground"
                    >
                      Not Me — Go Back
                    </button>
                  </div>
                </div>
              ) : (
                <form
                  onSubmit={handleIntakeSubmit}
                  className="rounded-3xl border-2 border-primary/30 bg-card p-6 sm:p-8 shadow-2xl space-y-5"
                >
                  <div className="text-center space-y-2">
                    <div className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-[11px] font-black uppercase tracking-widest text-primary">
                      <span>1. Type Name</span>
                      <span className="opacity-40">→</span>
                      <span>{fullName.trim().length >= 2 ? '2. Tap Name or Done' : '2. Confirm'}</span>
                    </div>
                    <h2 className="text-2xl sm:text-3xl font-black text-foreground">
                      What is your full name?
                    </h2>
                    <p className="text-xs sm:text-sm text-muted-foreground">
                      Type slowly — if your name appears below, tap it!
                    </p>
                  </div>

                  {/* Giant Name Input */}
                  <div className="space-y-2">
                    <input
                      ref={kioskInputRef}
                      type="text"
                      required
                      autoFocus
                      autoComplete="off"
                      aria-label="Your full name"
                      value={fullName}
                      onChange={(e) => {
                        setFullName(e.target.value);
                        setSelectedCandidate(null);
                      }}
                      placeholder="e.g. Chinedu Okafor"
                      className="w-full h-16 rounded-2xl border-2 border-primary/40 bg-background px-5 text-xl sm:text-2xl font-black text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/15"
                    />

                    {/* Direct Giant Tap-to-Check-In Suggestion Cards */}
                    {liveSuggestions.length > 0 && !selectedCandidate && (
                      <div className="space-y-2 pt-1">
                        <p className="text-[11px] font-black uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
                          👇 Tap your name if you see it:
                        </p>
                        <div className="space-y-2">
                          {liveSuggestions.slice(0, 4).map((cand) => {
                            const hasPhoneOrConsent = cand.consent_signed || cand.parent_verified || Boolean(cand.parent_phone);
                            return (
                              <button
                                key={cand.id}
                                type="button"
                                onClick={() => {
                                  // Existing / Consent record with contact on file → Child Acknowledge screen (zero duplicates!)
                                  if (hasPhoneOrConsent) {
                                    setAcknowledgeCandidate(cand);
                                  } else {
                                    handleSelectCandidate(cand);
                                  }
                                }}
                                className="w-full min-h-14 rounded-2xl border-2 border-emerald-500/40 bg-emerald-500/[0.08] hover:bg-emerald-500/15 px-4 py-3 text-left flex items-center justify-between gap-3 transition-all active:scale-[0.99]"
                              >
                                <div className="min-w-0">
                                  <p className="text-base sm:text-lg font-black text-foreground truncate">
                                    {cand.full_name}
                                  </p>
                                  <p className="text-xs font-semibold text-muted-foreground truncate">
                                    {cand.grade || cand.section_class || className}
                                    {cand.consent_signed
                                      ? ' · Parent consent form on file ✓'
                                      : hasPhoneOrConsent
                                      ? ' · Record already in system ✓'
                                      : ' · Tap to select'}
                                  </p>
                                </div>
                                <span className="shrink-0 rounded-xl bg-emerald-700 px-3 py-2 text-xs font-black uppercase tracking-wider text-white shadow-sm">
                                  {hasPhoneOrConsent ? "That's Me ✓" : 'Select'}
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Progressive Reveal: only show Grade / Phone / Submit once child starts typing */}
                  {fullName.trim().length >= 2 && (
                    <div className="space-y-4 pt-1 border-t border-border/60">
                      {/* Grade selector ONLY if teacher did not lock the grade */}
                      {!lockGrade && (
                        <div className="space-y-2">
                          <label className="block text-xs font-black uppercase tracking-wider text-muted-foreground">
                            Tap Your Grade / Class *
                          </label>
                          {sectionGrades.length > 1 && (
                            <div className="grid grid-cols-3 gap-2">
                              {sectionGrades.map((g) => (
                                <button
                                  key={g}
                                  type="button"
                                  onClick={() => setSelectedGrade(g)}
                                  className={`min-h-12 rounded-2xl border-2 text-sm sm:text-base font-black transition-all ${
                                    selectedGrade === g
                                      ? 'border-primary bg-primary text-primary-foreground shadow-md'
                                      : 'border-border bg-background text-foreground hover:border-primary/50'
                                  }`}
                                >
                                  {g}
                                </button>
                              ))}
                            </div>
                          )}
                          <select
                            aria-label="Your grade"
                            value={selectedGrade}
                            onChange={(e) => setSelectedGrade(e.target.value)}
                            className={`w-full rounded-2xl border-2 border-border bg-background px-4 font-bold text-foreground ${
                              sectionGrades.length > 1 ? 'h-11 text-xs text-muted-foreground' : 'h-14 text-lg'
                            }`}
                          >
                            {SINGLE_GRADES.map((g) => (
                              <option key={g} value={g}>{sectionGrades.length > 1 ? `Other grade: ${g}` : g}</option>
                            ))}
                          </select>
                        </div>
                      )}

                      {/* Parent WhatsApp Phone Input (silent optionality — never tells kids to skip!) */}
                      <div>
                        <label className="block text-xs font-black uppercase tracking-wider text-muted-foreground mb-1.5">
                          Parent WhatsApp Number
                          {requirePhone && <span className="text-rose-600 dark:text-rose-400"> *</span>}
                        </label>
                        <input
                          type="tel"
                          required={requirePhone}
                          aria-label="Parent WhatsApp number"
                          value={parentPhone}
                          onChange={(e) => setParentPhone(e.target.value)}
                          placeholder="0801 234 5678"
                          className="w-full h-14 rounded-2xl border-2 border-border bg-background px-5 text-lg font-bold text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:border-primary"
                        />
                      </div>

                      {/* Giant Submit Button */}
                      <button
                        type="submit"
                        disabled={submitting || fullName.trim().length < 2}
                        className="w-full h-16 rounded-2xl bg-primary hover:bg-primary/90 disabled:opacity-40 text-primary-foreground text-lg sm:text-xl font-black uppercase tracking-wider shadow-lg transition-all active:scale-[0.99]"
                      >
                        {submitting ? 'Creating Account…' : 'Done — Next Classmate →'}
                      </button>
                    </div>
                  )}
                </form>
              )}
            </div>
          </div>
        </div>
      )}
      {/* Crisp 2-row sticky mobile & desktop header — always visible Back button, zero screen crowding */}
      <div className="sticky top-0 z-30 bg-card border-b border-border shrink-0 shadow-sm">
        {/* Row 1: Always-visible Back button + Class Title + Close */}
        <div className="max-w-5xl mx-auto px-3 sm:px-5 py-2.5 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5 min-w-0">
            <button
              type="button"
              onClick={handleSafeClose}
              aria-label="Go back to class"
              className="shrink-0 inline-flex items-center gap-1.5 min-h-10 px-3 py-1.5 rounded-xl bg-muted hover:bg-muted/80 border border-border text-xs font-black text-foreground transition-colors"
            >
              <ArrowLeftIcon className="w-4 h-4" />
              <span>Back</span>
            </button>
            <div className="min-w-0">
              <h3 className="text-sm sm:text-base font-black text-foreground truncate">
                {className}
              </h3>
              <div className="flex items-center gap-1.5 text-[10px] font-bold text-muted-foreground truncate">
                <span className="text-primary font-black">
                  {isMultiGradeSection
                    ? `${sectionGrades[0]}–${sectionGrades[sectionGrades.length - 1]}`
                    : selectedGrade}
                </span>
                <span>·</span>
                <span>{currentSession}</span>
                {carryoverStudents.length > 0 && (
                  <>
                    <span>·</span>
                    <span className="text-amber-700 dark:text-amber-300 font-black">
                      {carryoverStudents.length} old session
                    </span>
                  </>
                )}
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={handleSafeClose}
            aria-label="Close digital class sheet"
            className="shrink-0 inline-flex h-10 w-10 items-center justify-center rounded-xl border border-border bg-background text-muted-foreground hover:text-foreground hover:bg-muted"
          >
            <XMarkIcon className="w-5 h-5" />
          </button>
        </div>

        {/* Row 2: Clean full-width mobile segmented tabs */}
        {!passAroundMode && (
          <div className="max-w-5xl mx-auto px-3 sm:px-5 pb-2.5">
            <div className="grid grid-cols-2 gap-1 rounded-xl bg-muted p-1 border border-border">
              <button
                type="button"
                onClick={() => setTab('intake')}
                className={`min-h-9 px-3 py-1.5 rounded-lg text-[11px] font-black uppercase tracking-wider transition-all ${
                  tab === 'intake'
                    ? 'bg-primary text-primary-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                Intake &amp; WhatsApp
              </button>
              <button
                type="button"
                onClick={() => setTab('hygiene')}
                className={`min-h-9 px-3 py-1.5 rounded-lg text-[11px] font-black uppercase tracking-wider transition-all inline-flex items-center justify-center gap-1.5 ${
                  tab === 'hygiene'
                    ? 'bg-primary text-primary-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                Old vs New Session
                {carryoverStudents.length > 0 && (
                  <span className={`px-1.5 py-0.5 rounded-full text-[9px] font-black ${
                    tab === 'hygiene' ? 'bg-white/20 text-white' : 'bg-amber-500 text-black'
                  }`}>
                    {carryoverStudents.length}
                  </span>
                )}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Scrollable full-screen content container */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-5xl mx-auto w-full">

      {/* TAB 1: DIGITAL INTAKE & WHATSAPP CONTACT LIST */}
      {tab === 'intake' && (
        <div className="p-4 sm:p-6 space-y-5">
          {/* Newly Created Student Login Credentials Banner (Very Visible & 1-Tap Copy) */}
          {issuedLogins.length > 0 && (
            <div className="rounded-2xl border-2 border-emerald-500/50 bg-emerald-500/[0.06] p-4 sm:p-5 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-xs font-black uppercase tracking-widest text-emerald-800 dark:text-emerald-300">
                    ✓ New Student Login Credentials Ready ({issuedLogins.length})
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Share or copy these usernames and passwords so students can log in immediately.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      void copyTextQuick(
                        issuedLogins
                          .map(
                            (c, idx) =>
                              `${idx + 1}. ${c.full_name} (${c.grade || className}) — Username: ${c.email} | Password: ${c.password || 'N/A'} | RC: ${c.rc_code}`,
                          )
                          .join('\n'),
                        'All New Credentials',
                      )
                    }
                    className="min-h-9 px-3 py-1.5 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white text-[11px] font-black uppercase tracking-wider shadow-sm"
                  >
                    Copy All Logins
                  </button>
                  <button
                    type="button"
                    onClick={() => setIssuedLogins([])}
                    className="min-h-9 px-2.5 py-1.5 rounded-lg border border-border bg-card text-[11px] font-bold text-muted-foreground hover:text-foreground"
                  >
                    Dismiss
                  </button>
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                {issuedLogins.map((c) => (
                  <div
                    key={c.student_id}
                    className="rounded-xl border border-emerald-500/30 bg-card p-3 flex flex-col gap-2"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-black text-foreground truncate">{c.full_name}</span>
                      <span className="rounded bg-muted px-2 py-0.5 text-[10px] font-mono font-bold text-muted-foreground">
                        {c.rc_code}
                      </span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                      <div className="rounded-lg bg-muted/50 px-2.5 py-1.5 flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <span className="block text-[9px] font-black uppercase text-muted-foreground">Username</span>
                          <span className="font-mono font-bold text-foreground break-all">{c.email}</span>
                        </div>
                        <button
                          type="button"
                          onClick={() => void copyTextQuick(c.email, 'Username')}
                          className="shrink-0 px-2 py-1 rounded bg-primary text-primary-foreground text-[10px] font-black uppercase"
                        >
                          Copy
                        </button>
                      </div>
                      <div className="rounded-lg bg-muted/50 px-2.5 py-1.5 flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <span className="block text-[9px] font-black uppercase text-muted-foreground">Password</span>
                          <span className="font-mono font-black text-emerald-700 dark:text-emerald-400">
                            {c.password || 'Existing'}
                          </span>
                        </div>
                        {c.password && (
                          <button
                            type="button"
                            onClick={() => void copyTextQuick(c.password!, 'Password')}
                            className="shrink-0 px-2 py-1 rounded bg-emerald-700 text-white text-[10px] font-black uppercase"
                          >
                            Copy
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          {/* Teacher Grade Lock + Pass-Around Student Entry Toggle */}
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-muted/40 p-3">
            <div className="flex flex-wrap items-center gap-2.5">
              <button
                type="button"
                onClick={() => setLockGrade((v) => !v)}
                className={`inline-flex items-center gap-1.5 min-h-9 px-3 py-1.5 rounded-lg border text-xs font-black transition-colors ${
                  lockGrade
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-border bg-card text-foreground hover:bg-muted'
                }`}
              >
                {lockGrade ? <LockClosedIcon className="w-3.5 h-3.5" /> : <LockOpenIcon className="w-3.5 h-3.5" />}
                {lockGrade ? `Grade Locked: ${selectedGrade}` : 'Student Picks Grade'}
              </button>
              {lockGrade && (
                <select
                  aria-label="Locked class grade"
                  value={selectedGrade}
                  onChange={(e) => setSelectedGrade(e.target.value)}
                  className="min-h-9 rounded-lg border border-border bg-card px-2.5 py-1 text-xs font-bold text-foreground"
                >
                  {SINGLE_GRADES.map((g) => (
                    <option key={g} value={g}>{g}</option>
                  ))}
                </select>
              )}
              <button
                type="button"
                onClick={() => setRequirePhone((v) => !v)}
                className={`inline-flex items-center gap-1.5 min-h-9 px-3 py-1.5 rounded-lg border text-xs font-black transition-colors ${
                  requirePhone
                    ? 'border-amber-600 bg-amber-500/15 text-amber-900 dark:text-amber-200'
                    : 'border-border bg-card text-muted-foreground hover:text-foreground'
                }`}
              >
                <PhoneIcon className="w-3.5 h-3.5" />
                {requirePhone ? 'WhatsApp No: Required' : 'WhatsApp No: Flexible'}
              </button>
              <button
                type="button"
                onClick={() => setInstantAccountMode((v) => !v)}
                className={`inline-flex items-center gap-1.5 min-h-9 px-3 py-1.5 rounded-lg border text-xs font-black transition-colors ${
                  instantAccountMode
                    ? 'border-emerald-600 bg-emerald-500/15 text-emerald-900 dark:text-emerald-200'
                    : 'border-border bg-card text-muted-foreground hover:text-foreground'
                }`}
              >
                <ShieldCheckIcon className="w-3.5 h-3.5" />
                {instantAccountMode ? 'New Kids: Show Login Immediately' : 'New Kids: Queue for Review'}
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setShowBulkPaste((v) => !v)}
                className={`inline-flex items-center gap-1.5 min-h-9 px-3 py-1.5 rounded-lg border text-xs font-black uppercase tracking-wider transition-colors ${
                  showBulkPaste
                    ? 'border-primary bg-primary text-primary-foreground shadow-sm'
                    : 'border-primary/40 bg-primary/10 text-primary hover:bg-primary/20'
                }`}
              >
                <ClipboardDocumentListIcon className="w-4 h-4" />
                {showBulkPaste ? 'Hide Bulk Paste' : 'Bulk Paste List'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setPassAroundMode((v) => !v);
                  setLastAddedName(null);
                }}
                className={`inline-flex items-center gap-1.5 min-h-9 px-3.5 py-1.5 rounded-lg text-xs font-black uppercase tracking-wider transition-colors ${
                  passAroundMode
                    ? 'bg-emerald-700 hover:bg-emerald-800 text-white shadow-sm'
                    : 'border border-emerald-600/40 bg-emerald-500/10 text-emerald-800 dark:text-emerald-300 hover:bg-emerald-500/20'
                }`}
              >
                <UserGroupIcon className="w-4 h-4" />
                {passAroundMode ? 'Exit Pass-Around Mode' : 'Student Pass-Around Mode'}
              </button>
            </div>
          </div>

          {/* Smart Bulk Paste Registration Assistant */}
          {!passAroundMode && showBulkPaste && (
            <div className="rounded-2xl border-2 border-primary/40 bg-primary/[0.04] p-4 sm:p-5 space-y-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="text-xs font-black uppercase tracking-widest text-primary">
                    Smart Bulk Registration Assistant
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Paste names from WhatsApp, Excel, or Notes — one per line (optional phone or grade on any line). Existing &amp; consent-form students auto-match with zero duplicates!
                  </p>
                </div>
                {parsedBulkPreview.length > 0 && (
                  <div className="flex flex-wrap items-center gap-1.5 text-[11px] font-black">
                    <span className="rounded-full bg-primary/15 px-2.5 py-0.5 text-primary">
                      {parsedBulkPreview.length} detected
                    </span>
                    <span className="rounded-full bg-emerald-500/15 px-2.5 py-0.5 text-emerald-800 dark:text-emerald-300">
                      {parsedBulkPreview.filter((p) => p.matched).length} auto-matched
                    </span>
                    <span className="rounded-full bg-muted px-2.5 py-0.5 text-muted-foreground">
                      {parsedBulkPreview.filter((p) => !p.matched).length} brand new
                    </span>
                  </div>
                )}
              </div>

              <textarea
                rows={5}
                aria-label="Bulk paste student names and optional parent phone numbers"
                value={bulkPasteText}
                onChange={(e) => setBulkPasteText(e.target.value)}
                placeholder={'1. Chinedu Okafor, 08031234567\n2. Amaka Eze - 08098765432\n3. Tunde Bello, Basic 2, 07011223344\n4. Grace Musa'}
                className="w-full rounded-xl border border-border bg-background p-3 text-xs sm:text-sm font-mono text-foreground placeholder:text-muted-foreground/70 focus:outline-none focus:ring-2 focus:ring-primary"
              />

              {parsedBulkPreview.length > 0 && (
                <div className="max-h-40 overflow-y-auto rounded-xl border border-border bg-card divide-y divide-border text-xs">
                  {parsedBulkPreview.slice(0, 20).map((item, idx) => (
                    <div key={`${item.full_name}-${idx}`} className="px-3 py-1.5 flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="font-mono text-[10px] text-muted-foreground">{idx + 1}.</span>
                        <span className="font-bold text-foreground truncate">{item.full_name}</span>
                        <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-bold text-muted-foreground">{item.grade}</span>
                        {item.parent_phone && (
                          <span className="font-mono text-[10px] text-muted-foreground">{item.parent_phone}</span>
                        )}
                      </div>
                      {item.matched ? (
                        <span className="shrink-0 rounded-full bg-emerald-500/15 border border-emerald-500/35 px-2 py-0.5 text-[9px] font-black text-emerald-800 dark:text-emerald-300">
                          {item.matched.consent_signed ? 'Consent Match ✓' : 'Existing ✓'}
                        </span>
                      ) : (
                        <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[9px] font-black uppercase text-muted-foreground">
                          New
                        </span>
                      )}
                    </div>
                  ))}
                  {parsedBulkPreview.length > 20 && (
                    <p className="px-3 py-1.5 text-[10px] text-muted-foreground text-center">
                      +{parsedBulkPreview.length - 20} more parsed…
                    </p>
                  )}
                </div>
              )}

              <div className="flex flex-wrap items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setBulkPasteText('');
                    setShowBulkPaste(false);
                  }}
                  className="min-h-10 px-3 py-1.5 rounded-xl border border-border bg-card text-xs font-bold text-muted-foreground hover:text-foreground"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={parsedBulkPreview.length === 0}
                  onClick={handleQueueBulkLines}
                  className="min-h-10 inline-flex items-center gap-1.5 px-4 py-1.5 rounded-xl bg-primary hover:bg-primary/90 disabled:opacity-40 text-primary-foreground text-xs font-black uppercase tracking-wider shadow-sm"
                >
                  <PlusIcon className="w-4 h-4" />
                  Add {parsedBulkPreview.length} to Verification Queue →
                </button>
              </div>
            </div>
          )}

          {/* Fast Intake Entry Form (Paper-Sheet Replacement) */}
          <form
            onSubmit={handleIntakeSubmit}
            className={`rounded-2xl border p-4 sm:p-5 space-y-4 ${
              passAroundMode
                ? 'border-emerald-500/50 bg-emerald-500/[0.06]'
                : 'border-primary/25 bg-primary/[0.03]'
            }`}
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-xs font-black uppercase tracking-widest text-foreground">
                  {passAroundMode
                    ? '👋 Student Self-Entry — Type Your Name & Parent Phone'
                    : 'Quick Add Student to Live Class List'}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Full name appears on results &amp; report cards. Parent phone is{' '}
                  <strong className="text-foreground">optional</strong> (especially for Basic classes) — parents verify &amp; complete extra details when checking results.
                </p>
              </div>
              {passAroundMode && passAroundAddedCount > 0 && (
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-700 px-3 py-1 text-xs font-black text-white">
                  <CheckCircleIcon className="w-3.5 h-3.5" />
                  {passAroundAddedCount} added
                </span>
              )}
            </div>

            {lastAddedName && (
              <div className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-3.5 py-2.5 text-xs font-bold text-emerald-800 dark:text-emerald-200 flex items-center justify-between gap-2">
                <span>
                  ✓ <strong>{lastAddedName}</strong> saved to {className}!{' '}
                  {passAroundMode ? 'Hand the device to the next classmate.' : 'Ready for the next student.'}
                </span>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
              <div className={`relative ${lockGrade ? 'sm:col-span-5' : 'sm:col-span-4'}`}>
                <div className="flex items-center justify-between gap-2 mb-1">
                  <label className="block text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                    Student Full Name *
                  </label>
                  {selectedCandidate && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 border border-emerald-500/35 px-2 py-0.5 text-[9px] font-black text-emerald-800 dark:text-emerald-300">
                      <ShieldCheckIcon className="w-3 h-3" />
                      {selectedCandidate.parent_verified ? 'Already Verified ✓' : 'In System ✓'}
                    </span>
                  )}
                </div>
                <input
                  ref={nameInputRef}
                  type="text"
                  required
                  autoComplete="off"
                  value={fullName}
                  onFocus={() => setShowSuggestions(true)}
                  onBlur={() => setTimeout(() => setShowSuggestions(false), 160)}
                  onChange={(e) => {
                    setFullName(e.target.value);
                    setSelectedCandidate(null);
                    setShowSuggestions(true);
                  }}
                  placeholder="Start typing name — existing students auto-suggest…"
                  className="w-full min-h-11 rounded-xl border border-border bg-background px-3.5 py-2 text-sm font-bold text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                />

                {/* Smart Instant Suggestions & Auto-Fill Dropdown */}
                {showSuggestions && liveSuggestions.length > 0 && (
                  <div className="absolute left-0 right-0 top-full mt-1 z-30 rounded-xl border border-primary/35 bg-card shadow-xl overflow-hidden divide-y divide-border">
                    <div className="px-3 py-1.5 bg-primary/5 text-[9px] font-black uppercase tracking-widest text-primary">
                      Already in system — tap to auto-fill &amp; skip re-verification
                    </div>
                    {liveSuggestions.map((cand) => (
                      <button
                        key={cand.id}
                        type="button"
                        onMouseDown={(ev) => {
                          ev.preventDefault();
                          handleSelectCandidate(cand);
                        }}
                        className="w-full px-3 py-2 text-left hover:bg-muted/60 flex items-center justify-between gap-2 transition-colors"
                      >
                        <div className="min-w-0">
                          <p className="text-xs font-black text-foreground truncate">{cand.full_name}</p>
                          <p className="text-[10px] text-muted-foreground truncate">
                            {cand.in_this_class
                              ? 'Already in this class'
                              : cand.is_active
                              ? cand.section_class || 'Existing student'
                              : 'Previously archived (returning)'}
                            {cand.grade ? ` · ${cand.grade}` : ''}
                            {cand.parent_phone ? ` · ${cand.parent_phone}` : ''}
                          </p>
                        </div>
                        {cand.parent_verified ? (
                          <span className="shrink-0 rounded-full bg-emerald-500/15 border border-emerald-500/35 px-2 py-0.5 text-[9px] font-black text-emerald-800 dark:text-emerald-300">
                            Verified ✓
                          </span>
                        ) : (
                          <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-[9px] font-black text-primary">
                            Auto-fill
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {!lockGrade && (
                <div className="sm:col-span-3">
                  <label className="block text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-1">
                    Grade / Class *
                  </label>
                  <select
                    aria-label="Student grade"
                    value={selectedGrade}
                    onChange={(e) => setSelectedGrade(e.target.value)}
                    className="w-full min-h-11 rounded-xl border border-border bg-background px-3 py-2 text-sm font-bold text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                  >
                    {SINGLE_GRADES.map((g) => (
                      <option key={g} value={g}>{g}</option>
                    ))}
                  </select>
                </div>
              )}

              <div className={lockGrade ? 'sm:col-span-4' : 'sm:col-span-3'}>
                <label className="block text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-1">
                  Parent WhatsApp Number{requirePhone ? ' *' : ''}
                </label>
                <input
                  type="tel"
                  required={requirePhone}
                  value={parentPhone}
                  onChange={(e) => setParentPhone(e.target.value)}
                  placeholder="0801 234 5678"
                  className="w-full min-h-11 rounded-xl border border-border bg-background px-3.5 py-2 text-sm font-medium text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>

              <div className={lockGrade ? 'sm:col-span-3 flex items-end' : 'sm:col-span-2 flex items-end'}>
                <button
                  type="submit"
                  disabled={submitting || fullName.trim().length < 2}
                  className="w-full min-h-11 inline-flex items-center justify-center gap-1.5 rounded-xl bg-primary hover:bg-primary/90 disabled:opacity-45 px-4 py-2 text-xs font-black uppercase tracking-wider text-primary-foreground shadow-sm transition-colors"
                >
                  <PlusIcon className="w-4 h-4" />
                  Add &amp; Next
                </button>
              </div>
            </div>
          </form>

          {/* Teacher / Admin Post-Entry Smart Verification Queue (zero-lag collection → 1-click verify & save) */}
          {!passAroundMode && pendingQueue.length > 0 && (
            <div className="rounded-2xl border-2 border-primary/40 bg-primary/[0.04] p-4 space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                <div>
                  <p className="text-xs font-black uppercase tracking-widest text-primary">
                    Teacher / Admin Verification Queue ({pendingQueue.length} ready)
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Collected with zero lag. Review names, grades, smart existing-student matches &amp; optional phones below, then save all in 1 click.
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  {pendingQueue.some((r) => !r.matched_student_id && findSmartCandidateMatches(r.full_name, directory, 1).length > 0) && (
                    <button
                      type="button"
                      onClick={acceptAllSmartMatches}
                      className="min-h-10 px-3 py-1.5 rounded-xl bg-amber-800 hover:bg-amber-900 text-white text-xs font-black uppercase tracking-wider shadow-sm"
                    >
                      Auto-Link All Matches
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      if (confirm(`Clear all ${pendingQueue.length} unsaved entries from the queue?`)) {
                        setPendingQueue([]);
                      }
                    }}
                    className="min-h-10 px-3 py-1.5 rounded-xl border border-border bg-card text-xs font-bold text-muted-foreground hover:text-foreground"
                  >
                    Clear
                  </button>
                  <button
                    type="button"
                    disabled={committingBatch}
                    onClick={() => void handleCommitVerifiedQueue()}
                    className="min-h-10 inline-flex items-center gap-1.5 px-4 py-1.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 disabled:opacity-50 text-white text-xs font-black uppercase tracking-wider shadow-sm"
                  >
                    <CheckCircleIcon className="w-4 h-4" />
                    {committingBatch ? 'Verifying & Saving…' : `Verify & Save All (${pendingQueue.length})`}
                  </button>
                </div>
              </div>

              <div className="max-h-96 overflow-y-auto space-y-2.5 pr-0.5">
                {pendingQueue.map((entry, i) => {
                  const smartSuggestion = !entry.matched_student_id
                    ? findSmartCandidateMatches(entry.full_name, directory, 1)[0] ?? null
                    : null;
                  return (
                    <div key={entry.localId} className="rounded-xl border border-border bg-card p-3 shadow-sm space-y-2.5">
                      <div className="flex items-center gap-2">
                        <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-black text-muted-foreground">
                          {i + 1}
                        </span>
                        <input
                          type="text"
                          aria-label={`Queued student name ${i + 1}`}
                          value={entry.full_name}
                          onChange={(e) => {
                            const val = e.target.value;
                            setPendingQueue((prev) =>
                              prev.map((row) => (row.localId === entry.localId ? { ...row, full_name: val } : row)),
                            );
                          }}
                          className="flex-1 min-w-0 h-10 rounded-lg border border-border bg-background px-3 text-sm font-bold text-foreground focus:outline-none focus:border-primary"
                        />
                        {entry.matched_student_id ? (
                          <button
                            type="button"
                            title="Matched to existing student — click to treat as brand new instead"
                            onClick={() =>
                              setPendingQueue((prev) =>
                                prev.map((row) =>
                                  row.localId === entry.localId
                                    ? { ...row, matched_student_id: null, matched_label: null, matched_verified: false }
                                    : row,
                                ),
                              )
                            }
                            className="shrink-0 rounded-full bg-emerald-500/15 border border-emerald-500/35 px-2.5 py-1 text-[10px] font-black text-emerald-800 dark:text-emerald-300"
                          >
                            {entry.matched_verified ? 'Verified ✓' : 'Existing ✓'}
                          </button>
                        ) : (
                          <span className="shrink-0 rounded-full bg-muted px-2.5 py-1 text-[10px] font-black uppercase text-muted-foreground">
                            New
                          </span>
                        )}
                        <button
                          type="button"
                          aria-label={`Remove ${entry.full_name} from queue`}
                          onClick={() =>
                            setPendingQueue((prev) => prev.filter((row) => row.localId !== entry.localId))
                          }
                          className="shrink-0 inline-flex h-9 w-9 items-center justify-center rounded-lg border border-border text-muted-foreground hover:text-rose-600 hover:border-rose-500/40"
                        >
                          <XMarkIcon className="w-4 h-4" />
                        </button>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pl-0 sm:pl-8">
                        <select
                          aria-label={`Queued student grade ${i + 1}`}
                          value={entry.grade}
                          onChange={(e) => {
                            const val = e.target.value;
                            setPendingQueue((prev) =>
                              prev.map((row) => (row.localId === entry.localId ? { ...row, grade: val } : row)),
                            );
                          }}
                          className="w-full h-10 rounded-lg border border-border bg-background px-3 text-xs font-bold text-foreground"
                        >
                          {SINGLE_GRADES.map((g) => (
                            <option key={g} value={g}>{g}</option>
                          ))}
                        </select>
                        <input
                          type="tel"
                          aria-label={`Queued parent phone ${i + 1}`}
                          value={entry.parent_phone}
                          onChange={(e) => {
                            const val = e.target.value;
                            setPendingQueue((prev) =>
                              prev.map((row) => (row.localId === entry.localId ? { ...row, parent_phone: val } : row)),
                            );
                          }}
                          placeholder="Parent WhatsApp (e.g. 0801 234 5678)"
                          className="w-full h-10 rounded-lg border border-border bg-background px-3 text-xs font-mono text-foreground"
                        />
                      </div>

                      {/* Smart Duplicate / Existing-Student Suggestion */}
                      {smartSuggestion && (
                        <div className="sm:ml-8 flex flex-wrap items-center justify-between gap-2 rounded-lg bg-amber-500/10 border border-amber-500/30 px-3 py-2 text-[11px]">
                          <span className="text-amber-950 dark:text-amber-200 font-semibold">
                            Match found: <strong>{smartSuggestion.full_name}</strong> ({smartSuggestion.grade || smartSuggestion.section_class || 'In school'})
                            {smartSuggestion.parent_verified ? ' · Verified' : ''}
                          </span>
                          <button
                            type="button"
                            onClick={() =>
                              setPendingQueue((prev) =>
                                prev.map((row) =>
                                  row.localId === entry.localId
                                    ? {
                                        ...row,
                                        full_name: smartSuggestion.full_name,
                                        parent_phone: row.parent_phone || smartSuggestion.parent_phone || '',
                                        matched_student_id: smartSuggestion.id,
                                        matched_label: smartSuggestion.grade || smartSuggestion.section_class || 'Existing',
                                        matched_verified: smartSuggestion.parent_verified,
                                      }
                                    : row,
                                ),
                              )
                            }
                            className="shrink-0 rounded-md bg-amber-800 hover:bg-amber-900 px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-white"
                          >
                            Link &amp; Auto-Fill
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Teacher / Admin Live List + WhatsApp Export (hidden in Pass-Around Mode!) */}
          {!passAroundMode && (
            <div className="space-y-3">
              {/* Accurate Headcount + WhatsApp / Admin Export Bar */}
              <div className="space-y-2.5 rounded-xl border border-border bg-muted/30 p-3">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <div className="rounded-lg bg-card border border-border px-3 py-2">
                    <p className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">Active Count</p>
                    <p className="text-lg font-black text-foreground">{students.length}</p>
                  </div>
                  <div className="rounded-lg bg-card border border-emerald-500/30 px-3 py-2">
                    <p className="text-[10px] font-black uppercase tracking-wider text-emerald-700 dark:text-emerald-400">WhatsApp Ready</p>
                    <p className="text-lg font-black text-emerald-700 dark:text-emerald-400">{withPhoneCount} <span className="text-[11px] font-bold text-muted-foreground">({verifiedCount} verified)</span></p>
                  </div>
                  <div className="rounded-lg bg-card border border-amber-500/30 px-3 py-2">
                    <p className="text-[10px] font-black uppercase tracking-wider text-amber-800 dark:text-amber-300">Old Session</p>
                    <p className="text-lg font-black text-amber-800 dark:text-amber-300">{carryoverStudents.length}</p>
                  </div>
                  <div className="rounded-lg bg-card border border-border px-3 py-2">
                    <p className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">Withdrawn (Safe)</p>
                    <p className="text-lg font-black text-muted-foreground">{formerStudents.length}</p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={downloadWhatsAppVCard}
                    className="inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-emerald-700 hover:bg-emerald-800 px-3 py-1.5 text-[11px] font-black uppercase tracking-wider text-white shadow-sm"
                  >
                    <PhoneIcon className="w-3.5 h-3.5" />
                    WhatsApp (.vcf)
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const ok = openClassIntakeLetterheadPdf({
                        className,
                        schoolName,
                        currentSession,
                        classGradeKey: lockGrade ? selectedGrade : classGradeKey,
                        students: filteredStudents,
                        withdrawnCount: formerStudents.length,
                      });
                      if (!ok) toast.error('Allow pop-ups to open the letterhead PDF preview.');
                    }}
                    className="inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-primary hover:bg-primary/90 px-3 py-1.5 text-[11px] font-black uppercase tracking-wider text-primary-foreground shadow-sm"
                  >
                    <PrinterIcon className="w-3.5 h-3.5" />
                    Letterhead PDF
                  </button>
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => setShowExportMenu((v) => !v)}
                      aria-expanded={showExportMenu}
                      className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-border bg-card hover:bg-muted px-3 py-1.5 text-[11px] font-black uppercase tracking-wider text-foreground"
                    >
                      <CloudArrowDownIcon className="w-3.5 h-3.5" />
                      More Exports ▾
                    </button>
                    {showExportMenu && (
                      <div className="absolute left-0 sm:left-auto sm:right-0 top-full mt-1.5 z-30 w-56 rounded-xl border border-border bg-card shadow-xl py-1.5">
                        <button
                          type="button"
                          onClick={() => {
                            setShowExportMenu(false);
                            exportIntakeCsv();
                          }}
                          className="w-full px-3.5 py-2 text-left text-xs font-bold text-foreground hover:bg-muted flex items-center gap-2"
                        >
                          <CloudArrowDownIcon className="w-4 h-4 text-primary" />
                          Attendance / Admin CSV
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setShowExportMenu(false);
                            void copyWhatsAppNumbers();
                          }}
                          className="w-full px-3.5 py-2 text-left text-xs font-bold text-foreground hover:bg-muted flex items-center gap-2"
                        >
                          <ClipboardDocumentListIcon className="w-4 h-4 text-emerald-700 dark:text-emerald-400" />
                          Copy WhatsApp Numbers
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setShowExportMenu(false);
                            void copyGroupWelcomeMessage();
                          }}
                          className="w-full px-3.5 py-2 text-left text-xs font-bold text-foreground hover:bg-muted flex items-center gap-2"
                        >
                          <PhoneIcon className="w-4 h-4 text-emerald-700 dark:text-emerald-400" />
                          Copy Group Welcome Post
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                {/* Search, Organize & Filter Controls */}
                <div className="flex flex-col sm:flex-row gap-2 pt-1">
                  <input
                    type="search"
                    aria-label="Search class intake list"
                    value={sheetSearch}
                    onChange={(e) => setSheetSearch(e.target.value)}
                    placeholder="Search student name or parent phone…"
                    className="flex-1 min-h-9 rounded-lg border border-border bg-card px-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground"
                  />
                  <select
                    aria-label="Sort class intake list"
                    value={sheetSort}
                    onChange={(e) => setSheetSort(e.target.value as any)}
                    className="min-h-9 rounded-lg border border-border bg-card px-2.5 py-1.5 text-xs font-bold text-foreground"
                  >
                    <option value="name">Sort: Name A–Z</option>
                    <option value="grade">Sort: Grade</option>
                    <option value="phone">Sort: Phone Status</option>
                    <option value="session">Sort: Old Session First</option>
                  </select>
                </div>
                {/* Multi-Grade Section Filter Chips (e.g. Basic 1 | Basic 2 | Basic 3) */}
                {distinctSectionGrades.length > 1 && (
                  <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
                    <span className="text-[10px] font-black uppercase tracking-wider text-muted-foreground shrink-0 pr-1">
                      Grades:
                    </span>
                    <button
                      type="button"
                      onClick={() => setGradeFilter('all')}
                      className={`shrink-0 rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-wider transition-colors ${
                        gradeFilter === 'all'
                          ? 'border-foreground bg-foreground text-background'
                          : 'border-border bg-card text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      All Grades ({students.length})
                    </button>
                    {distinctSectionGrades.map((g) => {
                      const count = students.filter((s) => (canonicalGrade(s.grade) || String(s.grade || '').trim()) === g).length;
                      return (
                        <button
                          key={g}
                          type="button"
                          onClick={() => setGradeFilter(g)}
                          className={`shrink-0 rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-wider transition-colors ${
                            gradeFilter === g
                              ? 'border-primary bg-primary text-primary-foreground'
                              : 'border-border bg-card text-muted-foreground hover:text-foreground'
                          }`}
                        >
                          {g} ({count})
                        </button>
                      );
                    })}
                  </div>
                )}

                <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
                  {([
                    { id: 'all', label: `All Active (${students.length})` },
                    { id: 'missing_phone', label: `Missing Phone (${Math.max(0, students.length - withPhoneCount)})` },
                    { id: 'pending_verify', label: `Pending Verify (${Math.max(0, withPhoneCount - verifiedCount)})` },
                    { id: 'verified', label: `Verified (${verifiedCount})` },
                    ...(carryoverStudents.length > 0 ? [{ id: 'old_session', label: `Old Session (${carryoverStudents.length})` }] : []),
                  ] as Array<{ id: typeof sheetFilter; label: string }>).map((pill) => (
                    <button
                      key={pill.id}
                      type="button"
                      onClick={() => setSheetFilter(pill.id)}
                      className={`shrink-0 rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-wider transition-colors ${
                        sheetFilter === pill.id
                          ? 'border-primary bg-primary text-primary-foreground'
                          : 'border-border bg-card text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      {pill.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Live Digital Intake List */}
              {filteredStudents.length === 0 ? (
                <div className="rounded-xl border border-dashed border-border p-8 text-center text-xs text-muted-foreground">
                  {students.length === 0
                    ? `No students in ${className} yet. Start adding names above — they automatically populate the live class list and WhatsApp contact sheet.`
                    : 'No students match your current filter.'}
                </div>
              ) : (
                <div className="max-h-96 overflow-y-auto rounded-xl border border-border divide-y divide-border">
                  {filteredStudents.map((s, idx) => {
                    const isEditing = editingPhoneId === s.id;
                    const hasPhone = Boolean(formatWhatsAppDigits(s.parent_phone));
                    const waHref = buildParentWhatsAppHref(s);
                    return (
                      <div
                        key={s.id}
                        className="px-3.5 py-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2 bg-card hover:bg-muted/20"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <span className="text-[11px] font-mono text-muted-foreground w-6 shrink-0">
                            {idx + 1}.
                          </span>
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="text-sm font-bold text-foreground truncate">
                                {s.full_name}
                              </span>
                              <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-black text-muted-foreground">
                                {s.grade || classGradeKey || '—'}
                              </span>
                              {s.session_status === 'carryover_unconfirmed' && (
                                <span className="rounded bg-amber-500/15 border border-amber-500/35 px-1.5 py-0.5 text-[9px] font-black uppercase text-amber-800 dark:text-amber-300">
                                  Old Session
                                </span>
                              )}
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 pl-8 sm:pl-0 flex-wrap">
                          {isEditing ? (
                            <div className="flex items-center gap-1.5">
                              <input
                                type="tel"
                                aria-label={`Parent phone for ${s.full_name}`}
                                value={editingPhoneValue}
                                onChange={(e) => setEditingPhoneValue(e.target.value)}
                                placeholder="0801 234 5678"
                                autoFocus
                                className="h-8 w-36 rounded-lg border border-primary bg-background px-2 text-xs font-mono text-foreground"
                              />
                              <button
                                type="button"
                                disabled={savingPhoneId === s.id}
                                onClick={() => void handleInlinePhoneSave(s.id)}
                                className="h-8 px-2.5 rounded-lg bg-primary text-primary-foreground text-[10px] font-black uppercase"
                              >
                                {savingPhoneId === s.id ? '…' : 'Save'}
                              </button>
                              <button
                                type="button"
                                onClick={() => setEditingPhoneId(null)}
                                className="h-8 px-2 rounded-lg border border-border text-[10px] font-bold text-muted-foreground"
                              >
                                Cancel
                              </button>
                            </div>
                          ) : (
                            <>
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingPhoneId(s.id);
                                  setEditingPhoneValue(s.parent_phone || '');
                                }}
                                className="inline-flex items-center gap-1 rounded-lg border border-border bg-background hover:border-primary/50 px-2.5 py-1 text-xs font-mono text-foreground transition-colors"
                              >
                                <PhoneIcon className="w-3 h-3 text-muted-foreground" />
                                {s.parent_phone || 'Add phone'}
                              </button>

                              {waHref && (
                                <a
                                  href={waHref}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  title={`Send WhatsApp message to parent of ${s.full_name}`}
                                  className="inline-flex items-center gap-1 rounded-lg bg-emerald-700 hover:bg-emerald-800 px-2 py-1 text-[10px] font-black uppercase tracking-wider text-white"
                                >
                                  WhatsApp
                                </a>
                              )}

                              {s.parent_verified ? (
                                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 border border-emerald-500/35 px-2 py-0.5 text-[10px] font-black text-emerald-800 dark:text-emerald-300">
                                  <ShieldCheckIcon className="w-3 h-3" />
                                  Verified
                                </span>
                              ) : hasPhone ? (
                                <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 border border-amber-500/35 px-2 py-0.5 text-[10px] font-black text-amber-800 dark:text-amber-300">
                                  Pending Verify
                                </span>
                              ) : (
                                <span className="text-[10px] font-semibold text-muted-foreground">
                                  Optional
                                </span>
                              )}
                            </>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* TAB 2: OLD VS NEW SESSION COHORT CLEANUP */}
      {tab === 'hygiene' && (
        <div className="p-4 sm:p-5 space-y-4">
          <div className={`rounded-xl border p-3.5 text-xs space-y-1 ${
            carryoverStudents.length > 0
              ? 'border-amber-500/40 bg-amber-500/10 text-amber-950 dark:text-amber-200'
              : 'border-emerald-500/40 bg-emerald-500/10 text-emerald-950 dark:text-emerald-200'
          }`}>
            <p className="font-black uppercase tracking-wider">
              {carryoverStudents.length > 0
                ? `${carryoverStudents.length} Prior-Session Student${carryoverStudents.length === 1 ? '' : 's'} Mixed Into ${className}`
                : `✓ ${className} is 100% Clean for ${currentSession}`}
            </p>
            <p className="opacity-90">
              {carryoverStudents.length > 0
                ? isEntryClass
                  ? `${className} is a fresh-intake entry class. Move last session's set up to the next class or archive them cleanly (all past results stay safe) so only new ${currentSession} students remain here.`
                  : `Separate last session's students from this session's new/confirmed students: Promote them to the next class, Archive anyone who left, or Confirm returning students.`
                : `Every student currently on this roster is confirmed for ${currentSession}. You can still select students below if you need to promote or archive anyone.`}
            </p>
          </div>

          {/* 1-Click Clean Slate Smart Decision Wizard (zero manual ticking!) */}
          {carryoverStudents.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5">
              {destinationClasses.length > 0 && (
                <button
                  type="button"
                  disabled={hygieneBusy !== null}
                  onClick={() => void runCohortHygiene('promote_to_class', carryoverStudents.map((s) => s.id))}
                  className="text-left rounded-xl border-2 border-primary/40 bg-primary/[0.06] hover:bg-primary/10 p-3.5 transition-all disabled:opacity-40 space-y-1"
                >
                  <p className="text-[10px] font-black uppercase tracking-widest text-primary">
                    {isEntryClass ? '★ Recommended · Clean Slate' : '1-Click Promote All Old Set'}
                  </p>
                  <p className="text-sm font-black text-foreground">
                    Move {carryoverStudents.length} → {destinationClasses.find((c) => c.id === destClassId)?.name || 'Next Class'}
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    Upgrades grades &amp; switches exams to next class, leaving {className} spotless for {currentSession}.
                  </p>
                </button>
              )}
              <button
                type="button"
                disabled={hygieneBusy !== null}
                onClick={() => void runCohortHygiene('archive_old', carryoverStudents.map((s) => s.id))}
                className="text-left rounded-xl border-2 border-rose-500/35 bg-rose-500/[0.05] hover:bg-rose-500/10 p-3.5 transition-all disabled:opacity-40 space-y-1"
              >
                <p className="text-[10px] font-black uppercase tracking-widest text-rose-700 dark:text-rose-400">
                  Start 100% Clean Slate
                </p>
                <p className="text-sm font-black text-foreground">
                  Archive All {carryoverStudents.length} Old-Session Students
                </p>
                <p className="text-[11px] text-muted-foreground">
                  Clears {className} immediately. Past results stay safe &amp; anyone who returns can be reinstated in 1 click.
                </p>
              </button>
              <button
                type="button"
                disabled={hygieneBusy !== null}
                onClick={() => void runCohortHygiene('confirm_current', carryoverStudents.map((s) => s.id))}
                className="text-left rounded-xl border-2 border-emerald-500/35 bg-emerald-500/[0.05] hover:bg-emerald-500/10 p-3.5 transition-all disabled:opacity-40 space-y-1"
              >
                <p className="text-[10px] font-black uppercase tracking-widest text-emerald-800 dark:text-emerald-300">
                  Same Set Returning
                </p>
                <p className="text-sm font-black text-foreground">
                  Confirm All {carryoverStudents.length} for {currentSession}
                </p>
                <p className="text-[11px] text-muted-foreground">
                  Keeps everyone in {className} and marks them active for this session&apos;s attendance &amp; reports.
                </p>
              </button>
            </div>
          )}

          {/* Bulk Action Bar */}
          <div className="rounded-xl border border-border bg-muted/40 p-3 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setSelectedHygieneIds(new Set(carryoverStudents.map((s) => s.id)))}
                className="px-2.5 py-1.5 rounded-lg border border-amber-500/40 bg-amber-500/10 text-[11px] font-black text-amber-900 dark:text-amber-200 hover:bg-amber-500/20"
              >
                Select All Old Session ({carryoverStudents.length})
              </button>
              <button
                type="button"
                onClick={() => setSelectedHygieneIds(new Set(students.map((s) => s.id)))}
                className="px-2.5 py-1.5 rounded-lg border border-border bg-card text-[11px] font-bold text-foreground hover:bg-muted"
              >
                Select All ({students.length})
              </button>
              <button
                type="button"
                onClick={() => setSelectedHygieneIds(new Set())}
                className="px-2.5 py-1.5 rounded-lg border border-border bg-card text-[11px] font-bold text-muted-foreground hover:text-foreground"
              >
                Clear ({selectedHygieneIds.size})
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {destinationClasses.length > 0 && (
                <div className="flex items-center gap-1.5">
                  <select
                    aria-label="Destination class for promotion"
                    value={destClassId}
                    onChange={(e) => setDestClassId(e.target.value)}
                    className="min-h-9 rounded-lg border border-border bg-card px-2.5 py-1 text-xs font-bold text-foreground max-w-[190px]"
                  >
                    {destinationClasses.map((c) => (
                      <option key={c.id} value={c.id}>
                        → {c.name}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    disabled={hygieneBusy !== null || selectedHygieneIds.size === 0}
                    onClick={() => void runCohortHygiene('promote_to_class')}
                    className="min-h-9 px-3 py-1.5 rounded-lg bg-primary hover:bg-primary/90 disabled:opacity-40 text-primary-foreground text-[11px] font-black uppercase tracking-wider"
                  >
                    {hygieneBusy === 'promote_to_class' ? 'Moving…' : 'Promote Selected'}
                  </button>
                </div>
              )}

              <button
                type="button"
                disabled={hygieneBusy !== null || selectedHygieneIds.size === 0}
                onClick={() => void runCohortHygiene('confirm_current')}
                className="min-h-9 px-3 py-1.5 rounded-lg bg-emerald-700 hover:bg-emerald-800 disabled:opacity-40 text-white text-[11px] font-black uppercase tracking-wider"
              >
                {hygieneBusy === 'confirm_current' ? 'Saving…' : `Confirm Returning (${currentSession})`}
              </button>

              <button
                type="button"
                disabled={hygieneBusy !== null || selectedHygieneIds.size === 0}
                onClick={() => void runCohortHygiene('archive_old')}
                className="min-h-9 px-3 py-1.5 rounded-lg bg-rose-700 hover:bg-rose-800 disabled:opacity-40 text-white text-[11px] font-black uppercase tracking-wider"
              >
                {hygieneBusy === 'archive_old' ? 'Archiving…' : 'Archive Old Set'}
              </button>

              {/* Fix stale entry grades (e.g. consent-form JSS 1 stuck after moving to JSS 2) */}
              <div className="flex items-center gap-1.5">
                <select
                  aria-label="Target grade for upgrade"
                  value={upgradeTargetGrade}
                  onChange={(e) => setUpgradeTargetGrade(e.target.value)}
                  className="min-h-9 rounded-lg border border-border bg-card px-2 py-1 text-xs font-bold text-foreground"
                >
                  {SINGLE_GRADES.map((g) => (
                    <option key={g} value={g}>{g}</option>
                  ))}
                </select>
                <button
                  type="button"
                  disabled={hygieneBusy !== null || selectedHygieneIds.size === 0}
                  onClick={() => void runCohortHygiene('sync_grades_to_class')}
                  className="min-h-9 px-3 py-1.5 rounded-lg border border-primary bg-primary/10 hover:bg-primary/20 disabled:opacity-40 text-primary text-[11px] font-black uppercase tracking-wider"
                >
                  {hygieneBusy === 'sync_grades_to_class' ? 'Upgrading…' : 'Upgrade Grade'}
                </button>
              </div>
            </div>
          </div>

          {/* Split List: Prior Session vs Active Current Session */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Prior Session / Unconfirmed */}
            <div className="rounded-xl border border-amber-500/35 overflow-hidden">
              <div className="bg-amber-500/10 px-3.5 py-2 border-b border-amber-500/25 flex items-center justify-between">
                <span className="text-[11px] font-black uppercase tracking-wider text-amber-900 dark:text-amber-300">
                  Prior Session / Unconfirmed ({carryoverStudents.length})
                </span>
              </div>
              <div className="max-h-72 overflow-y-auto divide-y divide-border bg-card">
                {carryoverStudents.length === 0 ? (
                  <p className="p-4 text-xs text-muted-foreground text-center">
                    No unconfirmed prior-session students in this class.
                  </p>
                ) : (
                  carryoverStudents.map((s) => {
                    const checked = selectedHygieneIds.has(s.id);
                    return (
                      <label
                        key={s.id}
                        className="flex items-center justify-between gap-2 px-3.5 py-2.5 cursor-pointer hover:bg-muted/30"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => {
                              setSelectedHygieneIds((prev) => {
                                const next = new Set(prev);
                                if (next.has(s.id)) next.delete(s.id);
                                else next.add(s.id);
                                return next;
                              });
                            }}
                            className="h-4 w-4 accent-amber-600 shrink-0"
                          />
                          <div className="min-w-0">
                            <p className="text-xs font-bold text-foreground truncate">{s.full_name}</p>
                            <p className="text-[10px] text-muted-foreground">
                              {s.grade || '—'} · Added {s.created_at ? new Date(s.created_at).toLocaleDateString() : 'earlier'}
                            </p>
                          </div>
                        </div>
                        <span className="text-[10px] font-mono text-muted-foreground shrink-0">
                          {s.parent_phone || 'No phone'}
                        </span>
                      </label>
                    );
                  })
                )}
              </div>
            </div>

            {/* Active This Session */}
            <div className="rounded-xl border border-emerald-500/35 overflow-hidden">
              <div className="bg-emerald-500/10 px-3.5 py-2 border-b border-emerald-500/25 flex items-center justify-between">
                <span className="text-[11px] font-black uppercase tracking-wider text-emerald-900 dark:text-emerald-300">
                  Active This Session · {currentSession} ({currentSessionStudents.length})
                </span>
              </div>
              <div className="max-h-72 overflow-y-auto divide-y divide-border bg-card">
                {currentSessionStudents.length === 0 ? (
                  <p className="p-4 text-xs text-muted-foreground text-center">
                    No students confirmed for {currentSession} yet.
                  </p>
                ) : (
                  currentSessionStudents.map((s) => {
                    const checked = selectedHygieneIds.has(s.id);
                    return (
                      <label
                        key={s.id}
                        className="flex items-center justify-between gap-2 px-3.5 py-2.5 cursor-pointer hover:bg-muted/30"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => {
                              setSelectedHygieneIds((prev) => {
                                const next = new Set(prev);
                                if (next.has(s.id)) next.delete(s.id);
                                else next.add(s.id);
                                return next;
                              });
                            }}
                            className="h-4 w-4 accent-emerald-700 shrink-0"
                          />
                          <div className="min-w-0">
                            <p className="text-xs font-bold text-foreground truncate">{s.full_name}</p>
                            <p className="text-[10px] text-muted-foreground">
                              {s.grade || '—'} · Confirmed {currentSession}
                            </p>
                          </div>
                        </div>
                        <span className="text-[10px] font-mono text-muted-foreground shrink-0">
                          {s.parent_phone || 'No phone'}
                        </span>
                      </label>
                    );
                  })
                )}
              </div>
            </div>
          </div>
          {/* 1-Click Migrate / Adopt Students from Previous Classes or Archive into THIS Class */}
          <div className="rounded-xl border border-primary/35 bg-primary/[0.03] overflow-hidden">
            <div className="bg-primary/10 px-3.5 py-2.5 border-b border-primary/20 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <p className="text-[11px] font-black uppercase tracking-wider text-primary">
                  Migrate / Adopt Returning Students Into {className}
                </p>
                <p className="text-[11px] text-muted-foreground">
                  Pull students from last session&apos;s class or archive directly into {className} — automatically upgrades their grade, syncs CBT exams to this class, and preserves past results.
                </p>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <select
                  aria-label="Grade for adopted students"
                  value={adoptGrade}
                  onChange={(e) => setAdoptGrade(e.target.value)}
                  className="min-h-9 rounded-lg border border-border bg-card px-2 py-1 text-xs font-bold text-foreground"
                >
                  {SINGLE_GRADES.map((g) => (
                    <option key={g} value={g}>{g}</option>
                  ))}
                </select>
                <button
                  type="button"
                  disabled={adoptingBusy || adoptSelectedIds.size === 0}
                  onClick={() => void handleAdoptIntoThisClass()}
                  className="min-h-9 px-3 py-1.5 rounded-lg bg-primary hover:bg-primary/90 disabled:opacity-40 text-primary-foreground text-[11px] font-black uppercase tracking-wider shadow-sm"
                >
                  {adoptingBusy ? 'Migrating…' : `Adopt Selected (${adoptSelectedIds.size})`}
                </button>
              </div>
            </div>
            <div className="p-3 space-y-2.5 bg-card">
              <input
                type="search"
                aria-label="Search school students to migrate into this class"
                value={adoptSearch}
                onChange={(e) => setAdoptSearch(e.target.value)}
                placeholder="Search any student in this school by name, previous class, or grade (e.g. JSS 1, Basic 1)…"
                className="w-full min-h-9 rounded-lg border border-border bg-background px-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground"
              />
              {adoptableSchoolStudents.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-3">
                  {adoptSearch ? 'No matching school students outside this class.' : 'All active school students are already in this class.'}
                </p>
              ) : (
                <div className="max-h-52 overflow-y-auto rounded-lg border border-border divide-y divide-border">
                  {adoptableSchoolStudents.map((c) => {
                    const checked = adoptSelectedIds.has(c.id);
                    return (
                      <label
                        key={c.id}
                        className="flex items-center justify-between gap-2 px-3 py-2 cursor-pointer hover:bg-muted/30"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => {
                              setAdoptSelectedIds((prev) => {
                                const next = new Set(prev);
                                if (next.has(c.id)) next.delete(c.id);
                                else next.add(c.id);
                                return next;
                              });
                            }}
                            className="h-4 w-4 accent-primary shrink-0"
                          />
                          <div className="min-w-0">
                            <p className="text-xs font-bold text-foreground truncate">{c.full_name}</p>
                            <p className="text-[10px] text-muted-foreground truncate">
                              {c.is_active ? (c.section_class || 'Other class') : 'Archived / Unassigned'}
                              {c.grade ? ` · Currently ${c.grade}` : ''}
                            </p>
                          </div>
                        </div>
                        <span className="text-[10px] font-mono text-muted-foreground shrink-0">
                          {c.parent_phone || 'No phone'}
                        </span>
                      </label>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Withdrawn / Safe Archive (Excluded from active counts & reports, 1-click Reinstate if they return) */}
          {formerStudents.length > 0 && (
            <div className="rounded-xl border border-border overflow-hidden">
              <div className="bg-muted/50 px-3.5 py-2 border-b border-border flex flex-wrap items-center justify-between gap-2">
                <span className="text-[11px] font-black uppercase tracking-wider text-muted-foreground">
                  Withdrawn / Safe Archive ({formerStudents.length}) — Excluded from Active Counts &amp; Reports
                </span>
                <span className="text-[10px] font-semibold text-muted-foreground">
                  Records &amp; past results preserved · 1-click restore if they return
                </span>
              </div>
              <div className="max-h-56 overflow-y-auto divide-y divide-border bg-card">
                {formerStudents.map((s) => (
                  <div
                    key={s.id}
                    className="flex items-center justify-between gap-2 px-3.5 py-2 hover:bg-muted/20"
                  >
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-muted-foreground truncate">{s.full_name}</p>
                      <p className="text-[10px] text-muted-foreground">
                        {s.grade || '—'} · {s.parent_phone || 'No phone'}
                      </p>
                    </div>
                    <button
                      type="button"
                      disabled={reinstatingId === s.id}
                      onClick={() => void handleReinstateStudent(s)}
                      className="shrink-0 inline-flex items-center rounded-lg border border-emerald-600/40 bg-emerald-500/10 hover:bg-emerald-500/20 px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-emerald-800 dark:text-emerald-300 disabled:opacity-40"
                    >
                      {reinstatingId === s.id ? 'Restoring…' : 'Reinstate'}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
        </div>
      </div>
    </div>
  );
}

export default ClassIntakeAndSessionPanel;
