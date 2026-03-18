// @refresh reset
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
} from '@/lib/icons';
import { AddStudentModal } from '@/features/students/components/AddStudentModal';


export default function ClassDetailPage() {
  const params = useParams();
  const id = params?.id as string;
  const router = useRouter();
  const { profile, loading: authLoading, profileLoading } = useAuth();

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
  const [enrolMode, setEnrolMode] = useState<'current' | 'create'>('current');
  const [availableStudents, setAvailableStudents] = useState<any[]>([]);
  const [selectedStudentIds, setSelectedStudentIds] = useState<Set<string>>(new Set());
  const [processingStudent, setProcessingStudent] = useState<string | null>(null);
  const [showRegisterModal, setShowRegisterModal] = useState(false);
  const [studentSearch, setStudentSearch] = useState(''); // Search/filter in enrollment modal
  const [showMoreStudents, setShowMoreStudents] = useState(false); // Pagination control

  // Create-new-class inside enrol modal
  const [programsList, setProgramsList] = useState<any[]>([]);
  const [schoolsList, setSchoolsList] = useState<any[]>([]);
  const [newClassForm, setNewClassForm] = useState({ name: '', program_id: '', school_id: '', max_students: '' });
  const [creatingNewClass, setCreatingNewClass] = useState(false);

  const [editingSession, setEditingSession] = useState<any>(null);
  const [sessionForm, setSessionForm] = useState({ topic: '', session_date: '', start_time: '', end_time: '', notes: '' });
  const [savingSession, setSavingSession] = useState(false);

  const isStaff = profile?.role === 'admin' || profile?.role === 'teacher';

  const fetchData = async () => {
    if (!id || !profile) return;
    setLoading(true);
    const supabase = createClient();
    try {
      const [clsApiRes, sessRes] = await Promise.all([
        fetch(`/api/classes/${id}`, { cache: 'no-store' }),
        supabase.from('class_sessions').select('*').eq('class_id', id!).order('session_date', { ascending: false }).limit(10),
      ]);

      if (!clsApiRes.ok) {
        let errMsg = 'Class not found';
        try { const j = await clsApiRes.json(); errMsg = j.error || errMsg; } catch {}
        throw new Error(errMsg);
      }
      const { data: clsData } = await clsApiRes.json();
      setCls(clsData);
      setSessions(sessRes.data ?? []);

      const program_id = clsData.program_id;
      const studentsHttpRes = await fetch(`/api/classes/${id}/students`, { cache: 'no-store' });
      let studentsRes: any = { students: [] };
      try { studentsRes = await studentsHttpRes.json(); } catch {}
      if (!studentsHttpRes.ok) {
        console.error('[students API]', studentsHttpRes.status, studentsRes);
      }
      setEnrollments(studentsRes.students ?? []);

      const [lessonRes, asgnRes, cbtRes] = await Promise.all([
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
    if (authLoading || profileLoading) return;
    if (profile && id) fetchData();
    else setLoading(false);
  }, [id, profile?.id, authLoading, profileLoading]);

  const loadAvailableStudents = async () => {
    if (!cls) return;
    setProcessingStudent('loading');
    setEnrolMode('current');
    try {
      const [enrollRes, progRes, schRes] = await Promise.all([
        fetch(`/api/classes/${id}/enroll`, { cache: 'no-store' }),
        programsList.length === 0 ? fetch('/api/programs?is_active=true', { cache: 'no-store' }) : Promise.resolve(null),
        schoolsList.length === 0 ? fetch('/api/schools', { cache: 'no-store' }) : Promise.resolve(null),
      ]);
      const enrollJson = await enrollRes.json();
      if (!enrollRes.ok) throw new Error(enrollJson.error ?? 'Failed to load students');
      setAvailableStudents(enrollJson.students ?? []);
      setSelectedStudentIds(new Set());
      if (progRes) { const j = await progRes.json(); setProgramsList(j.data ?? []); }
      if (schRes) { const j = await schRes.json(); setSchoolsList(j.data ?? []); }
    } catch (e: any) {
      console.error(e);
      setError(e.message ?? 'Failed to load available students for enrollment.');
    } finally {
      setProcessingStudent(null);
    }
  };

  const assignStudent = async (studentId: string) => {
    if (!cls) return;
    setProcessingStudent(studentId);
    try {
      const res = await fetch(`/api/classes/${id}/enroll`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ studentId }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Failed to enroll student');
      await fetchData();
      await loadAvailableStudents();
    } catch (e: any) {
      alert(e.message);
    } finally {
      setProcessingStudent(null);
    }
  };

  const syncSelectedStudents = async (idsToEnroll?: string[]) => {
    const ids = idsToEnroll ?? (selectedStudentIds.size > 0
      ? Array.from(selectedStudentIds)
      : availableStudents.map((s: any) => s.id));
    if (ids.length === 0) return;
    setProcessingStudent('loading');
    try {
      const res = await fetch(`/api/classes/${id}/enroll`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ studentIds: ids }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Sync failed');
      setShowStudentModal(false);
      setSelectedStudentIds(new Set());
      setAvailableStudents([]);
      await fetchData();
    } catch (e: any) {
      alert(e.message);
    } finally {
      setProcessingStudent(null);
    }
  };

  const createClassAndEnrol = async () => {
    if (!newClassForm.name.trim() || !newClassForm.program_id) {
      alert('Class name and programme are required');
      return;
    }
    if (selectedStudentIds.size === 0) {
      alert('Select at least one student first');
      return;
    }
    setCreatingNewClass(true);
    try {
      const body: any = { name: newClassForm.name.trim(), program_id: newClassForm.program_id, status: 'active' };
      if (newClassForm.school_id) body.school_id = newClassForm.school_id;
      if (newClassForm.max_students) body.max_students = parseInt(newClassForm.max_students);
      const clsRes = await fetch('/api/classes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const clsJson = await clsRes.json();
      if (!clsRes.ok) throw new Error(clsJson.error ?? 'Failed to create class');
      const newClassId = clsJson.data.id;

      const enrolRes = await fetch(`/api/classes/${newClassId}/enroll`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ studentIds: Array.from(selectedStudentIds) }),
      });
      const enrolJson = await enrolRes.json();
      if (!enrolRes.ok) throw new Error(enrolJson.error ?? 'Failed to enrol students');

      setShowStudentModal(false);
      setEnrolMode('current');
      setSelectedStudentIds(new Set());
      setAvailableStudents([]);
      setNewClassForm({ name: '', program_id: '', school_id: '', max_students: '' });
      await fetchData();
      alert(`Class "${clsJson.data.name}" created — ${enrolJson.enrolled ?? selectedStudentIds.size} student${(enrolJson.enrolled ?? selectedStudentIds.size) !== 1 ? 's' : ''} enrolled.`);
    } catch (e: any) {
      alert(e.message ?? 'Failed');
    } finally {
      setCreatingNewClass(false);
    }
  };

  const removeStudent = async (studentId: string) => {
    if (!confirm('Remove student from this class?')) return;
    setProcessingStudent(studentId);
    try {
      const res = await fetch(`/api/classes/${id}/enroll`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ studentId }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Failed to remove student');
      await fetchData();
    } catch (e: any) {
      alert(e.message);
    } finally {
      setProcessingStudent(null);
    }
  };

  const handleEditSession = (s: any) => {
    setEditingSession(s);
    setSessionForm({
      topic: s.topic || '',
      session_date: s.session_date || '',
      start_time: s.start_time || '',
      end_time: s.end_time || '',
      notes: s.notes || ''
    });
  };

  const saveEditedSession = async () => {
    if (!editingSession) return;
    setSavingSession(true);
    try {
      const res = await fetch(`/api/class-sessions/${editingSession.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(sessionForm),
      });
      if (!res.ok) throw new Error('Failed to update session');
      setEditingSession(null);
      await fetchData();
    } catch (e: any) {
      alert(e.message);
    } finally {
      setSavingSession(false);
    }
  };

  const deleteSession = async (sessId: string) => {
    if (!confirm('Permanently delete this session record?')) return;
    try {
      const res = await fetch(`/api/class-sessions/${sessId}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Delete failed');
      await fetchData();
    } catch (e: any) {
      alert(e.message);
    }
  };

  const handleExportLogins = () => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    const issuedDate = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
    const docRef = `RC-${cls.id?.slice(0, 8).toUpperCase()}-${Date.now().toString().slice(-6)}`;

    // Deduplicate enrollments to prevent duplicate rows in the register
    const uniqueEnrollments = Array.from(new Map(enrollments.map((e: any) => [e.portal_user_id || e.id, e])).values());

    const enrRows = uniqueEnrollments.map((enr: any, idx: number) => `
      <tr style="page-break-inside: avoid;">
        <td style="text-align:center; font-weight:700; color:#64748b;">${idx + 1}</td>
        <td>
          <div style="font-weight:700; color:#1e293b; font-size:13px;">${enr.full_name || '—'}</div>
          ${enr.section_class ? `<div style="font-size:10px; color:#94a3b8; margin-top:2px;">Section: ${enr.section_class}</div>` : ''}
        </td>
        <td style="font-size:12px; color:#334155;">${cls.name}</td>
        <td style="font-size:12px; color:#334155;">${enr.email || 'N/A'}</td>
        <td style="text-align:center;">
          <div style="display:inline-block; width:130px; border-bottom:1.5px solid #94a3b8; margin-top:10px;">&nbsp;</div>
        </td>
        <td style="text-align:center;">
          <div style="border:1px solid #e2e8f0; border-radius:4px; padding:6px 4px; font-size:10px; color:#94a3b8;">Acknowledgement</div>
        </td>
      </tr>
    `).join('');

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>Student Access Register — ${cls.name} — ${issuedDate}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    @page { size: A4; margin: 18mm 15mm 20mm 15mm; }
    body { font-family: 'Segoe UI', Arial, sans-serif; color: #1e293b; background: #fff; font-size: 12px; line-height: 1.5; }

    /* ─ Letterhead ─ */
    .letterhead { display: flex; justify-content: space-between; align-items: flex-start; padding-bottom: 12px; border-bottom: 3px solid #1e293b; margin-bottom: 16px; }
    .brand-logo { display: flex; align-items: center; gap: 10px; }
    .brand-logo img { height: 52px; width: auto; object-fit: contain; }
    .brand-text .name { font-size: 20px; font-weight: 900; color: #1e293b; letter-spacing: 0.5px; text-transform: uppercase; }
    .brand-text .tag { font-size: 8.5px; font-weight: 700; color: #64748b; letter-spacing: 2.5px; text-transform: uppercase; }
    .partner-block { text-align: right; }
    .partner-block .school-logo { height: 48px; width: auto; max-width: 140px; object-fit: contain; margin-bottom: 4px; display: block; margin-left: auto; }
    .partner-block .school-name { font-size: 12px; font-weight: 800; color: #4F46E5; text-transform: uppercase; letter-spacing: 0.5px; }
    .partner-block .school-tag { font-size: 9px; color: #94a3b8; }

    /* ─ Title block ─ */
    .doc-title-block { text-align: center; margin: 14px 0 10px; border: 1px solid #e2e8f0; padding: 10px 20px; border-radius: 6px; background: #f8fafc; }
    .doc-title { font-size: 16px; font-weight: 900; text-transform: uppercase; letter-spacing: 1.5px; color: #0f172a; }
    .doc-subtitle { font-size: 9.5px; color: #64748b; font-weight: 600; text-transform: uppercase; letter-spacing: 1px; margin-top: 2px; }
    .doc-ref { font-size: 9px; color: #94a3b8; margin-top: 4px; }

    /* ─ Metadata grid ─ */
    .meta-grid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 0; border: 1px solid #e2e8f0; border-radius: 6px; overflow: hidden; margin: 12px 0; }
    .meta-cell { padding: 8px 12px; border-right: 1px solid #e2e8f0; }
    .meta-cell:last-child { border-right: none; }
    .meta-cell .meta-label { font-size: 8.5px; font-weight: 800; text-transform: uppercase; letter-spacing: 1px; color: #94a3b8; }
    .meta-cell .meta-value { font-size: 12px; font-weight: 700; color: #1e293b; margin-top: 2px; }

    /* ─ Instruction box ─ */
    .instruction { font-size: 10px; color: #64748b; background: #fffbeb; border: 1px solid #fde68a; border-radius: 4px; padding: 7px 12px; margin-bottom: 12px; }
    .instruction strong { color: #92400e; }

    /* ─ Table ─ */
    table { width: 100%; border-collapse: collapse; font-size: 11.5px; }
    thead { background: #1e293b; color: #fff; }
    thead th { padding: 9px 10px; text-align: left; font-weight: 800; font-size: 9.5px; letter-spacing: 0.8px; text-transform: uppercase; }
    thead th:first-child { text-align: center; width: 36px; }
    tbody tr { border-bottom: 1px solid #f1f5f9; }
    tbody tr:nth-child(even) { background: #f8fafc; }
    tbody td { padding: 9px 10px; vertical-align: middle; }

    /* ─ Footer ─ */
    .doc-footer { margin-top: 20px; border-top: 1px solid #e2e8f0; padding-top: 12px; display: flex; justify-content: space-between; align-items: flex-end; }
    .signature-box { text-align: center; }
    .sig-line { display: inline-block; width: 180px; border-bottom: 1.5px solid #334155; margin-bottom: 4px; }
    .sig-label { font-size: 9px; color: #64748b; font-weight: 600; text-transform: uppercase; letter-spacing: 1px; }
    .footer-note { font-size: 9px; color: #94a3b8; text-align: right; max-width: 300px; }
    .footer-note strong { color: #64748b; }

    /* ─ Print controls (screen only) ─ */
    .screen-only { margin: 24px 0; text-align: center; }
    .print-btn { padding: 12px 32px; background: #1e293b; color: white; border: none; border-radius: 8px; cursor: pointer; font-weight: bold; font-size: 14px; letter-spacing: 0.5px; }
    .print-btn:hover { background: #334155; }
    @media print { .screen-only { display: none; } }
  </style>
</head>
<body>

  <!-- LETTERHEAD -->
  <div class="letterhead">
    <div class="brand-logo">
      <img src="/images/logo.png" alt="Rillcod Technologies Logo" onerror="this.style.display='none'" />
      <div class="brand-text">
        <div class="name">Rillcod Technologies</div>
        <div class="tag">Future-Proof STEM Education</div>
      </div>
    </div>
    <div class="partner-block">
      ${cls.schools?.logo_url ? `<img src="${cls.schools.logo_url}" alt="${cls.schools?.name || 'School'} Logo" class="school-logo" onerror="this.style.display='none'" />` : ''}
      <div class="school-name">${cls.schools?.name || 'Partner Institution'}</div>
      <div class="school-tag">Affiliated Academic Partner</div>
    </div>
  </div>

  <!-- DOCUMENT TITLE -->
  <div class="doc-title-block">
    <div class="doc-title">Student Access Register</div>
    <div class="doc-subtitle">Official Portal Login Credentials — Confidential</div>
    <div class="doc-ref">Document Ref: ${docRef} &nbsp;|&nbsp; Issued: ${issuedDate}</div>
  </div>

  <!-- METADATA GRID -->
  <div class="meta-grid">
    <div class="meta-cell">
      <div class="meta-label">Class / Group</div>
      <div class="meta-value">${cls.name}</div>
    </div>
    <div class="meta-cell">
      <div class="meta-label">Programme</div>
      <div class="meta-value">${cls.programs?.name || 'N/A'}</div>
    </div>
    <div class="meta-cell">
      <div class="meta-label">Facilitator</div>
      <div class="meta-value">${cls.portal_users?.full_name || 'N/A'}</div>
    </div>
    <div class="meta-cell">
      <div class="meta-label">Total Students</div>
      <div class="meta-value">${enrollments.length}</div>
    </div>
    <div class="meta-cell">
      <div class="meta-label">Class Status</div>
      <div class="meta-value" style="text-transform:capitalize;">${cls.status || 'Active'}</div>
    </div>
    <div class="meta-cell">
      <div class="meta-label">Date Issued</div>
      <div class="meta-value">${issuedDate}</div>
    </div>
  </div>

  <!-- INSTRUCTION -->
  <div class="instruction">
    <strong>INSTRUCTIONS:</strong> Distribute this register to each student. Each student must write their assigned password in the designated field and sign the acknowledgement column upon receipt. This document is <strong>CONFIDENTIAL</strong> — do not share publicly. Passwords should be changed by students upon first login.
  </div>

  <!-- STUDENTS TABLE -->
  <table>
    <thead>
      <tr>
        <th>#</th>
        <th>Student Full Name</th>
        <th>Class / Group</th>
        <th>Portal Email Address (Login ID)</th>
        <th style="text-align:center; width:140px;">Assigned Password</th>
        <th style="text-align:center; width:80px;">Signature</th>
      </tr>
    </thead>
    <tbody>
      ${enrRows}
    </tbody>
  </table>

  <!-- FOOTER / SIGNATURES -->
  <div class="doc-footer">
    <div class="signature-box">
      <div class="sig-line">&nbsp;</div><br/>
      <div class="sig-label">Facilitator Signature &amp; Date</div>
    </div>
    <div class="signature-box">
      <div class="sig-line">&nbsp;</div><br/>
      <div class="sig-label">School Authority / Stamp</div>
    </div>
    <div class="footer-note">
      <strong>Rillcod Technologies Portal</strong><br/>
      Powered by Rillcod Technologies — rillcod.com<br/>
      This document is an official school record.<br/>
      Ref: ${docRef}
    </div>
  </div>

  <!-- PRINT BUTTON (screen only) -->
  <div class="screen-only">
    <button class="print-btn" onclick="window.print()">🖨 Print Official Register (A4)</button>
  </div>

</body>
</html>`;

    printWindow.document.write(html);
    printWindow.document.close();
    // Auto-trigger print dialog after load
    printWindow.onload = () => { printWindow.focus(); };
  };

  if (authLoading || profileLoading || loading) return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <div className="w-12 h-12 border-4 border-orange-500 border-t-transparent rounded-full animate-spin" />
        <p className="text-muted-foreground font-medium animate-pulse uppercase tracking-[0.2em] text-[10px]">Decoding Registry State...</p>
      </div>
    </div>
  );

  if (!isStaff) return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="bg-card shadow-sm border border-border rounded-[2rem] p-8 text-center max-w-sm">
        <ExclamationTriangleIcon className="w-12 h-12 text-rose-500/20 mx-auto mb-4" />
        <p className="text-muted-foreground font-black uppercase tracking-widest text-xs leading-relaxed">Insufficient clearance to access specialized cluster telemetry.</p>
      </div>
    </div>
  );

  if (error || !cls) return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-6">
      <div className="w-20 h-20 bg-rose-500/10 rounded-full flex items-center justify-center border border-rose-500/20">
        <ExclamationTriangleIcon className="w-10 h-10 text-rose-500/40" />
      </div>
      <div className="text-center space-y-2">
        <p className="text-rose-400 font-black uppercase tracking-widest">{error ?? 'Cluster mismatch'}</p>
        <p className="text-muted-foreground text-[10px] font-black uppercase tracking-[0.2em]">The requested resource is missing or inaccessible</p>
      </div>
      <Link href="/dashboard/classes" className="px-8 py-3 bg-card shadow-sm hover:bg-muted border border-border rounded-none text-[10px] font-black uppercase tracking-widest transition-all">
        Return to Registry
      </Link>
    </div>
  );

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 space-y-8 pb-32">

        {/* ── Header Area ────────────────────────────────────────── */}
        <div className="relative">
          <div className="absolute -top-24 -left-20 w-64 h-64 bg-orange-600 opacity-10 blur-[100px] pointer-events-none" />
          <div className="flex flex-col md:flex-row md:items-center gap-8 relative z-10">
            <button onClick={() => router.back()}
              className="w-14 h-14 flex items-center justify-center rounded-none bg-card shadow-sm hover:bg-muted border border-border transition-all hover:scale-105 group flex-shrink-0">
              <ArrowLeftIcon className="w-6 h-6 text-muted-foreground group-hover:text-foreground transition-colors" />
            </button>
            <div className="flex-1 space-y-3">
              <div className="flex items-center gap-3">
                <div className={`px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-[0.2em] border shadow-lg ${
                  cls.status === 'active' ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' :
                  cls.status === 'scheduled' ? 'bg-amber-500/20 text-amber-400 border-amber-500/30' :
                  'bg-card shadow-sm text-muted-foreground border-border'
                }`}>
                  {cls.status}
                </div>
                <div className="h-4 w-px bg-muted" />
                <span className="text-[10px] font-black text-muted-foreground uppercase tracking-[0.2em]">{cls.programs?.name}</span>
              </div>
              <h1 className="text-4xl sm:text-6xl font-black tracking-tighter leading-none">{cls.name}</h1>
            </div>
            {isStaff && (
              <div className="flex gap-3">
                <Link href={`/dashboard/classes/${id}/edit`}
                  className="flex items-center gap-3 px-6 py-4 bg-card shadow-sm hover:bg-muted border border-border rounded-none text-[10px] font-black uppercase tracking-widest transition-all hover:border-orange-500/50">
                  <PencilIcon className="w-4 h-4 text-orange-400" /> Edit Settings
                </Link>
                <Link href={`/dashboard/attendance?class_id=${id}`}
                  className="flex items-center gap-3 px-8 py-4 bg-orange-600 hover:bg-orange-500 rounded-none text-[10px] font-black uppercase tracking-widest shadow-xl shadow-orange-900/40 transition-all active:scale-95">
                  <ClipboardDocumentCheckIcon className="w-5 h-5" /> Attendance
                </Link>
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center overflow-x-auto scrollbar-hide gap-2 p-2 bg-card shadow-sm border border-border rounded-none w-full sm:w-fit no-scrollbar backdrop-blur-md">
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
              className={`flex items-center gap-3 px-6 py-3 rounded-none text-[10px] sm:text-xs font-black uppercase tracking-[0.2em] transition-all whitespace-nowrap flex-shrink-0 ${
                activeTab === tab.id 
                  ? 'bg-orange-600 text-foreground shadow-lg shadow-orange-900/40' 
                  : 'text-muted-foreground hover:text-foreground hover:bg-card shadow-sm'
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
                    { label: 'Enrolled', value: enrollments.length, icon: UserGroupIcon, gradient: 'from-orange-600 to-orange-400 from-orange-600 to-orange-400' },
                    { label: 'Capacity', value: cls.max_students, icon: ChartBarIcon, gradient: 'from-orange-600 to-orange-400' },
                    { label: 'Sessions', value: sessions.length, icon: CalendarIcon, gradient: 'from-orange-600 to-orange-400 from-orange-600 to-orange-400' },
                    { label: 'Difficulty', value: cls.programs?.difficulty_level, icon: BoltIcon, gradient: 'from-orange-600 to-orange-400 from-orange-600 to-orange-400' },
                  ].map(s => (
                    <div key={s.label} className="bg-card shadow-sm border border-border rounded-none p-6 group hover:bg-muted transition-all relative overflow-hidden">
                      <div className={`absolute top-0 right-0 w-16 h-16 bg-gradient-to-br ${s.gradient} opacity-[0.03] blur-xl -mr-8 -mt-8 group-hover:scale-150 transition-transform`} />
                      <p className="text-[9px] font-black text-muted-foreground uppercase tracking-[0.2em] mb-2">{s.label}</p>
                      <p className="text-2xl font-black text-foreground">{s.value}</p>
                    </div>
                  ))}
                </div>

                {/* Class Info */}
                <div className="bg-card shadow-sm border border-border rounded-[2.5rem] p-8 sm:p-10 relative overflow-hidden">
                  <div className="absolute top-0 right-0 w-64 h-64 bg-orange-600 opacity-[0.02] rounded-full blur-3xl" />
                  <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-muted-foreground mb-8">Metadata & Identity</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8 relative z-10">
                    <div className="space-y-6">
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-none bg-card shadow-sm border border-border flex items-center justify-center">
                          <UserIcon className="w-6 h-6 text-orange-400" />
                        </div>
                        <div>
                          <p className="text-[9px] font-black text-muted-foreground uppercase tracking-widest leading-none mb-1.5">Assigned Teacher</p>
                          <p className="text-sm font-bold text-muted-foreground">{cls.portal_users?.full_name ?? 'NOT ASSIGNED'}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-none bg-card shadow-sm border border-border flex items-center justify-center">
                          <ClockIcon className="w-6 h-6 text-blue-400" />
                        </div>
                        <div>
                          <p className="text-[9px] font-black text-muted-foreground uppercase tracking-widest leading-none mb-1.5">Schedule Rhythm</p>
                          <p className="text-sm font-bold text-muted-foreground">{cls.schedule ?? 'FLEXIBLE'}</p>
                        </div>
                      </div>
                    </div>
                    <div className="space-y-6">
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-none bg-card shadow-sm border border-border flex items-center justify-center">
                          <CalendarIcon className="w-6 h-6 text-emerald-400" />
                        </div>
                        <div>
                          <p className="text-[9px] font-black text-muted-foreground uppercase tracking-widest leading-none mb-1.5">Active Cycle</p>
                          <p className="text-sm font-bold text-muted-foreground">
                            {cls.start_date ? new Date(cls.start_date).toLocaleDateString() : 'TBD'}
                            {cls.end_date && ` — ${new Date(cls.end_date).toLocaleDateString()}`}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-none bg-card shadow-sm border border-border flex items-center justify-center">
                          <AcademicCapIcon className="w-6 h-6 text-amber-400" />
                        </div>
                        <div>
                          <p className="text-[9px] font-black text-muted-foreground uppercase tracking-widest leading-none mb-1.5">Domain Pathway</p>
                          <p className="text-sm font-bold text-muted-foreground uppercase">{cls.programs?.name}</p>
                        </div>
                      </div>
                    </div>
                  </div>
                  {cls.description && (
                    <div className="mt-10 pt-10 border-t border-border">
                      <p className="text-sm text-muted-foreground leading-relaxed font-medium italic">"{cls.description}"</p>
                    </div>
                  )}
                </div>

                {/* Recent Sessions */}
                <div className="bg-card shadow-sm border border-border rounded-[2.5rem] overflow-hidden shadow-2xl">
                  <div className="px-8 py-6 border-b border-border flex items-center justify-between bg-white/[0.02]">
                    <div className="flex items-center gap-3">
                      <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-muted-foreground">Operational History</h3>
                      <button 
                        onClick={() => {
                          setEditingSession({ id: 'new', class_id: id });
                          setSessionForm({ topic: '', session_date: new Date().toISOString().split('T')[0], start_time: '09:00', end_time: '11:00', notes: '' });
                        }}
                        className="flex items-center gap-1.5 px-3 py-1 bg-orange-500/10 hover:bg-orange-500/20 border border-orange-500/20 rounded-full text-orange-400 text-[10px] font-black uppercase tracking-tighter transition-all"
                      >
                        <PlusIcon className="w-3 h-3" /> New Session
                      </button>
                    </div>
                    <Link href={`/dashboard/attendance?class_id=${id}`} className="text-[9px] font-black text-orange-400 hover:text-orange-500 uppercase tracking-widest transition-colors tracking-[0.2em]">View Full Registry →</Link>
                  </div>
                  {sessions.length === 0 ? (
                    <div className="p-20 text-center flex flex-col items-center justify-center">
                      <div className="w-16 h-16 bg-card shadow-sm rounded-full flex items-center justify-center mb-6 border border-border">
                        <CalendarIcon className="w-8 h-8 text-muted-foreground" />
                      </div>
                      <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">No verified session activity detected</p>
                    </div>
                  ) : (
                    <div className="divide-y divide-white/5">
                      {sessions.map(s => (
                        <div key={s.id} className="px-8 py-6 flex items-center gap-6 hover:bg-white/[0.03] transition-all group">
                          <div className="w-12 h-12 rounded-none bg-card shadow-sm border border-border flex items-center justify-center text-muted-foreground group-hover:text-orange-400 group-hover:border-orange-500/30 transition-all">
                            <CalendarIcon className="w-6 h-6" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-3 mb-1">
                              <p className="font-black text-sm text-foreground group-hover:text-orange-400 transition-colors uppercase tracking-tight">{s.topic ?? 'Standard Session'}</p>
                              <div className="h-3 w-px bg-muted" />
                              <p className="text-[9px] font-black text-muted-foreground uppercase tracking-widest">{new Date(s.session_date).toLocaleDateString()}</p>
                            </div>
                            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">{s.start_time || '00:00'} — {s.end_time || '00:00'}</p>
                          </div>
                          <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button 
                              onClick={() => handleEditSession(s)}
                              className="p-2 hover:bg-muted rounded-none text-muted-foreground hover:text-foreground transition-all"
                              title="Edit Session"
                            >
                              <PencilIcon className="w-4 h-4" />
                            </button>
                            <button 
                              onClick={() => deleteSession(s.id)}
                              className="p-2 hover:bg-muted rounded-none text-muted-foreground hover:text-rose-400 transition-all"
                              title="Delete Session"
                            >
                              <TrashIcon className="w-4 h-4" />
                            </button>
                          </div>
                          {s.notes && <p className="text-[10px] text-muted-foreground font-medium italic max-w-[200px] truncate hidden sm:block">"{s.notes}"</p>}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}

            {activeTab === 'lessons' && (
              <div className="space-y-6">
                <div className="bg-gradient-to-br from-orange-600 from-orange-600 to-orange-400 rounded-[2rem] p-8 text-foreground relative overflow-hidden shadow-2xl">
                  <div className="absolute top-0 right-0 w-32 h-32 bg-muted blur-3xl -mr-16 -mt-16" />
                  <div className="relative z-10">
                    <h2 className="text-2xl font-black tracking-tighter uppercase">Curriculum Master</h2>
                    <p className="text-muted-foreground text-[10px] font-black uppercase tracking-[0.2em] mt-1">Modular learning components</p>
                  </div>
                </div>
                {items.lessons.length === 0 ? (
                  <div className="bg-card shadow-sm border border-border rounded-[2.5rem] p-20 text-center flex flex-col items-center justify-center">
                    <div className="w-16 h-16 bg-card shadow-sm rounded-full flex items-center justify-center mb-6 border border-border">
                      <BookOpenIcon className="w-8 h-8 text-muted-foreground" />
                    </div>
                    <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">No modular content detected in repository</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {items.lessons.map(lesson => (
                      <Link key={lesson.id} href={`/dashboard/lessons/${lesson.id}`} 
                        className="bg-card shadow-sm border border-border rounded-none p-6 group hover:bg-muted hover:border-orange-500/50 transition-all">
                        <div className="flex items-center gap-4 mb-4">
                          <div className="w-12 h-12 bg-card shadow-sm border border-border rounded-none flex items-center justify-center text-muted-foreground group-hover:text-orange-400 group-hover:bg-orange-600/10 transition-all">
                            <BookOpenIcon className="w-6 h-6" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-[9px] font-black text-muted-foreground uppercase tracking-widest mb-1">Module {lesson.order_index}</p>
                            <h4 className="font-black text-foreground group-hover:text-orange-400 transition-colors uppercase tracking-tight truncate">{lesson.title}</h4>
                          </div>
                        </div>
                        <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed font-medium">{lesson.content?.substring(0, 100)}...</p>
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            )}

            {activeTab === 'assignments' && (
              <div className="space-y-6">
                <div className="bg-gradient-to-br from-orange-600 to-orange-400 from-orange-600 to-orange-400 rounded-[2rem] p-8 text-foreground relative overflow-hidden shadow-2xl">
                  <div className="absolute top-0 right-0 w-32 h-32 bg-muted blur-3xl -mr-16 -mt-16" />
                  <div className="relative z-10">
                    <h2 className="text-2xl font-black tracking-tighter uppercase">Operational Tasks</h2>
                    <p className="text-muted-foreground text-[10px] font-black uppercase tracking-[0.2em] mt-1">Assignments and performance metrics</p>
                  </div>
                </div>
                {items.assignments.length === 0 ? (
                  <div className="bg-card shadow-sm border border-border rounded-[2.5rem] p-20 text-center flex flex-col items-center justify-center">
                    <div className="w-16 h-16 bg-card shadow-sm rounded-full flex items-center justify-center mb-6 border border-border">
                      <ClipboardDocumentListIcon className="w-8 h-8 text-muted-foreground" />
                    </div>
                    <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">Zero tasks initialized for this cluster</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 gap-4">
                    {items.assignments.map(a => (
                      <Link key={a.id} href={`/dashboard/assignments/${a.id}`} 
                        className="bg-card shadow-sm border border-border rounded-none p-6 group hover:bg-muted hover:border-blue-500/50 transition-all flex flex-col sm:flex-row sm:items-center gap-6">
                        <div className="w-14 h-14 bg-card shadow-sm border border-border rounded-none flex items-center justify-center text-muted-foreground group-hover:text-blue-400 group-hover:bg-blue-600/10 transition-all shrink-0">
                          <ClipboardDocumentListIcon className="w-7 h-7" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-3 mb-1">
                            <h4 className="font-black text-lg text-foreground group-hover:text-blue-400 transition-colors uppercase tracking-tight">{a.title}</h4>
                            <span className="text-[9px] font-black px-2 py-0.5 bg-blue-500/10 text-blue-400 border border-blue-500/20 rounded uppercase tracking-widest">{a.weight} Pts</span>
                          </div>
                          <p className="text-xs text-muted-foreground font-medium uppercase tracking-widest">Deadline: {a.due_date ? new Date(a.due_date).toLocaleDateString() : 'NO LIMIT'}</p>
                        </div>
                        <div className="shrink-0 flex items-center gap-3">
                          <div className="text-right">
                            <p className="text-[9px] font-black text-muted-foreground uppercase tracking-widest mb-1">Status</p>
                            <p className="text-[10px] font-black text-emerald-400 uppercase tracking-widest">Active</p>
                          </div>
                          <div className="w-10 h-10 rounded-none bg-card shadow-sm border border-border flex items-center justify-center text-muted-foreground group-hover:text-foreground transition-all">
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
                <div className="bg-gradient-to-br from-orange-600 to-orange-400 to-orange-600 rounded-[2rem] p-8 text-foreground relative overflow-hidden shadow-2xl">
                  <div className="absolute top-0 right-0 w-32 h-32 bg-muted blur-3xl -mr-16 -mt-16" />
                  <div className="relative z-10">
                    <h2 className="text-2xl font-black tracking-tighter uppercase">Knowledge Synthesis</h2>
                    <p className="text-muted-foreground text-[10px] font-black uppercase tracking-[0.2em] mt-1">Computer-based testing arrays</p>
                  </div>
                </div>
                {items.cbt.length === 0 ? (
                  <div className="bg-card shadow-sm border border-border rounded-[2.5rem] p-20 text-center flex flex-col items-center justify-center">
                    <div className="w-16 h-16 bg-card shadow-sm rounded-full flex items-center justify-center mb-6 border border-border">
                      <AcademicCapIcon className="w-8 h-8 text-muted-foreground" />
                    </div>
                    <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">No assessment protocols found</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {items.cbt.map(ex => (
                      <Link key={ex.id} href={`/dashboard/cbt/${ex.id}`} 
                        className="bg-card shadow-sm border border-border rounded-none p-6 group hover:bg-muted hover:border-amber-500/50 transition-all">
                        <div className="w-12 h-12 bg-card shadow-sm border border-border rounded-none flex items-center justify-center text-muted-foreground group-hover:text-amber-400 group-hover:bg-amber-600/10 transition-all mb-4">
                          <AcademicCapIcon className="w-6 h-6" />
                        </div>
                        <h4 className="font-black text-foreground group-hover:text-amber-400 transition-colors uppercase tracking-tight mb-2 line-clamp-1">{ex.title}</h4>
                        <div className="flex items-center gap-4">
                          <div>
                            <p className="text-[9px] font-black text-muted-foreground uppercase tracking-widest mb-1">Time Limit</p>
                            <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">{ex.duration_minutes} MINS</p>
                          </div>
                          <div className="w-px h-6 bg-muted" />
                          <div>
                            <p className="text-[9px] font-black text-muted-foreground uppercase tracking-widest mb-1">Payload</p>
                            <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">{ex.total_questions} QUERIES</p>
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
                    <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-muted-foreground">Class Gradebook</h3>
                    {isStaff && (
                      <button
                        onClick={() => setManualEntry(!manualEntry)}
                        className={`flex items-center gap-3 px-4 py-2 rounded-none text-[9px] font-black uppercase tracking-widest transition-all ${manualEntry ? 'bg-emerald-600 text-foreground shadow-lg shadow-emerald-900/40' : 'bg-card shadow-sm text-muted-foreground border border-border hover:bg-muted'}`}
                      >
                        {manualEntry ? <CheckIconOutline className="w-4 h-4" /> : <PencilSquareIconOutline className="w-4 h-4" />}
                        {manualEntry ? 'Syncing...' : 'Manual Entry'}
                      </button>
                    )}
                  </div>
                  <button onClick={() => router.push('/dashboard/grades')} className="text-[9px] font-black text-orange-400 hover:text-orange-500 uppercase tracking-[0.2em] transition-colors">
                    Full Analytics Node →
                  </button>
                </div>
                {items.assignments.length === 0 ? (
                  <div className="bg-card shadow-sm border border-border rounded-[2.5rem] p-20 text-center flex flex-col items-center justify-center">
                    <div className="w-16 h-16 bg-card shadow-sm rounded-full flex items-center justify-center mb-6 border border-border">
                      <ChartBarIcon className="w-8 h-8 text-muted-foreground" />
                    </div>
                    <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">No grading metrics available for this cluster</p>
                  </div>
                ) : (
                  <div className="bg-background/50 border border-border rounded-[2.5rem] overflow-hidden overflow-x-auto shadow-inner custom-scrollbar">
                    <table className="w-full text-left border-collapse min-w-[600px]">
                      <thead>
                        <tr className="border-b border-border bg-white/[0.02]">
                          <th className="px-8 py-6 text-[9px] font-black text-muted-foreground uppercase tracking-[0.3em] sticky left-0 bg-background z-20">Student Pioneers</th>
                          {items.assignments.map(a => (
                            <th key={a.id} className="px-6 py-6 text-[9px] font-black text-muted-foreground uppercase tracking-[0.2em] text-center min-w-[140px] bg-amber-500/[0.03]">
                              <div className="line-clamp-1 mb-1" title={a.title}>{a.title}</div>
                              <div className="text-[8px] text-amber-400/70 lowercase font-medium">{a.max_points}pts</div>
                            </th>
                          ))}
                          {items.cbt.map(c => (
                            <th key={c.id} className="px-6 py-6 text-[9px] font-black text-muted-foreground uppercase tracking-[0.2em] text-center min-w-[140px] bg-orange-600/[0.03]">
                              <div className="line-clamp-1 mb-1" title={c.title}>{c.title}</div>
                              <div className="text-[8px] text-orange-400/70 lowercase font-medium">{c.total_questions} Qs</div>
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/5">
                        {enrollments.map(enr => (
                          <tr key={enr.id} className="hover:bg-white/[0.01] transition-colors group">
                            <td className="px-8 py-6 sticky left-0 bg-[#0D1630] z-10 border-r border-border group-hover:bg-[#121D3D] transition-colors shadow-2xl">
                              <div className="flex items-center gap-4">
                                <div className="w-10 h-10 rounded-none bg-gradient-to-br from-orange-600/20 from-orange-600 to-orange-400/20 border border-border flex items-center justify-center text-[10px] font-black text-orange-400 group-hover:scale-110 transition-transform">
                                  {(enr.full_name ?? '?')[0]}
                                </div>
                                <div className="min-w-0">
                                  <p className="text-foreground font-black text-[11px] uppercase tracking-tighter truncate group-hover:text-orange-400 transition-colors">{enr.full_name}</p>
                                  <p className="text-[9px] text-muted-foreground truncate font-medium">{enr.email}</p>
                                </div>
                              </div>
                            </td>
                            {items.assignments.map(a => {
                              const sub = items.submissions.find(s => s.assignment_id === a.id && s.portal_user_id === enr.id);
                              const score = sub?.grade;
                              const percentage = a.max_points > 0 ? (score ?? 0) / a.max_points : 0;
                              return (
                                <td key={a.id} className={`px-4 py-6 text-center border-l border-border transition-all relative ${manualEntry ? 'bg-emerald-500/[0.05]' : 'bg-amber-500/[0.01]'}`}>
                                  {manualEntry ? (
                                    <div className="flex flex-col items-center gap-1">
                                      <input
                                        type="number"
                                        defaultValue={score ?? ''}
                                        onBlur={async (e) => {
                                          const val = e.target.value;
                                          if (val !== '' && isNaN(Number(val))) return;
                                          const numVal = val === '' ? null : Math.min(Number(val), a.max_points);
                                          const key = `asm-${a.id}-${enr.id}`;
                                          if (numVal === score) return;

                                          setMatrixSaving(p => ({ ...p, [key]: true }));
                                          try {
                                            if (sub) {
                                              const res = await fetch(`/api/assignment-submissions/${sub.id}`, {
                                                method: 'PATCH',
                                                headers: { 'Content-Type': 'application/json' },
                                                body: JSON.stringify({ grade: numVal, status: 'graded', feedback: sub.feedback || null }),
                                              });
                                              if (!res.ok) { const j = await res.json(); throw new Error(j.error); }
                                            } else {
                                              const res = await fetch(`/api/assignments/${a.id}/grade`, {
                                                method: 'POST',
                                                headers: { 'Content-Type': 'application/json' },
                                                body: JSON.stringify({ student_id: enr.id, grade: numVal, status: 'graded' }),
                                              });
                                              if (!res.ok) { const j = await res.json(); throw new Error(j.error); }
                                            }
                                            await fetchData();
                                          } catch (err) {
                                            console.error(err);
                                          } finally {
                                            setMatrixSaving(p => ({ ...p, [key]: false }));
                                          }
                                        }}
                                        className="w-14 h-10 bg-card shadow-sm border border-border rounded-none text-center text-xs font-black text-foreground focus:border-emerald-500 focus:bg-muted outline-none transition-all"
                                      />
                                      {matrixSaving[`asm-${a.id}-${enr.id}`] && (
                                        <div className="absolute top-2 right-2 w-2 h-2 bg-emerald-500 rounded-full animate-ping" />
                                      )}
                                    </div>
                                  ) : sub ? (
                                    score !== null ? (
                                      <div className="space-y-2">
                                        <span className={`text-sm font-black ${percentage >= 0.7 ? 'text-emerald-400' : percentage >= 0.5 ? 'text-amber-400' : 'text-rose-400'}`}>
                                          {score}
                                        </span>
                                        <div className="w-12 h-1 bg-card shadow-sm rounded-full overflow-hidden mx-auto">
                                          <div className={`h-full transition-all duration-1000 ${percentage >= 0.7 ? 'bg-emerald-500' : percentage >= 0.5 ? 'bg-amber-500' : 'bg-rose-500'}`} style={{ width: `${percentage * 100}%` }}></div>
                                        </div>
                                      </div>
                                    ) : (
                                      <span className="text-[8px] font-black text-blue-400/60 uppercase tracking-widest bg-blue-500/10 px-2 py-1 rounded-none border border-blue-500/10">Pending</span>
                                    )
                                  ) : (
                                    <span className="text-[10px] text-white/5 font-black uppercase tracking-widest">—</span>
                                  )}
                                </td>
                              );
                            })}
                            {items.cbt.map(c => {
                              const sess = items.cbtSessions.find(s => s.exam_id === c.id && s.user_id === enr.id);
                              const score = sess?.score;
                              const percentage = c.total_questions > 0 ? (score ?? 0) / c.total_questions : 0;
                              return (
                                <td key={c.id} className="px-6 py-6 text-center border-l border-border bg-orange-600/[0.01]">
                                  {sess ? (
                                    score !== null ? (
                                      <div className="space-y-2">
                                        <span className={`text-sm font-black ${percentage >= 0.7 ? 'text-emerald-400' : percentage >= 0.5 ? 'text-amber-400' : 'text-rose-400'}`}>
                                          {score}
                                        </span>
                                        <div className="w-12 h-1 bg-card shadow-sm rounded-full overflow-hidden mx-auto">
                                          <div className={`h-full transition-all duration-1000 ${percentage >= 0.7 ? 'bg-emerald-500' : percentage >= 0.5 ? 'bg-amber-500' : 'bg-rose-500'}`} style={{ width: `${percentage * 100}%` }}></div>
                                        </div>
                                      </div>
                                    ) : (
                                      <span className="text-[8px] font-black text-cyan-400/60 uppercase tracking-widest bg-cyan-500/10 px-2 py-1 rounded-none border border-cyan-500/10 animate-pulse">Running</span>
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
              <div className="bg-card shadow-sm border border-border rounded-[2.5rem] p-8 space-y-6 shadow-2xl relative overflow-hidden">
                <div className="absolute top-0 right-0 w-32 h-32 bg-orange-600 opacity-[0.03] blur-3xl rounded-full" />
                <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-muted-foreground">Operations Deck</h3>
                <div className="grid grid-cols-1 gap-3">
                  {([
                    { label: 'Roll Call', sub: 'SYNC REGISTRY', icon: CheckCircleIcon, btnCls: 'bg-blue-600/5 hover:bg-blue-600/10 border-blue-600/10 hover:border-blue-600/30', iconCls: 'bg-blue-600/10 text-blue-400', subCls: 'text-blue-400/60', action: () => router.push(`/dashboard/attendance?class_id=${id}`) },
                    { label: 'Quick Task', sub: 'INITIATE ASSIGNMENT', icon: ClipboardDocumentListIcon, btnCls: 'bg-amber-600/5 hover:bg-amber-600/10 border-amber-600/10 hover:border-amber-600/30', iconCls: 'bg-amber-600/10 text-amber-400', subCls: 'text-amber-400/60', action: () => router.push('/dashboard/assignments/new') },
                    { label: 'Add Lesson', sub: 'AUGMENT CURRICULUM', icon: BookOpenIcon, btnCls: 'bg-cyan-600/5 hover:bg-cyan-600/10 border-cyan-600/10 hover:border-cyan-600/30', iconCls: 'bg-cyan-600/10 text-cyan-400', subCls: 'text-cyan-400/60', action: () => router.push('/dashboard/lessons/add') },
                    { label: 'Apply CBT', sub: 'SYSTEM TESTING', icon: AcademicCapIcon, btnCls: 'bg-orange-600/5 hover:bg-orange-600/10 border-orange-600/10 hover:border-orange-600/30', iconCls: 'bg-orange-600/10 text-orange-400', subCls: 'text-orange-400/60', action: () => router.push('/dashboard/cbt/new') },
                  ] as const).map(btn => (
                    <button key={btn.label} onClick={btn.action} className={`group flex items-center gap-4 w-full p-4 border rounded-[1.5rem] text-left transition-all active:scale-[0.98] ${btn.btnCls}`}>
                      <div className={`w-12 h-12 rounded-none flex items-center justify-center group-hover:scale-110 transition-transform shadow-lg ${btn.iconCls}`}>
                        <btn.icon className="w-6 h-6" />
                      </div>
                      <div>
                        <p className="text-[11px] font-black text-foreground uppercase tracking-tighter">{btn.label}</p>
                        <p className={`text-[8px] font-black uppercase tracking-widest ${btn.subCls}`}>{btn.sub}</p>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Students List */}
            <div className="bg-card shadow-sm border border-border rounded-[2.5rem] overflow-hidden shadow-2xl">
              <div className="px-8 py-6 border-b border-border flex items-center justify-between bg-white/[0.02]">
                <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-muted-foreground">Enrolled Pioneers</h3>
                <div className="flex items-center gap-3">
                  <div className="px-3 py-1 bg-card shadow-sm rounded-full border border-border">
                    <span className="text-[9px] font-black text-orange-400 tracking-widest">{enrollments.length} <span className="text-muted-foreground">/</span> {cls.max_students}</span>
                  </div>
                  {isStaff && (
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => { setShowStudentModal(true); loadAvailableStudents(); }}
                        title="Enroll Existing Student"
                        className="w-8 h-8 rounded-none bg-orange-600/20 hover:bg-orange-600/40 border border-orange-600/30 text-orange-400 flex items-center justify-center transition-all active:scale-90"
                      >
                        <PlusIcon className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => setShowRegisterModal(true)}
                        title="Register New Student"
                        className="w-8 h-8 rounded-none bg-blue-600/20 hover:bg-blue-600/40 border border-blue-600/30 text-blue-400 flex items-center justify-center transition-all active:scale-90"
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
                  <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest leading-relaxed">No student signals detected in this cluster</p>
                  <Link href={`/dashboard/classes/${id}/edit`} className="mt-6 text-[9px] font-black text-orange-400 uppercase tracking-widest hover:text-orange-500 transition-colors">Manage Registry →</Link>
                </div>
              ) : (
                <div className="divide-y divide-white/5 max-h-[500px] overflow-y-auto custom-scrollbar">
                  {enrollments.map((enr: any) => (
                    <div key={enr.id} className="px-8 py-5 flex items-center gap-4 hover:bg-white/[0.03] transition-all group">
                      <div className="w-10 h-10 rounded-none bg-gradient-to-br from-orange-600 to-orange-400/10 to-orange-600/10 border border-border flex items-center justify-center text-[10px] font-black text-muted-foreground group-hover:text-orange-400 transition-all">
                        {(enr.full_name ?? '?')[0]}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-black text-foreground group-hover:text-orange-400 transition-colors truncate uppercase tracking-tighter">{enr.full_name}</p>
                        <p className="text-[9px] text-muted-foreground truncate font-medium">{enr.email}</p>
                      </div>
                      {isStaff && (
                        <button
                          onClick={async () => {
                            if (!confirm(`Remove ${enr.full_name} from this class?`)) return;
                            const res = await fetch(`/api/classes/${id}/enroll`, {
                              method: 'DELETE',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ studentId: enr.id }),
                            });
                            if (!res.ok) { const j = await res.json(); alert(j.error); return; }
                            setEnrollments(prev => prev.filter(e => e.id !== enr.id));
                          }}
                          title="Unenroll student"
                          className="w-7 h-7 rounded-none bg-rose-600/10 hover:bg-rose-600/30 border border-rose-600/20 text-rose-400 flex items-center justify-center transition-all active:scale-90 flex-shrink-0 sm:opacity-0 sm:group-hover:opacity-100"
                        >
                          <TrashIcon className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {isStaff && (
              <button
                onClick={handleExportLogins}
                className="w-full py-5 bg-emerald-600/10 hover:bg-emerald-600/20 border border-emerald-600/20 rounded-none flex items-center justify-center gap-3 group transition-all"
              >
                <div className="w-8 h-8 bg-emerald-600/20 rounded-none flex items-center justify-center text-emerald-400 group-hover:scale-110 transition-transform">
                  <CloudArrowDownIcon className="w-4 h-4" />
                </div>
                <span className="text-[10px] font-black text-emerald-400 uppercase tracking-[0.2em]">Export Login Credentials</span>
              </button>
            )}

          </div>

        </div>
      </div>

      {/* Student Enrol Modal */}
      {showStudentModal && (() => {
        const unassigned = availableStudents.filter((s: any) => !s.class_id);
        const inOtherClass = availableStudents.filter((s: any) => s.class_id);
        return (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-8">
            <div className="absolute inset-0 bg-black/80 backdrop-blur-md" onClick={() => setShowStudentModal(false)} />
            <div className="bg-[#0D1630] border border-border rounded-none w-full max-w-lg shadow-2xl overflow-hidden relative z-10 flex flex-col max-h-[90vh]">

              {/* Header */}
              <div className="px-6 py-5 border-b border-border flex items-center justify-between flex-shrink-0">
                <div>
                  <h3 className="font-bold text-foreground">Enrol Students</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">{availableStudents.length} eligible · {selectedStudentIds.size} selected</p>
                </div>
                <button onClick={() => { setShowStudentModal(false); setEnrolMode('current'); setStudentSearch(''); setShowMoreStudents(false); }} className="w-8 h-8 flex items-center justify-center bg-card shadow-sm rounded-none text-muted-foreground hover:text-foreground transition-colors text-lg">&times;</button>
              </div>

              {/* Mode tabs */}
              <div className="px-6 pt-4 pb-1 flex gap-2 flex-shrink-0">
                <button
                  onClick={() => setEnrolMode('current')}
                  className={`flex-1 py-2 rounded-none text-[10px] font-bold transition-all ${enrolMode === 'current' ? 'bg-orange-600 text-foreground shadow-lg shadow-orange-900/30' : 'bg-card shadow-sm text-muted-foreground hover:bg-muted border border-border'}`}
                >
                  Enrol into {cls?.name ?? 'this class'}
                </button>
                <button
                  onClick={() => setEnrolMode('create')}
                  className={`flex-1 py-2 rounded-none text-[10px] font-bold transition-all ${enrolMode === 'create' ? 'bg-emerald-600 text-foreground shadow-lg shadow-emerald-900/30' : 'bg-card shadow-sm text-muted-foreground hover:bg-muted border border-border'}`}
                >
                  + Create New Class
                </button>
              </div>

              {/* Current-class mode: select students */}
              {enrolMode === 'current' && (
                <>
                  {/* Search box */}
                  {availableStudents.length > 0 && (
                    <div className="px-6 pt-3 pb-1 flex-shrink-0">
                      <input
                        type="text"
                        placeholder="Search by name, email or school..."
                        value={studentSearch}
                        onChange={e => { setStudentSearch(e.target.value); setShowMoreStudents(false); }}
                        className="w-full px-4 py-2.5 bg-card shadow-sm border border-border rounded-none text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-orange-500 transition-colors"
                      />
                    </div>
                  )}
                  {/* Toolbar */}
                  {availableStudents.length > 0 && (
                    <div className="px-6 pt-2 pb-2 flex items-center gap-2 flex-shrink-0">
                      <button
                        onClick={() => setSelectedStudentIds(
                          selectedStudentIds.size === availableStudents.length
                            ? new Set()
                            : new Set(availableStudents.map((s: any) => s.id))
                        )}
                        className="px-3 py-1.5 bg-card shadow-sm hover:bg-muted border border-border text-[10px] font-bold text-muted-foreground hover:text-foreground rounded-none transition-all"
                      >
                        {selectedStudentIds.size === availableStudents.length ? 'Deselect All' : 'Select All'}
                      </button>
                      <div className="flex-1" />
                      {selectedStudentIds.size > 0 && (
                        <button
                          onClick={() => syncSelectedStudents()}
                          disabled={!!processingStudent}
                          className="px-4 py-1.5 bg-orange-600 hover:bg-orange-500 text-[10px] font-bold text-foreground rounded-none transition-all disabled:opacity-50 flex items-center gap-1.5"
                        >
                          {processingStudent === 'loading'
                            ? <><ArrowPathIcon className="w-3 h-3 animate-spin" /> Enrolling…</>
                            : <>Enrol {selectedStudentIds.size} student{selectedStudentIds.size !== 1 ? 's' : ''}</>}
                        </button>
                      )}
                    </div>
                  )}

                  {/* Student list */}
                  <div className="flex-1 overflow-y-auto px-6 pb-6 custom-scrollbar space-y-4">
                    {processingStudent === 'loading' ? (
                      <div className="py-20 text-center">
                        <ArrowPathIcon className="w-10 h-10 text-orange-500 animate-spin mx-auto mb-4" />
                        <p className="text-xs text-muted-foreground">Loading students…</p>
                      </div>
                    ) : availableStudents.length === 0 ? (
                      <div className="py-16 text-center space-y-3">
                        <UserGroupIcon className="w-12 h-12 mx-auto text-muted-foreground" />
                        <p className="text-sm font-semibold text-muted-foreground">No eligible students found</p>
                        <p className="text-xs text-muted-foreground">All students in your school are already enrolled here, or none are registered.</p>
                        <button onClick={() => setEnrolMode('create')} className="text-xs font-bold text-emerald-400 hover:text-emerald-300 transition-colors">
                          Create a new class instead →
                        </button>
                      </div>
                    ) : (() => {
                      // Apply search filter across all students
                      const q = studentSearch.trim().toLowerCase();
                      const filtered = q
                        ? availableStudents.filter((s: any) =>
                            (s.full_name ?? '').toLowerCase().includes(q) ||
                            (s.email ?? '').toLowerCase().includes(q) ||
                            (s.school_name ?? '').toLowerCase().includes(q) ||
                            (s.section_class ?? '').toLowerCase().includes(q)
                          )
                        : availableStudents;

                      // Group: unassigned (no class_id) vs in another class
                      const filtUnassigned = filtered.filter((s: any) => !s.class_id);
                      const filtInOther = filtered.filter((s: any) => s.class_id);

                      // Pagination: show first PAGE_SIZE, then offer "Show More"
                      const PAGE_SIZE = 25;
                      const visibleUnassigned = showMoreStudents ? filtUnassigned : filtUnassigned.slice(0, PAGE_SIZE);
                      const visibleInOther = showMoreStudents ? filtInOther : filtInOther.slice(0, Math.max(0, PAGE_SIZE - filtUnassigned.length));
                      const hasMore = filtUnassigned.length > visibleUnassigned.length || filtInOther.length > visibleInOther.length;

                      const renderStudent = (student: any, color: 'orange' | 'amber') => {
                        const isChecked = selectedStudentIds.has(student.id);
                        return (
                          <div key={student.id} onClick={() => setSelectedStudentIds(prev => { const n = new Set(prev); n.has(student.id) ? n.delete(student.id) : n.add(student.id); return n; })}
                            className={`flex items-center gap-3 p-3 border rounded-none cursor-pointer transition-all active:scale-[0.99] ${isChecked
                              ? color === 'orange' ? 'bg-orange-600/15 border-orange-500/40' : 'bg-amber-500/10 border-amber-500/40'
                              : color === 'orange' ? 'bg-card shadow-sm border-border hover:border-orange-500/20' : 'bg-card shadow-sm border-amber-500/10 hover:border-amber-500/20'}`}>
                            <div className={`flex-shrink-0 w-5 h-5 rounded border-2 flex items-center justify-center transition-all ${isChecked
                              ? color === 'orange' ? 'bg-orange-600 border-orange-400' : 'bg-amber-500 border-amber-400'
                              : 'border-border'}`}>
                              {isChecked && <CheckIconOutline className="w-3 h-3 text-foreground" />}
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-semibold text-foreground truncate">{student.full_name}</p>
                              <div className="flex items-center gap-2 flex-wrap">
                                <p className="text-xs text-muted-foreground truncate">{student.email}</p>
                                {student.school_name && <span className="text-[9px] font-bold text-blue-400/70 bg-blue-500/10 px-1.5 py-0.5 rounded-full border border-blue-500/20 flex-shrink-0">{student.school_name}</span>}
                                {student.section_class && <span className="text-[9px] font-bold text-amber-400/60 bg-amber-500/10 px-1.5 py-0.5 rounded-full border border-amber-500/20 flex-shrink-0">{student.section_class}</span>}
                              </div>
                              {student.class_id && <p className="text-[9px] text-amber-400/70 mt-0.5">Currently in: {(student.classes as any)?.name ?? 'another class'}</p>}
                            </div>
                          </div>
                        );
                      };

                      if (filtered.length === 0) return (
                        <div className="py-12 text-center">
                          <p className="text-sm text-muted-foreground">No students match "{studentSearch}"</p>
                        </div>
                      );

                      return (
                        <>
                          {filtUnassigned.length > 0 && (
                            <div>
                              <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest mb-2">
                                Available ({filtUnassigned.length})
                                {filtUnassigned.length > visibleUnassigned.length && <span className="text-muted-foreground"> — showing {visibleUnassigned.length}</span>}
                              </p>
                              <div className="space-y-1.5">{visibleUnassigned.map(s => renderStudent(s, 'orange'))}</div>
                            </div>
                          )}
                          {filtInOther.length > 0 && (
                            <div>
                              <p className="text-[10px] font-black text-amber-400/60 uppercase tracking-widest mb-2">
                                In another class — will reassign ({filtInOther.length})
                                {filtInOther.length > visibleInOther.length && <span className="text-amber-400/30"> — showing {visibleInOther.length}</span>}
                              </p>
                              <div className="space-y-1.5">{visibleInOther.map(s => renderStudent(s, 'amber'))}</div>
                            </div>
                          )}
                          {hasMore && (
                            <button
                              onClick={() => setShowMoreStudents(true)}
                              className="w-full py-3 text-xs font-bold text-muted-foreground hover:text-foreground bg-card shadow-sm hover:bg-muted rounded-none border border-border transition-all"
                            >
                              Show all {filtered.length} students
                            </button>
                          )}
                        </>
                      );
                    })()}
                  </div>

                  <div className="px-6 py-4 border-t border-border flex-shrink-0 flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">{selectedStudentIds.size} selected</span>
                    <button onClick={() => { setShowStudentModal(false); setEnrolMode('current'); }} className="px-4 py-2 text-xs font-semibold text-muted-foreground hover:text-foreground bg-card shadow-sm hover:bg-muted rounded-none transition-all">
                      Cancel
                    </button>
                  </div>
                </>
              )}

              {/* Create-new-class mode */}
              {enrolMode === 'create' && (
                <div className="flex-1 overflow-y-auto px-6 pb-6 pt-4 custom-scrollbar space-y-3">
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    Register a new class and immediately enrol the {selectedStudentIds.size > 0 ? `${selectedStudentIds.size} selected` : 'selected'} student{selectedStudentIds.size !== 1 ? 's' : ''} into it.
                    {selectedStudentIds.size === 0 && <span className="text-amber-400/70"> Select students first on the other tab.</span>}
                  </p>
                  <input
                    type="text"
                    placeholder="Class name (e.g. JSS1, SS2A) *"
                    value={newClassForm.name}
                    onChange={e => setNewClassForm(f => ({ ...f, name: e.target.value }))}
                    className="w-full px-4 py-3 bg-card shadow-sm border border-border rounded-none text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-emerald-500 transition-colors"
                  />
                  <select
                    value={newClassForm.program_id}
                    onChange={e => setNewClassForm(f => ({ ...f, program_id: e.target.value }))}
                    className="w-full px-4 py-3 bg-card shadow-sm border border-border rounded-none text-sm text-foreground focus:outline-none focus:border-emerald-500 cursor-pointer transition-colors"
                  >
                    <option value="">— Programme *—</option>
                    {programsList.map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                  <select
                    value={newClassForm.school_id}
                    onChange={e => setNewClassForm(f => ({ ...f, school_id: e.target.value }))}
                    className="w-full px-4 py-3 bg-card shadow-sm border border-border rounded-none text-sm text-foreground focus:outline-none focus:border-emerald-500 cursor-pointer transition-colors"
                  >
                    <option value="">— School (optional) —</option>
                    {schoolsList.map((s: any) => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                  <input
                    type="number"
                    placeholder="Max students (optional)"
                    value={newClassForm.max_students}
                    onChange={e => setNewClassForm(f => ({ ...f, max_students: e.target.value }))}
                    className="w-full px-4 py-3 bg-card shadow-sm border border-border rounded-none text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-emerald-500 transition-colors"
                  />
                  <button
                    onClick={createClassAndEnrol}
                    disabled={creatingNewClass || !newClassForm.name.trim() || !newClassForm.program_id || selectedStudentIds.size === 0}
                    className="w-full py-3 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-foreground font-bold rounded-none transition-all flex items-center justify-center gap-2"
                  >
                    {creatingNewClass
                      ? <><ArrowPathIcon className="w-4 h-4 animate-spin" /> Creating & Enrolling…</>
                      : `Create Class & Enrol ${selectedStudentIds.size} Student${selectedStudentIds.size !== 1 ? 's' : ''}`}
                  </button>
                  {selectedStudentIds.size === 0 && (
                    <button onClick={() => setEnrolMode('current')} className="w-full py-2 text-xs text-orange-400 hover:text-orange-500 transition-colors font-semibold">
                      ← Go back and select students first
                    </button>
                  )}
                </div>
              )}

            </div>
          </div>
        );
      })()}


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
        classId={id}
      />

      {/* Session Edit/Create Modal */}
      {editingSession && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 sm:p-6">
          <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={() => !savingSession && setEditingSession(null)} />
          <div className="relative w-full max-w-lg bg-[#0d1526] border border-border rounded-[2rem] shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-300">
            <div className="p-8 border-b border-border">
              <h3 className="text-xl font-black text-foreground uppercase tracking-tight">
                {editingSession.id === 'new' ? 'Initialize New Session' : 'Modify Session Parameters'}
              </h3>
              <p className="text-muted-foreground text-[10px] font-black uppercase tracking-widest mt-1">Registry Synchronization Protocol</p>
            </div>
            <div className="p-8 space-y-5">
              <div className="space-y-2">
                <label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest ml-1">Session Topic / Curriculum Focus</label>
                <input
                  type="text"
                  value={sessionForm.topic}
                  onChange={(e) => setSessionForm({ ...sessionForm, topic: e.target.value })}
                  placeholder="e.g. Introduction to Variables"
                  className="w-full bg-card shadow-sm border border-border rounded-none px-5 py-4 text-foreground focus:outline-none focus:border-orange-500/50 transition-all font-medium"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest ml-1">Archive Date</label>
                  <input
                    type="date"
                    value={sessionForm.session_date}
                    onChange={(e) => setSessionForm({ ...sessionForm, session_date: e.target.value })}
                    className="w-full bg-card shadow-sm border border-border rounded-none px-5 py-4 text-foreground focus:outline-none focus:border-orange-500/50 transition-all [color-scheme:dark]"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest ml-1">Start — End Time</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="time"
                      value={sessionForm.start_time}
                      onChange={(e) => setSessionForm({ ...sessionForm, start_time: e.target.value })}
                      className="flex-1 bg-card shadow-sm border border-border rounded-none px-3 py-4 text-foreground focus:outline-none focus:border-orange-500/50 transition-all [color-scheme:dark] text-sm"
                    />
                    <span className="text-muted-foreground">—</span>
                    <input
                      type="time"
                      value={sessionForm.end_time}
                      onChange={(e) => setSessionForm({ ...sessionForm, end_time: e.target.value })}
                      className="flex-1 bg-card shadow-sm border border-border rounded-none px-3 py-4 text-foreground focus:outline-none focus:border-orange-500/50 transition-all [color-scheme:dark] text-sm"
                    />
                  </div>
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest ml-1">Facilitator Notes (Internal)</label>
                <textarea
                  value={sessionForm.notes}
                  onChange={(e) => setSessionForm({ ...sessionForm, notes: e.target.value })}
                  rows={3}
                  className="w-full bg-card shadow-sm border border-border rounded-none px-5 py-4 text-foreground focus:outline-none focus:border-orange-500/50 transition-all font-medium resize-none text-sm"
                  placeholder="Record student participation or blockers..."
                />
              </div>
            </div>
            <div className="p-8 bg-black/40 border-t border-border flex gap-4">
              <button
                onClick={() => setEditingSession(null)}
                disabled={savingSession}
                className="flex-1 py-4 bg-card shadow-sm hover:bg-muted text-muted-foreground font-black rounded-none transition-all uppercase tracking-widest text-[10px] border border-border"
              >
                Abort
              </button>
              <button
                onClick={async () => {
                  setSavingSession(true);
                  try {
                    const isNew = editingSession.id === 'new';
                    const url = isNew ? '/api/class-sessions' : `/api/class-sessions/${editingSession.id}`;
                    const res = await fetch(url, {
                      method: isNew ? 'POST' : 'PATCH',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify(isNew ? { ...sessionForm, class_id: id } : sessionForm),
                    });
                    if (!res.ok) throw new Error('Operation failed');
                    setEditingSession(null);
                    await fetchData();
                  } catch (e: any) {
                    alert(e.message);
                  } finally {
                    setSavingSession(false);
                  }
                }}
                disabled={savingSession}
                className="flex-[2] py-4 bg-orange-600 hover:bg-orange-500 text-foreground font-black rounded-none transition-all uppercase tracking-widest text-[10px] shadow-xl shadow-orange-900/40 flex items-center justify-center gap-2"
              >
                {savingSession ? <ArrowPathIcon className="w-4 h-4 animate-spin" /> : <CloudArrowUpIcon className="w-4 h-4" />}
                {editingSession.id === 'new' ? 'Commit to Registry' : 'Save Modifications'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Support Icons (inline SVGs for icons not in the heroicons import above)
function StarIcon(props: any) { return <svg fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" {...props}><path strokeLinecap="round" strokeLinejoin="round" d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.385a.563.563 0 00-.182-.557l-4.204-3.602a.563.563 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345l2.125-5.111z" /></svg>; }
function ArrowRightIcon(props: any) { return <svg fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" {...props}><path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" /></svg>; }
function XMarkIcon(props: any) { return <svg fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" {...props}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>; }
