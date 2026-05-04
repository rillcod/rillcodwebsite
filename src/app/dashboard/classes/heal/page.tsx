'use client';
import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/contexts/auth-context';
import { useRouter } from 'next/navigation';
import { ExclamationTriangleIcon, CheckCircleIcon, ArrowPathIcon, TrashIcon } from '@/lib/icons';

type AnomalyStudent = { id: string; full_name: string; email: string; class_id?: string | null; school_id?: string | null; section_class?: string | null; school_name?: string | null };
type AnomalyClass = { id: string; name: string; school_id: string; created_at: string; schools?: { name: string } | null };
type ClassOption = { id: string; name: string; school_id: string | null };

export default function ClassHealPage() {
  const { profile, loading: authLoading } = useAuth();
  const router = useRouter();

  const [data, setData] = useState<{
    noSchool: AnomalyStudent[];
    noClass: AnomalyStudent[];
    mismatched: AnomalyStudent[];
    sectionDrift: AnomalyStudent[];
    orphanClasses: AnomalyClass[];
    classes: ClassOption[];
  } | null>(null);
  const [schools, setSchools] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  // Selection state per anomaly group
  const [selNoSchool, setSelNoSchool] = useState<Set<string>>(new Set());
  const [selNoClass, setSelNoClass] = useState<Set<string>>(new Set());
  const [selMismatched, setSelMismatched] = useState<Set<string>>(new Set());
  const [selDrift, setSelDrift] = useState<Set<string>>(new Set());

  const [targetClass, setTargetClass] = useState('');
  const [targetSchool, setTargetSchool] = useState('');

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
      setMsg({ type: 'ok', text: `Fixed ${j.updated ?? 1} record(s).` });
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
    (data?.mismatched.length ?? 0) + (data?.sectionDrift.length ?? 0) + (data?.orphanClasses.length ?? 0);

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
          <button onClick={load} disabled={working || loading}
            className="flex items-center gap-2 px-4 py-2 bg-muted hover:bg-muted/80 text-sm font-bold rounded-xl transition">
            <ArrowPathIcon className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> Re-scan
          </button>
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

        {/* ── Students with no school ───────────────────────────── */}
        {(data?.noSchool.length ?? 0) > 0 && (
          <Section title="Students Without a School" count={data!.noSchool.length}
            description="These students have no school_id. Assign them to a school.">
            <div className="space-y-2">
              <div className="flex items-center gap-3 mb-3">
                <select value={targetSchool} onChange={e => setTargetSchool(e.target.value)}
                  className="select-premium flex-1 text-sm px-3 py-2">
                  <option value="">— Select school —</option>
                  {schools.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
                <button onClick={() => selAll(data!.noSchool.map(s => s.id), setSelNoSchool)}
                  className="text-xs font-bold text-primary hover:underline">Select all</button>
                <button
                  disabled={!targetSchool || selNoSchool.size === 0 || working}
                  onClick={() => applyAction('assign_school', Array.from(selNoSchool), { schoolId: targetSchool })}
                  className="px-4 py-2 bg-primary text-white text-xs font-black rounded-xl disabled:opacity-40 transition">
                  Assign School
                </button>
              </div>
              {data!.noSchool.map(s => (
                <StudentRow key={s.id} student={s} selected={selNoSchool.has(s.id)}
                  onToggle={() => toggleSel(selNoSchool, setSelNoSchool, s.id)} />
              ))}
            </div>
          </Section>
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
            description="Student's school_id doesn't match their class's school. Move them to the correct class.">
            <div className="space-y-2">
              <div className="flex items-center gap-3 mb-3">
                <select value={targetClass} onChange={e => setTargetClass(e.target.value)}
                  className="select-premium flex-1 text-sm px-3 py-2">
                  <option value="">— Move to class —</option>
                  {(data?.classes ?? []).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
                <button onClick={() => selAll(data!.mismatched.map(s => s.id), setSelMismatched)}
                  className="text-xs font-bold text-primary hover:underline">Select all</button>
                <button
                  disabled={!targetClass || selMismatched.size === 0 || working}
                  onClick={() => applyAction('assign_class', Array.from(selMismatched), { classId: targetClass })}
                  className="px-4 py-2 bg-primary text-white text-xs font-black rounded-xl disabled:opacity-40 transition">
                  Reassign
                </button>
              </div>
              {data!.mismatched.map(s => (
                <StudentRow key={s.id} student={s} selected={selMismatched.has(s.id)}
                  onToggle={() => toggleSel(selMismatched, setSelMismatched, s.id)} />
              ))}
            </div>
          </Section>
        )}

        {/* ── section_class drift ───────────────────────────────── */}
        {(data?.sectionDrift.length ?? 0) > 0 && (
          <Section title="Section Name Drift" count={data!.sectionDrift.length}
            description="Student's section_class text doesn't match their actual class name. Auto-fix syncs them.">
            <div className="flex items-center gap-3 mb-3">
              <button onClick={() => selAll(data!.sectionDrift.map(s => s.id), setSelDrift)}
                className="text-xs font-bold text-primary hover:underline">Select all</button>
              <button
                disabled={selDrift.size === 0 || working}
                onClick={() => applyAction('fix_section_drift', Array.from(selDrift))}
                className="px-4 py-2 bg-sky-600 text-white text-xs font-black rounded-xl disabled:opacity-40 transition">
                Auto-fix Selected
              </button>
            </div>
            <div className="space-y-2">
              {data!.sectionDrift.map(s => (
                <StudentRow key={s.id} student={s} selected={selDrift.has(s.id)}
                  onToggle={() => toggleSel(selDrift, setSelDrift, s.id)}
                  extra={`section_class: "${s.section_class}"`} />
              ))}
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
