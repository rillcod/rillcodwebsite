'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { humanAcademicStatus } from '@/lib/academic-spine/quality';

type SpineData = {
  classes: { id: string; name: string }[];
  totals: Record<string, number>;
  attention: ReportRow[];
  recent_reports: ReportRow[];
  pathway: string[];
  message?: string;
};

type ReportRow = {
  id: string;
  student_name: string | null;
  section_class: string | null;
  course_name: string | null;
  report_term: string | null;
  report_period: string | null;
  academic_qa_status: string;
  academic_qa_issues: { code?: string; message?: string }[] | null;
  curriculum_coverage: number | null;
  teaching_delivery_pct: number | null;
  is_published: boolean;
};

function ratio(done = 0, total = 0) {
  return total > 0 ? Math.round((done / total) * 100) : 0;
}

export default function AcademicSpinePage() {
  const [data, setData] = useState<SpineData | null>(null);
  const [classId, setClassId] = useState('');
  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState<string | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const query = classId ? `?class_id=${encodeURIComponent(classId)}` : '';
      const response = await fetch(`/api/academic-spine${query}`, { cache: 'no-store' });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || 'Unable to open the academic view');
      setData(body.data);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to open the academic view');
    } finally {
      setLoading(false);
    }
  }, [classId]);

  useEffect(() => { load(); }, [load]);

  async function checkReport(reportId: string) {
    setChecking(reportId);
    setError('');
    try {
      const response = await fetch('/api/academic-spine', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'check_report', report_id: reportId }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || 'The evidence check could not finish');
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The evidence check could not finish');
    } finally {
      setChecking(null);
    }
  }

  const totals = data?.totals ?? {};
  const cards = [
    {
      title: 'Teaching has direction',
      value: `${totals.officially_directed_plans ?? 0} of ${totals.teaching_plans ?? 0}`,
      detail: `${ratio(totals.officially_directed_plans, totals.teaching_plans)}% of active plans use an official curriculum edition.`,
    },
    {
      title: 'Lessons are being recorded',
      value: `${totals.delivered_lessons ?? 0} delivered`,
      detail: `${totals.delivery_records ?? 0} lesson delivery records are in the spine.`,
    },
    {
      title: 'Marks can be explained',
      value: `${totals.linked_evidence ?? 0} of ${totals.evidence_records ?? 0}`,
      detail: `${ratio(totals.linked_evidence, totals.evidence_records)}% of current evidence points back to an official plan.${totals.legacy_evidence_records ? ` ${totals.legacy_evidence_records} older unscoped records are preserved separately.` : ''}`,
    },
    {
      title: 'Results are publication-ready',
      value: `${totals.ready_reports ?? 0} ready`,
      detail: `${totals.traceable_reports ?? 0} reports use the end-to-end academic trail.`,
    },
  ];

  return (
    <div className="mx-auto max-w-7xl space-y-8 p-4 sm:p-6 lg:p-8">
      <section className="rounded-3xl border border-border bg-card p-6 shadow-sm sm:p-8">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            <p className="text-sm font-semibold text-primary">Academic Spine</p>
            <h1 className="mt-2 text-3xl font-black tracking-tight text-foreground sm:text-4xl">One clear journey from what should be taught to what the learner achieved</h1>
            <p className="mt-3 text-sm leading-6 text-muted-foreground sm:text-base">
              This view brings curriculum, classroom delivery, assessment evidence, results and progression together. It highlights what needs attention without asking teachers to understand the database behind it.
            </p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Link href="/dashboard/academic-spine/weights" className="rounded-xl border border-border px-5 py-3 text-center text-sm font-bold text-foreground">Result weights</Link>
            <Link href="/dashboard/academic-spine/pathways" className="rounded-xl border border-border px-5 py-3 text-center text-sm font-bold text-foreground">Pathways</Link>
            <Link href="/dashboard/academic-spine/results" className="rounded-xl border border-border px-5 py-3 text-center text-sm font-bold text-foreground">Results</Link>
            <select value={classId} onChange={(event) => setClassId(event.target.value)} className="rounded-xl border border-border bg-background px-4 py-3 text-sm text-foreground">
              <option value="">All classes I can see</option>
              {(data?.classes ?? []).map((klass) => <option key={klass.id} value={klass.id}>{klass.name}</option>)}
            </select>
            <Link href="/dashboard/academic-direction" className="rounded-xl bg-primary px-5 py-3 text-center text-sm font-bold text-primary-foreground">Manage academic direction</Link>
          </div>
        </div>
      </section>

      {error && <div className="rounded-2xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">{error}</div>}
      {loading && <div className="rounded-2xl border border-border bg-card p-8 text-center text-muted-foreground">Following the academic trail…</div>}

      {!loading && data && (
        <>
          <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {cards.map((card) => (
              <article key={card.title} className="rounded-2xl border border-border bg-card p-5">
                <p className="text-sm font-semibold text-muted-foreground">{card.title}</p>
                <p className="mt-3 text-3xl font-black text-foreground">{card.value}</p>
                <p className="mt-2 text-sm leading-5 text-muted-foreground">{card.detail}</p>
              </article>
            ))}
          </section>

          <section className="rounded-3xl border border-border bg-card p-6">
            <h2 className="text-xl font-black text-foreground">How the academic journey now flows</h2>
            <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
              {data.pathway.map((step, index) => (
                <div key={step} className="relative rounded-2xl border border-border bg-background p-4">
                  <span className="text-xs font-black text-primary">{String(index + 1).padStart(2, '0')}</span>
                  <p className="mt-2 text-sm font-bold text-foreground">{step}</p>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-3xl border border-border bg-card p-6">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h2 className="text-xl font-black text-foreground">Reports needing human attention</h2>
                <p className="mt-1 text-sm text-muted-foreground">Nothing here means a teacher has failed. It means the evidence trail needs one clear correction before publication.</p>
              </div>
              <span className="rounded-full bg-amber-500/10 px-3 py-1 text-sm font-bold text-amber-700 dark:text-amber-300">{data.attention.length} to review</span>
            </div>

            <div className="mt-5 space-y-3">
              {data.attention.length === 0 && <div className="rounded-2xl bg-emerald-500/10 p-5 text-sm font-semibold text-emerald-700 dark:text-emerald-300">No traceable reports need attention in this view.</div>}
              {data.attention.map((report) => (
                <article key={report.id} className="flex flex-col gap-4 rounded-2xl border border-border p-5 lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-black text-foreground">{report.student_name || 'Learner'}</p>
                      <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-bold text-muted-foreground">{humanAcademicStatus(report.academic_qa_status)}</span>
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">{report.course_name || 'Course'} · {report.report_term} {report.report_period}</p>
                    <p className="mt-2 text-sm text-foreground">{report.academic_qa_issues?.[0]?.message || 'Run the evidence check to see what needs attention.'}</p>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => checkReport(report.id)} disabled={checking === report.id} className="rounded-xl border border-border px-4 py-2.5 text-sm font-bold text-foreground disabled:opacity-50">
                      {checking === report.id ? 'Checking…' : 'Check evidence again'}
                    </button>
                    <Link href={`/dashboard/reports/builder?report=${report.id}`} className="rounded-xl bg-foreground px-4 py-2.5 text-sm font-bold text-background">Open report</Link>
                  </div>
                </article>
              ))}
            </div>
          </section>
        </>
      )}
    </div>
  );
}
