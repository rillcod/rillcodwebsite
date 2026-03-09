'use client';

import { useState, useRef } from 'react';
import { useAuth } from '@/contexts/auth-context';
import { useRouter } from 'next/navigation';
import {
  ArrowUpTrayIcon, DocumentArrowDownIcon, CheckCircleIcon,
  ExclamationCircleIcon, XMarkIcon, UserGroupIcon,
} from '@heroicons/react/24/outline';
import Link from 'next/link';

interface ParsedStudent {
  full_name: string;
  student_email: string;
  parent_email?: string;
  parent_name?: string;
  parent_phone?: string;
  grade?: string;
  section?: string;
  enrollment_type: string;
  _row: number;
  _error?: string;
}

interface ImportResult {
  success: number;
  failed: number;
  errors: string[];
}

const REQUIRED_COLS = ['full_name', 'student_email'];
const ALL_COLS = ['full_name', 'student_email', 'parent_email', 'parent_name', 'parent_phone', 'grade', 'section', 'enrollment_type'];

function parseCSV(text: string): ParsedStudent[] {
  const lines = text.trim().split('\n').map(l => l.replace(/\r/g, ''));
  if (lines.length < 2) return [];
  const headers = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/\s+/g, '_'));
  return lines.slice(1).map((line, i) => {
    const vals = line.split(',').map(v => v.trim().replace(/^"|"$/g, ''));
    const row: any = { _row: i + 2, enrollment_type: 'school' };
    headers.forEach((h, idx) => { row[h] = vals[idx] ?? ''; });
    if (!row.full_name) row._error = 'Missing full_name';
    if (!row.student_email && !row.parent_email) row._error = 'Missing student_email or parent_email';
    return row as ParsedStudent;
  }).filter(r => r.full_name || r.student_email);
}

export default function ImportStudentsPage() {
  const { profile } = useAuth();
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [parsed, setParsed] = useState<ParsedStudent[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [fileName, setFileName] = useState('');

  const canImport = profile?.role === 'admin' || profile?.role === 'teacher' || profile?.role === 'school';

  function handleFile(file: File) {
    if (!file.name.endsWith('.csv')) {
      alert('Please upload a .csv file');
      return;
    }
    setFileName(file.name);
    setResult(null);
    const reader = new FileReader();
    reader.onload = e => {
      const text = e.target?.result as string;
      setParsed(parseCSV(text));
    };
    reader.readAsText(file);
  }

  function downloadTemplate() {
    const csv = [
      ALL_COLS.join(','),
      'John Doe,john@email.com,parent@email.com,Mr Doe,08012345678,Grade 7,7A,school',
      'Jane Smith,jane@email.com,,,,Grade 8,,school',
    ].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'students_template.csv'; a.click();
    URL.revokeObjectURL(url);
  }

  async function runImport() {
    const valid = parsed.filter(r => !r._error);
    if (!valid.length) return;
    setImporting(true);

    const results: ImportResult = { success: 0, failed: 0, errors: [] };

    // Batch import via API
    await Promise.all(
      valid.map(async (s) => {
        try {
          const res = await fetch('/api/students', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              full_name: s.full_name,
              student_email: s.student_email,
              parent_email: s.parent_email,
              parent_name: s.parent_name,
              parent_phone: s.parent_phone,
              grade: s.grade,
              enrollment_type: s.enrollment_type || 'school',
              school_name: profile?.school_name ?? '',
              school_id: (profile as any)?.school_id ?? null,
              status: 'pending',
            }),
          });
          if (res.ok) {
            results.success++;
          } else {
            const err = await res.json();
            results.failed++;
            results.errors.push(`Row ${s._row} (${s.full_name}): ${err.error ?? 'Failed'}`);
          }
        } catch {
          results.failed++;
          results.errors.push(`Row ${s._row} (${s.full_name}): Network error`);
        }
      })
    );

    setResult(results);
    setImporting(false);
    if (results.success > 0) setParsed([]);
  }

  if (!canImport) return (
    <div className="min-h-screen bg-[#0f0f1a] flex items-center justify-center">
      <p className="text-white/40">Access restricted.</p>
    </div>
  );

  const validRows = parsed.filter(r => !r._error);
  const errorRows = parsed.filter(r => r._error);

  return (
    <div className="min-h-screen bg-[#0f0f1a] px-4 py-6 md:px-8 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-8 flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-black text-white">Import Students</h1>
          <p className="text-white/40 text-sm mt-1">Upload a CSV to bulk-register students</p>
        </div>
        <Link href="/dashboard/students" className="text-white/40 hover:text-white text-sm transition-colors">
          ← Back to Students
        </Link>
      </div>

      {/* Template Download */}
      <div className="bg-violet-500/10 border border-violet-500/20 rounded-2xl p-4 mb-6 flex items-center justify-between gap-4 flex-wrap">
        <div>
          <p className="text-violet-300 font-bold text-sm">Need the CSV template?</p>
          <p className="text-violet-300/60 text-xs mt-0.5">
            Download the template with all required columns filled in.
          </p>
        </div>
        <button
          onClick={downloadTemplate}
          className="flex items-center gap-2 px-4 py-2 bg-violet-600 hover:bg-violet-500 text-white text-sm font-bold rounded-xl transition-colors flex-shrink-0"
        >
          <DocumentArrowDownIcon className="w-4 h-4" /> Download Template
        </button>
      </div>

      {/* Drop Zone */}
      <div
        onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={e => {
          e.preventDefault(); setIsDragging(false);
          const f = e.dataTransfer.files[0];
          if (f) handleFile(f);
        }}
        onClick={() => fileRef.current?.click()}
        className={`border-2 border-dashed rounded-2xl p-10 text-center cursor-pointer transition-all mb-6 ${isDragging ? 'border-violet-400 bg-violet-500/10' : 'border-white/10 hover:border-white/30 bg-white/2'}`}
      >
        <ArrowUpTrayIcon className={`w-10 h-10 mx-auto mb-3 ${isDragging ? 'text-violet-400' : 'text-white/20'}`} />
        <p className="text-white font-bold">{fileName || 'Drag & drop your CSV here'}</p>
        <p className="text-white/30 text-sm mt-1">or click to browse — .csv files only</p>
        <input ref={fileRef} type="file" accept=".csv" className="hidden"
          onChange={e => { if (e.target.files?.[0]) handleFile(e.target.files[0]); }} />
      </div>

      {/* Preview */}
      {parsed.length > 0 && (
        <div className="bg-[#0d1526] border border-white/10 rounded-2xl overflow-hidden mb-6">
          <div className="flex items-center justify-between p-5 border-b border-white/10">
            <div className="flex items-center gap-3">
              <UserGroupIcon className="w-5 h-5 text-white/40" />
              <span className="text-white font-bold">{parsed.length} rows parsed</span>
              {validRows.length > 0 && (
                <span className="text-xs bg-emerald-500/10 text-emerald-400 px-2 py-0.5 rounded-full font-bold">
                  {validRows.length} valid
                </span>
              )}
              {errorRows.length > 0 && (
                <span className="text-xs bg-rose-500/10 text-rose-400 px-2 py-0.5 rounded-full font-bold">
                  {errorRows.length} errors
                </span>
              )}
            </div>
            <button onClick={() => { setParsed([]); setFileName(''); }} className="text-white/30 hover:text-white">
              <XMarkIcon className="w-5 h-5" />
            </button>
          </div>
          <div className="overflow-x-auto max-h-64">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-[#0d1526]">
                <tr className="border-b border-white/10 text-white/40 uppercase tracking-wider">
                  <th className="text-left px-4 py-2">Row</th>
                  <th className="text-left px-4 py-2">Name</th>
                  <th className="text-left px-4 py-2">Email</th>
                  <th className="text-left px-4 py-2">Grade</th>
                  <th className="text-left px-4 py-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {parsed.map(r => (
                  <tr key={r._row} className={`border-b border-white/5 ${r._error ? 'bg-rose-500/5' : ''}`}>
                    <td className="px-4 py-2 text-white/30">{r._row}</td>
                    <td className="px-4 py-2 text-white">{r.full_name}</td>
                    <td className="px-4 py-2 text-white/60">{r.student_email}</td>
                    <td className="px-4 py-2 text-white/40">{r.grade ?? '—'}</td>
                    <td className="px-4 py-2">
                      {r._error
                        ? <span className="text-rose-400 flex items-center gap-1"><ExclamationCircleIcon className="w-3.5 h-3.5" />{r._error}</span>
                        : <span className="text-emerald-400 flex items-center gap-1"><CheckCircleIcon className="w-3.5 h-3.5" />OK</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {validRows.length > 0 && (
            <div className="p-4 border-t border-white/10">
              <button
                onClick={runImport}
                disabled={importing}
                className="w-full py-3 bg-[#7a0606] hover:bg-[#9a0808] disabled:opacity-50 text-white font-bold rounded-xl transition-colors"
              >
                {importing ? 'Importing...' : `Import ${validRows.length} Students`}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Result */}
      {result && (
        <div className={`rounded-2xl p-5 border ${result.failed === 0 ? 'bg-emerald-500/10 border-emerald-500/30' : 'bg-yellow-500/10 border-yellow-500/30'}`}>
          <div className="flex items-center gap-3 mb-3">
            <CheckCircleIcon className="w-6 h-6 text-emerald-400" />
            <p className="text-white font-bold">Import Complete</p>
          </div>
          <p className="text-white/60 text-sm">{result.success} students imported successfully.</p>
          {result.failed > 0 && <p className="text-rose-400 text-sm mt-1">{result.failed} failed.</p>}
          {result.errors.map((e, i) => (
            <p key={i} className="text-rose-400/60 text-xs mt-1 font-mono">{e}</p>
          ))}
          <div className="flex gap-3 mt-4">
            <Link href="/dashboard/students" className="px-4 py-2 bg-white/10 text-white text-sm font-bold rounded-xl hover:bg-white/20 transition-colors">
              View Students
            </Link>
            <Link href="/dashboard/approvals" className="px-4 py-2 bg-[#7a0606] text-white text-sm font-bold rounded-xl hover:bg-[#9a0808] transition-colors">
              Go to Approvals
            </Link>
          </div>
        </div>
      )}

      {/* Column reference */}
      <div className="mt-8 bg-[#0d1526] border border-white/10 rounded-2xl p-5">
        <h3 className="text-white/60 text-xs font-bold uppercase tracking-widest mb-3">CSV Column Reference</h3>
        <div className="grid grid-cols-2 gap-2">
          {ALL_COLS.map(col => (
            <div key={col} className="flex items-center gap-2">
              <span className={`text-[10px] px-1.5 py-0.5 rounded font-mono ${REQUIRED_COLS.includes(col) ? 'bg-rose-500/20 text-rose-400' : 'bg-white/5 text-white/40'}`}>
                {REQUIRED_COLS.includes(col) ? 'required' : 'optional'}
              </span>
              <span className="text-white/60 text-xs font-mono">{col}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
