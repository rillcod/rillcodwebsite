'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '@/contexts/auth-context';
import {
  SparklesIcon,
  DocumentTextIcon,
  ChevronRightIcon,
  ArrowPathIcon,
  SpeakerWaveIcon,
  UserGroupIcon,
  AcademicCapIcon,
  BuildingOfficeIcon,
  EyeIcon,
  PrinterIcon,
  CheckCircleIcon,
  PlusIcon,
  TrashIcon,
  ArrowLeftIcon,
  XMarkIcon,
  InformationCircleIcon,
  PencilSquareIcon,
} from '@/lib/icons';

// â”€â”€ Markdown helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
import { renderMarkdown } from '@/lib/newsletter-markdown';
import { brandContact } from '@/config/brand';
import { useOfficeOptional } from '@/components/office/OfficeContext';
import { useOfficeAdminRedirect } from '@/components/office/useOfficeAdminRedirect';
import MobilePageHero from '@/components/mobile/MobilePageHero';
import { MOBILE_PAGE_BOTTOM, MOBILE_TOUCH_BTN } from '@/components/mobile/mobile-styles';

/** Strip markdown to plain text â€” used for list-card previews only. */
function stripMarkdown(text: string): string {
  return text
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\*(.+?)\*/g, '$1')
    .replace(/^[*-]\s+/gm, 'â€¢ ')
    .replace(/^\d+\.\s+/gm, '')
    .replace(/`{1,3}[^`]*`{1,3}/g, '')
    .replace(/\[(.+?)\]\(.+?\)/g, '$1')
    .trim();
}

// â”€â”€ Print / export CSS â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const PRINT_CSS = (fontSize: string, twoCol: boolean) => `
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
body{font-family:Georgia,'Times New Roman',serif;background:#fff;color:#111827;font-size:${fontSize}}
@page{size:A4 portrait;margin:18mm 20mm}
.nl-header{display:flex;align-items:center;gap:16pt;border-bottom:3pt double #000;padding-bottom:13pt;margin-bottom:18pt}
.nl-logo{width:50pt;height:50pt;object-fit:contain;flex-shrink:0}
.nl-org{flex:1}
.nl-org-name{font-size:13.5pt;font-weight:900;text-transform:uppercase;letter-spacing:.5pt;font-family:'Segoe UI',Arial,sans-serif}
.nl-org-sub{font-size:7pt;font-weight:700;text-transform:uppercase;letter-spacing:2pt;color:#555;margin-top:2pt}
.nl-org-addr{font-size:7.5pt;color:#888;margin-top:4pt}
.nl-meta{text-align:right}
.nl-vol{font-size:10pt;font-weight:900;text-transform:uppercase;letter-spacing:1pt}
.nl-date{font-size:8pt;color:#333;font-weight:700;text-transform:uppercase;margin-top:2pt}
.nl-issue{font-size:7.5pt;color:#666;font-weight:700;margin-top:1pt}
.nl-subject-lbl{font-size:7.5pt;font-weight:900;text-transform:uppercase;letter-spacing:3pt;color:#111;margin-bottom:7pt}
.nl-title{font-size:${fontSize === '10pt' ? '21pt' : fontSize === '13pt' ? '29pt' : '25pt'};font-weight:900;text-transform:uppercase;letter-spacing:-.5pt;line-height:1.1;margin-bottom:14pt;font-family:'Segoe UI',Arial,sans-serif}
.nl-title-rule{border:none;border-top:2pt solid #111;margin-bottom:14pt}
.nl-body{font-size:${fontSize};line-height:1.85;color:#374151}
${twoCol ? '.nl-body{column-count:2;column-gap:20pt;column-rule:.5pt solid #d1d5db}' : ''}
.nl-h1{font-size:1.2em;font-weight:900;margin:1.1em 0 .35em;text-transform:uppercase;border-bottom:1pt solid #374151;padding-bottom:3pt;column-span:all;-webkit-column-span:all;font-family:'Segoe UI',Arial,sans-serif}
.nl-h2{font-size:1.05em;font-weight:900;margin:.9em 0 .3em;text-transform:uppercase;font-family:'Segoe UI',Arial,sans-serif}
.nl-h3{font-size:.95em;font-weight:800;margin:.75em 0 .25em;font-style:italic}
.nl-p{margin:0 0 .6em;text-align:justify}
.nl-ul{margin:.35em 0 .6em 1.3em;list-style:disc}
.nl-ol{margin:.35em 0 .6em 1.3em}
.nl-ul li,.nl-ol li{margin:.12em 0;line-height:1.7}
.nl-hr{border:none;border-top:.75pt solid #d1d5db;margin:.7em 0;column-span:all;-webkit-column-span:all}
.nl-gap{height:.35em}
code{background:#f3f4f6;padding:.1em .3em;border-radius:2pt;font-size:.85em;font-family:'Courier New',monospace}
strong{font-weight:900}em{font-style:italic}
.nl-footer{margin-top:28pt;border-top:1.5pt solid #e5e7eb;padding-top:16pt;display:flex;justify-content:space-between;align-items:flex-end;page-break-inside:avoid}
.nl-stamp{width:60pt;height:60pt;border:1.5pt dashed #d1d5db;border-radius:50%;display:flex;align-items:center;justify-content:center;text-align:center;font-size:6pt;color:#d1d5db;font-weight:900;text-transform:uppercase;letter-spacing:.8pt;line-height:1.4}
.no-print{display:none!important}
@media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact}.nl-footer{page-break-inside:avoid}}
`;

// â”€â”€ Types â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

interface Newsletter {
  id: string;
  title: string;
  content: string;
  status: string | null;
  created_at: string | null;
  published_at: string | null;
  scheduled_for?: string | null;
  purpose?: 'service' | 'retention' | 'marketing';
  _total?: number;
  _viewed?: number;
}

type FontSize = 'compact' | 'normal' | 'large';
type EditorTab = 'write' | 'preview';

const FONT_PT: Record<FontSize, string> = { compact: '10pt', normal: '11.5pt', large: '13pt' };

// â”€â”€ Page â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export default function NewslettersPage() {
  const { profile } = useAuth();
  const office = useOfficeOptional();
  const redirecting = useOfficeAdminRedirect({ workspace: 'newsletters' });
  const [newsletters, setNewsletters] = useState<Newsletter[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<'list' | 'editor'>('list');
  const [activeNewsletter, setActiveNewsletter] = useState<Partial<Newsletter> | null>(null);

  // AI
  const [topic, setTopic] = useState('');
  const [generating, setGenerating] = useState(false);
  const [aiTone, setAiTone] = useState<'professional' | 'energetic' | 'visionary'>('professional');
  const [aiAudience, setAiAudience] = useState<'everyone' | 'parents' | 'students'>('everyone');
  const [aiError, setAiError] = useState<string | null>(null);

  // UI
  const [showPushModal, setShowPushModal] = useState(false);
  const [targetType, setTargetType] = useState<'all' | 'students' | 'teachers' | 'schools'>('all');
  const [pushing, setPushing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [editorTab, setEditorTab] = useState<EditorTab>('write');

  // Push options
  const [sendEmail, setSendEmail] = useState(false);
  const [scheduleFor, setScheduleFor] = useState('');

  // Print controls
  const [issueNumber, setIssueNumber] = useState('');
  const [fontSize, setFontSize] = useState<FontSize>('normal');
  const [twoColumn, setTwoColumn] = useState(false);

  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // â”€â”€ Toolbar formatting â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  const applyFormat = useCallback((type: string) => {
    const ta = textareaRef.current;
    if (!ta) return;
    const { selectionStart: ss, selectionEnd: se, value } = ta;
    const selected = value.slice(ss, se);
    const before = value.slice(0, ss);
    const after = value.slice(se);

    let newValue = value;
    let newSs = ss;
    let newSe = se;

    if (type === 'bold') {
      const text = selected || 'bold text';
      newValue = before + `**${text}**` + after;
      newSs = ss + 2; newSe = newSs + text.length;
    } else if (type === 'italic') {
      const text = selected || 'italic text';
      newValue = before + `*${text}*` + after;
      newSs = ss + 1; newSe = newSs + text.length;
    } else if (type === 'h1' || type === 'h2' || type === 'h3') {
      const prefix = type === 'h1' ? '# ' : type === 'h2' ? '## ' : '### ';
      const lineStart = before.lastIndexOf('\n') + 1;
      const lineEnd = value.indexOf('\n', ss) === -1 ? value.length : value.indexOf('\n', ss);
      const line = value.slice(lineStart, lineEnd);
      const cleanLine = line.replace(/^#{1,6} /, '');
      const newLine = prefix + (cleanLine || 'Heading');
      newValue = value.slice(0, lineStart) + newLine + value.slice(lineEnd);
      newSs = lineStart + prefix.length; newSe = lineStart + newLine.length;
    } else if (type === 'ul') {
      const lineStart = before.lastIndexOf('\n') + 1;
      const lineEnd = value.indexOf('\n', ss) === -1 ? value.length : value.indexOf('\n', ss);
      const line = value.slice(lineStart, lineEnd);
      const cleanLine = line.replace(/^[*-] /, '').replace(/^\d+\. /, '');
      const newLine = `- ${cleanLine || 'List item'}`;
      newValue = value.slice(0, lineStart) + newLine + value.slice(lineEnd);
      newSs = lineStart + 2; newSe = lineStart + newLine.length;
    } else if (type === 'ol') {
      const lineStart = before.lastIndexOf('\n') + 1;
      const lineEnd = value.indexOf('\n', ss) === -1 ? value.length : value.indexOf('\n', ss);
      const line = value.slice(lineStart, lineEnd);
      const cleanLine = line.replace(/^[*-] /, '').replace(/^\d+\. /, '');
      const newLine = `1. ${cleanLine || 'List item'}`;
      newValue = value.slice(0, lineStart) + newLine + value.slice(lineEnd);
      newSs = lineStart + 3; newSe = lineStart + newLine.length;
    } else if (type === 'hr') {
      const gap = before.endsWith('\n') ? '' : '\n';
      const insertion = `${gap}\n---\n\n`;
      newValue = before + insertion + after;
      newSs = newSe = ss + insertion.length;
    }

    setActiveNewsletter(p => ({ ...p, content: newValue }));
    requestAnimationFrame(() => {
      ta.focus();
      ta.setSelectionRange(newSs, newSe);
    });
  }, []);

  // â”€â”€ Print helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  function buildPrintHTML(forExport = false): string {
    // Escape everything interpolated into raw HTML (title/school/issue are free text) so a
    // stray "<" never breaks the document or injects markup. Body goes through renderMarkdown,
    // which now escapes internally.
    const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    const schoolName = esc((profile as any)?.school_name || 'RILLCOD TECHNOLOGIES');
    const today = new Date().toLocaleDateString('en-GB', { year: 'numeric', month: 'long', day: 'numeric' });
    const logoUrl = window.location.origin + '/logo.png';
    const sigUrl = window.location.origin + '/images/signature.png';
    const title = esc(activeNewsletter?.title || 'Untitled Newsletter');
    const issueNo = esc(issueNumber);
    const bodyHtml = renderMarkdown(activeNewsletter?.content || '');
    const pt = FONT_PT[fontSize];

    return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"/>
<title>${title}</title>
<style>${PRINT_CSS(pt, twoColumn)}</style>
</head><body>
${!forExport ? `
<div class="no-print" style="text-align:right;padding:12px 0 16px;display:flex;gap:10px;justify-content:flex-end;">
  <button onclick="window.print()" style="background:#111827;color:#fff;border:none;padding:9px 22px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1px;cursor:pointer;border-radius:4px;">Print / Save PDF</button>
  <button onclick="window.close()" style="background:#f9fafb;color:#374151;border:1px solid #e5e7eb;padding:9px 22px;font-size:11px;cursor:pointer;border-radius:4px;">Close</button>
</div>` : ''}
<div class="nl-header">
  <img src="${logoUrl}" class="nl-logo" onerror="this.style.display='none'"/>
  <div class="nl-org">
    <div class="nl-org-name">${schoolName}</div>
    <div class="nl-org-sub">Official Institutional Communication</div>
    <div class="nl-org-addr">26 Ogiesoba Avenue, Benin City &middot; academy.rillcod.com &middot; {brandContact.phoneShort}</div>
  </div>
  <div class="nl-meta">
    <div class="nl-vol">VOL. ${new Date().getFullYear()}</div>
    <div class="nl-date">${today}</div>
    ${issueNo ? `<div class="nl-issue">Issue No. ${issueNo}</div>` : ''}
  </div>
</div>
<div class="nl-subject-lbl">Official Notice / Newsletter</div>
<h1 class="nl-title">${title}</h1>
<hr class="nl-title-rule"/>
<div class="nl-body">${bodyHtml}</div>
<div class="nl-footer">
  <div>
    <img src="${sigUrl}" style="height:34pt;margin-bottom:4pt;mix-blend-mode:multiply;opacity:0.8;display:block" onerror="this.style.display='none'"/>
    <div style="font-size:11pt;font-weight:900;text-transform:uppercase;font-family:'Segoe UI',Arial,sans-serif">The Administrator</div>
    <div style="font-size:7.5pt;color:#6b7280;font-weight:700;text-transform:uppercase;letter-spacing:1pt;margin-top:2pt">Rillcod Technologies Executive Office</div>
  </div>
  <div class="nl-stamp">Official<br/>Academy<br/>Stamp</div>
</div>
${!forExport ? `<script>window.addEventListener('load',()=>setTimeout(()=>window.print(),400));</script>` : ''}
</body></html>`;
  }

  function handlePrintNewsletter() {
    const html = buildPrintHTML(false);
    const win = window.open('', '_blank', 'width=960,height=860');
    if (!win) { alert('Pop-up blocked â€” please allow pop-ups to print.'); return; }
    win.document.write(html);
    win.document.close();
  }

  async function handleExportPDF() {
    const [{ toPng }, { default: jsPDF }] = await Promise.all([
      import('html-to-image'),
      import('jspdf'),
    ]);

    const title = activeNewsletter?.title || 'Newsletter';
    const exportHtml = buildPrintHTML(true);

    const wrap = document.createElement('div');
    wrap.style.cssText = 'position:fixed;left:-9999px;top:0;width:794px;background:#fff;';
    wrap.innerHTML = `<div id="nl-export" style="padding:55px 66px 50px;">${exportHtml.replace(/<!DOCTYPE[\s\S]*?<body[^>]*>/, '').replace(/<\/body>[\s\S]*$/, '')}</div>`;
    document.body.appendChild(wrap);

    await new Promise(r => setTimeout(r, 300));
    const imgs = wrap.querySelectorAll('img');
    await Promise.allSettled(Array.from(imgs).map(img =>
      img.complete ? Promise.resolve() : new Promise(r => { img.onload = r; img.onerror = r; })
    ));

    const el = wrap.firstElementChild as HTMLElement;
    const A4_W = 794, A4_H = 1123, RATIO = 2;

    const dataUrl = await toPng(el, {
      pixelRatio: RATIO, cacheBust: true,
      width: A4_W, height: el.scrollHeight,
      backgroundColor: '#fff',
    });
    document.body.removeChild(wrap);

    const img = new Image();
    await new Promise<void>(r => { img.onload = () => r(); img.src = dataUrl; });

    const srcH = img.naturalHeight;
    const pageH = A4_H * RATIO;
    const totalPages = Math.ceil(srcH / pageH);
    const pdf = new jsPDF({ orientation: 'portrait', unit: 'px', format: [A4_W, A4_H] });

    for (let i = 0; i < totalPages; i++) {
      if (i > 0) pdf.addPage([A4_W, A4_H], 'portrait');
      const slice = document.createElement('canvas');
      slice.width = A4_W * RATIO;
      slice.height = pageH;
      const ctx = slice.getContext('2d')!;
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, slice.width, pageH);
      ctx.drawImage(img, 0, -(i * pageH), img.naturalWidth, srcH);
      pdf.addImage(slice.toDataURL('image/png'), 'PNG', 0, 0, A4_W, A4_H);
    }

    pdf.save(`${title}.pdf`);
  }

  // â”€â”€ Data â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  useEffect(() => {
    if (profile?.role) loadNewsletters();
  }, [profile]); // eslint-disable-line

  async function loadNewsletters() {
    setLoading(true);
    try {
      // Scoped server API (role-aware, service role) â€” no client-RLS dependency.
      const res = await fetch('/api/newsletters', { cache: 'no-store' });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to load');
      setNewsletters((json.data ?? []) as Newsletter[]);
    } catch {
      setNewsletters([]);
    } finally {
      setLoading(false);
    }
  }

  async function handleAIGenerate() {
    if (!topic) return;
    setGenerating(true);
    setAiError(null);
    try {
      const res = await fetch('/api/ai/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'newsletter', topic, tone: aiTone, audience: aiAudience }),
      });
      const json = await res.json();
      if (json.success && json.data) {
        const title = json.data.title || json.data.headline || '';
        const content = json.data.content || json.data.body || json.data.text || '';
        if (!content) { setAiError('AI returned empty content. Please try again.'); return; }
        // Keep markdown as-is â€” the renderer will handle it
        setActiveNewsletter(prev => ({ ...prev, title: stripMarkdown(title), content }));
        setEditorTab('preview'); // jump to preview so user sees the result
      } else {
        setAiError(json.error || 'Generation failed. Please try again.');
      }
    } catch (e: any) {
      setAiError(e.message || 'Network error.');
    } finally {
      setGenerating(false);
    }
  }

  async function handleSave() {
    if (!activeNewsletter?.title || !activeNewsletter?.content) return;
    setSaving(true);
    try {
      const res = await fetch('/api/newsletters', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: activeNewsletter.id, title: activeNewsletter.title, content: activeNewsletter.content, purpose: activeNewsletter.purpose || 'service' }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Save failed');
      if (json.data) setActiveNewsletter(json.data);
      setSuccess('Newsletter saved successfully!');
      setTimeout(() => setSuccess(null), 3000);
      loadNewsletters();
      office?.notifyOfficeChange('newsletters');
    } catch (e: any) {
      alert(e.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  async function handlePush() {
    if (!activeNewsletter?.id) return;
    setPushing(true);
    try {
      const res = await fetch(`/api/newsletters/${activeNewsletter.id}/push`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target: targetType, sendEmail, scheduleFor: scheduleFor || undefined }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Push failed');
      setSuccess(
        json.scheduled
          ? `Scheduled for ${new Date(json.scheduledFor).toLocaleString()}.`
          : `Pushed to ${json.delivered} recipient(s)${json.emailed ? ` · ${json.emailed} emailed` : ''}.`,
      );
      setShowPushModal(false);
      setScheduleFor('');
      setSendEmail(false);
      setView('list');
      loadNewsletters();
      office?.notifyOfficeChange('newsletters');
    } catch (e: any) {
      alert(e.message || 'Push failed');
    } finally {
      setPushing(false);
    }
  }

  async function handleDelete(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    if (!confirm('Delete this newsletter? This cannot be undone.')) return;
    try {
      const res = await fetch(`/api/newsletters/${id}`, { method: 'DELETE' });
      if (!res.ok) { const j = await res.json().catch(() => ({})); throw new Error(j.error || 'Delete failed'); }
      setNewsletters(prev => prev.filter(n => n.id !== id));
      office?.notifyOfficeChange('newsletters');
    } catch (e: any) {
      alert(e.message || 'Delete failed');
    }
  }

  const isManager = profile?.role === 'admin' || profile?.role === 'teacher';

  if (redirecting) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-sm text-muted-foreground">
        Opening Newsletters in Office Center...
      </div>
    );
  }

  if (!['admin', 'school', 'teacher', 'student', 'parent'].includes(profile?.role || '')) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6 mobile-page-root">
        <div className="max-w-md w-full text-center space-y-6">
          <div className="w-24 h-24 bg-rose-500/10 rounded-full flex items-center justify-center mx-auto border border-rose-500/20 text-rose-600 dark:text-rose-400">
            <InformationCircleIcon className="w-12 h-12" />
          </div>
          <h1 className="text-3xl font-black tracking-tighter text-foreground uppercase italic">Access Denied</h1>
          <a href="/dashboard" className="inline-block px-8 py-4 bg-card border border-border rounded-xl text-[10px] font-black uppercase tracking-widest text-foreground">
            Return to Dashboard
          </a>
        </div>
      </div>
    );
  }

  // â”€â”€ Render â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  return (
    <div className={`${office ? 'bg-transparent' : 'min-h-screen bg-background'} text-foreground ${office ? 'p-0' : `p-4 sm:p-8 ${MOBILE_PAGE_BOTTOM}`}`}>
      <div className="max-w-6xl mx-auto space-y-8">

        {/* Header — hide duplicate chrome when embedded in Office Center */}
        {!office ? (
        <MobilePageHero
          badge="Official channel · Newsletters"
          title={isManager ? 'Newsletters' : 'Official newsletters'}
          description={
            isManager
              ? 'Design, draft, and push professional newsletters.'
              : 'Stay updated with the latest news and school announcements.'
          }
          icon={SpeakerWaveIcon}
          actions={
            view === 'list' ? (
              isManager ? (
                <button
                  type="button"
                  onClick={() => { setView('editor'); setActiveNewsletter({ title: '', content: '' }); setEditorTab('write'); }}
                  className={`${MOBILE_TOUCH_BTN} bg-primary text-primary-foreground w-full sm:w-auto`}
                >
                  <PlusIcon className="w-5 h-5" /> Create newsletter
                </button>
              ) : undefined
            ) : (
              <button
                type="button"
                onClick={() => setView('list')}
                className={`${MOBILE_TOUCH_BTN} border border-border bg-card text-foreground w-full sm:w-auto`}
              >
                <ArrowLeftIcon className="w-4 h-4" /> Back to newsletters
              </button>
            )
          }
        />
        ) : (
        <div className="flex flex-wrap items-center justify-end gap-2">
          {view === 'list' ? (
            isManager && (
              <button
                onClick={() => { setView('editor'); setActiveNewsletter({ title: '', content: '' }); setEditorTab('write'); }}
                className="flex min-h-11 touch-manipulation items-center gap-2 px-5 py-3 bg-primary hover:bg-primary/90 rounded-xl text-sm font-bold transition-all shadow-lg shadow-primary/40 text-primary-foreground"
              >
                <PlusIcon className="w-5 h-5" /> Create Newsletter
              </button>
            )
          ) : (
            <button
              onClick={() => setView('list')}
              className="flex min-h-11 touch-manipulation items-center gap-2 px-4 py-2 bg-card border border-border rounded-xl text-sm font-bold transition-all"
            >
              <ArrowLeftIcon className="w-4 h-4" /> Back to Newsletters
            </button>
          )}
        </div>
        )}

        {success && (
          <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-4 flex items-center gap-3 text-emerald-600 dark:text-emerald-400">
            <CheckCircleIcon className="w-5 h-5" />
            <span className="text-sm font-bold">{success}</span>
          </div>
        )}

        {view === 'list' ? (
          /* â”€â”€ List â”€â”€ */
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {loading ? (
              Array(3).fill(0).map((_, i) => (
                <div key={i} className="bg-card border border-border rounded-2xl h-48 animate-pulse" />
              ))
            ) : newsletters.length === 0 ? (
              <div className="col-span-full py-20 text-center">
                <DocumentTextIcon className="w-16 h-16 mx-auto text-muted-foreground mb-4" />
                <p className="text-muted-foreground font-bold">No newsletters created yet.</p>
              </div>
            ) : (
              newsletters.map(nl => (
                <div
                  key={nl.id}
                  onClick={() => { setActiveNewsletter(nl); setView('editor'); setEditorTab('write'); }}
                  className="group bg-card/90 backdrop-blur-2xl border border-border/80 rounded-3xl p-4 sm:p-6 lg:p-8 shadow-xl hover:border-primary/40 transition-all cursor-pointer relative overflow-hidden"
                >
                  <div className="absolute top-0 right-0 p-4 flex items-center gap-2">
                    {isManager && (
                      <button onClick={e => handleDelete(nl.id, e)}
                        className="opacity-0 group-hover:opacity-100 transition-opacity p-1.5 rounded-lg hover:bg-rose-500/20 text-rose-600 dark:text-rose-400"
                        title="Delete">
                        <TrashIcon className="w-4 h-4" />
                      </button>
                    )}
                    <ChevronRightIcon className="w-5 h-5 text-primary opacity-0 group-hover:opacity-100 transition-opacity" />
                  </div>
                  <div className="flex items-center gap-2 mb-4 flex-wrap">
                    <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-widest ${
                      nl.status === 'published' ? 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400'
                        : nl.status === 'scheduled' ? 'bg-sky-500/20 text-sky-600 dark:text-sky-400'
                        : 'bg-amber-500/20 text-amber-600 dark:text-amber-400'
                    }`}>{nl.status || 'draft'}</span>
                    <span className="rounded-full border border-border px-2 py-0.5 text-[9px] font-black uppercase tracking-widest text-muted-foreground">
                      {nl.purpose === 'marketing' ? 'Marketing' : nl.purpose === 'retention' ? 'Engagement' : 'Service'}
                    </span>
                    <span className="text-[9px] text-muted-foreground font-black uppercase tracking-widest">
                      {nl.created_at ? new Date(nl.created_at).toLocaleDateString() : 'N/A'}
                    </span>
                    {nl.status === 'scheduled' && nl.scheduled_for && (
                      <span className="text-[9px] text-sky-600 dark:text-sky-400 font-black uppercase tracking-widest">
                        · {new Date(nl.scheduled_for).toLocaleString()}
                      </span>
                    )}
                    {isManager && nl.status === 'published' && (nl._total ?? 0) > 0 && (
                      <span className="ml-auto inline-flex items-center gap-1 text-[9px] font-black uppercase tracking-widest text-muted-foreground" title="Recipients who have opened it / total delivered">
                        <EyeIcon className="w-3 h-3" /> {nl._viewed ?? 0}/{nl._total}
                      </span>
                    )}
                  </div>
                  <h3 className="text-xl font-black text-foreground mb-2 line-clamp-2 tracking-tight uppercase leading-tight">{nl.title}</h3>
                  <p className="text-sm text-muted-foreground line-clamp-3 leading-relaxed">
                    {stripMarkdown(nl.content).slice(0, 180)}
                  </p>
                </div>
              ))
            )}
          </div>
        ) : !isManager ? (
          /* â”€â”€ Read-only reader (students / parents) â”€â”€ */
          <div className="max-w-3xl mx-auto">
            <article className="bg-card/90 backdrop-blur-2xl border border-border/80 rounded-3xl p-4 sm:p-6 lg:p-8 shadow-xl sm:p-10 shadow-sm">
              <div className="flex items-center gap-2 mb-4">
                <span className="text-[10px] font-black uppercase tracking-widest text-primary">Official Newsletter</span>
                {activeNewsletter?.published_at && (
                  <span className="text-[10px] text-muted-foreground font-bold uppercase tracking-widest">
                    · {new Date(activeNewsletter.published_at).toLocaleDateString()}
                  </span>
                )}
              </div>
              <h1 className="text-2xl sm:text-4xl font-black tracking-tight uppercase mb-6 leading-tight">
                {activeNewsletter?.title || 'Newsletter'}
              </h1>
              <hr className="border-border mb-6" />
              <div
                className="text-sm leading-[1.9] text-foreground prose-custom"
                dangerouslySetInnerHTML={{ __html: renderMarkdown(activeNewsletter?.content || '') || '<p>No content.</p>' }}
              />
            </article>
          </div>
        ) : (
          /* â”€â”€ Editor (managers) â”€â”€ */
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start relative">

            {/* â”€ Sidebar â”€ */}
            <div className="lg:col-span-4 space-y-5 lg:sticky lg:top-24 order-2 lg:order-1">

              {/* AI Assistant */}
              <div className="bg-background/80 backdrop-blur-xl border border-border rounded-2xl p-6 space-y-5 shadow-xl">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-primary/20 rounded-xl flex items-center justify-center border border-primary/30">
                    <SparklesIcon className="w-6 h-6 text-primary" />
                  </div>
                  <div>
                    <h3 className="text-sm font-black tracking-tight uppercase">AI Assistant</h3>
                    <p className="text-[10px] text-muted-foreground font-black uppercase tracking-widest">Generates markdown content</p>
                  </div>
                </div>

                <div className="space-y-3">
                  <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">Tone</p>
                  <div className="grid grid-cols-3 gap-1.5">
                    {(['professional', 'energetic', 'visionary'] as const).map(t => (
                      <button key={t} onClick={() => setAiTone(t)}
                        className={`px-2 py-2 rounded-lg text-[9px] font-black uppercase tracking-widest border transition-all ${aiTone === t ? 'bg-primary border-primary text-primary-foreground' : 'bg-card border-border text-muted-foreground hover:bg-muted'}`}>
                        {t}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-3">
                  <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">Audience</p>
                  <div className="grid grid-cols-3 gap-1.5">
                    {(['everyone', 'parents', 'students'] as const).map(a => (
                      <button key={a} onClick={() => setAiAudience(a)}
                        className={`px-2 py-2 rounded-lg text-[9px] font-black uppercase tracking-widest border transition-all ${aiAudience === a ? 'bg-cyan-600 border-cyan-500 text-white' : 'bg-card border-border text-muted-foreground hover:bg-muted'}`}>
                        {a}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">Topic</label>
                  <textarea
                    value={topic} onChange={e => setTopic(e.target.value)}
                    placeholder="Announce your news..."
                    className="w-full bg-card border border-border rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-primary resize-none h-28 placeholder-muted-foreground"
                  />
                </div>

                <button onClick={handleAIGenerate} disabled={generating || !topic}
                  className="w-full py-4 bg-gradient-to-br from-primary to-indigo-700 hover:from-primary hover:to-indigo-600 rounded-xl text-[10px] font-black disabled:opacity-50 flex items-center justify-center gap-3 uppercase tracking-[.2em] text-white shadow-xl">
                  {generating ? <ArrowPathIcon className="w-5 h-5 animate-spin" /> : <SparklesIcon className="w-5 h-5" />}
                  {generating ? 'Generating...' : 'Generate'}
                </button>

                {aiError && (
                  <div className="flex items-start gap-2 p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl">
                    <InformationCircleIcon className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
                    <p className="text-xs text-rose-600 dark:text-rose-400 font-semibold">{aiError}</p>
                  </div>
                )}
              </div>

              {/* Print Options */}
              <div className="bg-background/80 backdrop-blur-xl border border-border rounded-2xl p-5 space-y-4 shadow-xl">
                <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">Print / Export Options</p>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">Issue No.</label>
                  <input type="text" value={issueNumber} onChange={e => setIssueNumber(e.target.value)}
                    placeholder="e.g. 5 or 2025-003"
                    className="w-full px-3 py-2 bg-card border border-border text-sm rounded-md focus:outline-none focus:border-primary" />
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">Font Size</label>
                  <div className="grid grid-cols-3 gap-1 border border-border rounded-md overflow-hidden">
                    {(['compact', 'normal', 'large'] as FontSize[]).map(f => (
                      <button key={f} type="button" onClick={() => setFontSize(f)}
                        className={`py-2 text-[10px] font-black uppercase tracking-widest transition-colors ${fontSize === f ? 'bg-primary text-primary-foreground' : 'bg-background text-muted-foreground hover:text-foreground'}`}>
                        {f}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">Layout</label>
                  <div className="grid grid-cols-2 gap-1 border border-border rounded-md overflow-hidden">
                    {([false, true] as const).map(col => (
                      <button key={String(col)} type="button" onClick={() => setTwoColumn(col)}
                        className={`py-2 text-[10px] font-black uppercase tracking-widest transition-colors ${twoColumn === col ? 'bg-primary text-primary-foreground' : 'bg-background text-muted-foreground hover:text-foreground'}`}>
                        {col ? 'Two Column' : 'Single'}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 pt-1">
                  <button onClick={handlePrintNewsletter}
                    className="flex items-center justify-center gap-2 px-3 py-3 bg-card hover:bg-muted rounded-xl text-[10px] font-black border border-border transition-all">
                    <PrinterIcon className="w-3.5 h-3.5 text-primary" />
                    <span className="uppercase tracking-widest">Print</span>
                  </button>
                  <button onClick={handleExportPDF}
                    className="flex items-center justify-center gap-2 px-3 py-3 bg-primary/10 hover:bg-primary/20 rounded-xl text-[10px] font-black border border-primary/20 text-primary transition-all">
                    <DocumentTextIcon className="w-3.5 h-3.5" />
                    <span className="uppercase tracking-widest">Export PDF</span>
                  </button>
                </div>

                {activeNewsletter?.id && (
                  <button onClick={() => setShowPushModal(true)}
                    className="w-full flex items-center gap-3 px-4 py-3 bg-emerald-600/10 hover:bg-emerald-600/20 text-emerald-600 dark:text-emerald-400 rounded-xl text-[10px] font-black border border-emerald-500/20 transition-all">
                    <SpeakerWaveIcon className="w-4 h-4" />
                    <span className="uppercase tracking-widest">Send to Users</span>
                  </button>
                )}
              </div>

              {/* Markdown guide */}
              <div className="bg-card/90 backdrop-blur-2xl border border-border/80 rounded-3xl p-4 sm:p-6 shadow-xl space-y-2 text-[10px] font-mono text-muted-foreground">
                <p className="font-black uppercase tracking-widest text-foreground text-[9px] mb-2">Markdown guide</p>
                <p># Heading 1 &nbsp;&nbsp; ## Heading 2</p>
                <p>**bold** &nbsp; *italic* &nbsp; `code`</p>
                <p>- bullet item &nbsp; 1. numbered</p>
                <p>--- (horizontal rule)</p>
              </div>
            </div>

            {/* â”€ Main content â”€ */}
            <div className="lg:col-span-8 space-y-4 order-1 lg:order-2">
              <div className="bg-background/80 backdrop-blur-xl border border-border rounded-2xl shadow-2xl overflow-hidden">

                {/* Title */}
                <div className="flex items-center gap-4 border-b border-border px-6 py-5">
                  <div className="hidden sm:flex w-10 h-10 bg-card rounded-xl items-center justify-center border border-border shrink-0">
                    <DocumentTextIcon className="w-5 h-5 text-muted-foreground" />
                  </div>
                  <input
                    type="text"
                    value={activeNewsletter?.title || ''}
                    onChange={e => setActiveNewsletter(p => ({ ...p, title: e.target.value }))}
                    placeholder="Headline..."
                    className="w-full bg-transparent text-2xl lg:text-3xl font-black focus:outline-none placeholder-muted-foreground tracking-tighter uppercase italic"
                  />
                  <select
                    aria-label="Newsletter category"
                    value={activeNewsletter?.purpose || 'service'}
                    onChange={e => setActiveNewsletter(p => ({ ...p, purpose: e.target.value as Newsletter['purpose'] }))}
                    className="max-w-52 rounded-lg border border-border bg-card px-3 py-2 text-xs font-bold text-foreground"
                  >
                    <option value="service">School / service update</option>
                    <option value="retention">Community engagement</option>
                    {profile?.role === 'admin' ? <option value="marketing">Marketing campaign</option> : null}
                  </select>
                </div>

                {/* Tab bar */}
                <div className="flex border-b border-border px-6">
                  {(['write', 'preview'] as EditorTab[]).map(tab => (
                    <button key={tab} onClick={() => setEditorTab(tab)}
                      className={`flex items-center gap-1.5 px-4 py-3 text-[10px] font-black uppercase tracking-widest border-b-2 -mb-px transition-colors ${editorTab === tab ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>
                      {tab === 'write' ? <PencilSquareIcon className="w-3.5 h-3.5" /> : <EyeIcon className="w-3.5 h-3.5" />}
                      {tab === 'write' ? 'Write' : 'Preview'}
                    </button>
                  ))}
                </div>

                {/* Formatting toolbar â€” only shown in Write mode */}
                {editorTab === 'write' && (
                  <div className="flex flex-wrap items-center gap-0.5 px-4 py-2 border-b border-border bg-muted/30">
                    {([
                      { id: 'bold',   label: 'B',   title: 'Bold',           cls: 'font-black italic' },
                      { id: 'italic', label: 'I',   title: 'Italic',         cls: 'italic' },
                    ] as const).map(btn => (
                      <button key={btn.id} onMouseDown={e => { e.preventDefault(); applyFormat(btn.id); }}
                        title={btn.title}
                        className={`w-7 h-7 flex items-center justify-center rounded text-xs text-foreground hover:bg-border transition-colors ${btn.cls}`}>
                        {btn.label}
                      </button>
                    ))}
                    <span className="w-px h-4 bg-border mx-1" />
                    {([
                      { id: 'h1', label: 'H1', title: 'Heading 1' },
                      { id: 'h2', label: 'H2', title: 'Heading 2' },
                      { id: 'h3', label: 'H3', title: 'Heading 3' },
                    ] as const).map(btn => (
                      <button key={btn.id} onMouseDown={e => { e.preventDefault(); applyFormat(btn.id); }}
                        title={btn.title}
                        className="w-8 h-7 flex items-center justify-center rounded text-[10px] font-black text-foreground hover:bg-border transition-colors">
                        {btn.label}
                      </button>
                    ))}
                    <span className="w-px h-4 bg-border mx-1" />
                    <button onMouseDown={e => { e.preventDefault(); applyFormat('ul'); }} title="Bullet list"
                      className="h-7 px-2 flex items-center justify-center rounded text-[11px] text-foreground hover:bg-border transition-colors">
                      â€¢ List
                    </button>
                    <button onMouseDown={e => { e.preventDefault(); applyFormat('ol'); }} title="Numbered list"
                      className="h-7 px-2 flex items-center justify-center rounded text-[11px] text-foreground hover:bg-border transition-colors">
                      1. List
                    </button>
                    <span className="w-px h-4 bg-border mx-1" />
                    <button onMouseDown={e => { e.preventDefault(); applyFormat('hr'); }} title="Insert divider"
                      className="h-7 px-2 flex items-center justify-center rounded text-[11px] text-muted-foreground hover:bg-border hover:text-foreground transition-colors">
                      â€” Divider
                    </button>
                  </div>
                )}

                <div className="p-6">
                  {editorTab === 'write' ? (
                    <textarea
                      ref={textareaRef}
                      value={activeNewsletter?.content || ''}
                      onChange={e => setActiveNewsletter(p => ({ ...p, content: e.target.value }))}
                      placeholder={`Start writing your newsletter...\n\nTip: Select text and click B for bold, H1 for a big heading, or â€¢ List for bullets.`}
                      className="w-full bg-transparent text-sm leading-relaxed min-h-[600px] focus:outline-none placeholder-muted-foreground resize-none scrollbar-hide"
                    />
                  ) : (
                    <div
                      className="min-h-[600px] text-sm leading-[1.85] text-foreground prose-custom"
                      dangerouslySetInnerHTML={{ __html: renderMarkdown(activeNewsletter?.content || '') || '<p style="color:var(--muted-foreground)">Nothing to preview yet.</p>' }}
                    />
                  )}
                </div>

                <div className="px-6 pb-5 border-t border-border pt-4 flex flex-wrap justify-between items-center gap-3">
                  <button onClick={() => setShowPreview(true)}
                    className="flex items-center gap-2 px-4 py-2.5 bg-card border border-border rounded-xl text-[10px] font-black uppercase tracking-widest text-muted-foreground hover:text-foreground transition-all">
                    <EyeIcon className="w-4 h-4" /> A4 Preview
                  </button>
                  <button onClick={handleSave} disabled={saving || !activeNewsletter?.title}
                    className="flex items-center gap-3 px-6 py-2.5 bg-primary hover:bg-primary/90 rounded-xl text-[10px] font-black uppercase tracking-widest text-primary-foreground shadow-lg shadow-primary/30 disabled:opacity-50 transition-all">
                    {saving ? <ArrowPathIcon className="w-4 h-4 animate-spin" /> : <CheckCircleIcon className="w-4 h-4" />}
                    Save
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* â”€â”€ A4 Preview Overlay â”€â”€ */}
        {showPreview && (
          <div className="fixed inset-0 z-[60] flex flex-col bg-background/95 backdrop-blur-2xl">
            <div className="flex items-center justify-between p-5 border-b border-border bg-background/50 shrink-0">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 bg-primary/20 rounded-xl flex items-center justify-center border border-primary/30">
                  <EyeIcon className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <h3 className="text-sm font-black uppercase tracking-widest">A4 Preview</h3>
                  <span className="text-[10px] text-muted-foreground font-bold uppercase tracking-widest">
                    {fontSize} · {twoColumn ? '2-col' : '1-col'}{issueNumber ? ` · Issue ${issueNumber}` : ''}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={handlePrintNewsletter}
                  className="hidden sm:flex items-center gap-2 px-4 py-2.5 bg-card border border-border rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-muted transition-all">
                  <PrinterIcon className="w-3.5 h-3.5 text-primary" /> Print
                </button>
                <button onClick={handleExportPDF}
                  className="hidden sm:flex items-center gap-2 px-4 py-2.5 bg-primary/10 border border-primary/20 text-primary rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-primary/20 transition-all">
                  <DocumentTextIcon className="w-3.5 h-3.5" /> Export PDF
                </button>
                <button onClick={() => setShowPreview(false)}
                  className="w-10 h-10 flex items-center justify-center bg-card hover:bg-rose-500/20 rounded-xl transition-all group">
                  <XMarkIcon className="w-5 h-5 text-muted-foreground group-hover:text-rose-600 dark:group-hover:text-rose-400" />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-auto p-6 bg-black/40 flex items-start justify-center">
              {/* Single source of truth: the EXACT print/PDF document, isolated in an iframe so
                  its print CSS can't leak into the app and the preview always matches the output. */}
              <iframe
                title="A4 newsletter preview"
                srcDoc={buildPrintHTML(true)}
                className="bg-white shadow-[0_0_80px_rgba(0,0,0,0.5)] origin-top"
                style={{ width: 794, height: 1123, border: 'none', transform: 'scale(0.72)', transformOrigin: 'top center' }}
              />
            </div>
          </div>
        )}

        {/* â”€â”€ Push Modal â”€â”€ */}
        {showPushModal && (
          <div className="mobile-native-dialog fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
            <div role="dialog" aria-modal="true" className="bg-popover border border-border rounded-[40px] w-full max-w-md shadow-2xl overflow-hidden">
              <div className="p-8 space-y-6">
                <div className="flex items-center justify-between">
                  <h3 className="text-xl font-bold">Push to Recipients</h3>
                  <button onClick={() => setShowPushModal(false)} className="p-2 hover:bg-card rounded-xl transition-colors">
                    <XMarkIcon className="w-5 h-5 text-muted-foreground" />
                  </button>
                </div>
                <p className="text-sm text-muted-foreground">Select who should receive this newsletter. It will appear as a notification upon their next login.</p>
                <div className="grid grid-cols-1 gap-2">
                  {[
                    { id: 'all', label: 'All Users', icon: UserGroupIcon },
                    { id: 'students', label: 'Students Only', icon: AcademicCapIcon },
                    { id: 'teachers', label: 'Teachers Only', icon: UserGroupIcon },
                    { id: 'schools', label: 'Partner Schools Only', icon: BuildingOfficeIcon },
                  ].map(t => (
                    <button key={t.id} onClick={() => setTargetType(t.id as any)}
                      className={`flex items-center gap-3 px-4 py-4 rounded-xl border transition-all ${targetType === t.id ? 'bg-primary/10 border-primary/50' : 'bg-card border-border text-muted-foreground hover:bg-muted'}`}>
                      <t.icon className={`w-5 h-5 ${targetType === t.id ? 'text-primary' : ''}`} />
                      <span className="text-sm font-bold">{t.label}</span>
                    </button>
                  ))}
                </div>
                {/* Also email + Schedule */}
                <label className="flex items-center gap-3 px-4 py-3 rounded-xl border border-border bg-card cursor-pointer">
                  <input type="checkbox" checked={sendEmail} onChange={e => setSendEmail(e.target.checked)} className="accent-primary w-4 h-4" />
                  <span className="text-sm font-bold text-foreground">Also send by email</span>
                  <span className="ml-auto text-[10px] text-muted-foreground">recipients with a real inbox</span>
                </label>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">Schedule (optional)</label>
                  <input type="datetime-local" value={scheduleFor} onChange={e => setScheduleFor(e.target.value)}
                    className="w-full px-3 py-2 bg-card border border-border rounded-xl text-sm text-foreground focus:outline-none focus:border-primary" />
                  <p className="text-[10px] text-muted-foreground">Leave blank to send now. A scheduled newsletter auto-publishes at the chosen time.</p>
                </div>
                <div className="flex items-center gap-3 p-4 bg-primary/10 border border-primary/20 rounded-xl">
                  <InformationCircleIcon className="w-5 h-5 text-primary shrink-0" />
                  <p className="text-[11px] text-primary font-medium">In-app: recipients see it on next login{sendEmail ? '; email is best-effort' : ''}.</p>
                </div>
                <button onClick={handlePush} disabled={pushing}
                  className="w-full py-4 bg-emerald-700 hover:bg-emerald-800 text-white text-sm font-black rounded-xl flex items-center justify-center gap-2 shadow-xl shadow-emerald-900/40 disabled:opacity-50">
                  {pushing ? <ArrowPathIcon className="w-5 h-5 animate-spin" /> : <SpeakerWaveIcon className="w-5 h-5" />}
                  {scheduleFor ? 'Schedule Newsletter' : 'Confirm & Push Newsletter'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      <style dangerouslySetInnerHTML={{ __html: `
        .prose-custom h2 { font-size:1.3em;font-weight:900;margin:1.1em 0 .4em;text-transform:uppercase;border-bottom:2px solid #374151;padding-bottom:.25em;font-family:sans-serif }
        .prose-custom h3 { font-size:1.1em;font-weight:900;margin:.9em 0 .3em;text-transform:uppercase;font-family:sans-serif }
        .prose-custom h4 { font-size:1em;font-weight:800;margin:.75em 0 .25em;font-style:italic }
        .prose-custom p { margin-bottom:.65em;line-height:1.85 }
        .prose-custom ul { list-style:disc;margin:.4em 0 .65em 1.4em }
        .prose-custom ol { list-style:decimal;margin:.4em 0 .65em 1.4em }
        .prose-custom li { margin:.15em 0;line-height:1.7 }
        .prose-custom hr { border:none;border-top:1px solid #e5e7eb;margin:.8em 0 }
        .prose-custom .nl-gap { height:.4em }
        .prose-custom code { background:#f3f4f6;padding:.1em .3em;border-radius:3px;font-size:.85em;font-family:monospace }
        .prose-custom strong { font-weight:900 }
      `}} />
    </div>
  );
}
