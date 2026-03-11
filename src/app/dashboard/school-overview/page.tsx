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
} from '@heroicons/react/24/outline';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

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
    <div className="bg-[#0d1526] border border-white/10 rounded-2xl p-5 flex items-center gap-4">
      <div className={`w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 ${color}`}>
        <Icon className="w-6 h-6" />
      </div>
      <div>
        <p className="text-white/40 text-xs font-bold uppercase tracking-widest">{label}</p>
        <p className="text-2xl font-black text-white">{value}</p>
        {sub && <p className="text-white/30 text-xs mt-0.5">{sub}</p>}
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
        studAppsQuery = studAppsQuery.or(`school_id.eq.${schoolId},school_name.eq."${schoolName}"`);
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
        portalQuery = portalQuery.or(`school_id.eq.${schoolId},school_name.eq."${schoolName}"`);
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
      supabase.from('assignment_submissions').select('portal_user_id, grade, status').in('portal_user_id', ids),
      supabase.from('attendance').select('user_id, status').in('user_id', ids)
    ]);

    const subs = subsRes.data || [];
    const attRows = attRes.data || [];

    const rows: StudentRow[] = portalStudents.map(s => {
      const mySubs = (subs ?? []).filter(x => x.portal_user_id === s.id && x.grade != null);
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
    <div className="min-h-screen bg-[#0f0f1a] flex items-center justify-center">
      <div className="w-10 h-10 border-4 border-[#7a0606] border-t-transparent rounded-full animate-spin" />
    </div>
  );

  if (profile?.role !== 'school' && profile?.role !== 'admin') return (
    <div className="min-h-screen bg-[#0f0f1a] flex items-center justify-center">
      <p className="text-white/40">Access restricted to partner schools.</p>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#0f0f1a] px-4 py-6 md:px-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-8 flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-black text-white">School Overview</h1>
          <p className="text-white/40 text-sm mt-1">
            {profile?.school_name ?? 'Your School'} · Partner Dashboard
          </p>
        </div>
        <div className="flex gap-3">
          <Link
            href="/dashboard/students/import"
            className="flex items-center gap-2 px-4 py-2 bg-violet-600 hover:bg-violet-500 text-white text-sm font-bold rounded-xl transition-colors"
          >
            <UserGroupIcon className="w-4 h-4" /> Import Students
          </Link>
          <button
            onClick={exportPDF}
            className="flex items-center gap-2 px-4 py-2 bg-[#7a0606] hover:bg-[#9a0808] text-white text-sm font-bold rounded-xl transition-colors"
          >
            <DocumentArrowDownIcon className="w-4 h-4" /> Export PDF
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard icon={UserGroupIcon} label="Total Students" value={stats.total}
          sub={`${stats.active} active`} color="bg-violet-500/20 text-violet-400" />
        <StatCard icon={TrophyIcon} label="Avg Score" value={`${stats.avgScore.toFixed(0)}%`}
          sub="across all assignments" color="bg-yellow-500/20 text-yellow-400" />
        <StatCard icon={ClipboardDocumentCheckIcon} label="Avg Attendance"
          value={`${stats.avgAttendance.toFixed(0)}%`}
          sub="present rate" color="bg-emerald-500/20 text-emerald-400" />
        <StatCard icon={AcademicCapIcon} label="Enrolled"
          value={stats.active}
          sub="active learners" color="bg-blue-500/20 text-blue-400" />
      </div>

      {/* Performance Chart (bar) */}
      <div className="bg-[#0d1526] border border-white/10 rounded-2xl p-5 mb-6">
        <h2 className="text-sm font-bold text-white/60 uppercase tracking-widest mb-4">Student Performance</h2>
        <div className="flex flex-col gap-2 max-h-64 overflow-y-auto pr-1">
          {filtered.slice(0, 20).map(s => (
            <div key={s.id} className="flex items-center gap-3">
              <span className="text-xs text-white/50 w-28 truncate flex-shrink-0">{s.full_name.split(' ')[0]}</span>
              <div className="flex-1 bg-white/5 rounded-full h-3 overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-700"
                  style={{
                    width: `${s.avgGrade}%`,
                    background: s.avgGrade >= 75 ? '#10b981' : s.avgGrade >= 50 ? '#f59e0b' : '#ef4444',
                  }}
                />
              </div>
              <ScoreBadge score={s.avgGrade} />
            </div>
          ))}
          {filtered.length === 0 && (
            <p className="text-white/30 text-sm text-center py-8">No students found.</p>
          )}
        </div>
      </div>

      {/* Student Table */}
      <div className="bg-[#0d1526] border border-white/10 rounded-2xl overflow-hidden">
        <div className="flex items-center justify-between p-5 border-b border-white/10 flex-wrap gap-3">
          <h2 className="text-sm font-bold text-white/60 uppercase tracking-widest">Students</h2>
          <div className="flex gap-2 flex-wrap">
            <input
              type="text"
              placeholder="Search student..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="bg-white/5 border border-white/10 text-white text-sm px-3 py-1.5 rounded-lg placeholder:text-white/30 focus:outline-none focus:border-violet-500 w-44"
            />
            <select
              value={sortBy}
              onChange={e => setSortBy(e.target.value as any)}
              className="bg-white/5 border border-white/10 text-white text-sm px-3 py-1.5 rounded-lg"
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
              <tr className="border-b border-white/10 text-white/40 text-xs uppercase tracking-widest">
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
                <tr key={s.id} className="border-b border-white/5 hover:bg-white/3 transition-colors">
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-[#7a0606] flex items-center justify-center flex-shrink-0">
                        <span className="text-white text-xs font-black">{s.full_name.charAt(0)}</span>
                      </div>
                      <div>
                        <p className="text-white font-semibold">{s.full_name}</p>
                        <p className="text-white/30 text-xs">{s.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-5 py-3 text-white/50">{s.section_class ?? '—'}</td>
                  <td className="px-5 py-3 text-center"><ScoreBadge score={s.avgGrade} /></td>
                  <td className="px-5 py-3 text-center">
                    <span className={`text-xs font-bold ${s.attendance >= 75 ? 'text-emerald-400' : s.attendance >= 50 ? 'text-yellow-400' : 'text-rose-400'}`}>
                      {s.attendance}%
                    </span>
                  </td>
                  <td className="px-5 py-3 text-center text-white/50">{s.submissions}</td>
                  <td className="px-5 py-3 text-center">
                    {s.is_active
                      ? <span className="text-xs bg-emerald-500/10 text-emerald-400 px-2 py-0.5 rounded-full font-bold">Active</span>
                      : <span className="text-xs bg-white/5 text-white/30 px-2 py-0.5 rounded-full font-bold">Inactive</span>}
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={6} className="text-center py-12 text-white/30">
                    No students enrolled yet.{' '}
                    <Link href="/dashboard/students/import" className="text-violet-400 underline">Import students</Link>
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
