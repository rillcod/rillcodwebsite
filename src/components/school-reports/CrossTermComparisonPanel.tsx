'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { pct } from '@/lib/school-reports/ui/constants';

type TermMetrics = {
  reportId: string;
  title: string;
  termLabel: string;
  academicYear: string;
  periodEnd: string;
  status: string;
  activeStudents: number;
  studentsWithScores: number;
  averageScore: number;
  attendanceRate: number;
  curriculumCoverage: number;
  programmeCount: number;
};

function delta(current: number, previous: number, suffix = '') {
  const diff = Math.round((current - previous) * 10) / 10;
  if (!Number.isFinite(diff) || diff === 0) return '—';
  const sign = diff > 0 ? '+' : '';
  return `${sign}${diff}${suffix}`;
}

export function CrossTermComparisonPanel({ reportId }: { reportId: string }) {
  const [current, setCurrent] = useState<TermMetrics | null>(null);
  const [previous, setPrevious] = useState<TermMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      setError('');
      try {
        const response = await fetch(`/api/school-performance-reports/${reportId}/cross-term`, { cache: 'no-store' });
        const json = await response.json();
        if (!response.ok) throw new Error(json.error || 'Unable to load cross-term comparison.');
        if (!cancelled) {
          setCurrent(json.data?.current ?? null);
          setPrevious(json.data?.previous ?? null);
        }
      } catch (loadError) {
        if (!cancelled) setError(loadError instanceof Error ? loadError.message : 'Unable to load comparison.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [reportId]);

  if (loading) {
    return (
      <section className="rounded-2xl border border-border bg-card p-5">
        <p className="text-sm text-muted-foreground">Loading prior term comparison…</p>
      </section>
    );
  }

  if (error) {
    return (
      <section className="rounded-2xl border border-rose-500/30 bg-rose-500/10 p-5">
        <p className="text-sm text-rose-700">{error}</p>
      </section>
    );
  }

  if (!current) return null;

  return (
    <section className="rounded-2xl border border-border bg-card p-5">
      <h3 className="font-black">Cross-term comparison</h3>
      <p className="mt-1 text-xs text-muted-foreground">
        {previous
          ? `Compared with ${previous.termLabel} ${previous.academicYear} (${new Date(previous.periodEnd).toLocaleDateString()}).`
          : 'No earlier term book found for this school yet — publish or save another term to unlock trends.'}
      </p>
      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs uppercase text-muted-foreground">
              <th className="p-3">Metric</th>
              <th className="p-3">This term</th>
              <th className="p-3">Prior term</th>
              <th className="p-3">Change</th>
            </tr>
          </thead>
          <tbody>
            {[
              ['Active learners', current.activeStudents, previous?.activeStudents ?? null, ''],
              ['Learners with scores', current.studentsWithScores, previous?.studentsWithScores ?? null, ''],
              ['Average score', current.averageScore, previous?.averageScore ?? null, '%'],
              ['Attendance', current.attendanceRate, previous?.attendanceRate ?? null, '%'],
              ['Curriculum coverage', current.curriculumCoverage, previous?.curriculumCoverage ?? null, '%'],
              ['Programme rows', current.programmeCount, previous?.programmeCount ?? null, ''],
            ].map(([label, now, before, suffix]) => (
              <tr key={String(label)} className="border-b border-border/60">
                <td className="p-3 font-bold">{label}</td>
                <td className="p-3">
                  {String(label).includes('score') || String(label).includes('Attendance') || String(label).includes('coverage')
                    ? pct(Number(now))
                    : now}
                </td>
                <td className="p-3 text-muted-foreground">
                  {before == null
                    ? '—'
                    : String(label).includes('score') || String(label).includes('Attendance') || String(label).includes('coverage')
                      ? pct(Number(before))
                      : before}
                </td>
                <td className="p-3 font-black text-primary">
                  {before == null ? '—' : delta(Number(now), Number(before), String(suffix))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {previous ? (
        <Link
          href={`/dashboard/school-reports/${previous.reportId}/analytics`}
          className="mt-4 inline-block text-xs font-black text-primary underline"
        >
          Open prior term analytics
        </Link>
      ) : null}
    </section>
  );
}
