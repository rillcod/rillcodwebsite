// @refresh reset
'use client';

import { useState, useEffect, useRef } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/contexts/auth-context';
import { createClient } from '@/lib/supabase/client';
import {
  ArrowLeftIcon, AcademicCapIcon, ClockIcon, CheckCircleIcon,
  XCircleIcon, UserGroupIcon, ChartBarIcon, PencilIcon, PrinterIcon,
  CheckIcon, XMarkIcon,
} from '@/lib/icons';

// Inline markdown renderer for UI display of question/option text
function MarkdownText({ text, className }: { text: string; className?: string }) {
  const html = (text ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    // code spans first (protect from bold/italic)
    .replace(/`([^`\n]+)`/g, '<code class="font-mono text-[0.8em] bg-cyan-500/10 text-cyan-400 px-1.5 py-0.5 rounded border border-cyan-500/20">$1</code>')
    .replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>')
    .replace(/\*\*(.+?)\*\*/g, '<strong class="font-black text-foreground">$1</strong>')
    .replace(/__(.+?)__/g, '<strong class="font-black text-foreground">$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/_(.+?)_/g, '<em>$1</em>')
    .replace(/~~(.+?)~~/g, '<s class="opacity-50">$1</s>');
  return <span className={className} dangerouslySetInnerHTML={{ __html: html }} />;
}

export default function ExamDetailPage() {
  const params = useParams() as { id?: string };
  const searchParams = useSearchParams();
  const classId = searchParams?.get('class_id');
  const { profile, loading: authLoading } = useAuth();
  const [exam, setExam] = useState<any>(null);
  const [questions, setQuestions] = useState<any[]>([]);
  const [sessions, setSessions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [printMenuOpen, setPrintMenuOpen] = useState(false);
  const [showReview, setShowReview] = useState(false);
  const [printFilter, setPrintFilter] = useState<'all' | 'mcq' | 'theory'>('all');
  const [printMcqCount, setPrintMcqCount] = useState<string>('');      // '' = all
  const [printTheoryCount, setPrintTheoryCount] = useState<string>(''); // '' = all
  const [printDuration, setPrintDuration] = useState<string>('');       // '' = use exam default
  const [printPassMark, setPrintPassMark] = useState<string>('');       // '' = use exam default
  const printMenuRef = useRef<HTMLDivElement>(null);

  const role = profile?.role ?? '';
  const isStaff = role === 'admin' || role === 'teacher' || role === 'school';

  useEffect(() => {
    if (authLoading || !profile) return;
    const db = createClient();
    const id = params?.id as string;
    if (!id) return;

    if (isStaff) {
      // Fetch sessions without the portal_users join (RLS blocks it from the browser client)
      // Then enrich with student names from the API
      Promise.all([
        db.from('cbt_exams').select('*, programs(name)').eq('id', id).single(),
        db.from('cbt_questions').select('*').eq('exam_id', id).order('order_index'),
        db.from('cbt_sessions').select('*').eq('exam_id', id).order('created_at', { ascending: false }),
        fetch('/api/portal-users?role=student&scoped=true', { cache: 'no-store' }).then(r => r.json()).catch(() => ({ data: [] })),
      ]).then(([examRes, qRes, sesRes, usersJson]) => {
        const umap: Record<string, any> = {};
        (usersJson.data ?? []).forEach((u: any) => { umap[u.id] = u; });
        let rawSessions: any[] = sesRes.data ?? [];
        // Filter by school if school role
        if (role === 'school' && profile.school_id) {
          rawSessions = rawSessions.filter((s: any) => umap[s.user_id]?.school_id === profile.school_id);
        }
        const enriched = rawSessions.map((s: any) => ({
          ...s,
          portal_users: umap[s.user_id] ?? null,
        }));
        setExam(examRes.data);
        setQuestions(qRes.data ?? []);
        setSessions(enriched);
        setLoading(false);
      });
    } else {
      Promise.all([
        db.from('cbt_exams').select('*, programs(name)').eq('id', id).single(),
        db.from('cbt_questions').select('*').eq('exam_id', id).order('order_index'),
        db.from('cbt_sessions').select('*').eq('exam_id', id).eq('user_id', profile.id),
      ]).then(([examRes, qRes, sesRes]) => {
        setExam(examRes.data);
        setQuestions(qRes.data ?? []);
        setSessions(sesRes.data ?? []);
        setLoading(false);
      });
    }
  }, [profile?.id, params?.id, authLoading]); // eslint-disable-line

  if (authLoading || loading) return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="w-10 h-10 border-4 border-orange-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );
  if (!exam) return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <p className="text-muted-foreground">Exam not found.</p>
    </div>
  );

  const totalPoints = questions.reduce((s, q) => s + (q.points ?? 0), 0);
  const mySession = !isStaff ? sessions[0] : null;

  const handlePrintExam = (mode: 'student' | 'staff' = 'student', filter: 'all' | 'mcq' | 'theory' = 'all') => {
    const today = new Date().toLocaleDateString('en-GB', { year: 'numeric', month: 'long', day: 'numeric' });
    const schoolName = profile?.school_name || 'RILLCOD TECHNOLOGIES';
    const logoUrl = window.location.origin + '/logo.png';

    const allMcq  = questions.filter((q: any) =>  q.options && Array.isArray(q.options) && q.options.length > 0);
    const allOpen = questions.filter((q: any) => !q.options || !Array.isArray(q.options) || q.options.length === 0);

    // Apply count limits from print settings
    const mcqLimit   = printMcqCount    ? Math.max(1, parseInt(printMcqCount,    10)) : undefined;
    const theoryLimit = printTheoryCount ? Math.max(1, parseInt(printTheoryCount, 10)) : undefined;

    const rawMcq  = filter === 'theory' ? [] : allMcq;
    const rawOpen = filter === 'mcq'    ? [] : allOpen;
    const mcqQuestions  = mcqLimit   ? rawMcq.slice(0, mcqLimit)   : rawMcq;
    const openQuestions = theoryLimit ? rawOpen.slice(0, theoryLimit) : rawOpen;

    if (mcqQuestions.length === 0 && openQuestions.length === 0) {
      alert(`No ${filter === 'mcq' ? 'objective (MCQ)' : 'theory'} questions found in this exam.`);
      return;
    }

    // Override duration / pass mark if set in print settings
    const durationVal  = printDuration  ? parseInt(printDuration,  10) : exam.duration_minutes;
    const passMarkVal  = printPassMark  ? parseInt(printPassMark,  10) : (exam.passing_score ?? 70);

    const mcqPoints  = mcqQuestions.reduce((s: number, q: any)  => s + (q.points ?? 0), 0);
    const openPoints = openQuestions.reduce((s: number, q: any) => s + (q.points ?? 0), 0);
    const examTypeLabel = filter === 'mcq' ? 'OBJECTIVE EXAMINATION' : filter === 'theory' ? 'THEORY EXAMINATION' : 'EXAMINATION';

    // Lines per question type
    const lineCount = (q: any) => q.question_type === 'essay' ? 12 : q.question_type === 'fill_blank' ? 4 : 8;

    // Full markdown → HTML for print output
    function mdToHtml(text: string): string {
      const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      const codeBlocks: string[] = [];
      let t = (text ?? '').replace(/```(\w*)\n?([\s\S]*?)```/g, (_m, lang, code) => {
        const lbl = lang ? `<span style="font-size:7.5pt;font-weight:700;color:#7c3aed;text-transform:uppercase;letter-spacing:0.5px;display:block;margin-bottom:2pt">${esc(lang)}</span>` : '';
        codeBlocks.push(`<div style="margin:4pt 0;background:#1e1e2e;padding:7pt 9pt;border-left:3pt solid #7c3aed">${lbl}<pre style="margin:0;font-family:'Courier New',monospace;font-size:8.5pt;color:#cdd6f4;white-space:pre-wrap;word-break:break-all;line-height:1.5">${esc(code.trimEnd())}</pre></div>`);
        return `\x00C${codeBlocks.length - 1}\x00`;
      });
      const lines = t.split('\n');
      const out: string[] = [];
      let i = 0;
      while (i < lines.length) {
        const ln = lines[i];
        if (/^### /.test(ln)) { out.push(`<div style="font-size:9pt;font-weight:900;color:#4c1d95;margin:6pt 0 2pt;text-transform:uppercase;letter-spacing:0.5px">${inl(ln.slice(4))}</div>`); i++; continue; }
        if (/^## /.test(ln))  { out.push(`<div style="font-size:10pt;font-weight:900;color:#4c1d95;margin:7pt 0 3pt;border-bottom:0.5pt solid #ddd6fe;padding-bottom:2pt">${inl(ln.slice(3))}</div>`); i++; continue; }
        if (/^# /.test(ln))   { out.push(`<div style="font-size:11pt;font-weight:900;color:#4c1d95;margin:8pt 0 4pt">${inl(ln.slice(2))}</div>`); i++; continue; }
        if (/^> /.test(ln)) {
          const qs: string[] = [];
          while (i < lines.length && /^> /.test(lines[i])) { qs.push(lines[i].slice(2)); i++; }
          out.push(`<div style="border-left:2.5pt solid #7c3aed;background:#f5f3ff;padding:4pt 8pt;margin:4pt 0;font-size:9pt;color:#374151;font-style:italic">${inl(qs.join(' '))}</div>`);
          continue;
        }
        if (/^---+$/.test(ln.trim())) { out.push(`<hr style="border:none;border-top:0.5pt solid #d1d5db;margin:5pt 0"/>`); i++; continue; }
        if (/^[-*] /.test(ln)) {
          const its: string[] = [];
          while (i < lines.length && /^[-*] /.test(lines[i])) { its.push(lines[i].slice(2)); i++; }
          out.push(`<ul style="margin:3pt 0 3pt 14pt;padding:0;list-style:disc">${its.map(it => `<li style="font-size:9.5pt;line-height:1.5;margin-bottom:1.5pt">${inl(it)}</li>`).join('')}</ul>`);
          continue;
        }
        if (/^\d+\. /.test(ln)) {
          const its: string[] = [];
          while (i < lines.length && /^\d+\. /.test(lines[i])) { its.push(lines[i].replace(/^\d+\. /, '')); i++; }
          out.push(`<ol style="margin:3pt 0 3pt 14pt;padding:0;list-style:decimal">${its.map(it => `<li style="font-size:9.5pt;line-height:1.5;margin-bottom:1.5pt">${inl(it)}</li>`).join('')}</ol>`);
          continue;
        }
        if (/^\x00C\d+\x00$/.test(ln.trim())) {
          const idx = parseInt(ln.trim().replace(/\x00C(\d+)\x00/, '$1'), 10);
          out.push(codeBlocks[idx] ?? ''); i++; continue;
        }
        if (!ln.trim()) { out.push('<br/>'); i++; continue; }
        const para: string[] = [];
        while (i < lines.length && lines[i].trim() && !/^#{1,3} /.test(lines[i]) && !/^[-*] /.test(lines[i]) && !/^\d+\. /.test(lines[i]) && !/^> /.test(lines[i]) && !/^---+$/.test(lines[i].trim()) && !/^\x00C/.test(lines[i])) {
          para.push(lines[i]); i++;
        }
        if (para.length) out.push(`<span style="font-size:10.5pt;line-height:1.6">${inl(para.join(' '))}</span>`);
      }
      return out.join('');
      function inl(s: string): string {
        return s
          .replace(/\x00C(\d+)\x00/g, (_, idx) => codeBlocks[parseInt(idx, 10)] ?? '')
          .replace(/`([^`\n]+)`/g, '<code style="font-family:\'Courier New\',monospace;font-size:8.5pt;background:#f0f0f8;color:#4c1d95;padding:0.5pt 3pt;border:0.5pt solid #ddd6fe">$1</code>')
          .replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>')
          .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
          .replace(/__(.+?)__/g, '<strong>$1</strong>')
          .replace(/\*(.+?)\*/g, '<em>$1</em>')
          .replace(/_(.+?)_/g, '<em>$1</em>')
          .replace(/~~(.+?)~~/g, '<s>$1</s>')
          .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
      }
    }

    const renderQuestion = (q: any, globalNum: number) => {
      const isMCQ    = q.options && Array.isArray(q.options) && q.options.length > 0;
      const isCorrect = (opt: string) => mode === 'staff' && opt === q.correct_answer;
      return `
      <div class="q-block">
        <div class="q-header">
          <span class="q-num">${globalNum}.</span>
          <div class="q-text">${mdToHtml(q.question_text)}</div>
          <span class="q-pts">${q.points ?? 1} mark${(q.points ?? 1) !== 1 ? 's' : ''}</span>
        </div>
        ${isMCQ ? `
        <div class="options">
          ${(q.options as string[]).map((opt: string, oi: number) => `
          <div class="opt ${isCorrect(opt) ? 'correct' : ''}">
            <span class="bubble">${String.fromCharCode(65 + oi)}</span>
            <span class="opt-text">${mdToHtml(opt)}</span>
            ${isCorrect(opt) ? '<span class="tick">✓</span>' : ''}
          </div>`).join('')}
        </div>` : `
        <div class="ans-block">
          ${Array.from({ length: lineCount(q) }).map(() => '<div class="ans-line"></div>').join('')}
        </div>`}
      </div>`;
    };

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<title>${exam.title}</title>
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Times New Roman', Georgia, serif; background: #fff; color: #000; font-size: 11.5pt; }
  @page { size: A4 portrait; margin: 15mm 18mm 14mm; }
  .page { width: 100%; }

  /* ══ OFFICIAL HEADER ══ */
  .official-hdr { display: flex; align-items: center; gap: 14pt; padding-bottom: 10pt; border-bottom: 3pt double #000; margin-bottom: 5pt; }
  .hdr-logo { width: 52pt; height: 52pt; object-fit: contain; flex-shrink: 0; }
  .hdr-org { flex: 1; text-align: center; }
  .hdr-school { font-size: 13pt; font-weight: 900; text-transform: uppercase; letter-spacing: 1.5px; line-height: 1.2; }
  .hdr-brand  { font-size: 8pt; font-weight: 700; text-transform: uppercase; letter-spacing: 2px; color: #444; margin-top: 2pt; }
  .hdr-web    { font-size: 7.5pt; color: #888; margin-top: 1pt; }
  .hdr-type   { background: #000; color: #fff; padding: 5pt 10pt; font-size: 7.5pt; font-weight: 900; text-transform: uppercase; letter-spacing: 2px; text-align: center; flex-shrink: 0; align-self: flex-start; margin-top: 4pt; }

  /* ══ EXAM TITLE BAND ══ */
  .title-band { text-align: center; margin: 8pt 0; }
  .exam-title { font-size: 15pt; font-weight: 900; text-transform: uppercase; letter-spacing: 1px; }
  .exam-sub   { font-size: 9pt; color: #555; margin-top: 3pt; }

  /* ══ META GRID ══ */
  .meta-grid { display: grid; grid-template-columns: repeat(5, 1fr); border: 1pt solid #000; margin: 8pt 0; }
  .meta-cell { padding: 5pt 6pt; border-right: 1pt solid #aaa; text-align: center; }
  .meta-cell:last-child { border-right: none; }
  .meta-label { font-size: 6.5pt; font-weight: 900; text-transform: uppercase; letter-spacing: 1px; color: #666; display: block; margin-bottom: 2pt; }
  .meta-val   { font-size: 10pt; font-weight: 700; display: block; }

  /* ══ STUDENT INFO BOX ══ */
  .stu-box { display: grid; grid-template-columns: 2.5fr 1fr 1fr 1fr; border: 1.5pt solid #000; margin: 8pt 0; }
  .stu-field { padding: 6pt 8pt 4pt; border-right: 1pt solid #888; }
  .stu-field:last-child { border-right: none; }
  .stu-label { font-size: 7pt; font-weight: 900; text-transform: uppercase; letter-spacing: 1px; color: #555; display: block; margin-bottom: 5pt; }
  .stu-line  { border-bottom: 1pt solid #333; height: 13pt; }

  /* ══ INSTRUCTIONS ══ */
  .instructions { background: #f5f5f5; border: 1pt solid #ccc; border-left: 4pt solid #000; padding: 7pt 10pt; margin: 8pt 0 12pt; font-size: 9.5pt; line-height: 1.6; }
  .instructions b { font-size: 8pt; text-transform: uppercase; letter-spacing: 1px; }

  /* ══ SECTION HEADER ══ */
  .section-hdr { display: flex; align-items: center; gap: 8pt; margin: 14pt 0 10pt; }
  .s-rule  { flex: 1; border-top: 1.5pt solid #000; }
  .s-title { font-size: 9.5pt; font-weight: 900; text-transform: uppercase; letter-spacing: 2px; white-space: nowrap; padding: 0 8pt; border: 1pt solid #000; }
  .s-pts   { font-size: 8.5pt; color: #444; font-weight: 700; white-space: nowrap; }

  /* ══ QUESTIONS ══ */
  .q-block  { margin-bottom: 18pt; page-break-inside: avoid; }
  .q-header { display: flex; gap: 8pt; align-items: flex-start; margin-bottom: 6pt; }
  .q-num    { font-size: 11pt; font-weight: 900; min-width: 22pt; flex-shrink: 0; padding-top: 1pt; }
  .q-text   { flex: 1; font-size: 11.5pt; line-height: 1.6; }
  .q-pts    { font-size: 8pt; font-weight: 700; color: #555; white-space: nowrap; flex-shrink: 0; font-style: italic; padding-top: 3pt; }

  /* MCQ options — 2-column grid */
  .options { display: grid; grid-template-columns: 1fr 1fr; gap: 5pt 20pt; margin: 4pt 0 0 30pt; }
  .opt     { display: flex; align-items: flex-start; gap: 6pt; font-size: 10.5pt; line-height: 1.45; padding: 2pt 0; }
  .opt.correct { font-weight: 700; }
  .bubble  { display: inline-flex; align-items: center; justify-content: center; width: 15pt; height: 15pt; border: 1.2pt solid #000; border-radius: 50%; font-size: 8.5pt; font-weight: 900; flex-shrink: 0; margin-top: 0.5pt; }
  .opt.correct .bubble { background: #000; color: #fff; }
  .opt-text { flex: 1; }
  .tick    { font-size: 9pt; font-weight: 900; margin-left: 3pt; }

  /* Theory answer lines — generous spacing */
  .ans-block { margin: 4pt 0 0 30pt; }
  .ans-line  { border-bottom: 0.8pt solid #bbb; height: 24pt; margin-bottom: 1pt; }

  /* ══ SCORE BOX (bottom of student page) ══ */
  .score-box { border: 1.5pt solid #000; display: flex; margin-top: 20pt; page-break-inside: avoid; }
  .score-cell { flex: 1; padding: 6pt 10pt; border-right: 1pt solid #aaa; text-align: center; }
  .score-cell:last-child { border-right: none; }
  .score-label { font-size: 7pt; font-weight: 900; text-transform: uppercase; letter-spacing: 1px; color: #666; display: block; margin-bottom: 8pt; }
  .score-space { height: 16pt; border-bottom: 1pt solid #333; }

  /* ══ PAGE FOOTER ══ */
  .page-footer { margin-top: 14pt; border-top: 0.75pt solid #ccc; padding-top: 5pt; display: flex; justify-content: space-between; font-size: 7.5pt; color: #777; font-style: italic; }

  /* ══ ANSWER KEY PAGE ══ */
  .ak-page { page-break-before: always; }
  .ak-official { display: flex; align-items: center; gap: 10pt; border-bottom: 3pt double #000; padding-bottom: 8pt; margin-bottom: 12pt; }
  .ak-logo { width: 38pt; height: 38pt; object-fit: contain; }
  .ak-org  { flex: 1; }
  .ak-school { font-size: 11pt; font-weight: 900; text-transform: uppercase; }
  .ak-brand  { font-size: 7pt; text-transform: uppercase; letter-spacing: 2px; color: #555; margin-top: 1pt; }
  .ak-badge  { background: #000; color: #fff; padding: 4pt 10pt; font-size: 7pt; font-weight: 900; text-transform: uppercase; letter-spacing: 2px; }
  .ak-exam-title { font-size: 13pt; font-weight: 900; text-transform: uppercase; text-align: center; margin: 8pt 0 4pt; letter-spacing: 1px; }
  .ak-sub { text-align: center; font-size: 8pt; color: #c00; font-weight: 900; text-transform: uppercase; letter-spacing: 2px; margin-bottom: 14pt; }

  .ak-grid { display: grid; grid-template-columns: repeat(6, 1fr); gap: 5pt; margin-bottom: 18pt; }
  .ak-cell { border: 1pt solid #ccc; padding: 5pt; text-align: center; }
  .ak-qn   { font-size: 7pt; color: #888; font-weight: 900; text-transform: uppercase; }
  .ak-ans  { font-size: 11pt; font-weight: 900; margin-top: 2pt; }

  .ak-open-title { font-size: 8.5pt; font-weight: 900; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 10pt; border-bottom: 1pt solid #ddd; padding-bottom: 4pt; }
  .ak-item { margin-bottom: 14pt; page-break-inside: avoid; padding-left: 10pt; border-left: 2pt solid #ddd; }
  .ak-q    { font-size: 10.5pt; font-weight: 700; margin-bottom: 4pt; }
  .ak-a    { font-size: 10pt; color: #222; line-height: 1.6; }
  .ak-a-label { font-size: 7pt; font-weight: 900; text-transform: uppercase; letter-spacing: 1px; color: #888; margin-bottom: 2pt; }

  .sig-row { display: flex; gap: 20pt; margin-top: 24pt; }
  .sig-block { flex: 1; border-top: 1pt solid #333; padding-top: 4pt; }
  .sig-label { font-size: 7.5pt; font-weight: 900; text-transform: uppercase; letter-spacing: 1px; color: #555; }

  .score-tbl { width: 100%; border-collapse: collapse; margin-top: 18pt; font-size: 10pt; }
  .score-tbl th, .score-tbl td { border: 1pt solid #aaa; padding: 6pt 10pt; text-align: left; }
  .score-tbl th { background: #f0f0f0; font-weight: 900; font-size: 8pt; text-transform: uppercase; letter-spacing: 1px; }

  @media print {
    body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .q-block  { page-break-inside: avoid; }
    .ak-item  { page-break-inside: avoid; }
    .ak-page  { page-break-before: always; }
  }
</style>
</head>
<body>
<div class="page">

  <!-- ══ OFFICIAL HEADER ══ -->
  <div class="official-hdr">
    <img src="${logoUrl}" class="hdr-logo" onerror="this.style.display='none'" />
    <div class="hdr-org">
      <div class="hdr-school">${schoolName}</div>
      <div class="hdr-brand">Rillcod Technologies · Coding &amp; STEM Academy</div>
      <div class="hdr-web">www.rillcod.com</div>
    </div>
    <div class="hdr-type">${examTypeLabel}</div>
  </div>

  <!-- ══ EXAM TITLE ══ -->
  <div class="title-band">
    <div class="exam-title">${exam.title}</div>
    ${exam.programs?.name || exam.courses?.title ? `<div class="exam-sub">${[exam.programs?.name, exam.courses?.title].filter(Boolean).join(' · ')}</div>` : ''}
  </div>

  <!-- ══ META GRID ══ -->
  <div class="meta-grid">
    <div class="meta-cell"><span class="meta-label">Duration</span><span class="meta-val">${durationVal ? durationVal + ' min' : '—'}</span></div>
    <div class="meta-cell"><span class="meta-label">Total Marks</span><span class="meta-val">${mcqPoints + openPoints}</span></div>
    <div class="meta-cell"><span class="meta-label">Pass Mark</span><span class="meta-val">${passMarkVal}%</span></div>
    <div class="meta-cell"><span class="meta-label">Questions</span><span class="meta-val">${mcqQuestions.length + openQuestions.length}</span></div>
    <div class="meta-cell"><span class="meta-label">Date</span><span class="meta-val">${today}</span></div>
  </div>

  <!-- ══ STUDENT INFO BOX ══ -->
  <div class="stu-box">
    <div class="stu-field"><span class="stu-label">Student Full Name</span><div class="stu-line"></div></div>
    <div class="stu-field"><span class="stu-label">Class / Grade</span><div class="stu-line"></div></div>
    <div class="stu-field"><span class="stu-label">Admission No.</span><div class="stu-line"></div></div>
    <div class="stu-field"><span class="stu-label">Score / Marks</span><div class="stu-line"></div></div>
  </div>

  <!-- ══ INSTRUCTIONS ══ -->
  <div class="instructions">
    <b>Instructions to Candidates:</b>&nbsp;
    ${exam.description ? exam.description + ' ' : ''}
    Answer <u>ALL</u> questions.${mcqQuestions.length > 0 ? ' For objective questions, <strong>circle</strong> the letter of the correct answer — do <em>not</em> tick or underline.' : ''}${openQuestions.length > 0 ? ' Write your answers legibly in the spaces provided. Use a blue or black biro.' : ''} No unauthorised materials. Mobile phones must be switched off.
  </div>

  <!-- ══ SECTION A: MCQ ══ -->
  ${mcqQuestions.length > 0 ? `
  <div class="section-hdr">
    <div class="s-rule"></div>
    <span class="s-title">Section A — Objective Questions</span>
    <span class="s-pts">[${mcqPoints} marks]</span>
    <div class="s-rule"></div>
  </div>
  ${mcqQuestions.map((q: any, i: number) => renderQuestion(q, i + 1)).join('')}
  ` : ''}

  <!-- ══ SECTION B: THEORY ══ -->
  ${openQuestions.length > 0 ? `
  <div class="section-hdr">
    <div class="s-rule"></div>
    <span class="s-title">Section B — Theory Questions</span>
    <span class="s-pts">[${openPoints} marks]</span>
    <div class="s-rule"></div>
  </div>
  ${openQuestions.map((q: any, i: number) => renderQuestion(q, mcqQuestions.length + i + 1)).join('')}
  ` : ''}

  <!-- ══ SCORE BOX ══ -->
  <div class="score-box">
    ${mcqQuestions.length > 0 ? `<div class="score-cell"><span class="score-label">Section A Score</span><div class="score-space"></div></div>` : ''}
    ${openQuestions.length > 0 ? `<div class="score-cell"><span class="score-label">Section B Score</span><div class="score-space"></div></div>` : ''}
    <div class="score-cell"><span class="score-label">Total Score</span><div class="score-space"></div></div>
    <div class="score-cell"><span class="score-label">Examiner's Signature</span><div class="score-space"></div></div>
  </div>

  <!-- ══ FOOTER ══ -->
  <div class="page-footer">
    <span>${schoolName} · ${examTypeLabel} · ${today}</span>
    <span>www.rillcod.com</span>
  </div>
</div>

${mode === 'staff' ? `
<!-- ══════════════ ANSWER KEY / MARKING SCHEME ══════════════ -->
<div class="page ak-page">
  <div class="ak-official">
    <img src="${logoUrl}" class="ak-logo" onerror="this.style.display='none'" />
    <div class="ak-org">
      <div class="ak-school">${schoolName}</div>
      <div class="ak-brand">Rillcod Technologies · Coding &amp; STEM Academy</div>
    </div>
    <div class="ak-badge">Marking Scheme — Staff Only</div>
  </div>
  <div class="ak-exam-title">${exam.title}</div>
  <div class="ak-sub">Confidential — Do Not Distribute to Students</div>

  ${mcqQuestions.length > 0 ? `
  <div class="ak-open-title">Section A — Objective Answer Key</div>
  <div class="ak-grid">
    ${mcqQuestions.map((q: any, i: number) => `
    <div class="ak-cell">
      <div class="ak-qn">Q${i + 1}</div>
      <div class="ak-ans">${q.correct_answer ?? '—'}</div>
    </div>`).join('')}
  </div>` : ''}

  ${openQuestions.length > 0 ? `
  <div class="ak-open-title">Section B — Theory Model Answers</div>
  ${openQuestions.map((q: any, i: number) => `
  <div class="ak-item">
    <div class="ak-q">${mcqQuestions.length + i + 1}. ${mdToHtml(q.question_text)}</div>
    <div class="ak-a-label">Expected Answer / Marking Guide:</div>
    <div class="ak-a">${q.correct_answer ? mdToHtml(q.correct_answer) : '<em style="color:#aaa">No model answer provided</em>'}</div>
  </div>`).join('')}` : ''}

  <table class="score-tbl">
    <thead>
      <tr><th>Section</th><th>Questions</th><th>Max Marks</th><th>Score Obtained</th><th>Remarks</th></tr>
    </thead>
    <tbody>
      ${mcqQuestions.length > 0 ? `<tr><td>Section A — Objective</td><td>${mcqQuestions.length}</td><td>${mcqPoints}</td><td></td><td></td></tr>` : ''}
      ${openQuestions.length > 0 ? `<tr><td>Section B — Theory</td><td>${openQuestions.length}</td><td>${openPoints}</td><td></td><td></td></tr>` : ''}
      <tr><td><strong>TOTAL</strong></td><td><strong>${mcqQuestions.length + openQuestions.length}</strong></td><td><strong>${totalPoints}</strong></td><td></td><td></td></tr>
    </tbody>
  </table>

  <div class="sig-row">
    <div class="sig-block"><span class="sig-label">Examiner's Signature &amp; Date</span></div>
    <div class="sig-block"><span class="sig-label">Co-ordinator's Signature &amp; Date</span></div>
    <div class="sig-block"><span class="sig-label">Head of Department</span></div>
  </div>

  <div class="page-footer">
    <span>${schoolName} — Marking Scheme</span>
    <span>Staff Copy · ${today}</span>
  </div>
</div>
` : ''}

<script>window.onload = () => { window.print(); }</script>
</body>
</html>`;
    const win = window.open('', '_blank');
    win?.document.write(html);
    win?.document.close();
  };

  return (
    <div className="space-y-6 pb-20">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        <Link href={classId ? `/dashboard/classes/${classId}` : `/dashboard/cbt`} className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeftIcon className="w-4 h-4" /> {classId ? 'Back to Class' : 'Back to CBT'}
        </Link>

        {/* Exam header */}
        <div className="bg-card shadow-sm border border-border rounded-none p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <AcademicCapIcon className="w-5 h-5 text-emerald-400" />
                <span className="text-xs font-bold text-emerald-400 uppercase tracking-widest">{exam.programs?.name}</span>
              </div>
              <h1 className="text-2xl font-extrabold mb-2">{exam.title}</h1>
              {exam.description && <p className="text-muted-foreground text-sm">{exam.description}</p>}
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <span className={`px-3 py-1 rounded-full text-xs font-bold border ${exam.is_active ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' : 'bg-muted text-muted-foreground border-border'}`}>
                {exam.is_active ? 'Active' : 'Inactive'}
              </span>
              {isStaff && (
                <>
                  {/* Print dropdown */}
                  <div className="relative" ref={printMenuRef}>
                    <button
                      onClick={() => setPrintMenuOpen(o => !o)}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-orange-500/10 hover:bg-orange-500/20 text-orange-400 text-xs font-bold rounded-none transition-colors">
                      <PrinterIcon className="w-3.5 h-3.5" /> Print
                      <svg className="w-3 h-3 ml-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7"/></svg>
                    </button>
                    {printMenuOpen && (
                      <div className="absolute right-0 top-full mt-1 z-50 bg-card border border-border shadow-2xl shadow-black/40 rounded-none w-72" onMouseLeave={() => setPrintMenuOpen(false)}>

                        {/* ── Section: Question Type ── */}
                        <div className="px-4 py-2.5 border-b border-border">
                          <p className="text-[9px] font-black text-muted-foreground uppercase tracking-widest mb-2">Question Type</p>
                          <div className="flex gap-1">
                            {(['all', 'mcq', 'theory'] as const).map(f => (
                              <button key={f} onClick={() => setPrintFilter(f)}
                                className={`flex-1 px-2 py-1 text-[9px] font-black uppercase rounded-none border transition-colors ${printFilter === f ? 'bg-orange-500/20 border-orange-500/30 text-orange-400' : 'bg-muted border-border text-muted-foreground hover:text-foreground'}`}>
                                {f === 'all' ? 'Both' : f === 'mcq' ? 'Objective' : 'Theory'}
                              </button>
                            ))}
                          </div>
                        </div>

                        {/* ── Section: Question Counts ── */}
                        <div className="px-4 py-3 border-b border-border space-y-2.5">
                          <p className="text-[9px] font-black text-muted-foreground uppercase tracking-widest">Question Count</p>
                          <div className="grid grid-cols-2 gap-2">
                            {printFilter !== 'theory' && (
                              <div>
                                <label className="block text-[8px] font-bold text-muted-foreground uppercase tracking-widest mb-1">
                                  Obj / MCQ
                                  <span className="text-orange-400/60 ml-1 normal-case font-normal">({questions.filter((q:any) => q.options?.length > 0).length} avail)</span>
                                </label>
                                <input
                                  type="number" min="1"
                                  max={questions.filter((q:any) => q.options?.length > 0).length}
                                  value={printMcqCount}
                                  onChange={e => setPrintMcqCount(e.target.value)}
                                  placeholder="All"
                                  className="w-full px-2 py-1.5 bg-muted border border-border text-xs text-foreground placeholder-muted-foreground focus:outline-none focus:border-orange-500/50 rounded-none"
                                />
                              </div>
                            )}
                            {printFilter !== 'mcq' && (
                              <div>
                                <label className="block text-[8px] font-bold text-muted-foreground uppercase tracking-widest mb-1">
                                  Theory
                                  <span className="text-orange-400/60 ml-1 normal-case font-normal">({questions.filter((q:any) => !q.options?.length).length} avail)</span>
                                </label>
                                <input
                                  type="number" min="1"
                                  max={questions.filter((q:any) => !q.options?.length).length}
                                  value={printTheoryCount}
                                  onChange={e => setPrintTheoryCount(e.target.value)}
                                  placeholder="All"
                                  className="w-full px-2 py-1.5 bg-muted border border-border text-xs text-foreground placeholder-muted-foreground focus:outline-none focus:border-orange-500/50 rounded-none"
                                />
                              </div>
                            )}
                          </div>
                        </div>

                        {/* ── Section: Exam Settings ── */}
                        <div className="px-4 py-3 border-b border-border space-y-2.5">
                          <p className="text-[9px] font-black text-muted-foreground uppercase tracking-widest">Exam Settings</p>
                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <label className="block text-[8px] font-bold text-muted-foreground uppercase tracking-widest mb-1">
                                Duration (min)
                              </label>
                              <input
                                type="number" min="1"
                                value={printDuration}
                                onChange={e => setPrintDuration(e.target.value)}
                                placeholder={exam?.duration_minutes ? String(exam.duration_minutes) : 'Auto'}
                                className="w-full px-2 py-1.5 bg-muted border border-border text-xs text-foreground placeholder-muted-foreground focus:outline-none focus:border-orange-500/50 rounded-none"
                              />
                            </div>
                            <div>
                              <label className="block text-[8px] font-bold text-muted-foreground uppercase tracking-widest mb-1">
                                Pass Mark (%)
                              </label>
                              <input
                                type="number" min="1" max="100"
                                value={printPassMark}
                                onChange={e => setPrintPassMark(e.target.value)}
                                placeholder={String(exam?.passing_score ?? 70)}
                                className="w-full px-2 py-1.5 bg-muted border border-border text-xs text-foreground placeholder-muted-foreground focus:outline-none focus:border-orange-500/50 rounded-none"
                              />
                            </div>
                          </div>
                          <button
                            onClick={() => { setPrintMcqCount(''); setPrintTheoryCount(''); setPrintDuration(''); setPrintPassMark(''); }}
                            className="text-[8px] font-bold text-muted-foreground hover:text-orange-400 uppercase tracking-widest transition-colors">
                            Reset to defaults
                          </button>
                        </div>

                        {/* ── Print Actions ── */}
                        <button
                          onClick={() => { setPrintMenuOpen(false); handlePrintExam('student', printFilter); }}
                          className="w-full text-left px-4 py-3 text-xs font-bold hover:bg-muted transition-colors border-b border-border flex flex-col gap-0.5">
                          <span className="text-foreground">Student Copy</span>
                          <span className="text-muted-foreground font-normal">Questions only, no answers</span>
                        </button>
                        <button
                          onClick={() => { setPrintMenuOpen(false); handlePrintExam('staff', printFilter); }}
                          className="w-full text-left px-4 py-3 text-xs font-bold hover:bg-muted transition-colors flex flex-col gap-0.5">
                          <span className="text-orange-400">Staff Copy + Answer Key</span>
                          <span className="text-muted-foreground font-normal">Includes marked answers &amp; key</span>
                        </button>
                      </div>
                    )}
                  </div>
                  <Link href={`/dashboard/cbt/${exam.id}/edit`}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 text-xs font-bold rounded-none transition-colors">
                    <PencilIcon className="w-3.5 h-3.5" /> Edit Exam
                  </Link>
                </>
              )}
            </div>
          </div>
          <div className="flex flex-wrap gap-4 mt-4 text-sm text-muted-foreground">
            {exam.duration_minutes && <span className="flex items-center gap-1.5"><ClockIcon className="w-4 h-4" />{exam.duration_minutes} minutes</span>}
            <span className="flex items-center gap-1.5"><CheckCircleIcon className="w-4 h-4" />{exam.passing_score ?? 70}% to pass</span>
            <span className="flex items-center gap-1.5"><UserGroupIcon className="w-4 h-4" />{questions.length} questions · {totalPoints} pts total</span>
          </div>
          {!isStaff && !mySession && (
            <div className="mt-4">
              <Link href={`/dashboard/cbt/${exam.id}/take`}
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-foreground font-bold text-sm rounded-none transition-all">
                Start Exam
              </Link>
            </div>
          )}
          {mySession && (
            <div className={`mt-4 p-4 rounded-none border ${mySession.status === 'passed' ? 'bg-emerald-500/10 border-emerald-500/20' : 'bg-rose-500/10 border-rose-500/20'}`}>
              <div className="flex items-center gap-2">
                {mySession.status === 'passed'
                  ? <CheckCircleIcon className="w-5 h-5 text-emerald-400" />
                  : <XCircleIcon className="w-5 h-5 text-rose-400" />}
                <span className={`font-bold ${mySession.status === 'passed' ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {mySession.status === 'passed' ? 'Passed' : 'Failed'} — Score: {mySession.score}%
                </span>
              </div>
              {mySession.end_time && (
                <p className="text-xs text-muted-foreground mt-1">Completed {new Date(mySession.end_time).toLocaleString()}</p>
              )}
            </div>
          )}
          {!isStaff && mySession && mySession.answers && questions.length > 0 && (
            <div className="mt-3">
              <button
                onClick={() => setShowReview(v => !v)}
                className="inline-flex items-center gap-2 px-4 py-2 bg-white/5 hover:bg-white/10 border border-border text-xs font-bold text-foreground rounded-none transition-colors"
              >
                {showReview ? 'Hide Review' : 'Review Answers'}
              </button>
            </div>
          )}
        </div>

        {/* Student: answer review */}
        {!isStaff && mySession && mySession.answers && questions.length > 0 && showReview && (() => {
          const answers: Record<string, string> = mySession.answers ?? {};
          const essayTypes = new Set(['essay']);
          type ReviewQ = {
            q: any;
            studentAnswer: string;
            isEssay: boolean;
            isCorrect: boolean | null; // null = essay / pending
            pts: number;
            earnedPts: number | null;
          };
          const reviewed: ReviewQ[] = questions.map((q: any) => {
            const studentAnswer = answers[q.id] ?? '';
            const isEssay = essayTypes.has(q.question_type);
            const pts = q.points ?? 0;
            if (isEssay) {
              return { q, studentAnswer, isEssay: true, isCorrect: null, pts, earnedPts: null };
            }
            const correct = (q.correct_answer ?? '').toString().trim().toLowerCase();
            const given = studentAnswer.trim().toLowerCase();
            const isCorrect = correct.length > 0 && given === correct;
            return { q, studentAnswer, isEssay: false, isCorrect, pts, earnedPts: isCorrect ? pts : 0 };
          });

          const correctCount   = reviewed.filter(r => r.isCorrect === true).length;
          const incorrectCount = reviewed.filter(r => r.isCorrect === false).length;
          const pendingCount   = reviewed.filter(r => r.isCorrect === null).length;
          const autoTotal      = reviewed.filter(r => !r.isEssay).length;
          const scorePct       = mySession.score ?? 0;
          const passing        = exam.passing_score ?? 70;

          return (
            <div className="space-y-4">
              {/* Summary stats bar */}
              <div className="bg-card border border-border rounded-none p-4 flex flex-wrap gap-4 items-center">
                <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mr-auto">Answer Review</p>
                <span className="flex items-center gap-1.5 text-xs font-bold text-emerald-400">
                  <CheckIcon className="w-3.5 h-3.5" />
                  Correct: {correctCount}/{autoTotal}
                </span>
                <span className="flex items-center gap-1.5 text-xs font-bold text-rose-400">
                  <XMarkIcon className="w-3.5 h-3.5" />
                  Incorrect: {incorrectCount}
                </span>
                {pendingCount > 0 && (
                  <span className="flex items-center gap-1.5 text-xs font-bold text-amber-400">
                    Pending Review: {pendingCount}
                  </span>
                )}
                <span className={`text-xs font-bold px-2.5 py-1 rounded-none border ${scorePct >= passing ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' : 'bg-rose-500/10 border-rose-500/30 text-rose-400'}`}>
                  Score: {scorePct}%
                </span>
              </div>

              {/* Per-question cards */}
              <div className="space-y-3">
                {reviewed.map((r, i) => {
                  const { q, studentAnswer, isEssay, isCorrect, pts, earnedPts } = r;
                  const isMCQ = q.options && Array.isArray(q.options) && q.options.length > 0;
                  const isFillOrCode = !isMCQ && !isEssay;

                  const badgeCls = isEssay
                    ? 'bg-amber-500/10 border-amber-500/30 text-amber-400'
                    : isCorrect
                      ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                      : 'bg-rose-500/10 border-rose-500/30 text-rose-400';
                  const badgeLabel = isEssay ? 'Pending' : isCorrect ? 'Correct' : 'Incorrect';

                  const ptsCls = isEssay
                    ? 'text-amber-400'
                    : isCorrect ? 'text-emerald-400' : 'text-rose-400';
                  const ptsLabel = isEssay ? `?/${pts} pts` : `${earnedPts}/${pts} pts`;

                  return (
                    <div key={q.id} className="bg-card border border-border p-5 space-y-4 rounded-none">
                      {/* Card header */}
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-start gap-3 flex-1 min-w-0">
                          <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground pt-0.5 flex-shrink-0">
                            Q{i + 1}
                          </span>
                          <MarkdownText text={q.question_text} className="text-sm text-foreground leading-relaxed" />
                        </div>
                        <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
                          <span className={`px-2 py-0.5 text-[10px] font-black uppercase tracking-widest border rounded-none ${badgeCls}`}>
                            {badgeLabel}
                          </span>
                          <span className={`text-[10px] font-bold ${ptsCls}`}>{ptsLabel}</span>
                        </div>
                      </div>

                      {/* MCQ options */}
                      {isMCQ && (
                        <div className="space-y-1.5 pl-8">
                          {(q.options as string[]).map((opt: string, oi: number) => {
                            const isAnswer = opt.trim().toLowerCase() === (q.correct_answer ?? '').trim().toLowerCase();
                            const isSelected = opt.trim().toLowerCase() === studentAnswer.trim().toLowerCase();
                            const isWrong = isSelected && !isAnswer;

                            let optCls = 'border-border text-muted-foreground';
                            if (isAnswer) optCls = 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400';
                            if (isWrong)  optCls = 'bg-rose-500/10 border-rose-500/30 text-rose-400';

                            return (
                              <div key={oi} className={`flex items-center gap-2.5 px-3 py-2 border rounded-none text-xs font-medium ${optCls}`}>
                                <span className="w-5 h-5 flex-shrink-0 flex items-center justify-center border border-current rounded-full text-[10px] font-black">
                                  {String.fromCharCode(65 + oi)}
                                </span>
                                <span className="flex-1">{opt}</span>
                                {isAnswer && <CheckIcon className="w-3.5 h-3.5 flex-shrink-0" />}
                                {isWrong  && <XMarkIcon className="w-3.5 h-3.5 flex-shrink-0" />}
                              </div>
                            );
                          })}
                        </div>
                      )}

                      {/* Fill blank / coding — side-by-side comparison */}
                      {isFillOrCode && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pl-8">
                          <div>
                            <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-1.5">Your Answer</p>
                            <div className={`px-3 py-2.5 border rounded-none text-xs font-mono ${isCorrect ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' : 'bg-rose-500/10 border-rose-500/30 text-rose-400'}`}>
                              {studentAnswer || <span className="italic opacity-60">No answer</span>}
                            </div>
                          </div>
                          <div>
                            <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-1.5">Correct Answer</p>
                            <div className="px-3 py-2.5 border rounded-none text-xs font-mono bg-emerald-500/10 border-emerald-500/30 text-emerald-400">
                              {q.correct_answer || <span className="italic opacity-60">N/A</span>}
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Essay */}
                      {isEssay && (
                        <div className="pl-8 space-y-2">
                          <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Your Answer</p>
                          <div className="px-3 py-2.5 border border-border bg-white/5 rounded-none text-xs text-foreground leading-relaxed whitespace-pre-wrap">
                            {studentAnswer || <span className="italic text-muted-foreground">No answer submitted</span>}
                          </div>
                          <p className="text-[10px] font-black uppercase tracking-widest text-amber-400">Awaiting manual review</p>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })()}

        {/* Staff: sessions */}
        {isStaff && sessions.length > 0 && (
          <div className="bg-card shadow-sm border border-border rounded-none overflow-hidden">
            <div className="p-5 border-b border-border flex items-center justify-between">
              <h2 className="font-bold flex items-center gap-2">
                <ChartBarIcon className="w-5 h-5 text-emerald-400" /> Student Results ({sessions.length})
              </h2>
              <span className="text-xs text-muted-foreground">
                {sessions.filter(s => s.status === 'passed').length} passed
              </span>
            </div>
            <div className="divide-y divide-white/5">
              {sessions.map((s: any) => (
                <div key={s.id} className="px-5 py-4 flex items-center justify-between gap-4">
                  <div>
                    <p className="font-semibold text-foreground text-sm">{s.portal_users?.full_name ?? 'Student'}</p>
                    <p className="text-xs text-muted-foreground">{s.portal_users?.email}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      <div className="flex items-center gap-2 mb-1">
                        {s.status === 'pending_grading' ? (
                          <span className="px-2.5 py-1 rounded-none bg-amber-500/10 border border-amber-500/20 text-[10px] font-black text-amber-500 uppercase tracking-widest">
                            Pending Grading
                          </span>
                        ) : (
                          <span className={`px-2.5 py-1 rounded-none border text-[10px] font-black uppercase tracking-widest ${
                            s.status === 'passed' ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' 
                            : s.status === 'failed' ? 'bg-rose-500/10 border-rose-500/20 text-rose-400'
                            : 'bg-card shadow-sm border-border text-muted-foreground'
                          }`}>
                            {s.status === 'passed' ? `Passed` : s.status === 'failed' ? 'Failed' : s.status} {s.score != null ? `— ${s.score}%` : ''}
                          </span>
                        )}
                      </div>
                      {s.end_time && (
                        <p className="text-[10px] text-muted-foreground truncate">Submitted {new Date(s.end_time).toLocaleDateString()}</p>
                      )}
                    </div>
                    {/* Always show Grade/Review button for staff */}
                    <Link href={`/dashboard/cbt/${exam.id}/sessions/${s.id}/grade`}
                      className={`flex items-center gap-1.5 px-3 py-2 text-xs font-bold rounded-none transition-all ${
                        s.status === 'pending_grading'
                          ? 'bg-emerald-600 hover:bg-emerald-500 text-foreground shadow-lg shadow-emerald-900/30'
                          : 'bg-muted hover:bg-muted text-muted-foreground'
                      }`}>
                      <ChartBarIcon className="w-3.5 h-3.5" />
                      {s.status === 'pending_grading' ? 'Grade' : 'Review'}
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Staff: questions preview */}
        {isStaff && questions.length > 0 && (
          <div className="bg-card shadow-sm border border-border rounded-none overflow-hidden">
            <div className="p-5 border-b border-border">
              <h2 className="font-bold">Questions Preview</h2>
            </div>
            <div className="divide-y divide-white/5">
              {questions.map((q: any, i: number) => (
                <div key={q.id} className="px-5 py-4">
                  <div className="flex items-start gap-3">
                    <span className="text-xs font-bold text-muted-foreground w-6 flex-shrink-0 pt-0.5">{i + 1}.</span>
                    <div className="flex-1">
                      <MarkdownText text={q.question_text} className="text-sm text-foreground" />
                      {q.options && Array.isArray(q.options) && (
                        <div className="mt-2 space-y-1">
                          {q.options.map((opt: string, oi: number) => (
                            <p key={oi} className={`text-xs px-2 py-1 rounded ${opt === q.correct_answer ? 'bg-emerald-500/10 text-emerald-400' : 'text-muted-foreground'}`}>
                              {String.fromCharCode(65 + oi)}. <MarkdownText text={opt} />
                            </p>
                          ))}
                        </div>
                      )}
                      <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                        <span>{q.points} pts</span>
                        <span className="capitalize">{q.question_type?.replace('_', ' ')}</span>
                        <span className="text-emerald-400">Answer: {q.correct_answer}</span>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
