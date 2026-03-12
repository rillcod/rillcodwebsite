'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/contexts/auth-context';
import { createClient } from '@/lib/supabase/client';
import {
  ArrowLeftIcon, BookOpenIcon, UserGroupIcon, CalendarIcon,
  ClockIcon, PencilIcon, CheckCircleIcon, AcademicCapIcon,
  ClipboardDocumentCheckIcon, PlusIcon, ExclamationTriangleIcon,
  ChevronDownIcon, ArrowPathIcon, TrashIcon, ChartBarIcon, BoltIcon,
  ClipboardDocumentListIcon,
  PencilSquareIcon as PencilSquareIconOutline, CheckIcon as CheckIconOutline,
  CloudArrowUpIcon
} from '@heroicons/react/24/outline';
import { gradeSubmission } from '@/services/dashboard.service';


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

  const [activeTab, setActiveTab] = useState<'overview' | 'lessons' | 'assignments' | 'cbt' | 'gradebook'>('overview');
  const [items, setItems] = useState<{ lessons: any[], assignments: any[], cbt: any[], submissions: any[], cbtSessions: any[] }>({ lessons: [], assignments: [], cbt: [], submissions: [], cbtSessions: [] });
  const [manualEntry, setManualEntry] = useState(false);
  const [matrixSaving, setMatrixSaving] = useState<Record<string, boolean>>({});

  // Student Management State
  const [showStudentModal, setShowStudentModal] = useState(false);
  const [availableStudents, setAvailableStudents] = useState<any[]>([]);
  const [processingStudent, setProcessingStudent] = useState<string | null>(null);

  const isStaff = profile?.role === 'admin' || profile?.role === 'teacher' || profile?.role === 'school';
  const [viewingItem, setViewingItem] = useState<{ type: 'lesson' | 'assignment' | 'cbt', id: string } | null>(null);

  const fetchData = async () => {
    if (!id || !profile) return;
    setLoading(true);
    const supabase = createClient();
    try {
      const [clsRes, sessRes] = await Promise.all([
        supabase.from('classes').select('*, programs(name, difficulty_level), portal_users(full_name)').eq('id', id!).maybeSingle(),
        supabase.from('class_sessions').select('*').eq('class_id', id!).order('session_date', { ascending: false }).limit(10),
      ]);

      if (!clsRes.data) throw new Error('Class not found');
      setCls(clsRes.data);
      setSessions(sessRes.data ?? []);

      const program_id = clsRes.data.program_id;
      const [enrRes, lessonRes, asgnRes, cbtRes] = await Promise.all([
        supabase.from('enrollments')
          .select('id, status, portal_users!inner(id, full_name, email, school_id, section_class, is_deleted)')
          .eq('program_id', program_id!)
          .eq('portal_users.section_class', clsRes.data.name)
          .neq('portal_users.is_deleted', true),
        supabase.from('lessons').select('id, title, lesson_type, status, courses!inner(program_id)').eq('courses.program_id', program_id!),
        supabase.from('assignments').select('id, title, assignment_type, due_date, course_id, courses!inner(program_id)').eq('courses.program_id', program_id!),
        supabase.from('cbt_exams').select('id, title, duration_minutes, total_questions, is_active').eq('program_id', program_id!)
      ]);

      const assignments = asgnRes.data ?? [];
      const assignmentIds = assignments.map(a => a.id);
      const cbtExams = cbtRes.data ?? [];
      const cbtIds = cbtExams.map(e => e.id);

      let submissions: any[] = [];
      let cbtSessions: any[] = [];
      
      const subQueries: any[] = [];
      if (assignmentIds.length > 0) {
        subQueries.push(supabase.from('assignment_submissions').select('id, assignment_id, portal_user_id, grade, status').in('assignment_id', assignmentIds));
      }
      if (cbtIds.length > 0) {
        subQueries.push(supabase.from('cbt_sessions').select('id, exam_id, user_id, score, status').in('exam_id', cbtIds));
      }

      const subResults = await Promise.all(subQueries);
      let resIdx = 0;
      if (assignmentIds.length > 0) {
        submissions = subResults[resIdx]?.data ?? [];
        resIdx++;
      }
      if (cbtIds.length > 0) {
        cbtSessions = subResults[resIdx]?.data ?? [];
      }

      setEnrollments(enrRes.data ?? []);
      setItems({
        lessons: lessonRes.data ?? [],
        assignments: assignments,
        cbt: cbtExams,
        submissions,
        cbtSessions
      });
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!authLoading && profile && id) fetchData();
  }, [id, profile?.id, authLoading]);

  const loadAvailableStudents = async () => {
    if (!cls || !profile) return;
    setProcessingStudent('loading');
    const supabase = createClient();
    try {
      // 1. Fetch all students enrolled in this program
      // 2. Filter by school_id to ensure teachers only see their own school's students
      let query = supabase
        .from('enrollments')
        .select(`
          user_id,
          portal_users!inner(id, full_name, email, school_id, section_class)
        `)
        .eq('program_id', cls.program_id);

      // Multi-tenancy: Only show students from the same school
      if (profile.role === 'school' && profile.school_id) {
        query = query.eq('portal_users.school_id', profile.school_id as string);
      } else if (profile.role === 'teacher') {
        if (profile.school_id) {
            query = query.eq('portal_users.school_id', profile.school_id as string);
        }
      }

      const { data, error: err } = await query;
      if (err) throw err;

      // Filter out students already in THIS class
      // We also prioritize students who have NO class assigned (section_class is null)
      const filtered = (data ?? [])
        .map((e: any) => e.portal_users)
        .filter((u: any) => u.section_class !== cls.name)
        .sort((a: any, b: any) => {
            if (!a.section_class && b.section_class) return -1;
            if (a.section_class && !b.section_class) return 1;
            return 0;
        });

      setAvailableStudents(filtered);
    } catch (e: any) {
      console.error(e);
      setError('Failed to load available students for enrollment.');
    } finally {
      setProcessingStudent(null);
    }
  };

  const assignStudent = async (studentId: string) => {
    if (!cls) return;
    setProcessingStudent(studentId);
    const supabase = createClient();
    try {
      const { error: err } = await supabase.from('portal_users').update({ section_class: cls.name }).eq('id', studentId);
      if (err) throw err;
      await fetchData();
      await loadAvailableStudents();
    } catch (e: any) {
      alert(e.message);
    } finally {
      setProcessingStudent(null);
    }
  };

  const removeStudent = async (studentId: string) => {
    if (!confirm('Remove student from this class?')) return;
    setProcessingStudent(studentId);
    const supabase = createClient();
    try {
      const { error: err } = await supabase.from('portal_users').update({ section_class: null }).eq('id', studentId);
      if (err) throw err;
      await fetchData();
    } catch (e: any) {
      alert(e.message);
    } finally {
      setProcessingStudent(null);
    }
  };

  const handleExportLogins = () => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    const enrRows = enrollments.map((enr: any) => `
      <tr>
        <td><strong>${enr.portal_users?.full_name || 'Unknown'}</strong></td>
        <td>${cls.name}</td>
        <td>${enr.portal_users?.email || 'N/A'}</td>
        <td style="text-align: center;"><div class="pass-field"></div></td>
      </tr>
    `).join('');

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Student Credentials - ${cls.name}</title>
        <style>
          body { font-family: system-ui, -apple-system, sans-serif; padding: 40px; color: #111; max-width: 800px; margin: 0 auto; }
          .header { text-align: center; margin-bottom: 30px; }
          .logo { max-width: 150px; margin-bottom: 20px; }
          .brand-title { font-size: 24px; font-weight: 900; color: #000; text-transform: uppercase; letter-spacing: 2px; }
          .brand-subtitle { font-size: 14px; color: #555; font-weight: 600; margin-top: 5px; text-transform: uppercase; letter-spacing: 1px; }
          h1 { font-size: 22px; margin: 0 0 10px 0; text-align: center; }
          .meta { font-size: 14px; color: #555; margin-bottom: 30px; text-align: center; }
          table { width: 100%; border-collapse: collapse; margin-top: 20px; }
          th, td { border: 1px solid #ccc; padding: 12px; text-align: left; font-size: 14px; }
          th { background: #f4f4f4; font-weight: bold; text-transform: uppercase; font-size: 12px; letter-spacing: 1px; }
          .pass-field { display: inline-block; width: 150px; height: 1px; background: #ccc; margin-top: 10px; }
          .note { margin-top: 40px; text-align: center; color: #666; font-size: 12px; font-style: italic; }
          .print-btn { display: block; margin: 30px auto; padding: 10px 20px; background: #0f0f1a; color: white; border: none; border-radius: 6px; cursor: pointer; font-weight: bold; }
          @media print {
            body { padding: 0; }
            .print-btn { display: none; }
          }
        </style>
      </head>
      <body>
        <div class="header">
          <!-- <img src="/logo.png" alt="Logo" class="logo" /> -->
          <div class="brand-title">RILLCOD ACADEMY</div>
          <div class="brand-subtitle">Student Login Credentials</div>
        </div>
        
        <h1>${cls.name}</h1>
        <div class="meta">
          <strong>Programme:</strong> ${cls.programs?.name || 'N/A'} &nbsp;|&nbsp;
          <strong>Teacher:</strong> ${cls.portal_users?.full_name || 'N/A'} &nbsp;|&nbsp;
          <strong>Date:</strong> ${new Date().toLocaleDateString()}
        </div>

        <table>
          <thead>
            <tr>
              <th>Student Name</th>
              <th>Class</th>
              <th>Login Email</th>
              <th>Password</th>
            </tr>
          </thead>
          <tbody>
            ${enrRows}
          </tbody>
        </table>
        
        <div class="note">
          Passwords are encrypted in our database for security. Please fill in the temporary passwords here before distributing or instruct students to use the "Forgot Password" feature.
        </div>
        
        <button class="print-btn" onclick="window.print()">Print Document</button>
      </body>
      </html>
    `;

    printWindow.document.write(html);
    printWindow.document.close();
  };

  if (authLoading || loading) return (
    <div className="min-h-screen bg-[#0f0f1a] flex items-center justify-center">
      <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  if (error || !cls) return (
    <div className="min-h-screen bg-[#0f0f1a] flex flex-col items-center justify-center gap-4">
      <ExclamationTriangleIcon className="w-12 h-12 text-rose-500/20" />
      <p className="text-rose-400 font-semibold">{error ?? 'Class not found'}</p>
      <Link href="/dashboard/classes" className="px-6 py-2 bg-white/5 hover:bg-white/10 rounded-xl text-sm transition-all">← Back to Classes</Link>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#0f0f1a] text-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">

        {/* ── Header ────────────────────────────────────────── */}
        <div className="flex flex-col md:flex-row md:items-center gap-6">
          <button onClick={() => router.back()}
            className="w-10 h-10 flex items-center justify-center rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 transition-colors flex-shrink-0">
            <ArrowLeftIcon className="w-5 h-5 text-white/60" />
          </button>
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <div className="px-2 py-0.5 rounded-md bg-blue-500/10 border border-blue-500/20 text-[10px] font-black text-blue-400 uppercase tracking-widest">
                {cls.status}
              </div>
              <span className="text-xs font-bold text-white/30 uppercase tracking-widest">/ Classes / {cls.programs?.name}</span>
            </div>
            <h1 className="text-3xl font-black tracking-tight">{cls.name}</h1>
          </div>
          {isStaff && (
            <div className="flex gap-2">
              <Link href={`/dashboard/classes/${id}/edit`}
                className="flex items-center gap-2 px-4 py-2.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-xs font-bold uppercase tracking-widest transition-all">
                <PencilIcon className="w-4 h-4" /> Edit Class
              </Link>
              <Link href={`/dashboard/attendance?class_id=${id}`}
                className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-500 rounded-xl text-xs font-bold uppercase tracking-widest shadow-lg shadow-blue-900/20 transition-all">
                <ClipboardDocumentCheckIcon className="w-4 h-4" /> Attendance
              </Link>
            </div>
          )}
        </div>

        <div className="flex items-center gap-1 p-1 bg-white/5 border border-white/10 rounded-2xl w-fit">
          {[
            { id: 'overview', label: 'Overview', icon: UserGroupIcon },
            { id: 'lessons', label: 'Curriculum', icon: BookOpenIcon },
            { id: 'assignments', label: 'Tasks', icon: ClipboardDocumentListIcon },
            { id: 'cbt', label: 'CBT / Quizzes', icon: AcademicCapIcon },
            { id: 'gradebook', label: 'Gradebook', icon: ChartBarIcon, staffOnly: true },
          ].filter(tab => !tab.staffOnly || isStaff).map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-widest transition-all ${activeTab === tab.id ? 'bg-blue-600 text-white' : 'text-white/40 hover:text-white hover:bg-white/5'
                }`}
            >
              <tab.icon className="w-4 h-4" />
              {tab.label}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">

          {/* Main Content Area */}
          <div className="lg:col-span-2 space-y-6">

            {activeTab === 'overview' && (
              <>
                {/* Stats Grid */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  {[
                    { label: 'Enrolled', value: enrollments.length, icon: UserGroupIcon, color: 'text-blue-400' },
                    { label: 'Capacity', value: cls.max_students, icon: ChartBarIcon, color: 'text-violet-400' },
                    { label: 'Sessions', value: sessions.length, icon: CalendarIcon, color: 'text-emerald-400' },
                    { label: 'Difficulty', value: cls.programs?.difficulty_level, icon: BoltIcon, color: 'text-amber-400' },
                  ].map(s => (
                    <div key={s.label} className="bg-white/5 border border-white/10 rounded-2xl p-5">
                      <p className="text-[10px] font-black text-white/30 uppercase tracking-widest mb-1">{s.label}</p>
                      <p className={`text-xl font-black ${s.color}`}>{s.value}</p>
                    </div>
                  ))}
                </div>

                {/* Class Info */}
                <div className="bg-white/5 border border-white/10 rounded-3xl p-6">
                  <h3 className="text-sm font-black uppercase tracking-widest text-white/40 mb-4">About this class</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-4">
                      <div>
                        <p className="text-[10px] font-bold text-white/20 uppercase">Teacher</p>
                        <p className="font-semibold">{cls.portal_users?.full_name ?? 'Not Assigned'}</p>
                      </div>
                      <div>
                        <p className="text-[10px] font-bold text-white/20 uppercase">Schedule</p>
                        <p className="font-semibold">{cls.schedule ?? 'Not set'}</p>
                      </div>
                    </div>
                    <div className="space-y-4">
                      <div>
                        <p className="text-[10px] font-bold text-white/20 uppercase">Dates</p>
                        <p className="font-semibold text-xs">
                          {cls.start_date ? new Date(cls.start_date).toLocaleDateString() : '—'}
                          {cls.end_date && ` to ${new Date(cls.end_date).toLocaleDateString()}`}
                        </p>
                      </div>
                      <div>
                        <p className="text-[10px] font-bold text-white/20 uppercase">Programme</p>
                        <p className="text-blue-400 font-bold">{cls.programs?.name}</p>
                      </div>
                    </div>
                  </div>
                  {cls.description && (
                    <div className="mt-6 pt-6 border-t border-white/5">
                      <p className="text-sm text-white/50 leading-relaxed italic">"{cls.description}"</p>
                    </div>
                  )}
                </div>

                {/* Recent Sessions */}
                <div className="bg-white/5 border border-white/10 rounded-3xl overflow-hidden">
                  <div className="px-6 py-4 border-b border-white/10 flex items-center justify-between">
                    <h3 className="text-xs font-black uppercase tracking-widest text-white/40">Recent Activity</h3>
                    <Link href={`/dashboard/attendance?class_id=${id}`} className="text-[10px] font-bold text-blue-400 hover:underline">Full Logs →</Link>
                  </div>
                  {sessions.length === 0 ? (
                    <div className="p-12 text-center text-white/20">
                      <CalendarIcon className="w-8 h-8 mx-auto mb-3 opacity-20" />
                      <p className="text-sm">No session activity yet</p>
                    </div>
                  ) : (
                    <div className="divide-y divide-white/5">
                      {sessions.map(s => (
                        <div key={s.id} className="px-6 py-4 flex items-center gap-4 hover:bg-white/3 transition-colors">
                          <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center text-blue-400">
                            <CalendarIcon className="w-5 h-5" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-bold text-sm truncate">{s.topic ?? 'Normal Session'}</p>
                            <p className="text-[10px] text-white/30">{new Date(s.session_date).toLocaleDateString()} · {s.start_time}-{s.end_time}</p>
                          </div>
                          {s.notes && <p className="text-[10px] text-white/20 italic max-w-[150px] truncate">{s.notes}</p>}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}

            {activeTab === 'lessons' && (
              <div className="space-y-4">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-sm font-black uppercase tracking-widest text-white/40">Available Lessons</h3>
                  <button onClick={() => setViewingItem({ type: 'lesson', id: 'add' })} className="px-3 py-1.5 bg-cyan-600 hover:bg-cyan-500 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all">
                    + New Lesson
                  </button>
                </div>
                {items.lessons.length === 0 ? (
                  <div className="bg-white/5 border border-white/10 border-dashed rounded-3xl p-12 text-center text-white/20">
                    <BookOpenIcon className="w-10 h-10 mx-auto mb-4 opacity-10" />
                    <p>No lessons added to this programme curriculum.</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {items.lessons.map(l => (
                      <div key={l.id} className="p-5 bg-white/5 border border-white/10 rounded-2xl hover:border-cyan-500/50 hover:bg-cyan-500/5 transition-all group cursor-pointer" onClick={() => setViewingItem({ type: 'lesson', id: l.id })}>
                        <div className="flex items-center gap-3 mb-3">
                          <div className="w-8 h-8 rounded-lg bg-cyan-500/10 flex items-center justify-center text-cyan-400">
                            <AcademicCapIcon className="w-4 h-4" />
                          </div>
                          <span className="text-[10px] font-black text-cyan-400 uppercase tracking-widest">{l.lesson_type}</span>
                        </div>
                        <h4 className="font-bold text-white group-hover:text-cyan-400 transition-colors line-clamp-1">{l.title}</h4>
                        <p className="text-[10px] text-white/30 uppercase mt-1">Status: {l.status}</p>
                        <div className="mt-4 flex gap-2">
                          <Link href={`/dashboard/lessons/${l.id}?class_id=${id}`} onClick={e => e.stopPropagation()} className="text-[9px] font-black text-white/40 hover:text-white uppercase tracking-widest">Preview Page →</Link>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {activeTab === 'assignments' && (
              <div className="space-y-4">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-sm font-black uppercase tracking-widest text-white/40">Class Assignments</h3>
                  <button onClick={() => setViewingItem({ type: 'assignment', id: 'add' })} className="px-3 py-1.5 bg-amber-600 hover:bg-amber-500 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all">
                    + New Task
                  </button>
                </div>
                {items.assignments.length === 0 ? (
                  <div className="bg-white/5 border border-white/10 border-dashed rounded-3xl p-12 text-center text-white/20">
                    <ClipboardDocumentCheckIcon className="w-10 h-10 mx-auto mb-4 opacity-10" />
                    <p>No assignments created for this class yet.</p>
                  </div>
                ) : (
                  <div className="divide-y divide-white/5 bg-white/5 border border-white/10 rounded-3xl overflow-hidden">
                    {items.assignments.map(a => (
                      <div key={a.id} className="p-5 flex items-center gap-4 hover:bg-white/5 transition-colors cursor-pointer group" onClick={() => setViewingItem({ type: 'assignment', id: a.id })}>
                        <div className="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center text-amber-500 flex-shrink-0 group-hover:scale-110 transition-transform">
                          <ClipboardDocumentListIcon className="w-5 h-5" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <h4 className="font-bold text-sm truncate group-hover:text-amber-400 transition-colors">{a.title}</h4>
                          <p className="text-[10px] text-white/30 uppercase">{a.assignment_type} · {a.due_date ? `Due: ${new Date(a.due_date).toLocaleDateString()}` : 'No due date'}</p>
                        </div>
                        <div className="flex gap-2">
                          <Link href={`/dashboard/assignments/${a.id}?class_id=${id}`} onClick={e => e.stopPropagation()} className="px-4 py-2 bg-white/5 hover:bg-white/10 rounded-xl text-[10px] font-black border border-white/10 transition-all uppercase tracking-widest">
                            Manage Page
                          </Link>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {activeTab === 'cbt' && (
              <div className="space-y-4">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-sm font-black uppercase tracking-widest text-white/40">CBT / Exams</h3>
                  <button onClick={() => setViewingItem({ type: 'cbt', id: 'add' })} className="px-3 py-1.5 bg-violet-600 hover:bg-violet-500 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all">
                    + New CBT
                  </button>
                </div>
                {items.cbt.length === 0 ? (
                  <div className="bg-white/5 border border-white/10 border-dashed rounded-3xl p-12 text-center text-white/20">
                    <BoltIcon className="w-10 h-10 mx-auto mb-4 opacity-10" />
                    <p>No Computer Based Tests configured for this programme.</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 gap-3">
                    {items.cbt.map(e => (
                      <div key={e.id} className="flex items-center justify-between p-5 bg-gradient-to-r from-violet-600/10 to-transparent border border-violet-500/20 rounded-2xl hover:border-violet-500 transition-all group cursor-pointer" onClick={() => setViewingItem({ type: 'cbt', id: e.id })}>
                        <div className="flex items-center gap-4">
                          <div className="w-10 h-10 rounded-xl bg-violet-500/20 flex items-center justify-center text-violet-400 group-hover:scale-110 transition-transform">
                            <StarIcon className="w-5 h-5" />
                          </div>
                          <div>
                            <h4 className="font-black text-white">{e.title}</h4>
                            <p className="text-[10px] text-white/30 uppercase tracking-widest">{e.duration_minutes}m · {e.total_questions} Questions · {e.is_active ? 'Active' : 'Draft'}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-4">
                          <Link href={`/dashboard/cbt/${e.id}?class_id=${id}`} onClick={e => e.stopPropagation()} className="text-[9px] font-black text-white/20 hover:text-white uppercase tracking-widest">Full View</Link>
                          <ArrowRightIcon className="w-5 h-5 text-white/20 group-hover:text-violet-400 transition-colors mr-2" />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {activeTab === 'gradebook' && (
              <div className="space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-2 gap-2">
                  <div className="flex items-center gap-3">
                    <h3 className="text-sm font-black uppercase tracking-widest text-white/40">Class Gradebook</h3>
                    {isStaff && (
                      <button
                        onClick={() => setManualEntry(!manualEntry)}
                        className={`flex items-center gap-2 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest transition-all ${manualEntry ? 'bg-emerald-500 text-white' : 'bg-white/5 text-white/40 border border-white/10 hover:bg-white/10'}`}
                      >
                        {manualEntry ? <CheckIconOutline className="w-3 h-3" /> : <PencilSquareIconOutline className="w-3 h-3" />}
                        {manualEntry ? 'Editing Mode' : 'Manual Entry'}
                      </button>
                    )}
                  </div>
                  <button onClick={() => router.push('/dashboard/grades')} className="text-[10px] font-black text-blue-400 hover:underline uppercase tracking-widest">
                    Full Grading Center →
                  </button>
                </div>
                {items.assignments.length === 0 ? (
                  <div className="bg-white/5 border border-white/10 border-dashed rounded-3xl p-12 text-center text-white/20">
                    <ChartBarIcon className="w-10 h-10 mx-auto mb-4 opacity-10" />
                    <p>No assignments to track for this class.</p>
                  </div>
                ) : (
                  <div className="bg-white/5 border border-white/10 rounded-3xl overflow-hidden overflow-x-auto">
                    <table className="w-full text-left border-collapse min-w-[600px]">
                      <thead>
                        <tr className="border-b border-white/10 bg-white/3">
                          <th className="px-6 py-4 text-[10px] font-black text-white/30 uppercase tracking-widest">Student</th>
                          {items.assignments.map(a => (
                            <th key={a.id} className="px-4 py-4 text-[10px] font-black text-white/30 uppercase tracking-widest text-center min-w-[120px] bg-amber-500/5">
                              <div className="line-clamp-1" title={a.title}>{a.title}</div>
                              <div className="text-[8px] opacity-40 lowercase font-normal">Assignment · {a.max_points}pts</div>
                            </th>
                          ))}
                          {items.cbt.map(c => (
                            <th key={c.id} className="px-4 py-4 text-[10px] font-black text-white/30 uppercase tracking-widest text-center min-w-[120px] bg-violet-600/5">
                              <div className="line-clamp-1" title={c.title}>{c.title}</div>
                              <div className="text-[8px] opacity-40 lowercase font-normal">CBT · {c.total_questions} Qs</div>
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/5 font-medium text-xs">
                        {enrollments.map(enr => (
                          <tr key={enr.id} className="hover:bg-white/2 transition-colors group">
                            <td className="px-4 sm:px-6 py-5 sticky left-0 bg-[#0f0f1a] z-10 border-r border-white/5 group-hover:bg-[#151525] transition-colors shadow-xl">
                              <div className="flex items-center gap-2 sm:gap-3 max-w-[140px] sm:max-w-none">
                                <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-xl bg-gradient-to-br from-blue-500/20 to-indigo-600/20 border border-blue-500/20 flex items-center justify-center text-[9px] sm:text-[10px] font-black text-blue-400 flex-shrink-0">
                                  {(enr.portal_users?.full_name ?? '?')[0]}
                                </div>
                                <div className="min-w-0">
                                  <p className="text-white font-bold whitespace-nowrap text-[11px] sm:text-xs truncate">{enr.portal_users?.full_name}</p>
                                  <p className="text-[8px] sm:text-[9px] text-white/30 truncate">{enr.portal_users?.email}</p>
                                </div>
                              </div>
                            </td>
                            {items.assignments.map(a => {
                              const sub = items.submissions.find(s => s.assignment_id === a.id && s.portal_user_id === enr.portal_users.id);
                              const score = sub?.grade;
                              const percentage = a.max_points > 0 ? (score ?? 0) / a.max_points : 0;
                              return (
                                <td key={a.id} className={`px-2 py-5 text-center border-l border-white/5 transition-all relative ${manualEntry ? 'bg-emerald-500/5' : 'bg-amber-500/[0.02] group-hover:bg-amber-500/[0.05]'}`}>
                                  {manualEntry ? (
                                    <div className="flex flex-col items-center gap-1">
                                      <input
                                        type="number"
                                        defaultValue={score ?? ''}
                                        onBlur={async (e) => {
                                          const val = e.target.value;
                                          if (val === '' || isNaN(Number(val))) return;
                                          const numVal = Math.min(Number(val), a.max_points);
                                          const key = `asm-${a.id}-${enr.portal_users.id}`;
                                          if (numVal === score) return;
                                          
                                          setMatrixSaving(p => ({ ...p, [key]: true }));
                                          try {
                                            if (sub) {
                                              await gradeSubmission(sub.id, numVal, sub.feedback || '', profile!.id);
                                            } else {
                                              // Create new submission if not exists? Probably better to just update existing ones in this view.
                                              // For now, let's assume we update existing ones.
                                            }
                                            await fetchData(); // Refresh data
                                          } catch (err) {
                                            console.error(err);
                                          } finally {
                                            setMatrixSaving(p => ({ ...p, [key]: false }));
                                          }
                                        }}
                                        className="w-12 h-8 bg-white/5 border border-white/10 rounded-lg text-center text-xs font-black text-white focus:border-emerald-500 outline-none transition-all"
                                      />
                                      {matrixSaving[`asm-${a.id}-${enr.portal_users.id}`] && (
                                        <CloudArrowUpIcon className="w-3 h-3 text-emerald-400 animate-pulse absolute top-1 right-1" />
                                      )}
                                    </div>
                                  ) : sub ? (
                                    score !== null ? (
                                      <div className="space-y-1">
                                         <span className={`text-sm font-black ${percentage >= 0.7 ? 'text-emerald-400' : percentage >= 0.5 ? 'text-amber-400' : 'text-rose-400'}`}>
                                          {score}
                                        </span>
                                        <div className="w-full h-0.5 bg-white/5 rounded-full overflow-hidden max-w-[40px] mx-auto">
                                          <div className={`h-full ${percentage >= 0.7 ? 'bg-emerald-500' : percentage >= 0.5 ? 'bg-amber-500' : 'bg-rose-500'}`} style={{ width: `${percentage * 100}%` }}></div>
                                        </div>
                                      </div>
                                    ) : (
                                      <span className="text-[9px] font-black text-blue-400/60 uppercase tracking-widest bg-blue-500/10 px-2 py-1 rounded-md">Pending</span>
                                    )
                                  ) : (
                                    <span className="text-[9px] text-white/5 font-bold uppercase tracking-widest">—</span>
                                  )}
                                </td>
                              );
                            })}
                            {items.cbt.map(c => {
                              const sess = items.cbtSessions.find(s => s.exam_id === c.id && s.user_id === enr.portal_users.id);
                              const score = sess?.score;
                              const percentage = c.total_questions > 0 ? (score ?? 0) / c.total_questions : 0;
                              return (
                                <td key={c.id} className="px-4 py-5 text-center border-l border-white/5 bg-violet-600/[0.02] group-hover:bg-violet-600/[0.05] transition-all">
                                  {sess ? (
                                    score !== null ? (
                                      <div className="space-y-1">
                                        <span className={`text-sm font-black ${percentage >= 0.7 ? 'text-emerald-400' : percentage >= 0.5 ? 'text-amber-400' : 'text-rose-400'}`}>
                                          {score}
                                        </span>
                                        <div className="w-full h-0.5 bg-white/5 rounded-full overflow-hidden max-w-[40px] mx-auto">
                                          <div className={`h-full ${percentage >= 0.7 ? 'bg-emerald-500' : percentage >= 0.5 ? 'bg-amber-500' : 'bg-rose-500'}`} style={{ width: `${percentage * 100}%` }}></div>
                                        </div>
                                      </div>
                                    ) : (
                                      <span className="text-[9px] font-black text-cyan-400/60 uppercase tracking-widest bg-cyan-500/10 px-2 py-1 rounded-md">Active</span>
                                    )
                                  ) : (
                                    <span className="text-[9px] text-white/5 font-bold uppercase tracking-widest">—</span>
                                  )}
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

          </div>

          {/* Right: Sidebar */}
          <div className="space-y-6">

            {/* Quick Actions */}
            {isStaff && (
              <div className="bg-white/5 border border-white/10 rounded-3xl p-6 space-y-4">
                <h3 className="text-xs font-black uppercase tracking-widest text-white/40">Teacher Toolkit</h3>
                <div className="grid grid-cols-1 gap-2">
                  <button onClick={() => router.push(`/dashboard/attendance?class_id=${id}`)} className="flex items-center gap-3 w-full p-4 bg-blue-600/10 hover:bg-blue-600/20 border border-blue-600/20 rounded-2xl text-left transition-all group">
                    <div className="w-10 h-10 rounded-xl bg-blue-600/20 flex items-center justify-center text-blue-400 group-hover:scale-110 transition-transform"><CheckCircleIcon className="w-5 h-5" /></div>
                    <div>
                      <p className="text-xs font-black text-white uppercase tracking-tighter">Roll Call</p>
                      <p className="text-[10px] text-white/40">Mark attendance now</p>
                    </div>
                  </button>
                  <button onClick={() => setViewingItem({ type: 'assignment', id: 'add' })} className="flex items-center gap-3 w-full p-4 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/20 rounded-2xl text-left transition-all group">
                    <div className="w-10 h-10 rounded-xl bg-amber-500/20 flex items-center justify-center text-amber-500 group-hover:scale-110 transition-transform"><ClipboardDocumentListIcon className="w-5 h-5" /></div>
                    <div>
                      <p className="text-xs font-black text-white uppercase tracking-tighter">Quick Task</p>
                      <p className="text-[10px] text-white/40">Launch new assignment</p>
                    </div>
                  </button>
                  <button onClick={() => setViewingItem({ type: 'lesson', id: 'add' })} className="flex items-center gap-3 w-full p-4 bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-500/20 rounded-2xl text-left transition-all group">
                    <div className="w-10 h-10 rounded-xl bg-cyan-500/20 flex items-center justify-center text-cyan-400 group-hover:scale-110 transition-transform"><BookOpenIcon className="w-5 h-5" /></div>
                    <div>
                      <p className="text-xs font-black text-white uppercase tracking-tighter">New Lesson</p>
                      <p className="text-[10px] text-white/40">Add to curriculum</p>
                    </div>
                  </button>
                  <button onClick={() => setViewingItem({ type: 'cbt', id: 'add' })} className="flex items-center gap-3 w-full p-4 bg-violet-600/10 hover:bg-violet-600/20 border border-violet-600/20 rounded-2xl text-left transition-all group">
                    <div className="w-10 h-10 rounded-xl bg-violet-600/20 flex items-center justify-center text-violet-400 group-hover:scale-110 transition-transform"><AcademicCapIcon className="w-5 h-5" /></div>
                    <div>
                      <p className="text-xs font-black text-white uppercase tracking-tighter">CBT Exam</p>
                      <p className="text-[10px] text-white/40">Online testing</p>
                    </div>
                  </button>
                </div>
              </div>
            )}

            {/* Students List */}
            <div className="bg-white/5 border border-white/10 rounded-3xl overflow-hidden">
              <div className="px-6 py-4 border-b border-white/10 flex items-center justify-between">
                <h3 className="text-xs font-black uppercase tracking-widest text-white/40">Enrolled Students</h3>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-black text-blue-400">{enrollments.length} / {cls.max_students}</span>
                  {isStaff && (
                    <>
                      <button
                        onClick={handleExportLogins}
                        className="px-3 py-1.5 rounded-lg bg-emerald-600/20 hover:bg-emerald-600/40 text-emerald-400 text-[10px] font-black uppercase tracking-widest transition-all"
                        title="Export Student Logins"
                      >
                        Export Logins
                      </button>
                      <button
                        onClick={() => { setShowStudentModal(true); loadAvailableStudents(); }}
                        className="p-1 rounded-md bg-blue-600/20 hover:bg-blue-600/40 text-blue-400 transition-all"
                        title="Add Students"
                      >
                        <PlusIcon className="w-3.5 h-3.5" />
                      </button>
                    </>
                  )}
                </div>
              </div>
              {enrollments.length === 0 ? (
                <div className="p-10 text-center space-y-3">
                  <UserGroupIcon className="w-8 h-8 mx-auto opacity-10" />
                  <p className="text-xs text-white/20">No students found.</p>
                  <Link href={`/dashboard/classes/${id}/edit`} className="inline-block text-[10px] font-bold text-blue-400 uppercase tracking-widest underline">Manage Roster</Link>
                </div>
              ) : (
                <div className="divide-y divide-white/5 max-h-[400px] overflow-y-auto">
                  {enrollments.map((enr: any) => (
                    <div key={enr.id} className="px-6 py-3 flex items-center gap-3 hover:bg-white/3 transition-colors">
                      <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-violet-500 flex items-center justify-center text-[10px] font-black text-white flex-shrink-0">
                        {(enr.portal_users?.full_name ?? '?')[0]}
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-white truncate">{enr.portal_users?.full_name}</p>
                        <p className="text-[9px] text-white/30 uppercase tracking-tighter">{enr.portal_users?.email}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

          </div>

        </div>
      </div>

      {/* Student Management Modal */}
      {showStudentModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-[#1a1a2e] border border-white/10 rounded-3xl w-full max-w-md shadow-2xl overflow-hidden">
            <div className="px-6 py-4 border-b border-white/10 flex items-center justify-between">
              <h3 className="font-black uppercase tracking-widest text-sm text-white">Manage Roster</h3>
              <button onClick={() => setShowStudentModal(false)} className="text-white/40 hover:text-white transition-colors">&times;</button>
            </div>

            <div className="p-6 space-y-4">
              <p className="text-xs text-white/40 uppercase tracking-widest font-bold">Unassigned Students in Programme</p>

              {processingStudent === 'loading' ? (
                <div className="py-12 text-center">
                  <ArrowPathIcon className="w-8 h-8 text-blue-500 animate-spin mx-auto" />
                </div>
              ) : availableStudents.length === 0 ? (
                <div className="py-12 text-center text-white/20 border border-white/5 border-dashed rounded-2xl">
                  <UserGroupIcon className="w-8 h-8 mx-auto mb-2 opacity-10" />
                  <p className="text-xs">All programme students are already in this class or another class.</p>
                </div>
              ) : (
                <div className="space-y-2 max-h-[300px] overflow-y-auto pr-2">
                  {availableStudents.map(student => (
                    <div key={student.id} className="flex items-center justify-between p-3 bg-white/5 border border-white/5 rounded-2xl hover:bg-white/10 transition-all">
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-white truncate">{student.full_name}</p>
                        <p className="text-[9px] text-white/30 truncate">{student.email}</p>
                        {student.section_class && (
                          <p className="text-[8px] text-amber-500/60 uppercase font-black tracking-tighter mt-0.5">Current Class: {student.section_class}</p>
                        )}
                      </div>
                      <button
                        onClick={() => assignStudent(student.id)}
                        disabled={!!processingStudent}
                        className="flex-shrink-0 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-[10px] font-black uppercase rounded-lg transition-all"
                      >
                        {processingStudent === student.id ? '...' : 'Assign'}
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="px-6 py-4 bg-white/5 flex justify-end">
              <button
                onClick={() => setShowStudentModal(false)}
                className="px-4 py-2 text-xs font-black uppercase tracking-widest text-white/40 hover:text-white transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
      {/* ── Slide-over Panel for Content ── */}
      {viewingItem && (
        <div className="fixed inset-0 z-[60] overflow-hidden">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setViewingItem(null)} />
          <div className="absolute inset-y-0 right-0 max-w-2xl w-full flex">
            <div className="h-full w-full bg-[#0a0a14] border-l border-white/10 shadow-2xl flex flex-col animate-in slide-in-from-right duration-300">
              <div className="p-6 border-b border-white/10 flex items-center justify-between bg-white/5">
                <div>
                  <h3 className="text-xs font-black text-blue-400 uppercase tracking-[0.2em]">{viewingItem.id === 'add' ? 'Create' : 'View'} {viewingItem.type}</h3>
                  <p className="text-[10px] text-white/40 uppercase font-black">Managing in context of {cls.name}</p>
                </div>
                <div className="flex items-center gap-2">
                  {viewingItem.id !== 'add' && (
                    <Link href={`/dashboard/${viewingItem.type === 'lesson' ? 'lessons' : viewingItem.type === 'assignment' ? 'assignments' : 'cbt'}/${viewingItem.id}/edit`}
                      className="p-2 rounded-xl bg-white/5 border border-white/10 hover:text-cyan-400 transition-colors">
                      <PencilIcon className="w-4 h-4" />
                    </Link>
                  )}
                  <button onClick={() => setViewingItem(null)} className="p-2 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 text-white/40 hover:text-white">
                    <PlusIcon className="w-4 h-4 rotate-45" />
                  </button>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-8">
                <iframe
                  src={`/dashboard/${viewingItem.type === 'lesson' ? 'lessons' : viewingItem.type === 'assignment' ? 'assignments' : 'cbt'}/${viewingItem.id === 'add' ? (viewingItem.type === 'lesson' ? 'add' : 'new') : viewingItem.id}?minimal=true&program_id=${cls.program_id}`}
                  className="w-full h-full border-none rounded-2xl bg-white/5"
                  title="Content View"
                />
              </div>
            </div>
          </div>
        </div>
      )
      }
    </div >
  );
}

// Support Icons (inline SVGs for icons not in the heroicons import above)
function StarIcon(props: any) { return <svg fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" {...props}><path strokeLinecap="round" strokeLinejoin="round" d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.385a.563.563 0 00-.182-.557l-4.204-3.602a.563.563 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345l2.125-5.111z" /></svg>; }
function ArrowRightIcon(props: any) { return <svg fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" {...props}><path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" /></svg>; }
