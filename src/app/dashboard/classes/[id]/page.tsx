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
  CloudArrowUpIcon, UserPlusIcon, MagnifyingGlassIcon, ArrowsRightLeftIcon
} from '@/lib/icons';
import { AddStudentModal } from '@/features/students/components/AddStudentModal';
import { getWAECGrade } from '@/lib/grading';
import { parseBandLabel, bandCoversGrade, parseGrade, SINGLE_GRADES } from '@/lib/classes/naming';
import { fetchJsonWithTimeout, withTimeout } from '@/lib/async-timeout';

// Turn an enroll PUT response into a human message about students that were NOT added,
// so a silent school-boundary / other-teacher drop never looks like a successful add.
function enrollSkipMessage(json: any, requested: number): string | null {
  const school: string[] = Array.isArray(json?.rejectedSchoolBoundary) ? json.rejectedSchoolBoundary : [];
  const otherTeacher: string[] = Array.isArray(json?.rejectedOtherTeacher) ? json.rejectedOtherTeacher : [];
  const totalSkipped = typeof json?.skipped === 'number' ? json.skipped : Math.max(0, requested - (json?.enrolled ?? requested));
  if (totalSkipped <= 0 && school.length === 0 && otherTeacher.length === 0) return null;
  const lines: string[] = [`⚠ ${totalSkipped || school.length + otherTeacher.length} not added:`];
  if (school.length) lines.push(`• Different school (blocked): ${school.join(', ')}`);
  if (otherTeacher.length) lines.push(`• Owned by another teacher - use the transfer request: ${otherTeacher.join(', ')}`);
  const accounted = school.length + otherTeacher.length;
  if (totalSkipped > accounted) lines.push(`• ${totalSkipped - accounted} skipped (already enrolled or ineligible).`);
  return lines.join('\n');
}

export default function ClassDetailPage() {
  const params = useParams();
  const id = params?.id as string;
  const router = useRouter();
  const { profile, loading: authLoading } = useAuth();

  const [cls, setCls] = useState<any>(null);
  const [sessions, setSessions] = useState<any[]>([]);
  const [enrollments, setEnrollments] = useState<any[]>([]);
  const [destinationClasses, setDestinationClasses] = useState<any[]>([]);
  const [movingStudent, setMovingStudent] = useState<string | null>(null);
  const [formerEnrollments, setFormerEnrollments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [activeTab, setActiveTab] = useState<'overview' | 'lessons' | 'assignments' | 'cbt' | 'gradebook'>('overview');
  const [activeOperation, setActiveOperation] = useState<'roster' | 'teaching' | 'assessment' | 'communication'>('roster');
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
  const [rosterSearch, setRosterSearch] = useState(''); // Search/filter on the class roster itself
  const [showNeedsReportOnly, setShowNeedsReportOnly] = useState(false); // roster: only students needing a report
  const [reportIndicatorEnabled, setReportIndicatorEnabled] = useState(true); // admin setting: show report status?
  // Inline identity edit (name + grade) on the roster — source of truth, round-trips everywhere.
  const [editingStudentId, setEditingStudentId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editGrade, setEditGrade] = useState('');
  const [savingIdentity, setSavingIdentity] = useState(false);

  // Bulk-remove checkboxes for enrolled students list
  const [checkedEnrollIds, setCheckedEnrollIds] = useState<Set<string>>(new Set());
  const [bulkRemoving, setBulkRemoving] = useState(false);

  // Tick-and-wipe: hard-delete withdrawn students entirely from the system.
  const [checkedWithdrawnIds, setCheckedWithdrawnIds] = useState<Set<string>>(new Set());
  const [hardDeleting, setHardDeleting] = useState(false);

  // Create-new-class inside enrol modal
  const [programsList, setProgramsList] = useState<any[]>([]);
  const [schoolsList, setSchoolsList] = useState<any[]>([]);
  const [newClassForm, setNewClassForm] = useState({ name: '', program_id: '', school_id: '', max_students: '' });
  const [creatingNewClass, setCreatingNewClass] = useState(false);
  const [transferRequests, setTransferRequests] = useState<any[]>([]);
  const [transferCandidate, setTransferCandidate] = useState<any | null>(null);
  const [showBulkTransferModal, setShowBulkTransferModal] = useState(false);
  const [transferReason, setTransferReason] = useState('');
  const [transferBusy, setTransferBusy] = useState<string | null>(null);
  const [declineCandidate, setDeclineCandidate] = useState<any | null>(null);
  const [declineNote, setDeclineNote] = useState('');

  const [editingSession, setEditingSession] = useState<any>(null);
  const [sessionForm, setSessionForm] = useState({ topic: '', session_date: '', start_time: '', end_time: '', notes: '' });
  const [savingSession, setSavingSession] = useState(false);
  const [pathClassMode, setPathClassMode] = useState<'full' | 'milestone'>('full');
  const [pathStudentModes, setPathStudentModes] = useState<Record<string, 'inherit' | 'full' | 'milestone'>>({});
  const [pathVisibilitySaving, setPathVisibilitySaving] = useState<string | null>(null);
  const [showPathOverrides, setShowPathOverrides] = useState(false);
  const [showStudentList, setShowStudentList] = useState(false);

  const [programCourses, setProgramCourses] = useState<any[]>([]);
  const [updatingCourseFocus, setUpdatingCourseFocus] = useState(false);

  const handleSaveCourseFocus = async (courseId: string | null) => {
    setUpdatingCourseFocus(true);
    try {
      const res = await fetch(`/api/classes/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ current_course_id: courseId }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to update');
      setCls((prev: any) => prev ? { ...prev, current_course_id: courseId } : null);
    } catch (e: any) {
      alert(e.message || 'Failed to update course focus');
    } finally {
      setUpdatingCourseFocus(false);
    }
  };

  // Broadcast State
  const [showBroadcastModal, setShowBroadcastModal] = useState(false);
  const [broadcastForm, setBroadcastForm] = useState({ text: '', mediaUrl: '', use_template: false, template_name: '', template_variables: '' });
  const [broadcasting, setBroadcasting] = useState(false);
  const [reachableStudents, setReachableStudents] = useState<any[]>([]);
  const [broadcastAudience, setBroadcastAudience] = useState<any | null>(null);
  const [loadingReachable, setLoadingReachable] = useState(false);

  const isStaff = profile?.role === 'admin' || profile?.role === 'teacher';
  const isSchool = profile?.role === 'school';
  const canView = isStaff || isSchool;

  const fetchData = async () => {
    if (!id || !profile) return;
    setLoading(true);
    const supabase = createClient();
    try {
      const [clsJson, sessRes] = await Promise.all([
        fetchJsonWithTimeout(`/api/classes/${id}`, { data: null, error: 'Class not found' }, 'class detail record'),
        withTimeout(
          supabase.from('class_sessions').select('*').eq('class_id', id!).order('session_date', { ascending: false }).limit(10),
          { data: [], error: null },
          'class recent sessions',
        ),
      ]);

      const clsData = clsJson.data as any;
      if (!clsData) throw new Error(String(clsJson.error || 'Class not found'));
      setCls(clsData);
      setSessions(sessRes.data ?? []);
      const destinationJson = await fetchJsonWithTimeout(`/api/classes?mine=true${clsData.school_id ? `&school_id=${clsData.school_id}` : ''}`, { data: [] }, 'destination classes');
      setDestinationClasses((destinationJson.data ?? []).filter((candidate: any) => candidate.id !== id && candidate.status !== 'archived'));

      const program_id = clsData.program_id;
      const studentsRes = await fetchJsonWithTimeout(
        `/api/classes/${id}/students`,
        { students: [], former_students: [] },
        'class students',
      );
      setEnrollments(studentsRes.students ?? []);
      setFormerEnrollments(studentsRes.former_students ?? []);
      setReportIndicatorEnabled((studentsRes as any).report_indicator_enabled !== false);
      if (isStaff) {
        const visJson = await fetchJsonWithTimeout(
          `/api/progression/path-visibility?class_id=${id}`,
          { data: { class_mode: 'full', students: [] } },
          'class path visibility',
        );
        const classMode = (visJson.data?.class_mode ?? 'full') as 'full' | 'milestone';
        setPathClassMode(classMode);
        const nextModes: Record<string, 'inherit' | 'full' | 'milestone'> = {};
        for (const row of ((visJson.data?.students ?? []) as any[])) {
          const mode = row.mode === 'full' || row.mode === 'milestone' ? row.mode : 'inherit';
          nextModes[row.student_id] = mode;
        }
        setPathStudentModes(nextModes);
      }

      // Only fetch program-related data if program_id exists
      if (program_id) {
        let cbtQuery = supabase
          .from('cbt_exams')
          .select('id, title, duration_minutes, total_questions, is_active, school_id, metadata')
          .eq('program_id', program_id);
        if (clsData.school_id) {
          cbtQuery = cbtQuery.eq('school_id', clsData.school_id);
        } else {
          cbtQuery = cbtQuery.is('school_id', null);
        }

        const [lessonRes, asgnRes, cbtRes, coursesRes] = await withTimeout(Promise.all([
          supabase.from('lessons').select('id, title, lesson_type, status, courses!inner(program_id)').eq('courses.program_id', program_id),
          supabase.from('assignments').select('id, title, assignment_type, due_date, max_points, course_id, class_id, metadata, courses!inner(program_id)').eq('courses.program_id', program_id),
          cbtQuery,
          supabase.from('courses').select('id, title').eq('program_id', program_id).eq('is_active', true).order('level_order', { ascending: true })
        ]), [{ data: [] }, { data: [] }, { data: [] }, { data: [] }], 'class learning artifacts');

        const assignments = (asgnRes.data ?? []).filter((assignment: any) => {
          const targetClassId = assignment.metadata?.target_class_id || assignment.class_id;
          return targetClassId === id;
        });
        const assignmentIds = assignments.map((a: any) => a.id);
        const cbtExams = (cbtRes.data ?? []).filter((exam: any) => {
          const targetClassId = exam.metadata?.target_class_id;
          return !targetClassId || targetClassId === id;
        });
        const cbtIds = cbtExams.map((e: any) => e.id);

        let submissions: any[] = [];
        let cbtSessions: any[] = [];

        const subQueries: any[] = [];
        if (assignmentIds.length > 0) {
          subQueries.push(supabase.from('assignment_submissions').select('id, assignment_id, portal_user_id, user_id, grade, status').in('assignment_id', assignmentIds));
        }
        if (cbtIds.length > 0) {
          subQueries.push(supabase.from('cbt_sessions').select('id, exam_id, user_id, score, status').in('exam_id', cbtIds));
        }

        const subResults = await withTimeout(Promise.all(subQueries), [], 'class submission summaries');
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
        setProgramCourses(coursesRes.data ?? []);
      } else {
        // No program_id, set empty items
        setItems({
          lessons: [],
          assignments: [],
          cbt: [],
          submissions: [],
          cbtSessions: []
        });
        setProgramCourses([]);
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const saveClassPathMode = async (mode: 'full' | 'milestone') => {
    setPathVisibilitySaving('class');
    try {
      const res = await fetch('/api/progression/path-visibility', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ class_id: id, mode }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to save');
      setPathClassMode(mode);
    } catch (e: any) {
      alert(e.message ?? 'Failed to save class visibility mode');
    } finally {
      setPathVisibilitySaving(null);
    }
  };

  const saveStudentPathMode = async (studentId: string, mode: 'inherit' | 'full' | 'milestone') => {
    setPathVisibilitySaving(studentId);
    try {
      const res = await fetch('/api/progression/path-visibility', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ student_id: studentId, mode }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to save');
      setPathStudentModes((prev) => ({ ...prev, [studentId]: mode }));
    } catch (e: any) {
      alert(e.message ?? 'Failed to save student visibility mode');
    } finally {
      setPathVisibilitySaving(null);
    }
  };

  const loadTransferRequests = async () => {
    if (!profile || !['admin', 'teacher'].includes(profile.role)) return;
    try {
      const res = await fetch('/api/student-transfer-requests', { cache: 'no-store' });
      const json = await res.json();
      if (res.ok) setTransferRequests(json.requests ?? []);
    } catch { /* non-blocking panel */ }
  };

  const submitTransferRequest = async () => {
    if (!transferCandidate || transferReason.trim().length < 10) return;
    setTransferBusy(transferCandidate.id);
    try {
      const res = await fetch('/api/student-transfer-requests', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ student_id: transferCandidate.id, to_class_id: id, reason: transferReason.trim() }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to request transfer');
      setTransferCandidate(null); setTransferReason('');
      await Promise.all([loadTransferRequests(), loadAvailableStudents()]);
    } catch (e: any) { alert(e.message); }
    finally { setTransferBusy(null); }
  };

  const submitAllTransferRequests = async () => {
    const students = availableStudents.filter((student: any) => student.requires_transfer_request && !student.pending_transfer_request_id);
    if (students.length === 0 || transferReason.trim().length < 10) return;
    setTransferBusy('bulk');
    const failures: string[] = [];
    let sent = 0;
    try {
      for (const student of students) {
        try {
          const res = await fetch('/api/student-transfer-requests', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ student_id: student.id, to_class_id: id, reason: transferReason.trim() }),
          });
          const json = await res.json();
          if (!res.ok) throw new Error(json.error || 'Failed to request transfer');
          sent += 1;
        } catch (error: any) { failures.push(`${student.full_name}: ${error?.message || 'failed'}`); }
      }
      setShowBulkTransferModal(false);
      setTransferReason('');
      await Promise.all([loadTransferRequests(), loadAvailableStudents()]);
      if (failures.length) alert(`${sent} request(s) sent. ${failures.length} failed:\n${failures.join('\n')}`);
      else alert(`${sent} transfer request${sent === 1 ? '' : 's'} sent successfully.`);
    } finally { setTransferBusy(null); }
  };
  const decideTransfer = async (requestId: string, decision: 'approve' | 'decline', note: string | null = null) => {
    setTransferBusy(requestId);
    try {
      const res = await fetch('/api/student-transfer-requests', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ request_id: requestId, decision, note }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || ('Failed to ' + decision + ' transfer'));
      setDeclineCandidate(null); setDeclineNote('');
      await Promise.all([loadTransferRequests(), fetchData()]);
    } catch (e: any) { alert(e.message); }
    finally { setTransferBusy(null); }
  };
  useEffect(() => {
    if (authLoading) return;
    if (profile && id) { fetchData(); void loadTransferRequests(); }
    else setLoading(false);
  }, [id, profile?.id, authLoading]);

  const loadAvailableStudents = async () => {
    if (!cls) return;
    setProcessingStudent('loading');
    setEnrolMode('current');
    try {
      const [enrollJson, progJson, schJson] = await Promise.all([
        fetchJsonWithTimeout(`/api/classes/${id}/enroll`, { students: [], error: null }, 'class enrollable students'),
        programsList.length === 0 ? fetchJsonWithTimeout('/api/programs?is_active=true', { data: [] }, 'class enrol programs') : Promise.resolve(null),
        schoolsList.length === 0 ? fetchJsonWithTimeout('/api/schools', { data: [] }, 'class enrol schools') : Promise.resolve(null),
      ]);
      if (enrollJson.error) throw new Error(String(enrollJson.error));
      setAvailableStudents(enrollJson.students ?? []);
      setSelectedStudentIds(new Set());
      if (progJson) setProgramsList(progJson.data ?? []);
      if (schJson) setSchoolsList(schJson.data ?? []);
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
      : availableStudents.filter((s: any) => !s.requires_transfer_request).map((s: any) => s.id));
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
      // Surface silent drops — otherwise a student you "added" simply never appears.
      const msg = enrollSkipMessage(json, ids.length);
      if (msg) alert(msg);
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
      const body: any = { name: newClassForm.name.trim(), program_id: newClassForm.program_id, status: 'active', teacher_id: profile?.role === 'teacher' ? profile.id : cls.teacher_id, school_id: newClassForm.school_id || cls.school_id };
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
      const skip = enrollSkipMessage(enrolJson, selectedStudentIds.size);
      alert(`Class "${clsJson.data.name}" created — ${enrolJson.enrolled ?? selectedStudentIds.size} student${(enrolJson.enrolled ?? selectedStudentIds.size) !== 1 ? 's' : ''} enrolled.${skip ? `\n\n${skip}` : ''}`);
    } catch (e: any) {
      alert(e.message ?? 'Failed');
    } finally {
      setCreatingNewClass(false);
    }
  };

  const beginEditIdentity = (s: any) => {
    setEditingStudentId(s.id);
    setEditName(s.full_name || '');
    setEditGrade(s.grade || '');
  };

  // Save a corrected name/grade. The endpoint cleans the name, normalises the grade, and
  // round-trips both to portal_users (source of truth), the students shadow, and auth.
  const saveIdentity = async (studentId: string) => {
    if (!editName.trim()) { alert('Name cannot be empty'); return; }
    setSavingIdentity(true);
    try {
      const res = await fetch(`/api/portal-users/${studentId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ full_name: editName.trim(), grade: editGrade || null }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Failed to save');
      setEditingStudentId(null);
      await fetchData();
    } catch (e: any) {
      alert(e.message);
    } finally {
      setSavingIdentity(false);
    }
  };

  const moveStudentToClass = async (student: any, destinationClassId: string) => {
    if (!destinationClassId || destinationClassId === id) return;
    const destination = destinationClasses.find((candidate: any) => candidate.id === destinationClassId);
    if (!destination) return;
    const term = destination.academic_terms ? `${destination.academic_terms.term_label} ${destination.academic_terms.academic_year}` : 'its assigned term';
    if (!window.confirm(`Move ${student.full_name} to ${destination.name} (${term})? This updates the official grade, section and term roster.`)) return;
    setMovingStudent(student.id);
    try {
      const res = await fetch(`/api/classes/${destinationClassId}/enroll`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ studentId: student.id }) });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to move student');
      await fetchData();
    } catch (error: any) {
      alert(error.message || 'Failed to move student. If another teacher owns the destination, use Transfer for approval.');
    } finally { setMovingStudent(null); }
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

  const toggleWithdrawn = (studentId: string) => {
    setCheckedWithdrawnIds(prev => {
      const next = new Set(prev);
      if (next.has(studentId)) next.delete(studentId); else next.add(studentId);
      return next;
    });
  };

  // Permanently wipe the given (or ticked) withdrawn students from the whole system.
  const bulkHardDelete = async (confirmDestroy = false, idsArg?: string[]) => {
    const ids = idsArg ?? [...checkedWithdrawnIds];
    if (ids.length === 0) return;
    if (!confirmDestroy && !confirm(`Permanently delete ${ids.length} withdrawn student${ids.length > 1 ? 's' : ''} from the ENTIRE system?\n\nThis erases their account, records and history everywhere. This cannot be undone.`)) return;
    setHardDeleting(true);
    try {
      const res = await fetch('/api/portal-users/bulk-delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids, confirmDestroy, classId: id }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Failed to delete');

      // Some accounts hold paid cards / published reports — confirm a second time to wipe those.
      if (Array.isArray(json.needsConfirmation) && json.needsConfirmation.length > 0) {
        const lines = json.needsConfirmation.map((n: any) => `• ${n.name}: ${n.valuables?.summary ?? 'has records'}`).join('\n');
        if (confirm(`${json.deleted?.length ?? 0} deleted.\n\nThese still hold PAID cards or PUBLISHED reports:\n\n${lines}\n\nDelete these too — permanently?`)) {
          const flaggedIds = json.needsConfirmation.map((n: any) => n.id);
          await fetchData();
          await bulkHardDelete(true, flaggedIds); // force-wipe only the flagged ones
          return;
        }
      }
      if (Array.isArray(json.blocked) && json.blocked.length > 0) {
        alert(`${json.deleted?.length ?? 0} deleted. ${json.blocked.length} skipped:\n\n${json.blocked.map((b: any) => `• ${b.reason}`).join('\n')}`);
      }
      setCheckedWithdrawnIds(new Set());
      await fetchData();
    } catch (e: any) {
      alert(e.message);
    } finally {
      setHardDeleting(false);
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

  const loadReachableStudents = async () => {
    if (!id) return;
    setLoadingReachable(true);
    try {
      const res = await fetch(`/api/classes/${id}/broadcast`, { cache: 'no-store' });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Could not resolve WhatsApp audience');
      const eligible = new Set<string>(json.eligible_student_ids ?? []);
      setReachableStudents(enrollments.filter((student: any) => eligible.has(student.id || student.portal_user_id)));
      setBroadcastAudience(json);
    } catch (error) {
      console.error('Error loading WhatsApp audience:', error);
      setReachableStudents([]);
      setBroadcastAudience(null);
    } finally {
      setLoadingReachable(false);
    }
  };
  const handleBroadcast = async () => {
    if (!broadcastForm.text.trim()) return;
    setBroadcasting(true);
    try {
        const res = await fetch(`/api/classes/${id}/broadcast`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...broadcastForm, template_variables: broadcastForm.template_variables.split(',').map(v => v.trim()).filter(Boolean) })
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || 'Failed to broadcast');
        
        // Show detailed success message with actual counts
        const message = json.message || `WhatsApp broadcast sent to ${json.messages_sent || json.queued} students`;
        alert(message);
        
        setShowBroadcastModal(false);
        setBroadcastForm({ text: '', mediaUrl: '', use_template: false, template_name: '', template_variables: '' });
        setReachableStudents([]);
    } catch (err: any) {
        alert(err.message);
    } finally {
        setBroadcasting(false);
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

  if (authLoading || loading) return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin" />
        <p className="text-muted-foreground text-sm">Loading class...</p>
      </div>
    </div>
  );

  if (!canView) return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="bg-card shadow-sm border border-border rounded-xl p-8 text-center max-w-sm">
        <ExclamationTriangleIcon className="w-12 h-12 text-rose-500/40 mx-auto mb-4" />
        <p className="text-muted-foreground text-sm">You need staff access to view this page.</p>
      </div>
    </div>
  );

  if (error || !cls) return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-6">
      <div className="w-16 h-16 bg-rose-500/10 flex items-center justify-center border border-rose-500/20">
        <ExclamationTriangleIcon className="w-8 h-8 text-rose-400" />
      </div>
      <div className="text-center space-y-2">
        <p className="text-rose-400 font-bold text-sm">{error ?? 'Class not found'}</p>
        <p className="text-muted-foreground text-xs">The class could not be loaded.</p>
      </div>
      <Link href="/dashboard/classes" className="px-6 py-2.5 bg-card shadow-sm hover:bg-muted border border-border rounded-xl text-sm font-bold transition-all">
        Back to Classes
      </Link>
    </div>
  );

  const termLabel = cls.academic_terms
    ? `${cls.academic_terms.term_label} ${cls.academic_terms.academic_year}`
    : cls.term_id
      ? 'Current class term'
      : 'No term assigned';
  const currentTermStudents = enrollments.filter((student: any) => student.is_current_term_active !== false);
  const inactiveTermStudents = [
    ...enrollments.filter((student: any) => student.is_current_term_active === false),
    ...formerEnrollments,
  ];

  // ── Band-fit health: the class name's last segment is its grade band ("Basic 1-3").
  //    A student is "off-band" when their canonical grade parses to a real level/number the
  //    class band does not cover. The grade comes from the clean portal_users.grade column;
  //    section_class is only a legacy fallback. Unparseable grades are never flagged. ──
  const classBand = parseBandLabel(cls.name?.split('·').pop()?.trim());
  const studentGrade = (student: any) => student.grade || student.section_class;
  const isOffBand = (student: any): boolean => {
    if (!classBand) return false;
    const g = studentGrade(student);
    if (!parseGrade(g)) return false; // unknown grade — don't flag
    return !bandCoversGrade(classBand, g);
  };
  const offBandCount = currentTermStudents.filter(isOffBand).length;
  // Progress-report coverage — how many active students have a PUBLISHED report (the rest
  // "need attention"). Powers the roster summary + per-student indicator.
  const reportedCount = currentTermStudents.filter((s: any) => s.has_published_report).length;
  const needsReportCount = currentTermStudents.length - reportedCount;

  // ── Roster search: filter both active and historical lists by name/email. ──
  const rosterQ = rosterSearch.trim().toLowerCase();
  const matchesRoster = (student: any) =>
    (!rosterQ ||
      (student.full_name ?? '').toLowerCase().includes(rosterQ) ||
      (student.email ?? '').toLowerCase().includes(rosterQ)) &&
    (!showNeedsReportOnly || !student.has_published_report);
  // Un-reported students float to the top so what needs attention is seen first.
  const byNeedsReport = (a: any, b: any) => (a.has_published_report === b.has_published_report ? 0 : a.has_published_report ? 1 : -1);
  const visibleCurrent = currentTermStudents.filter(matchesRoster).slice().sort(byNeedsReport);
  const visibleInactive = inactiveTermStudents.filter(matchesRoster);
  const rosterShowSearch = currentTermStudents.length + inactiveTermStudents.length > 6;
  const latestSession = sessions[0] ?? null;
  const openAssignments = items.assignments.filter((assignment: any) => {
    if (!assignment.due_date) return true;
    return new Date(assignment.due_date).getTime() >= Date.now();
  }).length;
  const activeExamCount = items.cbt.filter((exam: any) => exam.is_active).length;
  const gradedSubmissionCount = items.submissions.filter((submission: any) => submission.grade !== null && submission.grade !== undefined).length + items.cbtSessions.filter((session: any) => session.score !== null && session.score !== undefined).length;
  const operationCards = [
    {
      id: 'roster' as const,
      title: 'Roster',
      desc: 'Students, reinstatement, term movement',
      icon: UserGroupIcon,
      stat: `${currentTermStudents.length} active`,
      tone: 'text-primary',
    },
    {
      id: 'teaching' as const,
      title: 'Teaching',
      desc: 'Lessons, course focus, class sessions',
      icon: BookOpenIcon,
      stat: `${items.lessons.length} lessons`,
      tone: 'text-cyan-400',
    },
    {
      id: 'assessment' as const,
      title: 'Assessment',
      desc: 'Assignments, CBT, grades and reports',
      icon: ChartBarIcon,
      stat: `${openAssignments + activeExamCount} open`,
      tone: 'text-amber-400',
    },
    {
      id: 'communication' as const,
      title: 'Communication',
      desc: 'Attendance, broadcast, parent updates',
      icon: ClipboardDocumentCheckIcon,
      stat: `${sessions.length} sessions`,
      tone: 'text-emerald-400',
    },
  ];
  const selectedOperation = operationCards.find(card => card.id === activeOperation) ?? operationCards[0];
  const pendingIncomingTransfers = transferRequests.filter((request: any) => request.status === 'pending' && (profile?.role === 'admin' || request.from_teacher_id === profile?.id));
  const pendingOutgoingTransfers = profile?.role === 'admin' ? [] : transferRequests.filter((request: any) => request.status === 'pending' && request.requested_by === profile?.id);

  return (
    <div className="text-foreground">
      <div className="space-y-6 pb-20">

        {/* ── Class Operations Canvas ────────────────────────────────────────── */}
        <div className="overflow-hidden rounded-3xl border border-border bg-card shadow-sm">
          <div className="border-b border-border bg-gradient-to-br from-primary/10 via-background to-background p-5 sm:p-6">
            <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
              <div className="min-w-0">
                <div className="flex items-center gap-2 mb-3">
                  <button onClick={() => router.back()} className="p-1.5 hover:bg-muted rounded-xl transition-colors">
                    <ArrowLeftIcon className="w-4 h-4 text-muted-foreground" />
                  </button>
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-[10px] font-black uppercase tracking-widest text-primary">
                    <AcademicCapIcon className="w-3.5 h-3.5" />
                    My Class Workspace
                  </span>
                  <span className={`rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-widest ${
                    cls.status === 'active' ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400' :
                    cls.status === 'scheduled' ? 'border-amber-500/30 bg-amber-500/10 text-amber-400' :
                    'border-border bg-background text-muted-foreground'
                  }`}>
                    {cls.status}
                  </span>
                </div>
                <h1 className="text-2xl sm:text-4xl font-black tracking-tight text-foreground">{cls.name}</h1>
                <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
                  {cls.programs?.name ?? 'No programme'} · {termLabel} · {cls.portal_users?.full_name ?? 'Teacher not assigned'}
                </p>
              </div>

              {isStaff && (
                <div className="grid grid-cols-2 sm:flex sm:flex-wrap gap-2 lg:justify-end">
                  <Link href={`/dashboard/classes/${id}/edit`}
                    className="inline-flex items-center justify-center gap-2 rounded-xl border border-border bg-background px-4 py-2.5 text-xs font-black text-foreground transition-colors hover:border-primary/40 hover:bg-muted">
                    <PencilIcon className="w-4 h-4 text-primary" /> Setup
                  </Link>
                  <button
                    onClick={() => { setShowBroadcastModal(true); loadReachableStudents(); }}
                    className="inline-flex items-center justify-center gap-2 rounded-xl border border-emerald-500/25 bg-emerald-500/10 px-4 py-2.5 text-xs font-black text-emerald-400 transition-colors hover:bg-emerald-500 hover:text-white">
                    Broadcast
                  </button>
                  <Link href={`/dashboard/attendance?class_id=${id}`}
                    className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-xs font-black text-primary-foreground shadow-lg shadow-primary/20 transition-transform hover:-translate-y-0.5">
                    <ClipboardDocumentCheckIcon className="w-4 h-4" /> Attendance
                  </Link>
                </div>
              )}
            </div>

            <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
              {[
                { label: 'Active Students', value: currentTermStudents.length, hint: `${cls.max_students ?? '∞'} capacity`, tone: 'text-primary' },
                { label: 'Historical', value: inactiveTermStudents.length, hint: 'paused / former', tone: 'text-amber-400' },
                { label: 'Open Work', value: openAssignments + activeExamCount, hint: 'assignments + exams', tone: 'text-emerald-400' },
                { label: 'Marked Grades', value: gradedSubmissionCount, hint: 'submissions scored', tone: 'text-cyan-400' },
              ].map(metric => (
                <div key={metric.label} className="rounded-2xl border border-border bg-background/70 p-4">
                  <p className={`text-2xl font-black ${metric.tone}`}>{metric.value}</p>
                  <p className="mt-1 text-[10px] font-black uppercase tracking-widest text-muted-foreground">{metric.label}</p>
                  <p className="mt-1 text-[11px] text-muted-foreground">{metric.hint}</p>
                </div>
              ))}
            </div>
          </div>

          {cls?.max_students > 0 && currentTermStudents.length >= cls?.max_students && (
            <div className="border-b border-rose-500/20 bg-rose-500/10 px-5 py-3 text-sm font-semibold text-rose-400">
              Class capacity has been reached. Move students to another class or increase capacity before adding more.
            </div>
          )}

          <div className="grid gap-0 lg:grid-cols-[280px_1fr]">
            <div className="border-b border-border bg-muted/20 p-4 lg:border-b-0 lg:border-r">
              <p className="mb-3 text-[10px] font-black uppercase tracking-widest text-muted-foreground">Choose work mode</p>
              <div className="grid grid-cols-2 gap-2 lg:grid-cols-1">
                {operationCards.map(card => (
                  <button
                    key={card.id}
                    onClick={() => setActiveOperation(card.id)}
                    className={`rounded-2xl border p-3 text-left transition-all ${
                      activeOperation === card.id
                        ? 'border-primary/40 bg-primary/10 shadow-sm'
                        : 'border-border bg-background hover:border-primary/20 hover:bg-muted'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-card border border-border">
                        <card.icon className={`h-4 w-4 ${card.tone}`} />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-black text-foreground">{card.title}</p>
                        <p className="truncate text-[10px] text-muted-foreground">{card.stat}</p>
                      </div>
                    </div>
                    <p className="mt-2 line-clamp-2 text-[11px] text-muted-foreground">{card.desc}</p>
                  </button>
                ))}
              </div>
            </div>

            <div className="min-h-[320px] p-5 sm:p-6">
              <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Operations Canvas</p>
                  <h2 className="mt-1 text-xl font-black text-foreground">{selectedOperation.title}</h2>
                  <p className="mt-1 text-sm text-muted-foreground">{selectedOperation.desc}</p>
                </div>
                <span className="rounded-full border border-border bg-background px-3 py-1 text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                  {termLabel}
                </span>
              </div>

              {activeOperation === 'roster' && (
                <div className="rounded-2xl border border-border bg-background p-4">
                  {(pendingIncomingTransfers.length > 0 || pendingOutgoingTransfers.length > 0) && (
                    <div className="mb-5 space-y-3 rounded-2xl border border-primary/20 bg-primary/5 p-4">
                      <div><h3 className="text-sm font-black text-foreground">Student transfer requests</h3><p className="text-xs text-muted-foreground">Moves happen only after the current owning teacher approves.</p></div>
                      {pendingIncomingTransfers.map((request: any) => (
                        <div key={request.id} className="rounded-xl border border-amber-500/20 bg-background p-3">
                          <p className="text-sm font-bold text-foreground">{request.student?.full_name}</p>
                          <p className="mt-1 text-xs text-muted-foreground">{request.requester?.full_name} requests transfer from <strong>{request.from_class?.name}</strong> to <strong>{request.to_class?.name}</strong>.</p>
                          <p className="mt-2 rounded-lg bg-muted px-2 py-1.5 text-xs text-foreground">“{request.reason}”</p>
                          <div className="mt-3 flex gap-2">
                            <button disabled={transferBusy === request.id} onClick={() => decideTransfer(request.id, 'approve')} className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-black text-white disabled:opacity-50">Approve & Move</button>
                            <button disabled={transferBusy === request.id} onClick={() => { setDeclineCandidate(request); setDeclineNote(''); }} className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-1.5 text-xs font-black text-rose-300 disabled:opacity-50">Decline</button>
                          </div>
                        </div>
                      ))}
                      {pendingOutgoingTransfers.map((request: any) => (
                        <div key={request.id} className="flex items-center justify-between gap-3 rounded-xl border border-border bg-background p-3">
                          <div><p className="text-sm font-bold text-foreground">{request.student?.full_name}</p><p className="text-xs text-muted-foreground">Awaiting {request.from_teacher?.full_name} · {request.from_class?.name} → {request.to_class?.name}</p></div>
                          <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-1 text-[9px] font-black uppercase text-amber-300">Pending</span>
                        </div>
                      ))}
                    </div>
                  )}
                  {/* One consolidated roster: active + withdrawn (badged), searchable, with
                      inline per-row Move / Withdraw / Reinstate so no shuttling between pages. */}
                  <div className="mb-4 space-y-3">
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                      <div>
                        <h3 className="text-sm font-black text-foreground">Class Roster</h3>
                        <p className="text-xs text-muted-foreground">
                          {currentTermStudents.length} active
                          {inactiveTermStudents.length ? ` · ${inactiveTermStudents.length} withdrawn` : ''}
                          {offBandCount ? <span className="text-amber-400"> · {offBandCount} off-band</span> : ''}
                          {reportIndicatorEnabled && currentTermStudents.length > 0 && (
                            <span className={needsReportCount ? 'text-amber-400' : 'text-emerald-400'}>
                              {' · '}{reportedCount}/{currentTermStudents.length} reports{' '}
                              {needsReportCount ? (
                                <button
                                  onClick={() => setShowNeedsReportOnly(v => !v)}
                                  className={`underline decoration-dotted underline-offset-2 ${showNeedsReportOnly ? 'font-black text-amber-300' : ''}`}
                                  title="Show only students who still need a report"
                                >
                                  · {needsReportCount} need one{showNeedsReportOnly ? ' (filtered — tap to clear)' : ''}
                                </button>
                              ) : ' ✓'}
                            </span>
                          )}
                        </p>
                      </div>
                      {isStaff && (
                        <div className="flex items-center gap-2 flex-wrap">
                          <Link href={`/dashboard/classes/transfer?from=${id}`} className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-card px-3 py-2 text-xs font-black text-foreground hover:border-primary/50 transition-colors">
                            <ArrowsRightLeftIcon className="h-3.5 w-3.5 text-primary" /> Transfer / Move
                          </Link>
                          <Link href={`/dashboard/classes/transfer-requests?class=${id}`} className="inline-flex items-center gap-1.5 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs font-black text-amber-400 hover:bg-amber-500/20 transition-colors">
                            <ArrowsRightLeftIcon className="h-3.5 w-3.5" /> Ownership Requests
                          </Link>
                          <button onClick={() => { setShowStudentModal(true); loadAvailableStudents(); }} className="rounded-xl bg-primary px-3 py-2 text-xs font-black text-primary-foreground">
                            Add Students
                          </button>
                        </div>
                      )}
                    </div>
                    {rosterShowSearch && (
                      <div className="relative">
                        <MagnifyingGlassIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                        <input
                          value={rosterSearch}
                          onChange={(e) => setRosterSearch(e.target.value)}
                          placeholder="Search this class…"
                          className="w-full rounded-xl border border-border bg-card py-2 pl-9 pr-3 text-sm text-foreground outline-none focus:border-primary/50"
                        />
                      </div>
                    )}
                  </div>

                  {currentTermStudents.length === 0 && inactiveTermStudents.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-border p-8 text-center">
                      <UserGroupIcon className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
                      <p className="text-sm font-semibold text-muted-foreground">No students in this class yet.</p>
                    </div>
                  ) : visibleCurrent.length === 0 && visibleInactive.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-border p-8 text-center">
                      <p className="text-sm font-semibold text-muted-foreground">No students match “{rosterSearch}”.</p>
                    </div>
                  ) : (
                    <div className="max-h-[60vh] overflow-y-auto grid gap-2 xl:grid-cols-2 pr-1">
                      {visibleCurrent.map((student: any) => {
                        const offBand = isOffBand(student);
                        if (editingStudentId === student.id) {
                          const gradeOpts = Array.from(new Set([
                            ...(editGrade && !(SINGLE_GRADES as readonly string[]).includes(editGrade) ? [editGrade] : []),
                            ...SINGLE_GRADES,
                          ]));
                          return (
                            <div key={student.id} className="rounded-xl border border-primary/40 bg-primary/5 p-3 space-y-2 xl:col-span-2">
                              <div className="flex flex-col sm:flex-row gap-2">
                                <input
                                  value={editName}
                                  onChange={(e) => setEditName(e.target.value)}
                                  placeholder="Full name"
                                  className="flex-1 rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50"
                                />
                                <select
                                  value={editGrade}
                                  onChange={(e) => setEditGrade(e.target.value)}
                                  title="Grade (separate from the class/section)"
                                  className="rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50"
                                >
                                  <option value="">No grade</option>
                                  {gradeOpts.map((g) => <option key={g} value={g}>{g}</option>)}
                                </select>
                              </div>
                              <div className="flex items-center justify-between gap-2">
                                <p className="text-[10px] text-muted-foreground">Grade is separate from the class. Saves update the student everywhere — portal, records &amp; login.</p>
                                <div className="flex items-center gap-2 flex-shrink-0">
                                  <button onClick={() => setEditingStudentId(null)} disabled={savingIdentity} className="rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-black text-muted-foreground">Cancel</button>
                                  <button onClick={() => saveIdentity(student.id)} disabled={savingIdentity} className="rounded-lg bg-primary px-3 py-1.5 text-xs font-black text-primary-foreground disabled:opacity-50">{savingIdentity ? 'Saving…' : 'Save'}</button>
                                </div>
                              </div>
                            </div>
                          );
                        }
                        return (
                          <div key={student.id} className="flex items-center gap-3 rounded-xl border border-border bg-card p-3">
                            <div className="relative flex-shrink-0">
                              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-xs font-black text-primary">
                                {(student.full_name ?? '?')[0].toUpperCase()}
                              </div>
                              {/* Green = report published this term · Amber = still needs one. */}
                              {reportIndicatorEnabled && (
                                <span
                                  title={student.has_published_report ? 'Progress report published this term' : student.has_draft_report ? 'Report drafted, not published — needs attention' : 'No report this term — needs attention'}
                                  className={`absolute -bottom-1 -right-1 h-3.5 w-3.5 rounded-full border-2 border-card ${student.has_published_report ? 'bg-emerald-500' : 'bg-amber-500'}`}
                                />
                              )}
                            </div>
                            <div className="min-w-0 flex-1">
                              {/* Name + wrapping badges — badges live OUTSIDE the truncating name so
                                  they never get clipped and can wrap on narrow screens. */}
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className="truncate max-w-full text-sm font-bold text-foreground">{student.full_name}</span>
                                {student.grade && (
                                  <span className="text-[10px] font-black uppercase tracking-wide text-muted-foreground">{student.grade}</span>
                                )}
                                {/* Progress-report indicator (THIS term). Teachers get a one-tap link into
                                    the report builder; schools/others just see the status. Admin-toggleable. */}
                                {reportIndicatorEnabled && (() => {
                                  const label = student.has_published_report ? '✓ Report' : student.has_draft_report ? 'Draft only' : 'Needs report';
                                  const title = student.has_published_report
                                    ? `Progress report published for ${student.report_term ?? 'this term'}`
                                    : student.has_draft_report
                                      ? `Report drafted but NOT published for ${student.report_term ?? 'this term'} — needs attention`
                                      : `No ${student.report_term ?? 'current-term'} progress report yet — needs attention`;
                                  const reportBadgeClass = `inline-flex items-center rounded px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wide ${student.has_published_report ? 'bg-emerald-500/15 text-emerald-400' : 'bg-amber-500/15 text-amber-400'}`;
                                  return isStaff ? (
                                    <Link href={`/dashboard/reports/builder?student=${student.id}&class=${id}${cls.term_id ? `&term=${cls.term_id}` : ''}`} title={`${title} — click to open the report builder`} className={`${reportBadgeClass} hover:brightness-125`} onClick={(e) => e.stopPropagation()}>
                                      {label}
                                    </Link>
                                  ) : (
                                    <span title={title} className={reportBadgeClass}>{label}</span>
                                  );
                                })()}
                                {offBand && (
                                  <span title={`Grade "${studentGrade(student)}" is outside this class band (${classBand?.label}). Move to the matching class.`} className="inline-flex items-center rounded bg-amber-500/15 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wide text-amber-400">
                                    Off-band
                                  </span>
                                )}
                              </div>
                              <p className="truncate text-xs text-muted-foreground">{student.email}</p>
                            </div>
                            {isStaff && (
                              <div className="flex items-center gap-1 flex-shrink-0">
                                <button
                                  onClick={() => beginEditIdentity(student)}
                                  title="Edit name / grade"
                                  className="rounded-lg border border-border bg-background p-1.5 text-muted-foreground hover:text-foreground hover:border-primary/50 transition-colors"
                                >
                                  <PencilSquareIconOutline className="h-3.5 w-3.5" />
                                </button>
                                <select aria-label={`Change grade or section for ${student.full_name}`} value="" disabled={movingStudent === student.id} onChange={(event) => void moveStudentToClass(student, event.target.value)} className="max-w-[12rem] rounded-lg border border-border bg-background px-2 py-1.5 text-[10px] font-black text-foreground outline-none hover:border-primary/50 disabled:opacity-50 sm:max-w-[15rem]">
                                  <option value="">{movingStudent === student.id ? 'Moving…' : 'Change grade / section'}</option>
                                  {destinationClasses.map((destination: any) => <option key={destination.id} value={destination.id}>{destination.qa_grade_key || 'Grade'} · {destination.name}{destination.academic_terms ? ` · ${destination.academic_terms.term_label} ${destination.academic_terms.academic_year}` : ''}</option>)}
                                </select>
                                <Link href={`/dashboard/classes/transfer?from=${id}&student=${student.id}`} title="Request a move to a class owned by another teacher" className="rounded-lg border border-border bg-background px-2 py-1.5 text-[10px] font-black uppercase tracking-wide text-foreground hover:border-primary/50 transition-colors">Transfer</Link>
                                <button
                                  onClick={() => removeStudent(student.id)}
                                  disabled={processingStudent === student.id}
                                  title="Withdraw from this class (keeps class history)"
                                  className="rounded-lg border border-amber-500/20 bg-amber-500/5 px-2 py-1.5 text-[10px] font-black uppercase tracking-wide text-amber-400 hover:bg-amber-500/10 disabled:opacity-50 transition-colors"
                                >
                                  {processingStudent === student.id ? '…' : 'Withdraw'}
                                </button>
                              </div>
                            )}
                          </div>
                        );
                      })}
                      {/* Tick-and-wipe bar for withdrawn students — select then permanently delete everywhere. */}
                      {isStaff && visibleInactive.length > 0 && (
                        <div className="sticky top-0 z-10 flex flex-col gap-2 rounded-xl border border-amber-500/25 bg-amber-500/5 p-2.5 sm:flex-row sm:items-center sm:justify-between backdrop-blur supports-[backdrop-filter]:bg-amber-500/10">
                          <label className="flex items-center gap-2 text-[11px] font-bold text-amber-300/90 cursor-pointer select-none">
                            <input
                              type="checkbox"
                              className="h-4 w-4 accent-red-600"
                              checked={checkedWithdrawnIds.size > 0 && visibleInactive.every((s: any) => checkedWithdrawnIds.has(s.id))}
                              ref={el => { if (el) el.indeterminate = checkedWithdrawnIds.size > 0 && !visibleInactive.every((s: any) => checkedWithdrawnIds.has(s.id)); }}
                              onChange={e => {
                                if (e.target.checked) setCheckedWithdrawnIds(new Set(visibleInactive.map((s: any) => s.id)));
                                else setCheckedWithdrawnIds(new Set());
                              }}
                            />
                            {checkedWithdrawnIds.size > 0 ? `${checkedWithdrawnIds.size} selected` : 'Select withdrawn to delete'}
                          </label>
                          <button
                            onClick={() => bulkHardDelete(false)}
                            disabled={checkedWithdrawnIds.size === 0 || hardDeleting}
                            className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-red-500/40 bg-red-600/15 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-red-300 hover:bg-red-600/25 disabled:opacity-40 transition-colors"
                          >
                            <TrashIcon className="h-3.5 w-3.5" />
                            {hardDeleting ? 'Wiping…' : 'Hard delete selected'}
                          </button>
                        </div>
                      )}
                      {visibleInactive.map((student: any) => (
                        <div key={`${student.id}-${student.roster_status ?? 'former'}`} className={`flex items-center gap-3 rounded-xl border p-3 transition-colors ${checkedWithdrawnIds.has(student.id) ? 'border-red-500/40 bg-red-500/10' : 'border-amber-500/20 bg-amber-500/5'}`}>
                          {isStaff && (
                            <input
                              type="checkbox"
                              className="h-4 w-4 accent-red-600 flex-shrink-0"
                              checked={checkedWithdrawnIds.has(student.id)}
                              onChange={() => toggleWithdrawn(student.id)}
                              title="Select for permanent deletion"
                            />
                          )}
                          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-500/10 text-xs font-black text-amber-400 flex-shrink-0">
                            {(student.full_name ?? '?')[0].toUpperCase()}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-bold text-foreground">{student.full_name}</p>
                            <p className="text-[11px] font-bold uppercase tracking-wide text-amber-400/80">{student.roster_status ?? 'withdrawn'}</p>
                          </div>
                          {isStaff && (
                            <div className="flex items-center gap-1 flex-shrink-0">
                              <button onClick={() => assignStudent(student.id)} disabled={processingStudent === student.id} className="rounded-lg border border-primary/20 bg-primary/10 px-2.5 py-1.5 text-[10px] font-black uppercase tracking-widest text-primary disabled:opacity-50">
                                {processingStudent === student.id ? '…' : 'Reinstate'}
                              </button>
                              <button
                                onClick={() => bulkHardDelete(false, [student.id])}
                                disabled={hardDeleting}
                                title="Permanently delete this student from the whole system"
                                className="rounded-lg border border-red-500/30 bg-red-600/10 p-1.5 text-red-300 hover:bg-red-600/20 disabled:opacity-40 transition-colors"
                              >
                                <TrashIcon className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {activeOperation === 'teaching' && (
                <div className="grid gap-4 xl:grid-cols-2">
                  <div className="rounded-2xl border border-border bg-background p-4">
                    <h3 className="text-sm font-black text-foreground">Course Focus</h3>
                    <p className="mb-3 mt-1 text-xs text-muted-foreground">Choose the course students should see now.</p>
                    <select
                      value={cls?.current_course_id || ''}
                      onChange={(e) => handleSaveCourseFocus(e.target.value || null)}
                      disabled={!isStaff || updatingCourseFocus || programCourses.length === 0}
                      className="w-full rounded-xl border border-border bg-card px-4 py-2.5 text-sm text-foreground focus:border-primary focus:outline-none disabled:opacity-50"
                    >
                      <option value="">Show all courses</option>
                      {programCourses.map((course: any) => <option key={course.id} value={course.id}>{course.title}</option>)}
                    </select>
                  </div>
                  <div className="rounded-2xl border border-border bg-background p-4">
                    <h3 className="text-sm font-black text-foreground">Next Session</h3>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {latestSession ? `${latestSession.topic ?? 'Session'} · ${new Date(latestSession.session_date).toLocaleDateString()}` : 'No session recorded yet.'}
                    </p>
                    {isStaff && (
                      <button
                        onClick={() => {
                          setEditingSession({ id: 'new', class_id: id });
                          setSessionForm({ topic: '', session_date: new Date().toISOString().split('T')[0], start_time: '09:00', end_time: '11:00', notes: '' });
                        }}
                        className="mt-4 rounded-xl bg-primary px-4 py-2 text-xs font-black text-primary-foreground"
                      >
                        Record Session
                      </button>
                    )}
                  </div>
                </div>
              )}

              {activeOperation === 'assessment' && (
                <div className="grid gap-4 md:grid-cols-3">
                  {[
                    { label: 'Assignments', value: items.assignments.length, action: 'New Assignment', href: `/dashboard/assignments/new?class_id=${id}` },
                    { label: 'CBT Exams', value: items.cbt.length, action: 'New Exam', href: `/dashboard/cbt/new?class_id=${id}${cls?.program_id ? `&program_id=${cls.program_id}` : ''}` },
                    { label: 'Gradebook', value: gradedSubmissionCount, action: 'Open Gradebook', onClick: () => setActiveTab('gradebook') },
                  ].map(card => (
                    <div key={card.label} className="rounded-2xl border border-border bg-background p-4">
                      <p className="text-3xl font-black text-foreground">{card.value}</p>
                      <p className="mt-1 text-[10px] font-black uppercase tracking-widest text-muted-foreground">{card.label}</p>
                      {'href' in card ? (
                        <Link href={card.href as string} className="mt-4 inline-flex rounded-xl border border-border bg-card px-3 py-2 text-xs font-black text-foreground hover:border-primary/40">
                          {card.action}
                        </Link>
                      ) : (
                        <button onClick={card.onClick} className="mt-4 rounded-xl border border-border bg-card px-3 py-2 text-xs font-black text-foreground hover:border-primary/40">
                          {card.action}
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {activeOperation === 'communication' && (
                <div className="grid gap-4 md:grid-cols-2">
                  <Link href={`/dashboard/attendance?class_id=${id}`} className="rounded-2xl border border-border bg-background p-5 transition-colors hover:border-primary/40">
                    <ClipboardDocumentCheckIcon className="mb-4 h-8 w-8 text-primary" />
                    <h3 className="text-sm font-black text-foreground">Attendance Desk</h3>
                    <p className="mt-1 text-xs text-muted-foreground">Mark roll call and review term attendance history.</p>
                  </Link>
                  <button
                    onClick={() => { setShowBroadcastModal(true); loadReachableStudents(); }}
                    className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-5 text-left transition-colors hover:border-emerald-500/40"
                  >
                    <CloudArrowUpIcon className="mb-4 h-8 w-8 text-emerald-400" />
                    <h3 className="text-sm font-black text-foreground">Broadcast Desk</h3>
                    <p className="mt-1 text-xs text-muted-foreground">Send class update to reachable students and parents.</p>
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Detailed Records */}
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Detailed Records</p>
            <h2 className="text-xl font-black text-foreground">Review and manage class records</h2>
          </div>
          <p className="max-w-xl text-xs text-muted-foreground">
            The canvas above is for daily operations. Use these sections when you need full lists, grade matrices, and historical details.
          </p>
        </div>

        {/* Tabs + Content | Sidebar */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

          {/* Main — tabs + content */}
          <div className="lg:col-span-2 space-y-4">

            {/* Tab Bar */}
            <div className="flex items-center overflow-x-auto gap-1.5 p-1.5 bg-white/[0.01] backdrop-blur-md border border-border rounded-2xl no-scrollbar">
              {[
                { id: 'overview', label: 'Overview', icon: UserGroupIcon },
                { id: 'lessons', label: 'Lessons', icon: BookOpenIcon },
                { id: 'assignments', label: 'Assignments', icon: ClipboardDocumentListIcon },
                { id: 'cbt', label: 'CBT Exams', icon: AcademicCapIcon },
                { id: 'gradebook', label: 'Gradebook', icon: ChartBarIcon, staffOnly: true },
              ].filter(tab => !tab.staffOnly || isStaff).map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as any)}
                  className={`flex items-center gap-2 px-4 py-3 rounded-xl text-xs font-black uppercase tracking-wider transition-all duration-300 whitespace-nowrap flex-shrink-0 ${
                    activeTab === tab.id
                      ? 'bg-primary text-foreground shadow-lg shadow-primary/20 scale-[1.02]'
                      : 'text-muted-foreground hover:text-foreground hover:bg-white/5'
                  }`}
                >
                  <tab.icon className="w-4 h-4 flex-shrink-0" />
                  {tab.label}
                </button>
              ))}
            </div>

            {activeTab === 'overview' && (
              <div className="space-y-4">
                {/* Class Info */}
                <div className="bg-card shadow-sm border border-border rounded-xl p-5">
                  <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-widest mb-4">Class Details</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 bg-primary/10 flex items-center justify-center flex-shrink-0">
                        <UserIcon className="w-4 h-4 text-primary" />
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground mb-0.5">Teacher</p>
                        <p className="text-sm font-semibold text-foreground">{cls.portal_users?.full_name ?? 'Not assigned'}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 bg-primary/10 flex items-center justify-center flex-shrink-0">
                        <ClockIcon className="w-4 h-4 text-primary" />
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground mb-0.5">Schedule</p>
                        <p className="text-sm font-semibold text-foreground">{cls.schedule ?? 'Flexible'}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 bg-emerald-500/10 flex items-center justify-center flex-shrink-0">
                        <CalendarIcon className="w-4 h-4 text-emerald-400" />
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground mb-0.5">Class Dates</p>
                        <p className="text-sm font-semibold text-foreground">
                          {cls.start_date ? new Date(cls.start_date).toLocaleDateString() : 'TBD'}
                          {cls.end_date && ` — ${new Date(cls.end_date).toLocaleDateString()}`}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 bg-amber-500/10 flex items-center justify-center flex-shrink-0">
                        <AcademicCapIcon className="w-4 h-4 text-amber-400" />
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground mb-0.5">Programme</p>
                        <p className="text-sm font-semibold text-foreground">{cls.programs?.name ?? 'N/A'}</p>
                      </div>
                    </div>
                  </div>
                  {cls.description && (
                    <div className="mt-4 pt-4 border-t border-border">
                      <p className="text-sm text-muted-foreground leading-relaxed">{cls.description}</p>
                    </div>
                  )}
                </div>

                {isStaff && (
                  <div className="bg-card shadow-sm border border-border rounded-xl p-5 space-y-4">
                    <div>
                      <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Path Visibility Control</h3>
                      <p className="text-xs text-muted-foreground mt-1">
                        Control what students and parents see for learning path progress.
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs font-semibold text-foreground">Class default:</span>
                      <button
                        type="button"
                        onClick={() => saveClassPathMode('full')}
                        disabled={pathVisibilitySaving === 'class'}
                        className={`px-3 py-1.5 text-xs font-bold border rounded-xl transition-colors ${
                          pathClassMode === 'full'
                            ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300'
                            : 'bg-background border-border text-muted-foreground hover:text-foreground'
                        }`}
                      >
                        Full details
                      </button>
                      <button
                        type="button"
                        onClick={() => saveClassPathMode('milestone')}
                        disabled={pathVisibilitySaving === 'class'}
                        className={`px-3 py-1.5 text-xs font-bold border rounded-xl transition-colors ${
                          pathClassMode === 'milestone'
                            ? 'bg-primary/15 border-primary/30 text-violet-300'
                            : 'bg-background border-border text-muted-foreground hover:text-foreground'
                        }`}
                      >
                        Milestone only
                      </button>
                    </div>

                    <div className="border-t border-border pt-3">
                      {(() => {
                        const customised = Object.values(pathStudentModes).filter(m => m && m !== 'inherit').length;
                        return (
                          <>
                            <button
                              type="button"
                              onClick={() => setShowPathOverrides(v => !v)}
                              className="flex items-center justify-between w-full text-left group"
                            >
                              <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest">
                                Per-child override
                                {customised > 0 && (
                                  <span className="ml-2 normal-case tracking-normal text-[10px] text-violet-300 font-semibold">· {customised} customised</span>
                                )}
                              </span>
                              <span className="text-[11px] font-semibold text-muted-foreground group-hover:text-foreground">
                                {showPathOverrides ? 'Hide ▲' : 'Manage ▾'}
                              </span>
                            </button>
                            {showPathOverrides && (
                              enrollments.length === 0 ? (
                                <p className="text-xs text-muted-foreground mt-3">No enrolled students yet.</p>
                              ) : (
                                <div className="space-y-2 mt-3 max-h-80 overflow-y-auto pr-1">
                                  {enrollments.map((student: any) => (
                                    <div key={student.id} className="flex items-center justify-between gap-3 bg-background border border-border rounded-lg px-3 py-2">
                                      <div className="min-w-0">
                                        <p className="text-sm font-semibold text-foreground truncate">{student.full_name ?? 'Student'}</p>
                                        <p className="text-[10px] text-muted-foreground truncate">{student.email ?? ''}</p>
                                      </div>
                                      <select
                                        value={pathStudentModes[student.id] ?? 'inherit'}
                                        onChange={(e) => saveStudentPathMode(student.id, e.target.value as 'inherit' | 'full' | 'milestone')}
                                        disabled={pathVisibilitySaving === student.id}
                                        className="px-2 py-1.5 text-xs bg-card border border-border rounded-lg text-foreground flex-shrink-0"
                                      >
                                        <option value="inherit">Inherit class default</option>
                                        <option value="full">Full details</option>
                                        <option value="milestone">Milestone only</option>
                                      </select>
                                    </div>
                                  ))}
                                </div>
                              )
                            )}
                          </>
                        );
                      })()}
                    </div>
                  </div>
                )}

                {isStaff && (
                  <div className="bg-card shadow-sm border border-border rounded-xl p-5 space-y-4">
                    <div>
                      <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Course Focus Settings</h3>
                      <p className="text-xs text-muted-foreground mt-1">
                        Select a specific course to display to students in this class. All other courses, assignments, and materials will be hidden from their view until unlocked.
                      </p>
                    </div>

                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest block">Active Course Focus</label>
                      <select
                        value={cls?.current_course_id || ''}
                        onChange={(e) => handleSaveCourseFocus(e.target.value || null)}
                        disabled={updatingCourseFocus || programCourses.length === 0}
                        className="w-full px-4 py-2.5 bg-background border border-border rounded-xl text-sm text-foreground focus:outline-none focus:border-primary disabled:opacity-50"
                      >
                        <option value="">Show All Courses (Default)</option>
                        {programCourses.map((c: any) => (
                          <option key={c.id} value={c.id}>
                            {c.title}
                          </option>
                        ))}
                      </select>
                      {programCourses.length === 0 && (
                        <p className="text-[10px] text-rose-400 italic">
                          No active courses found for this program. Assign courses to this program to enable focus locks.
                        </p>
                      )}
                    </div>
                  </div>
                )}

                {/* Recent Sessions */}
                <div className="bg-card shadow-sm border border-border rounded-xl overflow-hidden">
                  <div className="px-5 py-4 border-b border-border flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Recent Sessions</h3>
                      {isStaff && (
                        <button
                          onClick={() => {
                            setEditingSession({ id: 'new', class_id: id });
                            setSessionForm({ topic: '', session_date: new Date().toISOString().split('T')[0], start_time: '09:00', end_time: '11:00', notes: '' });
                          }}
                          className="flex items-center gap-1.5 px-2.5 py-1 bg-primary/10 hover:bg-primary/20 border border-primary/20 rounded-full text-primary text-[10px] font-bold transition-all"
                        >
                          <PlusIcon className="w-3 h-3" /> New Session
                        </button>
                      )}
                    </div>
                    <Link href={`/dashboard/attendance?class_id=${id}`} className="text-xs font-bold text-primary hover:text-primary transition-colors">View Attendance →</Link>
                  </div>
                  {sessions.length === 0 ? (
                    <div className="p-12 text-center flex flex-col items-center justify-center">
                      <CalendarIcon className="w-8 h-8 text-muted-foreground mb-3" />
                      <p className="text-sm text-muted-foreground">No sessions recorded yet.</p>
                    </div>
                  ) : (
                    <div className="divide-y divide-border">
                      {sessions.map(s => (
                        <div key={s.id} className="px-5 py-4 flex items-center gap-4 hover:bg-muted/50 transition-colors group">
                          <div className="w-9 h-9 bg-primary/10 flex items-center justify-center flex-shrink-0">
                            <CalendarIcon className="w-4 h-4 text-primary" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-foreground truncate">{s.topic ?? 'Untitled Session'}</p>
                            <p className="text-xs text-muted-foreground">
                              {new Date(s.session_date).toLocaleDateString()} · {s.start_time || '—'} – {s.end_time || '—'}
                            </p>
                          </div>
                          {s.notes && <p className="text-xs text-muted-foreground italic max-w-[160px] truncate hidden sm:block">{s.notes}</p>}
                          {isStaff && (
                            <div className="flex items-center gap-1 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                              <button onClick={() => handleEditSession(s)} className="p-1.5 hover:bg-muted rounded-xl text-muted-foreground hover:text-foreground transition-colors" title="Edit">
                                <PencilIcon className="w-3.5 h-3.5" />
                              </button>
                              <button onClick={() => deleteSession(s.id)} className="p-1.5 hover:bg-muted rounded-xl text-muted-foreground hover:text-rose-400 transition-colors" title="Delete">
                                <TrashIcon className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {activeTab === 'lessons' && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <BookOpenIcon className="w-4 h-4 text-primary" />
                    <h2 className="text-sm font-bold text-foreground">Lessons</h2>
                    <span className="text-xs text-muted-foreground">({items.lessons.length})</span>
                  </div>
                  {isStaff && (
                    <Link href={`/dashboard/lessons/add?class_id=${id}`} className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-card shadow-sm hover:bg-muted border border-border rounded-xl text-xs font-bold transition-colors">
                      <PlusIcon className="w-3.5 h-3.5 text-primary" /> Add Lesson
                    </Link>
                  )}
                </div>
                {items.lessons.length === 0 ? (
                  <div className="bg-card shadow-sm border border-border rounded-xl p-12 text-center flex flex-col items-center justify-center">
                    <BookOpenIcon className="w-8 h-8 text-muted-foreground mb-3" />
                    <p className="text-sm text-muted-foreground">No lessons found for this programme.</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {items.lessons.map(lesson => isSchool ? (
                      <div key={lesson.id}
                        className="bg-card shadow-sm border border-border rounded-xl p-4 flex items-center gap-3 cursor-default">
                        <div className="w-10 h-10 bg-primary/10 flex items-center justify-center flex-shrink-0">
                          <BookOpenIcon className="w-5 h-5 text-primary" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <h4 className="text-sm font-semibold text-foreground truncate">{lesson.title}</h4>
                          <p className="text-xs text-muted-foreground capitalize">{lesson.lesson_type ?? lesson.status ?? ''}</p>
                        </div>
                      </div>
                    ) : (
                      <Link key={lesson.id} href={`/dashboard/lessons/${lesson.id}`}
                        className="bg-card shadow-sm border border-border rounded-xl p-4 group hover:bg-muted hover:border-primary/50 transition-all flex items-center gap-3">
                        <div className="w-10 h-10 bg-primary/10 flex items-center justify-center flex-shrink-0">
                          <BookOpenIcon className="w-5 h-5 text-primary" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <h4 className="text-sm font-semibold text-foreground group-hover:text-primary transition-colors truncate">{lesson.title}</h4>
                          <p className="text-xs text-muted-foreground capitalize">{lesson.lesson_type ?? lesson.status ?? ''}</p>
                        </div>
                        <ChevronRightIcon className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            )}

            {activeTab === 'assignments' && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <ClipboardDocumentListIcon className="w-4 h-4 text-primary" />
                    <h2 className="text-sm font-bold text-foreground">Assignments</h2>
                    <span className="text-xs text-muted-foreground">({items.assignments.length})</span>
                  </div>
                  {isStaff && (
                    <Link href={`/dashboard/assignments/new?class_id=${id}`} className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-card shadow-sm hover:bg-muted border border-border rounded-xl text-xs font-bold transition-colors">
                      <PlusIcon className="w-3.5 h-3.5 text-primary" /> New Assignment
                    </Link>
                  )}
                </div>
                {items.assignments.length === 0 ? (
                  <div className="bg-card shadow-sm border border-border rounded-xl p-12 text-center flex flex-col items-center justify-center">
                    <ClipboardDocumentListIcon className="w-8 h-8 text-muted-foreground mb-3" />
                    <p className="text-sm text-muted-foreground">No assignments found for this programme.</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 gap-3">
                    {items.assignments.map(a => isSchool ? (
                      <div key={a.id}
                        className="bg-card shadow-sm border border-border rounded-xl p-4 flex items-center gap-4 cursor-default">
                        <div className="w-10 h-10 bg-primary/10 flex items-center justify-center flex-shrink-0">
                          <ClipboardDocumentListIcon className="w-5 h-5 text-primary" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <h4 className="text-sm font-semibold text-foreground truncate">{a.title}</h4>
                          <p className="text-xs text-muted-foreground">
                            Due: {a.due_date ? new Date(a.due_date).toLocaleDateString() : 'No deadline'}
                            {a.weight ? ` · ${a.weight} pts` : ''}
                          </p>
                        </div>
                      </div>
                    ) : (
                      <Link key={a.id} href={`/dashboard/assignments/${a.id}`}
                        className="bg-card shadow-sm border border-border rounded-xl p-4 group hover:bg-muted hover:border-primary/50 transition-all flex items-center gap-4">
                        <div className="w-10 h-10 bg-primary/10 flex items-center justify-center flex-shrink-0">
                          <ClipboardDocumentListIcon className="w-5 h-5 text-primary" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <h4 className="text-sm font-semibold text-foreground group-hover:text-primary transition-colors truncate">{a.title}</h4>
                          <p className="text-xs text-muted-foreground">
                            Due: {a.due_date ? new Date(a.due_date).toLocaleDateString() : 'No deadline'}
                            {a.weight ? ` · ${a.weight} pts` : ''}
                          </p>
                        </div>
                        <ChevronRightIcon className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            )}

            {activeTab === 'cbt' && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <AcademicCapIcon className="w-4 h-4 text-amber-400" />
                    <h2 className="text-sm font-bold text-foreground">CBT Exams</h2>
                    <span className="text-xs text-muted-foreground">({items.cbt.length})</span>
                  </div>
                  {isStaff && (
                    <Link href={`/dashboard/cbt/new?class_id=${id}${cls?.program_id ? `&program_id=${cls.program_id}` : ''}`} className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-card shadow-sm hover:bg-muted border border-border rounded-xl text-xs font-bold transition-colors">
                      <PlusIcon className="w-3.5 h-3.5 text-amber-400" /> New Exam
                    </Link>
                  )}
                </div>
                {items.cbt.length === 0 ? (
                  <div className="bg-card shadow-sm border border-border rounded-xl p-12 text-center flex flex-col items-center justify-center">
                    <AcademicCapIcon className="w-8 h-8 text-muted-foreground mb-3" />
                    <p className="text-sm text-muted-foreground">No CBT exams found for this programme.</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {items.cbt.map(ex => isSchool ? (
                      <div key={ex.id}
                        className="bg-card shadow-sm border border-border rounded-xl p-4 cursor-default">
                        <div className="flex items-center gap-3 mb-3">
                          <div className="w-9 h-9 bg-amber-500/10 flex items-center justify-center flex-shrink-0">
                            <AcademicCapIcon className="w-4 h-4 text-amber-400" />
                          </div>
                          <h4 className="text-sm font-semibold text-foreground truncate">{ex.title}</h4>
                        </div>
                        <div className="flex items-center gap-4 text-xs text-muted-foreground">
                          <span>{ex.duration_minutes} mins</span>
                          <span>·</span>
                          <span>{ex.total_questions} questions</span>
                          {ex.is_active && <span className="ml-auto text-emerald-400 font-bold">Active</span>}
                        </div>
                      </div>
                    ) : (
                      <Link key={ex.id} href={`/dashboard/cbt/${ex.id}`}
                        className="bg-card shadow-sm border border-border rounded-xl p-4 group hover:bg-muted hover:border-amber-500/50 transition-all">
                        <div className="flex items-center gap-3 mb-3">
                          <div className="w-9 h-9 bg-amber-500/10 flex items-center justify-center flex-shrink-0">
                            <AcademicCapIcon className="w-4 h-4 text-amber-400" />
                          </div>
                          <h4 className="text-sm font-semibold text-foreground group-hover:text-amber-400 transition-colors truncate">{ex.title}</h4>
                        </div>
                        <div className="flex items-center gap-4 text-xs text-muted-foreground">
                          <span>{ex.duration_minutes} mins</span>
                          <span>·</span>
                          <span>{ex.total_questions} questions</span>
                          {ex.is_active && <span className="ml-auto text-emerald-400 font-bold">Active</span>}
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
                  <div className="flex items-center gap-3">
                    <ChartBarIcon className="w-4 h-4 text-primary" />
                    <h3 className="text-sm font-bold text-foreground">Gradebook</h3>
                    {isStaff && (
                      <button
                        onClick={() => setManualEntry(!manualEntry)}
                        className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${manualEntry ? 'bg-emerald-600 text-white' : 'bg-card shadow-sm text-muted-foreground border border-border hover:bg-muted'}`}
                      >
                        {manualEntry ? <CheckIconOutline className="w-3.5 h-3.5" /> : <PencilSquareIconOutline className="w-3.5 h-3.5" />}
                        {manualEntry ? 'Done Editing' : 'Edit Grades'}
                      </button>
                    )}
                  </div>
                  <div className="flex items-center gap-3 flex-wrap">
                    <Link href="/dashboard/grading" className="text-xs font-bold text-amber-400 hover:text-amber-300 transition-colors whitespace-nowrap">
                      Grading Queue →
                    </Link>
                    <Link href="/dashboard/reports/builder" className="text-xs font-bold text-primary hover:text-violet-300 transition-colors whitespace-nowrap">
                      Build Report Cards →
                    </Link>
                    <button onClick={() => router.push('/dashboard/grades')} className="text-xs font-bold text-primary hover:text-primary transition-colors whitespace-nowrap">
                      Full Gradebook →
                    </button>
                  </div>
                </div>
                {items.assignments.length === 0 ? (
                  <div className="bg-card shadow-sm border border-border rounded-xl p-12 text-center flex flex-col items-center justify-center">
                    <ChartBarIcon className="w-8 h-8 text-muted-foreground mb-3" />
                    <p className="text-sm text-muted-foreground">No assignments to grade yet.</p>
                  </div>
                ) : (
                  <div className="bg-card shadow-sm border border-border rounded-xl overflow-hidden overflow-x-auto">
                    <table className="w-full text-left border-collapse min-w-[600px]">
                      <thead>
                        <tr className="border-b border-border bg-muted/30">
                          <th className="px-5 py-3 text-xs font-bold text-muted-foreground uppercase tracking-wider sticky left-0 bg-card z-20">Student</th>
                          {items.assignments.map(a => (
                            <th key={a.id} className="px-4 py-3 text-xs font-bold text-muted-foreground text-center min-w-[120px]">
                              <div className="line-clamp-1 mb-0.5" title={a.title}>{a.title}</div>
                              <div className="text-[10px] text-amber-400/70">{a.max_points ?? '?'} pts</div>
                            </th>
                          ))}
                          {items.cbt.map(c => (
                            <th key={c.id} className="px-4 py-3 text-xs font-bold text-muted-foreground text-center min-w-[120px]">
                              <div className="line-clamp-1 mb-0.5" title={c.title}>{c.title}</div>
                              <div className="text-[10px] text-primary/70">{c.total_questions} Qs</div>
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/5">
                        {enrollments.map(enr => (
                          <tr key={enr.id} className="hover:bg-muted/30 transition-colors group border-b border-border">
                            <td className="px-5 py-3 sticky left-0 bg-card z-10 border-r border-border group-hover:bg-muted/30 transition-colors">
                              <div className="flex items-center gap-3">
                                <div className="w-8 h-8 bg-primary/10 flex items-center justify-center text-xs font-bold text-primary flex-shrink-0">
                                  {(enr.full_name ?? '?')[0].toUpperCase()}
                                </div>
                                <div className="min-w-0">
                                  <p className="text-sm font-semibold text-foreground truncate">{enr.full_name}</p>
                                  <p className="text-xs text-muted-foreground truncate">{enr.email}</p>
                                </div>
                              </div>
                            </td>
                            {items.assignments.map(a => {
                              const sub = items.submissions.find(s => s.assignment_id === a.id && (s.portal_user_id === enr.id || s.user_id === enr.id));
                              const score = sub?.grade;
                              const percentage = a.max_points > 0 ? (score ?? 0) / a.max_points : 0;
                              const maxPts = a.max_points ?? 100;
                              const waec = score !== null ? getWAECGrade(Math.round((score / maxPts) * 100)) : null;
                              return (
                                <td key={a.id} className={`px-4 py-4 text-center border-l border-border transition-all relative ${manualEntry ? 'bg-emerald-500/[0.05]' : 'bg-amber-500/[0.01]'}`}>
                                  {manualEntry ? (
                                    <div className="flex flex-col items-center gap-1">
                                      <input
                                        type="number"
                                        min={0}
                                        max={maxPts}
                                        defaultValue={score ?? ''}
                                        onBlur={async (e) => {
                                          const val = e.target.value;
                                          if (val === '') {
                                          } else {
                                            const numVal = Number(val);
                                            if (isNaN(numVal) || numVal < 0 || numVal > maxPts) {
                                              alert(`Grade must be a valid number between 0 and ${maxPts}.`);
                                              e.target.value = score !== null ? String(score) : '';
                                              return;
                                            }
                                          }
                                          const numVal = val === '' ? null : Number(val);
                                          const key = `asm-${a.id}-${enr.id}`;
                                          if (numVal === score) return;

                                          setMatrixSaving(p => ({ ...p, [key]: true }));
                                          try {
                                            if (sub) {
                                              const res = await fetch(`/api/assignment-submissions/${sub.id}`, {
                                                method: 'PATCH',
                                                headers: { 'Content-Type': 'application/json' },
                                                body: JSON.stringify({ grade: numVal, status: numVal !== null ? 'graded' : sub.status, feedback: sub.feedback || null }),
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
                                        className="w-14 h-9 bg-card shadow-sm border border-border rounded-xl text-center text-xs font-black text-foreground focus:border-emerald-500 focus:bg-muted outline-none transition-all"
                                      />
                                      {waec && (
                                        <span className={`text-[9px] font-black px-1.5 py-0.5 rounded ${waec.bgColor} ${waec.color}`}>{waec.code}</span>
                                      )}
                                      {matrixSaving[`asm-${a.id}-${enr.id}`] && (
                                        <div className="absolute top-1.5 right-1.5 w-2 h-2 bg-emerald-500 rounded-full animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.8)]" />
                                      )}
                                    </div>
                                  ) : sub ? (
                                    score !== null ? (
                                      <div className="space-y-1 flex flex-col items-center">
                                        <span className={`text-sm font-black ${waec ? waec.color : 'text-muted-foreground'}`}>
                                          {score}<span className="text-[9px] text-muted-foreground">/{maxPts}</span>
                                        </span>
                                        {waec && (
                                          <span className={`text-[9px] font-black px-1.5 py-0.5 rounded ${waec.bgColor} ${waec.color}`}>{waec.code}</span>
                                        )}
                                        <div className="w-12 h-1 bg-card shadow-sm rounded-full overflow-hidden">
                                          <div className={`h-full transition-all duration-1000 ${percentage >= 0.75 ? 'bg-emerald-500' : percentage >= 0.6 ? 'bg-primary' : percentage >= 0.5 ? 'bg-amber-500' : percentage >= 0.4 ? 'bg-primary' : 'bg-rose-500'}`} style={{ width: `${percentage * 100}%` }}></div>
                                        </div>
                                      </div>
                                    ) : (
                                      <span className="text-[8px] font-black text-primary/60 uppercase tracking-widest bg-primary/10 px-2 py-1 rounded-xl border border-primary/10">Pending</span>
                                    )
                                  ) : (
                                    <span className="text-[10px] text-white/10 font-black uppercase tracking-widest">—</span>
                                  )}
                                </td>
                              );
                            })}
                            {items.cbt.map(c => {
                              const sess = items.cbtSessions.find(s => s.exam_id === c.id && s.user_id === enr.id);
                              const score = sess?.score;
                              const percentage = c.total_questions > 0 ? (score ?? 0) / c.total_questions : 0;
                              return (
                                <td key={c.id} className="px-6 py-6 text-center border-l border-border bg-primary/[0.01]">
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
                                      <span className="text-[8px] font-black text-cyan-400/60 uppercase tracking-widest bg-cyan-500/10 px-2 py-1 rounded-xl border border-cyan-500/10 animate-pulse">Running</span>
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

          {/* Sidebar */}
          <div className="space-y-4">

            {/* Students List */}
            <div className="bg-white/[0.01] backdrop-blur-md shadow-sm border border-border rounded-2xl overflow-hidden">
              <div className="px-5 py-4 border-b border-white/5 flex items-center justify-between gap-3 bg-white/[0.02]">
                <div className="flex items-center gap-3 min-w-0">
                  {canView && currentTermStudents.length > 0 && (
                    <input
                      type="checkbox"
                      title="Select all"
                      checked={checkedEnrollIds.size === currentTermStudents.length}
                      ref={el => { if (el) el.indeterminate = checkedEnrollIds.size > 0 && checkedEnrollIds.size < currentTermStudents.length; }}
                      onChange={e => setCheckedEnrollIds(e.target.checked ? new Set(currentTermStudents.map((enr: any) => enr.id)) : new Set())}
                      className="w-4 h-4 accent-primary cursor-pointer flex-shrink-0 rounded border-border"
                    />
                  )}
                  <div>
                    <h3 className="text-xs font-black uppercase tracking-widest text-muted-foreground">Current Term Students</h3>
                    <p className="text-xs text-primary font-bold mt-0.5">{currentTermStudents.length} / {cls.max_students ?? '∞'} active</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  {canView && checkedEnrollIds.size > 0 && (
                    <button
                      disabled={bulkRemoving}
                      onClick={async () => {
                        const names = currentTermStudents
                          .filter((e: any) => checkedEnrollIds.has(e.id))
                          .map((e: any) => e.full_name)
                          .join(', ');
                        if (!confirm(`Unenrol ${checkedEnrollIds.size} student${checkedEnrollIds.size > 1 ? 's' : ''} from this class?\n\n${names}`)) return;
                        setBulkRemoving(true);
                        try {
                          const res = await fetch(`/api/classes/${id}/enroll`, {
                            method: 'DELETE',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ studentIds: [...checkedEnrollIds] }),
                          });
                          if (!res.ok) { const j = await res.json(); alert(j.error || 'Unenrol failed'); return; }
                          await fetchData();
                          setCheckedEnrollIds(new Set());
                        } finally {
                          setBulkRemoving(false);
                        }
                      }}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-rose-500/10 hover:bg-rose-600 hover:text-white border border-rose-500/30 text-rose-400 text-xs font-bold transition-all rounded-xl disabled:opacity-50"
                    >
                      {bulkRemoving ? <ArrowPathIcon className="w-3.5 h-3.5 animate-spin" /> : <TrashIcon className="w-3.5 h-3.5" />}
                      Unenrol {checkedEnrollIds.size}
                    </button>
                  )}
                  {isStaff && (
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => { setShowStudentModal(true); loadAvailableStudents(); }}
                        title="Enrol existing student"
                        className="w-8 h-8 bg-white/5 hover:bg-primary hover:text-white border border-white/5 text-muted-foreground transition-all flex items-center justify-center rounded-xl"
                      >
                        <PlusIcon className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => setShowRegisterModal(true)}
                        title="Register new student"
                        className="w-8 h-8 bg-white/5 hover:bg-primary hover:text-white border border-white/5 text-muted-foreground transition-all flex items-center justify-center rounded-xl"
                      >
                        <UserPlusIcon className="w-4 h-4" />
                      </button>
                    </div>
                  )}
                  <button
                    onClick={() => setShowStudentList(v => !v)}
                    title={showStudentList ? 'Hide student list' : 'Show student list'}
                    className="px-2.5 h-8 bg-white/5 hover:bg-white/10 border border-white/5 text-muted-foreground hover:text-foreground transition-all flex items-center justify-center rounded-xl text-[11px] font-bold"
                  >
                    {showStudentList ? 'Hide ▲' : 'Show ▾'}
                  </button>
                </div>
              </div>
              {!showStudentList ? null : currentTermStudents.length === 0 ? (
                <div className="p-10 text-center flex flex-col items-center justify-center">
                  <UserGroupIcon className="w-8 h-8 text-muted-foreground mb-3" />
                  <p className="text-sm text-muted-foreground mb-3">No active students for this term yet.</p>
                  {isStaff && <Link href={`/dashboard/classes/${id}/edit`} className="text-xs font-bold text-primary hover:text-primary transition-colors">Edit class to add students →</Link>}
                </div>
              ) : (
                <div className="divide-y divide-white/5 max-h-[400px] overflow-y-auto custom-scrollbar">
                  {currentTermStudents.map((enr: any) => {
                    const isChecked = checkedEnrollIds.has(enr.id);
                    return (
                      <div
                        key={enr.id}
                        className={`px-4 py-3 flex items-center gap-3 transition-all group ${isChecked ? 'bg-rose-500/5' : 'hover:bg-white/5'}`}
                      >
                        {canView && (
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={e => {
                              setCheckedEnrollIds(prev => {
                                const next = new Set(prev);
                                if (e.target.checked) next.add(enr.id); else next.delete(enr.id);
                                return next;
                              });
                            }}
                            className="w-4 h-4 accent-primary cursor-pointer flex-shrink-0 rounded border-border"
                          />
                        )}
                        <div className={`w-8 h-8 flex items-center justify-center rounded-lg text-xs font-bold flex-shrink-0 transition-colors ${isChecked ? 'bg-rose-500/20 text-rose-400' : 'bg-primary/10 text-primary'}`}>
                          {(enr.full_name ?? '?')[0].toUpperCase()}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold text-foreground truncate">{enr.full_name}</p>
                          <p className="text-xs text-muted-foreground truncate">{enr.email}</p>
                        </div>
                        {canView && (
                          <button
                            onClick={async () => {
                              if (!confirm(`Unenrol ${enr.full_name} from this class?`)) return;
                              const res = await fetch(`/api/classes/${id}/enroll`, {
                                method: 'DELETE',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ studentId: enr.id }),
                              });
                              if (!res.ok) { const j = await res.json(); alert(j.error); return; }
                              await fetchData();
                              setCheckedEnrollIds(prev => { const next = new Set(prev); next.delete(enr.id); return next; });
                            }}
                            title="Unenrol from class"
                            className="w-7 h-7 bg-rose-500/10 hover:bg-rose-600 hover:text-white border border-rose-500/20 text-rose-400 flex items-center justify-center transition-colors sm:opacity-0 sm:group-hover:opacity-100 rounded-xl"
                          >
                            <TrashIcon className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {inactiveTermStudents.length > 0 && (
              <div className="bg-white/[0.01] backdrop-blur-md shadow-sm border border-amber-500/20 rounded-2xl overflow-hidden">
                <div className="px-5 py-4 border-b border-amber-500/10 bg-amber-500/5">
                  <h3 className="text-xs font-black uppercase tracking-widest text-amber-300">Paused / Historical</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    These students keep old results and can be reinstated into this term.
                  </p>
                </div>
                <div className="divide-y divide-white/5 max-h-[260px] overflow-y-auto custom-scrollbar">
                  {inactiveTermStudents.map((student: any) => (
                    <div key={`${student.id}-${student.roster_status ?? 'former'}`} className="px-4 py-3 flex items-center gap-3">
                      <div className="w-8 h-8 flex items-center justify-center rounded-lg text-xs font-bold flex-shrink-0 bg-amber-500/10 text-amber-300">
                        {(student.full_name ?? '?')[0].toUpperCase()}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-foreground truncate">{student.full_name}</p>
                        <p className="text-[11px] text-muted-foreground truncate">
                          {(student.roster_status ?? 'former').toString().replace('_', ' ')}
                          {student.roster_ended_at ? ` · left ${new Date(student.roster_ended_at).toLocaleDateString('en-GB')}` : ''}
                        </p>
                      </div>
                      {isStaff && (
                        <button
                          onClick={() => assignStudent(student.id)}
                          disabled={processingStudent === student.id}
                          className="px-3 py-1.5 bg-primary/10 hover:bg-primary text-primary hover:text-primary-foreground border border-primary/20 text-[10px] font-black uppercase tracking-widest rounded-xl transition-colors disabled:opacity-50"
                        >
                          {processingStudent === student.id ? '...' : 'Reinstate'}
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {isStaff && (
              <button
                onClick={handleExportLogins}
                className="w-full py-3 bg-emerald-600/10 hover:bg-emerald-600 hover:text-white border border-emerald-600/30 transition-colors flex items-center justify-center gap-2 font-bold text-sm text-emerald-400"
              >
                <CloudArrowDownIcon className="w-4 h-4" />
                Export Login Credentials
              </button>
            )}

          </div>

        </div>
      </div>

      {/* Student Enrol Modal */}
      {showStudentModal && (() => {
        const unassigned = availableStudents.filter((s: any) => !s.class_id);
        const inOtherClass = availableStudents.filter((s: any) => s.class_id);
        const directlyEnrollable = availableStudents.filter((s: any) => !s.requires_transfer_request);
        const requestableTransfers = availableStudents.filter((s: any) => s.requires_transfer_request && !s.pending_transfer_request_id);
        const seatsLeft = cls?.max_students ? Math.max(0, cls.max_students - enrollments.length) : Infinity;
        const isFull = seatsLeft <= 0;
        return (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-8">
            <div className="absolute inset-0 bg-black/80 backdrop-blur-md" onClick={() => setShowStudentModal(false)} />
            <div className="bg-card border border-border rounded-xl w-full max-w-lg shadow-2xl overflow-hidden relative z-10 flex flex-col max-h-[90vh]">

              {/* Header */}
              <div className="px-6 py-5 border-b border-border flex items-center justify-between flex-shrink-0">
                <div>
                  <h3 className="font-bold text-foreground">Enrol Students</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {availableStudents.length} eligible · {selectedStudentIds.size} selected
                    {cls?.max_students ? ` (Capacity limit: ${seatsLeft} seat${seatsLeft !== 1 ? 's' : ''} left)` : ''}
                  </p>
                </div>
                <button onClick={() => { setShowStudentModal(false); setEnrolMode('current'); setStudentSearch(''); setShowMoreStudents(false); }} className="w-8 h-8 flex items-center justify-center bg-card shadow-sm rounded-xl text-muted-foreground hover:text-foreground transition-colors text-lg">&times;</button>
              </div>

              {/* Mode tabs */}
              <div className="px-6 pt-4 pb-1 flex gap-2 flex-shrink-0">
                <button
                  onClick={() => setEnrolMode('current')}
                  className={`flex-1 py-2 rounded-xl text-[10px] font-bold transition-all ${enrolMode === 'current' ? 'bg-primary text-foreground shadow-lg shadow-primary/30' : 'bg-card shadow-sm text-muted-foreground hover:bg-muted border border-border'}`}
                >
                  Enrol into {cls?.name ?? 'this class'}
                </button>
                <button
                  onClick={() => setEnrolMode('create')}
                  className={`flex-1 py-2 rounded-xl text-[10px] font-bold transition-all ${enrolMode === 'create' ? 'bg-emerald-600 text-foreground shadow-lg shadow-emerald-900/30' : 'bg-card shadow-sm text-muted-foreground hover:bg-muted border border-border'}`}
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
                        className="w-full px-4 py-2.5 bg-card shadow-sm border border-border rounded-xl text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary transition-colors"
                      />
                    </div>
                  )}
                  {/* Toolbar */}
                  {availableStudents.length > 0 && (
                    <div className="px-6 pt-2 pb-2 flex items-center gap-2 flex-shrink-0">
                      <button
                        onClick={() => {
                          if (selectedStudentIds.size === directlyEnrollable.length) {
                            setSelectedStudentIds(new Set());
                          } else {
                            if (directlyEnrollable.length > seatsLeft) {
                              alert(`This class only has ${seatsLeft} seat(s) remaining. Selecting the first ${seatsLeft} available students.`);
                              setSelectedStudentIds(new Set(directlyEnrollable.slice(0, seatsLeft).map((s: any) => s.id)));
                            } else {
                              setSelectedStudentIds(new Set(directlyEnrollable.map((s: any) => s.id)));
                            }
                          }
                        }}
                        className="px-3 py-1.5 bg-card shadow-sm hover:bg-muted border border-border text-[10px] font-bold text-muted-foreground hover:text-foreground rounded-xl transition-all"
                      >
                        {directlyEnrollable.length > 0 && selectedStudentIds.size === directlyEnrollable.length ? 'Deselect All' : 'Select Available'}
                      </button>
                      <div className="flex-1" />
                      {requestableTransfers.length > 0 && (
                        <button onClick={() => { setTransferReason(''); setShowBulkTransferModal(true); }} className="px-4 py-1.5 bg-amber-500 hover:bg-amber-400 text-[10px] font-bold text-slate-950 rounded-xl transition-all">
                          Request all {requestableTransfers.length} transfers
                        </button>
                      )}
                      {selectedStudentIds.size > 0 && (
                        <button
                          onClick={() => syncSelectedStudents()}
                          disabled={!!processingStudent}
                          className="px-4 py-1.5 bg-primary hover:bg-primary text-[10px] font-bold text-foreground rounded-xl transition-all disabled:opacity-50 flex items-center gap-1.5"
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
                        <ArrowPathIcon className="w-10 h-10 text-primary animate-spin mx-auto mb-4" />
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
                        const requiresRequest = Boolean(student.requires_transfer_request);
                        const isChecked = !requiresRequest && selectedStudentIds.has(student.id);
                        const isBlocked = !requiresRequest && !isChecked && selectedStudentIds.size >= seatsLeft;
                        return (
                          <div
                            key={student.id}
                            onClick={() => {
                              if (requiresRequest) return;
                              if (isBlocked) {
                                alert(`Cannot select more students. This class has reached its maximum enrollment capacity (${cls.max_students} students max).`);
                                return;
                              }
                              setSelectedStudentIds(prev => {
                                const n = new Set(prev);
                                if (n.has(student.id)) n.delete(student.id); else n.add(student.id);
                                return n;
                              });
                            }}
                            className={`flex items-center gap-3 p-3 border rounded-xl transition-all ${
                              requiresRequest
                                ? 'bg-amber-500/[0.04] border-amber-500/25'
                                : isBlocked
                                  ? 'opacity-40 cursor-not-allowed bg-rose-500/[0.02] border-rose-500/10'
                                  : isChecked
                                    ? color === 'orange' ? 'bg-primary/15 border-primary/40 cursor-pointer' : 'bg-amber-500/10 border-amber-500/40 cursor-pointer'
                                    : color === 'orange' ? 'bg-card shadow-sm border-border hover:border-primary/20 cursor-pointer' : 'bg-card shadow-sm border-amber-500/10 hover:border-amber-500/20 cursor-pointer'
                            }`}
                          >
                            <div className={`flex-shrink-0 w-5 h-5 rounded border-2 flex items-center justify-center transition-all ${isChecked ? 'bg-primary border-primary' : requiresRequest ? 'border-amber-400/60 bg-amber-500/10' : 'border-border'}`}>
                              {isChecked ? <CheckIconOutline className="w-3 h-3 text-foreground" /> : requiresRequest ? <ArrowsRightLeftIcon className="w-3 h-3 text-amber-300" /> : null}
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-semibold text-foreground truncate">{student.full_name}</p>
                              <div className="flex items-center gap-2 flex-wrap">
                                <p className="text-xs text-muted-foreground truncate">{student.email}</p>
                                {student.school_name && <span className="text-[9px] font-bold text-primary/70 bg-primary/10 px-1.5 py-0.5 rounded-full border border-primary/20">{student.school_name}</span>}
                              </div>
                              {student.class_id && (
                                <div className="mt-1 text-[10px] text-amber-300/90">
                                  <p><span className="font-black">Class:</span> {student.current_class_name || student.section_class || 'Another class'}</p>
                                  <p><span className="font-black">Owner:</span> {student.current_teacher_name || 'Unknown teacher'}{student.current_teacher_email ? ` · ${student.current_teacher_email}` : ''}</p>
                                </div>
                              )}
                            </div>
                            {requiresRequest ? (
                              student.pending_transfer_request_id ? (
                                <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-1 text-[9px] font-black uppercase text-amber-300">Request pending</span>
                              ) : (
                                <button type="button" onClick={(event) => { event.stopPropagation(); setTransferCandidate(student); setTransferReason(''); }} className="rounded-lg bg-amber-500 px-3 py-1.5 text-[10px] font-black text-slate-950 hover:bg-amber-400">
                                  Request transfer
                                </button>
                              )
                            ) : isBlocked ? (
                              <span className="text-[8px] font-black uppercase tracking-widest text-rose-400 bg-rose-500/10 border border-rose-500/20 px-2 py-0.5 rounded-full">Full</span>
                            ) : null}
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
                                In another class — move or request ({filtInOther.length})
                                {filtInOther.length > visibleInOther.length && <span className="text-amber-400/30"> — showing {visibleInOther.length}</span>}
                              </p>
                              <div className="space-y-1.5">{visibleInOther.map(s => renderStudent(s, 'amber'))}</div>
                            </div>
                          )}
                          {hasMore && (
                            <button
                              onClick={() => setShowMoreStudents(true)}
                              className="w-full py-3 text-xs font-bold text-muted-foreground hover:text-foreground bg-card shadow-sm hover:bg-muted rounded-xl border border-border transition-all"
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
                    <button onClick={() => { setShowStudentModal(false); setEnrolMode('current'); }} className="px-4 py-2 text-xs font-semibold text-muted-foreground hover:text-foreground bg-card shadow-sm hover:bg-muted rounded-xl transition-all">
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
                    className="w-full px-4 py-3 bg-card shadow-sm border border-border rounded-xl text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-emerald-500 transition-colors"
                  />
                  <select
                    value={newClassForm.program_id}
                    onChange={e => setNewClassForm(f => ({ ...f, program_id: e.target.value }))}
                    className="w-full px-4 py-3 bg-card shadow-sm border border-border rounded-xl text-sm text-foreground focus:outline-none focus:border-emerald-500 cursor-pointer transition-colors"
                  >
                    <option value="">— Programme *—</option>
                    {programsList.map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                  <select
                    value={newClassForm.school_id}
                    onChange={e => setNewClassForm(f => ({ ...f, school_id: e.target.value }))}
                    className="w-full px-4 py-3 bg-card shadow-sm border border-border rounded-xl text-sm text-foreground focus:outline-none focus:border-emerald-500 cursor-pointer transition-colors"
                  >
                    <option value="">— School (optional) —</option>
                    {schoolsList.map((s: any) => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                  <input
                    type="number"
                    placeholder="Max students (optional)"
                    value={newClassForm.max_students}
                    onChange={e => setNewClassForm(f => ({ ...f, max_students: e.target.value }))}
                    className="w-full px-4 py-3 bg-card shadow-sm border border-border rounded-xl text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-emerald-500 transition-colors"
                  />
                  <button
                    onClick={createClassAndEnrol}
                    disabled={creatingNewClass || !newClassForm.name.trim() || !newClassForm.program_id || selectedStudentIds.size === 0}
                    className="w-full py-3 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-foreground font-bold rounded-xl transition-all flex items-center justify-center gap-2"
                  >
                    {creatingNewClass
                      ? <><ArrowPathIcon className="w-4 h-4 animate-spin" /> Creating & Enrolling…</>
                      : `Create Class & Enrol ${selectedStudentIds.size} Student${selectedStudentIds.size !== 1 ? 's' : ''}`}
                  </button>
                  {selectedStudentIds.size === 0 && (
                    <button onClick={() => setEnrolMode('current')} className="w-full py-2 text-xs text-primary hover:text-primary transition-colors font-semibold">
                      ← Go back and select students first
                    </button>
                  )}
                </div>
              )}

            </div>
          </div>
        );
      })()}




      {declineCandidate && (
        <div className="fixed inset-0 z-[140] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/75 backdrop-blur-sm" onClick={() => !transferBusy && setDeclineCandidate(null)} />
          <div className="relative w-full max-w-md rounded-2xl border border-rose-500/25 bg-card p-6 shadow-2xl">
            <h3 className="font-black text-foreground">Decline transfer request?</h3>
            <p className="mt-2 text-xs text-muted-foreground">{declineCandidate.student?.full_name} will remain in {declineCandidate.from_class?.name}. The requesting teacher will be notified.</p>
            <label className="mt-4 block text-[10px] font-black uppercase tracking-widest text-muted-foreground">Reason (optional)</label>
            <textarea autoFocus rows={3} value={declineNote} onChange={(event) => setDeclineNote(event.target.value)} placeholder="Give the other teacher helpful context." className="mt-2 w-full resize-none rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-rose-500/50" />
            <div className="mt-5 flex gap-3">
              <button type="button" onClick={() => setDeclineCandidate(null)} disabled={!!transferBusy} className="flex-1 rounded-xl border border-border px-4 py-2.5 text-xs font-black text-muted-foreground">Keep pending</button>
              <button type="button" onClick={() => decideTransfer(declineCandidate.id, 'decline', declineNote.trim() || null)} disabled={!!transferBusy} className="flex-[2] rounded-xl bg-rose-600 px-4 py-2.5 text-xs font-black text-white disabled:opacity-40">{transferBusy ? 'Declining…' : 'Decline request'}</button>
            </div>
          </div>
        </div>
      )}
      {transferCandidate && (
        <div className="fixed inset-0 z-[130] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/75 backdrop-blur-sm" onClick={() => !transferBusy && setTransferCandidate(null)} />
          <div className="relative w-full max-w-lg rounded-2xl border border-amber-500/25 bg-card p-6 shadow-2xl">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500/10 text-amber-300"><ArrowsRightLeftIcon className="h-5 w-5" /></div>
              <div><h3 className="font-black text-foreground">Request student transfer</h3><p className="mt-1 text-xs text-muted-foreground">The current teacher will review this request. Approval moves the student automatically.</p></div>
            </div>
            <div className="mt-5 rounded-xl border border-border bg-background p-4 text-sm">
              <p className="font-black text-foreground">{transferCandidate.full_name}</p>
              <p className="mt-2 text-xs text-muted-foreground"><span className="font-bold text-foreground">Current:</span> {transferCandidate.current_class_name || transferCandidate.section_class} · {transferCandidate.current_teacher_name}</p>
              <p className="mt-1 text-xs text-muted-foreground"><span className="font-bold text-foreground">Requested:</span> {cls?.name} · {cls?.portal_users?.full_name || profile?.full_name || 'Class owner'}</p>
            </div>
            <label className="mt-4 block text-[10px] font-black uppercase tracking-widest text-muted-foreground">Reason for transfer</label>
            <textarea autoFocus rows={4} value={transferReason} onChange={(event) => setTransferReason(event.target.value)} placeholder="Explain why this student should move (at least 10 characters)." className="mt-2 w-full resize-none rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-amber-500/50" />
            <p className={`mt-1 text-[10px] ${transferReason.trim().length >= 10 ? 'text-emerald-400' : 'text-muted-foreground'}`}>{transferReason.trim().length}/10 minimum</p>
            <div className="mt-5 flex gap-3">
              <button type="button" onClick={() => setTransferCandidate(null)} disabled={!!transferBusy} className="flex-1 rounded-xl border border-border px-4 py-2.5 text-xs font-black text-muted-foreground">Cancel</button>
              <button type="button" onClick={submitTransferRequest} disabled={!!transferBusy || transferReason.trim().length < 10} className="flex-[2] rounded-xl bg-amber-500 px-4 py-2.5 text-xs font-black text-slate-950 disabled:opacity-40">{transferBusy ? 'Sending request…' : 'Send to current teacher'}</button>
            </div>
          </div>
        </div>
      )}
      {showBulkTransferModal && (
        <div className="fixed inset-0 z-[130] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/75 backdrop-blur-sm" onClick={() => transferBusy !== 'bulk' && setShowBulkTransferModal(false)} />
          <div className="relative w-full max-w-lg rounded-2xl border border-amber-500/25 bg-card p-6 shadow-2xl">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500/10 text-amber-300"><ArrowsRightLeftIcon className="h-5 w-5" /></div>
              <div><h3 className="font-black text-foreground">Request all available transfers</h3><p className="mt-1 text-xs text-muted-foreground">One reason will be sent for every student owned by another teacher. Existing pending requests are skipped.</p></div>
            </div>
            <div className="mt-4 max-h-32 overflow-y-auto rounded-xl border border-border bg-background p-3 text-xs text-muted-foreground">
              {availableStudents.filter((student: any) => student.requires_transfer_request && !student.pending_transfer_request_id).map((student: any) => <p key={student.id} className="py-0.5"><span className="font-bold text-foreground">{student.full_name}</span> · {student.current_teacher_name || 'Current teacher'}</p>)}
            </div>
            <label className="mt-4 block text-[10px] font-black uppercase tracking-widest text-muted-foreground">Reason for all requests</label>
            <textarea autoFocus rows={4} value={transferReason} onChange={(event) => setTransferReason(event.target.value)} placeholder="Explain why these students should move (at least 10 characters)." className="mt-2 w-full resize-none rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-amber-500/50" />
            <p className={`mt-1 text-[10px] ${transferReason.trim().length >= 10 ? 'text-emerald-400' : 'text-muted-foreground'}`}>{transferReason.trim().length}/10 minimum</p>
            <div className="mt-5 flex gap-3">
              <button type="button" onClick={() => setShowBulkTransferModal(false)} disabled={transferBusy === 'bulk'} className="flex-1 rounded-xl border border-border px-4 py-2.5 text-xs font-black text-muted-foreground">Cancel</button>
              <button type="button" onClick={submitAllTransferRequests} disabled={transferBusy === 'bulk' || transferReason.trim().length < 10} className="flex-[2] rounded-xl bg-amber-500 px-4 py-2.5 text-xs font-black text-slate-950 disabled:opacity-40">{transferBusy === 'bulk' ? 'Sending requests...' : 'Send all requests'}</button>
            </div>
          </div>
        </div>
      )}      <style dangerouslySetInnerHTML={{ __html: `
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
      `}} />
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
          <div className="absolute inset-0 bg-foreground/35 dark:bg-black/70 backdrop-blur-sm" onClick={() => !savingSession && setEditingSession(null)} />
          <div className="relative w-full max-w-lg bg-card shadow-sm border border-border rounded-xl shadow-2xl overflow-hidden">
            <div className="px-6 py-5 border-b border-border">
              <h3 className="text-base font-bold text-foreground">
                {editingSession.id === 'new' ? 'New Session' : 'Edit Session'}
              </h3>
              <p className="text-xs text-muted-foreground mt-0.5">Record a class session for this class.</p>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1.5">Topic</label>
                <input
                  type="text"
                  value={sessionForm.topic}
                  onChange={(e) => setSessionForm({ ...sessionForm, topic: e.target.value })}
                  placeholder="e.g. Introduction to Variables"
                  className="w-full bg-card shadow-sm border border-border rounded-xl px-4 py-2.5 text-sm text-foreground focus:outline-none focus:border-primary transition-colors"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1.5">Session Date</label>
                  <input
                    type="date"
                    value={sessionForm.session_date}
                    onChange={(e) => setSessionForm({ ...sessionForm, session_date: e.target.value })}
                    className="w-full bg-card shadow-sm border border-border rounded-xl px-4 py-2.5 text-sm text-foreground focus:outline-none focus:border-primary transition-colors [color-scheme:dark]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1.5">Start – End Time</label>
                  <div className="flex items-center gap-2">
                    <input type="time" value={sessionForm.start_time}
                      onChange={(e) => setSessionForm({ ...sessionForm, start_time: e.target.value })}
                      className="flex-1 bg-card shadow-sm border border-border rounded-xl px-2 py-2.5 text-sm text-foreground focus:outline-none focus:border-primary [color-scheme:dark]" />
                    <span className="text-muted-foreground text-xs">–</span>
                    <input type="time" value={sessionForm.end_time}
                      onChange={(e) => setSessionForm({ ...sessionForm, end_time: e.target.value })}
                      className="flex-1 bg-card shadow-sm border border-border rounded-xl px-2 py-2.5 text-sm text-foreground focus:outline-none focus:border-primary [color-scheme:dark]" />
                  </div>
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1.5">Notes (optional)</label>
                <textarea value={sessionForm.notes}
                  onChange={(e) => setSessionForm({ ...sessionForm, notes: e.target.value })}
                  rows={3}
                  className="w-full bg-card shadow-sm border border-border rounded-xl px-4 py-2.5 text-sm text-foreground focus:outline-none focus:border-primary transition-colors resize-none"
                  placeholder="Record notes, participation, or homework..."
                />
              </div>
            </div>
            <div className="px-6 py-4 border-t border-border flex gap-3">
              <button onClick={() => setEditingSession(null)} disabled={savingSession}
                className="flex-1 py-2.5 bg-card shadow-sm hover:bg-muted text-muted-foreground font-bold text-sm rounded-xl transition-colors border border-border">
                Cancel
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
                    if (!res.ok) throw new Error('Failed to save session');
                    setEditingSession(null);
                    await fetchData();
                  } catch (e: any) {
                    alert(e.message);
                  } finally {
                    setSavingSession(false);
                  }
                }}
                disabled={savingSession}
                className="flex-[2] py-2.5 bg-primary hover:bg-primary text-white font-bold text-sm rounded-xl transition-colors shadow-lg shadow-primary/30 flex items-center justify-center gap-2"
              >
                {savingSession ? <ArrowPathIcon className="w-4 h-4 animate-spin" /> : <CloudArrowUpIcon className="w-4 h-4" />}
                {editingSession.id === 'new' ? 'Save Session' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* WhatsApp Broadcast Modal */}
      {showBroadcastModal && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 sm:p-6">
          <div className="absolute inset-0 bg-black/80 backdrop-blur-md animate-fade-in" onClick={() => {
            if (!broadcasting) {
              setShowBroadcastModal(false);
              setReachableStudents([]);
              setBroadcastForm({ text: '', mediaUrl: '', use_template: false, template_name: '', template_variables: '' });
            }
          }} />
          <div className="relative w-full max-w-lg bg-card border border-[#25D366]/25 rounded-2xl shadow-2xl shadow-[#25D366]/5 overflow-hidden scale-in-center">
            
            {/* Header */}
            <div className="px-6 py-5 border-b border-[#25D366]/20 bg-[#25D366]/5">
              <h3 className="text-base font-black text-[#25D366] uppercase tracking-wider flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-[#25D366] animate-ping" />
                WhatsApp Broadcast System
              </h3>
              {loadingReachable ? (
                <div className="flex items-center gap-2 mt-2">
                  <ArrowPathIcon className="w-3.5 h-3.5 animate-spin text-muted-foreground" />
                  <p className="text-xs text-muted-foreground font-semibold">Scanning student directory...</p>
                </div>
              ) : (
                <div className="mt-2 space-y-1">
                  <p className="text-xs text-muted-foreground font-medium">
                    {reachableStudents.length} of {enrollments.length} students have WhatsApp consent and a valid phone number.
                  </p>
                  {reachableStudents.length === 0 && (
                    <div className="flex items-center gap-2 text-[10px] text-rose-400 bg-rose-500/10 border border-rose-500/20 px-3 py-1.5 rounded-lg mt-2 font-bold uppercase tracking-wide">
                      ⚠️ No contact coordinates available for broadcast.
                    </div>
                  )}
                  {reachableStudents.length < enrollments.length && reachableStudents.length > 0 && (
                    <div className="flex items-center gap-2 text-[10px] text-amber-400 bg-amber-500/10 border border-amber-500/20 px-3 py-1.5 rounded-lg mt-2 font-bold uppercase tracking-wide">
                      ⚠️ {enrollments.length - reachableStudents.length} students will skip this broadcast (no phones).
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Form & List */}
            <div className="p-6 space-y-4 max-h-[60vh] overflow-y-auto custom-scrollbar">
              <div>
                <label className="block text-[10px] font-black text-muted-foreground uppercase tracking-widest mb-1.5">Broadcast Message</label>
                <textarea 
                  value={broadcastForm.text}
                  onChange={(e) => setBroadcastForm({ ...broadcastForm, text: e.target.value })}
                  rows={5}
                  className="w-full bg-[#080d19] border border-border rounded-xl px-4 py-3 text-sm text-foreground focus:outline-none focus:border-[#25D366] transition-colors resize-none placeholder:text-muted-foreground/60 font-medium"
                  placeholder="Type class broadcast message here (e.g. Remember to complete Assignment 3 by tomorrow!)..."
                />
              </div>
              
              <div className="rounded-xl border border-white/5 bg-white/[0.02] p-4 space-y-3">
                <label className="flex items-center justify-between gap-3 text-xs font-bold text-foreground">
                  <span><span className="block">Use approved Meta template</span><span className="text-[10px] font-normal text-muted-foreground">Recommended when the parent has not messaged within 24 hours.</span></span>
                  <input type="checkbox" checked={broadcastForm.use_template} onChange={(e) => setBroadcastForm({ ...broadcastForm, use_template: e.target.checked })} className="h-4 w-4 accent-[#25D366]" />
                </label>
                {broadcastForm.use_template && (
                  <div className="grid gap-2 sm:grid-cols-2">
                    <input value={broadcastForm.template_name} onChange={(e) => setBroadcastForm({ ...broadcastForm, template_name: e.target.value })} placeholder="Approved template name" className="rounded-lg border border-border bg-[#080d19] px-3 py-2 text-xs text-foreground outline-none focus:border-[#25D366]" />
                    <input value={broadcastForm.template_variables} onChange={(e) => setBroadcastForm({ ...broadcastForm, template_variables: e.target.value })} placeholder="Variables, comma separated" className="rounded-lg border border-border bg-[#080d19] px-3 py-2 text-xs text-foreground outline-none focus:border-[#25D366]" />
                  </div>
                )}
                {broadcastAudience?.statuses && Object.keys(broadcastAudience.statuses).length > 0 && (
                  <p className="text-[10px] text-muted-foreground">Recent delivery queue: {Object.entries(broadcastAudience.statuses).map(([status, count]) => `${status} ${count}`).join(' · ')}</p>
                )}
              </div>

              {!loadingReachable && reachableStudents.length > 0 && (
                <div className="border border-white/5 rounded-2xl p-4 bg-white/[0.01]">
                  <p className="text-[10px] font-black text-[#25D366] uppercase tracking-widest mb-3 flex items-center justify-between">
                    <span>Reachable Students ({reachableStudents.length})</span>
                    <span className="text-[8px] bg-[#25D366]/10 text-[#25D366] px-2 py-0.5 rounded-full border border-[#25D366]/20">Active Channel</span>
                  </p>
                  <div className="space-y-2 max-h-36 overflow-y-auto pr-1">
                    {reachableStudents.map((student: any) => {
                      const hasParentPhone = student.students?.parent_phone;
                      const hasStudentPhone = student.phone || student.students?.phone;
                      return (
                        <div key={student.id} className="flex items-center justify-between text-xs py-1.5 border-b border-white/5 last:border-b-0">
                          <span className="font-semibold text-foreground">{student.full_name}</span>
                          <span className="text-[9px] font-black uppercase tracking-wider bg-white/5 border border-white/10 px-2 py-0.5 rounded-full text-muted-foreground flex items-center gap-1">
                            {hasParentPhone ? '📱 Parent Phone' : hasStudentPhone ? '📱 Student Phone' : ''}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
              
              {!loadingReachable && enrollments.length > reachableStudents.length && (
                <div className="border border-amber-500/10 rounded-2xl p-4 bg-amber-500/[0.01]">
                  <p className="text-[10px] font-black text-amber-400 uppercase tracking-widest mb-3 flex items-center justify-between">
                    <span>Unreachable Students ({enrollments.length - reachableStudents.length})</span>
                    <span className="text-[8px] bg-amber-500/10 text-amber-400 px-2 py-0.5 rounded-full border border-amber-500/20">Missing Data</span>
                  </p>
                  <div className="space-y-2 max-h-28 overflow-y-auto pr-1">
                    {enrollments
                      .filter((enr: any) => !reachableStudents.some((r: any) => r.id === enr.id))
                      .map((student: any) => (
                        <div key={student.id} className="flex items-center justify-between text-xs py-1.5 border-b border-white/5 last:border-b-0 opacity-60">
                          <span className="font-semibold text-foreground">{student.full_name}</span>
                          <span className="text-[9px] font-black uppercase tracking-wider bg-rose-500/10 border border-rose-500/20 px-2 py-0.5 rounded-full text-rose-400">📵 No phone</span>
                        </div>
                      ))}
                  </div>
                </div>
              )}
            </div>

            {/* Footer Buttons */}
            <div className="px-6 py-4 border-t border-white/5 bg-white/[0.01] flex gap-3">
              <button 
                onClick={() => {
                  setShowBroadcastModal(false);
                  setReachableStudents([]);
                  setBroadcastForm({ text: '', mediaUrl: '', use_template: false, template_name: '', template_variables: '' });
                }} 
                disabled={broadcasting}
                className="flex-1 py-3 bg-card hover:bg-white/5 text-muted-foreground hover:text-foreground font-black text-xs uppercase tracking-wider rounded-xl border border-white/5 transition-all">
                Cancel
              </button>
              <button
                onClick={handleBroadcast}
                disabled={broadcasting || !broadcastForm.text.trim() || reachableStudents.length === 0 || (broadcastForm.use_template && !broadcastForm.template_name.trim())}
                className="flex-[2] py-3 bg-[#25D366] hover:bg-[#1fbc55] disabled:opacity-40 disabled:cursor-not-allowed text-white font-black text-xs uppercase tracking-wider rounded-xl shadow-xl shadow-[#25D366]/20 flex items-center justify-center gap-2 transition-all active:scale-[0.99]"
              >
                {broadcasting ? (
                  <>
                    <ArrowPathIcon className="w-4 h-4 animate-spin" />
                    Queueing...
                  </>
                ) : loadingReachable ? (
                  <>
                    <ArrowPathIcon className="w-4 h-4 animate-spin" />
                    Checking...
                  </>
                ) : reachableStudents.length === 0 ? (
                  'No Reachable Students'
                ) : (
                  `Queue for ${reachableStudents.length} Student${reachableStudents.length !== 1 ? 's' : ''}`
                )}
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
