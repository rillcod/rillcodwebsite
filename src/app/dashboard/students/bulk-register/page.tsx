// @refresh reset
'use client';

import { useState, useCallback, useEffect } from 'react';
import { useAuth } from '@/contexts/auth-context';
import { createClient } from '@/lib/supabase/client';
import { fetchClasses } from '@/services/dashboard.service';
import Link from 'next/link';
import {
  UserGroupIcon,
  CheckCircleIcon,
  ExclamationCircleIcon,
  PrinterIcon,
  ArrowUpTrayIcon,
  XMarkIcon,
  SparklesIcon,
  ClipboardDocumentListIcon,
  AcademicCapIcon,
  PlusIcon,
  ExclamationTriangleIcon,
  BuildingOffice2Icon,
  BookOpenIcon,
  ChevronDownIcon,
  DocumentArrowDownIcon,
  ArrowPathIcon,
  ArchiveBoxIcon,
  ClockIcon,
  TrashIcon,
  PencilIcon,
} from '@/lib/icons';

// ─── Class detection ─────────────────────────────────────────────────────────
//
// Recognises Nigerian school class codes wherever they appear in a line:
//   JSS1 · JSS2A · JSS 3B · SS1 · SS2C · SSS3 · BASIC 1 · BASIC 6A
//
const CLASS_RE = /\b(JSS\s*[123]|SS[S]?\s*[123]|BASIC\s*[1-6])([A-Za-z])?\b/i;

function detectClass(text: string): string | null {
  const m = text.match(CLASS_RE);
  if (!m) return null;
  const base = m[1].replace(/\s+/g, ' ').trim().toUpperCase();
  const section = (m[2] ?? '').toUpperCase();
  return base + section;
}

function isClassHeader(line: string): boolean {
  const clean = line.trim().replace(/[:\-–—.]/g, '').trim();
  return CLASS_RE.test(clean) && clean.replace(CLASS_RE, '').trim() === '';
}

function stripClass(name: string): string {
  return name.replace(CLASS_RE, '').replace(/\s{2,}/g, ' ').trim();
}

// ─── Name helpers ────────────────────────────────────────────────────────────

function extractFirstName(fullName: string): string {
  const t = fullName.trim();
  if (!t) return 'student';
  if (t.includes(' ')) {
    return t.split(/\s+/)[0].toLowerCase().replace(/[^a-z]/g, '') || 'student';
  }
  const camel = t.match(/^[A-Za-z]+?(?=[A-Z])/);
  if (camel) return camel[0].toLowerCase().replace(/[^a-z]/g, '') || 'student';
  return t.toLowerCase().replace(/[^a-z]/g, '') || 'student';
}

function generatePassword(): string {
  const digits = Math.floor(1000 + Math.random() * 9000);
  return `Rillcod@${digits}`;
}

/** Generate a unique and readable email including 3 random digits. */
function makeEmail(firstName: string, taken: Set<string>, skipEmail?: string): string {
  const base = firstName.toLowerCase().replace(/[^a-z0-9]/g, '') || 'student';
  const digits = Math.floor(100 + Math.random() * 900); // 3-digit suffix for better uniqueness
  let email = `${base}${digits}@rillcod.com`.toLowerCase();

  if (email === skipEmail?.toLowerCase() || !taken.has(email)) return email;

  let i = 2;
  while (taken.has(`${base}${digits}_${i}@rillcod.com`.toLowerCase()) && `${base}${digits}_${i}@rillcod.com`.toLowerCase() !== skipEmail?.toLowerCase()) i++;
  return `${base}${digits}_${i}@rillcod.com`.toLowerCase();
}

// ─── Core parser ─────────────────────────────────────────────────────────────

interface GeneratedStudent {
  id: number;          // stable key for React
  full_name: string;
  email: string;
  password: string;
  class_name?: string;
}

interface RegisterResult extends GeneratedStudent {
  status: 'created' | 'updated' | 'failed';
  error?: string;
  batch_id?: string;
}

interface School {
  id: string;
  name: string;
}

interface Programme {
  id: string;
  name: string;
}

interface ClassOption {
  id: string;
  name: string;
  section_class: string | null;
  school_id?: string | null;
  isRegistry?: boolean; // from teacher's class registry
}

// Standard Nigerian school class codes shown in every dropdown
const STANDARD_CLASSES: ClassOption[] = [
  { id: 'std-kg', name: 'Kindergarten (KG)', section_class: 'KG' },
  { id: 'std-b1', name: 'Basic 1', section_class: 'BASIC 1' },
  { id: 'std-b2', name: 'Basic 2', section_class: 'BASIC 2' },
  { id: 'std-b3', name: 'Basic 3', section_class: 'BASIC 3' },
  { id: 'std-b4', name: 'Basic 4', section_class: 'BASIC 4' },
  { id: 'std-b5', name: 'Basic 5', section_class: 'BASIC 5' },
  { id: 'std-b6', name: 'Basic 6', section_class: 'BASIC 6' },
  { id: 'std-jss1', name: 'JSS 1', section_class: 'JSS1' },
  { id: 'std-jss1a', name: 'JSS 1A', section_class: 'JSS1A' },
  { id: 'std-jss1b', name: 'JSS 1B', section_class: 'JSS1B' },
  { id: 'std-jss1c', name: 'JSS 1C', section_class: 'JSS1C' },
  { id: 'std-jss2', name: 'JSS 2', section_class: 'JSS2' },
  { id: 'std-jss2a', name: 'JSS 2A', section_class: 'JSS2A' },
  { id: 'std-jss2b', name: 'JSS 2B', section_class: 'JSS2B' },
  { id: 'std-jss2c', name: 'JSS 2C', section_class: 'JSS2C' },
  { id: 'std-jss3', name: 'JSS 3', section_class: 'JSS3' },
  { id: 'std-jss3a', name: 'JSS 3A', section_class: 'JSS3A' },
  { id: 'std-jss3b', name: 'JSS 3B', section_class: 'JSS3B' },
  { id: 'std-jss3c', name: 'JSS 3C', section_class: 'JSS3C' },
  { id: 'std-ss1', name: 'SS 1', section_class: 'SS1' },
  { id: 'std-ss1a', name: 'SS 1A', section_class: 'SS1A' },
  { id: 'std-ss1b', name: 'SS 1B', section_class: 'SS1B' },
  { id: 'std-ss1c', name: 'SS 1C', section_class: 'SS1C' },
  { id: 'std-ss2', name: 'SS 2', section_class: 'SS2' },
  { id: 'std-ss2a', name: 'SS 2A', section_class: 'SS2A' },
  { id: 'std-ss2b', name: 'SS 2B', section_class: 'SS2B' },
  { id: 'std-ss2c', name: 'SS 2C', section_class: 'SS2C' },
  { id: 'std-ss3', name: 'SS 3', section_class: 'SS3' },
  { id: 'std-ss3a', name: 'SS 3A', section_class: 'SS3A' },
  { id: 'std-ss3b', name: 'SS 3B', section_class: 'SS3B' },
  { id: 'std-ss3c', name: 'SS 3C', section_class: 'SS3C' },
  { id: 'std-sss1', name: 'SSS 1', section_class: 'SSS1' },
  { id: 'std-sss2', name: 'SSS 2', section_class: 'SSS2' },
  { id: 'std-sss3', name: 'SSS 3', section_class: 'SSS3' },
];

let _idCounter = 0;
function nextId() { return ++_idCounter; }

function buildStudentList(rawLines: string[], fallbackClass?: string): GeneratedStudent[] {
  const usedEmails = new Set<string>();
  const usedNames = new Map<string, number>(); // track name counts for batch-level uniqueness
  const students: GeneratedStudent[] = [];
  let contextClass: string | null = null;

  for (const raw of rawLines) {
    const line = raw.trim();
    if (!line) continue;

    if (isClassHeader(line)) {
      contextClass = detectClass(line);
      continue;
    }

    const inlineClass = detectClass(line);
    let namePart = inlineClass ? stripClass(line) : line;
    if (!namePart) continue;

    // Handle duplicate names in the batch by adding a small ID suffix if needed
    const nameKey = namePart.toLowerCase();
    const count = usedNames.get(nameKey) || 0;
    usedNames.set(nameKey, count + 1);
    if (count > 0) {
      namePart = `${namePart} #${count + 1}`;
    }

    // Priority: inline class > header context > fallback default class
    const resolvedClass = inlineClass ?? contextClass ?? (fallbackClass ? (detectClass(fallbackClass) || fallbackClass.trim().toUpperCase()) || undefined : undefined);
    const first = extractFirstName(namePart);
    const email = makeEmail(first, usedEmails);
    usedEmails.add(email);

    students.push({ id: nextId(), full_name: namePart, email, password: generatePassword(), class_name: resolvedClass || undefined });
  }
  return students;
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function BulkRegisterPage() {
  const { profile, loading: authLoading } = useAuth();
  const supabase = createClient();

  const [namesText, setNamesText] = useState('');
  const [preview, setPreview] = useState<GeneratedStudent[]>([]);
  const [registering, setRegistering] = useState(false);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [results, setResults] = useState<RegisterResult[] | null>(null);
  const [registerProgress, setRegisterProgress] = useState<{ done: number; total: number; current: string } | null>(null);
  const [step, setStep] = useState<'input' | 'preview' | 'done' | 'registry'>('input');

  // ── Batch Settings ───────────────────────────────────────────────────────
  const [schools, setSchools] = useState<School[]>([]);
  const [programmes, setProgrammes] = useState<Programme[]>([]);
  const [classOptions, setClassOptions] = useState<ClassOption[]>(STANDARD_CLASSES); // standard codes
  const [registryClasses, setRegistryClasses] = useState<ClassOption[]>([]); // teacher's created classes

  const [selectedSchoolId, setSelectedSchoolId] = useState('');
  const [selectedSchoolName, setSelectedSchoolName] = useState('');
  const [selectedProgramId, setSelectedProgramId] = useState('');
  const [selectedRegistryClass, setSelectedRegistryClass] = useState(''); // class id
  const [defaultClass, setDefaultClass] = useState(''); // fallback class code
  const [customBatchName, setCustomBatchName] = useState(''); // free-text name label
  const [settingsOpen, setSettingsOpen] = useState(true);
  const [hasRecoverable, setHasRecoverable] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [history, setHistory] = useState<any[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [selectedBatchId, setSelectedBatchId] = useState<string | null>(null);
  const [batchResults, setBatchResults] = useState<any[]>([]);
  const [editingResultId, setEditingResultId] = useState<string | null>(null);
  const [editingBatchId, setEditingBatchId] = useState<string | null>(null);

  useEffect(() => {
    const saved = sessionStorage.getItem('last_bulk_reg');
    if (saved) setHasRecoverable(true);
  }, []);

  const fetchHistory = useCallback(async () => {
    setLoadingHistory(true);
    const { data, error } = await (supabase as any)
      .from('registration_batches')
      .select('*')
      .order('created_at', { ascending: false });
    if (!error && data) setHistory(data);
    setLoadingHistory(false);
  }, [supabase]);

  const loadBatch = async (batchId: string) => {
    setLoadingHistory(true);
    const { data, error } = await (supabase as any)
      .from('registration_results')
      .select('*')
      .eq('batch_id', batchId);
    if (!error && data) {
      setResults(data as any);
      setStep('done');
      setShowHistory(false);
    }
    setLoadingHistory(false);
  };

  const handleDeleteBatch = async (batchId: string) => {
    if (!confirm('Delete this batch permanently? This will remove all student registration history for this session.')) return;
    setLoadingHistory(true);
    try {
      // 1. Delete results first (if no cascade)
      await (supabase as any).from('registration_results').delete().eq('batch_id', batchId);
      // 2. Delete batch metadata
      const { error } = await (supabase as any).from('registration_batches').delete().eq('id', batchId);

      if (error) throw error;

      setHistory(prev => prev.filter(b => b.id !== batchId));
    } catch (err: any) {
      alert('Delete failed: ' + err.message);
    } finally {
      setLoadingHistory(false);
    }
  };

  const recoverLastBatch = () => {
    const saved = sessionStorage.getItem('last_bulk_reg');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        setResults(parsed.results);
        setStep('done');
      } catch (e) {
        sessionStorage.removeItem('last_bulk_reg');
        setHasRecoverable(false);
      }
    }
  };

  const isAdmin = profile?.role === 'admin';

  /**
   * The fallback class code applied to students whose names don't contain a class:
   * - Registry class section_class takes priority if selected
   * - Otherwise the manually picked standard code is used
   * Both fields can be set independently; registry class wins if both are filled
   */
  const effectiveClassCode = (() => {
    if (customBatchName.trim()) return customBatchName.trim();
    if (selectedRegistryClass) {
      const rc = registryClasses.find((c) => c.id === selectedRegistryClass);
      return rc?.section_class || rc?.name || '';
    }
    return defaultClass;
  })();

  const filteredRegistryClasses = registryClasses.filter(c =>
    !selectedSchoolId || c.school_id === selectedSchoolId
  );

  // Clear registry class if it's no longer valid for the selected school
  useEffect(() => {
    if (selectedRegistryClass && !filteredRegistryClasses.some(c => c.id === selectedRegistryClass)) {
      setSelectedRegistryClass('');
    }
  }, [selectedSchoolId, filteredRegistryClasses, selectedRegistryClass]);

  const canAccess = profile?.role === 'admin' || profile?.role === 'teacher';

  // ── Load schools and programmes ──────────────────────────────────────────
  useEffect(() => {
    if (!profile || !canAccess) return;

    async function loadData() {
      // Load registry classes via shared service (has fallback on RLS errors)
      const teacherId = profile?.role === 'teacher' ? profile?.id : undefined;
      const clsData = await fetchClasses(teacherId, undefined);
      setRegistryClasses(clsData.map((c: any) => ({
        id: c.id,
        name: c.name,
        section_class: c.section_class ?? null,
        school_id: c.school_id ?? null,
        isRegistry: true
      })));

      if (profile?.role === 'admin') {
        // Admin sees all approved schools
        const { data } = await supabase
          .from('schools')
          .select('id, name')
          .eq('status', 'approved')
          .order('name');
        setSchools(data ?? []);
      } else if (profile?.role === 'teacher') {
        // Teacher: load only their allocated schools
        const schoolMap = new Map<string, string>(); // id → name

        // 1. Primary school from teacher's own profile
        if (profile.school_id) {
          const { data: primarySchool } = await supabase
            .from('schools')
            .select('id, name')
            .eq('id', profile.school_id)
            .single();
          if (primarySchool?.id) schoolMap.set(primarySchool.id, primarySchool.name);
        }

        // 2. Additional schools from teacher_schools junction table
        const { data: ts } = await supabase
          .from('teacher_schools')
          .select('school_id, schools(id, name)')
          .eq('teacher_id', profile.id);
        (ts ?? []).forEach((r: any) => {
          if (r.schools?.id) schoolMap.set(r.schools.id, r.schools.name);
        });

        const sorted = [...schoolMap.entries()]
          .map(([id, name]) => ({ id, name }))
          .sort((a, b) => a.name.localeCompare(b.name));
        setSchools(sorted);

        // Auto-select if teacher only has one school
        if (sorted.length === 1 && !selectedSchoolId) {
          setSelectedSchoolId(sorted[0].id);
          setSelectedSchoolName(sorted[0].name);
        }
      }

      // Load programmes
      const { data: progs } = await supabase
        .from('programs')
        .select('id, name')
        .order('name');
      setProgrammes(progs ?? []);
    }

    loadData().catch(console.error);
  }, [profile?.id, profile?.role, canAccess]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Detect duplicate emails in the current preview ───────────────────────
  function dupEmails(rows: GeneratedStudent[]): Set<string> {
    const seen = new Map<string, number>();
    rows.forEach((r) => seen.set(r.email.toLowerCase(), (seen.get(r.email.toLowerCase()) ?? 0) + 1));
    const dups = new Set<string>();
    seen.forEach((count, email) => { if (count > 1) dups.add(email); });
    return dups;
  }

  // ── Editable preview actions ──────────────────────────────────────────────

  /** Update a single field on one row. */
  function updateField(id: number, field: keyof GeneratedStudent, value: string) {
    setPreview((prev) => prev.map((r) => r.id === id ? { ...r, [field]: value } : r));
  }

  /**
   * On name blur: if the email still looks auto-generated (@rillcod.com),
   * regenerate it from the new first name, avoiding collisions with other rows.
   */
  function onNameBlur(id: number, newName: string) {
    setPreview((prev) => {
      const row = prev.find((r) => r.id === id);
      if (!row) return prev;
      // Only auto-update email if user hasn't customised it away from @rillcod.com
      if (!row.email.endsWith('@rillcod.com')) return prev;

      const takenByOthers = new Set(prev.filter((r) => r.id !== id).map((r) => r.email.toLowerCase()));
      const first = extractFirstName(newName);
      const newEmail = makeEmail(first, takenByOthers);
      return prev.map((r) => r.id === id ? { ...r, full_name: newName, email: newEmail } : r);
    });
  }

  /**
   * On class blur: normalise the typed value if it matches a known class pattern.
   * Freeform text (e.g. "Grade 7") is kept as-is.
   */
  function onClassBlur(id: number, raw: string) {
    const normalised = (detectClass(raw) ?? raw.trim().toUpperCase()) || undefined;
    setPreview((prev) => prev.map((r) => r.id === id ? { ...r, class_name: normalised || undefined } : r));
  }

  function removeRow(id: number) {
    setPreview((prev) => prev.filter((r) => r.id !== id));
  }

  function addRow() {
    setPreview((prev) => [
      ...prev,
      { id: nextId(), full_name: '', email: '', password: generatePassword(), class_name: undefined },
    ]);
  }

  // ── Build preview ────────────────────────────────────────────────────────
  const handlePreview = useCallback(() => {
    // Use only the standard class code (defaultClass) as the fallback arm label.
    // The registry class (Hilltop etc.) is an internal grouping — it must NOT
    // bleed into the printed credentials or the class_name field.
    const built = buildStudentList(namesText.split('\n'), defaultClass.trim() || undefined);
    if (!built.length) return;
    setPreview(built);
    setStep('preview');
  }, [namesText, defaultClass]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Register ─────────────────────────────────────────────────────────────
  const handleRegister = async () => {
    const valid = preview.filter((s) => s.full_name.trim() && s.email.trim());
    if (!valid.length) return;
    setRegistering(true);
    setRegisterProgress({ done: 0, total: valid.length, current: valid[0]?.full_name ?? '' });

    // Generate UUID for this batch to link results in DB
    const persistentBatchId = crypto.randomUUID();

    try {
      const BATCH = 10;
      const allResults: RegisterResult[] = [];
      for (let i = 0; i < valid.length; i += BATCH) {
        const batch = valid.slice(i, i + BATCH);
        setRegisterProgress({ done: i, total: valid.length, current: batch[0]?.full_name ?? '' });

        const body: Record<string, any> = {
          batch_id: persistentBatchId,
          students: batch,
          class_id: selectedRegistryClass || null,
          class_name: effectiveClassCode || null
        };
        if (selectedSchoolId) {
          body.school_id = selectedSchoolId;
          body.school_name = selectedSchoolName;
        }
        if (selectedProgramId) body.program_id = selectedProgramId;

        const res = await fetch('/api/students/bulk-register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Registration failed');
        allResults.push(...(data.results ?? []));
      }
      setResults(allResults);
      sessionStorage.setItem('last_bulk_reg', JSON.stringify({ results: allResults, date: new Date().toISOString() }));
      setHasRecoverable(true);
      
      // Auto-switch directly to Execution Vault (History) after successful registration
      await fetchHistory();
      setStep('registry');
      setShowHistory(true);
      
    } catch (err: any) {
      alert(err.message);
    } finally {
      setRegistering(false);
      setRegisterProgress(null);
    }
  };

  const handleReset = () => {
    if (confirm('Are you sure? This will clear the current results.')) {
      setNamesText(''); setPreview([]); setResults(null); setStep('input');
    }
  };

  const downloadCSV = () => {
    if (!results) return;
    const headers = ['Full Name', 'Email', 'Password', 'Class', 'Status', 'Error'];
    const rows = results.map(r => [
      `"${r.full_name.replace(/"/g, '""')}"`,
      `"${r.email}"`,
      `"${r.password}"`,
      `"${r.class_name || effectiveClassCode || ''}"`,
      `"${r.status}"`,
      `"${(r.error || '').replace(/"/g, '""')}"`
    ]);
    const fetchContent = [headers, ...rows].map(e => e.join(',')).join('\n');
    const blob = new Blob([fetchContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `rillcod_students_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleUpdateResults = async () => {
    if (!results) return;
    setLoading(true);
    try {
      const res = await fetch('/api/students/bulk-register', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ results }),
      });
      if (!res.ok) throw new Error('Failed to update records');
      setSuccess('Records updated in both Official Registry and Portal Accounts!');
      setTimeout(() => setSuccess(null), 3000);
    } catch (err: any) {
      alert(err.message);
    } finally {
      setLoading(false);
    }
  };

  // ─── Guards ──────────────────────────────────────────────────────────────
  if (authLoading || !profile) return (
    <div className="min-h-screen bg-[#0f0f1a] flex items-center justify-center">
      <div className="w-10 h-10 border-4 border-violet-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );
  if (!canAccess) return (
    <div className="min-h-screen bg-[#0f0f1a] flex items-center justify-center">
      <p className="text-white/40">Access restricted to admins and teachers.</p>
    </div>
  );

  const dups = dupEmails(preview);
  const incompleteRows = preview.filter((r) => !r.full_name.trim() || !r.email.trim());
  const validCount = preview.length - incompleteRows.length;
  const previewClasses = [...new Set(preview.map((s) => s.class_name).filter(Boolean))];

  const successCount = results?.filter((r) => r.status !== 'failed').length ?? 0;
  const failCount = results?.filter((r) => r.status === 'failed').length ?? 0;

  const selectedProgLabel = programmes.find((p) => p.id === selectedProgramId)?.name ?? '';

  // Shared input class
  const inp = 'w-full bg-transparent border border-white/10 rounded-lg px-2 py-1.5 text-white text-xs focus:outline-none focus:border-violet-500/60 focus:bg-violet-500/5 transition-colors placeholder-white/20';

  return (
    <>
      {/* ── Print-only styles ──────────────────────────────────────────── */}
      <style>{`
        @media print {
          body * { display: none !important; }
          #printable-sheet, #printable-sheet * { display: block !important; }
          #printable-sheet table, #printable-sheet table * { display: table !important; }
          #printable-sheet tr, #printable-sheet tr * { display: table-row !important; }
          #printable-sheet td, #printable-sheet td * { display: table-cell !important; }
          #printable-sheet th, #printable-sheet th * { display: table-header-group !important; }
          #printable-sheet {
            position: absolute; inset: 0; background: #fff; color: #000; padding: 24px;
            display: block !important;
          }
          #printable-sheet h2  { font-size: 18px; font-weight: 800; margin-bottom: 4px; }
          #printable-sheet p   { font-size: 12px; margin-bottom: 16px; color: #555; }
          #printable-sheet table { width: 100%; border-collapse: collapse; font-size: 11px; }
          #printable-sheet th  { background: #1a1a2e !important; color: #fff !important; -webkit-print-color-adjust: exact; padding: 7px 9px; text-align: left; font-weight: 700; }
          #printable-sheet td  { border-bottom: 1px solid #e5e7eb; padding: 6px 9px; color: #111; }
          #printable-sheet tr:nth-child(even) td { background: #f9fafb !important; -webkit-print-color-adjust: exact; }
          #printable-sheet .cls-badge { background: #cffafe !important; color: #0e7490 !important; padding: 1px 6px; border-radius: 9999px; font-size: 10px; font-weight: 700; }
          #printable-sheet .badge-ok  { background: #d1fae5 !important; color: #065f46 !important; padding: 2px 8px; border-radius: 9999px; font-size: 10px; font-weight: 700; }
          #printable-sheet .badge-fail{ background: #fee2e2 !important; color: #991b1b !important; padding: 2px 8px; border-radius: 9999px; font-size: 10px; font-weight: 700; }
          #printable-sheet .footer-note { margin-top: 20px; font-size: 10px; color: #888; border-top: 1px solid #e5e7eb; padding-top: 10px; }
          @page { margin: 1cm; size: auto; }
        }
      `}</style>

      <div className="min-h-screen bg-[#0f0f1a] px-4 py-6 md:px-8 max-w-6xl mx-auto">

        {/* ── Header ─────────────────────────────────────────────────── */}
        {/* ── Header ─────────────────────────────────────────────────── */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-10 gap-6">
          <div>
            <h1 className="text-3xl font-black text-white flex items-center gap-3 italic uppercase tracking-tighter">
              <SparklesIcon className="w-8 h-8 text-violet-400" />
              Institutional Registry
            </h1>
            <p className="text-white/40 text-[10px] uppercase font-black tracking-[0.2em] mt-1 ml-1">
              Bulk Distribution & Archive Management
            </p>
          </div>
          
          <div className="flex bg-white/5 p-1 rounded-2xl border border-white/10 shadow-2xl overflow-hidden shrink-0 self-start sm:self-center">
            <button 
              onClick={() => { setStep('input'); setShowHistory(false); }}
              className={`px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${(!showHistory && step !== 'registry') ? 'bg-[#7a0606] text-white shadow-lg' : 'text-white/40 hover:text-white hover:bg-white/5'}`}
            >
              New Registration
            </button>
            <button 
              onClick={() => { setShowHistory(true); setStep(step === 'done' || step === 'preview' ? step : 'input'); fetchHistory(); }}
              className={`px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${showHistory ? 'bg-cyan-600 text-white shadow-lg' : 'text-white/40 hover:text-white hover:bg-white/5'}`}
            >
              Official Vault
            </button>
          </div>
        </div>

        {/* ── Step indicator ─────────────────────────────────────────── */}
        <div className="flex items-center gap-2 mb-8 text-xs font-bold flex-wrap">
          {(['input', 'preview', 'done', 'registry'] as const).map((s, i) => {
            const labels = ['1. Enter Names', '2. Edit & Register', '3. Results/Print', '4. Official Registry'];
            const active = step === s;
            const steps = ['input', 'preview', 'done', 'registry'];
            const done = steps.indexOf(step) > i;
            return (
              <button 
                key={s} 
                onClick={() => {
                  if (s === 'registry') {
                    setStep('registry');
                    fetchHistory();
                  } else if (done || active) {
                    setStep(s);
                  }
                }}
                className="flex items-center gap-2"
              >
                {i > 0 && <div className="w-8 h-px bg-white/10" />}
                <span className={`px-3 py-1 rounded-full transition-colors ${active ? 'bg-violet-600 text-white' : done ? 'bg-emerald-600/30 text-emerald-400' : 'bg-white/5 text-white/30'}`}>
                  {labels[i]}
                </span>
              </button>
            );
          })}
        </div>

        {/* ══════════════════ STEP 1 — INPUT ══════════════════════════ */}
        {step === 'input' && (
          <div className="space-y-6">

            {/* ── Batch Settings ──────────────────────────────────── */}
            <div className="bg-[#0d1526] border border-white/10 rounded-2xl overflow-hidden">
              <button
                onClick={() => setSettingsOpen((o) => !o)}
                className="w-full flex items-center justify-between px-6 py-4 text-left hover:bg-white/[0.02] transition-colors"
              >
                <div className="flex items-center gap-2 text-white/70 font-bold text-sm">
                  <BuildingOffice2Icon className="w-4 h-4 text-violet-400" />
                  Batch Settings
                  <span className="text-white/30 font-normal text-xs ml-1">— school, programme &amp; default class</span>
                </div>
                <ChevronDownIcon className={`w-4 h-4 text-white/30 transition-transform ${settingsOpen ? 'rotate-180' : ''}`} />
              </button>

              {settingsOpen && (
                <div className="px-4 sm:px-6 pb-6 pt-3 border-t border-white/10 space-y-5">

                  {/* Row 1: School + Programme */}
                  <div className={`grid gap-5 ${schools.length > 0 ? 'sm:grid-cols-2' : 'grid-cols-1'}`}>

                    {/* School — admin (all schools) or teacher (their allocated schools) */}
                    {schools.length > 0 && (
                      <div>
                        <label className="block text-white/50 text-xs font-bold uppercase tracking-widest mb-2 flex items-center gap-1.5">
                          <BuildingOffice2Icon className="w-3.5 h-3.5" /> School
                          {!isAdmin && <span className="text-violet-400/60 normal-case font-normal text-[10px] ml-1">(your allocated schools)</span>}
                        </label>
                        <select
                          value={selectedSchoolId}
                          onChange={(e) => {
                            const opt = e.target.options[e.target.selectedIndex];
                            setSelectedSchoolId(e.target.value);
                            setSelectedSchoolName(e.target.value ? opt.text : '');
                          }}
                          className="w-full px-3 py-2.5 bg-white/5 border border-white/10 rounded-xl text-sm text-white focus:outline-none focus:border-violet-500/50 transition-colors"
                        >
                          <option value="">— Select a school —</option>
                          {schools.map((s) => (
                            <option key={s.id} value={s.id}>{s.name}</option>
                          ))}
                        </select>
                        <p className="text-white/25 text-[11px] mt-1.5">
                          {selectedSchoolId ? `Students will be assigned to ${selectedSchoolName}.` : 'Select the school to register students into.'}
                        </p>
                      </div>
                    )}

                    {/* Programme */}
                    <div>
                      <label className="block text-white/50 text-xs font-bold uppercase tracking-widest mb-2 flex items-center gap-1.5">
                        <BookOpenIcon className="w-3.5 h-3.5" /> Programme
                      </label>
                      <select
                        value={selectedProgramId}
                        onChange={(e) => setSelectedProgramId(e.target.value)}
                        className="w-full px-3 py-2.5 bg-white/5 border border-white/10 rounded-xl text-sm text-white focus:outline-none focus:border-violet-500/50 transition-colors"
                      >
                        <option value="">— No auto-enrolment —</option>
                        {programmes.map((p) => (
                          <option key={p.id} value={p.id}>{p.name}</option>
                        ))}
                      </select>
                      <p className="text-white/25 text-[11px] mt-1.5">
                        {selectedProgramId
                          ? `Auto-enrolled into "${selectedProgLabel}" after registration.`
                          : 'Leave blank to skip auto-enrolment.'}
                      </p>
                    </div>
                  </div>

                  {/* Divider */}
                  <div className="border-t border-white/5" />

                  {/* Row 2: Registry class (primary) + Standard code fallback */}
                  <div className="sm:grid sm:grid-cols-2 gap-5 space-y-5 sm:space-y-0">

                    {/* Teacher's created class — primary class assignment */}
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="text-white/50 text-xs font-bold uppercase tracking-widest flex items-center gap-1.5">
                          <AcademicCapIcon className="w-3.5 h-3.5" />
                          My Class <span className="text-cyan-400/70 ml-1 normal-case font-normal">(from class registry)</span>
                        </label>
                        <Link
                          href="/dashboard/classes/add"
                          className="flex items-center gap-1 px-2 py-0.5 bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-500/20 rounded-lg text-cyan-400 text-[10px] font-bold transition-colors"
                          title="Create a new class"
                        >
                          <PlusIcon className="w-3 h-3" /> New Class
                        </Link>
                      </div>
                      <p className="text-white/25 text-[11px] mb-2">
                        Pick one of your created classes — registered students will be placed in it.
                      </p>
                      {filteredRegistryClasses.length > 0 ? (
                        <select
                          value={selectedRegistryClass}
                          onChange={(e) => setSelectedRegistryClass(e.target.value)}
                          disabled={!selectedSchoolId}
                          className="w-full px-3 py-2.5 bg-cyan-500/5 border border-cyan-500/20 rounded-xl text-sm text-white focus:outline-none focus:border-cyan-500/50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          <option value="">— No class selected —</option>
                          {filteredRegistryClasses.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.name}{c.section_class ? ` (${c.section_class})` : ''}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <div className="px-3 py-2.5 bg-white/3 border border-white/8 rounded-xl text-white/25 text-sm italic">
                          {!selectedSchoolId ? 'Select a school first.' : 'No classes found for this school.'}
                        </div>
                      )}
                      {selectedRegistryClass && (() => {
                        const rc = filteredRegistryClasses.find((c) => c.id === selectedRegistryClass);
                        return rc ? (
                          <p className="text-cyan-400/70 text-[11px] mt-1.5">
                            Students will be tagged as <span className="font-mono font-bold">{rc.section_class ?? rc.name}</span>
                          </p>
                        ) : null;
                      })()}
                    </div>

                    {/* Fallback standard class code */}
                    <div>
                      <label className="block text-white/50 text-xs font-bold uppercase tracking-widest mb-1 flex items-center gap-1.5">
                        <AcademicCapIcon className="w-3.5 h-3.5" />
                        Default Class / Arm <span className="text-white/30 normal-case font-normal ml-1">(optional)</span>
                      </label>
                      <p className="text-white/25 text-[11px] mb-2">
                        Select a class or arm — students without an inline class will be placed here (e.g. JSS2A, SS1B).
                      </p>
                      <select
                        value={defaultClass}
                        onChange={(e) => setDefaultClass(e.target.value)}
                        className="w-full px-3 py-2.5 bg-white/5 border border-white/10 rounded-xl text-sm text-white focus:outline-none focus:border-violet-500/50 transition-colors"
                      >
                        <option value="">— No default code —</option>
                        <optgroup label="Primary School">
                          {classOptions.filter((c) => c.id.startsWith('std-kg') || c.id.startsWith('std-b')).map((c) => (
                            <option key={c.id} value={c.section_class ?? c.name}>{c.name}</option>
                          ))}
                        </optgroup>
                        <optgroup label="Junior Secondary (JSS)">
                          {classOptions.filter((c) => c.id.startsWith('std-jss')).map((c) => (
                            <option key={c.id} value={c.section_class ?? c.name}>{c.name}</option>
                          ))}
                        </optgroup>
                        <optgroup label="Senior Secondary (SS / SSS)">
                          {classOptions.filter((c) => c.id.startsWith('std-ss')).map((c) => (
                            <option key={c.id} value={c.section_class ?? c.name}>{c.name}</option>
                          ))}
                        </optgroup>
                      </select>
                      {defaultClass && !selectedRegistryClass && (
                        <p className="text-emerald-400/60 text-[11px] mt-1.5">
                          Students will be placed in <span className="font-mono font-bold">{defaultClass}</span>.
                        </p>
                      )}
                      {selectedRegistryClass && defaultClass && (
                        <p className="text-white/25 text-[11px] mt-1.5 italic">Registry class takes priority — this code is a secondary fallback.</p>
                      )}
                    </div>

                  </div>

                  {/* Effective class preview */}
                  {effectiveClassCode && (
                    <div className="flex items-center gap-2 text-xs">
                      <span className="text-white/30">Students without inline class will be tagged:</span>
                      <span className="px-2 py-0.5 bg-cyan-500/15 text-cyan-300 font-mono font-bold rounded-full border border-cyan-500/20">
                        {effectiveClassCode}
                      </span>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* ── Names textarea ──────────────────────────────────── */}
            <div className="bg-[#0d1526] border border-white/10 rounded-2xl p-6">
              <label className="block text-white/60 text-xs font-bold uppercase tracking-widest mb-3">
                Student Names — one per line
              </label>
              <textarea
                value={namesText}
                onChange={(e) => setNamesText(e.target.value)}
                rows={24}
                placeholder={
                  `JSS2A
ChukwuemekaOkonkwo
Adaeze Nwosu
John Doe

SS2B
FatimaAbdullahi
EmekaChibuzo

BASIC 1
Tolu Adesanya

Ngozi Okonkwo JSS3B
Yusuf Ibrahim SS1A`}
                className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-sm text-white placeholder-white/20 resize-none focus:outline-none focus:border-violet-500/50 transition-colors font-mono leading-relaxed"
              />
              <p className="text-white/30 text-xs mt-2">
                You can correct any mistakes in the next step — every field is editable before you register.
              </p>
            </div>

            <div className="grid md:grid-cols-2 gap-4">
              <div className="bg-violet-500/10 border border-violet-500/20 rounded-2xl p-5">
                <h3 className="text-violet-300 font-bold text-sm mb-3 flex items-center gap-2">
                  <ClipboardDocumentListIcon className="w-4 h-4" /> How names work
                </h3>
                <ul className="space-y-1.5 text-violet-300/70 text-xs list-disc list-inside">
                  <li>With space: <span className="font-mono bg-violet-500/20 px-1 rounded">John Doe</span></li>
                  <li>Joined: <span className="font-mono bg-violet-500/20 px-1 rounded">JohnDoe</span></li>
                  <li>CamelCase: <span className="font-mono bg-violet-500/20 px-1 rounded">ChukwuemekaOkonkwo</span></li>
                  <li>First name → <span className="font-mono bg-violet-500/20 px-1 rounded">firstname@rillcod.com</span></li>
                  <li>Edit anything in the next step before registering</li>
                </ul>
              </div>
              <div className="bg-cyan-500/10 border border-cyan-500/20 rounded-2xl p-5">
                <h3 className="text-cyan-300 font-bold text-sm mb-3 flex items-center gap-2">
                  <AcademicCapIcon className="w-4 h-4" /> How classes work
                </h3>
                <ul className="space-y-1.5 text-cyan-300/70 text-xs list-disc list-inside">
                  <li>Header line: <span className="font-mono bg-cyan-500/20 px-1 rounded">JSS2A</span> — applies to names below</li>
                  <li>Inline: <span className="font-mono bg-cyan-500/20 px-1 rounded">John Doe SS2B</span></li>
                  <li>Supported: <span className="font-mono bg-cyan-500/20 px-1 rounded">JSS1–3 · SS1–3 · SSS1–3 · BASIC 1–6</span></li>
                  <li>Section letters OK: <span className="font-mono bg-cyan-500/20 px-1 rounded">JSS2A · SS1C</span></li>
                  <li>Fallback: use the <em>Default Class</em> setting above</li>
                </ul>
              </div>
            </div>

            <button
              onClick={handlePreview}
              disabled={!namesText.trim()}
              className="w-full py-3.5 bg-violet-600 hover:bg-violet-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold rounded-xl transition-colors text-sm"
            >
              Continue to Review →
            </button>
          </div>
        )}

        {/* ══════════════════ STEP 2 — EDITABLE PREVIEW ═══════════════ */}
        {step === 'preview' && (
          <div className="space-y-5">

            {/* Batch settings summary */}
            {(selectedSchoolId || selectedProgramId || defaultClass) && (
              <div className="flex flex-wrap gap-2 text-xs">
                {selectedSchoolId && (
                  <span className="flex items-center gap-1.5 px-3 py-1.5 bg-violet-500/10 border border-violet-500/20 rounded-full text-violet-300">
                    <BuildingOffice2Icon className="w-3.5 h-3.5" />
                    {selectedSchoolName || 'Selected school'}
                  </span>
                )}
                {selectedProgramId && (
                  <span className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-500/10 border border-emerald-500/20 rounded-full text-emerald-300">
                    <BookOpenIcon className="w-3.5 h-3.5" />
                    Auto-enrol: {selectedProgLabel}
                  </span>
                )}
                {effectiveClassCode && (
                  <span className="flex items-center gap-1.5 px-3 py-1.5 bg-cyan-500/10 border border-cyan-500/20 rounded-full text-cyan-300 font-mono">
                    <AcademicCapIcon className="w-3.5 h-3.5" />
                    Class: {effectiveClassCode}
                  </span>
                )}
              </div>
            )}

            {/* Stats bar */}
            <div className="flex flex-wrap gap-3">
              <div className="flex items-center gap-2 px-4 py-2 bg-white/5 rounded-xl border border-white/10 text-sm">
                <UserGroupIcon className="w-4 h-4 text-violet-400" />
                <span className="text-white font-bold">{preview.length}</span>
                <span className="text-white/40">students</span>
              </div>
              {previewClasses.length > 0 && (
                <div className="flex items-center gap-2 px-4 py-2 bg-cyan-500/10 rounded-xl border border-cyan-500/20 text-sm">
                  <AcademicCapIcon className="w-4 h-4 text-cyan-400" />
                  <span className="text-cyan-300 font-bold">{previewClasses.length}</span>
                  <span className="text-cyan-300/60 text-xs">class{previewClasses.length !== 1 ? 'es' : ''}:</span>
                  <span className="text-cyan-300 font-mono text-xs">{previewClasses.join(' · ')}</span>
                </div>
              )}
              {dups.size > 0 && (
                <div className="flex items-center gap-2 px-4 py-2 bg-rose-500/10 rounded-xl border border-rose-500/20 text-xs">
                  <ExclamationTriangleIcon className="w-4 h-4 text-rose-400" />
                  <span className="text-rose-400 font-bold">Duplicate emails — fix before registering</span>
                </div>
              )}
              {incompleteRows.length > 0 && (
                <div className="flex items-center gap-2 px-4 py-2 bg-amber-500/10 rounded-xl border border-amber-500/20 text-xs">
                  <ExclamationTriangleIcon className="w-4 h-4 text-amber-400" />
                  <span className="text-amber-400">{incompleteRows.length} row{incompleteRows.length !== 1 ? 's' : ''} incomplete (will be skipped)</span>
                </div>
              )}
            </div>

            {/* Editable table */}
            <div className="bg-[#0d1526] border border-white/10 rounded-2xl overflow-hidden">
              <div className="flex items-center justify-between px-5 py-3.5 border-b border-white/10">
                <p className="text-white/60 text-xs font-bold uppercase tracking-widest">
                  Click any cell to edit — changes are instant
                </p>
                <button onClick={handleReset} className="text-white/30 hover:text-white transition-colors" title="Back to names">
                  <XMarkIcon className="w-5 h-5" />
                </button>
              </div>

              <div className="overflow-x-auto max-h-[520px] overflow-y-auto">
                <table className="hidden md:table w-full text-xs border-separate border-spacing-0">
                  <thead className="sticky top-0 bg-[#0b1020] z-10">
                    <tr className="text-white/40 uppercase tracking-wider text-[10px]">
                      <th className="text-left px-3 py-2.5 border-b border-white/10 w-8">#</th>
                      <th className="text-left px-2 py-2.5 border-b border-white/10 w-[28%]">Full Name</th>
                      <th className="text-left px-2 py-2.5 border-b border-white/10 w-[12%]">Class</th>
                      <th className="text-left px-2 py-2.5 border-b border-white/10 w-[28%]">Email</th>
                      <th className="text-left px-2 py-2.5 border-b border-white/10 w-[22%]">Temp Password</th>
                      <th className="px-2 py-2.5 border-b border-white/10 w-8" />
                    </tr>
                  </thead>
                  <tbody>
                    {preview.map((s, i) => {
                      const emailDup = dups.has(s.email.toLowerCase());
                      const incomplete = !s.full_name.trim() || !s.email.trim();
                      return (
                        <tr
                          key={s.id}
                          className={`group border-b border-white/5 transition-colors ${incomplete ? 'bg-amber-500/5' : emailDup ? 'bg-rose-500/5' : 'hover:bg-white/[0.02]'
                            }`}
                        >
                          {/* # */}
                          <td className="px-3 py-2 text-white/30 align-middle">{i + 1}</td>

                          {/* Full Name */}
                          <td className="px-2 py-1.5 align-middle">
                            <input
                              className={inp}
                              value={s.full_name}
                              onChange={(e) => updateField(s.id, 'full_name', e.target.value)}
                              onBlur={(e) => onNameBlur(s.id, e.target.value)}
                              placeholder="Full name"
                            />
                          </td>

                          {/* Class */}
                          <td className="px-2 py-1.5 align-middle">
                            <input
                              className={`${inp} font-mono`}
                              value={s.class_name ?? ''}
                              onChange={(e) => updateField(s.id, 'class_name', e.target.value)}
                              onBlur={(e) => onClassBlur(s.id, e.target.value)}
                              placeholder="e.g. JSS2A"
                            />
                          </td>

                          {/* Email */}
                          <td className="px-2 py-1.5 align-middle">
                            <div className="relative">
                              <input
                                className={`${inp} font-mono pr-6 ${emailDup ? 'border-rose-500/60 bg-rose-500/5 text-rose-300' : 'text-violet-300'}`}
                                value={s.email}
                                onChange={(e) => updateField(s.id, 'email', e.target.value)}
                                placeholder="email@rillcod.com"
                              />
                              {emailDup && (
                                <ExclamationTriangleIcon className="absolute right-1.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-rose-400 pointer-events-none" />
                              )}
                            </div>
                          </td>

                          {/* Password (read-only display) */}
                          <td className="px-2 py-2 align-middle">
                            <span className="font-mono text-amber-300/80">{s.password}</span>
                          </td>

                          {/* Delete */}
                          <td className="px-2 py-2 align-middle text-center">
                            <button
                              onClick={() => removeRow(s.id)}
                              className="opacity-0 group-hover:opacity-100 text-white/30 hover:text-rose-400 transition-all rounded p-0.5"
                              title="Remove row"
                            >
                              <XMarkIcon className="w-4 h-4" />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>

                {/* Mobile view */}
                <div className="md:hidden divide-y divide-white/5">
                  {preview.map((s, i) => {
                    const emailDup = dups.has(s.email.toLowerCase());
                    const incomplete = !s.full_name.trim() || !s.email.trim();
                    return (
                      <div key={s.id} className={`p-4 space-y-3 ${incomplete ? 'bg-amber-500/5' : emailDup ? 'bg-rose-500/5' : ''}`}>
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-black text-white/20 uppercase tracking-widest">Student #{i + 1}</span>
                          <button onClick={() => removeRow(s.id)} className="text-white/20 hover:text-rose-400 p-1"><XMarkIcon className="w-4 h-4" /></button>
                        </div>
                        <div className="space-y-2">
                          <input className={inp} value={s.full_name} onChange={(e) => updateField(s.id, 'full_name', e.target.value)} onBlur={(e) => onNameBlur(s.id, e.target.value)} placeholder="Full Name" />
                          <div className="flex gap-2">
                            <input className={`${inp} font-mono w-24`} value={s.class_name ?? ''} onChange={(e) => updateField(s.id, 'class_name', e.target.value)} onBlur={(e) => onClassBlur(s.id, e.target.value)} placeholder="Class" />
                            <div className="relative flex-1">
                              <input className={`${inp} font-mono pr-6 ${emailDup ? 'border-rose-500/60 bg-rose-500/5 text-rose-300' : 'text-violet-300'}`} value={s.email} onChange={(e) => updateField(s.id, 'email', e.target.value)} placeholder="Email" />
                              {emailDup && <ExclamationTriangleIcon className="absolute right-1.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-rose-400" />}
                            </div>
                          </div>
                          <div className="flex items-center justify-between px-3 py-2 bg-white/5 rounded-xl border border-white/5 text-[10px]">
                            <span className="text-white/30 uppercase font-bold">Password</span>
                            <span className="font-mono text-amber-300/80">{s.password}</span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Add row + footer */}
              <div className="px-4 py-3 border-t border-white/10 flex items-center justify-between gap-3 flex-wrap">
                <button
                  onClick={addRow}
                  className="flex items-center gap-1.5 text-xs text-violet-400 hover:text-violet-300 font-bold transition-colors"
                >
                  <PlusIcon className="w-4 h-4" /> Add student
                </button>
                <p className="text-white/30 text-xs">
                  Editing name auto-updates the email if it&apos;s still @rillcod.com.
                </p>
              </div>
            </div>

            {/* Action buttons */}
            <div className="flex gap-3">
              <button
                onClick={handleReset}
                className="flex-1 py-3 bg-white/5 hover:bg-white/10 text-white/60 font-bold rounded-xl transition-colors text-sm border border-white/10"
              >
                ← Edit Names
              </button>
              <div className="flex-1 flex flex-col gap-2">
                <button
                  onClick={handleRegister}
                  disabled={registering || dups.size > 0 || validCount === 0}
                  className="w-full py-3 bg-[#7a0606] hover:bg-[#9a0808] disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold rounded-xl transition-colors text-sm"
                >
                  {registering
                    ? `Registering ${registerProgress?.done ?? 0} / ${registerProgress?.total ?? validCount}...`
                    : dups.size > 0
                      ? 'Fix duplicate emails first'
                      : `Register ${validCount} Student${validCount !== 1 ? 's' : ''}${selectedProgramId ? ' & Enrol' : ''}`}
                </button>
                {registering && registerProgress && (
                  <div className="space-y-1">
                    <div className="w-full h-1.5 bg-white/5 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-[#7a0606] rounded-full transition-all duration-300"
                        style={{ width: `${(registerProgress.done / registerProgress.total) * 100}%` }}
                      />
                    </div>
                    <p className="text-[10px] text-white/30 truncate">
                      Processing: {registerProgress.current}
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ══════════════════ STEP 3 — DONE ═══════════════════════════ */}
        {step === 'done' && results && (
          <div className="space-y-8 max-w-4xl mx-auto animate-in fade-in slide-in-from-bottom-4 duration-500">
            {success && (
              <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-2xl p-4 flex items-center gap-3 text-emerald-400">
                <CheckCircleIcon className="w-5 h-5" />
                <span className="text-sm font-bold">{success}</span>
              </div>
            )}
            <div className="bg-gradient-to-b from-emerald-500/10 to-[#0d1526] border border-emerald-500/20 rounded-[2.5rem] p-8 text-center relative overflow-hidden">
              <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-emerald-500/40 to-transparent" />
              <div className="relative z-10">
                <div className="w-20 h-20 bg-emerald-500/20 rounded-3xl flex items-center justify-center mx-auto mb-6 shadow-xl shadow-emerald-500/10 border border-emerald-500/20 transform rotate-12">
                  <CheckCircleIcon className="w-10 h-10 text-emerald-400 -rotate-12" />
                </div>
                <h2 className="text-3xl font-black text-white mb-2 uppercase tracking-tighter italic">Batch success!</h2>
                <p className="text-emerald-400/80 font-medium">
                  {successCount} account{successCount !== 1 ? 's' : ''} successfully archived.
                </p>

                {failCount > 0 && (
                  <div className="mt-4 px-4 py-2 bg-rose-500/10 border border-rose-500/20 rounded-xl inline-flex items-center gap-2 text-rose-400 text-sm">
                    <ExclamationCircleIcon className="w-4 h-4" />
                    {failCount} student{failCount !== 1 ? 's' : ''} failed — check details.
                  </div>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
              <button onClick={() => window.print()} className="flex items-center justify-center gap-2 px-4 py-4 bg-[#7a0606] hover:bg-[#9a0808] text-white font-black rounded-2xl transition-all shadow-lg shadow-rose-900/20 hover:-translate-y-0.5 text-xs uppercase">
                <PrinterIcon className="w-5 h-5" /> Print Credentials
              </button>
              <button onClick={downloadCSV} className="flex items-center justify-center gap-2 px-4 py-4 bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-400 font-black rounded-2xl transition-all border border-cyan-500/20 text-xs uppercase">
                <DocumentArrowDownIcon className="w-5 h-5" /> Download CSV
              </button>
              <button onClick={handleUpdateResults} disabled={loading} className="flex items-center justify-center gap-2 px-4 py-4 bg-emerald-600/10 hover:bg-emerald-600/20 text-emerald-400 font-black rounded-2xl transition-all border border-emerald-500/20 text-xs uppercase">
                {loading ? <ArrowPathIcon className="w-5 h-5 animate-spin" /> : <CheckCircleIcon className="w-5 h-5" />}
                Save Corrections
              </button>
              <button onClick={() => setStep('input')} className="flex items-center justify-center gap-2 px-4 py-4 bg-white/5 hover:bg-white/10 text-white/60 font-black rounded-2xl transition-all border border-white/10 text-xs uppercase">
                <PlusIcon className="w-5 h-5" /> New Batch
              </button>
            </div>

            {/* Results Table */}
            <div className="bg-[#0d1526] border border-white/10 rounded-[2rem] overflow-hidden shadow-2xl">
              <div className="px-6 py-5 border-b border-white/10 bg-white/[0.02] flex items-center justify-between">
                <div>
                  <h3 className="text-white font-black text-lg flex items-center gap-2 uppercase tracking-tighter">
                    <ClipboardDocumentListIcon className="w-5 h-5 text-violet-400" />
                    Session results
                  </h3>
                  <p className="text-white/30 text-[10px] uppercase font-black tracking-widest mt-1">Archive ID: {results[0]?.batch_id?.slice(0, 8) || 'N/A'}</p>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-white/10 text-white/40 uppercase tracking-widest text-[9px] font-black">
                      <th className="text-left px-6 py-4">#</th>
                      <th className="text-left px-4 py-4">Full Name</th>
                      <th className="text-left px-4 py-4">Class</th>
                      <th className="text-left px-4 py-4">Email / Login</th>
                      <th className="text-right px-6 py-4">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {results.map((r, i) => (
                      <tr key={i} className={`group transition-colors ${r.status === 'failed' ? 'bg-rose-500/5' : 'hover:bg-white/[0.01]'}`}>
                        <td className="px-6 py-4 text-white/20 font-mono">{String(i + 1).padStart(2, '0')}</td>
                        <td className="px-4 py-4">
                          <input className="bg-transparent border-none text-white font-bold w-full focus:ring-1 focus:ring-violet-500 rounded p-1" value={r.full_name} onChange={(e) => {
                            const newResults = [...results]; newResults[i].full_name = e.target.value; setResults(newResults);
                          }} />
                        </td>
                        <td className="px-4 py-4">
                          <input className="bg-transparent border-none text-cyan-400 text-[10px] font-black uppercase tracking-tighter w-full focus:ring-1 focus:ring-cyan-500 rounded p-1" value={r.class_name || ''} onChange={(e) => {
                            const newResults = [...results]; newResults[i].class_name = e.target.value; setResults(newResults);
                          }} />
                        </td>
                        <td className="px-4 py-4 font-mono text-white/60">{r.email}</td>
                        <td className="px-6 py-4 text-right transform group-hover:scale-105 transition-transform">
                          <span className={`px-2 py-1 rounded-full text-[9px] font-black uppercase tracking-tighter ${r.status === 'failed' ? 'bg-rose-500/10 text-rose-500 border border-rose-500/20' : 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20'}`}>
                            {r.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Print Sheet Hidden */}
            <div id="printable-sheet" className="hidden">
               <h2 className="text-2xl font-black uppercase tracking-tighter mb-2">RILLCOD ACADEMY // STUDENT CREDENTIALS</h2>
               <div className="flex gap-4 text-sm font-bold text-slate-500 mb-6 pb-4 border-b">
                 <span>Batch: {results[0]?.batch_id?.slice(0, 8)}</span>
                 <span>Date: {new Date().toLocaleDateString()}</span>
                 {selectedSchoolName && <span>School: {selectedSchoolName}</span>}
               </div>
               <table className="w-full border-collapse">
                  <thead>
                    <tr className="bg-slate-900 text-white">
                      <th className="p-2 border">#</th>
                      <th className="p-2 border">Full Name</th>
                      <th className="p-2 border">Class</th>
                      <th className="p-2 border">Email (Login)</th>
                      <th className="p-2 border">Temporary Password</th>
                    </tr>
                  </thead>
                  <tbody>
                    {results.filter(r => r.status !== 'failed').map((r, i) => (
                      <tr key={i}>
                        <td className="p-2 border font-mono">{i+1}</td>
                        <td className="p-2 border font-bold uppercase">{r.full_name}</td>
                        <td className="p-2 border text-slate-500">{r.class_name || effectiveClassCode}</td>
                        <td className="p-2 border font-mono">{r.email}</td>
                        <td className="p-2 border font-mono font-bold">{r.password}</td>
                      </tr>
                    ))}
                  </tbody>
               </table>
               <div className="mt-8 p-4 bg-slate-50 border rounded-xl text-[10px] text-slate-500 italic">
                 Instructions: 1. Login at academy.rillcod.com 2. Use credentials above 3. Change password immediately.
               </div>
            </div>
          </div>
        )}

        {/* ══════════════════ OFFICIAL REGISTRY (Standalone Tab) ═════════════ */}
        {showHistory && (
          <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-20">
            <div className="bg-cyan-500/5 border border-cyan-500/10 rounded-[3rem] p-10 relative overflow-hidden shadow-2xl">
               <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-cyan-500/30 to-transparent" />
               <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
                 <div>
                   <div className="flex items-center gap-2 mb-2">
                      <div className="w-2 h-2 bg-cyan-400 rounded-full animate-pulse" />
                      <span className="text-[10px] text-cyan-400 font-black uppercase tracking-widest">Live Archive Connection</span>
                   </div>
                   <h2 className="text-4xl font-black text-white italic uppercase tracking-tighter">Execution Vault</h2>
                   <p className="text-white/30 text-xs font-bold uppercase tracking-widest mt-1">Registry of all finalized student distribution sessions</p>
                 </div>
                 <div className="flex items-center gap-4">
                    <div className="text-right hidden md:block">
                       <p className="text-white font-black text-xl leading-none">{history.length}</p>
                       <p className="text-[10px] text-white/30 font-black uppercase tracking-widest mt-1">Total Batches</p>
                    </div>
                    <button 
                      onClick={fetchHistory}
                      disabled={loadingHistory}
                      className="w-16 h-16 bg-cyan-500/10 rounded-3xl flex items-center justify-center border border-cyan-500/20 shadow-xl hover:bg-cyan-500/20 transition-all group"
                    >
                      <ArrowPathIcon className={`w-8 h-8 text-cyan-500 ${loadingHistory ? 'animate-spin' : 'group-hover:rotate-180 transition-transform duration-500'}`} />
                    </button>
                 </div>
               </div>
            </div>

            {loadingHistory && history.length === 0 ? (
              <div className="h-64 flex flex-col items-center justify-center gap-4 bg-white/[0.02] rounded-[3rem] border border-white/5 italic">
                <ArrowPathIcon className="w-8 h-8 text-cyan-500 animate-spin" />
                <span className="text-white/20 text-[10px] font-black uppercase tracking-widest">Hydrating records...</span>
              </div>
            ) : history.length === 0 ? (
              <div className="h-64 flex flex-col items-center justify-center gap-4 bg-white/[0.02] rounded-[3rem] border border-white/5 border-dashed">
                <ArchiveBoxIcon className="w-12 h-12 text-white/5" />
                <span className="text-white/20 text-xs font-bold uppercase">No records found. Complete a registration session first.</span>
              </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {history.map((batch) => (
                    <div key={batch.id} className="group bg-[#0d1526]/80 backdrop-blur-sm border border-white/10 rounded-[3rem] p-8 transition-all hover:bg-[#0d1526] hover:border-cyan-500/30 hover:shadow-2xl hover:shadow-cyan-900/20 relative overflow-hidden">
                      <div className="absolute top-0 right-0 w-32 h-32 bg-cyan-500/5 rounded-full -mr-16 -mt-16 blur-2xl group-hover:bg-cyan-500/10 transition-all" />
                      
                      <div className="relative z-10">
                        <div className="flex items-start justify-between mb-6">
                          <div className="flex-1 min-w-0">
                            {editingBatchId === batch.id ? (
                               <input 
                                 autoFocus
                                 className="bg-white/5 border border-cyan-500/50 rounded-xl px-4 py-2 text-white font-black text-lg w-full focus:outline-none focus:ring-2 focus:ring-cyan-500/20 transition-all"
                                 defaultValue={batch.class_name || 'General Batch'}
                                 onBlur={async (e) => {
                                   const newName = e.target.value || null;
                                   await fetch('/api/students/bulk-register', {
                                     method: 'PATCH',
                                     headers: {'Content-Type': 'application/json'},
                                     body: JSON.stringify({ type: 'batch', data: { id: batch.id, class_name: newName } })
                                   });
                                   setEditingBatchId(null);
                                   fetchHistory();
                                 }}
                               />
                            ) : (
                              <h3 className="text-2xl font-black text-white truncate uppercase tracking-tighter group-hover:text-cyan-400 transition-colors cursor-pointer"
                                  onDoubleClick={() => setEditingBatchId(batch.id)}>
                                {batch.class_name || 'General Batch'}
                              </h3>
                            )}
                            <div className="flex items-center gap-4 mt-2">
                               <div className="flex items-center gap-1.5 px-2.5 py-1 bg-white/5 rounded-lg border border-white/10">
                                  <ClockIcon className="w-3 h-3 text-white/30" />
                                  <span className="text-[9px] text-white/40 font-black uppercase tracking-widest">{new Date(batch.created_at).toLocaleDateString()}</span>
                               </div>
                               <div className="flex items-center gap-1.5 px-2.5 py-1 bg-cyan-500/10 rounded-lg border border-cyan-500/20">
                                  <UserGroupIcon className="w-3 h-3 text-cyan-400" />
                                  <span className="text-[9px] text-cyan-400 font-black uppercase tracking-widest">{batch.student_count} Students</span>
                               </div>
                            </div>
                          </div>
                          
                          <div className="flex gap-2">
                             <button onClick={() => setEditingBatchId(batch.id)} className="p-3 bg-white/5 hover:bg-white/10 rounded-2xl text-white/20 hover:text-cyan-400 transition-all border border-white/5">
                                <PencilIcon className="w-4 h-4" />
                             </button>
                             <button onClick={() => handleDeleteBatch(batch.id)} className="p-3 bg-white/5 hover:bg-rose-500/10 rounded-2xl text-white/20 hover:text-rose-500 transition-all border border-white/5">
                                <TrashIcon className="w-4 h-4" />
                             </button>
                          </div>
                        </div>

                        {batch.school_name && (
                          <div className="mb-8 flex items-center gap-3 px-4 py-3 bg-white/[0.03] border border-white/5 rounded-2xl">
                            <BuildingOffice2Icon className="w-4 h-4 text-violet-400" />
                            <div>
                               <p className="text-[8px] text-white/20 font-black uppercase tracking-widest leading-none mb-1">Affiliated Institution</p>
                               <p className="text-[11px] text-white/60 font-bold truncate tracking-tight">{batch.school_name}</p>
                            </div>
                          </div>
                        )}

                        <div className="flex items-center justify-between gap-4">
                           <span className="text-[10px] font-mono text-white/10 tracking-widest font-black uppercase">VAULT-ID: {batch.id.slice(0, 8)}</span>
                           <button 
                             onClick={async () => {
                               if (selectedBatchId === batch.id) {
                                 setSelectedBatchId(null);
                               } else {
                                 setSelectedBatchId(batch.id);
                                 setLoadingHistory(true);
                                 const { data } = await supabase.from('registration_results').select('*').eq('batch_id', batch.id);
                                 if (data) setBatchResults(data);
                                 setLoadingHistory(false);
                               }
                             }}
                             className={`px-6 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all ${selectedBatchId === batch.id ? 'bg-cyan-500 text-white shadow-xl shadow-cyan-500/30 -translate-y-1' : 'bg-white/5 text-white/40 hover:bg-white/10 hover:text-white border border-white/5'}`}
                           >
                             {selectedBatchId === batch.id ? 'Close Records' : 'Open Results'}
                           </button>
                        </div>

                        {/* Expanded View for Batch Results */}
                        {selectedBatchId === batch.id && (
                          <div className="mt-8 pt-8 border-t border-white/5 space-y-3 animate-in fade-in zoom-in-95 duration-300">
                             <div className="flex items-center justify-between mb-2">
                                <p className="text-[10px] text-white/30 font-black uppercase tracking-widest">Entry Breakdown</p>
                                <p className="text-[10px] text-cyan-400/50 font-black tracking-widest italic">Double-click names to quick edit</p>
                             </div>
                             {batchResults.length === 0 ? (
                               <div className="py-12 flex flex-col items-center justify-center gap-3">
                                  <ArrowPathIcon className="w-6 h-6 text-cyan-500/20 animate-spin" />
                                  <p className="text-[10px] text-white/10 uppercase font-black tracking-widest">Accessing records...</p>
                               </div>
                             ) : (
                               <div className="max-h-[400px] overflow-y-auto custom-scrollbar space-y-2 pr-2">
                                 {batchResults.map((r, ri) => (
                                   <div key={r.id} className="group/row flex items-center justify-between p-4 bg-white/[0.02] border border-white/5 rounded-[1.5rem] hover:bg-white/[0.05] hover:border-cyan-500/20 transition-all">
                                     <div className="flex items-center gap-4 flex-1 min-w-0">
                                       <div className="w-8 h-8 rounded-xl bg-white/5 flex items-center justify-center text-[10px] font-black text-white/20 border border-white/5 group-hover/row:border-cyan-500/20 group-hover/row:text-cyan-400 transition-all">
                                          {ri + 1}
                                       </div>
                                       <div className="flex-1 min-w-0 grid grid-cols-1 sm:grid-cols-2 gap-3">
                                         {editingResultId === r.id ? (
                                           <div className="flex gap-2 w-full">
                                             <input 
                                               autoFocus
                                               className="bg-black/40 border border-cyan-500/40 rounded-lg px-3 py-1.5 text-white text-xs flex-1 focus:outline-none focus:ring-2 focus:ring-cyan-500/20"
                                               defaultValue={r.full_name}
                                               placeholder="Name"
                                               id={`edit-name-${r.id}`}
                                             />
                                              <input 
                                                className="bg-black/60 border border-cyan-500/60 rounded-xl px-4 py-2 text-cyan-300 text-[10px] font-black uppercase tracking-widest w-40 focus:outline-none focus:ring-2 focus:ring-cyan-500/30 transition-all font-mono"
                                               defaultValue={r.class_name || ''}
                                               placeholder="Class"
                                               id={`edit-class-${r.id}`}
                                             />
                                             <button 
                                               onClick={async () => {
                                                 const name = (document.getElementById(`edit-name-${r.id}`) as HTMLInputElement).value;
                                                 const cls = (document.getElementById(`edit-class-${r.id}`) as HTMLInputElement).value;
                                                 await fetch(`/api/students/bulk-register`, {
                                                   method: 'PATCH',
                                                   headers: {'Content-Type': 'application/json'},
                                                   body: JSON.stringify({ type: 'result', data: { id: r.id, full_name: name, class_name: cls, email: r.email } })
                                                 });
                                                 setEditingResultId(null);
                                                 const { data } = await supabase.from('registration_results').select('*').eq('batch_id', batch.id);
                                                 if (data) setBatchResults(data);
                                               }}
                                               className="bg-cyan-500 text-white p-1.5 rounded-lg"
                                             >
                                               <CheckCircleIcon className="w-4 h-4" />
                                             </button>
                                           </div>
                                         ) : (
                                           <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4" onDoubleClick={() => setEditingResultId(r.id)}>
                                             <p className="text-white font-black text-sm truncate">{r.full_name}</p>
                                             <div className="flex items-center gap-2">
                                               <span className="px-2 py-0.5 bg-cyan-500/10 rounded-md text-[9px] font-black text-cyan-400 uppercase tracking-widest border border-cyan-500/20">
                                                 {r.class_name || 'N/A'}
                                               </span>
                                               <span className="text-[10px] text-white/20 font-mono truncate">{r.email}</span>
                                             </div>
                                           </div>
                                         )}
                                       </div>
                                     </div>
                                     <div className="flex gap-1 ml-4 opacity-0 group-hover/row:opacity-100 transition-all transform translate-x-2 group-hover/row:translate-x-0">
                                        <button onClick={() => setEditingResultId(r.id)} className="p-2 hover:bg-cyan-500/10 text-white/10 hover:text-cyan-400 rounded-xl transition-all">
                                          <PencilIcon className="w-3.5 h-3.5" />
                                        </button>
                                        <button onClick={async () => {
                                          if (!confirm('Permanently wipe this entry from the registry?')) return;
                                          await fetch(`/api/students/bulk-register?resultId=${r.id}`, { method: 'DELETE' });
                                          setBatchResults(prev => prev.filter(x => x.id !== r.id));
                                          fetchHistory(); // Update student count
                                        }} className="p-2 hover:bg-rose-500/10 text-white/10 hover:text-rose-500 rounded-xl transition-all">
                                          <TrashIcon className="w-3.5 h-3.5" />
                                        </button>
                                     </div>
                                   </div>
                                 ))}
                               </div>
                             )}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
            )}
          </div>
        )}
      </div>
    </>
  );
}
