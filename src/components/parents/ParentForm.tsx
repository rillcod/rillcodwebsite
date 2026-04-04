'use client';

import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '@/contexts/auth-context';
import {
  MagnifyingGlassIcon,
  CheckCircleIcon,
  ClipboardIcon,
  KeyIcon,
  EyeIcon,
  EyeSlashIcon,
} from '@/lib/icons';

// ── Types ─────────────────────────────────────────────────────────────────────
export interface Student {
  id: string;
  full_name: string;
  school_name: string | null;
  parent_email: string | null;
  grade_level: string | null;
  section: string | null;
  current_class: string | null;
}

export interface Teacher {
  id: string;
  full_name: string;
  section_class: string | null;
  school_name: string | null;
}

export interface Parent {
  id: string;
  email: string;
  full_name: string;
  phone: string | null;
  is_active: boolean;
  created_at: string;
  children: LinkedChild[];
}

export interface LinkedChild {
  id: string;
  full_name: string;
  school_name: string | null;
  status: string;
  parent_email: string;
}

// ── Utils ─────────────────────────────────────────────────────────────────────
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

// ── Searchable student picker ────────────────────────────────────────────────
export function StudentPicker({
  students,
  schoolFilter,
  classFilter,
  value,
  onChange,
  values,
  onChangeMulti,
  multi = false,
}: {
  students: Student[];
  schoolFilter: string;
  classFilter?: string;
  value?: string;
  onChange?: (id: string) => void;
  values?: string[];
  onChangeMulti?: (ids: string[]) => void;
  multi?: boolean;
}) {
  const [q, setQ] = useState('');

  const filtered = useMemo(() => {
    let list = schoolFilter
      ? students.filter(s => s.school_name?.toLowerCase() === schoolFilter.toLowerCase())
      : students;
    // Narrow by teacher class if provided
    if (classFilter) {
      const cf = classFilter.toLowerCase().replace(/\s+/g, '');
      const classMatched = list.filter(s => {
        const fields = [s.current_class, s.section, s.grade_level].map(v => (v ?? '').toLowerCase().replace(/\s+/g, ''));
        const hasClassData = fields.some(f => f.length > 0);
        // Always include students with no class data (unclassified/new accounts)
        if (!hasClassData) return true;
        return fields.some(f => f === cf || f.startsWith(cf) || cf.startsWith(f));
      });
      // Only narrow if we got matches — avoids empty list when data doesn't line up perfectly
      if (classMatched.length > 0) list = classMatched;
    }
    if (q.trim()) {
      const lower = q.toLowerCase();
      list = list.filter(s => s.full_name.toLowerCase().includes(lower));
    }
    return list;
  }, [students, schoolFilter, classFilter, q]);

  const selected = !multi ? students.find(s => s.id === value) : null;
  const selectedMulti = multi && values ? students.filter(s => values.includes(s.id)) : [];

  const handleClick = (s: Student) => {
    if (multi && values !== undefined && onChangeMulti) {
      const next = values.includes(s.id) ? values.filter(id => id !== s.id) : [...values, s.id];
      onChangeMulti(next);
    } else if (onChange) {
      onChange(s.id);
      setQ('');
    }
  };

  return (
    <div className="space-y-2">
      <div className="relative">
        <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
        <input
          value={q}
          onChange={e => setQ(e.target.value)}
          placeholder={multi ? 'Search and tick to select multiple…' : 'Search students by name…'}
          className="w-full pl-9 pr-4 py-2 bg-background border border-border text-xs text-foreground focus:outline-none focus:border-orange-500 transition-colors"
        />
      </div>
      <div className="border border-border max-h-40 overflow-y-auto bg-background">
        {filtered.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-4">
            {q ? 'No students match your search.' : classFilter ? 'No students in this class — try clearing the teacher filter.' : schoolFilter ? 'No students in this school.' : 'Select a school to see students.'}
          </p>
        ) : (
          filtered.map(s => {
            const isSelected = multi ? (values?.includes(s.id) ?? false) : value === s.id;
            return (
              <button
                type="button"
                key={s.id}
                onClick={() => handleClick(s)}
                className={`w-full text-left px-4 py-2.5 hover:bg-orange-500/5 transition-all border-b border-border last:border-b-0 flex items-center gap-2 ${isSelected ? 'bg-orange-500/10' : ''}`}
              >
                {multi && (
                  <span className={`w-3.5 h-3.5 border rounded-none flex-shrink-0 flex items-center justify-center text-[8px] font-black ${isSelected ? 'bg-orange-500 border-orange-500 text-white' : 'border-border'}`}>
                    {isSelected ? '✓' : ''}
                  </span>
                )}
                <span className="flex-1 min-w-0">
                  <span className={`text-xs font-bold ${isSelected ? 'text-orange-400' : 'text-foreground'}`}>{s.full_name}</span>
                  <span className="text-[10px] text-muted-foreground ml-2">
                    {s.grade_level ?? ''}
                    {s.parent_email ? <span className="text-amber-500"> · parent linked</span> : null}
                  </span>
                </span>
              </button>
            );
          })
        )}
      </div>
      {!multi && selected && (
        <div className="px-3 py-2 bg-orange-500/5 border border-orange-500/20 text-[10px]">
          <span className="text-orange-400 font-bold">Selected: {selected.full_name}</span>
          {selected.school_name && <span className="text-muted-foreground ml-1">({selected.school_name})</span>}
          {selected.grade_level && <span className="text-muted-foreground ml-1">· {selected.grade_level}</span>}
          {selected.parent_email && (
            <p className="text-blue-400 mt-0.5">ℹ Already has a parent ({selected.parent_email}). New parent will become primary contact.</p>
          )}
        </div>
      )}
      {multi && selectedMulti.length > 0 && (
        <div className="px-3 py-2 bg-orange-500/5 border border-orange-500/20 text-[10px] space-y-1">
          <span className="text-orange-400 font-bold">{selectedMulti.length} student{selectedMulti.length !== 1 ? 's' : ''} selected:</span>
          <p className="text-muted-foreground">{selectedMulti.map(s => s.full_name).join(', ')}</p>
        </div>
      )}
    </div>
  );
}

// ── ParentForm Component ─────────────────────────────────────────────────────
export function ParentForm({
  initialData,
  students,
  teachers,
  schools,
  officialClasses,
  defaultSchool,
  onCancel,
  onSaved,
  onSchoolChange,
}: {
  initialData?: Parent | null;
  students: Student[];
  teachers: Teacher[];
  schools: string[];
  officialClasses?: { name: string; school_name: string | null }[];
  defaultSchool?: string;
  onCancel: () => void;
  onSaved: () => void;
  onSchoolChange?: (school: string) => Promise<void>;
}) {
  const { profile } = useAuth();
  const isEdit = !!initialData;
  const [selectedSchool, setSelectedSchool] = useState(defaultSchool ?? '');
  const [schoolChanging, setSchoolChanging] = useState(false);
  useEffect(() => {
    if (defaultSchool) setSelectedSchool(defaultSchool);
  }, [defaultSchool]);

  const [selectedTeacherId, setSelectedTeacherId] = useState('');
  useEffect(() => {
    if (profile?.role === 'teacher' && profile.id && !selectedTeacherId) {
      setSelectedTeacherId(profile.id);
    }
  }, [profile?.role, profile?.id, selectedTeacherId]);

  const [form, setForm] = useState({
    email: initialData?.email ?? '',
    full_name: initialData?.full_name ?? '',
    phone: initialData?.phone ?? '',
    student_id: '',
    student_ids: [] as string[],
    relationship: 'Guardian',
    password: genPassword(),
  });

  const [selectedClass, setSelectedClass] = useState('');
  useEffect(() => {
    const t = teachers.find(x => x.id === selectedTeacherId);
    if (t?.section_class && !selectedClass) setSelectedClass(t.section_class);
  }, [selectedTeacherId, teachers, selectedClass]);

  const handleSchoolSelect = async (school: string) => {
    setSelectedSchool(school);
    setSelectedTeacherId('');
    setSelectedClass('');
    setForm(f => ({ ...f, student_id: '', student_ids: [] }));
    if (onSchoolChange) {
      setSchoolChanging(true);
      try { await onSchoolChange(school); } finally { setSchoolChanging(false); }
    }
  };

  const classList = useMemo(() => {
    const set = new Set<string>();
    // Official classes from DB — filtered to selected school only
    if (officialClasses) {
      officialClasses
        .filter(c => !selectedSchool || c.school_name?.toLowerCase() === selectedSchool.toLowerCase())
        .forEach(c => set.add(c.name));
    }
    // Derive from loaded student data for this school
    students
      .filter(s => !selectedSchool || s.school_name?.toLowerCase() === selectedSchool.toLowerCase())
      .forEach(s => {
        if (s.current_class) set.add(s.current_class);
        if (s.section) set.add(s.section);
        if (s.grade_level) set.add(s.grade_level);
      });
    return Array.from(set).sort();
  }, [students, selectedSchool, officialClasses]);

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
      } else {
        if (form.student_ids.length === 0) { setError('Please select at least one student to link'); setSaving(false); return; }
        const res = await fetch('/api/parents/manage', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: form.email,
            full_name: form.full_name,
            phone: form.phone || null,
            student_ids: form.student_ids,
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

  if (credentials) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3 px-0 py-3 border-b border-border">
          <CheckCircleIcon className="w-5 h-5 text-emerald-400 flex-shrink-0" />
          <h2 className="text-lg font-black text-foreground tracking-tight">Parent Account Created</h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-card border border-border p-5">
            <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-3">Email / Username</p>
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm font-bold text-foreground font-mono break-all">{credentials.email}</span>
              <CopyButton value={credentials.email} />
            </div>
          </div>
          <div className="bg-card border border-orange-500/30 p-5">
            <p className="text-[10px] font-black uppercase tracking-widest text-orange-400 mb-3 flex items-center gap-1">
              <KeyIcon className="w-3 h-3" /> Generated Password
            </p>
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm font-bold text-orange-300 font-mono tracking-wider">{credentials.password}</span>
              <CopyButton value={credentials.password} />
            </div>
          </div>
        </div>
        <div className="flex items-start gap-2 px-4 py-3 bg-amber-500/5 border border-amber-500/20 text-xs text-amber-400">
          <span className="flex-shrink-0 mt-0.5">⚠</span>
          <span>Store this password securely — it cannot be retrieved after closing this window.</span>
        </div>
        <p className="text-xs text-muted-foreground">Share these credentials with the parent. They can change their password after first login.</p>
        <div className="flex gap-3">
          <button onClick={onCancel}
            className="px-6 py-2.5 bg-orange-600 hover:bg-orange-500 text-foreground text-xs font-black uppercase tracking-widest transition-all">
            Done — Back to Parents
          </button>
        </div>
      </div>
    );
  }

  const schoolTeachers = selectedSchool
    ? teachers.filter(t => t.school_name === selectedSchool && (profile?.role !== 'teacher' || t.id === profile?.id))
    : teachers.filter(t => profile?.role !== 'teacher' || t.id === profile?.id);

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {error && (
        <div className="flex items-start gap-2 px-4 py-3 bg-rose-500/10 border border-rose-500/20 text-xs text-rose-400">
          <span className="flex-shrink-0 mt-0.5 font-black">✕</span>
          <span>{error}</span>
        </div>
      )}

      {/* ── Section 1: Parent Account Info ──────────────────────────────── */}
      <div className="bg-card border border-border">
        <div className="px-6 py-3 border-b border-border flex items-center gap-2">
          <span className="w-1 h-4 bg-orange-500 flex-shrink-0" />
          <p className="text-[10px] font-black uppercase tracking-widest text-foreground">Parent Account Info</p>
        </div>
        <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-5">
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
            </div>
          )}
        </div>
      </div>

      {/* ── Section 2: School & Class ────────────────────────────────────── */}
      <div className="bg-card border border-border">
        <div className="px-6 py-3 border-b border-border flex items-center gap-2">
          <span className="w-1 h-4 bg-orange-500 flex-shrink-0" />
          <p className="text-[10px] font-black uppercase tracking-widest text-foreground">School &amp; Class</p>
        </div>
        <div className="p-6 space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div>
              <label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest block mb-1.5">
                School {schools.length === 1 ? <span className="text-muted-foreground normal-case font-normal">(locked)</span> : '*'}
              </label>
              <select
                value={selectedSchool}
                onChange={e => handleSchoolSelect(e.target.value)}
                disabled={(schools.length <= 1 && profile?.role !== 'admin') || schoolChanging}
                className="w-full px-4 py-2.5 bg-background border border-border text-sm text-foreground focus:outline-none focus:border-orange-500 transition-colors disabled:opacity-80"
              >
                {schools.length === 0 && <option value="">— No Schools Available —</option>}
                {profile?.role === 'admin' && schools.length > 1 && <option value="">— Select School —</option>}
                {schools.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
              {schoolChanging && (
                <p className="text-[10px] text-orange-400 mt-1.5 animate-pulse flex items-center gap-1">
                  <span className="w-2 h-2 border border-orange-400 border-t-transparent rounded-full animate-spin inline-block" />
                  Loading students for this school…
                </p>
              )}
            </div>

            {schoolTeachers.length > 0 && (
              <div>
                <label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest block mb-1.5">
                  Assigned Teacher <span className="text-muted-foreground normal-case font-normal">(optional)</span>
                </label>
                <select
                  value={selectedTeacherId}
                  disabled={profile?.role === 'teacher'}
                  onChange={e => { setSelectedTeacherId(e.target.value); setForm(f => ({ ...f, student_id: '' })); }}
                  className="w-full px-4 py-2.5 bg-background border border-border text-sm text-foreground focus:outline-none focus:border-orange-500 transition-colors disabled:opacity-60"
                >
                  {profile?.role === 'admin' && <option value="">— All Teachers —</option>}
                  {schoolTeachers.map(t => (
                    <option key={t.id} value={t.id}>
                      {t.full_name}{t.id === profile?.id ? ' (You)' : ''}{t.section_class ? ` · ${t.section_class}` : ''}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          <div>
            <label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest block mb-1.5 flex items-center gap-1.5">
              Class / Category *
              <span className="text-orange-400 normal-case font-normal text-[9px]">— required to filter students</span>
            </label>
            <select
              required
              value={selectedClass}
              onChange={e => { setSelectedClass(e.target.value); setForm(f => ({ ...f, student_id: '', student_ids: [] })); }}
              className={`w-full px-4 py-2.5 bg-background border text-sm text-foreground focus:outline-none transition-colors ${!selectedClass ? 'border-orange-500/50' : 'border-border focus:border-orange-500'}`}
            >
              <option value="">— Select Class (e.g. Python Class, JSS 1) —</option>
              {classList.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            {!selectedClass && (
              <p className="text-[10px] text-orange-400/80 mt-1.5 font-bold">Select a class to narrow the student list below.</p>
            )}
          </div>
        </div>
      </div>

      {/* ── Section 3: Link Students ─────────────────────────────────────── */}
      <div className="bg-card border border-border">
        <div className="px-6 py-3 border-b border-border flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="w-1 h-4 bg-orange-500 flex-shrink-0" />
            <p className="text-[10px] font-black uppercase tracking-widest text-foreground">
              {isEdit ? 'Link Student' : 'Link Students'}
            </p>
          </div>
          {!isEdit && form.student_ids.length > 0 && (
            <span className="px-2 py-0.5 bg-orange-500/10 border border-orange-500/30 text-[10px] font-black text-orange-400">
              {form.student_ids.length} selected
            </span>
          )}
        </div>
        <div className="p-6 space-y-5">
          <div>
            <label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest block mb-2">
              {isEdit ? 'Student (optional — leave blank to keep existing links)' : 'Select Students *'}
            </label>
            {isEdit ? (
              <StudentPicker
                students={students}
                schoolFilter={selectedSchool}
                classFilter={selectedClass || teachers.find(t => t.id === selectedTeacherId)?.section_class || undefined}
                value={form.student_id}
                onChange={id => setForm(f => ({ ...f, student_id: id }))}
              />
            ) : (
              <StudentPicker
                students={students}
                schoolFilter={selectedSchool}
                classFilter={selectedClass || teachers.find(t => t.id === selectedTeacherId)?.section_class || undefined}
                multi
                values={form.student_ids}
                onChangeMulti={ids => setForm(f => ({ ...f, student_ids: ids }))}
              />
            )}
          </div>

          <div>
            <label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest block mb-1.5">Relationship to Student</label>
            <div className="flex flex-wrap gap-2">
              {['Guardian', 'Father', 'Mother', 'Sibling', 'Uncle', 'Aunt', 'Other'].map(r => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setForm(f => ({ ...f, relationship: r }))}
                  className={`px-4 py-2 text-xs font-bold border transition-all ${form.relationship === r
                    ? 'bg-orange-500/15 border-orange-500/50 text-orange-400'
                    : 'border-border text-muted-foreground hover:border-foreground/30 hover:text-foreground'}`}
                >
                  {r}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ── Action Bar ───────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row gap-3 pt-2">
        <button type="button" onClick={onCancel}
          className="sm:w-40 px-6 py-3 border border-border text-xs font-black uppercase tracking-widest text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-all">
          Cancel
        </button>
        <button type="submit" disabled={saving || schoolChanging}
          className="flex-1 px-6 py-3 bg-orange-600 hover:bg-orange-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2">
          {saving && <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />}
          {saving ? 'Saving…' : isEdit ? 'Save Changes' : 'Create Parent Account'}
        </button>
      </div>
    </form>
  );
}
