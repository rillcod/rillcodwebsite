'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from '@/contexts/auth-context';
import {
  UserGroupIcon, MagnifyingGlassIcon, PlusIcon, XMarkIcon,
  EnvelopeIcon, PhoneIcon, UserIcon, AcademicCapIcon, CheckCircleIcon,
  XCircleIcon, PencilSquareIcon, ArrowPathIcon, LinkIcon, HeartIcon,
  ChevronDownIcon, ChevronUpIcon, BuildingOfficeIcon, EyeIcon, EyeSlashIcon,
  ClipboardIcon, KeyIcon,
} from '@/lib/icons';

// ── Types ─────────────────────────────────────────────────────────────────────
interface Parent {
  id: string;
  email: string;
  full_name: string;
  phone: string | null;
  is_active: boolean;
  created_at: string;
  children: LinkedChild[];
}
interface LinkedChild {
  id: string;
  full_name: string;
  school_name: string | null;
  status: string;
  parent_email: string;
}
interface Student {
  id: string;
  full_name: string;
  school_name: string | null;
  parent_email: string | null;
  grade_level: string | null;
}

// ── Searchable student picker ─────────────────────────────────────────────────
function StudentPicker({
  students,
  schools,
  value,
  onChange,
}: {
  students: Student[];
  schools: string[];
  value: string;
  onChange: (id: string) => void;
}) {
  const [q, setQ] = useState('');
  const [localSchool, setLocalSchool] = useState('');

  const filtered = useMemo(() => {
    let list = localSchool
      ? students.filter(s => s.school_name === localSchool)
      : students;
    if (q.trim()) {
      const lower = q.toLowerCase();
      list = list.filter(s => s.full_name.toLowerCase().includes(lower));
    }
    return list;
  }, [students, localSchool, q]);

  const selected = students.find(s => s.id === value);

  return (
    <div className="space-y-2">
      {/* School filter inside picker */}
      {schools.length > 0 && (
        <select
          value={localSchool}
          onChange={e => { setLocalSchool(e.target.value); onChange(''); }}
          className="w-full px-3 py-2 bg-background border border-border text-xs text-foreground focus:outline-none focus:border-orange-500 transition-colors"
        >
          <option value="">All Schools</option>
          {schools.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
      )}
      <div className="relative">
        <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
        <input
          value={q}
          onChange={e => setQ(e.target.value)}
          placeholder="Search students by name…"
          className="w-full pl-9 pr-4 py-2 bg-background border border-border text-xs text-foreground focus:outline-none focus:border-orange-500 transition-colors"
        />
      </div>
      <div className="border border-border max-h-48 overflow-y-auto bg-background">
        {filtered.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-4">
            {q ? 'No students match your search.' : localSchool ? 'No students in this school.' : 'No students found.'}
          </p>
        ) : (
          filtered.map(s => (
            <button
              type="button"
              key={s.id}
              onClick={() => { onChange(s.id); setQ(''); }}
              className={`w-full text-left px-4 py-2.5 hover:bg-orange-500/5 transition-all border-b border-border last:border-b-0 ${
                value === s.id ? 'bg-orange-500/10' : ''
              }`}
            >
              <span className={`text-xs font-bold ${value === s.id ? 'text-orange-400' : 'text-foreground'}`}>{s.full_name}</span>
              <span className="text-[10px] text-muted-foreground ml-2">
                {s.school_name ?? '—'}
                {s.grade_level ? ` · ${s.grade_level}` : ''}
                {s.parent_email ? <span className="text-amber-500"> · parent linked</span> : null}
              </span>
            </button>
          ))
        )}
      </div>
      {selected && (
        <div className="px-3 py-2 bg-orange-500/5 border border-orange-500/20 text-[10px]">
          <span className="text-orange-400 font-bold">Selected: {selected.full_name}</span>
          {selected.school_name && <span className="text-muted-foreground ml-1">({selected.school_name})</span>}
          {selected.parent_email && (
            <p className="text-amber-500 mt-0.5">⚠ Currently linked to {selected.parent_email} — will be replaced</p>
          )}
        </div>
      )}
    </div>
  );
}

// ── Create / Edit Modal ───────────────────────────────────────────────────────
function genPassword() {
  const chars = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789@#$!';
  return Array.from({ length: 12 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={() => { navigator.clipboard.writeText(value); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
      className="flex items-center gap-1 px-2 py-1 text-[10px] font-black uppercase tracking-widest border border-border hover:border-orange-500/50 text-muted-foreground hover:text-orange-400 transition-all"
    >
      <ClipboardIcon className="w-3 h-3" />
      {copied ? 'Copied!' : 'Copy'}
    </button>
  );
}

function ParentFormModal({
  initialData,
  students,
  schools,
  onClose,
  onSaved,
}: {
  initialData?: Parent | null;
  students: Student[];
  schools: string[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = !!initialData;
  const [form, setForm] = useState({
    email: initialData?.email ?? '',
    full_name: initialData?.full_name ?? '',
    phone: initialData?.phone ?? '',
    student_id: '',
    relationship: 'Guardian',
    password: genPassword(),
  });
  const [showPw, setShowPw] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [credentials, setCredentials] = useState<{ email: string; password: string } | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      if (isEdit) {
        const res = await fetch('/api/parents/manage', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            parent_id: initialData!.id,
            full_name: form.full_name,
            phone: form.phone || null,
            student_id: form.student_id || undefined,
            relationship: form.relationship,
          }),
        });
        if (!res.ok) { const j = await res.json(); throw new Error(j.error); }
        onSaved();
        onClose();
      } else {
        if (!form.student_id) { setError('Please select a student to link'); setSaving(false); return; }
        const res = await fetch('/api/parents/manage', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: form.email,
            full_name: form.full_name,
            phone: form.phone || null,
            student_id: form.student_id,
            relationship: form.relationship,
            password: form.password,
          }),
        });
        if (!res.ok) { const j = await res.json(); throw new Error(j.error); }
        onSaved();
        setCredentials({ email: form.email.trim().toLowerCase(), password: form.password });
      }
    } catch (err: any) {
      setError(err.message ?? 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  // ── Credentials success screen ──────────────────────────────────────────────
  if (credentials) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
        <div className="w-full max-w-md bg-card border border-border shadow-2xl">
          <div className="flex items-center justify-between px-6 py-4 border-b border-border">
            <div className="flex items-center gap-2">
              <CheckCircleIcon className="w-4 h-4 text-emerald-400" />
              <h2 className="text-sm font-black uppercase tracking-widest text-foreground">Parent Account Created</h2>
            </div>
            <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors">
              <XMarkIcon className="w-5 h-5" />
            </button>
          </div>
          <div className="p-6 space-y-4">
            <p className="text-xs text-muted-foreground">Share these login credentials with the parent. They can change their password after first login.</p>

            <div className="space-y-3">
              <div className="bg-background border border-border p-4">
                <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-2">Email / Username</p>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm font-bold text-foreground font-mono break-all">{credentials.email}</span>
                  <CopyButton value={credentials.email} />
                </div>
              </div>

              <div className="bg-background border border-orange-500/30 p-4">
                <p className="text-[10px] font-black uppercase tracking-widest text-orange-400 mb-2 flex items-center gap-1">
                  <KeyIcon className="w-3 h-3" /> Generated Password
                </p>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm font-bold text-orange-300 font-mono tracking-wider">{credentials.password}</span>
                  <CopyButton value={credentials.password} />
                </div>
              </div>

              <div className="flex items-center gap-2 px-3 py-2 bg-amber-500/5 border border-amber-500/20 text-[10px] text-amber-400">
                <span>⚠</span> Store this password securely — it cannot be retrieved after closing this window.
              </div>
            </div>

            <button onClick={onClose}
              className="w-full px-4 py-2.5 bg-orange-600 hover:bg-orange-500 text-foreground text-xs font-black uppercase tracking-widest transition-all">
              Done
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-md bg-card border border-border shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border sticky top-0 bg-card z-10">
          <h2 className="text-sm font-black uppercase tracking-widest text-foreground">
            {isEdit ? 'Edit Parent' : 'Add Parent Account'}
          </h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors">
            <XMarkIcon className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <p className="text-xs text-rose-400 bg-rose-500/10 border border-rose-500/20 px-3 py-2">{error}</p>
          )}

          {!isEdit && (
            <div>
              <label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest block mb-1.5">Email Address *</label>
              <input
                type="email" required value={form.email}
                onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                placeholder="parent@example.com"
                className="w-full px-4 py-2.5 bg-background border border-border text-sm text-foreground focus:outline-none focus:border-orange-500 transition-colors"
              />
            </div>
          )}

          <div>
            <label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest block mb-1.5">Full Name *</label>
            <input
              required value={form.full_name}
              onChange={e => setForm(f => ({ ...f, full_name: e.target.value }))}
              placeholder="Parent's full name"
              className="w-full px-4 py-2.5 bg-background border border-border text-sm text-foreground focus:outline-none focus:border-orange-500 transition-colors"
            />
          </div>

          <div>
            <label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest block mb-1.5">Phone</label>
            <input
              type="tel" value={form.phone}
              onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
              placeholder="+234 …"
              className="w-full px-4 py-2.5 bg-background border border-border text-sm text-foreground focus:outline-none focus:border-orange-500 transition-colors"
            />
          </div>

          {!isEdit && (
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest flex items-center gap-1">
                  <KeyIcon className="w-3 h-3" /> Login Password *
                </label>
                <button type="button" onClick={() => setForm(f => ({ ...f, password: genPassword() }))}
                  className="text-[10px] font-black uppercase tracking-widest text-orange-400 hover:text-orange-300 transition-colors">
                  ↻ Regenerate
                </button>
              </div>
              <div className="relative">
                <input
                  required
                  type={showPw ? 'text' : 'password'}
                  value={form.password}
                  onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                  minLength={8}
                  className="w-full px-4 py-2.5 pr-20 bg-background border border-border text-sm text-foreground font-mono focus:outline-none focus:border-orange-500 transition-colors"
                />
                <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
                  <CopyButton value={form.password} />
                  <button type="button" onClick={() => setShowPw(v => !v)}
                    className="p-1 text-muted-foreground hover:text-foreground transition-colors">
                    {showPw ? <EyeSlashIcon className="w-4 h-4" /> : <EyeIcon className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              <p className="text-[10px] text-muted-foreground mt-1">Auto-generated. Edit or regenerate as needed.</p>
            </div>
          )}

          <div>
            <label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest block mb-1.5">
              {isEdit ? 'Link to Additional Student (optional)' : 'Link to Student *'}
            </label>
            <StudentPicker
              students={students}
              schools={schools}
              value={form.student_id}
              onChange={id => setForm(f => ({ ...f, student_id: id }))}
            />
          </div>

          <div>
            <label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest block mb-1.5">Relationship</label>
            <select
              value={form.relationship}
              onChange={e => setForm(f => ({ ...f, relationship: e.target.value }))}
              className="w-full px-4 py-2.5 bg-background border border-border text-sm text-foreground focus:outline-none focus:border-orange-500 transition-colors"
            >
              {['Guardian', 'Father', 'Mother', 'Sibling', 'Uncle', 'Aunt', 'Other'].map(r => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
          </div>

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose}
              className="flex-1 px-4 py-2.5 border border-border text-xs font-black uppercase tracking-widest text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-all">
              Cancel
            </button>
            <button type="submit" disabled={saving}
              className="flex-1 px-4 py-2.5 bg-orange-600 hover:bg-orange-500 disabled:opacity-50 text-foreground text-xs font-black uppercase tracking-widest transition-all">
              {saving ? 'Saving…' : isEdit ? 'Save Changes' : 'Create Parent'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Link-to-student modal ─────────────────────────────────────────────────────
function LinkStudentModal({
  parent,
  students,
  schools,
  onClose,
  onSaved,
}: {
  parent: Parent;
  students: Student[];
  schools: string[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [studentId, setStudentId] = useState('');
  const [relationship, setRelationship] = useState('Guardian');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!studentId) { setError('Select a student'); return; }
    setSaving(true); setError(null);
    try {
      const res = await fetch('/api/parents/manage', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ parent_id: parent.id, student_id: studentId, relationship }),
      });
      if (!res.ok) { const j = await res.json(); throw new Error(j.error); }
      onSaved(); onClose();
    } catch (err: any) {
      setError(err.message ?? 'Failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-sm bg-card border border-border shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h2 className="text-sm font-black uppercase tracking-widest text-foreground">Link Student</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><XMarkIcon className="w-5 h-5" /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <p className="text-xs text-muted-foreground">
            Linking to: <span className="text-foreground font-bold">{parent.full_name}</span>
          </p>
          {error && <p className="text-xs text-rose-400 bg-rose-500/10 border border-rose-500/20 px-3 py-2">{error}</p>}
          <div>
            <label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest block mb-1.5">Student</label>
            <StudentPicker
              students={students}
              schools={schools}
              value={studentId}
              onChange={setStudentId}
            />
          </div>
          <div>
            <label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest block mb-1.5">Relationship</label>
            <select value={relationship} onChange={e => setRelationship(e.target.value)}
              className="w-full px-4 py-2.5 bg-background border border-border text-sm text-foreground focus:outline-none focus:border-orange-500">
              {['Guardian', 'Father', 'Mother', 'Sibling', 'Uncle', 'Aunt', 'Other'].map(r => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
          </div>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose}
              className="flex-1 px-4 py-2.5 border border-border text-xs font-black uppercase tracking-widest text-muted-foreground hover:text-foreground transition-all">Cancel</button>
            <button type="submit" disabled={saving}
              className="flex-1 px-4 py-2.5 bg-orange-600 hover:bg-orange-500 disabled:opacity-50 text-foreground text-xs font-black uppercase tracking-widest transition-all">
              {saving ? 'Linking…' : 'Link'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function ParentsPage() {
  const { profile, loading: authLoading } = useAuth();
  const [parents, setParents] = useState<Parent[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [schools, setSchools] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  // School filter: admin defaults to '' (all); teacher defaults to their school_name
  const [schoolFilter, setSchoolFilter] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editTarget, setEditTarget] = useState<Parent | null>(null);
  const [linkTarget, setLinkTarget] = useState<Parent | null>(null);
  const [unlinking, setUnlinking] = useState<string | null>(null);
  const [toggling, setToggling] = useState<string | null>(null);

  const isStaff = profile?.role === 'admin' || profile?.role === 'teacher';
  const isAdmin = profile?.role === 'admin';

  // Set default school filter for teachers
  useEffect(() => {
    if (profile?.role === 'teacher' && profile.school_name && !schoolFilter) {
      setSchoolFilter(profile.school_name);
    }
  }, [profile]);

  const load = useCallback(async () => {
    if (!isStaff) return;
    setLoading(true);
    try {
      // Build parent search URL
      const params = new URLSearchParams();
      if (search) params.set('search', search);
      if (schoolFilter) params.set('school', schoolFilter);
      const parRes = await fetch(`/api/parents/manage${params.toString() ? '?' + params : ''}`, { cache: 'no-store' });
      const parJson = await parRes.json();
      if (!parRes.ok) console.error('Parents load error:', parJson.error);
      setParents(parJson.data ?? []);

      // Students come from the API response (server-side, bypasses RLS)
      setStudents((parJson.students ?? []) as Student[]);

      // Load schools from API (uses service role, bypasses RLS)
      if (isAdmin) {
        const schoolRes = await fetch('/api/schools/public');
        if (schoolRes.ok) {
          const { schools: schoolList } = await schoolRes.json();
          setSchools((schoolList ?? []).map((s: any) => s.name).filter(Boolean));
        }
      } else if (profile?.school_name) {
        setSchools([profile.school_name]);
      }
    } catch (err) {
      console.error('Parents page load error:', err);
    } finally {
      setLoading(false);
    }
  }, [isStaff, isAdmin, search, schoolFilter, profile?.school_name]);

  useEffect(() => { if (!authLoading) load(); }, [authLoading, load]);

  const handleUnlink = async (studentId: string) => {
    if (!confirm('Remove parent link from this student?')) return;
    setUnlinking(studentId);
    try {
      const res = await fetch(`/api/parents/manage?student_id=${studentId}`, { method: 'DELETE' });
      if (!res.ok) { const j = await res.json(); alert(j.error || 'Failed'); return; }
      load();
    } catch { alert('Failed to unlink'); } finally { setUnlinking(null); }
  };

  const handleToggleActive = async (parent: Parent) => {
    setToggling(parent.id);
    try {
      const res = await fetch('/api/parents/manage', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ parent_id: parent.id, is_active: !parent.is_active }),
      });
      if (!res.ok) { const j = await res.json(); alert(j.error || 'Failed'); return; }
      setParents(prev => prev.map(p => p.id === parent.id ? { ...p, is_active: !p.is_active } : p));
    } catch { alert('Failed'); } finally { setToggling(null); }
  };

  if (authLoading) return null;

  if (!isStaff) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-muted-foreground text-sm">Access restricted to admin and teacher accounts.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-foreground tracking-tight">Parents</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Manage parent accounts and their links to students.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={() => load()}
            className="p-2 border border-border hover:border-foreground/30 text-muted-foreground hover:text-foreground transition-all">
            <ArrowPathIcon className="w-4 h-4" />
          </button>
          <button
            onClick={() => { setEditTarget(null); setShowForm(true); }}
            className="flex items-center gap-2 px-4 py-2.5 bg-orange-600 hover:bg-orange-500 text-foreground text-xs font-black uppercase tracking-widest transition-all">
            <PlusIcon className="w-4 h-4" /> Add Parent
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1 max-w-sm">
          <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && load()}
            placeholder="Search by name or email…"
            className="w-full pl-10 pr-4 py-2.5 bg-card border border-border text-sm text-foreground focus:outline-none focus:border-orange-500 transition-colors"
          />
        </div>

        {/* School filter — admin sees all schools; teacher sees their own school locked */}
        <div className="relative">
          <BuildingOfficeIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          {isAdmin ? (
            <select
              value={schoolFilter}
              onChange={e => setSchoolFilter(e.target.value)}
              className="pl-9 pr-8 py-2.5 bg-card border border-border text-sm text-foreground focus:outline-none focus:border-orange-500 transition-colors min-w-[200px]"
            >
              <option value="">All Schools</option>
              {schools.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          ) : (
            <div className="pl-9 pr-4 py-2.5 bg-card border border-border text-sm text-foreground min-w-[200px] flex items-center">
              <span className="text-muted-foreground">{profile?.school_name ?? 'Your School'}</span>
              <span className="ml-2 text-[9px] font-black uppercase tracking-widest text-orange-500 border border-orange-500/30 px-1.5 py-0.5">Locked</span>
            </div>
          )}
        </div>

        {schoolFilter && isAdmin && (
          <button onClick={() => setSchoolFilter('')}
            className="flex items-center gap-1.5 px-3 py-2.5 border border-border text-xs text-muted-foreground hover:text-foreground transition-colors">
            <XMarkIcon className="w-3.5 h-3.5" /> Clear
          </button>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <div className="bg-card border border-border p-4">
          <p className="text-2xl font-black text-foreground">{parents.length}</p>
          <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mt-1">Total Parents</p>
        </div>
        <div className="bg-card border border-border p-4">
          <p className="text-2xl font-black text-emerald-400">{parents.filter(p => p.is_active).length}</p>
          <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mt-1">Active</p>
        </div>
        <div className="bg-card border border-border p-4">
          <p className="text-2xl font-black text-orange-400">{parents.reduce((n, p) => n + p.children.length, 0)}</p>
          <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mt-1">Linked Children</p>
        </div>
      </div>

      {/* School context banner for teachers */}
      {!isAdmin && profile?.school_name && (
        <div className="flex items-center gap-2 px-4 py-2.5 bg-orange-500/5 border border-orange-500/20 text-xs text-orange-400">
          <BuildingOfficeIcon className="w-4 h-4" />
          Showing parents and students for: <span className="font-black">{profile.school_name}</span>
        </div>
      )}

      {/* List */}
      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="bg-card border border-border p-4 animate-pulse h-16" />
          ))}
        </div>
      ) : parents.length === 0 ? (
        <div className="bg-card border border-border p-12 text-center">
          <HeartIcon className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
          <p className="text-sm font-black text-foreground uppercase tracking-wider">No parent accounts found</p>
          <p className="text-xs text-muted-foreground mt-1">
            {search || schoolFilter ? 'Try adjusting your filters.' : 'Click "Add Parent" to create one.'}
          </p>
        </div>
      ) : (
        <div className="bg-card border border-border divide-y divide-border">
          {parents.map(parent => (
            <div key={parent.id}>
              {/* Parent row */}
              <div
                className="flex items-center gap-4 px-5 py-4 hover:bg-white/5 transition-all cursor-pointer"
                onClick={() => setExpanded(expanded === parent.id ? null : parent.id)}
              >
                {/* Avatar */}
                <div className="w-9 h-9 rounded-none bg-orange-500/10 border border-orange-500/20 flex items-center justify-center flex-shrink-0">
                  <UserIcon className="w-4 h-4 text-orange-400" />
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-bold text-foreground">{parent.full_name}</span>
                    {!parent.is_active && (
                      <span className="text-[9px] font-black uppercase tracking-widest px-1.5 py-0.5 bg-rose-500/10 border border-rose-500/20 text-rose-400">
                        Inactive
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                    <span className="text-xs text-muted-foreground flex items-center gap-1">
                      <EnvelopeIcon className="w-3 h-3" /> {parent.email}
                    </span>
                    {parent.phone && (
                      <span className="text-xs text-muted-foreground flex items-center gap-1">
                        <PhoneIcon className="w-3 h-3" /> {parent.phone}
                      </span>
                    )}
                  </div>
                </div>

                {/* Children count */}
                <div className="hidden sm:flex items-center gap-1.5 text-xs text-muted-foreground flex-shrink-0">
                  <AcademicCapIcon className="w-3.5 h-3.5" />
                  {parent.children.length} {parent.children.length === 1 ? 'child' : 'children'}
                </div>

                {/* Expand icon */}
                <div className="flex-shrink-0 text-muted-foreground">
                  {expanded === parent.id ? <ChevronUpIcon className="w-4 h-4" /> : <ChevronDownIcon className="w-4 h-4" />}
                </div>
              </div>

              {/* Expanded detail */}
              {expanded === parent.id && (
                <div className="px-5 pb-6 pt-2 bg-background/50 border-t border-border space-y-5">

                  {/* Linked children */}
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-3">
                      Linked Children
                    </p>
                    {parent.children.length === 0 ? (
                      <p className="text-xs text-muted-foreground italic">No children linked.</p>
                    ) : (
                      <div className="space-y-2">
                        {parent.children.map(child => (
                          <div key={child.id} className="flex items-center justify-between bg-card border border-border px-4 py-3">
                            <div>
                              <p className="text-xs font-bold text-foreground">{child.full_name}</p>
                              {child.school_name && (
                                <p className="text-[10px] text-muted-foreground mt-0.5">{child.school_name}</p>
                              )}
                            </div>
                            <div className="flex items-center gap-3">
                              <span className={`text-[9px] font-black uppercase tracking-widest px-1.5 py-0.5 border ${
                                child.status === 'approved' ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' :
                                child.status === 'pending' ? 'bg-amber-500/10 border-amber-500/20 text-amber-400' :
                                'bg-muted border-border text-muted-foreground'
                              }`}>{child.status}</span>
                              <button
                                onClick={() => handleUnlink(child.id)}
                                disabled={unlinking === child.id}
                                title="Unlink parent from this student"
                                className="text-muted-foreground hover:text-rose-400 transition-colors disabled:opacity-50">
                                <XMarkIcon className="w-4 h-4" />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Action bar */}
                  <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-border">
                    <button
                      onClick={() => { setEditTarget(parent); setShowForm(true); }}
                      className="flex items-center gap-2 px-4 py-2 border border-border text-[10px] font-black uppercase tracking-widest text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-all">
                      <PencilSquareIcon className="w-3.5 h-3.5" /> Edit
                    </button>
                    <button
                      onClick={() => setLinkTarget(parent)}
                      className="flex items-center gap-2 px-4 py-2 border border-orange-500/40 text-[10px] font-black uppercase tracking-widest text-orange-400 hover:border-orange-500 hover:text-orange-300 transition-all">
                      <LinkIcon className="w-3.5 h-3.5" /> Link Student
                    </button>
                    {isAdmin && (
                      <button
                        onClick={() => handleToggleActive(parent)}
                        disabled={toggling === parent.id}
                        className={`flex items-center gap-2 px-4 py-2 border text-[10px] font-black uppercase tracking-widest transition-all disabled:opacity-50 ${
                          parent.is_active
                            ? 'border-rose-500/30 text-rose-400 hover:border-rose-500 hover:text-rose-300'
                            : 'border-emerald-500/30 text-emerald-400 hover:border-emerald-500 hover:text-emerald-300'
                        }`}>
                        {parent.is_active ? <XCircleIcon className="w-3.5 h-3.5" /> : <CheckCircleIcon className="w-3.5 h-3.5" />}
                        {toggling === parent.id ? '…' : parent.is_active ? 'Deactivate' : 'Activate'}
                      </button>
                    )}
                    <a href={`mailto:${parent.email}`}
                      className="flex items-center gap-2 px-4 py-2 border border-border text-[10px] font-black uppercase tracking-widest text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-all ml-auto">
                      <EnvelopeIcon className="w-3.5 h-3.5" /> Email Parent
                    </a>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Modals */}
      {showForm && (
        <ParentFormModal
          initialData={editTarget}
          students={students}
          schools={schools}
          onClose={() => { setShowForm(false); setEditTarget(null); }}
          onSaved={load}
        />
      )}
      {linkTarget && (
        <LinkStudentModal
          parent={linkTarget}
          students={students}
          schools={schools}
          onClose={() => setLinkTarget(null)}
          onSaved={load}
        />
      )}
    </div>
  );
}
