'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/auth-context';
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
  });

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
    <div class="sec-head">${secNum(2)}<span class="sec-title">Child&rsquo;s Information</span></div>
    <table class="dt">
      ${row('Full Name', `<strong>${esc(childName)}</strong>`)}
      ${row('Age', esc(str('child_age') || '—'))}
      ${row('Class / Grade', esc(str('child_class') || '—'))}
      ${row('Current School', esc(lead.child_current_school || str('child_current_school') || '—'))}
      <tr><td class="lbl">Programme Selected</td><td class="val"><span class="prog-pill">${esc(pLabel)}</span></td></tr>
    </table>
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
        <div class="ack-field-val big">${esc(childName)}</div>
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
      <td><strong>${esc(str('child_name') || '—')}</strong><br/><span class="sub">Age ${esc(str('child_age') || '—')} · ${esc(str('child_class') || '—')}</span></td>
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
      <td><strong>${esc(str2('child_name') || '—')}</strong><br/><span class="sub">Age ${esc(str2('child_age') || '—')} · ${esc(str2('child_class') || '—')}</span></td>
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
  const [activeTab, setActiveTab]       = useState<'leads' | 'signed'>('leads');

  const [updatingId, setUpdatingId]     = useState<string | null>(null);
  const [creatingPortalId, setCreatingPortalId] = useState<string | null>(null);
  const [deletingPortalId, setDeletingPortalId] = useState<string | null>(null);
  const [portalStatus, setPortalStatus] = useState<Record<string, 'created' | 'exists'>>({});
  const [credsModal, setCredsModal] = useState<{ email: string; password: string; parentName: string } | null>(null);

  // Child link
  const [linkChildLeadId, setLinkChildLeadId]   = useState<string | null>(null);
  const [studentSearch, setStudentSearch]        = useState('');
  const [studentOptions, setStudentOptions]      = useState<{ id: string; full_name: string; section_class: string | null }[]>([]);
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

  async function createPortalAccount(leadId: string, parentName: string) {
    setCreatingPortalId(leadId);
    try {
      const res = await fetch(`/api/consent-forms/leads/${leadId}/create-portal-account`, {
        method: 'POST',
      });
      const json = await res.json();
      if (!res.ok) {
        alert(json.error ?? 'Failed to create account');
        return;
      }
      setPortalStatus(prev => ({ ...prev, [leadId]: json.alreadyExisted ? 'exists' : 'created' }));
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

  // ── Link child to parent portal account ─────────────────────────────────

  async function openLinkChild(leadId: string, childName: string) {
    setLinkChildLeadId(leadId);
    setStudentSearch(childName);
    setStudentsLoading(true);
    try {
      const res  = await fetch(`/api/parents/manage?include_picker_data=true`);
      const json = await res.json();
      const q    = childName.toLowerCase();
      const all  = (json.students ?? []) as { id: string; full_name: string; section_class: string | null }[];
      setStudentOptions(q ? all.filter(s => s.full_name.toLowerCase().includes(q)) : all.slice(0, 40));
    } finally {
      setStudentsLoading(false);
    }
  }

  function filterStudentOptions(q: string, all: typeof studentOptions) {
    const lower = q.toLowerCase();
    setStudentSearch(q);
    setStudentOptions(lower ? all.filter(s => s.full_name.toLowerCase().includes(lower)) : all.slice(0, 40));
  }

  async function linkStudentToParent(leadId: string, studentPortalId: string) {
    setLinkingStudentId(studentPortalId);
    try {
      const res = await fetch(`/api/consent-forms/leads/${leadId}/create-portal-account`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ student_portal_id: studentPortalId }),
      });
      if (!res.ok) { const j = await res.json(); alert(j.error ?? 'Failed to link'); return; }
      const json = await res.json();
      setLeads(prev => prev.map(l => l.id === leadId ? { ...l, matched_student_id: json.student_id } : l));
      setLinkChildLeadId(null);
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

  function toggleSelect(leadId: string) {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(leadId) ? next.delete(leadId) : next.add(leadId);
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
      if (!res.ok) return;
      const json = await res.json();
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
              </>
            )}
          </div>
        </div>

        {/* Stats bar */}
        {!loading && (
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
            {[
              { label: 'Total',          value: leads.length + sigs.length, cls: 'text-foreground' },
              { label: 'Leads',          value: leads.length,               cls: 'text-amber-400' },
              { label: 'Portal Signed',  value: sigs.length,                cls: 'text-emerald-400' },
              { label: 'Enrolled',       value: enrolled,                   cls: 'text-emerald-400' },
              { label: 'Contacted',      value: contacted,                  cls: 'text-blue-400' },
              { label: 'Young Innovators', value: youngCount,               cls: 'text-primary' },
              { label: 'Teen Developers',  value: teenCount,                cls: 'text-primary' },
            ].map(s => (
              <div key={s.label} className="bg-card border border-border/50 rounded-xl p-3 text-center">
                <p className={`text-xl font-black ${s.cls}`}>{s.value}</p>
                <p className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest mt-0.5 leading-tight">{s.label}</p>
              </div>
            ))}
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-1 p-1 bg-muted rounded-xl w-fit">
          {(['leads', 'signed'] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-colors ${activeTab === tab ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
            >
              {tab === 'leads'
                ? `Public Registrations (${leads.length})`
                : `Portal Signatures (${sigs.length})`}
            </button>
          ))}
        </div>

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
            {activeTab === 'leads' ? filteredLeads.length : filteredSigs.length} shown
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
                              {[rd.child_age && `Age ${rd.child_age}`, rd.child_class].filter(Boolean).join(' · ') || '—'}
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
                                      className="text-[9px] font-black px-2 py-0.5 rounded-full bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/20 transition-colors disabled:opacity-50 whitespace-nowrap"
                                      title="Delete portal account entirely — removes auth, login access and all links"
                                    >
                                      {deletingPortalId === lead.id ? '…' : '✕ Remove'}
                                    </button>
                                  </div>
                                );

                                return (
                                  <button
                                    disabled={creatingPortalId === lead.id}
                                    onClick={() => createPortalAccount(lead.id, parentName)}
                                    className="text-[9px] font-black px-2 py-0.5 rounded-full bg-primary/10 hover:bg-primary/20 text-primary border border-primary/20 transition-colors disabled:opacity-50 whitespace-nowrap"
                                    title="Create parent portal account & send temp password"
                                  >
                                    {creatingPortalId === lead.id ? '…Creating' : '+ Portal Account'}
                                  </button>
                                );
                              })()}

                              {/* Child link status */}
                              {lead.matched_parent_id && (
                                lead.matched_student_id ? (
                                  <span className="text-[9px] font-black text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-full whitespace-nowrap">
                                    👦 {lead.match_candidate?.full_name ?? rd.child_name ?? 'Child'} linked
                                  </span>
                                ) : (
                                  <button
                                    onClick={() => openLinkChild(lead.id, rd.child_name || '')}
                                    className="text-[9px] font-black px-2 py-0.5 rounded-full bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/20 transition-colors whitespace-nowrap"
                                    title="Link this parent to their child's student record"
                                  >
                                    ⚠ Link Child
                                  </button>
                                )
                              )}
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
        const lead = leads.find(l => l.id === linkChildLeadId);
        const rd   = (lead?.response_data ?? {}) as Record<string, string>;
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <div className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-md">
              <div className="flex items-center gap-3 px-5 pt-5 pb-4 border-b border-border/50">
                <div className="w-9 h-9 rounded-xl bg-amber-500/15 flex items-center justify-center text-lg shrink-0">👦</div>
                <div>
                  <p className="text-sm font-black text-foreground">Link Child to Parent Account</p>
                  <p className="text-[11px] text-muted-foreground">
                    Finding student for: <strong>{rd.child_name || '—'}</strong>
                    {rd.child_class ? ` · ${rd.child_class}` : ''}
                  </p>
                </div>
                <button onClick={() => setLinkChildLeadId(null)} className="ml-auto text-muted-foreground hover:text-foreground">✕</button>
              </div>

              <div className="px-5 py-4 space-y-3">
                <input
                  type="search"
                  value={studentSearch}
                  onChange={e => {
                    const q = e.target.value;
                    setStudentSearch(q);
                    // re-filter from existing options (re-fetch only if cleared)
                    if (!q) openLinkChild(linkChildLeadId, '');
                    else setStudentOptions(prev => prev.filter(s => s.full_name.toLowerCase().includes(q.toLowerCase())));
                  }}
                  placeholder="Search by student name…"
                  className="w-full bg-background border border-border text-foreground text-sm px-3 py-2 rounded-xl focus:outline-none focus:border-primary transition-colors"
                />

                {studentsLoading ? (
                  <div className="flex justify-center py-6">
                    <div className="w-6 h-6 border-4 border-primary border-t-transparent rounded-full animate-spin" />
                  </div>
                ) : studentOptions.length === 0 ? (
                  <p className="text-xs text-muted-foreground text-center py-4">No students found matching that name.</p>
                ) : (
                  <div className="space-y-1.5 max-h-60 overflow-y-auto">
                    {studentOptions.slice(0, 20).map(s => (
                      <button
                        key={s.id}
                        disabled={linkingStudentId === s.id}
                        onClick={() => linkStudentToParent(linkChildLeadId, s.id)}
                        className="w-full flex items-center gap-3 px-3 py-2.5 bg-muted hover:bg-muted/80 rounded-xl text-left transition-colors disabled:opacity-50 group"
                      >
                        <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center text-xs shrink-0">👤</div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-bold text-foreground truncate">{s.full_name}</p>
                          {s.section_class && <p className="text-[10px] text-muted-foreground">{s.section_class}</p>}
                        </div>
                        <span className="text-[9px] font-black text-primary opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                          {linkingStudentId === s.id ? '…' : 'Link →'}
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
    </div>
  );
}
