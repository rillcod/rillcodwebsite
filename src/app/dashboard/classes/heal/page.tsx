'use client';
import { Suspense, useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '@/contexts/auth-context';
import { useRouter, useSearchParams } from 'next/navigation';
import { ExclamationTriangleIcon, CheckCircleIcon, ArrowPathIcon, TrashIcon, MagnifyingGlassIcon, PlusIcon, ChevronDownIcon, ShieldCheckIcon, UserGroupIcon } from '@/lib/icons';
import { GradeBandPicker } from '@/components/classes/GradeBandPicker';
import { composeClassName, type BandGranularity } from '@/lib/classes/naming';
import NameHealthPanel from '@/components/classes/NameHealthPanel';
import DebrisCleanupPanel from '@/components/admin/DebrisCleanupPanel';

const PROGRAMME_OPTIONS = ['Young Innovators', 'Teen Developers', 'Web Development Bootcamp', 'Data Analysis with Python'];

type RegistryHint = { school_id: string | null; school_name: string | null; section: string | null; grade_level: string | null; status: string | null };
type AnomalyStudent = { id: string; full_name: string; email: string; class_id?: string | null; school_id?: string | null; section_class?: string | null; school_name?: string | null; primary_teacher_id?: string | null; registry?: RegistryHint | null; class_name?: string | null; class_school_id?: string | null; class_school_name?: string | null; class_teacher_conflict?: boolean };
type ConflictStudent = AnomalyStudent & { current_class_name: string | null; current_class_teacher_id: string | null; current_class_teacher_name: string | null; report_teacher_id: string | null; report_teacher_name: string | null };
type AnomalyClass = { id: string; name: string; school_id: string; created_at: string; schools?: { name: string } | null };
type ClassOption = { id: string; name: string; school_id: string | null; teacher_id?: string | null };
type TeacherOption = { id: string; full_name: string };
type MissingTs = { teacher_id: string; school_id: string; teacher_name: string | null; school_name: string | null; class_ids: string[] };
type SearchStudent = { id: string; full_name: string; email: string; school_id: string | null; school_name: string | null; class_id: string | null; section_class: string | null; class_name: string | null };
type AuditStudent = { id: string; full_name: string; email: string; school_id: string | null; class_id: string | null; section_class: string | null; grade_level: string | null; current_class_name: string | null; current_class_teacher_name: string | null; displacement_sources?: string[] };
type AuditClass = { id: string; name: string; school_id: string; student_count: number; students: AuditStudent[] };
type AuditSchool = { school_id: string; school_name: string; in_teacher_schools: boolean; classes: AuditClass[]; students_in_classes: AuditStudent[]; displaced_students: AuditStudent[] };
type DupAccount = { id: string; full_name: string; email: string; school_id: string | null; school_name: string | null; class_id: string | null; class_name: string | null; section_class: string | null; created_at: string; primary_teacher_id: string | null };
type DuplicateGroup = { duplicateType: 'email' | 'name_school'; label: string; reason: string; accounts: DupAccount[] };
type ClassAuditStudent = { id: string; full_name: string; email: string; school_name: string | null; section_class?: string | null; grade_level?: string | null; signal_teacher_id: string | null; signal_teacher_name: string | null; displacement_sources: string[]; dest_class_id: string | null; dest_class_name: string | null };
type ClassAuditResult = { class_name: string; class_teacher_id: string | null; teacher_name: string | null; school_name: string | null; correct: ClassAuditStudent[]; misplaced: ClassAuditStudent[]; noSignal: ClassAuditStudent[] };
type DrainDetail = { student_id: string; student_name: string; signal_teacher_name: string; from_class: string; to_class: string };

export default function ClassHealPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-background flex items-center justify-center">
        <ArrowPathIcon className="w-8 h-8 animate-spin text-primary" />
      </div>
    }>
      <ClassHealPageInner />
    </Suspense>
  );
}

function ClassHealPageInner() {
  const { profile, loading: authLoading } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialTab = searchParams.get('tab') === 'cleanup' ? 'cleanup' : 'roster';
  const [activeTab, setActiveTab] = useState<'roster' | 'cleanup'>(initialTab);

  useEffect(() => {
    const tab = searchParams.get('tab') === 'cleanup' ? 'cleanup' : 'roster';
    setActiveTab(tab);
  }, [searchParams]);

  function setTab(tab: 'roster' | 'cleanup') {
    setActiveTab(tab);
    const url = tab === 'cleanup' ? '/dashboard/classes/heal?tab=cleanup' : '/dashboard/classes/heal';
    router.replace(url, { scroll: false });
  }

  const [data, setData] = useState<{
    noSchool: AnomalyStudent[];
    noClass: AnomalyStudent[];
    mismatched: AnomalyStudent[];
    sectionDrift: AnomalyStudent[];
    orphanClasses: AnomalyClass[];
    teacherConflict: ConflictStudent[];
    missingTeacherSchools: MissingTs[];
    duplicateAccounts: DuplicateGroup[];
    noSchoolParents: { id: string; full_name: string; email: string; is_active: boolean }[];
    noSchoolTeachers: { id: string; full_name: string; email: string; is_active: boolean }[];
    noSchoolSchoolAccounts: { id: string; full_name: string; email: string; is_active: boolean }[];
    classes: ClassOption[];
    teachers: TeacherOption[];
    protectedCount: number;
  } | null>(null);
  const [schools, setSchools] = useState<{ id: string; name: string }[]>([]);
  // Restore-to-teacher panel state
  const [restoreTeacherId, setRestoreTeacherId] = useState('');
  const [restoreClassId, setRestoreClassId] = useState('');
  // Teacher Audit state
  const [auditTeacherId, setAuditTeacherId] = useState('');
  const [auditData, setAuditData] = useState<{ teacher_name: string | null; schoolAudit: AuditSchool[]; allClasses: ClassOption[] } | null>(null);
  const [auditLoading, setAuditLoading] = useState(false);
  const [auditDestClass, setAuditDestClass] = useState<Record<string, string>>({}); // schoolId => classId
  // Unified selection: covers both in-class and displaced students per school
  const [auditSel, setAuditSel] = useState<Record<string, Set<string>>>({}); // schoolId => Set<studentId>
  const [expandedClasses, setExpandedClasses] = useState<Set<string>>(new Set()); // class IDs with roster open
  const [createClassForm, setCreateClassForm] = useState<Record<string, { programme: string; grade: string; granularity: BandGranularity; autoFill: boolean }>>({});
  const [auditConfirmDelete, setAuditConfirmDelete] = useState<string | null>(null); // student id pending delete in audit
  const [noClassConfirmDelete, setNoClassConfirmDelete] = useState<string | null>(null);
  const [namingScan, setNamingScan] = useState<any>(null);
  const [namingBusy, setNamingBusy] = useState(false);
  const [namingSelected, setNamingSelected] = useState<Set<string>>(new Set());
  const [noClassProgramme, setNoClassProgramme] = useState('');
  // Claim a class state
  const [claimClassId, setClaimClassId] = useState('');
  const [claimTeacherId, setClaimTeacherId] = useState('');
  // Class Ownership Drain state
  const [classAuditId, setClassAuditId] = useState('');
  const [classAuditData, setClassAuditData] = useState<ClassAuditResult | null>(null);
  const [classAuditLoading, setClassAuditLoading] = useState(false);
  const [drainResult, setDrainResult] = useState<{ moved: number; skipped: number; details: DrainDetail[] } | null>(null);
  const [draining, setDraining] = useState(false);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  // Selection state per anomaly group
  const [selNoSchool, setSelNoSchool] = useState<Set<string>>(new Set());
  const [selNoClass, setSelNoClass] = useState<Set<string>>(new Set());
  const [selMismatched, setSelMismatched] = useState<Set<string>>(new Set());

  const [targetClass, setTargetClass] = useState('');
  const [targetSchool, setTargetSchool] = useState('');

  // Manual reassign state
  const [searchQ, setSearchQ] = useState('');
  const [searchResults, setSearchResults] = useState<SearchStudent[]>([]);
  const [searching, setSearching] = useState(false);
  const [reassignTarget, setReassignTarget] = useState<Record<string, string>>({});
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Visual Transfer Modal state ────────────────────────────
  type TransferStudent = { id: string; full_name: string; email: string; section_class: string | null; grade_level: string | null };
  const [showTransfer, setShowTransfer] = useState(false);
  const [txStep, setTxStep] = useState<1 | 2>(1); // 1=pick source+students, 2=pick dest+confirm
  const [txSrcSchool, setTxSrcSchool] = useState('');
  const [txSrcClass, setTxSrcClass] = useState('');
  const [txSrcStudents, setTxSrcStudents] = useState<TransferStudent[]>([]);
  const [txSrcLoading, setTxSrcLoading] = useState(false);
  const [txSelected, setTxSelected] = useState<Set<string>>(new Set());
  const [txDstSchool, setTxDstSchool] = useState('');
  const [txDstClass, setTxDstClass] = useState('');
  const [txSending, setTxSending] = useState(false);
  const [txDone, setTxDone] = useState<string | null>(null);

  // No-school manager state
  const [nsSort, setNsSort] = useState<'name' | 'registry'>('registry');
  const [nsFilter, setNsFilter] = useState('');
  const [nsSchool, setNsSchool] = useState<Record<string, string>>({});
  const [nsClass, setNsClass] = useState<Record<string, string>>({});
  const [nsConfirmDelete, setNsConfirmDelete] = useState<string | null>(null);

  const isAdmin = profile?.role === 'admin';

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [healRes, schoolRes] = await Promise.all([
        fetch('/api/classes/heal', { cache: 'no-store' }),
        fetch('/api/schools', { cache: 'no-store' }),
      ]);
      const healJson = await healRes.json();
      const schoolJson = await schoolRes.json();
      setData(healJson.data);
      setSchools(schoolJson.data ?? []);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    if (!authLoading && profile) {
      if (!isAdmin) { router.replace('/dashboard'); return; }
      load();
    }
  }, [profile?.id, authLoading]); // eslint-disable-line

  async function loadClassStudents(classId: string) {
    if (!classId) { setTxSrcStudents([]); setTxSelected(new Set()); return; }
    setTxSrcLoading(true);
    try {
      const res = await fetch(`/api/classes/heal?search=__class__&class_id=${classId}`);
      // Fallback: pull via supabase-style endpoint not available, so use a trick:
      // we store class students in the heal data — find them there
      const cls = data?.classes.find(c => c.id === classId);
      // Actually fetch fresh from the class audit endpoint
      const auditRes = await fetch(`/api/classes/heal?class_audit=${classId}`, { cache: 'no-store' });
      const auditJson = await auditRes.json();
      const all: TransferStudent[] = [
        ...(auditJson.data?.correct ?? []),
        ...(auditJson.data?.misplaced ?? []),
        ...(auditJson.data?.noSignal ?? []),
      ].map((s: any) => ({ id: s.id, full_name: s.full_name, email: s.email, section_class: s.section_class ?? null, grade_level: s.grade_level ?? null }));
      setTxSrcStudents(all);
      setTxSelected(new Set(all.map(s => s.id)));
    } catch { setTxSrcStudents([]); }
    finally { setTxSrcLoading(false); }
  }

  async function applyAction(action: string, studentIds: string[], extra: Record<string, string> = {}) {
    setWorking(true); setMsg(null);
    try {
      const res = await fetch('/api/classes/heal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, studentIds, ...extra }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || 'Failed');
      const detail = action === 'safe_auto_repair'
        ? `Auto-repair done — ${j.driftFixed ?? 0} drift fixed, ${j.classAssigned ?? 0} class assigned.`
        : action === 'seal_structure_backfill'
        ? `Structure sealed — school from class: ${j.schoolFromClass ?? 0}, parents: ${j.parentsFilled ?? 0}, teachers: ${j.teachersFilled ?? 0}, deactivated students: ${j.studentsDeactivated ?? 0}, staff: ${j.staffDeactivated ?? 0}.`
        : action === 'auto_align_by_reports'
        ? `Auto-align done — ${j.updated ?? 0} student(s) moved to their report teacher's class.`
        : action === 'restore_by_reports'
        ? `Restored ${j.updated ?? 0} student(s) to their teacher's class.`
        : action === 'sync_teacher_schools'
        ? `Added ${j.updated ?? 0} missing teacher–school link(s). Teacher profiles should now show all their students.`
        : `Fixed ${j.updated ?? 1} record(s).`;
      setMsg({ type: 'ok', text: detail });
      await load();
    } catch (e: any) {
      setMsg({ type: 'err', text: e.message });
    } finally { setWorking(false); }
  }

  async function scanNames() {
    setNamingBusy(true); setMsg(null);
    try {
      const res = await fetch('/api/classes/heal', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'canonicalize_class_names', dryRun: true }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || 'Scan failed');
      setNamingScan(j);
      // Start with nothing selected — admin opts in to each rename/merge to keep.
      setNamingSelected(new Set());
    } catch (e: any) { setMsg({ type: 'err', text: e.message }); }
    finally { setNamingBusy(false); }
  }

  function namingSelectableIds(): string[] {
    return (namingScan?.changes ?? [])
      .filter((c: any) => c.action !== 'backfill' && c.id)
      .map((c: any) => c.id as string);
  }

  function toggleNamingSel(id: string) {
    setNamingSelected((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  }

  async function fixNames(merge: boolean) {
    const selectedIds = [...namingSelected];
    if (selectedIds.length === 0) {
      setMsg({ type: 'err', text: 'Select at least one class to rename (or leave unchecked to keep the current name).' });
      return;
    }
    const selectedChanges = (namingScan?.changes ?? []).filter((c: any) => namingSelected.has(c.id));
    const renameCount = selectedChanges.filter((c: any) => c.action === 'rename' || c.action === 'set-term').length;
    const mergeCount = selectedChanges.filter((c: any) => c.action === 'merge' || c.action === 'conflict').length;
    if (!confirm(`Apply canonical names to ${selectedIds.length} selected class(es)?\n\n• ${renameCount} rename / set-term\n${merge ? `• ${mergeCount} duplicate merge(s)\n` : ''}Unselected classes keep their current names.\n\nThis can’t be auto-undone.`)) return;
    setNamingBusy(true); setMsg(null);
    try {
      const res = await fetch('/api/classes/heal', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'canonicalize_class_names',
          dryRun: false,
          mergeDuplicates: merge,
          classIds: selectedIds,
        }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || 'Fix failed');
      setMsg({
        type: 'ok',
        text: `Naming updated — ${j.renamed} renamed${j.termsSet ? `, ${j.termsSet} term set` : ''}${merge ? `, ${j.merged} merged` : ''}${j.skipped ? `, ${j.skipped} left as-is` : ''}${j.conflicts ? `, ${j.conflicts} duplicate conflict(s) left` : ''}${j.needsReview?.length ? `, ${j.needsReview.length} need review` : ''}.`,
      });
      await scanNames();
      await load();
    } catch (e: any) { setMsg({ type: 'err', text: e.message }); }
    finally { setNamingBusy(false); }
  }

  function handleSearchInput(val: string) {
    setSearchQ(val);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    if (!val.trim()) { setSearchResults([]); return; }
    searchTimer.current = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetch(`/api/classes/heal?search=${encodeURIComponent(val.trim())}`);
        const j = await res.json();
        setSearchResults(j.data ?? []);
      } catch { /* ignore */ }
      finally { setSearching(false); }
    }, 350);
  }

  async function reassignStudent(studentId: string) {
    const classId = reassignTarget[studentId];
    if (!classId) return;
    setWorking(true); setMsg(null);
    try {
      const res = await fetch('/api/classes/heal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'assign_class', studentIds: [studentId], classId }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || 'Failed');
      setMsg({ type: 'ok', text: 'Student reassigned.' });
      // refresh search results
      setSearchResults(prev => prev.map(s => {
        if (s.id !== studentId) return s;
        const cls = data?.classes.find(c => c.id === classId);
        return { ...s, class_id: classId, class_name: cls?.name ?? classId, section_class: cls?.name ?? s.section_class };
      }));
      setReassignTarget(prev => { const n = { ...prev }; delete n[studentId]; return n; });
      await load();
    } catch (e: any) {
      setMsg({ type: 'err', text: e.message });
    } finally { setWorking(false); }
  }

  function toggleSel(set: Set<string>, setFn: (s: Set<string>) => void, id: string) {
    const n = new Set(set);
    if (n.has(id)) n.delete(id); else n.add(id);
    setFn(n);
  }
  function selAll(ids: string[], setFn: (s: Set<string>) => void) {
    setFn(new Set(ids));
  }

  const classesForSchool = (sid: string) =>
    (data?.classes ?? []).filter((c) => c.school_id === sid);

  if (authLoading || (loading && activeTab === 'roster')) return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <ArrowPathIcon className="w-8 h-8 animate-spin text-primary" />
    </div>
  );

  const totalIssues = (data?.noSchool.length ?? 0) + (data?.noClass.length ?? 0) +
    (data?.mismatched.length ?? 0) + (data?.sectionDrift.length ?? 0) + (data?.orphanClasses.length ?? 0) +
    (data?.teacherConflict.length ?? 0) + (data?.missingTeacherSchools.length ?? 0) +
    (data?.duplicateAccounts.length ?? 0) +
    (data?.noSchoolParents?.length ?? 0) + (data?.noSchoolTeachers?.length ?? 0) +
    (data?.noSchoolSchoolAccounts?.length ?? 0);

  return (
    <div className="min-h-screen bg-background text-foreground mobile-page-root">
      <div className="max-w-5xl mx-auto px-4 py-8 space-y-6">
        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <ShieldCheckIcon className="w-4 h-4 text-primary" />
              <span className="text-[10px] font-black uppercase tracking-widest text-primary">Platform maintenance</span>
            </div>
            <h1 className="text-xl sm:text-2xl font-extrabold text-foreground">System Health</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Platform sanitation: roster repair and debris purge. Admin only.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setTab('cleanup')}
              className="flex items-center gap-2 px-3 py-2 bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold rounded-xl transition"
              title="Open debris cleanup — dry-run or full sanitation (repair + purge)"
            >
              <TrashIcon className="w-4 h-4 shrink-0" /> Full sanitation
            </button>
          {activeTab === 'roster' && (
            <>
              <button
                disabled={working || loading || !data}
                onClick={() => { setShowTransfer(true); setTxStep(1); setTxSrcSchool(''); setTxSrcClass(''); setTxSrcStudents([]); setTxSelected(new Set()); setTxDstSchool(''); setTxDstClass(''); setTxDone(null); }}
                className="flex items-center gap-2 px-3 py-2 bg-primary hover:bg-primary/90 disabled:opacity-40 text-white text-xs font-bold rounded-xl transition">
                <PlusIcon className="w-4 h-4 shrink-0" /> Transfer Students
              </button>
              <button
                onClick={() => applyAction('auto_align_by_reports', [])}
                disabled={working || loading || !data}
                title="For every student whose class teacher doesn't match their primary report author, move them to a class owned by the report teacher at the same school."
                className="flex items-center gap-2 px-3 py-2 bg-violet-600 hover:bg-violet-500 disabled:opacity-40 text-white text-xs font-bold rounded-xl transition">
                <ArrowPathIcon className="w-4 h-4 shrink-0" /> Auto-Align
              </button>
              <button
                onClick={() => applyAction('safe_auto_repair', [])}
                disabled={working || loading || totalIssues === 0}
                className="flex items-center gap-2 px-3 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white text-xs font-bold rounded-xl transition">
                <CheckCircleIcon className="w-4 h-4 shrink-0" /> Auto-Repair
              </button>
              <button
                onClick={() => applyAction('seal_structure_backfill', [])}
                disabled={working || loading || !data}
                title="Backfill school from class/children/teacher assignments, then deactivate any active account still missing required structure."
                className="flex items-center gap-2 px-3 py-2 bg-amber-700 hover:bg-amber-600 disabled:opacity-40 text-white text-xs font-bold rounded-xl transition">
                <CheckCircleIcon className="w-4 h-4 shrink-0" /> Seal Structure
              </button>
              <button onClick={load} disabled={working || loading}
                className="flex items-center gap-2 px-3 py-2 bg-muted hover:bg-muted/80 text-xs font-bold rounded-xl transition">
                <ArrowPathIcon className={`w-4 h-4 shrink-0 ${loading ? 'animate-spin' : ''}`} /> Re-scan
              </button>
            </>
          )}
          </div>
        </div>

        {/* Tabs: Roster repair | Debris cleanup */}
        <div className="flex gap-1.5 bg-muted/60 border border-border rounded-xl p-1 w-fit">
          <button
            type="button"
            onClick={() => setTab('roster')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all ${
              activeTab === 'roster'
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground hover:bg-card'
            }`}
          >
            <UserGroupIcon className="w-4 h-4" /> Roster repair
          </button>
          <button
            type="button"
            onClick={() => setTab('cleanup')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all ${
              activeTab === 'cleanup'
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground hover:bg-card'
            }`}
          >
            <TrashIcon className="w-4 h-4" /> Debris cleanup
          </button>
        </div>

        {activeTab === 'cleanup' && <DebrisCleanupPanel />}

        {activeTab === 'roster' && (
        <>
        {msg && (
          <div className={`flex items-center gap-2 px-4 py-3 rounded-xl text-sm font-semibold ${msg.type === 'ok' ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30' : 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/30'}`}>
            {msg.type === 'ok' ? <CheckCircleIcon className="w-4 h-4 shrink-0" /> : <ExclamationTriangleIcon className="w-4 h-4 shrink-0" />}
            {msg.text}
          </div>
        )}

        {/* Student name & duplicate health — self-serve cleanup / dedup / registry resync */}
        <NameHealthPanel />

        {/* Stats summary panel */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="bg-card border border-border rounded-xl px-4 py-3 flex flex-col gap-1">
            <span className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">Total Issues</span>
            <span className={`text-2xl font-black ${totalIssues > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-emerald-600 dark:text-emerald-400'}`}>{totalIssues}</span>
          </div>
          <div className="bg-card border border-violet-500/20 rounded-xl px-4 py-3 flex flex-col gap-1">
            <span className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">Conflicts</span>
            <span className="text-2xl font-black text-violet-600 dark:text-violet-400">{data?.teacherConflict.length ?? 0}</span>
          </div>
          <div className="bg-card border border-emerald-500/20 rounded-xl px-4 py-3 flex flex-col gap-1">
            <span className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">Protected</span>
            <span className="text-2xl font-black text-emerald-600 dark:text-emerald-400">{data?.protectedCount ?? 0}</span>
            <span className="text-[10px] text-muted-foreground leading-tight">students with a primary teacher lock</span>
          </div>
          <div className="bg-card border border-sky-500/20 rounded-xl px-4 py-3 flex flex-col gap-1">
            <span className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">No Class</span>
            <span className="text-2xl font-black text-sky-600 dark:text-sky-400">{data?.noClass.length ?? 0}</span>
          </div>
          <div className="bg-card border border-rose-500/20 rounded-xl px-4 py-3 flex flex-col gap-1 col-span-2 sm:col-span-1">
            <span className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">Duplicates</span>
            <span className="text-2xl font-black text-rose-600 dark:text-rose-400">{data?.duplicateAccounts.length ?? 0}</span>
            <span className="text-[10px] text-muted-foreground leading-tight">same email, multiple accounts</span>
          </div>
        </div>

        {/* ── Class Naming Convention ─────────────────────────────── */}
        <div className="bg-card border border-primary/25 rounded-xl p-4 sm:p-5 space-y-3 overflow-hidden">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <h2 className="text-sm font-black text-foreground">Class Naming Convention</h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                Preview proposed <span className="font-mono text-foreground/70">School · Programme · Band</span> names, then tick only the ones you want to apply. Unchecked classes keep their current names.
              </p>
            </div>
            <div className="flex flex-col sm:flex-row flex-wrap gap-2 w-full sm:w-auto shrink-0">
              <button onClick={scanNames} disabled={namingBusy}
                className="flex items-center justify-center gap-1.5 w-full sm:w-auto px-3 py-2.5 sm:py-2 bg-muted hover:bg-muted/80 disabled:opacity-40 text-xs font-black rounded-xl transition">
                <ArrowPathIcon className={`w-4 h-4 ${namingBusy ? 'animate-spin' : ''}`} /> Scan names
              </button>
              {namingScan && (
                <>
                  <button
                    onClick={() => fixNames(false)}
                    disabled={namingBusy || namingSelected.size === 0}
                    className="w-full sm:w-auto px-3 py-2.5 sm:py-2 bg-primary hover:bg-primary/90 disabled:opacity-40 text-white text-xs font-black rounded-xl transition"
                  >
                    Fix selected ({namingSelected.size})
                  </button>
                  {namingScan.conflicts > 0 && (
                    <button
                      onClick={() => fixNames(true)}
                      disabled={namingBusy || namingSelected.size === 0}
                      className="w-full sm:w-auto px-3 py-2.5 sm:py-2 bg-rose-600 hover:bg-rose-500 disabled:opacity-40 text-white text-xs font-black rounded-xl transition"
                    >
                      Fix selected + merge dupes
                    </button>
                  )}
                </>
              )}
            </div>
          </div>

          {namingScan && (
            <div className="space-y-2 min-w-0">
              <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:gap-3">
                <div className="grid grid-cols-2 gap-1.5 text-[11px] text-muted-foreground sm:flex sm:flex-wrap sm:gap-x-3 sm:gap-y-1 sm:text-xs">
                  <span>Scanned <strong className="text-foreground">{namingScan.scanned}</strong></span>
                  <span><strong className="text-primary">{(namingScan.changes ?? []).filter((c: any) => c.action === 'rename').length}</strong> to rename</span>
                  <span><strong className="text-sky-600 dark:text-sky-400">{(namingScan.changes ?? []).filter((c: any) => c.action === 'set-term').length}</strong> missing term{namingScan.currentTerm ? ` (→ ${namingScan.currentTerm})` : ''}</span>
                  <span><strong className="text-rose-600 dark:text-rose-400">{namingScan.conflicts}</strong> duplicate(s)</span>
                  <span className="col-span-2 sm:col-span-1"><strong className="text-amber-600 dark:text-amber-400">{namingScan.needsReview?.length ?? 0}</strong> need review</span>
                </div>
                {(namingScan.changes ?? []).filter((c: any) => c.action !== 'backfill').length > 0 && (
                  <div className="flex gap-3 sm:ml-auto">
                    <button
                      type="button"
                      onClick={() => setNamingSelected(new Set(namingSelectableIds()))}
                      className="text-[11px] font-bold text-primary hover:underline"
                    >
                      Select all
                    </button>
                    <button
                      type="button"
                      onClick={() => setNamingSelected(new Set())}
                      className="text-[11px] font-bold text-muted-foreground hover:underline"
                    >
                      Select none
                    </button>
                  </div>
                )}
              </div>
              {(namingScan.changes ?? []).filter((c: any) => c.action !== 'backfill').length === 0 ? (
                <p className="text-xs text-emerald-600 dark:text-emerald-400 font-bold">Every class already follows the convention.</p>
              ) : (
                <div className="max-h-72 overflow-y-auto overflow-x-hidden rounded-xl border border-border divide-y divide-border/60">
                  {(namingScan.changes ?? []).filter((c: any) => c.action !== 'backfill').slice(0, 200).map((c: any) => (
                    <label
                      key={c.id}
                      className={`flex items-start gap-2.5 px-3 py-2.5 text-xs cursor-pointer hover:bg-muted/40 ${namingSelected.has(c.id) ? 'bg-primary/5' : ''}`}
                    >
                      <input
                        type="checkbox"
                        checked={namingSelected.has(c.id)}
                        onChange={() => toggleNamingSel(c.id)}
                        className="rounded border-border shrink-0 mt-0.5"
                      />
                      <div className="min-w-0 flex-1 space-y-1">
                        <span className={`inline-block px-1.5 py-0.5 rounded font-black uppercase text-[9px] tracking-wider ${c.action === 'merge' || c.action === 'conflict' ? 'bg-rose-500/15 text-rose-600 dark:text-rose-400' : 'bg-primary/15 text-primary'}`}>{c.action}</span>
                        <div className="flex flex-col gap-0.5 sm:flex-row sm:items-center sm:gap-2 min-w-0">
                          <span className="text-muted-foreground line-through break-words sm:truncate">{c.from}</span>
                          <span className="text-muted-foreground/50 hidden sm:inline shrink-0">→</span>
                          <span className="text-[10px] text-muted-foreground/60 sm:hidden">becomes</span>
                          <span className="font-bold text-foreground break-words sm:truncate">{c.to}</span>
                        </div>
                      </div>
                    </label>
                  ))}
                </div>
              )}
              {namingScan.needsReview?.length > 0 && (
                <p className="text-[11px] text-amber-600/80 dark:text-amber-400/80 break-words">Need review (no programme/grade to derive): {namingScan.needsReview.slice(0, 8).map((r: any) => r.name).join(', ')}{namingScan.needsReview.length > 8 ? '…' : ''}</p>
              )}
            </div>
          )}
        </div>

        {totalIssues === 0 && (
          <div className="text-center py-16 bg-card border border-emerald-500/20 rounded-xl">
            <CheckCircleIcon className="w-12 h-12 mx-auto text-emerald-600 dark:text-emerald-400 mb-3" />
            <p className="text-lg font-bold text-foreground">All clear — no anomalies found.</p>
          </div>
        )}

        {/* ── Manual Reassign ──────────────────────────────────── */}
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-border flex items-center gap-3">
            <MagnifyingGlassIcon className="w-5 h-5 text-primary shrink-0" />
            <div className="flex-1">
              <h2 className="text-sm font-extrabold text-foreground">Manual Student Placement</h2>
              <p className="text-xs text-muted-foreground">Search any student and manually move them to the correct class.</p>
            </div>
          </div>
          <div className="p-5 space-y-4">
            <div className="relative">
              <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
              <input
                type="text"
                value={searchQ}
                onChange={e => handleSearchInput(e.target.value)}
                placeholder="Search by name or email…"
                className="w-full pl-9 pr-4 py-2.5 bg-muted/40 border border-border rounded-xl text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
              />
              {searching && <ArrowPathIcon className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin text-muted-foreground" />}
            </div>

            {searchResults.length > 0 && (
              <div className="space-y-2">
                {searchResults.map(s => (
                  <div key={s.id} className="flex flex-col gap-2 px-4 py-3 bg-muted/30 rounded-xl border border-border">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-foreground truncate">{s.full_name}</p>
                      <p className="text-xs text-muted-foreground truncate">
                        {s.email}
                        {s.school_name ? ` · ${s.school_name}` : s.school_id ? ` · ${s.school_id}` : ' · No school'}
                      </p>
                      <p className="text-xs mt-0.5">
                        <span className="text-muted-foreground">Current class: </span>
                        <span className={s.class_name ? 'text-foreground font-medium' : 'text-amber-600 dark:text-amber-400 italic'}>
                          {s.class_name ?? (s.section_class ? `"${s.section_class}" (unlinked)` : 'None')}
                        </span>
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <select
                        value={reassignTarget[s.id] ?? ''}
                        onChange={e => setReassignTarget(prev => ({ ...prev, [s.id]: e.target.value }))}
                        className="select-premium text-xs px-2 py-1.5 flex-1"
                      >
                        <option value="">— Move to class —</option>
                        <ClassOptions classes={data?.classes ?? []} schools={schools} />
                      </select>
                      <button
                        disabled={!reassignTarget[s.id] || working}
                        onClick={() => reassignStudent(s.id)}
                        className="px-3 py-1.5 bg-primary text-white text-xs font-black rounded-xl disabled:opacity-40 transition shrink-0"
                      >
                        Move
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {searchQ.trim() && !searching && searchResults.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-4">No students found for "{searchQ}".</p>
            )}
          </div>
        </div>

        {/* ── Teacher Audit & Restore ──────────────────────────── */}
        <div className="bg-card border border-violet-500/20 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-border flex items-center gap-3">
            <ArrowPathIcon className="w-5 h-5 text-violet-600 dark:text-violet-400 shrink-0" />
            <div className="flex-1">
              <h2 className="text-sm font-extrabold text-foreground">Teacher Audit & Restore</h2>
              <p className="text-xs text-muted-foreground">
                Select a teacher to see a full breakdown: every school they're assigned to, their classes at each school,
                how many students are currently enrolled, and any students who have reports authored by this teacher
                but are currently in a different class. Use this to surgically restore students school-by-school.
              </p>
            </div>
          </div>
          <div className="p-5 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-end gap-3">
              <div className="flex-1">
                <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1.5">Select Teacher to Audit</label>
                <select
                  value={auditTeacherId}
                  onChange={e => { setAuditTeacherId(e.target.value); setAuditData(null); }}
                  className="select-premium w-full text-sm px-3 py-2"
                >
                  <option value="">— Choose a teacher —</option>
                  {(data?.teachers ?? []).map(t => (
                    <option key={t.id} value={t.id}>{t.full_name}</option>
                  ))}
                </select>
              </div>
              <button
                disabled={!auditTeacherId || auditLoading}
                onClick={async () => {
                  if (!auditTeacherId) return;
                  setAuditLoading(true); setAuditData(null);
                  try {
                    const res = await fetch(`/api/classes/heal?teacher_audit=${auditTeacherId}`, { cache: 'no-store' });
                    const j = await res.json();
                    setAuditData(j.data ?? null);
                    setAuditDestClass({});
                    setAuditSel({});
                    setExpandedClasses(new Set());
                    setCreateClassForm({});
                  } catch { /* ignore */ }
                  setAuditLoading(false);
                }}
                className="w-full sm:w-auto px-4 py-2.5 sm:py-2 bg-violet-600 hover:bg-violet-500 disabled:opacity-40 text-white text-sm font-black rounded-xl transition"
              >
                {auditLoading ? <ArrowPathIcon className="w-4 h-4 animate-spin mx-auto" /> : 'Run Audit'}
              </button>
            </div>

            {auditData && (
              <div className="space-y-6">
                <p className="text-xs font-bold text-violet-600 dark:text-violet-400 uppercase tracking-widest">
                  Audit results for {auditData.teacher_name} — {auditData.schoolAudit.length} school(s)
                </p>
                {auditData.schoolAudit.map(school => {
                  const schoolSel = auditSel[school.school_id] ?? new Set<string>();
                  const selCount = schoolSel.size;

                  function toggleSt(id: string) {
                    setAuditSel(prev => {
                      const cur = new Set(prev[school.school_id] ?? []);
                      if (cur.has(id)) cur.delete(id); else cur.add(id);
                      return { ...prev, [school.school_id]: cur };
                    });
                  }
                  function selectIds(ids: string[]) {
                    setAuditSel(prev => {
                      const cur = new Set(prev[school.school_id] ?? []);
                      ids.forEach(id => cur.add(id));
                      return { ...prev, [school.school_id]: cur };
                    });
                  }
                  function deselectIds(ids: string[]) {
                    setAuditSel(prev => {
                      const cur = new Set(prev[school.school_id] ?? []);
                      ids.forEach(id => cur.delete(id));
                      return { ...prev, [school.school_id]: cur };
                    });
                  }

                  return (
                  <div key={school.school_id} className={`rounded-xl border p-4 space-y-4 ${school.displaced_students.length > 0 ? 'border-amber-500/30 bg-amber-500/5' : 'border-border bg-muted/10'}`}>
                    {/* ── School header ── */}
                    <div className="flex items-start gap-3">
                      <div className="flex-1">
                        <p className="text-sm font-extrabold text-foreground">{school.school_name}</p>
                        <p className="text-xs text-muted-foreground mt-0.5 flex flex-wrap items-center gap-1.5">
                          <span>{school.classes.length} class(es)</span>
                          <span>·</span>
                          <span>{school.students_in_classes.length} enrolled</span>
                          {school.displaced_students.length > 0 && <>
                            <span>·</span>
                            <span className="text-amber-600 dark:text-amber-400 font-bold">{school.displaced_students.length} displaced</span>
                          </>}
                          {!school.in_teacher_schools && (
                            <span className="ml-1 px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-600 dark:text-rose-400 text-[10px] font-black border border-rose-500/30">
                              Missing teacher_schools link
                            </span>
                          )}
                        </p>
                      </div>
                      {!school.in_teacher_schools && (
                        <button
                          disabled={working}
                          onClick={() => applyAction('sync_teacher_schools', [], { teacherId: auditTeacherId })}
                          className="px-3 py-1.5 bg-rose-600 hover:bg-rose-500 text-white text-xs font-black rounded-xl disabled:opacity-40 transition active:scale-95 shrink-0"
                        >
                          Fix Link
                        </button>
                      )}
                    </div>

                    {/* ── Class roster workspace ── */}
                    {school.classes.length > 0 && (
                      <div className="space-y-2">
                        <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">Class Roster — select to shift</p>
                        {school.classes.map(cls => {
                          const isExpanded = expandedClasses.has(cls.id);
                          const allInClass = cls.students.map((s: AuditStudent) => s.id);
                          const allSelected = allInClass.length > 0 && allInClass.every(id => schoolSel.has(id));
                          return (
                            <div key={cls.id} className="border border-border rounded-xl overflow-hidden bg-background">
                              {/* Class header */}
                              <div
                                className="flex items-center gap-3 px-3 py-2.5 cursor-pointer hover:bg-muted/30 transition"
                                onClick={() => setExpandedClasses(prev => {
                                  const n = new Set(prev);
                                  if (n.has(cls.id)) n.delete(cls.id); else n.add(cls.id);
                                  return n;
                                })}
                              >
                                <div className="flex-1 min-w-0">
                                  <span className="text-sm font-bold text-foreground">{cls.name}</span>
                                  <span className="text-xs text-muted-foreground ml-2">
                                    {cls.student_count} student{cls.student_count !== 1 ? 's' : ''}
                                    {allInClass.some(id => schoolSel.has(id)) && (
                                      <span className="ml-2 text-violet-600 dark:text-violet-400 font-bold">
                                        · {allInClass.filter(id => schoolSel.has(id)).length} selected
                                      </span>
                                    )}
                                  </span>
                                </div>
                                <ChevronDownIcon className={`w-4 h-4 text-muted-foreground shrink-0 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                              </div>
                              {/* Expanded roster */}
                              {isExpanded && (
                                <div className="border-t border-border p-2 space-y-1">
                                  {cls.students.length === 0 ? (
                                    <p className="text-xs text-muted-foreground italic px-2 py-1">No students currently in this class.</p>
                                  ) : (
                                    <>
                                      <div className="flex items-center gap-3 px-2 py-1">
                                        <button onClick={() => allSelected ? deselectIds(allInClass) : selectIds(allInClass)}
                                          className="text-xs font-bold text-primary hover:underline">
                                          {allSelected ? 'Deselect all' : 'Select all'}
                                        </button>
                                        <span className="text-xs text-muted-foreground">in {cls.name}</span>
                                      </div>
                                      <div className="max-h-52 overflow-y-auto space-y-0.5 pr-1">
                                        {cls.students.map((s: AuditStudent) => (
                                          <div key={s.id} className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg transition border ${schoolSel.has(s.id) ? 'bg-violet-500/10 border-violet-500/30' : 'border-transparent hover:bg-muted/30'}`}>
                                            <input type="checkbox" checked={schoolSel.has(s.id)} onChange={() => toggleSt(s.id)} className="w-4 h-4 rounded text-violet-600 dark:text-violet-400 shrink-0 cursor-pointer" />
                                            <div className="flex-1 min-w-0">
                                              <div className="flex items-center gap-1.5 flex-wrap">
                                                <p className="text-xs font-semibold text-foreground truncate">{s.full_name}</p>
                                                {s.grade_level && <span className="text-[9px] px-1 py-0.5 bg-sky-500/15 text-sky-600 dark:text-sky-400 border border-sky-500/30 rounded font-black uppercase shrink-0">{s.grade_level}</span>}
                                              </div>
                                              <p className="text-[10px] text-muted-foreground truncate">{s.email}</p>
                                            </div>
                                            <button
                                              title="Remove from class"
                                              onClick={() => applyAction('remove_from_class', [s.id])}
                                              disabled={working}
                                              className="p-1 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 text-amber-600 dark:text-amber-400 transition shrink-0">
                                              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                                            </button>
                                          </div>
                                        ))}
                                      </div>
                                    </>
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {/* ── No classes yet — warn + offer create ── */}
                    {school.classes.length === 0 && school.displaced_students.length > 0 && (
                      <div className="px-3 py-2.5 bg-amber-500/10 border border-amber-500/20 rounded-xl">
                        <p className="text-xs font-bold text-amber-600 dark:text-amber-400">No class exists for this teacher at {school.school_name} yet.</p>
                        <p className="text-xs text-amber-600/70 dark:text-amber-400/70 mt-0.5">Create a class below to assign the {school.displaced_students.length} displaced student(s).</p>
                      </div>
                    )}

                    {/* ── Displaced students ── */}
                    {school.displaced_students.length > 0 && (
                      <div className="space-y-2">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-xs font-bold text-amber-600 dark:text-amber-400 uppercase tracking-widest">
                            {school.displaced_students.length} displaced — need placement
                          </p>
                          {school.displaced_students.filter(s => (s.displacement_sources ?? []).length >= 2).length > 0 && (
                            <span className="text-[10px] text-muted-foreground">
                              · {school.displaced_students.filter(s => (s.displacement_sources ?? []).length >= 2).length} confirmed by 2+ signals
                            </span>
                          )}
                        </div>
                        <div className="space-y-1.5 max-h-64 overflow-y-auto pr-1">
                          {school.displaced_students.map(s => {
                            const checked = schoolSel.has(s.id);
                            const sources = s.displacement_sources ?? [];
                            const hasReports = sources.includes('report_authored');
                            const hasBatch = sources.includes('batch_registered');
                            const hasRegistered = sources.includes('registered_by');
                            const multiSignal = sources.length >= 2;
                            return (
                              <div key={s.id} className={`flex items-center gap-3 px-3 py-2 rounded-xl border transition ${checked ? 'bg-violet-500/10 border-violet-500/30' : 'bg-background border-border hover:bg-muted/30'}`}>
                                <input type="checkbox" checked={checked} onChange={() => toggleSt(s.id)} className="w-4 h-4 rounded text-violet-600 dark:text-violet-400 shrink-0 cursor-pointer" />
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <p className="text-sm font-semibold text-foreground truncate">{s.full_name}</p>
                                    {s.grade_level && <span className="text-[9px] px-1.5 py-0.5 bg-sky-500/15 text-sky-600 dark:text-sky-400 border border-sky-500/30 rounded font-black uppercase shrink-0">{s.grade_level}</span>}
                                    {multiSignal && (
                                      <span className="text-[9px] px-1.5 py-0.5 bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 rounded font-black uppercase whitespace-nowrap shrink-0">
                                        {hasReports && hasBatch && hasRegistered ? 'All 3 Signals' : hasReports && hasBatch ? 'Reports + Batch' : hasReports && hasRegistered ? 'Reports + Registered' : 'Batch + Registered'}
                                      </span>
                                    )}
                                    {!multiSignal && hasReports && <span className="text-[9px] px-1.5 py-0.5 bg-violet-500/15 text-violet-600 dark:text-violet-400 border border-violet-500/30 rounded font-black uppercase whitespace-nowrap shrink-0">Has Reports</span>}
                                    {!multiSignal && hasBatch && <span className="text-[9px] px-1.5 py-0.5 bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30 rounded font-black uppercase whitespace-nowrap shrink-0">Batch Registered</span>}
                                    {!multiSignal && hasRegistered && <span className="text-[9px] px-1.5 py-0.5 bg-violet-500/15 text-violet-600 dark:text-violet-400 border border-violet-500/30 rounded font-black uppercase whitespace-nowrap shrink-0">Registered By</span>}
                                  </div>
                                  <p className="text-xs text-muted-foreground truncate mt-0.5">
                                    {s.current_class_name
                                      ? `Currently in: ${s.current_class_name}${s.current_class_teacher_name ? ` (${s.current_class_teacher_name})` : ''}`
                                      : 'Not in any class'}
                                  </p>
                                </div>
                                {auditConfirmDelete === s.id ? (
                                  <div className="flex items-center gap-1.5 shrink-0">
                                    <button disabled={working} onClick={async () => {
                                      setAuditConfirmDelete(null);
                                      await applyAction('delete_portal_user', [s.id]);
                                      const r2 = await fetch(`/api/classes/heal?teacher_audit=${auditTeacherId}`, { cache: 'no-store' });
                                      setAuditData((await r2.json()).data ?? null);
                                    }} className="px-2 py-1 bg-rose-600 text-white text-[10px] font-black rounded-lg disabled:opacity-40">Yes</button>
                                    <button onClick={() => setAuditConfirmDelete(null)} className="px-2 py-1 bg-muted text-[10px] font-bold rounded-lg">No</button>
                                  </div>
                                ) : (
                                  <button onClick={() => setAuditConfirmDelete(s.id)} title="Delete student"
                                    className="p-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-600 dark:text-rose-400 transition shrink-0">
                                    <TrashIcon className="w-3.5 h-3.5" />
                                  </button>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* ── Unified move controls ── */}
                    <div className="border-t border-border pt-3 space-y-3">
                      <div className="flex items-center gap-3 flex-wrap">
                        <button
                          onClick={() => selectIds(school.displaced_students.map(s => s.id))}
                          className="text-xs font-bold text-amber-600 dark:text-amber-400 hover:underline"
                        >
                          Select all displaced
                        </button>
                        {school.classes.length > 0 && (
                          <button
                            onClick={() => selectIds(school.students_in_classes.map((s: AuditStudent) => s.id))}
                            className="text-xs font-bold text-muted-foreground hover:underline"
                          >
                            Select all enrolled
                          </button>
                        )}
                        <button
                          onClick={() => setAuditSel(prev => { const n = { ...prev }; delete n[school.school_id]; return n; })}
                          className="text-xs font-bold text-muted-foreground hover:underline"
                        >
                          Clear
                        </button>
                        <span className="text-xs text-muted-foreground ml-auto">{selCount} selected</span>
                      </div>

                      {/* Move to existing class */}
                      {school.classes.length > 0 && (
                        <div className="flex flex-col sm:flex-row gap-2">
                          <select
                            value={auditDestClass[school.school_id] ?? ''}
                            onChange={e => setAuditDestClass(prev => ({ ...prev, [school.school_id]: e.target.value }))}
                            className="select-premium text-xs px-2 py-1.5 flex-1"
                          >
                            <option value="">— Move selected to class —</option>
                            {school.classes.map(c => <option key={c.id} value={c.id}>{c.name} ({c.student_count} students)</option>)}
                          </select>
                          {/* Restore All Displaced in one click when destination is chosen */}
                          {school.displaced_students.length > 0 && auditDestClass[school.school_id] && (
                            <button
                              disabled={working}
                              onClick={async () => {
                                const ids = school.displaced_students.map(s => s.id);
                                const destId = auditDestClass[school.school_id];
                                if (!ids.length || !destId) return;
                                setWorking(true); setMsg(null);
                                try {
                                  const res = await fetch('/api/classes/heal', {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ action: 'direct_assign', classId: destId, studentIds: ids }),
                                  });
                                  const j = await res.json();
                                  if (!res.ok) throw new Error(j.error || 'Failed');
                                  setMsg({ type: 'ok', text: `Restored all ${j.updated} displaced student(s).${j.skipped ? ` ${j.skipped} skipped (school mismatch).` : ''}` });
                                  const r2 = await fetch(`/api/classes/heal?teacher_audit=${auditTeacherId}`, { cache: 'no-store' });
                                  setAuditData((await r2.json()).data ?? null);
                                  setAuditSel(prev => { const n = { ...prev }; delete n[school.school_id]; return n; });
                                  await load();
                                } catch (e: any) { setMsg({ type: 'err', text: e.message }); }
                                finally { setWorking(false); }
                              }}
                              className="w-full sm:w-auto px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-black rounded-xl disabled:opacity-40 transition active:scale-95 shrink-0"
                            >
                              Restore All ({school.displaced_students.length}) →
                            </button>
                          )}
                          <button
                            disabled={!auditDestClass[school.school_id] || selCount === 0 || working}
                            onClick={async () => {
                              const ids = Array.from(schoolSel);
                              const destId = auditDestClass[school.school_id];
                              if (!ids.length || !destId) return;
                              setWorking(true); setMsg(null);
                              try {
                                const res = await fetch('/api/classes/heal', {
                                  method: 'POST',
                                  headers: { 'Content-Type': 'application/json' },
                                  body: JSON.stringify({ action: 'direct_assign', classId: destId, studentIds: ids }),
                                });
                                const j = await res.json();
                                if (!res.ok) throw new Error(j.error || 'Failed');
                                setMsg({ type: 'ok', text: `Moved ${j.updated} student(s).${j.skipped ? ` ${j.skipped} skipped (school mismatch).` : ''}` });
                                const r2 = await fetch(`/api/classes/heal?teacher_audit=${auditTeacherId}`, { cache: 'no-store' });
                                const j2 = await r2.json();
                                setAuditData(j2.data ?? null);
                                setAuditSel(prev => { const n = { ...prev }; delete n[school.school_id]; return n; });
                                await load();
                              } catch (e: any) {
                                setMsg({ type: 'err', text: e.message });
                              } finally { setWorking(false); }
                            }}
                            className="w-full sm:w-auto px-4 py-2 sm:py-1.5 bg-violet-600 hover:bg-violet-500 text-white text-xs font-black rounded-xl disabled:opacity-40 transition active:scale-95 shrink-0"
                          >
                            Move Selected →
                          </button>
                        </div>
                      )}

                      {/* Create new class form — programme + grade only, name is composed */}
                      {createClassForm[school.school_id] !== undefined ? (() => {
                        const cf = createClassForm[school.school_id];
                        const preview = composeClassName({ schoolName: school.school_name, programme: cf.programme, grade: cf.grade, granularity: cf.granularity }).name;
                        return (
                        <div className="border border-dashed border-primary/40 rounded-xl p-3 space-y-2.5 bg-primary/5">
                          <p className="text-xs font-black text-primary uppercase tracking-wide">Create New Class</p>
                          <select
                            value={cf.programme}
                            onChange={e => setCreateClassForm(prev => ({ ...prev, [school.school_id]: { ...prev[school.school_id], programme: e.target.value } }))}
                            className="w-full px-3 py-2 bg-background border border-border rounded-xl text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
                          >
                            <option value="">Select programme…</option>
                            {PROGRAMME_OPTIONS.map(p => <option key={p} value={p}>{p}</option>)}
                          </select>
                          <GradeBandPicker
                            grade={cf.grade}
                            onChange={({ granularity, grade }) => setCreateClassForm(prev => ({ ...prev, [school.school_id]: { ...prev[school.school_id], granularity, grade } }))}
                            selectClass="w-full px-3 py-2 bg-background border border-border rounded-xl text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
                          />
                          <div className="rounded-lg border border-primary/20 bg-background px-3 py-2">
                            <p className="text-[9px] font-black uppercase tracking-widest text-muted-foreground/70">Class name (auto)</p>
                            <p className="text-xs font-black text-foreground">{preview || <span className="text-muted-foreground font-normal">Pick programme + grade…</span>}</p>
                          </div>
                          <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
                            <input
                              type="checkbox"
                              checked={cf.autoFill}
                              onChange={e => setCreateClassForm(prev => ({ ...prev, [school.school_id]: { ...prev[school.school_id], autoFill: e.target.checked } }))}
                              className="w-4 h-4 rounded"
                            />
                            Auto-assign all {school.displaced_students.length} displaced student(s) to this new class
                          </label>
                          <div className="flex gap-2">
                            <button
                              disabled={!cf.programme || !cf.grade || working}
                              onClick={async () => {
                                if (!cf.programme || !cf.grade || !auditTeacherId) return;
                                const fillIds = cf.autoFill
                                  ? school.displaced_students.map(s => s.id)
                                  : selCount > 0 ? Array.from(schoolSel) : [];
                                setWorking(true); setMsg(null);
                                try {
                                  const res = await fetch('/api/classes/heal', {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ action: 'create_class_for_teacher', teacherId: auditTeacherId, schoolId: school.school_id, className: cf.programme, grade: cf.grade, band_granularity: cf.granularity, studentIds: fillIds }),
                                  });
                                  const j = await res.json();
                                  if (!res.ok) throw new Error(j.error || 'Failed');
                                  setMsg({ type: 'ok', text: `Class "${j.className}" created. ${j.enrolled} student(s) assigned.` });
                                  setCreateClassForm(prev => { const n = { ...prev }; delete n[school.school_id]; return n; });
                                  setAuditSel(prev => { const n = { ...prev }; delete n[school.school_id]; return n; });
                                  const r2 = await fetch(`/api/classes/heal?teacher_audit=${auditTeacherId}`, { cache: 'no-store' });
                                  const j2 = await r2.json();
                                  setAuditData(j2.data ?? null);
                                  setExpandedClasses(prev => { const n = new Set(prev); if (j.classId) n.add(j.classId); return n; });
                                  await load();
                                } catch (e: any) {
                                  setMsg({ type: 'err', text: e.message });
                                } finally { setWorking(false); }
                              }}
                              className="flex-1 sm:flex-none px-4 py-2 bg-primary hover:bg-primary/80 text-white text-xs font-black rounded-xl disabled:opacity-40 transition"
                            >
                              Create &amp; Fill
                            </button>
                            <button
                              onClick={() => setCreateClassForm(prev => { const n = { ...prev }; delete n[school.school_id]; return n; })}
                              className="px-3 py-2 bg-muted hover:bg-muted/80 text-muted-foreground text-xs font-bold rounded-xl transition"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                        );
                      })() : (
                        <button
                          onClick={() => setCreateClassForm(prev => ({ ...prev, [school.school_id]: { programme: '', grade: '', granularity: 'fixed', autoFill: true } }))}
                          className="flex items-center gap-1.5 text-xs font-bold text-primary/70 hover:text-primary transition"
                        >
                          <PlusIcon className="w-3.5 h-3.5" /> Create new class for this teacher at {school.school_name}
                        </button>
                      )}
                    </div>

                    {school.displaced_students.length === 0 && school.classes.length > 0 && (
                      <p className="text-xs text-emerald-600 dark:text-emerald-400 font-semibold">All students correctly assigned to this teacher's classes.</p>
                    )}
                  </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* ── Claim a Class ───────────────────────────────────── */}
        <div className="bg-card border border-sky-500/20 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-border flex items-center gap-3">
            <CheckCircleIcon className="w-5 h-5 text-sky-600 dark:text-sky-400 shrink-0" />
            <div className="flex-1">
              <h2 className="text-sm font-extrabold text-foreground">Claim a Class for a Teacher</h2>
              <p className="text-xs text-muted-foreground">
                Override any signal. Pick a class and a teacher — the class teacher is updated immediately,
                every student in the class is locked to that teacher (<code className="bg-muted px-1 rounded text-[10px]">primary_teacher_id</code>),
                and the teacher–school link is created if missing.
                Use this when the automated signals are wrong.
              </p>
            </div>
          </div>
          <div className="p-5 space-y-3">
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="flex-1">
                <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1.5">Class</label>
                <select
                  value={claimClassId}
                  onChange={e => setClaimClassId(e.target.value)}
                  className="select-premium w-full text-sm px-3 py-2"
                >
                  <option value="">— Choose a class —</option>
                  <ClassOptions classes={data?.classes ?? []} schools={schools} />
                </select>
              </div>
              <div className="flex-1">
                <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1.5">Assign to Teacher</label>
                <select
                  value={claimTeacherId}
                  onChange={e => setClaimTeacherId(e.target.value)}
                  className="select-premium w-full text-sm px-3 py-2"
                >
                  <option value="">— Choose a teacher —</option>
                  {(data?.teachers ?? []).map(t => (
                    <option key={t.id} value={t.id}>{t.full_name}</option>
                  ))}
                </select>
              </div>
            </div>
            <button
              disabled={!claimClassId || !claimTeacherId || working}
              onClick={async () => {
                setWorking(true); setMsg(null);
                try {
                  const res = await fetch('/api/classes/heal', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ action: 'claim_class', classId: claimClassId, teacherId: claimTeacherId }),
                  });
                  const j = await res.json();
                  if (!res.ok) throw new Error(j.error || 'Failed');
                  const teacher = (data?.teachers ?? []).find(t => t.id === claimTeacherId);
                  const cls = (data?.classes ?? []).find(c => c.id === claimClassId);
                  setMsg({ type: 'ok', text: `Class "${cls?.name ?? claimClassId}" claimed for ${teacher?.full_name ?? 'teacher'}. ${j.studentsStamped} student(s) locked to this teacher.` });
                  setClaimClassId('');
                  setClaimTeacherId('');
                  await load();
                } catch (e: any) {
                  setMsg({ type: 'err', text: e.message });
                } finally { setWorking(false); }
              }}
              className="w-full sm:w-auto px-5 py-2.5 bg-sky-600 hover:bg-sky-500 disabled:opacity-40 text-white text-sm font-black rounded-xl transition active:scale-95"
            >
              Claim Class →
            </button>
          </div>
        </div>

        {/* ── Class Ownership Drain ───────────────────────────── */}
        <div className="bg-card border border-orange-500/20 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-border flex items-center gap-3">
            <ExclamationTriangleIcon className="w-5 h-5 text-orange-600 dark:text-orange-400 shrink-0" />
            <div className="flex-1">
              <h2 className="text-sm font-extrabold text-foreground">Class Ownership Drain</h2>
              <p className="text-xs text-muted-foreground">
                Pick a class that has absorbed too many students (e.g. Amaka&apos;s class holding the whole school).
                The analyzer checks every student&apos;s signal (reports → batch → registration) and classifies them
                as correctly placed, misplaced, or unknown. You see exactly who will move and where before confirming.
              </p>
            </div>
          </div>
          <div className="p-5 space-y-4">
            {/* Class picker + Analyze */}
            <div className="flex flex-col sm:flex-row sm:items-end gap-3">
              <div className="flex-1">
                <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1.5">Select Class to Audit</label>
                <select
                  value={classAuditId}
                  onChange={e => { setClassAuditId(e.target.value); setClassAuditData(null); setDrainResult(null); }}
                  className="select-premium w-full text-sm px-3 py-2"
                >
                  <option value="">— Choose a class —</option>
                  <ClassOptions classes={data?.classes ?? []} schools={schools} />
                </select>
              </div>
              <button
                disabled={!classAuditId || classAuditLoading}
                onClick={async () => {
                  setClassAuditLoading(true); setClassAuditData(null); setDrainResult(null);
                  try {
                    const res = await fetch(`/api/classes/heal?class_audit=${classAuditId}`, { cache: 'no-store' });
                    const j = await res.json();
                    setClassAuditData(j.data ?? null);
                  } catch { /* ignore */ }
                  setClassAuditLoading(false);
                }}
                className="w-full sm:w-auto px-4 py-2.5 sm:py-2 bg-orange-600 hover:bg-orange-500 disabled:opacity-40 text-white text-sm font-black rounded-xl transition"
              >
                {classAuditLoading ? <ArrowPathIcon className="w-4 h-4 animate-spin mx-auto" /> : 'Analyze Class'}
              </button>
            </div>

            {/* Analysis results */}
            {classAuditData && (
              <div className="space-y-4">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-xs font-bold text-orange-600 dark:text-orange-400 uppercase tracking-widest">{classAuditData.class_name}</p>
                  <span className="text-xs text-muted-foreground">· Teacher: {classAuditData.teacher_name ?? '—'}</span>
                  <span className="text-xs text-muted-foreground">· {classAuditData.school_name ?? '—'}</span>
                </div>

                {/* Summary counts */}
                <div className="grid grid-cols-3 gap-2">
                  <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl px-3 py-2.5 text-center">
                    <p className="text-2xl font-black text-emerald-600 dark:text-emerald-400">{classAuditData.correct.length}</p>
                    <p className="text-[10px] font-black text-emerald-600/70 dark:text-emerald-400/70 uppercase tracking-widest">Correct</p>
                  </div>
                  <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl px-3 py-2.5 text-center">
                    <p className="text-2xl font-black text-amber-600 dark:text-amber-400">{classAuditData.misplaced.length}</p>
                    <p className="text-[10px] font-black text-amber-600/70 dark:text-amber-400/70 uppercase tracking-widest">Misplaced</p>
                  </div>
                  <div className="bg-muted/30 border border-border rounded-xl px-3 py-2.5 text-center">
                    <p className="text-2xl font-black text-muted-foreground">{classAuditData.noSignal.length}</p>
                    <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">No Signal</p>
                  </div>
                </div>

                {/* Misplaced — show who moves where before draining */}
                {classAuditData.misplaced.length > 0 && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-xs font-bold text-amber-600 dark:text-amber-400 uppercase tracking-widest">
                        {classAuditData.misplaced.length} misplaced — preview of what drain will do
                      </p>
                    </div>
                    <div className="space-y-1.5 max-h-80 overflow-y-auto pr-1">
                      {classAuditData.misplaced.map(s => (
                        <div key={s.id} className="px-3 py-2.5 bg-amber-500/5 border border-amber-500/20 rounded-xl">
                          <div className="flex items-start gap-2 flex-wrap">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <p className="text-sm font-semibold text-foreground truncate">{s.full_name}</p>
                                {s.grade_level && <span className="text-[9px] px-1.5 py-0.5 bg-sky-500/15 text-sky-600 dark:text-sky-400 border border-sky-500/30 rounded font-black uppercase shrink-0">{s.grade_level}</span>}
                              </div>
                              <p className="text-[11px] text-muted-foreground truncate">{s.email}</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-1.5 mt-1.5 flex-wrap text-[11px]">
                            <span className="text-muted-foreground">Signal:</span>
                            <span className="font-bold text-violet-600 dark:text-violet-400">{s.signal_teacher_name ?? s.signal_teacher_id ?? '?'}</span>
                            {s.displacement_sources.length > 0 && (
                              <span className="px-1.5 py-0.5 bg-violet-500/10 text-violet-600 dark:text-violet-400 border border-violet-500/20 rounded text-[9px] font-black uppercase">
                                {s.displacement_sources.map(src => src === 'report_authored' ? 'Reports' : src === 'batch_registered' ? 'Batch' : 'Registered').join(' + ')}
                              </span>
                            )}
                            {s.dest_class_id ? (
                              <>
                                <span className="text-muted-foreground">→ move to</span>
                                <span className="font-bold text-emerald-600 dark:text-emerald-400">{s.dest_class_name}</span>
                              </>
                            ) : (
                              <span className="text-rose-600 dark:text-rose-400 italic">No dest class found — will be skipped</span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                    <button
                      disabled={draining || working || classAuditData.misplaced.filter(s => s.dest_class_id).length === 0}
                      onClick={async () => {
                        setDraining(true); setDrainResult(null); setMsg(null);
                        try {
                          const res = await fetch('/api/classes/heal', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ action: 'drain_class', classId: classAuditId }),
                          });
                          const j = await res.json();
                          if (!res.ok) throw new Error(j.error || 'Failed');
                          setDrainResult({ moved: j.moved, skipped: j.skipped ?? 0, details: j.details ?? [] });
                          setClassAuditData(null);
                          setMsg({ type: 'ok', text: `Drain complete — ${j.moved} student(s) moved${j.skipped ? `, ${j.skipped} skipped (no destination class)` : ''}.` });
                          await load();
                        } catch (e: any) {
                          setMsg({ type: 'err', text: e.message });
                        } finally { setDraining(false); }
                      }}
                      className="w-full sm:w-auto flex items-center justify-center gap-2 px-5 py-2.5 bg-amber-600 hover:bg-amber-500 disabled:opacity-40 text-white text-sm font-black rounded-xl transition active:scale-95"
                    >
                      {draining && <ArrowPathIcon className="w-4 h-4 animate-spin" />}
                      Drain All Misplaced ({classAuditData.misplaced.filter(s => s.dest_class_id).length}) →
                    </button>
                  </div>
                )}

                {/* Correctly placed — collapsible */}
                {classAuditData.correct.length > 0 && (
                  <details className="group">
                    <summary className="cursor-pointer text-xs font-bold text-emerald-600 dark:text-emerald-400 flex items-center gap-2 select-none list-none">
                      <ChevronDownIcon className="w-3.5 h-3.5 group-open:rotate-180 transition-transform shrink-0" />
                      {classAuditData.correct.length} correctly placed (stays in class)
                    </summary>
                    <div className="mt-2 space-y-1 max-h-52 overflow-y-auto pr-1">
                      {classAuditData.correct.map(s => (
                        <div key={s.id} className="flex items-center gap-3 px-3 py-2 bg-emerald-500/5 border border-emerald-500/10 rounded-lg">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <p className="text-xs font-semibold text-foreground truncate">{s.full_name}</p>
                              {s.grade_level && <span className="text-[9px] px-1 py-0.5 bg-sky-500/15 text-sky-600 dark:text-sky-400 border border-sky-500/30 rounded font-black uppercase shrink-0">{s.grade_level}</span>}
                            </div>
                            <p className="text-[10px] text-muted-foreground truncate">{s.email}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </details>
                )}

                {/* No signal — collapsible */}
                {classAuditData.noSignal.length > 0 && (
                  <details className="group">
                    <summary className="cursor-pointer text-xs font-bold text-muted-foreground flex items-center gap-2 select-none list-none">
                      <ChevronDownIcon className="w-3.5 h-3.5 group-open:rotate-180 transition-transform shrink-0" />
                      {classAuditData.noSignal.length} no signal — manual placement needed
                    </summary>
                    <div className="mt-2 px-3 py-2 bg-muted/20 border border-border rounded-xl">
                      <p className="text-[11px] text-muted-foreground">
                        No reports, batch history, or registration record ties these students to a teacher.
                        Use Manual Student Placement above to move them individually.
                      </p>
                    </div>
                    <div className="mt-2 space-y-1 max-h-52 overflow-y-auto pr-1">
                      {classAuditData.noSignal.map(s => (
                        <div key={s.id} className="flex items-center gap-3 px-3 py-2 bg-muted/20 border border-border rounded-lg">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <p className="text-xs font-semibold text-foreground truncate">{s.full_name}</p>
                              {s.grade_level && <span className="text-[9px] px-1 py-0.5 bg-sky-500/15 text-sky-600 dark:text-sky-400 border border-sky-500/30 rounded font-black uppercase shrink-0">{s.grade_level}</span>}
                            </div>
                            <p className="text-[10px] text-muted-foreground truncate">{s.email}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </details>
                )}

                {classAuditData.misplaced.length === 0 && (
                  <div className="flex items-center gap-2 px-4 py-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl">
                    <CheckCircleIcon className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                    <p className="text-xs font-bold text-emerald-600 dark:text-emerald-400">All signals agree — no drain needed for this class.</p>
                  </div>
                )}
              </div>
            )}

            {/* Post-drain result — who moved where */}
            {drainResult && (
              <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4 space-y-3">
                <div className="flex items-center gap-2 flex-wrap">
                  <CheckCircleIcon className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                  <p className="text-sm font-bold text-emerald-600 dark:text-emerald-400">
                    Drain complete — {drainResult.moved} moved
                    {drainResult.skipped > 0 ? `, ${drainResult.skipped} skipped (no destination class)` : ''}
                  </p>
                </div>
                {drainResult.details.length > 0 && (
                  <>
                    <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">Moved students</p>
                    <div className="space-y-1 max-h-64 overflow-y-auto pr-1">
                      {drainResult.details.map(d => (
                        <div key={d.student_id} className="flex items-center gap-2 px-3 py-2 bg-background border border-border rounded-lg text-xs">
                          <p className="font-semibold text-foreground truncate flex-1 min-w-0">{d.student_name}</p>
                          <span className="text-muted-foreground shrink-0 hidden sm:inline">{d.from_class}</span>
                          <span className="text-muted-foreground shrink-0">→</span>
                          <span className="font-bold text-emerald-600 dark:text-emerald-400 shrink-0 truncate max-w-[120px]">{d.to_class}</span>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        </div>

        {/* ── Missing Teacher–School Links ─────────────────────── */}
        {(data?.missingTeacherSchools.length ?? 0) > 0 && (
          <div className="bg-card border border-rose-500/30 rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-border flex items-center gap-3">
              <ExclamationTriangleIcon className="w-5 h-5 text-rose-600 dark:text-rose-400 shrink-0" />
              <div className="flex-1">
                <h2 className="text-sm font-extrabold text-foreground">Missing Teacher–School Links</h2>
                <p className="text-xs text-muted-foreground">
                  These teachers own classes at a school but have no <code className="bg-muted px-1 rounded text-[10px]">teacher_schools</code> row for it.
                  This is why a teacher's students at that school completely disappear from their profile —
                  the scoping query only checks <code className="bg-muted px-1 rounded text-[10px]">teacher_schools</code>, so a missing row hides the entire school.
                  Click "Fix" to add the missing link, or "Fix All" to repair all teachers at once.
                </p>
              </div>
              <span className="text-xs font-black px-2.5 py-1 rounded-full bg-rose-500/20 text-rose-600 dark:text-rose-400 border border-rose-500/30">
                {data!.missingTeacherSchools.length}
              </span>
            </div>
            <div className="p-5 space-y-3">
              <button
                disabled={working}
                onClick={() => applyAction('sync_teacher_schools', [], {})}
                className="flex items-center gap-2 px-4 py-2 bg-rose-600 hover:bg-rose-500 disabled:opacity-40 text-white text-sm font-black rounded-xl transition active:scale-95"
              >
                <CheckCircleIcon className="w-4 h-4" /> Fix All Missing Links
              </button>
              {data!.missingTeacherSchools.map(m => (
                <div key={`${m.teacher_id}::${m.school_id}`} className="flex flex-wrap items-center gap-3 px-4 py-3 bg-rose-500/5 border border-rose-500/20 rounded-xl">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-foreground">
                      {m.teacher_name ?? 'Unknown teacher'}
                      <span className="text-muted-foreground font-normal"> → </span>
                      {m.school_name ?? m.school_id}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Teacher has {m.class_ids.length} class(es) at this school but no <code className="text-[10px]">teacher_schools</code> entry — students are invisible to them.
                    </p>
                  </div>
                  <button
                    disabled={working}
                    onClick={() => applyAction('sync_teacher_schools', [], { teacherId: m.teacher_id })}
                    className="px-3 py-1.5 bg-rose-600 hover:bg-rose-500 text-white text-xs font-black rounded-xl disabled:opacity-40 transition active:scale-95"
                  >
                    Fix
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Duplicate Accounts ───────────────────────────────── */}
        {(data?.duplicateAccounts.length ?? 0) > 0 && (
          <div className="bg-card border border-rose-500/30 rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-border flex items-center gap-3">
              <ExclamationTriangleIcon className="w-5 h-5 text-rose-600 dark:text-rose-400 shrink-0" />
              <div className="flex-1">
                <h2 className="text-sm font-extrabold text-foreground">Duplicate Student Accounts</h2>
                <p className="text-xs text-muted-foreground">
                  Multiple active accounts share the same email. This usually happens when a bulk-register
                  CSV re-registers an existing student, creating a ghost account. Keep the account with
                  the correct class and school, then delete the other(s).
                </p>
              </div>
              <span className="text-xs font-black px-2.5 py-1 rounded-full bg-rose-500/20 text-rose-600 dark:text-rose-400 border border-rose-500/30">
                {data!.duplicateAccounts.length}
              </span>
            </div>
            <div className="p-5 space-y-4">
              {data!.duplicateAccounts.map(group => (
                <div key={group.label} className={`rounded-xl border p-4 space-y-3 ${group.duplicateType === 'email' ? 'border-rose-500/20 bg-rose-500/5' : 'border-amber-500/20 bg-amber-500/5'}`}>
                  <div className="flex items-start gap-2 flex-wrap">
                    <span className={`text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full border shrink-0 ${group.duplicateType === 'email' ? 'bg-rose-500/20 text-rose-600 dark:text-rose-400 border-rose-500/30' : 'bg-amber-500/20 text-amber-600 dark:text-amber-400 border-amber-500/30'}`}>
                      {group.duplicateType === 'email' ? 'Same Email' : 'Same Name + School'}
                    </span>
                    <p className="text-xs text-foreground font-mono bg-muted px-2 py-0.5 rounded">{group.label}</p>
                    <span className="text-xs text-muted-foreground">· {group.accounts.length} accounts</span>
                  </div>
                  <p className="text-[11px] text-muted-foreground">{group.reason}</p>
                  <div className="space-y-2">
                    {group.accounts.map((acc, i) => (
                      <div key={acc.id} className="flex items-start gap-3 px-3 py-2.5 bg-background border border-border rounded-xl">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="text-sm font-semibold text-foreground truncate">{acc.full_name}</p>
                            {acc.primary_teacher_id && (
                              <span className="text-[10px] px-1.5 py-0.5 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 rounded font-bold shrink-0">Protected</span>
                            )}
                            <span className="text-[10px] px-1.5 py-0.5 bg-muted text-muted-foreground rounded font-mono shrink-0">#{i + 1}</span>
                          </div>
                          <div className="text-[11px] text-muted-foreground mt-1 space-y-0.5">
                            <p>School: <span className="text-foreground font-medium">{acc.school_name ?? acc.school_id ?? '—'}</span></p>
                            <p>Class: <span className={acc.class_name ? 'text-foreground font-medium' : 'text-amber-600 dark:text-amber-400 italic'}>{acc.class_name ?? (acc.section_class ? `"${acc.section_class}" (unlinked)` : 'None')}</span></p>
                            <p>Created: <span className="text-foreground">{new Date(acc.created_at).toLocaleDateString()}</span></p>
                          </div>
                        </div>
                        <button
                          disabled={working}
                          onClick={() => applyAction('delete_portal_user', [acc.id])}
                          title="Delete this duplicate account"
                          className="p-1.5 bg-rose-500/10 hover:bg-rose-500/20 rounded-xl transition text-rose-600 dark:text-rose-400 shrink-0 mt-0.5"
                        >
                          <TrashIcon className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Teacher–Class Conflict ────────────────────────────── */}
        {(data?.teacherConflict.length ?? 0) > 0 && (
          <div className="bg-card border border-violet-500/30 rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-border flex items-center gap-3">
              <ExclamationTriangleIcon className="w-5 h-5 text-violet-600 dark:text-violet-400 shrink-0" />
              <div className="flex-1">
                <h2 className="text-sm font-extrabold text-foreground">Teacher–Class Conflict</h2>
                <p className="text-xs text-muted-foreground">
                  These students are enrolled in a class owned by one teacher, but their progress reports
                  were written by a different teacher. This happens when a batch enrollment overwrites
                  class assignments — the student's visible class changes but report history stays.
                  Use "Restore Students to Teacher" above to fix in bulk, or reassign individually below.
                </p>
              </div>
              <span className="text-xs font-black px-2.5 py-1 rounded-full bg-violet-500/20 text-violet-600 dark:text-violet-400 border border-violet-500/30">
                {data!.teacherConflict.length}
              </span>
            </div>
            <div className="p-5 space-y-3">
              {data!.teacherConflict.map(s => (
                <div key={s.id} className="rounded-xl border border-violet-500/20 bg-violet-500/5 p-3 sm:p-4 space-y-2.5">
                  {/* Student name + email */}
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-foreground truncate">{s.full_name}</p>
                    <p className="text-xs text-muted-foreground truncate">{s.email}</p>
                  </div>

                  {/* Conflict detail — stacked rows for mobile */}
                  <div className="bg-background/60 rounded-lg px-3 py-2.5 border border-border space-y-2">
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-0.5">Enrolled class</p>
                      <p className="text-xs font-semibold text-foreground leading-snug">
                        {s.current_class_name ?? '?'}{' '}
                        <span className="text-amber-600 dark:text-amber-400">({s.current_class_teacher_name ?? 'Unknown'})</span>
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-0.5">Reports written by</p>
                      <p className="text-xs font-semibold text-violet-600 dark:text-violet-400 leading-snug">{s.report_teacher_name ?? 'Unknown'}</p>
                    </div>
                  </div>

                  {/* Actions — select full-width on mobile, inline on sm+ */}
                  <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                    <select
                      value={reassignTarget[s.id] ?? ''}
                      onChange={e => setReassignTarget(prev => ({ ...prev, [s.id]: e.target.value }))}
                      className="select-premium text-xs px-2 py-2 flex-1 w-full"
                    >
                      <option value="">— Move to report teacher's class —</option>
                      <ClassOptions
                        classes={(data?.classes ?? []).filter(c => !s.report_teacher_id || c.teacher_id === s.report_teacher_id)}
                        schools={schools}
                      />
                    </select>
                    <div className="flex gap-2 sm:shrink-0">
                      <button
                        disabled={!reassignTarget[s.id] || working}
                        onClick={() => reassignStudent(s.id)}
                        className="flex-1 sm:flex-none px-4 py-2 bg-violet-600 text-white text-xs font-black rounded-xl disabled:opacity-40 transition active:scale-95"
                      >
                        Move
                      </button>
                      <button
                        disabled={working}
                        onClick={() => applyAction('delete_portal_user', [s.id])}
                        title="Delete student account"
                        className="p-2 bg-rose-500/10 hover:bg-rose-500/20 rounded-xl transition text-rose-600 dark:text-rose-400 shrink-0"
                      >
                        <TrashIcon className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Staff / parents without a school (structure policy) ─── */}
        {((data?.noSchoolParents?.length ?? 0) + (data?.noSchoolTeachers?.length ?? 0) + (data?.noSchoolSchoolAccounts?.length ?? 0)) > 0 && (
          <div className="bg-card border border-amber-500/30 rounded-xl overflow-hidden">
            <div className="px-4 sm:px-5 py-4 flex flex-wrap items-center gap-3">
              <ExclamationTriangleIcon className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0" />
              <div className="flex-1 min-w-0">
                <h2 className="text-sm font-extrabold text-foreground">Accounts Without a School</h2>
                <p className="text-xs text-muted-foreground">
                  Parents, teachers, and school accounts must be school-tied. Run Seal Structure to backfill from children / teacher_schools, then deactivate leftovers.
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Parents: {data?.noSchoolParents?.length ?? 0} · Teachers: {data?.noSchoolTeachers?.length ?? 0} · School role: {data?.noSchoolSchoolAccounts?.length ?? 0}
                </p>
              </div>
              <button
                onClick={() => applyAction('seal_structure_backfill', [])}
                disabled={working || loading}
                className="flex items-center gap-2 px-3 py-2 bg-amber-700 hover:bg-amber-600 disabled:opacity-40 text-white text-xs font-bold rounded-xl transition"
              >
                <CheckCircleIcon className="w-4 h-4 shrink-0" /> Seal Structure
              </button>
            </div>
          </div>
        )}

        {/* ── Students without a school — full management panel ─── */}
        {(data?.noSchool.length ?? 0) > 0 && (
          <div className="bg-card border border-border rounded-xl overflow-hidden">
            {/* Panel header */}
            <div className="px-4 sm:px-5 py-4 border-b border-border flex flex-wrap items-center gap-3">
              <ExclamationTriangleIcon className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0" />
              <div className="flex-1 min-w-0">
                <h2 className="text-sm font-extrabold text-foreground">Students Without a School</h2>
                <p className="text-xs text-muted-foreground">Cross-checked against the registration registry. Assign, sync, or delete each student.</p>
              </div>
              <span className="text-xs font-black px-2.5 py-1 rounded-full bg-amber-500/20 text-amber-600 dark:text-amber-400 border border-amber-500/30">{data!.noSchool.length}</span>
            </div>

            {/* Sort + filter bar */}
            <div className="px-4 sm:px-5 py-3 border-b border-border flex flex-wrap gap-2 items-center bg-muted/20">
              <div className="relative flex-1 min-w-[160px]">
                <MagnifyingGlassIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
                <input value={nsFilter} onChange={e => setNsFilter(e.target.value)}
                  placeholder="Filter by name or email…"
                  className="w-full pl-8 pr-3 py-1.5 text-xs bg-background border border-border rounded-lg text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/40" />
              </div>
              <div className="flex items-center gap-1 text-xs font-bold text-muted-foreground shrink-0">
                <span>Sort:</span>
                <button onClick={() => setNsSort('registry')}
                  className={`px-2.5 py-1 rounded-lg transition ${nsSort === 'registry' ? 'bg-primary text-white' : 'hover:bg-muted'}`}>Registry first</button>
                <button onClick={() => setNsSort('name')}
                  className={`px-2.5 py-1 rounded-lg transition ${nsSort === 'name' ? 'bg-primary text-white' : 'hover:bg-muted'}`}>A–Z</button>
              </div>
            </div>

            {/* Student cards */}
            <div className="p-4 sm:p-5 space-y-3">
              {(() => {
                let rows = [...data!.noSchool];
                if (nsFilter.trim()) {
                  const q = nsFilter.toLowerCase();
                  rows = rows.filter(s => s.full_name?.toLowerCase().includes(q) || s.email?.toLowerCase().includes(q));
                }
                if (nsSort === 'registry') {
                  rows.sort((a, b) => (b.registry?.school_id ? 1 : 0) - (a.registry?.school_id ? 1 : 0));
                } else {
                  rows.sort((a, b) => (a.full_name ?? '').localeCompare(b.full_name ?? ''));
                }
                return rows.map(s => {
                  const hasRegistry = !!s.registry?.school_id;
                  const chosenSchool = nsSchool[s.id] ?? '';
                  const chosenClass = nsClass[s.id] ?? '';
                  const classesForChosenSchool = (data?.classes ?? []).filter(c =>
                    chosenSchool ? c.school_id === chosenSchool : true
                  );
                  return (
                    <div key={s.id} className={`rounded-xl border p-3 sm:p-4 space-y-3 ${hasRegistry ? 'border-emerald-500/20 bg-emerald-500/5' : 'border-border bg-muted/20'}`}>
                      {/* Student identity */}
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-sm font-bold text-foreground truncate">{s.full_name}</p>
                          <p className="text-xs text-muted-foreground truncate">{s.email}</p>
                        </div>
                        {hasRegistry && (
                          <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 shrink-0">Registry found</span>
                        )}
                      </div>

                      {/* Registry hint */}
                      {s.registry && (
                        <div className="text-[11px] text-muted-foreground bg-background/60 rounded-lg px-3 py-2 border border-border space-y-0.5">
                          <p className="font-bold text-foreground/70 uppercase tracking-widest text-[9px] mb-1">Registry says</p>
                          {s.registry.school_name && <p>School: <span className="text-foreground font-semibold">{s.registry.school_name}</span></p>}
                          {s.registry.section && <p>Section: <span className="text-foreground font-semibold">{s.registry.section}</span></p>}
                          {s.registry.grade_level && <p>Grade: <span className="text-foreground font-semibold">{s.registry.grade_level}</span></p>}
                          {s.registry.status && <p>Status: <span className={`font-semibold ${s.registry.status === 'approved' ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'}`}>{s.registry.status}</span></p>}
                        </div>
                      )}

                      {/* Actions row */}
                      <div className="flex flex-wrap gap-2">
                        {/* School picker */}
                        <select
                          value={chosenSchool}
                          onChange={e => setNsSchool(prev => ({ ...prev, [s.id]: e.target.value }))}
                          className="select-premium text-xs px-2 py-1.5 flex-1 min-w-[130px]"
                        >
                          <option value="">— Pick school —</option>
                          {schools.map(sc => <option key={sc.id} value={sc.id}>{sc.name}</option>)}
                        </select>

                        {/* Class picker (filtered to chosen school) */}
                        <select
                          value={chosenClass}
                          onChange={e => setNsClass(prev => ({ ...prev, [s.id]: e.target.value }))}
                          className="select-premium text-xs px-2 py-1.5 flex-1 min-w-[130px]"
                        >
                          <option value="">— Pick class (opt.) —</option>
                          <ClassOptions classes={classesForChosenSchool} schools={schools} />
                        </select>
                      </div>

                      {/* Action buttons */}
                      <div className="flex flex-wrap gap-2">
                        {/* Assign class (sets school too) */}
                        {chosenClass && (
                          <button
                            disabled={working}
                            onClick={() => applyAction('assign_class', [s.id], { classId: chosenClass })}
                            className="px-3 py-1.5 bg-primary text-white text-xs font-black rounded-xl disabled:opacity-40 transition active:scale-95"
                          >
                            Assign Class + School
                          </button>
                        )}
                        {/* Assign school only */}
                        {chosenSchool && !chosenClass && (
                          <button
                            disabled={working}
                            onClick={() => applyAction('assign_school', [s.id], { schoolId: chosenSchool })}
                            className="px-3 py-1.5 bg-sky-600 text-white text-xs font-black rounded-xl disabled:opacity-40 transition active:scale-95"
                          >
                            Assign School Only
                          </button>
                        )}
                        {/* Sync from registry */}
                        {hasRegistry && (
                          <button
                            disabled={working}
                            onClick={() => applyAction('sync_from_registry', [s.id])}
                            className="px-3 py-1.5 bg-emerald-600 text-white text-xs font-black rounded-xl disabled:opacity-40 transition active:scale-95"
                          >
                            Sync from Registry
                          </button>
                        )}
                        {/* Delete */}
                        {nsConfirmDelete === s.id ? (
                          <div className="flex items-center gap-1.5">
                            <span className="text-[11px] text-rose-600 dark:text-rose-400 font-bold">Confirm delete?</span>
                            <button disabled={working}
                              onClick={() => { applyAction('delete_portal_user', [s.id]); setNsConfirmDelete(null); }}
                              className="px-2.5 py-1 bg-rose-600 text-white text-xs font-black rounded-xl disabled:opacity-40">Yes</button>
                            <button onClick={() => setNsConfirmDelete(null)}
                              className="px-2.5 py-1 bg-muted text-muted-foreground text-xs font-bold rounded-xl">No</button>
                          </div>
                        ) : (
                          <button
                            onClick={() => setNsConfirmDelete(s.id)}
                            className="p-1.5 bg-rose-500/10 hover:bg-rose-500/20 rounded-xl transition text-rose-600 dark:text-rose-400 ml-auto"
                            title="Delete this portal account"
                          >
                            <TrashIcon className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                });
              })()}
            </div>
          </div>
        )}

        {/* ── Students with no class ────────────────────────────── */}
        {(data?.noClass.length ?? 0) > 0 && (
          <Section title="Students Without a Class" count={data!.noClass.length}
            description="Active students not assigned to any class. Teachers can't see them.">
            <div className="space-y-2">
              <div className="flex flex-col sm:flex-row sm:items-center gap-2 mb-3">
                <select value={targetClass} onChange={e => setTargetClass(e.target.value)}
                  className="select-premium flex-1 text-sm px-3 py-2">
                  <option value="">— Select class —</option>
                  <ClassOptions classes={data?.classes ?? []} schools={schools} />
                </select>
                <div className="flex items-center gap-2">
                  <button onClick={() => selAll(data!.noClass.map(s => s.id), setSelNoClass)}
                    className="text-xs font-bold text-primary hover:underline">Select all</button>
                  <button
                    disabled={!targetClass || selNoClass.size === 0 || working}
                    onClick={() => applyAction('assign_class', Array.from(selNoClass), { classId: targetClass })}
                    className="flex-1 sm:flex-none px-4 py-2 bg-primary text-white text-xs font-black rounded-xl disabled:opacity-40 transition">
                    Assign Class
                  </button>
                </div>
              </div>
              {/* Or auto-create + place each selected student into their OWN school's standard
                  "School · Programme · Band" class (grade taken from each student). */}
              <div className="flex flex-col sm:flex-row sm:items-center gap-2 mb-3 rounded-xl border border-dashed border-primary/30 bg-primary/5 p-2">
                <select value={noClassProgramme} onChange={e => setNoClassProgramme(e.target.value)}
                  className="select-premium flex-1 text-sm px-3 py-2">
                  <option value="">— Programme (auto-create standard class) —</option>
                  <option value="Young Innovators">Young Innovators</option>
                  <option value="Teen Developers">Teen Developers</option>
                  <option value="Web Development Bootcamp">Web Development Bootcamp</option>
                  <option value="Data Analysis with Python">Data Analysis with Python</option>
                </select>
                <button
                  disabled={!noClassProgramme || selNoClass.size === 0 || working}
                  onClick={() => applyAction('create_and_assign_placement', Array.from(selNoClass), { programme: noClassProgramme })}
                  className="flex-1 sm:flex-none px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-black rounded-xl disabled:opacity-40 transition">
                  Create &amp; assign standard class
                </button>
              </div>
              {data!.noClass.map(s => (
                noClassConfirmDelete === s.id ? (
                  <div key={s.id} className="flex items-center gap-2 px-3 py-2 bg-rose-500/10 border border-rose-500/20 rounded-xl">
                    <span className="text-xs text-rose-600 dark:text-rose-400 font-bold flex-1">Delete {s.full_name}?</span>
                    <button disabled={working} onClick={() => { applyAction('delete_portal_user', [s.id]); setNoClassConfirmDelete(null); }}
                      className="px-2.5 py-1 bg-rose-600 text-white text-xs font-black rounded-xl disabled:opacity-40">Yes, delete</button>
                    <button onClick={() => setNoClassConfirmDelete(null)}
                      className="px-2.5 py-1 bg-muted text-muted-foreground text-xs font-bold rounded-xl">Cancel</button>
                  </div>
                ) : (
                  <StudentRow key={s.id} student={s} selected={selNoClass.has(s.id)}
                    onToggle={() => toggleSel(selNoClass, setSelNoClass, s.id)}
                    onDelete={() => setNoClassConfirmDelete(s.id)} />
                )
              ))}
            </div>
          </Section>
        )}

        {/* ── School–class mismatch ─────────────────────────────── */}
        {(data?.mismatched.length ?? 0) > 0 && (
          <Section title="School–Class Mismatch" count={data!.mismatched.length}
            description="Student's school_id doesn't match their class's school. Verified by both report authorship and registration history.">
            <div className="space-y-4">
              {/* Safe students (class assignment confirmed) */}
              {(() => {
                const safe = data!.mismatched.filter(s => !s.class_teacher_conflict);
                const conflicted = data!.mismatched.filter(s => s.class_teacher_conflict);
                return (
                  <>
                    {safe.length > 0 && (
                      <div className="space-y-2">
                        <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                          <p className="text-xs font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-widest shrink-0">{safe.length} safe to align</p>
                          <div className="flex flex-wrap gap-2">
                            <button onClick={() => selAll(safe.map(s => s.id), setSelMismatched)}
                              className="text-xs font-bold text-primary hover:underline">Select all</button>
                            <button
                              disabled={selMismatched.size === 0 || working}
                              onClick={() => applyAction('align_to_class_school', Array.from(selMismatched))}
                              className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-black rounded-xl disabled:opacity-40 transition">
                              Align to Class School
                            </button>
                            <button
                              disabled={selMismatched.size === 0 || working}
                              onClick={() => applyAction('restore_from_history', Array.from(selMismatched))}
                              className="px-3 py-1.5 bg-primary hover:bg-primary/80 text-white text-xs font-black rounded-xl disabled:opacity-40 transition">
                              Restore from History
                            </button>
                          </div>
                        </div>
                        {safe.map(s => (
                          <label key={s.id} className={`flex items-start gap-3 px-4 py-2.5 rounded-xl border cursor-pointer transition ${selMismatched.has(s.id) ? 'bg-emerald-500/10 border-emerald-500/30' : 'bg-muted/30 border-border hover:bg-muted/50'}`}>
                            <input type="checkbox" checked={selMismatched.has(s.id)} onChange={() => toggleSel(selMismatched, setSelMismatched, s.id)}
                              className="w-4 h-4 rounded border-border text-primary mt-0.5" />
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-semibold text-foreground truncate">{s.full_name}</p>
                              <p className="text-xs text-muted-foreground truncate">
                                {s.school_name || 'No school'} → class belongs to <span className="font-bold text-emerald-600 dark:text-emerald-400">{s.class_school_name || s.class_school_id || 'Unknown'}</span>
                                {s.class_name ? ` (${s.class_name})` : ''}
                              </p>
                            </div>
                          </label>
                        ))}
                      </div>
                    )}
                    {conflicted.length > 0 && (
                      <div className="space-y-2">
                        <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl">
                          <p className="text-xs font-bold text-amber-600 dark:text-amber-400 mb-1">{conflicted.length} student(s) — fix class assignment first</p>
                          <p className="text-xs text-amber-600/70 dark:text-amber-400/70">These students are in the wrong class (class teacher ≠ report author). Fix them in the Teacher–Class Conflict section above, then alignment will work correctly.</p>
                        </div>
                        {conflicted.map(s => (
                          <div key={s.id} className="flex items-start gap-3 px-4 py-2.5 rounded-xl bg-amber-500/5 border border-amber-500/20">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <p className="text-sm font-semibold text-foreground truncate">{s.full_name}</p>
                                <span className="text-[9px] px-1.5 py-0.5 bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30 rounded font-black uppercase shrink-0">Fix class first</span>
                              </div>
                              <p className="text-xs text-muted-foreground truncate">
                                {s.school_name || 'No school'} · class: {s.class_name || s.class_school_name || 'Unknown'}
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                );
              })()}
            </div>
          </Section>
        )}

        {/* ── Orphan classes ────────────────────────────────────── */}
        {(data?.orphanClasses.length ?? 0) > 0 && (
          <Section title="Empty Classes" count={data!.orphanClasses.length}
            description="Classes with no students and no lesson plans. Safe to delete.">
            <div className="space-y-2">
              {data!.orphanClasses.map(c => (
                <div key={c.id} className="flex items-center justify-between px-4 py-3 bg-muted/40 rounded-xl border border-border">
                  <div>
                    <p className="text-sm font-semibold text-foreground">{c.name}</p>
                    <p className="text-xs text-muted-foreground">{(c.schools as any)?.name ?? c.school_id} · created {new Date(c.created_at).toLocaleDateString()}</p>
                  </div>
                  <button
                    disabled={working}
                    onClick={() => applyAction('delete_class', [], { deleteClassId: c.id })}
                    className="p-2 bg-rose-500/10 hover:bg-rose-500/20 rounded-xl transition">
                    <TrashIcon className="w-4 h-4 text-rose-600 dark:text-rose-400" />
                  </button>
                </div>
              ))}
            </div>
          </Section>
        )}
        </>
        )}
      </div>

      {/* ══ Transfer Students Modal ══════════════════════════════════════════ */}
      {showTransfer && (
        <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center p-0 sm:p-4"
          style={{ background: 'rgba(0,0,0,0.75)' }}
          onClick={e => { if (e.target === e.currentTarget) setShowTransfer(false); }}>
          <div className="w-full sm:max-w-lg flex flex-col rounded-t-2xl sm:rounded-2xl overflow-hidden shadow-2xl"
            style={{ background: 'var(--card)', maxHeight: '92dvh' }}>

            {/* Modal header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
              <div>
                <h2 className="text-base font-extrabold text-foreground">Transfer Students</h2>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {txStep === 1 ? 'Step 1 — Pick source class & students' : 'Step 2 — Pick destination class'}
                </p>
              </div>
              <button onClick={() => setShowTransfer(false)} className="p-1.5 rounded-full hover:bg-muted transition text-muted-foreground">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>
              </button>
            </div>

            {/* Step indicator */}
            <div className="flex shrink-0 border-b border-border">
              {[1,2].map(n => (
                <div key={n} className={`flex-1 py-2 text-center text-[11px] font-black uppercase tracking-widest transition-colors ${txStep === n ? 'text-primary border-b-2 border-primary' : 'text-muted-foreground'}`}>
                  Step {n}
                </div>
              ))}
            </div>

            {/* Modal body */}
            <div className="flex-1 overflow-y-auto p-5 space-y-4">

              {txDone ? (
                <div className="flex flex-col items-center justify-center py-12 gap-4 text-center">
                  <CheckCircleIcon className="w-14 h-14 text-emerald-600 dark:text-emerald-400" />
                  <p className="text-base font-extrabold text-foreground">{txDone}</p>
                  <button onClick={() => { setShowTransfer(false); load(); }}
                    className="px-6 py-2.5 bg-primary text-white text-sm font-black rounded-xl transition hover:opacity-90">
                    Done
                  </button>
                </div>
              ) : txStep === 1 ? (
                <>
                  {/* Source school */}
                  <div>
                    <label className="block text-xs font-black text-muted-foreground uppercase tracking-widest mb-1.5">Source School</label>
                    <select
                      value={txSrcSchool}
                      onChange={e => { setTxSrcSchool(e.target.value); setTxSrcClass(''); setTxSrcStudents([]); setTxSelected(new Set()); }}
                      className="select-premium w-full text-sm px-3 py-2.5">
                      <option value="">— Select school —</option>
                      {schools.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                  </div>

                  {/* Source class */}
                  {txSrcSchool && (
                    <div>
                      <label className="block text-xs font-black text-muted-foreground uppercase tracking-widest mb-1.5">Source Class</label>
                      <select
                        value={txSrcClass}
                        onChange={e => { setTxSrcClass(e.target.value); loadClassStudents(e.target.value); }}
                        className="select-premium w-full text-sm px-3 py-2.5">
                        <option value="">— Select class —</option>
                        {(data?.classes ?? []).filter(c => c.school_id === txSrcSchool).map(c => (
                          <option key={c.id} value={c.id}>{c.name}</option>
                        ))}
                      </select>
                    </div>
                  )}

                  {/* Student picker */}
                  {txSrcClass && (
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <label className="text-xs font-black text-muted-foreground uppercase tracking-widest">
                          Students {txSrcLoading ? '…' : `(${txSrcStudents.length})`}
                        </label>
                        {txSrcStudents.length > 0 && (
                          <div className="flex gap-3">
                            <button onClick={() => setTxSelected(new Set(txSrcStudents.map(s => s.id)))}
                              className="text-xs font-bold text-primary hover:underline">All</button>
                            <button onClick={() => setTxSelected(new Set())}
                              className="text-xs font-bold text-muted-foreground hover:underline">None</button>
                          </div>
                        )}
                      </div>
                      {txSrcLoading ? (
                        <div className="flex justify-center py-8"><ArrowPathIcon className="w-6 h-6 animate-spin text-muted-foreground" /></div>
                      ) : txSrcStudents.length === 0 ? (
                        <p className="text-sm text-muted-foreground text-center py-6 italic">No students in this class.</p>
                      ) : (
                        <div className="space-y-1.5 max-h-52 overflow-y-auto pr-1">
                          {txSrcStudents.map(s => {
                            const checked = txSelected.has(s.id);
                            return (
                              <label key={s.id} className={`flex items-center gap-3 px-3 py-2.5 rounded-xl cursor-pointer border transition ${checked ? 'bg-primary/10 border-primary/30' : 'border-border hover:bg-muted/30'}`}>
                                <input type="checkbox" checked={checked}
                                  onChange={() => { const n = new Set(txSelected); if (checked) n.delete(s.id); else n.add(s.id); setTxSelected(n); }}
                                  className="w-4 h-4 rounded text-primary shrink-0" />
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-1.5 flex-wrap">
                                    <p className="text-sm font-semibold text-foreground truncate">{s.full_name}</p>
                                    {s.grade_level && <span className="text-[9px] px-1.5 py-0.5 bg-sky-500/15 text-sky-600 dark:text-sky-400 border border-sky-500/30 rounded font-black uppercase shrink-0">{s.grade_level}</span>}
                                  </div>
                                  <p className="text-[11px] text-muted-foreground truncate">{s.email}</p>
                                </div>
                              </label>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}
                </>
              ) : (
                <>
                  {/* Summary */}
                  <div className="px-4 py-3 rounded-xl bg-primary/10 border border-primary/20 text-sm">
                    <p className="font-black text-primary text-xs uppercase tracking-widest mb-1">Moving within</p>
                    <p className="text-foreground font-semibold">
                      {txSelected.size} student{txSelected.size !== 1 ? 's' : ''} from{' '}
                      <span className="text-primary">{(data?.classes ?? []).find(c => c.id === txSrcClass)?.name ?? '—'}</span>
                    </p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      School: {schools.find(s => s.id === txSrcSchool)?.name ?? '—'}
                    </p>
                  </div>

                  {/* Destination class — same school only */}
                  <div>
                    <label className="block text-xs font-black text-muted-foreground uppercase tracking-widest mb-1.5">Destination Class</label>
                    <div className="space-y-1.5 max-h-64 overflow-y-auto">
                      {(data?.classes ?? []).filter(c => c.school_id === txSrcSchool && c.id !== txSrcClass).length === 0 ? (
                        <p className="text-sm text-muted-foreground italic text-center py-4">No other classes in this school.</p>
                      ) : (data?.classes ?? []).filter(c => c.school_id === txSrcSchool && c.id !== txSrcClass).map(c => (
                        <button key={c.id}
                          onClick={() => setTxDstClass(c.id)}
                          className={`w-full flex items-center justify-between px-4 py-3 rounded-xl border text-left transition ${txDstClass === c.id ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-600 dark:text-emerald-400' : 'border-border hover:bg-muted/30 text-foreground'}`}>
                          <p className="text-sm font-bold truncate">{c.name}</p>
                          {txDstClass === c.id && <CheckCircleIcon className="w-5 h-5 shrink-0 text-emerald-600 dark:text-emerald-400" />}
                        </button>
                      ))}
                    </div>
                  </div>

                  {txDstClass && (
                    <div className="px-4 py-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-700 dark:text-amber-300">
                      Permanently moves students within the same school and transfers full authorship to the destination class teacher.
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Modal footer */}
            {!txDone && (
              <div className="shrink-0 px-5 py-4 border-t border-border flex items-center gap-3">
                {txStep === 2 && (
                  <button onClick={() => setTxStep(1)} className="flex-1 py-3 rounded-xl text-sm font-black bg-muted hover:bg-muted/80 text-foreground transition">
                    ← Back
                  </button>
                )}
                {txStep === 1 ? (
                  <button
                    disabled={txSelected.size === 0}
                    onClick={() => setTxStep(2)}
                    className="flex-1 py-3 rounded-xl text-sm font-black bg-primary hover:bg-primary/90 text-white disabled:opacity-40 transition">
                    Next: Pick Destination ({txSelected.size}) →
                  </button>
                ) : (
                  <button
                    disabled={!txDstClass || txSending}
                    onClick={async () => {
                      setTxSending(true);
                      try {
                        const res = await fetch('/api/classes/heal', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ action: 'assign_class', classId: txDstClass, studentIds: Array.from(txSelected) }),
                        });
                        const j = await res.json();
                        if (!res.ok) throw new Error(j.error || 'Transfer failed');
                        const destName = (data?.classes ?? []).find(c => c.id === txDstClass)?.name ?? 'destination class';
                        setTxDone(`${j.updated ?? txSelected.size} student(s) transferred to "${destName}" with full authorship.`);
                      } catch (e: any) {
                        setMsg({ type: 'err', text: e.message });
                        setShowTransfer(false);
                      } finally { setTxSending(false); }
                    }}
                    className="flex-1 py-3 rounded-xl text-sm font-black bg-emerald-600 hover:bg-emerald-500 text-white disabled:opacity-40 transition flex items-center justify-center gap-2">
                    {txSending ? <ArrowPathIcon className="w-4 h-4 animate-spin" /> : <CheckCircleIcon className="w-4 h-4" />}
                    {txSending ? 'Transferring…' : `Transfer ${txSelected.size} Student${txSelected.size !== 1 ? 's' : ''}`}
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      )}

    </div>
  );
}

function Section({ title, count, description, children, color = 'amber' }: { title: string; count: number; description: string; children: React.ReactNode; color?: 'amber' | 'rose' | 'violet' | 'sky' }) {
  const colors = {
    amber: { icon: 'text-amber-600 dark:text-amber-400', badge: 'bg-amber-500/20 text-amber-600 dark:text-amber-400 border-amber-500/30', border: 'border-border' },
    rose:  { icon: 'text-rose-600 dark:text-rose-400',  badge: 'bg-rose-500/20 text-rose-600 dark:text-rose-400 border-rose-500/30',   border: 'border-rose-500/20' },
    violet:{ icon: 'text-violet-600 dark:text-violet-400',badge: 'bg-violet-500/20 text-violet-600 dark:text-violet-400 border-violet-500/30', border: 'border-violet-500/20' },
    sky:   { icon: 'text-sky-600 dark:text-sky-400',   badge: 'bg-sky-500/20 text-sky-600 dark:text-sky-400 border-sky-500/30',     border: 'border-sky-500/20' },
  }[color];
  return (
    <div className={`bg-card border ${colors.border} rounded-xl overflow-hidden`}>
      <div className="px-4 sm:px-5 py-4 border-b border-border flex items-start gap-3">
        <ExclamationTriangleIcon className={`w-5 h-5 ${colors.icon} shrink-0 mt-0.5`} />
        <div className="flex-1 min-w-0">
          <h2 className="text-sm font-extrabold text-foreground">{title}</h2>
          <p className="text-xs text-muted-foreground">{description}</p>
        </div>
        <span className={`text-xs font-black px-2.5 py-1 rounded-full border shrink-0 ${colors.badge}`}>{count}</span>
      </div>
      <div className="p-4 sm:p-5">{children}</div>
    </div>
  );
}

/** Renders class options grouped by school for a <select> element. */
function ClassOptions({ classes, schools }: { classes: ClassOption[]; schools: { id: string; name: string }[] }) {
  const schoolNameMap = Object.fromEntries(schools.map(s => [s.id, s.name]));
  // Group by school
  const grouped: Record<string, ClassOption[]> = {};
  const noSchoolClasses: ClassOption[] = [];
  for (const c of classes) {
    if (!c.school_id) { noSchoolClasses.push(c); continue; }
    const sname = schoolNameMap[c.school_id] ?? c.school_id;
    if (!grouped[sname]) grouped[sname] = [];
    grouped[sname].push(c);
  }
  return (
    <>
      {Object.entries(grouped).sort(([a], [b]) => a.localeCompare(b)).map(([school, cls]) => (
        <optgroup key={school} label={school}>
          {cls.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </optgroup>
      ))}
      {noSchoolClasses.length > 0 && (
        <optgroup label="No School">
          {noSchoolClasses.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </optgroup>
      )}
    </>
  );
}

function StudentRow({ student, selected, onToggle, onDelete, onRemoveFromClass }: {
  student: AnomalyStudent;
  selected: boolean;
  onToggle: () => void;
  onDelete?: () => void;
  onRemoveFromClass?: () => void;
}) {
  const isProtected = !!student.primary_teacher_id;
  return (
    <div className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border transition ${selected ? 'bg-primary/10 border-primary/30' : 'bg-muted/20 border-border hover:bg-muted/40'}`}>
      <label className="flex items-center gap-3 flex-1 min-w-0 cursor-pointer">
        <input type="checkbox" checked={selected} onChange={onToggle}
          className="w-4 h-4 rounded border-border text-primary shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-semibold text-foreground truncate">{student.full_name}</p>
            {student.school_name && (
              <span className="text-[10px] px-1.5 py-0.5 bg-sky-500/10 text-sky-600 dark:text-sky-400 border border-sky-500/20 rounded font-bold shrink-0 truncate max-w-[120px]">
                {student.school_name}
              </span>
            )}
            {isProtected && (
              <span className="text-[10px] px-1.5 py-0.5 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 rounded font-bold shrink-0">
                Protected
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground truncate mt-0.5">{student.email}</p>
        </div>
      </label>
      <div className="flex items-center gap-1 shrink-0">
        {onRemoveFromClass && (
          <button onClick={onRemoveFromClass} title="Remove from class"
            className="p-1.5 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 text-amber-600 dark:text-amber-400 transition">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        )}
        {onDelete && (
          <button onClick={onDelete} title="Delete student account"
            className="p-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-600 dark:text-rose-400 transition">
            <TrashIcon className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}
