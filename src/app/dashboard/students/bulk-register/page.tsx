// @refresh reset
'use client';

import { useState, useCallback, useEffect, useMemo } from 'react';
import { useAuth } from '@/contexts/auth-context';
import { createClient } from '@/lib/supabase/client';
import Link from 'next/link';
import { accessCardCodeForStudent } from '@/lib/access-card-code';
import { qrDataUrls } from '@/lib/cards/qr';
import {
  SINGLE_GRADES,
  canonicalGrade,
  composeClassName,
} from '@/lib/classes/naming';
import { isBulkGradeHeader, parseBulkGrade, stripBulkGrade } from '@/lib/students/bulk-grade';
import { bulkClassCoversGrade, bulkGradeBand, buildBulkPlacementPool } from '@/lib/students/bulk-placement';
import { duplicateNameKey } from '@/lib/students/clean-name';
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
  UserIcon,
  RectangleGroupIcon,
} from '@/lib/icons';
import { AddStudentModal } from '@/features/students/components/AddStudentModal';
import toast from 'react-hot-toast';
import { jsPDF } from 'jspdf';
import 'jspdf-autotable';
import { UserOptions } from 'jspdf-autotable';

// Fix for jspdf-autotable types
interface jsPDFWithPlugin extends jsPDF {
  autoTable: (options: UserOptions) => jsPDF;
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
  const email = `${base}${digits}@rillcod.com`.toLowerCase();

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
  class_arm?: string;
  class_id?: string;
  gender?: 'male' | 'female' | '';
  duplicate_exception_reason?: string;
  duplicate_exception_confirmed?: boolean;
}

interface RegisterResult extends GeneratedStudent {
  status: 'created' | 'updated' | 'skipped' | 'failed' | 'name_swap_conflict' | 'reinstated' | 'needs_transfer';
  error?: string;
  userId?: string;
  portal_user_id?: string;
  batch_id?: string;
  cardIssued?: boolean;
  cardId?: string | null;
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
  qa_grade_key?: string | null;
  qa_grade_band?: string | null;
  band_lvl?: string | null;
  band_low?: number | null;
  band_high?: number | null;
  teacher_id?: string | null;
  term_id?: string | null;
  program_id?: string | null;
  academic_terms?: { term_label?: string; academic_year?: string } | null;
  isRegistry?: boolean; // from teacher's class registry
}

type AcademicTermOption = {
  id: string;
  academic_year: string;
  term_number: number;
  term_label: string;
  start_date: string | null;
  end_date: string | null;
  is_current: boolean;
};

let _idCounter = 0;
function nextId() { return ++_idCounter; }

function buildStudentList(rawLines: string[], fallbackClass?: string): GeneratedStudent[] {
  const usedEmails = new Set<string>();
  const students: GeneratedStudent[] = [];
  let contextClass: string | null = null;
  let contextArm: string | null = null;

  for (const raw of rawLines) {
    const line = raw.trim();
    if (!line) continue;

    if (isBulkGradeHeader(line)) {
      const parsed = parseBulkGrade(line);
      contextClass = parsed?.grade ?? null;
      contextArm = parsed?.arm ?? null;
      continue;
    }

    const inline = parseBulkGrade(line);
    const namePart = inline ? stripBulkGrade(line) : line;
    if (!namePart) continue;

    // Priority: inline class > header context > fallback default class
    const resolvedClass = inline?.grade ?? contextClass ?? canonicalGrade(fallbackClass) ?? undefined;
    const first = extractFirstName(namePart);
    const email = makeEmail(first, usedEmails);
    usedEmails.add(email);

    students.push({ id: nextId(), full_name: namePart, email, password: generatePassword(), class_name: resolvedClass || undefined, class_arm: inline?.arm || contextArm || undefined });
  }
  return students;
}

const BATCH_SECTION_KEY = '__batch__';

function resolveBulkSectionId(
  student: Pick<GeneratedStudent, 'class_name' | 'class_id'>,
  bandClassSelections: Record<string, string>,
  selectedRegistryClass: string,
): string | null {
  if (student.class_id) return student.class_id;
  const band = bulkGradeBand(student.class_name);
  if (band && bandClassSelections[band]) return bandClassSelections[band];
  if (bandClassSelections[BATCH_SECTION_KEY]) return bandClassSelections[BATCH_SECTION_KEY];
  if (selectedRegistryClass) return selectedRegistryClass;
  return null;
}

function shortClassLabel(name: string | null | undefined): string {
  const raw = (name || '').trim();
  if (!raw) return 'Untitled class';
  // Prefer the last segments after " · " so long school prefixes don't dominate mobile.
  const parts = raw.split('·').map((part) => part.trim()).filter(Boolean);
  return parts.length > 1 ? parts.slice(-2).join(' · ') : raw;
}

type ClassSectionOption = {
  id: string;
  name: string;
  preferred?: boolean;
};

function ClassSectionPicker({
  options,
  value,
  onChange,
  disabled,
  emptyMessage,
}: {
  options: ClassSectionOption[];
  value: string;
  onChange: (id: string) => void;
  disabled?: boolean;
  emptyMessage?: string;
}) {
  if (disabled) {
    return (
      <p className="rounded-xl border border-amber-500/30 bg-amber-500/5 px-3 py-2.5 text-[11px] text-amber-400">
        {emptyMessage || 'Select a school first to load your class sections.'}
      </p>
    );
  }
  if (options.length === 0) {
    return (
      <p className="rounded-xl border border-amber-500/30 bg-amber-500/5 px-3 py-2.5 text-[11px] text-amber-400">
        {emptyMessage || 'No classes found for this school. Create one on Classes, then refresh.'}
      </p>
    );
  }

  return (
    <div className="max-h-56 sm:max-h-72 space-y-2 overflow-y-auto overscroll-contain rounded-xl border border-border bg-background/40 p-2">
      {options.map((opt) => {
        const selected = value === opt.id;
        return (
          <button
            type="button"
            key={opt.id}
            onClick={() => onChange(opt.id)}
            className={`w-full min-w-0 rounded-lg border px-3 py-2.5 text-left transition-colors ${
              selected
                ? 'border-primary bg-primary/10 ring-1 ring-primary/25'
                : 'border-border/70 bg-card hover:border-primary/40'
            }`}
          >
            <div className="flex min-w-0 items-start gap-2.5">
              <span
                className={`mt-0.5 flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full border ${
                  selected ? 'border-primary bg-primary' : 'border-muted-foreground/40'
                }`}
                aria-hidden
              >
                {selected ? <span className="h-1.5 w-1.5 rounded-full bg-white" /> : null}
              </span>
              <div className="min-w-0 flex-1">
                <p className="break-words text-sm font-semibold leading-snug text-foreground">{opt.name}</p>
                {opt.preferred ? (
                  <p className="mt-0.5 text-[10px] font-bold uppercase tracking-wider text-primary">Best match</p>
                ) : null}
              </div>
            </div>
          </button>
        );
      })}
      {value ? (
        <button
          type="button"
          onClick={() => onChange('')}
          className="w-full py-1 text-center text-[11px] text-muted-foreground hover:text-foreground"
        >
          Clear selection
        </button>
      ) : null}
    </div>
  );
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
  const [step, setStep] = useState<'input' | 'preview' | 'done' | 'registry' | 'single'>('input');

  // ── Batch Settings ───────────────────────────────────────────────────────
  const [schools, setSchools] = useState<School[]>([]);
  const [programmes, setProgrammes] = useState<Programme[]>([]);
  const [registryClasses, setRegistryClasses] = useState<ClassOption[]>([]); // teacher's created classes
  const [academicTerms, setAcademicTerms] = useState<AcademicTermOption[]>([]);

  const [selectedSchoolId, setSelectedSchoolId] = useState('');
  const [selectedSchoolName, setSelectedSchoolName] = useState('');
  const [selectedProgramId, setSelectedProgramId] = useState('');
  const [selectedRegistryClass, setSelectedRegistryClass] = useState(''); // class id
  const [defaultClass, setDefaultClass] = useState(''); // canonical academic grade
  const [selectedArm, setSelectedArm] = useState(''); // separate school arm
  const [selectedTermId, setSelectedTermId] = useState('');
  const [bandClassSelections, setBandClassSelections] = useState<Record<string, string>>({});
  const [creatingBand, setCreatingBand] = useState<string | null>(null);
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
  const [selectedResultIds, setSelectedResultIds] = useState<string[]>([]);
  const [dbDupNames, setDbDupNames] = useState<Set<string>>(new Set()); // names already in DB at selected school
  const [dbSwapNames, setDbSwapNames] = useState<Map<string, string>>(new Map()); // incoming name → existing swapped name
  const [dbDupNameKeys, setDbDupNameKeys] = useState<Set<string>>(new Set()); // normalized keys (order/casing/disambiguator)
  const [checkingDups, setCheckingDups] = useState(false);
  const [activeTab, setActiveTab] = useState<'register' | 'vault' | 'unified'>('register');
  const [isSingleModalOpen, setIsSingleModalOpen] = useState(false);
  // Vault/history batch actions
  const [batchAssignPanel, setBatchAssignPanel] = useState<string | null>(null);
  const [batchAssignSchool, setBatchAssignSchool] = useState('');
  const [batchAssignClass, setBatchAssignClass] = useState('');
  const [vaultSchools, setVaultSchools] = useState<{id: string; name: string}[]>([]);
  const [vaultClasses, setVaultClasses] = useState<{id: string; name: string; school_id: string}[]>([]);
  const [historySchoolId, setHistorySchoolId] = useState('all');

  // Legacy credential state retained only for compatibility; Records is the operational surface.
  const [unifiedResults, setUnifiedResults] = useState<any[]>([]);
  const [loadingUnified, setLoadingUnified] = useState(false);
  const [unifiedSchoolId, setUnifiedSchoolId] = useState('all');
  const [unifiedSchoolName, setUnifiedSchoolName] = useState('All Schools');
  const [unifiedClass, setUnifiedClass] = useState('');
  const [unifiedBatchFilter, setUnifiedBatchFilter] = useState<'all' | 'bulk' | 'single'>('all');
  const [unifiedSearchQuery, setUnifiedSearchQuery] = useState('');
  const [dbEmailConflicts, setDbEmailConflicts] = useState<Map<string, { full_name: string; role: string }>>(new Map());

  const fetchUnifiedCredentials = useCallback(async (schoolId: string) => {
    if (!schoolId) {
      setUnifiedResults([]);
      return;
    }
    setLoadingUnified(true);
    try {
      let query = supabase
        .from('registration_batches')
        .select('*')
        .order('created_at', { ascending: false });

      if (schoolId === 'all') {
        const allowedSchoolIds = schools.map(s => s.id);
        if (allowedSchoolIds.length > 0) {
          query = query.in('school_id', allowedSchoolIds);
        } else {
          setUnifiedResults([]);
          setLoadingUnified(false);
          return;
        }
      } else {
        query = query.eq('school_id', schoolId);
      }

      const { data: batches, error: batchErr } = await query;

      if (batchErr) throw batchErr;
      if (!batches || batches.length === 0) {
        setUnifiedResults([]);
        setLoadingUnified(false);
        return;
      }

      const batchMap = new Map<string, any>(batches.map(b => [b.id, b]));
      const batchIds = batches.map(b => b.id);

      const { data: results, error: resultsErr } = await supabase
        .from('registration_results')
        .select('*')
        .in('batch_id', batchIds);

      if (resultsErr) throw resultsErr;

      const hydrated = (results ?? []).map((r: any) => {
        const batch = batchMap.get(r.batch_id);
        const isSingleReg = batch?.class_name === 'Single Student Registrations';
        return {
          ...r,
          school_id: batch?.school_id || schoolId,
          school_name: batch?.school_name || '',
          batch_name: batch?.class_name || 'General Batch',
          is_single_registration: isSingleReg,
        };
      });

      setUnifiedResults(hydrated);
    } catch (err: any) {
      console.error('Error fetching unified credentials:', err);
      toast.error('Failed to load unified credentials: ' + err.message);
    } finally {
      setLoadingUnified(false);
    }
  }, [supabase, schools]);

  const uniqueUnifiedClasses = useMemo(() => {
    return [...new Set(unifiedResults.map((r: any) => r.class_name).filter(Boolean))].sort() as string[];
  }, [unifiedResults]);

  const filteredUnifiedResults = useMemo(() => {
    return unifiedResults.filter((r: any) => {
      // 1. Class filter
      if (unifiedClass && r.class_name !== unifiedClass) return false;

      // 2. Batch type filter
      if (unifiedBatchFilter === 'bulk' && r.is_single_registration) return false;
      if (unifiedBatchFilter === 'single' && !r.is_single_registration) return false;

      // 3. Search query filter
      if (unifiedSearchQuery) {
        const query = unifiedSearchQuery.trim().toLowerCase();
        const name = (r.full_name || '').toLowerCase();
        const email = (r.email || '').toLowerCase();
        if (!name.includes(query) && !email.includes(query)) return false;
      }

      return true;
    });
  }, [unifiedResults, unifiedClass, unifiedBatchFilter, unifiedSearchQuery]);

  const handlePrintUnifiedRoster = (resultsToPrint: any[]) => {
    const valid = resultsToPrint.filter(r => r.status !== 'failed');
    if (valid.length === 0) {
      toast.error('No valid student credentials found to print.');
      return;
    }

    const grouped: Record<string, any[]> = {};
    valid.forEach(r => {
      const cls = r.class_name || 'Unassigned / General';
      if (!grouped[cls]) grouped[cls] = [];
      grouped[cls].push(r);
    });

    const sortedClasses = Object.keys(grouped).sort();
    const dateStr = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
    const schoolNameStr = unifiedSchoolName || valid[0]?.school_name || 'Rillcod Academy';

    const html = `
      <html><head><title>Unified Student Credentials Roster - ${schoolNameStr}</title>
      <style>
        @page { margin: 15mm; size: A4; }
        body { font-family: system-ui, -apple-system, sans-serif; background: #fff; margin: 0; padding: 0; color: #111; }
        .header { display: flex; align-items: flex-end; justify-content: space-between; border-bottom: 2px solid #ea580c; padding-bottom: 12px; margin-bottom: 25px; }
        .logo-area { display: flex; align-items: center; gap: 12px; }
        .brand { font-weight: 900; font-size: 26px; letter-spacing: -0.02em; line-height: 1; }
        .brand span { color: #ea580c; }
        .title { text-transform: uppercase; font-weight: 800; font-size: 13px; color: #4b5563; margin-top: 4px; letter-spacing: 0.05em; }
        .meta-box { background: #fafafa; border: 1px solid #e5e7eb; padding: 12px 18px; display: flex; gap: 40px; margin-bottom: 30px; font-size: 11px; font-weight: 700; color: #374151; text-transform: uppercase; }
        .meta-box span { color: #ea580c; }
        .class-section { margin-bottom: 35px; break-inside: avoid; }
        .class-title { font-size: 14px; font-weight: 900; color: #ea580c; border-bottom: 2px solid #e5e7eb; padding-bottom: 6px; margin-bottom: 12px; text-transform: uppercase; letter-spacing: 0.05em; display: flex; justify-content: space-between; }
        .class-count { font-size: 11px; color: #6b7280; font-weight: 700; }
        table { border-collapse: collapse; font-size: 10.5px; text-transform: uppercase; width: 100%; border: 1px solid #e5e7eb; margin-bottom: 10px; }
        th { background: #f9fafb; color: #111827; text-align: left; padding: 8px 10px; border: 1px solid #e5e7eb; font-weight: 800; font-size: 9.5px; }
        td { padding: 7px 10px; border: 1px solid #e5e7eb; font-weight: 600; color: #374151; }
        .email, .pwd { font-family: monospace; font-weight: 700; font-size: 10.5px; text-transform: none; color: #000; }
        .footer { margin-top: 40px; padding-top: 15px; border-top: 1px dashed #e5e7eb; font-size: 9px; color: #9ca3af; text-align: center; font-weight: 700; letter-spacing: 0.02em; }
        @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
      </style>
      </head><body>
        <div class="header">
           <div class="logo-area">
             <img src="${window.location.origin}/logo.png" style="height:36px; display:block;" />
             <div>
               <div class="brand">RILLCOD<span>.</span></div>
               <div class="title">Unified Credentials Roster</div>
             </div>
           </div>
           <div style="text-align:right;">
             <div style="font-weight:900; font-size: 12px; text-transform: uppercase; letter-spacing: 0.05em; color: #111827;">${schoolNameStr}</div>
             <div style="font-size: 9.5px; color: #6b7280; font-weight: bold; margin-top: 4px;">DATED: ${dateStr}</div>
           </div>
        </div>
        <div class="meta-box">
           <div>TOTAL STUDENTS: <span>${valid.length}</span></div>
           <div>SCHOOL NODES: <span>${schoolNameStr}</span></div>
           <div>GENERATE SOURCE: <span>UNIFIED ARCHIVE VAULT</span></div>
        </div>
        
        ${sortedClasses.map(cls => {
          const classStudents = grouped[cls];
          return `
            <div class="class-section">
              <div class="class-title">
                <span>Class: ${cls}</span>
                <span class="class-count">${classStudents.length} Student${classStudents.length !== 1 ? 's' : ''}</span>
              </div>
              <table>
                <thead>
                  <tr>
                    <th style="width:30px;">#</th>
                    <th style="width:150px;">Student ID</th>
                    <th>Full Name</th>
                    <th>System Email (Login)</th>
                    <th style="width:180px;">Access Cipher (Password)</th>
                  </tr>
                </thead>
                <tbody>
                  ${classStudents.map((r, idx) => {
                    const sCode = r.portal_user_id ? accessCardCodeForStudent(r.portal_user_id) : 'RC-PENDING';
                    return `
                      <tr>
                        <td>${idx + 1}</td>
                        <td class="email" style="font-weight:900; color:#ea580c;">${sCode}</td>
                        <td style="font-weight:800; color:#111827;">${r.full_name}</td>
                        <td class="email">${r.email}</td>
                        <td class="pwd" style="color:#b45309; font-weight:900;">${r.password || '—'}</td>
                      </tr>
                    `;
                  }).join('')}
                </tbody>
              </table>
            </div>
          `;
        }).join('')}
        
        <div class="footer">
          CONFIDENTIAL ADMINISTRATIVE SPECIFICATION • PRINTED FROM RILLCOD ACADEMY VAULT ARCHIVE SYSTEM • PORTAL: https://rillcod.com/login
        </div>
      <script>window.onload = () => { window.print(); }</script>
      </body></html>
    `;

    const win = window.open('', '_blank');
    win?.document.write(html);
    win?.document.close();
  };

  const handlePrintUnifiedSlips = async (resultsToPrint: any[]) => {
    const valid = resultsToPrint.filter(r => r.status !== 'failed');
    if (valid.length === 0) {
      toast.error('No valid records found for printing.');
      return;
    }

    const cardCfg = await getCardCfg();
    const acc = cardCfg?.accentColor || '#ea580c';
    const orgName = cardCfg?.orgName || 'RILLCOD TECHNOLOGIES';
    const orgWeb = cardCfg?.orgWebsite || 'www.rillcod.com';
    const footLeft = cardCfg?.footerLeft || 'rillcod.com/login';
    const hStyle: string = cardCfg?.headerStyle || 'band';
    const fieldVis = (key: string) => {
      if (!cardCfg?.fields) return true;
      return cardCfg.fields.find((f: any) => f.key === key)?.visible ?? true;
    };

    const logoUrl = window.location.origin + '/logo.png';
    const dateStr = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
    const schoolNameStr = unifiedSchoolName || valid[0]?.school_name || 'RILLCOD ACADEMY';

    const sorted = [...valid].sort((a, b) => {
      const classA = a.class_name || '';
      const classB = b.class_name || '';
      if (classA !== classB) return classA.localeCompare(classB);
      return a.full_name.localeCompare(b.full_name);
    });

    // QR codes generated locally (offline-safe)
    const qrMap = await qrDataUrls(sorted
      .filter(r => r.portal_user_id)
      .map(r => 'https://rillcod.com/result-check/' + accessCardCodeForStudent(r.portal_user_id)), 150);

    const html = `
      <!DOCTYPE html><html><head><title>Unified Student Slips — ${schoolNameStr}</title>
      <style>
        @page { size: A4 portrait; margin: 0; }
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: 'Inter','Segoe UI',system-ui,sans-serif; background:#fff; color:#111827; padding:10mm; }
        .grid { display:grid; grid-template-columns:80mm 80mm; grid-auto-rows:60mm; gap:8mm; justify-content:center; }
        .card { width:80mm; height:60mm; border:.3mm solid #d1d5db; ${hStyle === 'border' ? `border-left:1.5mm solid ${acc};` : ''} display:flex; flex-direction:column; overflow:hidden; break-inside:avoid; background:#fff; }
        .chdr { background:${acc}; min-height:9mm; padding:0 2.5mm; display:flex; align-items:center; gap:1.5mm; flex-shrink:0; }
        .mhdr { border-bottom:1.5mm solid ${acc}; min-height:9mm; padding:0 2.5mm; display:flex; align-items:center; gap:1.5mm; flex-shrink:0; }
        .shdr { min-height:9mm; padding:0 2.5mm; display:flex; align-items:center; gap:1.5mm; flex-shrink:0; border-bottom:.1mm solid #f0f0f0; }
        .logo  { width:5mm; height:5mm; object-fit:contain; flex-shrink:0; }
        .org-name { font-size:2.5mm; font-weight:900; color:${hStyle === 'band' ? '#fff' : '#111'}; text-transform:uppercase; line-height:1; }
        .org-web  { font-size:1.6mm; color:${hStyle === 'band' ? 'rgba(255,255,255,.85)' : acc}; font-weight:700; margin-top:.4mm; }
        .cbadge { margin-left:auto; background:${hStyle === 'band' ? 'rgba(0,0,0,.22)' : acc}; color:#fff; padding:.6mm 1.8mm; font-size:1.8mm; font-weight:900; text-transform:uppercase; flex-shrink:0; }
        .cbody { display:flex; flex:1; min-height:0; }
        .info  { flex:1; padding:1.5mm 2mm; display:flex; flex-direction:column; gap:.8mm; overflow:hidden; min-width:0; ${fieldVis('qr') ? 'border-right:.3mm solid #f0f0f0;' : ''} }
        .school { font-size:1.9mm; font-weight:900; color:${acc}; text-transform:uppercase; letter-spacing:.1mm; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
        .sname  { font-size:3.8mm; font-weight:900; color:#111; text-transform:uppercase; line-height:1.15; overflow:hidden; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; margin:.5mm 0 1mm; }
        .sep    { height:.3mm; background:#f0f0f0; margin:.5mm 0; }
        .field  { display:flex; flex-direction:column; gap:.3mm; }
        .lbl    { font-size:1.5mm; font-weight:700; color:#9ca3af; text-transform:uppercase; letter-spacing:.2mm; }
        .val    { font-size:2.1mm; font-weight:700; font-family:monospace; color:#111; word-break:break-all; line-height:1.25; }
        .val-a  { font-size:2.2mm; font-weight:800; font-family:monospace; color:${acc}; line-height:1.25; }
        .qrp { width:22mm; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:.8mm; padding:1.5mm; background:#fafafa; flex-shrink:0; }
        .qr  { width:17mm; height:17mm; border:.3mm solid #e5e7eb; display:block; }
        .qrl { font-size:1.4mm; color:#9ca3af; text-align:center; line-height:1.2; }
        .qrc { font-size:1.7mm; font-weight:900; font-family:monospace; color:${acc}; text-align:center; }
        .cftr    { display:flex; justify-content:space-between; align-items:center; padding:0 2mm; border-top:.3mm solid #f0f0f0; font-size:1.5mm; color:#9ca3af; font-weight:600; flex-shrink:0; background:#fafafa; height:5mm; }
        .cftr-id { font-family:monospace; color:#374151; font-weight:900; font-size:1.7mm; }
        @media print { body { -webkit-print-color-adjust:exact; print-color-adjust:exact; } }
      </style>
      </head><body>
      <div class="grid">
        ${sorted.map(r => {
          const pId = r.portal_user_id || '';
          const sCode = pId ? accessCardCodeForStudent(pId) : 'RC-PENDING';
          const qrSrc = qrMap.get('https://rillcod.com/result-check/' + sCode) || '';

          const headerHtml = hStyle === 'band' ? `
            <div class="chdr">
              <img src="${logoUrl}" class="logo" />
              <div><div class="org-name">${orgName}</div><div class="org-web">${orgWeb}</div></div>
              ${fieldVis('className') && r.class_name ? `<div class="cbadge">${r.class_name}</div>` : ''}
            </div>` : hStyle === 'minimal' ? `
            <div class="mhdr">
              <img src="${logoUrl}" class="logo" />
              <div><div class="org-name">${orgName}</div></div>
              ${fieldVis('className') && r.class_name ? `<div class="cbadge">${r.class_name}</div>` : ''}
            </div>` : `
            <div class="shdr">
              <img src="${logoUrl}" class="logo" />
              <div><div class="org-name">${orgName}</div><div class="org-web" style="color:${acc}">${orgWeb}</div></div>
              ${fieldVis('className') && r.class_name ? `<div class="cbadge">${r.class_name}</div>` : ''}
            </div>`;

          return `
            <div class="card">
              ${headerHtml}
              <div class="cbody">
                <div class="info">
                  ${fieldVis('school') ? `<div class="school">${r.school_name || schoolNameStr}</div>` : ''}
                  <div class="sname">${r.full_name || 'N/A'}</div>
                  <div class="sep"></div>
                  ${fieldVis('email') ? `<div class="field"><div class="lbl">Email</div><div class="val">${r.email || 'N/A'}</div></div>` : ''}
                  ${fieldVis('password') ? `<div class="field"><div class="lbl">Temporary Password</div><div class="val-a">${r.password || 'Contact Admin'}</div></div>` : ''}
                  ${fieldVis('studentId') ? `<div class="field"><div class="lbl">Student ID</div><div class="val-a">${sCode}</div></div>` : ''}
                </div>
                ${fieldVis('qr') && qrSrc ? `
                <div class="qrp">
                  <img src="${qrSrc}" class="qr" />
                  <div class="qrl">Scan to verify</div>
                  <div class="qrc">${sCode}</div>
                </div>` : ''}
              </div>
              <div class="cftr"><span>${footLeft}</span><span class="cftr-id">${sCode}</span></div>
            </div>`;
        }).join('')}
      </div>
      <script>window.onload = () => { window.print(); }</script>
      </body></html>
    `;

    const win = window.open('', '_blank');
    win?.document.write(html);
    win?.document.close();
  };

  const handleExportRosterPDF = (resultsToPrint: any[]) => {
    const validResults = resultsToPrint.filter(r => r.status !== 'failed');
    if (validResults.length === 0) {
      toast.error('No valid records found for PDF export.');
      return;
    }

    const doc = new jsPDF() as jsPDFWithPlugin;
    const dateStr = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
    const batchIdStr = validResults[0].batch_id?.slice(0, 8) || 'N/A';

    // Header
    doc.setFontSize(20);
    doc.setTextColor(234, 88, 12); // Orange-600
    doc.text('RILLCOD.', 14, 22);
    doc.setFontSize(10);
    doc.setTextColor(100);
    doc.text('OFFICIAL STUDENT ROSTER', 14, 28);

    doc.setFontSize(10);
    doc.text(`BATCH: ${batchIdStr}`, 196, 22, { align: 'right' });
    doc.text(`DATE: ${dateStr}`, 196, 28, { align: 'right' });

    doc.setDrawColor(200);
    doc.line(14, 32, 196, 32);

    // Stats
    doc.setFontSize(9);
    doc.text(`TOTAL ENROLLED: ${validResults.length}`, 14, 40);
    doc.text(`TARGET SECTOR: RILLCOD ACADEMY`, 14, 45);

    // Table
    const tableData = validResults.map((r, i) => [
      i + 1,
      r.full_name.toUpperCase(),
      (r.class_name || 'GENERAL').toUpperCase(),
      r.email,
      r.password || 'N/A'
    ]);

    doc.autoTable({
      startY: 55,
      head: [['#', 'Full Name', 'Academic Tier', 'System Email', 'Access Cipher']],
      body: tableData,
      theme: 'grid',
      headStyles: { fillColor: [31, 41, 55], textColor: [255, 255, 255], fontStyle: 'bold' },
      styles: { fontSize: 8, font: 'courier', cellPadding: 3 },
      columnStyles: {
        0: { cellWidth: 10 },
        1: { cellWidth: 'auto' },
        2: { cellWidth: 30 },
        3: { cellWidth: 50 },
        4: { cellWidth: 35 }
      }
    });

    // Footer
    const finalY = (doc as any).lastAutoTable.finalY || 150;
    doc.setFontSize(8);
    doc.setTextColor(150);
    doc.text('CONFIDENTIAL DOCUMENT • FOR ADMINISTRATIVE PURPOSES ONLY', 105, finalY + 20, { align: 'center' });
    doc.text('PORTAL: https://rillcod.com/login', 105, finalY + 25, { align: 'center' });

    doc.save(`rillcod_roster_${batchIdStr}_${new Date().getTime()}.pdf`);
    toast.success('Roster PDF generated successfully.');
  };

  // ── Read Card Builder config from DB ──────────────────────────────
  const getCardCfg = async (): Promise<any | null> => {
    try {
      const res = await fetch('/api/admin/settings');
      const data = await res.json();
      return data.config || null;
    } catch { return null; }
  };

  const handleExportCardsPDF = async (resultsToPrint: any[]) => {
    const validResults = resultsToPrint.filter(r => r.status !== 'failed');
    if (validResults.length === 0) {
      toast.error('No valid records found for PDF export.');
      return;
    }

    // Pull saved Card Builder design (accent, header style, fields, text)
    const cardCfg = await getCardCfg();
    const acc = cardCfg?.accentColor || '#ea580c';
    const orgName = cardCfg?.orgName || 'RILLCOD TECHNOLOGIES';
    const orgWeb = cardCfg?.orgWebsite || 'www.rillcod.com';
    const footLeft = cardCfg?.footerLeft || 'rillcod.com/login';
    const hStyle: string = cardCfg?.headerStyle || 'band';
    const fieldVis = (key: string) => {
      if (!cardCfg?.fields) return true;
      return cardCfg.fields.find((f: any) => f.key === key)?.visible ?? true;
    };

    const hexR = (hex: string) => parseInt(hex.slice(1, 3), 16);
    const hexG = (hex: string) => parseInt(hex.slice(3, 5), 16);
    const hexB = (hex: string) => parseInt(hex.slice(5, 7), 16);

    const doc = new jsPDF() as jsPDFWithPlugin;

    const cardW = 80, cardH = 60;
    const gapX = 8, gapY = 8;
    const marginX = (210 - 2 * cardW - gapX) / 2;
    const marginY = (297 - 4 * cardH - 3 * gapY) / 2;

    validResults.forEach((res, i) => {
      const posInPage = i % 8;
      if (posInPage === 0 && i > 0) doc.addPage();

      const col = posInPage % 2;
      const row = Math.floor(posInPage / 2);
      const x = marginX + col * (cardW + gapX);
      const y = marginY + row * (cardH + gapY);

      // Card border
      doc.setDrawColor(229, 231, 235);
      doc.setLineWidth(0.3);
      doc.rect(x, y, cardW, cardH);

      // Header — follows builder style
      if (hStyle === 'band') {
        doc.setFillColor(hexR(acc), hexG(acc), hexB(acc));
        doc.rect(x, y, cardW, 8.5, 'F');
        doc.setFontSize(7); doc.setTextColor(255, 255, 255); doc.setFont('helvetica', 'bold');
        doc.text(orgName, x + 3, y + 5);
        doc.setFontSize(4.5); doc.setFont('helvetica', 'normal');
        doc.text(orgWeb, x + 3, y + 7.5);
      } else if (hStyle === 'border') {
        doc.setFillColor(hexR(acc), hexG(acc), hexB(acc));
        doc.rect(x, y, 1.5, cardH, 'F');
        doc.setFontSize(7); doc.setTextColor(17, 24, 39); doc.setFont('helvetica', 'bold');
        doc.text(orgName, x + 4, y + 6);
        doc.setFontSize(5); doc.setTextColor(hexR(acc), hexG(acc), hexB(acc));
        doc.text(orgWeb, x + 4, y + 9.5);
      } else {
        doc.setDrawColor(hexR(acc), hexG(acc), hexB(acc)); doc.setLineWidth(0.8);
        doc.line(x, y + 10, x + cardW, y + 10);
        doc.setFontSize(7); doc.setTextColor(17, 24, 39); doc.setFont('helvetica', 'bold');
        doc.text(orgName, x + 3, y + 6);
      }

      // Class badge
      if (fieldVis('className') && res.class_name) {
        const badgeText = res.class_name.toUpperCase();
        const bw = badgeText.length * 1.5 + 4;
        if (hStyle === 'band') { doc.setFillColor(0, 0, 0); }
        else { doc.setFillColor(hexR(acc), hexG(acc), hexB(acc)); }
        doc.rect(x + cardW - bw - 1, y + 2, bw, 4.5, 'F');
        doc.setFontSize(5.5); doc.setTextColor(255, 255, 255);
        doc.text(badgeText, x + cardW - bw / 2 - 1, y + 5.2, { align: 'center' });
      }

      const ix = x + (hStyle === 'border' ? 4 : 3);
      const iy = y + (hStyle === 'band' ? 13 : 15);

      // Student name
      doc.setFontSize(10.5); doc.setTextColor(17, 24, 39); doc.setFont('helvetica', 'bold');
      doc.text(res.full_name.toUpperCase(), ix, iy);

      doc.setDrawColor(243, 244, 246); doc.setLineWidth(0.2);
      doc.line(ix, iy + 2, x + cardW - 18, iy + 2);

      // Dynamic fields based on builder visibility
      let fy = iy + 7;
      if (fieldVis('school')) {
        doc.setFontSize(5.5); doc.setTextColor(hexR(acc), hexG(acc), hexB(acc)); doc.setFont('helvetica', 'bold');
        doc.text((res.school_name || selectedSchoolName || 'RILLCOD ACADEMY').toUpperCase(), ix, fy);
        fy += 5;
      }
      if (fieldVis('email')) {
        doc.setFontSize(4.5); doc.setTextColor(156, 163, 175); doc.setFont('helvetica', 'normal');
        doc.text('EMAIL', ix, fy);
        doc.setFontSize(6.5); doc.setTextColor(17, 24, 39); doc.setFont('courier', 'bold');
        doc.text(doc.splitTextToSize(res.email, cardW - 28)[0], ix, fy + 3.5);
        fy += 8;
      }
      if (fieldVis('password')) {
        doc.setFontSize(4.5); doc.setTextColor(156, 163, 175); doc.setFont('helvetica', 'normal');
        doc.text('TEMPORARY PASSWORD', ix, fy);
        doc.setFontSize(6.5); doc.setTextColor(hexR(acc), hexG(acc), hexB(acc)); doc.setFont('courier', 'bold');
        doc.text(res.password || 'Contact Admin', ix, fy + 3.5);
        fy += 8;
      }

      const sCode = res.portal_user_id ? accessCardCodeForStudent(res.portal_user_id) : 'RC-PENDING';
      if (fieldVis('studentId')) {
        doc.setFontSize(5); doc.setTextColor(hexR(acc), hexG(acc), hexB(acc)); doc.setFont('courier', 'bold');
        doc.text(sCode, ix, y + cardH - 11);
      }

      // Footer
      doc.setDrawColor(243, 244, 246);
      doc.line(ix, y + cardH - 7, x + cardW - 2, y + cardH - 7);
      doc.setFontSize(5); doc.setTextColor(156, 163, 175); doc.setFont('helvetica', 'normal');
      doc.text(footLeft, ix, y + cardH - 3);
      doc.setTextColor(55, 65, 81); doc.setFont('courier', 'bold');
      doc.text(sCode, x + cardW - 2, y + cardH - 3, { align: 'right' });
    });

    doc.save(`rillcod_access_cards_${new Date().getTime()}.pdf`);
    toast.success('Access cards PDF generated with your card design.');
  };

  const handleMassPrintReport = (resultsToPrint: any[]) => {
    const validResults = resultsToPrint.filter(r => r.status !== 'failed');
    if (validResults.length === 0) {
      toast.error('No valid records found for printing.');
      return;
    }

    const dateStr = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
    const batchIdStr = validResults[0].batch_id?.slice(0, 8) || 'N/A';

    const html = `
      <html><head><title>Student Registration Roster - ${dateStr}</title>
      <style>
        @page { margin: 15mm; size: A4; }
        body { font-family: system-ui, -apple-system, sans-serif; background: #fff; margin: 0; padding: 0; color: #111; }
        .header { display: flex; align-items: flex-end; justify-content: space-between; border-bottom: 2px solid #000; padding-bottom: 10px; margin-bottom: 20px; }
        .logo-area { display: flex; align-items: center; gap: 12px; }
        .brand { font-weight: 900; font-size: 24px; letter-spacing: -0.02em; line-height: 1; }
        .brand span { color: #ea580c; }
        .title { text-transform: uppercase; font-weight: 800; font-size: 14px; color: #4b5563; }
        .meta { display: flex; gap: 40px; margin-bottom: 20px; font-size: 12px; font-weight: 600; color: #374151; text-transform: uppercase; }
        table { border-collapse: collapse; font-size: 11px; text-transform: uppercase; width: 100%; border: 1px solid #e5e7eb; }
        th { background: #f3f4f6; color: #111; text-align: left; padding: 10px; border: 1px solid #e5e7eb; font-weight: 800; white-space: nowrap; }
        td { padding: 8px 10px; border: 1px solid #e5e7eb; font-weight: 600; }
        .email, .pwd { font-family: monospace; font-weight: 700; font-size: 11px; text-transform: none; }
        .footer { margin-top: 30px; padding-top: 15px; border-top: 1px dashed #e5e7eb; font-size: 10px; color: #6b7280; text-align: center; font-weight: 700; }
      </style>
      </head><body>
        <div class="header">
           <div class="logo-area">
             <img src="${window.location.origin}/logo.png" style="height:38px; display:block;" />
             <div>
               <div class="brand">RILLCOD<span>.</span></div>
               <div class="title">Official Student Roster</div>
             </div>
           </div>
           <div style="text-align:right;">
             <div style="font-weight:900; font-size: 14px;">BATCH record: ${batchIdStr}</div>
             <div style="font-size: 10px; color: #6b7280; font-weight: bold; margin-top: 4px;">DATED: ${dateStr}</div>
           </div>
        </div>
        <div class="meta">
           <div>TOTAL ENROLLED: ${validResults.length}</div>
           <div>TARGET SECTOR: RILLCOD ACADEMY</div>
        </div>
        <table>
          <thead>
            <tr>
              <th style="width:30px;">#</th>
              <th>Full Name</th>
              <th>Academic Tier</th>
              <th>System Email</th>
              <th>Access Cipher</th>
            </tr>
          </thead>
          <tbody>
            ${validResults.map((r, i) => `
              <tr>
                <td>${i + 1}</td>
                <td>${r.full_name}</td>
                <td>${r.class_name || 'GENERAL'}</td>
                <td class="email">${r.email}</td>
                <td class="pwd">${r.password}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
        <div class="footer">
          CONFIDENTIAL DOCUMENT • FOR ADMINISTRATIVE PURPOSES ONLY • PORTAL: https://rillcod.com/login
        </div>
      <script>window.onload = () => { window.print(); }</script>
      </body></html>
    `;

    const win = window.open('', '_blank');
    win?.document.write(html);
    win?.document.close();
  };

  const handleMassPrint = async (resultsToPrint: any[]) => {
    const validResults = resultsToPrint.filter(r => r.status !== 'failed');
    if (validResults.length === 0) {
      toast.error('No valid records found for printing.');
      return;
    }

    const cardCfg = await getCardCfg();
    const acc = cardCfg?.accentColor || '#ea580c';
    const orgName = cardCfg?.orgName || 'RILLCOD TECHNOLOGIES';
    const orgWeb = cardCfg?.orgWebsite || 'www.rillcod.com';
    const footLeft = cardCfg?.footerLeft || 'rillcod.com/login';
    const hStyle: string = cardCfg?.headerStyle || 'band';
    const fieldVis = (key: string) => {
      if (!cardCfg?.fields) return true;
      return cardCfg.fields.find((f: any) => f.key === key)?.visible ?? true;
    };

    const logoUrl = window.location.origin + '/logo.png';
    const dateStr = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });

    // QR codes generated locally (offline-safe)
    const massQrMap = await qrDataUrls(validResults
      .filter(r => r.portal_user_id)
      .map(r => 'https://rillcod.com/result-check/' + accessCardCodeForStudent(r.portal_user_id)), 150);

    const html = `
      <!DOCTYPE html><html><head><title>Access Cards — ${dateStr}</title>
      <style>
        @page { size: A4 portrait; margin: 0; }
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: 'Inter','Segoe UI',system-ui,sans-serif; background:#fff; color:#111827; padding:10mm; }
        .grid { display:grid; grid-template-columns:80mm 80mm; grid-auto-rows:60mm; gap:8mm; justify-content:center; }
        .card { width:80mm; height:60mm; border:.3mm solid #d1d5db; ${hStyle === 'border' ? `border-left:1.5mm solid ${acc};` : ''} display:flex; flex-direction:column; overflow:hidden; break-inside:avoid; background:#fff; }
        .chdr { background:${acc}; min-height:9mm; padding:0 2.5mm; display:flex; align-items:center; gap:1.5mm; flex-shrink:0; }
        .mhdr { border-bottom:1.5mm solid ${acc}; min-height:9mm; padding:0 2.5mm; display:flex; align-items:center; gap:1.5mm; flex-shrink:0; }
        .shdr { min-height:9mm; padding:0 2.5mm; display:flex; align-items:center; gap:1.5mm; flex-shrink:0; border-bottom:.1mm solid #f0f0f0; }
        .logo  { width:5mm; height:5mm; object-fit:contain; flex-shrink:0; }
        .org-name { font-size:2.5mm; font-weight:900; color:${hStyle === 'band' ? '#fff' : '#111'}; text-transform:uppercase; line-height:1; }
        .org-web  { font-size:1.6mm; color:${hStyle === 'band' ? 'rgba(255,255,255,.85)' : acc}; font-weight:700; margin-top:.4mm; }
        .cbadge { margin-left:auto; background:${hStyle === 'band' ? 'rgba(0,0,0,.22)' : acc}; color:#fff; padding:.6mm 1.8mm; font-size:1.8mm; font-weight:900; text-transform:uppercase; flex-shrink:0; }
        .cbody { display:flex; flex:1; min-height:0; }
        .info  { flex:1; padding:1.5mm 2mm; display:flex; flex-direction:column; gap:.8mm; overflow:hidden; min-width:0; ${fieldVis('qr') ? 'border-right:.3mm solid #f0f0f0;' : ''} }
        .school { font-size:1.9mm; font-weight:900; color:${acc}; text-transform:uppercase; letter-spacing:.1mm; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
        .sname  { font-size:3.8mm; font-weight:900; color:#111; text-transform:uppercase; line-height:1.15; overflow:hidden; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; margin:.5mm 0 1mm; }
        .sep    { height:.3mm; background:#f0f0f0; margin:.5mm 0; }
        .field  { display:flex; flex-direction:column; gap:.3mm; }
        .lbl    { font-size:1.5mm; font-weight:700; color:#9ca3af; text-transform:uppercase; letter-spacing:.2mm; }
        .val    { font-size:2.1mm; font-weight:700; font-family:monospace; color:#111; word-break:break-all; line-height:1.25; }
        .val-a  { font-size:2.2mm; font-weight:800; font-family:monospace; color:${acc}; line-height:1.25; }
        .qrp { width:22mm; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:.8mm; padding:1.5mm; background:#fafafa; flex-shrink:0; }
        .qr  { width:17mm; height:17mm; border:.3mm solid #e5e7eb; display:block; }
        .qrl { font-size:1.4mm; color:#9ca3af; text-transform:uppercase; text-align:center; line-height:1.2; }
        .qrc { font-size:1.7mm; font-weight:900; font-family:monospace; color:${acc}; text-align:center; }
        .cftr    { display:flex; justify-content:space-between; align-items:center; padding:0 2mm; border-top:.3mm solid #f0f0f0; font-size:1.5mm; color:#9ca3af; font-weight:600; flex-shrink:0; background:#fafafa; height:5mm; }
        .cftr-id { font-family:monospace; color:#374151; font-weight:900; font-size:1.7mm; }
        @media print { body { -webkit-print-color-adjust:exact; print-color-adjust:exact; } }
      </style>
      </head><body>
      <div class="grid">
        ${validResults.map(r => {
      const pId = (r.portal_user_id || '');
      const sCode = pId ? accessCardCodeForStudent(pId) : 'RC-PENDING';
      const qrSrc = massQrMap.get('https://rillcod.com/result-check/' + sCode) || '';

      // Build header HTML based on builder style
      const headerHtml = hStyle === 'band' ? `
              <div class="chdr">
                <img src="${logoUrl}" class="logo" />
                <div><div class="org-name">${orgName}</div><div class="org-web">${orgWeb}</div></div>
                ${fieldVis('className') && r.class_name ? `<div class="cbadge">${r.class_name}</div>` : ''}
              </div>` : hStyle === 'minimal' ? `
              <div class="mhdr">
                <img src="${logoUrl}" class="logo" />
                <div><div class="org-name">${orgName}</div></div>
                ${fieldVis('className') && r.class_name ? `<div class="cbadge">${r.class_name}</div>` : ''}
              </div>` : `
              <div class="shdr">
                <img src="${logoUrl}" class="logo" />
                <div><div class="org-name">${orgName}</div><div class="org-web" style="color:${acc}">${orgWeb}</div></div>
                ${fieldVis('className') && r.class_name ? `<div class="cbadge">${r.class_name}</div>` : ''}
              </div>`;

      return `
          <div class="card">
            ${headerHtml}
            <div class="cbody">
              <div class="info">
                ${fieldVis('school') ? `<div class="school">${r.school_name || selectedSchoolName || 'RILLCOD ACADEMY'}</div>` : ''}
                <div class="sname">${r.full_name || 'N/A'}</div>
                <div class="sep"></div>
                ${fieldVis('email') ? `<div class="field"><div class="lbl">Email</div><div class="val">${r.email || 'N/A'}</div></div>` : ''}
                ${fieldVis('password') ? `<div class="field"><div class="lbl">Temporary Password</div><div class="val-a">${r.password || 'Contact Admin'}</div></div>` : ''}
                ${fieldVis('studentId') ? `<div class="field"><div class="lbl">Student ID</div><div class="val-a">${sCode}</div></div>` : ''}
              </div>
              ${fieldVis('qr') && qrSrc ? `
              <div class="qrp">
                <img src="${qrSrc}" class="qr" />
                <div class="qrl">Scan to verify</div>
                <div class="qrc">${sCode}</div>
              </div>` : ''}
            </div>
            <div class="cftr"><span>${footLeft}</span><span class="cftr-id">${sCode}</span></div>
          </div>`;
    }).join('')}
      </div>
      <script>window.onload = () => { window.print(); }</script>
      </body></html>
    `;

    const win = window.open('', '_blank');
    win?.document.write(html);
    win?.document.close();
  };



  useEffect(() => {
    const saved = sessionStorage.getItem('last_bulk_reg');
    if (saved) setHasRecoverable(true);
  }, []);

  const fetchHistory = useCallback(async () => {
    setLoadingHistory(true);
    const [batchRes, schoolRes, classRes] = await Promise.all([
      (supabase as any).from('registration_batches').select('*, registration_results(count)').order('created_at', { ascending: false }),
      fetch('/api/schools', { cache: 'no-store' }),
      fetch('/api/classes', { cache: 'no-store' }),
    ]);
    if (!batchRes.error && batchRes.data) {
      const creatorIds = [...new Set(batchRes.data.map((b: any) => b.created_by).filter(Boolean))];
      const { data: creators } = creatorIds.length > 0
        ? await (supabase as any)
          .from('portal_users')
          .select('id, full_name, role, email')
          .in('id', creatorIds)
        : { data: [] };
      const creatorById = new Map((creators ?? []).map((c: any) => [c.id, c]));
      const hydrated = batchRes.data.map((b: any) => ({
        ...b,
        student_count: b.registration_results?.[0]?.count ?? b.student_count ?? 0,
        creator: b.created_by ? creatorById.get(b.created_by) ?? null : null,
      }));
      setHistory(hydrated);
    }
    if (schoolRes.ok) {
      const sj = await schoolRes.json();
      setVaultSchools(sj.data ?? []);
    }
    if (classRes.ok) {
      const cj = await classRes.json();
      setVaultClasses(cj.data ?? []);
    }
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
      setActiveTab('register'); // Switch to main view to see results
    }
    setLoadingHistory(false);
  };

  const handleBulkDelete = async () => {
    if (selectedResultIds.length === 0) return;
    if (!confirm(`Permanently purge ${selectedResultIds.length} identity nodes from this batch archive? This action is irreversible.`)) return;

    setLoadingHistory(true);
    try {
      const res = await fetch(`/api/students/bulk-register?resultId=${selectedResultIds.join(',')}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Purge failed');

      setBatchResults(prev => prev.filter(r => !selectedResultIds.includes(r.id)));
      setSelectedResultIds([]);
      toast.success(`${selectedResultIds.length} Nodes Purged From Vault`);
      fetchHistory(); // refresh counts
    } catch (err: any) {
      toast.error('Purge failed: ' + err.message);
    } finally {
      setLoadingHistory(false);
    }
  };

  const handleDeleteBatch = async (batchId: string) => {
    if (!confirm('Delete this batch permanently? This will remove all student registration history for this session.')) return;
    setLoadingHistory(true);
    try {
      const res = await fetch(`/api/students/bulk-register?batchId=${batchId}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to delete batch');

      setHistory(prev => prev.filter(b => b.id !== batchId));
      if (selectedBatchId === batchId) {
        setSelectedBatchId(null);
        setBatchResults([]);
      }
      toast.success('Batch Archive Permanently Deleted');
    } catch (err: any) {
      toast.error('Delete failed: ' + err.message);
    } finally {
      setLoadingHistory(false);
    }
  };

  const handleExportCredentialsCSV = async (batch: any) => {
    setLoadingHistory(true);
    try {
      const { data: rows } = await (supabase as any).from('registration_results').select('*').eq('batch_id', batch.id);
      if (!rows?.length) { toast.error('No records found.'); return; }
      const header = 'Full Name,Email,Password,Class';
      const lines = rows.map((r: any) =>
        `"${(r.full_name || '').replace(/"/g, '""')}","${r.email || ''}","${r.password || ''}","${r.class_name || ''}"`
      );
      const csv = [header, ...lines].join('\n');
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `credentials-${(batch.class_name || 'batch').replace(/\s+/g, '-')}-${new Date(batch.created_at).toLocaleDateString('en-GB').replace(/\//g, '-')}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success('Credentials CSV downloaded.');
    } catch (e: any) {
      toast.error('Export failed: ' + e.message);
    } finally {
      setLoadingHistory(false);
    }
  };

  const handleBatchAssignClass = async (batchId: string) => {
    if (!batchAssignClass) { toast.error('Select a class first.'); return; }
    setLoadingHistory(true);
    try {
      const res = await fetch('/api/students/bulk-register', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'batch_assign_class', batchId, classId: batchAssignClass }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || 'Failed');
      toast.success(`${j.updated} student(s) assigned to class.`);
      setBatchAssignPanel(null);
      setBatchAssignSchool('');
      setBatchAssignClass('');
      fetchHistory();
    } catch (e: any) {
      toast.error('Assign failed: ' + e.message);
    } finally {
      setLoadingHistory(false);
    }
  };

  const handleBatchToggleActive = async (batchId: string, isActive: boolean) => {
    const label = isActive ? 'activate' : 'deactivate';
    if (!confirm(`${label.charAt(0).toUpperCase() + label.slice(1)} all students in this batch?`)) return;
    setLoadingHistory(true);
    try {
      const res = await fetch('/api/students/bulk-register', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'batch_toggle_active', batchId, isActive }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || 'Failed');
      toast.success(`${j.updated} student(s) ${label}d.`);
    } catch (e: any) {
      toast.error('Failed: ' + e.message);
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

  const selectedRegisteredClass = registryClasses.find((candidate) => candidate.id === selectedRegistryClass);
  const effectiveClassCode = defaultClass.trim();
  const selectedProgName = programmes.find((p) => p.id === selectedProgramId)?.name ?? '';
  const {
    pool: placementPool,
    preferredIds: preferredRegistryIds,
  } = buildBulkPlacementPool(registryClasses, {
    schoolId: selectedSchoolId,
    programId: selectedProgramId,
    programName: selectedProgName,
    termId: selectedTermId,
  });

  const placementPoolIds = placementPool.map((c) => c.id).join(',');

  // Clear registry class only when it leaves the visible placement pool
  useEffect(() => {
    if (!selectedRegistryClass) return;
    const visibleIds = placementPoolIds ? placementPoolIds.split(',') : [];
    if (!visibleIds.includes(selectedRegistryClass)) {
      setSelectedRegistryClass('');
    }
  }, [selectedSchoolId, selectedProgramId, selectedRegistryClass, placementPoolIds]);

  // A school is the only batch-level placement prerequisite. Grade can come
  // from the pasted text; class placement is resolved per band in review.
  const batchPlacementReady = Boolean(selectedSchoolId && selectedTermId);

  const canAccess = profile?.role === 'admin' || profile?.role === 'teacher';

  const refreshOwnedClasses = useCallback(async () => {
    if (!profile || !canAccess) return [] as ClassOption[];

    // Exact same source as the Classes page — that is where the teacher's real
    // created sections already appear.
    const params = new URLSearchParams();
    if (selectedSchoolId) params.set('school_id', selectedSchoolId);
    const res = await fetch(`/api/classes?${params.toString()}`, { cache: 'no-store' });
    const json = res.ok ? await res.json() : { data: [] };
    const rows = Array.isArray(json.data) ? json.data : [];

    const mapped: ClassOption[] = rows.map((c: any) => ({
      id: c.id,
      name: c.name,
      section_class: c.section_class ?? c.name ?? null,
      school_id: c.school_id ?? null,
      qa_grade_key: c.qa_grade_key ?? null,
      qa_grade_band: c.qa_grade_band ?? null,
      band_lvl: c.band_lvl ?? null,
      band_low: c.band_low ?? null,
      band_high: c.band_high ?? null,
      teacher_id: c.teacher_id ?? null,
      term_id: c.term_id ?? null,
      program_id: c.program_id ?? null,
      academic_terms: c.academic_terms ?? null,
      isRegistry: true,
    }));
    setRegistryClasses(mapped);
    return mapped;
  }, [profile, canAccess, selectedSchoolId]);

  // ── Load schools and programmes ──────────────────────────────────────────
  useEffect(() => {
    if (!profile || !canAccess) return;

    async function loadData() {
      // Teachers only see classes they own. Soft filters below keep those owned
      // sections visible even when term/programme metadata is incomplete.
      await refreshOwnedClasses();

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

      const termsResponse = await fetch('/api/settings/academic-year', { cache: 'no-store' });
      const termsJson = termsResponse.ok ? await termsResponse.json() : { terms: [] };
      const terms = (termsJson.terms ?? []) as AcademicTermOption[];
      const currentTerm = terms.find((term) => term.is_current) ?? terms[0];
      setAcademicTerms(terms);
      if (currentTerm) setSelectedTermId((current) => current || currentTerm.id);
    }

    loadData().catch(console.error);
  }, [profile?.id, profile?.role, canAccess, refreshOwnedClasses]); // eslint-disable-line react-hooks/exhaustive-deps

  // Keep the class list in sync when the selected school changes after first load.
  useEffect(() => {
    if (!profile || !canAccess || !selectedSchoolId) return;
    refreshOwnedClasses().catch(console.error);
  }, [selectedSchoolId]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Auto-fetch Unified Credentials on Tab active/Schools load ────────────────
  useEffect(() => {
    if (activeTab === 'unified' && schools.length > 0) {
      fetchUnifiedCredentials(unifiedSchoolId || 'all');
    }
  }, [activeTab, schools, unifiedSchoolId, fetchUnifiedCredentials]);

  // ── Debounced DB Duplicate Checking (server-side, not capped at ~1000 rows) ──
  useEffect(() => {
    if (step !== 'preview' || !selectedSchoolId || preview.length === 0) return;

    const timer = setTimeout(async () => {
      setCheckingDups(true);
      try {
        const res = await fetch('/api/students/bulk-register/check-duplicates', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            school_id: selectedSchoolId,
            school_name: selectedSchoolName || null,
            names: preview.map((s) => s.full_name),
            emails: preview.map((s) => s.email.toLowerCase()),
          }),
        });
        const data = res.ok ? await res.json() : { nameConflicts: [], emailConflicts: [] };

        const dupSet = new Set<string>();
        const swapMap = new Map<string, string>();
        const keySet = new Set<string>();
        for (const c of data.nameConflicts ?? []) {
          const norm = String(c.full_name ?? '').trim().replace(/\s+/g, ' ').toLowerCase();
          if (c.name_key) keySet.add(c.name_key);
          if (c.kind === 'swap') {
            if (norm) swapMap.set(norm, c.existing_full_name);
          } else if (norm) {
            dupSet.add(norm);
          }
        }
        setDbDupNames(dupSet);
        setDbSwapNames(swapMap);
        setDbDupNameKeys(keySet);

        const emailConflicts = new Map<string, { full_name: string; role: string }>();
        for (const c of data.emailConflicts ?? []) {
          if (c.email) emailConflicts.set(String(c.email).toLowerCase(), {
            full_name: c.full_name,
            role: c.role,
          });
        }
        setDbEmailConflicts(emailConflicts);
      } catch (err) {
        console.error('Error verifying duplicates:', err);
      } finally {
        setCheckingDups(false);
      }
    }, 500);

    return () => clearTimeout(timer);
  }, [preview, step, selectedSchoolId, selectedSchoolName]);

  function studentNameKey(name: string): string {
    return duplicateNameKey(name);
  }

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

  function updateDuplicateException(id: number, confirmed: boolean) {
    setPreview((prev) => prev.map((row) => row.id === id ? {
      ...row,
      duplicate_exception_confirmed: confirmed,
      duplicate_exception_reason: confirmed ? (row.duplicate_exception_reason ?? '') : undefined,
    } : row));
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
  const handlePreview = useCallback(async () => {
    if (!batchPlacementReady) { toast.error('Select a school and academic term before reviewing students.'); setSettingsOpen(true); return; }
    const freshClasses = await refreshOwnedClasses();
    const built = buildStudentList(namesText.split('\n'), defaultClass.trim() || undefined);
    if (!built.length) return;

    const progName = programmes.find((p) => p.id === selectedProgramId)?.name ?? '';
    const { pool } = buildBulkPlacementPool(freshClasses, {
      schoolId: selectedSchoolId,
      programId: selectedProgramId,
      programName: progName,
      termId: selectedTermId,
    });
    const selectedClass = pool.find((candidate) => candidate.id === selectedRegistryClass) ?? null;

    const nextSelections: Record<string, string> = {};
    const bandGrades = new Map<string, string>();
    for (const student of built) {
      const band = bulkGradeBand(student.class_name);
      if (band && student.class_name) bandGrades.set(band, student.class_name);
    }
    for (const [band, grade] of bandGrades) {
      const selected = selectedClass && bulkClassCoversGrade(selectedClass, grade)
        ? selectedClass
        : pool.find((candidate) => bulkClassCoversGrade(candidate, grade));
      if (selected) nextSelections[band] = selected.id;
    }
    if (selectedRegistryClass) {
      nextSelections[BATCH_SECTION_KEY] = selectedRegistryClass;
      for (const band of bandGrades.keys()) {
        if (!nextSelections[band]) nextSelections[band] = selectedRegistryClass;
      }
    }

    const withSection = selectedRegistryClass
      ? built.map((student) => ({
        ...student,
        class_id: student.class_id || resolveBulkSectionId(
          { ...student, class_id: undefined },
          nextSelections,
          selectedRegistryClass,
        ) || selectedRegistryClass,
      }))
      : built;

    setPreview(withSection);
    setBandClassSelections(nextSelections);
    setDbDupNames(new Set());
    setDbSwapNames(new Map());
    setDbDupNameKeys(new Set());
    setDbEmailConflicts(new Map());
    setStep('preview');
  }, [
    namesText,
    defaultClass,
    batchPlacementReady,
    refreshOwnedClasses,
    programmes,
    selectedProgramId,
    selectedSchoolId,
    selectedTermId,
    selectedRegistryClass,
  ]);

  async function createBandClass(band: string) {
    if (!selectedProgramId) {
      toast.error('Select a programme before creating a suggested band class.');
      return;
    }
    if (!selectedTermId) {
      toast.error('Select an academic term before creating a class.');
      return;
    }
    const programmeName = programmes.find((programme) => programme.id === selectedProgramId)?.name ?? null;
    const suggestion = composeClassName({
      schoolName: selectedSchoolName,
      programme: programmeName,
      grade: band,
      granularity: 'fixed',
    }).name;
    if (!confirm(`Create the suggested class "${suggestion}" for the selected term?`)) return;

    const term = academicTerms.find((candidate) => candidate.id === selectedTermId);
    setCreatingBand(band);
    try {
      const response = await fetch('/api/classes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          auto_name: true,
          auto_assign_teacher: true,
          grade: band,
          band_granularity: 'fixed',
          program_id: selectedProgramId,
          school_id: selectedSchoolId,
          teacher_id: profile?.role === 'teacher' ? profile.id : undefined,
          term_id: selectedTermId,
          start_date: term?.start_date ?? undefined,
          end_date: term?.end_date ?? undefined,
          status: 'active',
        }),
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || 'Failed to create class');
      const created = json.data;
      const option: ClassOption = {
        id: created.id,
        name: created.name,
        section_class: created.name,
        school_id: created.school_id,
        program_id: created.program_id,
        teacher_id: created.teacher_id,
        term_id: created.term_id,
        qa_grade_key: created.qa_grade_key ?? null,
        qa_grade_band: created.qa_grade_band ?? band,
        band_lvl: created.band_lvl ?? null,
        band_low: created.band_low ?? null,
        band_high: created.band_high ?? null,
        academic_terms: term ? { term_label: term.term_label, academic_year: term.academic_year } : null,
        isRegistry: true,
      };
      setRegistryClasses((current) => current.some((item) => item.id === option.id) ? current : [option, ...current]);
      setBandClassSelections((current) => ({ ...current, [band]: option.id }));
      toast.success(json.reused ? `Using existing class: ${option.name}` : `Created class: ${option.name}`);
    } catch (error: any) {
      toast.error(error.message || 'Failed to create class');
    } finally {
      setCreatingBand(null);
    }
  }

  // ── Register ─────────────────────────────────────────────────────────────
  const handleRegister = async () => {
    const valid = preview.filter((s) => s.full_name.trim() && s.email.trim());
    if (!valid.length) return;

    // Grade is mandatory per student — from the pasted text (header/inline code),
    // the Grade cell, or the batch Grade Level fallback applied at preview time.
    const noGrade = valid.filter((s) => !(s.class_name ?? '').trim());
    if (noGrade.length > 0) {
      toast.error(`${noGrade.length} student${noGrade.length !== 1 ? 's have' : ' has'} no grade. Fill the Grade field or set a batch Grade Level.`);
      return;
    }
    const withoutClass = valid.filter((student) =>
      !resolveBulkSectionId(student, bandClassSelections, selectedRegistryClass),
    );
    if (withoutClass.length > 0) {
      toast.error('Select a class section for every student before registering.');
      return;
    }
    const placed = valid.map((student) => ({
      ...student,
      class_id: resolveBulkSectionId(student, bandClassSelections, selectedRegistryClass)!,
    }));
    const selectedClassIds = [...new Set(placed.map((student) => student.class_id))];

    // ── Pre-check for duplicate emails within the batch ───────────────────
    const batchEmails = valid.map(s => s.email.toLowerCase());
    const dupeSet = new Set<string>();
    const seen = new Set<string>();
    batchEmails.forEach(e => { if (seen.has(e)) dupeSet.add(e); seen.add(e); });
    if (dupeSet.size > 0) {
      const dupeList = [...dupeSet].join(', ');
      if (!confirm(`⚠ Duplicate emails detected within this batch:\n\n${dupeList}\n\nDuplicate accounts will have their passwords updated. Continue?`)) return;
    }

    setRegistering(true);
    setRegisterProgress({ done: 0, total: valid.length, current: valid[0]?.full_name ?? '' });

    // Generate UUID for this batch to link results in DB
    const persistentBatchId = crypto.randomUUID();

    try {
      const BATCH = 10;
      const allResults: RegisterResult[] = [];
      for (let i = 0; i < placed.length; i += BATCH) {
        const batch = placed.slice(i, i + BATCH);
        setRegisterProgress({ done: i, total: valid.length, current: batch[0]?.full_name ?? '' });

        const body: Record<string, any> = {
          batch_id: persistentBatchId,
          students: batch,
          class_ids: selectedClassIds,
          grade_name: effectiveClassCode || null,
          class_arm: selectedArm || null,
          term_id: selectedTermId || null,
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

      // Show success screen. Operational follow-up now lives in Records.
      setStep('done');

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
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-xl animate-spin" />
    </div>
  );
  if (!canAccess) return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <p className="text-muted-foreground">Access restricted to admins and teachers.</p>
    </div>
  );

  const dups = dupEmails(preview);
  const batchNameCounts = new Map<string, number>();
  preview.forEach((row) => {
    const key = studentNameKey(row.full_name);
    if (key) batchNameCounts.set(key, (batchNameCounts.get(key) ?? 0) + 1);
  });
  const hasNameConflict = (row: GeneratedStudent) => {
    const norm = row.full_name.trim().replace(/\s+/g, ' ').toLowerCase();
    const key = studentNameKey(row.full_name);
    return dbDupNames.has(norm)
      || dbSwapNames.has(norm)
      || (!!key && dbDupNameKeys.has(key))
      || (!!key && (batchNameCounts.get(key) ?? 0) > 1);
  };
  const unresolvedNameExceptions = preview.filter((row) => hasNameConflict(row) && (
    !row.duplicate_exception_confirmed || (row.duplicate_exception_reason?.trim().length ?? 0) < 10
  ));
  const incompleteRows = preview.filter((r) => !r.full_name.trim() || !r.email.trim());
  const validCount = preview.length - incompleteRows.length;
  // Grade is mandatory per student — either detected from the pasted text
  // (header/inline codes) or supplied by the batch Grade Level selector.
  const missingGradeRows = preview.filter((r) => r.full_name.trim() && r.email.trim() && !(r.class_name ?? '').trim());
  const previewClasses = [...new Set(preview.map((s) => s.class_name).filter(Boolean))];
  const previewBandGrades = new Map<string, { grade: string; count: number }>();
  preview.forEach((student) => {
    if (!student.full_name.trim() || !student.email.trim() || !student.class_name) return;
    const band = bulkGradeBand(student.class_name);
    if (!band) return;
    const current = previewBandGrades.get(band);
    previewBandGrades.set(band, { grade: student.class_name, count: (current?.count ?? 0) + 1 });
  });
  const previewBands = [...previewBandGrades.entries()].map(([band, details]) => {
    const matches = placementPool.filter((candidate) => bulkClassCoversGrade(candidate, details.grade));
    const matchIds = new Set(matches.map((c) => c.id));
    const others = placementPool.filter((candidate) => !matchIds.has(candidate.id));
    return {
      band,
      ...details,
      matches,
      others,
    };
  });
  const batchSectionId = bandClassSelections[BATCH_SECTION_KEY] || selectedRegistryClass || '';
  const classSectionOptions: ClassSectionOption[] = [
    ...placementPool
      .filter((candidate) => preferredRegistryIds.has(candidate.id))
      .map((candidate) => ({ id: candidate.id, name: candidate.name, preferred: true })),
    ...placementPool
      .filter((candidate) => !preferredRegistryIds.has(candidate.id))
      .map((candidate) => ({ id: candidate.id, name: candidate.name })),
  ];
  const studentsMissingSection = preview.filter((student) =>
    student.full_name.trim() &&
    student.email.trim() &&
    !resolveBulkSectionId(student, bandClassSelections, selectedRegistryClass),
  );

  const successCount = results?.filter((r) => r.status === 'created' || r.status === 'updated' || r.status === 'reinstated').length ?? 0;
  const reinstateCount = results?.filter((r) => r.status === 'reinstated').length ?? 0;
  const skipCount = results?.filter((r) => r.status === 'skipped' || r.status === 'needs_transfer' || r.status === 'name_swap_conflict').length ?? 0;
  const failCount = results?.filter((r) => r.status === 'failed').length ?? 0;

  const selectedProgLabel = programmes.find((p) => p.id === selectedProgramId)?.name ?? '';

  // Shared input class
  const inp = 'w-full bg-transparent border border-border rounded-xl px-2 py-1.5 text-foreground text-xs focus:outline-none focus:border-primary/50 focus:bg-primary/5 transition-colors placeholder-muted-foreground';

  return (
    <>
      <div className="min-h-screen overflow-x-hidden bg-background p-4 sm:p-6 md:p-8 font-sans">

        {/* Page Header */}
        <div className="mx-auto mb-6 flex max-w-7xl min-w-0 items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rotate-3 border border-primary/20 bg-primary shadow-xl shadow-primary/10 transition-transform hover:rotate-6">
              <SparklesIcon className="h-5 w-5 text-white" />
            </div>
            <div className="min-w-0">
              <h1 className="truncate text-xl font-black uppercase italic tracking-tighter text-foreground sm:text-2xl">Student Registration</h1>
              <p className="mt-1 text-[9px] font-bold uppercase tracking-[0.2em] text-muted-foreground sm:tracking-[0.4em]">Add students individually or in bulk</p>
            </div>
          </div>
          <Link
            href="/dashboard/card-studio?mode=issuance&type=student"
            className="hidden items-center gap-2 border border-primary/30 bg-primary/10 px-4 py-2.5 text-[9px] font-black uppercase tracking-[0.2em] text-primary transition-all hover:bg-primary/20 sm:inline-flex"
          >
            <RectangleGroupIcon className="h-4 w-4" />
            Card Studio
          </Link>
        </div>

        {/* Registration actions. History/credential operations now live in Records. */}
        <div className="max-w-7xl mx-auto mb-8">
          <div className="overflow-x-auto -mx-4 sm:mx-0 px-4 sm:px-0">
            <div className="flex bg-card p-1.5 border border-border w-full sm:w-fit min-w-max">
              <button
                onClick={() => { setActiveTab('register'); setStep('input'); setIsSingleModalOpen(false); }}
                className={`flex-1 sm:flex-none px-4 sm:px-6 py-2.5 text-[9px] font-black uppercase tracking-[0.2em] transition-all whitespace-nowrap ${activeTab === 'register' && step !== 'single' ? 'bg-primary text-white shadow-lg' : 'text-muted-foreground hover:text-foreground'}`}
              >
                Bulk Import
              </button>
              <button
                onClick={() => { setActiveTab('register'); setStep('single'); setIsSingleModalOpen(false); }}
                className={`flex-1 sm:flex-none px-4 sm:px-6 py-2.5 text-[9px] font-black uppercase tracking-[0.2em] transition-all whitespace-nowrap ${activeTab === 'register' && step === 'single' ? 'bg-primary text-white shadow-lg' : 'text-muted-foreground hover:text-foreground'}`}
              >
                Single Student
              </button>
              <Link
                href="/dashboard/records?tab=registrations"
                className="flex-1 sm:flex-none px-4 sm:px-6 py-2.5 text-[9px] font-black uppercase tracking-[0.2em] transition-all whitespace-nowrap text-muted-foreground hover:text-foreground"
              >
                Records
              </Link>
            </div>
            <p className="mt-2 text-[10px] text-muted-foreground font-bold uppercase tracking-wider">
              Registration history, credential cards, print lists, filters and exports are consolidated in Records.
            </p>
          </div>
        </div>

        {activeTab === 'register' && (
          <div className="w-full max-w-5xl mx-auto space-y-8 sm:space-y-12 min-w-0 px-0">

            {/* ── Step Progress (Bulk Import only) ─────────────────────── */}
            {step !== 'single' && step !== 'registry' && (
              <div className="mb-2 w-full min-w-0">
                <div className="flex min-w-0 items-stretch gap-0">
                  {([
                    { key: 'input', label: 'Setup' },
                    { key: 'preview', label: 'Review' },
                    { key: 'done', label: 'Done' },
                  ] as { key: typeof step; label: string }[]).map((s, i, arr) => {
                    const stepOrder = ['input', 'preview', 'done'];
                    const currentIdx = stepOrder.indexOf(step);
                    const sIdx = stepOrder.indexOf(s.key);
                    const isActive = step === s.key;
                    const isDone = sIdx < currentIdx;
                    return (
                      <div key={s.key} className="flex min-w-0 flex-1 items-center">
                        <div className={`flex w-full min-w-0 items-center justify-center gap-1.5 border-y border-l px-2 py-2.5 text-[10px] font-black uppercase tracking-wider sm:px-3 ${i === arr.length - 1 ? 'border-r' : ''} ${isActive ? 'border-primary bg-primary text-white' : isDone ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-400' : 'border-border bg-card text-muted-foreground'}`}>
                          <span className={`flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full text-[9px] font-black ${isActive ? 'bg-white/20' : isDone ? 'bg-emerald-500/30' : 'bg-muted'}`}>
                            {isDone ? '✓' : i + 1}
                          </span>
                          <span className="truncate">{s.label}</span>
                        </div>
                        {i < arr.length - 1 && <div className="h-px w-2 flex-shrink-0 bg-border sm:w-4" />}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* ══════════════════ STEP 1 — SINGLE ══════════════════════════ */}
            {step === 'single' && (
              <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                <AddStudentModal inline isOpen={true} onClose={() => { }} onSuccess={() => { setStep('input'); setActiveTab('register'); toast.success('Student registered. Open Records to print cards or review credentials.'); }} classId={selectedRegistryClass || undefined} />
              </div>
            )}

            {step === 'input' && (
              <div className="space-y-6">

                {/* ── Batch Settings ──────────────────────────────────── */}
                <div className="overflow-hidden rounded-xl border border-border bg-card">
                  <button
                    onClick={() => setSettingsOpen((o) => !o)}
                    className="flex w-full items-center justify-between gap-3 px-4 py-4 text-left transition-colors hover:bg-white/[0.02] sm:px-6"
                  >
                    <div className="flex min-w-0 flex-1 items-center gap-2 font-bold text-sm">
                      <BuildingOffice2Icon className="h-4 w-4 flex-shrink-0 text-primary" />
                      <span className="flex-shrink-0 text-foreground">Setup</span>
                      <span className="hidden min-w-0 truncate text-xs font-normal text-muted-foreground sm:inline">— school, class &amp; programme</span>
                      <span className="ml-auto flex-shrink-0 rounded-full border border-primary/20 bg-primary/10 px-2 py-0.5 text-[9px] font-black uppercase tracking-widest text-primary sm:ml-2">Required</span>
                    </div>
                    <ChevronDownIcon className={`h-4 w-4 flex-shrink-0 text-muted-foreground transition-transform ${settingsOpen ? 'rotate-180' : ''}`} />
                  </button>

                  {settingsOpen && (
                    <div className="px-4 sm:px-6 pb-6 pt-3 border-t border-border space-y-5">

                      {/* Row 1: School + Programme */}
                      <div className={`grid gap-5 ${schools.length > 0 ? 'sm:grid-cols-2' : 'grid-cols-1'}`}>

                        {/* School — admin (all schools) or teacher (their allocated schools) */}
                        {schools.length > 0 && (
                          <div>
                            <label className="block text-muted-foreground text-xs font-bold uppercase tracking-widest mb-2 flex items-center gap-1.5">
                              <BuildingOffice2Icon className="w-3.5 h-3.5" /> School
                              {!isAdmin && <span className="text-primary/60 normal-case font-normal text-[10px] ml-1">(your allocated schools)</span>}
                            </label>
                            <select
                              value={selectedSchoolId}
                              onChange={(e) => {
                                const opt = e.target.options[e.target.selectedIndex];
                                setSelectedSchoolId(e.target.value);
                                setSelectedSchoolName(e.target.value ? opt.text : '');
                                setSelectedRegistryClass('');
                                setBandClassSelections({});
                              }}
                              className="w-full px-3 py-2.5 bg-card shadow-sm border border-border rounded-xl text-sm text-foreground focus:outline-none focus:border-primary/50 transition-colors"
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
                          <label className="block text-muted-foreground text-xs font-bold uppercase tracking-widest mb-2 flex items-center gap-1.5">
                            <BookOpenIcon className="w-3.5 h-3.5" /> Programme <span className="normal-case font-normal text-[10px]">(from section)</span>
                          </label>
                          <select
                            value={selectedProgramId}
                            onChange={(e) => {
                              setSelectedProgramId(e.target.value);
                              setSelectedRegistryClass('');
                              setBandClassSelections({});
                            }}
                            className="w-full px-3 py-2.5 bg-card shadow-sm border border-border rounded-xl text-sm text-foreground focus:outline-none focus:border-primary/50 transition-colors"
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
                      <div className="border-t border-border" />

                      {/* Row 2: Registry class (primary) + Standard code fallback */}
                      <div className="sm:grid sm:grid-cols-2 gap-5 space-y-5 sm:space-y-0">

                        {/* Canonical term + optional existing-class shortcut */}
                        <div>
                          <label className="text-muted-foreground text-xs font-bold uppercase tracking-widest flex items-center gap-1.5 mb-1">
                            <ClockIcon className="w-3.5 h-3.5" />
                            Academic Term
                          </label>
                          <p className="text-white/25 text-[11px] mb-2">
                            Classes and rosters will be created or selected inside this term.
                          </p>
                          <select value={selectedTermId} onChange={(event) => { setSelectedTermId(event.target.value); setSelectedRegistryClass(''); setBandClassSelections({}); }} className="w-full px-3 py-2.5 bg-card border border-primary/20 rounded-xl text-sm text-foreground focus:outline-none focus:border-primary/50">
                            <option value="">— Select a term —</option>
                            {academicTerms.map((term) => (
                              <option key={term.id} value={term.id}>
                                {term.term_label} · {term.academic_year}{term.is_current ? ' · Current' : ''}
                              </option>
                            ))}
                          </select>
                          <label className="mb-1 mt-3 block text-[10px] font-black uppercase tracking-widest text-muted-foreground">Class section</label>
                          <ClassSectionPicker
                            options={classSectionOptions}
                            value={selectedRegistryClass}
                            disabled={!selectedSchoolId}
                            emptyMessage={
                              !selectedSchoolId
                                ? 'Select a school first to load your class sections.'
                                : 'No classes found for this school. Create one on Classes, then refresh.'
                            }
                            onChange={(classId) => {
                              setSelectedRegistryClass(classId);
                              setBandClassSelections((current) => {
                                if (!classId) {
                                  const next = { ...current };
                                  delete next[BATCH_SECTION_KEY];
                                  return next;
                                }
                                return { ...current, [BATCH_SECTION_KEY]: classId };
                              });
                              const destination = placementPool.find((candidate) => candidate.id === classId);
                              if (destination?.program_id) setSelectedProgramId(destination.program_id);
                            }}
                          />
                          {selectedSchoolId && placementPool.length > 0 && (
                            <p className="mt-1 text-[11px] text-muted-foreground">
                              {placementPool.length} class section{placementPool.length !== 1 ? 's' : ''} available.
                            </p>
                          )}
                        </div>

                        {/* Fallback standard class code */}
                        <div>
                          <label className="block text-muted-foreground text-xs font-bold uppercase tracking-widest mb-1 flex items-center gap-1.5">
                            <AcademicCapIcon className="w-3.5 h-3.5" />
                            Grade Level <span className="text-muted-foreground/70 normal-case font-normal ml-1">(optional if grades are in the text)</span>
                          </label>
                          <p className="text-white/25 text-[11px] mb-2">
                            Academic grade only (e.g. JSS 2, Basic 4) — separate from arm. Fallback for any student whose pasted name has no grade code; every student must end up with a grade.
                          </p>
                          <select
                            value={defaultClass}
                            onChange={(e) => setDefaultClass(e.target.value)}
                            className="w-full px-3 py-2.5 bg-card shadow-sm border border-border rounded-xl text-sm text-foreground focus:outline-none focus:border-primary/50 transition-colors"
                          >
                            <option value="">— No grade —</option>
                            <optgroup label="Nursery">
                              {SINGLE_GRADES.filter((grade) => grade.startsWith('Nursery')).map((grade) => (
                                <option key={grade} value={grade}>{grade}</option>
                              ))}
                            </optgroup>
                            <optgroup label="Basic">
                              {SINGLE_GRADES.filter((grade) => grade.startsWith('Basic')).map((grade) => (
                                <option key={grade} value={grade}>{grade}</option>
                              ))}
                            </optgroup>
                            <optgroup label="Junior Secondary">
                              {SINGLE_GRADES.filter((grade) => grade.startsWith('JSS')).map((grade) => (
                                <option key={grade} value={grade}>{grade}</option>
                              ))}
                            </optgroup>
                            <optgroup label="Senior Secondary">
                              {SINGLE_GRADES.filter((grade) => grade.startsWith('SS ')).map((grade) => (
                                <option key={grade} value={grade}>{grade}</option>
                              ))}
                            </optgroup>
                          </select>
                          <div className="mt-3">
                            <label className="mb-1 block text-[10px] font-black uppercase tracking-widest text-muted-foreground">Arm (separate)</label>
                            <select value={selectedArm} onChange={(event) => setSelectedArm(event.target.value)} className="w-full rounded-xl border border-border bg-card px-3 py-2.5 text-sm text-foreground outline-none focus:border-primary/50">
                              <option value="">No arm</option>
                              {['A', 'B', 'C', 'D'].map((arm) => <option key={arm} value={arm}>Arm {arm}</option>)}
                            </select>
                            <p className="mt-1 text-[11px] text-muted-foreground">Stored independently. Example display: {effectiveClassCode || 'JSS 2'}{selectedArm || ''}.</p>
                          </div>
                          {defaultClass && (
                            <p className="text-emerald-400/60 text-[11px] mt-1.5">
                              Batch grade: <span className="font-mono font-bold">{defaultClass}</span>
                              {selectedArm ? <> · Arm <span className="font-mono font-bold">{selectedArm}</span></> : null}.
                            </p>
                          )}
                        </div>

                      </div>

                      {selectedRegisteredClass && (
                        <div className="grid gap-2 rounded-xl border border-emerald-500/25 bg-emerald-500/5 p-3 text-xs sm:grid-cols-2 lg:grid-cols-4">
                          <div className="min-w-0 sm:col-span-2 lg:col-span-1">
                            <span className="block text-[9px] font-black uppercase text-muted-foreground">Section</span>
                            <strong className="break-words">{selectedRegisteredClass.name}</strong>
                          </div>
                          <div className="min-w-0">
                            <span className="block text-[9px] font-black uppercase text-muted-foreground">Term</span>
                            <strong className="break-words">
                              {selectedRegisteredClass.academic_terms
                                ? `${selectedRegisteredClass.academic_terms.term_label || ''} ${selectedRegisteredClass.academic_terms.academic_year || ''}`.trim()
                                : selectedRegisteredClass.term_id
                                  ? 'Assigned term'
                                  : 'No term assigned'}
                            </strong>
                          </div>
                          <div><span className="block text-[9px] font-black uppercase text-muted-foreground">Grade</span><strong>{effectiveClassCode || 'Not set'}</strong></div>
                          <div><span className="block text-[9px] font-black uppercase text-muted-foreground">Arm</span><strong>{selectedArm || 'Not set'}</strong></div>
                        </div>
                      )}
                      {/* Effective class preview */}
                      {effectiveClassCode && (
                        <div className="flex items-center gap-2 text-xs">
                          <span className="text-muted-foreground">Official batch grade:</span>
                          <span className="px-2 py-0.5 bg-primary/15 text-foreground font-mono font-bold rounded-xl border border-primary/20">
                            {effectiveClassCode}
                          </span>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* ── Names textarea ──────────────────────────────────── */}
                <div className="bg-card border border-border rounded-xl p-6">
                  <div className="flex items-center gap-3 mb-3">
                    <label className="block text-foreground text-sm font-black uppercase tracking-widest">
                      Paste Student Names
                    </label>
                    <span className="px-2 py-0.5 text-[9px] font-black bg-card border border-border text-muted-foreground rounded-full uppercase tracking-widest">one per line</span>
                  </div>
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
                    className="w-full px-4 py-3 bg-card shadow-sm border border-border rounded-xl text-sm text-foreground placeholder-muted-foreground resize-none focus:outline-none focus:border-primary/50 transition-colors font-mono leading-relaxed"
                  />
                  <p className="text-muted-foreground text-xs mt-2">
                    You can correct any mistakes in the next step — every field is editable before you register.
                  </p>
                </div>

                <div className="grid md:grid-cols-2 gap-4">
                  <div className="bg-primary/10 border border-primary/20 rounded-xl p-5">
                    <h3 className="text-primary font-bold text-sm mb-3 flex items-center gap-2">
                      <ClipboardDocumentListIcon className="w-4 h-4" /> How names work
                    </h3>
                    <ul className="space-y-1.5 text-primary/70 text-xs list-disc list-inside">
                      <li>With space: <span className="font-mono bg-primary/20 px-1 rounded">John Doe</span></li>
                      <li>Joined: <span className="font-mono bg-primary/20 px-1 rounded">JohnDoe</span></li>
                      <li>CamelCase: <span className="font-mono bg-primary/20 px-1 rounded">ChukwuemekaOkonkwo</span></li>
                      <li>First name → <span className="font-mono bg-primary/20 px-1 rounded">firstname@rillcod.com</span></li>
                      <li>Edit anything in the next step before registering</li>
                    </ul>
                  </div>
                  <div className="bg-primary/10 border border-primary/20 rounded-xl p-5">
                    <h3 className="text-foreground font-bold text-sm mb-3 flex items-center gap-2">
                      <AcademicCapIcon className="w-4 h-4" /> How grade detection works
                    </h3>
                    <ul className="space-y-1.5 text-muted-foreground text-xs list-disc list-inside">
                      <li>Grade header: <span className="font-mono bg-primary/20 px-1 rounded">JSS2A</span> — applies to names below</li>
                      <li>Inline: <span className="font-mono bg-primary/20 px-1 rounded">John Doe SS2B</span></li>
                      <li>Supported: <span className="font-mono bg-primary/20 px-1 rounded">NURSERY/KG 1–3 · BASIC 1–6 · JSS 1–3 · SS/SSS 1–3</span></li>
                      <li>Grade-arm codes normalize to grade: <span className="font-mono bg-primary/20 px-1 rounded">JSS2A · SS1C</span></li>
                      <li>Every student must end up with a grade — from the text above, or the <em>Grade Level</em> fallback. Arm stays separate. Official section always comes from the registered section selector</li>
                    </ul>
                  </div>
                </div>

                <button
                  onClick={handlePreview}
                  disabled={!namesText.trim() || !batchPlacementReady || loading}
                  className="w-full rounded-xl bg-primary py-3.5 px-4 text-sm font-bold leading-snug text-foreground transition-colors hover:bg-primary disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Continue to Review →
                </button>
              </div>
            )}

            {/* ══════════════════ STEP 2 — EDITABLE PREVIEW ═══════════════ */}
            {step === 'preview' && (
              <div className="space-y-5">

                {/* Batch settings summary */}
                {(selectedSchoolId || selectedProgramId || effectiveClassCode || selectedArm) && (
                  <div className="flex min-w-0 flex-wrap gap-2 text-xs">
                    {selectedSchoolId && (
                      <span className="inline-flex max-w-full items-center gap-1.5 rounded-xl border border-primary/20 bg-primary/10 px-3 py-1.5 text-primary">
                        <BuildingOffice2Icon className="h-3.5 w-3.5 flex-shrink-0" />
                        <span className="min-w-0 break-words">{selectedSchoolName || 'Selected school'}</span>
                      </span>
                    )}
                    {selectedProgramId && (
                      <span className="inline-flex max-w-full items-center gap-1.5 rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-3 py-1.5 text-emerald-300">
                        <BookOpenIcon className="h-3.5 w-3.5 flex-shrink-0" />
                        <span className="min-w-0 break-words">Auto-enrol: {selectedProgLabel}</span>
                      </span>
                    )}
                    {effectiveClassCode && (
                      <span className="inline-flex items-center gap-1.5 rounded-xl border border-primary/20 bg-primary/10 px-3 py-1.5 font-mono text-foreground">
                        <AcademicCapIcon className="h-3.5 w-3.5 flex-shrink-0" />
                        Grade: {effectiveClassCode}
                      </span>
                    )}
                    {selectedArm && (
                      <span className="inline-flex items-center gap-1.5 rounded-xl border border-sky-500/20 bg-sky-500/10 px-3 py-1.5 font-mono text-sky-300">
                        Arm: {selectedArm}
                      </span>
                    )}
                  </div>
                )}

                <div className="min-w-0 space-y-3 rounded-xl border border-primary/25 bg-primary/5 p-3 sm:p-4">
                  <div className="min-w-0">
                    <h3 className="text-sm font-black text-foreground">Class section</h3>
                    <p className="break-words text-[11px] text-muted-foreground">
                      Pick your class section below. Grade-band suggestions appear when grades are set.
                    </p>
                  </div>

                  <div className="min-w-0 rounded-xl border border-border bg-card p-3">
                    <label className="mb-2 block text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                      {previewBands.length > 0 ? 'Default section for all bands' : 'Section for this batch'}
                    </label>
                    <ClassSectionPicker
                      options={classSectionOptions}
                      value={batchSectionId}
                      emptyMessage="No classes found for this school yet. Create one below, or on Classes."
                      onChange={(classId) => {
                        setSelectedRegistryClass(classId);
                        setBandClassSelections((current) => {
                          const next = { ...current };
                          if (!classId) {
                            delete next[BATCH_SECTION_KEY];
                            return next;
                          }
                          next[BATCH_SECTION_KEY] = classId;
                          for (const { band } of previewBands) next[band] = classId;
                          return next;
                        });
                        if (classId) {
                          setPreview((rows) => rows.map((row) => ({ ...row, class_id: classId })));
                        }
                        const destination = placementPool.find((candidate) => candidate.id === classId);
                        if (destination?.program_id) setSelectedProgramId(destination.program_id);
                      }}
                    />
                    {placementPool.length > 0 ? (
                      <p className="mt-2 text-[11px] text-muted-foreground">
                        {placementPool.length} class section{placementPool.length !== 1 ? 's' : ''} available.
                      </p>
                    ) : null}
                  </div>

                  {previewBands.length === 0 ? (
                    <p className="text-xs text-muted-foreground">
                      Set grades on students to see band suggestions (e.g. Basic 1-3, JSS 1-3).
                    </p>
                  ) : (
                    <div className="grid min-w-0 gap-3 md:grid-cols-2">
                      {previewBands.map(({ band, count, matches, others }) => {
                        const programmeName = programmes.find((programme) => programme.id === selectedProgramId)?.name ?? null;
                        const suggestedName = composeClassName({
                          schoolName: selectedSchoolName,
                          programme: programmeName,
                          grade: band,
                          granularity: 'fixed',
                        }).name;
                        const hasAnySection = matches.length + others.length > 0;
                        const bandOptions: ClassSectionOption[] = [
                          ...matches.map((candidate) => ({ id: candidate.id, name: candidate.name, preferred: true })),
                          ...others.map((candidate) => ({ id: candidate.id, name: candidate.name })),
                        ];
                        return (
                          <div key={band} className="min-w-0 rounded-xl border border-border bg-card p-3">
                            <div className="mb-2 flex items-start justify-between gap-2">
                              <div className="min-w-0">
                                <p className="truncate text-xs font-black text-foreground">{band}</p>
                                <p className="text-[10px] text-muted-foreground">{count} student{count !== 1 ? 's' : ''}</p>
                              </div>
                              {bandClassSelections[band] ? <CheckCircleIcon className="h-4 w-4 flex-shrink-0 text-emerald-400" /> : null}
                            </div>
                            <ClassSectionPicker
                              options={bandOptions}
                              value={bandClassSelections[band] ?? ''}
                              emptyMessage="No matching class yet. Use the default section above, or create one."
                              onChange={(classId) => {
                                setBandClassSelections((current) => ({ ...current, [band]: classId }));
                                setPreview((rows) => rows.map((row) => (
                                  bulkGradeBand(row.class_name) === band ? { ...row, class_id: classId || undefined } : row
                                )));
                              }}
                            />
                            <button
                              type="button"
                              disabled={!selectedProgramId || creatingBand === band}
                              onClick={() => void createBandClass(band)}
                              className="mt-2 w-full rounded-lg border border-dashed border-primary/40 bg-primary/5 px-3 py-2 text-left text-xs font-semibold leading-snug text-primary transition-colors hover:bg-primary/10 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              {creatingBand === band
                                ? 'Creating class…'
                                : selectedProgramId
                                  ? <>＋ Create <span className="break-words">{suggestedName || band}</span></>
                                  : 'Select a programme to create this class'}
                            </button>
                            {!hasAnySection && selectedProgramId ? (
                              <p className="mt-1 text-[10px] text-amber-400">
                                No matching class yet — create one above or pick the default section.
                              </p>
                            ) : null}
                          </div>
                        );
                      })}
                    </div>
                  )}
                  {studentsMissingSection.length > 0 && (
                    <p className="text-xs text-rose-400">
                      {studentsMissingSection.length} student{studentsMissingSection.length !== 1 ? 's' : ''} still need a class section.
                    </p>
                  )}
                </div>

                {/* Stats bar */}
                <div className="flex flex-wrap gap-3">
                  <div className="flex items-center gap-2 px-4 py-2 bg-card shadow-sm rounded-xl border border-border text-sm">
                    <UserGroupIcon className="w-4 h-4 text-primary" />
                    <span className="text-foreground font-bold">{preview.length}</span>
                    <span className="text-muted-foreground">students</span>
                  </div>
                  {previewClasses.length > 0 && (
                    <div className="flex min-w-0 max-w-full items-start gap-2 rounded-xl border border-primary/20 bg-primary/10 px-4 py-2 text-sm">
                      <AcademicCapIcon className="mt-0.5 h-4 w-4 flex-shrink-0 text-primary" />
                      <div className="min-w-0">
                        <span className="font-bold text-foreground">{previewClasses.length}</span>
                        <span className="ml-1 text-xs text-muted-foreground">grade{previewClasses.length !== 1 ? 's' : ''}:</span>
                        <span className="ml-1 break-words font-mono text-xs text-foreground">{previewClasses.join(' · ')}</span>
                      </div>
                    </div>
                  )}
                  {dups.size > 0 && (
                    <div className="flex items-center gap-2 px-4 py-2 bg-rose-500/10 rounded-xl border border-rose-500/20 text-xs">
                      <ExclamationTriangleIcon className="w-4 h-4 text-rose-400" />
                      <span className="text-rose-400 font-bold">Duplicate emails — fix before registering</span>
                    </div>
                  )}
                  {dbEmailConflicts.size > 0 && (
                    <div className="flex flex-col gap-1.5 px-4 py-3 bg-rose-500/10 rounded-xl border border-rose-500/20 text-xs text-rose-400 w-full">
                      <div className="flex items-center gap-2">
                        <ExclamationTriangleIcon className="w-4 h-4" />
                        <span className="font-bold">System Email Conflicts — the following emails are already in use by other users:</span>
                      </div>
                      <div className="pl-6 space-y-1 font-mono text-[10px]">
                        {[...dbEmailConflicts.entries()].map(([email, user]) => (
                          <div key={email}>
                            • {email} is used by &quot;{user.full_name}&quot; ({user.role})
                          </div>
                        ))}
                      </div>
                      <span className="pl-6 text-[10px] text-rose-300/80">Please double-check or change the email address for these rows.</span>
                    </div>
                  )}
                  {checkingDups && (
                    <div className="flex items-center gap-2 px-4 py-2 bg-white/5 rounded-xl border border-border text-xs text-muted-foreground">
                      <ArrowPathIcon className="w-3.5 h-3.5 animate-spin" />
                      <span>Checking for existing students…</span>
                    </div>
                  )}
                  {!checkingDups && dbDupNames.size > 0 && (
                    <div className="px-4 py-3 bg-yellow-500/15 rounded-xl border border-yellow-500/40 text-xs space-y-2">
                      <div className="flex items-start gap-2">
                        <ExclamationTriangleIcon className="w-4 h-4 text-yellow-400 shrink-0 mt-0.5" />
                        <div className="space-y-1">
                          <p className="text-yellow-400 font-bold">{dbDupNames.size} name{dbDupNames.size !== 1 ? 's' : ''} already exist at this school:</p>
                          <p className="text-yellow-300 font-mono">{[...dbDupNames].map(n => preview.find(s => s.full_name.trim().toLowerCase() === n)?.full_name ?? n).join(', ')}</p>
                          <p className="text-yellow-400/80">For a genuine twin or different child, confirm the exception on that student row and enter a distinguishing reason. Otherwise remove the duplicate row.</p>
                        </div>
                      </div>
                    </div>
                  )}
                  {!checkingDups && dbSwapNames.size > 0 && (
                    <div className="px-4 py-3 bg-rose-500/10 rounded-xl border border-rose-500/30 text-xs space-y-2">
                      <div className="flex items-start gap-2">
                        <ExclamationTriangleIcon className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                        <div className="space-y-1">
                          <p className="text-rose-400 font-bold">{dbSwapNames.size} name{dbSwapNames.size !== 1 ? 's look' : ' looks'} like a swapped version of an existing student:</p>
                          <div className="space-y-0.5">
                            {[...dbSwapNames.entries()].map(([norm, existing]) => {
                              const incomingOriginal = preview.find(s => s.full_name.trim().toLowerCase() === norm)?.full_name ?? norm;
                              return (
                                <p key={norm} className="text-rose-400/80 font-mono">
                                  &quot;{incomingOriginal}&quot; → matches existing &quot;{existing}&quot;
                                </p>
                              );
                            })}
                          </div>
                          <p className="text-rose-300/60">This usually means the same student's first and last name were reversed. Confirm a per-student exception only for a genuine twin or different child.</p>
                        </div>
                      </div>
                    </div>
                  )}
                  {incompleteRows.length > 0 && (
                    <div className="flex items-center gap-2 px-4 py-2 bg-yellow-500/15 rounded-xl border border-yellow-500/30 text-xs">
                      <ExclamationTriangleIcon className="w-4 h-4 text-yellow-400" />
                      <span className="text-yellow-400">{incompleteRows.length} row{incompleteRows.length !== 1 ? 's' : ''} incomplete (will be skipped)</span>
                    </div>
                  )}
                  {missingGradeRows.length > 0 && (
                    <div className="flex flex-col gap-1 px-4 py-3 bg-rose-500/10 rounded-xl border border-rose-500/30 text-xs w-full">
                      <div className="flex items-center gap-2">
                        <ExclamationTriangleIcon className="w-4 h-4 text-rose-400" />
                        <span className="text-rose-400 font-bold">{missingGradeRows.length} student{missingGradeRows.length !== 1 ? 's have' : ' has'} no grade</span>
                      </div>
                      <span className="pl-6 text-rose-300/80">Every student needs a grade. Pick it in the Grade field, add a grade header in the pasted text, or go back and set a batch Grade Level.</span>
                    </div>
                  )}
                </div>
 
                {/* Editable table */}
                <div className="bg-card border border-border rounded-xl overflow-hidden">
                  <div className="flex items-center justify-between px-5 py-3.5 border-b border-border">
                    <p className="text-muted-foreground text-xs font-bold uppercase tracking-widest">
                      Click any cell to edit — changes are instant
                    </p>
                    <button onClick={handleReset} className="text-muted-foreground hover:text-foreground transition-colors" title="Back to names">
                      <XMarkIcon className="w-5 h-5" />
                    </button>
                  </div>
 
                  <div className="overflow-x-auto max-h-[520px] overflow-y-auto">
                    <table className="hidden md:table w-full text-xs border-separate border-spacing-0">
                      <thead className="sticky top-0 bg-background z-10">
                        <tr className="text-muted-foreground uppercase tracking-wider text-[10px]">
                          <th className="text-left px-3 py-2.5 border-b border-border w-8">#</th>
                          <th className="text-left px-2 py-2.5 border-b border-border w-[22%]">Full Name</th>
                          <th className="text-left px-2 py-2.5 border-b border-border w-[10%]">Grade</th>
                          <th className="text-left px-2 py-2.5 border-b border-border w-[18%]">Section</th>
                          <th className="text-left px-2 py-2.5 border-b border-border w-[8%]">Gender</th>
                          <th className="text-left px-2 py-2.5 border-b border-border w-[22%]">Email</th>
                          <th className="text-left px-2 py-2.5 border-b border-border w-[14%]">Temp Password</th>
                          <th className="px-2 py-2.5 border-b border-border w-8" />
                        </tr>
                      </thead>
                      <tbody>
                        {preview.map((s, i) => {
                          const emailDup = dups.has(s.email.toLowerCase());
                          const incomplete = !s.full_name.trim() || !s.email.trim();
                          const dbDup = dbDupNames.has(s.full_name.trim().replace(/\s+/g, ' ').toLowerCase())
                            || dbDupNameKeys.has(studentNameKey(s.full_name));
                          const nameConflict = hasNameConflict(s);
                          return (
                            <tr
                              key={s.id}
                              className={`group border-b border-border transition-colors ${incomplete ? 'bg-yellow-500/10' : emailDup ? 'bg-rose-500/5' : dbDup ? 'bg-yellow-500/10' : 'hover:bg-white/[0.02]'
                                }`}
                            >
                              {/* # */}
                              <td className="px-3 py-2 text-muted-foreground align-middle">{i + 1}</td>
 
                              {/* Full Name */}
                              <td className="px-2 py-1.5 align-middle">
                                <div className="flex items-center gap-1.5">
                                  <input
                                    className={inp}
                                    value={s.full_name}
                                    onChange={(e) => updateField(s.id, 'full_name', e.target.value)}
                                    onBlur={(e) => onNameBlur(s.id, e.target.value)}
                                    placeholder="Full name"
                                  />
                                  {dbDup && (
                                    <span className="shrink-0 px-1.5 py-0.5 bg-yellow-500/20 border border-yellow-500/40 text-yellow-400 text-[9px] font-black uppercase tracking-tight rounded-xl" title="Already registered at this school">EXISTS</span>
                                  )}
                                </div>
                                {nameConflict && (
                                  <div className="mt-2 space-y-1.5 rounded-lg border border-amber-500/30 bg-amber-500/10 p-2">
                                    <label className="flex items-center gap-2 text-[10px] font-bold text-amber-300">
                                      <input type="checkbox" checked={!!s.duplicate_exception_confirmed} onChange={(e) => updateDuplicateException(s.id, e.target.checked)} className="accent-amber-500" />
                                      Confirmed twin / different child
                                    </label>
                                    {s.duplicate_exception_confirmed && (
                                      <input className={inp} value={s.duplicate_exception_reason ?? ''} onChange={(e) => updateField(s.id, 'duplicate_exception_reason', e.target.value)} placeholder="Reason (minimum 10 characters)" />
                                    )}
                                  </div>
                                )}
                              </td>
 
                              {/* Canonical grade */}
                              <td className="px-2 py-1.5 align-middle">
                                <select
                                  className={`${inp} font-mono ${!incomplete && !(s.class_name ?? '').trim() ? 'border-rose-500/60 bg-rose-500/5' : ''}`}
                                  value={s.class_name ?? ''}
                                  onChange={(e) => updateField(s.id, 'class_name', e.target.value)}
                                >
                                  <option value="">Grade</option>
                                  {SINGLE_GRADES.map((grade) => <option key={grade} value={grade}>{grade}</option>)}
                                </select>
                              </td>

                              {/* Class section */}
                              <td className="px-2 py-1.5 align-middle">
                                <select
                                  className={`${inp} ${!incomplete && !resolveBulkSectionId(s, bandClassSelections, selectedRegistryClass) ? 'border-rose-500/60 bg-rose-500/5' : ''}`}
                                  value={s.class_id || resolveBulkSectionId(s, bandClassSelections, selectedRegistryClass) || ''}
                                  onChange={(e) => updateField(s.id, 'class_id', e.target.value)}
                                >
                                  <option value="">Section</option>
                                  {placementPool.map((candidate) => (
                                    <option key={candidate.id} value={candidate.id} title={candidate.name}>
                                      {shortClassLabel(candidate.name)}
                                    </option>
                                  ))}
                                </select>
                              </td>
 
                              {/* Gender */}
                              <td className="px-2 py-1.5 align-middle">
                                <select
                                  className={inp}
                                  value={s.gender ?? ''}
                                  onChange={(e) => updateField(s.id, 'gender', e.target.value)}
                                >
                                  <option value="">—</option>
                                  <option value="male">Male</option>
                                  <option value="female">Female</option>
                                </select>
                              </td>
 
                              {/* Email */}
                              <td className="px-2 py-1.5 align-middle">
                                <div className="relative">
                                  <input
                                    className={`${inp} font-mono pr-6 ${emailDup ? 'border-rose-500/60 bg-rose-500/5 text-rose-300' : 'text-primary'}`}
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
                                <span className="font-mono text-yellow-400 font-bold">{s.password}</span>
                              </td>
 
                              {/* Delete */}
                              <td className="px-2 py-2 align-middle text-center">
                                <button
                                  onClick={() => removeRow(s.id)}
                                  className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-rose-400 transition-all rounded p-0.5"
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
                        const dbDup = dbDupNames.has(s.full_name.trim().replace(/\s+/g, ' ').toLowerCase())
                          || dbDupNameKeys.has(studentNameKey(s.full_name));
                        const nameConflict = hasNameConflict(s);
                        return (
                          <div key={s.id} className={`p-4 space-y-3 ${incomplete ? 'bg-yellow-500/10' : emailDup ? 'bg-rose-500/5' : dbDup ? 'bg-yellow-500/10' : ''}`}>
                            <div className="flex items-center justify-between">
                              <span className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">Student #{i + 1}</span>
                              <button onClick={() => removeRow(s.id)} className="text-muted-foreground hover:text-rose-400 p-1"><XMarkIcon className="w-4 h-4" /></button>
                            </div>
                            <div className="space-y-2">
                              <input className={inp} value={s.full_name} onChange={(e) => updateField(s.id, 'full_name', e.target.value)} onBlur={(e) => onNameBlur(s.id, e.target.value)} placeholder="Full Name" />
                              {nameConflict && (
                                <div className="space-y-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-2">
                                  <label className="flex items-center gap-2 text-[10px] font-bold text-amber-300">
                                    <input type="checkbox" checked={!!s.duplicate_exception_confirmed} onChange={(e) => updateDuplicateException(s.id, e.target.checked)} className="accent-amber-500" />
                                    Confirmed twin / different child
                                  </label>
                                  {s.duplicate_exception_confirmed && <input className={inp} value={s.duplicate_exception_reason ?? ''} onChange={(e) => updateField(s.id, 'duplicate_exception_reason', e.target.value)} placeholder="Reason (minimum 10 characters)" />}
                                </div>
                              )}
                              <div className="flex gap-2">
                                <select className={`${inp} font-mono w-28 ${!incomplete && !(s.class_name ?? '').trim() ? 'border-rose-500/60 bg-rose-500/5' : ''}`} value={s.class_name ?? ''} onChange={(e) => updateField(s.id, 'class_name', e.target.value)}>
                                  <option value="">Grade</option>
                                  {SINGLE_GRADES.map((grade) => <option key={grade} value={grade}>{grade}</option>)}
                                </select>
                                <select className={`${inp} w-28`} value={s.gender ?? ''} onChange={(e) => updateField(s.id, 'gender', e.target.value)}>
                                  <option value="">Gender</option>
                                  <option value="male">Male</option>
                                  <option value="female">Female</option>
                                </select>
                                <div className="relative flex-1">
                                  <input className={`${inp} font-mono pr-6 ${emailDup ? 'border-rose-500/60 bg-rose-500/5 text-rose-300' : 'text-primary'}`} value={s.email} onChange={(e) => updateField(s.id, 'email', e.target.value)} placeholder="Email" />
                                  {emailDup && <ExclamationTriangleIcon className="absolute right-1.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-rose-400" />}
                                </div>
                              </div>
                              <select
                                className={`${inp} ${!incomplete && !resolveBulkSectionId(s, bandClassSelections, selectedRegistryClass) ? 'border-rose-500/60 bg-rose-500/5' : ''}`}
                                value={s.class_id || resolveBulkSectionId(s, bandClassSelections, selectedRegistryClass) || ''}
                                onChange={(e) => updateField(s.id, 'class_id', e.target.value)}
                              >
                                <option value="">Class section</option>
                                {placementPool.map((candidate) => (
                                  <option key={candidate.id} value={candidate.id} title={candidate.name}>
                                    {shortClassLabel(candidate.name)}
                                  </option>
                                ))}
                              </select>
                              <div className="flex items-center justify-between px-3 py-2 bg-card shadow-sm rounded-xl border border-border text-[10px]">
                                <span className="text-muted-foreground uppercase font-bold">Password</span>
                                <span className="font-mono text-yellow-400 font-bold">{s.password}</span>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Add row + footer */}
                  <div className="px-4 py-3 border-t border-border flex items-center justify-between gap-3 flex-wrap">
                    <button
                      onClick={addRow}
                      className="flex items-center gap-1.5 text-xs text-primary hover:text-primary font-bold transition-colors"
                    >
                      <PlusIcon className="w-4 h-4" /> Add student
                    </button>
                    <p className="text-muted-foreground text-xs">
                      Editing name auto-updates the email if it&apos;s still @rillcod.com.
                    </p>
                  </div>
                </div>

                {/* Action buttons */}
                <div className="flex flex-col-reverse gap-3 sm:flex-row">
                  <button
                    onClick={handleReset}
                    className="w-full rounded-xl border border-border bg-card py-3 text-sm font-bold text-muted-foreground shadow-sm transition-colors hover:bg-muted sm:flex-1"
                  >
                    ← Edit Names
                  </button>
                  <div className="flex w-full min-w-0 flex-col gap-2 sm:flex-1">
                    <button
                      onClick={handleRegister}
                      disabled={registering || dups.size > 0 || dbEmailConflicts.size > 0 || unresolvedNameExceptions.length > 0 || missingGradeRows.length > 0 || studentsMissingSection.length > 0 || checkingDups || validCount === 0}
                      className="w-full rounded-xl bg-[#7a0606] px-3 py-3 text-sm font-bold leading-snug text-foreground transition-colors hover:bg-[#9a0808] disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {registering
                        ? `Registering ${registerProgress?.done ?? 0} / ${registerProgress?.total ?? validCount}…`
                        : checkingDups
                          ? 'Checking duplicates…'
                          : dups.size > 0
                            ? 'Fix duplicate emails first'
                            : dbEmailConflicts.size > 0
                              ? 'Fix email conflicts first'
                              : unresolvedNameExceptions.length > 0
                                ? 'Confirm twins & enter a reason'
                                : missingGradeRows.length > 0
                                  ? 'Set a grade for every student'
                                  : studentsMissingSection.length > 0
                                    ? 'Select a class section first'
                                    : `Register ${validCount} student${validCount !== 1 ? 's' : ''}${selectedProgramId ? ' & enrol' : ''}`}
                    </button>
                    {registering && registerProgress && (
                      <div className="space-y-1">
                        <div className="h-1.5 w-full overflow-hidden rounded-xl bg-card shadow-sm">
                          <div
                            className="h-full rounded-xl bg-[#7a0606] transition-all duration-300"
                            style={{ width: `${(registerProgress.done / registerProgress.total) * 100}%` }}
                          />
                        </div>
                        <p className="truncate text-[10px] text-muted-foreground">
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
                {profile && (
                  <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-4 flex items-center gap-3 text-emerald-400">
                    <CheckCircleIcon className="w-5 h-5" />
                    <span className="text-sm font-bold tracking-widest uppercase">Registration complete</span>
                  </div>
                )}

                <div className="bg-gradient-to-b from-primary to-primary/10 to-[#0d1526] border border-emerald-500/20 rounded-xl p-8 text-center relative overflow-hidden">
                  <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-emerald-500/40 to-transparent" />
                  <div className="relative z-10">
                    <h2 className="text-3xl font-black text-foreground mb-2 uppercase tracking-tighter italic">Process Complete</h2>
                    <div className="flex items-center justify-center gap-4 font-black tracking-widest uppercase text-[10px] flex-wrap">
                      <span className="text-emerald-400/80">Created: {successCount - reinstateCount}</span>
                      {reinstateCount > 0 && (
                        <>
                          <div className="w-1 h-1 bg-white/20 rounded-xl" />
                          <span className="text-sky-400 font-bold">Reinstated: {reinstateCount}</span>
                        </>
                      )}
                      {skipCount > 0 && (
                        <>
                          <div className="w-1 h-1 bg-white/20 rounded-xl" />
                          <span className="text-yellow-400 font-bold">Skipped / needs transfer: {skipCount}</span>
                        </>
                      )}
                      {failCount > 0 && (
                        <>
                          <div className="w-1 h-1 bg-white/20 rounded-xl" />
                          <span className="text-rose-400/80">Failed: {failCount}</span>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap gap-4 justify-center">
                  {/* Card Export Group */}
                  <div className="flex bg-card border border-border p-1">
                    <button onClick={() => handleExportCardsPDF(results)} className="flex items-center gap-2 px-6 py-4 bg-primary hover:bg-primary text-foreground font-black text-[10px] uppercase tracking-widest transition-all">
                      <DocumentArrowDownIcon className="w-4 h-4" /> Cards PDF
                    </button>
                    <button onClick={() => handleMassPrint(results)} className="flex items-center gap-2 px-6 py-4 bg-card hover:bg-muted text-foreground font-black text-[10px] uppercase tracking-widest transition-all border-l border-border">
                      <PrinterIcon className="w-4 h-4" /> Print
                    </button>
                  </div>

                  {/* Roster Export Group */}
                  <div className="flex bg-card border border-border p-1">
                    <button onClick={() => handleExportRosterPDF(results)} className="flex items-center gap-2 px-6 py-4 bg-primary hover:bg-primary text-foreground font-black text-[10px] uppercase tracking-widest transition-all">
                      <DocumentArrowDownIcon className="w-4 h-4" /> Roster PDF
                    </button>
                    <button onClick={() => handleMassPrintReport(results)} className="flex items-center gap-2 px-6 py-4 bg-card hover:bg-muted text-foreground font-black text-[10px] uppercase tracking-widest transition-all border-l border-border">
                      <PrinterIcon className="w-4 h-4" /> Print
                    </button>
                  </div>

                  {/* Utility Group */}
                  <button onClick={downloadCSV} className="flex items-center gap-2 px-8 py-4 bg-primary/10 hover:bg-primary/20 text-primary font-bold border border-primary/20 text-[10px] uppercase tracking-widest">
                    <DocumentArrowDownIcon className="w-4 h-4" /> CSV
                  </button>

                  <button onClick={handleUpdateResults} disabled={loading} className="flex items-center gap-2 px-8 py-4 bg-emerald-600/10 hover:bg-emerald-600/20 text-emerald-400 font-bold border border-emerald-500/20 text-[10px] uppercase tracking-widest">
                    {loading ? <ArrowPathIcon className="w-4 h-4 animate-spin" /> : <CheckCircleIcon className="w-4 h-4" />}
                    Confirm Fixes
                  </button>

                  <Link href="/dashboard/records?tab=registrations" className="flex items-center gap-2 px-8 py-4 bg-violet-600/10 hover:bg-violet-600/20 text-violet-300 font-bold border border-violet-500/20 text-[10px] uppercase tracking-widest">
                    <ArchiveBoxIcon className="w-4 h-4" /> Open Records
                  </Link>

                  <button onClick={() => setStep('input')} className="flex items-center gap-2 px-8 py-4 bg-card border border-border text-muted-foreground font-bold text-[10px] uppercase tracking-widest">
                    <PlusIcon className="w-4 h-4" /> New Batch
                  </button>
                </div>


                {/* Results Table */}
                <div className="bg-card border border-border rounded-xl overflow-hidden shadow-2xl">
                  <div className="px-6 py-5 border-b border-border bg-white/[0.02] flex items-center justify-between">
                    <div>
                      <h3 className="text-foreground font-black text-lg flex items-center gap-2 uppercase tracking-tighter">
                        <ClipboardDocumentListIcon className="w-5 h-5 text-primary" />
                        Session results
                      </h3>
                      <p className="text-muted-foreground text-[10px] uppercase font-black tracking-widest mt-1">Batch Record ID: {results[0]?.batch_id?.slice(0, 8) || 'N/A'}</p>
                    </div>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-border text-muted-foreground uppercase tracking-widest text-[9px] font-black">
                          <th className="text-left px-6 py-4">#</th>
                          <th className="text-left px-4 py-4">Student ID</th>
                          <th className="text-left px-4 py-4">Full Name</th>
                          <th className="text-left px-4 py-4">Class</th>
                          <th className="text-left px-4 py-4">Email / Login</th>
                          <th className="text-left px-4 py-4">Password</th>
                          <th className="text-right px-6 py-4">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/5">
                        {results.map((r, i) => (
                          <tr key={i} className={`group transition-colors ${r.status === 'failed' ? 'bg-rose-500/5' : r.status === 'skipped' || r.status === 'needs_transfer' || r.status === 'name_swap_conflict' ? 'bg-yellow-500/10' : r.status === 'reinstated' ? 'bg-sky-500/10' : 'hover:bg-white/[0.01]'}`}>
                            <td className="px-6 py-4 text-muted-foreground font-mono">{String(i + 1).padStart(2, '0')}</td>
                            <td className="px-4 py-4">
                              <span className="font-mono font-black text-primary text-[10px] tracking-wide">
                                {(r.portal_user_id || r.userId) ? accessCardCodeForStudent(r.portal_user_id || r.userId!) : '—'}
                              </span>
                            </td>
                            <td className="px-4 py-4">
                              <input className="bg-transparent border-none text-foreground font-bold w-full focus:ring-1 focus:ring-primary rounded p-1" value={r.full_name} onChange={(e) => {
                                const newResults = [...results]; newResults[i].full_name = e.target.value; setResults(newResults);
                              }} />
                            </td>
                            <td className="px-4 py-4">
                              <input className="bg-transparent border-none text-primary text-[10px] font-black uppercase tracking-tighter w-full focus:ring-1 focus:ring-primary rounded p-1" value={r.class_name || ''} onChange={(e) => {
                                const newResults = [...results]; newResults[i].class_name = e.target.value; setResults(newResults);
                              }} />
                            </td>
                            <td className="px-4 py-4 font-mono text-muted-foreground">{r.email}</td>
                            <td className="px-4 py-4 font-mono font-bold text-primary text-[11px]">{r.password || '—'}</td>
                            <td className="px-6 py-4 text-right transform group-hover:scale-105 transition-transform">
                              <span className={`inline-block px-2 py-1 rounded-xl text-[9px] font-black uppercase tracking-tighter ${
                                r.status === 'failed' ? 'bg-rose-500/10 text-rose-500 border border-rose-500/20'
                                  : r.status === 'reinstated' ? 'bg-sky-500/15 text-sky-300 border border-sky-500/30'
                                    : r.status === 'skipped' || r.status === 'needs_transfer' || r.status === 'name_swap_conflict' ? 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/40 font-bold'
                                      : 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20'
                              }`}>
                                {r.status}
                              </span>
                              {r.error && (r.status === 'reinstated' || r.status === 'needs_transfer' || r.status === 'skipped') && (
                                <p className="mt-1 text-[9px] text-muted-foreground max-w-[220px] ml-auto text-right leading-snug">{r.error}</p>
                              )}
                              {r.cardId && (
                                <div className={`mt-1 inline-block px-2 py-0.5 rounded-xl text-[8px] font-black uppercase tracking-wider border ${r.cardIssued ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30' : 'bg-primary/10 text-blue-300 border-primary/30'}`}>
                                  {r.cardIssued ? 'Card Ready' : 'Card Exists'}
                                </div>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Print Sheet Hidden */}
                <div id="printable-sheet" className="hidden">
                  <h2 className="text-2xl font-black uppercase tracking-tighter mb-2">RILLCOD TECHNOLOGIES // STUDENT CREDENTIALS</h2>
                  <div className="flex gap-4 text-sm font-bold text-muted-foreground mb-6 pb-4 border-b">
                    <span>Batch: {results[0]?.batch_id?.slice(0, 8)}</span>
                    <span>Date: {new Date().toLocaleDateString()}</span>
                    {selectedSchoolName && <span>School: {selectedSchoolName}</span>}
                  </div>
                  <table className="w-full border-collapse">
                    <thead>
                      <tr className="bg-slate-900 text-foreground">
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
                          <td className="p-2 border font-mono">{i + 1}</td>
                          <td className="p-2 border font-bold uppercase">{r.full_name}</td>
                          <td className="p-2 border text-muted-foreground">{r.class_name || effectiveClassCode}</td>
                          <td className="p-2 border font-mono">{r.email}</td>
                          <td className="p-2 border font-mono font-bold">{r.password}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <div className="mt-8 p-4 bg-background border rounded-xl text-[10px] text-muted-foreground italic">
                    Instructions: 1. Login at academy.rillcod.com 2. Use credentials above 3. Change password immediately.
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ══════════════════ VAULT TAB ═══════════════════════════════ */}
        {activeTab === 'vault' && (
          <div className="max-w-6xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-8 duration-1000">
            {/* Vault Header (Refined) */}
            <div className="bg-card border border-primary/20 p-3 sm:p-6 relative overflow-hidden shadow-2xl">
              <div className="absolute top-0 right-0 w-full h-[1px] bg-gradient-to-r from-transparent via-primary/20 to-transparent" />
              <div className="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-6 sm:gap-12">
                <div className="max-w-xl">
                  <div className="flex items-center gap-2 mb-1.5 sm:mb-2">
                    <div className="w-2 h-2 bg-primary rounded-xl animate-pulse shadow-[0_0_15px_rgba(234,88,12,0.4)]" />
                    <span className="text-[8px] sm:text-[10px] text-primary font-black uppercase tracking-[0.4em]">Records Migration</span>
                  </div>
                  <h2 className="text-base sm:text-xl lg:text-2xl font-black text-foreground italic uppercase tracking-tighter leading-none mb-1 sm:mb-2">Registration History</h2>
                  <p className="text-muted-foreground text-[9px] sm:text-[10px] font-medium leading-relaxed uppercase tracking-widest hidden sm:block">A record of all student registration sessions.</p>
                </div>
                <div className="flex items-center flex-wrap gap-4 sm:gap-10 lg:pl-10">
                  <div className="min-w-[180px]">
                    <label className="block text-muted-foreground text-[8px] sm:text-[9px] font-black uppercase tracking-widest mb-1 flex items-center gap-1">
                      <BuildingOffice2Icon className="w-3.5 h-3.5 text-primary" /> Filter by School
                    </label>
                    <select
                      value={historySchoolId}
                      onChange={(e) => setHistorySchoolId(e.target.value)}
                      className="w-full px-2.5 py-1.5 bg-background border border-border text-xs text-foreground focus:outline-none focus:border-primary transition-colors cursor-pointer"
                    >
                      <option value="all">🌍 All Schools</option>
                      {schools.map((s) => (
                        <option key={s.id} value={s.id}>{s.name}</option>
                      ))}
                    </select>
                  </div>
                  <div className="text-right">
                    <p className="text-foreground font-black text-3xl sm:text-5xl leading-none italic">
                      {history.filter((batch) => historySchoolId === 'all' || batch.school_id === historySchoolId).length}
                    </p>
                    <p className="text-[7px] sm:text-[9px] text-muted-foreground font-black uppercase tracking-[0.3em] mt-1.5 sm:mt-2">Total Sessions</p>
                  </div>
                  <button
                    onClick={fetchHistory}
                    disabled={loadingHistory}
                    className="w-14 h-14 sm:w-20 sm:h-20 bg-primary/10 border border-primary/20 flex items-center justify-center hover:bg-primary/20 transition-all group active:scale-95 shadow-xl shadow-primary/10"
                  >
                    <ArrowPathIcon className={`w-7 h-7 sm:w-10 h-10 text-primary ${loadingHistory ? 'animate-spin' : 'group-hover:rotate-180 transition-transform duration-700'}`} />
                  </button>
                </div>
              </div>
            </div>

            {loadingHistory && history.length === 0 ? (
              <div className="h-[400px] flex flex-col items-center justify-center gap-8 bg-card/40 border border-border italic text-muted-foreground uppercase tracking-[0.5em] animate-pulse">Loading...</div>
            ) : history.length === 0 ? (
              <div className="h-[400px] flex flex-col items-center justify-center gap-8 bg-white/[0.02] border border-border border-dashed italic text-muted-foreground uppercase tracking-[0.5em]">No registration history yet</div>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-10">
                {history
                  .filter((batch) => historySchoolId === 'all' || batch.school_id === historySchoolId)
                  .map((batch) => (
                  <div key={batch.id} className="group bg-card border border-border p-3 sm:p-6 transition-all hover:bg-card/80 hover:border-primary/20 hover:shadow-latest relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-32 h-32 bg-card rotate-45 translate-x-16 -translate-y-16 pointer-events-none" />

                    <div className="relative z-10">
                      <div className="flex items-start justify-between mb-6 sm:mb-10">
                        <div className="flex-1 min-w-0">
                          {editingBatchId === batch.id ? (
                            <input
                              autoFocus
                              className="bg-black/60 border border-primary/50 px-4 py-2 sm:px-6 sm:py-4 text-foreground font-black text-xl sm:text-3xl w-full italic outline-none focus:ring-1 focus:ring-primary/30 transition-all"
                              defaultValue={batch.class_name || 'General Batch'}
                              onBlur={async (e) => {
                                await fetch('/api/students/bulk-register', {
                                  method: 'PATCH',
                                  headers: { 'Content-Type': 'application/json' },
                                  body: JSON.stringify({ type: 'batch', data: { id: batch.id, class_name: e.target.value } })
                                });
                                setEditingBatchId(null);
                                fetchHistory();
                                toast.success('Batch renamed successfully.');
                              }}
                            />
                          ) : (
                            <h3 className="text-2xl sm:text-4xl font-black text-foreground truncate uppercase tracking-tighter italic group-hover:text-primary cursor-pointer transition-colors"
                              onDoubleClick={() => setEditingBatchId(batch.id)}>
                              {batch.class_name || 'General Batch'}
                            </h3>
                          )}
                          <div className="flex flex-wrap items-center gap-3 sm:gap-6 mt-3 sm:mt-5">
                            <div className="flex items-center gap-3 sm:gap-6 bg-card shadow-sm w-fit px-3 py-1.5 sm:px-4 sm:py-2 border border-border">
                              <span className="text-[8px] sm:text-[10px] text-muted-foreground font-black uppercase tracking-[0.2em]">{new Date(batch.created_at).toLocaleDateString()}</span>
                              <div className="w-1 h-1 bg-muted rounded-xl" />
                              <span className="text-[8px] sm:text-[10px] text-muted-foreground font-black uppercase tracking-[0.2em] italic">{batch.student_count} Students</span>
                            </div>
                            <span className="text-[8px] sm:text-[9px] px-2 py-1 bg-sky-500/10 text-sky-400 border border-sky-500/20 font-black uppercase tracking-widest">
                              Created by {batch.creator?.full_name || batch.creator?.email || 'Unknown'}{batch.creator?.role ? ` (${batch.creator.role})` : ''}
                            </span>
                            {batch.school_name && (
                              <span className="text-[8px] sm:text-[9px] px-2 py-1 bg-primary/10 text-primary border border-primary/20 font-black uppercase tracking-widest">{batch.school_name}</span>
                            )}
                            {batch.class_name && batch.school_name && (
                              <span className="text-[8px] sm:text-[9px] px-2 py-1 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-black uppercase tracking-widest">{batch.class_name}</span>
                            )}
                          </div>
                        </div>
                        {['admin', 'teacher'].includes(profile?.role || '') && (
                          <button onClick={() => handleDeleteBatch(batch.id)} className="p-3 bg-card shadow-sm hover:bg-rose-600/20 text-muted-foreground hover:text-rose-500 transition-all border border-border ml-3">
                            <TrashIcon className="w-5 h-5" />
                          </button>
                        )}
                      </div>

                      <div className="flex flex-wrap items-center gap-2 sm:gap-4 mt-6 sm:mt-10">
                        <button
                          onClick={async () => {
                            if (selectedBatchId === batch.id) {
                              setSelectedBatchId(null);
                              setSelectedResultIds([]);
                            } else {
                              setSelectedBatchId(batch.id);
                              setSelectedResultIds([]);
                              setLoadingHistory(true);
                              const { data } = await supabase.from('registration_results').select('*').eq('batch_id', batch.id);
                              if (data) setBatchResults(data);
                              setLoadingHistory(false);
                            }
                          }}
                          className={`flex-1 py-2.5 sm:py-3 text-[9px] font-black uppercase tracking-[0.2em] sm:tracking-[0.4em] transition-all border ${selectedBatchId === batch.id ? 'bg-primary text-foreground border-primary shadow-xl shadow-primary/30' : 'bg-card shadow-sm text-muted-foreground hover:bg-muted hover:text-foreground border-border'
                            }`}
                        >
                          {selectedBatchId === batch.id ? 'Hide Students' : 'View Students'}
                        </button>
                        <div className="flex gap-1.5 sm:gap-2">
                          <button
                            onClick={async () => {
                              setLoadingHistory(true);
                              const { data } = await supabase.from('registration_results').select('*').eq('batch_id', batch.id);
                              if (data) handleExportRosterPDF(data);
                              setLoadingHistory(false);
                            }}
                            className="px-3 py-2 sm:px-4 sm:py-3 bg-primary/10 hover:bg-primary/20 text-primary border border-primary/30 text-[9px] font-black uppercase tracking-widest transition-all"
                          >
                            Export List (PDF)
                          </button>
                          <button
                            onClick={async () => {
                              setLoadingHistory(true);
                              const { data } = await supabase.from('registration_results').select('*').eq('batch_id', batch.id);
                              if (data) handleExportCardsPDF(data);
                              setLoadingHistory(false);
                            }}
                            className="px-3 py-2 sm:px-4 sm:py-3 bg-primary/10 hover:bg-primary/20 text-primary border border-primary/30 text-[9px] font-black uppercase tracking-widest transition-all"
                          >
                            Export Cards (PDF)
                          </button>
                          <button
                            onClick={async () => {
                              setLoadingHistory(true);
                              const { data } = await supabase.from('registration_results').select('*').eq('batch_id', batch.id);
                              if (data) handleMassPrintReport(data);
                              setLoadingHistory(false);
                            }}
                            className="px-3 py-2 sm:px-4 sm:py-3 bg-primary/10 hover:bg-primary/20 text-primary border border-primary/30 text-[9px] font-black uppercase tracking-widest transition-all"
                          >
                            Print List
                          </button>
                          <button
                            onClick={async () => {
                              setLoadingHistory(true);
                              const { data } = await supabase.from('registration_results').select('*').eq('batch_id', batch.id);
                              if (data) handleMassPrint(data);
                              setLoadingHistory(false);
                            }}
                            className="px-3 py-2 sm:px-4 sm:py-3 bg-primary/10 hover:bg-primary/20 text-primary border border-primary/30 text-[9px] font-black uppercase tracking-widest transition-all"
                          >
                            Print Cards
                          </button>
                        </div>
                      </div>

                      {/* ── Batch Smart Actions ─────────────────────────────── */}
                      <div className="mt-4 flex flex-wrap gap-2 border-t border-border/40 pt-4">
                        {/* Export Credentials CSV */}
                        <button
                          onClick={() => handleExportCredentialsCSV(batch)}
                          disabled={loadingHistory}
                          title="Download a spreadsheet with name, email and password for every student in this batch. Use this to hand out login cards or import into another system."
                          className="px-3 py-2 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-[9px] font-black uppercase tracking-widest transition-all disabled:opacity-40"
                        >
                          Export Credentials CSV
                        </button>

                        {/* Assign to Class */}
                        <button
                          onClick={() => {
                            if (batchAssignPanel === batch.id) { setBatchAssignPanel(null); } else {
                              setBatchAssignPanel(batch.id);
                              setBatchAssignSchool('');
                              setBatchAssignClass('');
                            }
                          }}
                          title="Assign all students in this batch to a class. Sets class_id, school_id, and section_class on each student's account."
                          className="px-3 py-2 bg-sky-500/10 hover:bg-sky-500/20 text-sky-400 border border-sky-500/30 text-[9px] font-black uppercase tracking-widest transition-all"
                        >
                          {batchAssignPanel === batch.id ? 'Cancel' : 'Assign to Class'}
                        </button>

                        {/* Activate / Deactivate all */}
                        <button
                          onClick={() => handleBatchToggleActive(batch.id, true)}
                          disabled={loadingHistory}
                          title="Mark every student in this batch as active so they can log in."
                          className="px-3 py-2 bg-yellow-500/15 hover:bg-yellow-500/25 text-yellow-400 border border-yellow-500/40 text-[9px] font-black uppercase tracking-widest transition-all disabled:opacity-40"
                        >
                          Activate All
                        </button>
                        <button
                          onClick={() => handleBatchToggleActive(batch.id, false)}
                          disabled={loadingHistory}
                          title="Deactivate all students in this batch. They won't be able to log in until reactivated."
                          className="px-3 py-2 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 text-[9px] font-black uppercase tracking-widest transition-all disabled:opacity-40"
                        >
                          Deactivate All
                        </button>
                      </div>

                      {/* Assign-to-class panel */}
                      {batchAssignPanel === batch.id && (
                        <div className="mt-4 p-4 bg-sky-500/5 border border-sky-500/20 space-y-3 animate-in fade-in slide-in-from-top-3 duration-300">
                          <p className="text-[10px] text-sky-400 font-black uppercase tracking-widest">Assign all {batch.student_count} students to a class</p>
                          <p className="text-[10px] text-muted-foreground">Select the school first, then the class. All student accounts from this batch will be linked to that class. This also updates their school assignment.</p>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <select
                              value={batchAssignSchool}
                              onChange={e => { setBatchAssignSchool(e.target.value); setBatchAssignClass(''); }}
                              className="bg-background border border-border text-foreground text-xs px-3 py-2 focus:outline-none focus:border-primary"
                            >
                              <option value="">— Select school —</option>
                              {vaultSchools.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                            </select>
                            <select
                              value={batchAssignClass}
                              onChange={e => setBatchAssignClass(e.target.value)}
                              disabled={!batchAssignSchool}
                              className="bg-background border border-border text-foreground text-xs px-3 py-2 focus:outline-none focus:border-primary disabled:opacity-40"
                            >
                              <option value="">— Select class —</option>
                              {vaultClasses.filter(c => c.school_id === batchAssignSchool).map(c => (
                                <option key={c.id} value={c.id}>{c.name}</option>
                              ))}
                            </select>
                          </div>
                          <button
                            disabled={!batchAssignClass || loadingHistory}
                            onClick={() => handleBatchAssignClass(batch.id)}
                            className="px-4 py-2 bg-sky-600 hover:bg-sky-500 text-white text-[9px] font-black uppercase tracking-widest transition-all disabled:opacity-40"
                          >
                            {loadingHistory ? 'Assigning…' : 'Assign Now'}
                          </button>
                        </div>
                      )}

                      {selectedBatchId === batch.id && (
                        <div className="mt-12 pt-12 border-t border-border space-y-4 animate-in fade-in slide-in-from-top-6 duration-700">
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-4 px-2 sm:px-4 gap-3">
                            <div className="flex items-center gap-3 flex-wrap">
                              <p className="text-[11px] text-muted-foreground font-black uppercase tracking-[0.3em]">
                                {batchResults.length} Students
                              </p>
                              <label className="flex items-center gap-2 bg-black/40 px-3 py-1.5 border border-border cursor-pointer">
                                <input
                                  type="checkbox"
                                  className="w-4 h-4 bg-transparent border-primary/50 rounded-xl text-primary focus:ring-0 focus:ring-offset-0 cursor-pointer"
                                  checked={batchResults.length > 0 && selectedResultIds.length === batchResults.length}
                                  onChange={(e) => {
                                    if (e.target.checked) setSelectedResultIds(batchResults.map(r => r.id));
                                    else setSelectedResultIds([]);
                                  }}
                                />
                                <span className="text-[9px] text-muted-foreground font-black uppercase tracking-widest">Select All</span>
                              </label>
                            </div>
                            {selectedResultIds.length > 0 && (
                              <div className="flex flex-wrap gap-1 animate-in fade-in zoom-in-95 duration-200">
                                <button
                                  onClick={() => handleExportRosterPDF(batchResults.filter(r => selectedResultIds.includes(r.id)))}
                                  className="px-3 py-2 bg-primary/10 hover:bg-primary/20 text-primary text-[9px] font-black uppercase tracking-widest transition-all border border-primary/30"
                                >
                                  Export List
                                </button>
                                <button
                                  onClick={() => handleExportCardsPDF(batchResults.filter(r => selectedResultIds.includes(r.id)))}
                                  className="px-3 py-2 bg-primary/10 hover:bg-primary/20 text-primary text-[9px] font-black uppercase tracking-widest transition-all border border-primary/30"
                                >
                                  Export Cards
                                </button>
                                <button
                                  onClick={() => handleMassPrintReport(batchResults.filter(r => selectedResultIds.includes(r.id)))}
                                  className="px-3 py-2 bg-primary/10 hover:bg-primary/20 text-primary text-[9px] font-black uppercase tracking-widest transition-all border border-primary/30"
                                >
                                  Print List
                                </button>
                                <button
                                  onClick={() => handleMassPrint(batchResults.filter(r => selectedResultIds.includes(r.id)))}
                                  className="px-3 py-2 bg-primary/10 hover:bg-primary/20 text-primary text-[9px] font-black uppercase tracking-widest transition-all border border-primary/30"
                                >
                                  Print Cards
                                </button>
                                {['admin', 'teacher'].includes(profile?.role || '') && (
                                  <button
                                    onClick={handleBulkDelete}
                                    className="px-3 py-2 bg-rose-600/10 hover:bg-rose-600/20 text-rose-400 text-[9px] font-black uppercase tracking-widest transition-all border border-rose-500/30"
                                  >
                                    Delete Selected
                                  </button>
                                )}
                              </div>
                            )}
                          </div>
                          <div className="max-h-[500px] overflow-y-auto custom-scrollbar space-y-1.5 pr-2">
                            {batchResults.map((r, ri) => (
                              <div key={r.id} className={`flex items-center justify-between p-2 sm:p-3 transition-all group/it border ${selectedResultIds.includes(r.id) ? 'bg-primary/5 border-primary/30' : 'bg-white/[0.02] border-border hover:border-primary/20 hover:bg-white/[0.04]'}`}>
                                <div className="flex items-center gap-3 sm:gap-6 overflow-hidden">
                                  <div className="flex items-center gap-2 sm:gap-4 shrink-0">
                                    <input
                                      type="checkbox"
                                      className="w-4 h-4 bg-black/40 border-border rounded-xl text-primary focus:ring-0 focus:ring-offset-0 cursor-pointer"
                                      checked={selectedResultIds.includes(r.id)}
                                      onChange={(e) => {
                                        if (e.target.checked) setSelectedResultIds(prev => [...prev, r.id]);
                                        else setSelectedResultIds(prev => prev.filter(id => id !== r.id));
                                      }}
                                    />
                                    <div className="w-8 h-8 bg-black/40 flex items-center justify-center text-[9px] font-black italic text-muted-foreground border border-border group-hover/it:text-primary group-hover/it:border-primary/40 transition-all">
                                      {String(ri + 1).padStart(2, '0')}
                                    </div>
                                  </div>
                                  <div className="min-w-0">
                                    {editingResultId === r.id ? (
                                      <div className="flex gap-3 w-full animate-in fade-in zoom-in-95 duration-200">
                                        <input
                                          id={`edit-name-${r.id}`}
                                          autoFocus
                                          defaultValue={r.full_name}
                                          className="bg-black/80 border border-primary/50 px-4 py-2 text-white font-black text-xs min-w-[150px] outline-none"
                                        />
                                        <input
                                          id={`edit-class-${r.id}`}
                                          defaultValue={r.class_name || ''}
                                          className="bg-black/80 border border-primary/50 px-4 py-2 text-primary font-black text-[10px] uppercase tracking-widest min-w-[80px] outline-none"
                                        />
                                        <button
                                          onClick={async () => {
                                            const n = (document.getElementById(`edit-name-${r.id}`) as HTMLInputElement).value;
                                            const c = (document.getElementById(`edit-class-${r.id}`) as HTMLInputElement).value;
                                            await fetch('/api/students/bulk-register', {
                                              method: 'PATCH',
                                              headers: { 'Content-Type': 'application/json' },
                                              body: JSON.stringify({ type: 'result', data: { id: r.id, full_name: n, class_name: c, email: r.email } })
                                            });
                                            setEditingResultId(null);
                                            const { data } = await supabase.from('registration_results').select('*').eq('batch_id', batch.id);
                                            if (data) setBatchResults(data);
                                            toast.success('Identity node updated.');
                                          }}
                                          className="bg-primary hover:bg-primary text-white px-4 flex items-center justify-center transition-all"
                                        >
                                          <CheckCircleIcon className="w-4 h-4" />
                                        </button>
                                      </div>
                                    ) : (
                                      <div onDoubleClick={() => setEditingResultId(r.id)} className="cursor-pointer">
                                        <p className="text-[12px] font-black text-foreground italic truncate uppercase tracking-tight group-hover/it:text-primary transition-colors">{r.full_name}</p>
                                        <p className="text-[8.5px] text-muted-foreground font-mono tracking-tighter truncate mt-0.5">{r.email}</p>
                                      </div>
                                    )}
                                  </div>
                                </div>
                                <div className="flex items-center gap-2 sm:gap-4 shrink-0">
                                  {editingResultId !== r.id && (
                                    <>
                                      <span className="text-[9px] font-black text-primary/80 bg-primary/10 px-2 py-1 sm:px-3 sm:py-1.5 border border-primary/20 uppercase tracking-widest hidden sm:block italic">
                                        {r.class_name || '...'}
                                      </span>
                                      {/* Always visible on mobile, hover-reveal on desktop */}
                                      <div className="flex gap-1 sm:opacity-0 sm:group-hover/it:opacity-100 transition-opacity">
                                        <button
                                          onClick={() => setEditingResultId(r.id)}
                                          className="p-2 sm:p-2.5 bg-muted hover:bg-primary/20 text-primary sm:text-primary/60 hover:text-primary transition-all border border-border"
                                          title="Edit"
                                        >
                                          <PencilIcon className="w-3.5 h-3.5" />
                                        </button>
                                        <button
                                          onClick={() => handleMassPrint([r])}
                                          className="p-2 sm:p-2.5 bg-muted hover:bg-primary/20 text-primary sm:text-primary/60 hover:text-primary transition-all border border-border"
                                          title="Print Card"
                                        >
                                          <PrinterIcon className="w-3.5 h-3.5" />
                                        </button>
                                        <button
                                          onClick={() => handleExportCardsPDF([r])}
                                          className="p-2 sm:p-2.5 bg-muted hover:bg-primary/20 text-primary sm:text-primary/60 hover:text-primary transition-all border border-border hidden sm:block"
                                          title="Export PDF"
                                        >
                                          <DocumentArrowDownIcon className="w-3.5 h-3.5" />
                                        </button>
                                        {['admin', 'teacher'].includes(profile?.role || '') && (
                                          <button
                                            onClick={async () => {
                                              if (!confirm('Delete this record?')) return;
                                              await fetch(`/api/students/bulk-register?resultId=${r.id}`, { method: 'DELETE' });
                                              setBatchResults(prev => prev.filter(x => x.id !== r.id));
                                              fetchHistory();
                                              toast.success('Record deleted.');
                                            }}
                                            className="p-2 sm:p-2.5 bg-muted hover:bg-rose-600/20 text-rose-400 sm:text-rose-400/60 hover:text-rose-400 transition-all border border-border"
                                            title="Delete"
                                          >
                                            <TrashIcon className="w-3.5 h-3.5" />
                                          </button>
                                        )}
                                      </div>
                                    </>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === 'unified' && (
          <div className="max-w-6xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-8 duration-500">
            {/* Unified Credentials Header */}
            <div className="bg-card border border-primary/20 p-4 sm:p-6 relative overflow-hidden shadow-2xl">
              <div className="absolute top-0 right-0 w-full h-[1px] bg-gradient-to-r from-transparent via-primary/20 to-transparent" />
              <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
                <div>
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className="w-2.5 h-2.5 bg-primary rounded-full animate-pulse shadow-[0_0_15px_rgba(234,88,12,0.4)]" />
                    <span className="text-[8px] sm:text-[10px] text-primary font-black uppercase tracking-[0.4em]">Unified School Roster Center</span>
                  </div>
                  <h2 className="text-xl sm:text-2xl font-black text-foreground italic uppercase tracking-tighter mb-1">Records Credentials</h2>
                  <p className="text-muted-foreground text-[10px] font-bold uppercase tracking-widest leading-relaxed">
                    Merge, search, filter and print credentials across ALL registration sessions.
                  </p>
                </div>
                
                {/* School Selector */}
                <div className="min-w-[240px]">
                  <label className="block text-muted-foreground text-[10px] font-black uppercase tracking-widest mb-1.5 flex items-center gap-1.5">
                    <BuildingOffice2Icon className="w-3.5 h-3.5" /> Target School Node
                  </label>
                  <select
                    value={unifiedSchoolId}
                    onChange={(e) => {
                      const opt = e.target.options[e.target.selectedIndex];
                      setUnifiedSchoolId(e.target.value);
                      setUnifiedSchoolName(e.target.value ? opt.text : '');
                      setUnifiedClass('');
                      fetchUnifiedCredentials(e.target.value);
                    }}
                    className="w-full px-3 py-2 bg-background border border-border text-sm text-foreground focus:outline-none focus:border-primary transition-colors cursor-pointer"
                  >
                    <option value="">— Select a school —</option>
                    <option value="all">🌍 All Schools</option>
                    {schools.map((s) => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {/* Disclaimer & Info Box */}
            <div className="bg-yellow-500/15 border border-yellow-500/40 p-4 flex items-start gap-3">
              <ExclamationTriangleIcon className="w-5 h-5 text-yellow-400 shrink-0 mt-0.5" />
              <div className="space-y-1.5">
                <h4 className="text-xs font-bold text-yellow-400 uppercase tracking-wider">Access Cipher & Security Protocol</h4>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  The access ciphers shown below are the <strong>initial temporary passwords</strong> generated when student accounts were activated or batch-registered. If a student has already logged in and customized their password, their active password will not be displayed here for data confidentiality.
                </p>
              </div>
            </div>

            {unifiedSchoolId && (
              <>
                {/* Filter & Tool bar */}
                <div className="bg-card border border-border p-4 flex flex-col md:flex-row gap-4 items-center justify-between">
                  <div className="flex flex-wrap items-center gap-4 w-full md:w-auto">
                    {/* Class Filter */}
                    <div className="flex-1 md:flex-initial min-w-[140px]">
                      <select
                        value={unifiedClass}
                        onChange={(e) => setUnifiedClass(e.target.value)}
                        className="w-full bg-background border border-border px-3 py-2 text-xs text-foreground focus:outline-none focus:border-primary cursor-pointer"
                      >
                        <option value="">All Classes</option>
                        {uniqueUnifiedClasses.map(c => (
                          <option key={c} value={c}>{c}</option>
                        ))}
                      </select>
                    </div>

                    {/* Method Filter */}
                    <div className="flex-1 md:flex-initial min-w-[140px]">
                      <select
                        value={unifiedBatchFilter}
                        onChange={(e) => setUnifiedBatchFilter(e.target.value as any)}
                        className="w-full bg-background border border-border px-3 py-2 text-xs text-foreground focus:outline-none focus:border-primary cursor-pointer"
                      >
                        <option value="all">All Registrations</option>
                        <option value="bulk">Bulk Sessions Only</option>
                        <option value="single">Single Activations Only</option>
                      </select>
                    </div>

                    {/* Live Search */}
                    <div className="w-full md:w-[220px]">
                      <input
                        type="text"
                        placeholder="SEARCH BY NAME OR EMAIL..."
                        value={unifiedSearchQuery}
                        onChange={(e) => setUnifiedSearchQuery(e.target.value)}
                        className="w-full bg-background border border-border px-3 py-2 text-xs font-bold tracking-widest text-foreground focus:outline-none focus:border-primary placeholder-muted-foreground/50"
                      />
                    </div>
                  </div>

                  {/* Mass Exports */}
                  <div className="flex flex-wrap gap-2 w-full md:w-auto justify-end">
                    <button
                      onClick={() => handlePrintUnifiedRoster(filteredUnifiedResults)}
                      disabled={loadingUnified || filteredUnifiedResults.length === 0}
                      className="px-4 py-2.5 bg-primary/10 hover:bg-primary/20 border border-primary/30 text-primary text-[9px] font-black uppercase tracking-widest transition-all disabled:opacity-40"
                    >
                      Print Class Roster
                    </button>
                    <button
                      onClick={() => handlePrintUnifiedSlips(filteredUnifiedResults)}
                      disabled={loadingUnified || filteredUnifiedResults.length === 0}
                      className="px-4 py-2.5 bg-primary/10 hover:bg-primary/20 border border-primary/30 text-primary text-[9px] font-black uppercase tracking-widest transition-all disabled:opacity-40"
                    >
                      Print Login Slips
                    </button>
                    <button
                      onClick={() => {
                        const headers = ['Full Name', 'Email', 'Password', 'Class', 'Type'];
                        const rows = filteredUnifiedResults.map(r => [
                          `"${r.full_name.replace(/"/g, '""')}"`,
                          `"${r.email}"`,
                          `"${r.password}"`,
                          `"${r.class_name || ''}"`,
                          `"${r.is_single_registration ? 'Single' : 'Bulk'}"`
                        ]);
                        const csv = [headers, ...rows].map(e => e.join(',')).join('\n');
                        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement('a');
                        a.href = url;
                        a.download = `unified-credentials-${unifiedSchoolName.toLowerCase().replace(/\s+/g, '-')}-${new Date().toISOString().split('T')[0]}.csv`;
                        a.click();
                        URL.revokeObjectURL(url);
                        toast.success('Unified credentials CSV downloaded.');
                      }}
                      disabled={loadingUnified || filteredUnifiedResults.length === 0}
                      className="px-4 py-2.5 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 text-[9px] font-black uppercase tracking-widest transition-all disabled:opacity-40"
                    >
                      Export CSV
                    </button>
                  </div>
                </div>

                {/* Loading state */}
                {loadingUnified ? (
                  <div className="h-[250px] flex flex-col items-center justify-center gap-4 bg-card border border-border">
                    <ArrowPathIcon className="w-8 h-8 text-primary animate-spin" />
                    <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground animate-pulse">Retrieving school credentials...</p>
                  </div>
                ) : filteredUnifiedResults.length === 0 ? (
                  <div className="h-[250px] flex flex-col items-center justify-center gap-3 bg-card border border-border border-dashed">
                    <UserGroupIcon className="w-10 h-10 text-muted-foreground/30" />
                    <p className="text-xs text-muted-foreground italic uppercase tracking-widest font-black">No student credentials match filters</p>
                  </div>
                ) : (
                  /* unified roster table */
                  <div className="bg-card border border-border overflow-hidden">
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs border-separate border-spacing-0">
                        <thead>
                          <tr className="border-b border-border bg-white/[0.02] text-muted-foreground uppercase tracking-widest text-[9px] font-black text-left">
                            <th className="px-4 py-3">#</th>
                            <th className="px-4 py-3">Student ID</th>
                            <th className="px-4 py-3">School Node</th>
                            <th className="px-4 py-3">Full Name</th>
                            <th className="px-4 py-3">Academic Tier</th>
                            <th className="px-4 py-3">System Email</th>
                            <th className="px-4 py-3">Access Cipher</th>
                            <th className="px-4 py-3">Reg Type</th>
                            <th className="px-4 py-3 text-right">Session Origin</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5">
                          {filteredUnifiedResults.map((r, i) => {
                            const sCode = r.portal_user_id ? accessCardCodeForStudent(r.portal_user_id) : '—';
                            return (
                              <tr key={r.id} className="hover:bg-white/[0.02] transition-colors group">
                                <td className="px-4 py-3 text-muted-foreground font-mono">{i + 1}</td>
                                <td className="px-4 py-3 font-mono font-black text-primary text-[10px]">{sCode}</td>
                                <td className="px-4 py-3 font-bold text-muted-foreground truncate max-w-[150px]" title={r.school_name || '—'}>
                                  {r.school_name || '—'}
                                </td>
                                <td className="px-4 py-3 font-bold text-foreground">{r.full_name}</td>
                                <td className="px-4 py-3">
                                  <span className="px-2 py-0.5 bg-primary/10 text-primary font-mono text-[9px] uppercase tracking-wider font-bold">
                                    {r.class_name || 'GENERAL'}
                                  </span>
                                </td>
                                <td className="px-4 py-3 font-mono text-muted-foreground">
                                  <div className="flex items-center gap-1.5 justify-between max-w-[200px]">
                                    <span className="truncate">{r.email}</span>
                                    <button
                                      onClick={() => {
                                        navigator.clipboard.writeText(r.email || '');
                                        toast.success('Email copied!');
                                      }}
                                      className="p-1 opacity-0 group-hover:opacity-100 hover:bg-white/10 text-muted-foreground hover:text-foreground rounded transition-opacity"
                                      title="Copy Email"
                                    >
                                      <ClipboardDocumentListIcon className="w-3.5 h-3.5" />
                                    </button>
                                  </div>
                                </td>
                                <td className="px-4 py-3 font-mono font-bold text-yellow-400">
                                  <div className="flex items-center gap-1.5 justify-between max-w-[180px]">
                                    <span>{r.password}</span>
                                    <button
                                      onClick={() => {
                                        navigator.clipboard.writeText(r.password || '');
                                        toast.success('Password copied!');
                                      }}
                                      className="p-1 opacity-0 group-hover:opacity-100 hover:bg-white/10 text-muted-foreground hover:text-foreground rounded transition-opacity"
                                      title="Copy Password"
                                    >
                                      <ClipboardDocumentListIcon className="w-3.5 h-3.5" />
                                    </button>
                                  </div>
                                </td>
                                <td className="px-4 py-3">
                                  <span className={`px-2 py-0.5 text-[8px] font-black uppercase tracking-wider ${r.is_single_registration ? 'bg-sky-500/10 text-sky-400 border border-sky-500/20' : 'bg-primary/10 text-primary border border-primary/20'}`}>
                                    {r.is_single_registration ? 'Single' : 'Bulk'}
                                  </span>
                                </td>
                                <td className="px-4 py-3 text-right text-muted-foreground text-[10px] font-bold uppercase truncate max-w-[150px]" title={r.batch_name}>
                                  {r.batch_name}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </>
            )}

            {!unifiedSchoolId && (
              <div className="h-[300px] flex flex-col items-center justify-center gap-4 bg-card border border-border border-dashed text-center p-6">
                <BuildingOffice2Icon className="w-12 h-12 text-primary/30" />
                <div>
                  <h3 className="text-foreground font-black text-sm uppercase tracking-widest mb-1.5">No School Node Selected</h3>
                  <p className="text-muted-foreground text-xs max-w-sm leading-relaxed">
                    Select a school node from the target selector above to query the credentials database.
                  </p>
                </div>
              </div>
            )}
          </div>
        )}

        <AddStudentModal
          isOpen={isSingleModalOpen}
          onClose={() => setIsSingleModalOpen(false)}
          onSuccess={() => { setIsSingleModalOpen(false); setActiveTab('register'); toast.success('Student registered successfully. Open Records to print cards or review credentials.'); }}
        />
      </div>
    </>
  );
}
