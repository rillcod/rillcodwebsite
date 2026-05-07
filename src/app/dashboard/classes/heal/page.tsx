'use client';
import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '@/contexts/auth-context';
import { useRouter } from 'next/navigation';
import { ExclamationTriangleIcon, CheckCircleIcon, ArrowPathIcon, TrashIcon, MagnifyingGlassIcon, PlusIcon, ChevronDownIcon } from '@/lib/icons';

type RegistryHint = { school_id: string | null; school_name: string | null; section: string | null; grade_level: string | null; status: string | null };
type AnomalyStudent = { id: string; full_name: string; email: string; class_id?: string | null; school_id?: string | null; section_class?: string | null; school_name?: string | null; primary_teacher_id?: string | null; registry?: RegistryHint | null; class_name?: string | null; class_school_id?: string | null; class_school_name?: string | null; class_teacher_conflict?: boolean };
type ConflictStudent = AnomalyStudent & { current_class_name: string | null; current_class_teacher_id: string | null; current_class_teacher_name: string | null; report_teacher_id: string | null; report_teacher_name: string | null };
type AnomalyClass = { id: string; name: string; school_id: string; created_at: string; schools?: { name: string } | null };
type ClassOption = { id: string; name: string; school_id: string | null; teacher_id?: string | null };
type TeacherOption = { id: string; full_name: string };
type MissingTs = { teacher_id: string; school_id: string; teacher_name: string | null; school_name: string | null; class_ids: string[] };
type SearchStudent = { id: string; full_name: string; email: string; school_id: string | null; school_name: string | null; class_id: string | null; section_class: string | null; class_name: string | null };
type AuditStudent = { id: string; full_name: string; email: string; school_id: string | null; class_id: string | null; section_class: string | null; current_class_name: string | null; current_class_teacher_name: string | null; displacement_sources?: string[] };
type AuditClass = { id: string; name: string; school_id: string; student_count: number; students: AuditStudent[] };
type AuditSchool = { school_id: string; school_name: string; in_teacher_schools: boolean; classes: AuditClass[]; students_in_classes: AuditStudent[]; displaced_students: AuditStudent[] };

export default function ClassHealPage() {
  const { profile, loading: authLoading } = useAuth();
  const router = useRouter();

  const [data, setData] = useState<{
    noSchool: AnomalyStudent[];
    noClass: AnomalyStudent[];
    mismatched: AnomalyStudent[];
    sectionDrift: AnomalyStudent[];
    orphanClasses: AnomalyClass[];
    teacherConflict: ConflictStudent[];
    missingTeacherSchools: MissingTs[];
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
  const [createClassForm, setCreateClassForm] = useState<Record<string, { name: string; autoFill: boolean }>>({});
  const [auditConfirmDelete, setAuditConfirmDelete] = useState<string | null>(null); // student id pending delete in audit
  const [noClassConfirmDelete, setNoClassConfirmDelete] = useState<string | null>(null);
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
    n.has(id) ? n.delete(id) : n.add(id);
    setFn(n);
  }
  function selAll(ids: string[], setFn: (s: Set<string>) => void) {
    setFn(new Set(ids));
  }

  const classesForSchool = (sid: string) =>
    (data?.classes ?? []).filter((c) => c.school_id === sid);

  if (authLoading || loading) return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <ArrowPathIcon className="w-8 h-8 animate-spin text-primary" />
    </div>
  );

  const totalIssues = (data?.noSchool.length ?? 0) + (data?.noClass.length ?? 0) +
    (data?.mismatched.length ?? 0) + (data?.sectionDrift.length ?? 0) + (data?.orphanClasses.length ?? 0) +
    (data?.teacherConflict.length ?? 0) + (data?.missingTeacherSchools.length ?? 0);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="max-w-5xl mx-auto px-4 py-8 space-y-8">
        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-xl sm:text-2xl font-extrabold text-foreground">Class Health &amp; Repair</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Scan and fix student–class–school mismatches. Admin only.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => applyAction('auto_align_by_reports', [])}
              disabled={working || loading || (data?.teacherConflict.length ?? 0) === 0}
              title="For every student whose class teacher doesn't match their primary report author, move them to a class owned by the report teacher at the same school."
              className="flex items-center gap-2 px-3 py-2 bg-violet-600 hover:bg-violet-500 disabled:opacity-40 text-white text-xs font-bold rounded-xl transition">
              <ArrowPathIcon className="w-4 h-4 shrink-0" /> Auto-Align by Reports
            </button>
            <button
              onClick={() => applyAction('safe_auto_repair', [])}
              disabled={working || loading || totalIssues === 0}
              title="Assigns class_id to students who have no class but whose section_class text exactly matches a class name at their school."
              className="flex items-center gap-2 px-3 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white text-xs font-bold rounded-xl transition">
              <CheckCircleIcon className="w-4 h-4 shrink-0" /> Safe Auto-Repair
            </button>
            <button onClick={load} disabled={working || loading}
              className="flex items-center gap-2 px-3 py-2 bg-muted hover:bg-muted/80 text-xs font-bold rounded-xl transition">
              <ArrowPathIcon className={`w-4 h-4 shrink-0 ${loading ? 'animate-spin' : ''}`} /> Re-scan
            </button>
          </div>
        </div>

        {msg && (
          <div className={`flex items-center gap-2 px-4 py-3 rounded-xl text-sm font-semibold ${msg.type === 'ok' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30' : 'bg-rose-500/10 text-rose-400 border border-rose-500/30'}`}>
            {msg.type === 'ok' ? <CheckCircleIcon className="w-4 h-4 shrink-0" /> : <ExclamationTriangleIcon className="w-4 h-4 shrink-0" />}
            {msg.text}
          </div>
        )}

        {/* Stats summary panel */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="bg-card border border-border rounded-xl px-4 py-3 flex flex-col gap-1">
            <span className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">Total Issues</span>
            <span className={`text-2xl font-black ${totalIssues > 0 ? 'text-amber-400' : 'text-emerald-400'}`}>{totalIssues}</span>
          </div>
          <div className="bg-card border border-violet-500/20 rounded-xl px-4 py-3 flex flex-col gap-1">
            <span className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">Conflicts</span>
            <span className="text-2xl font-black text-violet-400">{data?.teacherConflict.length ?? 0}</span>
          </div>
          <div className="bg-card border border-emerald-500/20 rounded-xl px-4 py-3 flex flex-col gap-1">
            <span className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">Protected</span>
            <span className="text-2xl font-black text-emerald-400">{data?.protectedCount ?? 0}</span>
            <span className="text-[10px] text-muted-foreground leading-tight">students with a primary teacher lock</span>
          </div>
          <div className="bg-card border border-sky-500/20 rounded-xl px-4 py-3 flex flex-col gap-1">
            <span className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">No Class</span>
            <span className="text-2xl font-black text-sky-400">{data?.noClass.length ?? 0}</span>
          </div>
        </div>

        {totalIssues === 0 && (
          <div className="text-center py-16 bg-card border border-emerald-500/20 rounded-xl">
            <CheckCircleIcon className="w-12 h-12 mx-auto text-emerald-400 mb-3" />
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
                        <span className={s.class_name ? 'text-foreground font-medium' : 'text-amber-400 italic'}>
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
            <ArrowPathIcon className="w-5 h-5 text-violet-400 shrink-0" />
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
                <p className="text-xs font-bold text-violet-400 uppercase tracking-widest">
                  Audit results for {auditData.teacher_name} — {auditData.schoolAudit.length} school(s)
                </p>
                {auditData.schoolAudit.map(school => {
                  const schoolSel = auditSel[school.school_id] ?? new Set<string>();
                  const selCount = schoolSel.size;

                  function toggleSt(id: string) {
                    setAuditSel(prev => {
                      const cur = new Set(prev[school.school_id] ?? []);
                      cur.has(id) ? cur.delete(id) : cur.add(id);
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
                            <span className="text-amber-400 font-bold">{school.displaced_students.length} displaced</span>
                          </>}
                          {!school.in_teacher_schools && (
                            <span className="ml-1 px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-400 text-[10px] font-black border border-rose-500/30">
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
                                  n.has(cls.id) ? n.delete(cls.id) : n.add(cls.id);
                                  return n;
                                })}
                              >
                                <div className="flex-1 min-w-0">
                                  <span className="text-sm font-bold text-foreground">{cls.name}</span>
                                  <span className="text-xs text-muted-foreground ml-2">
                                    {cls.student_count} student{cls.student_count !== 1 ? 's' : ''}
                                    {allInClass.some(id => schoolSel.has(id)) && (
                                      <span className="ml-2 text-violet-400 font-bold">
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
                                            <input type="checkbox" checked={schoolSel.has(s.id)} onChange={() => toggleSt(s.id)} className="w-4 h-4 rounded text-violet-500 shrink-0 cursor-pointer" />
                                            <div className="flex-1 min-w-0">
                                              <p className="text-xs font-semibold text-foreground truncate">{s.full_name}</p>
                                              <p className="text-[10px] text-muted-foreground truncate">{s.email}</p>
                                            </div>
                                            <button
                                              title="Remove from class"
                                              onClick={() => applyAction('remove_from_class', [s.id])}
                                              disabled={working}
                                              className="p-1 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 transition shrink-0">
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
                        <p className="text-xs font-bold text-amber-400">No class exists for this teacher at {school.school_name} yet.</p>
                        <p className="text-xs text-amber-500/70 mt-0.5">Create a class below to assign the {school.displaced_students.length} displaced student(s).</p>
                      </div>
                    )}

                    {/* ── Displaced students ── */}
                    {school.displaced_students.length > 0 && (
                      <div className="space-y-2">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-xs font-bold text-amber-400 uppercase tracking-widest">
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
                                <input type="checkbox" checked={checked} onChange={() => toggleSt(s.id)} className="w-4 h-4 rounded text-violet-500 shrink-0 cursor-pointer" />
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <p className="text-sm font-semibold text-foreground truncate">{s.full_name}</p>
                                    {multiSignal && (
                                      <span className="text-[9px] px-1.5 py-0.5 bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 rounded font-black uppercase whitespace-nowrap shrink-0">
                                        {hasReports && hasBatch && hasRegistered ? 'All 3 Signals' : hasReports && hasBatch ? 'Reports + Batch' : hasReports && hasRegistered ? 'Reports + Registered' : 'Batch + Registered'}
                                      </span>
                                    )}
                                    {!multiSignal && hasReports && <span className="text-[9px] px-1.5 py-0.5 bg-violet-500/15 text-violet-400 border border-violet-500/30 rounded font-black uppercase whitespace-nowrap shrink-0">Has Reports</span>}
                                    {!multiSignal && hasBatch && <span className="text-[9px] px-1.5 py-0.5 bg-amber-500/15 text-amber-400 border border-amber-500/30 rounded font-black uppercase whitespace-nowrap shrink-0">Batch Registered</span>}
                                    {!multiSignal && hasRegistered && <span className="text-[9px] px-1.5 py-0.5 bg-sky-500/15 text-sky-400 border border-sky-500/30 rounded font-black uppercase whitespace-nowrap shrink-0">Registered By</span>}
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
                                    className="p-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 transition shrink-0">
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
                          className="text-xs font-bold text-amber-400 hover:underline"
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

                      {/* Create new class form */}
                      {createClassForm[school.school_id] !== undefined ? (
                        <div className="border border-dashed border-primary/40 rounded-xl p-3 space-y-2.5 bg-primary/5">
                          <p className="text-xs font-black text-primary uppercase tracking-wide">Create New Class</p>
                          <input
                            type="text"
                            value={createClassForm[school.school_id]?.name ?? ''}
                            onChange={e => setCreateClassForm(prev => ({ ...prev, [school.school_id]: { ...prev[school.school_id], name: e.target.value } }))}
                            placeholder="Class name (e.g. Python SS2)"
                            className="w-full px-3 py-2 bg-background border border-border rounded-xl text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
                          />
                          <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
                            <input
                              type="checkbox"
                              checked={createClassForm[school.school_id]?.autoFill ?? true}
                              onChange={e => setCreateClassForm(prev => ({ ...prev, [school.school_id]: { ...prev[school.school_id], autoFill: e.target.checked } }))}
                              className="w-4 h-4 rounded"
                            />
                            Auto-assign all {school.displaced_students.length} displaced student(s) to this new class
                          </label>
                          <div className="flex gap-2">
                            <button
                              disabled={!createClassForm[school.school_id]?.name?.trim() || working}
                              onClick={async () => {
                                const form = createClassForm[school.school_id];
                                if (!form?.name?.trim() || !auditTeacherId) return;
                                const fillIds = form.autoFill
                                  ? school.displaced_students.map(s => s.id)
                                  : selCount > 0 ? Array.from(schoolSel) : [];
                                setWorking(true); setMsg(null);
                                try {
                                  const res = await fetch('/api/classes/heal', {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ action: 'create_class_for_teacher', teacherId: auditTeacherId, schoolId: school.school_id, className: form.name.trim(), studentIds: fillIds }),
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
                      ) : (
                        <button
                          onClick={() => setCreateClassForm(prev => ({ ...prev, [school.school_id]: { name: '', autoFill: true } }))}
                          className="flex items-center gap-1.5 text-xs font-bold text-primary/70 hover:text-primary transition"
                        >
                          <PlusIcon className="w-3.5 h-3.5" /> Create new class for this teacher at {school.school_name}
                        </button>
                      )}
                    </div>

                    {school.displaced_students.length === 0 && school.classes.length > 0 && (
                      <p className="text-xs text-emerald-400 font-semibold">All students correctly assigned to this teacher's classes.</p>
                    )}
                  </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* ── Missing Teacher–School Links ─────────────────────── */}
        {(data?.missingTeacherSchools.length ?? 0) > 0 && (
          <div className="bg-card border border-rose-500/30 rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-border flex items-center gap-3">
              <ExclamationTriangleIcon className="w-5 h-5 text-rose-400 shrink-0" />
              <div className="flex-1">
                <h2 className="text-sm font-extrabold text-foreground">Missing Teacher–School Links</h2>
                <p className="text-xs text-muted-foreground">
                  These teachers own classes at a school but have no <code className="bg-muted px-1 rounded text-[10px]">teacher_schools</code> row for it.
                  This is why a teacher's students at that school completely disappear from their profile —
                  the scoping query only checks <code className="bg-muted px-1 rounded text-[10px]">teacher_schools</code>, so a missing row hides the entire school.
                  Click "Fix" to add the missing link, or "Fix All" to repair all teachers at once.
                </p>
              </div>
              <span className="text-xs font-black px-2.5 py-1 rounded-full bg-rose-500/20 text-rose-400 border border-rose-500/30">
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

        {/* ── Teacher–Class Conflict ────────────────────────────── */}
        {(data?.teacherConflict.length ?? 0) > 0 && (
          <div className="bg-card border border-violet-500/30 rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-border flex items-center gap-3">
              <ExclamationTriangleIcon className="w-5 h-5 text-violet-400 shrink-0" />
              <div className="flex-1">
                <h2 className="text-sm font-extrabold text-foreground">Teacher–Class Conflict</h2>
                <p className="text-xs text-muted-foreground">
                  These students are enrolled in a class owned by one teacher, but their progress reports
                  were written by a different teacher. This happens when a batch enrollment overwrites
                  class assignments — the student's visible class changes but report history stays.
                  Use "Restore Students to Teacher" above to fix in bulk, or reassign individually below.
                </p>
              </div>
              <span className="text-xs font-black px-2.5 py-1 rounded-full bg-violet-500/20 text-violet-400 border border-violet-500/30">
                {data!.teacherConflict.length}
              </span>
            </div>
            <div className="p-5 space-y-3">
              {data!.teacherConflict.map(s => (
                <div key={s.id} className="rounded-xl border border-violet-500/20 bg-violet-500/5 p-3 sm:p-4 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-foreground truncate">{s.full_name}</p>
                      <p className="text-xs text-muted-foreground truncate">{s.email}</p>
                    </div>
                  </div>
                  <div className="text-[11px] bg-background/60 rounded-lg px-3 py-2 border border-border space-y-1">
                    <p>
                      <span className="text-muted-foreground">Currently in class: </span>
                      <span className="font-semibold text-foreground">{s.current_class_name ?? '?'}</span>
                      <span className="text-muted-foreground"> (owned by </span>
                      <span className="font-semibold text-amber-400">{s.current_class_teacher_name ?? 'Unknown teacher'}</span>
                      <span className="text-muted-foreground">)</span>
                    </p>
                    <p>
                      <span className="text-muted-foreground">Progress reports written by: </span>
                      <span className="font-semibold text-violet-400">{s.report_teacher_name ?? 'Unknown teacher'}</span>
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <select
                      value={reassignTarget[s.id] ?? ''}
                      onChange={e => setReassignTarget(prev => ({ ...prev, [s.id]: e.target.value }))}
                      className="select-premium text-xs px-2 py-1.5 flex-1"
                    >
                      <option value="">— Move to report teacher's class —</option>
                      <ClassOptions
                        classes={(data?.classes ?? []).filter(c => !s.report_teacher_id || c.teacher_id === s.report_teacher_id)}
                        schools={schools}
                      />
                    </select>
                    <button
                      disabled={!reassignTarget[s.id] || working}
                      onClick={() => reassignStudent(s.id)}
                      className="px-3 py-1.5 bg-violet-600 text-white text-xs font-black rounded-xl disabled:opacity-40 transition active:scale-95"
                    >
                      Move
                    </button>
                    <button
                      disabled={working}
                      onClick={() => applyAction('delete_portal_user', [s.id])}
                      title="Delete student account"
                      className="p-1.5 bg-rose-500/10 hover:bg-rose-500/20 rounded-xl transition text-rose-400 shrink-0"
                    >
                      <TrashIcon className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Students without a school — full management panel ─── */}
        {(data?.noSchool.length ?? 0) > 0 && (
          <div className="bg-card border border-border rounded-xl overflow-hidden">
            {/* Panel header */}
            <div className="px-4 sm:px-5 py-4 border-b border-border flex flex-wrap items-center gap-3">
              <ExclamationTriangleIcon className="w-5 h-5 text-amber-400 shrink-0" />
              <div className="flex-1 min-w-0">
                <h2 className="text-sm font-extrabold text-foreground">Students Without a School</h2>
                <p className="text-xs text-muted-foreground">Cross-checked against the registration registry. Assign, sync, or delete each student.</p>
              </div>
              <span className="text-xs font-black px-2.5 py-1 rounded-full bg-amber-500/20 text-amber-400 border border-amber-500/30">{data!.noSchool.length}</span>
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
                          <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 shrink-0">Registry found</span>
                        )}
                      </div>

                      {/* Registry hint */}
                      {s.registry && (
                        <div className="text-[11px] text-muted-foreground bg-background/60 rounded-lg px-3 py-2 border border-border space-y-0.5">
                          <p className="font-bold text-foreground/70 uppercase tracking-widest text-[9px] mb-1">Registry says</p>
                          {s.registry.school_name && <p>School: <span className="text-foreground font-semibold">{s.registry.school_name}</span></p>}
                          {s.registry.section && <p>Section: <span className="text-foreground font-semibold">{s.registry.section}</span></p>}
                          {s.registry.grade_level && <p>Grade: <span className="text-foreground font-semibold">{s.registry.grade_level}</span></p>}
                          {s.registry.status && <p>Status: <span className={`font-semibold ${s.registry.status === 'approved' ? 'text-emerald-400' : 'text-amber-400'}`}>{s.registry.status}</span></p>}
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
                            <span className="text-[11px] text-rose-400 font-bold">Confirm delete?</span>
                            <button disabled={working}
                              onClick={() => { applyAction('delete_portal_user', [s.id]); setNsConfirmDelete(null); }}
                              className="px-2.5 py-1 bg-rose-600 text-white text-xs font-black rounded-xl disabled:opacity-40">Yes</button>
                            <button onClick={() => setNsConfirmDelete(null)}
                              className="px-2.5 py-1 bg-muted text-muted-foreground text-xs font-bold rounded-xl">No</button>
                          </div>
                        ) : (
                          <button
                            onClick={() => setNsConfirmDelete(s.id)}
                            className="p-1.5 bg-rose-500/10 hover:bg-rose-500/20 rounded-xl transition text-rose-400 ml-auto"
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
              {data!.noClass.map(s => (
                noClassConfirmDelete === s.id ? (
                  <div key={s.id} className="flex items-center gap-2 px-3 py-2 bg-rose-500/10 border border-rose-500/20 rounded-xl">
                    <span className="text-xs text-rose-400 font-bold flex-1">Delete {s.full_name}?</span>
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
                          <p className="text-xs font-bold text-emerald-400 uppercase tracking-widest shrink-0">{safe.length} safe to align</p>
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
                                {s.school_name || 'No school'} → class belongs to <span className="font-bold text-emerald-400">{s.class_school_name || s.class_school_id || 'Unknown'}</span>
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
                          <p className="text-xs font-bold text-amber-400 mb-1">{conflicted.length} student(s) — fix class assignment first</p>
                          <p className="text-xs text-amber-500/70">These students are in the wrong class (class teacher ≠ report author). Fix them in the Teacher–Class Conflict section above, then alignment will work correctly.</p>
                        </div>
                        {conflicted.map(s => (
                          <div key={s.id} className="flex items-start gap-3 px-4 py-2.5 rounded-xl bg-amber-500/5 border border-amber-500/20">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <p className="text-sm font-semibold text-foreground truncate">{s.full_name}</p>
                                <span className="text-[9px] px-1.5 py-0.5 bg-amber-500/15 text-amber-400 border border-amber-500/30 rounded font-black uppercase shrink-0">Fix class first</span>
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
                    <TrashIcon className="w-4 h-4 text-rose-400" />
                  </button>
                </div>
              ))}
            </div>
          </Section>
        )}
      </div>
    </div>
  );
}

function Section({ title, count, description, children, color = 'amber' }: { title: string; count: number; description: string; children: React.ReactNode; color?: 'amber' | 'rose' | 'violet' | 'sky' }) {
  const colors = {
    amber: { icon: 'text-amber-400', badge: 'bg-amber-500/20 text-amber-400 border-amber-500/30', border: 'border-border' },
    rose:  { icon: 'text-rose-400',  badge: 'bg-rose-500/20 text-rose-400 border-rose-500/30',   border: 'border-rose-500/20' },
    violet:{ icon: 'text-violet-400',badge: 'bg-violet-500/20 text-violet-400 border-violet-500/30', border: 'border-violet-500/20' },
    sky:   { icon: 'text-sky-400',   badge: 'bg-sky-500/20 text-sky-400 border-sky-500/30',     border: 'border-sky-500/20' },
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
              <span className="text-[10px] px-1.5 py-0.5 bg-sky-500/10 text-sky-400 border border-sky-500/20 rounded font-bold shrink-0 truncate max-w-[120px]">
                {student.school_name}
              </span>
            )}
            {isProtected && (
              <span className="text-[10px] px-1.5 py-0.5 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded font-bold shrink-0">
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
            className="p-1.5 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 transition">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        )}
        {onDelete && (
          <button onClick={onDelete} title="Delete student account"
            className="p-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 transition">
            <TrashIcon className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}
