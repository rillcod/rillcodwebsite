'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { externalQrPrintUrl, HD_QR_DISPLAY_PX, HD_QR_PRINT_LARGE_PX, HD_QR_PRINT_PX } from '@/lib/qr/hd-qr';
import { downloadQrCard } from '@/lib/qr-card';
import { useAuth } from '@/contexts/auth-context';
import { useRouter } from 'next/navigation';
import { ClassPathwayPicker } from '@/components/classes/ClassPathwayPicker';
import { motion, AnimatePresence } from 'framer-motion';
import { HdQrCode } from '@/components/qr/HdQrCode';
import { brandContact } from '@/config/brand';
import { enrollmentTypeLabel } from '@/lib/registration/enrollment-types';
import { formatAcademicSession, liveAcademicSession } from '@/lib/reports/academic-period';
import {
  ClipboardDocumentCheckIcon, PlusIcon, XMarkIcon, CheckCircleIcon,
  ArrowDownTrayIcon, CalendarIcon, TrashIcon, UserGroupIcon,
  ExclamationTriangleIcon, ChevronDownIcon, ChevronUpIcon,
  ArrowPathIcon, PrinterIcon, DocumentTextIcon,
  EyeIcon, PencilSquareIcon, GlobeAltIcon, LockClosedIcon,
  ArrowTopRightOnSquareIcon, LinkIcon, QrCodeIcon, TableCellsIcon,
  DocumentDuplicateIcon,
} from '@/lib/icons';
import MobilePageHero from '@/components/mobile/MobilePageHero';
import { MOBILE_PAGE_BOTTOM, MOBILE_TOUCH_BTN } from '@/components/mobile/mobile-styles';

// ── Types ────────────────────────────────────────────────────────────────────

interface ConsentForm {
  id: string;
  title: string;
  body: string;
  form_type: string;
  is_public: boolean;
  due_date: string | null;
  created_at: string;
  has_signed: boolean;
  consent_responses: { count: number }[];
  form_leads?: { count: number }[];
  enrollment_type: string;
  academic_offering_id: string | null;
  pending_review_count?: number;
  schools?: { name: string } | null;
}

interface Signatory {
  id: string;
  signed_at: string;
  response_data: Record<string, unknown> | null;
  portal_users: { full_name: string | null; email: string | null; phone: string | null } | null;
}

interface FormLead {
  id: string;
  submitted_at: string;
  email: string | null;
  child_current_school: string | null;
  response_data: Record<string, unknown>;
  schools: { name: string } | null;
  status: 'new' | 'contacted' | 'enrolled' | 'lost';
  match_status: 'unreviewed' | 'pending_review' | 'approved' | 'rejected' | 'new_prospect' | null;
  match_confidence: 'high' | 'medium' | 'low' | null;
  match_notes: string | null;
  match_candidate: { id: string; full_name: string; section_class: string | null; email: string } | null;
  matched_student_id: string | null;
  matched_parent_id: string | null;
  contact_id: string | null;
  prospect_id: string | null;
}

interface RegistrationData {
  child_name: string;
  child_age: string;
  child_class: string;
  program_category: 'young_innovators' | 'teen_developers' | '';
  parent_name: string;
  parent_whatsapp: string;
  parent_email: string;
  consent_acknowledged: boolean;
}

// ── Templates ────────────────────────────────────────────────────────────────

const LIVE_SESSION_LABEL = formatAcademicSession(liveAcademicSession());

const TEMPLATES = [
  {
    id: 'registration',
    form_type: 'registration' as const,
    label: 'Student Registration & Consent',
    icon: '📋',
    title: 'Student Registration & Consent',
    body: `I, _________________ (parent/guardian name), give permission for my child to participate in the Rillcod Technologies coding program for the ${LIVE_SESSION_LABEL} academic session. I understand that my child will be learning computer programming in a supervised environment. I acknowledge that the program fee of ₦30,000 ought to be paid before the mid-term break.`,
  },
  {
    id: 'assessment',
    form_type: 'assessment' as const,
    label: 'Child Assessment & Follow-up',
    icon: '🔍',
    title: 'Child Assessment & Follow-up — Rillcod Technologies',
    body: `We'd love to learn more about your child so we can provide the perfect coding experience at Rillcod Technologies for the ${LIVE_SESSION_LABEL} academic session.\n\nPlease complete this assessment form and our team will be in touch within 24 hours to discuss the best programme fit for your child.\n\nFor enquiries: ${brandContact.email} | ${brandContact.phone}`,
  },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function relativeDate(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const days = Math.floor(diff / 86400000);
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function dueBadge(due: string | null) {
  if (!due) return null;
  const d = new Date(due);
  const daysLeft = Math.ceil((d.getTime() - Date.now()) / 86400000);
  if (daysLeft < 0) return { label: 'Overdue', cls: 'bg-rose-500/15 text-rose-600 dark:text-rose-400 border-rose-500/20' };
  if (daysLeft === 0) return { label: 'Due today', cls: 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/20' };
  if (daysLeft <= 3) return { label: `${daysLeft}d left`, cls: 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/20' };
  return { label: `Due ${d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`, cls: 'bg-muted text-muted-foreground border-border/40' };
}

function esc(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function printForm(form: ConsentForm, appBase: string) {
  const win = window.open('', '_blank', 'width=820,height=1000');
  if (!win) return;
  const isAssessment = form.form_type === 'assessment';
  const dueLabel = form.due_date
    ? new Date(form.due_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
    : '';

  const sharedCss = `
  @page { margin: 14mm 18mm; size: A4 portrait; }
  * { box-sizing: border-box; }
  body { font-family: Arial, Helvetica, sans-serif; font-size: 11pt; color: #000; margin: 0; padding: 20px; }
  table { border-collapse: collapse; }
  .hdr-table { width: 100%; margin-bottom: 4px; }
  .logo-box { height: 46px; width: auto; vertical-align: middle; }
  .school { font-size: 20pt; font-weight: 900; letter-spacing: -0.5px; vertical-align: middle; padding-left: 12px; }
  .tagline { font-size: 7.5pt; color: #555; padding-left: 12px; padding-top: 2px; }
  .form-title { text-align: center; font-size: 10.5pt; font-weight: 900; letter-spacing: 2.5px;
                text-transform: uppercase; border-top: 2.5px solid #000; border-bottom: 2.5px solid #000;
                padding: 7px 0; margin: 10px 0 14px; }
  .section { background: #000; color: #fff; font-weight: 900; padding: 5px 10px; font-size: 9pt;
             letter-spacing: 1px; text-transform: uppercase; margin: 14px 0 10px; }
  .field-label { font-size: 9.5pt; display: block; margin-bottom: 4px; }
  .line { border: none; border-bottom: 1px solid #000; height: 26px; display: block; width: 100%; }
  .mb { margin-bottom: 10px; }
  .cb-row { margin-bottom: 9px; font-size: 10.5pt; line-height: 1.5; }
  .box { width: 13px; height: 13px; border: 1.5px solid #000; display: inline-block; vertical-align: middle; margin-right: 7px; margin-top: -2px; }
  .consent { border: 1px solid #bbb; padding: 12px 14px; font-size: 10.5pt; line-height: 1.7;
             margin: 8px 0; min-height: 80px; background: #fafafa; white-space: pre-wrap; }
  .notes-box { border: 1px solid #bbb; padding: 12px 14px; font-size: 10.5pt;
               margin: 8px 0; min-height: 60px; background: #fafafa; }
  .sig-table { width: 100%; margin-top: 26px; }
  .sig-line { border-bottom: 1px solid #000; height: 30px; }
  .sig-label { font-size: 9.5pt; padding-top: 4px; }
  .deadline { font-size: 9pt; color: #444; margin-top: 6px; }
  .footer-table { width: 100%; margin-top: 28px; border-top: 1px solid #ccc; padding-top: 8px; font-size: 8pt; color: #444; }
  .print-btn { position: fixed; top: 20px; right: 20px; background: #000; color: #fff; border: none;
               padding: 12px 24px; font-size: 14px; font-weight: bold; border-radius: 8px; cursor: pointer;
               box-shadow: 0 4px 12px rgba(0,0,0,0.2); z-index: 1000; font-family: Arial, sans-serif; }
  @media print { .print-btn { display: none !important; } }`;

  const header = `
  <button class="print-btn" onclick="window.print()">🖨️ Print Now</button>
  <table class="hdr-table" cellpadding="0" cellspacing="0">
    <tr>
      <td class="logo-box" style="width:auto;padding-right:10px;"><img src="${appBase}/images/logoB.png" style="height:46px;width:auto;object-fit:contain;" /></td>
      <td><div class="school">RILLCOD TECHNOLOGIES</div><div class="tagline">Empowering Young Minds Through Code · www.rillcod.com</div></td>
    </tr>
  </table>
  <div class="form-title">${esc(form.title)}</div>
  <div class="deadline" style="text-align:center;margin-top:-8px;margin-bottom:12px;">Academic session: ${esc(LIVE_SESSION_LABEL)}</div>`;

  const childInfo = `
  <div class="section">Child's Information</div>
  <div class="mb"><span class="field-label">Full Name:</span><span class="line"></span></div>
  <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:10px;">
    <tr>
      <td style="width:120px;padding-right:16px;"><span class="field-label">Age:</span><span class="line"></span></td>
      <td style="width:180px;padding-right:16px;"><span class="field-label">Class / Grade:</span><span class="line"></span></td>
      <td><span class="field-label">Current School:</span><span class="line"></span></td>
    </tr>
  </table>
  <div style="margin-bottom:6px;font-size:10.5pt;font-weight:bold;">Programme Category (tick one):</div>
  <div class="cb-row"><span class="box"></span><strong>Young Innovators :: PRY</strong> — Ages 5–10 · Basic programming through fun &amp; games</div>
  <div class="cb-row"><span class="box"></span><strong>Teen Developers :: SEC</strong> — Ages 11–19 · Advanced coding &amp; project development</div>`;

  const parentInfo = `
  <div class="section">Parent / Guardian Information</div>
  <div class="mb"><span class="field-label">Full Name:</span><span class="line"></span></div>
  <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:10px;">
    <tr>
      <td style="padding-right:16px;"><span class="field-label">WhatsApp / Contact Number:</span><span class="line"></span></td>
      <td><span class="field-label">Email Address:</span><span class="line"></span></td>
    </tr>
  </table>`;

  const signatureBlock = `
  ${dueLabel ? `<p class="deadline">Response deadline: <strong>${dueLabel}</strong></p>` : ''}
  <table class="sig-table" cellpadding="0" cellspacing="0">
    <tr>
      <td style="padding-right:40px;"><div class="sig-line"></div><div class="sig-label">Parent / Guardian Signature</div></td>
      <td style="width:160px;"><div class="sig-line"></div><div class="sig-label">Date</div></td>
    </tr>
  </table>
  <table class="footer-table" cellpadding="0" cellspacing="0">
    <tr>
      <td>For inquiries: ${brandContact.phone} · ${brandContact.email} · @rillcod</td>
      <td style="text-align:right;font-style:italic;">Rillcod Technologies — Empowering Young Minds Through Code</td>
    </tr>
  </table>`;

  const registrationBody = `
  ${childInfo}
  ${parentInfo}
  <div class="section">Consent Statement</div>
  <div class="consent">${esc(form.body)}</div>
  ${signatureBlock}`;

  const assessmentBody = `
  ${childInfo}

  <div class="section">Prior Coding Experience</div>
  <div class="cb-row"><span class="box"></span> Yes &nbsp;&nbsp;&nbsp; <span class="box"></span> No</div>
  <div class="mb"><span class="field-label">If yes — platform / language used (e.g. Scratch, Python):</span><span class="line"></span></div>

  <div class="section">Available Device(s) — tick all that apply</div>
  <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:10px;">
    <tr>
      <td style="width:50%;padding-right:16px;"><div class="cb-row"><span class="box"></span> Computer / Laptop</div><div class="cb-row"><span class="box"></span> Smartphone</div></td>
      <td><div class="cb-row"><span class="box"></span> Tablet / iPad</div><div class="cb-row"><span class="box"></span> None yet</div></td>
    </tr>
  </table>

  <div class="section">Primary Learning Goal — tick one</div>
  <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:10px;">
    <tr>
      <td style="width:50%;padding-right:16px;">
        <div class="cb-row"><span class="box"></span> Fun &amp; creativity</div>
        <div class="cb-row"><span class="box"></span> Academic improvement</div>
        <div class="cb-row"><span class="box"></span> Career preparation</div>
      </td>
      <td>
        <div class="cb-row"><span class="box"></span> Parent / guardian recommendation</div>
        <div class="cb-row"><span class="box"></span> Other: ___________________________</div>
      </td>
    </tr>
  </table>

  <div class="section">Preferred Schedule — tick one</div>
  <div style="margin-bottom:10px;">
    <span class="cb-row"><span class="box"></span> Weekdays &nbsp;&nbsp; <span class="box"></span> Weekends &nbsp;&nbsp; <span class="box"></span> Either works</span>
  </div>

  <div class="section">How Did You Hear About Us? — tick one</div>
  <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:10px;">
    <tr>
      <td style="width:50%;padding-right:16px;">
        <div class="cb-row"><span class="box"></span> Social media (Instagram / Facebook / TikTok)</div>
        <div class="cb-row"><span class="box"></span> Friend or family referral</div>
        <div class="cb-row"><span class="box"></span> School announcement</div>
        <div class="cb-row"><span class="box"></span> Walk-in / physical visit</div>
      </td>
      <td>
        <div class="cb-row"><span class="box"></span> Online search (Google etc.)</div>
        <div class="cb-row"><span class="box"></span> Event / exhibition</div>
        <div class="cb-row"><span class="box"></span> Other: _______________________</div>
      </td>
    </tr>
  </table>

  <div class="section">Special Notes / Accommodations</div>
  <div class="notes-box">&nbsp;</div>

  ${parentInfo}
  <div class="section">Context / Notes</div>
  <div class="consent">${esc(form.body)}</div>
  ${signatureBlock}`;

  win.document.write(`<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8">
<title>${esc(form.title)} — Rillcod Technologies</title>
<style>${sharedCss}</style>
</head><body>
${header}
${isAssessment ? assessmentBody : registrationBody}
</body></html>`);
  win.document.close();
}

function printQRCards(form: ConsentForm, appBase: string, qrSvg?: string, orientation: 'portrait' | 'landscape' = 'portrait') {
  const win = window.open('', '_blank', 'width=820,height=1000');
  if (!win) return;
  const publicUrl = `${appBase}/forms/${form.id}`;
  const title      = esc(form.title);
  const schoolName = form.schools?.name ? esc(form.schools.name) : 'Rillcod Technologies';

  const isLandscape = orientation === 'landscape';
  // Portrait : 2 cols × 4 rows = 8 cards  (A4 portrait,  usable 194×281mm → card 65mm tall)
  // Landscape: 4 cols × 3 rows = 12 cards (A4 landscape, usable 281×194mm → card 60mm tall)
  const count        = isLandscape ? 12 : 8;
  const qrSize       = isLandscape ? 78 : 110;
  const logoH        = isLandscape ? 26 : 34;
  const schoolPt     = isLandscape ? 10 : 13;
  const titlePt      = isLandscape ? 7.5 : 9.5;
  const scanPt       = isLandscape ? 6.5 : 8;
  const footerPt     = isLandscape ? 5.5 : 6.5;
  const pageSize     = isLandscape ? 'A4 landscape' : 'A4 portrait';
  const cardW        = isLandscape ? 'calc(25% - 5px)' : 'calc(50% - 4px)';
  const cardH        = isLandscape ? '60mm' : '65mm';
  const cardPad      = isLandscape ? '7px 5px' : '10px 8px';

  const qrContent = qrSvg
    ? `<div class="qr">${qrSvg}</div>`
    : `<img class="qr" src="${externalQrPrintUrl(publicUrl, qrSize)}" style="width:${qrSize}px;height:${qrSize}px;" />`;

  const cards = Array(count).fill(0).map(() => `
    <div class="card">
      <div class="card-inner">
        <div class="hdr">
          <img class="logo" src="${appBase}/images/logoB.png" />
          <div class="brand">
            <div class="school">RILLCOD</div>
            <div class="tagline">Tech Academy</div>
          </div>
        </div>
        <div class="title">${title}</div>
        ${qrContent}
        <div class="scan-text">Scan to register</div>
        <div class="card-footer">${schoolName}</div>
      </div>
    </div>
  `).join('');

  win.document.write(`<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8">
<title>QR Cards (${orientation}) — ${title}</title>
<style>
  @page { margin: 8mm; size: ${pageSize}; }
  * { box-sizing: border-box; font-family: Arial, sans-serif; }
  body { margin: 0; padding: 0; display: flex; flex-wrap: wrap; gap: 6px; justify-content: center; align-content: flex-start; }
  .card {
    width: ${cardW};
    height: ${cardH};
    border: 1px dashed #ccc;
    padding: 5px;
    display: flex;
    justify-content: center;
    align-items: center;
    page-break-inside: avoid;
  }
  .card-inner {
    border: 2px solid #000;
    border-radius: 6px;
    width: 100%;
    height: 100%;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: space-between;
    padding: ${cardPad};
    text-align: center;
    overflow: hidden;
  }
  .hdr { display: flex; align-items: center; gap: 5px; width: 100%; justify-content: center; }
  .logo { height: ${logoH}px; width: auto; object-fit: contain; flex-shrink: 0; }
  .brand { text-align: left; line-height: 1; }
  .school { font-size: ${schoolPt}pt; font-weight: 900; letter-spacing: -0.5px; }
  .tagline { font-size: 5pt; color: #555; text-transform: uppercase; font-weight: bold; letter-spacing: 0.5px; }
  .title { font-size: ${titlePt}pt; font-weight: bold; margin: 3px 0; background: #000; color: #fff; padding: 3px 6px; border-radius: 3px; width: 100%; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
  .qr { width: ${qrSize}px; height: ${qrSize}px; margin: auto; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
  .qr svg { width: ${qrSize}px; height: ${qrSize}px; }
  .scan-text { font-size: ${scanPt}pt; font-weight: bold; color: #444; }
  .card-footer { font-size: ${footerPt}pt; font-weight: 900; color: #000; text-transform: uppercase; letter-spacing: 0.4px; border-top: 1px solid #ddd; width: 100%; padding-top: 3px; margin-top: 2px; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
  .print-btn { position: fixed; top: 20px; right: 20px; background: #000; color: #fff; border: none; padding: 12px 24px; font-size: 14px; font-weight: bold; border-radius: 8px; cursor: pointer; box-shadow: 0 4px 12px rgba(0,0,0,0.2); z-index: 1000; font-family: Arial, sans-serif; }
  .print-btn:hover { background: #333; }
  @media print { body { padding: 0; } .card { border: 1px dashed #eee; } .print-btn { display: none !important; } }
</style></head><body>
  <button class="print-btn" onclick="window.print()">🖨️ Print Now</button>
  ${cards}
</body></html>`);
  win.document.close();
}



function printFilledForm(form: ConsentForm, lead: FormLead, appBase: string) {
  const win = window.open('', '_blank', 'width=860,height=1100');
  if (!win) return;
  const rd  = (lead.response_data ?? {}) as Record<string, unknown>;
  const str = (k: string) => (rd[k] as string) ?? '';
  const sub = new Date(lead.submitted_at);
  const dateStr  = sub.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const timeStr  = sub.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  const shortRef = 'RC-' + lead.id.slice(0, 8).toUpperCase();

  const programLabel = str('program_category') === 'young_innovators'
    ? 'Young Innovators — PRY (Ages 5–10)'
    : str('program_category') === 'teen_developers'
    ? 'Teen Developers — SEC (Ages 11–19)'
    : str('program_category') || '—';

  const devicesArr = Array.isArray(rd.devices) ? (rd.devices as string[]).join(', ') : '';

  const row = (label: string, value: string) =>
    `<tr><td class="lbl">${label}</td><td class="val">${value || '—'}</td></tr>`;

  const assessmentRows = [
    str('prior_coding') && row('Prior coding experience',
      str('prior_coding') === 'yes' ? `Yes${str('prior_platform') ? ` — ${str('prior_platform')}` : ''}` : 'No'),
    devicesArr && row('Available device(s)', esc(devicesArr)),
    str('learning_goal') && row('Primary learning goal', esc(str('learning_goal'))),
    str('preferred_schedule') && row('Preferred schedule', esc(str('preferred_schedule'))),
    str('how_heard') && row('How they heard about us', esc(str('how_heard'))),
    str('special_notes') && row('Special notes / medical info', esc(str('special_notes'))),
  ].filter(Boolean).join('');

  win.document.write(`<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8">
<title>${shortRef} — ${esc(form.title)}</title>
<style>
  @page { margin: 0; size: A4 portrait; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: Arial, Helvetica, sans-serif; font-size: 10.5pt; color: #1a1a1a; background: #fff; }

  /* ── Letterhead header ─────────────────────────────── */
  .letterhead {
    background: #0d0d0f;
    padding: 22px 30px 18px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 20px;
  }
  .letterhead-logo { height: 56px; width: auto; object-fit: contain; flex-shrink: 0; }
  .letterhead-divider { width: 1px; height: 52px; background: rgba(255,255,255,0.18); flex-shrink: 0; }
  .letterhead-company { flex: 1; color: #fff; }
  .letterhead-company .co-name { font-size: 17pt; font-weight: 900; letter-spacing: -0.5px; line-height: 1; color: #fff; }
  .letterhead-company .co-tag  { font-size: 7.5pt; color: #a0a0a8; text-transform: uppercase; letter-spacing: 1.5px; margin-top: 3px; }
  .letterhead-contact { text-align: right; color: #a0a0a8; font-size: 8pt; line-height: 1.8; flex-shrink: 0; }
  .letterhead-contact a { color: #f5a623; text-decoration: none; }

  /* Gold accent strip */
  .accent-strip { height: 4px; background: linear-gradient(90deg, #f5a623 0%, #f5c84a 100%); }

  /* ── Document body ─────────────────────────────────── */
  .body-wrap { padding: 28px 32px 24px; }

  /* Doc title block */
  .doc-type { font-size: 7.5pt; font-weight: 900; letter-spacing: 3px; text-transform: uppercase;
              color: #f5a623; margin-bottom: 4px; }
  .doc-title { font-size: 15pt; font-weight: 900; color: #0d0d0f; line-height: 1.2; }
  .doc-divider { border: none; border-top: 2px solid #0d0d0f; margin: 10px 0 14px; }

  /* Ref + date block */
  .ref-block { display: flex; justify-content: space-between; align-items: flex-start;
               background: #f7f7f8; border-left: 4px solid #f5a623;
               padding: 10px 14px; margin-bottom: 22px; font-size: 9pt; }
  .ref-block .ref-id { font-family: 'Courier New', monospace; font-weight: 700; font-size: 10pt; color: #0d0d0f; }
  .ref-block .ref-sub { color: #666; font-size: 8pt; margin-top: 2px; }
  .ref-block .ref-right { text-align: right; color: #333; }
  .ref-block .ref-right strong { display: block; color: #0d0d0f; font-size: 10pt; }

  /* Section headings */
  .sec-heading {
    font-size: 7.5pt; font-weight: 900; letter-spacing: 2.5px; text-transform: uppercase;
    color: #0d0d0f; border-bottom: 1.5px solid #0d0d0f; padding-bottom: 4px;
    margin: 20px 0 10px;
  }
  .sec-heading span { color: #f5a623; }

  /* Data table */
  .data-table { width: 100%; border-collapse: collapse; }
  .data-table .lbl { width: 42%; padding: 7px 10px 7px 0; font-weight: 700; color: #444; font-size: 10pt;
                     border-bottom: 1px solid #ebebeb; vertical-align: top; }
  .data-table .val { padding: 7px 0; color: #111; font-size: 10pt; border-bottom: 1px solid #ebebeb; vertical-align: top; }
  .data-table tr:last-child .lbl,
  .data-table tr:last-child .val { border-bottom: none; }

  /* Programme badge */
  .prog-badge { display: inline-block; background: #0d0d0f; color: #f5a623;
                font-size: 8.5pt; font-weight: 900; padding: 3px 10px; border-radius: 4px;
                letter-spacing: 0.5px; }
  .exist-badge { display: inline-block; background: #7c3aed; color: #fff;
                 font-size: 8pt; font-weight: 700; padding: 2px 8px; border-radius: 4px;
                 margin-left: 8px; letter-spacing: 0.5px; }

  /* Consent body */
  .consent-wrap { border: 1px solid #d4d4d4; border-left: 4px solid #0d0d0f;
                  padding: 12px 14px; background: #fafafa;
                  font-size: 10pt; line-height: 1.75; white-space: pre-wrap;
                  margin-top: 8px; color: #222; }

  /* Digital confirmation stamp */
  .stamp {
    margin-top: 22px;
    border: 1.5px solid #d0e8d0; border-radius: 8px;
    background: #f3fbf3; padding: 12px 16px;
    display: flex; align-items: flex-start; gap: 12px;
  }
  .stamp-icon { font-size: 22pt; line-height: 1; flex-shrink: 0; }
  .stamp-text { font-size: 9.5pt; color: #2d5a2d; line-height: 1.6; }
  .stamp-text strong { color: #1a3a1a; }

  /* Footer */
  .page-footer {
    margin-top: 28px; padding-top: 10px;
    border-top: 1px solid #ddd;
    display: flex; justify-content: space-between; align-items: center;
    font-size: 7.5pt; color: #888;
  }
  .page-footer .ref { font-family: 'Courier New', monospace; font-weight: 700; color: #555; }
  .page-footer .conf { font-style: italic; }

  /* Print button */
  .print-btn {
    position: fixed; top: 18px; right: 18px;
    background: #0d0d0f; color: #fff; border: none;
    padding: 11px 22px; font-size: 13px; font-weight: bold;
    border-radius: 8px; cursor: pointer;
    box-shadow: 0 4px 14px rgba(0,0,0,0.25);
    z-index: 1000; font-family: Arial, sans-serif;
    display: flex; align-items: center; gap: 6px;
  }
  .print-btn:hover { background: #333; }
  @media print { .print-btn { display: none !important; } }
</style></head><body>

<button class="print-btn" onclick="window.print()">🖨️ Print Now</button>

<!-- ── Letterhead ───────────────────────────────────────── -->
<div class="letterhead">
  <img src="${appBase}/images/logoB.png" class="letterhead-logo" alt="Rillcod Technologies" />
  <div class="letterhead-divider"></div>
  <div class="letterhead-company">
    <div class="co-name">RILLCOD TECHNOLOGIES</div>
    <div class="co-tag">Empowering Young Minds Through Code</div>
  </div>
  <div class="letterhead-contact">
    <div>${brandContact.phone}</div>
    <div><a href="mailto:${brandContact.email}">${brandContact.email}</a></div>
    <div>www.rillcod.com</div>
    <div>@rillcod</div>
  </div>
</div>
<div class="accent-strip"></div>

<!-- ── Body ─────────────────────────────────────────────── -->
<div class="body-wrap">

  <div class="doc-type">Form Submission Record</div>
  <div class="doc-title">${esc(form.title)}</div>
  <hr class="doc-divider" />

  <div class="ref-block">
    <div>
      <div class="ref-id">${shortRef}</div>
      <div class="ref-sub">Submission Reference</div>
    </div>
    <div class="ref-right">
      <strong>${dateStr}</strong>
      <span>Received at ${timeStr}</span>
    </div>
  </div>

  <!-- Parent / Guardian -->
  <div class="sec-heading"><span>01 ·</span> Parent / Guardian Details</div>
  <table class="data-table" cellpadding="0" cellspacing="0">
    ${row('Full Name', esc(str('parent_name') || 'Not provided') + (rd.is_existing_parent ? '<span class="exist-badge">Existing Parent</span>' : ''))}
    ${row('Email Address', esc(lead.email || str('parent_email') || '—'))}
    ${row('WhatsApp / Phone', esc(str('parent_whatsapp') || '—'))}
  </table>

  <!-- Child Information -->
  <div class="sec-heading"><span>02 ·</span> Child&rsquo;s Information</div>
  <table class="data-table" cellpadding="0" cellspacing="0">
    ${row('Full Name', esc(str('child_name') || '—'))}
    ${row('Age', esc(str('child_age') || '—'))}
    ${row('Class / Grade', esc(str('child_class') || '—'))}
    ${row('Current School', esc(lead.child_current_school || str('child_current_school') || '—'))}
    <tr><td class="lbl">Programme Selected</td><td class="val"><span class="prog-badge">${programLabel}</span></td></tr>
  </table>

  ${assessmentRows ? `
  <!-- Assessment -->
  <div class="sec-heading"><span>03 ·</span> Assessment &amp; Background</div>
  <table class="data-table" cellpadding="0" cellspacing="0">${assessmentRows}</table>` : ''}

  <!-- Consent Statement -->
  <div class="sec-heading"><span>${assessmentRows ? '04' : '03'} ·</span> Consent Statement</div>
  <div class="consent-wrap">${esc(form.body)}</div>

  <!-- Digital confirmation -->
  <div class="stamp">
    <div class="stamp-icon">✅</div>
    <div class="stamp-text">
      <strong>Digitally submitted and accepted</strong><br/>
      This form was completed online by the parent/guardian on <strong>${dateStr} at ${timeStr}</strong>
      via <strong>rillcod.com/forms</strong>. Submission of this form constitutes the parent/guardian&rsquo;s
      acknowledgement and acceptance of the consent statement above.
    </div>
  </div>

  <div class="page-footer">
    <span class="ref">${shortRef}</span>
    <span>Rillcod Technologies &mdash; ${esc(form.title)}</span>
    <span class="conf">Confidential · For official use only</span>
  </div>

</div><!-- /body-wrap -->
</body></html>`);
  win.document.close();
}

function printDataSheet(form: ConsentForm, leads: FormLead[], sigs: Signatory[], appBase: string) {
  const win = window.open('', '_blank', 'width=1200,height=900');
  if (!win) return;

  const now      = new Date();
  const printed  = now.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
  const printTime = now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  const isAssessment  = form.form_type === 'assessment';
  const schoolName    = form.schools?.name ?? null;

  const progLabel = (cat: string) =>
    cat === 'young_innovators' ? 'Young Innovators' :
    cat === 'teen_developers'  ? 'Teen Developers'  : cat || '—';

  const statusLabel = (s: string) =>
    ({ new: 'New', contacted: 'Contacted', enrolled: 'Enrolled', lost: 'Lost' }[s] ?? s);

  const genderLabel = (g: string) =>
    g === 'male' ? 'Male' : g === 'female' ? 'Female' : '';

  /* ── Lead rows ─────────────────────────────────────────────────────── */
  const leadRows = leads.map((lead, i) => {
    const rd  = (lead.response_data ?? {}) as Record<string, unknown>;
    const str = (k: string) => (rd[k] as string) ?? '';
    const sub = new Date(lead.submitted_at);
    const dateCell = sub.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
    const timeCell = sub.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
    const devs     = Array.isArray(rd.devices) ? (rd.devices as string[]).join(', ') : '';
    const prog     = progLabel(str('program_category'));
    const stat     = statusLabel(lead.status ?? 'new');
    const statCls  = lead.status === 'enrolled' ? 'enrolled' : lead.status === 'contacted' ? 'contacted' : lead.status === 'lost' ? 'lost' : 'new-s';
    const gender   = genderLabel(str('child_gender'));
    const childSub = [gender, str('child_age') ? `Age ${esc(str('child_age'))}` : '', esc(str('child_class') || '')].filter(Boolean).join(' · ');

    return `
    <tr class="data-row">
      <td class="num">${i + 1}</td>
      <td class="date-col">${dateCell}<br/><span class="time">${timeCell}</span></td>
      <td>
        <strong>${esc(str('parent_name') || '—')}</strong>${rd.is_existing_parent ? '<span class="tag tag-purple">Existing</span>' : ''}
        <br/><span class="sub">${esc(lead.email || str('parent_email') || '')}</span>
        ${str('parent_whatsapp') ? `<br/><span class="sub">${esc(str('parent_whatsapp'))}</span>` : ''}
      </td>
      <td>
        <strong>${esc(str('child_name') || '—')}</strong>
        ${gender ? `<span class="tag ${gender === 'Male' ? 'tag-blue' : 'tag-pink'}">${gender}</span>` : ''}
        ${childSub ? `<br/><span class="sub">${childSub}</span>` : ''}
      </td>
      <td><span class="sub">${esc(lead.child_current_school || str('child_current_school') || '—')}</span></td>
      <td><span class="prog">${esc(prog)}</span></td>
      ${isAssessment ? `
      <td><span class="sub">${str('prior_coding') === 'yes' ? `Yes${str('prior_platform') ? ': ' + esc(str('prior_platform')) : ''}` : str('prior_coding') === 'no' ? 'No' : '—'}</span></td>
      <td><span class="sub">${esc(devs || '—')}</span></td>
      <td><span class="sub">${esc(str('learning_goal') || '—')}</span></td>
      <td><span class="sub">${esc(str('preferred_schedule') || '—')}</span></td>
      ` : ''}
      <td><span class="stat ${statCls}">${stat}</span></td>
      <td><span class="sub">${esc(str('special_notes') || '')}</span></td>
    </tr>`;
  }).join('');

  /* ── Signature rows ─────────────────────────────────────────────────── */
  const sigRows = sigs.map((s, i) => {
    const rd   = (s.response_data ?? {}) as Record<string, unknown>;
    const str2 = (k: string) => (rd[k] as string) ?? '';
    const sub  = new Date(s.signed_at);
    const dateCell  = sub.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
    const timeCell  = sub.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
    const prog      = progLabel(str2('program_category'));
    const gender    = genderLabel(str2('child_gender'));
    const childSub2 = [gender, str2('child_age') ? `Age ${esc(str2('child_age'))}` : '', esc(str2('child_class') || '')].filter(Boolean).join(' · ');

    return `
    <tr class="data-row sig-row">
      <td class="num">${leads.length + i + 1}</td>
      <td class="date-col">${dateCell}<br/><span class="time">${timeCell}</span></td>
      <td>
        <strong>${esc(s.portal_users?.full_name ?? '—')}</strong><span class="tag tag-blue">Portal</span>
        <br/><span class="sub">${esc(s.portal_users?.email ?? '')}</span>
        ${s.portal_users?.phone ? `<br/><span class="sub">${esc(s.portal_users.phone)}</span>` : ''}
      </td>
      <td>
        <strong>${esc(str2('child_name') || '—')}</strong>
        ${gender ? `<span class="tag ${gender === 'Male' ? 'tag-blue' : 'tag-pink'}">${gender}</span>` : ''}
        ${childSub2 ? `<br/><span class="sub">${childSub2}</span>` : ''}
      </td>
      <td><span class="sub">—</span></td>
      <td><span class="prog">${esc(prog)}</span></td>
      ${isAssessment ? `<td>—</td><td>—</td><td>—</td><td>—</td>` : ''}
      <td><span class="stat enrolled">Signed</span></td>
      <td></td>
    </tr>`;
  }).join('');

  const assessmentHeaders = isAssessment
    ? `<th>Prior Coding</th><th>Device(s)</th><th>Goal</th><th>Schedule</th>`
    : '';

  const totalRows  = leads.length + sigs.length;
  const enrolled   = leads.filter(l => l.status === 'enrolled').length;
  const contacted  = leads.filter(l => l.status === 'contacted').length;
  const lostCount  = leads.filter(l => l.status === 'lost').length;
  const yiCount    = leads.filter(l => (l.response_data as Record<string,unknown>)?.program_category === 'young_innovators').length;
  const tdCount    = leads.filter(l => (l.response_data as Record<string,unknown>)?.program_category === 'teen_developers').length;
  const maleCount  = leads.filter(l => (l.response_data as Record<string,unknown>)?.child_gender === 'male').length;
  const femaleCount = leads.filter(l => (l.response_data as Record<string,unknown>)?.child_gender === 'female').length;

  win.document.write(`<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8">
<title>Data Sheet — ${esc(form.title)}</title>
<style>
  @page { margin: 8mm 6mm; size: A4 landscape; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Arial', Helvetica, sans-serif; font-size: 7.5pt; color: #111; background: #fff; -webkit-print-color-adjust: exact; print-color-adjust: exact; }

  /* ── Letterhead ──────────────────────────────────────────────────── */
  .lh { background: #0a0a0b; display: flex; align-items: stretch; }
  .lh-brand { display: flex; align-items: center; gap: 12px; padding: 12px 18px; }
  .lh-logo { height: 36px; width: auto; object-fit: contain; }
  .lh-vr { width: 1px; background: rgba(255,255,255,0.15); margin: 10px 0; }
  .lh-names { padding: 0 16px; display: flex; flex-direction: column; justify-content: center; }
  .lh-main { font-size: 11pt; font-weight: 900; color: #fff; letter-spacing: -0.3px; line-height: 1.1; }
  .lh-sub  { font-size: 6pt; color: #f5a623; letter-spacing: 1.8px; text-transform: uppercase; margin-top: 3px; }
  .lh-school-wrap { display: flex; align-items: center; gap: 8px; padding: 0 18px; border-left: 1px solid rgba(255,255,255,0.1); }
  .lh-school-label { font-size: 6pt; color: #888; letter-spacing: 1.5px; text-transform: uppercase; }
  .lh-school-name  { font-size: 9pt; font-weight: 900; color: #fff; margin-top: 2px; }
  .lh-contact { margin-left: auto; text-align: right; padding: 12px 18px; display: flex; flex-direction: column; justify-content: center; color: #888; font-size: 6.5pt; line-height: 1.8; }
  .lh-contact a { color: #f5a623; text-decoration: none; }
  .accent { height: 3px; background: linear-gradient(90deg,#f5a623 0%,#f5d35a 60%,#e84e1d 100%); }

  /* ── Doc header ──────────────────────────────────────────────────── */
  .doc-hdr { padding: 9px 18px 7px; display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #111; }
  .doc-badge { display: inline-block; font-size: 6pt; font-weight: 900; letter-spacing: 2px; text-transform: uppercase; color: #f5a623; background: #0a0a0b; padding: 2px 7px; margin-bottom: 4px; }
  .doc-title { font-size: 11pt; font-weight: 900; color: #0a0a0b; line-height: 1.2; max-width: 480px; }
  .doc-meta-grid { display: grid; grid-template-columns: auto auto; gap: 1px 14px; text-align: right; }
  .doc-meta-lbl { font-size: 6pt; font-weight: 700; color: #aaa; text-transform: uppercase; letter-spacing: 1px; }
  .doc-meta-val { font-size: 7.5pt; font-weight: 700; color: #111; }

  /* ── Stats strip ─────────────────────────────────────────────────── */
  .stats { display: flex; border-bottom: 1px solid #d0d0d0; background: #fafafa; }
  .sc   { flex: 1; padding: 7px 10px; border-right: 1px solid #e4e4e4; }
  .sc:last-child { border-right: none; }
  .sc-n { font-size: 14pt; font-weight: 900; color: #0a0a0b; line-height: 1; }
  .sc-l { font-size: 5.5pt; font-weight: 800; text-transform: uppercase; letter-spacing: 1.4px; color: #999; margin-top: 2px; }
  .sc.hi .sc-n { color: #166534; }
  .sc.bl .sc-n { color: #1d4ed8; }
  .sc.am .sc-n { color: #b45309; }
  .sc.pu .sc-n { color: #6d28d9; }

  /* ── Section label ───────────────────────────────────────────────── */
  .section-wrap { padding: 0 8px 10px; }
  .section-lbl { font-size: 6pt; font-weight: 900; letter-spacing: 2px; text-transform: uppercase; color: #aaa; padding: 6px 0 4px; border-bottom: 1px solid #eee; margin-bottom: 0; }

  /* ── Table ───────────────────────────────────────────────────────── */
  table { width: 100%; border-collapse: collapse; }
  thead th {
    background: #0a0a0b; color: #fff; font-size: 6.5pt; font-weight: 800;
    letter-spacing: 0.8px; text-transform: uppercase; padding: 5px 7px;
    text-align: left; white-space: nowrap; border-right: 1px solid #222;
  }
  thead th:last-child { border-right: none; }
  .data-row td { padding: 5px 7px; border-bottom: 1px solid #efefef; vertical-align: top; font-size: 7pt; border-right: 1px solid #f3f3f3; }
  .data-row td:last-child { border-right: none; }
  .data-row:nth-child(even) td { background: #f8f8f8; }
  .sig-row td { background: #edf7ff !important; }
  .sig-row:nth-child(even) td { background: #e4f2fd !important; }
  .num { color: #bbb; font-size: 6.5pt; text-align: center; width: 20px; white-space: nowrap; }
  .date-col { white-space: nowrap; width: 68px; }
  .time { color: #aaa; font-size: 6pt; }
  .sub  { color: #666; font-size: 6.5pt; display: block; margin-top: 1px; }
  strong { font-size: 7.5pt; color: #111; }
  .prog { display: inline-block; background: #0a0a0b; color: #f5a623; font-size: 6pt; font-weight: 900; padding: 1px 5px; letter-spacing: 0.3px; white-space: nowrap; }
  .stat { display: inline-block; font-size: 6pt; font-weight: 900; padding: 1px 5px; white-space: nowrap; }
  .new-s     { background: #fff7e0; color: #b45309; }
  .contacted { background: #dbeafe; color: #1d4ed8; }
  .enrolled  { background: #dcfce7; color: #166534; }
  .lost      { background: #f3f4f6; color: #6b7280; }
  .tag { display: inline-block; font-size: 5.5pt; font-weight: 900; padding: 1px 4px; letter-spacing: 0.3px; margin-left: 3px; vertical-align: middle; }
  .tag-purple { background: #ede9fe; color: #6d28d9; }
  .tag-blue   { background: #dbeafe; color: #1d4ed8; }
  .tag-pink   { background: #fce7f3; color: #be185d; }

  /* ── Footer ──────────────────────────────────────────────────────── */
  .page-footer { padding: 5px 18px; border-top: 1.5px solid #ccc; display: flex; justify-content: space-between; align-items: center; font-size: 6pt; color: #bbb; margin-top: 4px; }
  .page-footer strong { color: #666; }

  /* ── Screen-only print button ─────────────────────────────────────── */
  .print-btn { position: fixed; top: 12px; right: 12px; background: #0a0a0b; color: #fff; border: none; padding: 9px 18px; font-size: 12px; font-weight: 900; cursor: pointer; box-shadow: 0 4px 16px rgba(0,0,0,0.3); z-index: 999; font-family: Arial; letter-spacing: 0.3px; }
  .print-btn:hover { background: #1f1f1f; }
  @media print { .print-btn { display: none !important; } }
</style></head><body>

<button class="print-btn" onclick="window.print()">&#128438; Print Sheet</button>

<!-- Letterhead -->
<div class="lh">
  <div class="lh-brand">
    <img src="${appBase}/images/logoB.png" class="lh-logo" alt="Rillcod" />
  </div>
  <div class="lh-vr"></div>
  <div class="lh-names">
    <div class="lh-main">${schoolName ? esc(schoolName.toUpperCase()) : 'RILLCOD TECHNOLOGIES'}</div>
    <div class="lh-sub">${schoolName ? 'via Rillcod Technologies' : 'Empowering Young Minds Through Code'}</div>
  </div>
  ${schoolName ? `
  <div class="lh-school-wrap" style="display:none"></div>
  ` : ''}
  <div class="lh-contact">
    <span><a>${brandContact.phone}</a></span>
    <span>${brandContact.email} &nbsp;·&nbsp; www.rillcod.com</span>
  </div>
</div>
<div class="accent"></div>

<!-- Doc header -->
<div class="doc-hdr">
  <div>
    <div class="doc-badge">Response Data Sheet &nbsp;·&nbsp; ${form.form_type === 'assessment' ? 'Assessment' : form.form_type === 'registration' ? 'Registration' : 'General'}</div>
    <div class="doc-title">${esc(form.title)}</div>
  </div>
  <div class="doc-meta-grid">
    <span class="doc-meta-lbl">Printed</span><span class="doc-meta-val">${printed} &nbsp;${printTime}</span>
    ${schoolName ? `<span class="doc-meta-lbl">School</span><span class="doc-meta-val">${esc(schoolName)}</span>` : ''}
    ${form.due_date ? `<span class="doc-meta-lbl">Deadline</span><span class="doc-meta-val">${new Date(form.due_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</span>` : ''}
    <span class="doc-meta-lbl">Records</span><span class="doc-meta-val">${totalRows}</span>
  </div>
</div>

<!-- Stats strip -->
<div class="stats">
  <div class="sc"><div class="sc-n">${totalRows}</div><div class="sc-l">Total</div></div>
  <div class="sc"><div class="sc-n">${leads.length}</div><div class="sc-l">Registrations</div></div>
  <div class="sc"><div class="sc-n">${sigs.length}</div><div class="sc-l">Portal Signed</div></div>
  <div class="sc hi"><div class="sc-n">${enrolled}</div><div class="sc-l">Enrolled</div></div>
  <div class="sc bl"><div class="sc-n">${contacted}</div><div class="sc-l">Contacted</div></div>
  <div class="sc am"><div class="sc-n">${lostCount}</div><div class="sc-l">Lost</div></div>
  <div class="sc bl"><div class="sc-n">${maleCount}</div><div class="sc-l">Boys</div></div>
  <div class="sc pu"><div class="sc-n">${femaleCount}</div><div class="sc-l">Girls</div></div>
  <div class="sc"><div class="sc-n">${yiCount}</div><div class="sc-l">Young Innovators</div></div>
  <div class="sc"><div class="sc-n">${tdCount}</div><div class="sc-l">Teen Developers</div></div>
</div>

<!-- Data table -->
<div class="section-wrap">
<div class="section-lbl">Registrations &amp; Responses</div>
<table>
  <thead>
    <tr>
      <th>#</th>
      <th>Date / Time</th>
      <th>Parent / Guardian</th>
      <th>Child</th>
      <th>Child&apos;s School</th>
      <th>Programme</th>
      ${assessmentHeaders}
      <th>Status</th>
      <th>Notes</th>
    </tr>
  </thead>
  <tbody>
    ${leadRows}
    ${sigRows}
    ${totalRows === 0 ? `<tr><td colspan="100" style="text-align:center;padding:18px;color:#bbb;font-style:italic;font-size:8pt;">No responses recorded yet.</td></tr>` : ''}
  </tbody>
</table>
</div>

<!-- Footer -->
<div class="page-footer">
  <strong>${schoolName ? esc(schoolName) + ' — via Rillcod Technologies' : 'Rillcod Technologies'}</strong>
  <span>${esc(form.title)}</span>
  <span>Generated ${printed} &nbsp;·&nbsp; ${totalRows} record${totalRows !== 1 ? 's' : ''} &nbsp;·&nbsp; Confidential</span>
</div>

</body></html>`);
  win.document.close();
}

function printQRPoster(form: ConsentForm, appBase: string, qrSvg?: string) {
  const win = window.open('', '_blank', 'width=820,height=1000');
  if (!win) return;
  const publicUrl = `${appBase}/forms/${form.id}`;
  const title = esc(form.title);
  const qrContent = qrSvg
    ? `<div class="qr-wrap">${qrSvg}</div>`
    : `<img class="qr-wrap" src="${externalQrPrintUrl(publicUrl, 420)}" style="width:420px;height:420px;" />`;

  win.document.write(`<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8">
<title>QR Poster — ${title}</title>
<style>
  @page { margin: 15mm; size: A4 portrait; }
  * { box-sizing: border-box; font-family: 'Arial Black', Arial, sans-serif; }
  body { margin: 0; padding: 0; display: flex; justify-content: center; align-items: center; min-height: 100vh; border: 8px solid #000; }
  .poster { width: 100%; height: 100%; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 20px; text-align: center; }
  .hdr { display: flex; align-items: center; gap: 16px; margin-bottom: 30px; }
  .logo-box { height: 80px; width: auto; display: flex; align-items: center; }
  .logo-box img { height: 80px; width: auto; object-fit: contain; }
  .brand { text-align: left; line-height: 1.1; }
  .school { font-size: 32pt; font-weight: 900; letter-spacing: -1px; }
  .tagline { font-size: 14pt; color: #555; text-transform: uppercase; letter-spacing: 2px; }
  .title { font-size: 24pt; margin: 0 0 40px; background: #000; color: #fff; padding: 15px 30px; border-radius: 12px; width: 100%; max-width: 90%; }
  .qr-wrap { width: 420px; height: 420px; border: 12px solid #000; padding: 10px; border-radius: 20px; box-shadow: 10px 10px 0 #000; display: flex; align-items: center; justify-content: center; }
  .qr-wrap svg { width: 390px; height: 390px; }
  .scan-text { font-size: 48pt; font-weight: 900; color: #000; margin-top: 50px; text-transform: uppercase; letter-spacing: 2px; }
  .sub-scan { font-size: 18pt; color: #444; font-weight: bold; font-family: Arial, sans-serif; margin-top: 10px; }
  .print-btn { position: fixed; top: 20px; right: 20px; background: #000; color: #fff; border: none; padding: 12px 24px; font-size: 14px; font-weight: bold; border-radius: 8px; cursor: pointer; box-shadow: 0 4px 12px rgba(0,0,0,0.2); z-index: 1000; font-family: Arial, sans-serif; }
  .print-btn:hover { background: #333; }
  @media print { body { border: none; } .poster { border: 8px solid #000; height: 95vh; } .qr-wrap { box-shadow: none; border: 8px solid #000; } .print-btn { display: none !important; } }
</style></head><body>
  <button class="print-btn" onclick="window.print()">🖨️ Print Now</button>
  <div class="poster">
    <div class="hdr">
      <div class="logo-box"><img src="${appBase}/images/logoB.png" style="height:100%;width:auto;object-fit:contain;" /></div>
      <div class="brand">
        <div class="school">RILLCOD</div>
        <div class="tagline">Tech Academy</div>
      </div>
    </div>
    <div class="title">${title}</div>
    ${qrContent}
    <div class="scan-text">Scan To Register</div>
    <div class="sub-scan">Open your phone camera and point it at the code</div>
  </div>
</body></html>`);
  win.document.close();
}

// ── Page component ────────────────────────────────────────────────────────────

export default function ConsentFormsPage() {
  const { profile } = useAuth();
  const router = useRouter();
  const [forms, setForms] = useState<ConsentForm[]>([]);
  const [loading, setLoading] = useState(true);

  // Create modal
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState('');
  const [newForm, setNewForm] = useState({ title: '', body: '', due_date: '', form_type: 'general', school_id: '', class_id: '', enrollment_type: 'school', academic_offering_id: '' });
  const [schools, setSchools] = useState<{ id: string; name: string }[]>([]);
  const [classes, setClasses] = useState<{ id: string; name: string; academic_offering_id?: string | null }[]>([]);
  const [pathways, setPathways] = useState<Array<{
    id: string;
    title: string;
    enrollment_type: string;
    programme_id?: string | null;
    school_id?: string | null;
  }>>([]);

  // Edit modal
  const [editingForm, setEditingForm] = useState<ConsentForm & { school_id?: string } | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);
  const [editError, setEditError] = useState('');

  // Signing
  const [signingId, setSigningId] = useState<string | null>(null);
  const [readModalId, setReadModalId] = useState<string | null>(null);
  const [regData, setRegData] = useState<RegistrationData>({
    child_name: '', child_age: '', child_class: '', program_category: '',
    parent_name: '', parent_whatsapp: '', parent_email: '', consent_acknowledged: false,
  });
  const [regStep, setRegStep] = useState<'read' | 'fill'>('read');

  // Signatories + leads panel
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [signatories, setSignatories] = useState<Record<string, Signatory[]>>({});
  const [leads, setLeads] = useState<Record<string, FormLead[]>>({});
  const [loadingSigs, setLoadingSigs] = useState<string | null>(null);

  // Delete
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  // Public link / QR
  const [togglingPublicId, setTogglingPublicId] = useState<string | null>(null);
  const [qrFormId, setQrFormId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [downloadingQr, setDownloadingQr] = useState(false);
  const qrSvgWrapperRef = useRef<HTMLDivElement>(null);

  // Lead status + match review
  const [updatingLeadId, setUpdatingLeadId]   = useState<string | null>(null);
  const [reviewingLeadId, setReviewingLeadId] = useState<string | null>(null);

  // Clone / Copy-to-school modal
  const [cloningId, setCloningId]                   = useState<string | null>(null);
  const [cloneModalForm, setCloneModalForm]         = useState<ConsentForm | null>(null);
  const [cloneTargetSchoolId, setCloneTargetSchoolId] = useState('');
  const [cloneTargetOfferingId, setCloneTargetOfferingId] = useState('');
  const [cloneSchools, setCloneSchools]             = useState<{ id: string; name: string }[]>([]);
  const [cloneSchoolsLoading, setCloneSchoolsLoading] = useState(false);
  const [cloneError, setCloneError]                 = useState('');

  const [strippingCopy, setStrippingCopy]   = useState(false);
  const [stripResult, setStripResult]       = useState('');

  const isAdmin  = profile?.role === 'admin';
  const isStaff  = ['teacher', 'admin', 'school'].includes(profile?.role ?? '');
  const isParent = profile?.role === 'parent';
  const isEditor = isAdmin || profile?.role === 'teacher'; // can create / edit / delete

  // ── Role guard — students have no business here ───────────────────────────
  useEffect(() => {
    if (!profile) return;
    if (!['admin', 'teacher', 'school', 'parent'].includes(profile.role)) {
      router.replace('/dashboard');
    }
  }, [profile, router]);

  const appBase = typeof window !== 'undefined' ? window.location.origin : '';

  // ── Data loading ──────────────────────────────────────────────────────────

  const loadForms = useCallback(async () => {
    setLoading(true);
    try {
      const [formsRes, schoolsRes, pathwaysRes] = await Promise.all([
        fetch('/api/consent-forms'),
        fetch('/api/schools'),
        isStaff ? fetch('/api/academic-spine/pathways') : Promise.resolve(null),
      ]);
      const formsJson = await formsRes.json();
      const schoolsJson = await schoolsRes.json();
      const pathwaysJson = pathwaysRes ? await pathwaysRes.json() : null;
      setForms(formsJson.data ?? []);
      setSchools(schoolsJson.schools ?? schoolsJson.data ?? []);
      setPathways(pathwaysJson?.data?.offerings ?? []);
    } finally {
      setLoading(false);
    }
  }, [isStaff]);

  useEffect(() => { loadForms(); }, [loadForms]);

  // Load classes for the form's target-class picker, scoped to the chosen (admin)
  // or own (teacher/school) school.
  useEffect(() => {
    const schoolForClasses = newForm.school_id || (profile?.role !== 'admin' ? (profile?.school_id ?? '') : '');
    if (!schoolForClasses) { setClasses([]); return; }
    let active = true;
    fetch(`/api/classes?school_id=${schoolForClasses}`)
      .then(r => (r.ok ? r.json() : { data: [] }))
      .then(j => { if (active) setClasses(j.data ?? []); })
      .catch(() => { if (active) setClasses([]); });
    return () => { active = false; };
  }, [newForm.school_id, profile?.school_id, profile?.role]);

  // ── Create ────────────────────────────────────────────────────────────────

  async function createForm() {
    if (!newForm.title.trim() || !newForm.body.trim()) return;
    setCreating(true); setCreateError('');
    try {
      const res = await fetch('/api/consent-forms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newForm),
      });
      const json = await res.json();
      if (!res.ok) { setCreateError(json.error || 'Failed'); return; }
      setForms(prev => [{ ...json.data, has_signed: false }, ...prev]);
      setNewForm({ title: '', body: '', due_date: '', form_type: 'general', school_id: '', class_id: '', enrollment_type: 'school', academic_offering_id: '' });
      setShowCreate(false);
    } finally { setCreating(false); }
  }

  // ── Edit ──────────────────────────────────────────────────────────────────

  async function saveEdit() {
    if (!editingForm || !editingForm.title.trim() || !editingForm.body.trim()) return;
    setSavingEdit(true); setEditError('');
    try {
      const res = await fetch(`/api/consent-forms/${editingForm.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: editingForm.title,
          body: editingForm.body,
          due_date: editingForm.due_date || null,
        }),
      });
      const json = await res.json();
      if (!res.ok) { setEditError(json.error || 'Failed to update'); return; }
      setForms(prev => prev.map(f => f.id === editingForm.id ? { ...f, title: json.data.title, body: json.data.body, due_date: json.data.due_date } : f));
      setEditingForm(null);
    } catch {
      setEditError('Network error');
    } finally {
      setSavingEdit(false);
    }
  }

  // ── Sign ──────────────────────────────────────────────────────────────────

  function openReadModal(id: string) {
    setReadModalId(id);
    setRegStep('read');
    setRegData({
      child_name: '', child_age: '', child_class: '', program_category: '',
      parent_name: (profile as any)?.full_name ?? '',
      parent_whatsapp: (profile as any)?.phone ?? '',
      parent_email: (profile as any)?.email ?? '',
      consent_acknowledged: false,
    });
  }

  async function signForm(id: string) {
    setSigningId(id);
    let completed = false;
    try {
      const res = await fetch(`/api/consent-forms/${id}/sign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ response_data: regData }),
      });
      const json = await res.json().catch(() => ({}));
      if (res.ok) {
        setForms(prev => prev.map(f => f.id === id ? { ...f, has_signed: true } : f));
        completed = true;
      } else if (res.status === 409) {
        setForms(prev => prev.map(f => f.id === id ? { ...f, has_signed: true } : f));
        alert('You already signed this consent form.');
        completed = true;
      } else {
        alert(json.error ?? 'Could not submit the consent form. Please try again.');
      }
    } catch {
      alert('Network error while submitting consent. Please try again.');
    } finally {
      setSigningId(null);
      if (completed) setReadModalId(null);
    }
  }

  // ── Signatories + leads ───────────────────────────────────────────────────

  async function loadSignatories(id: string) {
    setLoadingSigs(id);
    try {
      const res = await fetch(`/api/consent-forms/${id}`);
      const json = await res.json();
      setSignatories(prev => ({ ...prev, [id]: json.data ?? [] }));
      setLeads(prev => ({ ...prev, [id]: json.leads ?? [] }));
      setExpandedId(id);
    } finally { setLoadingSigs(null); }
  }

  function toggleSignatories(id: string) {
    if (expandedId === id) { setExpandedId(null); return; }
    loadSignatories(id);
  }

  // ── Delete ────────────────────────────────────────────────────────────────

  async function deleteForm(id: string) {
    setDeletingId(id);
    try {
      const res = await fetch(`/api/consent-forms/${id}`, { method: 'DELETE' });
      if (res.ok) setForms(prev => prev.filter(f => f.id !== id));
    } finally {
      setDeletingId(null);
      setConfirmDeleteId(null);
    }
  }

  // ── Toggle public ─────────────────────────────────────────────────────────

  async function togglePublic(id: string, current: boolean) {
    setTogglingPublicId(id);
    try {
      const res = await fetch(`/api/consent-forms/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_public: !current }),
      });
      const json = await res.json();
      if (res.ok) {
        setForms(prev => prev.map(f => f.id === id ? { ...f, is_public: json.data.is_public } : f));
      }
    } finally { setTogglingPublicId(null); }
  }

  // ── Copy public link ──────────────────────────────────────────────────────

  async function copyLink(id: string) {
    const url = `${appBase}/forms/${id}`;
    await navigator.clipboard.writeText(url).catch(() => { });
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  }

  // ── Clone form ────────────────────────────────────────────────────────────

  async function openCloneModal(form: ConsentForm) {
    setCloneModalForm(form);
    setCloneTargetOfferingId('');
    setCloneTargetSchoolId('');
    setCloneError('');
    setCloneSchoolsLoading(true);
    try {
      const res = await fetch('/api/teacher-schools');
      const json = await res.json();
      setCloneSchools(json.data ?? []);
    } finally {
      setCloneSchoolsLoading(false);
    }
  }

  async function cloneForm() {
    if (!cloneModalForm || !cloneTargetSchoolId) return;
    setCloningId(cloneModalForm.id);
    setCloneError('');
    try {
      const res = await fetch(`/api/consent-forms/${cloneModalForm.id}/clone`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target_school_id: cloneTargetSchoolId, target_academic_offering_id: cloneTargetOfferingId || null }),
      });
      const json = await res.json();
      if (!res.ok) {
        setCloneError(json.error ?? 'Failed to copy form');
        return;
      }
      if (!json.data) return;
      setForms(prev => [{ ...json.data, has_signed: false, consent_responses: [{ count: 0 }], form_leads: [{ count: 0 }] }, ...prev]);
      setCloneModalForm(null);
    } finally {
      setCloningId(null);
    }
  }

  // ── Strip "(Copy)" from form titles ──────────────────────────────────────

  async function stripCopySuffix() {
    setStrippingCopy(true); setStripResult('');
    try {
      const res = await fetch('/api/consent-forms/strip-copy-suffix', { method: 'POST' });
      const json = await res.json();
      if (!res.ok) { setStripResult(json.error || 'Failed'); return; }
      setStripResult(json.message || 'Done');
      if (json.updated > 0) loadForms();
    } catch { setStripResult('Request failed'); } finally { setStrippingCopy(false); }
  }

  // ── Lead match review ─────────────────────────────────────────────────────

  async function reviewLead(formId: string, leadId: string, action: 'approve' | 'reject') {
    setReviewingLeadId(leadId);
    try {
      const res = await fetch(`/api/consent-forms/leads/${leadId}/review`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      if (!res.ok) return;
      const json = await res.json();
      setLeads(prev => ({
        ...prev,
        [formId]: (prev[formId] ?? []).map(l =>
          l.id === leadId
            ? {
                ...l,
                match_status:       json.status,
                matched_student_id: json.matched_student_id ?? l.matched_student_id,
                matched_parent_id:  json.matched_parent_id  ?? l.matched_parent_id,
                ...(action === 'reject' ? { match_candidate: null } : {}),
              }
            : l,
        ),
      }));
    } finally {
      setReviewingLeadId(null);
    }
  }

  // ── Lead status ───────────────────────────────────────────────────────────

  async function updateLeadStatus(formId: string, leadId: string, status: FormLead['status']) {
    setUpdatingLeadId(leadId);
    try {
      const res = await fetch(`/api/consent-forms/leads/${leadId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) return;
      setLeads(prev => ({
        ...prev,
        [formId]: (prev[formId] ?? []).map(l => l.id === leadId ? { ...l, status } : l),
      }));
    } finally {
      setUpdatingLeadId(null);
    }
  }

  // ── Data sheet (always fetches fresh data) ────────────────────────────────

  async function handlePrintDataSheet(formId: string, form: ConsentForm) {
    const res = await fetch(`/api/consent-forms/${formId}`);
    if (!res.ok) return;
    const json = await res.json();
    const freshLeads: FormLead[]   = json.leads ?? [];
    const freshSigs: Signatory[]   = json.data  ?? [];
    printDataSheet(form, freshLeads, freshSigs, appBase);
  }

  // ── CSV export ────────────────────────────────────────────────────────────

  async function exportCSV(id: string, title: string) {
    const res = await fetch(`/api/consent-forms/${id}/sign`);
    if (!res.ok) return;
    const blob = await res.blob();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${title.replace(/[^a-z0-9]/gi, '_')}-responses.csv`;
    a.click();
  }

  // ── Branded QR download ───────────────────────────────────────────────────

  async function downloadBrandedQr(form: ConsentForm) {
    const publicUrl = `${appBase}/forms/${form.id}`;
    setDownloadingQr(true);
    try {
      await downloadQrCard(
        publicUrl,
        form.schools?.name ?? 'Rillcod Technologies',
        form.title,
        `qr-${form.title.replace(/[^a-z0-9]/gi, '-').toLowerCase()}.png`,
      );
    } catch { /* non-fatal */ } finally {
      setDownloadingQr(false);
    }
  }

  // ── Derived ───────────────────────────────────────────────────────────────

  const readModal = forms.find(f => f.id === readModalId);
  const qrForm = forms.find(f => f.id === qrFormId);
  const totalResponses = forms.reduce((s, f) => s + (f.consent_responses?.[0]?.count ?? 0) + (f.form_leads?.[0]?.count ?? 0), 0);
  const signedCount = forms.filter(f => f.has_signed).length;

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-background text-foreground mobile-page-root">
      <div className={`max-w-3xl mx-auto px-3 sm:px-4 py-6 sm:py-8 space-y-5 sm:space-y-6 ${MOBILE_PAGE_BOTTOM}`}>

        <MobilePageHero
          badge="Digital consent"
          title="Consent forms"
          description={
            isStaff ? 'Create, share, and manage consent forms for parents.' : 'Sign consent forms from your school.'
          }
          icon={ClipboardDocumentCheckIcon}
          stats={
            !loading && forms.length > 0
              ? [
                  { label: 'Forms', value: forms.length },
                  { label: 'Responses', value: totalResponses, tone: 'primary' },
                  ...(isStaff
                    ? [{ label: 'Pending', value: forms.length - signedCount }]
                    : [{ label: 'Signed', value: signedCount, tone: 'emerald' as const }]),
                ]
              : undefined
          }
          actions={
            <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:justify-end">
              <button
                type="button"
                onClick={loadForms}
                className={`${MOBILE_TOUCH_BTN} border border-border bg-background text-muted-foreground`}
                title="Refresh"
              >
                <ArrowPathIcon className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              </button>
              {isAdmin && (
                <button
                  type="button"
                  onClick={stripCopySuffix}
                  disabled={strippingCopy}
                  title='Remove "(Copy)" suffix from all form titles'
                  className={`${MOBILE_TOUCH_BTN} hidden sm:inline-flex border border-amber-500/30 bg-amber-500/5 text-amber-600 dark:text-amber-400 disabled:opacity-50`}
                >
                  {strippingCopy ? <ArrowPathIcon className="w-3.5 h-3.5 animate-spin" /> : '✂'}
                  <span>{strippingCopy ? 'Cleaning…' : 'Clean titles'}</span>
                </button>
              )}
              {isStaff && (
                <button
                  type="button"
                  onClick={() => setShowCreate(true)}
                  className={`${MOBILE_TOUCH_BTN} bg-primary text-primary-foreground`}
                >
                  <PlusIcon className="w-4 h-4" /> New form
                </button>
              )}
            </div>
          }
        />
        {stripResult && (
          <p className="w-full text-[11px] font-bold text-amber-600 dark:text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-xl px-3 py-2">
            {stripResult}{' '}
            <button type="button" onClick={() => setStripResult('')} className="ml-2 text-muted-foreground hover:text-foreground">
              ×
            </button>
          </p>
        )}

        {/* Stats — desktop detail row; hero shows summary on all sizes */}
        {!loading && forms.length > 0 && (
          <div className="hidden sm:grid grid-cols-3 gap-3">
            {(isStaff ? [
              { label: 'Forms', value: forms.length },
              { label: 'Responses', value: totalResponses },
              { label: 'Overdue', value: forms.filter(f => f.due_date && new Date(f.due_date) < new Date()).length },
            ] : [
              { label: 'Forms', value: forms.length },
              { label: 'Signed', value: signedCount },
              { label: 'Pending', value: forms.length - signedCount },
            ]).map(s => (
              <div key={s.label} className="bg-card border border-border/50 rounded-xl p-4 text-center">
                <p className="text-2xl font-black text-foreground">{s.value}</p>
                <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mt-0.5">{s.label}</p>
              </div>
            ))}
          </div>
        )}

        {/* ── Create modal ─────────────────────────────────────────────── */}
        <AnimatePresence>
          {showCreate && (
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-foreground/35 backdrop-blur-sm p-0 sm:p-4"
              onClick={e => { if (e.target === e.currentTarget) setShowCreate(false); }}
            >
              <motion.div
                initial={{ scale: 0.98, opacity: 0, y: 16 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.98, opacity: 0, y: 16 }}
                className="bg-card border border-border rounded-t-2xl sm:rounded-2xl w-full max-w-lg p-4 sm:p-6 space-y-4 shadow-2xl max-h-[92vh] overflow-y-auto"
              >
                <div className="flex items-center justify-between">
                  <h2 className="font-black text-lg">New Consent Form</h2>
                  <button onClick={() => setShowCreate(false)} className="p-1 rounded-lg hover:bg-muted transition-colors">
                    <XMarkIcon className="w-5 h-5 text-muted-foreground" />
                  </button>
                </div>

                {/* Template picker */}
                <div className="space-y-2">
                  <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">Quick Templates</p>
                  {TEMPLATES.map(t => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setNewForm(f => ({ ...f, title: t.title, body: t.body, form_type: t.form_type }))}
                      className={`w-full flex items-center gap-3 px-4 py-3 border rounded-xl text-sm font-bold transition-colors text-left ${newForm.form_type === t.form_type && newForm.title === t.title
                          ? 'border-primary bg-primary/10 text-foreground'
                          : 'border-dashed border-border/60 hover:bg-muted/50 text-muted-foreground'
                        }`}
                    >
                      <span className="text-lg">{t.icon}</span>
                      <div>
                        <p className="text-foreground font-black text-xs">{t.label}</p>
                        <p className="text-[10px] text-muted-foreground mt-0.5">
                          {t.form_type === 'registration' ? 'Standard consent + child registration' : 'Assessment questions + follow-up'}
                        </p>
                      </div>
                      <DocumentTextIcon className="w-4 h-4 ml-auto shrink-0 text-primary" />
                    </button>
                  ))}
                </div>

                <div className="space-y-4">
                  <div>
                    <label className="text-xs font-black text-muted-foreground uppercase tracking-widest block mb-1.5">Title *</label>
                    <input
                      value={newForm.title}
                      onChange={e => setNewForm(f => ({ ...f, title: e.target.value }))}
                      placeholder="e.g. Field Trip Permission"
                      className="w-full bg-background border border-border text-foreground px-4 py-2.5 rounded-xl text-sm focus:outline-none focus:border-primary transition-colors"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-black text-muted-foreground uppercase tracking-widest block mb-1.5">Body / Consent Statement *</label>
                    <textarea
                      value={newForm.body}
                      onChange={e => setNewForm(f => ({ ...f, body: e.target.value }))}
                      placeholder="Describe the activity and what parents are consenting to…"
                      rows={6}
                      className="w-full bg-background border border-border text-foreground px-4 py-2.5 rounded-xl text-sm focus:outline-none focus:border-primary resize-none transition-colors"
                    />
                    <p className="text-[10px] text-muted-foreground mt-1">{newForm.body.length} characters</p>
                  </div>
                  <div>
                    <label className="text-xs font-black text-muted-foreground uppercase tracking-widest block mb-1.5">Response Deadline</label>
                    <input
                      type="date" value={newForm.due_date}
                      onChange={e => setNewForm(f => ({ ...f, due_date: e.target.value }))}
                      className="w-full bg-background border border-border text-foreground px-4 py-2.5 rounded-xl text-sm focus:outline-none focus:border-primary transition-colors"
                    />
                  </div>
                  {profile?.role === 'admin' && schools.length > 0 && (
                    <div>
                      <label className="text-xs font-black text-muted-foreground uppercase tracking-widest block mb-1.5">School</label>
                      <select
                        value={newForm.school_id}
                        onChange={e => setNewForm(f => ({ ...f, school_id: e.target.value, class_id: '', academic_offering_id: '' }))}
                        className="w-full bg-background border border-border text-foreground px-4 py-2.5 rounded-xl text-sm focus:outline-none focus:border-primary transition-colors"
                      >
                        <option value="">— Select registered school —</option>
                        {schools.map(s => (
                          <option key={s.id} value={s.id}>{s.name}</option>
                        ))}
                      </select>
                    </div>
                  )}
                  <ClassPathwayPicker
                    enrollmentType={newForm.enrollment_type}
                    offeringId={newForm.academic_offering_id}
                    programmeId=""
                    schoolId={newForm.school_id || profile?.school_id || ''}
                    pathways={pathways}
                    inputClass="w-full bg-background border border-border text-foreground px-4 py-2.5 rounded-xl text-sm focus:outline-none focus:border-primary transition-colors"
                    onChange={({ enrollmentType, offeringId }) => setNewForm(f => ({
                      ...f,
                      enrollment_type: enrollmentType,
                      academic_offering_id: offeringId,
                      class_id: '',
                    }))}
                  />
                  <div className="rounded-xl border border-primary/20 bg-primary/5 p-3 text-xs leading-relaxed text-muted-foreground">
                    <strong className="text-foreground">Placement source:</strong> school and section come from these registered selections. A parent&apos;s typed class or grade is retained for review and cannot overwrite the official section.
                  </div>                  <div>
                    <label className="text-xs font-black text-muted-foreground uppercase tracking-widest block mb-1.5">
                      Class <span className="normal-case font-normal text-muted-foreground/70">(optional — official destination section)</span>
                    </label>
                    <select
                      value={newForm.class_id}
                      onChange={e => setNewForm(f => ({ ...f, class_id: e.target.value }))}
                      disabled={classes.length === 0}
                      className="w-full bg-background border border-border text-foreground px-4 py-2.5 rounded-xl text-sm focus:outline-none focus:border-primary transition-colors disabled:opacity-50"
                    >
                      <option value="">{classes.length === 0 ? '— No registered classes for this school —' : '— Leave unassigned for staff review —'}</option>
                      {classes.filter(c => {
                        if (newForm.academic_offering_id) return c.academic_offering_id === newForm.academic_offering_id;
                        if (newForm.enrollment_type !== 'school') return false;
                        if (!c.academic_offering_id) return true;
                        return pathways.some(p => p.id === c.academic_offering_id && p.enrollment_type === 'school');
                      }).map(c => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {createError && (
                  <p className="text-rose-600 dark:text-rose-400 text-xs flex items-center gap-1.5">
                    <ExclamationTriangleIcon className="w-3.5 h-3.5" /> {createError}
                  </p>
                )}

                <div className="flex gap-3 pt-1">
                  <button onClick={() => setShowCreate(false)} className="flex-1 py-2.5 border border-border text-muted-foreground font-bold rounded-xl hover:bg-muted text-sm transition-colors">
                    Cancel
                  </button>
                  <button
                    onClick={createForm}
                    disabled={!newForm.title.trim() || !newForm.body.trim() || (profile?.role === 'admin' && !newForm.school_id) || (newForm.enrollment_type !== 'school' && !newForm.academic_offering_id) || creating}
                    className="flex-1 py-2.5 bg-primary text-primary-foreground disabled:opacity-40 font-bold rounded-xl text-sm hover:opacity-90 transition-all"
                  >
                    {creating ? 'Publishing…' : 'Publish Form'}
                  </button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Edit modal ─────────────────────────────────────────────── */}
        <AnimatePresence>
          {editingForm && (
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/35 backdrop-blur-sm p-4"
              onClick={e => { if (e.target === e.currentTarget) setEditingForm(null); }}
            >
              <motion.div
                initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
                className="bg-card border border-border rounded-2xl w-full max-w-lg p-6 space-y-4 shadow-2xl max-h-[90vh] overflow-y-auto"
              >
                <div className="flex items-center justify-between">
                  <h2 className="font-black text-lg">Edit Form</h2>
                  <button onClick={() => setEditingForm(null)} className="p-1 rounded-lg hover:bg-muted transition-colors">
                    <XMarkIcon className="w-5 h-5 text-muted-foreground" />
                  </button>
                </div>

                <div className="space-y-4">
                  <div>
                    <label className="text-xs font-black text-muted-foreground uppercase tracking-widest block mb-1.5">Title *</label>
                    <input
                      value={editingForm.title}
                      onChange={e => setEditingForm(f => f ? ({ ...f, title: e.target.value }) : null)}
                      className="w-full bg-background border border-border text-foreground px-4 py-2.5 rounded-xl text-sm focus:outline-none focus:border-primary transition-colors"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-black text-muted-foreground uppercase tracking-widest block mb-1.5">Body / Consent Statement *</label>
                    <textarea
                      value={editingForm.body}
                      onChange={e => setEditingForm(f => f ? ({ ...f, body: e.target.value }) : null)}
                      rows={6}
                      className="w-full bg-background border border-border text-foreground px-4 py-2.5 rounded-xl text-sm focus:outline-none focus:border-primary resize-none transition-colors"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-black text-muted-foreground uppercase tracking-widest block mb-1.5">Response Deadline</label>
                    <input
                      type="date" value={editingForm.due_date ? editingForm.due_date.split('T')[0] : ''}
                      onChange={e => setEditingForm(f => f ? ({ ...f, due_date: e.target.value }) : null)}
                      className="w-full bg-background border border-border text-foreground px-4 py-2.5 rounded-xl text-sm focus:outline-none focus:border-primary transition-colors"
                    />
                  </div>
                </div>

                {editError && (
                  <p className="text-rose-600 dark:text-rose-400 text-xs flex items-center gap-1.5">
                    <ExclamationTriangleIcon className="w-3.5 h-3.5" /> {editError}
                  </p>
                )}

                <div className="flex gap-3 pt-1">
                  <button onClick={() => setEditingForm(null)} className="flex-1 py-2.5 border border-border text-muted-foreground font-bold rounded-xl hover:bg-muted text-sm transition-colors">
                    Cancel
                  </button>
                  <button
                    onClick={saveEdit}
                    disabled={!editingForm.title.trim() || !editingForm.body.trim() || savingEdit}
                    className="flex-1 py-2.5 bg-primary text-primary-foreground disabled:opacity-40 font-bold rounded-xl text-sm hover:opacity-90 transition-all"
                  >
                    {savingEdit ? 'Saving…' : 'Save Changes'}
                  </button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Read / Sign modal ─────────────────────────────────────────── */}
        <AnimatePresence>
          {readModal && (
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-foreground/35 backdrop-blur-sm p-0 sm:p-4"
              onClick={e => { if (e.target === e.currentTarget) setReadModalId(null); }}
            >
              <motion.div
                initial={{ scale: 0.98, opacity: 0, y: 16 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.98, opacity: 0, y: 16 }}
                className="bg-card border border-border rounded-t-2xl sm:rounded-2xl w-full max-w-lg shadow-2xl max-h-[92vh] flex flex-col"
              >
                <div className="flex items-center justify-between px-4 sm:px-6 py-3 sm:py-4 border-b border-border/50 shrink-0 gap-3">
                  <div className="min-w-0">
                    <p className="text-[10px] font-black text-primary uppercase tracking-widest">
                      {regStep === 'read' ? 'Consent Form' : 'Student Registration'}
                    </p>
                    <h2 className="font-black text-base break-words leading-snug">{readModal.title}</h2>
                  </div>
                  <button onClick={() => setReadModalId(null)} className="p-2 min-h-11 min-w-11 rounded-lg hover:bg-muted transition-colors shrink-0">
                    <XMarkIcon className="w-5 h-5 text-muted-foreground" />
                  </button>
                </div>

                <AnimatePresence mode="wait">
                  {regStep === 'read' ? (
                    <motion.div key="read" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex flex-col flex-1 overflow-hidden">
                      <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-4 sm:py-5">
                        <p className="text-sm text-foreground/90 leading-relaxed whitespace-pre-wrap break-words [overflow-wrap:anywhere]">{readModal.body}</p>
                      </div>
                      <div className="px-4 sm:px-6 py-4 border-t border-border/50 space-y-3 shrink-0 pb-[max(1rem,env(safe-area-inset-bottom))]">
                        {readModal.due_date && (
                          <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                            <CalendarIcon className="w-3.5 h-3.5" />
                            Deadline: <strong>{new Date(readModal.due_date).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</strong>
                          </p>
                        )}
                        {isParent && !readModal.has_signed && (
                          <button onClick={() => setRegStep('fill')} className="w-full py-3 bg-primary hover:opacity-90 text-primary-foreground font-black rounded-xl transition-colors">
                            I have read this — Continue to Registration →
                          </button>
                        )}
                        {isParent && readModal.has_signed && (
                          <div className="w-full py-3 bg-emerald-600/15 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 font-black rounded-xl text-center text-sm">
                            ✓ You have already signed this form
                          </div>
                        )}
                      </div>
                    </motion.div>
                  ) : (
                    <motion.div key="fill" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex flex-col flex-1 overflow-hidden">
                      <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-4 sm:py-5 space-y-5">
                        <div>
                          <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest mb-3">Child's Information</p>
                          <div className="space-y-3">
                            <input value={regData.child_name} onChange={e => setRegData(d => ({ ...d, child_name: e.target.value }))} placeholder="Child's full name *" className="w-full bg-background border border-border text-foreground px-4 py-3.5 sm:py-2.5 rounded-xl text-base sm:text-sm focus:outline-none focus:border-primary transition-colors" />
                            <div className="grid grid-cols-2 gap-3">
                              <input value={regData.child_age} onChange={e => setRegData(d => ({ ...d, child_age: e.target.value }))} placeholder="Age *" type="number" min="4" max="19" className="w-full bg-background border border-border text-foreground px-4 py-3.5 sm:py-2.5 rounded-xl text-base sm:text-sm focus:outline-none focus:border-primary transition-colors" />
                              <input value={regData.child_class} onChange={e => setRegData(d => ({ ...d, child_class: e.target.value }))} placeholder="Class / Grade *" className="w-full bg-background border border-border text-foreground px-4 py-3.5 sm:py-2.5 rounded-xl text-base sm:text-sm focus:outline-none focus:border-primary transition-colors" />
                            </div>
                          </div>
                        </div>
                        <div>
                          <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest mb-3">Programme *</p>
                          <div className="space-y-2">
                            {([
                              { value: 'young_innovators', label: 'Young Innovators :: PRY', sub: 'Ages 5–10 · Fun & games' },
                              { value: 'teen_developers',  label: 'Teen Developers :: SEC',  sub: 'Ages 11–19 · Advanced coding' },
                            ] as const).map(opt => (
                              <button key={opt.value} type="button" onClick={() => setRegData(d => ({ ...d, program_category: opt.value }))}
                                className={`w-full text-left px-4 py-3 rounded-xl border transition-colors ${regData.program_category === opt.value ? 'border-primary bg-primary/10 text-foreground' : 'border-border bg-background text-muted-foreground hover:border-border/80'}`}>
                                <p className="font-black text-sm">{opt.label}</p>
                                <p className="text-xs mt-0.5 opacity-70">{opt.sub}</p>
                              </button>
                            ))}
                          </div>
                        </div>
                        <div>
                          <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest mb-3">Parent / Guardian</p>
                          <div className="space-y-3">
                            <input value={regData.parent_name} onChange={e => setRegData(d => ({ ...d, parent_name: e.target.value }))} placeholder="Your full name *" className="w-full bg-background border border-border text-foreground px-4 py-2.5 rounded-xl text-sm focus:outline-none focus:border-primary transition-colors" />
                            <input value={regData.parent_whatsapp} onChange={e => setRegData(d => ({ ...d, parent_whatsapp: e.target.value }))} placeholder="WhatsApp / contact number *" className="w-full bg-background border border-border text-foreground px-4 py-2.5 rounded-xl text-sm focus:outline-none focus:border-primary transition-colors" />
                            <input value={regData.parent_email} onChange={e => setRegData(d => ({ ...d, parent_email: e.target.value }))} placeholder="Email (optional)" type="email" className="w-full bg-background border border-border text-foreground px-4 py-2.5 rounded-xl text-sm focus:outline-none focus:border-primary transition-colors" />
                          </div>
                        </div>
                      </div>
                      <div className="px-6 py-4 border-t border-border/50 space-y-2 shrink-0">
                        <div className="bg-background border border-border rounded-xl p-4 mt-2">
                          <p className="text-[10px] font-black text-primary uppercase tracking-widest mb-2">Consent Statement</p>
                          <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap">
                            {readModal.body.replace(/_+(\s*\(parent\/guardian name\))?/gi, regData.parent_name ? ` ${regData.parent_name} ` : ' _____________ ')}
                          </p>
                          <label className="flex items-start gap-3 pt-4 mt-4 border-t border-border/50 cursor-pointer group">
                            <div className="pt-0.5">
                              <input
                                type="checkbox"
                                required
                                checked={regData.consent_acknowledged}
                                onChange={e => setRegData(d => ({ ...d, consent_acknowledged: e.target.checked }))}
                                className="w-4 h-4 rounded border-border bg-background text-primary focus:ring-primary/20 focus:ring-offset-0 cursor-pointer"
                              />
                            </div>
                            <span className="text-xs text-muted-foreground font-bold group-hover:text-foreground transition-colors">
                              I confirm that the information provided is accurate and I acknowledge and agree to the consent statement above.
                            </span>
                          </label>
                        </div>
                        <div className="flex gap-3 pt-2">
                          <button onClick={() => setRegStep('read')} className="px-4 py-2.5 border border-border text-muted-foreground font-bold rounded-xl hover:bg-muted text-sm transition-colors">← Back</button>
                          <button
                            onClick={() => signForm(readModal.id)}
                            disabled={signingId === readModal.id || !regData.child_name.trim() || !regData.child_age || !regData.child_class.trim() || !regData.program_category || !regData.parent_name.trim() || !regData.parent_whatsapp.trim() || !regData.consent_acknowledged}
                            className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white font-black rounded-xl text-sm transition-colors"
                          >
                            {signingId === readModal.id ? 'Submitting…' : '✅ Submit Registration & Sign'}
                          </button>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── QR Code modal ─────────────────────────────────────────────── */}
        <AnimatePresence>
          {qrForm && (
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/35 backdrop-blur-sm p-4"
              onClick={e => { if (e.target === e.currentTarget) setQrFormId(null); }}
            >
              <motion.div
                initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
                className="bg-card border border-border rounded-2xl w-full max-w-sm shadow-2xl overflow-hidden"
              >
                {/* Header */}
                <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-border/50">
                  <div>
                    <p className="text-[10px] font-black text-primary uppercase tracking-widest">QR Code</p>
                    <h2 className="font-black text-base leading-tight mt-0.5">{qrForm.title}</h2>
                    {qrForm.schools?.name && (
                      <p className="text-[10px] text-amber-600 dark:text-amber-400 font-bold mt-0.5">{qrForm.schools.name}</p>
                    )}
                  </div>
                  <button onClick={() => setQrFormId(null)} className="p-1 rounded-lg hover:bg-muted transition-colors ml-3 shrink-0">
                    <XMarkIcon className="w-5 h-5 text-muted-foreground" />
                  </button>
                </div>

                {/* Preview of the branded card */}
                <div className="p-5 flex flex-col items-center gap-4">
                  <div className="w-full rounded-2xl overflow-hidden" style={{ background: '#09090b' }}>
                    {/* Accent bar */}
                    <div style={{ height: '3px', background: 'linear-gradient(90deg, #f5a623, #fcd34d 60%, transparent)' }} />
                    <div className="p-5 flex flex-col items-center gap-3">
                      <div className="self-start">
                        <p style={{ color: '#f5a623', fontSize: '9px', fontWeight: 900, letterSpacing: '3px', textTransform: 'uppercase', margin: 0 }}>
                          {qrForm.schools?.name ?? 'Rillcod Technologies'}
                        </p>
                        <p style={{ color: '#ffffff', fontSize: '18px', fontWeight: 900, lineHeight: 1.1, margin: '4px 0 0', letterSpacing: '-0.5px' }}>
                          SCAN TO<br />REGISTER
                        </p>
                      </div>
                      <div ref={qrSvgWrapperRef} style={{ background: '#ffffff', borderRadius: '14px', padding: '14px', boxShadow: '0 0 0 1px rgba(245,166,35,0.25), 0 8px 24px rgba(0,0,0,0.6)' }}>
                        <HdQrCode value={`${appBase}/forms/${qrForm.id}`} size={HD_QR_DISPLAY_PX} />
                      </div>
                      <div className="self-start">
                        <p style={{ color: '#e4e4e7', fontSize: '11px', fontWeight: 700, margin: 0, lineHeight: 1.3 }}>{qrForm.title}</p>
                        <p style={{ color: '#52525b', fontSize: '9px', margin: '3px 0 0' }}>Point your camera at this code to open</p>
                      </div>
                      <div style={{ width: '100%', height: '1px', background: 'rgba(255,255,255,0.07)', margin: '2px 0' }} />
                      <div style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <p style={{ color: '#71717a', fontSize: '9px', fontWeight: 700, margin: 0 }}>via Rillcod Technologies</p>
                        <p style={{ color: '#52525b', fontSize: '9px', margin: 0 }}>rillcod.com</p>
                      </div>
                    </div>
                    <div style={{ height: '2px', background: 'linear-gradient(90deg, transparent, #f5a623 50%, transparent)' }} />
                  </div>

                  {/* URL + copy */}
                  <div className="w-full bg-muted/50 rounded-xl px-3 py-2 flex items-center gap-2">
                    <p className="text-[10px] text-muted-foreground truncate flex-1 font-mono">{appBase}/forms/{qrForm.id}</p>
                    <button
                      onClick={() => copyLink(qrForm.id)}
                      className="shrink-0 text-[10px] font-black text-primary hover:opacity-80 transition-opacity"
                    >
                      {copiedId === qrForm.id ? '✓ Copied' : 'Copy'}
                    </button>
                  </div>

                  {/* Action buttons */}
                  <div className="w-full flex gap-2">
                    <button
                      onClick={() => downloadBrandedQr(qrForm)}
                      disabled={downloadingQr}
                      className="flex-1 flex items-center justify-center gap-1.5 py-2.5 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-black font-black text-xs rounded-xl transition-colors"
                    >
                      <ArrowDownTrayIcon className="w-3.5 h-3.5" />
                      {downloadingQr ? 'Generating…' : 'Download PNG'}
                    </button>
                    <a
                      href={`${appBase}/forms/${qrForm.id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1.5 px-3 py-2.5 bg-muted hover:bg-muted/80 text-muted-foreground font-bold text-xs rounded-xl transition-colors"
                    >
                      <ArrowTopRightOnSquareIcon className="w-3.5 h-3.5" />
                      Open
                    </a>
                  </div>

                  <p className="text-[10px] text-muted-foreground text-center">
                    Print on flyers, share on WhatsApp or social media.
                  </p>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Delete confirmation ───────────────────────────────────────── */}
        <AnimatePresence>
          {confirmDeleteId && (
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/35 backdrop-blur-sm p-4"
            >
              <motion.div
                initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
                className="bg-card border border-rose-500/30 rounded-2xl w-full max-w-sm p-6 space-y-4 shadow-2xl"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-rose-500/15 flex items-center justify-center shrink-0">
                    <TrashIcon className="w-5 h-5 text-rose-600 dark:text-rose-400" />
                  </div>
                  <div>
                    <h3 className="font-black">Delete Form?</h3>
                    <p className="text-sm text-muted-foreground mt-0.5">Deletes all responses and leads. Cannot be undone.</p>
                  </div>
                </div>
                <div className="flex gap-3">
                  <button onClick={() => setConfirmDeleteId(null)} className="flex-1 py-2.5 border border-border text-muted-foreground font-bold rounded-xl text-sm hover:bg-muted transition-colors">Cancel</button>
                  <button
                    onClick={() => deleteForm(confirmDeleteId)}
                    disabled={deletingId === confirmDeleteId}
                    className="flex-1 py-2.5 bg-destructive hover:bg-destructive/90 disabled:opacity-50 text-destructive-foreground font-black rounded-xl text-sm transition-colors"
                  >
                    {deletingId === confirmDeleteId ? 'Deleting…' : 'Delete'}
                  </button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Copy-to-school modal ─────────────────────────────────────── */}
        <AnimatePresence>
          {cloneModalForm && (
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/35 backdrop-blur-sm p-4"
              onClick={e => { if (e.target === e.currentTarget) setCloneModalForm(null); }}
            >
              <motion.div
                initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
                className="bg-card border border-primary/20 rounded-2xl w-full max-w-sm p-6 space-y-5 shadow-2xl"
              >
                <div>
                  <h3 className="font-black text-base">Copy Form to School</h3>
                  <p className="text-xs text-muted-foreground mt-1 line-clamp-1">{cloneModalForm.title}</p>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Target School</label>
                  {cloneSchoolsLoading ? (
                    <div className="flex items-center gap-2 text-xs text-muted-foreground py-2">
                      <div className="w-3.5 h-3.5 border-2 border-primary border-t-transparent rounded-full animate-spin" /> Loading schools…
                    </div>
                  ) : cloneSchools.length === 0 ? (
                    <p className="text-xs text-muted-foreground py-2">No assigned schools found.</p>
                  ) : (
                    <select
                      value={cloneTargetSchoolId}
                      onChange={e => { setCloneTargetSchoolId(e.target.value); setCloneTargetOfferingId(''); setCloneError(''); }}
                      className="w-full bg-muted border border-border rounded-xl px-3 py-2.5 text-sm font-semibold text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
                    >
                      <option value="">— Select a school —</option>
                      {cloneSchools.map(s => (
                        <option key={s.id} value={s.id}>{s.name}</option>
                      ))}
                    </select>
                  )}
                </div>

                {cloneModalForm.enrollment_type !== 'school' && (
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Target Academic Pathway</label>
                    <select
                      value={cloneTargetOfferingId}
                      onChange={e => { setCloneTargetOfferingId(e.target.value); setCloneError(''); }}
                      disabled={!cloneTargetSchoolId}
                      className="w-full bg-muted border border-border rounded-xl px-3 py-2.5 text-sm font-semibold text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 disabled:opacity-50"
                    >
                      <option value="">Select the matching pathway</option>
                      {pathways.filter(p => p.enrollment_type === cloneModalForm.enrollment_type
                        && (!p.school_id || p.school_id === cloneTargetSchoolId)).map(p => (
                        <option key={p.id} value={p.id}>{p.title}</option>
                      ))}
                    </select>
                    <p className="text-[10px] text-muted-foreground">Online and Special forms must be connected to the target school's exact pathway.</p>
                  </div>
                )}

                {cloneError && (
                  <p className="text-xs font-bold text-rose-600 dark:text-rose-400 bg-rose-500/10 border border-rose-500/20 rounded-xl px-3 py-2">{cloneError}</p>
                )}

                <div className="flex gap-3 pt-1">
                  <button
                    onClick={() => setCloneModalForm(null)}
                    className="flex-1 py-2.5 border border-border text-muted-foreground font-bold rounded-xl text-sm hover:bg-muted transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={cloneForm}
                    disabled={!cloneTargetSchoolId || (cloneModalForm.enrollment_type !== 'school' && !cloneTargetOfferingId) || cloningId === cloneModalForm.id}
                    className="flex-1 py-2.5 bg-primary hover:bg-primary/90 disabled:opacity-40 text-primary-foreground font-black rounded-xl text-sm transition-colors"
                  >
                    {cloningId === cloneModalForm.id ? 'Copying…' : '⧉ Copy Form'}
                  </button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Forms list ────────────────────────────────────────────────── */}
        {loading ? (
          <div className="flex justify-center py-20">
            <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : forms.length === 0 ? (
          <div className="text-center py-20 bg-card border border-border rounded-2xl">
            <ClipboardDocumentCheckIcon className="w-12 h-12 mx-auto text-muted-foreground/30 mb-3" />
            <p className="font-bold text-foreground">No consent forms yet</p>
            <p className="text-muted-foreground text-sm mt-1">
              {isStaff ? 'Create your first form and share it publicly or with parents.' : 'No forms from your school yet.'}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {forms.map(cf => {
              const responseCount = cf.consent_responses?.[0]?.count ?? 0;
              const initialLeadCount = cf.form_leads?.[0]?.count ?? 0;
              const badge = dueBadge(cf.due_date);
              const isExpanded = expandedId === cf.id;
              const sigs = signatories[cf.id] ?? [];
              const formLeads = leads[cf.id] ?? [];
              const totalCount = responseCount + (leads[cf.id] ? formLeads.length : initialLeadCount);
              const publicUrl = `${appBase}/forms/${cf.id}`;

              return (
                <motion.div key={cf.id} layout className={`bg-card border rounded-2xl overflow-hidden transition-colors ${cf.has_signed ? 'border-emerald-500/20' : cf.is_public ? 'border-primary/20' : 'border-border/60'}`}>
                  {/* Hidden QR pre-render for offline print — do not remove */}
                  {cf.is_public && (
                    <div id={`qr-cache-${cf.id}`} className="hidden" aria-hidden>
                      <HdQrCode value={publicUrl} size={HD_QR_PRINT_LARGE_PX} />
                    </div>
                  )}
                  <div className="p-3.5 sm:p-5 space-y-3">

                    {/* Title row */}
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                      <div className="flex items-start gap-2 min-w-0">
                        {cf.has_signed && <CheckCircleIcon className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />}
                        <div className="min-w-0">
                          <h3 className="font-bold text-foreground leading-snug break-words [overflow-wrap:anywhere]">{cf.title}</h3>
                          <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                            {cf.form_type !== 'general' && (
                              <span className="text-[9px] font-black uppercase tracking-widest text-primary">
                                {cf.form_type === 'assessment' ? 'Assessment' : 'Registration'}
                              </span>
                            )}
                            <span className="text-[9px] font-black uppercase tracking-widest text-amber-700 dark:text-amber-300 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded-full">
                              {enrollmentTypeLabel(cf.enrollment_type)}
                            </span>
                            {cf.schools?.name && (
                              <span className="text-[9px] font-black uppercase tracking-widest text-emerald-700 dark:text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-full break-words">
                                {cf.schools.name}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {badge && <span className={`text-[10px] font-black px-2 py-0.5 rounded-full border ${badge.cls}`}>{badge.label}</span>}
                        {(cf.pending_review_count ?? 0) > 0 && (
                          <span className="text-[10px] font-black text-amber-600 dark:text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded-full">
                            {cf.pending_review_count} to review
                          </span>
                        )}
                        {cf.is_public && <span className="text-[10px] font-black text-primary bg-primary/10 border border-primary/20 px-2 py-0.5 rounded-full">Public</span>}
                        {cf.has_signed && <span className="text-[10px] font-black text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-full">Signed</span>}
                      </div>
                    </div>

                    {/* Body preview */}
                    <p className="text-muted-foreground text-sm leading-relaxed line-clamp-2 break-words [overflow-wrap:anywhere]">{cf.body}</p>

                    {/* Meta */}
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                      <span>{relativeDate(cf.created_at)}</span>
                      {isStaff && (
                        <span className="flex items-center gap-1 font-bold">
                          <UserGroupIcon className="w-3.5 h-3.5" />
                          {totalCount} {totalCount === 1 ? 'response' : 'responses'}
                          {responseCount > 0 && <span className="text-muted-foreground font-normal">· {responseCount} signed</span>}
                          {(leads[cf.id] ? formLeads.length : initialLeadCount) > 0 && (
                            <span className="text-amber-600 dark:text-amber-400 font-normal">· {leads[cf.id] ? formLeads.length : initialLeadCount} leads</span>
                          )}
                        </span>
                      )}
                    </div>

                    {/* ── Action Centre ───────────────────────────────── */}
                    <div className="mt-1 border border-border/60 rounded-xl overflow-hidden">

                      {/* Primary actions — wrap on mobile */}
                      <div className="grid grid-cols-2 sm:flex sm:flex-wrap sm:items-stretch gap-px bg-border/40">

                        {isParent && !cf.has_signed && (
                          <button
                            onClick={() => openReadModal(cf.id)}
                            className="col-span-2 flex items-center justify-center gap-2 min-h-11 px-3 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-black uppercase tracking-widest transition-colors"
                          >
                            <DocumentTextIcon className="w-3.5 h-3.5" /> Read &amp; Sign
                          </button>
                        )}

                        {isStaff && (
                          <button
                            onClick={() => router.push(`/dashboard/consent-forms/${cf.id}/responses`)}
                            className="flex items-center justify-center gap-2 min-h-11 px-3 py-2.5 bg-primary/10 hover:bg-primary/20 text-primary text-[11px] font-black uppercase tracking-widest transition-colors"
                          >
                            <DocumentTextIcon className="w-3.5 h-3.5" />
                            Responses
                            {totalCount > 0 && (
                              <span className="bg-primary text-primary-foreground text-[9px] font-black px-1.5 py-0.5 rounded-full leading-none">{totalCount}</span>
                            )}
                          </button>
                        )}

                        <button
                          onClick={() => openReadModal(cf.id)}
                          className="flex items-center justify-center gap-1.5 min-h-11 px-3 py-2.5 bg-card hover:bg-muted text-[11px] font-bold text-muted-foreground hover:text-foreground transition-colors"
                        >
                          <EyeIcon className="w-3.5 h-3.5" /> Read
                        </button>

                        {isEditor && (
                          <button
                            onClick={() => setEditingForm(cf)}
                            className="flex items-center justify-center gap-1.5 min-h-11 px-3 py-2.5 bg-card hover:bg-muted text-[11px] font-bold text-muted-foreground hover:text-foreground transition-colors"
                          >
                            <PencilSquareIcon className="w-3.5 h-3.5" /> Edit
                          </button>
                        )}

                        {isStaff && (
                          <button
                            onClick={() => toggleSignatories(cf.id)}
                            disabled={loadingSigs === cf.id}
                            className="flex items-center justify-center gap-1.5 min-h-11 px-3 py-2.5 bg-card hover:bg-muted text-[11px] font-bold text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
                          >
                            {loadingSigs === cf.id
                              ? <ArrowPathIcon className="w-3.5 h-3.5 animate-spin" />
                              : isExpanded
                                ? <ChevronUpIcon className="w-3.5 h-3.5" />
                                : <ChevronDownIcon className="w-3.5 h-3.5" />}
                            {isExpanded ? 'Hide' : 'Expand'}
                          </button>
                        )}

                        {isStaff && (
                          <button
                            onClick={() => togglePublic(cf.id, cf.is_public)}
                            disabled={togglingPublicId === cf.id}
                            className={`flex items-center justify-center gap-1.5 min-h-11 px-3 py-2.5 text-[11px] font-black uppercase tracking-widest transition-colors disabled:opacity-50 ${
                              cf.is_public
                                ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/20'
                                : 'bg-amber-500/10 text-amber-600 dark:text-amber-400 hover:bg-amber-500/20'
                            }`}
                            title={cf.is_public ? 'Form is public — click to make private' : 'Form is private — click to publish'}
                          >
                            {togglingPublicId === cf.id
                              ? <ArrowPathIcon className="w-3.5 h-3.5 animate-spin" />
                              : cf.is_public
                                ? <><GlobeAltIcon className="w-3.5 h-3.5" /> Public</>
                                : <><LockClosedIcon className="w-3.5 h-3.5" /> Private</>}
                          </button>
                        )}

                        {isEditor && (
                          <button
                            onClick={() => setConfirmDeleteId(cf.id)}
                            className="flex items-center justify-center gap-1.5 min-h-11 px-3 py-2.5 bg-card text-rose-600 dark:text-rose-400 hover:bg-rose-500/10 text-[11px] font-bold transition-colors"
                            title="Delete form"
                          >
                            <TrashIcon className="w-3.5 h-3.5" /> Delete
                          </button>
                        )}
                      </div>

                      {/* Tools — wrap grid on mobile */}
                      {isStaff && (
                        <div className="grid grid-cols-2 sm:grid-cols-3 md:flex md:flex-wrap gap-px border-t border-border/40 bg-border/30 text-[10px]">

                          {cf.is_public && (
                            <>
                              <a
                                href={`${appBase}/forms/${cf.id}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center justify-center gap-1.5 min-h-10 px-2.5 py-2 bg-background text-muted-foreground hover:text-foreground hover:bg-muted transition-colors font-bold"
                                title="Open public form"
                              >
                                <ArrowTopRightOnSquareIcon className="w-3 h-3" /> Preview
                              </a>
                              <button
                                onClick={() => copyLink(cf.id)}
                                className="flex items-center justify-center gap-1.5 min-h-10 px-2.5 py-2 bg-background text-muted-foreground hover:text-foreground hover:bg-muted transition-colors font-bold"
                              >
                                <LinkIcon className="w-3 h-3" />
                                {copiedId === cf.id ? 'Copied!' : 'Copy Link'}
                              </button>
                              <button
                                onClick={() => setQrFormId(cf.id)}
                                className="flex items-center justify-center gap-1.5 min-h-10 px-2.5 py-2 bg-background text-muted-foreground hover:text-foreground hover:bg-muted transition-colors font-bold"
                                title="Show QR code"
                              >
                                <QrCodeIcon className="w-3 h-3" /> QR Code
                              </button>
                            </>
                          )}

                          <button
                            onClick={() => printForm(cf, appBase)}
                            className="flex items-center justify-center gap-1.5 min-h-10 px-2.5 py-2 bg-background text-muted-foreground hover:text-foreground hover:bg-muted transition-colors font-bold"
                          >
                            <PrinterIcon className="w-3 h-3" /> Print Form
                          </button>

                          {cf.is_public && (
                            <>
                              <button
                                onClick={() => { const svg = document.getElementById(`qr-cache-${cf.id}`)?.querySelector('svg')?.outerHTML; printQRCards(cf, appBase, svg, 'portrait'); }}
                                className="hidden sm:flex items-center justify-center gap-1 min-h-10 px-2.5 py-2 bg-background text-muted-foreground hover:text-foreground hover:bg-muted transition-colors font-bold"
                                title="8 QR cards — A4 portrait"
                              >
                                <PrinterIcon className="w-3 h-3" /> QR Cards ↕
                              </button>
                              <button
                                onClick={() => { const svg = document.getElementById(`qr-cache-${cf.id}`)?.querySelector('svg')?.outerHTML; printQRCards(cf, appBase, svg, 'landscape'); }}
                                className="hidden sm:flex items-center justify-center gap-1 min-h-10 px-2.5 py-2 bg-background text-muted-foreground hover:text-foreground hover:bg-muted transition-colors font-bold"
                                title="12 QR cards — A4 landscape"
                              >
                                <PrinterIcon className="w-3 h-3" /> QR Cards ↔
                              </button>
                              <button
                                onClick={() => { const svg = document.getElementById(`qr-cache-${cf.id}`)?.querySelector('svg')?.outerHTML; printQRPoster(cf, appBase, svg); }}
                                className="flex items-center justify-center gap-1 min-h-10 px-2.5 py-2 bg-background text-muted-foreground hover:text-foreground hover:bg-muted transition-colors font-bold"
                                title="Full-page QR poster"
                              >
                                <PrinterIcon className="w-3 h-3" /> QR Poster
                              </button>
                            </>
                          )}

                          <button
                            onClick={() => handlePrintDataSheet(cf.id, cf)}
                            className="flex items-center justify-center gap-1.5 min-h-10 px-2.5 py-2 bg-background text-muted-foreground hover:text-foreground hover:bg-muted transition-colors font-bold"
                          >
                            <TableCellsIcon className="w-3 h-3" /> Data Sheet
                          </button>
                          <button
                            onClick={() => exportCSV(cf.id, cf.title)}
                            className="flex items-center justify-center gap-1.5 min-h-10 px-2.5 py-2 bg-background text-muted-foreground hover:text-foreground hover:bg-muted transition-colors font-bold"
                          >
                            <ArrowDownTrayIcon className="w-3 h-3" /> CSV
                          </button>

                          <button
                            onClick={() => openCloneModal(cf)}
                            disabled={cloningId === cf.id}
                            className="flex items-center justify-center gap-1.5 min-h-10 px-2.5 py-2 bg-background text-muted-foreground hover:text-foreground hover:bg-muted transition-colors font-bold disabled:opacity-40"
                            title="Copy this form to another school"
                          >
                            <DocumentDuplicateIcon className="w-3 h-3" />
                            {cloningId === cf.id ? 'Copying…' : 'Copy to School'}
                          </button>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* ── Expanded panel: responses + leads ─────────────────── */}
                  <AnimatePresence>
                    {isExpanded && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }}
                        className="overflow-hidden"
                      >
                        <div className="border-t border-border/50 bg-muted/20 px-3.5 sm:px-5 py-4 sm:py-5 space-y-4 sm:space-y-5">

                          {/* Summary bar */}
                          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3 sm:flex-wrap">
                            <div className="flex flex-wrap items-center gap-2 text-xs">
                              <span className="font-black text-foreground">{sigs.length + formLeads.length} total</span>
                              {sigs.length > 0 && <span className="text-emerald-600 dark:text-emerald-400 font-bold">{sigs.length} signed</span>}
                              {formLeads.length > 0 && <span className="text-amber-600 dark:text-amber-400 font-bold">{formLeads.length} leads</span>}
                            </div>
                            <div className="flex gap-2 sm:ml-auto">
                              <button
                                onClick={() => router.push(`/dashboard/consent-forms/${cf.id}/responses`)}
                                className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 text-xs min-h-10 bg-primary/10 hover:bg-primary/20 text-primary px-3 py-2 rounded-lg font-bold transition-colors border border-primary/20"
                              >
                                Full View →
                              </button>
                              <button
                                onClick={() => handlePrintDataSheet(cf.id, cf)}
                                className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 text-xs min-h-10 bg-muted hover:bg-muted/80 text-muted-foreground px-3 py-2 rounded-lg font-bold transition-colors border border-border/50"
                              >
                                <PrinterIcon className="w-3 h-3" /> Sheet
                              </button>
                            </div>
                          </div>

                          {/* Portal Signatures */}
                          {sigs.length > 0 && (
                            <div className="space-y-2">
                              <p className="text-[10px] font-black text-emerald-600 dark:text-emerald-400 uppercase tracking-widest flex items-center gap-1.5">
                                <CheckCircleIcon className="w-3 h-3" /> Portal Signatures — {sigs.length}
                              </p>
                              <div className="space-y-2">
                                {sigs.map(s => {
                                  const rd = s.response_data as Record<string, string> | null;
                                  return (
                                    <div key={s.id} className="bg-card border border-emerald-500/15 rounded-xl p-4">
                                      <div className="flex items-start justify-between gap-3">
                                        <div>
                                          <p className="font-bold text-foreground">{s.portal_users?.full_name ?? 'Unknown'}</p>
                                          <p className="text-xs text-muted-foreground mt-0.5">{s.portal_users?.email ?? ''}</p>
                                          {s.portal_users?.phone && <p className="text-xs text-muted-foreground">{s.portal_users.phone}</p>}
                                        </div>
                                        <div className="text-right shrink-0">
                                          <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">Signed</span>
                                          <p className="text-[10px] text-muted-foreground mt-1">
                                            {new Date(s.signed_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                                          </p>
                                          <p className="text-[10px] text-muted-foreground">
                                            {new Date(s.signed_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
                                          </p>
                                        </div>
                                      </div>
                                      {rd && (rd.child_name || rd.program_category) && (
                                        <div className="mt-2 pt-2 border-t border-border/30 flex flex-wrap gap-2">
                                          {rd.child_name && <span className="text-xs bg-muted px-2.5 py-1 rounded-lg text-foreground font-bold">👦 {rd.child_name}</span>}
                                          {rd.child_age && <span className="text-xs bg-muted px-2.5 py-1 rounded-lg text-muted-foreground">Age {rd.child_age}</span>}
                                          {rd.child_class && <span className="text-xs bg-muted px-2.5 py-1 rounded-lg text-muted-foreground">{rd.child_class}</span>}
                                          {rd.program_category && (
                                            <span className="text-xs bg-primary/10 text-primary px-2.5 py-1 rounded-lg font-bold">
                                              {rd.program_category === 'young_innovators' ? '🚀 Young Innovators' : '💻 Teen Developers'}
                                            </span>
                                          )}
                                        </div>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          )}

                          {/* Public Leads */}
                          {formLeads.length > 0 && (
                            <div className="space-y-2">
                              <p className="text-[10px] font-black text-amber-600 dark:text-amber-400 uppercase tracking-widest flex items-center gap-1.5">
                                <UserGroupIcon className="w-3 h-3" /> Public Registrations — {formLeads.length}
                              </p>
                              <div className="space-y-3">
                                {formLeads.map(lead => {
                                  const rd         = lead.response_data as Record<string, string>;
                                  const waNumber   = rd.parent_whatsapp?.replace(/\D/g, '');
                                  const status     = lead.status ?? 'new';
                                  const isPending  = lead.match_status === 'pending_review';
                                  const isApproved = lead.match_status === 'approved';
                                  const statusCfg: Record<string, { label: string; cls: string }> = {
                                    new:       { label: 'New',       cls: 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/20' },
                                    contacted: { label: 'Contacted', cls: 'bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/20' },
                                    enrolled:  { label: 'Enrolled',  cls: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/20' },
                                    lost:      { label: 'Lost',      cls: 'bg-muted text-muted-foreground border-border' },
                                  };
                                  const confCls: Record<string, string> = {
                                    high:   'bg-rose-500/10 text-rose-600 dark:text-rose-400',
                                    medium: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
                                    low:    'bg-muted text-muted-foreground',
                                  };
                                  return (
                                    <div key={lead.id} className={`bg-card rounded-xl border overflow-hidden ${isPending ? 'border-amber-500/40' : 'border-border/50'}`}>
                                      {/* Lead header */}
                                      <div className="p-4 space-y-3">
                                        <div className="flex items-start justify-between gap-3">
                                          <div className="min-w-0">
                                            <p className="font-bold text-foreground">{rd.parent_name ?? 'Unknown Parent'}</p>
                                            <p className="text-xs text-muted-foreground mt-0.5 truncate">{lead.email ?? rd.parent_email ?? ''}</p>
                                          </div>
                                          <div className="flex flex-col items-end gap-1.5 shrink-0">
                                            <select
                                              value={status}
                                              disabled={updatingLeadId === lead.id}
                                              onChange={e => updateLeadStatus(cf.id, lead.id, e.target.value as FormLead['status'])}
                                              className={`text-xs font-bold px-2.5 py-1 rounded-lg border cursor-pointer disabled:opacity-50 outline-none ${statusCfg[status].cls}`}
                                              style={{ background: 'transparent' }}
                                            >
                                              {Object.entries(statusCfg).map(([val, cfg]) => (
                                                <option key={val} value={val} className="bg-card text-foreground">{cfg.label}</option>
                                              ))}
                                            </select>
                                            <p className="text-[10px] text-muted-foreground">
                                              {new Date(lead.submitted_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                                              {' · '}
                                              {new Date(lead.submitted_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
                                            </p>
                                          </div>
                                        </div>

                                        {/* Child info chips */}
                                        <div className="flex flex-wrap gap-2">
                                          {rd.child_name && <span className="text-xs bg-muted px-2.5 py-1 rounded-lg text-foreground font-bold">👦 {rd.child_name}</span>}
                                          {rd.child_age  && <span className="text-xs bg-muted px-2.5 py-1 rounded-lg text-muted-foreground">Age {rd.child_age}</span>}
                                          {rd.child_class && <span className="text-xs bg-muted px-2.5 py-1 rounded-lg text-muted-foreground">{rd.child_class}</span>}
                                          {rd.program_category && (
                                            <span className="text-xs bg-primary/10 text-primary px-2.5 py-1 rounded-lg font-bold">
                                              {rd.program_category === 'young_innovators' ? '🚀 Young Innovators' : '💻 Teen Developers'}
                                            </span>
                                          )}
                                          {(rd as any).is_existing_parent && (
                                            <span className="text-xs bg-purple-500/10 text-purple-600 dark:text-purple-400 px-2.5 py-1 rounded-lg font-bold">↩️ Existing parent</span>
                                          )}
                                          {lead.child_current_school && (
                                            <span className="text-xs bg-blue-500/10 text-blue-600 dark:text-blue-400 px-2.5 py-1 rounded-lg">
                                              🏫 {lead.child_current_school}
                                            </span>
                                          )}
                                        </div>

                                        {/* Contact actions + print */}
                                        <div className="flex flex-wrap gap-2">
                                          {waNumber && (
                                            <a href={`https://wa.me/${waNumber}`} target="_blank" rel="noopener noreferrer"
                                              className="flex items-center gap-1.5 text-xs bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-600 dark:text-emerald-400 px-3 py-1.5 rounded-lg font-bold transition-colors border border-emerald-500/20">
                                              💬 {rd.parent_whatsapp}
                                            </a>
                                          )}
                                          {(lead.email ?? rd.parent_email) && (
                                            <a href={`mailto:${lead.email ?? rd.parent_email}`}
                                              className="flex items-center gap-1.5 text-xs bg-muted hover:bg-muted/80 text-muted-foreground px-3 py-1.5 rounded-lg font-bold transition-colors">
                                              ✉️ {lead.email ?? rd.parent_email}
                                            </a>
                                          )}
                                          <button
                                            onClick={() => printFilledForm(cf, lead, appBase)}
                                            className="flex items-center gap-1.5 text-xs bg-muted hover:bg-muted/80 text-muted-foreground px-3 py-1.5 rounded-lg font-bold transition-colors ml-auto"
                                          >
                                            <PrinterIcon className="w-3 h-3" /> Print Submission
                                          </button>
                                        </div>

                                        {/* Match badges */}
                                        {(isPending || isApproved || lead.contact_id || lead.prospect_id) && (
                                          <div className="flex flex-wrap gap-2">
                                            {isPending && (
                                              <span className={`text-xs font-bold px-2.5 py-1 rounded-lg ${confCls[lead.match_confidence ?? 'low']}`}>
                                                ⚠️ {lead.match_confidence} confidence match
                                              </span>
                                            )}
                                            {isApproved && (
                                              <span className="text-xs font-bold px-2.5 py-1 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">✓ Matched to student</span>
                                            )}
                                            {lead.contact_id && (
                                              <span className="text-xs bg-blue-500/10 text-blue-600 dark:text-blue-400 px-2.5 py-1 rounded-lg font-bold">✓ CRM contact</span>
                                            )}
                                            {lead.prospect_id && (
                                              <span className="text-xs bg-violet-500/10 text-violet-600 dark:text-violet-400 px-2.5 py-1 rounded-lg font-bold">✓ Prospect saved</span>
                                            )}
                                          </div>
                                        )}

                                        {/* Assessment details */}
                                        {((rd as any).prior_coding || (rd as any).learning_goal || (rd as any).preferred_schedule || (rd as any).special_notes || (Array.isArray((rd as any).devices) && (rd as any).devices.length > 0)) && (
                                          <div className="bg-muted/40 rounded-xl px-3 py-2.5 space-y-1.5 border border-border/30">
                                            <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">Assessment Details</p>
                                            {(rd as any).prior_coding && (
                                              <p className="text-xs text-muted-foreground">
                                                <span className="font-bold text-foreground">Prior coding:</span>{' '}
                                                {(rd as any).prior_coding === 'yes'
                                                  ? `Yes${(rd as any).prior_platform ? ` — ${(rd as any).prior_platform}` : ''}`
                                                  : 'No'}
                                              </p>
                                            )}
                                            {Array.isArray((rd as any).devices) && (rd as any).devices.length > 0 && (
                                              <p className="text-xs text-muted-foreground">
                                                <span className="font-bold text-foreground">Devices:</span>{' '}
                                                {((rd as any).devices as string[]).join(', ')}
                                              </p>
                                            )}
                                            {(rd as any).learning_goal && (
                                              <p className="text-xs text-muted-foreground">
                                                <span className="font-bold text-foreground">Goal:</span> {(rd as any).learning_goal}
                                              </p>
                                            )}
                                            {(rd as any).preferred_schedule && (
                                              <p className="text-xs text-muted-foreground">
                                                <span className="font-bold text-foreground">Schedule:</span> {(rd as any).preferred_schedule}
                                              </p>
                                            )}
                                            {(rd as any).special_notes && (
                                              <p className="text-xs text-muted-foreground italic">
                                                <span className="font-bold not-italic text-foreground">Notes:</span> {(rd as any).special_notes}
                                              </p>
                                            )}
                                          </div>
                                        )}
                                      </div>

                                      {/* Pending review block */}
                                      {isPending && lead.match_candidate && (
                                        <div className="border-t border-amber-500/30 bg-amber-500/5 px-4 py-3 space-y-3">
                                          <p className="text-xs font-black text-amber-600 dark:text-amber-400 uppercase tracking-widest">⚠ Possible existing student — please review</p>
                                          <div className="grid grid-cols-2 gap-3">
                                            <div className="bg-card border border-border/30 rounded-xl p-3 space-y-0.5">
                                              <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest mb-1">From Form</p>
                                              <p className="font-bold text-foreground">{rd.child_name}</p>
                                              <p className="text-xs text-muted-foreground">{rd.child_class || '—'}</p>
                                            </div>
                                            <div className="bg-card border border-amber-500/20 rounded-xl p-3 space-y-0.5">
                                              <p className="text-[10px] font-black text-amber-600 dark:text-amber-400 uppercase tracking-widest mb-1">In System</p>
                                              <p className="font-bold text-foreground">{lead.match_candidate.full_name}</p>
                                              <p className="text-xs text-muted-foreground">{lead.match_candidate.section_class || '—'}</p>
                                            </div>
                                          </div>
                                          {lead.match_notes && (
                                            <p className="text-xs text-muted-foreground italic leading-relaxed">{lead.match_notes}</p>
                                          )}
                                          <div className="flex gap-2">
                                            <button
                                              disabled={reviewingLeadId === lead.id}
                                              onClick={() => reviewLead(cf.id, lead.id, 'approve')}
                                              className="flex-1 py-2.5 bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-600 dark:text-emerald-400 font-black text-sm rounded-xl transition-colors disabled:opacity-40 border border-emerald-500/20"
                                            >
                                              {reviewingLeadId === lead.id ? '…' : '✓ Yes, same student'}
                                            </button>
                                            <button
                                              disabled={reviewingLeadId === lead.id}
                                              onClick={() => reviewLead(cf.id, lead.id, 'reject')}
                                              className="flex-1 py-2.5 bg-muted hover:bg-muted/80 text-muted-foreground font-black text-sm rounded-xl transition-colors disabled:opacity-40"
                                            >
                                              ✗ New prospect
                                            </button>
                                          </div>
                                        </div>
                                      )}

                                      {/* Approved link */}
                                      {isApproved && lead.matched_student_id && (
                                        <div className="border-t border-emerald-500/20 bg-emerald-500/5 px-4 py-2.5">
                                          <p className="text-xs text-emerald-600 dark:text-emerald-400 font-bold">
                                            ✓ Linked to existing student record{lead.matched_parent_id ? ' · Parent portal account found' : ''}
                                          </p>
                                        </div>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          )}

                          {sigs.length === 0 && formLeads.length === 0 && (
                            <div className="text-center py-6">
                              <p className="text-sm text-muted-foreground">No responses yet.</p>
                              <p className="text-xs text-muted-foreground mt-1">Share the public link or QR code to start collecting registrations.</p>
                            </div>
                          )}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
              );
            })}
          </div>
        )}
      </div>

    </div>
  );
}
