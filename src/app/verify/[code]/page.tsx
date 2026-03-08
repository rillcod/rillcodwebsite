'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import {
  ShieldCheckIcon, XCircleIcon, ClockIcon, CheckBadgeIcon,
} from '@heroicons/react/24/outline';

type Report = {
  id: string;
  student_name: string | null;
  course_name: string | null;
  report_term: string | null;
  report_date: string | null;
  overall_grade: string | null;
  overall_score: number | null;
  instructor_name: string | null;
  school_name: string | null;
  section_class: string | null;
  school_section: string | null;
  is_published: boolean | null;
  has_certificate: boolean | null;
  proficiency_level: string | null;
  theory_score: number | null;
  practical_score: number | null;
  attendance_score: number | null;
};

const GRADE_STYLE: Record<string, { bg: string; text: string; border: string; label: string }> = {
  A: { bg: '#d1fae5', text: '#065f46', border: '#6ee7b7', label: 'Excellent' },
  B: { bg: '#dbeafe', text: '#1e3a8a', border: '#93c5fd', label: 'Very Good' },
  C: { bg: '#fef3c7', text: '#78350f', border: '#fcd34d', label: 'Good' },
  D: { bg: '#ffedd5', text: '#9a3412', border: '#fdba74', label: 'Pass' },
  E: { bg: '#fee2e2', text: '#991b1b', border: '#fca5a5', label: 'Fail' },
};

export default function VerifyPage() {
  const { code } = useParams<{ code: string }>();
  const [report, setReport] = useState<Report | null>(null);
  const [status, setStatus] = useState<'loading' | 'found' | 'notfound' | 'unpublished'>('loading');

  useEffect(() => {
    if (!code) { setStatus('notfound'); return; }
    const db = createClient();
    db.from('student_progress_reports')
      .select('id,student_name,course_name,report_term,report_date,overall_grade,overall_score,instructor_name,school_name,section_class,is_published,has_certificate,proficiency_level,theory_score,practical_score,attendance_score')
      .ilike('id', `${code.toLowerCase()}%`)
      .limit(1)
      .maybeSingle()
      .then(({ data }) => {
        if (!data) { setStatus('notfound'); return; }
        if (!data.is_published) { setStatus('unpublished'); return; }
        setReport(data as Report);
        setStatus('found');
      });
  }, [code]);

  const theory     = Number(report?.theory_score)     || 0;
  const practical  = Number(report?.practical_score)  || 0;
  const attendance = Number(report?.attendance_score) || 0;
  const computed   = Math.round(theory * 0.4 + practical * 0.4 + attendance * 0.2);
  const overallNum = Number(report?.overall_score) > 0 ? Number(report?.overall_score) : computed;
  const showCert   = overallNum >= 45;

  const g = report?.overall_grade ?? '';
  const gs = GRADE_STYLE[g] ?? GRADE_STYLE['C'];
  const dateStr = report?.report_date
    ? new Date(report.report_date).toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' })
    : '—';

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white flex flex-col">

      {/* Top bar */}
      <header className="sticky top-0 z-10 border-b border-white/10 bg-[#0a0a0f]/90 backdrop-blur-md">
        <div className="max-w-4xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-3 group">
            <img src="/images/logo.png" alt="Rillcod" className="w-8 h-8 object-contain"
              onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
            <span className="font-extrabold text-white text-base tracking-tight group-hover:text-violet-300 transition-colors">
              Rillcod Academy
            </span>
          </Link>
          <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-white/30">
            <ShieldCheckIcon className="w-3.5 h-3.5" />
            Certificate Verification
          </div>
        </div>
      </header>

      <main className="flex-1 flex items-center justify-center px-4 py-16">
        <div className="w-full max-w-2xl">

          {/* Loading */}
          {status === 'loading' && (
            <div className="text-center space-y-5">
              <div className="relative w-16 h-16 mx-auto">
                <div className="absolute inset-0 rounded-full border-[3px] border-violet-500/20" />
                <div className="absolute inset-0 rounded-full border-[3px] border-transparent border-t-violet-500 animate-spin" />
                <div className="absolute inset-[10px] rounded-full border-[2px] border-transparent border-t-indigo-400 animate-spin" style={{ animationDirection: 'reverse', animationDuration: '0.6s' }} />
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="w-2 h-2 rounded-full bg-violet-400 animate-pulse" />
                </div>
              </div>
              <p className="text-white/40 text-sm font-medium tracking-wide">Verifying report…</p>
            </div>
          )}

          {/* Not found */}
          {status === 'notfound' && (
            <div className="text-center space-y-6">
              <div className="w-20 h-20 bg-rose-500/10 border border-rose-500/20 rounded-3xl flex items-center justify-center mx-auto">
                <XCircleIcon className="w-10 h-10 text-rose-400" />
              </div>
              <div>
                <h1 className="text-2xl font-extrabold text-white">Record Not Found</h1>
                <p className="text-white/40 text-sm mt-2">
                  No published report matches code <code className="bg-white/10 px-2 py-0.5 rounded text-white font-mono">{code?.toUpperCase()}</code>
                </p>
                <p className="text-white/25 text-xs mt-1">Please check the QR code or verification URL and try again.</p>
              </div>
              <Link href="/" className="inline-flex items-center gap-2 px-5 py-2.5 bg-white/10 hover:bg-white/15 text-white font-bold text-sm rounded-xl transition-colors">
                Return to Home
              </Link>
            </div>
          )}

          {/* Unpublished */}
          {status === 'unpublished' && (
            <div className="text-center space-y-6">
              <div className="w-20 h-20 bg-amber-500/10 border border-amber-500/20 rounded-3xl flex items-center justify-center mx-auto">
                <ClockIcon className="w-10 h-10 text-amber-400" />
              </div>
              <div>
                <h1 className="text-2xl font-extrabold text-white">Report Not Yet Published</h1>
                <p className="text-white/40 text-sm mt-2 max-w-sm mx-auto">
                  This report exists but has not been officially released. Please contact your school or instructor.
                </p>
              </div>
            </div>
          )}

          {/* Found */}
          {status === 'found' && report && (
            <div className="space-y-5">

              {/* Verified badge */}
              <div className="flex items-center gap-3 px-5 py-4 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl">
                <ShieldCheckIcon className="w-6 h-6 text-emerald-400 flex-shrink-0" />
                <div>
                  <p className="font-black text-emerald-400 text-sm uppercase tracking-widest">Verified — Authentic Record</p>
                  <p className="text-emerald-400/60 text-xs mt-0.5">Issued by Rillcod Academy · Confirmed valid</p>
                </div>
                <div className="ml-auto flex items-center gap-1.5">
                  <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                  <p className="text-[10px] text-emerald-400 font-bold uppercase tracking-widest">Live</p>
                </div>
              </div>

              {/* Report card */}
              <div className="bg-white rounded-3xl overflow-hidden shadow-2xl shadow-black/40">

                {/* Header */}
                <div className="bg-[#1a1a2e] px-8 py-6">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-4">
                      <img src="/images/logo.png" alt="Rillcod" className="w-14 h-14 object-contain"
                        onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                      <div>
                        <h2 className="text-xl font-extrabold text-white uppercase tracking-tight leading-none">Rillcod Academy</h2>
                        <p className="text-[10px] font-bold text-violet-400/80 uppercase tracking-[0.25em] mt-0.5">Progress Report</p>
                      </div>
                    </div>
                    {/* Grade badge */}
                    <div className="flex flex-col items-center justify-center w-20 h-20 rounded-2xl border-4"
                      style={{ backgroundColor: gs.bg, borderColor: gs.border }}>
                      <span className="text-4xl font-black leading-none" style={{ color: gs.text }}>{g}</span>
                      <span className="text-[9px] font-black uppercase tracking-wide mt-0.5" style={{ color: gs.text, opacity: 0.7 }}>{gs.label}</span>
                    </div>
                  </div>
                </div>

                {/* Stats bar */}
                <div className="bg-gray-50 border-b border-gray-100 px-8 py-2.5 flex items-center gap-6 text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                  <span>ID: <span className="text-gray-900">{report.id.slice(0, 8).toUpperCase()}</span></span>
                  <span>Date: <span className="text-gray-900">{dateStr}</span></span>
                  {report.school_section && <span>Section: <span className="text-gray-900">{report.school_section}</span></span>}
                </div>

                {/* Details */}
                <div className="px-8 py-6 grid grid-cols-2 gap-x-10 gap-y-5">
                  {[
                    { label: 'Student', value: report.student_name, bold: true },
                    { label: 'Programme', value: report.course_name },
                    { label: 'School', value: report.school_name },
                    { label: 'Class / Section', value: report.section_class },
                    { label: 'Academic Term', value: report.report_term },
                    { label: 'Score', value: overallNum > 0 ? `${overallNum}%` : null },
                    { label: 'Proficiency', value: report.proficiency_level },
                    { label: 'Instructor', value: report.instructor_name },
                  ].filter(d => d.value).map(({ label, value, bold }) => (
                    <div key={label}>
                      <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-0.5">{label}</p>
                      <p className={`text-[13px] ${bold ? 'font-extrabold' : 'font-bold'} text-gray-900 capitalize`}>{value}</p>
                    </div>
                  ))}
                </div>

                {/* Score bars */}
                {(theory > 0 || practical > 0 || attendance > 0) && (
                  <div className="px-8 pb-6 space-y-3">
                    <div className="h-px bg-gray-100 mb-4" />
                    {[
                      { label: 'Theory (40%)',     value: theory,     color: '#6366f1' },
                      { label: 'Practical (40%)',  value: practical,  color: '#10b981' },
                      { label: 'Attendance (20%)', value: attendance, color: '#f59e0b' },
                    ].map(({ label, value, color }) => (
                      <div key={label} className="space-y-1">
                        <div className="flex justify-between text-[10px] font-black text-gray-400 uppercase tracking-widest">
                          <span>{label}</span>
                          <span style={{ color }}>{value}%</span>
                        </div>
                        <div className="h-1.5 w-full bg-gray-100 rounded-full overflow-hidden">
                          <div className="h-full rounded-full transition-all" style={{ width: `${value}%`, backgroundColor: color }} />
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Certificate award row */}
                {showCert && (
                  <div className="mx-6 mb-6 rounded-2xl px-5 py-4 flex items-center gap-3" style={{ background: 'linear-gradient(135deg, #fffbeb, #fef9e7)', border: '1px solid #fde68a' }}>
                    <CheckBadgeIcon className="w-5 h-5 flex-shrink-0" style={{ color: '#d97706' }} />
                    <p className="text-sm font-bold" style={{ color: '#92400e' }}>Certificate of Completion Awarded</p>
                  </div>
                )}

                {/* Signature & footer */}
                <div className="border-t border-gray-100 px-8 py-6 flex items-end justify-between">
                  <div className="space-y-1">
                    <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Signatory Authority</p>
                    <img
                      src="/images/signature.png"
                      alt="Official Signature"
                      className="h-14 w-auto object-contain"
                      style={{ mixBlendMode: 'multiply' }}
                    />
                    <div className="w-40 h-px bg-gray-900 mt-1" />
                    <p className="text-[11px] font-black text-gray-900">Mr Osahon</p>
                    <p className="text-[9px] font-bold text-gray-400 uppercase tracking-wider">Director, Rillcod Technologies</p>
                  </div>
                  <div className="text-right">
                    <div className="flex items-center gap-2 justify-end mb-1">
                      <div className="w-2 h-2 rounded-full bg-emerald-500" />
                      <p className="text-[9px] font-black text-emerald-600 uppercase tracking-widest">Verified Authentic</p>
                    </div>
                    <p className="text-[9px] text-gray-400 font-mono">rillcod.com/verify/{report.id.slice(0, 8).toUpperCase()}</p>
                  </div>
                </div>
              </div>

              {/* Disclaimer */}
              <p className="text-center text-white/20 text-xs leading-relaxed px-4">
                This page confirms the authenticity of a report issued by Rillcod Academy.
                For queries contact{' '}
                <a href="mailto:rillcod@gmail.com" className="text-white/40 hover:text-white underline underline-offset-2 transition-colors">
                  rillcod@gmail.com
                </a>
              </p>
            </div>
          )}
        </div>
      </main>

      <footer className="border-t border-white/5 px-6 py-4 text-center">
        <p className="text-[10px] text-white/20">
          © {new Date().getFullYear()} Rillcod Technologies · 26 Ogiesoba Avenue, GRA, Benin City
        </p>
      </footer>
    </div>
  );
}
