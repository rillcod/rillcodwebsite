'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useAuth } from '@/contexts/auth-context';
import {
  UserGroupIcon, MagnifyingGlassIcon, PlusIcon, XMarkIcon,
  EnvelopeIcon, PhoneIcon, UserIcon, AcademicCapIcon, CheckCircleIcon,
  XCircleIcon, PencilSquareIcon, ArrowPathIcon, LinkIcon, HeartIcon,
  ChevronDownIcon, ChevronUpIcon, BuildingOfficeIcon, EyeIcon, EyeSlashIcon,
  ClipboardIcon, KeyIcon, PrinterIcon, ArrowUpTrayIcon, CreditCardIcon,
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
  section: string | null;
  current_class: string | null;
}
interface Teacher {
  id: string;
  full_name: string;
  section_class: string | null;
}

// ── Searchable student picker (school filter controlled externally) ───────────
function StudentPicker({
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
      ? students.filter(s => s.school_name === schoolFilter)
      : students;
    // Narrow by teacher class if provided
    if (classFilter) {
      const cf = classFilter.toLowerCase().replace(/\s+/g, '');
      const classMatched = list.filter(s => {
        const fields = [s.current_class, s.section, s.grade_level].map(v => (v ?? '').toLowerCase().replace(/\s+/g, ''));
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
      {/* Single-mode selected display */}
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
      {/* Multi-mode selected summary */}
      {multi && selectedMulti.length > 0 && (
        <div className="px-3 py-2 bg-orange-500/5 border border-orange-500/20 text-[10px] space-y-1">
          <span className="text-orange-400 font-bold">{selectedMulti.length} student{selectedMulti.length !== 1 ? 's' : ''} selected:</span>
          <p className="text-muted-foreground">{selectedMulti.map(s => s.full_name).join(', ')}</p>
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
  teachers,
  schools,
  defaultSchool,
  onClose,
  onSaved,
}: {
  initialData?: Parent | null;
  students: Student[];
  teachers: Teacher[];
  schools: string[];
  defaultSchool?: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = !!initialData;
  const [selectedSchool, setSelectedSchool] = useState(defaultSchool ?? '');
  const [selectedTeacherId, setSelectedTeacherId] = useState('');
  const [form, setForm] = useState({
    email: initialData?.email ?? '',
    full_name: initialData?.full_name ?? '',
    phone: initialData?.phone ?? '',
    student_id: '',       // used in edit mode (single)
    student_ids: [] as string[], // used in create mode (multi)
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

          {/* School selector — always visible, auto-filled for teachers */}
          <div>
            <label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest block mb-1.5">
              School {schools.length === 1 ? <span className="text-muted-foreground normal-case font-normal">(locked to your school)</span> : '*'}
            </label>
            <select
              value={selectedSchool}
              onChange={e => { setSelectedSchool(e.target.value); setSelectedTeacherId(''); setForm(f => ({ ...f, student_id: '' })); }}
              disabled={schools.length === 1}
              className="w-full px-4 py-2.5 bg-background border border-border text-sm text-foreground focus:outline-none focus:border-orange-500 transition-colors disabled:opacity-60"
            >
              <option value="">— Select School —</option>
              {schools.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>

          {/* Teacher filter — narrows student list to that teacher's class */}
          {(() => {
            const schoolTeachers = selectedSchool
              ? teachers.filter(t => true) // already scoped server-side; show all loaded teachers
              : teachers;
            if (schoolTeachers.length === 0) return null;
            return (
              <div>
                <label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest block mb-1.5">
                  Assigned Teacher <span className="text-muted-foreground normal-case font-normal">(optional — filters students by class)</span>
                </label>
                <select
                  value={selectedTeacherId}
                  onChange={e => { setSelectedTeacherId(e.target.value); setForm(f => ({ ...f, student_id: '' })); }}
                  className="w-full px-4 py-2.5 bg-background border border-border text-sm text-foreground focus:outline-none focus:border-orange-500 transition-colors"
                >
                  <option value="">— All Teachers / All Students —</option>
                  {schoolTeachers.map(t => (
                    <option key={t.id} value={t.id}>
                      {t.full_name}{t.section_class ? ` · ${t.section_class}` : ''}
                    </option>
                  ))}
                </select>
                {selectedTeacherId && (() => {
                  const t = schoolTeachers.find(x => x.id === selectedTeacherId);
                  return t?.section_class ? (
                    <p className="text-[10px] text-orange-400/70 mt-1">Showing students in class: <span className="font-bold text-orange-400">{t.section_class}</span></p>
                  ) : null;
                })()}
              </div>
            );
          })()}

          <div>
            <label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest block mb-1.5">
              {isEdit ? 'Link to Student (optional)' : 'Select Student *'}
            </label>
            {isEdit ? (
              <StudentPicker
                students={students}
                schoolFilter={selectedSchool}
                classFilter={teachers.find(t => t.id === selectedTeacherId)?.section_class ?? undefined}
                value={form.student_id}
                onChange={id => setForm(f => ({ ...f, student_id: id }))}
              />
            ) : (
              <StudentPicker
                students={students}
                schoolFilter={selectedSchool}
                classFilter={teachers.find(t => t.id === selectedTeacherId)?.section_class ?? undefined}
                multi
                values={form.student_ids}
                onChangeMulti={ids => setForm(f => ({ ...f, student_ids: ids }))}
              />
            )}
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
  teachers,
  schools,
  defaultSchool,
  onClose,
  onSaved,
}: {
  parent: Parent;
  students: Student[];
  teachers: Teacher[];
  schools: string[];
  defaultSchool?: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [selectedSchool, setSelectedSchool] = useState(defaultSchool ?? '');
  const [selectedTeacherId, setSelectedTeacherId] = useState('');
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
            <label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest block mb-1.5">
              School {schools.length === 1 ? <span className="text-muted-foreground normal-case font-normal">(locked)</span> : ''}
            </label>
            <select
              value={selectedSchool}
              onChange={e => { setSelectedSchool(e.target.value); setSelectedTeacherId(''); setStudentId(''); }}
              disabled={schools.length === 1}
              className="w-full px-4 py-2.5 bg-background border border-border text-sm text-foreground focus:outline-none focus:border-orange-500 transition-colors disabled:opacity-60"
            >
              <option value="">— Select School —</option>
              {schools.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          {teachers.length > 0 && (
            <div>
              <label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest block mb-1.5">
                Assigned Teacher <span className="text-muted-foreground normal-case font-normal">(optional)</span>
              </label>
              <select
                value={selectedTeacherId}
                onChange={e => { setSelectedTeacherId(e.target.value); setStudentId(''); }}
                className="w-full px-4 py-2.5 bg-background border border-border text-sm text-foreground focus:outline-none focus:border-orange-500 transition-colors"
              >
                <option value="">— All Teachers —</option>
                {teachers.map(t => (
                  <option key={t.id} value={t.id}>{t.full_name}{t.section_class ? ` · ${t.section_class}` : ''}</option>
                ))}
              </select>
            </div>
          )}
          <div>
            <label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest block mb-1.5">Student</label>
            <StudentPicker
              students={students}
              schoolFilter={selectedSchool}
              classFilter={teachers.find(t => t.id === selectedTeacherId)?.section_class ?? undefined}
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

// ── Print Registry Modal ─────────────────────────────────────────────────────
function PrintRegistryModal({ parents, schoolFilter, onClose }: {
  parents: Parent[];
  schoolFilter: string;
  onClose: () => void;
}) {
  const filtered = schoolFilter ? parents.filter(p =>
    p.children.some(c => c.school_name === schoolFilter)
  ) : parents;

  return (
    <div className="fixed inset-0 z-50 bg-white text-black print:bg-white" style={{ fontFamily: 'Arial, sans-serif' }}>
      {/* Screen-only header bar */}
      <div className="print:hidden flex items-center justify-between px-6 py-4 bg-gray-100 border-b border-gray-200">
        <h2 className="text-sm font-black uppercase tracking-widest">Parent Registry</h2>
        <div className="flex items-center gap-3">
          <button
            onClick={() => window.print()}
            className="flex items-center gap-2 px-4 py-2 bg-orange-600 text-white text-xs font-black uppercase tracking-widest"
          >
            <PrinterIcon className="w-4 h-4" /> Print
          </button>
          <button onClick={onClose} className="p-2 hover:bg-gray-200 transition-colors">
            <XMarkIcon className="w-5 h-5" />
          </button>
        </div>
      </div>

      <div className="p-8 max-w-5xl mx-auto">
        {/* Print header */}
        <div className="mb-6 pb-4 border-b-2 border-gray-800">
          <h1 className="text-2xl font-black uppercase tracking-widest">Parent Registry</h1>
          <p className="text-sm text-gray-600 mt-1">
            {schoolFilter ? `School: ${schoolFilter} · ` : ''}
            {filtered.length} parent{filtered.length !== 1 ? 's' : ''} ·
            Printed: {new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' })}
          </p>
        </div>

        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
          <thead>
            <tr style={{ borderBottom: '2px solid #1f2937' }}>
              <th style={{ textAlign: 'left', padding: '8px 6px', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.1em', fontSize: '10px' }}>#</th>
              <th style={{ textAlign: 'left', padding: '8px 6px', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.1em', fontSize: '10px' }}>Parent Name</th>
              <th style={{ textAlign: 'left', padding: '8px 6px', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.1em', fontSize: '10px' }}>Email</th>
              <th style={{ textAlign: 'left', padding: '8px 6px', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.1em', fontSize: '10px' }}>Phone</th>
              <th style={{ textAlign: 'left', padding: '8px 6px', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.1em', fontSize: '10px' }}>Linked Children</th>
              <th style={{ textAlign: 'left', padding: '8px 6px', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.1em', fontSize: '10px' }}>Status</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((parent, idx) => (
              <tr key={parent.id} style={{ borderBottom: '1px solid #e5e7eb', backgroundColor: idx % 2 === 0 ? '#f9fafb' : 'white' }}>
                <td style={{ padding: '8px 6px', color: '#6b7280' }}>{idx + 1}</td>
                <td style={{ padding: '8px 6px', fontWeight: 700 }}>{parent.full_name}</td>
                <td style={{ padding: '8px 6px', color: '#374151' }}>{parent.email}</td>
                <td style={{ padding: '8px 6px', color: '#374151' }}>{parent.phone ?? '—'}</td>
                <td style={{ padding: '8px 6px', color: '#374151' }}>
                  {parent.children.length > 0
                    ? parent.children.map(c => c.full_name).join(', ')
                    : '—'}
                </td>
                <td style={{ padding: '8px 6px' }}>
                  <span style={{
                    fontSize: '9px', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.1em',
                    padding: '2px 6px', border: `1px solid ${parent.is_active ? '#059669' : '#dc2626'}`,
                    color: parent.is_active ? '#059669' : '#dc2626',
                  }}>
                    {parent.is_active ? 'Active' : 'Inactive'}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <div style={{ marginTop: '32px', paddingTop: '12px', borderTop: '1px solid #e5e7eb', fontSize: '10px', color: '#9ca3af' }}>
          Rillcod Technologies · Parent Registry · Generated {new Date().toISOString().slice(0, 10)}
        </div>
      </div>
    </div>
  );
}

// ── Bulk Import Modal ─────────────────────────────────────────────────────────
interface ImportRow { full_name: string; email: string; phone: string; student_name: string; relationship: string }

function BulkImportModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [step, setStep] = useState<'upload' | 'preview' | 'results'>('upload');
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [results, setResults] = useState<any[]>([]);
  const [summary, setSummary] = useState<{ created: number; skipped: number; errors: number } | null>(null);
  const [importing, setImporting] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const parseCSV = (text: string): ImportRow[] => {
    const lines = text.trim().split('\n').filter(l => l.trim());
    if (lines.length < 2) throw new Error('CSV must have a header row and at least one data row.');
    const headers = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/[^a-z_]/g, '').replace(/ /g, '_'));
    return lines.slice(1).map(line => {
      const cols = line.split(',').map(c => c.trim().replace(/^"|"$/g, ''));
      const get = (keys: string[]) => {
        for (const k of keys) {
          const idx = headers.indexOf(k);
          if (idx >= 0 && cols[idx]) return cols[idx];
        }
        return '';
      };
      return {
        full_name: get(['full_name', 'name', 'parent_name']),
        email: get(['email', 'parent_email']),
        phone: get(['phone', 'phone_number', 'mobile']),
        student_name: get(['student_name', 'child_name', 'child']),
        relationship: get(['relationship', 'relation']) || 'Guardian',
      };
    }).filter(r => r.email || r.full_name);
  };

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setParseError(null);
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const parsed = parseCSV(ev.target?.result as string);
        if (parsed.length === 0) throw new Error('No valid rows found.');
        setRows(parsed);
        setStep('preview');
      } catch (err: any) {
        setParseError(err.message);
      }
    };
    reader.readAsText(file);
  };

  const handleImport = async () => {
    setImporting(true);
    try {
      const res = await fetch('/api/parents/bulk-import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      setResults(json.results ?? []);
      setSummary(json.summary);
      setStep('results');
      onDone();
    } catch (err: any) {
      setParseError(err.message ?? 'Import failed');
    } finally {
      setImporting(false);
    }
  };

  const downloadTemplate = () => {
    const csv = 'full_name,email,phone,student_name,relationship\nJohn Doe,john@example.com,+234 801 234 5678,Jane Doe,Father\nMary Smith,mary@example.com,,Tom Smith,Mother';
    const blob = new Blob([csv], { type: 'text/csv' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
    a.download = 'parent-import-template.csv'; a.click();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-2xl bg-card border border-border shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border sticky top-0 bg-card z-10">
          <h2 className="text-sm font-black uppercase tracking-widest text-foreground">Bulk Import Parents</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors">
            <XMarkIcon className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-5">
          {/* Step: Upload */}
          {step === 'upload' && (
            <div className="space-y-4">
              <div className="bg-orange-500/5 border border-orange-500/20 p-4 space-y-2">
                <p className="text-xs font-black text-orange-400 uppercase tracking-widest">CSV Format</p>
                <p className="text-xs text-muted-foreground">
                  Columns: <code className="bg-muted px-1 text-foreground text-[11px]">full_name</code>,{' '}
                  <code className="bg-muted px-1 text-foreground text-[11px]">email</code>,{' '}
                  <code className="bg-muted px-1 text-foreground text-[11px]">phone</code> (optional),{' '}
                  <code className="bg-muted px-1 text-foreground text-[11px]">student_name</code> (optional),{' '}
                  <code className="bg-muted px-1 text-foreground text-[11px]">relationship</code> (optional)
                </p>
                <button onClick={downloadTemplate}
                  className="text-[10px] font-black uppercase tracking-widest text-orange-400 hover:text-orange-300 transition-colors underline underline-offset-2">
                  Download Template CSV
                </button>
              </div>

              {parseError && (
                <p className="text-xs text-rose-400 bg-rose-500/10 border border-rose-500/20 px-3 py-2">{parseError}</p>
              )}

              <div
                onClick={() => fileRef.current?.click()}
                className="border-2 border-dashed border-border hover:border-orange-500/50 p-10 text-center cursor-pointer transition-all group"
              >
                <ArrowUpTrayIcon className="w-8 h-8 text-muted-foreground mx-auto mb-3 group-hover:text-orange-400 transition-colors" />
                <p className="text-sm font-black text-foreground uppercase tracking-wider">Click to upload CSV</p>
                <p className="text-xs text-muted-foreground mt-1">Max 200 rows per import</p>
                <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden" onChange={handleFile} />
              </div>
            </div>
          )}

          {/* Step: Preview */}
          {step === 'preview' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-xs font-black text-foreground uppercase tracking-widest">
                  Preview — {rows.length} row{rows.length !== 1 ? 's' : ''}
                </p>
                <button onClick={() => { setStep('upload'); setRows([]); if (fileRef.current) fileRef.current.value = ''; }}
                  className="text-[10px] text-muted-foreground hover:text-foreground underline transition-colors">
                  ← Back
                </button>
              </div>

              <div className="border border-border overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="bg-muted">
                    <tr>
                      {['Name', 'Email', 'Phone', 'Student', 'Relationship'].map(h => (
                        <th key={h} className="text-left px-3 py-2 text-[9px] font-black uppercase tracking-widest text-muted-foreground">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {rows.slice(0, 20).map((row, i) => (
                      <tr key={i} className="hover:bg-white/5">
                        <td className="px-3 py-2 text-foreground font-medium">{row.full_name || <span className="text-rose-400">Missing</span>}</td>
                        <td className="px-3 py-2 text-muted-foreground">{row.email || <span className="text-rose-400">Missing</span>}</td>
                        <td className="px-3 py-2 text-muted-foreground">{row.phone || '—'}</td>
                        <td className="px-3 py-2 text-muted-foreground">{row.student_name || '—'}</td>
                        <td className="px-3 py-2 text-muted-foreground">{row.relationship}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {rows.length > 20 && (
                  <p className="text-[10px] text-muted-foreground text-center py-2">…and {rows.length - 20} more rows</p>
                )}
              </div>

              {parseError && (
                <p className="text-xs text-rose-400 bg-rose-500/10 border border-rose-500/20 px-3 py-2">{parseError}</p>
              )}

              <div className="flex gap-3">
                <button onClick={onClose}
                  className="flex-1 px-4 py-2.5 border border-border text-xs font-black uppercase tracking-widest text-muted-foreground hover:text-foreground transition-all">
                  Cancel
                </button>
                <button onClick={handleImport} disabled={importing}
                  className="flex-1 px-4 py-2.5 bg-orange-600 hover:bg-orange-500 disabled:opacity-50 text-foreground text-xs font-black uppercase tracking-widest transition-all">
                  {importing ? 'Importing…' : `Import ${rows.length} Parent${rows.length !== 1 ? 's' : ''}`}
                </button>
              </div>
            </div>
          )}

          {/* Step: Results */}
          {step === 'results' && summary && (
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-emerald-500/5 border border-emerald-500/20 p-4 text-center">
                  <p className="text-2xl font-black text-emerald-400">{summary.created}</p>
                  <p className="text-[9px] font-black uppercase tracking-widest text-muted-foreground mt-1">Created</p>
                </div>
                <div className="bg-amber-500/5 border border-amber-500/20 p-4 text-center">
                  <p className="text-2xl font-black text-amber-400">{summary.skipped}</p>
                  <p className="text-[9px] font-black uppercase tracking-widest text-muted-foreground mt-1">Skipped</p>
                </div>
                <div className="bg-rose-500/5 border border-rose-500/20 p-4 text-center">
                  <p className="text-2xl font-black text-rose-400">{summary.errors}</p>
                  <p className="text-[9px] font-black uppercase tracking-widest text-muted-foreground mt-1">Errors</p>
                </div>
              </div>

              {/* Credentials for created accounts */}
              {results.filter(r => r.status === 'created' && r.password).length > 0 && (
                <div className="space-y-2">
                  <p className="text-[10px] font-black uppercase tracking-widest text-orange-400">
                    New Account Credentials — Save These Now
                  </p>
                  <div className="border border-border max-h-48 overflow-y-auto divide-y divide-border">
                    {results.filter(r => r.status === 'created').map((r, i) => (
                      <div key={i} className="px-4 py-2.5 flex items-center justify-between gap-3">
                        <div>
                          <p className="text-xs font-bold text-foreground">{r.email}</p>
                          <p className="text-[11px] text-orange-300 font-mono">{r.password}</p>
                        </div>
                        <CopyButton value={`${r.email} / ${r.password}`} />
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {results.filter(r => r.status === 'error').length > 0 && (
                <div className="space-y-1">
                  <p className="text-[10px] font-black uppercase tracking-widest text-rose-400">Errors</p>
                  {results.filter(r => r.status === 'error').map((r, i) => (
                    <p key={i} className="text-xs text-rose-400">{r.email}: {r.message}</p>
                  ))}
                </div>
              )}

              <button onClick={onClose}
                className="w-full px-4 py-2.5 bg-orange-600 hover:bg-orange-500 text-foreground text-xs font-black uppercase tracking-widest transition-all">
                Done
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Access Cards Modal ────────────────────────────────────────────────────────
function AccessCardsModal({ parents, schoolFilter, onClose }: {
  parents: Parent[];
  schoolFilter: string;
  onClose: () => void;
}) {
  const filtered = schoolFilter
    ? parents.filter(p => p.children.some(c => c.school_name === schoolFilter))
    : parents;

  return (
    <div className="fixed inset-0 z-50 bg-white text-black" style={{ fontFamily: 'Arial, sans-serif' }}>
      {/* Screen bar */}
      <div className="print:hidden flex items-center justify-between px-6 py-4 bg-gray-100 border-b border-gray-200">
        <h2 className="text-sm font-black uppercase tracking-widest">Parent Access Cards</h2>
        <div className="flex items-center gap-3">
          <p className="text-xs text-gray-500">{filtered.length} cards · Print on A4, cut along dotted lines</p>
          <button
            onClick={() => window.print()}
            className="flex items-center gap-2 px-4 py-2 bg-orange-600 text-white text-xs font-black uppercase tracking-widest"
          >
            <PrinterIcon className="w-4 h-4" /> Print Cards
          </button>
          <button onClick={onClose} className="p-2 hover:bg-gray-200 transition-colors">
            <XMarkIcon className="w-5 h-5" />
          </button>
        </div>
      </div>

      <div className="p-6">
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(2, 1fr)',
          gap: '16px',
          maxWidth: '800px',
          margin: '0 auto',
        }}>
          {filtered.map(parent => {
            const initials = parent.full_name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();
            const childrenText = parent.children.map(c => c.full_name).join(', ') || 'No children linked';
            const school = parent.children[0]?.school_name ?? schoolFilter ?? 'Rillcod Academy';

            return (
              <div key={parent.id} style={{
                border: '1px dashed #d1d5db',
                borderRadius: '0px',
                overflow: 'hidden',
                background: 'white',
                breakInside: 'avoid',
              }}>
                {/* Card header */}
                <div style={{
                  background: 'linear-gradient(135deg, #c2410c, #ea580c)',
                  padding: '16px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                }}>
                  <div style={{
                    width: '44px', height: '44px',
                    background: 'rgba(255,255,255,0.2)',
                    borderRadius: '0px',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '18px', fontWeight: 900, color: 'white',
                    flexShrink: 0,
                  }}>
                    {initials}
                  </div>
                  <div>
                    <p style={{ fontSize: '14px', fontWeight: 900, color: 'white', margin: 0 }}>{parent.full_name}</p>
                    <p style={{ fontSize: '9px', fontWeight: 900, color: 'rgba(255,255,255,0.8)', margin: '2px 0 0', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                      Parent / Guardian
                    </p>
                  </div>
                </div>

                {/* Card body */}
                <div style={{ padding: '12px 16px', borderBottom: '1px solid #e5e7eb' }}>
                  <table style={{ width: '100%', fontSize: '11px', borderCollapse: 'collapse' }}>
                    <tbody>
                      <tr>
                        <td style={{ color: '#6b7280', padding: '3px 0', fontSize: '9px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', width: '80px' }}>School</td>
                        <td style={{ color: '#1f2937', padding: '3px 0', fontWeight: 600 }}>{school}</td>
                      </tr>
                      <tr>
                        <td style={{ color: '#6b7280', padding: '3px 0', fontSize: '9px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Email</td>
                        <td style={{ color: '#1f2937', padding: '3px 0', fontSize: '10px' }}>{parent.email}</td>
                      </tr>
                      {parent.phone && (
                        <tr>
                          <td style={{ color: '#6b7280', padding: '3px 0', fontSize: '9px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Phone</td>
                          <td style={{ color: '#1f2937', padding: '3px 0' }}>{parent.phone}</td>
                        </tr>
                      )}
                      <tr>
                        <td style={{ color: '#6b7280', padding: '3px 0', fontSize: '9px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', verticalAlign: 'top' }}>Children</td>
                        <td style={{ color: '#1f2937', padding: '3px 0', fontSize: '10px' }}>{childrenText}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                {/* Card footer */}
                <div style={{ padding: '8px 16px', background: '#f9fafb', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <p style={{ fontSize: '9px', color: '#9ca3af', margin: 0, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    Rillcod Technologies
                  </p>
                  <p style={{ fontSize: '9px', color: '#9ca3af', margin: 0 }}>
                    {parent.is_active ? '✓ Active Account' : '✗ Inactive'}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function ParentsPage() {
  const { profile, loading: authLoading } = useAuth();
  const [parents, setParents] = useState<Parent[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
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
  const [showPrintRegistry, setShowPrintRegistry] = useState(false);
  const [showBulkImport, setShowBulkImport] = useState(false);
  const [showAccessCards, setShowAccessCards] = useState(false);
  const [resetting, setResetting] = useState<string | null>(null);
  const [resetResult, setResetResult] = useState<{ email: string; password: string } | null>(null);

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

      // Students and teachers come from the API response (server-side, bypasses RLS)
      setStudents((parJson.students ?? []) as Student[]);
      setTeachers((parJson.teachers ?? []) as Teacher[]);

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

  const handleResetPassword = async (parent: Parent) => {
    if (!confirm(`Reset password for ${parent.full_name}? A new temporary password will be generated.`)) return;
    setResetting(parent.id);
    try {
      const res = await fetch('/api/parents/manage', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ parent_id: parent.id, reset_password: true }),
      });
      const j = await res.json();
      if (!res.ok) { alert(j.error || 'Failed to reset password'); return; }
      setResetResult({ email: parent.email, password: j.new_password });
    } catch { alert('Failed to reset password'); } finally { setResetting(null); }
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
        <div className="flex items-center gap-2 flex-wrap">
          <button onClick={() => load()}
            className="p-2 border border-border hover:border-foreground/30 text-muted-foreground hover:text-foreground transition-all" title="Refresh">
            <ArrowPathIcon className="w-4 h-4" />
          </button>
          <button
            onClick={() => setShowPrintRegistry(true)}
            className="flex items-center gap-2 px-3 py-2.5 border border-border hover:border-foreground/30 text-muted-foreground hover:text-foreground text-xs font-black uppercase tracking-widest transition-all" title="Print Registry">
            <PrinterIcon className="w-4 h-4" />
            <span className="hidden sm:inline">Registry</span>
          </button>
          <button
            onClick={() => setShowAccessCards(true)}
            className="flex items-center gap-2 px-3 py-2.5 border border-border hover:border-foreground/30 text-muted-foreground hover:text-foreground text-xs font-black uppercase tracking-widest transition-all" title="Access Cards">
            <CreditCardIcon className="w-4 h-4" />
            <span className="hidden sm:inline">Cards</span>
          </button>
          {isAdmin && (
            <button
              onClick={() => setShowBulkImport(true)}
              className="flex items-center gap-2 px-3 py-2.5 border border-border hover:border-foreground/30 text-muted-foreground hover:text-foreground text-xs font-black uppercase tracking-widest transition-all" title="Bulk Import">
              <ArrowUpTrayIcon className="w-4 h-4" />
              <span className="hidden sm:inline">Import</span>
            </button>
          )}
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
                    <button
                      onClick={() => handleResetPassword(parent)}
                      disabled={resetting === parent.id}
                      className="flex items-center gap-2 px-4 py-2 border border-amber-500/30 text-[10px] font-black uppercase tracking-widest text-amber-400 hover:border-amber-500 hover:text-amber-300 transition-all disabled:opacity-50">
                      <KeyIcon className="w-3.5 h-3.5" /> {resetting === parent.id ? '…' : 'Reset PW'}
                    </button>
                    <a href={`/dashboard/messages?to=${parent.id}`}
                      className="flex items-center gap-2 px-4 py-2 border border-border text-[10px] font-black uppercase tracking-widest text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-all ml-auto">
                      <EnvelopeIcon className="w-3.5 h-3.5" /> Message
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
          teachers={teachers}
          schools={schools}
          defaultSchool={!isAdmin ? (profile?.school_name ?? '') : schoolFilter}
          onClose={() => { setShowForm(false); setEditTarget(null); }}
          onSaved={load}
        />
      )}
      {linkTarget && (
        <LinkStudentModal
          parent={linkTarget}
          students={students}
          teachers={teachers}
          schools={schools}
          defaultSchool={!isAdmin ? (profile?.school_name ?? '') : schoolFilter}
          onClose={() => setLinkTarget(null)}
          onSaved={load}
        />
      )}
      {showPrintRegistry && (
        <PrintRegistryModal
          parents={parents}
          schoolFilter={schoolFilter}
          onClose={() => setShowPrintRegistry(false)}
        />
      )}
      {showBulkImport && (
        <BulkImportModal
          onClose={() => setShowBulkImport(false)}
          onDone={load}
        />
      )}
      {resetResult && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-sm bg-card border border-border shadow-2xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-border">
              <div className="flex items-center gap-2">
                <KeyIcon className="w-4 h-4 text-amber-400" />
                <h2 className="text-sm font-black uppercase tracking-widest text-foreground">Password Reset</h2>
              </div>
              <button onClick={() => setResetResult(null)} className="text-muted-foreground hover:text-foreground">
                <XMarkIcon className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <p className="text-xs text-muted-foreground">Share these new credentials with the parent. They should change their password on next login.</p>
              <div className="bg-background border border-border p-4">
                <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-2">Email</p>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm font-bold text-foreground font-mono break-all">{resetResult.email}</span>
                  <CopyButton value={resetResult.email} />
                </div>
              </div>
              <div className="bg-background border border-amber-500/30 p-4">
                <p className="text-[10px] font-black uppercase tracking-widest text-amber-400 mb-2 flex items-center gap-1">
                  <KeyIcon className="w-3 h-3" /> New Temporary Password
                </p>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm font-bold text-amber-300 font-mono tracking-wider">{resetResult.password}</span>
                  <CopyButton value={resetResult.password} />
                </div>
              </div>
              <button onClick={() => setResetResult(null)}
                className="w-full px-4 py-2.5 bg-orange-600 hover:bg-orange-500 text-foreground text-xs font-black uppercase tracking-widest transition-all">
                Done
              </button>
            </div>
          </div>
        </div>
      )}
      {showAccessCards && (
        <AccessCardsModal
          parents={parents}
          schoolFilter={schoolFilter}
          onClose={() => setShowAccessCards(false)}
        />
      )}
    </div>
  );
}
