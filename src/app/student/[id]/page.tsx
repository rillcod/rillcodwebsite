'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import ReportCard from '@/components/reports/ReportCard';
import { generateReportPDF, printElement, ScaledReportCard } from '@/lib/pdf-utils';
import {
  AcademicCapIcon,
  BuildingOffice2Icon,
  CheckBadgeIcon,
  XCircleIcon,
  UserCircleIcon,
  BookOpenIcon,
  CalendarIcon,
  ShieldCheckIcon,
  DocumentTextIcon,
  PrinterIcon,
} from '@/lib/icons';
import { accessCardCodeForStudent } from '@/lib/access-card-code';

interface StudentProfile {
  id: string;
  full_name: string;
  school_name: string | null;
  is_active: boolean;
  enrollment_type: string | null;
  avatar_url: string | null;
  class_name: string | null;
  school_logo: string | null;
  enrolled_at: string | null;
}

type PublishedReport = {
  id: string;
  student_name: string | null;
  school_name: string | null;
  section_class: string | null;
  course_name: string | null;
  report_term: string | null;
  report_period: string | null;
  report_date: string | null;
  overall_score: number | null;
  overall_grade: string | null;
  is_published: boolean | null;
  updated_at: string | null;
  [key: string]: any;
};

const TYPE_LABELS: Record<string, string> = {
  school: 'Partner School',
  bootcamp: 'Summer Bootcamp',
  online: 'Online School',
  in_person: 'In-Person Centre',
};

export default function PublicStudentProfilePage() {
  const { id } = useParams<{ id: string }>();
  const [student, setStudent] = useState<StudentProfile | null>(null);
  const [reports, setReports] = useState<PublishedReport[]>([]);
  const [orgSettings, setOrgSettings] = useState<any | null>(null);
  const [selectedReportId, setSelectedReportId] = useState('');
  const [accessCode, setAccessCode] = useState('');
  const [accessUnlocked, setAccessUnlocked] = useState(false);
  const [reportsLoading, setReportsLoading] = useState(false);
  const [reportsError, setReportsError] = useState('');
  const [pdfBusy, setPdfBusy] = useState(false);
  const [status, setStatus] = useState<'loading' | 'found' | 'notfound'>('loading');
  const printableRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!id) { setStatus('notfound'); return; }

    fetch(`/api/public/student/${id}`)
      .then(res => {
        if (!res.ok) { setStatus('notfound'); return null; }
        return res.json();
      })
      .then(data => {
        if (!data) return;
        setStudent(data);
        setStatus('found');
      })
      .catch(() => setStatus('notfound'));

    setReports([]);
    setOrgSettings(null);
    setSelectedReportId('');
    setAccessUnlocked(false);
    setAccessCode('');
    setReportsError('');
  }, [id]);

  async function unlockResults(e?: FormEvent) {
    e?.preventDefault();
    if (!id || !accessCode.trim()) {
      setReportsError('Enter the school result access code.');
      return;
    }

    setReportsLoading(true);
    setReportsError('');
    fetch(`/api/public/student/${id}/reports?accessCode=${encodeURIComponent(accessCode.trim())}`, { cache: 'no-store' })
      .then(async res => {
        const data = await res.json().catch(() => null);
        if (!res.ok) throw new Error(data?.error || 'Unable to unlock published results.');
        return data;
      })
      .then(data => {
        const published = data?.reports ?? [];
        setReports(published);
        setOrgSettings(data?.orgSettings ?? null);
        setSelectedReportId(published[0]?.id ?? '');
        setAccessUnlocked(true);
        if (data?.student) setStudent((prev) => prev ?? data.student);
      })
      .catch(err => {
        setReports([]);
        setAccessUnlocked(false);
        setReportsError(err.message || 'No published result found yet.');
      })
      .finally(() => setReportsLoading(false));
  }

  async function downloadDisplayedPdf() {
    if (!selectedReport || !printableRef.current) return;
    setPdfBusy(true);
    try {
      const name = (selectedReport.student_name || student?.full_name || 'Student').replace(/[^\w-]+/g, '_');
      const term = (selectedReport.report_term || 'Result').replace(/[^\w-]+/g, '_');
      const year = (selectedReport.report_period || '').replace(/[^\w-]+/g, '_');
      await generateReportPDF(printableRef.current, `${name}_${term}${year ? `_${year}` : ''}.pdf`);
    } catch (err) {
      console.error('Public result PDF export failed:', err);
      setReportsError('Could not export this result as PDF. Please try Print / Save PDF.');
    } finally {
      setPdfBusy(false);
    }
  }

  function printDisplayedReport() {
    if (printableRef.current) {
      printElement(printableRef.current);
      return;
    }
    window.print();
  }

  const studentCode = student ? accessCardCodeForStudent(student.id) : '';
  const selectedReport = reports.find((report) => report.id === selectedReportId) ?? reports[0] ?? null;
  const enrolledDate = student?.enrolled_at
    ? new Date(student.enrolled_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
    : null;

  return (
    <div className="min-h-screen bg-background flex flex-col items-center p-4 sm:p-6 relative overflow-hidden">
      {/* Background grid pattern */}
      <div
        className="absolute inset-0 opacity-[0.03]"
        style={{
          backgroundImage: `linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)`,
          backgroundSize: '40px 40px',
        }}
      />

      {/* Glow effects */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[300px] bg-primary/5 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-[400px] h-[200px] bg-violet-500/5 rounded-full blur-[100px] pointer-events-none" />

      {/* Header */}
      <div className="mb-8 mt-4 text-center relative z-10">
        <Link href="/" className="inline-flex items-center gap-3 group">
          <img src="/logo.png" alt="Rillcod" className="w-8 h-8 opacity-80 group-hover:opacity-100 transition-opacity" />
          <span className="text-xl font-black text-white/90 tracking-tight uppercase">
            RILLCOD <span className="text-primary">TECHNOLOGIES</span>
          </span>
        </Link>
        <p className="text-white/30 text-[10px] font-bold uppercase tracking-[0.3em] mt-2">
          Student Result Passport
        </p>
      </div>

      {/* Card */}
      <div className="w-full max-w-6xl relative z-10 grid lg:grid-cols-[360px_minmax(0,1fr)] gap-5 items-start">
        {status === 'loading' && (
          <div className="lg:col-span-2 bg-white/[0.03] border border-white/10 backdrop-blur-sm flex flex-col items-center justify-center py-20 gap-4">
            <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin" />
            <p className="text-white/40 text-xs font-bold uppercase tracking-widest">Verifying result passport…</p>
          </div>
        )}

        {status === 'notfound' && (
          <div className="lg:col-span-2 bg-white/[0.03] border border-red-500/20 backdrop-blur-sm flex flex-col items-center justify-center py-16 gap-4 px-6">
            <div className="w-16 h-16 bg-red-500/10 flex items-center justify-center">
              <XCircleIcon className="w-8 h-8 text-red-400" />
            </div>
            <h2 className="text-white font-black text-lg uppercase tracking-tight">Identity Not Found</h2>
            <p className="text-white/40 text-xs text-center leading-relaxed max-w-[260px]">
              This QR code does not match any registered student. The card may be expired or invalid.
            </p>
            <Link
              href="/"
              className="mt-2 px-6 py-3 bg-white/5 hover:bg-white/10 border border-white/10 text-white text-[10px] font-black uppercase tracking-widest transition-all"
            >
              Go to Homepage
            </Link>
          </div>
        )}

        {status === 'found' && student && (
          <>
            <div className="bg-white/[0.03] border border-white/10 backdrop-blur-sm overflow-hidden">
              {/* Top accent */}
              <div className="h-1.5 bg-gradient-to-r from-primary via-primary to-amber-500" />

              {/* Verified Banner */}
              <div className={`flex items-center justify-center gap-2 py-2.5 text-[10px] font-black uppercase tracking-widest ${
                student.is_active
                  ? 'bg-emerald-500/10 text-emerald-400 border-b border-emerald-500/10'
                  : 'bg-red-500/10 text-red-400 border-b border-red-500/10'
              }`}>
                {student.is_active ? (
                  <><ShieldCheckIcon className="w-3.5 h-3.5" /> Verified Active Student</>
                ) : (
                  <><XCircleIcon className="w-3.5 h-3.5" /> Inactive Account</>
                )}
              </div>

              <div className="p-6 flex flex-col items-center gap-5">
                {/* Avatar */}
                {student.avatar_url ? (
                  <img
                    src={student.avatar_url}
                    alt={student.full_name}
                    className="w-20 h-20 rounded-full object-cover ring-4 ring-white/5 ring-offset-2 ring-offset-[#0a0a14]"
                  />
                ) : (
                  <div className="w-20 h-20 bg-gradient-to-br from-primary/20 to-amber-500/10 flex items-center justify-center ring-4 ring-white/5 ring-offset-2 ring-offset-[#0a0a14]">
                    <UserCircleIcon className="w-12 h-12 text-primary/60" />
                  </div>
                )}

                {/* Name & Code */}
                <div className="text-center">
                  <h1 className="text-white font-black text-xl leading-tight uppercase tracking-tight">
                    {student.full_name}
                  </h1>
                  <p className="text-primary font-mono font-bold text-sm mt-1.5 tracking-wider">
                    {studentCode}
                  </p>
                </div>

                {/* Info Grid */}
                <div className="w-full space-y-2">
                  <InfoRow
                    icon={<BuildingOffice2Icon className="w-4 h-4" />}
                    label="School"
                    value={student.school_name || 'Rillcod Academy'}
                  />
                  {student.class_name && (
                    <InfoRow
                      icon={<BookOpenIcon className="w-4 h-4" />}
                      label="Class"
                      value={student.class_name}
                    />
                  )}
                  {student.enrollment_type && (
                    <InfoRow
                      icon={<AcademicCapIcon className="w-4 h-4" />}
                      label="Programme"
                      value={TYPE_LABELS[student.enrollment_type] || student.enrollment_type}
                    />
                  )}
                  {enrolledDate && (
                    <InfoRow
                      icon={<CalendarIcon className="w-4 h-4" />}
                      label="Enrolled"
                      value={enrolledDate}
                    />
                  )}
                </div>
              </div>

              {/* Footer */}
              <div className="border-t border-white/5 px-6 py-3 bg-white/[0.01] flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <CheckBadgeIcon className="w-3.5 h-3.5 text-primary" />
                  <span className="text-white/25 text-[9px] font-bold uppercase tracking-widest">Verified by Rillcod</span>
                </div>
                <span className="text-white/15 text-[9px] font-mono">{student.id.slice(0, 8)}</span>
              </div>
            </div>

            <section className="bg-white/[0.03] border border-white/10 backdrop-blur-sm overflow-hidden">
              <div className="h-1.5 bg-gradient-to-r from-emerald-500 via-primary to-violet-500" />
              <div className="p-5 sm:p-6 border-b border-white/10 flex flex-col sm:flex-row sm:items-end justify-between gap-4">
                <div>
                  <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-[10px] font-black uppercase tracking-widest mb-3">
                    <ShieldCheckIcon className="w-3.5 h-3.5" />
                    Access Code Required
                  </div>
                  <h2 className="text-white text-2xl font-black tracking-tight">Result Passport</h2>
                  <p className="text-white/40 text-xs mt-1 max-w-xl">
                    Scan-approved public view for officially published results. Enter your school's shared result code to unlock term records.
                  </p>
                </div>

                {accessUnlocked && reports.length > 0 && (
                  <select
                    value={selectedReport?.id ?? ''}
                    onChange={(e) => setSelectedReportId(e.target.value)}
                    className="min-w-[240px] bg-background border border-white/10 text-white text-xs font-bold px-4 py-3 focus:outline-none focus:border-primary"
                  >
                    {reports.map((report) => (
                      <option key={report.id} value={report.id} className="bg-background">
                        {[report.report_period, report.report_term, report.course_name].filter(Boolean).join(' · ')}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              {!accessUnlocked && (
                <form onSubmit={unlockResults} className="p-5 sm:p-6 border-b border-white/10 bg-white/[0.015]">
                  <div className="grid md:grid-cols-[1fr_auto] gap-3 items-end">
                    <div>
                      <label className="block text-white/30 text-[9px] font-black uppercase tracking-widest mb-2">
                        School Result Access Code
                      </label>
                      <input
                        value={accessCode}
                        onChange={(e) => {
                          setAccessCode(e.target.value.toUpperCase());
                          if (reportsError) setReportsError('');
                        }}
                        placeholder="e.g. RC-QUINCY"
                        className="w-full bg-background border border-white/10 text-white placeholder:text-white/20 px-4 py-3 text-sm font-mono font-black tracking-wider focus:outline-none focus:border-primary"
                        autoComplete="off"
                      />
                      <p className="text-white/25 text-[11px] mt-2">
                        This code is shared by the school. It protects result records even when a card QR is scanned.
                      </p>
                    </div>
                    <button
                      type="submit"
                      disabled={reportsLoading}
                      className="px-6 py-3 bg-primary hover:bg-primary/90 disabled:opacity-50 text-primary-foreground text-[10px] font-black uppercase tracking-widest transition-colors"
                    >
                      {reportsLoading ? 'Checking…' : 'Unlock Results'}
                    </button>
                  </div>
                </form>
              )}

              {reportsLoading && (
                <div className="p-10 flex flex-col items-center justify-center gap-3 text-white/40">
                  <div className="w-10 h-10 rounded-full border-4 border-primary border-t-transparent animate-spin" />
                  <p className="text-[10px] font-black uppercase tracking-widest">Checking published results…</p>
                </div>
              )}

              {!reportsLoading && accessUnlocked && reports.length === 0 && (
                <div className="p-8 sm:p-10 text-center space-y-4">
                  <div className="w-16 h-16 mx-auto bg-amber-500/10 border border-amber-500/20 flex items-center justify-center">
                    <DocumentTextIcon className="w-8 h-8 text-amber-300" />
                  </div>
                  <div>
                    <h3 className="text-white font-black text-lg">No Published Result Yet</h3>
                    <p className="text-white/40 text-sm mt-2 max-w-md mx-auto">
                      {reportsError || 'Once staff/admin publish the current academic year and term, it will appear here automatically.'}
                    </p>
                  </div>
                </div>
              )}

              {!reportsLoading && !accessUnlocked && (
                <div className="p-8 sm:p-10 text-center space-y-4">
                  <div className="w-16 h-16 mx-auto bg-primary/10 border border-primary/20 flex items-center justify-center">
                    <ShieldCheckIcon className="w-8 h-8 text-primary" />
                  </div>
                  <div>
                    <h3 className="text-white font-black text-lg">Results Locked</h3>
                    <p className="text-white/40 text-sm mt-2 max-w-md mx-auto">
                      {reportsError || 'Enter the school access code to view all published terms for this student.'}
                    </p>
                  </div>
                </div>
              )}

              {!reportsLoading && accessUnlocked && selectedReport && (
                <div className="p-4 sm:p-6 space-y-5">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <ResultStat label="Academic Year" value={selectedReport.report_period || '—'} />
                    <ResultStat label="Term" value={selectedReport.report_term || '—'} />
                    <ResultStat label="Score" value={selectedReport.overall_score != null ? `${selectedReport.overall_score}%` : '—'} />
                    <ResultStat label="Grade" value={selectedReport.overall_grade || '—'} />
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 px-4 py-3">
                    <div>
                      <p className="text-emerald-300 text-[10px] font-black uppercase tracking-widest">Officially Published</p>
                      <p className="text-white/50 text-xs mt-0.5">
                        {selectedReport.course_name || 'Progress Report'} · {selectedReport.report_date ? new Date(selectedReport.report_date).toLocaleDateString('en-GB') : 'Verified term result'}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button
                        onClick={printDisplayedReport}
                        className="inline-flex items-center gap-2 px-4 py-2 bg-white text-black text-[10px] font-black uppercase tracking-widest hover:bg-violet-50 transition-colors"
                      >
                        <PrinterIcon className="w-4 h-4" />
                        Print
                      </button>
                      <button
                        onClick={downloadDisplayedPdf}
                        disabled={pdfBusy}
                        className="inline-flex items-center gap-2 px-4 py-2 bg-primary hover:bg-primary/90 disabled:opacity-50 text-primary-foreground text-[10px] font-black uppercase tracking-widest transition-colors"
                      >
                        <DocumentTextIcon className="w-4 h-4" />
                        {pdfBusy ? 'Exporting...' : 'Export PDF'}
                      </button>
                    </div>
                  </div>

                  <div ref={printableRef} className="bg-white rounded-[1.8rem] overflow-hidden shadow-2xl print:shadow-none">
                    <ScaledReportCard report={selectedReport}>
                      <ReportCard report={selectedReport as any} orgSettings={orgSettings} />
                    </ScaledReportCard>
                  </div>
                </div>
              )}
            </section>
          </>
        )}
      </div>

      <p className="mt-6 text-white/15 text-[9px] text-center relative z-10 font-bold uppercase tracking-widest">
        Scan any Rillcod student access card to verify identity and view officially published term results
      </p>
    </div>
  );
}

function ResultStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-white/[0.03] border border-white/10 p-4">
      <p className="text-white/30 text-[9px] font-black uppercase tracking-widest">{label}</p>
      <p className="text-white text-lg font-black mt-1 truncate">{value}</p>
    </div>
  );
}

function InfoRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center gap-3 bg-white/[0.03] border border-white/5 px-4 py-3">
      <div className="text-white/30 flex-shrink-0">{icon}</div>
      <div className="min-w-0">
        <p className="text-white/30 text-[9px] font-black uppercase tracking-widest">{label}</p>
        <p className="text-white/90 text-sm font-bold truncate">{value}</p>
      </div>
    </div>
  );
}
