'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { DonutChart, HorizontalBarChart, VerticalBarChart } from '@/components/charts';
import { SchoolReportBuilderCanvas, type EditorState } from '@/components/school-reports/SchoolReportBuilderCanvas';
import { DocumentArrowDownIcon, SparklesIcon } from '@/lib/icons';
import type { SchoolPerformanceReportRow, SchoolReportNarrative } from '@/lib/school-reports/types';

type AcademicTerm = {
  id: string;
  academic_year: string;
  term_label: string;
  term_number: number;
  start_date: string | null;
  end_date: string | null;
  is_current: boolean;
};
type ReportListItem = Pick<
  SchoolPerformanceReportRow,
  | 'id'
  | 'school_id'
  | 'title'
  | 'period_start'
  | 'period_end'
  | 'academic_year'
  | 'term_label'
  | 'status'
  | 'published_at'
  | 'created_at'
> & { school_name: string; creator_name: string };
type School = { id: string; name: string };

const today = new Date().toISOString().slice(0, 10);
const prior = new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10);
const pct = (value: number) => `${Number(value || 0).toFixed(value % 1 ? 1 : 0)}%`;
const lines = (value: string[]) => value.join('\n');
const parseLines = (value: string) =>
  value
    .split('\n')
    .map((item) => item.trim())
    .filter(Boolean);
const money = (value: number, currency: string) =>
  new Intl.NumberFormat('en-NG', {
    style: 'currency',
    currency: currency || 'NGN',
    maximumFractionDigits: 2,
  }).format(Number(value || 0));
const plainStatus = (value: string) =>
  String(value || 'pending')
    .replaceAll('_', ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());

function Kpi({
  label,
  value,
  note,
  color,
}: {
  label: string;
  value: string | number;
  note: string;
  color: string;
}) {
  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <div className="h-1 w-14 rounded-full" style={{ background: color }} />
      <p className="mt-4 text-xs font-black uppercase tracking-widest text-muted-foreground">{label}</p>
      <p className="mt-1 text-3xl font-black text-foreground">{value}</p>
      <p className="mt-1 text-xs text-muted-foreground">{note}</p>
    </div>
  );
}

export default function SchoolReportsPage() {
  const [reports, setReports] = useState<ReportListItem[]>([]);
  const [terms, setTerms] = useState<AcademicTerm[]>([]);
  const [schools, setSchools] = useState<School[]>([]);
  const [role, setRole] = useState('');
  const [selected, setSelected] = useState<SchoolPerformanceReportRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState('');
  const [error, setError] = useState('');
  const [form, setForm] = useState({
    schoolId: '',
    academicTermId: '',
    title: 'School Performance and Curriculum Report',
    startDate: prior,
    endDate: today,
    curriculumStartTerm: 1,
    curriculumStartWeek: 1,
    curriculumEndTerm: 1,
    curriculumEndWeek: 12,
  });
  const [editor, setEditor] = useState<EditorState>({
    executiveSummary: '',
    achievements: '',
    concerns: '',
    recommendations: '',
    nextPeriodFocus: '',
  });
  const canManage = role === 'admin' || role === 'teacher';

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/school-performance-reports', { cache: 'no-store' });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || 'Unable to load reports.');
      const loadedTerms: AcademicTerm[] = json.terms || [];
      const defaultTerm = loadedTerms.find((term) => term.is_current) || loadedTerms[0];
      setReports(json.data || []);
      setSchools(json.schools || []);
      setTerms(loadedTerms);
      setRole(json.role || '');
      setForm((current) => ({
        ...current,
        schoolId: current.schoolId || json.schools?.[0]?.id || '',
        academicTermId: current.academicTermId || defaultTerm?.id || '',
        curriculumStartTerm: current.academicTermId
          ? current.curriculumStartTerm
          : defaultTerm?.term_number || 1,
        curriculumEndTerm: current.academicTermId
          ? current.curriculumEndTerm
          : defaultTerm?.term_number || 1,
        startDate: current.academicTermId
          ? current.startDate
          : defaultTerm?.start_date || current.startDate,
        endDate: current.academicTermId ? current.endDate : defaultTerm?.end_date || current.endDate,
      }));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Unable to load reports.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function openReport(id: string) {
    setWorking(id);
    setError('');
    try {
      const response = await fetch(`/api/school-performance-reports/${id}`, { cache: 'no-store' });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || 'Unable to open report.');
      const report = json.data as SchoolPerformanceReportRow;
      setSelected(report);
      const n = report.narrative;
      setEditor({
        executiveSummary: n.executiveSummary,
        achievements: lines(n.achievements),
        concerns: lines(n.concerns),
        recommendations: lines(n.recommendations),
        nextPeriodFocus: lines(n.nextPeriodFocus),
      });
    } catch (openError) {
      setError(openError instanceof Error ? openError.message : 'Unable to open report.');
    } finally {
      setWorking('');
    }
  }

  async function generate() {
    setWorking('generate');
    setError('');
    try {
      const response = await fetch('/api/school-performance-reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || 'Unable to create report.');
      await load();
      await openReport(json.id);
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : 'Unable to create report.');
    } finally {
      setWorking('');
    }
  }

  async function save(status?: 'draft' | 'published' | 'archived') {
    if (!selected) return;
    setWorking(status || 'save');
    setError('');
    const narrative: SchoolReportNarrative = {
      executiveSummary: editor.executiveSummary,
      achievements: parseLines(editor.achievements),
      concerns: parseLines(editor.concerns),
      recommendations: parseLines(editor.recommendations),
      nextPeriodFocus: parseLines(editor.nextPeriodFocus),
    };
    try {
      const response = await fetch(`/api/school-performance-reports/${selected.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ narrative, ...(status ? { status } : {}) }),
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || 'Unable to save report.');
      await load();
      await openReport(selected.id);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Unable to save report.');
    } finally {
      setWorking('');
    }
  }

  async function regenerate(refreshNarrative = false) {
    if (!selected) return;
    setWorking(refreshNarrative ? 'regenerate-ai' : 'regenerate');
    setError('');
    try {
      const response = await fetch(`/api/school-performance-reports/${selected.id}/regenerate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshNarrative }),
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || 'Unable to refresh report data.');
      await load();
      await openReport(selected.id);
    } catch (regenError) {
      setError(regenError instanceof Error ? regenError.message : 'Unable to refresh report data.');
    } finally {
      setWorking('');
    }
  }

  const sortedReports = useMemo(
    () => [...reports].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()),
    [reports],
  );

  function chooseTerm(id: string) {
    const term = terms.find((item) => item.id === id);
    setForm((current) => ({
      ...current,
      academicTermId: id,
      ...(term
        ? {
            curriculumStartTerm: term.term_number,
            curriculumEndTerm: term.term_number,
            startDate: term.start_date || current.startDate,
            endDate: term.end_date || current.endDate,
          }
        : {}),
    }));
  }

  return (
    <div className={`${selected ? 'max-w-[1600px]' : 'max-w-7xl'} mx-auto space-y-7 p-4 md:p-8`}>
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.25em] text-primary">Reports and analytics</p>
          <h1 className="mt-2 text-3xl font-black text-foreground">School performance reports</h1>
          <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
            {selected
              ? 'AI writing studio with live preview — generate, edit and publish with speed.'
              : 'Create one professional report from Manual Result Entry, attendance rolls, class work and curriculum coverage. Staff review wording before the school sees it.'}
          </p>
        </div>
        {selected ? (
          <button onClick={() => setSelected(null)} className="rounded-xl border border-border px-4 py-2 text-sm font-black">
            Back to reports
          </button>
        ) : null}
      </header>
      {error ? (
        <p role="alert" className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-600">
          {error}
        </p>
      ) : null}

      {!selected && canManage ? (
        <section className="rounded-3xl border border-border bg-card p-5 md:p-7">
          <div className="flex items-center gap-3">
            <span className="rounded-xl bg-primary/10 p-3 text-primary">
              <SparklesIcon className="h-5 w-5" />
            </span>
            <div>
              <h2 className="text-xl font-black">Create a new report</h2>
              <p className="text-sm text-muted-foreground">
                Choose the school and term. AI drafts wording instantly; you polish in the builder canvas.
              </p>
            </div>
          </div>
          <div className="mt-6 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <label className="space-y-1 lg:col-span-2">
              <span className="text-xs font-black uppercase text-muted-foreground">School</span>
              <select
                value={form.schoolId}
                onChange={(e) => setForm({ ...form, schoolId: e.target.value })}
                className="w-full rounded-xl border border-border bg-background p-3"
              >
                <option value="">Choose school</option>
                {schools.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1 lg:col-span-2">
              <span className="text-xs font-black uppercase text-muted-foreground">Academic term and year</span>
              <select
                value={form.academicTermId}
                onChange={(e) => chooseTerm(e.target.value)}
                className="w-full rounded-xl border border-border bg-background p-3"
              >
                <option value="">Choose term and year</option>
                {terms.map((term) => (
                  <option key={term.id} value={term.id}>
                    {term.term_label} - {term.academic_year}
                    {term.is_current ? ' (current)' : ''}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1 lg:col-span-2">
              <span className="text-xs font-black uppercase text-muted-foreground">Report title</span>
              <input
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                className="w-full rounded-xl border border-border bg-background p-3"
              />
            </label>
            <label className="space-y-1">
              <span className="text-xs font-black uppercase text-muted-foreground">From date</span>
              <input
                type="date"
                value={form.startDate}
                onChange={(e) => setForm({ ...form, startDate: e.target.value })}
                className="w-full rounded-xl border border-border bg-background p-3"
              />
            </label>
            <label className="space-y-1">
              <span className="text-xs font-black uppercase text-muted-foreground">To date</span>
              <input
                type="date"
                value={form.endDate}
                onChange={(e) => setForm({ ...form, endDate: e.target.value })}
                className="w-full rounded-xl border border-border bg-background p-3"
              />
            </label>
            <label className="space-y-1">
              <span className="text-xs font-black uppercase text-muted-foreground">Curriculum starts</span>
              <div className="flex gap-2">
                <input
                  type="number"
                  min="1"
                  value={form.curriculumStartTerm}
                  onChange={(e) => setForm({ ...form, curriculumStartTerm: Number(e.target.value) })}
                  className="w-1/2 rounded-xl border border-border bg-background p-3"
                />
                <input
                  type="number"
                  min="1"
                  value={form.curriculumStartWeek}
                  onChange={(e) => setForm({ ...form, curriculumStartWeek: Number(e.target.value) })}
                  className="w-1/2 rounded-xl border border-border bg-background p-3"
                />
              </div>
            </label>
            <label className="space-y-1">
              <span className="text-xs font-black uppercase text-muted-foreground">Curriculum ends</span>
              <div className="flex gap-2">
                <input
                  type="number"
                  min="1"
                  value={form.curriculumEndTerm}
                  onChange={(e) => setForm({ ...form, curriculumEndTerm: Number(e.target.value) })}
                  className="w-1/2 rounded-xl border border-border bg-background p-3"
                />
                <input
                  type="number"
                  min="1"
                  value={form.curriculumEndWeek}
                  onChange={(e) => setForm({ ...form, curriculumEndWeek: Number(e.target.value) })}
                  className="w-1/2 rounded-xl border border-border bg-background p-3"
                />
              </div>
            </label>
          </div>
          <button
            onClick={() => void generate()}
            disabled={working === 'generate' || !form.schoolId || !form.academicTermId}
            className="mt-6 inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-3 text-sm font-black text-white disabled:opacity-50"
          >
            <SparklesIcon className="h-4 w-4" />
            {working === 'generate' ? 'Gathering data and writing draft...' : 'Generate report draft'}
          </button>
        </section>
      ) : null}

      {!selected ? (
        <section>
          <div className="mb-3">
            <h2 className="text-xl font-black">
              {role === 'school' ? 'Published reports from Rillcod' : 'Saved reports'}
            </h2>
            <p className="text-sm text-muted-foreground">
              {role === 'school'
                ? 'Only reports approved and published for your school appear here.'
                : 'Drafts remain private until a staff member publishes them.'}
            </p>
          </div>
          {loading ? (
            <p className="rounded-2xl border border-border p-8 text-center text-muted-foreground">Loading reports...</p>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {sortedReports.map((report) => (
                <button
                  key={report.id}
                  onClick={() => void openReport(report.id)}
                  className="rounded-2xl border border-border bg-card p-5 text-left transition hover:border-primary/50"
                >
                  <div className="flex items-start justify-between gap-3">
                    <span
                      className={`rounded-full px-3 py-1 text-[11px] font-black uppercase ${
                        report.status === 'published'
                          ? 'bg-emerald-500/10 text-emerald-600'
                          : 'bg-amber-500/10 text-amber-600'
                      }`}
                    >
                      {report.status}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {working === report.id ? 'Opening...' : new Date(report.created_at).toLocaleDateString()}
                    </span>
                  </div>
                  <h3 className="mt-4 text-lg font-black">{report.title}</h3>
                  <p className="mt-1 text-sm font-bold text-primary">{report.school_name}</p>
                  <p className="mt-3 text-xs text-muted-foreground">
                    {new Date(report.period_start).toLocaleDateString()} -{' '}
                    {new Date(report.period_end).toLocaleDateString()}
                  </p>
                  <p className="mt-3 text-xs text-muted-foreground">Prepared by {report.creator_name}</p>
                </button>
              ))}
              {!sortedReports.length ? (
                <p className="col-span-full rounded-2xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
                  No reports are available yet.
                </p>
              ) : null}
            </div>
          )}
        </section>
      ) : null}

      {selected ? (
        <ReportWorkspace
          report={selected}
          canManage={canManage}
          editor={editor}
          setEditor={setEditor}
          working={working}
          onSave={save}
          onRegenerate={regenerate}
        />
      ) : null}
    </div>
  );
}

function ReportWorkspace({
  report,
  canManage,
  editor,
  setEditor,
  working,
  onSave,
  onRegenerate,
}: {
  report: SchoolPerformanceReportRow;
  canManage: boolean;
  editor: EditorState;
  setEditor: (value: EditorState | ((prev: EditorState) => EditorState)) => void;
  working: string;
  onSave: (status?: 'draft' | 'published' | 'archived') => Promise<void>;
  onRegenerate: (refreshNarrative?: boolean) => Promise<void>;
}) {
  const [showCharts, setShowCharts] = useState(false);
  const s = report.snapshot;
  const learners = Array.isArray(s.learners) ? s.learners : [];
  const needsSupport = learners.filter(
    (row) => row.status === 'Needs support' || row.status === 'Attendance risk',
  ).length;

  return (
    <div className="space-y-6">
      <div className="overflow-hidden rounded-3xl border border-border bg-card shadow-sm">
        <SchoolReportBuilderCanvas
          report={report}
          canManage={canManage}
          editor={editor}
          setEditor={setEditor}
          working={working}
          onSave={onSave}
          onRegenerate={onRegenerate}
        />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => setShowCharts((v) => !v)}
          className="rounded-xl border border-border px-4 py-2 text-sm font-black"
        >
          {showCharts ? 'Hide analytics canvas' : 'Open analytics canvas'}
        </button>
        <a
          href={`/api/school-performance-reports/${report.id}/pdf`}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-2 rounded-xl border border-border px-4 py-2 text-sm font-black"
        >
          <DocumentArrowDownIcon className="h-4 w-4" />
          Open PDF book
        </a>
      </div>

      {showCharts ? (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
            <Kpi label="Active learners" value={s.summary.activeStudents} note={`${s.summary.studentsWithScores} with scores`} color="#2563eb" />
            <Kpi label="Assigned staff" value={s.summary.activeStaff} note={`${s.summary.activeTeachers} teachers at this school only`} color="#0f766e" />
            <Kpi label="Average score" value={pct(s.summary.averageScore)} note={`${s.summary.submissionsReceived} submissions`} color="#059669" />
            <Kpi label="Attendance" value={pct(s.summary.attendanceRate)} note="Manual roll preferred" color="#0f766e" />
            <Kpi label="Curriculum coverage" value={pct(s.summary.curriculumCoverage)} note={`${s.curriculum.completedWeeks}/${s.curriculum.plannedWeeks} weeks`} color="#7a0606" />
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <section className="rounded-2xl border border-border bg-card p-5">
              <h3 className="font-black">Score distribution</h3>
              <DonutChart
                data={s.scoreBands.map((b) => ({ label: b.label, value: b.count, color: b.color }))}
                centerLabel="Average"
                centerValue={pct(s.summary.averageScore)}
                height={250}
              />
            </section>
            <section className="rounded-2xl border border-border bg-card p-5">
              <h3 className="font-black">Attendance distribution</h3>
              <DonutChart
                data={s.attendanceBands.map((b) => ({ label: b.label, value: b.count, color: b.color }))}
                centerLabel="Attendance"
                centerValue={pct(s.summary.attendanceRate)}
                height={250}
              />
            </section>
          </div>
          {s.classPerformance.length ? (
            <section className="rounded-2xl border border-border bg-card p-5">
              <h3 className="font-black">Class performance</h3>
              <div className="mt-5 h-[280px]">
                <VerticalBarChart
                  data={s.classPerformance.slice(0, 12).map((row) => ({
                    name: row.className.length > 14 ? `${row.className.slice(0, 13)}…` : row.className,
                    score: row.averageScore,
                  }))}
                  xKey="name"
                  bars={[{ key: 'score', label: 'Avg score', color: '#7a0606' }]}
                  height={280}
                  formatValue={(value) => `${value}%`}
                />
              </div>
              <div className="mt-5 overflow-x-auto">
                <table className="w-full min-w-[720px] text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-xs uppercase text-muted-foreground">
                      <th className="p-3">Class</th>
                      <th className="p-3">Teacher</th>
                      <th className="p-3">Learners</th>
                      <th className="p-3">Avg</th>
                      <th className="p-3">Attendance</th>
                    </tr>
                  </thead>
                  <tbody>
                    {s.classPerformance.map((row, index) => (
                      <tr key={`${row.classId || row.className}-${index}`} className="border-b border-border/60">
                        <td className="p-3 font-bold">{row.className}</td>
                        <td className="p-3 text-muted-foreground">{row.teacherName || '—'}</td>
                        <td className="p-3">{row.students}</td>
                        <td className="p-3 font-black text-primary">{pct(row.averageScore)}</td>
                        <td className="p-3">{pct(row.attendanceRate)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ) : null}
          <section className="rounded-2xl border border-border bg-card p-5">
            <h3 className="font-black">Learner roster</h3>
            <p className="mt-1 text-xs text-muted-foreground">
              {learners.length
                ? `${learners.length} active learners · ${needsSupport} flagged.`
                : 'Refresh snapshot to attach the roster.'}
            </p>
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[820px] text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs uppercase text-muted-foreground">
                    <th className="p-3">Learner</th>
                    <th className="p-3">Class</th>
                    <th className="p-3">Score</th>
                    <th className="p-3">Attendance</th>
                    <th className="p-3">Status</th>
                    <th className="p-3">Next step</th>
                  </tr>
                </thead>
                <tbody>
                  {learners.map((row) => (
                    <tr key={row.id} className="border-b border-border/60">
                      <td className="p-3 font-bold">{row.name}</td>
                      <td className="p-3">{row.className}</td>
                      <td className="p-3">{row.averageScore == null ? '—' : pct(row.averageScore)}</td>
                      <td className="p-3">{row.attendanceRate == null ? '—' : pct(row.attendanceRate)}</td>
                      <td
                        className={`p-3 font-bold ${
                          row.status === 'Needs support' || row.status === 'Attendance risk'
                            ? 'text-rose-600'
                            : row.status === 'Excellent'
                              ? 'text-emerald-600'
                              : ''
                        }`}
                      >
                        {row.status}
                      </td>
                      <td className="p-3 text-xs text-muted-foreground">{row.nextStep || '—'}</td>
                    </tr>
                  ))}
                  {!learners.length ? (
                    <tr>
                      <td colSpan={6} className="p-6 text-center text-sm text-muted-foreground">
                        No learners in this snapshot.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </section>
          <section className="rounded-2xl border border-border bg-card p-5">
            <h3 className="font-black">School invoice for this term</h3>
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              <Kpi label="Invoiced" value={money(s.finance.totalInvoiced, s.finance.currency)} note={`${s.finance.invoiceCount} matching`} color="#2563eb" />
              <Kpi label="Paid" value={money(s.finance.totalPaid, s.finance.currency)} note="Recorded payments" color="#059669" />
              <Kpi label="Outstanding" value={money(s.finance.totalOutstanding, s.finance.currency)} note="Balance still due" color="#b42318" />
            </div>
            <div className="mt-5 overflow-x-auto">
              <table className="w-full min-w-[680px] text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs uppercase text-muted-foreground">
                    <th className="p-3">Invoice</th>
                    <th className="p-3">Status</th>
                    <th className="p-3">Amount</th>
                    <th className="p-3">Paid</th>
                    <th className="p-3">Balance</th>
                    <th className="p-3">Document</th>
                  </tr>
                </thead>
                <tbody>
                  {s.finance.invoices.map((invoice) => (
                    <tr key={invoice.id} className="border-b border-border/60">
                      <td className="p-3 font-bold">{invoice.invoiceNumber}</td>
                      <td className="p-3">{plainStatus(invoice.status)}</td>
                      <td className="p-3">{money(invoice.amount, s.finance.currency)}</td>
                      <td className="p-3">{money(invoice.paid, s.finance.currency)}</td>
                      <td className="p-3">{money(invoice.outstanding, s.finance.currency)}</td>
                      <td className="p-3">
                        <a className="font-black text-primary underline" href={`/api/invoices/${invoice.id}/pdf`} target="_blank">
                          Open invoice
                        </a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!s.finance.invoices.length ? (
                <p className="p-6 text-center text-sm text-muted-foreground">No invoice matched this academic term and year.</p>
              ) : null}
            </div>
          </section>
          {s.programmeCoursePerformance.length ? (
            <section className="rounded-2xl border border-border bg-card p-5">
              <h3 className="font-black">Programme and course results</h3>
              <div className="mt-5">
                <HorizontalBarChart
                  data={s.programmeCoursePerformance.slice(0, 15).map((row) => ({
                    label: `${row.programme} - ${row.course}`,
                    value: row.averageScore,
                    color: row.averageScore >= 75 ? '#059669' : row.averageScore >= 50 ? '#d97706' : '#e11d48',
                  }))}
                  formatValue={(value) => `${value}%`}
                />
              </div>
            </section>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
