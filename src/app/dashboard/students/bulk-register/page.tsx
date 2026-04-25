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
}

interface RegisterResult extends GeneratedStudent {
  status: 'created' | 'updated' | 'skipped' | 'failed';
  error?: string;
  batch_id?: string;
  portal_user_id?: string;
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
  const [step, setStep] = useState<'input' | 'preview' | 'done' | 'registry' | 'single'>('input');

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
  const [selectedResultIds, setSelectedResultIds] = useState<string[]>([]);
  const [dbDupNames, setDbDupNames] = useState<Set<string>>(new Set()); // names already in DB at selected school
  const [checkingDups, setCheckingDups] = useState(false);
  const [dupOverride, setDupOverride] = useState(false); // user confirmed they want to proceed despite name matches
  const [activeTab, setActiveTab] = useState<'register' | 'vault'>('register');
  const [isSingleModalOpen, setIsSingleModalOpen] = useState(false);

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

      const sCode = `RC-${(res.portal_user_id || '').slice(0, 8).toUpperCase() || '--------'}`;
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
             <div style="font-weight:900; font-size: 14px;">BATCH archive: ${batchIdStr}</div>
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
      const sCode = 'RC-' + (pId.slice(0, 8).toUpperCase() || '--------');
      const qUrl = encodeURIComponent('https://rillcod.com/student/' + pId);

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
              ${fieldVis('qr') ? `
              <div class="qrp">
                <img src="https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${qUrl}" class="qr" crossorigin="anonymous" />
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
    const { data, error } = await (supabase as any)
      .from('registration_batches')
      .select('*, registration_results(count)')
      .order('created_at', { ascending: false });
    if (!error && data) {
      // Use live count from registration_results join; fall back to stored student_count
      const hydrated = data.map((b: any) => ({
        ...b,
        student_count: b.registration_results?.[0]?.count ?? b.student_count ?? 0,
      }));
      setHistory(hydrated);
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
  const handlePreview = useCallback(async () => {
    // Use only the standard class code (defaultClass) as the fallback arm label.
    // The registry class (Hilltop etc.) is an internal grouping — it must NOT
    // bleed into the printed credentials or the class_name field.
    const built = buildStudentList(namesText.split('\n'), defaultClass.trim() || undefined);
    if (!built.length) return;
    setPreview(built);
    setDbDupNames(new Set());
    setDupOverride(false);
    setStep('preview');

    // ── Check DB for existing students at this school by name ────────────
    if (selectedSchoolId) {
      setCheckingDups(true);
      try {
        const { data } = await supabase
          .from('portal_users')
          .select('full_name')
          .eq('school_id', selectedSchoolId)
          .eq('role', 'student');
        if (data) {
          const existingNames = new Set(data.map((s: any) => s.full_name.trim().toLowerCase()));
          const dupSet = new Set<string>(
            built
              .map(s => s.full_name.trim().toLowerCase())
              .filter(n => existingNames.has(n))
          );
          setDbDupNames(dupSet);
        }
      } catch { /* non-blocking */ } finally {
        setCheckingDups(false);
      }
    }
  }, [namesText, defaultClass, selectedSchoolId, supabase]);  

  // ── Register ─────────────────────────────────────────────────────────────
  const handleRegister = async () => {
    const valid = preview.filter((s) => s.full_name.trim() && s.email.trim());
    if (!valid.length) return;

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
      for (let i = 0; i < valid.length; i += BATCH) {
        const batch = valid.slice(i, i + BATCH);
        setRegisterProgress({ done: i, total: valid.length, current: batch[0]?.full_name ?? '' });

        const body: Record<string, any> = {
          batch_id: persistentBatchId,
          students: batch,
          class_id: selectedRegistryClass || null,
          class_name: effectiveClassCode || null,
          allow_same_name: dupOverride, // user confirmed different students with same name
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

      // Show success screen, then load history in background
      setStep('done');
      fetchHistory().catch(() => { }); // non-blocking

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
      <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-none animate-spin" />
    </div>
  );
  if (!canAccess) return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <p className="text-muted-foreground">Access restricted to admins and teachers.</p>
    </div>
  );

  const dups = dupEmails(preview);
  const incompleteRows = preview.filter((r) => !r.full_name.trim() || !r.email.trim());
  const validCount = preview.length - incompleteRows.length;
  const previewClasses = [...new Set(preview.map((s) => s.class_name).filter(Boolean))];

  const successCount = results?.filter((r) => r.status === 'created' || r.status === 'updated').length ?? 0;
  const skipCount = results?.filter((r) => r.status === 'skipped').length ?? 0;
  const failCount = results?.filter((r) => r.status === 'failed').length ?? 0;

  const selectedProgLabel = programmes.find((p) => p.id === selectedProgramId)?.name ?? '';

  // Shared input class
  const inp = 'w-full bg-transparent border border-border rounded-none px-2 py-1.5 text-foreground text-xs focus:outline-none focus:border-primary/50 focus:bg-primary/5 transition-colors placeholder-muted-foreground';

  return (
    <>
      <div className="min-h-screen bg-background p-4 sm:p-6 md:p-8 font-sans">

        {/* Page Header */}
        <div className="max-w-7xl mx-auto mb-6 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-primary flex items-center justify-center rotate-3 border border-primary/20 shadow-xl shadow-primary/10 hover:rotate-6 transition-transform flex-shrink-0">
              <SparklesIcon className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-black text-foreground italic tracking-tighter uppercase">Student Registration</h1>
              <p className="text-muted-foreground text-[9px] uppercase font-bold tracking-[0.4em] mt-1">Add students individually or in bulk</p>
            </div>
          </div>
          <Link
            href="/dashboard/card-studio?mode=issuance&type=student"
            className="hidden sm:inline-flex items-center gap-2 px-4 py-2.5 bg-primary/10 hover:bg-primary/20 border border-primary/30 text-primary text-[9px] font-black uppercase tracking-[0.2em] transition-all"
          >
            <RectangleGroupIcon className="w-4 h-4" />
            Card Studio
          </Link>
        </div>

        {/* Unified Tab Bar */}
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
              <button
                onClick={() => { setActiveTab('vault'); fetchHistory(); }}
                className={`flex-1 sm:flex-none px-4 sm:px-6 py-2.5 text-[9px] font-black uppercase tracking-[0.2em] transition-all whitespace-nowrap ${activeTab === 'vault' ? 'bg-primary text-white shadow-lg' : 'text-muted-foreground hover:text-foreground'}`}
              >
                History
              </button>
            </div>
          </div>
        </div>

        {activeTab === 'register' && (
          <div className="max-w-4xl mx-auto space-y-12">

            {/* ── Step Progress (Bulk Import only) ─────────────────────── */}
            {step !== 'single' && step !== 'registry' && (
              <div className="max-w-4xl mx-auto mb-2">
                <div className="flex items-center gap-0">
                  {([
                    { key: 'input', label: '1. Configure & Add Names' },
                    { key: 'preview', label: '2. Review Students' },
                    { key: 'done', label: '3. Done' },
                  ] as { key: typeof step; label: string }[]).map((s, i, arr) => {
                    const stepOrder = ['input', 'preview', 'done'];
                    const currentIdx = stepOrder.indexOf(step);
                    const sIdx = stepOrder.indexOf(s.key);
                    const isActive = step === s.key;
                    const isDone = sIdx < currentIdx;
                    return (
                      <div key={s.key} className="flex items-center flex-1 min-w-0">
                        <div className={`flex items-center gap-2 px-4 py-2.5 text-[10px] font-black uppercase tracking-widest whitespace-nowrap border-y border-l ${i === arr.length - 1 ? 'border-r' : ''} transition-all flex-shrink-0 ${isActive ? 'bg-primary text-white border-primary' : isDone ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-card text-muted-foreground border-border'}`}>
                          <span className={`w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-black flex-shrink-0 ${isActive ? 'bg-white/20' : isDone ? 'bg-emerald-500/30' : 'bg-muted'}`}>
                            {isDone ? '✓' : i + 1}
                          </span>
                          <span className="hidden sm:inline">{s.label}</span>
                          <span className="sm:hidden">{i + 1}</span>
                        </div>
                        {i < arr.length - 1 && <div className="flex-1 h-px bg-border" />}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* ══════════════════ STEP 1 — SINGLE ══════════════════════════ */}
            {step === 'single' && (
              <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                <AddStudentModal inline isOpen={true} onClose={() => { }} onSuccess={() => { setStep('input'); setActiveTab('vault'); fetchHistory(); toast.success('Student registered. Check history.'); }} classId={selectedRegistryClass || undefined} />
              </div>
            )}

            {step === 'input' && (
              <div className="space-y-6">

                {/* ── Batch Settings ──────────────────────────────────── */}
                <div className="bg-card border border-border rounded-none overflow-hidden">
                  <button
                    onClick={() => setSettingsOpen((o) => !o)}
                    className="w-full flex items-center justify-between px-6 py-4 text-left hover:bg-white/[0.02] transition-colors"
                  >
                    <div className="flex items-center gap-2 font-bold text-sm">
                      <BuildingOffice2Icon className="w-4 h-4 text-primary" />
                      <span className="text-foreground">Setup</span>
                      <span className="text-muted-foreground font-normal text-xs ml-1">— choose school, class &amp; programme</span>
                      <span className="px-2 py-0.5 text-[9px] font-black bg-primary/10 text-primary border border-primary/20 rounded-full uppercase tracking-widest ml-2">Required first</span>
                    </div>
                    <ChevronDownIcon className={`w-4 h-4 text-muted-foreground transition-transform ${settingsOpen ? 'rotate-180' : ''}`} />
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
                              }}
                              className="w-full px-3 py-2.5 bg-card shadow-sm border border-border rounded-none text-sm text-foreground focus:outline-none focus:border-primary/50 transition-colors"
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
                            <BookOpenIcon className="w-3.5 h-3.5" /> Programme
                          </label>
                          <select
                            value={selectedProgramId}
                            onChange={(e) => setSelectedProgramId(e.target.value)}
                            className="w-full px-3 py-2.5 bg-card shadow-sm border border-border rounded-none text-sm text-foreground focus:outline-none focus:border-primary/50 transition-colors"
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

                        {/* Teacher's created class — primary class assignment */}
                        <div>
                          <div className="flex items-center justify-between mb-1">
                            <label className="text-muted-foreground text-xs font-bold uppercase tracking-widest flex items-center gap-1.5">
                              <AcademicCapIcon className="w-3.5 h-3.5" />
                              Place in Class
                            </label>
                            <Link
                              href="/dashboard/classes/add"
                              className="flex items-center gap-1 px-2 py-0.5 bg-primary/10 hover:bg-primary/20 border border-primary/20 rounded-none text-primary text-[10px] font-bold transition-colors"
                              title="Create a new class"
                            >
                              <PlusIcon className="w-3 h-3" /> New Class
                            </Link>
                          </div>
                          <p className="text-white/25 text-[11px] mb-2">
                            Choose one of your classes — all students in this batch will be added to it.
                          </p>
                          {filteredRegistryClasses.length > 0 ? (
                            <select
                              value={selectedRegistryClass}
                              onChange={(e) => setSelectedRegistryClass(e.target.value)}
                              disabled={!selectedSchoolId}
                              className="w-full px-3 py-2.5 bg-card border border-primary/20 rounded-none text-sm text-foreground focus:outline-none focus:border-primary/50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                            >
                              <option value="">— No class selected —</option>
                              {filteredRegistryClasses.map((c) => (
                                <option key={c.id} value={c.id}>
                                  {c.name}{c.section_class ? ` (${c.section_class})` : ''}
                                </option>
                              ))}
                            </select>
                          ) : (
                            <div className="px-3 py-2.5 bg-white/3 border border-border rounded-none text-white/25 text-sm italic">
                              {!selectedSchoolId ? 'Select a school first.' : 'No classes found for this school.'}
                            </div>
                          )}
                          {selectedRegistryClass && (() => {
                            const rc = filteredRegistryClasses.find((c) => c.id === selectedRegistryClass);
                            return rc ? (
                              <p className="text-primary/70 text-[11px] mt-1.5">
                                Students will be tagged as <span className="font-mono font-bold">{rc.section_class ?? rc.name}</span>
                              </p>
                            ) : null;
                          })()}
                        </div>

                        {/* Fallback standard class code */}
                        <div>
                          <label className="block text-muted-foreground text-xs font-bold uppercase tracking-widest mb-1 flex items-center gap-1.5">
                            <AcademicCapIcon className="w-3.5 h-3.5" />
                            Class Code / Arm <span className="text-muted-foreground normal-case font-normal ml-1">(optional)</span>
                          </label>
                          <p className="text-white/25 text-[11px] mb-2">
                            Select the arm (e.g. JSS2A, SS1B) — applies to any student whose name doesn&apos;t include a class code.
                          </p>
                          <select
                            value={defaultClass}
                            onChange={(e) => setDefaultClass(e.target.value)}
                            className="w-full px-3 py-2.5 bg-card shadow-sm border border-border rounded-none text-sm text-foreground focus:outline-none focus:border-primary/50 transition-colors"
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
                          <span className="text-muted-foreground">Students without inline class will be tagged:</span>
                          <span className="px-2 py-0.5 bg-primary/15 text-foreground font-mono font-bold rounded-none border border-primary/20">
                            {effectiveClassCode}
                          </span>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* ── Names textarea ──────────────────────────────────── */}
                <div className="bg-card border border-border rounded-none p-6">
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
                    className="w-full px-4 py-3 bg-card shadow-sm border border-border rounded-none text-sm text-foreground placeholder-muted-foreground resize-none focus:outline-none focus:border-primary/50 transition-colors font-mono leading-relaxed"
                  />
                  <p className="text-muted-foreground text-xs mt-2">
                    You can correct any mistakes in the next step — every field is editable before you register.
                  </p>
                </div>

                <div className="grid md:grid-cols-2 gap-4">
                  <div className="bg-primary/10 border border-primary/20 rounded-none p-5">
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
                  <div className="bg-primary/10 border border-primary/20 rounded-none p-5">
                    <h3 className="text-foreground font-bold text-sm mb-3 flex items-center gap-2">
                      <AcademicCapIcon className="w-4 h-4" /> How classes work
                    </h3>
                    <ul className="space-y-1.5 text-muted-foreground text-xs list-disc list-inside">
                      <li>Header line: <span className="font-mono bg-primary/20 px-1 rounded">JSS2A</span> — applies to names below</li>
                      <li>Inline: <span className="font-mono bg-primary/20 px-1 rounded">John Doe SS2B</span></li>
                      <li>Supported: <span className="font-mono bg-primary/20 px-1 rounded">JSS1–3 · SS1–3 · SSS1–3 · BASIC 1–6</span></li>
                      <li>Section letters OK: <span className="font-mono bg-primary/20 px-1 rounded">JSS2A · SS1C</span></li>
                      <li>Fallback: use the <em>Default Class</em> setting above</li>
                    </ul>
                  </div>
                </div>

                <button
                  onClick={handlePreview}
                  disabled={!namesText.trim()}
                  className="w-full py-3.5 bg-primary hover:bg-primary disabled:opacity-40 disabled:cursor-not-allowed text-foreground font-bold rounded-none transition-colors text-sm"
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
                      <span className="flex items-center gap-1.5 px-3 py-1.5 bg-primary/10 border border-primary/20 rounded-none text-primary">
                        <BuildingOffice2Icon className="w-3.5 h-3.5" />
                        {selectedSchoolName || 'Selected school'}
                      </span>
                    )}
                    {selectedProgramId && (
                      <span className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-500/10 border border-emerald-500/20 rounded-none text-emerald-300">
                        <BookOpenIcon className="w-3.5 h-3.5" />
                        Auto-enrol: {selectedProgLabel}
                      </span>
                    )}
                    {effectiveClassCode && (
                      <span className="flex items-center gap-1.5 px-3 py-1.5 bg-primary/10 border border-primary/20 rounded-none text-foreground font-mono">
                        <AcademicCapIcon className="w-3.5 h-3.5" />
                        Class: {effectiveClassCode}
                      </span>
                    )}
                  </div>
                )}

                {/* Stats bar */}
                <div className="flex flex-wrap gap-3">
                  <div className="flex items-center gap-2 px-4 py-2 bg-card shadow-sm rounded-none border border-border text-sm">
                    <UserGroupIcon className="w-4 h-4 text-primary" />
                    <span className="text-foreground font-bold">{preview.length}</span>
                    <span className="text-muted-foreground">students</span>
                  </div>
                  {previewClasses.length > 0 && (
                    <div className="flex items-center gap-2 px-4 py-2 bg-primary/10 rounded-none border border-primary/20 text-sm">
                      <AcademicCapIcon className="w-4 h-4 text-primary" />
                      <span className="text-foreground font-bold">{previewClasses.length}</span>
                      <span className="text-muted-foreground text-xs">class{previewClasses.length !== 1 ? 'es' : ''}:</span>
                      <span className="text-foreground font-mono text-xs">{previewClasses.join(' · ')}</span>
                    </div>
                  )}
                  {dups.size > 0 && (
                    <div className="flex items-center gap-2 px-4 py-2 bg-rose-500/10 rounded-none border border-rose-500/20 text-xs">
                      <ExclamationTriangleIcon className="w-4 h-4 text-rose-400" />
                      <span className="text-rose-400 font-bold">Duplicate emails — fix before registering</span>
                    </div>
                  )}
                  {checkingDups && (
                    <div className="flex items-center gap-2 px-4 py-2 bg-white/5 rounded-none border border-border text-xs text-muted-foreground">
                      <ArrowPathIcon className="w-3.5 h-3.5 animate-spin" />
                      <span>Checking for existing students…</span>
                    </div>
                  )}
                  {!checkingDups && dbDupNames.size > 0 && (
                    <div className="px-4 py-3 bg-amber-500/10 rounded-none border border-amber-500/30 text-xs space-y-2">
                      <div className="flex items-start gap-2">
                        <ExclamationTriangleIcon className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                        <div className="space-y-1">
                          <p className="text-amber-400 font-bold">{dbDupNames.size} name{dbDupNames.size !== 1 ? 's' : ''} already exist at this school:</p>
                          <p className="text-amber-400/70 font-mono">{[...dbDupNames].map(n => preview.find(s => s.full_name.trim().toLowerCase() === n)?.full_name ?? n).join(', ')}</p>
                          <p className="text-amber-300/60">If these are different students who happen to share a name, tick the box below to register them anyway. If they are the same students, remove those rows first.</p>
                        </div>
                      </div>
                      <label className="flex items-center gap-2 pl-6 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={dupOverride}
                          onChange={(e) => setDupOverride(e.target.checked)}
                          className="accent-amber-500 w-3.5 h-3.5"
                        />
                        <span className="text-amber-400 font-bold">These are different students — register anyway</span>
                      </label>
                    </div>
                  )}
                  {incompleteRows.length > 0 && (
                    <div className="flex items-center gap-2 px-4 py-2 bg-amber-500/10 rounded-none border border-amber-500/20 text-xs">
                      <ExclamationTriangleIcon className="w-4 h-4 text-amber-400" />
                      <span className="text-amber-400">{incompleteRows.length} row{incompleteRows.length !== 1 ? 's' : ''} incomplete (will be skipped)</span>
                    </div>
                  )}
                </div>

                {/* Editable table */}
                <div className="bg-card border border-border rounded-none overflow-hidden">
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
                          <th className="text-left px-2 py-2.5 border-b border-border w-[28%]">Full Name</th>
                          <th className="text-left px-2 py-2.5 border-b border-border w-[12%]">Class</th>
                          <th className="text-left px-2 py-2.5 border-b border-border w-[28%]">Email</th>
                          <th className="text-left px-2 py-2.5 border-b border-border w-[22%]">Temp Password</th>
                          <th className="px-2 py-2.5 border-b border-border w-8" />
                        </tr>
                      </thead>
                      <tbody>
                        {preview.map((s, i) => {
                          const emailDup = dups.has(s.email.toLowerCase());
                          const incomplete = !s.full_name.trim() || !s.email.trim();
                          const dbDup = dbDupNames.has(s.full_name.trim().toLowerCase());
                          return (
                            <tr
                              key={s.id}
                              className={`group border-b border-border transition-colors ${incomplete ? 'bg-amber-500/5' : emailDup ? 'bg-rose-500/5' : dbDup ? 'bg-amber-500/5' : 'hover:bg-white/[0.02]'
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
                                    <span className="shrink-0 px-1.5 py-0.5 bg-amber-500/20 border border-amber-500/40 text-amber-400 text-[9px] font-black uppercase tracking-tight rounded-none" title="Already registered at this school">EXISTS</span>
                                  )}
                                </div>
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
                                <span className="font-mono text-amber-300/80">{s.password}</span>
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
                        const dbDup = dbDupNames.has(s.full_name.trim().toLowerCase());
                        return (
                          <div key={s.id} className={`p-4 space-y-3 ${incomplete ? 'bg-amber-500/5' : emailDup ? 'bg-rose-500/5' : dbDup ? 'bg-amber-500/5' : ''}`}>
                            <div className="flex items-center justify-between">
                              <span className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">Student #{i + 1}</span>
                              <button onClick={() => removeRow(s.id)} className="text-muted-foreground hover:text-rose-400 p-1"><XMarkIcon className="w-4 h-4" /></button>
                            </div>
                            <div className="space-y-2">
                              <input className={inp} value={s.full_name} onChange={(e) => updateField(s.id, 'full_name', e.target.value)} onBlur={(e) => onNameBlur(s.id, e.target.value)} placeholder="Full Name" />
                              <div className="flex gap-2">
                                <input className={`${inp} font-mono w-24`} value={s.class_name ?? ''} onChange={(e) => updateField(s.id, 'class_name', e.target.value)} onBlur={(e) => onClassBlur(s.id, e.target.value)} placeholder="Class" />
                                <div className="relative flex-1">
                                  <input className={`${inp} font-mono pr-6 ${emailDup ? 'border-rose-500/60 bg-rose-500/5 text-rose-300' : 'text-primary'}`} value={s.email} onChange={(e) => updateField(s.id, 'email', e.target.value)} placeholder="Email" />
                                  {emailDup && <ExclamationTriangleIcon className="absolute right-1.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-rose-400" />}
                                </div>
                              </div>
                              <div className="flex items-center justify-between px-3 py-2 bg-card shadow-sm rounded-none border border-border text-[10px]">
                                <span className="text-muted-foreground uppercase font-bold">Password</span>
                                <span className="font-mono text-amber-300/80">{s.password}</span>
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
                <div className="flex gap-3">
                  <button
                    onClick={handleReset}
                    className="flex-1 py-3 bg-card shadow-sm hover:bg-muted text-muted-foreground font-bold rounded-none transition-colors text-sm border border-border"
                  >
                    ← Edit Names
                  </button>
                  <div className="flex-1 flex flex-col gap-2">
                    <button
                      onClick={handleRegister}
                      disabled={registering || dups.size > 0 || (dbDupNames.size > 0 && !dupOverride) || checkingDups || validCount === 0}
                      className="w-full py-3 bg-[#7a0606] hover:bg-[#9a0808] disabled:opacity-50 disabled:cursor-not-allowed text-foreground font-bold rounded-none transition-colors text-sm"
                    >
                      {registering
                        ? `Registering ${registerProgress?.done ?? 0} / ${registerProgress?.total ?? validCount}...`
                        : checkingDups
                          ? 'Checking for duplicates…'
                          : dups.size > 0
                            ? 'Fix duplicate emails first'
                            : dbDupNames.size > 0 && !dupOverride
                              ? `Tick the box above to continue`
                              : `Register ${validCount} Student${validCount !== 1 ? 's' : ''}${selectedProgramId ? ' & Enrol' : ''}`}
                    </button>
                    {registering && registerProgress && (
                      <div className="space-y-1">
                        <div className="w-full h-1.5 bg-card shadow-sm rounded-none overflow-hidden">
                          <div
                            className="h-full bg-[#7a0606] rounded-none transition-all duration-300"
                            style={{ width: `${(registerProgress.done / registerProgress.total) * 100}%` }}
                          />
                        </div>
                        <p className="text-[10px] text-muted-foreground truncate">
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
                  <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-none p-4 flex items-center gap-3 text-emerald-400">
                    <CheckCircleIcon className="w-5 h-5" />
                    <span className="text-sm font-bold tracking-widest uppercase">Registration complete</span>
                  </div>
                )}

                <div className="bg-gradient-to-b from-primary to-primary/10 to-[#0d1526] border border-emerald-500/20 rounded-none p-8 text-center relative overflow-hidden">
                  <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-emerald-500/40 to-transparent" />
                  <div className="relative z-10">
                    <h2 className="text-3xl font-black text-foreground mb-2 uppercase tracking-tighter italic">Process Complete</h2>
                    <div className="flex items-center justify-center gap-4 font-black tracking-widest uppercase text-[10px] flex-wrap">
                      <span className="text-emerald-400/80">Created: {successCount}</span>
                      {skipCount > 0 && (
                        <>
                          <div className="w-1 h-1 bg-white/20 rounded-none" />
                          <span className="text-amber-400/80">Skipped (already exist): {skipCount}</span>
                        </>
                      )}
                      {failCount > 0 && (
                        <>
                          <div className="w-1 h-1 bg-white/20 rounded-none" />
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

                  <button onClick={() => setStep('input')} className="flex items-center gap-2 px-8 py-4 bg-card border border-border text-muted-foreground font-bold text-[10px] uppercase tracking-widest">
                    <PlusIcon className="w-4 h-4" /> New Batch
                  </button>
                </div>


                {/* Results Table */}
                <div className="bg-card border border-border rounded-none overflow-hidden shadow-2xl">
                  <div className="px-6 py-5 border-b border-border bg-white/[0.02] flex items-center justify-between">
                    <div>
                      <h3 className="text-foreground font-black text-lg flex items-center gap-2 uppercase tracking-tighter">
                        <ClipboardDocumentListIcon className="w-5 h-5 text-primary" />
                        Session results
                      </h3>
                      <p className="text-muted-foreground text-[10px] uppercase font-black tracking-widest mt-1">Archive ID: {results[0]?.batch_id?.slice(0, 8) || 'N/A'}</p>
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
                          <tr key={i} className={`group transition-colors ${r.status === 'failed' ? 'bg-rose-500/5' : r.status === 'skipped' ? 'bg-amber-500/5' : 'hover:bg-white/[0.01]'}`}>
                            <td className="px-6 py-4 text-muted-foreground font-mono">{String(i + 1).padStart(2, '0')}</td>
                            <td className="px-4 py-4">
                              <span className="font-mono font-black text-primary text-[10px] tracking-wide">
                                {r.portal_user_id ? `RC-${r.portal_user_id.slice(0, 8).toUpperCase()}` : '—'}
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
                              <span className={`inline-block px-2 py-1 rounded-none text-[9px] font-black uppercase tracking-tighter ${r.status === 'failed' ? 'bg-rose-500/10 text-rose-500 border border-rose-500/20' : r.status === 'skipped' ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20' : 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20'}`}>
                                {r.status}
                              </span>
                              {r.cardId && (
                                <div className={`mt-1 inline-block px-2 py-0.5 rounded-none text-[8px] font-black uppercase tracking-wider border ${r.cardIssued ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30' : 'bg-blue-500/10 text-blue-300 border-blue-500/30'}`}>
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
                  <div className="mt-8 p-4 bg-background border rounded-none text-[10px] text-muted-foreground italic">
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
                    <div className="w-2 h-2 bg-primary rounded-none animate-pulse shadow-[0_0_15px_rgba(234,88,12,0.4)]" />
                    <span className="text-[8px] sm:text-[10px] text-primary font-black uppercase tracking-[0.4em]">Registration Archive</span>
                  </div>
                  <h2 className="text-base sm:text-xl lg:text-2xl font-black text-foreground italic uppercase tracking-tighter leading-none mb-1 sm:mb-2">Registration History</h2>
                  <p className="text-muted-foreground text-[9px] sm:text-[10px] font-medium leading-relaxed uppercase tracking-widest hidden sm:block">A record of all student registration sessions.</p>
                </div>
                <div className="flex items-center gap-6 sm:gap-10 lg:pl-10">
                  <div className="text-right">
                    <p className="text-foreground font-black text-3xl sm:text-5xl leading-none italic">{history.length}</p>
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
                {history.map((batch) => (
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
                          <div className="flex items-center gap-4 sm:gap-6 mt-3 sm:mt-5 bg-card shadow-sm w-fit px-3 py-1.5 sm:px-4 sm:py-2 border border-border">
                            <span className="text-[8px] sm:text-[10px] text-muted-foreground font-black uppercase tracking-[0.2em]">{new Date(batch.created_at).toLocaleDateString()}</span>
                            <div className="w-1 h-1 bg-muted rounded-none" />
                            <span className="text-[8px] sm:text-[10px] text-muted-foreground font-black uppercase tracking-[0.2em] italic">{batch.student_count} Students</span>
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
                                  className="w-4 h-4 bg-transparent border-primary/50 rounded-none text-primary focus:ring-0 focus:ring-offset-0 cursor-pointer"
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
                                      className="w-4 h-4 bg-black/40 border-border rounded-none text-primary focus:ring-0 focus:ring-offset-0 cursor-pointer"
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
                                          className="p-2 sm:p-2.5 bg-muted hover:bg-blue-600/20 text-blue-400 sm:text-blue-400/60 hover:text-blue-400 transition-all border border-border hidden sm:block"
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

        <AddStudentModal
          isOpen={isSingleModalOpen}
          onClose={() => setIsSingleModalOpen(false)}
          onSuccess={() => { setIsSingleModalOpen(false); setActiveTab('vault'); fetchHistory(); toast.success('Student registered successfully.'); }}
        />
      </div>
    </>
  );
}
