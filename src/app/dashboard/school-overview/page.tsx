// @refresh reset
'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/auth-context';
import { createClient } from '@/lib/supabase/client';
import Link from 'next/link';
import {
  UserGroupIcon, AcademicCapIcon, TrophyIcon, ChartBarIcon,
  DocumentArrowDownIcon, ClipboardDocumentCheckIcon, ArrowTrendingUpIcon,
  StarIcon, BookOpenIcon, CalendarDaysIcon, CheckCircleIcon,
  ExclamationCircleIcon, ClockIcon,
} from '@/lib/icons';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { DonutChart as RechartDonut, HorizontalBarChart, SparkCard, CHART_COLORS } from '@/components/charts';

interface StudentRow {
  id: string;
  full_name: string;
  email: string;
  section_class: string | null;
  is_active: boolean;
  avgGrade: number;
  attendance: number;
  submissions: number;
}

interface Stats {
  total: number;
  active: number;
  avgScore: number;
  avgAttendance: number;
}

function StatCard({ icon: Icon, label, value, sub, color }: {
  icon: any; label: string; value: string | number; sub?: string; color: string;
}) {
  return (
    <div className="bg-[#0d1526] border border-border rounded-none p-5 flex items-center gap-4">
      <div className={`w-12 h-12 rounded-none flex items-center justify-center flex-shrink-0 ${color}`}>
        <Icon className="w-6 h-6" />
      </div>
      <div>
        <p className="text-muted-foreground text-xs font-bold uppercase tracking-widest">{label}</p>
        <p className="text-2xl font-black text-foreground">{value}</p>
        {sub && <p className="text-muted-foreground text-xs mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

function ScoreBadge({ score }: { score: number }) {
  const color = score >= 75 ? 'text-emerald-400 bg-emerald-400/10' :
    score >= 50 ? 'text-yellow-400 bg-yellow-400/10' : 'text-rose-400 bg-rose-400/10';
  return (
    <span className={`text-xs font-black px-2 py-0.5 rounded-full ${color}`}>
      {score.toFixed(0)}%
    </span>
  );
}

// Donut ring chart — pure SVG, no library
function DonutChart({ segments, label, center }: {
  segments: { value: number; color: string; label: string }[];
  label: string;
  center: string;
}) {
  const r = 38;
  const cx = 50;
  const cy = 50;
  const circ = 2 * Math.PI * r;
  const total = segments.reduce((s, x) => s + x.value, 0) || 1;
  let offset = 0;
  const arcs = segments.map(seg => {
    const dash = (seg.value / total) * circ;
    const gap = circ - dash;
    const arc = { dash, gap, offset, ...seg };
    offset += dash;
    return arc;
  });
  return (
    <div className="flex flex-col items-center gap-3">
      <div className="relative w-24 h-24">
        <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
          {total === 0 && (
            <circle cx={cx} cy={cy} r={r} fill="none" stroke="currentColor" strokeWidth="10" className="text-border" />
          )}
          {arcs.map((arc, i) => arc.value > 0 && (
            <circle key={i} cx={cx} cy={cy} r={r} fill="none"
              stroke={arc.color} strokeWidth="10"
              strokeDasharray={`${arc.dash} ${arc.gap}`}
              strokeDashoffset={-arc.offset}
            />
          ))}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-sm font-black text-foreground leading-none">{center}</span>
        </div>
      </div>
      <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest text-center">{label}</p>
      <div className="flex flex-wrap justify-center gap-x-3 gap-y-1">
        {segments.map(seg => (
          <div key={seg.label} className="flex items-center gap-1">
            <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: seg.color }} />
            <span className="text-[10px] text-muted-foreground">{seg.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function SchoolOverviewPage() {
  const { profile, loading: authLoading } = useAuth();
  const [students, setStudents] = useState<StudentRow[]>([]);
  const [stats, setStats] = useState<Stats>({ total: 0, active: 0, avgScore: 0, avgAttendance: 0 });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState<'name' | 'grade' | 'attendance'>('grade');

  useEffect(() => {
    if (authLoading || !profile) return;
    if (profile.role !== 'school' && profile.role !== 'admin') return;
    load();
  }, [profile?.id, authLoading]); // eslint-disable-line

  async function load() {
    setLoading(true);
    const supabase = createClient();
    const schoolId = profile?.school_id;
    const schoolName = profile?.school_name;

    // 1. Fetch ALL registered students for this school (from students table)
    let studAppsQuery = supabase
      .from('students')
      .select('id, full_name, status, enrollment_type');

    if (schoolId) {
      if (schoolName) {
        studAppsQuery = studAppsQuery.or(`school_id.eq.${schoolId},school_name.eq.${JSON.stringify(schoolName)}`);
      } else {
        studAppsQuery = studAppsQuery.eq('school_id', schoolId);
      }
    } else if (schoolName) {
      studAppsQuery = studAppsQuery.eq('school_name', schoolName);
    } else {
      setLoading(false); return;
    }

    const { data: allApps } = await studAppsQuery;
    const totalCount = allApps?.length || 0;
    const approvedCount = allApps?.filter(s => s.status === 'approved' || s.status === 'active').length || 0;

    // 2. Fetch PORTAL USERS for detailed metrics (grades/attendance)
    let portalQuery = supabase
      .from('portal_users')
      .select('id, full_name, email, section_class, is_active')
      .eq('role', 'student')
      .neq('is_deleted', true);

    if (schoolId) {
      if (schoolName) {
        portalQuery = portalQuery.or(`school_id.eq.${schoolId},school_name.eq.${JSON.stringify(schoolName)}`);
      } else {
        portalQuery = portalQuery.eq('school_id', schoolId);
      }
    } else if (schoolName) {
      portalQuery = portalQuery.eq('school_name', schoolName);
    }

    const { data: portalStudents } = await portalQuery;

    if (!portalStudents?.length) {
      setStats({ total: totalCount, active: approvedCount, avgScore: 0, avgAttendance: 0 });
      setStudents([]);
      setLoading(false);
      return;
    }

    const ids = portalStudents.map(s => s.id);

    // 3. Detailed metrics
    const [subsRes, attRes] = await Promise.all([
      supabase.from('assignment_submissions')
        .select('portal_user_id, user_id, grade, status')
        .or(`portal_user_id.in.(${ids.join(',')}),user_id.in.(${ids.join(',')})`),
      supabase.from('attendance').select('user_id, status').in('user_id', ids)
    ]);

    const subs = subsRes.data || [];
    const attRows = attRes.data || [];

    const rows: StudentRow[] = portalStudents.map(s => {
      const mySubs = (subs ?? []).filter(x => (x.portal_user_id === s.id || x.user_id === s.id) && x.grade != null);
      const avgGrade = mySubs.length
        ? mySubs.reduce((acc, x) => acc + Number(x.grade), 0) / mySubs.length
        : 0;

      const myAtt = (attRows ?? []).filter(x => x.user_id === s.id);
      const present = myAtt.filter(x => x.status === 'present' || x.status === 'late').length;
      const attendance = myAtt.length ? Math.round((present / myAtt.length) * 100) : 0;

      return {
        id: s.id,
        full_name: s.full_name,
        email: s.email,
        section_class: s.section_class,
        is_active: s.is_active ?? false,
        avgGrade,
        attendance,
        submissions: mySubs.length,
      };
    });

    const avgScore = rows.length ? rows.reduce((a, r) => a + r.avgGrade, 0) / rows.length : 0;
    const avgAttendance = rows.length ? rows.reduce((a, r) => a + r.attendance, 0) / rows.length : 0;

    setStats({ total: totalCount, active: approvedCount, avgScore, avgAttendance });
    setStudents(rows);
    setLoading(false);
  }

  function exportPDF() {
    const doc = new jsPDF();
    doc.setFontSize(18);
    doc.text('School Performance Report', 14, 22);
    doc.setFontSize(11);
    doc.setTextColor(120);
    doc.text(`Generated: ${new Date().toLocaleDateString()}`, 14, 30);

    autoTable(doc, {
      startY: 38,
      head: [['Student', 'Section', 'Avg Score', 'Attendance', 'Submissions']],
      body: filtered.map(s => [
        s.full_name,
        s.section_class ?? '—',
        `${s.avgGrade.toFixed(0)}%`,
        `${s.attendance}%`,
        s.submissions,
      ]),
      styles: { fontSize: 9 },
      headStyles: { fillColor: [122, 6, 6] },
    });

    doc.save('school-report.pdf');
  }

  const filtered = students
    .filter(s => s.full_name.toLowerCase().includes(search.toLowerCase()) ||
      s.email.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => {
      if (sortBy === 'grade') return b.avgGrade - a.avgGrade;
      if (sortBy === 'attendance') return b.attendance - a.attendance;
      return a.full_name.localeCompare(b.full_name);
    });

  if (authLoading || loading) return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="w-10 h-10 border-4 border-[#7a0606] border-t-transparent rounded-full animate-spin" />
    </div>
  );

  if (profile?.role !== 'school' && profile?.role !== 'admin') return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <p className="text-muted-foreground">Access restricted to partner schools.</p>
    </div>
  );

  return (
    <div className="min-h-screen bg-background px-4 py-6 md:px-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-8 flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-black text-foreground">School Overview</h1>
          <p className="text-muted-foreground text-sm mt-1">
            {profile?.school_name ?? 'Your School'} · Partner Dashboard
          </p>
        </div>
        <div className="flex gap-3">
          <Link
            href={`/dashboard/timetable?school_id=${profile?.school_id}`}
            className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-foreground text-sm font-bold rounded-none transition-colors"
          >
            <CalendarDaysIcon className="w-4 h-4" /> View Schedule
          </Link>
          <Link
            href="/dashboard/students/import"
            className="flex items-center gap-2 px-4 py-2 bg-primary hover:bg-primary text-foreground text-sm font-bold rounded-none transition-colors"
          >
            <UserGroupIcon className="w-4 h-4" /> Import Students
          </Link>
          <button
            onClick={exportPDF}
            className="flex items-center gap-2 px-4 py-2 bg-[#7a0606] hover:bg-[#9a0808] text-foreground text-sm font-bold rounded-none transition-colors"
          >
            <DocumentArrowDownIcon className="w-4 h-4" /> Export PDF
          </button>
        </div>
      </div>

      {/* SparkCard KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <SparkCard label="Total Students"   value={stats.total}                         subValue={`${stats.active} active`}      color={CHART_COLORS.orange}  icon={UserGroupIcon}            sparkData={[stats.total - 5, stats.total - 3, stats.total - 1, stats.total]} />
        <SparkCard label="Avg Score"        value={`${stats.avgScore.toFixed(0)}%`}     subValue="Across all assignments"        color={CHART_COLORS.amber}   icon={TrophyIcon}               sparkData={[40, 55, stats.avgScore * 0.8, stats.avgScore * 0.9, stats.avgScore]} />
        <SparkCard label="Avg Attendance"   value={`${stats.avgAttendance.toFixed(0)}%`} subValue="Present rate"                 color={CHART_COLORS.emerald} icon={ClipboardDocumentCheckIcon} sparkData={[60, 70, stats.avgAttendance * 0.85, stats.avgAttendance]} />
        <SparkCard label="Active Learners"  value={stats.active}                        subValue="Portal students"               color={CHART_COLORS.blue}    icon={AcademicCapIcon}          sparkData={[stats.active - 3, stats.active - 1, stats.active]} />
      </div>

      {/* Analytics row — recharts charts */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        {/* Score Distribution Donut */}
        <div className="bg-[#0d1526] border border-border p-5 space-y-4">
          <p className="text-xs font-black text-muted-foreground uppercase tracking-widest">Score Distribution</p>
          <RechartDonut
            data={[
              { label: 'Excellent (75+)', color: CHART_COLORS.emerald, value: students.filter(s => s.avgGrade >= 75).length },
              { label: 'Good (50–74)',    color: CHART_COLORS.amber,   value: students.filter(s => s.avgGrade >= 50 && s.avgGrade < 75).length },
              { label: 'At Risk (<50)',  color: CHART_COLORS.rose,    value: students.filter(s => s.avgGrade > 0 && s.avgGrade < 50).length },
              { label: 'No Data',        color: '#374151',              value: students.filter(s => s.avgGrade === 0).length },
            ]}
            centerLabel="Avg Score"
            centerValue={`${stats.avgScore.toFixed(0)}%`}
            height={200}
            innerRadius={55}
            outerRadius={82}
          />
        </div>

        {/* Attendance Distribution Donut */}
        <div className="bg-[#0d1526] border border-border p-5 space-y-4">
          <p className="text-xs font-black text-muted-foreground uppercase tracking-widest">Attendance Distribution</p>
          <RechartDonut
            data={[
              { label: 'High (75+)', color: CHART_COLORS.blue,   value: students.filter(s => s.attendance >= 75).length },
              { label: 'Mid (50–74)', color: CHART_COLORS.violet, value: students.filter(s => s.attendance >= 50 && s.attendance < 75).length },
              { label: 'Low (<50)',  color: CHART_COLORS.orange, value: students.filter(s => s.attendance > 0 && s.attendance < 50).length },
              { label: 'No Record', color: '#374151',             value: students.filter(s => s.attendance === 0).length },
            ]}
            centerLabel="Avg Attend"
            centerValue={`${stats.avgAttendance.toFixed(0)}%`}
            height={200}
            innerRadius={55}
            outerRadius={82}
          />
        </div>

        {/* Top Performers */}
        <div className="bg-[#0d1526] border border-border p-5">
          <p className="text-xs font-black text-muted-foreground uppercase tracking-widest mb-4">Top Performers</p>
          {students.length === 0 ? (
            <p className="text-muted-foreground text-sm text-center py-4">No data</p>
          ) : (
            <div className="space-y-3">
              {[...students].sort((a, b) => b.avgGrade - a.avgGrade).slice(0, 5).map((s, i) => (
                <div key={s.id} className="flex items-center gap-3">
                  <span className={`text-xs font-black w-5 text-center flex-shrink-0 ${
                    i === 0 ? 'text-yellow-400' : i === 1 ? 'text-muted-foreground/50' : i === 2 ? 'text-amber-600' : 'text-muted-foreground'
                  }`}>{i + 1}</span>
                  <div className="w-7 h-7 rounded-full bg-[#7a0606] flex items-center justify-center flex-shrink-0">
                    <span className="text-white text-[10px] font-black">{s.full_name?.charAt(0) ?? '?'}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-bold text-foreground truncate">{s.full_name?.split(' ')[0]}</p>
                    <div className="h-1 bg-muted rounded-full mt-1 overflow-hidden">
                      <div className="h-full rounded-full" style={{ width: `${s.avgGrade}%`, background: CHART_COLORS.orange }} />
                    </div>
                  </div>
                  <ScoreBadge score={s.avgGrade} />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Class Performance — horizontal bar chart */}
      {filtered.length > 0 && (
        <div className="bg-[#0d1526] border border-border p-5 mb-6">
          <h2 className="text-sm font-black text-muted-foreground uppercase tracking-widest mb-4">Class Performance Overview</h2>
          <HorizontalBarChart
            data={filtered.slice(0, 15).map(s => ({
              label: s.full_name?.split(' ')[0] ?? 'Student',
              value: Math.round(s.avgGrade),
              color: s.avgGrade >= 75 ? CHART_COLORS.emerald : s.avgGrade >= 50 ? CHART_COLORS.amber : CHART_COLORS.rose,
            }))}
            formatValue={v => `${v}%`}
          />
        </div>
      )}

      {/* Student Table */}
      <div className="bg-[#0d1526] border border-border rounded-none overflow-hidden">
        <div className="flex items-center justify-between p-5 border-b border-border flex-wrap gap-3">
          <h2 className="text-sm font-bold text-muted-foreground uppercase tracking-widest">Students</h2>
          <div className="flex gap-2 flex-wrap">
            <input
              type="text"
              placeholder="Search student..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="bg-card shadow-sm border border-border text-foreground text-sm px-3 py-1.5 rounded-none placeholder:text-muted-foreground focus:outline-none focus:border-primary w-44"
            />
            <select
              value={sortBy}
              onChange={e => setSortBy(e.target.value as any)}
              className="bg-card shadow-sm border border-border text-foreground text-sm px-3 py-1.5 rounded-none"
            >
              <option value="grade">Sort: Grade</option>
              <option value="attendance">Sort: Attendance</option>
              <option value="name">Sort: Name</option>
            </select>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-muted-foreground text-xs uppercase tracking-widest">
                <th className="text-left px-5 py-3">Student</th>
                <th className="text-left px-5 py-3">Section</th>
                <th className="text-center px-5 py-3">Avg Score</th>
                <th className="text-center px-5 py-3">Attendance</th>
                <th className="text-center px-5 py-3">Submissions</th>
                <th className="text-center px-5 py-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(s => (
                <tr key={s.id} className="border-b border-border hover:bg-white/3 transition-colors">
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-[#7a0606] flex items-center justify-center flex-shrink-0">
                        <span className="text-foreground text-xs font-black">{s.full_name?.charAt(0) ?? '?'}</span>
                      </div>
                      <div>
                        <p className="text-foreground font-semibold">{s.full_name}</p>
                        <p className="text-muted-foreground text-xs">{s.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-5 py-3 text-muted-foreground">{s.section_class ?? '—'}</td>
                  <td className="px-5 py-3 text-center"><ScoreBadge score={s.avgGrade} /></td>
                  <td className="px-5 py-3 text-center">
                    <span className={`text-xs font-bold ${s.attendance >= 75 ? 'text-emerald-400' : s.attendance >= 50 ? 'text-yellow-400' : 'text-rose-400'}`}>
                      {s.attendance}%
                    </span>
                  </td>
                  <td className="px-5 py-3 text-center text-muted-foreground">{s.submissions}</td>
                  <td className="px-5 py-3 text-center">
                    {s.is_active
                      ? <span className="text-xs bg-emerald-500/10 text-emerald-400 px-2 py-0.5 rounded-full font-bold">Active</span>
                      : <span className="text-xs bg-card shadow-sm text-muted-foreground px-2 py-0.5 rounded-full font-bold">Inactive</span>}
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={6} className="text-center py-12 text-muted-foreground">
                    No students enrolled yet.{' '}
                    <Link href="/dashboard/students/import" className="text-primary underline">Import students</Link>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
