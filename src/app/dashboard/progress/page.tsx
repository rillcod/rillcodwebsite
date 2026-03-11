'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/auth-context';
import { createClient } from '@/lib/supabase/client';
import {
  ChartBarIcon, AcademicCapIcon, CheckCircleIcon, ClockIcon,
  TrophyIcon, BookOpenIcon, ClipboardDocumentCheckIcon,
  ArrowTrendingUpIcon, StarIcon, ExclamationTriangleIcon,
} from '@heroicons/react/24/outline';

// ── Radial progress ring ──────────────────────────────────────
function RingProgress({ pct, size = 80, stroke = 8, color = '#8b5cf6' }: {
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

export default function ProgressPage() {
  const { profile, loading: authLoading } = useAuth();

  const [submissions, setSubmissions] = useState<any[]>([]);
  const [enrollments, setEnrollments] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const role = profile?.role ?? '';
  const isStaff = role === 'admin' || role === 'teacher' || role === 'school';

  useEffect(() => {
    if (authLoading || !profile) return;
    let cancelled = false;

    async function load() {
      if (!profile) return;
      setLoading(true);
      setError(null);
      const supabase = createClient();
      const p = profile;

      try {
        if (isStaff) {
          // 1. Resolve school metadata for non-admins
          let assignedSchoolIds: string[] = [];
          let assignedSchoolNames: string[] = [];

          if (role === 'school' && p.school_id) {
            assignedSchoolIds = [p.school_id];
            const { data: sData } = await supabase.from('schools').select('name').eq('id', p.school_id).maybeSingle();
            if (sData?.name) assignedSchoolNames = [sData.name];
          } else if (role === 'teacher') {
            const { data: assignments } = await supabase.from('teacher_schools').select('school_id').eq('teacher_id', p.id);
            const ids = assignments?.map((a: any) => a.school_id).filter(Boolean) || [];
            if (p.school_id) ids.push(p.school_id);
            assignedSchoolIds = Array.from(new Set(ids));

            if (assignedSchoolIds.length > 0) {
              const { data: namesData } = await supabase.from('schools').select('name').in('id', assignedSchoolIds);
              assignedSchoolNames = namesData?.map(s => s.name).filter(Boolean) || [];
            }
          }

          // 2. Fetch submissions (2-step to avoid FK ambiguity)
          const rawSubsQ = supabase.from('assignment_submissions')
            .select(`id, grade, status, portal_user_id, user_id,
                assignments ( id, title, max_points, course_id,
                  courses ( id, title, programs ( name ) ) )`)
            .order('graded_at', { ascending: false });

          const enrQuery = supabase.from('enrollments')
            .select(`id, status, grade, progress_pct, enrollment_date,
                programs ( id, name, difficulty_level, duration_weeks ),
                portal_users!enrollments_user_id_fkey ( id, full_name, email, school_id, school_name )`)
            .order('enrollment_date', { ascending: false });

          const [rawSubsRes, enrRes] = await Promise.allSettled([rawSubsQ, enrQuery]);

          // 3. Enrich submissions with portal_users via separate lookup
          let subsData = rawSubsRes.status === 'fulfilled' ? (rawSubsRes.value.data ?? []) : [];
          if (subsData.length > 0) {
            const uids = [...new Set(subsData.map((s: any) => s.portal_user_id ?? s.user_id).filter(Boolean))];
            const { data: users } = await supabase.from('portal_users').select('id, full_name, email, school_id, school_name').in('id', uids);
            const umap: Record<string, any> = {};
            (users ?? []).forEach((u: any) => { umap[u.id] = u; });
            subsData = subsData.map((s: any) => ({ ...s, portal_users: umap[s.portal_user_id ?? s.user_id] ?? null }));
          }

          // 4. Filter by school for non-admins
          if (role !== 'admin') {
            if (assignedSchoolIds.length > 0 || assignedSchoolNames.length > 0) {
              subsData = subsData.filter((s: any) => {
                const u = s.portal_users;
                if (!u) return false;
                return assignedSchoolIds.includes(u.school_id) || assignedSchoolNames.includes(u.school_name);
              });
            } else {
              subsData = [];
            }
          }

          const subsRes = { status: 'fulfilled' as const, value: { data: subsData } };
          const [_unused, _enrRes] = [subsRes, enrRes]; // keep same shape for setters below
          if (!cancelled) {
            setSubmissions(subsRes.status === 'fulfilled' ? (subsRes.value.data ?? []) : []);
            setEnrollments(enrRes.status === 'fulfilled' ? (enrRes.value.data ?? []) : []);
          }
        } else {
          // Student: own submissions + enrollments
          const [subsRes, enrRes] = await Promise.allSettled([
            supabase.from('assignment_submissions')
              .select(`id, grade, status, submitted_at, graded_at, feedback,
                assignments ( id, title, max_points,
                  courses ( id, title, programs ( name ) ) )`)
              .or(`portal_user_id.eq.${profile!.id},user_id.eq.${profile!.id}`)
              .order('submitted_at', { ascending: false }),
            supabase.from('enrollments')
              .select(`id, status, grade, progress_pct, enrollment_date,
                programs ( id, name, difficulty_level, duration_weeks )`)
              .eq('user_id', profile!.id),
          ]);
          if (!cancelled) {
            setSubmissions(subsRes.status === 'fulfilled' ? (subsRes.value.data ?? []) : []);
            setEnrollments(enrRes.status === 'fulfilled' ? (enrRes.value.data ?? []) : []);
          }
        }
      } catch (e: any) {
        if (!cancelled) setError(e.message ?? 'Failed to load progress');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [profile?.id, isStaff, authLoading]); // eslint-disable-line

  // ── Stats ─────────────────────────────────────────────────
  const graded = submissions.filter(s => s.status === 'graded' && s.grade != null);
  const avgScore = graded.length
    ? Math.round(graded.reduce((a, s) => a + (s.grade / (s.assignments?.max_points ?? 100)) * 100, 0) / graded.length)
    : null;
  const best = graded.length
    ? Math.round(Math.max(...graded.map(s => (s.grade / (s.assignments?.max_points ?? 100)) * 100)))
    : null;
  const completed = submissions.filter(s => s.status === 'graded').length;
  const pending = submissions.filter(s => s.status === 'submitted').length;

  // ── Color helpers ─────────────────────────────────────────
  const pctColor = (p: number) => p >= 70 ? '#10b981' : p >= 50 ? '#f59e0b' : '#ef4444';
  const letter = (p: number) => p >= 90 ? 'A' : p >= 80 ? 'B' : p >= 70 ? 'C' : p >= 60 ? 'D' : 'F';

  if (authLoading || loading) return (
    <div className="min-h-screen bg-[#0f0f1a] text-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        <div className="animate-pulse space-y-2">
          <div className="h-4 bg-white/10 rounded w-32" />
          <div className="h-8 bg-white/10 rounded w-64" />
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map(i => <div key={i} className="bg-white/5 border border-white/10 rounded-2xl h-32 animate-pulse" />)}
        </div>
        {[1, 2].map(i => <div key={i} className="bg-white/5 border border-white/10 rounded-2xl h-40 animate-pulse" />)}
      </div>

      <style jsx global>{`
        @media print {
          body { background: white !important; color: black !important; }
          .bg-\[\#0f0f1a\], .bg-gradient-to-br { background: white !important; }
          .bg-white\/5, .bg-white\/8, .bg-white\/10 { background: #f9fafb !important; border-color: #e5e7eb !important; }
          .text-white, .text-white\/60, .text-white\/40, .text-white\/30 { color: #111827 !important; }
          .border-white\/10, .border-white\/20, .border-white\/5 { border-color: #e5e7eb !important; }
          .max-w-7xl { max-width: 100% !important; padding: 0 !important; }
          .shadow-xl, .shadow-lg, .shadow-blue-600\/20, .shadow-2xl { box-shadow: none !important; }
          .print\:hidden { display: none !important; }
          button { display: none !important; }
          h1, h2, h3 { color: black !important; }
          .divide-white\/5 { divide-color: #e5e7eb !important; }
          .h-2 { height: 8px !important; background: #e5e7eb !important; }
          .bg-violet-500 { background: #8b5cf6 !important; }
        }
      `}</style>
    </div>
  );
  if (!profile) return null;

  return (
    <div className="min-h-screen bg-[#0f0f1a] text-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">

        {/* Header */}
        <div className="flex items-center justify-between print:hidden">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <ChartBarIcon className="w-5 h-5 text-violet-400" />
              <span className="text-xs font-bold text-violet-400 uppercase tracking-widest">
                {isStaff ? 'Student Analytics' : 'My Progress'} · {role}
              </span>
            </div>
            <h1 className="text-3xl font-extrabold">
              {isStaff ? 'Progress & Analytics' : 'My Learning Progress'}
            </h1>
            <p className="text-white/40 text-sm mt-1">
              {isStaff ? 'Track student performance across all assignments' : 'Track your academic journey and performance'}
            </p>
          </div>
          <button
            onClick={() => window.print()}
            className="flex items-center gap-2 px-4 py-2 bg-white/5 hover:bg-white/10 text-white/70 text-sm font-bold rounded-xl border border-white/10 transition-all shadow-lg"
          >
            <ClipboardDocumentCheckIcon className="w-4 h-4" /> Print Report
          </button>
        </div>

        <div className="hidden print:block border-b border-gray-200 pb-6 mb-8">
          <h1 className="text-2xl font-black text-black">Academic Progress Report</h1>
          <p className="text-sm text-gray-500">
            {profile!.full_name} · {profile!.school_name || 'Rillcod Academy'} · {new Date().toLocaleDateString()}
          </p>
        </div>

        {error && (
          <div className="flex items-center gap-3 bg-rose-500/10 border border-rose-500/20 rounded-xl p-4">
            <ExclamationTriangleIcon className="w-5 h-5 text-rose-400" />
            <p className="text-rose-400 text-sm">{error}</p>
          </div>
        )}

        {/* Score ring + stats (student) */}
        {!isStaff && (
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
            {/* Ring */}
            <div className="lg:col-span-1 bg-white/5 border border-white/10 rounded-2xl p-6 flex flex-col items-center justify-center gap-3">
              <div className="relative">
                <RingProgress pct={avgScore ?? 0} size={120} stroke={10}
                  color={avgScore ? pctColor(avgScore) : '#374151'} />
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-2xl font-black text-white leading-none">
                    {avgScore != null ? `${avgScore}%` : '—'}
                  </span>
                  {avgScore != null && (
                    <span className="text-sm font-bold" style={{ color: pctColor(avgScore) }}>
                      {letter(avgScore)}
                    </span>
                  )}
                </div>
              </div>
              <p className="text-xs text-white/40 text-center">Average Score</p>
            </div>

            {/* Stats grid */}
            <div className="lg:col-span-3 grid grid-cols-2 sm:grid-cols-3 gap-4">
              {[
                { label: 'Submitted', value: submissions.length, icon: ClipboardDocumentCheckIcon, color: 'text-blue-400', bg: 'bg-blue-500/10' },
                { label: 'Graded', value: completed, icon: CheckCircleIcon, color: 'text-emerald-400', bg: 'bg-emerald-500/10' },
                { label: 'Pending', value: pending, icon: ClockIcon, color: 'text-amber-400', bg: 'bg-amber-500/10' },
                { label: 'Best Score', value: best != null ? `${best}%` : '—', icon: TrophyIcon, color: 'text-yellow-400', bg: 'bg-yellow-500/10' },
                { label: 'Enrolled', value: enrollments.length, icon: BookOpenIcon, color: 'text-violet-400', bg: 'bg-violet-500/10' },
                { label: 'Average', value: avgScore != null ? `${avgScore}%` : '—', icon: ChartBarIcon, color: avgScore ? (avgScore >= 70 ? 'text-emerald-400' : 'text-amber-400') : 'text-white/20', bg: 'bg-white/5' },
              ].map(s => (
                <div key={s.label} className="bg-white/5 border border-white/10 rounded-2xl p-4">
                  <div className={`w-8 h-8 ${s.bg} rounded-xl flex items-center justify-center mb-2`}>
                    <s.icon className={`w-4 h-4 ${s.color}`} />
                  </div>
                  <p className={`text-xl font-extrabold ${s.color}`}>{s.value}</p>
                  <p className="text-xs text-white/40 mt-0.5">{s.label}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Staff stats */}
        {isStaff && (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { label: 'Total Submissions', value: submissions.length, icon: ClipboardDocumentCheckIcon, color: 'text-violet-400', bg: 'bg-violet-500/10' },
              { label: 'Graded', value: completed, icon: CheckCircleIcon, color: 'text-emerald-400', bg: 'bg-emerald-500/10' },
              { label: 'Awaiting Grade', value: pending, icon: ClockIcon, color: 'text-amber-400', bg: 'bg-amber-500/10' },
              {
                label: 'Class Average', value: avgScore != null ? `${avgScore}%` : '—', icon: ChartBarIcon,
                color: avgScore ? (avgScore >= 70 ? 'text-emerald-400' : 'text-amber-400') : 'text-white/20', bg: 'bg-blue-500/10'
              },
            ].map(s => (
              <div key={s.label} className="bg-white/5 border border-white/10 rounded-2xl p-5">
                <div className={`w-10 h-10 ${s.bg} rounded-xl flex items-center justify-center mb-3`}>
                  <s.icon className={`w-5 h-5 ${s.color}`} />
                </div>
                <p className={`text-2xl font-extrabold ${s.color}`}>{s.value}</p>
                <p className="text-xs text-white/40 mt-1">{s.label}</p>
              </div>
            ))}
          </div>
        )}

        {/* Enrollments */}
        {enrollments.length > 0 && (
          <div className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden">
            <div className="p-5 border-b border-white/10">
              <h3 className="font-bold text-white flex items-center gap-2">
                <BookOpenIcon className="w-5 h-5 text-violet-400" />
                {isStaff ? 'Program Enrollments' : 'My Enrolled Programs'}
              </h3>
            </div>
            <div className="divide-y divide-white/5">
              {enrollments.slice(0, 8).map((e: any) => {
                const prog = e.programs;
                const pct = e.progress_pct ?? 0;
                return (
                  <div key={e.id} className="p-5 flex items-center gap-4 hover:bg-white/5 transition-colors">
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-white text-sm">{prog?.name ?? 'Program'}</p>
                      {isStaff && e.portal_users && (
                        <p className="text-xs text-white/40">{e.portal_users.full_name}</p>
                      )}
                      <div className="flex items-center gap-2 mt-2">
                        <div className="flex-1 h-2 bg-white/5 rounded-full overflow-hidden">
                          <div style={{ width: `${pct}%` }} className="h-2 bg-violet-500 rounded-full transition-all duration-500" />
                        </div>
                        <span className="text-xs text-white/40 w-8 text-right">{pct}%</span>
                      </div>
                    </div>
                    <div className="flex-shrink-0 text-right">
                      <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold border capitalize
                        ${e.status === 'active' ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' :
                          e.status === 'completed' ? 'bg-blue-500/20 text-blue-400 border-blue-500/30' :
                            'bg-white/10 text-white/40 border-white/10'}`}>
                        {e.status}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Recent submissions */}
        {submissions.length > 0 && (
          <div className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden">
            <div className="p-5 border-b border-white/10">
              <h3 className="font-bold text-white flex items-center gap-2">
                <ClipboardDocumentCheckIcon className="w-5 h-5 text-emerald-400" />
                {isStaff ? 'Recent Submissions' : 'Assignment Results'}
              </h3>
            </div>
            <div className="divide-y divide-white/5">
              {submissions.slice(0, 10).map((s: any) => {
                const max = s.assignments?.max_points ?? 100;
                const pct = s.grade != null ? Math.round((s.grade / max) * 100) : null;
                return (
                  <div key={s.id} className="p-4 flex items-center gap-4 hover:bg-white/5 transition-colors">
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-white text-sm truncate">{s.assignments?.title ?? '—'}</p>
                      {isStaff && s.portal_users && (
                        <p className="text-xs text-white/40">{s.portal_users.full_name}</p>
                      )}
                      <p className="text-xs text-white/30 mt-0.5">
                        {s.assignments?.courses?.title}
                        {s.assignments?.courses?.programs?.name ? ` · ${s.assignments.courses.programs.name}` : ''}
                      </p>
                    </div>
                    <div className="flex-shrink-0 text-right">
                      {pct != null ? (
                        <>
                          <span className="font-extrabold text-lg" style={{ color: pctColor(pct) }}>
                            {letter(pct)}
                          </span>
                          <p className="text-xs text-white/30">{s.grade}/{max}</p>
                        </>
                      ) : (
                        <span className="text-xs text-white/20">
                          {s.status === 'submitted' ? 'Awaiting grade' : '—'}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {submissions.length === 0 && enrollments.length === 0 && !error && (
          <div className="text-center py-20 bg-white/5 border border-white/10 rounded-2xl">
            <ChartBarIcon className="w-14 h-14 mx-auto text-white/10 mb-4" />
            <p className="text-lg font-semibold text-white/30">No progress data yet</p>
            <p className="text-sm text-white/20 mt-1">
              {isStaff ? 'Students will appear here once they submit assignments.' : 'Submit assignments to start tracking your progress.'}
            </p>
          </div>
        )}

      </div>
    </div>
  );
}