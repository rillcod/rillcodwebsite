// @refresh reset
'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useAuth } from '@/contexts/auth-context';
import { createClient } from '@/lib/supabase/client';
import {
  UserGroupIcon, MagnifyingGlassIcon, PlusIcon,
  CheckCircleIcon, XCircleIcon, ClockIcon, AcademicCapIcon,
  BuildingOfficeIcon, EnvelopeIcon, PhoneIcon, MapPinIcon,
  ChevronDownIcon, ChevronUpIcon, ArrowPathIcon, ArrowDownTrayIcon,
  CalendarIcon, UserIcon, ExclamationTriangleIcon, StarIcon,
  BookOpenIcon, ClipboardDocumentListIcon, KeyIcon, ShieldCheckIcon,
  XMarkIcon, ClipboardIcon, PencilSquareIcon, BoltIcon, SparklesIcon,
  PrinterIcon,
} from '@/lib/icons';
import { AddStudentModal } from '@/features/students/components/AddStudentModal';

// ─── Status badge ─────────────────────────────────────────────
function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    approved: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
    pending: 'bg-amber-500/20  text-amber-400  border-amber-500/30',
    rejected: 'bg-rose-500/20   text-rose-400   border-rose-500/30',
    active: 'bg-blue-500/20   text-blue-400   border-blue-500/30',
  };
  return (
    <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold border capitalize ${map[status] ?? 'bg-muted text-muted-foreground border-border'}`}>
      {status}
    </span>
  );
}

// ─── Info chip ───────────────────────────────────────────────
function Chip({ icon: Icon, text }: { icon: any; text: string }) {
  if (!text) return null;
  return (
    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
      <Icon className="w-3 h-3 flex-shrink-0" /> {text}
    </span>
  );
}

// ─── Main page ────────────────────────────────────────────────
export default function StudentsPage() {
  const { profile, loading: authLoading } = useAuth();
  const [students, setStudents] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [acting, setActing] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [activating, setActivating] = useState<string | null>(null);
  const [credentials, setCredentials] = useState<{ email: string; tempPassword: string; name: string } | null>(null);
  const [editingStudent, setEditingStudent] = useState<any | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [gapCount, setGapCount] = useState<number | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<any | null>(null);

  // Enrolled portal students (portal_users role=student)
  const [sourceFilter, setSourceFilter] = useState<'all' | 'applications' | 'enrolled'>('all');
  const [portalStudents, setPortalStudents] = useState<any[]>([]);
  const [portalLoading, setPortalLoading] = useState(false);
  const [classMap, setClassMap] = useState<Record<string, string>>({}); // class_id → name
  const [schoolList, setSchoolList] = useState<{ id: string; name: string }[]>([]);
  const [assigningSchool, setAssigningSchool] = useState<string | null>(null); // portal student id being assigned

  // Registry print filters
  const [filterSchoolReg, setFilterSchoolReg] = useState('');
  const [filterClassReg, setFilterClassReg] = useState('');

  // Bulk enrol
  const [selectedForEnrol, setSelectedForEnrol] = useState<Set<string>>(new Set());
  const [showBulkEnrolModal, setShowBulkEnrolModal] = useState(false);
  const [classList, setClassList] = useState<any[]>([]);
  const [bulkEnrolClassId, setBulkEnrolClassId] = useState('');
  const [bulkEnrolling, setBulkEnrolling] = useState(false);

  // Quick create class inside enrol modal
  const [bulkEnrolMode, setBulkEnrolMode] = useState<'pick' | 'create'>('pick');
  const [programsList, setProgramsList] = useState<any[]>([]);
  const [quickClass, setQuickClass] = useState({ name: '', grade_level: '', program_id: '', school_id: '', max_students: '' });
  const [creatingClass, setCreatingClass] = useState(false);

  const isStaff = profile?.role === 'admin' || profile?.role === 'teacher' || profile?.role === 'school';

  // ── Fetch ──────────────────────────────────────────────────
  const load = useCallback(async () => {
    if (!profile || !isStaff) return;
    setLoading(true); setError(null);
    try {
      // Use API route — bypasses RLS, includes teacher_schools for multi-school access
      const res = await fetch('/api/students', { cache: 'no-store' });
      if (!res.ok) {
        const j = await res.json();
        throw new Error(j.error ?? 'Failed to load students');
      }
      const json = await res.json();
      setStudents(json.data ?? []);
    } catch (e: any) {
      setError(e.message ?? 'Failed to load students');
    } finally {
      setLoading(false);
    }
  }, [profile, isStaff]);

  const loadPortalStudents = useCallback(async () => {
    if (!profile || !isStaff) return;
    setPortalLoading(true);
    try {
      const [stuRes, clsRes, schRes] = await Promise.all([
        fetch('/api/portal-users?role=student&scoped=true', { cache: 'no-store' }),
        fetch('/api/classes', { cache: 'no-store' }),
        fetch('/api/schools', { cache: 'no-store' }),
      ]);
      const stuJson = await stuRes.json();
      setPortalStudents(stuJson.data ?? []);
      const clsJson = await clsRes.json();
      const map: Record<string, string> = {};
      (clsJson.data ?? []).forEach((c: any) => { map[c.id] = c.name; });
      setClassMap(map);
      const schJson = await schRes.json();
      setSchoolList(schJson.data ?? []);
    } catch { /* ignore */ } finally {
      setPortalLoading(false);
    }
  }, [profile, isStaff]);

  // ── Assign portal student to a school ──────────────────────
  const assignStudentSchool = async (studentId: string, schoolId: string) => {
    setAssigningSchool(studentId);
    try {
      const res = await fetch('/api/portal-users', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: [studentId], update: { school_id: schoolId || null } }),
      });
      if (!res.ok) {
        const j = await res.json();
        alert(j.error || 'Failed to assign school');
        return;
      }
      const school = schoolList.find(s => s.id === schoolId);
      setPortalStudents(prev => prev.map(s =>
        s.id === studentId ? { ...s, school_id: schoolId || null, school_name: school?.name ?? s.school_name } : s
      ));
    } catch (e: any) {
      alert(e.message ?? 'Failed to assign school');
    } finally {
      setAssigningSchool(null);
    }
  };

  // ── Bulk enrol ─────────────────────────────────────────────
  const openBulkEnrol = async () => {
    if (selectedForEnrol.size === 0) return;
    setShowBulkEnrolModal(true);
    setBulkEnrolMode('pick');
    const fetches: Promise<any>[] = [];
    if (classList.length === 0) {
      fetches.push(
        fetch('/api/classes', { cache: 'no-store' }).then(r => r.json()).then(j => setClassList(j.data ?? [])).catch(() => {})
      );
    }
    if (programsList.length === 0) {
      fetches.push(
        fetch('/api/programs?is_active=true', { cache: 'no-store' }).then(r => r.json()).then(j => setProgramsList(j.data ?? [])).catch(() => {})
      );
    }
    if (fetches.length > 0) await Promise.all(fetches);
  };

  const createAndEnrol = async () => {
    if ((!quickClass.name.trim() && !quickClass.grade_level) || !quickClass.program_id) {
      alert('Class name (or grade level) and program are required');
      return;
    }
    setCreatingClass(true);
    try {
      // 1. Create class
      // If grade_level chosen, use it as class name; otherwise use the typed name
      const className = quickClass.grade_level || quickClass.name.trim();
      const body: any = { name: className, program_id: quickClass.program_id, status: 'active' };
      if (quickClass.school_id) body.school_id = quickClass.school_id;
      if (quickClass.max_students) body.max_students = parseInt(quickClass.max_students);
      const clsRes = await fetch('/api/classes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const clsJson = await clsRes.json();
      if (!clsRes.ok) throw new Error(clsJson.error ?? 'Failed to create class');
      const classId = clsJson.data.id;

      // 2. Enrol selected students into new class
      const enrolRes = await fetch(`/api/classes/${classId}/enroll`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ studentIds: [...selectedForEnrol] }),
      });
      const enrolJson = await enrolRes.json();
      if (!enrolRes.ok) throw new Error(enrolJson.error ?? 'Failed to enrol students');

      // 3. Close & refresh
      setShowBulkEnrolModal(false);
      setBulkEnrolMode('pick');
      setSelectedForEnrol(new Set());
      setBulkEnrolClassId('');
      setQuickClass({ name: '', grade_level: '', program_id: '', school_id: '', max_students: '' });
      setClassList([]);      // force refresh next open
      await loadPortalStudents();
      alert(`Class "${clsJson.data.name}" created — ${enrolJson.enrolled ?? selectedForEnrol.size} student${(enrolJson.enrolled ?? selectedForEnrol.size) !== 1 ? 's' : ''} enrolled.`);
    } catch (e: any) {
      alert(e.message ?? 'Failed to create class and enrol students');
    } finally {
      setCreatingClass(false);
    }
  };

  const executeBulkEnrol = async () => {
    if (!bulkEnrolClassId || selectedForEnrol.size === 0) return;
    setBulkEnrolling(true);
    try {
      const res = await fetch(`/api/classes/${bulkEnrolClassId}/enroll`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ studentIds: [...selectedForEnrol] }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Failed to enrol');
      setShowBulkEnrolModal(false);
      setBulkEnrolMode('pick');
      setSelectedForEnrol(new Set());
      setBulkEnrolClassId('');
      await loadPortalStudents();
      alert(`Enrolled ${json.enrolled ?? selectedForEnrol.size} student${(json.enrolled ?? selectedForEnrol.size) !== 1 ? 's' : ''}${json.skipped ? ` (${json.skipped} skipped — school boundary)` : ''}.`);
    } catch (e: any) {
      alert(e.message ?? 'Failed to enrol students');
    } finally {
      setBulkEnrolling(false);
    }
  };

  useEffect(() => {
    if (authLoading || !profile) return;
    load();
    loadPortalStudents();
    if (profile?.role === 'admin') checkGaps();
  }, [profile?.id, isStaff, authLoading, load]); // eslint-disable-line

  // ── Approve ────────────────────────────────────────────────
  const approve = async (id: string) => {
    setActing(id);
    try {
      const res = await fetch('/api/approvals/students', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, action: 'approved' }),
      });
      if (res.ok) {
        setStudents(prev => prev.map(s => s.id === id
          ? { ...s, status: 'approved', approved_at: new Date().toISOString(), user_id: 'pending_refresh' }
          : s));
        const json = await res.json();
        if (json.credentials) {
          setCredentials({ email: json.credentials.email, tempPassword: json.credentials.password, name: json.credentials.name || 'Student' });
          load(); // Refresh list to get accurate user_id
        }
      }
    } catch { /* ignore */ }
    setActing(null);
  };

  // ── Reject ─────────────────────────────────────────────────
  const reject = async (id: string) => {
    setActing(id);
    try {
      const res = await fetch('/api/approvals/students', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, action: 'rejected' }),
      });
      if (res.ok) {
        setStudents(prev => prev.map(s => s.id === id ? { ...s, status: 'rejected' } : s));
      }
    } catch { /* ignore */ }
    setActing(null);
  };

  // ── Activate portal account ─────────────────────────────────
  const activatePortalAccount = async (studentId: string, studentName: string) => {
    setActivating(studentId);
    try {
      const res = await fetch('/api/students/activate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ studentId }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Activation failed');
      if (json.alreadyActivated) {
        alert(`${studentName} already has a portal account (${json.email}).`);
      } else {
        // Show credentials modal
        setCredentials({ email: json.email, tempPassword: json.tempPassword, name: studentName });
        // Update local state to reflect user_id is now set
        setStudents(prev => prev.map(s => s.id === studentId
          ? { ...s, user_id: json.portalUserId, status: 'approved' } : s));
      }
    } catch (e: any) {
      alert(e.message ?? 'Failed to activate portal account');
    } finally {
      setActivating(null);
    }
  };

  // ── DELETE ────────────────────────────────────────────────
  const handleDeleteStudent = async (id: string) => {
    if (!confirm('Are you sure you want to delete this student record?')) return;
    setDeleting(id);
    try {
      const res = await fetch(`/api/students/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error(await res.text());
      setStudents(prev => prev.filter(s => s.id !== id));
    } catch (e: any) {
      alert(e.message ?? 'Failed to delete student');
    } finally {
      setDeleting(null);
    }
  };

  const startEdit = (s: any) => {
    setEditingStudent(s);
    setShowAdd(true);
  };

  // ── Gap detection & sync ────────────────────────────────────
  const checkGaps = async () => {
    try {
      const res = await fetch('/api/admin/sync-users');
      const json = await res.json();
      if (res.ok) setGapCount(json.gaps?.students_needing_accounts ?? 0);
    } catch { /* ignore */ }
  };

  const handleSync = async () => {
    if (!confirm('This will create portal accounts for all approved students without one. Continue?')) return;
    setSyncing(true); setSyncResult(null);
    try {
      const res = await fetch('/api/admin/sync-users', { method: 'POST' });
      const json = await res.json();
      setSyncResult(json);
      await load();
      await checkGaps();
    } catch (e: any) {
      setSyncResult({ error: e.message });
    }
    setSyncing(false);
  };

  // ── CSV export ─────────────────────────────────────────────
  const exportCSV = () => {
    const header = ['Name', 'Status', 'Enrollment Type', 'Grade', 'School', 'Gender', 'Parent', 'Parent Phone', 'Student Email', 'City', 'State', 'Registered'];
    const rows = students.map(s => [
      s.full_name, s.status, s.enrollment_type, s.grade_level, s.school_name, s.gender,
      s.parent_name, s.parent_phone, s.student_email || s.parent_email, s.city, s.state,
      new Date(s.created_at).toLocaleDateString(),
    ]);
    const csv = [header, ...rows].map(r => r.map(c => `"${c ?? ''}"`).join(',')).join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    a.download = `students_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
  };

  // ── Professional registry print ────────────────────────────
  const handlePrintRegistry = () => {
    const docRef = `SR-${Date.now().toString(36).toUpperCase().slice(-6)}`;
    const now = new Date();
    const dateStr = now.toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' });

    // Build document title from active filters
    const parts: string[] = [];
    if (filterSchoolReg) parts.push(filterSchoolReg);
    if (filterClassReg) parts.push(filterClassReg);
    if (sourceFilter === 'enrolled') parts.push('Enrolled Students');
    else if (sourceFilter === 'applications') parts.push('Applications');
    if (filter !== 'all') parts.push(`${filter.charAt(0).toUpperCase() + filter.slice(1)} Status`);
    const subtitle = parts.length > 0 ? parts.join(' — ') : 'All Students';

    const rows = filtered.map((s, i) => {
      const isEnrolled = s._source === 'enrolled';
      const cls = s.section_class || (s.class_id && classMap[s.class_id]) || s.grade_level || '—';
      const email = s.student_email || s.email || s.parent_email || '—';
      const school = s.school_name || '—';
      const status = s.status || '—';
      const bg = i % 2 === 0 ? '#ffffff' : '#f9fafb';
      return `
        <tr style="background:${bg};border-bottom:1px solid #e5e7eb;">
          <td style="padding:7px 10px;color:#9ca3af;font-size:11px;text-align:center;">${i + 1}</td>
          <td style="padding:7px 10px;font-weight:700;font-size:11px;">${s.full_name ?? '—'}</td>
          <td style="padding:7px 10px;color:#6b7280;font-size:11px;">${cls}</td>
          <td style="padding:7px 10px;color:#6b7280;font-size:11px;">${school}</td>
          <td style="padding:7px 10px;color:#6b7280;font-size:11px;">${email}</td>
          <td style="padding:7px 10px;font-size:10px;text-align:center;">
            <span style="padding:2px 8px;border-radius:9999px;font-weight:700;font-size:9px;background:${isEnrolled ? '#d1fae5' : '#ede9fe'};color:${isEnrolled ? '#065f46' : '#4c1d95'};">
              ${isEnrolled ? 'Enrolled' : 'Application'}
            </span>
          </td>
          <td style="padding:7px 10px;border-left:1px solid #d1d5db;min-width:80px;">&nbsp;</td>
        </tr>`;
    }).join('');

    const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
      <title>Student Registry — ${subtitle}</title>
      <style>
        @page { size: A4; margin: 18mm 15mm 20mm 15mm; }
        body { font-family: 'Segoe UI', Arial, sans-serif; color: #111827; margin: 0; }
        table { border-collapse: collapse; width: 100%; }
        thead tr { background: #1e3a8a; color: #fff; }
        th { padding: 8px 10px; text-align: left; font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.8px; }
        .no-print { display: none; }
        @media screen { .no-print { display: block; } }
      </style>
    </head><body>

    <!-- Print Button (screen only) -->
    <div class="no-print" style="padding:12px;text-align:right;background:#f3f4f6;border-bottom:1px solid #e5e7eb;">
      <button onclick="window.print()" style="padding:8px 20px;background:#1e3a8a;color:#fff;border:none;border-radius:8px;font-weight:700;cursor:pointer;font-size:13px;">
        🖨 Print / Save as PDF
      </button>
    </div>

    <!-- Letterhead -->
    <div style="display:flex;align-items:center;gap:16px;border-bottom:3px solid #1e3a8a;padding-bottom:14px;margin-bottom:20px;">
      <img src="${window.location.origin}/logo.png" alt="Rillcod" style="width:60px;height:60px;object-fit:contain;flex-shrink:0;" onerror="this.style.display='none'" />
      <div style="flex:1;">
        <div style="font-size:20px;font-weight:900;color:#1e3a8a;letter-spacing:-0.5px;line-height:1.1;">RILLCOD TECHNOLOGIES</div>
        <div style="font-size:11px;color:#6b7280;margin-top:2px;">Coding Today, Innovating Tomorrow</div>
        <div style="font-size:10px;color:#9ca3af;margin-top:2px;">26 Ogiesoba Avenue, Off Airport Road, GRA, Benin City &nbsp;·&nbsp; 08116600091 &nbsp;·&nbsp; rillcod@gmail.com</div>
      </div>
      <div style="text-align:right;flex-shrink:0;">
        <div style="font-size:10px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:1.5px;">Official Document</div>
        <div style="font-size:14px;font-weight:900;color:#1e3a8a;text-transform:uppercase;">Student Registry</div>
        <div style="font-size:10px;color:#9ca3af;margin-top:4px;">${dateStr}</div>
      </div>
    </div>

    <!-- Title block -->
    <div style="background:linear-gradient(135deg,#1e3a8a 0%,#2563eb 100%);border-radius:10px;padding:14px 20px;margin-bottom:16px;display:flex;align-items:center;justify-content:space-between;">
      <div>
        <div style="font-size:16px;font-weight:900;color:#fff;">Student Registry — ${subtitle}</div>
        <div style="font-size:11px;color:rgba(255,255,255,0.7);margin-top:3px;">${filtered.length} student${filtered.length !== 1 ? 's' : ''} listed</div>
      </div>
      <div style="text-align:right;color:rgba(255,255,255,0.6);font-size:10px;">
        <div>Ref: <strong style="color:#fff;">${docRef}</strong></div>
        <div>Generated by: ${profile?.full_name ?? profile?.email ?? 'Staff'}</div>
      </div>
    </div>

    <!-- Metadata grid -->
    <table style="margin-bottom:16px;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">
      <tr>
        <td style="padding:8px 14px;background:#f9fafb;border-right:1px solid #e5e7eb;border-bottom:1px solid #e5e7eb;font-size:10px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:0.8px;width:16%;">Filter</td>
        <td style="padding:8px 14px;border-bottom:1px solid #e5e7eb;font-size:11px;font-weight:600;width:34%;">${subtitle}</td>
        <td style="padding:8px 14px;background:#f9fafb;border-right:1px solid #e5e7eb;border-bottom:1px solid #e5e7eb;border-left:1px solid #e5e7eb;font-size:10px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:0.8px;width:16%;">Total Students</td>
        <td style="padding:8px 14px;border-bottom:1px solid #e5e7eb;font-size:11px;font-weight:700;color:#1e3a8a;width:34%;">${filtered.length}</td>
      </tr>
      <tr>
        <td style="padding:8px 14px;background:#f9fafb;border-right:1px solid #e5e7eb;font-size:10px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:0.8px;">School</td>
        <td style="padding:8px 14px;font-size:11px;">${filterSchoolReg || 'All Schools'}</td>
        <td style="padding:8px 14px;background:#f9fafb;border-right:1px solid #e5e7eb;border-left:1px solid #e5e7eb;font-size:10px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:0.8px;">Class / Grade</td>
        <td style="padding:8px 14px;font-size:11px;">${filterClassReg || 'All Classes'}</td>
      </tr>
    </table>

    <!-- Student table -->
    <table>
      <thead>
        <tr>
          <th style="width:4%;text-align:center;">#</th>
          <th style="width:24%;">Student Full Name</th>
          <th style="width:12%;">Class / Grade</th>
          <th style="width:20%;">School</th>
          <th style="width:22%;">Email Address</th>
          <th style="width:10%;text-align:center;">Type</th>
          <th style="width:8%;border-left:1px solid rgba(255,255,255,0.2);">Remarks</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>

    <!-- Footer -->
    <div style="margin-top:28px;padding-top:14px;border-top:2px solid #1e3a8a;display:flex;justify-content:space-between;align-items:flex-end;">
      <div>
        <div style="font-size:10px;color:#9ca3af;margin-bottom:6px;">Prepared by</div>
        <div style="border-top:1px solid #374151;width:160px;padding-top:4px;font-size:10px;color:#6b7280;">${profile?.full_name ?? 'Staff Member'} &nbsp;·&nbsp; ${profile?.role ?? ''}</div>
      </div>
      <div style="text-align:center;">
        <div style="font-size:10px;color:#9ca3af;margin-bottom:6px;">Authorised Signature</div>
        <div style="border-top:1px solid #374151;width:180px;padding-top:4px;font-size:10px;color:#6b7280;">School Administrator &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</div>
      </div>
      <div style="text-align:right;">
        <div style="font-size:9px;color:#d1d5db;">Ref: ${docRef}</div>
        <div style="font-size:9px;color:#d1d5db;">Printed: ${dateStr}</div>
        <div style="font-size:9px;color:#d1d5db;">academy.rillcod.com — Confidential</div>
      </div>
    </div>

    </body></html>`;

    const win = window.open('', '_blank');
    if (!win) { alert('Pop-up blocked. Please allow pop-ups for this site.'); return; }
    win.document.write(html);
    win.document.close();
    win.focus();
    setTimeout(() => win.print(), 600);
  };

  const handlePrintLoginSlip = (s: any) => {
    const dateStr = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
    const studentName = s.full_name || s.name || 'N/A';
    const email = s.email || s.student_email || 'N/A';
    
    const html = `
      <html><head><title>Login Slip - ${studentName}</title>
      <style>
        body { font-family: system-ui, -apple-system, sans-serif; padding: 60px; color: #111827; background: #fff; }
        .box { border: 4px solid #ea580c; padding: 40px; position: relative; max-width: 500px; margin: auto; }
        .logo { font-weight: 900; font-size: 28px; text-transform: uppercase; font-style: italic; color: #000; margin-bottom: 8px; }
        .dot { color: #ea580c; font-style: normal; }
        .tagline { font-size: 10px; font-weight: 900; color: #9ca3af; text-transform: uppercase; letter-spacing: 0.4em; border-bottom: 1px solid #e5e7eb; padding-bottom: 20px; margin-bottom: 40px; }
        .field { margin-bottom: 30px; }
        .label { font-size: 10px; font-weight: 900; color: #6b7280; text-transform: uppercase; letter-spacing: 0.1em; margin-bottom: 8px; }
        .value { font-size: 20px; font-weight: 700; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; }
        .footer { margin-top: 60px; font-size: 9px; color: #9ca3af; text-align: center; line-height: 1.6; }
        @media print { body { padding: 0; } .box { border-width: 2px; } }
      </style>
      </head><body>
      <div class="box">
        <div class="logo">RILLCOD<span class="dot">.</span></div>
        <div class="tagline">STEM Excellence Protocol</div>
        
        <div class="field">
          <div class="label">Authorized Student</div>
          <div class="value">${studentName}</div>
        </div>
        
        <div class="field">
          <div class="label">Access Portal (Email)</div>
          <div class="value">${email}</div>
        </div>
        
        <div class="field">
          <div class="label">Station Address</div>
          <div class="value">academy.rillcod.com/student/login</div>
        </div>

        <div class="footer">
          This document contains sensitive access protocols.<br/>
          Issued by Rillcod Academy Administration on ${dateStr}.<br/>
          Cipher ID: ${Math.random().toString(36).substr(2, 9).toUpperCase()}
        </div>
      </div>
      <script>window.onload = () => { window.print(); setTimeout(() => window.close(), 500); }</script>
      </body></html>
    `;
    const win = window.open('', '_blank');
    if (!win) { alert('Pop-up blocked. Please allow pop-ups.'); return; }
    win.document.write(html);
    win.document.close();
  };

  const handlePrintAllLoginSlips = () => {
    const list = filtered.filter(s => s.user_id || s._source === 'enrolled');
    if (list.length === 0) {
      alert('No enrolled students in the current filtered view.');
      return;
    }

    const dateStr = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
    const html = `
      <html><head><title>Batch Credentials - ${dateStr}</title>
      <style>
        @page { size: A4; margin: 10mm; }
        body { font-family: 'Inter', system-ui, sans-serif; padding: 0; background: #fff; color: #111827; margin: 0; }
        .grid { 
          display: grid; 
          grid-template-columns: 1fr 1fr; 
          grid-template-rows: repeat(4, 1fr);
          gap: 15px; 
          height: calc(297mm - 20mm);
          padding: 5px;
        }
        .card { 
          border: 2px solid #000; 
          padding: 20px; 
          display: flex; 
          flex-direction: column; 
          justify-content: space-between;
          position: relative;
          background: #fff;
        }
        .brand { font-weight: 900; font-size: 16px; font-style: italic; margin-bottom: 4px; display: flex; align-items: center; gap: 6px; }
        .dot { color: #ea580c; font-style: normal; }
        .tagline { font-size: 7px; color: #9ca3af; text-transform: uppercase; letter-spacing: 0.3em; margin-bottom: 12px; border-bottom: 1px solid #f3f4f6; padding-bottom: 4px; font-weight: 800; }
        .name { font-size: 14px; font-weight: 900; margin-bottom: 10px; text-transform: uppercase; border-bottom: 2px solid #000; padding-bottom: 4px; }
        .row { margin-bottom: 10px; }
        .label { font-size: 8px; font-weight: 900; color: #6b7280; text-transform: uppercase; margin-bottom: 2px; letter-spacing: 0.1em; }
        .value { font-size: 11px; font-weight: 800; font-family: 'JetBrains Mono', monospace; word-break: break-all; color: #000; }
        .footer { margin-top: auto; font-size: 7px; color: #6b7280; border-top: 1px dashed #e5e7eb; padding-top: 8px; font-weight: 700; }
        .watermark { position: absolute; bottom: 40px; right: 20px; font-size: 24px; font-weight: 900; color: #f3f4f6; transform: rotate(-45deg); z-index: 0; pointer-events: none; }
        @media print { 
          body { -webkit-print-color-adjust: exact; }
          .card { border-width: 1.5px; }
        }
      </style>
      </head><body>
      <div class="grid">
        ${list.map(s => `
          <div class="card">
            <div class="watermark">AUTH</div>
            <div>
              <div class="brand">RILLCOD<span class="dot">.</span></div>
              <div class="tagline">STEM Excellence Access protocol</div>
              <div class="name">${s.full_name || s.name || 'N/A'}</div>
              <div class="row">
                <div class="label">Portal Login (Email)</div>
                <div class="value">${s.email || s.student_email || 'N/A'}</div>
              </div>
              <div class="row">
                <div class="label">Temporary Cipher (Password)</div>
                <div class="value">********</div>
              </div>
            </div>
            <div class="footer">
              STATION: academy.rillcod.com/student/login<br/>
              CLUSTER ID: ${s.user_id?.slice(0, 8) || 'VERIFIED'}
            </div>
          </div>
        `).join('')}
      </div>
      <script>window.onload = () => { window.print(); }</script>
      </body></html>
    `;
    const win = window.open('', '_blank');
    win?.document.write(html);
    win?.document.close();
  };

  // ── Unified combined list ───────────────────────────────────
  const normalizedApplications = students.map(s => ({ ...s, _source: 'application' as const }));
  const normalizedEnrolled = portalStudents.map(s => ({
    ...s, _source: 'enrolled' as const,
    status: s.is_active ? 'active' : 'inactive',
  }));
  const combined = [...normalizedApplications, ...normalizedEnrolled];

  const filtered = combined.filter(s => {
    const q = search.toLowerCase();
    const ms = (s.full_name ?? '').toLowerCase().includes(q) ||
      (s.parent_email ?? '').toLowerCase().includes(q) ||
      (s.student_email ?? '').toLowerCase().includes(q) ||
      (s.email ?? '').toLowerCase().includes(q) ||
      (s.parent_name ?? '').toLowerCase().includes(q) ||
      (s.school_name ?? '').toLowerCase().includes(q) ||
      (s.city ?? '').toLowerCase().includes(q) ||
      (s.section_class ?? '').toLowerCase().includes(q);
    const matchSource = sourceFilter === 'all' ||
      (sourceFilter === 'enrolled' && s._source === 'enrolled') ||
      (sourceFilter === 'applications' && s._source === 'application');
    const matchStatus = filter === 'all' || s.status === filter;
    const matchSchoolReg = !filterSchoolReg || (s.school_name ?? '') === filterSchoolReg;
    const studentClass = s.section_class || (s.class_id && classMap[s.class_id]) || s.grade_level || '';
    const matchClassReg = !filterClassReg || studentClass === filterClassReg;
    return ms && matchSource && matchStatus && matchSchoolReg && matchClassReg;
  });

  // Distinct values for registry filter dropdowns
  const distinctSchoolsReg = [...new Set(combined.map(s => s.school_name).filter(Boolean))].sort() as string[];
  const distinctClassesReg = [...new Set([
    ...combined.map(s => s.section_class).filter(Boolean),
    ...combined.filter(s => s.class_id && classMap[s.class_id]).map(s => classMap[s.class_id]),
    ...combined.map(s => s.grade_level).filter(Boolean),
  ])].sort() as string[];

  const pending = normalizedApplications.filter(s => s.status === 'pending').length;
  const approved = normalizedApplications.filter(s => s.status === 'approved').length;
  const rejected = normalizedApplications.filter(s => s.status === 'rejected').length;

  // ── Calculate age ──────────────────────────────────────────
  const calcAge = (dob?: string) => {
    if (!dob) return null;
    const diff = Date.now() - new Date(dob).getTime();
    return Math.floor(diff / (365.25 * 24 * 3600 * 1000));
  };

  // ─── Loading ───────────────────────────────────────────────
  if (authLoading || loading) return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        <div className="animate-pulse space-y-2">
          <div className="h-4 bg-muted rounded w-32" />
          <div className="h-8 bg-muted rounded w-64" />
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map(i => <div key={i} className="bg-card shadow-sm border border-border rounded-none h-24 animate-pulse" />)}
        </div>
        {[1, 2, 3].map(i => <div key={i} className="bg-card shadow-sm border border-border rounded-none h-24 animate-pulse" />)}
      </div>
    </div>
  );

  if (profile?.role === 'student') return <StudentSelfView />;

  if (!isStaff) return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="text-center">
        <UserGroupIcon className="w-12 h-12 mx-auto text-muted-foreground mb-3" />
        <p className="text-muted-foreground">You don&apos;t have access to this page.</p>
      </div>
    </div>
  );

  return (
    <>
      {/* ── Bulk Enrol Modal ────────────────────────────── */}
      {showBulkEnrolModal && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="bg-background border border-border rounded-none w-full max-w-lg shadow-2xl max-h-[90vh] flex flex-col">

            {/* Header */}
            <div className="p-6 border-b border-border flex items-center justify-between flex-shrink-0">
              <div>
                <h2 className="font-bold text-foreground">Enrol Students</h2>
                <p className="text-xs text-muted-foreground mt-0.5">{selectedForEnrol.size} student{selectedForEnrol.size !== 1 ? 's' : ''} selected</p>
              </div>
              <button onClick={() => { setShowBulkEnrolModal(false); setBulkEnrolMode('pick'); }} className="p-2 hover:bg-muted rounded-none text-muted-foreground hover:text-foreground transition-all">
                <XMarkIcon className="w-5 h-5" />
              </button>
            </div>

            {/* Mode tabs */}
            <div className="px-6 pt-5 pb-1 flex gap-2 flex-shrink-0">
              <button
                onClick={() => setBulkEnrolMode('pick')}
                className={`flex-1 py-2.5 rounded-none text-xs font-bold transition-all ${bulkEnrolMode === 'pick' ? 'bg-orange-600 text-foreground shadow-lg shadow-orange-900/30' : 'bg-card shadow-sm text-muted-foreground hover:bg-muted border border-border'}`}
              >
                Pick Existing Class
              </button>
              <button
                onClick={() => setBulkEnrolMode('create')}
                className={`flex-1 py-2.5 rounded-none text-xs font-bold transition-all ${bulkEnrolMode === 'create' ? 'bg-emerald-600 text-foreground shadow-lg shadow-emerald-900/30' : 'bg-card shadow-sm text-muted-foreground hover:bg-muted border border-border'}`}
              >
                + Create New Class
              </button>
            </div>

            {/* Body */}
            <div className="p-6 space-y-4 overflow-y-auto flex-1">

              {bulkEnrolMode === 'pick' ? (() => {
                  // Filter classes to only schools of selected students (match by school_id OR school name)
                  const selectedStudentObjs = portalStudents.filter(s => selectedForEnrol.has(s.id));
                  const relevantSchoolIds = new Set(selectedStudentObjs.map(s => s.school_id).filter(Boolean));
                  const relevantSchoolNames = new Set(selectedStudentObjs.map(s => s.school_name).filter(Boolean));
                  const scopedClasses = classList.length === 0 ? [] :
                    (relevantSchoolIds.size > 0 || relevantSchoolNames.size > 0)
                      ? classList.filter((c: any) => {
                          if (c.school_id && relevantSchoolIds.has(c.school_id)) return true;
                          const cName = c.schools?.name;
                          if (cName && relevantSchoolNames.has(cName)) return true;
                          return false;
                        })
                      : classList;
                  // Group by school name, sorted A→Z
                  const groups: Record<string, any[]> = {};
                  scopedClasses.forEach((c: any) => {
                    const key = c.schools?.name ?? '— No School —';
                    if (!groups[key]) groups[key] = [];
                    groups[key].push(c);
                  });
                  const groupEntries = Object.entries(groups).sort(([a], [b]) => a.localeCompare(b));
                  return (
                <>
                  {scopedClasses.length === 0 ? (
                    <div className="py-10 text-center space-y-3">
                      <AcademicCapIcon className="w-10 h-10 mx-auto text-muted-foreground" />
                      <p className="text-sm text-muted-foreground">
                        {classList.length === 0 ? 'No classes found.' : 'No classes match the selected students\' school.'}
                      </p>
                      <button onClick={() => setBulkEnrolMode('create')} className="text-xs font-bold text-orange-400 hover:text-orange-500 transition-colors">
                        Create a new class →
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-4 max-h-72 overflow-y-auto pr-1">
                      {groupEntries.map(([schoolName, classes]) => (
                        <div key={schoolName}>
                          <p className="text-[10px] font-black text-blue-400/60 uppercase tracking-widest mb-2 px-1">{schoolName}</p>
                          <div className="space-y-1.5">
                            {classes.map((c: any) => (
                              <div
                                key={c.id}
                                onClick={() => setBulkEnrolClassId(c.id)}
                                className={`flex items-center gap-3 p-3.5 border rounded-none cursor-pointer transition-all ${bulkEnrolClassId === c.id ? 'bg-orange-600/15 border-orange-500/40' : 'bg-card shadow-sm border-border hover:border-orange-500/20 hover:bg-white/[0.07]'}`}
                              >
                                <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-all ${bulkEnrolClassId === c.id ? 'border-orange-400 bg-orange-600' : 'border-border'}`}>
                                  {bulkEnrolClassId === c.id && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                                </div>
                                <div className="min-w-0 flex-1">
                                  <p className="text-sm font-semibold text-foreground truncate">{c.name}</p>
                                  {c.programs?.name && (
                                    <p className="text-[9px] text-muted-foreground mt-0.5">{c.programs.name}</p>
                                  )}
                                </div>
                                <span className="text-[10px] font-bold text-muted-foreground flex-shrink-0 tabular-nums">
                                  {c.current_students ?? 0}{c.max_students ? `/${c.max_students}` : ''} <span className="text-white/15">students</span>
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="bg-amber-500/10 border border-amber-500/20 rounded-none p-3 text-xs text-amber-300">
                    Students already in another class will be <strong>reassigned</strong>. Students outside your school boundary will be skipped.
                  </div>
                  <button
                    onClick={executeBulkEnrol}
                    disabled={!bulkEnrolClassId || bulkEnrolling}
                    className="w-full py-3 bg-orange-600 hover:bg-orange-500 disabled:opacity-40 text-foreground font-bold rounded-none transition-all flex items-center justify-center gap-2"
                  >
                    {bulkEnrolling
                      ? <><ArrowPathIcon className="w-4 h-4 animate-spin" /> Enrolling…</>
                      : `Enrol ${selectedForEnrol.size} Student${selectedForEnrol.size !== 1 ? 's' : ''}`}
                  </button>
                </>
              );})() : (
                <>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    Register a new class and immediately enrol the {selectedForEnrol.size} selected student{selectedForEnrol.size !== 1 ? 's' : ''} into it.
                  </p>
                  <div className="space-y-3">
                    {/* Grade / Section preset — sets the class name automatically */}
                    <select
                      value={quickClass.grade_level}
                      onChange={e => setQuickClass(q => ({ ...q, grade_level: e.target.value, name: e.target.value ? '' : q.name }))}
                      className="w-full px-4 py-3 bg-card shadow-sm border border-border rounded-none text-sm text-foreground focus:outline-none focus:border-emerald-500 cursor-pointer transition-colors"
                    >
                      <option value="">— Grade / Section (pick or type below) —</option>
                      {['Primary 1','Primary 2','Primary 3','Primary 4','Primary 5','Primary 6',
                        'JSS1','JSS2','JSS3','SS1','SS2','SS3',
                        'Cohort A','Cohort B','Cohort C'].map(g => (
                        <option key={g} value={g}>{g}</option>
                      ))}
                    </select>
                    <input
                      type="text"
                      placeholder={quickClass.grade_level ? `Custom name (or use "${quickClass.grade_level}" above)` : 'Custom class name *'}
                      value={quickClass.name}
                      onChange={e => setQuickClass(q => ({ ...q, name: e.target.value, grade_level: e.target.value ? '' : q.grade_level }))}
                      className="w-full px-4 py-3 bg-card shadow-sm border border-border rounded-none text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-emerald-500 transition-colors"
                    />
                    <select
                      value={quickClass.program_id}
                      onChange={e => setQuickClass(q => ({ ...q, program_id: e.target.value }))}
                      className="w-full px-4 py-3 bg-card shadow-sm border border-border rounded-none text-sm text-foreground focus:outline-none focus:border-emerald-500 cursor-pointer transition-colors"
                    >
                      <option value="">— Programme *—</option>
                      {programsList.map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                    <select
                      value={quickClass.school_id}
                      onChange={e => setQuickClass(q => ({ ...q, school_id: e.target.value }))}
                      className="w-full px-4 py-3 bg-card shadow-sm border border-border rounded-none text-sm text-foreground focus:outline-none focus:border-emerald-500 cursor-pointer transition-colors"
                    >
                      <option value="">— School (optional) —</option>
                      {schoolList.map((s: any) => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                    <input
                      type="number"
                      placeholder="Max students (optional)"
                      value={quickClass.max_students}
                      onChange={e => setQuickClass(q => ({ ...q, max_students: e.target.value }))}
                      className="w-full px-4 py-3 bg-card shadow-sm border border-border rounded-none text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-emerald-500 transition-colors"
                    />
                  </div>
                  <button
                    onClick={createAndEnrol}
                    disabled={creatingClass || (!quickClass.name.trim() && !quickClass.grade_level) || !quickClass.program_id}
                    className="w-full py-3 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-foreground font-bold rounded-none transition-all flex items-center justify-center gap-2"
                  >
                    {creatingClass
                      ? <><ArrowPathIcon className="w-4 h-4 animate-spin" /> Creating & Enrolling…</>
                      : `Create Class & Enrol ${selectedForEnrol.size} Student${selectedForEnrol.size !== 1 ? 's' : ''}`}
                  </button>
                </>
              )}

            </div>
          </div>
        </div>
      )}

      {/* ── Sync Result Modal ────────────────────────────── */}
      {syncResult && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-background border border-border rounded-none w-full max-w-lg shadow-2xl max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between p-6 border-b border-border flex-shrink-0">
              <div className="flex items-center gap-3">
                <BoltIcon className="w-5 h-5 text-amber-400" />
                <h2 className="text-lg font-extrabold text-foreground">Student Sync Complete</h2>
              </div>
              <button onClick={() => setSyncResult(null)} className="p-2 rounded-none hover:bg-muted text-muted-foreground hover:text-foreground transition-all">
                <XMarkIcon className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 overflow-y-auto space-y-4">
              {syncResult.error ? (
                <div className="flex items-center gap-3 bg-rose-500/10 border border-rose-500/20 rounded-none p-4">
                  <ExclamationTriangleIcon className="w-5 h-5 text-rose-400 flex-shrink-0" />
                  <p className="text-rose-400 text-sm">{syncResult.error}</p>
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    {[
                      { label: 'Students Fixed', value: syncResult.summary?.students_fixed ?? 0, color: 'text-emerald-400' },
                      { label: 'Errors', value: syncResult.summary?.errors ?? 0, color: 'text-rose-400' },
                    ].map(s => (
                      <div key={s.label} className="bg-card shadow-sm border border-border rounded-none p-3 text-center">
                        <p className={`text-2xl font-black ${s.color}`}>{s.value}</p>
                        <p className="text-[10px] text-muted-foreground mt-0.5">{s.label}</p>
                      </div>
                    ))}
                  </div>
                  {syncResult.credentials?.filter((c: any) => c.password && !c.password.includes('existing')).length > 0 && (
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest">New Credentials Package</p>
                        <button 
                          onClick={() => {
                            const dateStr = new Date().toLocaleDateString('en-GB');
                            const html = `
                              <html><head><title>Registry Credentials - ${dateStr}</title>
                              <style>
                                body { font-family: system-ui, sans-serif; padding: 40px; background: #fff; }
                                .card { border: 1px solid #e5e7eb; padding: 20px; margin-bottom: 20px; page-break-inside: avoid; }
                                .brand { font-weight: 900; font-size: 16px; font-style: italic; margin-bottom: 10px; }
                                .name { font-size: 14px; font-weight: 700; border-bottom: 1px solid #f3f4f6; padding-bottom: 8px; margin-bottom: 12px; }
                                .row { margin-bottom: 8px; font-size: 12px; }
                                .label { color: #6b7280; font-weight: 900; text-transform: uppercase; font-size: 9px; margin-bottom: 2px; }
                                .value { font-weight: 700; font-family: monospace; }
                              </style>
                              </head><body>
                              ${syncResult.credentials.filter((c:any) => c.password && !c.password.includes('existing')).map((c: any) => `
                                <div class="card">
                                  <div class="brand">RILLCOD.</div>
                                  <div class="name">${c.name}</div>
                                  <div class="row"><div class="label">Email</div><div class="value">${c.email}</div></div>
                                  <div class="row"><div class="label">Temporary Cipher (Password)</div><div class="value">${c.password}</div></div>
                                  <div style="font-size:8px;color:#9ca3af;margin-top:10px;">URL: academy.rillcod.com/student/login</div>
                                </div>
                              `).join('')}
                              <script>window.onload = () => { window.print(); }</script>
                              </body></html>
                            `;
                            const win = window.open('', '_blank');
                            win?.document.write(html);
                            win?.document.close();
                          }}
                          className="flex items-center gap-2 px-3 py-1 bg-emerald-500/10 border border-emerald-500/20 text-emerald-500 text-[10px] font-black uppercase tracking-widest rounded-none hover:bg-emerald-500/20 transition-all"
                        >
                          <PrinterIcon className="w-3.5 h-3.5" /> Print All Slips
                        </button>
                      </div>
                      <div className="space-y-2 max-h-48 overflow-y-auto pr-2 custom-scrollbar">
                        {syncResult.credentials.map((c: any, i: number) => (
                          <div key={i} className="bg-card shadow-sm border border-border rounded-none p-3 font-mono text-xs">
                            <p className="text-foreground font-bold">{c.name}</p>
                            <p className="text-muted-foreground mt-0.5">{c.email}</p>
                            <p className="text-emerald-400 font-bold mt-0.5">pw: {c.password}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {syncResult.errors?.length > 0 && (
                    <div>
                      <p className="text-xs font-bold text-rose-400/60 uppercase tracking-widest mb-2">Errors ({syncResult.errors.length})</p>
                      <div className="space-y-1 text-xs text-rose-400/80 bg-rose-500/5 border border-rose-500/20 rounded-none p-3">
                        {syncResult.errors.map((e: string, i: number) => <p key={i}>• {e}</p>)}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
            <div className="p-4 border-t border-border flex-shrink-0">
              <button onClick={() => setSyncResult(null)} className="w-full py-2.5 bg-blue-600 hover:bg-blue-500 text-foreground font-bold rounded-none text-sm transition-all">
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Credentials Modal ─────────────────────────────── */}
      {credentials && (
        <div className="fixed inset-0 z-[100] bg-black/90 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-[#1a1a1a] border-l-8 border-l-emerald-500 border border-border rounded-none w-full max-w-md shadow-2xl overflow-hidden shadow-emerald-500/10">
            <div className="p-8 border-b border-border flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-emerald-500/10 border border-emerald-500/20 rounded-none flex items-center justify-center rotate-3">
                  <ShieldCheckIcon className="w-6 h-6 text-emerald-500" />
                </div>
                <div>
                  <h3 className="font-black text-foreground uppercase tracking-tight italic">Uplink Successful</h3>
                  <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">Credentials for {credentials.name}</p>
                </div>
              </div>
              <button onClick={() => { setCredentials(null); load(); }} className="p-2 hover:bg-card shadow-sm rounded-none transition-colors border border-border">
                <XMarkIcon className="w-5 h-5 text-muted-foreground" />
              </button>
            </div>
            
            <div className="p-8 space-y-6">
              <div className="bg-amber-500/5 border border-amber-500/20 rounded-none p-4 text-[10px] font-bold text-amber-500/80 italic leading-relaxed uppercase tracking-widest">
                <div className="flex items-start gap-3">
                   <ExclamationTriangleIcon className="w-4 h-4 flex-shrink-0" />
                   <span>Security Protocol: Copy these credentials immediately. Passwords are encrypted after transmission. Update required first login.</span>
                </div>
              </div>

              {[
                { label: 'Login Sector (Email)', value: credentials.email },
                { label: 'Cipher Key (Password)', value: credentials.tempPassword },
              ].map(({ label, value }) => (
                <div key={label}>
                  <p className="text-[9px] font-black text-slate-600 uppercase tracking-[0.3em] mb-2">{label}</p>
                  <div className="flex items-center gap-px">
                    <div className="flex-1 px-5 py-3.5 bg-black/40 border border-border rounded-none text-foreground font-mono text-sm select-all">
                      {value}
                    </div>
                    <button
                      onClick={() => navigator.clipboard.writeText(value)}
                      className="p-3.5 bg-emerald-500 text-foreground hover:bg-emerald-600 transition-colors rounded-none"
                      title="Copy">
                      <ClipboardIcon className="w-5 h-5" />
                    </button>
                  </div>
                </div>
              ))}

              <button
                onClick={() => {
                  navigator.clipboard.writeText(
                    `Email: ${credentials.email}\nPassword: ${credentials.tempPassword}`
                  );
                  alert('Bulk credentials copied to clipboard.');
                }}
                className="w-full flex items-center justify-center gap-3 py-4 bg-card shadow-sm border border-border text-foreground text-[10px] font-black uppercase tracking-[0.4em] rounded-none hover:bg-muted transition-all mt-4">
                <ClipboardIcon className="w-4 h-4" /> Copy Protocol Package
              </button>

              <button
                onClick={() => { setCredentials(null); load(); }}
                className="w-full py-5 bg-emerald-500 text-foreground font-black text-xs uppercase tracking-[0.5em] rounded-none hover:bg-emerald-600 transition-all">
                Clear & Finalize
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="min-h-screen bg-background text-foreground">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-10 space-y-6 sm:space-y-10">

          {/* ── Header ─────────────────────────────────────── */}
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6 print:hidden">
            <div>
              <div className="flex items-center gap-2 mb-2 sm:mb-3">
                <div className="p-2 rounded-none bg-blue-500/10 border border-blue-500/20">
                  <UserGroupIcon className="w-5 h-5 text-blue-400" />
                </div>
                <span className="text-[10px] font-black text-blue-400/80 uppercase tracking-[0.2em]">
                  Registry · {profile?.role}
                </span>
              </div>
              <h1 className="text-2xl sm:text-4xl font-black tracking-tight text-foreground leading-none">Students</h1>
              <p className="text-muted-foreground text-sm sm:text-lg mt-3 font-medium max-w-2xl">
                Manage registrations, parent info, approvals and student records
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2 sm:gap-3">
              <div className="flex items-center gap-2 w-full sm:w-auto">
                <button onClick={() => { load(); loadPortalStudents(); }} title="Refresh"
                  className="p-3 bg-card shadow-sm hover:bg-muted border border-border rounded-none text-muted-foreground hover:text-foreground transition-all">
                  <ArrowPathIcon className="w-4 h-4" />
                </button>
                <div className="flex items-center gap-2 flex-1 sm:flex-none">
                  <button onClick={handlePrintRegistry}
                    className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-5 py-3 bg-card shadow-sm hover:bg-muted text-muted-foreground hover:text-foreground text-[10px] font-black uppercase tracking-widest rounded-none border border-border transition-all print:hidden">
                    <PrinterIcon className="w-4 h-4" /> Print Registry
                  </button>
                  <button onClick={handlePrintAllLoginSlips}
                    className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-5 py-3 bg-orange-600 hover:bg-orange-500 text-foreground text-[10px] font-black uppercase tracking-widest rounded-none shadow-lg shadow-orange-600/20 transition-all print:hidden">
                    <KeyIcon className="w-4 h-4" /> Access Cards
                  </button>
                  <button onClick={exportCSV}
                    className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-5 py-3 bg-card shadow-sm hover:bg-muted text-muted-foreground hover:text-foreground text-[10px] font-black uppercase tracking-widest rounded-none border border-border transition-all print:hidden">
                    <ArrowDownTrayIcon className="w-4 h-4" /> Export
                  </button>
                </div>
              </div>
              
              <div className="flex items-center gap-2 w-full lg:w-auto">
                {(profile?.role === 'admin' || profile?.role === 'teacher' || profile?.role === 'school') && (
                  <button
                    onClick={handleSync}
                    disabled={syncing}
                    className={`flex-1 lg:flex-none flex items-center justify-center gap-2 px-6 py-3 text-[10px] font-black uppercase tracking-widest rounded-none transition-all disabled:opacity-50 ${gapCount ? 'bg-amber-500/10 border border-amber-500/20 text-amber-500 hover:bg-amber-500/20'
                      : 'bg-card shadow-sm border border-border text-muted-foreground hover:bg-muted hover:text-foreground'
                      }`}
                  >
                    {syncing ? <ArrowPathIcon className="w-4 h-4 animate-spin" /> : <BoltIcon className="w-4 h-4" />}
                    {syncing ? 'Syncing' : gapCount ? `Sync ${gapCount}` : 'Sync'}
                  </button>
                )}
              </div>
            </div>
          </div>


          {/* ── Error ──────────────────────────────────────── */}
          {error && (
            <div className="flex items-center gap-4 bg-rose-500/10 border border-rose-500/20 rounded-none p-5 shadow-2xl animate-shake">
              <div className="w-10 h-10 rounded-none bg-rose-500/20 flex items-center justify-center flex-shrink-0">
                <ExclamationTriangleIcon className="w-5 h-5 text-rose-400" />
              </div>
              <p className="text-rose-400 text-sm font-bold">{error}</p>
            </div>
          )}

          {/* ── Stats ──────────────────────────────────────── */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 print:hidden px-1 sm:px-0">
            {([
              { label: 'Total', value: combined.length, icon: UserGroupIcon, color: 'text-blue-400', bg: 'bg-blue-500/10', active: sourceFilter === 'all' && filter === 'all', onClick: () => { setSourceFilter('all'); setFilter('all'); } },
              { label: 'Enrolled', value: normalizedEnrolled.length, icon: AcademicCapIcon, color: 'text-emerald-400', bg: 'bg-emerald-500/10', active: sourceFilter === 'enrolled', onClick: () => setSourceFilter(sourceFilter === 'enrolled' ? 'all' : 'enrolled') },
              { label: 'Applications', value: normalizedApplications.length, icon: ClipboardDocumentListIcon, color: 'text-orange-400', bg: 'bg-orange-500/10', active: sourceFilter === 'applications', onClick: () => setSourceFilter(sourceFilter === 'applications' ? 'all' : 'applications') },
              { label: 'Pending', value: pending, icon: ClockIcon, color: 'text-amber-400', bg: 'bg-amber-500/10', active: filter === 'pending', onClick: () => setFilter(filter === 'pending' ? 'all' : 'pending') },
            ]).map(s => (
              <button key={s.label} onClick={s.onClick}
                className={`group relative text-left bg-card shadow-sm border rounded-none p-5 sm:p-6 transition-all hover:bg-white/8 overflow-hidden ${s.active ? 'border-border ring-1 ring-white/10' : 'border-border'}`}>
                <div className={`absolute top-0 right-0 w-24 h-24 ${s.bg} rounded-full blur-3xl opacity-20 -mr-12 -mt-12 group-hover:scale-150 transition-transform`} />
                <div className={`w-10 h-10 sm:w-12 sm:h-12 ${s.bg} rounded-none flex items-center justify-center mb-4 group-hover:scale-110 transition-transform`}>
                  <s.icon className={`w-5 h-5 sm:w-6 sm:h-6 ${s.color}`} />
                </div>
                <p className={`text-2xl sm:text-4xl font-black ${s.color} tabular-nums`}>{s.value}</p>
                <p className="text-[10px] sm:text-xs text-muted-foreground font-black uppercase tracking-widest mt-1.5">{s.label}</p>
              </button>
            ))}
          </div>

          {/* ── Pending alert ───────────────────────────────── */}
          {pending > 0 && (
            <div className="flex items-center gap-4 bg-amber-500/10 border border-amber-500/20 rounded-none p-4">
              <ClockIcon className="w-6 h-6 text-amber-400 flex-shrink-0" />
              <div className="flex-1">
                <p className="font-bold text-amber-400">{pending} student{pending !== 1 ? 's' : ''} awaiting approval</p>
                <p className="text-xs text-muted-foreground mt-0.5">Click a student row to expand and approve</p>
              </div>
              <button onClick={() => { setSourceFilter('applications'); setFilter('pending'); }}
                className="px-4 py-1.5 bg-amber-500/20 hover:bg-amber-500/30 text-amber-400 text-xs font-bold rounded-none transition-colors print:hidden">
                Show Pending
              </button>
            </div>
          )}

          {/* Print Header (Only visible when printing) */}
          <div className="hidden print:block mb-8">
            <h1 className="text-2xl font-black text-black">Student List</h1>
            <p className="text-sm text-gray-500">
              {profile?.school_name || 'School Report'} · {new Date().toLocaleDateString()}
            </p>
          </div>

          {/* ── Search + Filters ─────────────────────────────── */}
          <div className="flex flex-col gap-3 print:hidden">
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input type="text"
                  placeholder="Search name, email, school, class, city…"
                  value={search} onChange={e => setSearch(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 bg-card shadow-sm border border-border rounded-none text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:border-blue-500 transition-colors" />
              </div>
              <select value={sourceFilter} onChange={e => setSourceFilter(e.target.value as any)}
                className="px-4 py-3 bg-card shadow-sm border border-border rounded-none text-sm text-foreground focus:outline-none focus:border-blue-500 cursor-pointer">
                <option value="all">All Students</option>
                <option value="enrolled">Enrolled Portal</option>
                <option value="applications">Applications</option>
              </select>
              <select value={filter} onChange={e => setFilter(e.target.value)}
                className="px-4 py-3 bg-card shadow-sm border border-border rounded-none text-sm text-foreground focus:outline-none focus:border-blue-500 cursor-pointer">
                <option value="all">All Status</option>
                <option value="active">Active</option>
                <option value="pending">Pending</option>
                <option value="approved">Approved</option>
                <option value="rejected">Rejected</option>
              </select>
            </div>
            {/* Registry print filters */}
            <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
              <span className="text-[10px] font-black text-white/25 uppercase tracking-widest flex-shrink-0 sm:mt-0 mt-1">Filter for print:</span>
              <select value={filterSchoolReg} onChange={e => setFilterSchoolReg(e.target.value)}
                className="flex-1 px-4 py-2.5 bg-card shadow-sm border border-border rounded-none text-sm text-foreground focus:outline-none focus:border-blue-500 cursor-pointer">
                <option value="">All Schools</option>
                {distinctSchoolsReg.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
              <select value={filterClassReg} onChange={e => setFilterClassReg(e.target.value)}
                className="flex-1 px-4 py-2.5 bg-card shadow-sm border border-border rounded-none text-sm text-foreground focus:outline-none focus:border-blue-500 cursor-pointer">
                <option value="">All Classes / Grades</option>
                {distinctClassesReg.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
              {(filterSchoolReg || filterClassReg) && (
                <button onClick={() => { setFilterSchoolReg(''); setFilterClassReg(''); }}
                  className="px-3 py-2.5 bg-card shadow-sm hover:bg-muted border border-border rounded-none text-xs text-muted-foreground hover:text-foreground transition-all flex-shrink-0">
                  Clear
                </button>
              )}
              <button onClick={handlePrintRegistry}
                className="flex items-center gap-2 px-5 py-2.5 bg-blue-600/20 hover:bg-blue-600/30 border border-blue-500/30 text-blue-400 text-[10px] font-black uppercase tracking-widest rounded-none transition-all flex-shrink-0">
                <PrinterIcon className="w-3.5 h-3.5" /> Generate Registry
              </button>
            </div>
          </div>

          {/* ── Empty ───────────────────────────────────────── */}
          {filtered.length === 0 && !error && (
            <div className="text-center py-20 bg-card shadow-sm border border-border rounded-none">
              <UserGroupIcon className="w-14 h-14 mx-auto text-muted-foreground mb-4" />
              <p className="text-lg font-semibold text-muted-foreground">No students found</p>
              <p className="text-sm text-muted-foreground mt-1">
                {search ? 'Try a different search term' : 'Students will appear here once they register or enrol'}
              </p>
            </div>
          )}

          {/* ── Unified Student List ──────────────────────────── */}
          {filtered.length > 0 && (
            <div className="bg-card shadow-sm border border-border rounded-none overflow-hidden">
              <div className="p-5 border-b border-border flex items-center justify-between">
                <h3 className="font-bold text-foreground flex items-center gap-2">
                  <AcademicCapIcon className="w-5 h-5 text-blue-400" /> Student Records
                </h3>
                <span className="text-xs text-muted-foreground">{filtered.length} of {combined.length} shown</span>
              </div>

              <div className="divide-y divide-white/5">
                {filtered.map((s: any) => {
                  const isExpanded = expanded === s.id;
                  const isEnrolled = s._source === 'enrolled';
                  const age = calcAge(s.date_of_birth);
                  return (
                    <div key={`${s._source}-${s.id}`}>
                      {/* ── Row ─── */}
                      <div
                        className="flex items-start gap-4 p-5 hover:bg-card shadow-sm transition-colors cursor-pointer group"
                        onClick={() => setExpanded(isExpanded ? null : s.id)}>

                        {/* Checkbox (enrolled students only — Admin only) */}
                        {isEnrolled && profile?.role === 'admin' && (
                          <div
                            onClick={e => { e.stopPropagation(); setSelectedForEnrol(prev => { const n = new Set(prev); if (n.has(s.id)) n.delete(s.id); else n.add(s.id); return n; }); }}
                            className={`flex-shrink-0 w-5 h-5 rounded border-2 flex items-center justify-center mt-3 transition-all cursor-pointer ${selectedForEnrol.has(s.id) ? 'bg-orange-600 border-orange-400' : 'border-border hover:border-orange-400'}`}>
                            {selectedForEnrol.has(s.id) && <CheckCircleIcon className="w-3 h-3 text-foreground" />}
                          </div>
                        )}

                        {/* Avatar */}
                        <div className={`w-11 h-11 rounded-full bg-gradient-to-br ${isEnrolled ? 'from-orange-600 to-orange-400 to-teal-600' : 'from-orange-600 to-orange-400 to-orange-600'} flex items-center justify-center text-sm font-black text-foreground flex-shrink-0 mt-0.5`}>
                          {(s.full_name ?? '?').split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase()}
                        </div>

                        <div className="flex-1 min-w-0">
                          {/* Name + badges */}
                          <div className="flex items-center gap-2 flex-wrap mb-1.5">
                            <span className="font-bold text-foreground">{s.full_name}</span>
                            <span className={`text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full border ${isEnrolled ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-orange-500/10 text-orange-400 border-orange-500/20'}`}>
                              {isEnrolled ? 'Enrolled' : 'Application'}
                            </span>
                            <StatusBadge status={s.status} />
                            {s.gender && (
                              <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-card shadow-sm text-muted-foreground border border-border">
                                {s.gender}
                              </span>
                            )}
                          </div>

                          {/* Chips row */}
                          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                            <Chip icon={BuildingOfficeIcon} text={s.school_name} />
                            {isEnrolled ? (
                              <>
                                <Chip icon={AcademicCapIcon} text={s.section_class} />
                                {s.class_id && classMap[s.class_id] && (
                                  <Chip icon={BookOpenIcon} text={classMap[s.class_id]} />
                                )}
                                <Chip icon={EnvelopeIcon} text={s.email} />
                              </>
                            ) : (
                              <>
                                <Chip icon={AcademicCapIcon} text={s.grade_level} />
                                <Chip icon={MapPinIcon} text={[s.city, s.state].filter(Boolean).join(', ')} />
                                <Chip icon={BookOpenIcon} text={s.enrollment_type ? `${s.enrollment_type} enrolment` : ''} />
                                <Chip icon={CalendarIcon} text={s.created_at ? `Reg ${new Date(s.created_at).toLocaleDateString('en-GB')}` : ''} />
                              </>
                            )}
                          </div>

                          {/* Parent summary (applications only) */}
                          {!isEnrolled && s.parent_name && (
                            <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                              <UserIcon className="w-3 h-3" />
                              <span>Parent: <span className="text-muted-foreground font-semibold">{s.parent_name}</span></span>
                              {s.parent_phone && <span className="text-muted-foreground">·</span>}
                              {s.parent_phone && <span>{s.parent_phone}</span>}
                            </div>
                          )}
                        </div>

                        {/* Right side: actions + expand */}
                        <div className="flex items-center gap-2 flex-shrink-0 print:hidden ml-auto">
                          <div className="hidden sm:flex items-center gap-2">
                            {!isEnrolled && s.status === 'pending' && (profile?.role === 'admin' || profile?.role === 'teacher') && (
                              <>
                                <button
                                  onClick={e => { e.stopPropagation(); approve(s.id); }}
                                  disabled={acting === s.id}
                                  className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-foreground text-[10px] font-black uppercase tracking-widest rounded-none transition-all disabled:opacity-50">
                                  <CheckCircleIcon className="w-3.5 h-3.5" />
                                  {acting === s.id ? '…' : 'Approve'}
                                </button>
                                <button
                                  onClick={e => { e.stopPropagation(); reject(s.id); }}
                                  disabled={acting === s.id}
                                  className="flex items-center gap-1.5 px-3 py-1.5 bg-rose-600 hover:bg-rose-500 text-foreground text-[10px] font-black uppercase tracking-widest rounded-none transition-all disabled:opacity-50">
                                  <XCircleIcon className="w-3.5 h-3.5" />
                                  {acting === s.id ? '…' : 'Reject'}
                                </button>
                              </>
                            )}
                          </div>
                          <div className="flex items-center gap-1.5">
                            {!isEnrolled && (
                              <button
                                onClick={e => { e.stopPropagation(); startEdit(s); }}
                                className="p-2 rounded-none bg-card shadow-sm border border-border hover:border-orange-500/30 text-muted-foreground hover:text-foreground transition-all">
                                <PencilSquareIcon className="w-4 h-4" />
                              </button>
                            )}
                            {!isEnrolled && (
                              <button
                                onClick={e => { e.stopPropagation(); handleDeleteStudent(s.id); }}
                                disabled={deleting === s.id}
                                className="p-2 rounded-none bg-rose-500/5 border border-rose-500/20 hover:border-rose-500/40 text-rose-400/60 hover:text-rose-400 transition-all disabled:opacity-50">
                                <XMarkIcon className="w-4 h-4" />
                              </button>
                            )}
                            <div className="p-2 rounded-none bg-card shadow-sm border border-border text-muted-foreground">
                              {isExpanded
                                ? <ChevronUpIcon className="w-4 h-4" />
                                : <ChevronDownIcon className="w-4 h-4" />}
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* ── Expanded Detail Panel ─── */}
                      {isExpanded && (
                        <div className="bg-white/[0.03] border-t border-border p-4 sm:p-8">
                          {isEnrolled ? (
                            /* Enrolled student detail */
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                              <div className="bg-card shadow-sm rounded-none p-5 border border-border">
                                <p className="text-[10px] font-black text-muted-foreground uppercase tracking-[0.2em] mb-4 flex items-center gap-3">
                                  <AcademicCapIcon className="w-4 h-4 text-emerald-500" /> Portal Account
                                </p>
                                <div className="space-y-3.5">
                                  <InfoRow label="Email" value={s.email} icon={<EnvelopeIcon className="w-3 h-3 text-muted-foreground" />} />
                                  <InfoRow label="School" value={s.school_name} />
                                  <InfoRow label="Grade / Class" value={s.section_class} />
                                  <InfoRow label="Enrolled Class" value={s.class_id && classMap[s.class_id] ? classMap[s.class_id] : undefined} />
                                  <InfoRow label="Status" value={s.is_active ? 'Active' : 'Inactive'} />
                                </div>
                              </div>
                              {profile?.role !== 'school' && (
                                <div className="bg-card shadow-sm rounded-none p-5 border border-border">
                                  <p className="text-[10px] font-black text-muted-foreground uppercase tracking-[0.2em] mb-4">Assign School</p>
                                  <select
                                    value={s.school_id ?? ''}
                                    disabled={assigningSchool === s.id}
                                    onChange={e => assignStudentSchool(s.id, e.target.value)}
                                    className="w-full px-3 py-2.5 bg-card shadow-sm border border-border rounded-none text-sm text-foreground focus:outline-none focus:border-blue-500 cursor-pointer disabled:opacity-40"
                                  >
                                    <option value="">— No School —</option>
                                    {schoolList.map(sc => (
                                      <option key={sc.id} value={sc.id}>{sc.name}</option>
                                    ))}
                                  </select>
                                  {assigningSchool === s.id && (
                                    <p className="mt-2 text-[10px] text-muted-foreground">Saving…</p>
                                  )}
                                </div>
                              )}
                            </div>
                          ) : (
                            /* Application student detail */
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 sm:gap-8">
                              <div className="bg-card shadow-sm rounded-none p-5 sm:p-6 border border-border shadow-2xl">
                                <p className="text-[10px] font-black text-muted-foreground uppercase tracking-[0.2em] mb-4 flex items-center gap-3">
                                  <UserIcon className="w-4 h-4 text-blue-500" /> Parent / Guardian
                                </p>
                                <div className="space-y-3.5">
                                  <InfoRow label="Name" value={s.parent_name} />
                                  <InfoRow label="Relationship" value={s.parent_relationship} />
                                  <InfoRow label="Phone" value={s.parent_phone} icon={<PhoneIcon className="w-3 h-3 text-muted-foreground" />} />
                                  <InfoRow label="Email" value={s.parent_email} icon={<EnvelopeIcon className="w-3 h-3 text-muted-foreground" />} />
                                </div>
                              </div>
                              <div className="bg-card shadow-sm rounded-none p-5 sm:p-6 border border-border shadow-2xl">
                                <p className="text-[10px] font-black text-muted-foreground uppercase tracking-[0.2em] mb-4 flex items-center gap-3">
                                  <AcademicCapIcon className="w-4 h-4 text-orange-500" /> Identity
                                </p>
                                <div className="space-y-3.5">
                                  <InfoRow label="Full Name" value={s.full_name} />
                                  <InfoRow label="Gender" value={s.gender} />
                                  <InfoRow label="Age" value={age ? `${age} yrs` : undefined} />
                                  <InfoRow label="Grade" value={s.grade_level} />
                                  <InfoRow label="School" value={s.school_name} />
                                  <InfoRow label="Location" value={[s.city, s.state].filter(Boolean).join(', ')} />
                                </div>
                              </div>
                              <div className="bg-background rounded-none p-5 sm:p-6 border border-border shadow-2xl">
                                <p className="text-[10px] font-black text-muted-foreground uppercase tracking-[0.2em] mb-4 flex items-center gap-3">
                                  <BookOpenIcon className="w-4 h-4 text-emerald-500" /> Programme
                                </p>
                                <div className="space-y-3.5">
                                  <InfoRow label="Interests" value={s.interests} />
                                  <InfoRow label="Course Interest" value={s.course_interest} />
                                  <InfoRow label="Schedule" value={s.preferred_schedule} />
                                  <InfoRow label="Enrollment" value={s.enrollment_type} />
                                  <InfoRow label="Applied" value={new Date(s.created_at).toLocaleDateString('en-GB')} />
                                  {s.approved_at && (
                                    <InfoRow label="Approved" value={new Date(s.approved_at).toLocaleDateString('en-GB')} />
                                  )}
                                </div>
                              </div>
                            </div>
                          )}

                          {/* Action bar at bottom of expanded */}
                          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-4 mt-8 pt-8 border-t border-border">
                            {!isEnrolled && s.status === 'pending' && (profile?.role === 'admin' || profile?.role === 'teacher') && (
                              <div className="flex items-center gap-3">
                                <button onClick={() => approve(s.id)} disabled={acting === s.id}
                                  className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-6 py-3 bg-emerald-600 hover:bg-emerald-500 text-foreground text-[10px] font-black uppercase tracking-widest rounded-none transition-all disabled:opacity-50 shadow-2xl shadow-emerald-600/20 active:scale-95">
                                  <CheckCircleIcon className="w-4 h-4" />
                                  {acting === s.id ? '…' : `Approve ${s.full_name?.split(' ')[0]}`}
                                </button>
                                <button onClick={() => reject(s.id)} disabled={acting === s.id}
                                  className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-6 py-3 bg-rose-600 hover:bg-rose-500 text-foreground text-[10px] font-black uppercase tracking-widest rounded-none transition-all disabled:opacity-50 active:scale-95">
                                  <XCircleIcon className="w-4 h-4" />
                                  {acting === s.id ? '…' : 'Reject'}
                                </button>
                              </div>
                            )}
                            {!isEnrolled && s.status === 'approved' && (
                              <div className="flex flex-wrap items-center gap-4">
                                <div className="flex items-center gap-2 px-4 py-2 rounded-none bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[10px] font-black uppercase tracking-widest">
                                  <CheckCircleIcon className="w-3.5 h-3.5" />
                                  Approved Student
                                </div>
                                {s.user_id ? (
                                  <div className="flex items-center gap-2 px-4 py-2 rounded-none bg-orange-600/10 border border-orange-500/20 text-orange-400 text-[10px] font-black uppercase tracking-widest">
                                    <ShieldCheckIcon className="w-3.5 h-3.5" />
                                    Portal Active
                                  </div>
                                ) : (
                                  <button
                                    onClick={() => activatePortalAccount(s.id, s.full_name)}
                                    disabled={activating === s.id}
                                    className="flex items-center gap-2 px-5 py-2.5 bg-orange-600 hover:bg-orange-500 disabled:opacity-50 text-foreground text-[10px] font-black uppercase tracking-widest rounded-none transition-all shadow-2xl active:scale-95">
                                    <KeyIcon className="w-4 h-4" />
                                    {activating === s.id ? 'Creating' : 'Activate Portal'}
                                  </button>
                                )}
                              </div>
                            )}
                            {!isEnrolled && s.status === 'rejected' && (
                              <div className="flex items-center gap-2 px-4 py-2 rounded-none bg-rose-500/10 border border-rose-500/20 text-rose-400 text-[10px] font-black uppercase tracking-widest">
                                <XCircleIcon className="w-3.5 h-3.5" />
                                Registration Rejected
                              </div>
                            )}
                            <div className="ml-auto flex items-center gap-5">
                              {!isEnrolled && (
                                <Link href={`/dashboard/students/${s.id}/report`}
                                  className="flex items-center gap-2 text-[10px] font-black text-orange-400 hover:text-foreground uppercase tracking-widest transition-colors">
                                  <ClipboardDocumentListIcon className="w-4 h-4" /> Report
                                </Link>
                              )}
                              {s.parent_email && (
                                <a href={`mailto:${s.parent_email}`}
                                  className="flex items-center gap-2 text-[10px] font-black text-muted-foreground hover:text-foreground uppercase tracking-widest transition-colors">
                                  <EnvelopeIcon className="w-4 h-4" /> Mail
                                </a>
                              )}
                              {(isEnrolled || s.user_id) && (
                                <button onClick={() => handlePrintLoginSlip(s)}
                                  className="flex items-center gap-2 text-[10px] font-black text-orange-500 hover:text-orange-400 uppercase tracking-widest transition-colors">
                                  <PrinterIcon className="w-4 h-4" /> Print Slip
                                </button>
                              )}
                              {isEnrolled && s.email && (
                                <a href={`mailto:${s.email}`}
                                  className="flex items-center gap-2 text-[10px] font-black text-muted-foreground hover:text-foreground uppercase tracking-widest transition-colors">
                                  <EnvelopeIcon className="w-4 h-4" /> Mail
                                </a>
                              )}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

        </div>
      </div>

      {/* ── Floating Bulk Enrol Bar ───────────────────────── */}
      {selectedForEnrol.size > 0 && profile?.role === 'admin' && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 print:hidden">
          <div className="flex items-center gap-3 bg-background border border-orange-500/40 rounded-none px-5 py-3 shadow-2xl shadow-orange-500/20">
            <span className="text-sm font-bold text-foreground">{selectedForEnrol.size} selected</span>
            <button
              onClick={openBulkEnrol}
              className="px-4 py-2 bg-orange-600 hover:bg-orange-500 text-foreground text-sm font-bold rounded-none transition-all flex items-center gap-2"
            >
              <AcademicCapIcon className="w-4 h-4" /> Enrol in Class
            </button>
            <button
              onClick={() => setSelectedForEnrol(new Set())}
              className="p-2 hover:bg-muted rounded-none text-muted-foreground hover:text-foreground transition-all"
            >
              <XMarkIcon className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      <AddStudentModal
        isOpen={showAdd}
        onClose={() => { setShowAdd(false); setEditingStudent(null); }}
        onSuccess={() => { setShowAdd(false); setEditingStudent(null); load(); loadPortalStudents(); }}
        initialData={editingStudent}
      />

      <style jsx global>{`
        @media print {
          body { background: white !important; color: black !important; }
          .bg-\[\#0f0f1a\], .bg-gradient-to-br { background: white !important; }
          .bg-white\/5, .bg-white\/8, .bg-white\/10 { background: #f9fafb !important; border-color: #e5e7eb !important; }
          .text-foreground, .text-foreground\/60, .text-foreground\/40, .text-foreground\/30 { color: #111827 !important; }
          .border-border\/10, .border-border\/20, .border-border\/5 { border-color: #e5e7eb !important; }
          .max-w-7xl { max-width: 100% !important; padding: 0 !important; }
          .shadow-xl, .shadow-lg, .shadow-blue-600\/20, .shadow-2xl { box-shadow: none !important; }
          .print\:hidden { display: none !important; }
          h1, h2, h3 { color: black !important; }
          .divide-white\/5 { divide-color: #e5e7eb !important; }
        }
      `}</style>
    </>
  );
}

/* ════════════════════════════════════════════════════════════
   STUDENT SELF VIEW — shown when a student-role user visits /students
════════════════════════════════════════════════════════════ */
function StudentSelfView() {
  const { profile } = useAuth();
  const [stats, setStats] = useState({ enrolled: 0, submitted: 0, graded: 0, avgPct: 0, letter: '—' });
  const [recent, setRecent] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    setNow(new Date());
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (!profile?.id) return;
    load();
  }, [profile?.id]); // eslint-disable-line

  async function load() {
    setLoading(true);
    const supabase = createClient();
    const uid = profile?.id || '';
    const [enrRes, subsRes, gradedRes, recentRes] = await Promise.allSettled([
      supabase.from('enrollments').select('id', { count: 'exact', head: true }).eq('user_id', uid),
      supabase.from('assignment_submissions').select('id', { count: 'exact', head: true }).eq('portal_user_id', uid),
      supabase.from('assignment_submissions')
        .select('grade, assignments(max_points)')
        .eq('portal_user_id', uid)
        .not('grade', 'is', null)
        .limit(50),
      supabase.from('assignment_submissions')
        .select('id, grade, status, submitted_at, assignments(title, max_points)')
        .eq('portal_user_id', uid)
        .order('submitted_at', { ascending: false })
        .limit(5),
    ]);

    const enrolled = enrRes.status === 'fulfilled' ? (enrRes.value.count ?? 0) : 0;
    const submitted = subsRes.status === 'fulfilled' ? (subsRes.value.count ?? 0) : 0;
    const gradedData = gradedRes.status === 'fulfilled' ? (gradedRes.value.data ?? []) : [];
    const avgPct = gradedData.length > 0
      ? Math.round(gradedData.reduce((s: number, g: any) => {
        const max = g.assignments?.max_points ?? 100;
        return s + (g.grade / max) * 100;
      }, 0) / gradedData.length)
      : 0;
    const letter = avgPct >= 90 ? 'A' : avgPct >= 80 ? 'B' : avgPct >= 70 ? 'C' : avgPct >= 60 ? 'D' : gradedData.length ? 'F' : '—';
    const recentData = recentRes.status === 'fulfilled' ? (recentRes.value.data ?? []) : [];

    setStats({ enrolled, submitted, graded: gradedData.length, avgPct, letter });
    setRecent(recentData);
    setLoading(false);
  }

  if (loading) return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="w-10 h-10 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  const quickActions = [
    { name: 'My Courses', href: '/dashboard/courses', icon: BookOpenIcon, desc: 'View enrolled courses' },
    { name: 'Assignments', href: '/dashboard/assignments', icon: ClipboardDocumentListIcon, desc: 'View & submit work' },
    { name: 'Grades', href: '/dashboard/grades', icon: CheckCircleIcon, desc: 'See your grades' },
    { name: 'My Report Card', href: '/dashboard/results', icon: StarIcon, desc: 'View your report card' },
  ];

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">

        {/* Header */}
        <div className="bg-background border border-emerald-500/20 rounded-[2.5rem] sm:rounded-[4rem] p-8 sm:p-16 relative overflow-hidden shadow-2xl group">
          <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-emerald-600/10 blur-[120px] -mr-64 -mt-64 pointer-events-none group-hover:bg-emerald-600/20 transition-all duration-1000" />
          <div className="absolute bottom-0 left-0 w-[300px] h-[300px] bg-blue-600/10 blur-[100px] -ml-32 -mb-32 pointer-events-none" />
          
          <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-10">
            <div className="space-y-6">
              <div className="flex items-center gap-3">
                <div className="px-5 py-2 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[10px] font-black uppercase tracking-[0.3em] rounded-none shadow-xl">
                  Student Portal
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                  <span className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">System Active</span>
                </div>
              </div>
              
              <h1 className="text-4xl sm:text-7xl font-black text-foreground tracking-tighter leading-[0.9]">
                Welcome back,<br />
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-orange-600 to-orange-400 from-orange-600 to-orange-400">
                  {profile?.full_name?.split(' ')?.[0] || 'Scholar'}
                </span>
              </h1>
              
              <div className="flex items-center gap-6 pt-2">
                <div className="flex items-center gap-2.5 px-6 py-3 bg-card shadow-sm border border-border rounded-none text-[11px] font-black uppercase tracking-widest text-muted-foreground shadow-xl" suppressHydrationWarning>
                   <ClockIcon className="w-4 h-4 text-emerald-500" />
                   {now ? now.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }) : ''}
                </div>
              </div>
            </div>

            <div className="hidden lg:block relative">
               <div className="w-32 h-32 sm:w-48 sm:h-48 rounded-[2.5rem] bg-gradient-to-br from-orange-600 to-orange-400 from-orange-600 to-orange-400 flex items-center justify-center text-5xl sm:text-7xl font-black text-foreground shadow-3xl rotate-3 hover:rotate-0 transition-transform duration-500">
                 {profile?.full_name?.[0].toUpperCase()}
               </div>
               <div className="absolute -bottom-4 -right-4 w-12 h-12 sm:w-16 sm:h-16 bg-white rounded-none flex items-center justify-center text-black shadow-2xl -rotate-12">
                 <SparklesIcon className="w-6 h-6 sm:w-8 sm:h-8 text-emerald-600" />
               </div>
            </div>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6 print:hidden">
          {[
            { label: 'Enrolled Courses', value: stats.enrolled, icon: BookOpenIcon, color: 'text-blue-400', bg: 'bg-blue-500/10', border: 'border-blue-500/20' },
            { label: 'Work Submitted', value: stats.submitted, icon: ClipboardDocumentListIcon, color: 'text-orange-400', bg: 'bg-orange-500/10', border: 'border-orange-500/20' },
            { label: 'Graded Tasks', value: stats.graded, icon: CheckCircleIcon, color: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/20' },
            { label: 'Performance', value: stats.graded ? `${stats.letter} (${stats.avgPct}%)` : '—', icon: StarIcon, color: 'text-amber-400', bg: 'bg-amber-500/10', border: 'border-amber-500/20' },
          ].map(({ label, value, icon: Icon, color, bg, border }) => (
            <div key={label} className="bg-background border border-border rounded-none p-6 sm:p-8 hover:bg-white/[0.03] hover:border-border transition-all group relative overflow-hidden shadow-2xl">
              <div className={`absolute top-0 right-0 w-24 h-24 ${bg} opacity-[0.05] blur-3xl -mr-12 -mt-12 group-hover:scale-150 transition-transform`} />
              <div className={`w-12 h-12 sm:w-16 sm:h-16 rounded-none ${bg} ${border} border flex items-center justify-center mb-6 shadow-xl group-hover:scale-110 transition-transform`}>
                <Icon className={`h-6 w-6 sm:h-8 sm:w-8 ${color}`} />
              </div>
              <p className="text-3xl sm:text-5xl font-black text-foreground tracking-tighter tabular-nums relative z-10">{value}</p>
              <p className="text-[10px] sm:text-xs text-muted-foreground font-black uppercase tracking-[0.2em] mt-2 relative z-10">{label}</p>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          <div className="xl:col-span-2 space-y-6">

            {/* Quick Actions */}
            <div className="bg-card shadow-sm border border-border rounded-none p-6">
              <h2 className="text-lg font-bold text-foreground mb-5">Quick Actions</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {quickActions.map(({ name, href, icon: Icon, desc }) => (
                  <Link key={name} href={href}
                    className="group flex items-start gap-4 p-4 rounded-none border border-border hover:border-emerald-500/40 hover:bg-emerald-500/5 transition-all">
                    <div className="w-10 h-10 rounded-none bg-emerald-500/15 border border-emerald-500/20 flex items-center justify-center flex-shrink-0 group-hover:bg-emerald-500/25 transition-colors">
                      <Icon className="h-5 w-5 text-emerald-400" />
                    </div>
                    <div>
                      <p className="font-semibold text-foreground text-sm">{name}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{desc}</p>
                    </div>
                  </Link>
                ))}
              </div>
            </div>

            {/* Recent Activity */}
            <div className="bg-card shadow-sm border border-border rounded-none p-6">
              <div className="flex items-center justify-between mb-5">
                <h2 className="text-lg font-bold text-foreground">Recent Activity</h2>
                <button onClick={load} className="p-1.5 rounded-none hover:bg-muted text-muted-foreground hover:text-foreground transition-colors" title="Refresh">
                  <ArrowPathIcon className="w-4 h-4" />
                </button>
              </div>
              {recent.length === 0 ? (
                <div className="text-center py-8">
                  <ClipboardDocumentListIcon className="w-10 h-10 mx-auto text-muted-foreground mb-2" />
                  <p className="text-white/25 text-sm">No recent activity yet</p>
                </div>
              ) : (
                <div className="space-y-1">
                  {recent.map((s: any, i: number) => (
                    <div key={s.id} className={`flex items-start gap-3 py-3 ${i < recent.length - 1 ? 'border-b border-border' : ''}`}>
                      <div className={`w-9 h-9 rounded-none flex items-center justify-center flex-shrink-0 mt-0.5 ${s.status === 'graded' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-blue-500/20 text-blue-400'
                        }`}>
                        {s.status === 'graded'
                          ? <StarIcon className="h-4 w-4" />
                          : <ClipboardDocumentListIcon className="h-4 w-4" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-foreground text-sm">
                          {s.status === 'graded' ? 'Grade received' : 'Assignment submitted'}
                        </p>
                        <p className="text-xs text-muted-foreground truncate mt-0.5">
                          {s.assignments?.title ?? '—'}
                          {s.grade != null ? ` · ${s.grade}/${s.assignments?.max_points ?? 100}` : ''}
                        </p>
                      </div>
                      <span className="text-xs text-white/25 whitespace-nowrap mt-0.5">
                        {s.submitted_at ? new Date(s.submitted_at).toLocaleDateString() : '—'}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Sidebar */}
          <div className="space-y-5">
            <div className="bg-gradient-to-br from-orange-600 to-orange-400/20 from-orange-600 to-orange-400/20 border border-emerald-500/20 rounded-none p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-12 h-12 rounded-none bg-gradient-to-br from-orange-600 to-orange-400 from-orange-600 to-orange-400 flex items-center justify-center text-xl font-black text-foreground">
                  {(profile?.full_name ?? 'U')[0].toUpperCase()}
                </div>
                <div>
                  <p className="font-bold text-foreground truncate">{profile?.full_name}</p>
                  <p className="text-xs text-muted-foreground truncate">{profile?.email}</p>
                </div>
              </div>
              <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-bold border bg-emerald-500/20 text-emerald-400 border-emerald-500/30 capitalize">
                student
              </span>
              <div className="mt-4 pt-4 border-t border-border space-y-2">
                <Link href="/dashboard/progress"
                  className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors">
                  <AcademicCapIcon className="w-4 h-4" /> My Progress
                </Link>
                <Link href="/dashboard/settings"
                  className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors">
                  <UserIcon className="w-4 h-4" /> Account Settings
                </Link>
              </div>
            </div>

            <div className="bg-card shadow-sm border border-border rounded-none p-5">
              <h3 className="font-bold text-foreground text-sm mb-4">Navigate To</h3>
              <div className="space-y-1">
                {[
                  { label: 'My Courses', href: '/dashboard/courses', icon: BookOpenIcon },
                  { label: 'Lessons', href: '/dashboard/lessons', icon: AcademicCapIcon },
                  { label: 'Progress', href: '/dashboard/progress', icon: ClockIcon },
                  { label: 'Profile', href: '/dashboard/profile', icon: UserIcon },
                ].map(({ label, href, icon: Icon }) => (
                  <Link key={label} href={href}
                    className="flex items-center gap-3 px-3 py-2.5 rounded-none text-sm text-muted-foreground hover:bg-card shadow-sm hover:text-foreground transition-all group">
                    <Icon className="w-4 h-4 group-hover:text-emerald-400 transition-colors" />
                    {label}
                    <span className="ml-auto opacity-0 group-hover:opacity-60 transition-opacity text-muted-foreground">→</span>
                  </Link>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Small helper: label + value pair ──────────────────────
function InfoRow({ label, value, icon }: { label: string; value?: string | null; icon?: React.ReactNode }) {
  if (!value) return null;
  return (
    <div className="flex justify-between gap-2 text-xs">
      <span className="text-muted-foreground flex-shrink-0">{label}</span>
      <span className="text-muted-foreground font-medium text-right flex items-center gap-1">
        {icon}{value}
      </span>
    </div>
  );
}