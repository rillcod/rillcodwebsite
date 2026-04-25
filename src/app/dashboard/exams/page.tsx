// @refresh reset
'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/contexts/auth-context';
import Link from 'next/link';
import {
  AcademicCapIcon, PlusIcon, PencilIcon, TrashIcon, EyeIcon,
  ClockIcon, CheckCircleIcon, MagnifyingGlassIcon, ArrowPathIcon,
  DocumentTextIcon, ChartBarIcon, UserGroupIcon, LockClosedIcon,
  LockOpenIcon, PlayIcon, InformationCircleIcon, DocumentCheckIcon,
  CommandLineIcon,
} from '@/lib/icons';
import { toast } from 'sonner';

interface Exam {
  id: string;
  course_id: string;
  title: string;
  description: string | null;
  duration_minutes: number | null;
  total_points: number;
  passing_score: number;
  max_attempts: number;
  is_active: boolean;
  created_by: string | null;
  created_at: string;
  courses?: { id: string; title: string };
  _questionCount?: number;
  _attemptCount?: number;
}

function StatusBadge({ active }: { active: boolean }) {
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold border ${active ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' : 'bg-zinc-500/20 text-muted-foreground/70 border-zinc-500/30'}`}>
      {active ? <LockOpenIcon className="w-3 h-3" /> : <LockClosedIcon className="w-3 h-3" />}
      {active ? 'Active' : 'Inactive'}
    </span>
  );
}

export default function ExamsPage() {
  const { profile, loading: authLoading, profileLoading } = useAuth();
  const [exams, setExams] = useState<Exam[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [courseFilter, setCourseFilter] = useState('');
  const [courses, setCourses] = useState<{ id: string; title: string }[]>([]);

  const isAdmin = profile?.role === 'admin';
  const isTeacher = profile?.role === 'teacher';
  const isStudent = profile?.role === 'student';
  const canManage = isAdmin || isTeacher;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (courseFilter) params.set('courseId', courseFilter);
      const res = await fetch(`/api/exams?${params}`);
      if (!res.ok) throw new Error('Failed to load');
      const json = await res.json();
      setExams(json.data ?? []);
    } catch {
      toast.error('Failed to load exams');
    } finally {
      setLoading(false);
    }
  }, [courseFilter]);

  useEffect(() => {
    if (!authLoading && !profileLoading && profile) {
      load();
      // Load courses for filter
      fetch('/api/courses').then(r => r.json()).then(j => setCourses(j.data ?? []));
    }
  }, [authLoading, profileLoading, profile, load]);

  async function toggleActive(exam: Exam) {
    await fetch(`/api/exams/${exam.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_active: !exam.is_active }),
    });
    setExams(prev => prev.map(e => e.id === exam.id ? { ...e, is_active: !e.is_active } : e));
    toast.success(`Exam ${exam.is_active ? 'deactivated' : 'activated'}`);
  }

  async function deleteExam(id: string) {
    if (!confirm('Delete this exam? This cannot be undone.')) return;
    const res = await fetch(`/api/exams/${id}`, { method: 'DELETE' });
    if (res.ok) { toast.success('Exam deleted'); load(); }
    else toast.error('Failed to delete');
  }

  if (authLoading || profileLoading || !profile) {
    return <div className="flex items-center justify-center min-h-[60vh]"><div className="w-10 h-10 border-4 border-violet-500 border-t-transparent rounded-full animate-spin" /></div>;
  }

  const filtered = exams.filter(e => !search || e.title.toLowerCase().includes(search.toLowerCase()) || e.courses?.title?.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-6xl mx-auto">
      {/* Exam Hub Tab Bar */}
      <div className="flex items-center gap-1 bg-card border border-border rounded-xl p-1 w-fit">
        <Link href="/dashboard/cbt"
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/50 text-sm font-bold transition-all">
          <CommandLineIcon className="w-4 h-4" /> CBT Exams
        </Link>
        <span className="flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-black">
          <DocumentCheckIcon className="w-4 h-4" /> Written Exams
        </span>
      </div>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black text-card-foreground flex items-center gap-2">
            <AcademicCapIcon className="w-7 h-7 text-blue-400" />
            Written Exams
          </h1>
          <p className="text-card-foreground/50 text-sm mt-0.5">
            {isStudent ? 'View available written exams' : 'Manage traditional exams — essays, matching, short answer'}
          </p>
        </div>
        {canManage && (
          <Link href="/dashboard/exams/new"
            className="flex items-center gap-2 px-4 py-2 bg-blue-500 hover:bg-blue-400 text-white font-bold rounded-xl transition-all shadow-lg shadow-blue-500/20">
            <PlusIcon className="w-4 h-4" /> New Exam
          </Link>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Total Exams', value: exams.length, icon: DocumentTextIcon, color: 'text-blue-400' },
          { label: 'Active', value: exams.filter(e => e.is_active).length, icon: CheckCircleIcon, color: 'text-emerald-400' },
          { label: 'Avg Duration', value: exams.length ? `${Math.round(exams.reduce((s, e) => s + (e.duration_minutes || 0), 0) / exams.length)}m` : '—', icon: ClockIcon, color: 'text-amber-400' },
          { label: 'Avg Pass Score', value: exams.length ? `${Math.round(exams.reduce((s, e) => s + e.passing_score, 0) / exams.length)}%` : '—', icon: ChartBarIcon, color: 'text-violet-400' },
        ].map(s => (
          <div key={s.label} className="bg-card border border-white/[0.08] rounded-xl p-4">
            <div className="flex items-center justify-between mb-2">
              <s.icon className={`w-5 h-5 ${s.color}`} />
              <span className="text-2xl font-black text-card-foreground">{s.value}</span>
            </div>
            <p className="text-xs font-bold text-card-foreground/40 uppercase tracking-wider">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Disambiguation notice */}
      <div className="flex items-start gap-3 bg-blue-500/[0.07] border border-blue-500/20 rounded-xl p-4">
        <InformationCircleIcon className="w-5 h-5 text-blue-400 flex-shrink-0 mt-0.5" />
        <div className="text-sm">
          <p className="font-bold text-blue-300">Written Exams vs CBT Exams</p>
          <p className="text-blue-300/70 mt-0.5">
            <strong>Written Exams</strong> (this page) support essay, matching, and short-answer questions — graded manually with attempt tracking.
            {' '}<Link href="/dashboard/cbt" className="underline underline-offset-2 hover:text-blue-200">CBT Exams</Link> are auto-graded computer-based tests with coding blocks, best for quick assessment.
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-card-foreground/30" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search exams…"
            className="w-full pl-9 pr-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-sm text-card-foreground placeholder-card-foreground/30 focus:outline-none focus:border-blue-500/50" />
        </div>
        <select value={courseFilter} onChange={e => { setCourseFilter(e.target.value); }}
          className="px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-sm text-card-foreground focus:outline-none focus:border-blue-500/50">
          <option value="">All Courses</option>
          {courses.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}
        </select>
        <button onClick={load} className="flex items-center gap-2 px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-sm font-bold text-card-foreground/70 transition-all">
          <ArrowPathIcon className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Exam List */}
      {loading ? (
        <div className="flex items-center justify-center py-20"><div className="w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" /></div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 gap-3">
          <AcademicCapIcon className="w-16 h-16 text-card-foreground/10" />
          <p className="text-card-foreground/40 font-semibold">No exams found</p>
          {canManage && <Link href="/dashboard/exams/new" className="text-blue-400 text-sm font-bold hover:underline">Create first exam</Link>}
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {filtered.map(exam => (
            <div key={exam.id} className="bg-card border border-white/[0.08] rounded-2xl p-5 hover:border-blue-500/30 transition-all group">
              <div className="flex items-start justify-between gap-3 mb-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <StatusBadge active={exam.is_active} />
                    {exam.courses && (
                      <span className="text-xs text-card-foreground/40 bg-white/5 px-2 py-0.5 rounded-full truncate max-w-[120px]">{exam.courses.title}</span>
                    )}
                  </div>
                  <h3 className="font-black text-card-foreground text-base truncate">{exam.title}</h3>
                  {exam.description && <p className="text-card-foreground/50 text-sm mt-1 line-clamp-2">{exam.description}</p>}
                </div>
              </div>

              {/* Metadata grid */}
              <div className="grid grid-cols-3 gap-2 mb-4">
                {[
                  { label: 'Duration', value: exam.duration_minutes ? `${exam.duration_minutes}m` : '—', icon: ClockIcon },
                  { label: 'Pass Score', value: `${exam.passing_score}%`, icon: ChartBarIcon },
                  { label: 'Max Attempts', value: String(exam.max_attempts), icon: ArrowPathIcon },
                ].map(m => (
                  <div key={m.label} className="bg-white/[0.03] rounded-xl p-2 text-center">
                    <p className="text-[10px] font-bold text-card-foreground/40 uppercase">{m.label}</p>
                    <p className="font-black text-card-foreground text-sm">{m.value}</p>
                  </div>
                ))}
              </div>

              {/* Actions */}
              <div className="flex items-center gap-2 pt-3 border-t border-white/[0.06]">
                <Link href={`/dashboard/exams/${exam.id}`}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2 bg-blue-500/20 hover:bg-blue-500/30 text-blue-400 text-xs font-bold rounded-xl transition-all">
                  <EyeIcon className="w-3.5 h-3.5" />
                  {canManage ? 'Manage' : 'View'}
                </Link>
                {isStudent && exam.is_active && (
                  <Link href={`/dashboard/exams/${exam.id}/take`}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2 bg-emerald-500 hover:bg-emerald-400 text-white text-xs font-bold rounded-xl transition-all">
                    <PlayIcon className="w-3.5 h-3.5" /> Start Exam
                  </Link>
                )}
                {canManage && (
                  <>
                    <Link href={`/dashboard/exams/${exam.id}/edit`}
                      className="p-2 hover:bg-white/10 rounded-xl transition-all">
                      <PencilIcon className="w-4 h-4 text-card-foreground/50" />
                    </Link>
                    <button onClick={() => toggleActive(exam)}
                      className={`p-2 rounded-xl transition-all ${exam.is_active ? 'hover:bg-amber-500/20 text-amber-400' : 'hover:bg-emerald-500/20 text-emerald-400'}`}>
                      {exam.is_active ? <LockClosedIcon className="w-4 h-4" /> : <LockOpenIcon className="w-4 h-4" />}
                    </button>
                    <button onClick={() => deleteExam(exam.id)} className="p-2 hover:bg-rose-500/20 rounded-xl transition-all">
                      <TrashIcon className="w-4 h-4 text-rose-400" />
                    </button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
