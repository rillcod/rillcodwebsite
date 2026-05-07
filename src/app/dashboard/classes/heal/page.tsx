'use client';
import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '@/contexts/auth-context';
import { useRouter } from 'next/navigation';
import { ExclamationTriangleIcon, CheckCircleIcon, ArrowPathIcon, TrashIcon, MagnifyingGlassIcon } from '@/lib/icons';

type RegistryHint = { school_id: string | null; school_name: string | null; section: string | null; grade_level: string | null; status: string | null };
type AnomalyStudent = { id: string; full_name: string; email: string; class_id?: string | null; school_id?: string | null; section_class?: string | null; school_name?: string | null; registry?: RegistryHint | null; class_name?: string | null; class_school_id?: string | null; class_school_name?: string | null; class_teacher_conflict?: boolean };
type ConflictStudent = AnomalyStudent & { current_class_name: string | null; current_class_teacher_id: string | null; current_class_teacher_name: string | null; report_teacher_id: string | null; report_teacher_name: string | null };
type AnomalyClass = { id: string; name: string; school_id: string; created_at: string; schools?: { name: string } | null };
type ClassOption = { id: string; name: string; school_id: string | null; teacher_id?: string | null };
type TeacherOption = { id: string; full_name: string };
type MissingTs = { teacher_id: string; school_id: string; teacher_name: string | null; school_name: string | null; class_ids: string[] };
type SearchStudent = { id: string; full_name: string; email: string; school_id: string | null; school_name: string | null; class_id: string | null; section_class: string | null; class_name: string | null };
type AuditStudent = { id: string; full_name: string; email: string; school_id: string | null; class_id: string | null; section_class: string | null; current_class_name: string | null; current_class_teacher_name: string | null; displacement_sources?: string[] };
type AuditSchool = { school_id: string; school_name: string; in_teacher_schools: boolean; classes: { id: string; name: string; school_id: string; student_count: number }[]; students_in_classes: AuditStudent[]; displaced_students: AuditStudent[] };

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
  const [auditSelDisplaced, setAuditSelDisplaced] = useState<Record<string, Set<string>>>({}); // schoolId => Set<studentId>
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
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-extrabold text-foreground">Class Health &amp; Repair</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Scan and fix student–class–school mismatches. Admin only.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => applyAction('auto_align_by_reports', [])}
              disabled={working || loading || (data?.teacherConflict.length ?? 0) === 0}
              title="For every student whose class teacher doesn't match their primary report author, move them to a class owned by the report teacher at the same school."
              className="flex items-center gap-2 px-4 py-2 bg-violet-600 hover:bg-violet-500 disabled:opacity-40 text-white text-sm font-bold rounded-xl transition">
              <ArrowPathIcon className="w-4 h-4" /> Auto-Align by Reports
            </button>
            <button
              onClick={() => applyAction('safe_auto_repair', [])}
              disabled={working || loading || totalIssues === 0}
              title="Assigns class_id to students who have no class but whose section_class text exactly matches a class name at their school."
              className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white text-sm font-bold rounded-xl transition">
              <CheckCircleIcon className="w-4 h-4" /> Safe Auto-Repair
            </button>
            <button onClick={load} disabled={working || loading}
              className="flex items-center gap-2 px-4 py-2 bg-muted hover:bg-muted/80 text-sm font-bold rounded-xl transition">
              <ArrowPathIcon className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> Re-scan
            </button>
          </div>
        </div>

        {msg && (
          <div className={`flex items-center gap-2 px-4 py-3 rounded-xl text-sm font-semibold ${msg.type === 'ok' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30' : 'bg-rose-500/10 text-rose-400 border border-rose-500/30'}`}>
            {msg.type === 'ok' ? <CheckCircleIcon className="w-4 h-4 shrink-0" /> : <ExclamationTriangleIcon className="w-4 h-4 shrink-0" />}
            {msg.text}
          </div>
        )}

        {totalIssues === 0 ? (
          <div className="text-center py-16 bg-card border border-emerald-500/20 rounded-xl">
            <CheckCircleIcon className="w-12 h-12 mx-auto text-emerald-400 mb-3" />
            <p className="text-lg font-bold text-foreground">All clear — no anomalies found.</p>
          </div>
        ) : (
          <div className="text-xs font-bold text-amber-400 uppercase tracking-widest">
            {totalIssues} issue{totalIssues !== 1 ? 's' : ''} found
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
                  <div key={s.id} className="flex flex-wrap items-center gap-3 px-4 py-3 bg-muted/30 rounded-xl border border-border">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-foreground truncate">{s.full_name}</p>
                      <p className="text-xs text-muted-foreground truncate">
                        {s.email}
                        {s.school_name ? ` · ${s.school_name}` : s.school_id ? ` · ${s.school_id}` : ' · No school'}
                      </p>
                      <p className="text-xs mt-0.5">
                        <span className="text-muted-foreground">Current class: </span>
                        <span className={s.class_name ? 'text-foreground font-medium' : 'text-amber-400 italic'}>
                          {s.class_name ?? (s.section_class ? `section_class: "${s.section_class}" (unlinked)` : 'None')}
                        </span>
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <select
                        value={reassignTarget[s.id] ?? ''}
                        onChange={e => setReassignTarget(prev => ({ ...prev, [s.id]: e.target.value }))}
                        className="select-premium text-xs px-2 py-1.5 max-w-[200px]"
                      >
                        <option value="">— Move to class —</option>
                        {(data?.classes ?? []).map(c => (
                          <option key={c.id} value={c.id}>{c.name}</option>
                        ))}
                      </select>
                      <button
                        disabled={!reassignTarget[s.id] || working}
                        onClick={() => reassignStudent(s.id)}
                        className="px-3 py-1.5 bg-primary text-white text-xs font-black rounded-xl disabled:opacity-40 transition"
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
            <div className="flex items-end gap-3">
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
                    setAuditSelDisplaced({});
                  } catch { /* ignore */ }
                  setAuditLoading(false);
                }}
                className="px-4 py-2 bg-violet-600 hover:bg-violet-500 disabled:opacity-40 text-white text-sm font-black rounded-xl transition"
              >
                {auditLoading ? <ArrowPathIcon className="w-4 h-4 animate-spin" /> : 'Run Audit'}
              </button>
            </div>

            {auditData && (
              <div className="space-y-6">
                <p className="text-xs font-bold text-violet-400 uppercase tracking-widest">
                  Audit results for {auditData.teacher_name} — {auditData.schoolAudit.length} school(s)
                </p>
                {auditData.schoolAudit.map(school => (
                  <div key={school.school_id} className={`rounded-xl border p-4 space-y-4 ${school.displaced_students.length > 0 ? 'border-amber-500/30 bg-amber-500/5' : 'border-border bg-muted/10'}`}>
                    {/* School header */}
                    <div className="flex items-center gap-3">
                      <div className="flex-1">
                        <p className="text-sm font-extrabold text-foreground">{school.school_name}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {school.classes.length} class(es) · {school.students_in_classes.length} student(s) enrolled
                          {!school.in_teacher_schools && (
                            <span className="ml-2 px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-400 text-[10px] font-black border border-rose-500/30">
                              Missing teacher_schools link — run Fix below
                            </span>
                          )}
                        </p>
                      </div>
                      {!school.in_teacher_schools && (
                        <button
                          disabled={working}
                          onClick={() => applyAction('sync_teacher_schools', [], { teacherId: auditTeacherId })}
                          className="px-3 py-1.5 bg-rose-600 hover:bg-rose-500 text-white text-xs font-black rounded-xl disabled:opacity-40 transition active:scale-95"
                        >
                          Fix Link
                        </button>
                      )}
                    </div>

                    {/* Classes */}
                    {school.classes.length > 0 && (
                      <div className="flex flex-wrap gap-2">
                        {school.classes.map(cls => (
                          <span key={cls.id} className="px-3 py-1.5 bg-background border border-border rounded-xl text-xs font-semibold text-foreground">
                            {cls.name} · {cls.student_count} student{cls.student_count !== 1 ? 's' : ''}
                          </span>
                        ))}
                      </div>
                    )}

                    {/* Displaced students */}
                    {school.displaced_students.length > 0 && (
                      <div className="space-y-2">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-xs font-bold text-amber-400 uppercase tracking-widest">
                            {school.displaced_students.length} displaced student(s)
                          </p>
                          <span className="text-[10px] text-muted-foreground">·</span>
                          <span className="text-[10px] text-muted-foreground">
                            {school.displaced_students.filter(s => (s.displacement_sources ?? []).includes('report_authored') && (s.displacement_sources ?? []).includes('batch_registered')).length} confirmed by both signals
                          </span>
                        </div>
                        <div className="space-y-1.5 max-h-64 overflow-y-auto pr-1">
                          {school.displaced_students.map(s => {
                            const sel = auditSelDisplaced[school.school_id] ?? new Set();
                            const checked = sel.has(s.id);
                            const sources = s.displacement_sources ?? [];
                            const hasReports = sources.includes('report_authored');
                            const hasBatch = sources.includes('batch_registered');
                            return (
                              <label key={s.id} className={`flex items-center gap-3 px-3 py-2 rounded-xl border cursor-pointer transition ${checked ? 'bg-violet-500/10 border-violet-500/30' : 'bg-background border-border hover:bg-muted/30'}`}>
                                <input type="checkbox" checked={checked} onChange={() => {
                                  setAuditSelDisplaced(prev => {
                                    const cur = new Set(prev[school.school_id] ?? []);
                                    checked ? cur.delete(s.id) : cur.add(s.id);
                                    return { ...prev, [school.school_id]: cur };
                                  });
                                }} className="w-4 h-4 rounded text-violet-500" />
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <p className="text-sm font-semibold text-foreground truncate">{s.full_name}</p>
                                    {hasReports && hasBatch && (
                                      <span className="text-[9px] px-1.5 py-0.5 bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 rounded font-black uppercase whitespace-nowrap shrink-0">Reports + Batch</span>
                                    )}
                                    {hasReports && !hasBatch && (
                                      <span className="text-[9px] px-1.5 py-0.5 bg-violet-500/15 text-violet-400 border border-violet-500/30 rounded font-black uppercase whitespace-nowrap shrink-0">Has Reports</span>
                                    )}
                                    {hasBatch && !hasReports && (
                                      <span className="text-[9px] px-1.5 py-0.5 bg-amber-500/15 text-amber-400 border border-amber-500/30 rounded font-black uppercase whitespace-nowrap shrink-0">Batch Registered</span>
                                    )}
                                  </div>
                                  <p className="text-xs text-muted-foreground truncate mt-0.5">
                                    {s.current_class_name
                                      ? `Currently in: ${s.current_class_name}${s.current_class_teacher_name ? ` (${s.current_class_teacher_name})` : ''}`
                                      : 'Not in any class'}
                                  </p>
                                </div>
                              </label>
                            );
                          })}
                        </div>

                        {/* Destination class + move button */}
                        <div className="flex flex-wrap items-center gap-2 pt-1">
                          <button
                            onClick={() => {
                              const all = new Set(school.displaced_students.map(s => s.id));
                              setAuditSelDisplaced(prev => ({ ...prev, [school.school_id]: all }));
                            }}
                            className="text-xs font-bold text-violet-400 hover:underline"
                          >
                            Select all
                          </button>
                          <select
                            value={auditDestClass[school.school_id] ?? ''}
                            onChange={e => setAuditDestClass(prev => ({ ...prev, [school.school_id]: e.target.value }))}
                            className="select-premium text-xs px-2 py-1.5 flex-1 min-w-[160px]"
                          >
                            <option value="">— Move to class —</option>
                            {school.classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                          </select>
                          <button
                            disabled={!auditDestClass[school.school_id] || !(auditSelDisplaced[school.school_id]?.size) || working}
                            onClick={async () => {
                              const ids = Array.from(auditSelDisplaced[school.school_id] ?? []);
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
                                setMsg({ type: 'ok', text: `Moved ${j.updated} student(s) to class.${j.skipped ? ` ${j.skipped} skipped (school mismatch).` : ''}` });
                                // Refresh audit
                                const r2 = await fetch(`/api/classes/heal?teacher_audit=${auditTeacherId}`, { cache: 'no-store' });
                                const j2 = await r2.json();
                                setAuditData(j2.data ?? null);
                                setAuditSelDisplaced(prev => { const n = { ...prev }; delete n[school.school_id]; return n; });
                                await load();
                              } catch (e: any) {
                                setMsg({ type: 'err', text: e.message });
                              } finally { setWorking(false); }
                            }}
                            className="px-3 py-1.5 bg-violet-600 hover:bg-violet-500 text-white text-xs font-black rounded-xl disabled:opacity-40 transition active:scale-95"
                          >
                            Move Selected
                          </button>
                        </div>
                      </div>
                    )}
                    {school.displaced_students.length === 0 && school.classes.length > 0 && (
                      <p className="text-xs text-emerald-400 font-semibold">All students are correctly assigned to this teacher's classes.</p>
                    )}
                    {school.classes.length === 0 && (
                      <p className="text-xs text-muted-foreground italic">No classes found for this teacher at this school.</p>
                    )}
                  </div>
                ))}
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
                      <option value="">— Move to class —</option>
                      {(data?.classes ?? [])
                        .filter(c => !s.report_teacher_id || c.teacher_id === s.report_teacher_id)
                        .map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                    <button
                      disabled={!reassignTarget[s.id] || working}
                      onClick={() => reassignStudent(s.id)}
                      className="px-3 py-1.5 bg-violet-600 text-white text-xs font-black rounded-xl disabled:opacity-40 transition active:scale-95"
                    >
                      Move
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
                          {classesForChosenSchool.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
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
              <div className="flex items-center gap-3 mb-3">
                <select value={targetClass} onChange={e => setTargetClass(e.target.value)}
                  className="select-premium flex-1 text-sm px-3 py-2">
                  <option value="">— Select class —</option>
                  {(data?.classes ?? []).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
                <button onClick={() => selAll(data!.noClass.map(s => s.id), setSelNoClass)}
                  className="text-xs font-bold text-primary hover:underline">Select all</button>
                <button
                  disabled={!targetClass || selNoClass.size === 0 || working}
                  onClick={() => applyAction('assign_class', Array.from(selNoClass), { classId: targetClass })}
                  className="px-4 py-2 bg-primary text-white text-xs font-black rounded-xl disabled:opacity-40 transition">
                  Assign Class
                </button>
              </div>
              {data!.noClass.map(s => (
                <StudentRow key={s.id} student={s} selected={selNoClass.has(s.id)}
                  onToggle={() => toggleSel(selNoClass, setSelNoClass, s.id)}
                  extra={`School: ${s.school_name ?? s.school_id ?? '?'}`} />
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
                        <div className="flex items-center justify-between">
                          <p className="text-xs font-bold text-emerald-400 uppercase tracking-widest">{safe.length} safe to align</p>
                          <div className="flex gap-2">
                            <button onClick={() => selAll(safe.map(s => s.id), setSelMismatched)}
                              className="text-xs font-bold text-primary hover:underline">Select all safe</button>
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

function Section({ title, count, description, children }: { title: string; count: number; description: string; children: React.ReactNode }) {
  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden">
      <div className="px-5 py-4 border-b border-border flex items-center gap-3">
        <ExclamationTriangleIcon className="w-5 h-5 text-amber-400 shrink-0" />
        <div className="flex-1">
          <h2 className="text-sm font-extrabold text-foreground">{title}</h2>
          <p className="text-xs text-muted-foreground">{description}</p>
        </div>
        <span className="text-xs font-black px-2.5 py-1 rounded-full bg-amber-500/20 text-amber-400 border border-amber-500/30">{count}</span>
      </div>
      <div className="p-5">{children}</div>
    </div>
  );
}

function StudentRow({ student, selected, onToggle, extra }: { student: AnomalyStudent; selected: boolean; onToggle: () => void; extra?: string }) {
  return (
    <label className="flex items-center gap-3 px-4 py-2.5 rounded-xl bg-muted/30 hover:bg-muted/50 cursor-pointer transition">
      <input type="checkbox" checked={selected} onChange={onToggle}
        className="w-4 h-4 rounded border-border text-primary" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-foreground truncate">{student.full_name}</p>
        <p className="text-xs text-muted-foreground truncate">{student.email}{extra ? ` · ${extra}` : ''}</p>
      </div>
    </label>
  );
}
