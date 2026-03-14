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
} from '@heroicons/react/24/outline';

// ─── Class detection ─────────────────────────────────────────────────────────
//
// Recognises Nigerian school class codes wherever they appear in a line:
//   JSS1 · JSS2A · JSS 3B · SS1 · SS2C · SSS3 · BASIC 1 · BASIC 6A
//
const CLASS_RE = /\b(JSS\s*[123]|SS[S]?\s*[123]|BASIC\s*[1-6])([A-Za-z])?\b/i;

function detectClass(text: string): string | null {
  const m = text.match(CLASS_RE);
  if (!m) return null;
  const base    = m[1].replace(/\s+/g, ' ').trim().toUpperCase();
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

/** Generate an email from a name, avoiding collisions against a set of taken emails. */
function makeEmail(firstName: string, taken: Set<string>, skipEmail?: string): string {
  const base = firstName.toLowerCase().replace(/[^a-z0-9]/g, '') || 'student';
  let email = `${base}@rillcod.com`;
  if (email === skipEmail || !taken.has(email)) return email;
  let i = 2;
  while (taken.has(`${base}${i}@rillcod.com`) && `${base}${i}@rillcod.com` !== skipEmail) i++;
  return `${base}${i}@rillcod.com`;
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
  isRegistry?: boolean; // from teacher's class registry
}

// Standard Nigerian school class codes shown in every dropdown
const STANDARD_CLASSES: ClassOption[] = [
  { id: 'std-kg',      name: 'Kindergarten (KG)',  section_class: 'KG' },
  { id: 'std-b1',      name: 'Basic 1',            section_class: 'BASIC 1' },
  { id: 'std-b2',      name: 'Basic 2',            section_class: 'BASIC 2' },
  { id: 'std-b3',      name: 'Basic 3',            section_class: 'BASIC 3' },
  { id: 'std-b4',      name: 'Basic 4',            section_class: 'BASIC 4' },
  { id: 'std-b5',      name: 'Basic 5',            section_class: 'BASIC 5' },
  { id: 'std-b6',      name: 'Basic 6',            section_class: 'BASIC 6' },
  { id: 'std-jss1',    name: 'JSS 1',              section_class: 'JSS1' },
  { id: 'std-jss1a',   name: 'JSS 1A',             section_class: 'JSS1A' },
  { id: 'std-jss1b',   name: 'JSS 1B',             section_class: 'JSS1B' },
  { id: 'std-jss1c',   name: 'JSS 1C',             section_class: 'JSS1C' },
  { id: 'std-jss2',    name: 'JSS 2',              section_class: 'JSS2' },
  { id: 'std-jss2a',   name: 'JSS 2A',             section_class: 'JSS2A' },
  { id: 'std-jss2b',   name: 'JSS 2B',             section_class: 'JSS2B' },
  { id: 'std-jss2c',   name: 'JSS 2C',             section_class: 'JSS2C' },
  { id: 'std-jss3',    name: 'JSS 3',              section_class: 'JSS3' },
  { id: 'std-jss3a',   name: 'JSS 3A',             section_class: 'JSS3A' },
  { id: 'std-jss3b',   name: 'JSS 3B',             section_class: 'JSS3B' },
  { id: 'std-jss3c',   name: 'JSS 3C',             section_class: 'JSS3C' },
  { id: 'std-ss1',     name: 'SS 1',               section_class: 'SS1' },
  { id: 'std-ss1a',    name: 'SS 1A',              section_class: 'SS1A' },
  { id: 'std-ss1b',    name: 'SS 1B',              section_class: 'SS1B' },
  { id: 'std-ss1c',    name: 'SS 1C',              section_class: 'SS1C' },
  { id: 'std-ss2',     name: 'SS 2',               section_class: 'SS2' },
  { id: 'std-ss2a',    name: 'SS 2A',              section_class: 'SS2A' },
  { id: 'std-ss2b',    name: 'SS 2B',              section_class: 'SS2B' },
  { id: 'std-ss2c',    name: 'SS 2C',              section_class: 'SS2C' },
  { id: 'std-ss3',     name: 'SS 3',               section_class: 'SS3' },
  { id: 'std-ss3a',    name: 'SS 3A',              section_class: 'SS3A' },
  { id: 'std-ss3b',    name: 'SS 3B',              section_class: 'SS3B' },
  { id: 'std-ss3c',    name: 'SS 3C',              section_class: 'SS3C' },
  { id: 'std-sss1',    name: 'SSS 1',              section_class: 'SSS1' },
  { id: 'std-sss2',    name: 'SSS 2',              section_class: 'SSS2' },
  { id: 'std-sss3',    name: 'SSS 3',              section_class: 'SSS3' },
];

let _idCounter = 0;
function nextId() { return ++_idCounter; }

function buildStudentList(rawLines: string[], fallbackClass?: string): GeneratedStudent[] {
  const usedEmails = new Set<string>();
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
    const namePart    = inlineClass ? stripClass(line) : line;
    if (!namePart) continue;

    // Priority: inline class > header context > fallback default class
    const resolvedClass = inlineClass ?? contextClass ?? (fallbackClass ? (detectClass(fallbackClass) ?? fallbackClass.trim().toUpperCase()) || undefined : undefined);
    const first  = extractFirstName(namePart);
    const email  = makeEmail(first, usedEmails);
    usedEmails.add(email);

    students.push({ id: nextId(), full_name: namePart, email, password: generatePassword(), class_name: resolvedClass || undefined });
  }
  return students;
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function BulkRegisterPage() {
  const { profile, loading: authLoading } = useAuth();
  const supabase = createClient();

  const [namesText,   setNamesText]   = useState('');
  const [preview,     setPreview]     = useState<GeneratedStudent[]>([]);
  const [registering, setRegistering] = useState(false);
  const [results,     setResults]     = useState<RegisterResult[] | null>(null);
  const [step,        setStep]        = useState<'input' | 'preview' | 'done'>('input');

  // ── Batch Settings ───────────────────────────────────────────────────────
  const [schools,        setSchools]        = useState<School[]>([]);
  const [programmes,     setProgrammes]     = useState<Programme[]>([]);
  const [classOptions,   setClassOptions]   = useState<ClassOption[]>(STANDARD_CLASSES); // standard codes
  const [registryClasses,setRegistryClasses]= useState<ClassOption[]>([]); // teacher's created classes

  const [selectedSchoolId,      setSelectedSchoolId]      = useState('');
  const [selectedSchoolName,    setSelectedSchoolName]    = useState('');
  const [selectedProgramId,     setSelectedProgramId]     = useState('');
  const [selectedRegistryClass, setSelectedRegistryClass] = useState(''); // class id
  const [defaultClass,          setDefaultClass]          = useState(''); // fallback class code
  const [settingsOpen,          setSettingsOpen]          = useState(true);

  const isAdmin = profile?.role === 'admin';

  /**
   * The fallback class code applied to students whose names don't contain a class:
   * - Registry class section_class takes priority if selected
   * - Otherwise the manually picked standard code is used
   * Both fields can be set independently; registry class wins if both are filled
   */
  const effectiveClassCode = (() => {
    if (selectedRegistryClass) {
      const rc = registryClasses.find((c) => c.id === selectedRegistryClass);
      return rc?.section_class ?? rc?.name ?? defaultClass;
    }
    return defaultClass;
  })();

  const canAccess = profile?.role === 'admin' || profile?.role === 'teacher';

  // ── Load schools and programmes ──────────────────────────────────────────
  useEffect(() => {
    if (!profile || !canAccess) return;

    async function loadData() {
      // Load registry classes via shared service (has fallback on RLS errors)
      const teacherId = profile?.role === 'teacher' ? profile?.id : undefined;
      const clsData = await fetchClasses(teacherId, undefined);
      setRegistryClasses(clsData.map((c: any) => ({ id: c.id, name: c.name, section_class: c.section_class ?? null, isRegistry: true })));

      if (profile?.role === 'admin') {
        // Admin sees all approved schools
        const { data } = await supabase
          .from('schools')
          .select('id, name')
          .eq('status', 'approved')
          .order('name');
        setSchools(data ?? []);
      }

      // Load programmes
      const { data: progs } = await supabase
        .from('programs')
        .select('id, name')
        .order('name');
      setProgrammes(progs ?? []);
    }

    loadData();
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
    try {
      const body: Record<string, any> = { students: valid };
      if (selectedSchoolId)  { body.school_id = selectedSchoolId; body.school_name = selectedSchoolName; }
      if (selectedProgramId) { body.program_id = selectedProgramId; }

      const res = await fetch('/api/students/bulk-register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Registration failed');
      setResults(data.results);
      setStep('done');
    } catch (err: any) {
      alert(err.message);
    } finally {
      setRegistering(false);
    }
  };

  const handleReset = () => { setNamesText(''); setPreview([]); setResults(null); setStep('input'); };

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

  const dups           = dupEmails(preview);
  const incompleteRows = preview.filter((r) => !r.full_name.trim() || !r.email.trim());
  const validCount     = preview.length - incompleteRows.length;
  const previewClasses = [...new Set(preview.map((s) => s.class_name).filter(Boolean))];

  const successCount = results?.filter((r) => r.status !== 'failed').length ?? 0;
  const failCount    = results?.filter((r) => r.status === 'failed').length ?? 0;

  const selectedProgLabel = programmes.find((p) => p.id === selectedProgramId)?.name ?? '';

  // Shared input class
  const inp = 'w-full bg-transparent border border-white/10 rounded-lg px-2 py-1.5 text-white text-xs focus:outline-none focus:border-violet-500/60 focus:bg-violet-500/5 transition-colors placeholder-white/20';

  return (
    <>
      {/* ── Print-only styles ──────────────────────────────────────────── */}
      <style>{`
        @media print {
          body * { visibility: hidden !important; }
          #printable-sheet, #printable-sheet * { visibility: visible !important; }
          #printable-sheet {
            position: fixed; inset: 0; background: #fff; color: #000; padding: 24px;
          }
          #printable-sheet h2  { font-size: 18px; font-weight: 800; margin-bottom: 4px; }
          #printable-sheet p   { font-size: 12px; margin-bottom: 16px; color: #555; }
          #printable-sheet table { width: 100%; border-collapse: collapse; font-size: 11px; }
          #printable-sheet th  { background: #1a1a2e; color: #fff; padding: 7px 9px; text-align: left; font-weight: 700; }
          #printable-sheet td  { border-bottom: 1px solid #e5e7eb; padding: 6px 9px; color: #111; }
          #printable-sheet tr:nth-child(even) td { background: #f9fafb; }
          #printable-sheet .cls-badge { background: #cffafe; color: #0e7490; padding: 1px 6px; border-radius: 9999px; font-size: 10px; font-weight: 700; }
          #printable-sheet .badge-ok  { background: #d1fae5; color: #065f46; padding: 2px 8px; border-radius: 9999px; font-size: 10px; font-weight: 700; }
          #printable-sheet .badge-fail{ background: #fee2e2; color: #991b1b; padding: 2px 8px; border-radius: 9999px; font-size: 10px; font-weight: 700; }
          #printable-sheet .footer-note { margin-top: 20px; font-size: 10px; color: #888; border-top: 1px solid #e5e7eb; padding-top: 10px; }
          @page { margin: 1.5cm; }
        }
      `}</style>

      <div className="min-h-screen bg-[#0f0f1a] px-4 py-6 md:px-8 max-w-6xl mx-auto">

        {/* ── Header ─────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between mb-8 flex-wrap gap-4">
          <div>
            <h1 className="text-2xl font-black text-white flex items-center gap-2">
              <SparklesIcon className="w-6 h-6 text-violet-400" />
              Register Students
            </h1>
            <p className="text-white/40 text-sm mt-1">
              Paste names → review &amp; edit → register → print credentials
            </p>
          </div>
          <Link href="/dashboard/students" className="text-white/40 hover:text-white text-sm transition-colors">
            ← Back to Students
          </Link>
        </div>

        {/* ── Step indicator ─────────────────────────────────────────── */}
        <div className="flex items-center gap-2 mb-8 text-xs font-bold flex-wrap">
          {(['input', 'preview', 'done'] as const).map((s, i) => {
            const labels = ['1. Enter Names', '2. Edit & Register', '3. Print Credentials'];
            const active = step === s;
            const done   = ['input', 'preview', 'done'].indexOf(step) > i;
            return (
              <div key={s} className="flex items-center gap-2">
                {i > 0 && <div className="w-8 h-px bg-white/10" />}
                <span className={`px-3 py-1 rounded-full transition-colors ${active ? 'bg-violet-600 text-white' : done ? 'bg-emerald-600/30 text-emerald-400' : 'bg-white/5 text-white/30'}`}>
                  {labels[i]}
                </span>
              </div>
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

                  {/* Row 1: School (admin only) + Programme */}
                  <div className={`grid gap-5 ${isAdmin ? 'sm:grid-cols-2' : 'grid-cols-1'}`}>

                    {/* School — admin only */}
                    {isAdmin && (
                      <div>
                        <label className="block text-white/50 text-xs font-bold uppercase tracking-widest mb-2 flex items-center gap-1.5">
                          <BuildingOffice2Icon className="w-3.5 h-3.5" /> School
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
                          {selectedSchoolId ? 'Students will be assigned to this school.' : 'Leave blank to use your own school.'}
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
                      {registryClasses.length > 0 ? (
                        <select
                          value={selectedRegistryClass}
                          onChange={(e) => setSelectedRegistryClass(e.target.value)}
                          className="w-full px-3 py-2.5 bg-cyan-500/5 border border-cyan-500/20 rounded-xl text-sm text-white focus:outline-none focus:border-cyan-500/50 transition-colors"
                        >
                          <option value="">— No class selected —</option>
                          {registryClasses.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.name}{c.section_class ? ` (${c.section_class})` : ''}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <div className="px-3 py-2.5 bg-white/3 border border-white/8 rounded-xl text-white/25 text-sm italic">
                          No classes yet — use the <span className="text-cyan-400/60 font-bold">New Class</span> button above.
                        </div>
                      )}
                      {selectedRegistryClass && (() => {
                        const rc = registryClasses.find((c) => c.id === selectedRegistryClass);
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
                rows={14}
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
                {defaultClass && (
                  <span className="flex items-center gap-1.5 px-3 py-1.5 bg-cyan-500/10 border border-cyan-500/20 rounded-full text-cyan-300 font-mono">
                    <AcademicCapIcon className="w-3.5 h-3.5" />
                    Default class: {defaultClass.toUpperCase()}
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
                <table className="w-full text-xs border-separate border-spacing-0">
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
                      const emailDup  = dups.has(s.email.toLowerCase());
                      const incomplete = !s.full_name.trim() || !s.email.trim();
                      return (
                        <tr
                          key={s.id}
                          className={`group border-b border-white/5 transition-colors ${
                            incomplete ? 'bg-amber-500/5' : emailDup ? 'bg-rose-500/5' : 'hover:bg-white/[0.02]'
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
              <button
                onClick={handleRegister}
                disabled={registering || dups.size > 0 || validCount === 0}
                className="flex-1 py-3 bg-[#7a0606] hover:bg-[#9a0808] disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold rounded-xl transition-colors text-sm"
              >
                {registering
                  ? 'Registering...'
                  : dups.size > 0
                  ? 'Fix duplicate emails first'
                  : `Register ${validCount} Student${validCount !== 1 ? 's' : ''}${selectedProgramId ? ' & Enrol' : ''}`}
              </button>
            </div>
          </div>
        )}

        {/* ══════════════════ STEP 3 — DONE / PRINT ═══════════════════ */}
        {step === 'done' && results && (
          <div className="space-y-6">
            <div className={`rounded-2xl p-5 border flex items-start gap-4 ${failCount === 0 ? 'bg-emerald-500/10 border-emerald-500/30' : 'bg-amber-500/10 border-amber-500/30'}`}>
              <CheckCircleIcon className="w-7 h-7 text-emerald-400 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-white font-bold text-base">Registration Complete</p>
                <p className="text-white/60 text-sm mt-1">
                  {successCount} account{successCount !== 1 ? 's' : ''} created.
                  {selectedProgramId && successCount > 0 && (
                    <span className="text-emerald-400"> Auto-enrolled into {selectedProgLabel}.</span>
                  )}
                  {failCount > 0 && <span className="text-rose-400"> {failCount} failed — see table.</span>}
                </p>
              </div>
            </div>

            <div className="flex gap-3 flex-wrap">
              <button
                onClick={() => window.print()}
                className="flex items-center gap-2 px-5 py-2.5 bg-[#7a0606] hover:bg-[#9a0808] text-white font-bold rounded-xl transition-colors text-sm"
              >
                <PrinterIcon className="w-4 h-4" /> Print Credentials Sheet
              </button>
              <button
                onClick={handleReset}
                className="flex items-center gap-2 px-5 py-2.5 bg-white/5 hover:bg-white/10 text-white/60 font-bold rounded-xl transition-colors text-sm border border-white/10"
              >
                <ArrowUpTrayIcon className="w-4 h-4" /> Register More
              </button>
              <Link
                href="/dashboard/students"
                className="flex items-center gap-2 px-5 py-2.5 bg-violet-600/20 hover:bg-violet-600/30 text-violet-300 font-bold rounded-xl transition-colors text-sm"
              >
                View All Students
              </Link>
            </div>

            <div className="bg-[#0d1526] border border-white/10 rounded-2xl overflow-hidden">
              <div className="p-4 border-b border-white/10">
                <h3 className="text-white font-bold text-sm">Credentials List</h3>
                <p className="text-white/30 text-xs mt-0.5">Print and distribute to students physically</p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-white/10 text-white/40 uppercase tracking-wider text-[10px]">
                      <th className="text-left px-4 py-3">#</th>
                      <th className="text-left px-4 py-3">Full Name</th>
                      <th className="text-left px-4 py-3">Class</th>
                      <th className="text-left px-4 py-3">Email (Login)</th>
                      <th className="text-left px-4 py-3">Temp Password</th>
                      <th className="text-left px-4 py-3">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {results.map((r, i) => (
                      <tr key={i} className={`border-b border-white/5 ${r.status === 'failed' ? 'bg-rose-500/5' : ''}`}>
                        <td className="px-4 py-2.5 text-white/30">{i + 1}</td>
                        <td className="px-4 py-2.5 text-white font-medium">{r.full_name}</td>
                        <td className="px-4 py-2.5">
                          {r.class_name
                            ? <span className="inline-block px-2 py-0.5 bg-cyan-500/15 text-cyan-300 text-[10px] font-bold rounded-full border border-cyan-500/20">{r.class_name}</span>
                            : <span className="text-white/20 text-[10px]">—</span>}
                        </td>
                        <td className="px-4 py-2.5 text-violet-300 font-mono">{r.email}</td>
                        <td className="px-4 py-2.5 text-amber-300 font-mono">{r.status !== 'failed' ? r.password : '—'}</td>
                        <td className="px-4 py-2.5">
                          {r.status === 'created' && <span className="flex items-center gap-1 text-emerald-400"><CheckCircleIcon className="w-3.5 h-3.5" /> Created</span>}
                          {r.status === 'updated' && <span className="flex items-center gap-1 text-blue-400"><CheckCircleIcon className="w-3.5 h-3.5" /> Updated</span>}
                          {r.status === 'failed'  && <span className="flex items-center gap-1 text-rose-400"><ExclamationCircleIcon className="w-3.5 h-3.5" />{r.error ?? 'Failed'}</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ═══════════════════ PRINT-ONLY SHEET ══════════════════════════════ */}
      {step === 'done' && results && (
        <div id="printable-sheet">
          <h2>Rillcod Academy — Student Login Credentials</h2>
          <p>
            Generated: {new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' })}
            &nbsp;&nbsp;|&nbsp;&nbsp;
            {successCount} account{successCount !== 1 ? 's' : ''} created
            {selectedSchoolName && <>&nbsp;&nbsp;|&nbsp;&nbsp;School: <strong>{selectedSchoolName}</strong></>}
            {defaultClass && <>&nbsp;&nbsp;|&nbsp;&nbsp;Class: <strong>{defaultClass}</strong></>}
            {selectedProgLabel  && <>&nbsp;&nbsp;|&nbsp;&nbsp;Programme: <strong>{selectedProgLabel}</strong></>}
            &nbsp;&nbsp;|&nbsp;&nbsp;
            Portal: <strong>academy.rillcod.com</strong>
          </p>
          <table>
            <thead>
              <tr>
                <th style={{ width: '3%' }}>#</th>
                <th style={{ width: '22%' }}>Full Name</th>
                <th style={{ width: '10%' }}>Class</th>
                <th style={{ width: '28%' }}>Email (Login ID)</th>
                <th style={{ width: '20%' }}>Temp Password</th>
                <th style={{ width: '17%' }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {results.map((r, i) => (
                <tr key={i}>
                  <td>{i + 1}</td>
                  <td>{r.full_name}</td>
                  <td>{(defaultClass || r.class_name) ? <span className="cls-badge">{defaultClass || r.class_name}</span> : '—'}</td>
                  <td style={{ fontFamily: 'monospace' }}>{r.email}</td>
                  <td style={{ fontFamily: 'monospace', fontWeight: 700 }}>{r.status !== 'failed' ? r.password : '—'}</td>
                  <td>
                    {r.status === 'failed'
                      ? <span className="badge-fail">Failed</span>
                      : <span className="badge-ok">{r.status === 'updated' ? 'Reset' : 'New'}</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="footer-note">
            <strong>IMPORTANT — Please inform each student:</strong><br />
            1. Go to <strong>academy.rillcod.com</strong> and click <em>Sign In</em>.<br />
            2. Enter your email and temporary password shown above.<br />
            3. <strong>Change your password immediately</strong> after first login — a prompt will appear automatically.<br />
            4. Keep your credentials safe and do not share them.<br /><br />
            This sheet is confidential. Distribute individually to each student. — Rillcod Academy IT
          </div>
        </div>
      )}
    </>
  );
}
