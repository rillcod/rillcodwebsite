'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import QRCode from 'react-qr-code';
import { downloadQrCard } from '@/lib/qr-card';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/auth-context';
import { createClient } from '@/lib/supabase/client';
import { toast } from 'sonner';
import {
  ArrowLeftIcon, ArrowPathIcon, PrinterIcon, UserGroupIcon,
  MagnifyingGlassIcon, CheckCircleIcon, FunnelIcon, ArrowDownTrayIcon,
} from '@/lib/icons';

// ── Types ─────────────────────────────────────────────────────────────────────

interface ConsentForm {
  id: string;
  title: string;
  body: string;
  form_type: string;
  due_date: string | null;
  is_public: boolean;
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
  status: 'new' | 'contacted' | 'enrolled' | 'lost';
  match_status: string | null;
  match_confidence: 'high' | 'medium' | 'low' | null;
  match_notes: string | null;
  match_candidate: { id: string; full_name: string; section_class: string | null } | null;
  matched_student_id: string | null;
  matched_parent_id: string | null;
  contact_id: string | null;
  prospect_id: string | null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function esc(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function progLabel(cat: string) {
  if (cat === 'young_innovators') return 'Young Innovators';
  if (cat === 'teen_developers')  return 'Teen Developers';
  return cat || '—';
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}
function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

const STATUS_CFG = {
  new:       { label: 'New',       cls: 'bg-amber-500/15 text-amber-400 border-amber-500/20' },
  contacted: { label: 'Contacted', cls: 'bg-blue-500/15 text-blue-400 border-blue-500/20' },
  enrolled:  { label: 'Enrolled',  cls: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20' },
  lost:      { label: 'Lost',      cls: 'bg-muted text-muted-foreground border-border' },
} as const;

// ── Print helpers (self-contained) ────────────────────────────────────────────

function fillPlaceholders(text: string, data: Record<string, string>): string {
  const map: Record<string, string> = {
    'parent name': data.parentName, 'parent_name': data.parentName,
    'guardian name': data.parentName, 'guardian_name': data.parentName,
    'child name': data.childName, 'child_name': data.childName,
    'student name': data.childName, 'student_name': data.childName,
    'date': data.date, 'submission date': data.date,
    'programme': data.programme, 'program': data.programme, 'program_category': data.programme,
    'child age': data.childAge, 'child_age': data.childAge, 'age': data.childAge,
    'class': data.childClass, 'child class': data.childClass, 'child_class': data.childClass,
    // [School] → the Rillcod school/branch running this form
    'school': data.school ?? data.currentSchool,
    'school name': data.school ?? data.currentSchool,
    'branch': data.school ?? data.currentSchool,
    // [Current School] → the child's current school
    'current school': data.currentSchool, 'child school': data.currentSchool,
  };
  return text.replace(/\{\{([^}]+)\}\}|\{([^}]+)\}|\[([^\]]+)\]/gi, (_m, p1, p2, p3) => {
    const key = (p1 ?? p2 ?? p3 ?? '').toLowerCase().trim();
    return map[key] ?? _m;
  });
}

function printFilledForm(form: ConsentForm, lead: FormLead, appBase: string) {
  const win = window.open('', '_blank', 'width=860,height=1100');
  if (!win) return;
  const rd       = (lead.response_data ?? {}) as Record<string, unknown>;
  const str      = (k: string) => (rd[k] as string) ?? '';
  const sub      = new Date(lead.submitted_at);
  const dateStr  = sub.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const dateShort = sub.toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' });
  const timeStr  = sub.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  const shortRef = 'RC-' + lead.id.slice(0, 8).toUpperCase();
  const parentName  = str('parent_name') || 'Parent/Guardian';
  const childName   = str('child_name')  || '—';
  const schoolName  = form.schools?.name ?? 'Rillcod Technologies';
  const pLabel   = str('program_category') === 'young_innovators' ? 'Young Innovators — PRY (Ages 5–10)'
                 : str('program_category') === 'teen_developers'  ? 'Teen Developers — SEC (Ages 11–19)'
                 : str('program_category') || '—';
  const pShort   = str('program_category') === 'young_innovators' ? 'Young Innovators'
                 : str('program_category') === 'teen_developers'  ? 'Teen Developers'
                 : str('program_category') || 'Coding Programme';
  const devicesArr = Array.isArray(rd.devices) ? (rd.devices as string[]).join(', ') : '';
  const multiChildren = Array.isArray(rd.children) && (rd.children as unknown[]).length > 1
    ? (rd.children as Array<Record<string, string>>)
    : null;

  // Fill placeholders in the form body with actual submission values
  const filledBody = fillPlaceholders(form.body, {
    parentName,
    childName,
    date:         dateShort,
    programme:    pShort,
    childAge:     str('child_age'),
    childClass:   str('child_class'),
    currentSchool: lead.child_current_school || str('child_current_school'),
    school:       schoolName,
  })
    // Also replace underscore-based blanks e.g. _____ (parent/guardian name)
    .replace(/_+(\s*\(parent[\s/]*guardian name\))?/gi, parentName)
    .replace(/_+(\s*\(child['']?s?\s*name\))?/gi, childName);

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

  const secNum = (n: number) => `<span class="sec-num">0${n}</span>`;

  win.document.write(`<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8">
<title>${shortRef} — ${esc(form.title)}</title>
<style>
@page{margin:0;size:A4 portrait}
*{box-sizing:border-box;margin:0;padding:0;print-color-adjust:exact;-webkit-print-color-adjust:exact}
body{font-family:'Segoe UI',Arial,Helvetica,sans-serif;font-size:10pt;color:#1a1a1a;background:#fff}

/* ── Letterhead ── */
.lh{background:#0d0d0f;print-color-adjust:exact;-webkit-print-color-adjust:exact;padding:20px 30px 16px;display:flex;align-items:center;justify-content:space-between;gap:20px}
.lh-logo{height:50px;width:auto;object-fit:contain;flex-shrink:0}
.lh-div{width:1px;height:46px;background:rgba(255,255,255,0.15);flex-shrink:0}
.lh-co{flex:1}.lh-name{font-size:16pt;font-weight:900;color:#fff !important;letter-spacing:-0.3px}
.lh-tag{font-size:7pt;color:#aaa !important;text-transform:uppercase;letter-spacing:1.8px;margin-top:3px}
.lh-contact{text-align:right;color:#aaa !important;font-size:7.5pt;line-height:1.9;flex-shrink:0}
.lh-contact a{color:#f5a623 !important;text-decoration:none}
.accent{height:3px;background:linear-gradient(90deg,#f5a623 0%,#f5c84a 60%,#fff3 100%);print-color-adjust:exact;-webkit-print-color-adjust:exact}

/* ── Document header ── */
.doc-wrap{padding:24px 32px 20px}
.doc-eyebrow{font-size:7pt;font-weight:800;letter-spacing:3px;text-transform:uppercase;color:#f5a623;margin-bottom:6px}
.doc-title{font-size:17pt;font-weight:900;color:#0d0d0f;line-height:1.2;margin-bottom:12px}
.doc-meta-bar{display:flex;gap:0;border:1px solid #e4e4e7;border-radius:8px;overflow:hidden;margin-bottom:20px}
.meta-cell{flex:1;padding:9px 14px;border-right:1px solid #e4e4e7}
.meta-cell:last-child{border-right:none}
.meta-lbl{font-size:6.5pt;font-weight:800;letter-spacing:1.5px;text-transform:uppercase;color:#888;margin-bottom:3px}
.meta-val{font-size:9.5pt;font-weight:700;color:#111}
.meta-val.mono{font-family:'Courier New',monospace;color:#f5a623;font-size:10pt}

/* ── Sections ── */
.sec{margin-bottom:18px}
.sec-head{display:flex;align-items:center;gap:8px;margin-bottom:10px;padding-bottom:5px;border-bottom:1.5px solid #111}
.sec-num{display:inline-flex;align-items:center;justify-content:center;width:18px;height:18px;background:#0d0d0f;color:#f5a623 !important;font-size:7.5pt;font-weight:900;border-radius:3px;flex-shrink:0;print-color-adjust:exact;-webkit-print-color-adjust:exact}
.sec-title{font-size:7.5pt;font-weight:900;letter-spacing:2.5px;text-transform:uppercase;color:#111}
.dt{width:100%;border-collapse:collapse}
.dt td{padding:6.5px 8px 6.5px 0;border-bottom:1px solid #f0f0f0;vertical-align:top;font-size:9.5pt}
.dt .lbl{width:40%;font-weight:700;color:#555;padding-right:12px}
.dt .val{color:#111}
.prog-pill{display:inline-block;background:#0d0d0f;color:#f5a623 !important;font-size:8pt;font-weight:900;padding:3px 11px;border-radius:20px;letter-spacing:0.3px;print-color-adjust:exact;-webkit-print-color-adjust:exact}

/* ── Consent body ── */
.consent-box{border:1px solid #d4d4d4;border-radius:6px;overflow:hidden;margin-top:6px}
.consent-box-header{background:#0d0d0f;print-color-adjust:exact;-webkit-print-color-adjust:exact;padding:7px 14px;display:flex;align-items:center;justify-content:space-between}
.consent-box-label{font-size:7pt;font-weight:800;letter-spacing:2px;text-transform:uppercase;color:#f5a623 !important}
.consent-box-name{font-size:8pt;font-weight:700;color:#fff !important}
.consent-text{padding:14px 16px;background:#fafafa;print-color-adjust:exact;-webkit-print-color-adjust:exact;font-size:9.5pt;line-height:1.8;white-space:pre-wrap;color:#222;font-family:Georgia,'Times New Roman',serif}
.consent-highlight{color:#0d0d0f !important;font-weight:700;text-decoration:underline;text-decoration-color:#f5a623}

/* ── Digital acknowledgement ── */
.ack{margin-top:18px;border:1.5px solid #16a34a;border-radius:8px;overflow:hidden;print-color-adjust:exact;-webkit-print-color-adjust:exact}
.ack-header{background:#16a34a;print-color-adjust:exact;-webkit-print-color-adjust:exact;padding:8px 16px;display:flex;align-items:center;gap:8px}
.ack-icon{font-size:13pt;line-height:1}
.ack-title{font-size:8pt;font-weight:900;color:#fff !important;letter-spacing:1px;text-transform:uppercase}
.ack-body{padding:12px 16px;background:#f0fdf4;print-color-adjust:exact;-webkit-print-color-adjust:exact;display:flex;gap:24px}
.ack-field{flex:1}
.ack-field-lbl{font-size:6.5pt;font-weight:800;letter-spacing:1.5px;text-transform:uppercase;color:#15803d;margin-bottom:3px}
.ack-field-val{font-size:9.5pt;font-weight:700;color:#052e16}
.ack-field-val.big{font-size:11pt;color:#0d0d0f}

/* ── Footer ── */
.footer{margin-top:20px;padding-top:9px;border-top:1px solid #e4e4e7;display:flex;justify-content:space-between;align-items:center;font-size:7pt;color:#aaa}
.footer .mono{font-family:'Courier New',monospace;font-weight:700;color:#666}

.print-btn{position:fixed;top:16px;right:16px;background:#0d0d0f;color:#fff;border:none;padding:10px 20px;font-size:12px;font-weight:800;border-radius:8px;cursor:pointer;box-shadow:0 4px 16px rgba(0,0,0,0.3);z-index:999;letter-spacing:0.3px}
@media print{.print-btn{display:none!important}}
</style></head><body>
<button class="print-btn" onclick="window.print()">Print Now</button>

<div class="lh">
  <img src="${appBase}/images/logoB.png" class="lh-logo" alt="Rillcod" />
  <div class="lh-div"></div>
  <div class="lh-co">
    <div class="lh-name">${form.schools?.name ? esc(form.schools.name.toUpperCase()) : 'RILLCOD TECHNOLOGIES'}</div>
    <div class="lh-tag">${form.schools?.name ? 'via Rillcod Technologies' : 'Empowering Young Minds Through Code'}</div>
  </div>
  <div class="lh-contact">
    <div>+234 811 660 0091</div>
    <div><a href="mailto:support@rillcod.com">support@rillcod.com</a></div>
    <div>www.rillcod.com</div>
  </div>
</div>
<div class="accent"></div>

<div class="doc-wrap">
  <div class="doc-eyebrow">Consent Form · Submission Record</div>
  <div class="doc-title">${esc(form.title)}</div>

  <div class="doc-meta-bar">
    <div class="meta-cell">
      <div class="meta-lbl">Reference No.</div>
      <div class="meta-val mono">${shortRef}</div>
    </div>
    <div class="meta-cell">
      <div class="meta-lbl">School / Branch</div>
      <div class="meta-val" style="font-weight:900;color:#0d0d0f">${esc(schoolName)}</div>
    </div>
    <div class="meta-cell">
      <div class="meta-lbl">Date Submitted</div>
      <div class="meta-val">${dateStr}</div>
    </div>
    <div class="meta-cell">
      <div class="meta-lbl">Time</div>
      <div class="meta-val">${timeStr}</div>
    </div>
    <div class="meta-cell">
      <div class="meta-lbl">Form Type</div>
      <div class="meta-val">${form.form_type === 'assessment' ? 'Assessment' : 'Registration'}</div>
    </div>
  </div>

  <!-- 01 · Parent / Guardian -->
  <div class="sec">
    <div class="sec-head">${secNum(1)}<span class="sec-title">Parent / Guardian Details</span></div>
    <table class="dt">
      ${row('Full Name', `<strong>${esc(parentName)}</strong>`)}
      ${row('Email Address', esc(lead.email || str('parent_email') || '—'))}
      ${row('WhatsApp / Phone', esc(str('parent_whatsapp') || '—'))}
    </table>
  </div>

  <!-- 02 · Child -->
  <div class="sec">
    <div class="sec-head">${secNum(2)}<span class="sec-title">Child${multiChildren ? 'ren&rsquo;s' : '&rsquo;s'} Information${multiChildren ? ` (${multiChildren.length} enrolled)` : ''}</span></div>
    ${multiChildren
      ? multiChildren.map((child, ci) => `
        <div style="margin-bottom:${ci < multiChildren.length - 1 ? '12px' : '0'};padding-bottom:${ci < multiChildren.length - 1 ? '12px' : '0'};border-bottom:${ci < multiChildren.length - 1 ? '1px dashed #e4e4e7' : 'none'}">
          <div style="font-size:7pt;font-weight:800;letter-spacing:2px;text-transform:uppercase;color:#f5a623;margin-bottom:6px">Child ${ci + 1}</div>
          <table class="dt">
            ${row('Full Name', `<strong>${esc(child.name || '—')}</strong>`)}
            ${child.gender ? row('Gender', child.gender === 'male' ? 'Male' : 'Female') : ''}
            ${row('Age', esc(child.age || '—'))}
            ${row('Class / Grade', esc(child.class || '—'))}
            ${child.school ? row('Current School', esc(child.school)) : ''}
            <tr><td class="lbl">Programme</td><td class="val"><span class="prog-pill">${esc(
              child.program === 'young_innovators' ? 'Young Innovators — PRY' :
              child.program === 'teen_developers'  ? 'Teen Developers — SEC' :
              child.program || '—'
            )}</span></td></tr>
          </table>
        </div>`).join('')
      : `<table class="dt">
          ${row('Full Name', `<strong>${esc(childName)}</strong>`)}
          ${str('child_gender') ? row('Gender', str('child_gender') === 'male' ? 'Male' : 'Female') : ''}
          ${row('Age', esc(str('child_age') || '—'))}
          ${row('Class / Grade', esc(str('child_class') || '—'))}
          ${row('Current School', esc(lead.child_current_school || str('child_current_school') || '—'))}
          <tr><td class="lbl">Programme Selected</td><td class="val"><span class="prog-pill">${esc(pLabel)}</span></td></tr>
        </table>`
    }
  </div>

  ${assessmentRows ? `
  <!-- 03 · Assessment -->
  <div class="sec">
    <div class="sec-head">${secNum(3)}<span class="sec-title">Assessment &amp; Background</span></div>
    <table class="dt">${assessmentRows}</table>
  </div>` : ''}

  <!-- Consent Statement -->
  <div class="sec">
    <div class="sec-head">${secNum(assessmentRows ? 4 : 3)}<span class="sec-title">Consent Statement</span></div>
    <div class="consent-box">
      <div class="consent-box-header">
        <span class="consent-box-label">Consented by</span>
        <span class="consent-box-name">${esc(parentName)}</span>
      </div>
      <div class="consent-text">${esc(filledBody).replace(esc(parentName), `<span class="consent-highlight">${esc(parentName)}</span>`).replace(esc(childName), `<span class="consent-highlight">${esc(childName)}</span>`)}</div>
    </div>
  </div>

  <!-- Digital Acknowledgement -->
  <div class="ack">
    <div class="ack-header">
      <span class="ack-icon">✓</span>
      <span class="ack-title">Digital Consent Acknowledged</span>
    </div>
    <div class="ack-body">
      <div class="ack-field">
        <div class="ack-field-lbl">Consenting Party</div>
        <div class="ack-field-val big">${esc(parentName)}</div>
      </div>
      <div class="ack-field">
        <div class="ack-field-lbl">On Behalf Of</div>
        <div class="ack-field-val big">${multiChildren ? multiChildren.map(c => esc(c.name || '—')).join(', ') : esc(childName)}</div>
      </div>
      <div class="ack-field">
        <div class="ack-field-lbl">Submitted On</div>
        <div class="ack-field-val">${dateStr}<br/><span style="font-weight:400;font-size:8.5pt;color:#166534">at ${timeStr} via rillcod.com/forms</span></div>
      </div>
      <div class="ack-field">
        <div class="ack-field-lbl">Reference</div>
        <div class="ack-field-val" style="font-family:'Courier New',monospace;color:#f5a623;font-size:10.5pt">${shortRef}</div>
      </div>
    </div>
  </div>

  <div class="footer">
    <span class="mono">${shortRef}</span>
    <span>Rillcod Technologies &mdash; ${esc(form.title)}</span>
    <span>Confidential &middot; For Internal Use Only</span>
  </div>
</div>
</body></html>`);
  win.document.close();
}

function printDataSheet(form: ConsentForm, leads: FormLead[], sigs: Signatory[], appBase: string) {
  const win = window.open('', '_blank', 'width=1100,height=900');
  if (!win) return;
  const printed    = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
  const schoolName = form.schools?.name ?? '';
  const isAssessment = form.form_type === 'assessment';
  const statusLabel = (s: string) => ({ new: 'New', contacted: 'Contacted', enrolled: 'Enrolled', lost: 'Lost' }[s] ?? s);

  const leadRows = leads.map((lead, i) => {
    const rd  = (lead.response_data ?? {}) as Record<string, unknown>;
    const str = (k: string) => (rd[k] as string) ?? '';
    const sub = new Date(lead.submitted_at);
    const devs = Array.isArray(rd.devices) ? (rd.devices as string[]).join(', ') : '';
    const prog = progLabel(str('program_category'));
    const stat = statusLabel(lead.status ?? 'new');
    const statCls = lead.status === 'enrolled' ? 'enrolled' : lead.status === 'contacted' ? 'contacted' : lead.status === 'lost' ? 'lost' : 'new-s';
    return `<tr class="data-row">
      <td class="num">${i + 1}</td>
      <td class="date-col">${sub.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}<br/><span class="time">${sub.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</span></td>
      <td><strong>${esc(str('parent_name') || '—')}</strong><br/><span class="sub">${esc(lead.email || str('parent_email') || '')}</span><br/><span class="sub">${esc(str('parent_whatsapp') || '')}</span></td>
      <td><strong>${esc(str('child_name') || '—')}</strong><br/><span class="sub">${str('child_gender') ? (str('child_gender') === 'male' ? 'Male' : 'Female') + ' · ' : ''}Age ${esc(str('child_age') || '—')} · ${esc(str('child_class') || '—')}</span></td>
      <td><span class="sub">${esc(lead.child_current_school || str('child_current_school') || '—')}</span></td>
      <td><span class="prog">${esc(prog)}</span></td>
      ${isAssessment ? `<td><span class="sub">${str('prior_coding') === 'yes' ? 'Yes' + (str('prior_platform') ? ': ' + esc(str('prior_platform')) : '') : str('prior_coding') === 'no' ? 'No' : '—'}</span></td><td><span class="sub">${esc(devs || '—')}</span></td><td><span class="sub">${esc(str('learning_goal') || '—')}</span></td><td><span class="sub">${esc(str('preferred_schedule') || '—')}</span></td>` : ''}
      <td><span class="stat ${statCls}">${stat}</span></td>
      <td><span class="sub">${esc(str('special_notes') || '')}</span></td>
    </tr>`;
  }).join('');

  const sigRows = sigs.map((s, i) => {
    const rd   = (s.response_data ?? {}) as Record<string, unknown>;
    const str2 = (k: string) => (rd[k] as string) ?? '';
    const sub  = new Date(s.signed_at);
    return `<tr class="data-row sig-row">
      <td class="num">${leads.length + i + 1}</td>
      <td class="date-col">${sub.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}<br/><span class="time">${sub.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</span></td>
      <td><strong>${esc(s.portal_users?.full_name ?? '—')}</strong><span class="portal-tag">Portal</span><br/><span class="sub">${esc(s.portal_users?.email ?? '')}</span></td>
      <td><strong>${esc(str2('child_name') || '—')}</strong><br/><span class="sub">${str2('child_gender') ? (str2('child_gender') === 'male' ? 'Male' : 'Female') + ' · ' : ''}Age ${esc(str2('child_age') || '—')} · ${esc(str2('child_class') || '—')}</span></td>
      <td>—</td>
      <td><span class="prog">${esc(progLabel(str2('program_category')))}</span></td>
      ${isAssessment ? '<td>—</td><td>—</td><td>—</td><td>—</td>' : ''}
      <td><span class="stat enrolled">Signed</span></td>
      <td></td>
    </tr>`;
  }).join('');

  const totalRows = leads.length + sigs.length;
  win.document.write(`<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8">
<title>Data Sheet — ${esc(form.title)}</title>
<style>
@page{margin:10mm 8mm;size:A4 landscape}*{box-sizing:border-box;margin:0;padding:0}
body{font-family:Arial,Helvetica,sans-serif;font-size:8pt;color:#111;background:#fff}
.letterhead{background:#0d0d0f;padding:14px 18px;display:flex;align-items:center;justify-content:space-between;gap:16px}
.letterhead-logo{height:40px;width:auto;object-fit:contain}
.letterhead-div{width:1px;height:38px;background:rgba(255,255,255,0.2)}
.co-name{font-size:13pt;font-weight:900;color:#fff}.co-tag{font-size:6.5pt;color:#999;letter-spacing:1.5px;text-transform:uppercase;margin-top:2px}
.lh-contact{text-align:right;color:#999;font-size:7pt;line-height:1.7}
.accent-strip{height:3px;background:linear-gradient(90deg,#f5a623,#f5c84a)}
.doc-hdr{padding:10px 18px 8px;display:flex;justify-content:space-between;align-items:flex-end;border-bottom:1.5px solid #111}
.doc-type{font-size:6.5pt;font-weight:900;letter-spacing:2.5px;text-transform:uppercase;color:#f5a623}
.doc-title{font-size:12pt;font-weight:900;color:#0d0d0f;margin-top:2px}
.doc-meta{text-align:right;font-size:7.5pt;color:#555;line-height:1.8}.doc-meta strong{color:#111}
.stats-bar{display:flex;gap:0;border-bottom:1px solid #e0e0e0}
.stat-cell{flex:1;padding:6px 14px;border-right:1px solid #e0e0e0}.stat-cell:last-child{border-right:none}
.stat-num{font-size:13pt;font-weight:900;color:#0d0d0f;line-height:1}
.stat-lbl{font-size:6pt;font-weight:700;text-transform:uppercase;letter-spacing:1.5px;color:#888;margin-top:2px}
.wrap{padding:0 8px 12px}
table{width:100%;border-collapse:collapse;margin-top:8px}
thead th{background:#0d0d0f;color:#fff;font-size:7pt;font-weight:700;letter-spacing:0.5px;text-transform:uppercase;padding:6px 7px;text-align:left;white-space:nowrap;border-right:1px solid #333}
thead th:last-child{border-right:none}
.data-row td{padding:6px 7px;border-bottom:1px solid #ebebeb;vertical-align:top;font-size:7.5pt;border-right:1px solid #f0f0f0}
.data-row:nth-child(even) td{background:#f9f9f9}.sig-row td{background:#f0f8ff!important}
.num{color:#aaa;font-size:7pt;text-align:center;width:24px}.date-col{white-space:nowrap;width:72px}
.time{color:#999;font-size:6.5pt}.sub{color:#666;font-size:7pt;display:block;margin-top:1px}
strong{font-size:8pt}
.prog{display:inline-block;background:#0d0d0f;color:#f5a623;font-size:6.5pt;font-weight:900;padding:2px 6px;border-radius:3px;white-space:nowrap}
.stat{display:inline-block;font-size:6.5pt;font-weight:900;padding:2px 6px;border-radius:3px;white-space:nowrap}
.new-s{background:#fff7e0;color:#b45309}.contacted{background:#e0f0ff;color:#1d4ed8}
.enrolled{background:#e0f9ec;color:#166534}.lost{background:#f0f0f0;color:#777}
.portal-tag{display:inline-block;background:#0369a1;color:#fff;font-size:6pt;font-weight:700;padding:1px 5px;border-radius:3px;margin-left:4px}
.page-footer{padding:6px 18px;border-top:1px solid #ccc;display:flex;justify-content:space-between;align-items:center;font-size:6.5pt;color:#999}
.page-footer strong{color:#555}
.print-btn{position:fixed;top:14px;right:14px;background:#0d0d0f;color:#fff;border:none;padding:10px 20px;font-size:13px;font-weight:bold;border-radius:8px;cursor:pointer;box-shadow:0 4px 14px rgba(0,0,0,0.25);z-index:1000;font-family:Arial}
@media print{.print-btn{display:none!important}}
</style></head><body>
<button class="print-btn" onclick="window.print()">🖨️ Print Sheet</button>
<div class="letterhead">
  <img src="${appBase}/images/logoB.png" class="letterhead-logo" alt="Rillcod" />
  <div class="letterhead-div"></div>
  <div><div class="co-name">${schoolName ? esc(schoolName.toUpperCase()) : 'RILLCOD TECHNOLOGIES'}</div><div class="co-tag">${schoolName ? 'via Rillcod Technologies' : 'Empowering Young Minds Through Code'}</div></div>
  <div class="lh-contact">+234 811 660 0091 · support@rillcod.com · www.rillcod.com</div>
</div>
<div class="accent-strip"></div>
<div class="doc-hdr">
  <div><div class="doc-type">Response Data Sheet</div><div class="doc-title">${esc(form.title)}</div></div>
  <div class="doc-meta"><div><strong>Printed:</strong> ${printed}</div><div><strong>Form Type:</strong> ${form.form_type === 'assessment' ? 'Assessment' : 'Registration'}</div>${schoolName ? `<div><strong>School:</strong> ${esc(schoolName)}</div>` : ''}${form.due_date ? `<div><strong>Deadline:</strong> ${new Date(form.due_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}</div>` : ''}</div>
</div>
<div class="stats-bar">
  <div class="stat-cell"><div class="stat-num">${totalRows}</div><div class="stat-lbl">Total</div></div>
  <div class="stat-cell"><div class="stat-num">${leads.length}</div><div class="stat-lbl">Public Registrations</div></div>
  <div class="stat-cell"><div class="stat-num">${sigs.length}</div><div class="stat-lbl">Portal Signatures</div></div>
  <div class="stat-cell"><div class="stat-num">${leads.filter(l => l.status === 'enrolled').length}</div><div class="stat-lbl">Enrolled</div></div>
  <div class="stat-cell"><div class="stat-num">${leads.filter(l => l.status === 'contacted').length}</div><div class="stat-lbl">Contacted</div></div>
  <div class="stat-cell"><div class="stat-num">${leads.filter(l => (l.response_data as Record<string,unknown>)?.program_category === 'young_innovators').length}</div><div class="stat-lbl">Young Innovators</div></div>
  <div class="stat-cell"><div class="stat-num">${leads.filter(l => (l.response_data as Record<string,unknown>)?.program_category === 'teen_developers').length}</div><div class="stat-lbl">Teen Developers</div></div>
</div>
<div class="wrap"><table>
  <thead><tr>
    <th>#</th><th>Date / Time</th><th>Parent / Guardian</th><th>Child</th><th>Child&apos;s School</th><th>Programme</th>
    ${isAssessment ? '<th>Prior Coding</th><th>Device(s)</th><th>Goal</th><th>Schedule</th>' : ''}
    <th>Status</th><th>Notes</th>
  </tr></thead>
  <tbody>
    ${leadRows}${sigRows}
    ${totalRows === 0 ? '<tr><td colspan="100" style="text-align:center;padding:20px;color:#aaa;font-style:italic;">No responses recorded yet.</td></tr>' : ''}
  </tbody>
</table></div>
<div class="page-footer">
  <span>Rillcod Technologies — <strong>${esc(form.title)}</strong></span>
  <span>Generated ${printed} · ${totalRows} record${totalRows !== 1 ? 's' : ''}</span>
  <span>Confidential — For internal use only</span>
</div>
</body></html>`);
  win.document.close();
}

function isChildLinkedToParent(
  childName: string,
  parentLinksForThisParent: Array<{ student_id: string; studentName: string; studentPortalId: string }>
) {
  if (!childName) return null;
  const nameParts = childName.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter(Boolean);
  if (nameParts.length === 0) return null;

  for (const pl of parentLinksForThisParent) {
    const plName = pl.studentName.toLowerCase().replace(/[^a-z0-9\s]/g, '');
    // Exact or substring match first
    if (plName === childName.toLowerCase() || plName.includes(childName.toLowerCase()) || childName.toLowerCase().includes(plName)) {
      return pl;
    }
    // Token overlap match
    const plParts = plName.split(/\s+/).filter(Boolean);
    const overlap = nameParts.filter(part => plParts.includes(part)).length;
    if (overlap >= 2 || (nameParts.length === 1 && overlap === 1)) {
      return pl;
    }
  }
  return null;
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function ResponsesPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { profile } = useAuth();

  const [form, setForm]       = useState<ConsentForm | null>(null);
  const [leads, setLeads]     = useState<FormLead[]>([]);
  const [sigs, setSigs]       = useState<Signatory[]>([]);
  const [loading, setLoading] = useState(true);

  const [search, setSearch]             = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [progFilter, setProgFilter]     = useState<string>('all');
  const [schoolFilter, setSchoolFilter] = useState<string>('all');
  const [classFilter, setClassFilter]   = useState<string>('all');
  const [activeTab, setActiveTab]       = useState<'leads' | 'signed' | 'portal-log'>('leads');

  const [updatingId, setUpdatingId]     = useState<string | null>(null);
  const [creatingPortalId, setCreatingPortalId] = useState<string | null>(null);
  const [deletingPortalId, setDeletingPortalId] = useState<string | null>(null);
  const [deletingLeadId, setDeletingLeadId] = useState<string | null>(null);
  const [revertingLeadId, setRevertingLeadId] = useState<string | null>(null);
  const [portalStatus, setPortalStatus] = useState<Record<string, 'created' | 'exists'>>({});
  const [credsModal, setCredsModal] = useState<{ email: string; password: string; parentName: string } | null>(null);

  // Class picker for portal creation — prefer existing classes as suggestions.
  const [classModal, setClassModal] = useState<{ leadId: string; parentName: string } | null>(null);
  const [classChoice, setClassChoice] = useState('');
  const [schoolClasses, setSchoolClasses] = useState<{ id: string; name: string }[]>([]);
  const [classesLoading, setClassesLoading] = useState(false);

  // Child link
  const [linkChildLeadId, setLinkChildLeadId]   = useState<string | null>(null);
  const [linkChildIndex, setLinkChildIndex]      = useState(0);
  const [additionalLinks, setAdditionalLinks]    = useState<Record<string, Array<{ childIndex: number; studentId: string; studentName: string }>>>({});
  const [studentSearch, setStudentSearch]        = useState('');
  type StudentOpt = { id: string; full_name: string; section_class: string | null; school_name?: string | null; suggested?: boolean; already_linked?: boolean; linked_parent?: string | null };
  const [studentOptions, setStudentOptions]      = useState<StudentOpt[]>([]);
  const [allStudentOptions, setAllStudentOptions] = useState<StudentOpt[]>([]);
  const [studentsLoading, setStudentsLoading]    = useState(false);
  const [linkingStudentId, setLinkingStudentId]  = useState<string | null>(null);

  // Bulk selection
  const [selected, setSelected]         = useState<Set<string>>(new Set());
  const [bulkUpdating, setBulkUpdating] = useState(false);
  const [bulkStatus, setBulkStatus]     = useState<FormLead['status']>('contacted');

  // Match review
  const [reviewingId, setReviewingId]   = useState<string | null>(null);

  // Export
  const [exporting, setExporting]       = useState(false);

  // Bulk portal
  const [bulkPortalLoading, setBulkPortalLoading] = useState(false);
  const [bulkPortalResult, setBulkPortalResult] = useState<{ created: number; skipped: number; no_email: number; errors: number } | null>(null);

  // WhatsApp blast
  const [waBlastOpen, setWaBlastOpen] = useState(false);
  const [waMessage, setWaMessage]     = useState('');
  const [waSending, setWaSending]     = useState(false);
  const [waResult, setWaResult]       = useState<{ sent: number; failed: number; total: number } | null>(null);

  // QR download
  const qrSvgWrapperRef = useRef<HTMLDivElement>(null);
  const [downloadingQr, setDownloadingQr] = useState(false);

  // Dedup (admin)
  const [deduping, setDeduping]     = useState(false);
  const [dedupResult, setDedupResult] = useState<{ merged: number; deleted: number } | null>(null);

  const appBase = typeof window !== 'undefined' ? window.location.origin : '';

  const isStaff = ['teacher', 'admin', 'school'].includes(profile?.role ?? '');

  // ── Fetch ────────────────────────────────────────────────────────────────

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res  = await fetch(`/api/consent-forms/${id}`);
      const json = await res.json();
      setForm(json.form ?? null);
      setLeads(json.leads ?? []);
      setSigs(json.data  ?? []);

      // Populate initial additionalLinks from database parentLinks to survive page reloads
      if (json.parentLinks && json.leads) {
        const initialLinks: Record<string, Array<{ childIndex: number; studentId: string; studentName: string }>> = {};
        for (const lead of json.leads) {
          if (!lead.matched_parent_id) continue;
          const rd = lead.response_data as Record<string, unknown>;
          const childrenArr = Array.isArray(rd.children) ? (rd.children as Array<Record<string, string>>) : null;
          if (childrenArr && childrenArr.length > 1) {
            const linksForParent = (json.parentLinks as any[]).filter(pl => pl.parent_id === lead.matched_parent_id);
            const leadAddLinks: Array<{ childIndex: number; studentId: string; studentName: string }> = [];
            for (let ci = 1; ci < childrenArr.length; ci++) {
              const child = childrenArr[ci];
              const match = isChildLinkedToParent(child.name, linksForParent);
              if (match) {
                leadAddLinks.push({
                  childIndex: ci,
                  studentId: match.student_id,
                  studentName: match.studentName,
                });
              }
            }
            if (leadAddLinks.length > 0) {
              initialLinks[lead.id] = leadAddLinks;
            }
          }
        }
        setAdditionalLinks(initialLinks);
      }
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  // ── Lead status update ───────────────────────────────────────────────────

  async function updateStatus(leadId: string, status: FormLead['status']) {
    setUpdatingId(leadId);
    try {
      const res = await fetch(`/api/consent-forms/leads/${leadId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) return;
      setLeads(prev => prev.map(l => l.id === leadId ? { ...l, status } : l));
    } finally {
      setUpdatingId(null);
    }
  }

  // ── Create portal account ────────────────────────────────────────────────

  // Open the class picker (loads existing classes — preferred as suggestions).
  async function openClassPicker(leadId: string, parentName: string) {
    setClassModal({ leadId, parentName });
    setClassChoice('');
    setClassesLoading(true);
    try {
      const db = createClient();
      const formSchoolId = (form as any)?.school_id as string | undefined;
      let q = db.from('classes').select('id, name, school_id').order('name');
      if (formSchoolId) q = q.eq('school_id', formSchoolId) as typeof q;
      const { data } = await q;
      setSchoolClasses((data ?? []).map((c: any) => ({ id: c.id, name: c.name })));
    } catch {
      setSchoolClasses([]);
    } finally {
      setClassesLoading(false);
    }
  }

  async function createPortalAccount(leadId: string, parentName: string, classOpt?: { classId?: string; className?: string }) {
    setCreatingPortalId(leadId);
    try {
      const res = await fetch(`/api/consent-forms/leads/${leadId}/create-portal-account`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(classOpt ?? {}),
      });
      const json = await res.json();
      if (!res.ok) {
        alert(json.error ?? 'Failed to create account');
        return;
      }
      setClassModal(null);
      setPortalStatus(prev => ({ ...prev, [leadId]: json.alreadyExisted ? 'exists' : 'created' }));
      if (json.studentsOnboarded) {
        toast.success(`${json.studentsOnboarded} student account(s) created & linked${json.newStudents?.length ? `: ${json.newStudents.map((s: any) => s.name).join(', ')}` : ''}.`);
      }
      if (!json.alreadyExisted) {
        setLeads(prev => prev.map(l => l.id === leadId ? { ...l, matched_parent_id: json.parentId } : l));
        setCredsModal({ email: json.email, password: json.tempPassword, parentName });
      } else {
        setLeads(prev => prev.map(l => l.id === leadId ? { ...l, matched_parent_id: json.parentId ?? l.matched_parent_id } : l));
      }
    } finally {
      setCreatingPortalId(null);
    }
  }

  // ── Delete portal account ────────────────────────────────────────────────

  async function deletePortalAccount(leadId: string, parentName: string) {
    if (!confirm(`Remove portal account for ${parentName}? This will permanently delete their login access.`)) return;
    setDeletingPortalId(leadId);
    try {
      const res = await fetch(`/api/consent-forms/leads/${leadId}/create-portal-account`, {
        method: 'DELETE',
      });
      const json = await res.json();
      if (!res.ok) { alert(json.error ?? 'Failed to remove account'); return; }
      setLeads(prev => prev.map(l => l.id === leadId ? { ...l, matched_parent_id: null } : l));
      setPortalStatus(prev => { const next = { ...prev }; delete next[leadId]; return next; });
    } finally {
      setDeletingPortalId(null);
    }
  }

  // ── Revert: undo account creation, keep the submission for re-processing ──
  async function revertLead(leadId: string, who: string) {
    if (!confirm(`Undo account creation for ${who}?\n\nThis deletes the parent and student login(s) created from this submission (orphan-aware) and returns the lead to "just submitted" so you can process it again. The submitted response is kept.`)) return;
    setRevertingLeadId(leadId);
    try {
      const res = await fetch(`/api/consent-forms/leads/${leadId}/revert`, { method: 'POST' });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) { alert(json.error ?? 'Failed to revert'); return; }
      // Reset the lead in place — back to a fresh, processable submission.
      setLeads(prev => prev.map(l => l.id === leadId ? {
        ...l, matched_student_id: null, matched_parent_id: null, match_candidate_id: null, status: 'new',
      } : l));
      setPortalStatus(prev => { const next = { ...prev }; delete next[leadId]; return next; });
    } finally {
      setRevertingLeadId(null);
    }
  }

  // ── Permanent delete: the stronger action — wipes accounts AND the submission ──
  async function deleteLead(leadId: string, who: string) {
    if (!confirm(`PERMANENTLY delete this lead (${who})?\n\nThis erases the submitted response AND hard-deletes every account uniquely created from it (parent + student logins). Shared records are kept. This cannot be undone.\n\nTo only undo the account creation and keep the submission, use "Revert" instead.`)) return;
    setDeletingLeadId(leadId);
    try {
      const res = await fetch(`/api/consent-forms/leads/${leadId}`, { method: 'DELETE' });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) { alert(json.error ?? 'Failed to delete lead'); return; }
      setLeads(prev => prev.filter(l => l.id !== leadId));
      setSelected(prev => { const next = new Set(prev); next.delete(leadId); return next; });
    } finally {
      setDeletingLeadId(null);
    }
  }

  // ── Link child to parent portal account ─────────────────────────────────

  async function openLinkChild(leadId: string, _childName: string, childIndex = 0) {
    setLinkChildLeadId(leadId);
    setLinkChildIndex(childIndex);
    setStudentSearch('');
    setStudentsLoading(true);
    setStudentOptions([]);
    setAllStudentOptions([]);
    try {
      // Lead-scoped, name-ranked candidates (correct school, best matches first).
      const res  = await fetch(`/api/consent-forms/leads/${leadId}/match-students?child_index=${childIndex}`);
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(json.error ?? 'Could not load students for linking');
        return;
      }
      const all = (json.students ?? []) as StudentOpt[];
      setAllStudentOptions(all);
      setStudentOptions(all);
    } catch {
      toast.error('Could not load students for linking');
    } finally {
      setStudentsLoading(false);
    }
  }

  function filterStudentOptions(q: string) {
    const lower = q.trim().toLowerCase();
    setStudentSearch(q);
    setStudentOptions(lower ? allStudentOptions.filter(s => s.full_name.toLowerCase().includes(lower)) : allStudentOptions);
  }

  async function linkStudentToParent(leadId: string, studentPortalId: string) {
    setLinkingStudentId(studentPortalId);
    const thisChildIndex = linkChildIndex;
    const studentName = studentOptions.find(s => s.id === studentPortalId)?.full_name ?? '';
    const toastId = toast.loading(`Linking ${studentName} to parent portal account...`);
    try {
      const res = await fetch(`/api/consent-forms/leads/${leadId}/create-portal-account`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ student_portal_id: studentPortalId, child_index: thisChildIndex }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(json.error ?? 'Failed to link student', { id: toastId });
        return;
      }
      if (thisChildIndex === 0) {
        setLeads(prev => prev.map(l => l.id === leadId ? { ...l, matched_student_id: json.student_id } : l));
      } else {
        setAdditionalLinks(prev => ({
          ...prev,
          [leadId]: [...(prev[leadId] ?? []).filter(l => l.childIndex !== thisChildIndex),
                     { childIndex: thisChildIndex, studentId: json.student_id, studentName }],
        }));
      }
      toast.success(`Linked ${studentName} to parent portal account!`, { id: toastId });
      setLinkChildLeadId(null);
    } catch (err: any) {
      toast.error(err.message ?? 'An error occurred while linking child', { id: toastId });
    } finally {
      setLinkingStudentId(null);
    }
  }

  // ── Bulk status update ───────────────────────────────────────────────────

  async function applyBulkStatus() {
    if (selected.size === 0) return;
    setBulkUpdating(true);
    try {
      const res = await fetch('/api/consent-forms/leads/bulk-status', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leadIds: [...selected], status: bulkStatus }),
      });
      if (!res.ok) return;
      setLeads(prev => prev.map(l => selected.has(l.id) ? { ...l, status: bulkStatus } : l));
      setSelected(new Set());
    } finally {
      setBulkUpdating(false);
    }
  }

  // ── Bulk portal creation ─────────────────────────────────────────────────
  async function bulkCreatePortals() {
    const ids = [...selected];
    if (ids.length === 0) return;
    setBulkPortalLoading(true);
    setBulkPortalResult(null);
    try {
      const res = await fetch('/api/consent-forms/leads/bulk-portals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leadIds: ids }),
      });
      const json = await res.json();
      setBulkPortalResult(json);
      await load();
    } catch { /* non-fatal */ } finally {
      setBulkPortalLoading(false);
    }
  }

  // ── Bulk WhatsApp blast ───────────────────────────────────────────────────
  async function sendBulkWhatsApp() {
    const ids = [...selected];
    if (ids.length === 0 || !waMessage.trim()) return;
    setWaSending(true);
    setWaResult(null);
    try {
      const res = await fetch('/api/consent-forms/leads/bulk-whatsapp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leadIds: ids, message: waMessage }),
      });
      const json = await res.json();
      setWaResult(json);
      setWaBlastOpen(false);
      setWaMessage('');
    } catch { /* non-fatal */ } finally {
      setWaSending(false);
    }
  }

  // ── Branded QR PNG download ───────────────────────────────────────────────
  async function downloadBrandedQr() {
    const svgEl = qrSvgWrapperRef.current?.querySelector('svg') as SVGSVGElement | null;
    if (!svgEl || !form) return;
    setDownloadingQr(true);
    try {
      await downloadQrCard(
        svgEl,
        form.schools?.name ?? 'Rillcod Technologies',
        form.title,
        `qr-${form.title.replace(/[^a-z0-9]/gi, '-').toLowerCase()}.png`,
      );
    } catch { /* non-fatal */ } finally {
      setDownloadingQr(false);
    }
  }

  // ── Smart lead score ──────────────────────────────────────────────────────
  function leadScore(lead: FormLead): { label: 'Hot' | 'Warm' | 'Cold'; cls: string } {
    if (lead.status === 'enrolled') return { label: 'Hot', cls: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20' };
    if (lead.status === 'lost')     return { label: 'Cold', cls: 'text-muted-foreground bg-muted/40 border-border/30' };
    const rd = (lead.response_data ?? {}) as Record<string, string>;
    let score = 0;
    if (rd.parent_email || lead.email) score += 1;
    if (rd.parent_whatsapp) score += 1;
    if (lead.match_confidence === 'high') score += 3;
    else if (lead.match_confidence === 'medium') score += 1;
    if (lead.matched_parent_id) score += 2;
    if (lead.matched_student_id) score += 1;
    if (lead.status === 'contacted') score += 1;
    if (score >= 5) return { label: 'Hot',  cls: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20' };
    if (score >= 2) return { label: 'Warm', cls: 'text-amber-400 bg-amber-500/10 border-amber-500/20' };
    return { label: 'Cold', cls: 'text-blue-400 bg-blue-500/10 border-blue-500/20' };
  }

  // ── Programme suggestion by age ───────────────────────────────────────────
  function suggestProg(age: string | undefined): string | null {
    const n = parseInt(age ?? '', 10);
    if (isNaN(n)) return null;
    if (n >= 5  && n <= 10) return 'Young Innovators';
    if (n >= 11 && n <= 19) return 'Teen Developers';
    return null;
  }

  // ── CRM dedup (admin) ─────────────────────────────────────────────────────
  async function runDedup() {
    if (!confirm('Scan and merge duplicate CRM contacts? This cannot be undone.')) return;
    setDeduping(true);
    setDedupResult(null);
    try {
      const res = await fetch('/api/crm/dedup', { method: 'POST' });
      const json = await res.json();
      setDedupResult(json);
    } catch { /* non-fatal */ } finally {
      setDeduping(false);
    }
  }

  function toggleSelect(leadId: string) {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(leadId)) next.delete(leadId); else next.add(leadId);
      return next;
    });
  }

  function toggleSelectAll() {
    if (selected.size === filteredLeads.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(filteredLeads.map(l => l.id)));
    }
  }

  // ── Match review ─────────────────────────────────────────────────────────

  async function reviewLead(leadId: string, action: 'approve' | 'reject') {
    setReviewingId(leadId);
    try {
      const res = await fetch(`/api/consent-forms/leads/${leadId}/review`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      const json = await res.json();
      if (!res.ok) { alert(json.error ?? 'Failed to update — please try again'); return; }
      setLeads(prev => prev.map(l => l.id === leadId ? {
        ...l,
        match_status:       json.status,
        matched_student_id: json.matched_student_id ?? l.matched_student_id,
        matched_parent_id:  json.matched_parent_id  ?? l.matched_parent_id,
        match_candidate:    action === 'reject' ? null : l.match_candidate,
      } : l));
    } finally {
      setReviewingId(null);
    }
  }

  // ── Export CSV ───────────────────────────────────────────────────────────

  async function exportCsv() {
    setExporting(true);
    try {
      const params = statusFilter !== 'all' ? `?status=${statusFilter}` : '';
      const res = await fetch(`/api/consent-forms/${id}/leads/export${params}`);
      if (!res.ok) return;
      const blob = await res.blob();
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href = url;
      a.download = res.headers.get('content-disposition')?.match(/filename="([^"]+)"/)?.[1] ?? 'leads.csv';
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setExporting(false);
    }
  }

  // ── Derived filter options ───────────────────────────────────────────────

  const uniqueSchools = useMemo(() => {
    const s = new Set<string>();
    leads.forEach(l => { const v = l.child_current_school || (l.response_data as Record<string,string>)?.child_current_school; if (v?.trim()) s.add(v.trim()); });
    return [...s].sort();
  }, [leads]);

  const uniqueClasses = useMemo(() => {
    const s = new Set<string>();
    leads.forEach(l => { const v = (l.response_data as Record<string,string>)?.child_class; if (v?.trim()) s.add(v.trim()); });
    sigs.forEach(s2 => { const v = (s2.response_data as Record<string,string>)?.child_class; if (v?.trim()) s.add(v.trim()); });
    return [...s].sort();
  }, [leads, sigs]);

  // ── Filtered views ───────────────────────────────────────────────────────

  const filteredLeads = useMemo(() => {
    const q = search.toLowerCase();
    return leads.filter(lead => {
      const rd  = lead.response_data as Record<string, string>;
      const matchSearch = !q
        || (rd.parent_name ?? '').toLowerCase().includes(q)
        || (rd.child_name  ?? '').toLowerCase().includes(q)
        || (lead.email     ?? '').toLowerCase().includes(q)
        || (rd.parent_email ?? '').toLowerCase().includes(q)
        || (rd.parent_whatsapp ?? '').includes(q);
      const matchStatus = statusFilter === 'all' || lead.status === statusFilter;
      const matchProg   = progFilter   === 'all' || (rd.program_category ?? '') === progFilter;
      const matchSchool = schoolFilter === 'all' || (lead.child_current_school ?? rd.child_current_school ?? '') === schoolFilter;
      const matchClass  = classFilter  === 'all' || (rd.child_class ?? '') === classFilter;
      return matchSearch && matchStatus && matchProg && matchSchool && matchClass;
    });
  }, [leads, search, statusFilter, progFilter, schoolFilter, classFilter]);

  const filteredSigs = useMemo(() => {
    const q = search.toLowerCase();
    return sigs.filter(s => {
      const rd = (s.response_data ?? {}) as Record<string, string>;
      const matchSearch = !q
        || (s.portal_users?.full_name ?? '').toLowerCase().includes(q)
        || (s.portal_users?.email     ?? '').toLowerCase().includes(q);
      const matchClass = classFilter === 'all' || (rd.child_class ?? '') === classFilter;
      return matchSearch && matchClass;
    });
  }, [sigs, search, classFilter]);

  // ── Stats ────────────────────────────────────────────────────────────────

  const enrolled   = leads.filter(l => l.status === 'enrolled').length;
  const contacted  = leads.filter(l => l.status === 'contacted').length;
  const youngCount = leads.filter(l => (l.response_data as Record<string,unknown>)?.program_category === 'young_innovators').length;
  const teenCount  = leads.filter(l => (l.response_data as Record<string,unknown>)?.program_category === 'teen_developers').length;

  // ── Guard ────────────────────────────────────────────────────────────────

  if (!isStaff && !loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-muted-foreground">Access denied.</p>
      </div>
    );
  }

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="max-w-7xl mx-auto px-4 py-8 space-y-6">

        {/* Header */}
        <div className="flex items-start gap-4">
          <button
            onClick={() => router.push('/dashboard/consent-forms')}
            className="mt-0.5 p-2 rounded-xl hover:bg-muted transition-colors shrink-0"
          >
            <ArrowLeftIcon className="w-4 h-4 text-muted-foreground" />
          </button>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-[10px] font-black text-primary uppercase tracking-widest">Consent Forms</span>
              <span className="text-muted-foreground text-xs">›</span>
              <span className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">Responses</span>
            </div>
            {loading ? (
              <div className="h-7 w-64 bg-muted animate-pulse rounded-lg" />
            ) : (
              <h1 className="text-2xl font-black truncate">{form?.title ?? 'Responses'}</h1>
            )}
            {form && (
              <div className="flex flex-wrap items-center gap-2 mt-1">
                {form.schools?.name && (
                  <span className="text-[9px] font-black uppercase tracking-widest text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-full">
                    🏫 {form.schools.name}
                  </span>
                )}
                {form.form_type !== 'general' && (
                  <span className="text-[9px] font-black uppercase tracking-widest text-primary">
                    {form.form_type === 'assessment' ? '🔍 Assessment' : '📋 Registration'}
                  </span>
                )}
                {form.due_date && (
                  <span className="text-[10px] text-muted-foreground">
                    · Due {new Date(form.due_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </span>
                )}
                {form.is_public && (
                  <span className="text-[9px] font-black text-primary bg-primary/10 border border-primary/20 px-2 py-0.5 rounded-full">Public</span>
                )}
              </div>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={load}
              className="p-2 rounded-xl hover:bg-muted transition-colors"
              title="Refresh"
            >
              <ArrowPathIcon className={`w-4 h-4 text-muted-foreground ${loading ? 'animate-spin' : ''}`} />
            </button>
            {form && (
              <>
                <button
                  onClick={exportCsv}
                  disabled={exporting}
                  className="flex items-center gap-1.5 px-3 py-2 bg-muted hover:bg-muted/80 text-foreground text-xs font-bold rounded-xl transition-colors border border-border/50 disabled:opacity-50"
                  title="Download leads as CSV"
                >
                  <ArrowDownTrayIcon className="w-3.5 h-3.5" />
                  {exporting ? 'Exporting…' : 'Export CSV'}
                </button>
                <button
                  onClick={() => printDataSheet(form, leads, sigs, appBase)}
                  className="flex items-center gap-1.5 px-3 py-2 bg-muted hover:bg-muted/80 text-foreground text-xs font-bold rounded-xl transition-colors border border-border/50"
                >
                  <PrinterIcon className="w-3.5 h-3.5" /> Data Sheet
                </button>
                <button
                  onClick={downloadBrandedQr}
                  disabled={downloadingQr || !form}
                  className="flex items-center gap-1.5 px-3 py-2 bg-muted hover:bg-muted/80 text-foreground text-xs font-bold rounded-xl transition-colors border border-border/50 disabled:opacity-50"
                  title="Download branded QR code for this form"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" />
                  </svg>
                  {downloadingQr ? '…' : 'QR'}
                </button>
              </>
            )}
            {profile?.role === 'admin' && (
              <button
                onClick={runDedup}
                disabled={deduping}
                className="flex items-center gap-1.5 px-3 py-2 bg-muted hover:bg-muted/80 text-foreground text-xs font-bold rounded-xl transition-colors border border-border/50 disabled:opacity-50"
                title="Merge duplicate CRM contacts"
              >
                {deduping ? '…' : '🔗 Dedup CRM'}
              </button>
            )}
            {dedupResult && (
              <span className="text-[9px] font-bold text-emerald-400">✓ {dedupResult.merged} merged</span>
            )}
          </div>
        </div>

        {/* Stats + Funnel */}
        {!loading && leads.length > 0 && (() => {
          const total     = leads.length;
          const newCount  = leads.filter(l => l.status === 'new').length;
          const contacted2 = leads.filter(l => l.status === 'contacted').length;
          const enrolled2  = leads.filter(l => l.status === 'enrolled').length;
          const lost2      = leads.filter(l => l.status === 'lost').length;
          const convRate   = total > 0 ? Math.round((enrolled2 / total) * 100) : 0;
          const hasPortal  = leads.filter(l => l.matched_parent_id).length;
          return (
            <div className="space-y-3">
              {/* Stat tiles */}
              <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
                {[
                  { label: 'Total',     value: total,      cls: 'text-foreground' },
                  { label: 'New',       value: newCount,   cls: 'text-amber-400' },
                  { label: 'Contacted', value: contacted2, cls: 'text-blue-400' },
                  { label: 'Enrolled',  value: enrolled2,  cls: 'text-emerald-400' },
                  { label: 'Lost',      value: lost2,      cls: 'text-muted-foreground' },
                  { label: 'Portals',   value: hasPortal,  cls: 'text-primary' },
                  { label: 'Conv. %',   value: `${convRate}%`, cls: convRate >= 30 ? 'text-emerald-400' : convRate >= 10 ? 'text-amber-400' : 'text-rose-400' },
                ].map(s => (
                  <div key={s.label} className="bg-card border border-border/50 rounded-xl p-3 text-center">
                    <p className={`text-xl font-black ${s.cls}`}>{s.value}</p>
                    <p className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest mt-0.5 leading-tight">{s.label}</p>
                  </div>
                ))}
              </div>
              {/* Conversion funnel bar */}
              <div className="bg-card border border-border/50 rounded-xl p-4">
                <p className="text-[9px] font-black text-muted-foreground uppercase tracking-widest mb-3">Conversion Funnel</p>
                <div className="flex items-end gap-1 h-10">
                  {[
                    { label: 'New',       n: newCount,   color: 'bg-amber-500' },
                    { label: 'Contacted', n: contacted2, color: 'bg-blue-500' },
                    { label: 'Enrolled',  n: enrolled2,  color: 'bg-emerald-500' },
                    { label: 'Lost',      n: lost2,      color: 'bg-zinc-600' },
                  ].map(({ label, n, color }) => (
                    <div key={label} className="flex-1 flex flex-col items-center gap-1">
                      <span className="text-[9px] font-black text-muted-foreground">{n}</span>
                      <div
                        className={`w-full rounded-t ${color}`}
                        style={{ height: total > 0 ? `${Math.max(4, Math.round((n / total) * 36))}px` : '4px' }}
                      />
                      <span className="text-[8px] text-muted-foreground hidden sm:block">{label}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          );
        })()}

        {/* Bulk portal result banner */}
        {bulkPortalResult && (
          <div className="flex items-center gap-3 px-4 py-2.5 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-sm">
            <span className="text-emerald-400 font-black">🏦 Portals:</span>
            <span className="text-foreground">{bulkPortalResult.created} created · {bulkPortalResult.skipped} skipped · {bulkPortalResult.no_email} no email · {bulkPortalResult.errors} errors</span>
            <button onClick={() => setBulkPortalResult(null)} className="ml-auto text-muted-foreground hover:text-foreground text-xs">✕</button>
          </div>
        )}

        {/* Tabs */}
        {(() => {
          const portalLogLeads = leads.filter(l => !!(l.response_data as Record<string, unknown>)?.portal_created_at);
          return (
            <div className="flex gap-1 p-1 bg-muted rounded-xl w-fit">
              <button
                onClick={() => setActiveTab('leads')}
                className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-colors ${activeTab === 'leads' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
              >
                Public Registrations ({leads.length})
              </button>
              <button
                onClick={() => setActiveTab('signed')}
                className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-colors ${activeTab === 'signed' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
              >
                Portal Signatures ({sigs.length})
              </button>
              <button
                onClick={() => setActiveTab('portal-log')}
                className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-colors ${activeTab === 'portal-log' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
              >
                🏦 Portal Log {portalLogLeads.length > 0 && `(${portalLogLeads.length})`}
              </button>
            </div>
          );
        })()}

        {/* Filters */}
        <div className="flex flex-wrap gap-3 items-center">
          <div className="relative flex-1 min-w-48">
            <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <input
              type="search"
              placeholder="Search by name, email, phone…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full bg-card border border-border text-foreground pl-9 pr-4 py-2 rounded-xl text-sm focus:outline-none focus:border-primary transition-colors"
            />
          </div>

          {activeTab === 'leads' && (
            <>
              <div className="flex items-center gap-1.5">
                <FunnelIcon className="w-3.5 h-3.5 text-muted-foreground" />
                <select
                  value={statusFilter}
                  onChange={e => setStatusFilter(e.target.value)}
                  className="bg-card border border-border text-foreground text-xs font-bold px-3 py-2 rounded-xl focus:outline-none focus:border-primary transition-colors"
                >
                  <option value="all">All Status</option>
                  <option value="new">New</option>
                  <option value="contacted">Contacted</option>
                  <option value="enrolled">Enrolled</option>
                  <option value="lost">Lost</option>
                </select>
              </div>
              <select
                value={progFilter}
                onChange={e => setProgFilter(e.target.value)}
                className="bg-card border border-border text-foreground text-xs font-bold px-3 py-2 rounded-xl focus:outline-none focus:border-primary transition-colors"
              >
                <option value="all">All Programmes</option>
                <option value="young_innovators">Young Innovators</option>
                <option value="teen_developers">Teen Developers</option>
              </select>
              {uniqueSchools.length > 0 && (
                <select
                  value={schoolFilter}
                  onChange={e => setSchoolFilter(e.target.value)}
                  className="bg-card border border-border text-foreground text-xs font-bold px-3 py-2 rounded-xl focus:outline-none focus:border-primary transition-colors"
                >
                  <option value="all">All Schools</option>
                  {uniqueSchools.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              )}
            </>
          )}

          {uniqueClasses.length > 0 && (
            <select
              value={classFilter}
              onChange={e => setClassFilter(e.target.value)}
              className="bg-card border border-border text-foreground text-xs font-bold px-3 py-2 rounded-xl focus:outline-none focus:border-primary transition-colors"
            >
              <option value="all">All Classes / Grades</option>
              {uniqueClasses.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          )}

          <span className="text-xs text-muted-foreground ml-auto">
            {activeTab === 'leads' ? filteredLeads.length : activeTab === 'signed' ? filteredSigs.length : leads.filter(l => !!(l.response_data as Record<string, unknown>)?.portal_created_at).length} shown
          </span>
        </div>

        {/* Bulk action bar */}
        {activeTab === 'leads' && selected.size > 0 && (
          <div className="flex items-center gap-3 px-4 py-2.5 bg-primary/10 border border-primary/20 rounded-xl">
            <span className="text-xs font-black text-primary">{selected.size} selected</span>
            <div className="flex items-center gap-2 ml-auto">
              <select
                value={bulkStatus}
                onChange={e => setBulkStatus(e.target.value as FormLead['status'])}
                className="bg-card border border-border text-foreground text-xs font-bold px-2.5 py-1.5 rounded-lg focus:outline-none focus:border-primary"
              >
                <option value="new">→ New</option>
                <option value="contacted">→ Contacted</option>
                <option value="enrolled">→ Enrolled</option>
                <option value="lost">→ Lost</option>
              </select>
              <button
                onClick={applyBulkStatus}
                disabled={bulkUpdating}
                className="px-3 py-1.5 bg-primary text-primary-foreground text-xs font-black rounded-lg disabled:opacity-50 transition-colors"
              >
                {bulkUpdating ? 'Updating…' : 'Apply'}
              </button>
              <button
                onClick={bulkCreatePortals}
                disabled={bulkPortalLoading}
                className="px-3 py-1.5 bg-emerald-500/15 text-emerald-400 text-xs font-black rounded-lg border border-emerald-500/20 hover:bg-emerald-500/25 transition-colors disabled:opacity-50 whitespace-nowrap"
                title="Create portal accounts for selected leads"
              >
                {bulkPortalLoading ? '…Portals' : '🏦 Portals'}
              </button>
              <button
                onClick={() => setWaBlastOpen(true)}
                className="px-3 py-1.5 bg-emerald-500/15 text-emerald-400 text-xs font-black rounded-lg border border-emerald-500/20 hover:bg-emerald-500/25 transition-colors whitespace-nowrap"
                title="Send WhatsApp to selected leads"
              >
                💬 WhatsApp
              </button>
              <button
                onClick={() => setSelected(new Set())}
                className="px-3 py-1.5 bg-muted text-muted-foreground text-xs font-bold rounded-lg hover:bg-muted/80 transition-colors"
              >
                Clear
              </button>
            </div>
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div className="flex justify-center py-20">
            <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        )}

        {/* ── Public leads table ──────────────────────────────────────────── */}
        {!loading && activeTab === 'leads' && (
          <div className="bg-card border border-border/50 rounded-2xl overflow-hidden">
            {filteredLeads.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 gap-2">
                <UserGroupIcon className="w-10 h-10 text-muted-foreground/30" />
                <p className="text-muted-foreground text-sm font-bold">No registrations match your filters</p>
                {(search || statusFilter !== 'all' || progFilter !== 'all') && (
                  <button
                    onClick={() => { setSearch(''); setStatusFilter('all'); setProgFilter('all'); setSchoolFilter('all'); setClassFilter('all'); }}
                    className="text-xs text-primary hover:underline mt-1"
                  >
                    Clear filters
                  </button>
                )}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-border/50 bg-muted/30">
                      <th className="px-3 py-3 w-8">
                        <input
                          type="checkbox"
                          checked={selected.size > 0 && selected.size === filteredLeads.length}
                          ref={el => { if (el) el.indeterminate = selected.size > 0 && selected.size < filteredLeads.length; }}
                          onChange={toggleSelectAll}
                          className="rounded accent-primary cursor-pointer"
                        />
                      </th>
                      <th className="text-left text-[10px] font-black text-muted-foreground uppercase tracking-widest px-4 py-3 w-8">#</th>
                      <th className="text-left text-[10px] font-black text-muted-foreground uppercase tracking-widest px-4 py-3">Date</th>
                      <th className="text-left text-[10px] font-black text-muted-foreground uppercase tracking-widest px-4 py-3">Parent / Guardian</th>
                      <th className="text-left text-[10px] font-black text-muted-foreground uppercase tracking-widest px-4 py-3">Child</th>
                      <th className="text-left text-[10px] font-black text-muted-foreground uppercase tracking-widest px-4 py-3">Child&apos;s School</th>
                      <th className="text-left text-[10px] font-black text-muted-foreground uppercase tracking-widest px-4 py-3">Programme</th>
                      <th className="text-left text-[10px] font-black text-muted-foreground uppercase tracking-widest px-4 py-3">Score</th>
                      {form?.form_type === 'assessment' && (
                        <>
                          <th className="text-left text-[10px] font-black text-muted-foreground uppercase tracking-widest px-4 py-3">Prior Coding</th>
                          <th className="text-left text-[10px] font-black text-muted-foreground uppercase tracking-widest px-4 py-3">Goal</th>
                          <th className="text-left text-[10px] font-black text-muted-foreground uppercase tracking-widest px-4 py-3">Schedule</th>
                        </>
                      )}
                      <th className="text-left text-[10px] font-black text-muted-foreground uppercase tracking-widest px-4 py-3">Match</th>
                      <th className="text-left text-[10px] font-black text-muted-foreground uppercase tracking-widest px-4 py-3">Status</th>
                      <th className="text-right text-[10px] font-black text-muted-foreground uppercase tracking-widest px-4 py-3">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/30">
                    {filteredLeads.map((lead, i) => {
                      const rd  = lead.response_data as Record<string, string>;
                      const waNum = rd.parent_whatsapp?.replace(/\D/g, '');
                      const status = lead.status ?? 'new';
                      const cfg    = STATUS_CFG[status];

                      const isPending  = lead.match_status === 'pending_review';
                      const isApproved = lead.match_status === 'approved';
                      const confCls: Record<string, string> = {
                        high:   'bg-rose-500/10 text-rose-400 border-rose-500/20',
                        medium: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
                        low:    'bg-muted text-muted-foreground border-border/40',
                      };

                      return (
                        <tr key={lead.id} className={`transition-colors group ${isPending ? 'bg-amber-500/5 hover:bg-amber-500/10' : 'hover:bg-muted/20'} ${selected.has(lead.id) ? 'bg-primary/5' : ''}`}>
                          {/* Checkbox */}
                          <td className="px-3 py-3">
                            <input
                              type="checkbox"
                              checked={selected.has(lead.id)}
                              onChange={() => toggleSelect(lead.id)}
                              className="rounded accent-primary cursor-pointer"
                            />
                          </td>
                          {/* # */}
                          <td className="px-4 py-3 text-xs text-muted-foreground">{i + 1}</td>

                          {/* Date */}
                          <td className="px-4 py-3 whitespace-nowrap">
                            <p className="text-xs font-bold text-foreground">{fmtDate(lead.submitted_at)}</p>
                            <p className="text-[10px] text-muted-foreground">{fmtTime(lead.submitted_at)}</p>
                          </td>

                          {/* Parent */}
                          <td className="px-4 py-3 min-w-[180px]">
                            <p className="text-sm font-bold text-foreground">{rd.parent_name || '—'}</p>
                            {(lead.email || rd.parent_email) && (
                              <a href={`mailto:${lead.email ?? rd.parent_email}`} className="text-[10px] text-muted-foreground hover:text-primary transition-colors block truncate max-w-[200px]">
                                {lead.email ?? rd.parent_email}
                              </a>
                            )}
                            {rd.parent_whatsapp && (
                              <a href={`https://wa.me/${waNum}`} target="_blank" rel="noopener noreferrer"
                                className="text-[10px] text-emerald-400 hover:text-emerald-300 transition-colors">
                                💬 {rd.parent_whatsapp}
                              </a>
                            )}
                          </td>

                          {/* Child */}
                          <td className="px-4 py-3 min-w-[140px]">
                            <p className="text-sm font-bold text-foreground">{rd.child_name || '—'}</p>
                            <p className="text-[10px] text-muted-foreground">
                              {[
                                rd.child_gender && (rd.child_gender === 'male' ? '👦 Male' : '👧 Female'),
                                rd.child_age && `Age ${rd.child_age}`,
                                rd.child_class,
                              ].filter(Boolean).join(' · ') || '—'}
                            </p>
                          </td>

                          {/* School */}
                          <td className="px-4 py-3">
                            <p className="text-xs text-muted-foreground max-w-[140px]">
                              {lead.child_current_school || rd.child_current_school || '—'}
                            </p>
                          </td>

                          {/* Programme */}
                          <td className="px-4 py-3">
                            {rd.program_category ? (
                              <span className="text-[10px] font-black px-2 py-1 rounded-lg bg-primary/10 text-primary border border-primary/20">
                                {rd.program_category === 'young_innovators' ? '🚀 Young' : '💻 Teen'}
                              </span>
                            ) : (
                              <span className="text-xs text-muted-foreground">—</span>
                            )}
                          </td>

                          {/* Score */}
                          <td className="px-4 py-3">
                            {(() => {
                              const { label, cls } = leadScore(lead);
                              const ageHint = suggestProg(rd.child_age);
                              const programMismatch = ageHint && rd.program_category &&
                                ((ageHint === 'Young Innovators' && rd.program_category !== 'young_innovators') ||
                                 (ageHint === 'Teen Developers' && rd.program_category !== 'teen_developers'));
                              return (
                                <div className="space-y-1">
                                  <span className={`text-[9px] font-black px-1.5 py-0.5 rounded-full border ${cls}`}>{label}</span>
                                  {programMismatch && (
                                    <p className="text-[8px] text-amber-400" title={`Age ${rd.child_age} → ${ageHint} suggested`}>⚠ {ageHint}?</p>
                                  )}
                                </div>
                              );
                            })()}
                          </td>

                          {/* Assessment extra columns */}
                          {form?.form_type === 'assessment' && (
                            <>
                              <td className="px-4 py-3">
                                <p className="text-xs text-muted-foreground">
                                  {(rd as any).prior_coding === 'yes'
                                    ? `Yes${(rd as any).prior_platform ? `: ${(rd as any).prior_platform}` : ''}`
                                    : (rd as any).prior_coding === 'no' ? 'No' : '—'}
                                </p>
                              </td>
                              <td className="px-4 py-3">
                                <p className="text-xs text-muted-foreground max-w-[120px]">{(rd as any).learning_goal || '—'}</p>
                              </td>
                              <td className="px-4 py-3">
                                <p className="text-xs text-muted-foreground">{(rd as any).preferred_schedule || '—'}</p>
                              </td>
                            </>
                          )}

                          {/* Match */}
                          <td className="px-4 py-3 min-w-[140px]">
                            {isPending && lead.match_candidate ? (
                              <div className="space-y-1.5">
                                <span className={`text-[9px] font-black px-2 py-0.5 rounded-full border ${confCls[lead.match_confidence ?? 'low']}`}>
                                  ⚠ {lead.match_confidence} match
                                </span>
                                <p className="text-[10px] text-foreground font-bold leading-tight">{lead.match_candidate.full_name}</p>
                                <p className="text-[10px] text-muted-foreground">{lead.match_candidate.section_class ?? '—'}</p>
                                <div className="flex gap-1 pt-0.5">
                                  <button
                                    disabled={reviewingId === lead.id}
                                    onClick={() => reviewLead(lead.id, 'approve')}
                                    className="flex-1 py-1 bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-400 text-[9px] font-black rounded-lg border border-emerald-500/20 transition-colors disabled:opacity-40"
                                    title={`Link to ${lead.match_candidate.full_name}`}
                                  >
                                    {reviewingId === lead.id ? '…' : '✓ Same'}
                                  </button>
                                  <button
                                    disabled={reviewingId === lead.id}
                                    onClick={() => reviewLead(lead.id, 'reject')}
                                    className="flex-1 py-1 bg-muted hover:bg-muted/80 text-muted-foreground text-[9px] font-black rounded-lg transition-colors disabled:opacity-40"
                                  >
                                    ✗ New
                                  </button>
                                </div>
                              </div>
                            ) : isApproved ? (
                              <span className="text-[9px] font-black text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-full">
                                ✓ Matched
                              </span>
                            ) : lead.contact_id ? (
                              <span className="text-[9px] font-black text-blue-400 bg-blue-500/10 border border-blue-500/20 px-2 py-0.5 rounded-full">
                                CRM linked
                              </span>
                            ) : (
                              <span className="text-[10px] text-muted-foreground">—</span>
                            )}
                          </td>

                          {/* Status */}
                          <td className="px-4 py-3">
                            <select
                              value={status}
                              disabled={updatingId === lead.id}
                              onChange={e => updateStatus(lead.id, e.target.value as FormLead['status'])}
                              className={`text-[10px] font-bold px-2.5 py-1 rounded-lg border cursor-pointer disabled:opacity-50 outline-none ${cfg.cls}`}
                              style={{ background: 'transparent' }}
                            >
                              {Object.entries(STATUS_CFG).map(([val, c]) => (
                                <option key={val} value={val} className="bg-card text-foreground">{c.label}</option>
                              ))}
                            </select>
                          </td>

                          {/* Actions */}
                          <td className="px-4 py-3">
                            <div className="flex flex-col items-end gap-1.5">
                              <div className="flex items-center justify-end gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                                {waNum && (
                                  <a href={`https://wa.me/${waNum}`} target="_blank" rel="noopener noreferrer"
                                    className="text-[10px] bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-400 px-2 py-1 rounded-lg font-bold transition-colors border border-emerald-500/20"
                                    title="WhatsApp">
                                    💬
                                  </a>
                                )}
                                {(lead.email || rd.parent_email) && (
                                  <a href={`mailto:${lead.email ?? rd.parent_email}`}
                                    className="text-[10px] bg-muted hover:bg-muted/80 text-muted-foreground px-2 py-1 rounded-lg font-bold transition-colors"
                                    title="Email">
                                    ✉️
                                  </a>
                                )}
                                {form && (
                                  <button
                                    onClick={() => printFilledForm(form, lead, appBase)}
                                    className="text-[10px] bg-muted hover:bg-muted/80 text-muted-foreground px-2 py-1 rounded-lg font-bold transition-colors flex items-center gap-1"
                                    title="Print submission"
                                  >
                                    <PrinterIcon className="w-3 h-3" />
                                  </button>
                                )}
                              </div>
                              {/* Create / manage portal account */}
                              {(lead.email || rd.parent_email) && (() => {
                                const ps = portalStatus[lead.id];
                                const hasAccount = ps === 'created' || ps === 'exists' || !!(lead.matched_parent_id);
                                const parentName  = rd.parent_name || 'Parent/Guardian';

                                if (hasAccount) return (
                                  <div className="flex items-center gap-1.5">
                                    <span className="text-[9px] font-black text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-full whitespace-nowrap">
                                      ✓ Portal account
                                    </span>
                                    <button
                                      disabled={deletingPortalId === lead.id}
                                      onClick={() => deletePortalAccount(lead.id, parentName)}
                                      className="text-[9px] font-black px-2 py-0.5 rounded-full bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/20 transition-colors disabled:opacity-50 whitespace-nowrap flex items-center justify-center gap-1"
                                      title="Delete portal account entirely — removes auth, login access and all links"
                                    >
                                      {deletingPortalId === lead.id ? (
                                        <>
                                          <svg className="animate-spin h-2.5 w-2.5 text-rose-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                          </svg>
                                          <span>Removing…</span>
                                        </>
                                      ) : '✕ Remove'}
                                    </button>
                                  </div>
                                );

                                return (
                                  <button
                                    disabled={creatingPortalId === lead.id}
                                    onClick={() => openClassPicker(lead.id, parentName)}
                                    className="text-[9px] font-black px-2 py-0.5 rounded-full bg-primary/10 hover:bg-primary/20 text-primary border border-primary/20 transition-colors disabled:opacity-50 whitespace-nowrap flex items-center justify-center gap-1"
                                    title="Create parent + student portal accounts (choose a class)"
                                  >
                                    {creatingPortalId === lead.id ? (
                                      <>
                                        <svg className="animate-spin h-2.5 w-2.5 text-primary" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                        </svg>
                                        <span>Creating…</span>
                                      </>
                                    ) : '+ Portal Account'}
                                  </button>
                                );
                              })()}

                              {/* Revert — undo account creation, keep the submission (only when an account exists) */}
                              {(lead.matched_parent_id || lead.matched_student_id) && (
                                <button
                                  disabled={revertingLeadId === lead.id}
                                  onClick={() => revertLead(lead.id, rd.parent_name || rd.child_name || lead.email || 'this lead')}
                                  className="text-[9px] font-black px-2 py-0.5 rounded-full bg-amber-500/5 hover:bg-amber-500/20 text-amber-500/90 hover:text-amber-400 border border-amber-500/20 transition-colors disabled:opacity-50 whitespace-nowrap flex items-center justify-center gap-1"
                                  title="Undo the account creation (delete parent + student logins) but keep the submission so you can process it again"
                                >
                                  {revertingLeadId === lead.id ? 'Reverting…' : '↺ Revert account'}
                                </button>
                              )}

                              {/* Permanent delete — erases the submission AND the accounts (stronger) */}
                              <button
                                disabled={deletingLeadId === lead.id}
                                onClick={() => deleteLead(lead.id, rd.parent_name || rd.child_name || lead.email || 'this lead')}
                                className="text-[9px] font-black px-2 py-0.5 rounded-full bg-rose-500/5 hover:bg-rose-500/20 text-rose-400/80 hover:text-rose-400 border border-rose-500/15 transition-colors disabled:opacity-50 whitespace-nowrap flex items-center justify-center gap-1"
                                title="Permanently delete the submission AND any account created from it (cannot be undone)"
                              >
                                {deletingLeadId === lead.id ? 'Deleting…' : '🗑 Delete permanently'}
                              </button>

                              {/* Child link status — handles single and multi-child */}
                              {lead.matched_parent_id && (() => {
                                const childrenArr = Array.isArray(rd.children)
                                  ? (rd.children as Array<Record<string, string>>)
                                  : null;
                                const count = childrenArr ? childrenArr.length : 1;
                                if (count === 1) {
                                  return lead.matched_student_id ? (
                                    <span className="text-[9px] font-black text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-full whitespace-nowrap">
                                      {rd.child_gender === 'male' ? '👦' : rd.child_gender === 'female' ? '👧' : '🧒'} {lead.match_candidate?.full_name ?? rd.child_name ?? 'Child'} linked
                                    </span>
                                  ) : (
                                    <button
                                      onClick={() => openLinkChild(lead.id, rd.child_name || '', 0)}
                                      className="text-[9px] font-black px-2 py-0.5 rounded-full bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/20 transition-colors whitespace-nowrap"
                                      title="Link this parent to their child's student record"
                                    >
                                      ⚠ Link Child
                                    </button>
                                  );
                                }
                                // Multi-child — show a slot for each child
                                return (
                                  <>
                                    {childrenArr!.map((child, ci) => {
                                      const isLinked = ci === 0
                                        ? !!lead.matched_student_id
                                        : !!(additionalLinks[lead.id] ?? []).find(l => l.childIndex === ci);
                                      const linkedName = ci === 0
                                        ? (lead.match_candidate?.full_name ?? child.name)
                                        : (additionalLinks[lead.id] ?? []).find(l => l.childIndex === ci)?.studentName ?? child.name;
                                      return isLinked ? (
                                        <span key={ci} className="text-[9px] font-black text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-full whitespace-nowrap">
                                          {child.gender === 'male' ? '👦' : child.gender === 'female' ? '👧' : '🧒'} {linkedName} linked
                                        </span>
                                      ) : (
                                        <button key={ci}
                                          onClick={() => openLinkChild(lead.id, child.name || '', ci)}
                                          className="text-[9px] font-black px-2 py-0.5 rounded-full bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/20 transition-colors whitespace-nowrap"
                                          title={`Link Child ${ci + 1} to a student record`}
                                        >
                                          ⚠ Link Child {ci + 1}
                                        </button>
                                      );
                                    })}
                                  </>
                                );
                              })()}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ── Portal Log tab ──────────────────────────────────────────────── */}
        {!loading && activeTab === 'portal-log' && (() => {
          const logLeads = leads
            .filter(l => !!(l.response_data as Record<string, unknown>)?.portal_created_at)
            .sort((a, b) => {
              const ta = (a.response_data as Record<string, unknown>).portal_created_at as string;
              const tb = (b.response_data as Record<string, unknown>).portal_created_at as string;
              return tb.localeCompare(ta);
            });
          return (
            <div className="bg-card border border-border/50 rounded-2xl overflow-hidden">
              {/* Summary bar */}
              <div className="flex items-center gap-4 px-5 py-3 border-b border-border/50 bg-muted/20">
                <div className="w-8 h-8 rounded-xl bg-emerald-500/15 flex items-center justify-center shrink-0">🏦</div>
                <div>
                  <p className="text-sm font-black text-foreground">{logLeads.length} parent portal account{logLeads.length !== 1 ? 's' : ''} created</p>
                  <p className="text-[10px] text-muted-foreground">Full audit trail — credentials sent via email and WhatsApp at time of creation</p>
                </div>
              </div>

              {logLeads.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 gap-3">
                  <div className="w-12 h-12 rounded-full bg-muted/40 flex items-center justify-center text-2xl">🏦</div>
                  <p className="text-muted-foreground text-sm font-bold">No portal accounts have been created yet</p>
                  <p className="text-[11px] text-muted-foreground text-center max-w-xs leading-relaxed">
                    Select leads and click <strong>🏦 Portals</strong> in the bulk action bar, or use the <strong>+ Portal Account</strong> button on individual leads.
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-border/50 bg-muted/30">
                        <th className="text-left text-[10px] font-black text-muted-foreground uppercase tracking-widest px-4 py-3 w-8">#</th>
                        <th className="text-left text-[10px] font-black text-muted-foreground uppercase tracking-widest px-4 py-3">Created At</th>
                        <th className="text-left text-[10px] font-black text-muted-foreground uppercase tracking-widest px-4 py-3">Parent</th>
                        <th className="text-left text-[10px] font-black text-muted-foreground uppercase tracking-widest px-4 py-3">Child(ren)</th>
                        <th className="text-left text-[10px] font-black text-muted-foreground uppercase tracking-widest px-4 py-3">Credentials Sent</th>
                        <th className="text-left text-[10px] font-black text-muted-foreground uppercase tracking-widest px-4 py-3">Created By</th>
                        <th className="text-left text-[10px] font-black text-muted-foreground uppercase tracking-widest px-4 py-3">Lead Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/30">
                      {logLeads.map((lead, i) => {
                        const rd = lead.response_data as Record<string, unknown>;
                        const createdAt  = rd.portal_created_at as string;
                        const channels   = Array.isArray(rd.portal_credentials_sent) ? rd.portal_credentials_sent as string[] : [];
                        const createdBy  = rd.portal_created_by as string ?? 'Staff';
                        const parentName = (rd.parent_name as string) || 'Parent/Guardian';
                        const email      = lead.email ?? (rd.parent_email as string) ?? '';
                        const childrenArr = Array.isArray(rd.children) ? (rd.children as Array<Record<string, string>>) : null;
                        const childDisplay = childrenArr
                          ? childrenArr.map(c => c.name).filter(Boolean).join(', ')
                          : (rd.child_name as string) || '—';
                        const status = lead.status ?? 'new';
                        const cfg = STATUS_CFG[status];
                        return (
                          <tr key={lead.id} className="hover:bg-muted/20 transition-colors">
                            <td className="px-4 py-3 text-xs text-muted-foreground">{i + 1}</td>
                            <td className="px-4 py-3 whitespace-nowrap">
                              <p className="text-xs font-bold text-foreground">{fmtDate(createdAt)}</p>
                              <p className="text-[10px] text-muted-foreground">{fmtTime(createdAt)}</p>
                            </td>
                            <td className="px-4 py-3 min-w-[180px]">
                              <p className="text-sm font-bold text-foreground">{parentName}</p>
                              {email && (
                                <a href={`mailto:${email}`} className="text-[10px] text-muted-foreground hover:text-primary transition-colors block truncate max-w-[200px]">
                                  {email}
                                </a>
                              )}
                            </td>
                            <td className="px-4 py-3 min-w-[140px]">
                              <p className="text-sm text-foreground">{childDisplay}</p>
                              {childrenArr && childrenArr.length > 1 && (
                                <p className="text-[10px] text-muted-foreground">{childrenArr.length} children</p>
                              )}
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex flex-wrap gap-1">
                                {channels.length === 0 ? (
                                  <span className="text-[9px] text-muted-foreground">None recorded</span>
                                ) : (
                                  channels.map(ch => (
                                    <span key={ch} className={`text-[9px] font-black px-1.5 py-0.5 rounded-full border ${ch === 'email' ? 'bg-blue-500/10 text-blue-400 border-blue-500/20' : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'}`}>
                                      {ch === 'email' ? '✉ Email' : '💬 WhatsApp'}
                                    </span>
                                  ))
                                )}
                              </div>
                            </td>
                            <td className="px-4 py-3">
                              <p className="text-xs text-muted-foreground">{createdBy}</p>
                            </td>
                            <td className="px-4 py-3">
                              <span className={`text-[9px] font-black px-2 py-0.5 rounded-full border ${cfg.cls}`}>{cfg.label}</span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          );
        })()}

        {/* ── Portal signatures table ─────────────────────────────────────── */}
        {!loading && activeTab === 'signed' && (
          <div className="bg-card border border-border/50 rounded-2xl overflow-hidden">
            {filteredSigs.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 gap-2">
                <CheckCircleIcon className="w-10 h-10 text-muted-foreground/30" />
                <p className="text-muted-foreground text-sm font-bold">No portal signatures yet</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-border/50 bg-muted/30">
                      <th className="text-left text-[10px] font-black text-muted-foreground uppercase tracking-widest px-4 py-3 w-8">#</th>
                      <th className="text-left text-[10px] font-black text-muted-foreground uppercase tracking-widest px-4 py-3">Signed</th>
                      <th className="text-left text-[10px] font-black text-muted-foreground uppercase tracking-widest px-4 py-3">Parent / Guardian</th>
                      <th className="text-left text-[10px] font-black text-muted-foreground uppercase tracking-widest px-4 py-3">Child</th>
                      <th className="text-left text-[10px] font-black text-muted-foreground uppercase tracking-widest px-4 py-3">Programme</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/30">
                    {filteredSigs.map((s, i) => {
                      const rd  = (s.response_data ?? {}) as Record<string, string>;
                      return (
                        <tr key={s.id} className="hover:bg-muted/20 transition-colors">
                          <td className="px-4 py-3 text-xs text-muted-foreground">{i + 1}</td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            <p className="text-xs font-bold text-foreground">{fmtDate(s.signed_at)}</p>
                            <p className="text-[10px] text-muted-foreground">{fmtTime(s.signed_at)}</p>
                          </td>
                          <td className="px-4 py-3 min-w-[180px]">
                            <div className="flex items-center gap-2">
                              <p className="text-sm font-bold text-foreground">{s.portal_users?.full_name ?? '—'}</p>
                              <span className="text-[9px] font-black bg-emerald-500/10 text-emerald-400 px-1.5 py-0.5 rounded-full">Signed</span>
                            </div>
                            {s.portal_users?.email && (
                              <a href={`mailto:${s.portal_users.email}`} className="text-[10px] text-muted-foreground hover:text-primary transition-colors">
                                {s.portal_users.email}
                              </a>
                            )}
                            {s.portal_users?.phone && (
                              <p className="text-[10px] text-muted-foreground">{s.portal_users.phone}</p>
                            )}
                          </td>
                          <td className="px-4 py-3 min-w-[140px]">
                            <p className="text-sm font-bold text-foreground">{rd.child_name || '—'}</p>
                            <p className="text-[10px] text-muted-foreground">
                              {[rd.child_age && `Age ${rd.child_age}`, rd.child_class].filter(Boolean).join(' · ') || ''}
                            </p>
                          </td>
                          <td className="px-4 py-3">
                            {rd.program_category ? (
                              <span className="text-[10px] font-black px-2 py-1 rounded-lg bg-primary/10 text-primary border border-primary/20">
                                {rd.program_category === 'young_innovators' ? '🚀 Young' : '💻 Teen'}
                              </span>
                            ) : (
                              <span className="text-xs text-muted-foreground">—</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

      </div>

      {/* ── Class picker (before creating portal accounts) ─────────────────── */}
      {classModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={() => !creatingPortalId && setClassModal(null)}>
          <div className="bg-card border border-border rounded-2xl w-full max-w-md p-6 space-y-4" onClick={e => e.stopPropagation()}>
            <div>
              <h3 className="text-lg font-black text-foreground">Place {classModal.parentName.split(' ')[0]}'s child in a class</h3>
              <p className="text-xs text-muted-foreground mt-1">Pick an existing class (preferred) or type a new one. Leave blank to auto-assign by programme.</p>
            </div>

            {classesLoading ? (
              <div className="py-4 text-center text-xs text-muted-foreground">Loading classes…</div>
            ) : schoolClasses.length > 0 ? (
              <div className="space-y-1.5 max-h-44 overflow-y-auto">
                <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Existing classes</p>
                {schoolClasses.map(c => (
                  <button
                    key={c.id}
                    onClick={() => setClassChoice(c.name)}
                    className={`w-full text-left px-3 py-2 rounded-lg text-sm border transition-colors ${classChoice === c.name ? 'bg-primary/15 border-primary/40 text-foreground' : 'bg-muted/40 border-border text-muted-foreground hover:text-foreground'}`}
                  >
                    {c.name}
                  </button>
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">No classes yet for this school — type one below to create it.</p>
            )}

            <div>
              <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Class name</label>
              <input
                value={classChoice}
                onChange={e => setClassChoice(e.target.value)}
                placeholder="e.g. Young Innovators or auto-assign"
                className="w-full mt-1 px-3 py-2 bg-background border border-border rounded-xl text-sm text-foreground focus:outline-none focus:border-primary"
              />
            </div>

            <div className="flex gap-2 pt-1">
              <button
                onClick={() => setClassModal(null)}
                disabled={!!creatingPortalId}
                className="flex-1 px-4 py-2 bg-muted hover:bg-muted/80 text-foreground text-sm font-bold rounded-xl transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  const m = classModal;
                  if (!m) return;
                  const name = classChoice.trim();
                  const existing = schoolClasses.find(c => c.name === name);
                  createPortalAccount(m.leadId, m.parentName, existing ? { classId: existing.id } : (name ? { className: name } : undefined));
                }}
                disabled={!!creatingPortalId}
                className="flex-[2] px-4 py-2 bg-primary hover:bg-primary/90 text-white text-sm font-black rounded-xl transition-colors disabled:opacity-50"
              >
                {creatingPortalId ? 'Creating…' : classChoice.trim() ? 'Create & Assign Class' : 'Create & Auto-Assign'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Credentials modal ─────────────────────────────────────────────── */}
      {credsModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-md">
            {/* Header */}
            <div className="flex items-center gap-3 px-5 pt-5 pb-4 border-b border-border/50">
              <div className="w-9 h-9 rounded-xl bg-emerald-500/15 flex items-center justify-center text-lg shrink-0">🔑</div>
              <div>
                <p className="text-sm font-black text-foreground">Portal Account Created</p>
                <p className="text-[11px] text-muted-foreground">For {credsModal.parentName}</p>
              </div>
            </div>

            {/* Body */}
            <div className="px-5 py-4 space-y-3">
              <p className="text-xs text-muted-foreground leading-relaxed">
                Credentials have been sent via WhatsApp and email. Copy them below to share manually if needed.
              </p>

              {/* Email */}
              <div className="space-y-1">
                <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">Email</p>
                <div className="flex items-center gap-2 bg-muted rounded-xl px-3 py-2.5">
                  <span className="flex-1 text-sm font-mono text-foreground select-all">{credsModal.email}</span>
                  <button
                    onClick={() => navigator.clipboard.writeText(credsModal.email)}
                    className="text-[10px] font-bold text-primary hover:text-primary/80 transition-colors shrink-0"
                  >
                    Copy
                  </button>
                </div>
              </div>

              {/* Password */}
              <div className="space-y-1">
                <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">Temporary Password</p>
                <div className="flex items-center gap-2 bg-amber-500/10 border border-amber-500/20 rounded-xl px-3 py-2.5">
                  <span className="flex-1 text-sm font-mono font-black text-amber-400 select-all tracking-wide">{credsModal.password}</span>
                  <button
                    onClick={() => navigator.clipboard.writeText(credsModal.password)}
                    className="text-[10px] font-bold text-amber-400 hover:text-amber-300 transition-colors shrink-0"
                  >
                    Copy
                  </button>
                </div>
              </div>

              {/* WhatsApp share */}
              <div className="pt-1">
                <a
                  href={`https://wa.me/?text=${encodeURIComponent(`Hello ${credsModal.parentName}!\n\nYour Rillcod Parent Portal account is ready.\n\n📧 Email: ${credsModal.email}\n🔑 Temp Password: ${credsModal.password}\n\nLog in at: ${typeof window !== 'undefined' ? window.location.origin : 'https://rillcod.com'}\n\nPlease change your password after first login.`)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center gap-2 w-full py-2.5 bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-400 font-bold text-xs rounded-xl border border-emerald-500/20 transition-colors"
                >
                  💬 Share via WhatsApp
                </a>
              </div>
            </div>

            {/* Footer */}
            <div className="px-5 pb-5">
              <button
                onClick={() => setCredsModal(null)}
                className="w-full py-2.5 bg-muted hover:bg-muted/80 text-foreground text-xs font-bold rounded-xl transition-colors"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Link Child modal (staff) ──────────────────────────────────────── */}
      {linkChildLeadId && (() => {
        const lead      = leads.find(l => l.id === linkChildLeadId);
        const rd        = (lead?.response_data ?? {}) as Record<string, unknown>;
        const childArr  = Array.isArray(rd.children) ? (rd.children as Array<Record<string, string>>) : null;
        const modalChild = childArr?.[linkChildIndex] ?? null;
        const displayName  = modalChild?.name   || (rd.child_name as string)  || '—';
        const displayClass = modalChild?.class  || (rd.child_class as string) || '';
        const isMulti      = (childArr?.length ?? 1) > 1;
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <div className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-md">
              <div className="flex items-center gap-3 px-5 pt-5 pb-4 border-b border-border/50">
                <div className="w-9 h-9 rounded-xl bg-amber-500/15 flex items-center justify-center text-lg shrink-0">🧒</div>
                <div>
                  <p className="text-sm font-black text-foreground">
                    {isMulti ? `Link Child ${linkChildIndex + 1} to Parent Account` : 'Link Child to Parent Account'}
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    Finding student for: <strong>{displayName}</strong>
                    {displayClass ? ` · ${displayClass}` : ''}
                  </p>
                </div>
                <button onClick={() => setLinkChildLeadId(null)} className="ml-auto text-muted-foreground hover:text-foreground">✕</button>
              </div>

              <div className="px-5 py-4 space-y-3">
                <input
                  type="search"
                  value={studentSearch}
                  onChange={e => filterStudentOptions(e.target.value)}
                  placeholder="Search students in this school…"
                  className="w-full bg-background border border-border text-foreground text-sm px-3 py-2 rounded-xl focus:outline-none focus:border-primary transition-colors"
                />

                {studentsLoading ? (
                  <div className="flex justify-center py-6">
                    <div className="w-6 h-6 border-4 border-primary border-t-transparent rounded-full animate-spin" />
                  </div>
                ) : studentOptions.length === 0 ? (
                  <div className="text-center py-5 space-y-3">
                    <p className="text-xs text-muted-foreground">
                      {allStudentOptions.length === 0
                        ? `No existing account found for ${displayName}.`
                        : `No student matches “${studentSearch}”.`}
                    </p>
                    <p className="text-[10px] text-muted-foreground/70 leading-relaxed px-2">
                      <strong>{displayName}</strong> doesn’t have an account yet. Create one now — it makes the
                      student login and links them to this parent automatically.
                    </p>
                    <button
                      disabled={!!creatingPortalId}
                      onClick={async () => {
                        const theLead = leads.find(l => l.id === linkChildLeadId);
                        const pn = ((theLead?.response_data as Record<string, unknown>)?.parent_name as string) || 'Parent/Guardian';
                        setLinkChildLeadId(null);
                        await createPortalAccount(linkChildLeadId, pn);
                        await load();
                      }}
                      className="inline-flex items-center gap-1.5 px-4 py-2.5 bg-primary hover:bg-primary/90 text-white text-xs font-black rounded-xl transition-colors disabled:opacity-50"
                    >
                      {creatingPortalId ? 'Creating…' : `➕ Create account for ${displayName.split(' ').slice(0, 2).join(' ')}`}
                    </button>
                  </div>
                ) : (
                  <div className="space-y-1.5 max-h-60 overflow-y-auto">
                    {studentOptions.slice(0, 30).map(s => (
                      <button
                        key={s.id}
                        disabled={linkingStudentId === s.id}
                        onClick={() => linkStudentToParent(linkChildLeadId, s.id)}
                        className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-colors disabled:opacity-50 group border ${s.suggested ? 'bg-emerald-500/10 border-emerald-500/25 hover:bg-emerald-500/15' : 'bg-muted border-transparent hover:bg-muted/80'}`}
                      >
                        <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center text-xs shrink-0">👤</div>
                        <div className="flex-1 min-w-0">
                          <p className={`text-sm font-bold truncate flex items-center gap-1.5 ${s.already_linked ? 'text-muted-foreground/70' : 'text-foreground'}`}>
                            {s.full_name}
                            {s.suggested && <span className="text-[8px] font-black uppercase tracking-wider text-emerald-400 bg-emerald-500/15 px-1.5 py-0.5 rounded-full shrink-0">Likely match</span>}
                            {s.already_linked && (
                              <span
                                title={s.linked_parent ? `Already linked to ${s.linked_parent}` : 'Already linked to a parent'}
                                className="inline-flex items-center gap-1 text-[8px] font-black uppercase tracking-wider text-muted-foreground bg-muted border border-border px-1.5 py-0.5 rounded-full shrink-0"
                              >
                                🔒 Linked
                              </span>
                            )}
                          </p>
                          <p className="text-[10px] text-muted-foreground truncate">
                            {[s.section_class, s.school_name].filter(Boolean).join(' · ') || '—'}
                            {s.already_linked && s.linked_parent && <span className="text-amber-500"> · linking here reassigns from {s.linked_parent}</span>}
                          </p>
                        </div>
                        <span className={`text-[9px] font-black text-primary transition-opacity shrink-0 flex items-center gap-1 ${linkingStudentId === s.id ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
                          {linkingStudentId === s.id ? (
                            <>
                              <svg className="animate-spin h-2.5 w-2.5 text-primary" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                              </svg>
                              <span>…</span>
                            </>
                          ) : 'Link →'}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="px-5 pb-5">
                <button
                  onClick={() => setLinkChildLeadId(null)}
                  className="w-full py-2.5 bg-muted hover:bg-muted/80 text-foreground text-xs font-bold rounded-xl transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ── WhatsApp Blast Modal ─────────────────────────────────────────────── */}
      {waBlastOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-lg">
            <div className="flex items-center gap-3 px-5 pt-5 pb-4 border-b border-border/50">
              <div className="w-9 h-9 rounded-xl bg-emerald-500/15 flex items-center justify-center text-lg shrink-0">💬</div>
              <div>
                <p className="text-sm font-black text-foreground">WhatsApp Blast</p>
                <p className="text-[11px] text-muted-foreground">Sending to {selected.size} selected lead{selected.size !== 1 ? 's' : ''}</p>
              </div>
              <button onClick={() => setWaBlastOpen(false)} className="ml-auto text-muted-foreground hover:text-foreground">✕</button>
            </div>
            <div className="px-5 py-4 space-y-3">
              <p className="text-[10px] text-muted-foreground font-bold">Use <code className="bg-muted px-1 rounded">{'{{name}}'}</code> to personalise with the parent&apos;s name.</p>
              <textarea
                value={waMessage}
                onChange={e => setWaMessage(e.target.value)}
                placeholder={`Hi {{name}}! 👋 Just following up about your child's registration at Rillcod Technologies. We'd love to confirm their spot! Call +234 811 660 0091 or reply here.`}
                rows={5}
                maxLength={1000}
                className="w-full bg-background border border-border text-foreground text-sm px-3 py-2.5 rounded-xl focus:outline-none focus:border-emerald-500 resize-none transition-colors"
              />
              <div className="flex justify-between text-[9px] text-muted-foreground">
                <span>{waMessage.length}/1000</span>
                {waResult && <span className="text-emerald-400 font-black">✓ Sent {waResult.sent}/{waResult.total}</span>}
              </div>
            </div>
            <div className="px-5 pb-5 flex gap-2">
              <button
                onClick={sendBulkWhatsApp}
                disabled={waSending || !waMessage.trim()}
                className="flex-1 py-2.5 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-40 text-black font-black text-xs rounded-xl transition-colors"
              >
                {waSending ? 'Sending…' : `Send to ${selected.size} Parent${selected.size !== 1 ? 's' : ''} →`}
              </button>
              <button onClick={() => setWaBlastOpen(false)} className="px-4 py-2.5 bg-muted hover:bg-muted/80 text-foreground text-xs font-bold rounded-xl transition-colors">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Hidden QR SVG — XMLSerializer reads it; visibility:hidden keeps it rendered but invisible */}
      {form && (
        <div
          ref={qrSvgWrapperRef}
          style={{ visibility: 'hidden', position: 'absolute', width: 0, height: 0, overflow: 'hidden' }}
          aria-hidden="true"
        >
          <QRCode value={`${appBase}/forms/${id}`} size={300} />
        </div>
      )}
    </div>
  );
}
