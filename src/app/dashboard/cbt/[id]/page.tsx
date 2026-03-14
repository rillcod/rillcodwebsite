// @refresh reset
'use client';

import { useState, useEffect } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/contexts/auth-context';
import { createClient } from '@/lib/supabase/client';
import {
  ArrowLeftIcon, AcademicCapIcon, ClockIcon, CheckCircleIcon,
  XCircleIcon, UserGroupIcon, ChartBarIcon, PencilIcon,
} from '@/lib/icons';

export default function ExamDetailPage() {
  const params = useParams() as { id?: string };
  const searchParams = useSearchParams();
  const classId = searchParams?.get('class_id');
  const { profile, loading: authLoading } = useAuth();
  const [exam, setExam] = useState<any>(null);
  const [questions, setQuestions] = useState<any[]>([]);
  const [sessions, setSessions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const role = profile?.role ?? '';
  const isStaff = role === 'admin' || role === 'teacher' || role === 'school';

  useEffect(() => {
    if (authLoading || !profile) return;
    const db = createClient();
    const id = params?.id as string;
    if (!id) return;

    let sessionsPromise;
    if (isStaff) {
      let q = db.from('cbt_sessions').select('*, portal_users(full_name, email, school_id)').eq('exam_id', id).order('created_at', { ascending: false });
      if (role === 'school' && profile.school_id) {
        q = q.eq('portal_users.school_id', profile.school_id);
      }
      sessionsPromise = q;
    } else {
      sessionsPromise = db.from('cbt_sessions').select('*').eq('exam_id', id).eq('user_id', profile.id);
    }

    Promise.all([
      db.from('cbt_exams').select('*, programs(name)').eq('id', id).single(),
      db.from('cbt_questions').select('*').eq('exam_id', id).order('order_index'),
      sessionsPromise,
    ]).then(([examRes, qRes, sesRes]) => {
      setExam(examRes.data);
      setQuestions(qRes.data ?? []);
      setSessions(sesRes.data ?? []);
      setLoading(false);
    });
  }, [profile?.id, params?.id, authLoading]); // eslint-disable-line

  if (authLoading || loading) return (
    <div className="min-h-screen bg-[#0f0f1a] flex items-center justify-center">
      <div className="w-10 h-10 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );
  if (!exam) return (
    <div className="min-h-screen bg-[#0f0f1a] flex items-center justify-center">
      <p className="text-white/40">Exam not found.</p>
    </div>
  );

  const totalPoints = questions.reduce((s, q) => s + (q.points ?? 0), 0);
  const mySession = !isStaff ? sessions[0] : null;

  return (
    <div className="min-h-screen bg-[#0f0f1a] text-white">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        <Link href={classId ? `/dashboard/classes/${classId}` : `/dashboard/cbt`} className="inline-flex items-center gap-2 text-sm text-white/40 hover:text-white transition-colors">
          <ArrowLeftIcon className="w-4 h-4" /> {classId ? 'Back to Class' : 'Back to CBT'}
        </Link>

        {/* Exam header */}
        <div className="bg-white/5 border border-white/10 rounded-2xl p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <AcademicCapIcon className="w-5 h-5 text-emerald-400" />
                <span className="text-xs font-bold text-emerald-400 uppercase tracking-widest">{exam.programs?.name}</span>
              </div>
              <h1 className="text-2xl font-extrabold mb-2">{exam.title}</h1>
              {exam.description && <p className="text-white/40 text-sm">{exam.description}</p>}
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <span className={`px-3 py-1 rounded-full text-xs font-bold border ${exam.is_active ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' : 'bg-white/10 text-white/40 border-white/10'}`}>
                {exam.is_active ? 'Active' : 'Inactive'}
              </span>
              {isStaff && (
                <Link href={`/dashboard/cbt/${exam.id}/edit`}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 text-xs font-bold rounded-xl transition-colors">
                  <PencilIcon className="w-3.5 h-3.5" /> Edit Exam
                </Link>
              )}
            </div>
          </div>
          <div className="flex flex-wrap gap-4 mt-4 text-sm text-white/40">
            {exam.duration_minutes && <span className="flex items-center gap-1.5"><ClockIcon className="w-4 h-4" />{exam.duration_minutes} minutes</span>}
            <span className="flex items-center gap-1.5"><CheckCircleIcon className="w-4 h-4" />{exam.passing_score ?? 70}% to pass</span>
            <span className="flex items-center gap-1.5"><UserGroupIcon className="w-4 h-4" />{questions.length} questions · {totalPoints} pts total</span>
          </div>
          {!isStaff && !mySession && (
            <div className="mt-4">
              <Link href={`/dashboard/cbt/${exam.id}/take`}
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-sm rounded-xl transition-all">
                Start Exam
              </Link>
            </div>
          )}
          {mySession && (
            <div className={`mt-4 p-4 rounded-xl border ${mySession.status === 'passed' ? 'bg-emerald-500/10 border-emerald-500/20' : 'bg-rose-500/10 border-rose-500/20'}`}>
              <div className="flex items-center gap-2">
                {mySession.status === 'passed'
                  ? <CheckCircleIcon className="w-5 h-5 text-emerald-400" />
                  : <XCircleIcon className="w-5 h-5 text-rose-400" />}
                <span className={`font-bold ${mySession.status === 'passed' ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {mySession.status === 'passed' ? 'Passed' : 'Failed'} — Score: {mySession.score}%
                </span>
              </div>
              {mySession.end_time && (
                <p className="text-xs text-white/30 mt-1">Completed {new Date(mySession.end_time).toLocaleString()}</p>
              )}
            </div>
          )}
        </div>

        {/* Staff: sessions */}
        {isStaff && sessions.length > 0 && (
          <div className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden">
            <div className="p-5 border-b border-white/10 flex items-center justify-between">
              <h2 className="font-bold flex items-center gap-2">
                <ChartBarIcon className="w-5 h-5 text-emerald-400" /> Student Results ({sessions.length})
              </h2>
              <span className="text-xs text-white/30">
                {sessions.filter(s => s.status === 'passed').length} passed
              </span>
            </div>
            <div className="divide-y divide-white/5">
              {sessions.map((s: any) => (
                <div key={s.id} className="px-5 py-4 flex items-center justify-between gap-4">
                  <div>
                    <p className="font-semibold text-white text-sm">{s.portal_users?.full_name ?? 'Student'}</p>
                    <p className="text-xs text-white/30">{s.portal_users?.email}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      <div className="flex items-center gap-2 mb-1">
                        {s.status === 'pending_grading' ? (
                          <span className="px-2.5 py-1 rounded-lg bg-amber-500/10 border border-amber-500/20 text-[10px] font-black text-amber-500 uppercase tracking-widest">
                            Pending Grading
                          </span>
                        ) : (
                          <span className={`px-2.5 py-1 rounded-lg border text-[10px] font-black uppercase tracking-widest ${
                            s.status === 'passed' ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' 
                            : s.status === 'failed' ? 'bg-rose-500/10 border-rose-500/20 text-rose-400'
                            : 'bg-white/5 border-white/10 text-white/30'
                          }`}>
                            {s.status === 'passed' ? `Passed` : s.status === 'failed' ? 'Failed' : s.status} {s.score != null ? `— ${s.score}%` : ''}
                          </span>
                        )}
                      </div>
                      {s.end_time && (
                        <p className="text-[10px] text-white/30 truncate">Submitted {new Date(s.end_time).toLocaleDateString()}</p>
                      )}
                    </div>
                    {/* Always show Grade/Review button for staff */}
                    <Link href={`/dashboard/cbt/${exam.id}/sessions/${s.id}/grade`}
                      className={`flex items-center gap-1.5 px-3 py-2 text-xs font-bold rounded-xl transition-all ${
                        s.status === 'pending_grading'
                          ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-900/30'
                          : 'bg-white/10 hover:bg-white/20 text-white/60'
                      }`}>
                      <ChartBarIcon className="w-3.5 h-3.5" />
                      {s.status === 'pending_grading' ? 'Grade' : 'Review'}
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Staff: questions preview */}
        {isStaff && questions.length > 0 && (
          <div className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden">
            <div className="p-5 border-b border-white/10">
              <h2 className="font-bold">Questions Preview</h2>
            </div>
            <div className="divide-y divide-white/5">
              {questions.map((q: any, i: number) => (
                <div key={q.id} className="px-5 py-4">
                  <div className="flex items-start gap-3">
                    <span className="text-xs font-bold text-white/30 w-6 flex-shrink-0 pt-0.5">{i + 1}.</span>
                    <div className="flex-1">
                      <p className="text-sm text-white">{q.question_text}</p>
                      {q.options && Array.isArray(q.options) && (
                        <div className="mt-2 space-y-1">
                          {q.options.map((opt: string, oi: number) => (
                            <p key={oi} className={`text-xs px-2 py-1 rounded ${opt === q.correct_answer ? 'bg-emerald-500/10 text-emerald-400' : 'text-white/40'}`}>
                              {String.fromCharCode(65 + oi)}. {opt}
                            </p>
                          ))}
                        </div>
                      )}
                      <div className="flex items-center gap-3 mt-2 text-xs text-white/30">
                        <span>{q.points} pts</span>
                        <span className="capitalize">{q.question_type?.replace('_', ' ')}</span>
                        <span className="text-emerald-400">Answer: {q.correct_answer}</span>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
