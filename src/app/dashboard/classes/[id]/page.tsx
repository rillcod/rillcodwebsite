'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/contexts/auth-context';
import { createClient } from '@/lib/supabase/client';
import {
  ArrowLeftIcon, BookOpenIcon, UserGroupIcon, CalendarIcon,
  ClockIcon, PencilIcon, CheckCircleIcon, AcademicCapIcon,
  ClipboardDocumentCheckIcon,
} from '@heroicons/react/24/outline';

export default function ClassDetailPage() {
  const params = useParams();
  const id = params?.id as string;
  const router = useRouter();
  const { profile, loading: authLoading } = useAuth();

  const [cls, setCls] = useState<any>(null);
  const [sessions, setSessions] = useState<any[]>([]);
  const [enrollments, setEnrollments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const isStaff = profile?.role === 'admin' || profile?.role === 'teacher';

  useEffect(() => {
    if (authLoading || !profile || !id) return;
    let cancelled = false;
    const supabase = createClient();

    async function load() {
      setLoading(true);
      setError(null);
      try {
        // Load class + sessions in parallel first (need class.program_id for enrollments)
        const [clsRes, sessRes] = await Promise.allSettled([
          supabase.from('classes')
            .select('*, programs(name, difficulty_level), portal_users(full_name)')
            .eq('id', id)
            .maybeSingle(),
          supabase.from('class_sessions')
            .select('id, session_date, topic, start_time, end_time, notes')
            .eq('class_id', id)
            .order('session_date', { ascending: false })
            .limit(10),
        ]);

        if (!cancelled) {
          if (clsRes.status === 'fulfilled') setCls(clsRes.value.data);
          else throw new Error('Class not found');
          if (sessRes.status === 'fulfilled') setSessions(sessRes.value.data ?? []);
        }

        // Enrollments are program-level — use program_id from class
        const programId = clsRes.status === 'fulfilled' ? clsRes.value.data?.program_id : null;
        if (programId && isStaff && !cancelled) {
          const enrRes = await supabase.from('enrollments')
            .select('id, status, portal_users(full_name, email)')
            .eq('program_id', programId)
            .order('enrollment_date', { ascending: false });
          if (!cancelled) setEnrollments(enrRes.data ?? []);
        }
      } catch (e: any) {
        if (!cancelled) setError(e.message ?? 'Failed to load class');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [profile?.id, id, authLoading]); // eslint-disable-line

  if (authLoading || loading) return (
    <div className="min-h-screen bg-[#0f0f1a] flex items-center justify-center">
      <div className="w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  if (error || !cls) return (
    <div className="min-h-screen bg-[#0f0f1a] flex flex-col items-center justify-center gap-4">
      <p className="text-rose-400 font-semibold">{error ?? 'Class not found'}</p>
      <Link href="/dashboard/classes" className="text-sm text-blue-400 hover:underline">← Back to Classes</Link>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#0f0f1a] text-white">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">

        {/* Header */}
        <div className="flex items-center gap-4">
          <button onClick={() => router.back()}
            className="p-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 transition-colors">
            <ArrowLeftIcon className="w-5 h-5 text-white/60" />
          </button>
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <BookOpenIcon className="w-4 h-4 text-blue-400" />
              <span className="text-xs font-bold text-blue-400 uppercase tracking-widest">Class</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold">{cls.name}</h1>
          </div>
          {isStaff && (
            <div className="flex gap-2">
              <Link href={`/dashboard/attendance?class_id=${id}`}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded-xl text-sm font-bold transition-colors">
                <ClipboardDocumentCheckIcon className="w-4 h-4" /> Attendance
              </Link>
              <Link href={`/dashboard/classes/${id}/edit`}
                className="flex items-center gap-2 px-4 py-2 bg-white/10 hover:bg-white/15 border border-white/10 rounded-xl text-sm font-bold transition-colors">
                <PencilIcon className="w-4 h-4" /> Edit
              </Link>
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

          {/* Left */}
          <div className="lg:col-span-2 space-y-6">

            {/* Info */}
            <div className="bg-white/5 border border-white/10 rounded-2xl p-6">
              <h2 className="font-bold text-white mb-4">Class Details</h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm">
                {[
                  { label: 'Programme', value: cls.programs?.name ?? '—' },
                  { label: 'Teacher', value: cls.portal_users?.full_name ?? '—' },
                  { label: 'Status', value: cls.status ?? '—' },
                  { label: 'Max Students', value: cls.max_students ?? '—' },
                  { label: 'Enrolled', value: cls.current_students ?? enrollments.length },
                  { label: 'Schedule', value: cls.schedule ?? '—' },
                ].map(item => (
                  <div key={item.label}>
                    <p className="text-xs text-white/30 uppercase tracking-widest mb-1">{item.label}</p>
                    <p className="font-semibold text-white capitalize">{item.value}</p>
                  </div>
                ))}
              </div>
              {cls.description && (
                <p className="mt-4 text-sm text-white/50 border-t border-white/10 pt-4">{cls.description}</p>
              )}
            </div>

            {/* Recent Sessions */}
            <div className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden">
              <div className="p-5 border-b border-white/10 flex items-center justify-between">
                <h2 className="font-bold text-white">Recent Sessions</h2>
                <Link href="/dashboard/attendance"
                  className="text-xs text-blue-400 hover:text-blue-300 transition-colors">View Attendance →</Link>
              </div>
              {sessions.length === 0 ? (
                <div className="py-12 text-center">
                  <CalendarIcon className="w-10 h-10 mx-auto text-white/10 mb-3" />
                  <p className="text-white/30 text-sm">No sessions recorded yet</p>
                </div>
              ) : (
                <div className="divide-y divide-white/5">
                  {sessions.map(s => (
                    <div key={s.id} className="flex items-start gap-4 px-5 py-4">
                      <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center flex-shrink-0">
                        <CalendarIcon className="w-5 h-5 text-blue-400" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-white">{s.topic ?? 'Session'}</p>
                        <div className="flex items-center gap-3 mt-1 text-xs text-white/30">
                          <span>{s.session_date ? new Date(s.session_date).toLocaleDateString() : '—'}</span>
                          {s.start_time && s.end_time && (
                            <span className="flex items-center gap-1">
                              <ClockIcon className="w-3.5 h-3.5" />
                              {s.start_time} – {s.end_time}
                            </span>
                          )}
                        </div>
                        {s.notes && <p className="text-xs text-white/20 mt-1 italic">{s.notes}</p>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Right: students */}
          <div className="space-y-5">
            {isStaff && (
              <div className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden">
                <div className="p-4 border-b border-white/10 flex items-center justify-between">
                  <h3 className="text-sm font-bold text-white flex items-center gap-2">
                    <UserGroupIcon className="w-4 h-4 text-blue-400" /> Students
                  </h3>
                  <span className="text-xs text-white/30">{enrollments.length}</span>
                </div>
                {enrollments.length === 0 ? (
                  <div className="p-6 text-center">
                    <UserGroupIcon className="w-8 h-8 mx-auto text-white/10 mb-2" />
                    <p className="text-xs text-white/30">No students enrolled</p>
                  </div>
                ) : (
                  <div className="divide-y divide-white/5 max-h-72 overflow-y-auto">
                    {enrollments.map((enr: any) => (
                      <div key={enr.id} className="flex items-center gap-3 px-4 py-3">
                        <div className="w-7 h-7 rounded-full bg-blue-500/20 flex items-center justify-center text-xs font-bold text-blue-400 flex-shrink-0">
                          {(enr.portal_users?.full_name ?? '?')[0]}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-semibold text-white truncate">{enr.portal_users?.full_name ?? '—'}</p>
                          <p className="text-[10px] text-white/30 capitalize">{enr.status}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            <Link href="/dashboard/classes"
              className="flex items-center gap-2 w-full py-3 px-4 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-sm font-bold text-white/60 transition-colors">
              <ArrowLeftIcon className="w-4 h-4" /> All Classes
            </Link>
          </div>

        </div>
      </div>
    </div>
  );
}
