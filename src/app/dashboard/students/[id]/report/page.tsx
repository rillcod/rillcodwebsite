// @refresh reset
'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { useAuth } from '@/contexts/auth-context';
import { createClient } from '@/lib/supabase/client';
import {
  AcademicCapIcon, ChartBarIcon, CheckCircleIcon, ClipboardDocumentListIcon,
  ClockIcon, ExclamationTriangleIcon, PrinterIcon, StarIcon,
  UserIcon, BuildingOfficeIcon, BookOpenIcon, TrophyIcon,
  ArrowLeftIcon, SparklesIcon, LightBulbIcon,
} from '@/lib/icons';
import Link from 'next/link';

function letterGrade(pct: number) {
  if (pct >= 90) return { letter: 'A', color: 'text-emerald-400', bg: 'bg-emerald-500/20 border-emerald-500/30' };
  if (pct >= 80) return { letter: 'B', color: 'text-primary', bg: 'bg-primary/20    border-primary/30' };
  if (pct >= 70) return { letter: 'C', color: 'text-amber-400', bg: 'bg-amber-500/20   border-amber-500/30' };
  if (pct >= 60) return { letter: 'D', color: 'text-amber-500', bg: 'bg-amber-500/10 border-amber-500/20' };
  return { letter: 'F', color: 'text-rose-400', bg: 'bg-rose-500/20    border-rose-500/30' };
}

function RingProgress({ pct, size = 88, stroke = 9, color = '#8b5cf6' }: {
  pct: number; size?: number; stroke?: number; color?: string;
}) {
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const offset = circ - (pct / 100) * circ;
  return (
    <svg width={size} height={size} className="-rotate-90">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth={stroke} />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color}
        strokeWidth={stroke} strokeLinecap="round"
        strokeDasharray={circ} strokeDashoffset={offset}
        style={{ transition: 'stroke-dashoffset 0.8s ease' }} />
    </svg>
  );
}

export default function StudentProgressReportPage() {
  const params = useParams();
  const studentId = params?.id as string;
  const { profile, loading: authLoading } = useAuth();

  const [student, setStudent] = useState<any>(null);
  const [submissions, setSubmissions] = useState<any[]>([]);
  const [enrollments, setEnrollments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const isStaff = profile?.role === 'admin' || profile?.role === 'teacher' || profile?.role === 'school';

  useEffect(() => {
    if (authLoading || !profile || !studentId) return;
    let cancelled = false;
    async function load() {
      setLoading(true); setError(null);
      try {
        const supabase = createClient();
        // Step 1: Load student (including user_id link to portal_users)
        let studentQuery = supabase
          .from('students')
          .select('id, full_name, school_name, current_class, parent_name, parent_email, status, created_at, city, state, user_id, enrollment_type, preferred_schedule, course_interest')
          .eq('id', studentId);
        // School users may only view reports for students in their school
        if (profile?.role === 'school' && profile?.school_id) {
          studentQuery = studentQuery.eq('school_id', profile.school_id);
        }
        const { data: studentData, error: studErr } = await studentQuery.single();
        if (!cancelled) setStudent(studentData ?? null);
        if (studErr) throw studErr;

        // Step 2: Use portal user_id for submission/enrollment queries
        const portalUserId = studentData?.user_id;
        const [subRes, enrRes] = await Promise.allSettled([
          portalUserId
            ? supabase.from('assignment_submissions')
                .select(`id, grade, status, submitted_at, graded_at, feedback,
                  assignments ( id, title, max_points, due_date, assignment_type,
                    courses ( id, title, programs ( name ) ) )`)
                .eq('portal_user_id', portalUserId)
                .order('submitted_at', { ascending: false })
            : Promise.resolve({ data: [] as any[], error: null }),
          portalUserId
            ? supabase.from('enrollments')
                .select(`id, status, enrollment_date, completion_date, grade, programs ( id, name )`)
                .eq('user_id', portalUserId)
            : supabase.from('student_enrollments')
                .select(`id, status, enrollment_date, completion_date, grade, programs ( id, name )`)
                .eq('student_id', studentId),
        ]);
        if (!cancelled) {
          setSubmissions(subRes.status === 'fulfilled' ? (subRes.value.data ?? []) : []);
          setEnrollments(enrRes.status === 'fulfilled' ? (enrRes.value.data ?? []) : []);
        }
      } catch (e: any) {
        if (!cancelled) setError(e.message ?? 'Failed to load report');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [studentId, profile?.id, authLoading]); // eslint-disable-line

  // ── Derived stats ──────────────────────────────────────────────
  const graded = submissions.filter(s => s.grade != null);
  const totalPoints = graded.reduce((sum, s) => sum + (s.assignments?.max_points ?? 100), 0);
  const earnedPoints = graded.reduce((sum, s) => sum + (s.grade ?? 0), 0);
  const avgPct = totalPoints > 0 ? Math.round((earnedPoints / totalPoints) * 100) : 0;
  const grade = letterGrade(avgPct);
  const submitted = submissions.filter(s => s.status === 'submitted').length;
  const missing = submissions.filter(s => s.status === 'missing').length;
  const late = submissions.filter(s => s.status === 'late').length;

  if (authLoading || loading) return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin" />
        <p className="text-muted-foreground text-sm">Loading student report…</p>
      </div>
    </div>
  );

  if (!isStaff) return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <p className="text-muted-foreground">Staff access required to view student reports.</p>
    </div>
  );

  if (error || !student) return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-4">
      <ExclamationTriangleIcon className="w-12 h-12 text-rose-400" />
      <p className="text-rose-400">{error ?? 'Student not found'}</p>
      <Link href="/dashboard/students" className="text-primary hover:text-primary text-sm flex items-center gap-1">
        <ArrowLeftIcon className="w-4 h-4" /> Back to Students
      </Link>
    </div>
  );

  return (
    <div className="min-h-screen bg-background text-foreground print:bg-card print:text-black">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">

        {/* ── Header bar ── */}
        <div className="flex items-center justify-between print:hidden">
          <div>
            <Link href="/dashboard/students"
              className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-muted-foreground transition-colors mb-1">
              <ArrowLeftIcon className="w-4 h-4" /> Students
            </Link>
            <div className="flex items-center gap-2">
              <ClipboardDocumentListIcon className="w-5 h-5 text-primary" />
              <span className="text-xs font-bold text-primary uppercase tracking-widest">Progress Report</span>
            </div>
            <h1 className="text-3xl font-extrabold mt-0.5">{student.full_name}</h1>
          </div>
          <button onClick={() => window.print()}
            className="flex items-center gap-2 px-5 py-2.5 bg-primary hover:bg-primary/90 text-foreground text-sm font-bold rounded-xl transition-all">
            <PrinterIcon className="w-4 h-4" /> Print / Save PDF
          </button>
        </div>

        {/* ── Rillcod branded letterhead (print-only) ── */}
        <div className="hidden print:block">
          {/* Letterhead */}
          <div style={{ borderBottom: '3px solid #1d4ed8', paddingBottom: '16px', marginBottom: '20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/logo.png" alt="Rillcod Technologies" style={{ width: '72px', height: '72px', objectFit: 'contain', flexShrink: 0 }} />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: '22px', fontWeight: 900, color: '#1d4ed8', letterSpacing: '-0.5px', lineHeight: 1.1 }}>
                  RILLCOD TECHNOLOGIES
                </div>
                <div style={{ fontSize: '11px', color: '#6b7280', marginTop: '3px' }}>
                  Coding Today, Innovating Tomorrow
                </div>
                <div style={{ fontSize: '10px', color: '#9ca3af', marginTop: '2px' }}>
                  26 Ogiesoba Avenue, Off Airport Road, GRA, Benin City &nbsp;·&nbsp; 08116600091 &nbsp;·&nbsp; support@rillcod.com
                </div>
              </div>
              <div style={{ textAlign: 'right', flexShrink: 0 }}>
                <div style={{ fontSize: '10px', fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '1.5px' }}>
                  Document Type
                </div>
                <div style={{ fontSize: '14px', fontWeight: 800, color: '#1d4ed8', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  Progress Report
                </div>
                <div style={{ fontSize: '10px', color: '#9ca3af', marginTop: '4px' }}>
                  {new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' })}
                </div>
              </div>
            </div>
          </div>

          {/* Student identity card */}
          <div style={{
            background: 'linear-gradient(135deg, #1e3a8a 0%, #1d4ed8 50%, #2563eb 100%)',
            borderRadius: '12px',
            padding: '20px 24px',
            marginBottom: '24px',
            color: '#fff',
            display: 'flex',
            alignItems: 'center',
            gap: '20px',
          }}>
            {/* Avatar initial */}
            <div style={{
              width: '64px', height: '64px', borderRadius: '12px',
              background: 'rgba(255,255,255,0.2)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '28px', fontWeight: 900, color: '#fff', flexShrink: 0,
              border: '2px solid rgba(255,255,255,0.3)',
            }}>
              {(student.full_name ?? 'S')[0]}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: '22px', fontWeight: 900, letterSpacing: '-0.5px', lineHeight: 1.1 }}>
                {student.full_name}
              </div>
              <div style={{ display: 'flex', gap: '24px', marginTop: '8px', flexWrap: 'wrap' }}>
                {student.school_name && (
                  <div>
                    <div style={{ fontSize: '9px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px', opacity: 0.65 }}>School</div>
                    <div style={{ fontSize: '13px', fontWeight: 700 }}>{student.school_name}</div>
                  </div>
                )}
                {student.current_class && (
                  <div>
                    <div style={{ fontSize: '9px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px', opacity: 0.65 }}>Class / Grade</div>
                    <div style={{ fontSize: '13px', fontWeight: 700 }}>{student.current_class}</div>
                  </div>
                )}
                {student.status && (
                  <div>
                    <div style={{ fontSize: '9px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px', opacity: 0.65 }}>Status</div>
                    <div style={{ fontSize: '13px', fontWeight: 700, textTransform: 'capitalize' }}>{student.status}</div>
                  </div>
                )}
              </div>
            </div>
            {/* Overall badge */}
            <div style={{
              textAlign: 'center', flexShrink: 0,
              background: 'rgba(255,255,255,0.15)',
              borderRadius: '10px', padding: '10px 18px',
              border: '1.5px solid rgba(255,255,255,0.25)',
            }}>
              <div style={{ fontSize: '36px', fontWeight: 900, lineHeight: 1 }}>{grade.letter}</div>
              <div style={{ fontSize: '13px', fontWeight: 600, opacity: 0.8, marginTop: '2px' }}>{avgPct}%</div>
              <div style={{ fontSize: '9px', textTransform: 'uppercase', letterSpacing: '1px', opacity: 0.6, marginTop: '2px' }}>Overall</div>
            </div>
          </div>
        </div>

        {/* ── Student info card ── */}
        <div className="bg-card shadow-sm border border-border rounded-xl p-6 print:border-border print:bg-card">
          <div className="flex items-start gap-5 flex-wrap">
            <div className="w-16 h-16 rounded-xl bg-gradient-to-br from-primary from-primary to-primary flex items-center justify-center text-2xl font-black text-foreground flex-shrink-0 print:hidden">
              {(student.full_name ?? 'S')[0]}
            </div>
            <div className="flex-1 min-w-0 grid grid-cols-2 sm:grid-cols-3 gap-x-8 gap-y-3 text-sm">
              {[
                { label: 'Full Name', value: student.full_name, icon: UserIcon, printHide: true },
                { label: 'School', value: student.school_name, icon: BuildingOfficeIcon, printHide: true },
                { label: 'Class / Grade', value: student.current_class, icon: AcademicCapIcon, printHide: true },
                { label: 'Parent', value: student.parent_name, icon: UserIcon },
                { label: 'Parent Email', value: student.parent_email, icon: null },
                { label: 'Location', value: [student.city, student.state].filter(Boolean).join(', '), icon: null },
                { label: 'Enrollment Type', value: student.enrollment_type, icon: null },
                { label: 'Preferred Schedule', value: student.preferred_schedule, icon: null },
                { label: 'Course Interest', value: student.course_interest, icon: null },
                { label: 'Registered', value: student.created_at ? new Date(student.created_at).toLocaleDateString() : '—', icon: null },
                { label: 'Status', value: student.status, icon: null },
              ].map(({ label, value, icon: Icon, printHide }: { label: string; value: any; icon: any; printHide?: boolean }) => value ? (
                <div key={label} className={printHide ? 'print:hidden' : ''}>
                  <p className="text-muted-foreground text-xs uppercase tracking-widest mb-0.5">{label}</p>
                  <p className="text-foreground font-semibold text-sm print:text-black">{value}</p>
                </div>
              ) : null)}
            </div>
          </div>
        </div>

        {/* ── Performance summary ── */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {/* Overall ring */}
          <div className="col-span-2 sm:col-span-1 bg-card shadow-sm border border-border rounded-xl p-5 flex flex-col items-center justify-center print:border-border">
            <div className="relative">
              <RingProgress pct={avgPct} color={avgPct >= 70 ? '#10b981' : avgPct >= 50 ? '#f59e0b' : '#f43f5e'} />
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className={`text-xl font-black ${grade.color}`}>{grade.letter}</span>
                <span className="text-muted-foreground text-xs">{avgPct}%</span>
              </div>
            </div>
            <p className="text-xs text-muted-foreground text-center mt-2">Overall Score</p>
          </div>
          {[
            { label: 'Graded', value: graded.length, icon: CheckCircleIcon, color: 'text-emerald-400', bg: 'bg-emerald-500/10' },
            { label: 'Pending', value: submitted, icon: ClockIcon, color: 'text-primary', bg: 'bg-primary/10' },
            { label: 'Missing', value: missing + late, icon: ExclamationTriangleIcon, color: 'text-rose-400', bg: 'bg-rose-500/10' },
          ].map(s => (
            <div key={s.label} className="bg-card shadow-sm border border-border rounded-xl p-5 print:border-border">
              <div className={`w-10 h-10 ${s.bg} rounded-xl flex items-center justify-center mb-3`}>
                <s.icon className={`w-5 h-5 ${s.color}`} />
              </div>
              <p className={`text-2xl font-extrabold ${s.color}`}>{s.value}</p>
              <p className="text-xs text-muted-foreground mt-1">{s.label}</p>
            </div>
          ))}
        </div>

        {/* ── Enrollments ── */}
        {enrollments.length > 0 && (
          <div className="bg-card shadow-sm border border-border rounded-xl overflow-hidden print:border-border">
            <div className="p-5 border-b border-border print:border-border flex items-center gap-2">
              <BookOpenIcon className="w-4 h-4 text-primary" />
              <h3 className="font-bold text-foreground print:text-black">Programme Enrolments</h3>
            </div>
            <div className="divide-y divide-white/5 print:divide-border">
              {enrollments.map((e: any) => (
                <div key={e.id} className="p-4 flex items-center gap-4 text-sm">
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-foreground print:text-black">{e.programs?.name ?? '—'}</p>
                    <p className="text-muted-foreground text-xs mt-0.5 print:text-muted-foreground">
                      Enrolled: {e.enrollment_date ? new Date(e.enrollment_date).toLocaleDateString() : '—'}
                      {e.completion_date ? ` · Completed: ${new Date(e.completion_date).toLocaleDateString()}` : ''}
                    </p>
                  </div>
                  <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold border capitalize ${e.status === 'active' ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' :
                      e.status === 'completed' ? 'bg-primary/20 text-primary border-primary/30' :
                        'bg-muted text-muted-foreground border-border'
                    }`}>{e.status}</span>
                  {e.grade && <span className="font-black text-lg text-foreground print:text-black">{e.grade}</span>}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Assignment submissions ── */}
        <div className="bg-card shadow-sm border border-border rounded-xl overflow-hidden print:border-border">
          <div className="p-5 border-b border-border print:border-border flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ChartBarIcon className="w-4 h-4 text-primary" />
              <h3 className="font-bold text-foreground print:text-black">Assignment Performance</h3>
            </div>
            <span className="text-xs text-muted-foreground">{submissions.length} total</span>
          </div>
          {submissions.length === 0 ? (
            <div className="p-10 text-center">
              <ClipboardDocumentListIcon className="w-12 h-12 mx-auto text-muted-foreground mb-3" />
              <p className="text-muted-foreground">No assignment submissions yet</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border print:border-border text-xs text-muted-foreground uppercase tracking-wider">
                    <th className="text-left px-5 py-3 print:text-muted-foreground">Assignment</th>
                    <th className="text-left px-5 py-3 print:text-muted-foreground">Course</th>
                    <th className="text-center px-4 py-3 print:text-muted-foreground">Score</th>
                    <th className="text-center px-4 py-3 print:text-muted-foreground">Grade</th>
                    <th className="text-left px-4 py-3 print:text-muted-foreground">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5 print:divide-border">
                  {submissions.map((s: any) => {
                    const maxPts = s.assignments?.max_points ?? 100;
                    const pct = s.grade != null ? Math.round((s.grade / maxPts) * 100) : null;
                    const lg = pct != null ? letterGrade(pct) : null;
                    return (
                      <tr key={s.id} className="hover:bg-card shadow-sm transition-colors print:hover:bg-transparent">
                        <td className="px-5 py-3 font-semibold text-foreground print:text-black truncate max-w-[200px]">
                          {s.assignments?.title ?? '—'}
                        </td>
                        <td className="px-5 py-3 text-muted-foreground print:text-muted-foreground truncate max-w-[160px]">
                          {s.assignments?.courses?.title ?? '—'}
                        </td>
                        <td className="px-4 py-3 text-center">
                          {s.grade != null
                            ? <span className="font-bold text-foreground print:text-black">{s.grade}<span className="text-muted-foreground print:text-muted-foreground/70">/{maxPts}</span></span>
                            : <span className="text-muted-foreground">—</span>}
                        </td>
                        <td className="px-4 py-3 text-center">
                          {lg
                            ? <span className={`px-2 py-0.5 rounded-full text-xs font-black border ${lg.bg} ${lg.color}`}>{lg.letter}</span>
                            : <span className="text-muted-foreground">—</span>}
                        </td>
                        <td className="px-4 py-3">
                          <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold border capitalize ${s.status === 'graded' ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' :
                              s.status === 'submitted' ? 'bg-primary/20 text-primary border-primary/30' :
                                s.status === 'late' ? 'bg-amber-500/20 text-amber-400 border-amber-500/30' :
                                  'bg-rose-500/20 text-rose-400 border-rose-500/30'
                            }`}>{s.status}</span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          {/* Footer summary row */}
          {graded.length > 0 && (
            <div className={`p-4 border-t border-border print:border-border flex items-center justify-between ${grade.bg} print:border print:rounded-xl `}>
              <div className="flex items-center gap-2">
                <TrophyIcon className={`w-5 h-5 ${grade.color}`} />
                <p className={`font-bold text-sm ${grade.color} print:text-black`}>
                  Overall: {earnedPoints} / {totalPoints} pts ({avgPct}%)
                </p>
              </div>
              <span className={`text-2xl font-black ${grade.color} print:text-black`}>{grade.letter}</span>
            </div>
          )}
        </div>

        {/* ── Instructor notes (placeholder — editable later) ── */}
        <div className="bg-card shadow-sm border border-border rounded-xl p-6 print:border-border space-y-4">
          <div className="flex items-center gap-2 mb-1">
            <SparklesIcon className="w-4 h-4 text-amber-400" />
            <h3 className="font-bold text-foreground print:text-black">Instructor's Evaluation</h3>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-xl p-4 print:border-green-200">
              <p className="text-xs font-bold text-emerald-400 uppercase tracking-widest mb-2 print:text-green-700">Key Strengths</p>
              <p className="text-muted-foreground text-sm print:text-muted-foreground italic">
                {avgPct >= 80 ? 'Demonstrates consistent excellence across assignments.' :
                  avgPct >= 60 ? 'Shows command of core concepts with room for growth.' :
                    'Shows effort; needs more practice to reach target level.'}
              </p>
            </div>
            <div className="bg-amber-500/5 border border-amber-500/20 rounded-xl p-4 print:border-amber-200">
              <div className="flex items-center gap-1.5 mb-2">
                <LightBulbIcon className="w-3.5 h-3.5 text-amber-400 print:text-amber-600" />
                <p className="text-xs font-bold text-amber-400 uppercase tracking-widest print:text-amber-700">Areas for Growth</p>
              </div>
              <p className="text-muted-foreground text-sm print:text-muted-foreground italic">
                {missing > 0 ? `${missing} missing assignment${missing > 1 ? 's' : ''} should be completed.` : ''}
                {late > 0 ? ` ${late} late submission${late > 1 ? 's' : ''} — work on time management.` : ''}
                {missing === 0 && late === 0 ? 'Maintain current performance level and challenge with advanced topics.' : ''}
              </p>
            </div>
          </div>
        </div>

        {/* ── Certificate footer (for print) ── */}
        <div className="hidden print:block border-2 border-primary rounded-xl p-8 text-center mt-8">
          <h4 className="text-xl font-bold text-primary">CERTIFICATE OF PROGRESS</h4>
          <p className="text-foreground/80 mt-2 leading-relaxed">
            This certifies that <strong>{student.full_name}</strong> has completed the progress review
            for the current term at Rillcod Technologies.
          </p>
          <div className="flex justify-center gap-16 mt-8">
            <div className="text-center">
              <div className="w-32 border-b border-border/80 mb-1" />
              <p className="text-xs text-muted-foreground">Instructor's Signature</p>
            </div>
            <div className="text-center">
              <div className="w-32 border-b border-border/80 mb-1" />
              <p className="text-xs text-muted-foreground">Date</p>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}