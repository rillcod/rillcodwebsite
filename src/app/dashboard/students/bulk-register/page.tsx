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
  const [activeTab, setActiveTab]= useState<'register' | 'vault'>('register');
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

  const handleExportCardsPDF = (resultsToPrint: any[]) => {
    const validResults = resultsToPrint.filter(r => r.status !== 'failed');
    if (validResults.length === 0) {
      toast.error('No valid records found for PDF export.');
      return;
    }

    const doc = new jsPDF() as jsPDFWithPlugin;
    const dateStr = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
    
    let x = 10;
    let y = 10;
    const cardWidth = 90;
    const cardHeight = 60;
    const padding = 10;

    validResults.forEach((r, i) => {
      if (i > 0 && i % 8 === 0) {
        doc.addPage();
        x = 10;
        y = 10;
      } else if (i > 0 && i % 2 === 0) {
        x = 10;
        y += cardHeight + padding;
      } else if (i > 0) {
        x = 10 + cardWidth + padding;
      }

      // Card Border
      doc.setDrawColor(234, 88, 12); // Orange-600
      doc.setLineWidth(0.5);
      doc.rect(x, y, cardWidth, cardHeight);

      // Card Header
      doc.setFontSize(12);
      doc.setTextColor(0);
      doc.setFont('helvetica', 'bold');
      doc.text('RILLCOD', x + 5, y + 10);
      doc.setTextColor(234, 88, 12);
      doc.text('.', x + 23, y + 10);
      
      doc.setFontSize(6);
      doc.setTextColor(150);
      doc.text('STEM EXCELLENCE • OFFICIAL NODE', x + 5, y + 14);

      // Student Name
      doc.setFontSize(10);
      doc.setTextColor(0);
      doc.setFont('helvetica', 'bold');
      doc.text(r.full_name.toUpperCase(), x + 5, y + 25);
      
      doc.setDrawColor(0);
      doc.setLineWidth(0.1);
      doc.line(x + 5, y + 27, x + 85, y + 27);

      if (r.class_name) {
          doc.setFontSize(7);
          doc.setTextColor(234, 88, 12);
          doc.text(r.class_name.toUpperCase(), x + 85, y + 25, { align: 'right' });
      }

      // Credentials
      doc.setFontSize(6);
      doc.setTextColor(100);
      doc.text('SYSTEM IDENTITY (EMAIL)', x + 5, y + 33);
      doc.setFontSize(8);
      doc.setTextColor(0);
      doc.setFont('courier', 'bold');
      doc.text(r.email, x + 5, y + 37);

      doc.setFontSize(6);
      doc.setTextColor(100);
      doc.text('TEMPORARY CIPHER (PASSWORD)', x + 5, y + 43);
      doc.setFontSize(8);
      doc.setTextColor(0);
      doc.setFont('courier', 'bold');
      doc.text(r.password || 'Contact Admin', x + 5, y + 47);

      // Footer
      doc.setFontSize(6);
      doc.setTextColor(150);
      doc.setFont('helvetica', 'normal');
      doc.text('PORTAL: https://rillcod.com/login', x + 5, y + 54);
      doc.text(`STATION: student/login • Issued ${dateStr}`, x + 5, y + 57);
    });

    doc.save(`rillcod_cards_${new Date().getTime()}.pdf`);
    toast.success('Credential Cards PDF generated.');
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

  const handleMassPrint = (resultsToPrint: any[]) => {
    const validResults = resultsToPrint.filter(r => r.status !== 'failed');
    if (validResults.length === 0) {
      toast.error('No valid records found for printing.');
      return;
    }

    const dateStr = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
    
    const html = `
      <html><head><title>Mass Credentials Print - ${dateStr}</title>
      <style>
        @media print { .page-break { page-break-after: always; } .card { break-inside: avoid; } }
        body { font-family: system-ui, -apple-system, sans-serif; background: #fff; margin: 0; padding: 20px; }
        .grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 20px; }
        .card { border: 1.5px solid #ea580c; padding: 20px; position: relative; break-inside: avoid; margin-bottom: 20px; }
        .header { border-bottom: 2px solid #f3f4f6; margin-bottom: 15px; padding-bottom: 8px; display: flex; align-items:flex-end; gap: 10px;}
        .brand { font-weight: 900; font-size: 16px; font-style: italic; color: #000; letter-spacing: -0.02em; }
        .dot { color: #ea580c; font-style: normal; }
        .tagline { font-size: 6px; color: #9ca3af; text-transform: uppercase; letter-spacing: 0.3em; margin-top: 2px; font-weight: 900; }
        .name { font-size: 13px; font-weight: 800; color: #111827; margin-bottom: 12px; text-transform: uppercase; display:flex; justify-content: space-between; align-items:center; border-bottom: 1px solid #111; padding-bottom: 4px; }
        .name span.cls { font-size: 8px; font-style: italic; color: #ea580c; border: 1px solid #ea580c; padding: 2px 4px;}
        .field { margin-bottom: 8px; }
        .label { font-size: 7px; font-weight: 900; color: #6b7280; text-transform: uppercase; margin-bottom: 2px; }
        .value { font-size: 11px; font-weight: 700; color: #111827; background: #f9fafb; border: 1px solid #e5e7eb; padding: 6px; font-family: monospace; word-break: break-all; }
        .footer { margin-top: 15px; border-top: 1px dashed #e5e7eb; padding-top: 8px; font-size: 7px; color: #9ca3af; line-height: 1.4; font-weight: 600; }
        .checksum { position: absolute; bottom: 15px; right: 15px; font-size: 12px; color: #f3f4f6; font-weight: 900; transform: rotate(-45deg); pointer-events: none; }
      </style>
      </head><body>
      <div class="grid">
        ${validResults.map(r => `
          <div class="card">
            <div class="checksum">AUTH:OK</div>
            <div class="header">
                <img src="${window.location.origin}/logo.png" style="height: 24px;"/>
                <div>
                   <div class="brand">RILLCOD<span class="dot">.</span></div>
                   <div class="tagline">STEM Excellence • Official Node</div>
                </div>
            </div>
            <div class="name">
              <span>${r.full_name}</span>
              ${r.class_name ? `<span class="cls">${r.class_name}</span>` : ''}
            </div>
            <div class="field">
                <div class="label">System Identity (Email)</div>
                <div class="value">${r.email}</div>
            </div>
            <div class="field">
                <div class="label">Temporary Cipher (Password)</div>
                <div class="value">${r.password || 'Contact Admin'}</div>
            </div>
            <div class="footer">
                PORTAL: https://rillcod.com/login<br/>
                STATION: student/login • Issued ${dateStr}
            </div>
          </div>
        `).join('')}
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
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="w-10 h-10 border-4 border-orange-500 border-t-transparent rounded-none animate-spin" />
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

  const successCount = results?.filter((r) => r.status !== 'failed').length ?? 0;
  const failCount = results?.filter((r) => r.status === 'failed').length ?? 0;

  const selectedProgLabel = programmes.find((p) => p.id === selectedProgramId)?.name ?? '';

  // Shared input class
  const inp = 'w-full bg-transparent border border-border rounded-none px-2 py-1.5 text-foreground text-xs focus:outline-none focus:border-cyan-500/60 focus:bg-cyan-500/5 transition-colors placeholder-muted-foreground';

  return (
    <>
      <div className="min-h-screen bg-[#070b14] p-4 sm:p-8 md:p-12 font-sans selection:bg-cyan-500/30">
        
        {/* Standalone Tab Switcher */}
        <div className="max-w-7xl mx-auto mb-16">
          <div className="flex flex-wrap bg-[#0d1526] p-1.5 rounded-none border border-border w-fit max-w-full">
            <button 
              onClick={() => setActiveTab('register')}
              className={`flex-1 sm:flex-none px-8 py-3 text-[10px] font-black uppercase tracking-[0.2em] transition-all ${activeTab === 'register' ? 'bg-cyan-600 text-white shadow-lg' : 'text-muted-foreground hover:text-foreground'}`}
            >
              Uplink Station (New)
            </button>
            <button 
              onClick={() => { setActiveTab('vault'); fetchHistory(); }}
              className={`flex-1 sm:flex-none px-8 py-3 text-[10px] font-black uppercase tracking-[0.2em] transition-all ${activeTab === 'vault' ? 'bg-cyan-600 text-white shadow-lg' : 'text-muted-foreground hover:text-foreground'}`}
            >
              Execution Vault (Archive)
            </button>
          </div>
        </div>

        {activeTab === 'register' && (
          <div className="max-w-4xl mx-auto space-y-12">
            {!showHistory && (
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 bg-cyan-600 flex items-center justify-center rotate-3 border border-cyan-400/20 shadow-xl shadow-cyan-600/10 hover:rotate-6 transition-transform">
                    <SparklesIcon className="w-6 h-6 text-white" />
                  </div>
                  <div>
                    <h1 className="text-4xl font-black text-foreground italic tracking-tighter uppercase">Academic Registry</h1>
                    <p className="text-muted-foreground text-[10px] uppercase font-bold tracking-[0.4em] mt-1.5">Official Student Node Distribution</p>
                  </div>
                </div>
              </div>
            )}
            
        {/* Sub-Tabs for Registry Mode */}
        {step !== 'done' && (
          <div className="flex flex-wrap bg-[#0d1526] p-1 border border-border w-fit max-w-full">
            <button 
              onClick={() => { setStep('input'); setIsSingleModalOpen(false); }}
              className={`flex-1 sm:flex-none px-8 py-3 text-[9px] font-black uppercase tracking-widest transition-all ${step !== 'single' ? 'bg-muted text-foreground' : 'text-muted-foreground hover:text-foreground hover:bg-muted'}`}
            >
              Intelligence Import (Bulk)
            </button>
            <button 
              onClick={() => { setStep('single'); setIsSingleModalOpen(false); }}
              className={`flex-1 sm:flex-none px-8 py-3 text-[9px] font-black uppercase tracking-widest transition-all ${step === 'single' ? 'bg-muted text-foreground' : 'text-muted-foreground hover:text-foreground hover:bg-muted'}`}
            >
              Manual Uplink (Single)
            </button>
          </div>
        )}

        {/* ══════════════════ STEP 1 — SINGLE ══════════════════════════ */}
        {step === 'single' && (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
             <AddStudentModal inline isOpen={true} onClose={() => {}} onSuccess={() => { setStep('input'); setActiveTab('vault'); fetchHistory(); toast.success('Identity Created. Check Vault.'); }} classId={selectedRegistryClass || undefined} />
          </div>
        )}

        {/* ══════════════════ STEP 1 — INPUT ══════════════════════════ */}
        {step === 'single' && (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
             <AddStudentModal inline isOpen={true} onClose={() => {}} onSuccess={() => { setStep('input'); setActiveTab('vault'); fetchHistory(); toast.success('Identity Created. Check Vault.'); }} classId={selectedRegistryClass || undefined} />
          </div>
        )}

        {step === 'input' && (
          <div className="space-y-6">

            {/* ── Batch Settings ──────────────────────────────────── */}
            <div className="bg-[#0d1526] border border-border rounded-none overflow-hidden">
              <button
                onClick={() => setSettingsOpen((o) => !o)}
                className="w-full flex items-center justify-between px-6 py-4 text-left hover:bg-white/[0.02] transition-colors"
              >
                <div className="flex items-center gap-2 text-muted-foreground font-bold text-sm">
                  <BuildingOffice2Icon className="w-4 h-4 text-orange-400" />
                  Batch Settings
                  <span className="text-muted-foreground font-normal text-xs ml-1">— school, programme &amp; default class</span>
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
                          {!isAdmin && <span className="text-orange-400/60 normal-case font-normal text-[10px] ml-1">(your allocated schools)</span>}
                        </label>
                        <select
                          value={selectedSchoolId}
                          onChange={(e) => {
                            const opt = e.target.options[e.target.selectedIndex];
                            setSelectedSchoolId(e.target.value);
                            setSelectedSchoolName(e.target.value ? opt.text : '');
                          }}
                          className="w-full px-3 py-2.5 bg-card shadow-sm border border-border rounded-none text-sm text-foreground focus:outline-none focus:border-orange-500/50 transition-colors"
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
                        className="w-full px-3 py-2.5 bg-card shadow-sm border border-border rounded-none text-sm text-foreground focus:outline-none focus:border-orange-500/50 transition-colors"
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
                          My Class <span className="text-cyan-400/70 ml-1 normal-case font-normal">(from class registry)</span>
                        </label>
                        <Link
                          href="/dashboard/classes/add"
                          className="flex items-center gap-1 px-2 py-0.5 bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-500/20 rounded-none text-cyan-400 text-[10px] font-bold transition-colors"
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
                          className="w-full px-3 py-2.5 bg-cyan-500/5 border border-cyan-500/20 rounded-none text-sm text-foreground focus:outline-none focus:border-cyan-500/50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
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
                          <p className="text-cyan-400/70 text-[11px] mt-1.5">
                            Students will be tagged as <span className="font-mono font-bold">{rc.section_class ?? rc.name}</span>
                          </p>
                        ) : null;
                      })()}
                    </div>

                    {/* Fallback standard class code */}
                    <div>
                      <label className="block text-muted-foreground text-xs font-bold uppercase tracking-widest mb-1 flex items-center gap-1.5">
                        <AcademicCapIcon className="w-3.5 h-3.5" />
                        Default Class / Arm <span className="text-muted-foreground normal-case font-normal ml-1">(optional)</span>
                      </label>
                      <p className="text-white/25 text-[11px] mb-2">
                        Select a class or arm — students without an inline class will be placed here (e.g. JSS2A, SS1B).
                      </p>
                      <select
                        value={defaultClass}
                        onChange={(e) => setDefaultClass(e.target.value)}
                        className="w-full px-3 py-2.5 bg-card shadow-sm border border-border rounded-none text-sm text-foreground focus:outline-none focus:border-orange-500/50 transition-colors"
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
                      <span className="px-2 py-0.5 bg-cyan-500/15 text-cyan-300 font-mono font-bold rounded-none border border-cyan-500/20">
                        {effectiveClassCode}
                      </span>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* ── Names textarea ──────────────────────────────────── */}
            <div className="bg-[#0d1526] border border-border rounded-none p-6">
              <label className="block text-muted-foreground text-xs font-bold uppercase tracking-widest mb-3">
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
                className="w-full px-4 py-3 bg-card shadow-sm border border-border rounded-none text-sm text-foreground placeholder-muted-foreground resize-none focus:outline-none focus:border-orange-500/50 transition-colors font-mono leading-relaxed"
              />
              <p className="text-muted-foreground text-xs mt-2">
                You can correct any mistakes in the next step — every field is editable before you register.
              </p>
            </div>

            <div className="grid md:grid-cols-2 gap-4">
              <div className="bg-orange-500/10 border border-orange-500/20 rounded-none p-5">
                <h3 className="text-orange-500 font-bold text-sm mb-3 flex items-center gap-2">
                  <ClipboardDocumentListIcon className="w-4 h-4" /> How names work
                </h3>
                <ul className="space-y-1.5 text-orange-500/70 text-xs list-disc list-inside">
                  <li>With space: <span className="font-mono bg-orange-500/20 px-1 rounded">John Doe</span></li>
                  <li>Joined: <span className="font-mono bg-orange-500/20 px-1 rounded">JohnDoe</span></li>
                  <li>CamelCase: <span className="font-mono bg-orange-500/20 px-1 rounded">ChukwuemekaOkonkwo</span></li>
                  <li>First name → <span className="font-mono bg-orange-500/20 px-1 rounded">firstname@rillcod.com</span></li>
                  <li>Edit anything in the next step before registering</li>
                </ul>
              </div>
              <div className="bg-cyan-500/10 border border-cyan-500/20 rounded-none p-5">
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
              className="w-full py-3.5 bg-orange-600 hover:bg-orange-500 disabled:opacity-40 disabled:cursor-not-allowed text-foreground font-bold rounded-none transition-colors text-sm"
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
                  <span className="flex items-center gap-1.5 px-3 py-1.5 bg-orange-500/10 border border-orange-500/20 rounded-none text-orange-500">
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
                  <span className="flex items-center gap-1.5 px-3 py-1.5 bg-cyan-500/10 border border-cyan-500/20 rounded-none text-cyan-300 font-mono">
                    <AcademicCapIcon className="w-3.5 h-3.5" />
                    Class: {effectiveClassCode}
                  </span>
                )}
              </div>
            )}

            {/* Stats bar */}
            <div className="flex flex-wrap gap-3">
              <div className="flex items-center gap-2 px-4 py-2 bg-card shadow-sm rounded-none border border-border text-sm">
                <UserGroupIcon className="w-4 h-4 text-orange-400" />
                <span className="text-foreground font-bold">{preview.length}</span>
                <span className="text-muted-foreground">students</span>
              </div>
              {previewClasses.length > 0 && (
                <div className="flex items-center gap-2 px-4 py-2 bg-cyan-500/10 rounded-none border border-cyan-500/20 text-sm">
                  <AcademicCapIcon className="w-4 h-4 text-cyan-400" />
                  <span className="text-cyan-300 font-bold">{previewClasses.length}</span>
                  <span className="text-cyan-300/60 text-xs">class{previewClasses.length !== 1 ? 'es' : ''}:</span>
                  <span className="text-cyan-300 font-mono text-xs">{previewClasses.join(' · ')}</span>
                </div>
              )}
              {dups.size > 0 && (
                <div className="flex items-center gap-2 px-4 py-2 bg-rose-500/10 rounded-none border border-rose-500/20 text-xs">
                  <ExclamationTriangleIcon className="w-4 h-4 text-rose-400" />
                  <span className="text-rose-400 font-bold">Duplicate emails — fix before registering</span>
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
            <div className="bg-[#0d1526] border border-border rounded-none overflow-hidden">
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
                  <thead className="sticky top-0 bg-[#0b1020] z-10">
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
                      return (
                        <tr
                          key={s.id}
                          className={`group border-b border-border transition-colors ${incomplete ? 'bg-amber-500/5' : emailDup ? 'bg-rose-500/5' : 'hover:bg-white/[0.02]'
                            }`}
                        >
                          {/* # */}
                          <td className="px-3 py-2 text-muted-foreground align-middle">{i + 1}</td>

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
                                className={`${inp} font-mono pr-6 ${emailDup ? 'border-rose-500/60 bg-rose-500/5 text-rose-300' : 'text-orange-500'}`}
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
                    return (
                      <div key={s.id} className={`p-4 space-y-3 ${incomplete ? 'bg-amber-500/5' : emailDup ? 'bg-rose-500/5' : ''}`}>
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">Student #{i + 1}</span>
                          <button onClick={() => removeRow(s.id)} className="text-muted-foreground hover:text-rose-400 p-1"><XMarkIcon className="w-4 h-4" /></button>
                        </div>
                        <div className="space-y-2">
                          <input className={inp} value={s.full_name} onChange={(e) => updateField(s.id, 'full_name', e.target.value)} onBlur={(e) => onNameBlur(s.id, e.target.value)} placeholder="Full Name" />
                          <div className="flex gap-2">
                            <input className={`${inp} font-mono w-24`} value={s.class_name ?? ''} onChange={(e) => updateField(s.id, 'class_name', e.target.value)} onBlur={(e) => onClassBlur(s.id, e.target.value)} placeholder="Class" />
                            <div className="relative flex-1">
                              <input className={`${inp} font-mono pr-6 ${emailDup ? 'border-rose-500/60 bg-rose-500/5 text-rose-300' : 'text-orange-500'}`} value={s.email} onChange={(e) => updateField(s.id, 'email', e.target.value)} placeholder="Email" />
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
                  className="flex items-center gap-1.5 text-xs text-orange-400 hover:text-orange-500 font-bold transition-colors"
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
                  disabled={registering || dups.size > 0 || validCount === 0}
                  className="w-full py-3 bg-[#7a0606] hover:bg-[#9a0808] disabled:opacity-50 disabled:cursor-not-allowed text-foreground font-bold rounded-none transition-colors text-sm"
                >
                  {registering
                    ? `Registering ${registerProgress?.done ?? 0} / ${registerProgress?.total ?? validCount}...`
                    : dups.size > 0
                      ? 'Fix duplicate emails first'
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
                 <span className="text-sm font-bold tracking-widest uppercase">Registry Nodes Synchronized</span>
               </div>
            )}
            
            <div className="bg-gradient-to-b from-orange-600 to-orange-400/10 to-[#0d1526] border border-emerald-500/20 rounded-none p-8 text-center relative overflow-hidden">
              <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-emerald-500/40 to-transparent" />
              <div className="relative z-10">
                <h2 className="text-3xl font-black text-foreground mb-2 uppercase tracking-tighter italic">Process Complete</h2>
                <div className="flex items-center justify-center gap-4 text-emerald-400/80 font-black tracking-widest uppercase text-[10px]">
                   <span>Success: {results.filter(r => r.status !== 'failed').length}</span>
                   <div className="w-1 h-1 bg-white/20 rounded-none" />
                   <span>Identity Archive Validated</span>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap gap-4 justify-center">
              {/* Card Export Group */}
              <div className="flex bg-[#0d1526] border border-border p-1">
                <button onClick={() => handleExportCardsPDF(results)} className="flex items-center gap-2 px-6 py-4 bg-orange-600 hover:bg-orange-500 text-foreground font-black text-[10px] uppercase tracking-widest transition-all">
                  <DocumentArrowDownIcon className="w-4 h-4" /> Cards PDF
                </button>
                <button onClick={() => handleMassPrint(results)} className="flex items-center gap-2 px-6 py-4 bg-card hover:bg-muted text-foreground font-black text-[10px] uppercase tracking-widest transition-all border-l border-border">
                  <PrinterIcon className="w-4 h-4" /> Print
                </button>
              </div>

              {/* Roster Export Group */}
              <div className="flex bg-[#0d1526] border border-border p-1">
                <button onClick={() => handleExportRosterPDF(results)} className="flex items-center gap-2 px-6 py-4 bg-orange-600 hover:bg-orange-500 text-foreground font-black text-[10px] uppercase tracking-widest transition-all">
                  <DocumentArrowDownIcon className="w-4 h-4" /> Roster PDF
                </button>
                <button onClick={() => handleMassPrintReport(results)} className="flex items-center gap-2 px-6 py-4 bg-card hover:bg-muted text-foreground font-black text-[10px] uppercase tracking-widest transition-all border-l border-border">
                  <PrinterIcon className="w-4 h-4" /> Print
                </button>
              </div>

              {/* Utility Group */}
              <button onClick={downloadCSV} className="flex items-center gap-2 px-8 py-4 bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-400 font-bold border border-cyan-500/20 text-[10px] uppercase tracking-widest">
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
            <div className="bg-[#0d1526] border border-border rounded-none overflow-hidden shadow-2xl">
              <div className="px-6 py-5 border-b border-border bg-white/[0.02] flex items-center justify-between">
                <div>
                  <h3 className="text-foreground font-black text-lg flex items-center gap-2 uppercase tracking-tighter">
                    <ClipboardDocumentListIcon className="w-5 h-5 text-orange-400" />
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
                      <th className="text-left px-4 py-4">Full Name</th>
                      <th className="text-left px-4 py-4">Class</th>
                      <th className="text-left px-4 py-4">Email / Login</th>
                      <th className="text-right px-6 py-4">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {results.map((r, i) => (
                      <tr key={i} className={`group transition-colors ${r.status === 'failed' ? 'bg-rose-500/5' : 'hover:bg-white/[0.01]'}`}>
                        <td className="px-6 py-4 text-muted-foreground font-mono">{String(i + 1).padStart(2, '0')}</td>
                        <td className="px-4 py-4">
                          <input className="bg-transparent border-none text-foreground font-bold w-full focus:ring-1 focus:ring-orange-500 rounded p-1" value={r.full_name} onChange={(e) => {
                            const newResults = [...results]; newResults[i].full_name = e.target.value; setResults(newResults);
                          }} />
                        </td>
                        <td className="px-4 py-4">
                          <input className="bg-transparent border-none text-cyan-400 text-[10px] font-black uppercase tracking-tighter w-full focus:ring-1 focus:ring-cyan-500 rounded p-1" value={r.class_name || ''} onChange={(e) => {
                            const newResults = [...results]; newResults[i].class_name = e.target.value; setResults(newResults);
                          }} />
                        </td>
                        <td className="px-4 py-4 font-mono text-muted-foreground">{r.email}</td>
                        <td className="px-6 py-4 text-right transform group-hover:scale-105 transition-transform">
                          <span className={`px-2 py-1 rounded-none text-[9px] font-black uppercase tracking-tighter ${r.status === 'failed' ? 'bg-rose-500/10 text-rose-500 border border-rose-500/20' : 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20'}`}>
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
               <h2 className="text-2xl font-black uppercase tracking-tighter mb-2">RILLCOD TECHNOLOGIES // STUDENT CREDENTIALS</h2>
               <div className="flex gap-4 text-sm font-bold text-slate-500 mb-6 pb-4 border-b">
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
                        <td className="p-2 border font-mono">{i+1}</td>
                        <td className="p-2 border font-bold uppercase">{r.full_name}</td>
                        <td className="p-2 border text-slate-500">{r.class_name || effectiveClassCode}</td>
                        <td className="p-2 border font-mono">{r.email}</td>
                        <td className="p-2 border font-mono font-bold">{r.password}</td>
                      </tr>
                    ))}
                  </tbody>
               </table>
               <div className="mt-8 p-4 bg-slate-50 border rounded-none text-[10px] text-slate-500 italic">
                 Instructions: 1. Login at academy.rillcod.com 2. Use credentials above 3. Change password immediately.
               </div>
            </div>
          </div>
        )}
        </div>
        )}

        {/* ══════════════════ VAULT TAB ═══════════════════════════════ */}
        {activeTab === 'vault' && (
          <div className="max-w-6xl mx-auto space-y-16 animate-in fade-in slide-in-from-bottom-8 duration-1000">
            {/* Vault Header (Refined) */}
            <div className="bg-cyan-600/5 border border-cyan-500/20 p-16 relative overflow-hidden shadow-2xl">
               <div className="absolute top-0 right-0 w-full h-[1px] bg-gradient-to-r from-transparent via-cyan-500/50 to-transparent" />
               <div className="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-12">
                  <div className="max-w-xl">
                     <div className="flex items-center gap-3 mb-4">
                        <div className="w-3 h-3 bg-cyan-500 rounded-none animate-pulse shadow-[0_0_15px_rgba(6,182,212,0.8)]" />
                        <span className="text-[12px] text-cyan-400 font-black uppercase tracking-[0.4em]">Official Execution Safe</span>
                     </div>
                     <h2 className="text-7xl font-black text-foreground italic uppercase tracking-tighter leading-none mb-6">Execution Vault</h2>
                     <p className="text-muted-foreground text-[13px] font-medium leading-relaxed uppercase tracking-widest">A secure, encrypted repository containing every student deployment session recorded on this station.</p>
                  </div>
                  <div className="flex items-center gap-10 lg:border-l lg:border-border lg:pl-10">
                     <div className="text-right">
                        <p className="text-foreground font-black text-6xl leading-none italic">{history.length}</p>
                        <p className="text-[10px] text-muted-foreground font-black uppercase tracking-[0.3em] mt-3">Active Archives</p>
                     </div>
                     <button 
                       onClick={fetchHistory}
                       disabled={loadingHistory}
                       className="w-24 h-24 bg-cyan-600/10 border border-cyan-500/20 flex items-center justify-center hover:bg-cyan-600/20 transition-all group active:scale-95 shadow-xl shadow-cyan-600/10"
                     >
                       <ArrowPathIcon className={`w-12 h-12 text-cyan-500 ${loadingHistory ? 'animate-spin' : 'group-hover:rotate-180 transition-transform duration-700'}`} />
                     </button>
                  </div>
               </div>
            </div>

            {loadingHistory && history.length === 0 ? (
               <div className="h-[400px] flex flex-col items-center justify-center gap-8 bg-[#0d1526]/40 border border-border italic text-muted-foreground uppercase tracking-[0.5em] animate-pulse">Syncing Vault Nodes...</div>
            ) : history.length === 0 ? (
               <div className="h-[400px] flex flex-col items-center justify-center gap-8 bg-white/[0.02] border border-border border-dashed italic text-muted-foreground uppercase tracking-[0.5em]">Vault Is Vacuum / Empty</div>
            ) : (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
                  {history.map((batch) => (
                    <div key={batch.id} className="group bg-[#0d1526] border border-border p-12 transition-all hover:bg-[#0d1526]/80 hover:border-cyan-500/50 hover:shadow-latest relative overflow-hidden">
                       <div className="absolute top-0 right-0 w-32 h-32 bg-cyan-500/5 rotate-45 translate-x-16 -translate-y-16 pointer-events-none" />
                       
                       <div className="relative z-10">
                          <div className="flex items-start justify-between mb-10">
                             <div className="flex-1 min-w-0">
                                {editingBatchId === batch.id ? (
                                   <input 
                                     autoFocus
                                     className="bg-black/60 border border-cyan-500/50 px-6 py-4 text-foreground font-black text-3xl w-full italic outline-none focus:ring-1 focus:ring-cyan-500/30 transition-all"
                                     defaultValue={batch.class_name || 'Protocol General'}
                                     onBlur={async (e) => {
                                       await fetch('/api/students/bulk-register', {
                                         method: 'PATCH',
                                         headers: {'Content-Type': 'application/json'},
                                         body: JSON.stringify({ type: 'batch', data: { id: batch.id, class_name: e.target.value } })
                                       });
                                       setEditingBatchId(null);
                                       fetchHistory();
                                       toast.success('Batch renamed successfully.');
                                     }}
                                   />
                                ) : (
                                   <h3 className="text-4xl font-black text-foreground truncate uppercase tracking-tighter italic group-hover:text-cyan-400 cursor-pointer transition-colors"
                                       onDoubleClick={() => setEditingBatchId(batch.id)}>
                                     {batch.class_name || 'Protocol General'}
                                   </h3>
                                )}
                                <div className="flex items-center gap-6 mt-5 bg-card shadow-sm w-fit px-4 py-2 border border-border">
                                   <span className="text-[10px] text-muted-foreground font-black uppercase tracking-[0.2em]">{new Date(batch.created_at).toLocaleDateString()}</span>
                                   <div className="w-1.5 h-1.5 bg-muted rounded-none" />
                                   <span className="text-[10px] text-cyan-500/70 font-black uppercase tracking-[0.2em] italic">{batch.student_count} Identities Distributed</span>
                                </div>
                             </div>
                             {['admin', 'teacher'].includes(profile?.role || '') && (
                               <button onClick={() => handleDeleteBatch(batch.id)} className="p-5 bg-card shadow-sm hover:bg-rose-600/20 text-muted-foreground hover:text-rose-500 transition-all border border-border ml-4">
                                 <TrashIcon className="w-6 h-6" />
                               </button>
                             )}
                          </div>
                          
                          <div className="flex items-center gap-4">
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
                               className={`flex-1 py-6 text-[11px] font-black uppercase tracking-[0.4em] transition-all border ${
                                 selectedBatchId === batch.id ? 'bg-cyan-600 text-foreground border-cyan-400 shadow-xl shadow-cyan-600/30' : 'bg-card shadow-sm text-muted-foreground hover:bg-muted hover:text-foreground border-border'
                               }`}
                             >
                               {selectedBatchId === batch.id ? 'Close Archive' : 'Open Ledger'}
                             </button>
                             <button 
                               onClick={async () => {
                                 setLoadingHistory(true);
                                 const { data } = await supabase.from('registration_results').select('*').eq('batch_id', batch.id);
                                 if (data) handleMassPrintReport(data);
                                 setLoadingHistory(false);
                               }}
                               className="px-6 py-4 bg-orange-900/40 hover:bg-orange-800 text-foreground border border-orange-500/30 transition-all active:scale-95"
                               title="Print Roster List"
                             >
                               <PrinterIcon className="w-5 h-5" />
                             </button>
                             <button 
                               onClick={async () => {
                                 setLoadingHistory(true);
                                 const { data } = await supabase.from('registration_results').select('*').eq('batch_id', batch.id);
                                 if (data) handleExportRosterPDF(data);
                                 setLoadingHistory(false);
                               }}
                               className="px-6 py-4 bg-orange-600 hover:bg-orange-500 text-foreground shadow-xl shadow-orange-600/30 active:scale-95 transition-all group"
                               title="Export Roster PDF"
                             >
                               <DocumentArrowDownIcon className="w-5 h-5 group-hover:scale-110 transition-transform" />
                             </button>
                             <button 
                               onClick={async () => {
                                 setLoadingHistory(true);
                                 const { data } = await supabase.from('registration_results').select('*').eq('batch_id', batch.id);
                                 if (data) handleMassPrint(data);
                                 setLoadingHistory(false);
                               }}
                               className="px-6 py-4 bg-[#7a0606] hover:bg-[#9a0808] text-foreground transition-all active:scale-95"
                               title="Print Student Cards"
                             >
                               <RectangleGroupIcon className="w-5 h-5" />
                             </button>
                             <button 
                               onClick={async () => {
                                 setLoadingHistory(true);
                                 const { data } = await supabase.from('registration_results').select('*').eq('batch_id', batch.id);
                                 if (data) handleExportCardsPDF(data);
                                 setLoadingHistory(false);
                               }}
                               className="px-6 py-4 bg-orange-600 hover:bg-orange-500 text-foreground shadow-xl shadow-orange-600/30 active:scale-95 transition-all group"
                               title="Export Cards PDF"
                             >
                               <PrinterIcon className="w-5 h-5 group-hover:scale-110 transition-transform" />
                             </button>
                          </div>

                           {selectedBatchId === batch.id && (
                              <div className="mt-12 pt-12 border-t border-border space-y-4 animate-in fade-in slide-in-from-top-6 duration-700">
                                  <div className="flex items-center justify-between mb-6 px-4">
                                     <div className="flex items-center gap-6">
                                        <p className="text-[11px] text-muted-foreground font-black uppercase tracking-[0.4em] italic">Station Member Ledger</p>
                                        <div className="flex items-center gap-2 bg-black/40 px-3 py-1.5 border border-border">
                                           <input 
                                             type="checkbox"
                                             className="w-4 h-4 bg-transparent border-cyan-500/50 rounded-none text-cyan-600 focus:ring-0 focus:ring-offset-0 cursor-pointer"
                                             checked={batchResults.length > 0 && selectedResultIds.length === batchResults.length}
                                             onChange={(e) => {
                                               if (e.target.checked) setSelectedResultIds(batchResults.map(r => r.id));
                                               else setSelectedResultIds([]);
                                             }}
                                           />
                                           <span className="text-[9px] text-cyan-500/50 font-black uppercase tracking-widest">Select All</span>
                                        </div>
                                     </div>
                                     <div className="flex items-center gap-3">
                                        {selectedResultIds.length > 0 && (
                                           <div className="flex bg-[#0d1526] border border-cyan-500/30 p-1 animate-in fade-in zoom-in-95 duration-200">
                                              <button 
                                                onClick={() => handleExportCardsPDF(batchResults.filter(r => selectedResultIds.includes(r.id)))}
                                                className="px-3 py-1.5 bg-cyan-600/10 hover:bg-cyan-600/20 text-cyan-400 text-[9px] font-black uppercase tracking-widest transition-all"
                                              >
                                                 Export ({selectedResultIds.length})
                                              </button>
                                              <button 
                                                onClick={() => handleMassPrint(batchResults.filter(r => selectedResultIds.includes(r.id)))}
                                                className="px-3 py-1.5 bg-card hover:bg-muted text-foreground text-[9px] font-black uppercase tracking-widest transition-all border-l border-cyan-500/30"
                                              >
                                                 Print
                                              </button>
                                              {['admin', 'teacher'].includes(profile?.role || '') && (
                                                <button 
                                                  onClick={handleBulkDelete}
                                                  className="px-3 py-1.5 bg-[#7a0606] hover:bg-[#9a0808] text-white text-[9px] font-black uppercase tracking-widest transition-all border-l border-cyan-500/30"
                                                >
                                                   Bulk Purge
                                                </button>
                                              )}
                                           </div>
                                        )}
                                        <p className="text-[9px] text-cyan-400/50 font-black tracking-[0.3em] uppercase">Sector: Distribution</p>
                                     </div>
                                  </div>
                                  <div className="max-h-[500px] overflow-y-auto custom-scrollbar space-y-3 pr-4">
                                     {batchResults.map((r, ri) => (
                                       <div key={r.id} className={`flex items-center justify-between p-6 transition-all group/it border ${selectedResultIds.includes(r.id) ? 'bg-cyan-500/5 border-cyan-500/30' : 'bg-white/[0.02] border-border hover:border-cyan-500/40 hover:bg-white/[0.04]'}`}>
                                         <div className="flex items-center gap-6 overflow-hidden">
                                           <div className="flex items-center gap-4 shrink-0">
                                             <input
                                               type="checkbox"
                                               className="w-5 h-5 bg-black/40 border-border rounded-none text-cyan-600 focus:ring-0 focus:ring-offset-0 cursor-pointer"
                                               checked={selectedResultIds.includes(r.id)}
                                               onChange={(e) => {
                                                 if (e.target.checked) setSelectedResultIds(prev => [...prev, r.id]);
                                                 else setSelectedResultIds(prev => prev.filter(id => id !== r.id));
                                               }}
                                             />
                                             <div className="w-12 h-12 bg-black/40 flex items-center justify-center text-[11px] font-black italic text-cyan-500/30 border border-border group-hover/it:text-cyan-400 group-hover/it:border-cyan-500/40 transition-all">
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
                                                   className="bg-black/80 border border-cyan-500/50 px-4 py-2 text-white font-black text-xs min-w-[150px] outline-none"
                                                 />
                                                 <input
                                                   id={`edit-class-${r.id}`}
                                                   defaultValue={r.class_name || ''}
                                                   className="bg-black/80 border border-cyan-500/50 px-4 py-2 text-cyan-400 font-black text-[10px] uppercase tracking-widest min-w-[80px] outline-none"
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
                                                   className="bg-cyan-600 hover:bg-cyan-500 text-white px-4 flex items-center justify-center transition-all"
                                                 >
                                                   <CheckCircleIcon className="w-4 h-4" />
                                                 </button>
                                               </div>
                                             ) : (
                                               <div onDoubleClick={() => setEditingResultId(r.id)} className="cursor-pointer">
                                                 <p className="text-[14px] font-black text-foreground italic truncate uppercase tracking-tight group-hover/it:text-cyan-400 transition-colors">{r.full_name}</p>
                                                 <p className="text-[10px] text-muted-foreground font-mono tracking-tighter truncate mt-1">{r.email}</p>
                                               </div>
                                             )}
                                           </div>
                                         </div>
                                          <div className="flex items-center gap-4 shrink-0">
                                            {editingResultId !== r.id && (
                                              <>
                                                <span className="text-[9px] font-black text-cyan-400/80 bg-cyan-400/10 px-3 py-1.5 border border-cyan-400/20 uppercase tracking-widest hidden sm:block italic">
                                                  {r.class_name || '...'}
                                                </span>
                                                <div className="flex opacity-0 group-hover/it:opacity-100 transition-opacity gap-1">
                                                  <button onClick={() => setEditingResultId(r.id)} className="p-2 text-muted-foreground hover:text-cyan-400 transition-colors">
                                                    <PencilIcon className="w-4 h-4" />
                                                  </button>
                                                  {['admin', 'teacher'].includes(profile?.role || '') && (
                                                    <button
                                                      onClick={async () => {
                                                        if (!confirm('Purge this record from the vault?')) return;
                                                        await fetch(`/api/students/bulk-register?resultId=${r.id}`, { method: 'DELETE' });
                                                        setBatchResults(prev => prev.filter(x => x.id !== r.id));
                                                        fetchHistory();
                                                        toast.success('Record purged successfully.');
                                                      }}
                                                      className="p-2 text-muted-foreground hover:text-rose-500 transition-colors"
                                                    >
                                                      <TrashIcon className="w-4 h-4" />
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
          onSuccess={() => { setIsSingleModalOpen(false); setActiveTab('vault'); fetchHistory(); toast.success('Uplink confirmed. Check Execution Vault.'); }}
        />
      </div>
    </>
  );
}
