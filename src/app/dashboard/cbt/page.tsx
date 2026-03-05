'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useAuth } from '@/contexts/auth-context';
import { createClient } from '@/lib/supabase/client';
import {
  AcademicCapIcon, PlusIcon, ClockIcon, CheckCircleIcon,
  ExclamationTriangleIcon, EyeIcon, TrashIcon, PlayIcon,
  MagnifyingGlassIcon, DocumentCheckIcon, ChartBarIcon, PencilIcon,
} from '@heroicons/react/24/outline';

export default function CBTPage() {
  const { profile, loading: authLoading } = useAuth();
  const [exams, setExams] = useState<any[]>([]);
  const [sessions, setSessions] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [deleting, setDeleting] = useState<string | null>(null);

  const isStaff = profile?.role === 'admin' || profile?.role === 'teacher';

  useEffect(() => {
    if (authLoading || !profile) return;
    setLoading(true);
    const db = createClient();
    if (isStaff) {
      db.from('cbt_exams')
        .select('*, programs(name), cbt_sessions(id, score, status)')
        .order('created_at', { ascending: false })
        .then(({ data }) => { setExams(data ?? []); setLoading(false); });
    } else {
      Promise.all([
        db.from('cbt_exams').select('*, programs(name)').eq('is_active', true).order('start_date'),
        db.from('cbt_sessions').select('*').eq('user_id', profile.id),
      ]).then(([exmRes, sesRes]) => {
        setExams(exmRes.data ?? []);
        setSessions(sesRes.data ?? []);
        setLoading(false);
      });
    }
  }, [profile?.id, authLoading]); // eslint-disable-line

  const handleDelete = async (id: string, title: string) => {
    if (!confirm(`Delete exam "${title}"? All sessions and questions will also be deleted.`)) return;
    setDeleting(id);
    const { error } = await createClient().from('cbt_exams').delete().eq('id', id);
    if (error) { alert(error.message); }
    else { setExams(prev => prev.filter(e => e.id !== id)); }
    setDeleting(null);
  };

  const filtered = exams.filter(e =>
    (e.title ?? '').toLowerCase().includes(search.toLowerCase()) ||
    (e.programs?.name ?? '').toLowerCase().includes(search.toLowerCase())
  );

  const getStudentSession = (examId: string) => sessions.find(s => s.exam_id === examId);

  if (authLoading || loading) return (
    <div className="min-h-screen bg-[#0f0f1a] flex items-center justify-center">
      <div className="w-10 h-10 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="min-h-screen bg-[#0f0f1a] text-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <AcademicCapIcon className="w-5 h-5 text-emerald-400" />
              <span className="text-xs font-bold text-emerald-400 uppercase tracking-widest">CBT Centre</span>
            </div>
            <h1 className="text-3xl font-extrabold">Computer-Based Tests</h1>
            <p className="text-white/40 text-sm mt-1">
              {isStaff ? 'Create and manage exams and quizzes' : 'View and take your scheduled exams'}
            </p>
          </div>
          {isStaff && (
            <Link href="/dashboard/cbt/new"
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-sm rounded-xl transition-all hover:scale-105 shadow-lg shadow-emerald-900/30">
              <PlusIcon className="w-4 h-4" /> Create Exam
            </Link>
          )}
        </div>

        {/* Stats */}
        {isStaff && (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { label: 'Total Exams', value: exams.length, icon: DocumentCheckIcon, color: 'text-emerald-400', bg: 'bg-emerald-500/10' },
              { label: 'Active', value: exams.filter(e => e.is_active).length, icon: PlayIcon, color: 'text-blue-400', bg: 'bg-blue-500/10' },
              { label: 'Total Sessions', value: exams.reduce((s, e) => s + (e.cbt_sessions?.length ?? 0), 0), icon: ChartBarIcon, color: 'text-violet-400', bg: 'bg-violet-500/10' },
              { label: 'Programmes', value: new Set(exams.map(e => e.program_id)).size, icon: AcademicCapIcon, color: 'text-amber-400', bg: 'bg-amber-500/10' },
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

        {/* Search */}
        <div className="relative max-w-md">
          <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
          <input type="text" placeholder="Search exams…" value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-3 bg-white/5 border border-white/10 rounded-xl text-sm text-white placeholder-white/30 focus:outline-none focus:border-emerald-500 transition-colors" />
        </div>

        {/* Exam list */}
        {filtered.length === 0 ? (
          <div className="text-center py-24 bg-white/5 border border-white/10 rounded-2xl">
            <AcademicCapIcon className="w-16 h-16 mx-auto text-white/10 mb-4" />
            <p className="text-lg font-semibold text-white/30">No exams found</p>
            {isStaff && (
              <Link href="/dashboard/cbt/new"
                className="inline-flex items-center gap-2 mt-4 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-sm rounded-xl transition-all">
                <PlusIcon className="w-4 h-4" /> Create First Exam
              </Link>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            {filtered.map((exam: any) => {
              const sessions = exam.cbt_sessions ?? [];
              const passed = sessions.filter((s: any) => s.status === 'passed').length;
              const studentSession = !isStaff ? getStudentSession(exam.id) : null;
              const now = new Date();
              const started = exam.start_date ? new Date(exam.start_date) <= now : true;
              const ended = exam.end_date ? new Date(exam.end_date) < now : false;
              const available = started && !ended && exam.is_active;

              return (
                <div key={exam.id} className="bg-white/5 border border-white/10 rounded-2xl p-6 hover:border-white/20 transition-all">
                  <div className="flex flex-col sm:flex-row items-start gap-4">
                    <div className="w-12 h-12 bg-emerald-500/10 border border-emerald-500/20 rounded-xl flex items-center justify-center flex-shrink-0">
                      <AcademicCapIcon className="w-6 h-6 text-emerald-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2 mb-1">
                        <h3 className="font-bold text-white">{exam.title}</h3>
                        <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold border ${exam.is_active ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' : 'bg-white/10 text-white/40 border-white/10'}`}>
                          {exam.is_active ? 'Active' : 'Inactive'}
                        </span>
                        {!isStaff && studentSession && (
                          <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold border ${studentSession.status === 'passed' ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' : studentSession.status === 'failed' ? 'bg-rose-500/20 text-rose-400 border-rose-500/30' : 'bg-blue-500/20 text-blue-400 border-blue-500/30'}`}>
                            {studentSession.status === 'passed' ? `Passed · ${studentSession.score}%` : studentSession.status === 'failed' ? `Failed · ${studentSession.score}%` : 'Completed'}
                          </span>
                        )}
                      </div>
                      {exam.description && <p className="text-sm text-white/40 mb-2">{exam.description}</p>}
                      <div className="flex flex-wrap gap-4 text-xs text-white/30">
                        {exam.programs?.name && <span>{exam.programs.name}</span>}
                        {exam.duration_minutes && (
                          <span className="flex items-center gap-1"><ClockIcon className="w-3.5 h-3.5" />{exam.duration_minutes} min</span>
                        )}
                        {exam.total_questions && <span>{exam.total_questions} questions</span>}
                        {exam.passing_score && (
                          <span className="flex items-center gap-1"><CheckCircleIcon className="w-3.5 h-3.5" />Pass: {exam.passing_score}%</span>
                        )}
                        {exam.start_date && <span>Starts {new Date(exam.start_date).toLocaleDateString()}</span>}
                        {exam.end_date && <span>Ends {new Date(exam.end_date).toLocaleDateString()}</span>}
                        {isStaff && <span className="text-blue-400">{sessions.length} attempts · {passed} passed</span>}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {isStaff ? (
                        <>
                          <Link href={`/dashboard/cbt/${exam.id}`}
                            className="p-2 text-blue-400 bg-blue-500/10 hover:bg-blue-500/20 rounded-xl transition-colors">
                            <EyeIcon className="w-4 h-4" />
                          </Link>
                          <Link href={`/dashboard/cbt/${exam.id}/edit`}
                            className="p-2 text-emerald-400 bg-emerald-500/10 hover:bg-emerald-500/20 rounded-xl transition-colors">
                            <PencilIcon className="w-4 h-4" />
                          </Link>
                          <button
                            onClick={() => handleDelete(exam.id, exam.title)}
                            disabled={deleting === exam.id}
                            className="p-2 text-rose-400 bg-rose-500/10 hover:bg-rose-500/20 rounded-xl transition-colors disabled:opacity-40">
                            <TrashIcon className="w-4 h-4" />
                          </button>
                        </>
                      ) : (
                        studentSession ? (
                          <Link href={`/dashboard/cbt/${exam.id}`}
                            className="flex items-center gap-1.5 px-4 py-2 text-sm font-bold text-white/60 bg-white/5 hover:bg-white/10 rounded-xl transition-colors">
                            <EyeIcon className="w-4 h-4" /> View Results
                          </Link>
                        ) : available ? (
                          <Link href={`/dashboard/cbt/${exam.id}/take`}
                            className="flex items-center gap-1.5 px-4 py-2 text-sm font-bold text-white bg-emerald-600 hover:bg-emerald-500 rounded-xl transition-colors">
                            <PlayIcon className="w-4 h-4" /> Start Exam
                          </Link>
                        ) : (
                          <span className="flex items-center gap-1.5 px-4 py-2 text-sm font-bold text-white/30 bg-white/5 rounded-xl">
                            {ended ? 'Expired' : 'Not yet available'}
                          </span>
                        )
                      )}
                    </div>
                  </div>
                  {!isStaff && studentSession?.score != null && (
                    <div className="mt-4 pt-4 border-t border-white/10">
                      <div className="flex items-center justify-between text-xs text-white/40 mb-1">
                        <span>Your score</span><span>{studentSession.score}% / {exam.passing_score}% to pass</span>
                      </div>
                      <div className="w-full h-2 bg-white/10 rounded-full">
                        <div className={`h-2 rounded-full transition-all ${studentSession.score >= (exam.passing_score ?? 70) ? 'bg-emerald-500' : 'bg-rose-500'}`}
                          style={{ width: `${Math.min(studentSession.score, 100)}%` }} />
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

      </div>
    </div>
  );
}
