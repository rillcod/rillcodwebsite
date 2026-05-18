'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/auth-context';
import {
  ArrowLeftIcon, ArrowPathIcon, PrinterIcon, UserGroupIcon,
  MagnifyingGlassIcon, CheckCircleIcon, FunnelIcon,
} from '@/lib/icons';

// ── Types ─────────────────────────────────────────────────────────────────────

interface ConsentForm {
  id: string;
  title: string;
  body: string;
  form_type: string;
  due_date: string | null;
  is_public: boolean;
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
  match_confidence: string | null;
  match_notes: string | null;
  match_candidate: { id: string; full_name: string; section_class: string | null } | null;
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

function printFilledForm(form: ConsentForm, lead: FormLead, appBase: string) {
  const win = window.open('', '_blank', 'width=860,height=1100');
  if (!win) return;
  const rd       = (lead.response_data ?? {}) as Record<string, unknown>;
  const str      = (k: string) => (rd[k] as string) ?? '';
  const sub      = new Date(lead.submitted_at);
  const dateStr  = sub.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const timeStr  = sub.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  const shortRef = 'RC-' + lead.id.slice(0, 8).toUpperCase();
  const pLabel   = str('program_category') === 'young_innovators' ? 'Young Innovators — PRY (Ages 5–10)'
                 : str('program_category') === 'teen_developers'  ? 'Teen Developers — SEC (Ages 11–19)'
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

  win.document.write(`<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8">
<title>${shortRef} — ${esc(form.title)}</title>
<style>
@page{margin:0;size:A4 portrait}*{box-sizing:border-box;margin:0;padding:0}
body{font-family:Arial,Helvetica,sans-serif;font-size:10.5pt;color:#1a1a1a;background:#fff}
.letterhead{background:#0d0d0f;padding:22px 30px 18px;display:flex;align-items:center;justify-content:space-between;gap:20px}
.letterhead-logo{height:56px;width:auto;object-fit:contain;flex-shrink:0}
.letterhead-divider{width:1px;height:52px;background:rgba(255,255,255,0.18);flex-shrink:0}
.letterhead-company{flex:1;color:#fff}.co-name{font-size:17pt;font-weight:900;color:#fff}
.co-tag{font-size:7.5pt;color:#a0a0a8;text-transform:uppercase;letter-spacing:1.5px;margin-top:3px}
.letterhead-contact{text-align:right;color:#a0a0a8;font-size:8pt;line-height:1.8;flex-shrink:0}
.letterhead-contact a{color:#f5a623;text-decoration:none}
.accent-strip{height:4px;background:linear-gradient(90deg,#f5a623,#f5c84a)}
.body-wrap{padding:28px 32px 24px}
.doc-type{font-size:7.5pt;font-weight:900;letter-spacing:3px;text-transform:uppercase;color:#f5a623;margin-bottom:4px}
.doc-title{font-size:15pt;font-weight:900;color:#0d0d0f}
.doc-divider{border:none;border-top:2px solid #0d0d0f;margin:10px 0 14px}
.ref-block{display:flex;justify-content:space-between;align-items:flex-start;background:#f7f7f8;border-left:4px solid #f5a623;padding:10px 14px;margin-bottom:22px;font-size:9pt}
.ref-id{font-family:'Courier New',monospace;font-weight:700;font-size:10pt;color:#0d0d0f}
.ref-sub{color:#666;font-size:8pt;margin-top:2px}.ref-right{text-align:right;color:#333}
.ref-right strong{display:block;color:#0d0d0f;font-size:10pt}
.sec-heading{font-size:7.5pt;font-weight:900;letter-spacing:2.5px;text-transform:uppercase;color:#0d0d0f;border-bottom:1.5px solid #0d0d0f;padding-bottom:4px;margin:20px 0 10px}
.sec-heading span{color:#f5a623}
.data-table{width:100%;border-collapse:collapse}
.data-table .lbl{width:42%;padding:7px 10px 7px 0;font-weight:700;color:#444;font-size:10pt;border-bottom:1px solid #ebebeb;vertical-align:top}
.data-table .val{padding:7px 0;color:#111;font-size:10pt;border-bottom:1px solid #ebebeb;vertical-align:top}
.prog-badge{display:inline-block;background:#0d0d0f;color:#f5a623;font-size:8.5pt;font-weight:900;padding:3px 10px;border-radius:4px}
.consent-wrap{border:1px solid #d4d4d4;border-left:4px solid #0d0d0f;padding:12px 14px;background:#fafafa;font-size:10pt;line-height:1.75;white-space:pre-wrap;margin-top:8px;color:#222}
.stamp{margin-top:22px;border:1.5px solid #d0e8d0;border-radius:8px;background:#f3fbf3;padding:12px 16px;display:flex;align-items:flex-start;gap:12px}
.stamp-icon{font-size:22pt;line-height:1;flex-shrink:0}
.stamp-text{font-size:9.5pt;color:#2d5a2d;line-height:1.6}.stamp-text strong{color:#1a3a1a}
.page-footer{margin-top:28px;padding-top:10px;border-top:1px solid #ddd;display:flex;justify-content:space-between;align-items:center;font-size:7.5pt;color:#888}
.page-footer .ref{font-family:'Courier New',monospace;font-weight:700;color:#555}
.print-btn{position:fixed;top:18px;right:18px;background:#0d0d0f;color:#fff;border:none;padding:11px 22px;font-size:13px;font-weight:bold;border-radius:8px;cursor:pointer;box-shadow:0 4px 14px rgba(0,0,0,0.25);z-index:1000;font-family:Arial}
@media print{.print-btn{display:none!important}}
</style></head><body>
<button class="print-btn" onclick="window.print()">🖨️ Print Now</button>
<div class="letterhead">
  <img src="${appBase}/images/logoB.png" class="letterhead-logo" alt="Rillcod Technologies" />
  <div class="letterhead-divider"></div>
  <div class="letterhead-company"><div class="co-name">RILLCOD TECHNOLOGIES</div><div class="co-tag">Empowering Young Minds Through Code</div></div>
  <div class="letterhead-contact"><div>+234 811 660 0091</div><div><a href="mailto:support@rillcod.com">support@rillcod.com</a></div><div>www.rillcod.com</div></div>
</div>
<div class="accent-strip"></div>
<div class="body-wrap">
  <div class="doc-type">Form Submission Record</div>
  <div class="doc-title">${esc(form.title)}</div>
  <hr class="doc-divider" />
  <div class="ref-block">
    <div><div class="ref-id">${shortRef}</div><div class="ref-sub">Submission Reference</div></div>
    <div class="ref-right"><strong>${dateStr}</strong><span>Received at ${timeStr}</span></div>
  </div>
  <div class="sec-heading"><span>01 ·</span> Parent / Guardian Details</div>
  <table class="data-table">
    ${row('Full Name', esc(str('parent_name') || 'Not provided'))}
    ${row('Email Address', esc(lead.email || str('parent_email') || '—'))}
    ${row('WhatsApp / Phone', esc(str('parent_whatsapp') || '—'))}
  </table>
  <div class="sec-heading"><span>02 ·</span> Child&rsquo;s Information</div>
  <table class="data-table">
    ${row('Full Name', esc(str('child_name') || '—'))}
    ${row('Age', esc(str('child_age') || '—'))}
    ${row('Class / Grade', esc(str('child_class') || '—'))}
    ${row('Current School', esc(lead.child_current_school || str('child_current_school') || '—'))}
    <tr><td class="lbl">Programme Selected</td><td class="val"><span class="prog-badge">${pLabel}</span></td></tr>
  </table>
  ${assessmentRows ? `<div class="sec-heading"><span>03 ·</span> Assessment &amp; Background</div><table class="data-table">${assessmentRows}</table>` : ''}
  <div class="sec-heading"><span>${assessmentRows ? '04' : '03'} ·</span> Consent Statement</div>
  <div class="consent-wrap">${esc(form.body)}</div>
  <div class="stamp"><div class="stamp-icon">✅</div><div class="stamp-text"><strong>Digitally submitted and accepted</strong><br/>Completed online on <strong>${dateStr} at ${timeStr}</strong> via rillcod.com/forms.</div></div>
  <div class="page-footer"><span class="ref">${shortRef}</span><span>Rillcod Technologies — ${esc(form.title)}</span><span>Confidential</span></div>
</div></body></html>`);
  win.document.close();
}

function printDataSheet(form: ConsentForm, leads: FormLead[], sigs: Signatory[], appBase: string) {
  const win = window.open('', '_blank', 'width=1100,height=900');
  if (!win) return;
  const printed = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
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
  <div><div class="co-name">RILLCOD TECHNOLOGIES</div><div class="co-tag">Empowering Young Minds Through Code</div></div>
  <div class="lh-contact">+234 811 660 0091 · support@rillcod.com · www.rillcod.com</div>
</div>
<div class="accent-strip"></div>
<div class="doc-hdr">
  <div><div class="doc-type">Response Data Sheet</div><div class="doc-title">${esc(form.title)}</div></div>
  <div class="doc-meta"><div><strong>Printed:</strong> ${printed}</div><div><strong>Form Type:</strong> ${form.form_type === 'assessment' ? 'Assessment' : 'Registration'}</div>${form.due_date ? `<div><strong>Deadline:</strong> ${new Date(form.due_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}</div>` : ''}</div>
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
    <th>#</th><th>Date / Time</th><th>Parent / Guardian</th><th>Child</th><th>Current School</th><th>Programme</th>
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

  const [search, setSearch]           = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [progFilter, setProgFilter]   = useState<string>('all');
  const [activeTab, setActiveTab]     = useState<'leads' | 'signed'>('leads');

  const [updatingId, setUpdatingId]   = useState<string | null>(null);

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
      return matchSearch && matchStatus && matchProg;
    });
  }, [leads, search, statusFilter, progFilter]);

  const filteredSigs = useMemo(() => {
    const q = search.toLowerCase();
    return sigs.filter(s =>
      !q
      || (s.portal_users?.full_name ?? '').toLowerCase().includes(q)
      || (s.portal_users?.email     ?? '').toLowerCase().includes(q)
    );
  }, [sigs, search]);

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
              <div className="flex items-center gap-2 mt-1">
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
              <button
                onClick={() => printDataSheet(form, leads, sigs, appBase)}
                className="flex items-center gap-1.5 px-3 py-2 bg-muted hover:bg-muted/80 text-foreground text-xs font-bold rounded-xl transition-colors border border-border/50"
              >
                <PrinterIcon className="w-3.5 h-3.5" /> Data Sheet
              </button>
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
            </>
          )}

          <span className="text-xs text-muted-foreground ml-auto">
            {activeTab === 'leads' ? filteredLeads.length : filteredSigs.length} shown
          </span>
        </div>

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
                    onClick={() => { setSearch(''); setStatusFilter('all'); setProgFilter('all'); }}
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
                      <th className="text-left text-[10px] font-black text-muted-foreground uppercase tracking-widest px-4 py-3 w-8">#</th>
                      <th className="text-left text-[10px] font-black text-muted-foreground uppercase tracking-widest px-4 py-3">Date</th>
                      <th className="text-left text-[10px] font-black text-muted-foreground uppercase tracking-widest px-4 py-3">Parent / Guardian</th>
                      <th className="text-left text-[10px] font-black text-muted-foreground uppercase tracking-widest px-4 py-3">Child</th>
                      <th className="text-left text-[10px] font-black text-muted-foreground uppercase tracking-widest px-4 py-3">School</th>
                      <th className="text-left text-[10px] font-black text-muted-foreground uppercase tracking-widest px-4 py-3">Programme</th>
                      {form?.form_type === 'assessment' && (
                        <>
                          <th className="text-left text-[10px] font-black text-muted-foreground uppercase tracking-widest px-4 py-3">Prior Coding</th>
                          <th className="text-left text-[10px] font-black text-muted-foreground uppercase tracking-widest px-4 py-3">Goal</th>
                          <th className="text-left text-[10px] font-black text-muted-foreground uppercase tracking-widest px-4 py-3">Schedule</th>
                        </>
                      )}
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

                      return (
                        <tr key={lead.id} className="hover:bg-muted/20 transition-colors group">
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
    </div>
  );
}
