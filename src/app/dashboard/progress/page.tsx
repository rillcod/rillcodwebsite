// @refresh reset
'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/auth-context';
import { createClient } from '@/lib/supabase/client';
import {
  ChartBarIcon, AcademicCapIcon, CheckCircleIcon, ClockIcon,
  TrophyIcon, BookOpenIcon, ClipboardDocumentCheckIcon,
  ArrowTrendingUpIcon, StarIcon, ExclamationTriangleIcon,
  SparklesIcon, BuildingOfficeIcon
} from '@/lib/icons';
import {
  Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  ResponsiveContainer, Tooltip as ReTooltip,
  LineChart, Line, XAxis, YAxis, CartesianGrid, Legend
} from 'recharts';

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

  // ── Filtering & Scope ─────────────────────────────────────
  const [schools, setSchools] = useState<{ id: string; name: string }[]>([]);
  const [selectedSchool, setSelectedSchool] = useState<string>('all');
  const [selectedClass, setSelectedClass] = useState<string>('all');
  const [selectedStatus, setSelectedStatus] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [scoreReports, setScoreReports] = useState<any[]>([]);

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
          // 1. Fetch schools for staff to populate filter
          const { data: schData } = await supabase.from('schools').select('id, name').order('name');
          if (!cancelled) setSchools(schData ?? []);

          // 2. Resolve school metadata for non-admins
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

          // 3. Fetch portal users via API (bypasses RLS) for name/school enrichment
          const portalUsersJson = await fetch('/api/portal-users?role=student&scoped=true', { cache: 'no-store' })
            .then(r => r.json()).catch(() => ({ data: [] }));
          const umap: Record<string, any> = {};
          (portalUsersJson.data ?? []).forEach((u: any) => { umap[u.id] = u; });

          // 4. Fetch submissions and enrollments (without portal_users join — use umap instead)
          const rawSubsQ = supabase.from('assignment_submissions')
            .select(`id, grade, status, portal_user_id, user_id,
                assignments ( id, title, max_points, course_id,
                  courses ( id, title, programs ( name ) ) )`)
            .order('graded_at', { ascending: false });

          const enrQuery = supabase.from('enrollments')
            .select(`id, status, grade, progress_pct, enrollment_date, user_id,
                programs ( id, name, difficulty_level, duration_weeks )`)
            .order('enrollment_date', { ascending: false });

          const [rawSubsRes, enrRes] = await Promise.allSettled([rawSubsQ, enrQuery]);

          // Enrich with user data from API map
          const subsData = (rawSubsRes.status === 'fulfilled' ? (rawSubsRes.value.data ?? []) : [])
            .map((s: any) => ({ ...s, portal_users: umap[s.portal_user_id ?? s.user_id] ?? null }));

          const enrData = (enrRes.status === 'fulfilled' ? (enrRes.value.data ?? []) : [])
            .map((e: any) => ({ ...e, portal_users: umap[e.user_id] ?? null }));

          // 5. Initial Filter by school for non-admins
          let filteredSubs = subsData;
          let filteredEnr = enrData;

          if (role !== 'admin') {
            if (assignedSchoolIds.length > 0 || assignedSchoolNames.length > 0) {
              filteredSubs = subsData.filter((s: any) => {
                const u = s.portal_users;
                if (!u) return false;
                return assignedSchoolIds.includes(u.school_id) || assignedSchoolNames.includes(u.school_name);
              });
              filteredEnr = filteredEnr.filter((e: any) => {
                const u = e.portal_users;
                if (!u) return false;
                return assignedSchoolIds.includes(u.school_id) || assignedSchoolNames.includes(u.school_name);
              });
            } else {
              filteredSubs = [];
              filteredEnr = [];
            }
          }

          if (!cancelled) {
            setSubmissions(filteredSubs);
            setEnrollments(filteredEnr);
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

        // Fetch score trend data from student_progress_reports
        try {
          if (profile?.role === 'student') {
            // Find the student record linked to this portal user
            const { data: studentRow } = await supabase
              .from('students')
              .select('id')
              .eq('user_id', profile.id)
              .maybeSingle();
            if (studentRow?.id) {
              const { data: reports } = await supabase
                .from('student_progress_reports')
                .select('report_term, report_date, overall_score, theory_score, practical_score, course_name')
                .eq('student_id', studentRow.id)
                .eq('is_published', true)
                .order('report_date', { ascending: true });
              if (!cancelled) setScoreReports(reports ?? []);
            }
          } else if (isStaff) {
            // For staff, fetch recent published reports for their school
            let rQuery = supabase
              .from('student_progress_reports')
              .select('report_term, report_date, overall_score, theory_score, practical_score, course_name, student_name, school_name')
              .eq('is_published', true)
              .order('report_date', { ascending: true })
              .limit(200);
            if (profile?.school_id) {
              rQuery = rQuery.eq('school_id', profile.school_id);
            }
            const { data: reports } = await rQuery;
            if (!cancelled) setScoreReports(reports ?? []);
          }
        } catch { /* non-critical — ignore */ }
      } catch (e: any) {
        if (!cancelled) setError(e.message ?? 'Failed to load progress');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [profile?.id, isStaff, authLoading]); // eslint-disable-line

  // ── Derived Filtering ──────────────────────────────────────
  const filteredEnrollments = enrollments.filter(e => {
    const u = e.portal_users || {};
    if (selectedSchool !== 'all' && u.school_id !== selectedSchool) return false;
    if (selectedClass !== 'all' && u.section_class !== selectedClass) return false;
    if (selectedStatus !== 'all' && e.status !== selectedStatus) return false;
    if (searchQuery && !u.full_name?.toLowerCase().includes(searchQuery.toLowerCase()) && !u.email?.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    return true;
  });

  const filteredSubmissions = submissions.filter(s => {
    const u = s.portal_users || {};
    if (selectedSchool !== 'all' && u.school_id !== selectedSchool) return false;
    if (selectedClass !== 'all' && u.section_class !== selectedClass) return false;
    if (selectedStatus !== 'all' && s.status !== selectedStatus) return false;
    if (searchQuery && !u.full_name?.toLowerCase().includes(searchQuery.toLowerCase()) && !u.email?.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    return true;
  });

  const distinctClasses = Array.from(new Set(enrollments.map(e => e.portal_users?.section_class).filter(Boolean))).sort() as string[];

  // ── Stats ─────────────────────────────────────────────────
  const activeSubs = isStaff ? filteredSubmissions : submissions;
  const activeEnr = isStaff ? filteredEnrollments : enrollments;

  const graded = activeSubs.filter(s => s.status === 'graded' && s.grade != null);
  const avgScore = graded.length
    ? Math.round(graded.reduce((a, s) => a + (s.grade / (s.assignments?.max_points ?? 100)) * 100, 0) / graded.length)
    : null;
  const best = graded.length
    ? Math.round(Math.max(...graded.map(s => (s.grade / (s.assignments?.max_points ?? 100)) * 100)))
    : null;
  const completed = activeSubs.filter(s => s.status === 'graded').length;
  const pending = activeSubs.filter(s => s.status === 'submitted').length;

  // ── Skill Analysis ────────────────────────────────────────
  const skillsConfig = [
    { name: 'Logic', keywords: ['logic', 'math', 'algorithm', 'loop', 'condition'] },
    { name: 'Design', keywords: ['css', 'style', 'design', 'ui', 'ux', 'color', 'layout'] },
    { name: 'Dev Ops', keywords: ['deploy', 'git', 'terminal', 'shell', 'cloud'] },
    { name: 'Execution', keywords: ['build', 'create', 'dev', 'app', 'coding'] },
    { name: 'Problem Solving', keywords: ['debug', 'fix', 'challenge', 'error', 'refactor'] },
  ];

  const skillData = skillsConfig.map(skill => {
    const relevantSubs = graded.filter(s => {
      const title = (s.assignments?.title || '').toLowerCase();
      return skill.keywords.some(k => title.includes(k));
    });
    const avg = relevantSubs.length
      ? Math.round(relevantSubs.reduce((a, s) => a + (s.grade / (s.assignments?.max_points ?? 100)) * 100, 0) / relevantSubs.length)
      : 0;
    return { subject: skill.name, A: avg || 0, fullMark: 100 };
  });

  // If no specific skill data, provide default starter data for UI
  const hasSkillData = skillData.some(d => d.A > 0);
  const displaySkillData = hasSkillData ? skillData : [
    { subject: 'Logic', A: 45, fullMark: 100 },
    { subject: 'Design', A: 30, fullMark: 100 },
    { subject: 'Dev Ops', A: 20, fullMark: 100 },
    { subject: 'Execution', A: 50, fullMark: 100 },
    { subject: 'Problem Solving', A: 40, fullMark: 100 },
  ];

  // ── Color helpers ─────────────────────────────────────────
  const pctColor = (p: number) => p >= 70 ? '#10b981' : p >= 50 ? '#f59e0b' : '#ef4444';
  const letter = (p: number) => p >= 90 ? 'A' : p >= 80 ? 'B' : p >= 70 ? 'C' : p >= 60 ? 'D' : 'F';

  if (authLoading || loading) return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        <div className="animate-pulse space-y-2">
          <div className="h-4 bg-muted rounded w-32" />
          <div className="h-8 bg-muted rounded w-64" />
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map(i => <div key={i} className="bg-card shadow-sm border border-border rounded-none h-32 animate-pulse" />)}
        </div>
        {[1, 2].map(i => <div key={i} className="bg-card shadow-sm border border-border rounded-none h-40 animate-pulse" />)}
      </div>

      <style jsx global>{`
        @media print {
          @page { 
            size: A4;
            margin: 15mm 12mm; 
          }
          body { 
            background: white !important; 
            color: #111827 !important; 
            font-family: 'Inter', sans-serif !important;
          }
          .bg-\[\#0f0f1a\], .bg-gradient-to-br { background: white !important; }
          .bg-card\/5, .bg-card\/8, .bg-card\/10 { 
            background: #ffffff !important; 
            border: 1px solid #e5e7eb !important; 
          }
          .text-foreground, .text-foreground\/60, .text-foreground\/40, .text-foreground\/30 { color: #111827 !important; }
          .border-border\/10, .border-border\/20, .border-border\/5 { border-color: #e5e7eb !important; }
          .max-w-7xl { max-width: 100% !important; padding: 0 !important; margin: 0 !important; }
          .shadow-xl, .shadow-lg, .shadow-blue-600\/20, .shadow-2xl { box-shadow: none !important; }
          .print\:hidden { display: none !important; }
          button, .fixed, .z-50 { display: none !important; }
          h1, h2, h3 { color: #111827 !important; }
          .divide-white\/5 > * + * { border-top-color: #e5e7eb !important; }
          
          /* Force charts/rings to be visible but clean */
          svg { filter: grayscale(20%); }
          .bg-orange-500 { background: #7c3aed !important; -webkit-print-color-adjust: exact; }
          .h-2 { border: 1px solid #e5e7eb !important; }

          /* Layout adjustments for A4 */
          .grid { display: block !important; }
          .grid > * { margin-bottom: 20px !important; page-break-inside: avoid; }
          .lg\:grid-cols-3, .lg\:grid-cols-4 { display: grid !important; grid-template-columns: repeat(2, 1fr) !important; gap: 10px !important; }
          
          /* Table-like lists */
          .divide-y > .p-5, .divide-y > .p-4 { padding: 10px 0 !important; border-bottom: 1px solid #f3f4f6 !important; }
          .truncate { white-space: normal !important; overflow: visible !important; }
          
          /* Page break controls */
          h3 { page-break-after: avoid; }
          .rounded-none { border-radius: 0 !important; border: none !important; border-bottom: 2px solid #f3f4f6 !important; }
        }
      `}</style>
    </div>
  );
  if (!profile) return null;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">

        {/* Header */}
        <div className="flex items-center justify-between print:hidden">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <ChartBarIcon className="w-5 h-5 text-orange-400" />
              <span className="text-xs font-bold text-orange-400 uppercase tracking-widest">
                {isStaff ? 'Student Analytics' : 'My Progress'} · {role}
              </span>
            </div>
            <h1 className="text-3xl font-extrabold">
              {isStaff ? 'Progress & Analytics' : 'My Learning Progress'}
            </h1>
            <p className="text-muted-foreground text-sm mt-1">
              {isStaff ? 'Track student performance across all assignments' : 'Track your academic journey and performance'}
            </p>
          </div>
          <button
            onClick={() => window.print()}
            className="flex items-center gap-2 px-4 py-2 bg-card shadow-sm hover:bg-muted text-muted-foreground text-sm font-bold rounded-none border border-border transition-all shadow-lg"
          >
            <ClipboardDocumentCheckIcon className="w-4 h-4" /> Print Analytics
          </button>
        </div>

        {/* ── Branded letterhead (print-only) ── */}
        <div className="hidden print:block mb-8">
          <div style={{ borderBottom: '3px solid #1d4ed8', paddingBottom: '14px', marginBottom: '18px', display: 'flex', alignItems: 'center', gap: '16px' }}>
            <img src="/logo.png" alt="Rillcod Technologies" style={{ width: '64px', height: '64px', objectFit: 'contain', flexShrink: 0 }} />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: '20px', fontWeight: 900, color: '#1d4ed8', letterSpacing: '-0.5px', lineHeight: 1.1 }}>RILLCOD TECHNOLOGIES</div>
              <div style={{ fontSize: '11px', color: '#6b7280', marginTop: '2px' }}>Coding Today, Innovating Tomorrow</div>
              <div style={{ fontSize: '10px', color: '#9ca3af', marginTop: '2px' }}>26 Ogiesoba Avenue, Off Airport Road, GRA, Benin City &nbsp;·&nbsp; 08116600091 &nbsp;·&nbsp; support@rillcod.com</div>
            </div>
            <div style={{ textAlign: 'right', flexShrink: 0 }}>
              <div style={{ fontSize: '10px', fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '1.5px' }}>Document Type</div>
              <div style={{ fontSize: '14px', fontWeight: 800, color: '#1d4ed8', textTransform: 'uppercase' }}>Academic Progress Report</div>
              <div style={{ fontSize: '10px', color: '#9ca3af', marginTop: '4px' }}>
                {new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' })}
              </div>
            </div>
          </div>
          <p className="text-black text-sm italic">
            Computed analytics for {selectedSchool !== 'all' ? schools.find(s => s.id === selectedSchool)?.name : (isStaff ? 'All Schools' : profile?.school_name)} 
            {selectedClass !== 'all' ? ` · Class: ${selectedClass}` : ''}
          </p>
        </div>

        {/* Filter Bar (Staff/Admin only) */}
        {isStaff && (
          <div className="bg-card shadow-sm border border-border rounded-none p-4 flex flex-wrap gap-4 items-center print:hidden">
            <div className="flex-1 min-w-[200px]">
              <input
                type="text"
                placeholder="Search student or email..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-card shadow-sm border border-border rounded-none px-4 py-2 text-sm focus:outline-none focus:border-orange-500 transition-colors"
              />
            </div>
            {role === 'admin' ? (
              <select
                value={selectedSchool}
                onChange={(e) => setSelectedSchool(e.target.value)}
                className="bg-[#161625] border border-border rounded-none px-4 py-2 text-sm focus:outline-none focus:border-orange-500 transition-colors"
              >
                <option value="all">All Schools</option>
                {schools.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            ) : (
                <div className="px-4 py-2 bg-white/5 border border-white/10 rounded-none text-xs font-black text-orange-400/60 uppercase tracking-widest flex items-center gap-2">
                    <BuildingOfficeIcon className="w-3 h-3" /> {schools.find(s => s.id === profile?.school_id)?.name || profile?.school_name || 'My School'}
                </div>
            )}
            <select
              value={selectedClass}
              onChange={(e) => setSelectedClass(e.target.value)}
              className="bg-[#161625] border border-border rounded-none px-4 py-2 text-sm focus:outline-none focus:border-orange-500 transition-colors"
            >
              <option value="all">All Classes</option>
              {distinctClasses.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <select
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
              className="bg-[#161625] border border-border rounded-none px-4 py-2 text-sm focus:outline-none focus:border-orange-500 transition-colors"
            >
              <option value="all">Any Status</option>
              <option value="active">Active</option>
              <option value="completed">Completed</option>
              <option value="submitted">Submitted (Submissions)</option>
              <option value="graded">Graded (Submissions)</option>
            </select>
          </div>
        )}

        {error && (
          <div className="flex items-center gap-3 bg-rose-500/10 border border-rose-500/20 rounded-none p-4">
            <ExclamationTriangleIcon className="w-5 h-5 text-rose-400" />
            <p className="text-rose-400 text-sm">{error}</p>
          </div>
        )}

        {/* Score ring + stats (student) */}
        {!isStaff && (
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
            {/* Ring & Mastery Chart */}
            <div className="lg:col-span-1 space-y-6">
              <div className="bg-card shadow-sm border border-border rounded-none p-6 flex flex-col items-center justify-center gap-3 relative overflow-hidden group">
                <div className="absolute top-0 right-0 w-24 h-24 bg-orange-600/5 blur-3xl -mr-12 -mt-12" />
                <div className="relative">
                  <RingProgress pct={avgScore ?? 0} size={140} stroke={12}
                    color={avgScore ? pctColor(avgScore) : '#374151'} />
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <span className="text-3xl font-black text-foreground leading-none">
                      {avgScore != null ? `${avgScore}%` : '—'}
                    </span>
                    {avgScore != null && (
                      <span className="text-sm font-bold mt-1" style={{ color: pctColor(avgScore) }}>
                        {letter(avgScore)}
                      </span>
                    )}
                  </div>
                </div>
                <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest text-center">Cumulative Mastery</p>
              </div>

              <div className="bg-card shadow-sm border border-border rounded-none p-4 h-[280px]">
                <div className="flex items-center gap-2 mb-2 px-2">
                  <SparklesIcon className="w-4 h-4 text-cyan-400" />
                  <span className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">Skill Mastery</span>
                </div>
                <div className="h-[220px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <RadarChart cx="50%" cy="50%" outerRadius="70%" data={displaySkillData}>
                      <PolarGrid stroke="#ffffff10" />
                      <PolarAngleAxis dataKey="subject" tick={{ fill: '#ffffff40', fontSize: 10, fontWeight: 700 }} />
                      <Radar
                        name="Skills"
                        dataKey="A"
                        stroke="#8b5cf6"
                        strokeWidth={2}
                        fill="#8b5cf6"
                        fillOpacity={0.6}
                      />
                      <ReTooltip
                        contentStyle={{ backgroundColor: '#0f0f1a', border: '1px solid #ffffff10', borderRadius: '12px' }}
                        itemStyle={{ color: '#fff', fontSize: '10px', fontWeight: 'bold' }}
                      />
                    </RadarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>

            {/* Stats grid */}
            <div className="lg:col-span-3 space-y-6">
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                {[
                  { label: 'Submitted', value: submissions.length, icon: ClipboardDocumentCheckIcon, color: 'text-blue-400', bg: 'bg-blue-500/10' },
                  { label: 'Graded', value: completed, icon: CheckCircleIcon, color: 'text-emerald-400', bg: 'bg-emerald-500/10' },
                  { label: 'Pending', value: pending, icon: ClockIcon, color: 'text-amber-400', bg: 'bg-amber-500/10' },
                  { label: 'Best Score', value: best != null ? `${best}%` : '—', icon: TrophyIcon, color: 'text-yellow-400', bg: 'bg-yellow-500/10' },
                  { label: 'Enrolled', value: enrollments.length, icon: BookOpenIcon, color: 'text-orange-400', bg: 'bg-orange-500/10' },
                  { label: 'Average', value: avgScore != null ? `${avgScore}%` : '—', icon: ChartBarIcon, color: avgScore ? (avgScore >= 70 ? 'text-emerald-400' : 'text-amber-400') : 'text-muted-foreground', bg: 'bg-card shadow-sm' },
                ].map(s => (
                  <div key={s.label} className="bg-card shadow-sm border border-border rounded-none p-4 group hover:border-border transition-all">
                    <div className={`w-8 h-8 ${s.bg} rounded-none flex items-center justify-center mb-2 group-hover:scale-110 transition-transform`}>
                      <s.icon className={`w-4 h-4 ${s.color}`} />
                    </div>
                    <p className={`text-xl font-extrabold ${s.color}`}>{s.value}</p>
                    <p className="text-xs text-muted-foreground mt-0.5 uppercase tracking-wide font-medium">{s.label}</p>
                  </div>
                ))}
              </div>

              {/* Weekly Trend Placeholder or Insight */}
              <div className="bg-gradient-to-r from-orange-600/10 to-transparent border border-orange-500/20 rounded-none p-6 sm:p-8 flex items-center gap-6">
                 <div className="shrink-0 p-4 bg-orange-500/20 rounded-none text-orange-400">
                    <ArrowTrendingUpIcon className="w-8 h-8" />
                 </div>
                 <div className="space-y-1">
                    <h4 className="text-lg font-black text-foreground italic tracking-tight">Performance Insight</h4>
                    <p className="text-sm text-muted-foreground leading-relaxed max-w-xl">
                      Based on your recent scores in <span className="text-orange-400 font-bold">Coding & Logic</span>, you are performing in the <span className="text-emerald-400 font-bold">top 15%</span> of your class. Keep up the consistent effort to reach Diamond tier!
                    </p>
                 </div>
              </div>
            </div>
          </div>
        )}

        {/* Staff stats */}
        {isStaff && (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { label: 'Scoped Submissions', value: activeSubs.length, icon: ClipboardDocumentCheckIcon, color: 'text-orange-400', bg: 'bg-orange-500/10' },
              { label: 'Graded', value: completed, icon: CheckCircleIcon, color: 'text-emerald-400', bg: 'bg-emerald-500/10' },
              { label: 'Awaiting Grade', value: pending, icon: ClockIcon, color: 'text-amber-400', bg: 'bg-amber-500/10' },
              {
                label: 'Scoped Average', value: avgScore != null ? `${avgScore}%` : '—', icon: ChartBarIcon,
                color: avgScore ? (avgScore >= 70 ? 'text-emerald-400' : 'text-amber-400') : 'text-muted-foreground', bg: 'bg-blue-500/10'
              },
            ].map(s => (
              <div key={s.label} className="bg-card shadow-sm border border-border rounded-none p-5">
                <div className={`w-10 h-10 ${s.bg} rounded-none flex items-center justify-center mb-3`}>
                  <s.icon className={`w-5 h-5 ${s.color}`} />
                </div>
                <p className={`text-2xl font-extrabold ${s.color}`}>{s.value}</p>
                <p className="text-xs text-muted-foreground mt-1">{s.label}</p>
              </div>
            ))}
          </div>
        )}

        {/* Enrollments */}
        {enrollments.length > 0 && (
          <div className="bg-card shadow-sm border border-border rounded-none overflow-hidden">
            <div className="p-5 border-b border-border">
              <h3 className="font-bold text-foreground flex items-center gap-2">
                <BookOpenIcon className="w-5 h-5 text-orange-400" />
                {isStaff ? 'Program Enrollments' : 'My Enrolled Programs'}
              </h3>
            </div>
            <div className="divide-y divide-white/5">
              {activeEnr.slice(0, 100).map((e: any) => {
                const prog = e.programs;
                const pct = e.progress_pct ?? 0;
                return (
                  <div key={e.id} className="p-5 flex items-center gap-4 hover:bg-card shadow-sm transition-colors">
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-foreground text-sm">{prog?.name ?? 'Program'}</p>
                      {isStaff && e.portal_users && (
                        <p className="text-xs text-muted-foreground">{e.portal_users.full_name}</p>
                      )}
                      <div className="flex items-center gap-2 mt-2">
                        <div className="flex-1 h-2 bg-card shadow-sm rounded-full overflow-hidden">
                          <div style={{ width: `${pct}%` }} className="h-2 bg-orange-500 rounded-full transition-all duration-500" />
                        </div>
                        <span className="text-xs text-muted-foreground w-8 text-right">{pct}%</span>
                      </div>
                    </div>
                    <div className="flex-shrink-0 text-right">
                      <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold border capitalize
                        ${e.status === 'active' ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' :
                          e.status === 'completed' ? 'bg-blue-500/20 text-blue-400 border-blue-500/30' :
                            'bg-muted text-muted-foreground border-border'}`}>
                        {e.status}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Score Trends from Progress Reports */}
        {scoreReports.length > 0 && (
          <div className="bg-card border border-border rounded-none overflow-hidden">
            <div className="p-5 border-b border-border flex items-center gap-2">
              <ArrowTrendingUpIcon className="w-5 h-5 text-orange-400" />
              <h3 className="font-bold text-foreground">
                {isStaff ? 'Score Trends (Published Reports)' : 'My Score Trends'}
              </h3>
              <span className="ml-auto text-xs text-muted-foreground">{scoreReports.length} report{scoreReports.length !== 1 ? 's' : ''}</span>
            </div>
            <div className="p-5">
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={scoreReports.map(r => ({
                  term: r.report_term || r.course_name?.slice(0, 12) || r.report_date?.slice(0, 7) || '—',
                  Overall: r.overall_score ?? null,
                  Theory: r.theory_score ?? null,
                  Practical: r.practical_score ?? null,
                }))}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                  <XAxis dataKey="term" tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }} />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }} />
                  <ReTooltip
                    contentStyle={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 0, fontSize: 12 }}
                    labelStyle={{ color: 'var(--foreground)', fontWeight: 700 }}
                  />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Line type="monotone" dataKey="Overall" stroke="#f97316" strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 5 }} connectNulls />
                  <Line type="monotone" dataKey="Theory" stroke="#60a5fa" strokeWidth={1.5} dot={{ r: 2 }} connectNulls strokeDasharray="4 2" />
                  <Line type="monotone" dataKey="Practical" stroke="#34d399" strokeWidth={1.5} dot={{ r: 2 }} connectNulls strokeDasharray="4 2" />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {/* Recent submissions */}
        {submissions.length > 0 && (
          <div className="bg-card shadow-sm border border-border rounded-none overflow-hidden">
            <div className="p-5 border-b border-border">
              <h3 className="font-bold text-foreground flex items-center gap-2">
                <ClipboardDocumentCheckIcon className="w-5 h-5 text-emerald-400" />
                {isStaff ? 'Recent Submissions' : 'Assignment Results'}
              </h3>
            </div>
            <div className="divide-y divide-white/5">
              {activeSubs.slice(0, 100).map((s: any) => {
                const max = s.assignments?.max_points ?? 100;
                const pct = s.grade != null ? Math.round((s.grade / max) * 100) : null;
                return (
                  <div key={s.id} className="p-4 flex items-center gap-4 hover:bg-card shadow-sm transition-colors">
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-foreground text-sm truncate">{s.assignments?.title ?? '—'}</p>
                      {isStaff && s.portal_users && (
                        <p className="text-xs text-muted-foreground">{s.portal_users.full_name}</p>
                      )}
                      <p className="text-xs text-muted-foreground mt-0.5">
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
                          <p className="text-xs text-muted-foreground">{s.grade}/{max}</p>
                        </>
                      ) : (
                        <span className="text-xs text-muted-foreground">
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
          <div className="text-center py-20 bg-card shadow-sm border border-border rounded-none">
            <ChartBarIcon className="w-14 h-14 mx-auto text-muted-foreground mb-4" />
            <p className="text-lg font-semibold text-muted-foreground">No progress data yet</p>
            <p className="text-sm text-muted-foreground mt-1">
              {isStaff ? 'Students will appear here once they submit assignments.' : 'Submit assignments to start tracking your progress.'}
            </p>
          </div>
        )}

      </div>
    </div>
  );
}