'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import {
  AcademicCapIcon,
  ArrowPathIcon,
  CheckCircleIcon,
  DocumentChartBarIcon,
  ExclamationTriangleIcon,
  ShieldCheckIcon,
} from '@/lib/icons';

type QuickStudent = {
  id: string;
  full_name: string;
  school_name?: string | null;
  class_name?: string | null;
};

type QuickReport = {
  id: string;
  label?: string;
  report_period?: string | null;
  report_term?: string | null;
  course_name?: string | null;
  overall_score?: number | null;
  overall_grade?: string | null;
  published_at?: string | null;
  report_date?: string | null;
};

type QuickCheckResponse = {
  accessRequired?: boolean;
  consentRequired?: boolean;
  oneTime?: boolean;
  error?: string;
  message?: string;
  student?: QuickStudent;
  reports?: QuickReport[];
  terms?: QuickReport[];
  formUrl?: string | null;
  form?: { title?: string | null } | null;
};

function gradeClass(score?: number | null) {
  if (score == null) return 'text-muted-foreground';
  if (score >= 70) return 'text-emerald-400';
  if (score >= 55) return 'text-amber-400';
  return 'text-rose-400';
}

export default function ResultQuickCheckPage() {
  const params = useParams<{ code: string }>();
  const code = decodeURIComponent(params?.code || '').trim();
  const displayCode = code.toUpperCase();
  const [data, setData] = useState<QuickCheckResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!code) {
      setData({ error: 'Missing result check code.' });
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    fetch(`/api/public/student/${encodeURIComponent(code)}/reports?accessCode=${encodeURIComponent(code)}`, {
      cache: 'no-store',
    })
      .then(async (res) => {
        const json = await res.json().catch(() => ({}));
        if (!res.ok && !json?.consentRequired) {
          throw new Error(json?.error || 'Result check failed.');
        }
        return json;
      })
      .then((json) => {
        if (!cancelled) setData(json);
      })
      .catch((err) => {
        if (!cancelled) setData({ error: err.message || 'Result check failed.' });
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [code]);

  const reports = useMemo(() => data?.reports ?? [], [data?.reports]);
  const latest = reports[0] ?? null;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="max-w-4xl mx-auto px-4 py-10 sm:py-14 space-y-8">
        <header className="flex items-center justify-between gap-4">
          <Link href="/" className="flex items-center gap-3">
            <img src="/images/logo.png" alt="Rillcod" className="w-9 h-9 object-contain" />
            <div>
              <p className="text-sm font-black tracking-tight">Rillcod Academy</p>
              <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Result Quick Check</p>
            </div>
          </Link>
          <div className="hidden sm:flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-emerald-400">
            <ShieldCheckIcon className="w-4 h-4" />
            Secure check
          </div>
        </header>

        {loading && (
          <div className="rounded-[2rem] border border-border bg-card p-10 text-center space-y-4">
            <ArrowPathIcon className="w-10 h-10 text-primary animate-spin mx-auto" />
            <p className="text-xs font-black uppercase tracking-widest text-muted-foreground">Checking result code...</p>
          </div>
        )}

        {!loading && data?.error && !data.student && (
          <div className="rounded-[2rem] border border-rose-500/30 bg-rose-500/10 p-10 text-center space-y-4">
            <ExclamationTriangleIcon className="w-12 h-12 text-rose-400 mx-auto" />
            <h1 className="text-2xl font-black">Result Code Not Found</h1>
            <p className="text-sm text-muted-foreground">{data.error}</p>
          </div>
        )}

        {!loading && data?.student && (
          <section className="rounded-[2rem] border border-border bg-card p-6 sm:p-8 space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div className="flex items-start gap-4">
                <div className="w-14 h-14 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center">
                  <AcademicCapIcon className="w-7 h-7 text-primary" />
                </div>
                <div>
                  <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Student</p>
                  <h1 className="text-2xl sm:text-3xl font-black tracking-tight">{data.student.full_name}</h1>
                  <p className="text-sm text-muted-foreground mt-1">
                    {[data.student.school_name, data.student.class_name].filter(Boolean).join(' · ') || 'Rillcod learner'}
                  </p>
                </div>
              </div>
              <div className="px-3 py-2 rounded-xl bg-muted text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                Code: {displayCode}
              </div>
            </div>

            {data.consentRequired ? (
              <div className="rounded-[1.5rem] border border-amber-500/30 bg-amber-500/10 p-6 space-y-4">
                <div className="flex items-start gap-3">
                  <ExclamationTriangleIcon className="w-6 h-6 text-amber-400 flex-shrink-0" />
                  <div>
                    <h2 className="text-lg font-black text-foreground">One-Time Parent Consent Required</h2>
                    <p className="text-sm text-muted-foreground mt-1 leading-relaxed">
                      To release this result, the parent/guardian needs to complete the school consent and assessment form once.
                      If it has already been completed and matched, future scans will open results instantly.
                    </p>
                  </div>
                </div>
                {data.formUrl && (
                  <a
                    href={data.formUrl}
                    className="inline-flex w-full sm:w-auto justify-center items-center gap-2 px-6 py-3 bg-primary text-primary-foreground rounded-2xl text-xs font-black uppercase tracking-widest hover:bg-primary/90 transition-colors"
                  >
                    Complete One-Time Form
                  </a>
                )}
              </div>
            ) : (
              <div className="space-y-5">
                <div className="rounded-[1.5rem] border border-emerald-500/20 bg-emerald-500/10 p-5 flex items-start gap-3">
                  <CheckCircleIcon className="w-6 h-6 text-emerald-400 flex-shrink-0" />
                  <div>
                    <p className="text-sm font-black text-foreground">Access verified</p>
                    <p className="text-xs text-muted-foreground mt-1">Consent is complete or not required for this school.</p>
                  </div>
                </div>

                {reports.length === 0 ? (
                  <div className="rounded-[1.5rem] border border-border bg-background p-8 text-center">
                    <DocumentChartBarIcon className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
                    <p className="text-sm font-black uppercase tracking-widest">No Published Result Yet</p>
                    <p className="text-xs text-muted-foreground mt-2">The result will appear here once the school publishes it.</p>
                  </div>
                ) : (
                  <>
                    {latest && (
                      <div className="rounded-[1.5rem] border border-border bg-background p-6">
                        <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Latest Result</p>
                        <div className="flex items-end justify-between gap-4 mt-3">
                          <div>
                            <h2 className="text-xl font-black">{latest.course_name || latest.label || 'Progress Report'}</h2>
                            <p className="text-xs text-muted-foreground mt-1">
                              {[latest.report_period, latest.report_term].filter(Boolean).join(' · ') || 'Published result'}
                            </p>
                          </div>
                          <div className="text-right">
                            <p className={`text-4xl font-black ${gradeClass(latest.overall_score)}`}>
                              {latest.overall_score ?? '--'}{latest.overall_score != null ? '%' : ''}
                            </p>
                            <p className="text-xs font-black uppercase tracking-widest text-muted-foreground">{latest.overall_grade || 'Grade'}</p>
                          </div>
                        </div>
                      </div>
                    )}

                    <div className="grid sm:grid-cols-2 gap-3">
                      {reports.map((report) => (
                        <div key={report.id} className="rounded-2xl border border-border bg-background p-4">
                          <p className="text-sm font-black">{report.course_name || report.label || 'Progress Report'}</p>
                          <p className="text-[10px] uppercase tracking-widest text-muted-foreground mt-1">
                            {[report.report_period, report.report_term].filter(Boolean).join(' · ') || 'Published'}
                          </p>
                          <p className={`text-2xl font-black mt-3 ${gradeClass(report.overall_score)}`}>
                            {report.overall_score ?? '--'}{report.overall_score != null ? '%' : ''}
                          </p>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}
          </section>
        )}
      </div>
    </div>
  );
}
