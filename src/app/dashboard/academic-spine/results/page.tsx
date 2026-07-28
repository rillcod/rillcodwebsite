'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';

type Klass = { id: string; name: string; academic_offerings?: { title: string; enrollment_type: string; academic_model: string } | null; academic_offering_periods?: { label: string } | null };
type Student = { id: string; full_name: string; class_id: string; enrollment_type: string };
type Plan = { id: string; class_id: string; course_id: string; curriculum_release_id: string | null; courses?: { title: string } | null };
type Report = { id: string; student_name: string; course_name: string; report_term: string; report_period: string; overall_score: number | null; grade: string | null; calculation_mode: string; academic_qa_status: string; is_published: boolean };
type Data = { classes: Klass[]; students: Student[]; plans: Plan[]; reports: Report[] };

const enrollmentLabel: Record<string, string> = { school: 'Regular School', online: 'Virtual School', special: 'Special Programme', in_person: 'Special Programme (in person)' };

export default function CentralResultsPage() {
  const [data, setData] = useState<Data>({ classes: [], students: [], plans: [], reports: [] });
  const [classId, setClassId] = useState(''); const [studentId, setStudentId] = useState(''); const [courseId, setCourseId] = useState('');
  const [mode, setMode] = useState<'automatic' | 'manual'>('automatic'); const [saving, setSaving] = useState(false);
  const [error, setError] = useState(''); const [message, setMessage] = useState(''); const [reportId, setReportId] = useState('');
  const load = useCallback(async () => { const response = await fetch('/api/academic-spine/results', { cache: 'no-store' }); const body = await response.json(); if (!response.ok) return setError(body.error || 'Unable to open results.'); setData(body.data); }, []);
  useEffect(() => { void load(); }, [load]);
  const activeClass = data.classes.find((item) => item.id === classId);
  const students = useMemo(() => data.students.filter((item) => item.class_id === classId), [data.students, classId]);
  const plans = useMemo(() => data.plans.filter((item) => item.class_id === classId), [data.plans, classId]);

  async function prepare() {
    setSaving(true); setError(''); setMessage(''); setReportId('');
    try {
      const response = await fetch('/api/academic-spine/results', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ student_id: studentId, class_id: classId, course_id: courseId, calculation_mode: mode }) });
      const body = await response.json(); if (!response.ok) throw new Error(body.error || 'Result could not be prepared.');
      setReportId(body.data.report_id); setMessage(mode === 'manual' ? 'Manual result is ready for entry. Existing marks will not be overwritten.' : 'The result was calculated from recorded evidence and checked.'); await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Result could not be prepared.'); }
    finally { setSaving(false); }
  }

  return <div className="mx-auto max-w-7xl space-y-6 p-4 sm:p-6 lg:p-8">
    <section className="rounded-3xl border border-border bg-card p-6"><Link href="/dashboard/academic-spine" className="text-sm font-bold text-primary">Back to Academic Spine</Link><h1 className="mt-3 text-3xl font-black text-foreground">Results workspace</h1><p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">One place for Regular School, Virtual School and Special Programme results. Enrollment keeps each learner in the correct pathway; manual entry remains manual.</p></section>
    {error && <div className="rounded-2xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">{error}</div>}
    {message && <div className="flex flex-col gap-3 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm text-emerald-800 sm:flex-row sm:items-center sm:justify-between"><span>{message}</span>{reportId && <Link href={`/dashboard/reports/builder?report=${reportId}`} className="rounded-xl bg-emerald-700 px-4 py-2 text-center font-bold text-white">Open result</Link>}</div>}
    <section className="rounded-3xl border border-border bg-card p-6"><h2 className="text-xl font-black">Prepare a learner result</h2><div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      <label className="text-sm font-bold">Class or cohort<select value={classId} onChange={(event) => { setClassId(event.target.value); setStudentId(''); setCourseId(''); }} className="mt-2 w-full rounded-xl border border-border bg-background p-3"><option value="">Choose class or cohort</option>{data.classes.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      <label className="text-sm font-bold">Learner<select value={studentId} onChange={(event) => setStudentId(event.target.value)} className="mt-2 w-full rounded-xl border border-border bg-background p-3"><option value="">Choose learner</option>{students.map((item) => <option key={item.id} value={item.id}>{item.full_name}</option>)}</select></label>
      <label className="text-sm font-bold">Course<select value={courseId} onChange={(event) => setCourseId(event.target.value)} className="mt-2 w-full rounded-xl border border-border bg-background p-3"><option value="">Choose planned course</option>{plans.map((item) => <option key={item.id} value={item.course_id}>{item.courses?.title || 'Course'}{item.curriculum_release_id ? '' : ' (direction needed)'}</option>)}</select></label>
      <label className="text-sm font-bold">How marks are entered<select value={mode} onChange={(event) => setMode(event.target.value as 'automatic' | 'manual')} className="mt-2 w-full rounded-xl border border-border bg-background p-3"><option value="automatic">Automatic from evidence</option><option value="manual">Manual entry</option></select></label>
    </div>{activeClass && <div className="mt-4 rounded-2xl bg-muted p-4 text-sm"><span className="font-black">{enrollmentLabel[activeClass.academic_offerings?.enrollment_type || ''] || 'Academic pathway'}</span><span className="text-muted-foreground"> · {activeClass.academic_offering_periods?.label || 'Learning period'} · {mode === 'manual' ? 'the system will protect entered marks' : 'the system will use weighted evidence'}</span></div>}
      <button onClick={() => void prepare()} disabled={saving || !classId || !studentId || !courseId} className="mt-5 rounded-xl bg-primary px-6 py-3 font-bold text-primary-foreground disabled:opacity-50">{saving ? 'Preparing result...' : mode === 'manual' ? 'Create protected manual result' : 'Calculate from evidence'}</button>
    </section>
    <section className="rounded-3xl border border-border bg-card p-6"><h2 className="text-xl font-black">Recent results</h2><div className="mt-4 space-y-3">{data.reports.slice(0, 40).map((report) => <article key={report.id} className="flex flex-col gap-3 rounded-2xl border border-border p-4 sm:flex-row sm:items-center sm:justify-between"><div><p className="font-black">{report.student_name} · {report.course_name}</p><p className="mt-1 text-sm text-muted-foreground">{report.report_term} {report.report_period} · {report.calculation_mode === 'manual' ? 'Manual marks protected' : 'Evidence calculated'} · {report.academic_qa_status.replace('_', ' ')}</p></div><div className="flex items-center gap-3"><span className="text-xl font-black">{report.overall_score ?? '—'}{report.overall_score == null ? '' : '%'}</span><Link href={`/dashboard/reports/builder?report=${report.id}`} className="rounded-xl border border-border px-4 py-2 text-sm font-bold">Open</Link></div></article>)}{data.reports.length === 0 && <p className="rounded-2xl bg-muted p-5 text-sm text-muted-foreground">No results have been prepared in your academic scope yet.</p>}</div></section>
  </div>;
}
