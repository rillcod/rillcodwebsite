'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import Link from 'next/link';
import { useAuth } from '@/contexts/auth-context';
import {
  UserGroupIcon, MagnifyingGlassIcon, PlusIcon, XMarkIcon,
  EnvelopeIcon, PhoneIcon, UserIcon, AcademicCapIcon, CheckCircleIcon,
  XCircleIcon, PencilSquareIcon, ArrowPathIcon, LinkIcon, HeartIcon,
  ChevronDownIcon, ChevronUpIcon, BuildingOfficeIcon, EyeIcon, EyeSlashIcon,
  ClipboardIcon, KeyIcon, PrinterIcon, ArrowUpTrayIcon, CreditCardIcon, TrashIcon,
} from '@/lib/icons';

import {
  Parent,
  Student,
  Teacher,
  LinkedChild,
  StudentPicker,
  ParentForm,
} from '@/components/parents/ParentForm';


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

// ── Link-to-student modal ─────────────────────────────────────────────────────
function LinkStudentModal({

  parent,
  students,
  teachers,
  schools,
  officialClasses,
  defaultSchool,
  onClose,
  onSaved,
}: {
  parent: Parent;
  students: Student[];
  teachers: Teacher[];
  schools: string[];
  officialClasses?: { name: string; school_name: string | null }[];
  defaultSchool?: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { profile } = useAuth();
  // Sync selectedSchool whenever defaultSchool arrives (profile may load async)
  const [selectedSchool, setSelectedSchool] = useState(defaultSchool ?? '');
  useEffect(() => {
    if (defaultSchool) setSelectedSchool(defaultSchool);
  }, [defaultSchool]); // eslint-disable-line react-hooks/exhaustive-deps
  // Auto-select current user in teacher dropdown if they are a teacher
  const [selectedTeacherId, setSelectedTeacherId] = useState('');
  useEffect(() => {
    if (profile?.role === 'teacher' && profile.id && !selectedTeacherId) {
      setSelectedTeacherId(profile.id);
    }
  }, [profile?.role, profile?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const [studentId, setStudentId] = useState('');
  const [selectedClass, setSelectedClass] = useState('');
  useEffect(() => {
    const t = teachers.find(x => x.id === selectedTeacherId);
    if (t?.section_class && !selectedClass) setSelectedClass(t.section_class);
  }, [selectedTeacherId, teachers, selectedClass]);
  const classList = useMemo(() => {
    const set = new Set<string>();
    // Add official classes from database — filtered by selected school
    if (officialClasses) {
      officialClasses
        .filter(c => !selectedSchool || c.school_name?.toLowerCase() === selectedSchool.toLowerCase())
        .forEach(c => set.add(c.name));
    }
    // Also derive classes from loaded students for this school
    students.filter(s => !selectedSchool || s.school_name?.toLowerCase() === selectedSchool.toLowerCase()).forEach(s => {
      if (s.current_class) set.add(s.current_class);
      if (s.section) set.add(s.section);
      if (s.grade_level) set.add(s.grade_level);
    });
    return Array.from(set).sort();
  }, [students, selectedSchool, officialClasses]);

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
              disabled={schools.length <= 1 && profile?.role !== 'admin'}
              className="w-full px-4 py-2.5 bg-background border border-border text-sm text-foreground focus:outline-none focus:border-orange-500 transition-colors disabled:opacity-60"
            >
              {schools.length === 0 && <option value="">— No Schools Available —</option>}
              {(profile?.role === 'admin' || !selectedSchool) && <option value="">— Select School —</option>}
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
                disabled={profile?.role === 'teacher'}
                onChange={e => { setSelectedTeacherId(e.target.value); setStudentId(''); }}
                className="w-full px-4 py-2.5 bg-background border border-border text-sm text-foreground focus:outline-none focus:border-orange-500 transition-colors disabled:opacity-60"
              >
                {profile?.role === 'admin' && <option value="">— All Teachers —</option>}
                {teachers
                  .filter(t => (!selectedSchool || t.school_name === selectedSchool) && (profile?.role !== 'teacher' || t.id === profile?.id))
                  .map(t => (
                    <option key={t.id} value={t.id}>
                      {t.full_name}{t.id === profile?.id ? ' (You)' : ''}{t.section_class ? ` · ${t.section_class}` : ''}
                    </option>
                  ))}
              </select>
            </div>
          )}
          <div>
            <label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest block mb-1.5 flex items-center gap-1.5">
              Class / Category
              <span className="text-muted-foreground normal-case font-normal text-[9px]">(optional filter)</span>
            </label>
            <select
              value={selectedClass}
              onChange={e => { setSelectedClass(e.target.value); setStudentId(''); }}
              className="w-full px-4 py-2.5 bg-background border border-border text-sm text-foreground focus:outline-none focus:border-orange-500 transition-colors"
            >
              <option value="">— All Students in School —</option>
              {classList.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            {!selectedClass && selectedSchool && <p className="text-[9px] text-muted-foreground mt-1">Showing all students for this school.</p>}
          </div>

          <div>
            <label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest block mb-1.5">Student</label>
            <StudentPicker
              students={students}
              schoolFilter={selectedSchool}
              classFilter={selectedClass || teachers.find(t => t.id === selectedTeacherId)?.section_class || undefined}
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
function buildRegistryHTML(parents: Parent[], schoolFilter: string): string {
  const filtered = schoolFilter
    ? parents.filter(p => p.children.some(c => c.school_name === schoolFilter))
    : parents;
  const printDate = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' });
  const genDate = new Date().toISOString().slice(0, 10);

  const rows = filtered.map((parent, idx) => `
    <tr style="border-bottom:1px solid #e5e7eb;background:${idx % 2 === 0 ? '#f9fafb' : '#fff'}">
      <td style="padding:8px 6px;color:#6b7280">${idx + 1}</td>
      <td style="padding:8px 6px;font-weight:700">${parent.full_name ?? ''}</td>
      <td style="padding:8px 6px;color:#374151">${parent.email ?? ''}</td>
      <td style="padding:8px 6px;color:#374151">${parent.phone ?? '—'}</td>
      <td style="padding:8px 6px;color:#374151">${parent.children.length > 0 ? parent.children.map(c => c.full_name).join(', ') : '—'}</td>
      <td style="padding:8px 6px">
        <span style="font-size:9px;font-weight:900;text-transform:uppercase;letter-spacing:0.1em;padding:2px 6px;
          border:1px solid ${parent.is_active ? '#059669' : '#dc2626'};color:${parent.is_active ? '#059669' : '#dc2626'}">
          ${parent.is_active ? 'Active' : 'Inactive'}
        </span>
      </td>
    </tr>`).join('');

  return `<!DOCTYPE html><html><head><meta charset="utf-8">
  <title>Parent Registry</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:Arial,sans-serif;font-size:12px;color:#111;background:#fff;padding:32px}
    h1{font-size:22px;font-weight:900;text-transform:uppercase;letter-spacing:0.08em}
    .meta{font-size:12px;color:#6b7280;margin-top:4px;margin-bottom:24px;padding-bottom:16px;border-bottom:2px solid #1f2937}
    table{width:100%;border-collapse:collapse}
    th{text-align:left;padding:8px 6px;font-weight:900;text-transform:uppercase;letter-spacing:0.1em;font-size:10px;border-bottom:2px solid #1f2937}
    td{vertical-align:top}
    .footer{margin-top:32px;padding-top:12px;border-top:1px solid #e5e7eb;font-size:10px;color:#9ca3af}
    @media print{body{padding:16px}}
  </style>
</head><body>
  <h1>Parent Registry</h1>
  <div class="meta">
    ${schoolFilter ? `School: ${schoolFilter} &nbsp;·&nbsp; ` : ''}
    ${filtered.length} parent${filtered.length !== 1 ? 's' : ''} &nbsp;·&nbsp; Printed: ${printDate}
  </div>
  <table>
    <thead>
      <tr>
        <th>#</th><th>Parent Name</th><th>Email</th><th>Phone</th><th>Linked Children</th><th>Status</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>
  <div class="footer">Rillcod Technologies &nbsp;·&nbsp; Parent Registry &nbsp;·&nbsp; Generated ${genDate}</div>
</body></html>`;
}

function PrintRegistryModal({ parents, schoolFilter, onClose }: {
  parents: Parent[];
  schoolFilter: string;
  onClose: () => void;
}) {
  const filtered = schoolFilter ? parents.filter(p =>
    p.children.some(c => c.school_name === schoolFilter)
  ) : parents;

  const handlePrint = () => {
    const html = buildRegistryHTML(parents, schoolFilter);
    const w = window.open('', '_blank', 'width=960,height=800');
    if (!w) return;
    w.document.write(html);
    w.document.close();
    w.focus();
    setTimeout(() => { w.print(); }, 400);
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background text-foreground" style={{ fontFamily: 'Arial, sans-serif' }}>
      {/* Header bar */}
      <div className="flex items-center justify-between px-4 sm:px-6 py-4 bg-muted border-b border-border sticky top-0 z-10">
        <div>
          <h2 className="text-sm font-black uppercase tracking-widest">Parent Registry</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            {schoolFilter ? `${schoolFilter} · ` : ''}{filtered.length} parent{filtered.length !== 1 ? 's' : ''}
          </p>
        </div>
        <div className="flex items-center gap-2 sm:gap-3">
          <button
            onClick={handlePrint}
            className="flex items-center gap-2 px-3 sm:px-4 py-2 bg-orange-600 hover:bg-orange-500 text-white text-[10px] sm:text-xs font-black uppercase tracking-widest whitespace-nowrap transition-all"
          >
            <PrinterIcon className="w-4 h-4 shrink-0" /> Print / Save PDF
          </button>
          <button onClick={onClose} className="p-2 hover:bg-muted/80 transition-colors">
            <XMarkIcon className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Preview */}
      <div className="flex-1 overflow-auto p-4 sm:p-8">
        <div className="max-w-5xl mx-auto bg-white text-black rounded border border-border shadow-sm p-6 sm:p-8">
          {/* Print header */}
          <div className="mb-6 pb-4 border-b-2 border-gray-800">
            <h1 className="text-2xl font-black uppercase tracking-widest">Parent Registry</h1>
            <p className="text-sm text-gray-600 mt-1">
              {schoolFilter ? `School: ${schoolFilter} · ` : ''}
              {filtered.length} parent{filtered.length !== 1 ? 's' : ''} ·
              Printed: {new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' })}
            </p>
          </div>

          <div className="overflow-x-auto">
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
              <thead>
                <tr style={{ borderBottom: '2px solid #1f2937' }}>
                  {['#', 'Parent Name', 'Email', 'Phone', 'Linked Children', 'Status'].map(h => (
                    <th key={h} style={{ textAlign: 'left', padding: '8px 6px', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.1em', fontSize: '10px' }}>{h}</th>
                  ))}
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
                      {parent.children.length > 0 ? parent.children.map(c => c.full_name).join(', ') : '—'}
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
          </div>

          <div style={{ marginTop: '32px', paddingTop: '12px', borderTop: '1px solid #e5e7eb', fontSize: '10px', color: '#9ca3af' }}>
            Rillcod Technologies · Parent Registry · Generated {new Date().toISOString().slice(0, 10)}
          </div>
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
      <div className="print:hidden flex items-center justify-between px-4 sm:px-6 py-4 bg-gray-100 border-b border-gray-200 sticky top-0 z-10">
        <h2 className="text-[10px] sm:text-sm font-black uppercase tracking-widest truncate">Parent Access Cards</h2>
        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
          <p className="hidden md:block text-[10px] text-gray-500">{filtered.length} cards · Print on A4</p>
          <button
            onClick={() => window.print()}
            className="flex items-center gap-2 px-3 sm:px-4 py-2 bg-orange-600 text-white text-[10px] sm:text-xs font-black uppercase tracking-widest whitespace-nowrap"
          >
            <PrinterIcon className="w-4 h-4 shrink-0" /> <span className="hidden sm:inline">Print Cards</span><span className="sm:hidden">Print</span>
          </button>
          <button onClick={onClose} className="p-2 hover:bg-gray-200 transition-colors shrink-0">
            <XMarkIcon className="w-5 h-5" />
          </button>
        </div>
      </div>

      <div className="p-4 sm:p-6 overflow-y-auto max-h-[calc(100vh-64px)]">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-[800px] mx-auto print:grid-cols-2">
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
  const [classes, setClasses] = useState<{ name: string; school_name: string | null }[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  // Keep refs so `load` always reads the latest values without stale closures
  const searchRef = useRef('');
  const schoolFilterRef = useRef('');
  const classFilterRef = useRef('');
  // Debounce search so we don't fire a request on every keystroke
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleSearchChange = (val: string) => {
    setSearch(val);
    searchRef.current = val;
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(() => load(), 400);
  };
  // School filter: admin defaults to '' (all); teacher defaults to their school_name
  const [schoolFilter, setSchoolFilter] = useState('');
  const [classFilter, setClassFilter] = useState('');
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
  // Slide-over drawer for Add / Edit
  const [showSlide, setShowSlide] = useState(false);
  const [slideMode, setSlideMode] = useState<'add' | 'edit'>('add');
  const [slideParent, setSlideParent] = useState<Parent | null>(null);
  const [slidePickerLoading, setSlidePickerLoading] = useState(false);
  // Delete confirmation modal
  const [deleteTarget, setDeleteTarget] = useState<Parent | null>(null);
  // Status filter
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [resetResult, setResetResult] = useState<{ email: string; password: string } | null>(null);
  const [pickerLoading, setPickerLoading] = useState(false);
  const [pickerLoaded, setPickerLoaded] = useState(false);

  const isStaff = profile?.role === 'admin' || profile?.role === 'teacher';
  const isAdmin = profile?.role === 'admin';

  // Intentionally empty — teacher school init is handled in the combined mount effect below

  const load = useCallback(async (includePickers = false) => {
    if (!isStaff) return;
    if (!includePickers) setLoading(true); // Don't show list skeleton when only loading picker data
    if (includePickers) setPickerLoading(true);

    try {
      // Read all filter values from refs to avoid stale closures
      const params = new URLSearchParams();
      const currentSearch = searchRef.current;
      const currentSchool = schoolFilterRef.current;
      const currentClass = classFilterRef.current;
      if (currentSearch) params.set('search', currentSearch);
      if (currentSchool) params.set('school', currentSchool);
      if (currentClass) params.set('class', currentClass);
      if (includePickers) params.set('include_picker_data', 'true');

      const parRes = await fetch(`/api/parents/manage?${params.toString()}`, { cache: 'no-store' });
      const parJson = await parRes.json();
      if (!parRes.ok) throw new Error(parJson.error);

      setParents(parJson.data ?? []);
      
      // Update picker data if it was returned
      if (includePickers || parJson.classes) {
        setStudents((parJson.students ?? []) as Student[]);
        setTeachers((parJson.teachers ?? []) as Teacher[]);
        setClasses((parJson.classes ?? []) as { name: string; school_name: string | null }[]);
        setPickerLoaded(true);
      }

      // Handle assigned schools
      if (parJson.assigned_schools && parJson.assigned_schools.length > 0) {
        setSchools(parJson.assigned_schools);
        if (!isAdmin && !schoolFilterRef.current && parJson.assigned_schools[0]) {
          schoolFilterRef.current = parJson.assigned_schools[0];
          setSchoolFilter(parJson.assigned_schools[0]);
        }
      } else if (isStaff && schools.length === 0) {
        // Only fetch public schools once if not provided by the parent API
        const schoolRes = await fetch('/api/schools/public');
        if (schoolRes.ok) {
          const { schools: schoolList } = await schoolRes.json();
          const names = (schoolList ?? []).map((s: any) => s.name).filter(Boolean);
          setSchools(names);
        }
      }
    } catch (err) {
      console.error('Parents load error:', err);
    } finally {
      setLoading(false);
      setPickerLoading(false);
    }
  }, [isStaff, isAdmin, schools.length]); // filter values read from refs to avoid stale closures

  // Helper to ensure picker data is ready before showing modals
  const ensurePickerData = useCallback(async () => {
    if (pickerLoaded) return;
    await load(true);
  }, [pickerLoaded, load]);

  // Open slide-over drawer (lazy-loads picker data if needed)
  const openSlide = useCallback(async (mode: 'add' | 'edit', parent?: Parent) => {
    setSlideMode(mode);
    setSlideParent(parent ?? null);
    setShowSlide(true);
    if (!pickerLoaded) {
      setSlidePickerLoading(true);
      await load(true);
      setSlidePickerLoading(false);
    }
  }, [pickerLoaded, load]);

  // Re-fetch students/teachers/classes for a specific school (used inside the slide-over)
  // NOTE: do NOT set slidePickerLoading here — that unmounts ParentForm and resets all typed data.
  // The form's own schoolChanging state handles the inline "loading students…" indicator.
  const handleSlideSchoolChange = useCallback(async (school: string) => {
    try {
      const params = new URLSearchParams({ include_picker_data: 'true' });
      if (school) params.set('school', school);
      const res = await fetch(`/api/parents/manage?${params.toString()}`);
      const json = await res.json();
      if (res.ok) {
        setStudents(json.students || []);
        setTeachers(json.teachers || []);
        setClasses(json.classes || []);
      }
    } catch { /* silent — form shows its own inline error */ }
  }, []);

  useEffect(() => {
    if (authLoading || !profile) return;

    if (profile.role === 'teacher') {
      // Set school synchronously in the ref before calling load so the API gets the right filter
      const school = profile.school_name ?? '';
      schoolFilterRef.current = school;
      setSchoolFilter(school);
      if (school) setSchools(prev => (prev.length ? prev : [school]));
      load(false);
    } else if (profile.role === 'admin') {
      // Admin: populate the schools dropdown without loading parents yet
      setLoading(false);
      fetch('/api/schools/public')
        .then(r => r.ok ? r.json() : null)
        .then(j => { if (j?.schools) setSchools(j.schools.map((s: any) => s.name).filter(Boolean)); })
        .catch(() => {});
    }
  }, [authLoading, profile?.id]); // eslint-disable-line react-hooks/exhaustive-deps

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

  const [deleting, setDeleting] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === parents.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(parents.map(p => p.id)));
    }
  };

  const handleDeleteParent = async (parent: Parent) => {
    setDeleting(parent.id);
    try {
      const res = isAdmin
        ? await fetch(`/api/portal-users/${parent.id}`, { method: 'DELETE' })
        : await fetch(`/api/portal-users/${parent.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ is_deleted: true, is_active: false }) });
      if (!res.ok) { const j = await res.json(); alert(j.error || 'Failed to delete'); return; }
      setParents(prev => prev.filter(p => p.id !== parent.id));
      setSelectedIds(prev => { const n = new Set(prev); n.delete(parent.id); return n; });
    } catch { alert('Failed to delete'); } finally { setDeleting(null); }
  };

  const handleBulkDelete = async () => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    if (!confirm(`Permanently delete ${ids.length} parent account${ids.length !== 1 ? 's' : ''}? This cannot be undone.`)) return;
    setBulkDeleting(true);
    try {
      const res = await fetch('/api/portal-users', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids }),
      });
      if (!res.ok) { const j = await res.json(); alert(j.error || 'Bulk delete failed'); return; }
      setParents(prev => prev.filter(p => !selectedIds.has(p.id)));
      setSelectedIds(new Set());
    } catch { alert('Bulk delete failed'); } finally { setBulkDeleting(false); }
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

  const visibleParents = statusFilter === 'all'
    ? parents
    : parents.filter(p => statusFilter === 'active' ? p.is_active : !p.is_active);

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
        <div className="flex items-center gap-1.5 flex-wrap sm:flex-nowrap">
          <button onClick={() => load()}
            className="p-2.5 border border-border hover:border-foreground/30 text-muted-foreground hover:text-foreground transition-all shrink-0" title="Refresh">
            <ArrowPathIcon className="w-4 h-4" />
          </button>
          <button
            onClick={() => setShowPrintRegistry(true)}
            className="flex items-center gap-2 px-3 py-2.5 border border-border hover:border-foreground/30 text-muted-foreground hover:text-foreground text-[10px] font-black uppercase tracking-widest transition-all shrink-0" title="Print Registry">
            <PrinterIcon className="w-4 h-4" />
            <span className="hidden sm:inline">Registry</span>
          </button>
          <button
            onClick={() => setShowAccessCards(true)}
            className="flex items-center gap-2 px-3 py-2.5 border border-border hover:border-foreground/30 text-muted-foreground hover:text-foreground text-[10px] font-black uppercase tracking-widest transition-all shrink-0" title="Access Cards">
            <CreditCardIcon className="w-4 h-4" />
            <span className="hidden sm:inline">Cards</span>
          </button>
          {isAdmin && (
            <button
              onClick={() => setShowBulkImport(true)}
              className="flex items-center gap-2 px-3 py-2.5 border border-border hover:border-foreground/30 text-muted-foreground hover:text-foreground text-[10px] font-black uppercase tracking-widest transition-all shrink-0" title="Bulk Import">
              <ArrowUpTrayIcon className="w-4 h-4" />
              <span className="hidden sm:inline">Import</span>
            </button>
          )}
          <button
            onClick={() => openSlide('add')}
            className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2.5 bg-orange-600 hover:bg-orange-500 disabled:opacity-50 text-foreground text-[10px] font-black uppercase tracking-widest transition-all">
            <PlusIcon className="w-4 h-4" /> <span className="whitespace-nowrap">Add Parent</span>
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1 max-w-sm">
          <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            value={search}
            onChange={e => handleSearchChange(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { if (searchTimerRef.current) clearTimeout(searchTimerRef.current); load(); } }}
            placeholder="Search by name or email…"
            className="w-full pl-10 pr-4 py-2.5 bg-card border border-border text-sm text-foreground focus:outline-none focus:border-orange-500 transition-colors"
          />
        </div>

        {/* School filter */}
        {(() => {
          // For teacher: use profile.school_name as immediate fallback so the select
          // never shows "— Select School —" even before the effect sets schoolFilter state.
          const teacherSchool = profile?.role === 'teacher' ? (profile.school_name ?? '') : '';
          const selectValue = schoolFilter || teacherSchool;
          return (
            <div className="relative">
              <BuildingOfficeIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <select
                value={selectValue}
                onChange={e => {
                  const val = e.target.value;
                  schoolFilterRef.current = val;
                  classFilterRef.current = '';
                  setSchoolFilter(val);
                  setClassFilter('');
                  setPickerLoaded(false);
                  if (val) load();
                  else { setParents([]); setLoading(false); }
                }}
                disabled={false}
                className="pl-9 pr-8 py-2.5 bg-card border border-border text-sm text-foreground focus:outline-none focus:border-orange-500 transition-colors min-w-[180px] appearance-none disabled:opacity-70"
              >
                <option value="">— Select School —</option>
                {/* Guarantee teacher's school is always an option before schools[] loads */}
                {teacherSchool && !schools.includes(teacherSchool) && (
                  <option value={teacherSchool}>{teacherSchool}</option>
                )}
                {schools.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          );
        })()}

        {/* Class filter — shown only if a school is selected */}
        {schoolFilter && (
          <div className="relative">
            <AcademicCapIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <select
              value={classFilter}
              onChange={e => { classFilterRef.current = e.target.value; setClassFilter(e.target.value); load(); }}
              className="pl-9 pr-8 py-2.5 bg-card border border-border text-sm text-foreground focus:outline-none focus:border-orange-500 transition-colors min-w-[180px] appearance-none"
            >
              <option value="">All My Classes</option>
              {classes
                .filter(c => !schoolFilter || c.school_name?.toLowerCase() === schoolFilter.toLowerCase())
                .map(c => <option key={c.name} value={c.name}>{c.name}</option>)}
            </select>
          </div>
        )}

        {(schoolFilter || classFilter) && isAdmin && (
          <button onClick={() => { schoolFilterRef.current = ''; classFilterRef.current = ''; setSchoolFilter(''); setClassFilter(''); load(); }}
            className="flex items-center gap-1.5 px-3 py-2.5 border border-border text-xs text-muted-foreground hover:text-foreground transition-colors">
            <XMarkIcon className="w-3.5 h-3.5" /> Clear Filters
          </button>
        )}
        {classFilter && !isAdmin && (
          <button onClick={() => { classFilterRef.current = ''; setClassFilter(''); load(); }}
            className="flex items-center gap-1.5 px-3 py-2.5 border border-border text-xs text-muted-foreground hover:text-foreground transition-colors">
            <XMarkIcon className="w-3.5 h-3.5" /> Clear Class
          </button>
        )}
      </div>

      {/* Status filter tabs */}
      <div className="flex items-center gap-1 bg-card border border-border p-1 w-fit">
        {([
          { id: 'all' as const, label: 'All', count: parents.length },
          { id: 'active' as const, label: 'Active', count: parents.filter(p => p.is_active).length },
          { id: 'inactive' as const, label: 'Inactive', count: parents.filter(p => !p.is_active).length },
        ]).map(({ id, label, count }) => (
          <button key={id} onClick={() => setStatusFilter(id)}
            className={`flex items-center gap-1.5 px-4 py-1.5 text-[10px] font-black uppercase tracking-widest transition-all ${
              statusFilter === id
                ? id === 'active' ? 'bg-emerald-500/20 text-emerald-400'
                  : id === 'inactive' ? 'bg-rose-500/20 text-rose-400'
                  : 'bg-white/10 text-foreground'
                : 'text-muted-foreground hover:text-foreground'
            }`}>
            {label}
            <span className={`text-[9px] px-1.5 py-0.5 font-black ${
              statusFilter === id ? 'bg-white/10' : 'bg-white/5'
            }`}>{count}</span>
          </button>
        ))}
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

      {/* Bulk action bar — admin only, shown when items are selected */}
      {isAdmin && selectedIds.size > 0 && (
        <div className="flex items-center justify-between gap-4 px-4 py-3 bg-rose-500/10 border border-rose-500/30">
          <div className="flex items-center gap-3">
            <button onClick={toggleSelectAll} className="w-4 h-4 border border-rose-500/50 bg-rose-500/20 flex items-center justify-center text-rose-400 text-[8px] font-black flex-shrink-0">✓</button>
            <span className="text-xs font-black text-rose-400">{selectedIds.size} selected</span>
            <button onClick={() => setSelectedIds(new Set())} className="text-[10px] text-muted-foreground hover:text-foreground underline">Clear</button>
          </div>
          <button
            onClick={handleBulkDelete}
            disabled={bulkDeleting}
            className="flex items-center gap-2 px-4 py-2 bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white text-[10px] font-black uppercase tracking-widest transition-all">
            <TrashIcon className="w-3.5 h-3.5" />
            {bulkDeleting ? 'Deleting…' : `Delete ${selectedIds.size}`}
          </button>
        </div>
      )}

      {/* List */}
      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="bg-card border border-border p-4 animate-pulse h-16" />
          ))}
        </div>
      ) : visibleParents.length === 0 ? (
        <div className="bg-card border border-border p-12 text-center">
          <HeartIcon className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
          <p className="text-sm font-black text-foreground uppercase tracking-wider">
            {isAdmin && !schoolFilter ? 'Select a school above' : parents.length === 0 ? 'No parent accounts found' : `No ${statusFilter} accounts`}
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            {isAdmin && !schoolFilter
              ? 'Choose a school from the dropdown to view its parent accounts.'
              : search || schoolFilter ? 'Try adjusting your filters.' : parents.length === 0 ? 'Click "Add Parent" to create one.' : `All ${parents.length} parents are ${statusFilter === 'active' ? 'inactive' : 'active'}.`}
          </p>
        </div>
      ) : (
        <div className="bg-card border border-border divide-y divide-border">
          {/* Select-all header — admin only */}
          {isAdmin && visibleParents.length > 0 && (
            <div className="flex items-center gap-3 px-4 sm:px-5 py-2 border-b border-border bg-background/40">
              <button
                type="button"
                onClick={toggleSelectAll}
                className={`w-4 h-4 border flex-shrink-0 flex items-center justify-center text-[8px] font-black transition-all ${selectedIds.size === visibleParents.length && visibleParents.length > 0 ? 'bg-rose-500 border-rose-500 text-white' : 'border-border hover:border-rose-500/50'}`}>
                {selectedIds.size === visibleParents.length && visibleParents.length > 0 ? '✓' : ''}
              </button>
              <span className="text-[10px] text-muted-foreground font-bold uppercase tracking-widest">
                {selectedIds.size === visibleParents.length && visibleParents.length > 0 ? 'Deselect all' : `Select all ${visibleParents.length}`}
              </span>
            </div>
          )}
          {visibleParents.map(parent => (
            <div key={parent.id}>
                {/* Parent row */}
                <div
                  className={`flex items-center gap-3 sm:gap-4 px-4 sm:px-5 py-3 sm:py-4 hover:bg-white/5 transition-all cursor-pointer ${selectedIds.has(parent.id) ? 'bg-rose-500/5' : ''}`}
                  onClick={() => setExpanded(expanded === parent.id ? null : parent.id)}
                >
                  {/* Checkbox — admin only, stops row expand */}
                  {isAdmin && (
                    <button
                      type="button"
                      onClick={e => { e.stopPropagation(); toggleSelect(parent.id); }}
                      className={`w-4 h-4 border flex-shrink-0 flex items-center justify-center text-[8px] font-black transition-all ${selectedIds.has(parent.id) ? 'bg-rose-500 border-rose-500 text-white' : 'border-border hover:border-rose-500/50'}`}>
                      {selectedIds.has(parent.id) ? '✓' : ''}
                    </button>
                  )}
                  {/* Initials avatar */}
                  {(() => {
                    const initials = parent.full_name.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase();
                    return (
                      <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-sm bg-gradient-to-br from-orange-600 to-orange-400 flex items-center justify-center flex-shrink-0 shadow-sm">
                        <span className="text-xs sm:text-sm font-black text-white">{initials}</span>
                      </div>
                    );
                  })()}

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs sm:text-sm font-bold text-foreground truncate max-w-[140px] sm:max-w-xs">{parent.full_name}</span>
                      <span className={`text-[8px] font-black uppercase tracking-widest px-1.5 py-0.5 border flex-shrink-0 ${
                        parent.is_active
                          ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
                          : 'bg-rose-500/10 border-rose-500/20 text-rose-400'
                      }`}>
                        {parent.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </div>
                    <div className="flex flex-col sm:flex-row sm:items-center gap-0.5 sm:gap-3 mt-0.5">
                      <span className="text-[10px] sm:text-xs text-muted-foreground flex items-center gap-1 truncate">
                        <EnvelopeIcon className="w-3 h-3 shrink-0" /> <span className="truncate">{parent.email}</span>
                      </span>
                      {parent.phone && (
                        <span className="text-[10px] text-muted-foreground flex items-center gap-1 shrink-0">
                          <PhoneIcon className="w-3 h-3 shrink-0" /> {parent.phone}
                        </span>
                      )}
                    </div>
                    {/* Children chips — visible in collapsed row on sm+ */}
                    {parent.children.length > 0 && (
                      <div className="hidden sm:flex items-center gap-1 mt-1 flex-wrap">
                        {parent.children.slice(0, 3).map(c => (
                          <span key={c.id} className="text-[9px] font-bold px-2 py-0.5 bg-white/5 border border-border text-muted-foreground">
                            {c.full_name.split(' ')[0]}
                          </span>
                        ))}
                        {parent.children.length > 3 && (
                          <span className="text-[9px] text-muted-foreground">+{parent.children.length - 3} more</span>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Children count badge */}
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <div className="flex items-center gap-1 px-2 py-1.5 bg-orange-500/5 border border-orange-500/15">
                      <AcademicCapIcon className="w-3.5 h-3.5 text-orange-400" />
                      <span className="text-xs font-black text-orange-400">{parent.children.length}</span>
                    </div>
                  </div>

                  {/* Expand icon */}
                  <div className="flex-shrink-0 text-muted-foreground ml-1">
                    {expanded === parent.id ? <ChevronUpIcon className="w-4 h-4" /> : <ChevronDownIcon className="w-4 h-4" />}
                  </div>
              </div>

              {/* Expanded detail */}
              {expanded === parent.id && (
                <div className="px-4 sm:px-5 pb-6 pt-2 bg-background/50 border-t border-border space-y-5">

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
                  <div className="flex flex-wrap items-center gap-2 pt-3 border-t border-border">
                    {/* Edit */}
                    <button
                      onClick={() => openSlide('edit', parent)}
                      title="Edit parent profile"
                      className="group flex items-center gap-2 px-3 py-2 bg-white/5 hover:bg-white/10 border border-border hover:border-white/30 transition-all">
                      <span className="w-6 h-6 rounded-sm bg-violet-500/20 flex items-center justify-center group-hover:bg-violet-500/30 transition-colors">
                        <PencilSquareIcon className="w-3.5 h-3.5 text-violet-400" />
                      </span>
                      <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground group-hover:text-foreground transition-colors hidden sm:block">Edit</span>
                    </button>

                    {/* Link Student */}
                    <button
                      onClick={async () => { await ensurePickerData(); setLinkTarget(parent); }}
                      title="Link a student to this parent"
                      className="group flex items-center gap-2 px-3 py-2 bg-orange-500/5 hover:bg-orange-500/10 border border-orange-500/20 hover:border-orange-500/50 transition-all">
                      <span className="w-6 h-6 rounded-sm bg-orange-500/20 flex items-center justify-center group-hover:bg-orange-500/30 transition-colors">
                        <LinkIcon className="w-3.5 h-3.5 text-orange-400" />
                      </span>
                      <span className="text-[10px] font-black uppercase tracking-widest text-orange-400 hidden sm:block">Link Student</span>
                    </button>

                    {/* Activate / Deactivate */}
                    <button
                      onClick={() => handleToggleActive(parent)}
                      disabled={toggling === parent.id}
                      title={parent.is_active ? 'Deactivate account' : 'Activate account'}
                      className={`group flex items-center gap-2 px-3 py-2 border transition-all disabled:opacity-50 ${
                        parent.is_active
                          ? 'bg-rose-500/5 hover:bg-rose-500/10 border-rose-500/20 hover:border-rose-500/50'
                          : 'bg-emerald-500/5 hover:bg-emerald-500/10 border-emerald-500/20 hover:border-emerald-500/50'
                      }`}>
                      <span className={`w-6 h-6 rounded-sm flex items-center justify-center transition-colors ${
                        parent.is_active ? 'bg-rose-500/20 group-hover:bg-rose-500/30' : 'bg-emerald-500/20 group-hover:bg-emerald-500/30'
                      }`}>
                        {parent.is_active
                          ? <XCircleIcon className="w-3.5 h-3.5 text-rose-400" />
                          : <CheckCircleIcon className="w-3.5 h-3.5 text-emerald-400" />}
                      </span>
                      <span className={`text-[10px] font-black uppercase tracking-widest hidden sm:block ${parent.is_active ? 'text-rose-400' : 'text-emerald-400'}`}>
                        {toggling === parent.id ? '…' : parent.is_active ? 'Deactivate' : 'Activate'}
                      </span>
                    </button>

                    {/* Reset Password */}
                    <button
                      onClick={() => handleResetPassword(parent)}
                      disabled={resetting === parent.id}
                      title="Reset login password"
                      className="group flex items-center gap-2 px-3 py-2 bg-amber-500/5 hover:bg-amber-500/10 border border-amber-500/20 hover:border-amber-500/50 transition-all disabled:opacity-50">
                      <span className="w-6 h-6 rounded-sm bg-amber-500/20 flex items-center justify-center group-hover:bg-amber-500/30 transition-colors">
                        <KeyIcon className="w-3.5 h-3.5 text-amber-400" />
                      </span>
                      <span className="text-[10px] font-black uppercase tracking-widest text-amber-400 hidden sm:block">
                        {resetting === parent.id ? '…' : 'Reset PW'}
                      </span>
                    </button>

                    {/* Message */}
                    <a href={`/dashboard/messages?to=${parent.id}`}
                      title="Send message to parent"
                      className="group flex items-center gap-2 px-3 py-2 bg-blue-500/5 hover:bg-blue-500/10 border border-blue-500/20 hover:border-blue-500/50 transition-all">
                      <span className="w-6 h-6 rounded-sm bg-blue-500/20 flex items-center justify-center group-hover:bg-blue-500/30 transition-colors">
                        <EnvelopeIcon className="w-3.5 h-3.5 text-blue-400" />
                      </span>
                      <span className="text-[10px] font-black uppercase tracking-widest text-blue-400 hidden sm:block">Message</span>
                    </a>

                    {/* Card Studio shortcut */}
                    <Link
                      href={`/dashboard/card-studio?mode=issuance&type=parent&q=${encodeURIComponent(parent.full_name || parent.email || '')}`}
                      title="Open in card studio"
                      className="group flex items-center gap-2 px-3 py-2 bg-orange-500/5 hover:bg-orange-500/10 border border-orange-500/20 hover:border-orange-500/50 transition-all"
                    >
                      <span className="w-6 h-6 rounded-sm bg-orange-500/20 flex items-center justify-center group-hover:bg-orange-500/30 transition-colors">
                        <CreditCardIcon className="w-3.5 h-3.5 text-orange-400" />
                      </span>
                      <span className="text-[10px] font-black uppercase tracking-widest text-orange-400 hidden sm:block">Card</span>
                    </Link>

                    {/* Delete — pushed right */}
                    <button
                      onClick={() => setDeleteTarget(parent)}
                      disabled={deleting === parent.id}
                      title="Delete parent account"
                      className="group flex items-center gap-2 px-3 py-2 bg-rose-500/5 hover:bg-rose-500/10 border border-rose-500/20 hover:border-rose-500/50 transition-all disabled:opacity-50 ml-auto">
                      <span className="w-6 h-6 rounded-sm bg-rose-500/20 flex items-center justify-center group-hover:bg-rose-500/30 transition-colors">
                        <TrashIcon className="w-3.5 h-3.5 text-rose-400" />
                      </span>
                      <span className="text-[10px] font-black uppercase tracking-widest text-rose-400 hidden sm:block">
                        {deleting === parent.id ? '…' : 'Delete'}
                      </span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Modals */}

      {linkTarget && (
        <LinkStudentModal
          parent={linkTarget}
          students={students}
          teachers={teachers}
          schools={schools}
          officialClasses={classes}
          defaultSchool={!isAdmin ? (schoolFilter || profile?.school_name || '') : (linkTarget?.children[0]?.school_name ?? schoolFilter)}
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

      {/* ── Slide-over drawer: Add / Edit parent ─────────────────────────── */}
      {showSlide && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
            onClick={() => setShowSlide(false)}
          />
          {/* Panel */}
          <div className="fixed inset-y-0 right-0 z-50 w-full max-w-2xl bg-[#0f0f1a] border-l border-border shadow-2xl flex flex-col overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-card flex-shrink-0">
              <div className="flex items-center gap-3">
                <div className={`w-8 h-8 rounded-sm flex items-center justify-center ${slideMode === 'add' ? 'bg-orange-500/20' : 'bg-violet-500/20'}`}>
                  {slideMode === 'add'
                    ? <PlusIcon className="w-4 h-4 text-orange-400" />
                    : <PencilSquareIcon className="w-4 h-4 text-violet-400" />}
                </div>
                <div>
                  <h2 className="text-sm font-black text-foreground uppercase tracking-widest">
                    {slideMode === 'add' ? 'Add Parent Account' : `Edit: ${slideParent?.full_name}`}
                  </h2>
                  <p className="text-[10px] text-muted-foreground mt-0.5">
                    {slideMode === 'add'
                      ? 'Create a new parent account and link to students.'
                      : 'Update profile, school links, and student connections.'}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowSlide(false)}
                className="p-2 hover:bg-white/10 text-muted-foreground hover:text-foreground transition-all"
              >
                <XMarkIcon className="w-5 h-5" />
              </button>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto p-6">
              {slidePickerLoading ? (
                <div className="flex flex-col items-center justify-center h-48 gap-3">
                  <div className="w-8 h-8 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
                  <p className="text-xs text-muted-foreground font-black uppercase tracking-widest animate-pulse">
                    Loading form data…
                  </p>
                </div>
              ) : (
                <ParentForm
                  initialData={slideMode === 'edit' ? slideParent : undefined}
                  students={students}
                  teachers={teachers}
                  schools={schools}
                  officialClasses={classes}
                  defaultSchool={
                    slideMode === 'edit'
                      ? (slideParent?.children[0]?.school_name || (profile?.role === 'teacher' ? profile?.school_name ?? '' : ''))
                      : (profile?.role === 'teacher' ? profile?.school_name ?? '' : '')
                  }
                  onSchoolChange={handleSlideSchoolChange}
                  onCancel={() => setShowSlide(false)}
                  onSaved={() => { setShowSlide(false); load(); }}
                />
              )}
            </div>
          </div>
        </>
      )}

      {/* ── Delete confirmation modal ─────────────────────────────────────── */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="w-full max-w-md bg-card border border-rose-500/40 shadow-2xl overflow-hidden">
            {/* Top accent strip */}
            <div className="h-1 w-full bg-gradient-to-r from-rose-600 to-rose-400" />
            <div className="p-6 space-y-5">
              <div className="flex items-start gap-4">
                <div className="w-11 h-11 bg-rose-500/10 border border-rose-500/30 flex items-center justify-center flex-shrink-0">
                  <TrashIcon className="w-5 h-5 text-rose-400" />
                </div>
                <div>
                  <h3 className="text-sm font-black text-foreground uppercase tracking-widest">Delete Parent Account</h3>
                  <p className="text-xs text-muted-foreground mt-2 leading-relaxed">
                    You are about to permanently delete{' '}
                    <span className="text-foreground font-bold">{deleteTarget.full_name}</span>&apos;s account.
                    {deleteTarget.children.length > 0 && (
                      <> This will also unlink {deleteTarget.children.length} linked {deleteTarget.children.length === 1 ? 'child' : 'children'}.</>
                    )}{' '}
                    <span className="text-rose-400 font-bold">This action cannot be undone.</span>
                  </p>
                  {/* Child list */}
                  {deleteTarget.children.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-1">
                      {deleteTarget.children.map(c => (
                        <span key={c.id} className="text-[9px] px-2 py-0.5 bg-rose-500/10 border border-rose-500/20 text-rose-300 font-bold">
                          {c.full_name}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              <div className="flex gap-3 pt-1">
                <button
                  onClick={() => setDeleteTarget(null)}
                  className="flex-1 px-4 py-2.5 border border-border text-xs font-black uppercase tracking-widest text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-all"
                >
                  Cancel
                </button>
                <button
                  onClick={async () => {
                    await handleDeleteParent(deleteTarget);
                    setDeleteTarget(null);
                  }}
                  disabled={deleting === deleteTarget.id}
                  className="flex-1 px-4 py-2.5 bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white text-xs font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2"
                >
                  {deleting === deleteTarget.id
                    ? <><span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" /> Deleting…</>
                    : <><TrashIcon className="w-3.5 h-3.5" /> Delete Permanently</>}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
