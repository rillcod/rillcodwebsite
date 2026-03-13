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
  ClipboardDocumentListIcon, ChevronRightIcon, UserIcon,
  CloudArrowDownIcon,
  PencilSquareIcon as PencilSquareIconOutline, CheckIcon as CheckIconOutline,
  CloudArrowUpIcon, UserPlusIcon
} from '@heroicons/react/24/outline';
import { gradeSubmission } from '@/services/dashboard.service';
import { AddStudentModal } from '@/features/students/components/AddStudentModal';


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
  const [showRegisterModal, setShowRegisterModal] = useState(false);

  const isStaff = profile?.role === 'admin' || profile?.role === 'teacher' || profile?.role === 'school';
  const [viewingItem, setViewingItem] = useState<{ type: 'lesson' | 'assignment' | 'cbt' | 'attendance', id: string } | null>(null);

  const fetchData = async () => {
    if (!id || !profile) return;
    setLoading(true);
    const supabase = createClient();
    try {
      const [clsRes, sessRes] = await Promise.all([
        supabase.from('classes').select('*, programs(name, difficulty_level), portal_users(full_name), schools(name, logo_url)').eq('id', id!).maybeSingle(),
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
          body { font-family: system-ui, -apple-system, sans-serif; padding: 40px; color: #111; max-width: 900px; margin: 0 auto; line-height: 1.5; }
          .header-container { display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #eee; padding-bottom: 20px; margin-bottom: 30px; }
          .company-brand { text-align: left; }
          .company-name { font-size: 20px; font-weight: 900; color: #000; letter-spacing: 1px; }
          .company-tag { font-size: 10px; font-weight: 700; color: #666; text-transform: uppercase; letter-spacing: 2px; }
          .school-info { text-align: right; }
          .school-name { font-size: 18px; font-weight: 800; color: #4F46E5; text-transform: uppercase; }
          .school-logo { max-height: 50px; margin-bottom: 5px; }
          h1 { font-size: 24px; margin: 20px 0 10px 0; text-align: center; color: #111; text-transform: uppercase; letter-spacing: 1px; }
          .meta { font-size: 13px; color: #444; margin-bottom: 30px; text-align: center; background: #f9fafb; padding: 15px; border-radius: 12px; border: 1px solid #f1f5f9; }
          table { width: 100%; border-collapse: collapse; margin-top: 10px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
          th, td { border: 1px solid #e2e8f0; padding: 14px; text-align: left; font-size: 13px; }
          th { background: #f8fafc; font-weight: 800; text-transform: uppercase; font-size: 11px; letter-spacing: 1px; color: #64748b; }
          .student-cell { color: #1e293b; font-weight: 700; }
          .pass-field { display: inline-block; width: 140px; height: 1px; background: #cbd5e1; margin-top: 12px; }
          .note { margin-top: 40px; text-align: center; color: #64748b; font-size: 11px; font-style: italic; }
          .print-btn { display: block; margin: 30px auto; padding: 12px 24px; background: #0f172a; color: white; border: none; border-radius: 8px; cursor: pointer; font-weight: bold; font-size: 14px; }
          @media print { body { padding: 20px; } .print-btn { display: none; } .meta { border: 1px solid #ddd; } }
        </style>
      </head>
      <body>
        <div class="header-container">
          <div class="company-brand">
            <div class="company-name">RILLCOD ACADEMY</div>
            <div class="company-tag">Future-Proof Education</div>
          </div>
          <div class="school-info">
            ${cls.schools?.logo_url ? `<img src="${cls.schools.logo_url}" alt="School Logo" class="school-logo" />` : ''}
            <div class="school-name">${cls.schools?.name || 'Academic Partner'}</div>
          </div>
        </div>
        <h1>Student Security Registry</h1>
        <div class="meta">
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
            <div><strong>CLASS:</strong> ${cls.name}</div>
            <div><strong>PROGRAMME:</strong> ${cls.programs?.name}</div>
            <div><strong>FACILITATOR:</strong> ${cls.portal_users?.full_name}</div>
            <div><strong>DATE ISSUED:</strong> ${new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}</div>
          </div>
        </div>
        <table>
          <thead>
            <tr>
              <th>Full Name</th>
              <th>Class Reference</th>
              <th>Login Identifier (Email)</th>
              <th>Assigned Key (Password)</th>
            </tr>
          </thead>
          <tbody>
            ${enrRows}
          </tbody>
        </table>
        <div class="note">
          Please keep these credentials secure. Change your password after first login.
        </div>
        <button class="print-btn" onclick="window.print()">Print Official Registry</button>
      </body>
      </html>
    `;

    printWindow.document.write(html);
    printWindow.document.close();
  };

  if (authLoading || loading) return (
    <div className="min-h-screen bg-[#050a17] flex items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <div className="w-12 h-12 border-4 border-violet-500 border-t-transparent rounded-full animate-spin" />
        <p className="text-white/40 font-medium animate-pulse uppercase tracking-[0.2em] text-[10px]">Decoding Registry State...</p>
      </div>
    </div>
  );

  if (!isStaff) return (
    <div className="min-h-screen bg-[#050a17] flex items-center justify-center">
      <div className="bg-white/5 border border-white/10 rounded-[2rem] p-8 text-center max-w-sm">
        <ExclamationTriangleIcon className="w-12 h-12 text-rose-500/20 mx-auto mb-4" />
        <p className="text-white/40 font-black uppercase tracking-widest text-xs leading-relaxed">Insufficient clearance to access specialized cluster telemetry.</p>
      </div>
    </div>
  );

  if (error || !cls) return (
    <div className="min-h-screen bg-[#050a17] flex flex-col items-center justify-center gap-6">
      <div className="w-20 h-20 bg-rose-500/10 rounded-full flex items-center justify-center border border-rose-500/20">
        <ExclamationTriangleIcon className="w-10 h-10 text-rose-500/40" />
      </div>
      <div className="text-center space-y-2">
        <p className="text-rose-400 font-black uppercase tracking-widest">{error ?? 'Cluster mismatch'}</p>
        <p className="text-white/20 text-[10px] font-black uppercase tracking-[0.2em]">The requested resource is missing or inaccessible</p>
      </div>
      <Link href="/dashboard/classes" className="px-8 py-3 bg-white/5 hover:bg-white/10 border border-white/10 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all">
        Return to Registry
      </Link>
    </div>
  );

  const renderMinimalPage = (url: string) => (
    <div className="fixed inset-0 z-[100] bg-[#050a17] flex flex-col">
      <div className="flex items-center justify-between p-4 border-b border-white/10 bg-[#0B132B]">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center">
            <BoltIcon className="w-4 h-4 text-violet-400" />
          </div>
          <h3 className="text-white font-black uppercase tracking-[0.2em] text-[10px]">Operation: {viewingItem?.type.replace('_', ' ')}</h3>
        </div>
        <button onClick={() => setViewingItem(null)} className="p-2 hover:bg-white/5 rounded-xl text-white/40 hover:text-white transition-all">
          <XMarkIcon className="w-6 h-6" />
        </button>
      </div>
      <div className="flex-1 overflow-hidden relative">
        <iframe 
          src={`${url}${url.includes('?') ? '&' : '?'}minimal=true`} 
          className="w-full h-full border-none" 
          title="Operation Frame"
        />
      </div>
    </div>
  );

  if (viewingItem?.type === 'assignment') return renderMinimalPage('/dashboard/assignments/new');
  if (viewingItem?.type === 'lesson') return renderMinimalPage('/dashboard/lessons/add');
  if (viewingItem?.type === 'cbt') return renderMinimalPage('/dashboard/cbt/new');
  if (viewingItem?.type === 'attendance') return renderMinimalPage(`/dashboard/attendance?class_id=${id}`);

  return (
    <div className="min-h-screen bg-[#050a17] text-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 space-y-8 pb-32">

        {/* ── Header Area ────────────────────────────────────────── */}
        <div className="relative">
          <div className="absolute -top-24 -left-20 w-64 h-64 bg-violet-600 opacity-10 blur-[100px] pointer-events-none" />
          <div className="flex flex-col md:flex-row md:items-center gap-8 relative z-10">
            <button onClick={() => router.back()}
              className="w-14 h-14 flex items-center justify-center rounded-2xl bg-white/5 hover:bg-white/10 border border-white/10 transition-all hover:scale-105 group flex-shrink-0">
              <ArrowLeftIcon className="w-6 h-6 text-white/40 group-hover:text-white transition-colors" />
            </button>
            <div className="flex-1 space-y-3">
              <div className="flex items-center gap-3">
                <div className={`px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-[0.2em] border shadow-lg ${
                  cls.status === 'active' ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' :
                  cls.status === 'scheduled' ? 'bg-amber-500/20 text-amber-400 border-amber-500/30' :
                  'bg-white/5 text-white/30 border-white/10'
                }`}>
                  {cls.status}
                </div>
                <div className="h-4 w-px bg-white/10" />
                <span className="text-[10px] font-black text-white/30 uppercase tracking-[0.2em]">{cls.programs?.name}</span>
              </div>
              <h1 className="text-4xl sm:text-6xl font-black tracking-tighter leading-none">{cls.name}</h1>
            </div>
            {isStaff && (
              <div className="flex gap-3">
                <Link href={`/dashboard/classes/${id}/edit`}
                  className="flex items-center gap-3 px-6 py-4 bg-white/5 hover:bg-white/10 border border-white/10 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all hover:border-violet-500/50">
                  <PencilIcon className="w-4 h-4 text-violet-400" /> Edit Settings
                </Link>
                <Link href={`/dashboard/attendance?class_id=${id}`}
                  className="flex items-center gap-3 px-8 py-4 bg-violet-600 hover:bg-violet-500 rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-xl shadow-violet-900/40 transition-all active:scale-95">
                  <ClipboardDocumentCheckIcon className="w-5 h-5" /> Attendance
                </Link>
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center overflow-x-auto scrollbar-hide gap-2 p-2 bg-white/5 border border-white/10 rounded-3xl w-full sm:w-fit no-scrollbar backdrop-blur-md">
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
              className={`flex items-center gap-3 px-6 py-3 rounded-2xl text-[10px] sm:text-xs font-black uppercase tracking-[0.2em] transition-all whitespace-nowrap flex-shrink-0 ${
                activeTab === tab.id 
                  ? 'bg-violet-600 text-white shadow-lg shadow-violet-900/40' 
                  : 'text-white/40 hover:text-white hover:bg-white/5'
              }`}
            >
              <tab.icon className="w-4 h-4" />
              {tab.label}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">

          {/* Main Content Area */}
          <div className="lg:col-span-2 space-y-8">

            {activeTab === 'overview' && (
              <>
                {/* Stats Grid */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  {[
                    { label: 'Enrolled', value: enrollments.length, icon: UserGroupIcon, gradient: 'from-blue-600 to-blue-400' },
                    { label: 'Capacity', value: cls.max_students, icon: ChartBarIcon, gradient: 'from-violet-600 to-violet-400' },
                    { label: 'Sessions', value: sessions.length, icon: CalendarIcon, gradient: 'from-emerald-600 to-emerald-400' },
                    { label: 'Difficulty', value: cls.programs?.difficulty_level, icon: BoltIcon, gradient: 'from-amber-600 to-amber-400' },
                  ].map(s => (
                    <div key={s.label} className="bg-white/5 border border-white/10 rounded-3xl p-6 group hover:bg-white/10 transition-all relative overflow-hidden">
                      <div className={`absolute top-0 right-0 w-16 h-16 bg-gradient-to-br ${s.gradient} opacity-[0.03] blur-xl -mr-8 -mt-8 group-hover:scale-150 transition-transform`} />
                      <p className="text-[9px] font-black text-white/30 uppercase tracking-[0.2em] mb-2">{s.label}</p>
                      <p className="text-2xl font-black text-white">{s.value}</p>
                    </div>
                  ))}
                </div>

                {/* Class Info */}
                <div className="bg-white/5 border border-white/10 rounded-[2.5rem] p-8 sm:p-10 relative overflow-hidden">
                  <div className="absolute top-0 right-0 w-64 h-64 bg-violet-600 opacity-[0.02] rounded-full blur-3xl" />
                  <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-white/20 mb-8">Metadata & Identity</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8 relative z-10">
                    <div className="space-y-6">
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center">
                          <UserIcon className="w-6 h-6 text-violet-400" />
                        </div>
                        <div>
                          <p className="text-[9px] font-black text-white/20 uppercase tracking-widest leading-none mb-1.5">Assigned Teacher</p>
                          <p className="text-sm font-bold text-white/80">{cls.portal_users?.full_name ?? 'NOT ASSIGNED'}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center">
                          <ClockIcon className="w-6 h-6 text-blue-400" />
                        </div>
                        <div>
                          <p className="text-[9px] font-black text-white/20 uppercase tracking-widest leading-none mb-1.5">Schedule Rhythm</p>
                          <p className="text-sm font-bold text-white/80">{cls.schedule ?? 'FLEXIBLE'}</p>
                        </div>
                      </div>
                    </div>
                    <div className="space-y-6">
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center">
                          <CalendarIcon className="w-6 h-6 text-emerald-400" />
                        </div>
                        <div>
                          <p className="text-[9px] font-black text-white/20 uppercase tracking-widest leading-none mb-1.5">Active Cycle</p>
                          <p className="text-sm font-bold text-white/80">
                            {cls.start_date ? new Date(cls.start_date).toLocaleDateString() : 'TBD'}
                            {cls.end_date && ` — ${new Date(cls.end_date).toLocaleDateString()}`}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center">
                          <AcademicCapIcon className="w-6 h-6 text-amber-400" />
                        </div>
                        <div>
                          <p className="text-[9px] font-black text-white/20 uppercase tracking-widest leading-none mb-1.5">Domain Pathway</p>
                          <p className="text-sm font-bold text-white/80 uppercase">{cls.programs?.name}</p>
                        </div>
                      </div>
                    </div>
                  </div>
                  {cls.description && (
                    <div className="mt-10 pt-10 border-t border-white/5">
                      <p className="text-sm text-white/40 leading-relaxed font-medium italic">"{cls.description}"</p>
                    </div>
                  )}
                </div>

                {/* Recent Sessions */}
                <div className="bg-white/5 border border-white/10 rounded-[2.5rem] overflow-hidden shadow-2xl">
                  <div className="px-8 py-6 border-b border-white/10 flex items-center justify-between bg-white/[0.02]">
                    <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-white/20">Operational History</h3>
                    <Link href={`/dashboard/attendance?class_id=${id}`} className="text-[9px] font-black text-violet-400 hover:text-violet-300 uppercase tracking-widest transition-colors tracking-[0.2em]">View Full Registry →</Link>
                  </div>
                  {sessions.length === 0 ? (
                    <div className="p-20 text-center flex flex-col items-center justify-center">
                      <div className="w-16 h-16 bg-white/5 rounded-full flex items-center justify-center mb-6 border border-white/5">
                        <CalendarIcon className="w-8 h-8 text-white/10" />
                      </div>
                      <p className="text-[10px] font-black text-white/20 uppercase tracking-widest">No verified session activity detected</p>
                    </div>
                  ) : (
                    <div className="divide-y divide-white/5">
                      {sessions.map(s => (
                        <div key={s.id} className="px-8 py-6 flex items-center gap-6 hover:bg-white/[0.03] transition-all group">
                          <div className="w-12 h-12 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center text-white/20 group-hover:text-violet-400 group-hover:border-violet-500/30 transition-all">
                            <CalendarIcon className="w-6 h-6" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-3 mb-1">
                              <p className="font-black text-sm text-white group-hover:text-violet-400 transition-colors uppercase tracking-tight">{s.topic ?? 'Standard Session'}</p>
                              <div className="h-3 w-px bg-white/10" />
                              <p className="text-[9px] font-black text-white/20 uppercase tracking-widest">{new Date(s.session_date).toLocaleDateString()}</p>
                            </div>
                            <p className="text-[10px] font-bold text-white/40 uppercase tracking-widest">{s.start_time || '00:00'} — {s.end_time || '00:00'}</p>
                          </div>
                          {s.notes && <p className="text-[10px] text-white/20 font-medium italic max-w-[200px] truncate hidden sm:block">"{s.notes}"</p>}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}

            {activeTab === 'lessons' && (
              <div className="space-y-6">
                <div className="bg-gradient-to-br from-violet-600 to-blue-600 rounded-[2rem] p-8 text-white relative overflow-hidden shadow-2xl">
                  <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 blur-3xl -mr-16 -mt-16" />
                  <div className="relative z-10">
                    <h2 className="text-2xl font-black tracking-tighter uppercase">Curriculum Master</h2>
                    <p className="text-white/60 text-[10px] font-black uppercase tracking-[0.2em] mt-1">Modular learning components</p>
                  </div>
                </div>
                {items.lessons.length === 0 ? (
                  <div className="bg-white/5 border border-white/10 rounded-[2.5rem] p-20 text-center flex flex-col items-center justify-center">
                    <div className="w-16 h-16 bg-white/5 rounded-full flex items-center justify-center mb-6 border border-white/5">
                      <BookOpenIcon className="w-8 h-8 text-white/10" />
                    </div>
                    <p className="text-[10px] font-black text-white/20 uppercase tracking-widest">No modular content detected in repository</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {items.lessons.map(lesson => (
                      <Link key={lesson.id} href={`/dashboard/lessons/${lesson.id}`} 
                        className="bg-white/5 border border-white/10 rounded-3xl p-6 group hover:bg-white/10 hover:border-violet-500/50 transition-all">
                        <div className="flex items-center gap-4 mb-4">
                          <div className="w-12 h-12 bg-white/5 border border-white/10 rounded-2xl flex items-center justify-center text-white/20 group-hover:text-violet-400 group-hover:bg-violet-600/10 transition-all">
                            <BookOpenIcon className="w-6 h-6" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-[9px] font-black text-white/20 uppercase tracking-widest mb-1">Module {lesson.order_index}</p>
                            <h4 className="font-black text-white group-hover:text-violet-400 transition-colors uppercase tracking-tight truncate">{lesson.title}</h4>
                          </div>
                        </div>
                        <p className="text-xs text-white/30 line-clamp-2 leading-relaxed font-medium">{lesson.content?.substring(0, 100)}...</p>
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            )}

            {activeTab === 'assignments' && (
              <div className="space-y-6">
                <div className="bg-gradient-to-br from-blue-600 to-cyan-600 rounded-[2rem] p-8 text-white relative overflow-hidden shadow-2xl">
                  <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 blur-3xl -mr-16 -mt-16" />
                  <div className="relative z-10">
                    <h2 className="text-2xl font-black tracking-tighter uppercase">Operational Tasks</h2>
                    <p className="text-white/60 text-[10px] font-black uppercase tracking-[0.2em] mt-1">Assignments and performance metrics</p>
                  </div>
                </div>
                {items.assignments.length === 0 ? (
                  <div className="bg-white/5 border border-white/10 rounded-[2.5rem] p-20 text-center flex flex-col items-center justify-center">
                    <div className="w-16 h-16 bg-white/5 rounded-full flex items-center justify-center mb-6 border border-white/5">
                      <ClipboardDocumentListIcon className="w-8 h-8 text-white/10" />
                    </div>
                    <p className="text-[10px] font-black text-white/20 uppercase tracking-widest">Zero tasks initialized for this cluster</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 gap-4">
                    {items.assignments.map(a => (
                      <Link key={a.id} href={`/dashboard/assignments/${a.id}`} 
                        className="bg-white/5 border border-white/10 rounded-3xl p-6 group hover:bg-white/10 hover:border-blue-500/50 transition-all flex flex-col sm:flex-row sm:items-center gap-6">
                        <div className="w-14 h-14 bg-white/5 border border-white/10 rounded-2xl flex items-center justify-center text-white/20 group-hover:text-blue-400 group-hover:bg-blue-600/10 transition-all shrink-0">
                          <ClipboardDocumentListIcon className="w-7 h-7" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-3 mb-1">
                            <h4 className="font-black text-lg text-white group-hover:text-blue-400 transition-colors uppercase tracking-tight">{a.title}</h4>
                            <span className="text-[9px] font-black px-2 py-0.5 bg-blue-500/10 text-blue-400 border border-blue-500/20 rounded uppercase tracking-widest">{a.weight} Pts</span>
                          </div>
                          <p className="text-xs text-white/30 font-medium uppercase tracking-widest">Deadline: {a.due_date ? new Date(a.due_date).toLocaleDateString() : 'NO LIMIT'}</p>
                        </div>
                        <div className="shrink-0 flex items-center gap-3">
                          <div className="text-right">
                            <p className="text-[9px] font-black text-white/20 uppercase tracking-widest mb-1">Status</p>
                            <p className="text-[10px] font-black text-emerald-400 uppercase tracking-widest">Active</p>
                          </div>
                          <div className="w-10 h-10 rounded-xl bg-white/5 border border-white/5 flex items-center justify-center text-white/40 group-hover:text-white transition-all">
                            <ChevronRightIcon className="w-5 h-5" />
                          </div>
                        </div>
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            )}

            {activeTab === 'cbt' && (
              <div className="space-y-6">
                <div className="bg-gradient-to-br from-amber-600 to-orange-600 rounded-[2rem] p-8 text-white relative overflow-hidden shadow-2xl">
                  <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 blur-3xl -mr-16 -mt-16" />
                  <div className="relative z-10">
                    <h2 className="text-2xl font-black tracking-tighter uppercase">Knowledge Synthesis</h2>
                    <p className="text-white/60 text-[10px] font-black uppercase tracking-[0.2em] mt-1">Computer-based testing arrays</p>
                  </div>
                </div>
                {items.cbt.length === 0 ? (
                  <div className="bg-white/5 border border-white/10 rounded-[2.5rem] p-20 text-center flex flex-col items-center justify-center">
                    <div className="w-16 h-16 bg-white/5 rounded-full flex items-center justify-center mb-6 border border-white/5">
                      <AcademicCapIcon className="w-8 h-8 text-white/10" />
                    </div>
                    <p className="text-[10px] font-black text-white/20 uppercase tracking-widest">No assessment protocols found</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {items.cbt.map(ex => (
                      <Link key={ex.id} href={`/dashboard/cbt/${ex.id}`} 
                        className="bg-white/5 border border-white/10 rounded-3xl p-6 group hover:bg-white/10 hover:border-amber-500/50 transition-all">
                        <div className="w-12 h-12 bg-white/5 border border-white/10 rounded-2xl flex items-center justify-center text-white/20 group-hover:text-amber-400 group-hover:bg-amber-600/10 transition-all mb-4">
                          <AcademicCapIcon className="w-6 h-6" />
                        </div>
                        <h4 className="font-black text-white group-hover:text-amber-400 transition-colors uppercase tracking-tight mb-2 line-clamp-1">{ex.title}</h4>
                        <div className="flex items-center gap-4">
                          <div>
                            <p className="text-[9px] font-black text-white/20 uppercase tracking-widest mb-1">Time Limit</p>
                            <p className="text-[10px] font-black text-white/60 uppercase tracking-widest">{ex.duration_minutes} MINS</p>
                          </div>
                          <div className="w-px h-6 bg-white/10" />
                          <div>
                            <p className="text-[9px] font-black text-white/20 uppercase tracking-widest mb-1">Payload</p>
                            <p className="text-[10px] font-black text-white/60 uppercase tracking-widest">{ex.total_questions} QUERIES</p>
                          </div>
                        </div>
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            )}

            {activeTab === 'gradebook' && (
              <div className="space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-4 gap-4">
                  <div className="flex items-center gap-4">
                    <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-white/20">Class Gradebook</h3>
                    {isStaff && (
                      <button
                        onClick={() => setManualEntry(!manualEntry)}
                        className={`flex items-center gap-3 px-4 py-2 rounded-2xl text-[9px] font-black uppercase tracking-widest transition-all ${manualEntry ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-900/40' : 'bg-white/5 text-white/40 border border-white/10 hover:bg-white/10'}`}
                      >
                        {manualEntry ? <CheckIconOutline className="w-4 h-4" /> : <PencilSquareIconOutline className="w-4 h-4" />}
                        {manualEntry ? 'Syncing...' : 'Manual Entry'}
                      </button>
                    )}
                  </div>
                  <button onClick={() => router.push('/dashboard/grades')} className="text-[9px] font-black text-violet-400 hover:text-violet-300 uppercase tracking-[0.2em] transition-colors">
                    Full Analytics Node →
                  </button>
                </div>
                {items.assignments.length === 0 ? (
                  <div className="bg-white/5 border border-white/10 rounded-[2.5rem] p-20 text-center flex flex-col items-center justify-center">
                    <div className="w-16 h-16 bg-white/5 rounded-full flex items-center justify-center mb-6 border border-white/5">
                      <ChartBarIcon className="w-8 h-8 text-white/10" />
                    </div>
                    <p className="text-[10px] font-black text-white/20 uppercase tracking-widest">No grading metrics available for this cluster</p>
                  </div>
                ) : (
                  <div className="bg-[#0B132B]/50 border border-white/10 rounded-[2.5rem] overflow-hidden overflow-x-auto shadow-inner custom-scrollbar">
                    <table className="w-full text-left border-collapse min-w-[600px]">
                      <thead>
                        <tr className="border-b border-white/5 bg-white/[0.02]">
                          <th className="px-8 py-6 text-[9px] font-black text-white/20 uppercase tracking-[0.3em] sticky left-0 bg-[#0B132B] z-20">Student Pioneers</th>
                          {items.assignments.map(a => (
                            <th key={a.id} className="px-6 py-6 text-[9px] font-black text-white/20 uppercase tracking-[0.2em] text-center min-w-[140px] bg-amber-500/[0.03]">
                              <div className="line-clamp-1 mb-1" title={a.title}>{a.title}</div>
                              <div className="text-[8px] opacity-40 lowercase font-medium">{a.max_points}pts</div>
                            </th>
                          ))}
                          {items.cbt.map(c => (
                            <th key={c.id} className="px-6 py-6 text-[9px] font-black text-white/20 uppercase tracking-[0.2em] text-center min-w-[140px] bg-violet-600/[0.03]">
                              <div className="line-clamp-1 mb-1" title={c.title}>{c.title}</div>
                              <div className="text-[8px] opacity-40 lowercase font-medium">{c.total_questions} Qs</div>
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/5">
                        {enrollments.map(enr => (
                          <tr key={enr.id} className="hover:bg-white/[0.01] transition-colors group">
                            <td className="px-8 py-6 sticky left-0 bg-[#0D1630] z-10 border-r border-white/5 group-hover:bg-[#121D3D] transition-colors shadow-2xl">
                              <div className="flex items-center gap-4">
                                <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-violet-600/20 to-blue-600/20 border border-white/5 flex items-center justify-center text-[10px] font-black text-violet-400 group-hover:scale-110 transition-transform">
                                  {(enr.portal_users?.full_name ?? '?')[0]}
                                </div>
                                <div className="min-w-0">
                                  <p className="text-white font-black text-[11px] uppercase tracking-tighter truncate group-hover:text-violet-400 transition-colors">{enr.portal_users?.full_name}</p>
                                  <p className="text-[9px] text-white/20 truncate font-medium">{enr.portal_users?.email}</p>
                                </div>
                              </div>
                            </td>
                            {items.assignments.map(a => {
                              const sub = items.submissions.find(s => s.assignment_id === a.id && s.portal_user_id === enr.portal_users?.id);
                              const score = sub?.grade;
                              const percentage = a.max_points > 0 ? (score ?? 0) / a.max_points : 0;
                              return (
                                <td key={a.id} className={`px-4 py-6 text-center border-l border-white/5 transition-all relative ${manualEntry ? 'bg-emerald-500/[0.05]' : 'bg-amber-500/[0.01]'}`}>
                                  {manualEntry ? (
                                    <div className="flex flex-col items-center gap-1">
                                      <input
                                        type="number"
                                        defaultValue={score ?? ''}
                                        onBlur={async (e) => {
                                          const val = e.target.value;
                                          if (val !== '' && isNaN(Number(val))) return;
                                          const numVal = val === '' ? null : Math.min(Number(val), a.max_points);
                                          const key = `asm-${a.id}-${enr.portal_users?.id}`;
                                          if (numVal === score) return;

                                          setMatrixSaving(p => ({ ...p, [key]: true }));
                                          try {
                                            if (sub) {
                                              await gradeSubmission(sub.id, numVal, sub.feedback || '', profile!.id);
                                            } else {
                                              const supabase = createClient();
                                              const { error } = await supabase
                                                .from('assignment_submissions')
                                                .insert({
                                                  assignment_id: a.id,
                                                  portal_user_id: enr.portal_users?.id,
                                                  grade: numVal,
                                                  status: 'graded',
                                                  graded_by: profile!.id,
                                                  graded_at: new Date().toISOString(),
                                                  submitted_at: new Date().toISOString(),
                                                });
                                              if (error) throw error;
                                            }
                                            await fetchData();
                                          } catch (err) {
                                            console.error(err);
                                          } finally {
                                            setMatrixSaving(p => ({ ...p, [key]: false }));
                                          }
                                        }}
                                        className="w-14 h-10 bg-white/5 border border-white/10 rounded-xl text-center text-xs font-black text-white focus:border-emerald-500 focus:bg-white/10 outline-none transition-all"
                                      />
                                      {matrixSaving[`asm-${a.id}-${enr.portal_users?.id}`] && (
                                        <div className="absolute top-2 right-2 w-2 h-2 bg-emerald-500 rounded-full animate-ping" />
                                      )}
                                    </div>
                                  ) : sub ? (
                                    score !== null ? (
                                      <div className="space-y-2">
                                        <span className={`text-sm font-black ${percentage >= 0.7 ? 'text-emerald-400' : percentage >= 0.5 ? 'text-amber-400' : 'text-rose-400'}`}>
                                          {score}
                                        </span>
                                        <div className="w-12 h-1 bg-white/5 rounded-full overflow-hidden mx-auto">
                                          <div className={`h-full transition-all duration-1000 ${percentage >= 0.7 ? 'bg-emerald-500' : percentage >= 0.5 ? 'bg-amber-500' : 'bg-rose-500'}`} style={{ width: `${percentage * 100}%` }}></div>
                                        </div>
                                      </div>
                                    ) : (
                                      <span className="text-[8px] font-black text-blue-400/60 uppercase tracking-widest bg-blue-500/10 px-2 py-1 rounded-lg border border-blue-500/10">Pending</span>
                                    )
                                  ) : (
                                    <span className="text-[10px] text-white/5 font-black uppercase tracking-widest">—</span>
                                  )}
                                </td>
                              );
                            })}
                            {items.cbt.map(c => {
                              const sess = items.cbtSessions.find(s => s.exam_id === c.id && s.user_id === enr.portal_users?.id);
                              const score = sess?.score;
                              const percentage = c.total_questions > 0 ? (score ?? 0) / c.total_questions : 0;
                              return (
                                <td key={c.id} className="px-6 py-6 text-center border-l border-white/5 bg-violet-600/[0.01]">
                                  {sess ? (
                                    score !== null ? (
                                      <div className="space-y-2">
                                        <span className={`text-sm font-black ${percentage >= 0.7 ? 'text-emerald-400' : percentage >= 0.5 ? 'text-amber-400' : 'text-rose-400'}`}>
                                          {score}
                                        </span>
                                        <div className="w-12 h-1 bg-white/5 rounded-full overflow-hidden mx-auto">
                                          <div className={`h-full transition-all duration-1000 ${percentage >= 0.7 ? 'bg-emerald-500' : percentage >= 0.5 ? 'bg-amber-500' : 'bg-rose-500'}`} style={{ width: `${percentage * 100}%` }}></div>
                                        </div>
                                      </div>
                                    ) : (
                                      <span className="text-[8px] font-black text-cyan-400/60 uppercase tracking-widest bg-cyan-500/10 px-2 py-1 rounded-lg border border-cyan-500/10 animate-pulse">Running</span>
                                    )
                                  ) : (
                                    <span className="text-[10px] text-white/5 font-black uppercase tracking-widest">—</span>
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
          <div className="space-y-8">

            {/* Quick Actions */}
            {isStaff && (
              <div className="bg-white/5 border border-white/10 rounded-[2.5rem] p-8 space-y-6 shadow-2xl relative overflow-hidden">
                <div className="absolute top-0 right-0 w-32 h-32 bg-violet-600 opacity-[0.03] blur-3xl rounded-full" />
                <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-white/20">Operations Deck</h3>
                <div className="grid grid-cols-1 gap-3">
                  {[
                    { label: 'Roll Call', sub: 'SYNC REGISTRY', icon: CheckCircleIcon, color: 'blue', action: () => setViewingItem({ type: 'attendance', id: id }) },
                    { label: 'Quick Task', sub: 'INITIATE ASSIGNMENT', icon: ClipboardDocumentListIcon, color: 'amber', action: () => setViewingItem({ type: 'assignment', id: 'add' }) },
                    { label: 'Add Lesson', sub: 'AUGMENT CURRICULUM', icon: BookOpenIcon, color: 'cyan', action: () => setViewingItem({ type: 'lesson', id: 'add' }) },
                    { label: 'Apply CBT', sub: 'SYSTEM TESTING', icon: AcademicCapIcon, color: 'violet', action: () => setViewingItem({ type: 'cbt', id: 'add' }) },
                  ].map(btn => (
                    <button key={btn.label} onClick={btn.action} className={`group flex items-center gap-4 w-full p-4 bg-${btn.color}-600/5 hover:bg-${btn.color}-600/10 border border-${btn.color}-600/10 hover:border-${btn.color}-600/30 rounded-[1.5rem] text-left transition-all active:scale-[0.98]`}>
                      <div className={`w-12 h-12 rounded-2xl bg-${btn.color}-600/10 flex items-center justify-center text-${btn.color}-400 group-hover:scale-110 transition-transform shadow-lg`}>
                        <btn.icon className="w-6 h-6" />
                      </div>
                      <div>
                        <p className="text-[11px] font-black text-white uppercase tracking-tighter">{btn.label}</p>
                        <p className={`text-[8px] text-${btn.color}-400/60 font-black uppercase tracking-widest`}>{btn.sub}</p>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Students List */}
            <div className="bg-white/5 border border-white/10 rounded-[2.5rem] overflow-hidden shadow-2xl">
              <div className="px-8 py-6 border-b border-white/10 flex items-center justify-between bg-white/[0.02]">
                <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-white/20">Enrolled Pioneers</h3>
                <div className="flex items-center gap-3">
                  <div className="px-3 py-1 bg-white/5 rounded-full border border-white/5">
                    <span className="text-[9px] font-black text-violet-400 tracking-widest">{enrollments.length} <span className="text-white/20">/</span> {cls.max_students}</span>
                  </div>
                  {isStaff && (
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => { setShowStudentModal(true); loadAvailableStudents(); }}
                        title="Enroll Existing Student"
                        className="w-8 h-8 rounded-xl bg-violet-600/20 hover:bg-violet-600/40 border border-violet-600/30 text-violet-400 flex items-center justify-center transition-all active:scale-90"
                      >
                        <PlusIcon className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => setShowRegisterModal(true)}
                        title="Register New Student"
                        className="w-8 h-8 rounded-xl bg-blue-600/20 hover:bg-blue-600/40 border border-blue-600/30 text-blue-400 flex items-center justify-center transition-all active:scale-90"
                      >
                        <UserPlusIcon className="w-4 h-4" />
                      </button>
                    </div>
                  )}
                </div>
              </div>
              {enrollments.length === 0 ? (
                <div className="p-20 text-center flex flex-col items-center justify-center px-10">
                  <UserGroupIcon className="w-12 h-12 text-white/5 mb-6" />
                  <p className="text-[10px] font-black text-white/20 uppercase tracking-widest leading-relaxed">No student signals detected in this cluster</p>
                  <Link href={`/dashboard/classes/${id}/edit`} className="mt-6 text-[9px] font-black text-violet-400 uppercase tracking-widest hover:text-violet-300 transition-colors">Manage Registry →</Link>
                </div>
              ) : (
                <div className="divide-y divide-white/5 max-h-[500px] overflow-y-auto custom-scrollbar">
                  {enrollments.map((enr: any) => (
                    <div key={enr.id} className="px-8 py-5 flex items-center gap-4 hover:bg-white/[0.03] transition-all group">
                      <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-blue-500/10 to-violet-600/10 border border-white/5 flex items-center justify-center text-[10px] font-black text-white/40 group-hover:text-violet-400 transition-all">
                        {(enr.portal_users?.full_name ?? '?')[0]}
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-black text-white group-hover:text-violet-400 transition-colors truncate uppercase tracking-tighter">{enr.portal_users?.full_name}</p>
                        <p className="text-[9px] text-white/30 truncate font-medium">{enr.portal_users?.email}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {isStaff && (
              <button
                onClick={handleExportLogins}
                className="w-full py-5 bg-emerald-600/10 hover:bg-emerald-600/20 border border-emerald-600/20 rounded-2xl flex items-center justify-center gap-3 group transition-all"
              >
                <div className="w-8 h-8 bg-emerald-600/20 rounded-xl flex items-center justify-center text-emerald-400 group-hover:scale-110 transition-transform">
                  <CloudArrowDownIcon className="w-4 h-4" />
                </div>
                <span className="text-[10px] font-black text-emerald-400 uppercase tracking-[0.2em]">Export Login Credentials</span>
              </button>
            )}

          </div>

        </div>
      </div>

      {/* Student Management Modal */}
      {showStudentModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 sm:p-12 animate-in fade-in duration-300">
          <div className="absolute inset-0 bg-black/90 backdrop-blur-xl" onClick={() => setShowStudentModal(false)} />
          <div className="bg-[#0D1630] border border-white/10 rounded-[3rem] w-full max-w-xl shadow-[0_0_100px_rgba(139,92,246,0.15)] overflow-hidden relative z-10 scale-in-center">
            <div className="px-10 py-8 border-b border-white/5 flex items-center justify-between bg-white/[0.02]">
              <div>
                <h3 className="font-black uppercase tracking-[0.3em] text-xs text-white">Cluster Roster Sync</h3>
                <p className="text-[9px] font-black text-violet-400 uppercase tracking-[0.2em] mt-1">Manual enrollment portal</p>
              </div>
              <button onClick={() => setShowStudentModal(false)} className="w-10 h-10 flex items-center justify-center bg-white/5 rounded-2xl text-white/20 hover:text-white transition-colors">&times;</button>
            </div>

            <div className="p-10 space-y-8">
              <div className="flex items-center justify-between px-2">
                <span className="text-[9px] font-black text-white/30 uppercase tracking-[0.3em]">Discovered Signatures</span>
                <div className="h-1.5 w-1.5 bg-violet-500 rounded-full animate-pulse shadow-[0_0_10px_rgba(139,92,246,0.5)]" />
              </div>

              {processingStudent === 'loading' ? (
                <div className="py-24 text-center">
                  <ArrowPathIcon className="w-12 h-12 text-violet-500 animate-spin mx-auto mb-6" />
                  <p className="text-[10px] font-black text-white/20 uppercase tracking-widest">Decoding population matrix...</p>
                </div>
              ) : availableStudents.length === 0 ? (
                <div className="py-24 text-center border border-dashed border-white/5 rounded-[2.5rem] bg-white/[0.01] px-12">
                  <UserGroupIcon className="w-12 h-12 mx-auto mb-6 text-white/5" />
                  <p className="text-xs font-black text-white/20 uppercase tracking-widest leading-relaxed">No unassigned student profiles matching this cluster criteria detected.</p>
                </div>
              ) : (
                <div className="space-y-3 max-h-[400px] overflow-y-auto pr-4 custom-scrollbar">
                  {availableStudents.map(student => (
                    <div key={student.id} className="flex items-center justify-between p-5 bg-white/5 border border-white/5 rounded-[1.5rem] hover:bg-violet-600/5 hover:border-violet-500/30 transition-all group">
                      <div className="min-w-0">
                        <p className="text-sm font-black text-white group-hover:text-violet-400 transition-colors uppercase tracking-tighter truncate">{student.full_name}</p>
                        <p className="text-[9px] text-white/30 font-medium truncate">{student.email}</p>
                        {student.section_class && (
                          <div className="mt-2 flex items-center gap-1.5">
                            <div className="w-1 h-1 bg-amber-500 rounded-full" />
                            <p className="text-[8px] text-amber-500/60 uppercase font-black tracking-widest">Assigned to: {student.section_class}</p>
                          </div>
                        )}
                      </div>
                      <button
                        onClick={() => assignStudent(student.id)}
                        disabled={!!processingStudent}
                        className="flex-shrink-0 px-6 py-2.5 bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-[9px] font-black uppercase tracking-widest rounded-xl transition-all shadow-lg active:scale-95"
                      >
                        {processingStudent === student.id ? 'Syncing...' : 'Enroll'}
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="px-10 py-6 bg-white/[0.02] border-t border-white/5 flex justify-end">
              <button
                onClick={() => setShowStudentModal(false)}
                className="px-8 py-4 text-[10px] font-black uppercase tracking-[0.2em] text-white/30 hover:text-white transition-all bg-white/5 hover:bg-white/10 rounded-2xl shadow-inner border border-white/5"
              >
                End Port Sessions
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Slide-over Panel for Content ── */}
      {viewingItem && (
        <div className="fixed inset-0 z-[110] overflow-hidden">
          <div className="absolute inset-0 bg-[#050a17]/90 backdrop-blur-3xl animate-in fade-in duration-500" onClick={() => setViewingItem(null)} />
          <div className="absolute inset-y-0 right-0 max-w-4xl w-full flex">
            <div className="h-full w-full bg-[#0D1630] border-l border-white/10 shadow-[0_0_100px_rgba(0,0,0,0.5)] flex flex-col animate-in slide-in-from-right duration-500">
              <div className="px-10 py-8 border-b border-white/5 flex items-center justify-between bg-white/[0.02]">
                <div className="flex items-center gap-6">
                  <div className="w-12 h-12 rounded-2xl bg-violet-600 flex items-center justify-center shadow-xl shadow-violet-900/40">
                    {viewingItem.type === 'lesson' ? <BookOpenIcon className="w-6 h-6" /> : viewingItem.type === 'assignment' ? <ClipboardDocumentListIcon className="w-6 h-6" /> : <AcademicCapIcon className="w-6 h-6" />}
                  </div>
                  <div>
                    <h3 className="text-[10px] font-black text-violet-400 uppercase tracking-[0.3em]">{viewingItem.id === 'add' ? 'Initialize' : 'Telemetry'} {viewingItem.type}</h3>
                    <p className="text-[11px] text-white uppercase font-black tracking-tight mt-0.5">Context Protocol: {cls.name}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  {viewingItem.id !== 'add' && (
                    <Link href={`/dashboard/${viewingItem.type === 'lesson' ? 'lessons' : viewingItem.type === 'assignment' ? 'assignments' : 'cbt'}/${viewingItem.id}/edit`}
                      className="p-4 rounded-2xl bg-white/5 border border-white/10 hover:border-violet-500/50 hover:text-violet-400 transition-all group">
                      <PencilIcon className="w-5 h-5 group-hover:scale-110 transition-transform" />
                    </Link>
                  )}
                  <button onClick={() => setViewingItem(null)} className="p-4 rounded-2xl bg-white/5 border border-white/10 hover:bg-rose-500/20 hover:text-rose-400 transition-all active:scale-90">
                    <XMarkIcon className="w-6 h-6" />
                  </button>
                </div>
              </div>

              <div className="flex-1 overflow-hidden p-8">
                <div className="w-full h-full bg-[#050a17] rounded-[2.5rem] border border-white/5 overflow-hidden shadow-inner">
                  <iframe
                    src={`/dashboard/${viewingItem.type === 'lesson' ? 'lessons' : viewingItem.type === 'assignment' ? 'assignments' : 'cbt'}/${viewingItem.id === 'add' ? (viewingItem.type === 'lesson' ? 'add' : 'new') : viewingItem.id}?minimal=true&program_id=${cls.program_id}`}
                    className="w-full h-full border-none opacity-100"
                    title="Content Protocol Frame"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      <style jsx global>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 8px;
          height: 8px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: rgba(255, 255, 255, 0.02);
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: rgba(139, 92, 246, 0.2);
          border-radius: 10px;
          border: 2px solid #0D1630;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: rgba(139, 92, 246, 0.4);
        }
        .scale-in-center {
          animation: scale-in-center 0.4s cubic-bezier(0.250, 0.460, 0.450, 0.940) both;
        }
        @keyframes scale-in-center {
          0% { transform: scale(0.9); opacity: 0; }
          100% { transform: scale(1); opacity: 1; }
        }
      `}</style>
      <AddStudentModal
        isOpen={showRegisterModal}
        onClose={() => setShowRegisterModal(false)}
        onSuccess={() => {
          setShowRegisterModal(false);
          fetchData();
        }}
      />
    </div>
  );
}

// Support Icons (inline SVGs for icons not in the heroicons import above)
function StarIcon(props: any) { return <svg fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" {...props}><path strokeLinecap="round" strokeLinejoin="round" d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.385a.563.563 0 00-.182-.557l-4.204-3.602a.563.563 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345l2.125-5.111z" /></svg>; }
function ArrowRightIcon(props: any) { return <svg fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" {...props}><path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" /></svg>; }
function XMarkIcon(props: any) { return <svg fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" {...props}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>; }
