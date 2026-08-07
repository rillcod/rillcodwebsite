// @refresh reset
'use client';

import { useState, useEffect, useCallback, type ComponentType } from 'react';
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
  PrinterIcon, UserPlusIcon,
} from '@/lib/icons';
import { AddStudentModal } from '@/features/students/components/AddStudentModal';
import { SINGLE_GRADES } from '@/lib/classes/naming';
import { fetchCardConfig, buildSingleCardHtml, openPrintWindow, holderCode, type CardHolder } from '@/lib/cards/printCard';
import { brandContact } from '@/config/brand';
import { isSpecialEnrollment } from '@/lib/registration/enrollment-types';

// ─── Status badge ─────────────────────────────────────────────
function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    approved: 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border-emerald-500/30',
    pending: 'bg-amber-500/20  text-amber-600 dark:text-amber-400  border-amber-500/30',
    rejected: 'bg-rose-500/20   text-rose-600 dark:text-rose-400   border-rose-500/30',
    active: 'bg-primary/20   text-primary   border-primary/30',
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

// ─── Fee status badge ─────────────────────────────────────────
function FeeBadge({ entry }: { entry?: { status: string; amount: number; currency: string; dueDate: string | null } }) {
  if (!entry) return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider border bg-muted/50 text-muted-foreground border-border">
      No invoice
    </span>
  );
  const s = entry.status.toLowerCase();
  const isOverdue = s === 'overdue' || (s === 'sent' && entry.dueDate && new Date(entry.dueDate) < new Date());
  const cfg = isOverdue
    ? { cls: 'bg-rose-500/15 text-rose-600 dark:text-rose-400 border-rose-500/30', label: 'Overdue' }
    : s === 'paid'
    ? { cls: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30', label: 'Paid' }
    : s === 'pending' || s === 'sent'
    ? { cls: 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30', label: 'Pending' }
    : { cls: 'bg-muted/50 text-muted-foreground border-border', label: entry.status };
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider border ${cfg.cls}`}
      title={`Fee: ${entry.currency} ${entry.amount.toLocaleString('en-NG')}${entry.dueDate ? ` · Due ${new Date(entry.dueDate).toLocaleDateString('en-GB')}` : ''}`}>
      {cfg.label === 'Paid' ? '✓' : cfg.label === 'Overdue' ? '⚠' : '·'} {cfg.label}
    </span>
  );
}

// ─── Link Parent Modal (inline on students page) ──────────────
function LinkParentModal({ student, onClose, onSaved }: {
  student: any;
  onClose: () => void;
  onSaved: () => void;
}) {
  const hasParent = !!student.parent_email;
  const [form, setForm] = useState({
    email: student.parent_email ?? '',
    full_name: student.parent_name ?? '',
    phone: student.parent_phone ?? '',
    relationship: student.parent_relationship ?? 'Guardian',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.email || !form.full_name) { setError('Email and full name are required'); return; }
    setSaving(true); setError(null);
    try {
      const res = await fetch('/api/parents/manage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: form.email,
          full_name: form.full_name,
          phone: form.phone || null,
          student_id: student.id,
          relationship: form.relationship,
        }),
      });
      if (!res.ok) { const j = await res.json(); throw new Error(j.error); }
      onSaved();
    } catch (err: any) {
      setError(err.message ?? 'Failed to save');
      setSaving(false);
    }
  };

  const handleUnlink = async () => {
    if (!confirm(`Remove parent link from ${student.full_name}?`)) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/parents/manage?student_id=${student.id}`, { method: 'DELETE' });
      if (!res.ok) { const j = await res.json(); throw new Error(j.error); }
      onSaved();
    } catch (err: any) {
      setError(err.message ?? 'Failed');
      setSaving(false);
    }
  };

  return (
    <div className="mobile-native-dialog fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-300">
      <div role="dialog" aria-modal="true" className="w-full max-w-md bg-[#0d1526]/95 border border-white/5 shadow-2xl rounded-2xl overflow-hidden backdrop-blur-md shadow-primary/5">
        <div className="flex items-center justify-between px-6 py-5 border-b border-white/5 bg-white/[0.01]">
          <div>
            <h2 className="text-sm font-black uppercase tracking-widest text-foreground flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-primary animate-pulse" />
              {hasParent ? 'Edit Parent Link' : 'Link Parent Profile'}
            </h2>
            <p className="text-[10px] text-muted-foreground font-semibold mt-1 uppercase tracking-wider">Student: {student.full_name}</p>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground w-8 h-8 rounded-lg hover:bg-white/5 flex items-center justify-center transition-colors">
            <XMarkIcon className="w-5 h-5" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <p className="text-xs text-rose-600 dark:text-rose-400 bg-rose-500/10 border border-rose-500/20 px-3 py-2 rounded-xl font-medium">
              ⚠️ {error}
            </p>
          )}
          <div>
            <label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest block mb-1.5">Parent Email *</label>
            <input type="email" required value={form.email}
              onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
              placeholder="parent@example.com"
              className="w-full px-4 py-2.5 bg-[#080d19] border border-white/5 rounded-xl text-sm text-foreground placeholder:text-muted-foreground/30 focus:outline-none focus:border-primary/50 transition-colors font-medium" />
          </div>
          <div>
            <label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest block mb-1.5">Full Name *</label>
            <input required value={form.full_name}
              onChange={e => setForm(f => ({ ...f, full_name: e.target.value }))}
              placeholder="Parent's full name"
              className="w-full px-4 py-2.5 bg-[#080d19] border border-white/5 rounded-xl text-sm text-foreground placeholder:text-muted-foreground/30 focus:outline-none focus:border-primary/50 transition-colors font-medium" />
          </div>
          <div>
            <label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest block mb-1.5">Phone</label>
            <input type="tel" value={form.phone}
              onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
              placeholder="+234 …"
              className="w-full px-4 py-2.5 bg-[#080d19] border border-white/5 rounded-xl text-sm text-foreground placeholder:text-muted-foreground/30 focus:outline-none focus:border-primary/50 transition-colors font-medium" />
          </div>
          <div className="relative">
            <label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest block mb-1.5">Relationship</label>
            <select value={form.relationship} onChange={e => setForm(f => ({ ...f, relationship: e.target.value }))}
              className="w-full px-4 py-2.5 bg-[#080d19] border border-white/5 rounded-xl text-sm text-foreground focus:outline-none focus:border-primary/50 transition-colors font-medium appearance-none cursor-pointer">
              {['Guardian', 'Father', 'Mother', 'Sibling', 'Uncle', 'Aunt', 'Other'].map(r => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
            <div className="absolute right-4 bottom-3.5 pointer-events-none text-muted-foreground/60">
              <ChevronDownIcon className="w-4 h-4" />
            </div>
          </div>
          <div className="flex gap-3 pt-3 border-t border-white/5 mt-4">
            {hasParent && (
              <button type="button" onClick={handleUnlink} disabled={saving}
                className="px-4 py-2.5 border border-rose-500/20 text-[10px] font-black uppercase tracking-widest text-rose-600 dark:text-rose-400 hover:bg-rose-500/10 hover:border-rose-500/40 rounded-xl transition-all disabled:opacity-50">
                Unlink
              </button>
            )}
            <button type="button" onClick={onClose}
              className="flex-1 px-4 py-2.5 bg-white/5 hover:bg-white/10 text-[10px] font-black uppercase tracking-widest text-muted-foreground hover:text-foreground rounded-xl transition-all">
              Cancel
            </button>
            <button type="submit" disabled={saving}
              className="flex-1 px-4 py-2.5 bg-primary hover:bg-primary/95 disabled:opacity-50 text-primary-foreground text-[10px] font-black uppercase tracking-widest rounded-xl transition-all shadow-lg shadow-primary/10">
              {saving ? 'Saving…' : hasParent ? 'Update' : 'Link Profile'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// Canonical grade vocabulary — the single dropdown source of truth (Nursery 1-3, Basic 1-6,
// JSS 1-3, SS 1-3). Shared with the report builder, roster and class naming.
const GRADE_LEVELS_LIST = SINGLE_GRADES;

// Natural Nigerian school grade order for sorting (canonical + legacy no-space variants)
const GRADE_ORDER: Record<string, number> = {};
[...GRADE_LEVELS_LIST, 'JSS1','JSS2','JSS3','SS1','SS2','SS3'].forEach((g, i) => { GRADE_ORDER[g] = i; });
function sortByGrade(a: string, b: string) {
  const oa = GRADE_ORDER[a] ?? 99;
  const ob = GRADE_ORDER[b] ?? 99;
  return oa !== ob ? oa - ob : a.localeCompare(b);
}

// ─── Edit Enrolled Student Modal ──────────────────────────────
function EditEnrolledModal({ student, schools, onClose, onSaved }: {
  student: any;
  schools: { id: string; name: string }[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState({
    full_name: student.full_name || '',
    phone: student.phone || '',
    section_class: student.section_class || '',
    grade_level: student.grade || student.grade_level || '',
    school_id: student.school_id || '',
    gender: student.gender || '',
    date_of_birth: student.date_of_birth || '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.full_name.trim()) { setError('Full name is required'); return; }
    setSaving(true); setError(null);
    try {
      const schoolName = schools.find(s => s.id === form.school_id)?.name ?? null;
      const res = await fetch(`/api/portal-users/${student.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          full_name: form.full_name.trim(),
          phone: form.phone.trim() || null,
          section_class: form.section_class.trim() || null,
          grade: form.grade_level || null,
          grade_level: form.grade_level || null,
          school_id: form.school_id || null,
          school_name: schoolName,
          gender: form.gender || null,
          date_of_birth: form.date_of_birth || null,
        }),
      });
      if (!res.ok) { const j = await res.json(); throw new Error(j.error ?? 'Failed to update'); }
      onSaved();
    } catch (err: any) {
      setError(err.message ?? 'Failed to save');
      setSaving(false);
    }
  };

  const fieldCls = 'w-full px-4 py-2.5 bg-[#080d19] border border-white/5 text-sm text-foreground focus:outline-none focus:border-primary/50 transition-colors rounded-xl font-medium';
  const labelCls = 'text-[10px] font-black text-muted-foreground uppercase tracking-widest block mb-1.5';

  return (
    <div className="mobile-native-dialog fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-300">
      <div role="dialog" aria-modal="true" className="w-full max-w-md bg-[#0d1526]/95 border border-white/5 shadow-2xl rounded-2xl overflow-hidden backdrop-blur-md shadow-primary/5">
        <div className="flex items-center justify-between px-6 py-5 border-b border-white/5 bg-white/[0.01]">
          <div>
            <h2 className="text-sm font-black uppercase tracking-widest text-foreground flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-primary animate-pulse" />
              Edit Student Details
            </h2>
            <p className="text-[10px] text-muted-foreground font-semibold mt-1 uppercase tracking-wider">{student.full_name} — Enrolled Profile</p>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground w-8 h-8 rounded-lg hover:bg-white/5 flex items-center justify-center transition-colors">
            <XMarkIcon className="w-5 h-5" />
          </button>
        </div>
        <form onSubmit={handleSave} className="p-6 space-y-4 max-h-[70vh] overflow-y-auto pr-1">
          {error && <p className="text-xs text-rose-600 dark:text-rose-400 bg-rose-500/10 border border-rose-500/20 px-3 py-2 rounded-xl font-medium">⚠️ {error}</p>}

          <div>
            <label className={labelCls}>Full Name <span className="text-primary">*</span></label>
            <input type="text" required value={form.full_name}
              onChange={e => setForm(f => ({ ...f, full_name: e.target.value }))}
              placeholder="Student's full name" className={fieldCls} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="relative">
              <label className={labelCls}>Grade / Level</label>
              <select value={form.grade_level} onChange={e => setForm(f => ({ ...f, grade_level: e.target.value }))}
                className={`${fieldCls} appearance-none cursor-pointer pr-10`}>
                <option value="">Select…</option>
                {GRADE_LEVELS_LIST.map(g => <option key={g} value={g}>{g}</option>)}
              </select>
              <div className="absolute right-4 bottom-3.5 pointer-events-none text-muted-foreground/60">
                <ChevronDownIcon className="w-4 h-4" />
              </div>
            </div>
            <div>
              <label className={labelCls}>Section / Class</label>
              <input value={form.section_class}
                onChange={e => setForm(f => ({ ...f, section_class: e.target.value }))}
                placeholder="e.g. Alpha, A" className={fieldCls} />
            </div>
          </div>

          <div>
            <label className={labelCls}>Phone</label>
            <input type="tel" value={form.phone}
              onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
              placeholder="+234 …" className={fieldCls} />
          </div>

          {schools.length > 0 && (
            <div className="relative">
              <label className={labelCls}>School</label>
              <select value={form.school_id} onChange={e => setForm(f => ({ ...f, school_id: e.target.value }))}
                className={`${fieldCls} appearance-none cursor-pointer pr-10`}>
                <option value="">— No School —</option>
                {schools.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
              <div className="absolute right-4 bottom-3.5 pointer-events-none text-muted-foreground/60">
                <ChevronDownIcon className="w-4 h-4" />
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="relative">
              <label className={labelCls}>Gender</label>
              <select value={form.gender} onChange={e => setForm(f => ({ ...f, gender: e.target.value }))}
                className={`${fieldCls} appearance-none cursor-pointer pr-10`}>
                <option value="">Select…</option>
                <option value="male">Male</option>
                <option value="female">Female</option>
                <option value="other">Other</option>
              </select>
              <div className="absolute right-4 bottom-3.5 pointer-events-none text-muted-foreground/60">
                <ChevronDownIcon className="w-4 h-4" />
              </div>
            </div>
            <div>
              <label className={labelCls}>Date of Birth</label>
              <input type="date" value={form.date_of_birth}
                onChange={e => setForm(f => ({ ...f, date_of_birth: e.target.value }))}
                className={fieldCls} />
            </div>
          </div>

          <div className="flex gap-3 pt-3 border-t border-white/5 mt-4">
            <button type="button" onClick={onClose}
              className="flex-1 px-4 py-2.5 bg-white/5 hover:bg-white/10 text-[10px] font-black uppercase tracking-widest text-muted-foreground hover:text-foreground rounded-xl transition-all">
              Cancel
            </button>
            <button type="submit" disabled={saving}
              className="flex-1 px-4 py-2.5 bg-primary hover:bg-primary/95 disabled:opacity-50 text-primary-foreground text-[10px] font-black uppercase tracking-widest rounded-xl transition-all shadow-lg shadow-primary/10">
              Save Changes
            </button>
          </div>
        </form>
      </div>
    </div>
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
  const [activatePending, setActivatePending] = useState<{ id: string; name: string; school_id: string | null } | null>(null);
  const [activateClassId, setActivateClassId] = useState('');
  const [editingStudent, setEditingStudent] = useState<any | null>(null);
  const [editEnrolledStudent, setEditEnrolledStudent] = useState<any | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [linkParentTarget, setLinkParentTarget] = useState<any | null>(null); // student for inline link-parent form
  const [gapCount, setGapCount] = useState<number | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<any | null>(null);
  const [resetPwTarget, setResetPwTarget] = useState<{ id: string; name: string } | null>(null);
  const [resetPwValue, setResetPwValue] = useState('');
  const [resettingPw, setResettingPw] = useState(false);
  const [resetPwMsg, setResetPwMsg] = useState<{ ok: boolean; text: string } | null>(null);

  // Enrolled portal students (portal_users role=student)
  const [sourceFilter, setSourceFilter] = useState<'all' | 'applications' | 'enrolled' | 'special'>('all');
  const [portalStudents, setPortalStudents] = useState<any[]>([]);
  const [_portalLoading, setPortalLoading] = useState(false);
  const [classMap, setClassMap] = useState<Record<string, string>>({}); // class_id → name
  const [schoolList, setSchoolList] = useState<{ id: string; name: string }[]>([]);

  // Fee filter for enrolled students
  const [feeFilter, setFeeFilter] = useState<'all' | 'paid' | 'pending' | 'overdue' | 'none'>('all');

  // Fee status map: portal_user_id → { status, amount, currency, dueDate }
  type FeeEntry = { status: string; amount: number; currency: string; dueDate: string | null };
  const [feeMap, setFeeMap] = useState<Record<string, FeeEntry>>({});
  const [assigningSchool, setAssigningSchool] = useState<string | null>(null); // portal student id being assigned

  // Registry print filters
  const [filterSchoolReg, setFilterSchoolReg] = useState('');
  const [filterClassReg, setFilterClassReg] = useState('');
  const [filterGradeReg, setFilterGradeReg] = useState('');
  const [filterGender, setFilterGender] = useState('');

  // Bulk enrol
  const [selectedForEnrol, setSelectedForEnrol] = useState<Set<string>>(new Set());
  const [showBulkEnrolModal, setShowBulkEnrolModal] = useState(false);

  // Bulk unenrol
  const [selectedForUnenrol, setSelectedForUnenrol] = useState<Set<string>>(new Set());
  const [bulkUnenrolling, setBulkUnenrolling] = useState(false);
  const [showUnenrolModal, setShowUnenrolModal] = useState(false);
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
      const [stuRes, clsRes, schRes, invRes] = await Promise.all([
        fetch('/api/portal-users?role=student&scoped=true&with_reports=1', { cache: 'no-store' }),
        fetch('/api/classes', { cache: 'no-store' }),
        fetch('/api/schools', { cache: 'no-store' }),
        fetch('/api/invoices?limit=500', { cache: 'no-store' }),
      ]);
      const stuJson = await stuRes.json();
      setPortalStudents(stuJson.data ?? []);
      const clsJson = await clsRes.json();
      const map: Record<string, string> = {};
      (clsJson.data ?? []).forEach((c: any) => { map[c.id] = c.name; });
      setClassMap(map);
      const schJson = await schRes.json();
      setSchoolList(schJson.data ?? []);

      // Build fee status map keyed by portal_user_id (latest non-cancelled invoice wins)
      const invJson = await invRes.json().catch(() => ({ data: [] }));
      const invoices: any[] = invJson.data ?? [];
      const map2: Record<string, FeeEntry> = {};
      const priority = ['overdue', 'sent', 'pending', 'paid', 'cancelled'];
      invoices
        .filter((inv: any) => inv.portal_user_id && inv.status !== 'cancelled')
        .forEach((inv: any) => {
          const uid = inv.portal_user_id;
          const existing = map2[uid];
          const rank = (s: string) => priority.indexOf(s.toLowerCase());
          if (!existing || rank(inv.status) < rank(existing.status)) {
            map2[uid] = {
              status: inv.status,
              amount: Number(inv.amount ?? 0),
              currency: inv.currency ?? 'NGN',
              dueDate: inv.due_date ?? null,
            };
          }
        });
      setFeeMap(map2);
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
        fetch('/api/classes', { cache: 'no-store' }).then(r => r.json()).then(j => setClassList(j.data ?? [])).catch(() => { })
      );
    }
    if (programsList.length === 0) {
      fetches.push(
        fetch('/api/programs?is_active=true', { cache: 'no-store' }).then(r => r.json()).then(j => setProgramsList(j.data ?? [])).catch(() => { })
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
      const parts: string[] = [`Enrolled ${json.enrolled ?? 0} student${(json.enrolled ?? 0) !== 1 ? 's' : ''}.`];
      if (json.rejectedSchoolBoundary?.length > 0) {
        parts.push(`⚠️ ${json.rejectedSchoolBoundary.length} skipped (wrong school): ${json.rejectedSchoolBoundary.join(', ')}.`);
      }
      alert(parts.join('\n'));
    } catch (e: any) {
      alert(e.message ?? 'Failed to enrol students');
    } finally {
      setBulkEnrolling(false);
    }
  };

  // ── Bulk unenrol ─────────────────────────────────────────────
  const executeBulkUnenrol = async () => {
    if (selectedForUnenrol.size === 0) return;
    setBulkUnenrolling(true);
    setShowUnenrolModal(false);
    try {
      // Group selected students by class_id so we can call DELETE per class
      const byClass = new Map<string, string[]>();
      for (const s of portalStudents) {
        if (selectedForUnenrol.has(s.id) && s.class_id) {
          if (!byClass.has(s.class_id)) byClass.set(s.class_id, []);
          byClass.get(s.class_id)!.push(s.id);
        }
      }
      if (byClass.size === 0) {
        // All selected students have no class — nothing to do
        alert('None of the selected students are currently assigned to a class.');
        setSelectedForUnenrol(new Set());
        return;
      }
      const results = await Promise.allSettled(
        [...byClass.entries()].map(([classId, ids]) =>
          fetch(`/api/classes/${classId}/enroll`, {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ studentIds: ids }),
          }).then(async r => { if (!r.ok) { const j = await r.json(); throw new Error(j.error ?? 'Failed'); } })
        )
      );
      const failed = results.filter(r => r.status === 'rejected').length;
      const succeeded = results.length - failed;
      setSelectedForUnenrol(new Set());
      await loadPortalStudents();
      if (failed > 0) alert(`${succeeded} class group(s) unenrolled successfully. ${failed} failed — check network or permissions.`);
    } catch (e: any) {
      alert(e.message ?? 'Failed to unenrol students');
    } finally {
      setBulkUnenrolling(false);
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
  const openActivatePicker = async (student: any) => {
    // Lazily load classes if not already loaded
    if (classList.length === 0) {
      const j = await fetch('/api/classes', { cache: 'no-store' }).then(r => r.json()).catch(() => ({ data: [] }));
      setClassList(j.data ?? []);
    }
    setActivateClassId('');
    setActivatePending({ id: student.id, name: student.full_name, school_id: student.school_id ?? null });
  };

  const activatePortalAccount = async (studentId: string, studentName: string, classId?: string) => {
    setActivating(studentId);
    setActivatePending(null);
    try {
      const res = await fetch('/api/students/activate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ studentId, classId: classId || undefined }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Activation failed');
      if (json.alreadyActivated) {
        alert(`${studentName} already has a portal account (${json.email}).`);
      } else {
        setCredentials({ email: json.email, tempPassword: json.tempPassword, name: studentName });
        setStudents(prev => prev.map(s => s.id === studentId
          ? { ...s, user_id: json.portalUserId, status: 'approved' } : s));
      }
    } catch (e: any) {
      alert(e.message ?? 'Failed to activate portal account');
    } finally {
      setActivating(null);
    }
  };

  // ── DELETE (pre-portal / application student) ─────────────
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

  // ── DELETE (enrolled portal student) ──────────────────────
  const handleDeleteEnrolledStudent = async (id: string, name: string, confirmDestroy = false) => {
    if (!confirmDestroy && !confirm(`Delete ${name}'s portal account? This permanently removes their login, progress and all records.`)) return;
    setDeleting(id);
    try {
      const res = await fetch(`/api/portal-users/${id}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirmDestroy }),
      });
      if (res.status === 409) {
        // Account holds a paid ID card and/or published reports — surface exactly what would be
        // lost (incl. report term + year) and require an explicit second confirmation.
        const j = await res.json().catch(() => ({}));
        setDeleting(null);
        if (confirm(`⚠ ${j.error}\n\nAre you SURE you want to permanently delete ${name}? This cannot be undone and the ID card was already paid for.`)) {
          await handleDeleteEnrolledStudent(id, name, true);
        }
        return;
      }
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? 'Failed to delete student');
      }
      setStudents(prev => prev.filter(s => s.id !== id));
    } catch (e: any) {
      alert(e.message ?? 'Failed to delete student');
    } finally {
      setDeleting(null);
    }
  };

  const handleResetStudentPw = async () => {
    if (!resetPwTarget || resetPwValue.length < 8) return;
    setResettingPw(true); setResetPwMsg(null);
    try {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: resetPwTarget.id, newPassword: resetPwValue }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? 'Failed');
      setResetPwMsg({ ok: true, text: `Password updated for ${resetPwTarget.name}` });
      setResetPwValue('');
      setTimeout(() => { setResetPwTarget(null); setResetPwMsg(null); }, 2500);
    } catch (err: any) {
      setResetPwMsg({ ok: false, text: err.message });
    } finally { setResettingPw(false); }
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
    if (filterGradeReg) parts.push(`Grade: ${filterGradeReg}`);
    if (filterClassReg) parts.push(`Class: ${filterClassReg}`);
    if (sourceFilter === 'enrolled') parts.push('Enrolled Students');
    else if (sourceFilter === 'applications') parts.push('Applications');
    if (filter !== 'all') parts.push(`${filter.charAt(0).toUpperCase() + filter.slice(1)} Status`);
    const subtitle = parts.length > 0 ? parts.join(' — ') : 'All Students';

    // Build program lookup: class_id → program name
    const progById: Record<string, string> = {};
    programsList.forEach((p: any) => { if (p.id) progById[p.id] = p.name; });
    const classProgramName = (classId: string | null | undefined): string => {
      if (!classId) return '—';
      const cls = classList.find((c: any) => c.id === classId);
      return (cls?.program_id && progById[cls.program_id]) ? progById[cls.program_id] : '—';
    };

    const maleCount   = filtered.filter(s => (s.gender ?? '').toLowerCase() === 'male').length;
    const femaleCount = filtered.filter(s => (s.gender ?? '').toLowerCase() === 'female').length;

    const rows = filtered.map((s, i) => {
      const isEnrolled = s._source === 'enrolled';
      const cls = s.section_class || (s.class_id && classMap[s.class_id]) || '—';
      const grade = s.grade_level || '—';
      const email = s.student_email || s.email || s.parent_email || '—';
      const school = s.school_name || '—';
      const programme = classProgramName(s.class_id);
      const bg = i % 2 === 0 ? '#ffffff' : '#f9fafb';
      return `
        <tr style="background:${bg};border-bottom:1px solid #e5e7eb;">
          <td style="padding:7px 10px;color:#9ca3af;font-size:11px;text-align:center;">${i + 1}</td>
          <td style="padding:7px 10px;font-weight:700;font-size:11px;">${s.full_name ?? '—'}</td>
          <td style="padding:7px 10px;color:#0369a1;font-size:11px;font-weight:700;">${grade}</td>
          <td style="padding:7px 10px;font-size:10px;text-align:center;">
            ${s.gender === 'male' ? `<span style="background:#dbeafe;color:#1d4ed8;padding:2px 7px;border-radius:9999px;font-weight:700;font-size:9px;">M</span>` : s.gender === 'female' ? `<span style="background:#fce7f3;color:#be185d;padding:2px 7px;border-radius:9999px;font-weight:700;font-size:9px;">F</span>` : '<span style="color:#9ca3af;">—</span>'}
          </td>
          <td style="padding:7px 10px;color:#6b7280;font-size:11px;">${cls}</td>
          <td style="padding:7px 10px;color:#6b7280;font-size:11px;">${school}</td>
          <td style="padding:7px 10px;color:#6b7280;font-size:11px;">${email}</td>
          <td style="padding:7px 10px;color:#ea580c;font-size:11px;font-weight:800;text-transform:uppercase;">${programme}</td>
          <td style="padding:7px 10px;font-size:10px;text-align:center;">
            <span style="padding:2px 8px;border-radius:9999px;font-weight:700;font-size:9px;background:${isEnrolled ? '#d1fae5' : '#ede9fe'};color:${isEnrolled ? '#065f46' : '#4c1d95'};">
              ${isEnrolled ? 'Enrolled' : 'Application'}
            </span>
          </td>
          <td style="padding:7px 10px;border-left:1px solid #d1d5db;min-width:70px;">&nbsp;</td>
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
        <div style="font-size:10px;color:#9ca3af;margin-top:2px;">26 Ogiesoba Avenue, Off Airport Road, GRA, Benin City &nbsp;·&nbsp; ${brandContact.phoneShort} &nbsp;·&nbsp; ${brandContact.email}</div>
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
        <td style="padding:8px 14px;background:#f9fafb;border-right:1px solid #e5e7eb;border-left:1px solid #e5e7eb;font-size:10px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:0.8px;">Grade</td>
        <td style="padding:8px 14px;font-size:11px;color:#0369a1;font-weight:700;">${filterGradeReg || 'All Grades'}</td>
      </tr>
      <tr>
        <td style="padding:8px 14px;background:#f9fafb;border-right:1px solid #e5e7eb;font-size:10px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:0.8px;">Class</td>
        <td style="padding:8px 14px;font-size:11px;">${filterClassReg || 'All Classes'}</td>
        <td style="padding:8px 14px;background:#f9fafb;border-right:1px solid #e5e7eb;border-left:1px solid #e5e7eb;font-size:10px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:0.8px;">Gender Split</td>
        <td style="padding:8px 14px;font-size:11px;"><span style="color:#1d4ed8;font-weight:700;">${maleCount} Male</span> &nbsp;·&nbsp; <span style="color:#be185d;font-weight:700;">${femaleCount} Female</span></td>
      </tr>
    </table>

    <!-- Student table -->
    <table>
      <thead>
        <tr>
          <th style="width:4%;text-align:center;">#</th>
          <th style="width:20%;">Student Full Name</th>
          <th style="width:7%;color:#bae6fd;">Grade</th>
          <th style="width:8%;text-align:center;">Gender</th>
          <th style="width:12%;">Class</th>
          <th style="width:17%;">School</th>
          <th style="width:14%;">Email Address</th>
          <th style="width:10%;">Programme</th>
          <th style="width:8%;text-align:center;">Type</th>
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
        <div style="font-size:9px;color:#d1d5db;">rillcod.com/verify — Confidential</div>
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

  const handlePrintLoginSlip = async (s: any) => {
    const portalId = s._source === 'enrolled' ? s.id : (s.user_id || s.id);
    const [cfg, cardRes] = await Promise.all([
      fetchCardConfig('student'),
      fetch(`/api/cards?holder_id=${portalId}&holder_type=student`, { cache: 'no-store' })
        .then(r => r.ok ? r.json() : null).catch(() => null),
    ]);
    const dbCard = cardRes?.data?.[0] ?? null;
    const holder: CardHolder = {
      id: portalId,
      full_name: s.full_name || s.name || 'N/A',
      email: s.email || s.student_email || null,
      school_name: s.school_name || null,
      grade: s.grade_level || s.grade || null,
      section_class: s.section_class || (s.class_id && classMap[s.class_id]) || null,
      card_number: dbCard?.card_number || holderCode(portalId),
      expires_at: dbCard?.expires_at || null,
      verification_code: dbCard?.verification_code || null,
      avatar_url: s.avatar_url || null,
    };
    openPrintWindow(await buildSingleCardHtml(holder, cfg, window.location.origin));
  };

  const handlePrintAllLoginSlips = async () => {
    const list = filtered.filter(s => s.user_id || s._source === 'enrolled');
    if (list.length === 0) {
      alert('No enrolled students in the current filtered view.');
      return;
    }
    const cfg = await fetchCardConfig('student');
    const holders: CardHolder[] = list.map(s => {
      const pId = s._source === 'enrolled' ? s.id : (s.user_id || s.id);
      return {
        id: pId,
        full_name: s.full_name || s.name || 'N/A',
        email: s.email || s.student_email || null,
        school_name: s.school_name || null,
        grade: s.grade_level || s.grade || null,
        section_class: s.section_class || (s.class_id && classMap[s.class_id]) || null,
      };
    });
    const { buildBulkPrintHtml } = await import('@/lib/cards/printCard');
    openPrintWindow(await buildBulkPrintHtml(holders, cfg, window.location.origin));
  };

  // ── Unified combined list ───────────────────────────────────
  // Exclude applications that already have a linked portal account (user_id set)
  // — those students already appear in the enrolled (portalStudents) list.
  const enrolledPortalIds = new Set(portalStudents.map((s: any) => s.id));
  const normalizedApplications = students
    .filter((s: any) => !s.user_id || !enrolledPortalIds.has(s.user_id))
    .map(s => ({ ...s, _source: 'application' as const }));
  const normalizedEnrolled = portalStudents.map(s => ({
    ...s, _source: 'enrolled' as const,
    status: s.is_active ? 'active' : 'inactive',
    // portal_users.grade is canonical; expose as grade_level for shared filters/UI.
    grade_level: s.grade || s.grade_level || null,
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
      (sourceFilter === 'applications' && s._source === 'application') ||
      (sourceFilter === 'special' && isSpecialEnrollment(s.enrollment_type));
    const matchStatus = filter === 'all' || s.status === filter;
    const matchSchoolReg = !filterSchoolReg || (s.school_name ?? '') === filterSchoolReg;
    const studentClass = s.section_class || (s.class_id && classMap[s.class_id]) || '';
    const matchClassReg = !filterClassReg || studentClass === filterClassReg;
    const matchGradeReg = !filterGradeReg || (s.grade_level ?? '') === filterGradeReg;
    const matchGender = !filterGender || (s.gender ?? '').toLowerCase() === filterGender;
    const matchFee = feeFilter === 'all' || (() => {
      if (s._source !== 'enrolled') return true;
      const fe = feeMap[s.id];
      if (feeFilter === 'none') return !fe;
      if (!fe) return false;
      const isOv = fe.status.toLowerCase() === 'overdue' || (fe.status === 'sent' && fe.dueDate && new Date(fe.dueDate) < new Date());
      if (feeFilter === 'overdue') return !!isOv;
      if (feeFilter === 'paid') return fe.status.toLowerCase() === 'paid';
      if (feeFilter === 'pending') return !isOv && ['pending', 'sent'].includes(fe.status.toLowerCase());
      return true;
    })();
    return ms && matchSource && matchStatus && matchSchoolReg && matchClassReg && matchGradeReg && matchFee && matchGender;
  });

  // Distinct values for registry filter dropdowns
  const distinctSchoolsReg = [...new Set(combined.map(s => s.school_name).filter(Boolean))].sort() as string[];
  const distinctClassesReg = [...new Set([
    ...combined.map(s => s.section_class).filter(Boolean),
    ...combined.filter(s => s.class_id && classMap[s.class_id]).map(s => classMap[s.class_id]),
  ])].sort() as string[];
  const distinctGradesReg = [...new Set(combined.map(s => s.grade_level).filter(Boolean))].sort(sortByGrade) as string[];

  const pending = normalizedApplications.filter(s => s.status === 'pending').length;

  // Fee stats computed from enrolled students
  const feeStats = {
    paid: normalizedEnrolled.filter(s => feeMap[s.id]?.status === 'paid').length,
    overdue: normalizedEnrolled.filter(s => {
      const fe = feeMap[s.id];
      if (!fe) return false;
      return fe.status.toLowerCase() === 'overdue' || (fe.status === 'sent' && fe.dueDate && new Date(fe.dueDate) < new Date());
    }).length,
    pending: normalizedEnrolled.filter(s => {
      const fe = feeMap[s.id];
      if (!fe) return false;
      const isOv = fe.status.toLowerCase() === 'overdue' || (fe.status === 'sent' && fe.dueDate && new Date(fe.dueDate) < new Date());
      return !isOv && ['pending', 'sent'].includes(fe.status.toLowerCase());
    }).length,
    none: normalizedEnrolled.filter(s => !feeMap[s.id]).length,
  };

  // ── Calculate age ──────────────────────────────────────────
  const calcAge = (dob?: string) => {
    if (!dob) return null;
    const diff = Date.now() - new Date(dob).getTime();
    return Math.floor(diff / (365.25 * 24 * 3600 * 1000));
  };

  // ─── Loading ───────────────────────────────────────────────
  if (authLoading || loading) return (
    <div className="min-h-screen bg-background text-foreground mobile-page-root">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        <div className="animate-pulse space-y-2">
          <div className="h-4 bg-muted rounded w-32" />
          <div className="h-8 bg-muted rounded w-64" />
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map(i => <div key={i} className="bg-card shadow-sm border border-border rounded-xl h-24 animate-pulse" />)}
        </div>
        {[1, 2, 3].map(i => <div key={i} className="bg-card shadow-sm border border-border rounded-xl h-24 animate-pulse" />)}
      </div>
    </div>
  );

  if (profile?.role === 'student') return <StudentSelfView />;

  if (!isStaff) return (
    <div className="min-h-screen bg-background flex items-center justify-center mobile-page-root">
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
        <div className="mobile-native-dialog fixed inset-0 z-[80] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div role="dialog" aria-modal="true" className="bg-background border border-border rounded-xl w-full max-w-lg shadow-2xl max-h-[90vh] flex flex-col">

            {/* Header */}
            <div className="p-6 border-b border-border flex items-center justify-between flex-shrink-0">
              <div>
                <h2 className="font-bold text-foreground">Enrol Students</h2>
                <p className="text-xs text-muted-foreground mt-0.5">{selectedForEnrol.size} student{selectedForEnrol.size !== 1 ? 's' : ''} selected</p>
              </div>
              <button onClick={() => { setShowBulkEnrolModal(false); setBulkEnrolMode('pick'); }} className="p-2 hover:bg-muted rounded-xl text-muted-foreground hover:text-foreground transition-all">
                <XMarkIcon className="w-5 h-5" />
              </button>
            </div>

            {/* Mode tabs */}
            <div className="px-6 pt-5 pb-1 flex gap-2 flex-shrink-0">
              <button
                onClick={() => setBulkEnrolMode('pick')}
                className={`flex-1 py-2.5 rounded-xl text-xs font-bold transition-all ${bulkEnrolMode === 'pick' ? 'bg-primary text-white shadow-lg shadow-primary/30' : 'bg-card shadow-sm text-muted-foreground hover:bg-muted border border-border'}`}
              >
                Pick Existing Class
              </button>
              <button
                onClick={() => setBulkEnrolMode('create')}
                className={`flex-1 py-2.5 rounded-xl text-xs font-bold transition-all ${bulkEnrolMode === 'create' ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-900/30' : 'bg-card shadow-sm text-muted-foreground hover:bg-muted border border-border'}`}
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
                        <button onClick={() => setBulkEnrolMode('create')} className="text-xs font-bold text-primary hover:text-primary transition-colors">
                          Create a new class →
                        </button>
                      </div>
                    ) : (
                      <div className="space-y-4 max-h-72 overflow-y-auto pr-1">
                        {groupEntries.map(([schoolName, classes]) => (
                          <div key={schoolName}>
                            <p className="text-[10px] font-black text-primary/60 uppercase tracking-widest mb-2 px-1">{schoolName}</p>
                            <div className="space-y-1.5">
                              {classes.map((c: any) => {
                                const isFull = c.max_students > 0 && (c.current_students ?? 0) >= c.max_students;
                                const nearFull = !isFull && c.max_students > 0 && (c.current_students ?? 0) / c.max_students >= 0.9;
                                return (
                                  <div
                                    key={c.id}
                                    onClick={() => !isFull && setBulkEnrolClassId(c.id)}
                                    className={`flex items-center gap-3 p-3.5 border rounded-xl transition-all ${isFull ? 'opacity-50 cursor-not-allowed bg-rose-500/5 border-rose-500/20' : bulkEnrolClassId === c.id ? 'cursor-pointer bg-primary/15 border-primary/40' : 'cursor-pointer bg-card shadow-sm border-border hover:border-primary/20 hover:bg-white/[0.07]'}`}
                                  >
                                    <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-all ${bulkEnrolClassId === c.id ? 'border-primary bg-primary' : 'border-border'}`}>
                                      {bulkEnrolClassId === c.id && <div className="w-1.5 h-1.5 rounded-full bg-card" />}
                                    </div>
                                    <div className="min-w-0 flex-1">
                                      <p className="text-sm font-semibold text-foreground truncate">{c.name}</p>
                                      {c.programs?.name && (
                                        <p className="text-[9px] text-muted-foreground mt-0.5">{c.programs.name}</p>
                                      )}
                                    </div>
                                    <div className="flex items-center gap-2 flex-shrink-0">
                                      {isFull && (
                                        <span className="text-[9px] font-black uppercase tracking-widest px-2 py-0.5 bg-rose-500/20 text-rose-600 dark:text-rose-400 border border-rose-500/30">FULL</span>
                                      )}
                                      <span className={`text-[10px] font-bold tabular-nums ${isFull ? 'text-rose-600 dark:text-rose-400' : nearFull ? 'text-amber-600 dark:text-amber-400' : 'text-muted-foreground'}`}>
                                        {c.current_students ?? 0}{c.max_students ? `/${c.max_students}` : ''} <span className="text-muted-foreground">students</span>
                                      </span>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                    <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-3 text-xs text-amber-700 dark:text-amber-300">
                      Students already in another class will be <strong>reassigned</strong>. Students outside your school boundary will be skipped.
                    </div>
                    <button
                      onClick={executeBulkEnrol}
                      disabled={!bulkEnrolClassId || bulkEnrolling}
                      className="w-full py-3 bg-primary hover:bg-primary disabled:opacity-40 text-foreground font-bold rounded-xl transition-all flex items-center justify-center gap-2"
                    >
                      {bulkEnrolling
                        ? <><ArrowPathIcon className="w-4 h-4 animate-spin" /> Enrolling…</>
                        : `Enrol ${selectedForEnrol.size} Student${selectedForEnrol.size !== 1 ? 's' : ''}`}
                    </button>
                  </>
                );
              })() : (
                <>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    Register a new class and immediately enrol the {selectedForEnrol.size} selected student{selectedForEnrol.size !== 1 ? 's' : ''} into it.
                  </p>
                  <div className="space-y-3">
                    {/* Grade / Section preset — sets the class name automatically */}
                    <select
                      value={quickClass.grade_level}
                      onChange={e => setQuickClass(q => ({ ...q, grade_level: e.target.value, name: e.target.value ? '' : q.name }))}
                      className="w-full px-4 py-3 bg-card shadow-sm border border-border rounded-xl text-sm text-foreground focus:outline-none focus:border-emerald-500 cursor-pointer transition-colors"
                    >
                      <option value="">— Grade / Section (pick or type below) —</option>
                      {['BASIC 1', 'BASIC 2', 'BASIC 3', 'BASIC 4', 'BASIC 5', 'BASIC 6',
                        'JSS 1', 'JSS 2', 'JSS 3', 'SS 1', 'SS 2', 'SS 3',
                        'Cohort A', 'Cohort B', 'Cohort C'].map(g => (
                          <option key={g} value={g}>{g}</option>
                        ))}
                    </select>
                    <input
                      type="text"
                      placeholder={quickClass.grade_level ? `Custom name (or use "${quickClass.grade_level}" above)` : 'Custom class name *'}
                      value={quickClass.name}
                      onChange={e => setQuickClass(q => ({ ...q, name: e.target.value, grade_level: e.target.value ? '' : q.grade_level }))}
                      className="w-full px-4 py-3 bg-card shadow-sm border border-border rounded-xl text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-emerald-500 transition-colors"
                    />
                    <select
                      value={quickClass.program_id}
                      onChange={e => setQuickClass(q => ({ ...q, program_id: e.target.value }))}
                      className="w-full px-4 py-3 bg-card shadow-sm border border-border rounded-xl text-sm text-foreground focus:outline-none focus:border-emerald-500 cursor-pointer transition-colors"
                    >
                      <option value="">— Programme *—</option>
                      {programsList.map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                    <select
                      value={quickClass.school_id}
                      onChange={e => setQuickClass(q => ({ ...q, school_id: e.target.value }))}
                      className="w-full px-4 py-3 bg-card shadow-sm border border-border rounded-xl text-sm text-foreground focus:outline-none focus:border-emerald-500 cursor-pointer transition-colors"
                    >
                      <option value="">— School (optional) —</option>
                      {schoolList.map((s: any) => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                    <input
                      type="number"
                      placeholder="Max students (optional)"
                      value={quickClass.max_students}
                      onChange={e => setQuickClass(q => ({ ...q, max_students: e.target.value }))}
                      className="w-full px-4 py-3 bg-card shadow-sm border border-border rounded-xl text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-emerald-500 transition-colors"
                    />
                  </div>
                  <button
                    onClick={createAndEnrol}
                    disabled={creatingClass || (!quickClass.name.trim() && !quickClass.grade_level) || !quickClass.program_id}
                    className="w-full py-3 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-foreground font-bold rounded-xl transition-all flex items-center justify-center gap-2"
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
        <div className="mobile-native-dialog fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div role="dialog" aria-modal="true" className="bg-background border border-border rounded-xl w-full max-w-lg shadow-2xl max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between p-6 border-b border-border flex-shrink-0">
              <div className="flex items-center gap-3">
                <BoltIcon className="w-5 h-5 text-amber-600 dark:text-amber-400" />
                <h2 className="text-lg font-extrabold text-foreground">Student Sync Complete</h2>
              </div>
              <button onClick={() => setSyncResult(null)} className="p-2 rounded-xl hover:bg-muted text-muted-foreground hover:text-foreground transition-all">
                <XMarkIcon className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 overflow-y-auto space-y-4">
              {syncResult.error ? (
                <div className="flex items-center gap-3 bg-rose-500/10 border border-rose-500/20 rounded-xl p-4">
                  <ExclamationTriangleIcon className="w-5 h-5 text-rose-600 dark:text-rose-400 flex-shrink-0" />
                  <p className="text-rose-600 dark:text-rose-400 text-sm">{syncResult.error}</p>
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    {[
                      { label: 'Students Fixed', value: syncResult.summary?.students_fixed ?? 0, color: 'text-emerald-600 dark:text-emerald-400' },
                      { label: 'Errors', value: syncResult.summary?.errors ?? 0, color: 'text-rose-600 dark:text-rose-400' },
                    ].map(s => (
                      <div key={s.label} className="bg-card shadow-sm border border-border rounded-xl p-3 text-center">
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
                              ${syncResult.credentials.filter((c: any) => c.password && !c.password.includes('existing')).map((c: any) => `
                                <div class="card">
                                  <div class="brand">RILLCOD</div>
                                  <div class="name">${c.name}</div>
                                  <div class="row"><div class="label">Email</div><div class="value">${c.email}</div></div>
                                  <div class="row"><div class="label">Temporary Password</div><div class="value">${c.password}</div></div>
                                  <div style="font-size:8px;color:#9ca3af;margin-top:10px;">URL: rillcod.com/student/login</div>
                                </div>
                              `).join('')}
                              <script>window.onload = () => { window.print(); }</script>
                              </body></html>
                            `;
                            const win = window.open('', '_blank');
                            win?.document.write(html);
                            win?.document.close();
                          }}
                          className="flex items-center gap-2 px-3 py-1 bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-[10px] font-black uppercase tracking-widest rounded-xl hover:bg-emerald-500/20 transition-all"
                        >
                          <PrinterIcon className="w-3.5 h-3.5" /> Print All Slips
                        </button>
                      </div>
                      <div className="space-y-2 max-h-48 overflow-y-auto pr-2 custom-scrollbar">
                        {syncResult.credentials.map((c: any, i: number) => (
                          <div key={i} className="bg-card shadow-sm border border-border rounded-xl p-3 font-mono text-xs">
                            <p className="text-foreground font-bold">{c.name}</p>
                            <p className="text-muted-foreground mt-0.5">{c.email}</p>
                            <p className="text-emerald-600 dark:text-emerald-400 font-bold mt-0.5">pw: {c.password}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {syncResult.errors?.length > 0 && (
                    <div>
                      <p className="text-xs font-bold text-rose-600/60 dark:text-rose-400/60 uppercase tracking-widest mb-2">Errors ({syncResult.errors.length})</p>
                      <div className="space-y-1 text-xs text-rose-600/80 dark:text-rose-400/80 bg-rose-500/5 border border-rose-500/20 rounded-xl p-3">
                        {syncResult.errors.map((e: string, i: number) => <p key={i}>• {e}</p>)}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
            <div className="p-4 border-t border-border flex-shrink-0">
              <button onClick={() => setSyncResult(null)} className="w-full py-2.5 bg-primary hover:bg-primary text-white font-bold rounded-xl text-sm transition-all">
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Reset Password Modal ──────────────────────────── */}
      {resetPwTarget && (
        <div className="mobile-native-dialog fixed inset-0 z-[100] bg-black/80 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-300">
          <div role="dialog" aria-modal="true" className="bg-[#0d1526]/95 border border-white/5 w-full max-w-sm shadow-2xl rounded-2xl overflow-hidden backdrop-blur-md shadow-primary/5 animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between px-6 py-5 border-b border-white/5 bg-white/[0.01]">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center">
                  <KeyIcon className="w-4 h-4 text-primary" />
                </div>
                <h3 className="font-black text-foreground text-sm uppercase tracking-widest">Reset Password</h3>
              </div>
              <button onClick={() => { setResetPwTarget(null); setResetPwMsg(null); }} className="text-muted-foreground hover:text-foreground w-8 h-8 rounded-lg hover:bg-white/5 flex items-center justify-center transition-colors">
                <XMarkIcon className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wider">
                Set a new temporary password for <span className="text-foreground font-extrabold">{resetPwTarget.name}</span>.
              </p>
              {resetPwMsg && (
                <p className={`text-xs px-3 py-2 border rounded-xl font-medium ${
                  resetPwMsg.ok ? 'text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border-emerald-500/20' : 'text-rose-600 dark:text-rose-400 bg-rose-500/10 border-rose-500/20'
                }`}>
                  {resetPwMsg.text}
                </p>
              )}
              <input
                type="password"
                placeholder="New password (min 8 chars)"
                value={resetPwValue}
                onChange={e => setResetPwValue(e.target.value)}
                className="w-full px-4 py-2.5 bg-[#080d19] border border-white/5 text-sm text-foreground placeholder:text-muted-foreground/30 focus:outline-none focus:border-primary/50 transition-colors font-medium rounded-xl"
              />
              <div className="flex gap-3 pt-3 border-t border-white/5 mt-4">
                <button onClick={() => { setResetPwTarget(null); setResetPwMsg(null); }}
                  className="flex-1 px-4 py-2.5 bg-white/5 hover:bg-white/10 text-[10px] font-black uppercase tracking-widest text-muted-foreground hover:text-foreground rounded-xl transition-all">
                  Cancel
                </button>
                <button onClick={handleResetStudentPw} disabled={resettingPw || resetPwValue.length < 8}
                  className="flex-1 px-4 py-2.5 bg-primary hover:bg-primary/95 disabled:opacity-40 text-primary-foreground text-[10px] font-black uppercase tracking-widest rounded-xl transition-all shadow-lg shadow-primary/10">
                  {resettingPw ? 'Saving…' : 'Reset'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Credentials Modal ─────────────────────────────── */}
      {credentials && (
        <div className="mobile-native-dialog fixed inset-0 z-[100] bg-black/90 backdrop-blur-md flex items-center justify-center p-4">
          <div role="dialog" aria-modal="true" className="bg-[#1a1a1a] border-l-8 border-l-emerald-500 border border-border rounded-xl w-full max-w-md shadow-2xl overflow-hidden shadow-emerald-500/10">
            <div className="p-8 border-b border-border flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-emerald-500/10 border border-emerald-500/20 rounded-xl flex items-center justify-center rotate-3">
                  <ShieldCheckIcon className="w-6 h-6 text-emerald-600 dark:text-emerald-400" />
                </div>
                <div>
                  <h3 className="font-black text-foreground uppercase tracking-tight italic">Account Created</h3>
                  <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">Credentials for {credentials.name}</p>
                </div>
              </div>
              <button onClick={() => { setCredentials(null); load(); }} className="p-2 hover:bg-card shadow-sm rounded-xl transition-colors border border-border">
                <XMarkIcon className="w-5 h-5 text-muted-foreground" />
              </button>
            </div>

            <div className="p-8 space-y-6">
              <div className="bg-amber-500/5 border border-amber-500/20 rounded-xl p-4 text-[10px] font-bold text-amber-600/80 dark:text-amber-400/80 italic leading-relaxed uppercase tracking-widest">
                <div className="flex items-start gap-3">
                  <ExclamationTriangleIcon className="w-4 h-4 flex-shrink-0" />
                  <span>Save these credentials now. The student must update their password on first login.</span>
                </div>
              </div>

              {[
                { label: 'Email', value: credentials.email },
                { label: 'Temporary Password', value: credentials.tempPassword },
              ].map(({ label, value }) => (
                <div key={label}>
                  <p className="text-[9px] font-black text-muted-foreground uppercase tracking-[0.3em] mb-2">{label}</p>
                  <div className="flex items-center gap-px">
                    <div className="flex-1 px-5 py-3.5 bg-black/40 border border-border rounded-xl text-foreground font-mono text-sm select-all">
                      {value}
                    </div>
                    <button
                      onClick={() => navigator.clipboard.writeText(value)}
                      className="p-3.5 bg-emerald-500 text-foreground hover:bg-emerald-600 transition-colors rounded-xl"
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
                className="w-full flex items-center justify-center gap-3 py-4 bg-card shadow-sm border border-border text-foreground text-[10px] font-black uppercase tracking-[0.4em] rounded-xl hover:bg-muted transition-all mt-4">
                <ClipboardIcon className="w-4 h-4" /> Copy Credentials
              </button>

              <button
                onClick={() => { setCredentials(null); load(); }}
                className="w-full py-5 bg-emerald-500 text-foreground font-black text-xs uppercase tracking-[0.5em] rounded-xl hover:bg-emerald-600 transition-all">
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="min-h-screen bg-background text-foreground mobile-page-root">
        <div className="space-y-6 sm:space-y-8">

          {/* Tab bar — People (admin only; school/teacher stay on Students) */}
          {profile?.role === 'admin' && (
          <div className="flex items-center gap-1 bg-card border border-border rounded-xl p-1 w-fit flex-wrap">
            <Link href="/dashboard/schools" className="flex items-center gap-2 px-4 py-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/50 text-sm font-bold transition-all">
              <BuildingOfficeIcon className="w-4 h-4" /> Schools
            </Link>
            <Link href="/dashboard/teachers" className="flex items-center gap-2 px-4 py-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/50 text-sm font-bold transition-all">
              <AcademicCapIcon className="w-4 h-4" /> Teachers
            </Link>
            <span className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-white text-sm font-black">
              <UserGroupIcon className="w-4 h-4" /> Students
            </span>
            <Link href="/dashboard/parents" className="flex items-center gap-2 px-4 py-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/50 text-sm font-bold transition-all">
              <UserPlusIcon className="w-4 h-4" /> Parents
            </Link>
            <Link href="/dashboard/users" className="flex items-center gap-2 px-4 py-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/50 text-sm font-bold transition-all">
              <ShieldCheckIcon className="w-4 h-4" /> Users
            </Link>
            <Link href="/dashboard/approvals" className="flex items-center gap-2 px-4 py-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/50 text-sm font-bold transition-all">
              <ClipboardDocumentListIcon className="w-4 h-4" /> Approvals
            </Link>
          </div>
          )}

          {/* ── Header ─────────────────────────────────────── */}
          <div className="bg-card/90 backdrop-blur-2xl border border-border/80 rounded-3xl p-6 sm:p-8 shadow-xl relative overflow-hidden flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 print:hidden">
            <div className="absolute top-0 right-0 w-48 h-48 bg-primary/10 rounded-full blur-3xl pointer-events-none" />
            <div className="relative z-10 flex items-center gap-3.5">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-primary to-indigo-600 text-white border border-primary/30 flex items-center justify-center shadow-xl shadow-primary/30 flex-shrink-0">
                <UserGroupIcon className="w-6 h-6 text-white" />
              </div>
              <div>
                <span className="inline-block px-3 py-1 bg-brand-red-accent text-white text-[9px] font-black uppercase tracking-widest rounded-full shadow-sm mb-1">
                  People & Registry · {profile?.role}
                </span>
                <h1 className="text-2xl sm:text-3xl font-black text-foreground uppercase tracking-tight">Students Registry</h1>
                <p className="text-muted-foreground text-xs sm:text-sm mt-0.5 font-medium max-w-2xl">
                  Manage registrations, parent info, approvals and student records
                </p>
              </div>
            </div>
            {/* Action buttons */}
            <div className="relative z-10 flex flex-wrap items-center gap-2">
              <button
                onClick={() => { setEditingStudent(null); setShowAdd(true); }}
                className="flex items-center gap-2 px-4 py-2.5 bg-primary hover:bg-primary text-white text-[10px] font-black uppercase tracking-widest rounded-xl shadow-lg shadow-primary/20 transition-all print:hidden">
                <PlusIcon className="w-4 h-4" /> Register Student
              </button>
              <button onClick={() => { load(); loadPortalStudents(); }} title="Refresh"
                className="p-2.5 bg-card shadow-sm hover:bg-muted border border-border rounded-xl text-muted-foreground hover:text-foreground transition-all">
                <ArrowPathIcon className="w-4 h-4" />
              </button>
              {/* Admin + Teacher only */}
              {(profile?.role === 'admin' || profile?.role === 'teacher') && (
                <>
                  <button onClick={handlePrintRegistry}
                    className="flex items-center gap-2 px-4 py-2.5 bg-card shadow-sm hover:bg-muted text-muted-foreground hover:text-foreground text-[10px] font-black uppercase tracking-widest rounded-xl border border-border transition-all print:hidden">
                    <PrinterIcon className="w-4 h-4" /> Print
                  </button>
                  <button onClick={handlePrintAllLoginSlips}
                    className="flex items-center gap-2 px-4 py-2.5 bg-primary hover:bg-primary text-white text-[10px] font-black uppercase tracking-widest rounded-xl shadow-lg shadow-primary/20 transition-all print:hidden">
                    <KeyIcon className="w-4 h-4" /> Access Cards
                  </button>
                  <button onClick={exportCSV}
                    className="flex items-center gap-2 px-4 py-2.5 bg-card shadow-sm hover:bg-muted text-muted-foreground hover:text-foreground text-[10px] font-black uppercase tracking-widest rounded-xl border border-border transition-all print:hidden">
                    <ArrowDownTrayIcon className="w-4 h-4" /> Export
                  </button>
                  <button
                    onClick={handleSync}
                    disabled={syncing}
                    className={`flex items-center gap-2 px-4 py-2.5 text-[10px] font-black uppercase tracking-widest rounded-xl transition-all disabled:opacity-50 ${gapCount ? 'bg-amber-500/10 border border-amber-500/20 text-amber-600 dark:text-amber-400 hover:bg-amber-500/20' : 'bg-card shadow-sm border border-border text-muted-foreground hover:bg-muted hover:text-foreground'}`}
                  >
                    {syncing ? <ArrowPathIcon className="w-4 h-4 animate-spin" /> : <BoltIcon className="w-4 h-4" />}
                    {syncing ? 'Syncing…' : gapCount ? `Sync (${gapCount})` : 'Sync'}
                  </button>
                </>
              )}
            </div>
          </div>


          {/* ── Management Hub ───────────────────────────────
              Bulk & multi-step workflows live here. Labels are chosen so
              each verb only appears ONCE across the header row above and
              this hub — no duplicate "Register Student" / "Card Studio". */}
          <div className="bg-card border border-border p-5 print:hidden">
            <p className="text-[9px] font-black text-muted-foreground uppercase tracking-[0.25em] mb-4">Student Management</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
              {(([
                { label: 'Bulk Register', sub: 'Add many students at once', href: '/dashboard/students/bulk-register', icon: UserPlusIcon, color: 'text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border-emerald-500/30 hover:bg-emerald-500/20', adminTeacherOnly: true },
                { label: 'Import CSV', sub: 'Upload spreadsheet', href: '/dashboard/students/import', icon: ArrowDownTrayIcon, color: 'text-primary bg-primary/10 border-primary/30 hover:bg-primary/20', adminTeacherOnly: true },
                { label: 'Enrol Students', sub: 'Assign to programs', href: '/dashboard/students/bulk-enroll', icon: AcademicCapIcon, color: 'text-primary bg-primary/10 border-primary/30 hover:bg-primary/20', adminTeacherOnly: true },
                { label: 'Classes', sub: 'Manage class rosters', href: '/dashboard/classes', icon: UserGroupIcon, color: 'text-cyan-600 dark:text-cyan-400 bg-cyan-500/10 border-cyan-500/30 hover:bg-cyan-500/20', adminTeacherOnly: true },
                { label: 'Card Studio', sub: 'Design ID cards', href: '/dashboard/card-studio?mode=issuance&type=student', icon: ClipboardIcon, color: 'text-primary bg-primary/10 border-primary/30 hover:bg-primary/20' },
                { label: 'Wipe Students', sub: 'Permanently remove', href: '/dashboard/students/bulk-delete', icon: ExclamationTriangleIcon, color: 'text-rose-600 dark:text-rose-400 bg-rose-500/10 border-rose-500/30 hover:bg-rose-500/20', danger: true, adminOnly: true },
              ] as { label: string; sub: string; href: string; icon: ComponentType<{ className?: string }>; color: string; danger?: boolean; adminOnly?: boolean; adminTeacherOnly?: boolean }[])).filter(item => {
                if (item.adminOnly && profile?.role !== 'admin') return false;
                if (item.adminTeacherOnly && !['admin', 'teacher'].includes(profile?.role ?? '')) return false;
                return true;
              }).map(({ label, sub, href, icon: Icon, color, danger }) => (
                <Link key={label} href={href}
                  className={`group flex flex-col gap-4 p-5 border rounded-2xl transition-all duration-300 hover:shadow-xl hover:-translate-y-1 ${color}`}
                  title={danger ? '⚠️ This permanently deletes student data' : label}
                >
                  <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center transition-transform group-hover:scale-110 group-hover:rotate-3 shadow-lg">
                    <Icon className="w-5 h-5" />
                  </div>
                  <div>
                    <p className={`text-[11px] font-black uppercase tracking-widest leading-tight ${danger ? 'text-rose-600 dark:text-rose-400' : 'text-foreground'}`}>{label}</p>
                    <p className="text-[10px] text-muted-foreground mt-1.5 leading-relaxed font-medium opacity-80 group-hover:opacity-100 transition-opacity">{sub}</p>
                  </div>
                </Link>
              ))}
            </div>
          </div>

          {/* ── Error ──────────────────────────────────────── */}
          {error && (
            <div className="flex items-center gap-4 bg-rose-500/10 border border-rose-500/20 rounded-xl p-5 shadow-2xl animate-shake">
              <div className="w-10 h-10 rounded-xl bg-rose-500/20 flex items-center justify-center flex-shrink-0">
                <ExclamationTriangleIcon className="w-5 h-5 text-rose-600 dark:text-rose-400" />
              </div>
              <p className="text-rose-600 dark:text-rose-400 text-sm font-bold">{error}</p>
            </div>
          )}

          {/* ── Stats ──────────────────────────────────────── */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 print:hidden px-1 sm:px-0">
            {([
              { label: 'Total', value: combined.length, icon: UserGroupIcon, color: 'text-primary', bg: 'bg-primary/10', active: sourceFilter === 'all' && filter === 'all', onClick: () => { setSourceFilter('all'); setFilter('all'); } },
              { label: 'Enrolled', value: normalizedEnrolled.length, icon: AcademicCapIcon, color: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-500/10', active: sourceFilter === 'enrolled', onClick: () => setSourceFilter(sourceFilter === 'enrolled' ? 'all' : 'enrolled') },
              { label: 'Applications', value: normalizedApplications.length, icon: ClipboardDocumentListIcon, color: 'text-primary', bg: 'bg-primary/10', active: sourceFilter === 'applications', onClick: () => setSourceFilter(sourceFilter === 'applications' ? 'all' : 'applications') },
              { label: 'Pending', value: pending, icon: ClockIcon, color: 'text-amber-600 dark:text-amber-400', bg: 'bg-amber-500/10', active: filter === 'pending', onClick: () => setFilter(filter === 'pending' ? 'all' : 'pending') },
            ]).map(s => (
              <button key={s.label} onClick={s.onClick}
                className={`group relative text-left bg-card shadow-sm border rounded-xl p-5 sm:p-6 transition-all hover:bg-white/8 overflow-hidden ${s.active ? 'border-border ring-1 ring-white/10' : 'border-border'}`}>
                <div className={`absolute top-0 right-0 w-24 h-24 ${s.bg} rounded-full blur-3xl opacity-20 -mr-12 -mt-12 group-hover:scale-150 transition-transform`} />
                <div className={`w-10 h-10 sm:w-12 sm:h-12 ${s.bg} rounded-xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform`}>
                  <s.icon className={`w-5 h-5 sm:w-6 sm:h-6 ${s.color}`} />
                </div>
                <p className={`text-2xl sm:text-4xl font-black ${s.color} tabular-nums`}>{s.value}</p>
                <p className="text-[10px] sm:text-xs text-muted-foreground font-black uppercase tracking-widest mt-1.5">{s.label}</p>
              </button>
            ))}
          </div>

          {/* ── Fee Status Bar (enrolled students only) ─────── */}
          {normalizedEnrolled.length > 0 && (profile?.role === 'admin' || profile?.role === 'teacher' || profile?.role === 'school') && (
            <div className="print:hidden">
              <p className="text-[9px] font-black uppercase tracking-widest text-muted-foreground mb-2 px-1">Fee Payment Status — Enrolled Students</p>
              <div className="flex flex-wrap gap-2">
                {([
                  { key: 'all', label: 'All Enrolled', count: normalizedEnrolled.length, cls: 'border-border text-muted-foreground hover:border-primary/40', activeCls: 'border-primary bg-primary/10 text-primary' },
                  { key: 'paid', label: '✓ Paid', count: feeStats.paid, cls: 'border-emerald-500/30 text-emerald-600 dark:text-emerald-400 hover:border-emerald-500/60', activeCls: 'border-emerald-500 bg-emerald-500/15 text-emerald-600 dark:text-emerald-400' },
                  { key: 'pending', label: '· Pending', count: feeStats.pending, cls: 'border-amber-500/30 text-amber-600 dark:text-amber-400 hover:border-amber-500/60', activeCls: 'border-amber-500 bg-amber-500/15 text-amber-600 dark:text-amber-400' },
                  { key: 'overdue', label: '⚠ Overdue', count: feeStats.overdue, cls: 'border-rose-500/30 text-rose-600 dark:text-rose-400 hover:border-rose-500/60', activeCls: 'border-rose-500 bg-rose-500/15 text-rose-600 dark:text-rose-400' },
                  { key: 'none', label: 'No Invoice', count: feeStats.none, cls: 'border-border text-muted-foreground hover:border-border', activeCls: 'border-border bg-muted text-foreground' },
                ] as const).map(({ key, label, count, cls, activeCls }) => (
                  <button
                    key={key}
                    onClick={() => { setFeeFilter(key); if (key !== 'all') setSourceFilter('enrolled'); }}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-[10px] font-black uppercase tracking-widest transition-all ${feeFilter === key ? activeCls : cls}`}
                  >
                    {label}
                    <span className={`inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full text-[9px] font-black ${feeFilter === key ? 'bg-white/20' : 'bg-muted'}`}>
                      {count}
                    </span>
                  </button>
                ))}
              </div>
              {feeStats.overdue > 0 && (
                <p className="text-[10px] text-rose-600 dark:text-rose-400 mt-2 px-1">
                  ⚠ {feeStats.overdue} student{feeStats.overdue !== 1 ? 's' : ''} with overdue fee{feeStats.overdue !== 1 ? 's' : ''}
                </p>
              )}
            </div>
          )}

          {/* ── Pending alert ───────────────────────────────── */}
          {pending > 0 && (
            <div className="flex items-center gap-4 bg-amber-500/10 border border-amber-500/20 rounded-xl p-4">
              <ClockIcon className="w-6 h-6 text-amber-600 dark:text-amber-400 flex-shrink-0" />
              <div className="flex-1">
                <p className="font-bold text-amber-600 dark:text-amber-400">{pending} student{pending !== 1 ? 's' : ''} awaiting approval</p>
                <p className="text-xs text-muted-foreground mt-0.5">Click a student row to expand and approve</p>
              </div>
              <button onClick={() => { setSourceFilter('applications'); setFilter('pending'); }}
                className="px-4 py-1.5 bg-amber-500/20 hover:bg-amber-500/30 text-amber-400 text-xs font-bold rounded-xl transition-colors print:hidden">
                Show Pending
              </button>
            </div>
          )}

          {/* Print Header (Only visible when printing) */}
          <div className="hidden print:block mb-8">
            <h1 className="text-2xl font-black text-foreground print:text-black">Student List</h1>
            <p className="text-sm text-muted-foreground">
              {profile?.school_name || 'School Report'} · {new Date().toLocaleDateString()}
            </p>
          </div>

          {/* ── Search + Filters ─────────────────────────────── */}
          <div className="flex flex-col gap-3 print:hidden">
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input aria-label="Search students" type="text"
                  placeholder="Search name, email, school, class, city…"
                  value={search} onChange={e => setSearch(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 bg-card shadow-sm border border-border rounded-xl text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:border-primary transition-colors" />
              </div>
              <select title="Filter by student type" value={sourceFilter} onChange={e => setSourceFilter(e.target.value as any)}
                className="px-4 py-3 bg-card shadow-sm border border-border rounded-xl text-sm text-foreground focus:outline-none focus:border-primary cursor-pointer">
                <option value="all">All Students</option>
                <option value="enrolled">Enrolled Portal</option>
                <option value="applications">Applications</option>
                <option value="special">✨ Special programme / Summer cohort</option>
              </select>
              <select title="Filter by status" value={filter} onChange={e => setFilter(e.target.value)}
                className="px-4 py-3 bg-card shadow-sm border border-border rounded-xl text-sm text-foreground focus:outline-none focus:border-primary cursor-pointer">
                <option value="all">All Status</option>
                <option value="active">Active</option>
                <option value="pending">Pending</option>
                <option value="approved">Approved</option>
                <option value="rejected">Rejected</option>
              </select>
              <select title="Filter by gender" value={filterGender} onChange={e => setFilterGender(e.target.value)}
                className="px-4 py-3 bg-card shadow-sm border border-border rounded-xl text-sm text-foreground focus:outline-none focus:border-primary cursor-pointer">
                <option value="">All Genders</option>
                <option value="male">Male</option>
                <option value="female">Female</option>
              </select>
            </div>
            {/* Registry print filters */}
            <div className="flex flex-col gap-2">
              <span className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">Filter for print:</span>
              <div className="flex flex-wrap gap-2 items-center">
                <select title="Filter by school" value={filterSchoolReg} onChange={e => setFilterSchoolReg(e.target.value)}
                  className="flex-1 min-w-[140px] px-3 py-2 bg-card shadow-sm border border-border rounded-xl text-sm text-foreground focus:outline-none focus:border-primary cursor-pointer">
                  <option value="">All Schools</option>
                  {distinctSchoolsReg.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
                <select title="Filter by grade" value={filterGradeReg} onChange={e => setFilterGradeReg(e.target.value)}
                  className="flex-1 min-w-[120px] px-3 py-2 bg-card shadow-sm border border-border rounded-xl text-sm text-foreground focus:outline-none focus:border-sky-500 cursor-pointer">
                  <option value="">All Grades</option>
                  {distinctGradesReg.map(g => <option key={g} value={g}>{g}</option>)}
                </select>
                <select title="Filter by class" value={filterClassReg} onChange={e => setFilterClassReg(e.target.value)}
                  className="flex-1 min-w-[140px] px-3 py-2 bg-card shadow-sm border border-border rounded-xl text-sm text-foreground focus:outline-none focus:border-primary cursor-pointer">
                  <option value="">All Classes</option>
                  {distinctClassesReg.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
                {(filterSchoolReg || filterClassReg || filterGradeReg) && (
                  <button onClick={() => { setFilterSchoolReg(''); setFilterClassReg(''); setFilterGradeReg(''); }}
                    className="px-3 py-2 bg-card shadow-sm hover:bg-muted border border-border rounded-xl text-xs text-muted-foreground hover:text-foreground transition-all flex-shrink-0">
                    Clear
                  </button>
                )}
                <button onClick={handlePrintRegistry}
                  className="flex items-center gap-2 px-4 py-2 bg-primary/20 hover:bg-primary/30 border border-primary/30 text-primary text-[10px] font-black uppercase tracking-widest rounded-xl transition-all flex-shrink-0">
                  <PrinterIcon className="w-3.5 h-3.5" /> Generate Registry
                </button>
              </div>
            </div>
          </div>

          {/* ── Empty ───────────────────────────────────────── */}
          {filtered.length === 0 && !error && (
            <div className="text-center py-20 bg-card shadow-sm border border-border rounded-xl">
              <UserGroupIcon className="w-14 h-14 mx-auto text-muted-foreground mb-4" />
              <p className="text-lg font-semibold text-muted-foreground">No students found</p>
              <p className="text-sm text-muted-foreground mt-1">
                {search ? 'Try a different search term' : 'Students will appear here once they register or enrol'}
              </p>
            </div>
          )}

          {/* ── Unified Student List ──────────────────────────── */}
          {filtered.length > 0 && (
            <div className="bg-card shadow-sm border border-border rounded-xl overflow-hidden">
              <div className="p-5 border-b border-border flex items-center justify-between">
                <h3 className="font-bold text-foreground flex items-center gap-2">
                  <AcademicCapIcon className="w-5 h-5 text-primary" /> Student Records
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
                        className="flex items-start gap-2 sm:gap-4 p-3 sm:p-5 hover:bg-card shadow-sm transition-colors cursor-pointer group"
                        onClick={() => setExpanded(isExpanded ? null : s.id)}>

                        {/* Enrol checkbox (enrolled students only — Admin/Teacher only) */}
                        {isEnrolled && (profile?.role === 'admin' || profile?.role === 'teacher') && (
                          <div
                            onClick={e => { e.stopPropagation(); setSelectedForEnrol(prev => { const n = new Set(prev); if (n.has(s.id)) n.delete(s.id); else n.add(s.id); return n; }); }}
                            className={`flex-shrink-0 w-5 h-5 rounded border-2 flex items-center justify-center mt-3 transition-all cursor-pointer ${selectedForEnrol.has(s.id) ? 'bg-primary border-primary' : 'border-border hover:border-primary'}`}>
                            {selectedForEnrol.has(s.id) && <CheckCircleIcon className="w-3 h-3 text-foreground" />}
                          </div>
                        )}
                        {/* Unenrol checkbox — enrolled students with a class, all staff roles */}
                        {isEnrolled && s.class_id && (profile?.role === 'admin' || profile?.role === 'teacher' || profile?.role === 'school') && (
                          <div
                            onClick={e => { e.stopPropagation(); setSelectedForUnenrol(prev => { const n = new Set(prev); if (n.has(s.id)) n.delete(s.id); else n.add(s.id); return n; }); }}
                            title="Select for bulk unenrol"
                            className={`flex-shrink-0 w-5 h-5 rounded border-2 flex items-center justify-center mt-3 transition-all cursor-pointer ${selectedForUnenrol.has(s.id) ? 'bg-rose-600 border-rose-400' : 'border-border hover:border-rose-400'}`}>
                            {selectedForUnenrol.has(s.id) && <XMarkIcon className="w-3 h-3 text-foreground" />}
                          </div>
                        )}

                        {/* Avatar */}
                        <div className={`w-8 h-8 sm:w-11 sm:h-11 rounded-full bg-gradient-to-br ${isEnrolled ? 'from-primary to-primary to-teal-600' : 'from-primary to-primary to-primary'} flex items-center justify-center text-xs sm:text-sm font-black text-foreground flex-shrink-0 mt-0.5`}>
                          {(s.full_name ?? '?').split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase()}
                        </div>

                        <div className="flex-1 min-w-0">
                          {/* Name + badges */}
                          <div className="flex items-center gap-1.5 flex-wrap mb-1">
                            <span className="font-bold text-foreground text-sm sm:text-base truncate max-w-[140px] sm:max-w-none">{s.full_name}</span>
                            {(s as any).has_published_report !== undefined && (
                              <span
                                title={(s as any).has_published_report ? 'Progress report published this term' : 'No published progress report this term — needs attention'}
                                className={`w-2 h-2 rounded-full flex-shrink-0 ${(s as any).has_published_report ? 'bg-emerald-400' : 'bg-amber-400'}`}
                              />
                            )}
                            <span className={`text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full border ${isEnrolled ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20' : 'bg-primary/10 text-primary border-primary/20'}`}>
                              {isEnrolled ? 'Enrolled' : 'Application'}
                            </span>
                            {isSpecialEnrollment(s.enrollment_type) && (
                              <span className="text-[9px] font-black uppercase tracking-widest px-2.5 py-0.5 rounded-full border bg-amber-500/20 text-amber-600 dark:text-amber-400 border-amber-500/30 animate-pulse">
                                Special programme
                              </span>
                            )}
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
                                <Chip icon={AcademicCapIcon} text={s.grade_level || s.grade} />
                                <Chip icon={BookOpenIcon} text={(s.class_id && classMap[s.class_id]) || s.section_class} />
                                <Chip icon={EnvelopeIcon} text={s.email} />
                                <span className="text-[9px] font-black font-mono px-2 py-0.5 rounded bg-primary/10 text-primary border border-primary/20 uppercase tracking-wider select-all" title="Student Access Code">
                                  RC-{s.id.slice(0, 8).toUpperCase()}
                                </span>
                                <FeeBadge entry={feeMap[s.id]} />
                              </>
                            ) : (
                              <>
                                <Chip icon={AcademicCapIcon} text={s.grade_level} />
                                <Chip icon={MapPinIcon} text={[s.city, s.state].filter(Boolean).join(', ')} />
                                <Chip icon={BookOpenIcon} text={isSpecialEnrollment(s.enrollment_type) ? 'Special programme / Summer cohort' : s.enrollment_type ? `${s.enrollment_type} enrolment` : ''} />
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
                        <div className="flex flex-col items-end gap-1.5 flex-shrink-0 print:hidden ml-auto self-start pt-0.5" onClick={e => e.stopPropagation()}>
                          {/* Approve/Reject — hidden on mobile, shown sm+ */}
                          {!isEnrolled && s.status === 'pending' && (profile?.role === 'admin' || profile?.role === 'teacher') && (
                            <div className="hidden sm:flex items-center gap-1.5">
                              <button
                                onClick={e => { e.stopPropagation(); approve(s.id); }}
                                disabled={acting === s.id}
                                className="flex items-center gap-1 px-2.5 py-1 bg-emerald-600 hover:bg-emerald-500 text-foreground text-[10px] font-black uppercase tracking-widest rounded-xl transition-all disabled:opacity-50">
                                <CheckCircleIcon className="w-3 h-3" />
                                {acting === s.id ? '…' : 'OK'}
                              </button>
                              <button
                                onClick={e => { e.stopPropagation(); reject(s.id); }}
                                disabled={acting === s.id}
                                className="flex items-center gap-1 px-2.5 py-1 bg-rose-600 hover:bg-rose-500 text-foreground text-[10px] font-black uppercase tracking-widest rounded-xl transition-all disabled:opacity-50">
                                <XCircleIcon className="w-3 h-3" />
                                {acting === s.id ? '…' : 'No'}
                              </button>
                            </div>
                          )}
                          {/* Icon row — always visible */}
                          <div className="flex items-center gap-1">
                            {!isEnrolled && (
                              <button
                                onClick={e => { e.stopPropagation(); startEdit(s); }}
                                title="Edit student"
                                className="p-1.5 rounded-xl bg-card shadow-sm border border-border hover:border-primary/30 text-muted-foreground hover:text-foreground transition-all">
                                <PencilSquareIcon className="w-3.5 h-3.5" />
                              </button>
                            )}
                            {isEnrolled && (profile?.role === 'admin' || profile?.role === 'teacher') && (
                              <button
                                onClick={e => { e.stopPropagation(); setEditEnrolledStudent(s); }}
                                title="Edit student details"
                                className="p-1.5 rounded-xl bg-card shadow-sm border border-border hover:border-primary/30 text-muted-foreground hover:text-foreground transition-all">
                                <PencilSquareIcon className="w-3.5 h-3.5" />
                              </button>
                            )}
                            {/* Pre-portal student delete */}
                            {!isEnrolled && (
                              <button
                                onClick={e => { e.stopPropagation(); handleDeleteStudent(s.id); }}
                                disabled={deleting === s.id}
                                className="p-1.5 rounded-xl bg-rose-500/5 border border-rose-500/20 hover:border-rose-500/40 text-rose-600/60 dark:text-rose-400/60 hover:text-rose-600 dark:hover:text-rose-400 transition-all disabled:opacity-50">
                                <XMarkIcon className="w-3.5 h-3.5" />
                              </button>
                            )}
                            {/* Enrolled student: unenrol from class */}
                            {isEnrolled && s.class_id && (
                              <button
                                onClick={async e => {
                                  e.stopPropagation();
                                  const className = classMap[s.class_id] ?? 'their class';
                                  if (!confirm(`Remove ${s.full_name} from ${className}?\n\nTheir portal account will remain active.`)) return;
                                  const res = await fetch(`/api/classes/${s.class_id}/enroll`, {
                                    method: 'DELETE',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ studentId: s.id }),
                                  });
                                  if (!res.ok) { const j = await res.json(); alert(j.error || 'Failed to unenrol'); return; }
                                  setPortalStudents(prev => prev.map(p => p.id === s.id ? { ...p, class_id: null, section_class: null } : p));
                                }}
                                title="Remove from class"
                                className="p-1.5 rounded-xl bg-rose-500/5 border border-rose-500/20 hover:border-rose-500/40 text-rose-600/60 dark:text-rose-400/60 hover:text-rose-600 dark:hover:text-rose-400 transition-all">
                                <XMarkIcon className="w-3.5 h-3.5" />
                              </button>
                            )}
                            {/* Enrolled student: reset password */}
                            {isEnrolled && (profile?.role === 'admin' || profile?.role === 'teacher') && (
                              <button
                                onClick={e => { e.stopPropagation(); setResetPwTarget({ id: s.id, name: s.full_name ?? 'Student' }); setResetPwValue(''); setResetPwMsg(null); }}
                                title="Reset password"
                                className="p-1.5 rounded-xl bg-primary/5 border border-primary/20 hover:border-primary/40 text-primary/60 hover:text-primary transition-all">
                                <KeyIcon className="w-3.5 h-3.5" />
                              </button>
                            )}
                            {/* Enrolled student delete */}
                            {isEnrolled && (profile?.role === 'admin' || profile?.role === 'teacher') && (
                              <button
                                onClick={e => { e.stopPropagation(); handleDeleteEnrolledStudent(s.id, s.full_name ?? 'this student'); }}
                                disabled={deleting === s.id}
                                title="Remove student"
                                className="p-1.5 rounded-xl bg-rose-500/5 border border-rose-500/20 hover:border-rose-500/40 text-rose-600/60 dark:text-rose-400/60 hover:text-rose-600 dark:hover:text-rose-400 transition-all disabled:opacity-50">
                                {deleting === s.id
                                  ? <div className="w-3.5 h-3.5 border-2 border-rose-400 border-t-transparent rounded-full animate-spin" />
                                  : <XMarkIcon className="w-3.5 h-3.5" />}
                              </button>
                            )}
                            <div className="p-1.5 rounded-xl bg-card shadow-sm border border-border text-muted-foreground" onClick={() => setExpanded(isExpanded ? null : s.id)}>
                              {isExpanded
                                ? <ChevronUpIcon className="w-3.5 h-3.5" />
                                : <ChevronDownIcon className="w-3.5 h-3.5" />}
                            </div>
                          </div>
                          {/* Approve/Reject on mobile — compact icon only */}
                          {!isEnrolled && s.status === 'pending' && (profile?.role === 'admin' || profile?.role === 'teacher') && (
                            <div className="sm:hidden flex items-center gap-1">
                              <button onClick={e => { e.stopPropagation(); approve(s.id); }} disabled={acting === s.id}
                                className="p-1.5 bg-emerald-600/20 border border-emerald-500/30 text-emerald-600 dark:text-emerald-400 rounded-xl transition-all disabled:opacity-50">
                                <CheckCircleIcon className="w-3.5 h-3.5" />
                              </button>
                              <button onClick={e => { e.stopPropagation(); reject(s.id); }} disabled={acting === s.id}
                                className="p-1.5 bg-rose-600/20 border border-rose-500/30 text-rose-600 dark:text-rose-400 rounded-xl transition-all disabled:opacity-50">
                                <XCircleIcon className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* ── Expanded Detail Panel ─── */}
                      {isExpanded && (
                        <div className="bg-white/[0.03] border-t border-border p-4 sm:p-8">
                          {isEnrolled ? (
                            /* Enrolled student detail */
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                              <div className="bg-card shadow-sm rounded-xl p-5 border border-border">
                                <p className="text-[10px] font-black text-muted-foreground uppercase tracking-[0.2em] mb-4 flex items-center gap-3">
                                  <AcademicCapIcon className="w-4 h-4 text-emerald-600 dark:text-emerald-400" /> Portal Account
                                </p>
                                <div className="space-y-3.5">
                                  <InfoRow label="Email" value={s.email} icon={<EnvelopeIcon className="w-3 h-3 text-muted-foreground" />} />
                                  <InfoRow label="School" value={s.school_name} />
                                  <InfoRow label="Grade" value={s.grade_level || s.grade} />
                                  <InfoRow label="Class" value={(s.class_id && classMap[s.class_id]) || s.section_class} />
                                  <InfoRow label="Status" value={s.is_active ? 'Active' : 'Inactive'} />
                                </div>
                              </div>
                              {profile?.role !== 'school' && (
                                <div className="bg-card shadow-sm rounded-xl p-5 border border-border">
                                  <p className="text-[10px] font-black text-muted-foreground uppercase tracking-[0.2em] mb-4">Assign School</p>
                                  <select
                                    value={s.school_id ?? ''}
                                    disabled={assigningSchool === s.id}
                                    onChange={e => assignStudentSchool(s.id, e.target.value)}
                                    className="w-full px-3 py-2.5 bg-card shadow-sm border border-border rounded-xl text-sm text-foreground focus:outline-none focus:border-primary cursor-pointer disabled:opacity-40"
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
                              <div className="bg-card shadow-sm rounded-xl p-5 sm:p-6 border border-border shadow-2xl">
                                <p className="text-[10px] font-black text-muted-foreground uppercase tracking-[0.2em] mb-4 flex items-center gap-3">
                                  <UserIcon className="w-4 h-4 text-primary" /> Parent / Guardian
                                </p>
                                <div className="space-y-3.5">
                                  <InfoRow label="Name" value={s.parent_name} />
                                  <InfoRow label="Relationship" value={s.parent_relationship} />
                                  <InfoRow label="Phone" value={s.parent_phone} icon={<PhoneIcon className="w-3 h-3 text-muted-foreground" />} />
                                  <InfoRow label="Email" value={s.parent_email} icon={<EnvelopeIcon className="w-3 h-3 text-muted-foreground" />} />
                                </div>
                              </div>
                              <div className="bg-card shadow-sm rounded-xl p-5 sm:p-6 border border-border shadow-2xl">
                                <p className="text-[10px] font-black text-muted-foreground uppercase tracking-[0.2em] mb-4 flex items-center gap-3">
                                  <AcademicCapIcon className="w-4 h-4 text-primary" /> Identity
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
                              <div className="bg-background rounded-xl p-5 sm:p-6 border border-border shadow-2xl">
                                <p className="text-[10px] font-black text-muted-foreground uppercase tracking-[0.2em] mb-4 flex items-center gap-3">
                                  <BookOpenIcon className="w-4 h-4 text-emerald-600 dark:text-emerald-400" /> Programme
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
                                  {/* Registration Payment Status */}
                                  <InfoRow
                                    label="Reg. Payment"
                                    value={s.registration_payment_at
                                      ? new Date(s.registration_payment_at).toLocaleDateString('en-GB')
                                      : 'Not paid'}
                                    icon={s.registration_payment_at
                                      ? <CheckCircleIcon className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
                                      : <ClockIcon className="w-3 h-3 text-amber-600 dark:text-amber-400" />}
                                  />
                                  {s.registration_paystack_reference && (
                                    <InfoRow label="Ref" value={s.registration_paystack_reference} />
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
                                  className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-6 py-3 bg-emerald-600 hover:bg-emerald-500 text-foreground text-[10px] font-black uppercase tracking-widest rounded-xl transition-all disabled:opacity-50 shadow-2xl shadow-emerald-600/20 active:scale-95">
                                  <CheckCircleIcon className="w-4 h-4" />
                                  {acting === s.id ? '…' : `Approve ${s.full_name?.split(' ')[0]}`}
                                </button>
                                <button onClick={() => reject(s.id)} disabled={acting === s.id}
                                  className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-6 py-3 bg-rose-600 hover:bg-rose-500 text-foreground text-[10px] font-black uppercase tracking-widest rounded-xl transition-all disabled:opacity-50 active:scale-95">
                                  <XCircleIcon className="w-4 h-4" />
                                  {acting === s.id ? '…' : 'Reject'}
                                </button>
                              </div>
                            )}
                            {!isEnrolled && s.status === 'approved' && (
                              <div className="flex flex-wrap items-center gap-4">
                                <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-[10px] font-black uppercase tracking-widest">
                                  <CheckCircleIcon className="w-3.5 h-3.5" />
                                  Approved Student
                                </div>
                                {s.user_id ? (
                                  <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-primary/10 border border-primary/20 text-primary text-[10px] font-black uppercase tracking-widest">
                                    <ShieldCheckIcon className="w-3.5 h-3.5" />
                                    Portal Active
                                  </div>
                                ) : activatePending?.id === s.id ? (
                                  <div className="flex flex-wrap items-center gap-2 p-3 bg-muted/50 border border-border rounded-xl">
                                    <p className="w-full text-[10px] font-black uppercase tracking-widest text-muted-foreground">Assign to class before activating</p>
                                    <select
                                      value={activateClassId}
                                      onChange={e => setActivateClassId(e.target.value)}
                                      className="select-premium flex-1 text-xs px-2 py-1.5 min-w-[160px]"
                                    >
                                      <option value="">— Pick a class (optional) —</option>
                                      {classList
                                        .filter((c: any) => !activatePending?.school_id || c.school_id === activatePending?.school_id)
                                        .map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
                                    </select>
                                    <button
                                      onClick={() => activatePortalAccount(s.id, s.full_name, activateClassId || undefined)}
                                      disabled={activating === s.id}
                                      className="flex items-center gap-1.5 px-4 py-2 bg-primary text-white text-[10px] font-black uppercase tracking-widest rounded-xl disabled:opacity-50 transition-all active:scale-95">
                                      <KeyIcon className="w-3.5 h-3.5" />
                                      {activating === s.id ? 'Creating…' : 'Confirm & Activate'}
                                    </button>
                                    <button
                                      onClick={() => setActivatePending(null)}
                                      className="px-3 py-2 text-[10px] font-bold text-muted-foreground hover:text-foreground uppercase tracking-widest transition-colors">
                                      Cancel
                                    </button>
                                  </div>
                                ) : (
                                  <button
                                    onClick={() => openActivatePicker(s)}
                                    disabled={activating === s.id}
                                    className="flex items-center gap-2 px-5 py-2.5 bg-primary hover:bg-primary disabled:opacity-50 text-foreground text-[10px] font-black uppercase tracking-widest rounded-xl transition-all shadow-2xl active:scale-95">
                                    <KeyIcon className="w-4 h-4" />
                                    {activating === s.id ? 'Creating' : 'Activate Portal'}
                                  </button>
                                )}
                              </div>
                            )}
                            {!isEnrolled && s.status === 'rejected' && (
                              <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-400 text-[10px] font-black uppercase tracking-widest">
                                <XCircleIcon className="w-3.5 h-3.5" />
                                Registration Rejected
                              </div>
                            )}
                            <div className="ml-auto flex items-center gap-5">
                              {!isEnrolled && (
                                <Link href={`/dashboard/students/${s.id}/report`}
                                  className="flex items-center gap-2 text-[10px] font-black text-primary hover:text-foreground uppercase tracking-widest transition-colors">
                                  <ClipboardDocumentListIcon className="w-4 h-4" /> Report
                                </Link>
                              )}
                              {(profile?.role === 'admin' || profile?.role === 'teacher') && (
                                <button
                                  onClick={() => setLinkParentTarget(s)}
                                  className="flex items-center gap-2 text-[10px] font-black text-primary hover:text-foreground uppercase tracking-widest transition-colors">
                                  <UserPlusIcon className="w-4 h-4" />
                                  {s.parent_email ? 'Edit Parent' : 'Link Parent'}
                                </button>
                              )}
                              {s.parent_email && (
                                <a href={`mailto:${s.parent_email}`}
                                  className="flex items-center gap-2 text-[10px] font-black text-muted-foreground hover:text-foreground uppercase tracking-widest transition-colors">
                                  <EnvelopeIcon className="w-4 h-4" /> Mail
                                </a>
                              )}
                              {(isEnrolled || s.user_id) && (
                                <button onClick={() => handlePrintLoginSlip(s)}
                                  className="flex items-center gap-2 text-[10px] font-black text-primary hover:text-primary uppercase tracking-widest transition-colors">
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

      {/* ── Link Parent Modal ────────────────────────────── */}
      {linkParentTarget && (
        <LinkParentModal
          student={linkParentTarget}
          onClose={() => setLinkParentTarget(null)}
          onSaved={() => { setLinkParentTarget(null); load(); }}
        />
      )}

      {/* ── Unenrol Confirmation Modal ───────────────────── */}
      {showUnenrolModal && (() => {
        const selectedStudents = portalStudents.filter(s => selectedForUnenrol.has(s.id));
        const withClass = selectedStudents.filter(s => s.class_id);
        const noClass = selectedStudents.filter(s => !s.class_id);
        return (
          <div className="mobile-native-dialog fixed inset-0 z-[90] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
            <div role="dialog" aria-modal="true" className="bg-background border border-rose-500/30 rounded-xl w-full max-w-md shadow-2xl shadow-rose-500/10">
              <div className="flex items-center justify-between px-6 py-4 border-b border-border">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 bg-rose-500/10 border border-rose-500/20 flex items-center justify-center">
                    <XCircleIcon className="w-5 h-5 text-rose-600 dark:text-rose-400" />
                  </div>
                  <div>
                    <h2 className="font-black text-foreground text-sm uppercase tracking-widest">Confirm Unenrol</h2>
                    <p className="text-[10px] text-muted-foreground mt-0.5">
                      {withClass.length} student{withClass.length !== 1 ? 's' : ''} will be removed from their class
                    </p>
                  </div>
                </div>
                <button onClick={() => setShowUnenrolModal(false)} className="text-muted-foreground hover:text-foreground transition-colors">
                  <XMarkIcon className="w-5 h-5" />
                </button>
              </div>
              <div className="p-6 space-y-4">
                {withClass.length > 0 && (
                  <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
                    <p className="text-[10px] font-black text-rose-600/70 dark:text-rose-400/70 uppercase tracking-widest mb-2">Will be unenrolled from their class:</p>
                    {withClass.map(s => (
                      <div key={s.id} className="flex items-center justify-between px-3 py-2 bg-rose-500/5 border border-rose-500/20 rounded-xl">
                        <span className="text-sm font-semibold text-foreground">{s.full_name}</span>
                        <span className="text-[10px] text-rose-600 dark:text-rose-400 font-bold">{classMap[s.class_id] ?? s.section_class ?? s.class_id.slice(0, 8)}</span>
                      </div>
                    ))}
                  </div>
                )}
                {noClass.length > 0 && (
                  <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-3">
                    <p className="text-xs text-amber-700 dark:text-amber-300 font-bold">
                      <ExclamationTriangleIcon className="w-3.5 h-3.5 inline mr-1.5" />
                      {noClass.length} student{noClass.length !== 1 ? 's' : ''} ({noClass.map(s => s.full_name.split(' ')[0]).join(', ')}) {noClass.length !== 1 ? 'have' : 'has'} no class — they will be skipped.
                    </p>
                  </div>
                )}
                {withClass.length === 0 && (
                  <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-4 text-center">
                    <p className="text-sm text-amber-700 dark:text-amber-300 font-bold">None of the selected students are in a class.</p>
                    <p className="text-xs text-muted-foreground mt-1">Nothing to unenrol.</p>
                  </div>
                )}
                <p className="text-xs text-muted-foreground">Their portal accounts and progress will remain intact — only the class assignment is removed.</p>
                <div className="flex gap-3 pt-2">
                  <button
                    onClick={() => setShowUnenrolModal(false)}
                    className="flex-1 py-2.5 border border-border text-xs font-black uppercase tracking-widest text-muted-foreground hover:text-foreground rounded-xl transition-all"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={executeBulkUnenrol}
                    disabled={withClass.length === 0 || bulkUnenrolling}
                    className="flex-1 py-2.5 bg-rose-600 hover:bg-rose-500 disabled:opacity-40 text-foreground text-xs font-black uppercase tracking-widest rounded-xl transition-all flex items-center justify-center gap-2"
                  >
                    {bulkUnenrolling
                      ? <><ArrowPathIcon className="w-4 h-4 animate-spin" /> Removing…</>
                      : `Remove ${withClass.length} Student${withClass.length !== 1 ? 's' : ''}`}
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ── Floating Bulk Enrol Bar ───────────────────────── */}
      {selectedForEnrol.size > 0 && (profile?.role === 'admin' || profile?.role === 'teacher') && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 print:hidden">
          <div className="flex items-center gap-3 bg-background border border-primary/40 rounded-xl px-5 py-3 shadow-2xl shadow-primary/20">
            <span className="text-sm font-bold text-foreground">{selectedForEnrol.size} selected</span>
            <button
              onClick={openBulkEnrol}
              className="px-4 py-2 bg-primary hover:bg-primary text-white text-sm font-bold rounded-xl transition-all flex items-center gap-2"
            >
              <AcademicCapIcon className="w-4 h-4" /> Enrol in Class
            </button>
            <button
              onClick={() => setSelectedForEnrol(new Set())}
              className="p-2 hover:bg-muted rounded-xl text-muted-foreground hover:text-foreground transition-all"
            >
              <XMarkIcon className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* ── Floating Bulk Unenrol Bar ─────────────────────── */}
      {selectedForUnenrol.size > 0 && (profile?.role === 'admin' || profile?.role === 'teacher' || profile?.role === 'school') && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 print:hidden" style={{ marginBottom: selectedForEnrol.size > 0 ? '64px' : '0' }}>
          <div className="flex items-center gap-3 bg-background border border-rose-500/40 rounded-xl px-5 py-3 shadow-2xl shadow-rose-500/20">
            <span className="text-sm font-bold text-foreground">{selectedForUnenrol.size} selected</span>
            <button
              onClick={() => setShowUnenrolModal(true)}
              disabled={bulkUnenrolling}
              className="px-4 py-2 bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-foreground text-sm font-bold rounded-xl transition-all flex items-center gap-2"
            >
              {bulkUnenrolling
                ? <><ArrowPathIcon className="w-4 h-4 animate-spin" /> Removing…</>
                : <><XMarkIcon className="w-4 h-4" /> Remove from Class</>}
            </button>
            <button
              onClick={() => setSelectedForUnenrol(new Set())}
              className="p-2 hover:bg-muted rounded-xl text-muted-foreground hover:text-foreground transition-all"
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

      {editEnrolledStudent && (
        <EditEnrolledModal
          student={editEnrolledStudent}
          schools={schoolList}
          onClose={() => setEditEnrolledStudent(null)}
          onSaved={() => { setEditEnrolledStudent(null); loadPortalStudents(); }}
        />
      )}

      <style dangerouslySetInnerHTML={{
        __html: `
        @media print {
          body { background: white !important; color: black !important; }
          .bg-[\#0f0f1a], .bg-gradient-to-br { background: white !important; }
          .bg-card\/5, .bg-card\/8, .bg-card\/10 { background: #f9fafb !important; border-color: #e5e7eb !important; }
          .text-foreground, .text-foreground\/60, .text-foreground\/40, .text-foreground\/30 { color: #111827 !important; }
          .border-border\/10, .border-border\/20, .border-border\/5 { border-color: #e5e7eb !important; }
          .max-w-7xl { max-width: 100% !important; padding: 0 !important; }
          .shadow-xl, .shadow-lg, .shadow-primary\/20, .shadow-2xl { box-shadow: none !important; }
          .print\:hidden { display: none !important; }
          h1, h2, h3 { color: black !important; }
          .divide-white\/5 { divide-color: #e5e7eb !important; }
        }
      `}} />
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
    const { resolveAssignmentTermId, filterByAssignmentSession } = await import('@/lib/assignments/session');
    const liveTermId = await resolveAssignmentTermId(supabase as any, {});
    const [enrRes, subsRowsRes, gradedRes, recentRes] = await Promise.allSettled([
      supabase.from('enrollments').select('id', { count: 'exact', head: true }).eq('user_id', uid),
      supabase.from('assignment_submissions').select('id, assignments(term_id)').eq('portal_user_id', uid),
      supabase.from('assignment_submissions')
        .select('grade, assignments(max_points, term_id)')
        .eq('portal_user_id', uid)
        .not('grade', 'is', null)
        .limit(100),
      supabase.from('assignment_submissions')
        .select('id, grade, status, submitted_at, assignments(title, max_points, term_id)')
        .eq('portal_user_id', uid)
        .order('submitted_at', { ascending: false })
        .limit(20),
    ]);

    const enrolled = enrRes.status === 'fulfilled' ? (enrRes.value.count ?? 0) : 0;
    const scopedSubs =
      subsRowsRes.status === 'fulfilled'
        ? filterByAssignmentSession((subsRowsRes.value.data ?? []) as any[], liveTermId)
        : [];
    const gradedData =
      gradedRes.status === 'fulfilled'
        ? filterByAssignmentSession((gradedRes.value.data ?? []) as any[], liveTermId)
        : [];
    const avgPct = gradedData.length > 0
      ? Math.round(gradedData.reduce((s: number, g: any) => {
        const max = g.assignments?.max_points ?? 100;
        return s + (g.grade / max) * 100;
      }, 0) / gradedData.length)
      : 0;
    const letter = avgPct >= 90 ? 'A' : avgPct >= 80 ? 'B' : avgPct >= 70 ? 'C' : avgPct >= 60 ? 'D' : gradedData.length ? 'F' : '—';
    const recentData =
      recentRes.status === 'fulfilled'
        ? filterByAssignmentSession((recentRes.value.data ?? []) as any[], liveTermId).slice(0, 5)
        : [];

    setStats({ enrolled, submitted: scopedSubs.length, graded: gradedData.length, avgPct, letter });
    setRecent(recentData);
    setLoading(false);
  }

  if (loading) return (
    <div className="min-h-screen bg-background flex items-center justify-center mobile-page-root">
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
    <div className="min-h-screen bg-background text-foreground mobile-page-root">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">

        {/* Header */}
        <div className="bg-background border border-emerald-500/20 rounded-[2.5rem] sm:rounded-[4rem] p-8 sm:p-16 relative overflow-hidden shadow-2xl group">
          <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-emerald-600/10 blur-[120px] -mr-64 -mt-64 pointer-events-none group-hover:bg-emerald-600/20 transition-all duration-1000" />
          <div className="absolute bottom-0 left-0 w-[300px] h-[300px] bg-primary/10 blur-[100px] -ml-32 -mb-32 pointer-events-none" />

          <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-10">
            <div className="space-y-6">
              <div className="flex items-center gap-3">
                <div className="px-5 py-2 bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-[10px] font-black uppercase tracking-[0.3em] rounded-xl shadow-xl">
                  Student Portal
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                  <span className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">System Active</span>
                </div>
              </div>

              <h1 className="text-4xl sm:text-7xl font-black text-foreground tracking-tighter leading-[0.9]">
                Welcome back,<br />
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-primary from-primary to-primary">
                  {profile?.full_name?.split(' ')?.[0] || 'Scholar'}
                </span>
              </h1>

              <div className="flex items-center gap-6 pt-2">
                <div className="flex items-center gap-2.5 px-6 py-3 bg-card shadow-sm border border-border rounded-xl text-[11px] font-black uppercase tracking-widest text-muted-foreground shadow-xl" suppressHydrationWarning>
                  <ClockIcon className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                  {now ? now.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }) : ''}
                </div>
              </div>
            </div>

            <div className="hidden lg:block relative">
              <div className="w-32 h-32 sm:w-48 sm:h-48 rounded-[2.5rem] bg-gradient-to-br from-primary to-primary from-primary to-primary flex items-center justify-center text-5xl sm:text-7xl font-black text-foreground shadow-3xl rotate-3 hover:rotate-0 transition-transform duration-500">
                {profile?.full_name?.[0].toUpperCase()}
              </div>
              <div className="absolute -bottom-4 -right-4 w-12 h-12 sm:w-16 sm:h-16 bg-card rounded-xl flex items-center justify-center text-foreground shadow-2xl -rotate-12">
                <SparklesIcon className="w-6 h-6 sm:w-8 sm:h-8 text-emerald-600 dark:text-emerald-400" />
              </div>
            </div>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6 print:hidden">
          {[
            { label: 'Enrolled Courses', value: stats.enrolled, icon: BookOpenIcon, color: 'text-primary', bg: 'bg-primary/10', border: 'border-primary/20' },
            { label: 'Work Submitted', value: stats.submitted, icon: ClipboardDocumentListIcon, color: 'text-primary', bg: 'bg-primary/10', border: 'border-primary/20' },
            { label: 'Graded Tasks', value: stats.graded, icon: CheckCircleIcon, color: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/20' },
            { label: 'Performance', value: stats.graded ? `${stats.letter} (${stats.avgPct}%)` : '—', icon: StarIcon, color: 'text-amber-600 dark:text-amber-400', bg: 'bg-amber-500/10', border: 'border-amber-500/20' },
          ].map(({ label, value, icon: Icon, color, bg, border }) => (
            <div key={label} className="bg-background border border-border rounded-xl p-6 sm:p-8 hover:bg-white/[0.03] hover:border-border transition-all group relative overflow-hidden shadow-2xl">
              <div className={`absolute top-0 right-0 w-24 h-24 ${bg} opacity-[0.05] blur-3xl -mr-12 -mt-12 group-hover:scale-150 transition-transform`} />
              <div className={`w-12 h-12 sm:w-16 sm:h-16 rounded-xl ${bg} ${border} border flex items-center justify-center mb-6 shadow-xl group-hover:scale-110 transition-transform`}>
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
            <div className="bg-card shadow-sm border border-border rounded-xl p-6">
              <h2 className="text-lg font-bold text-foreground mb-5">Quick Actions</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {quickActions.map(({ name, href, icon: Icon, desc }) => (
                  <Link key={name} href={href}
                    className="group flex items-start gap-4 p-4 rounded-xl border border-border hover:border-emerald-500/40 hover:bg-emerald-500/5 transition-all">
                    <div className="w-10 h-10 rounded-xl bg-emerald-500/15 border border-emerald-500/20 flex items-center justify-center flex-shrink-0 group-hover:bg-emerald-500/25 transition-colors">
                      <Icon className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
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
            <div className="bg-card shadow-sm border border-border rounded-xl p-6">
              <div className="flex items-center justify-between mb-5">
                <h2 className="text-lg font-bold text-foreground">Recent Activity</h2>
                <button onClick={load} className="p-1.5 rounded-xl hover:bg-muted text-muted-foreground hover:text-foreground transition-colors" title="Refresh">
                  <ArrowPathIcon className="w-4 h-4" />
                </button>
              </div>
              {recent.length === 0 ? (
                <div className="text-center py-8">
                  <ClipboardDocumentListIcon className="w-10 h-10 mx-auto text-muted-foreground mb-2" />
                  <p className="text-muted-foreground text-sm">No recent activity yet</p>
                </div>
              ) : (
                <div className="space-y-1">
                  {recent.map((s: any, i: number) => (
                    <div key={s.id} className={`flex items-start gap-3 py-3 ${i < recent.length - 1 ? 'border-b border-border' : ''}`}>
                      <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5 ${s.status === 'graded' ? 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400' : 'bg-primary/20 text-primary'
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
                      <span className="text-xs text-muted-foreground whitespace-nowrap mt-0.5">
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
            <div className="bg-gradient-to-br from-primary to-primary/20 from-primary to-primary/20 border border-emerald-500/20 rounded-xl p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary to-primary from-primary to-primary flex items-center justify-center text-xl font-black text-foreground">
                  {(profile?.full_name ?? 'U')[0].toUpperCase()}
                </div>
                <div>
                  <p className="font-bold text-foreground truncate">{profile?.full_name}</p>
                  <p className="text-xs text-muted-foreground truncate">{profile?.email}</p>
                </div>
              </div>
              <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-bold border bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border-emerald-500/30 capitalize">
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

            <div className="bg-card/90 backdrop-blur-2xl border border-border/80 rounded-3xl p-4 sm:p-6 shadow-xl">
              <h3 className="font-bold text-foreground text-sm mb-4">Navigate To</h3>
              <div className="space-y-1">
                {[
                  { label: 'My Courses', href: '/dashboard/courses', icon: BookOpenIcon },
                  { label: 'Lessons', href: '/dashboard/lessons', icon: AcademicCapIcon },
                  { label: 'Progress', href: '/dashboard/progress', icon: ClockIcon },
                  { label: 'Profile', href: '/dashboard/profile', icon: UserIcon },
                ].map(({ label, href, icon: Icon }) => (
                  <Link key={label} href={href}
                    className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-muted-foreground hover:bg-card shadow-sm hover:text-foreground transition-all group">
                    <Icon className="w-4 h-4 group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors" />
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
