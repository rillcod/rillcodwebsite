// @refresh reset
'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/contexts/auth-context';
import { createClient } from '@/lib/supabase/client';
import {
  ArrowLeftIcon, AcademicCapIcon, PlusIcon, TrashIcon,
  CheckIcon, ArrowPathIcon, ExclamationTriangleIcon, ChevronDownIcon,
  SparklesIcon, CheckCircleIcon,
} from '@/lib/icons';

interface Question {
  question_text: string;
  question_type: string;
  options: string[];
  correct_answer: string;
  points: number;
  section: 'objective' | 'subjective' | 'practical';
}

const emptyQuestion = (): Question => ({
  question_text: '',
  question_type: 'multiple_choice',
  options: ['', '', '', ''],
  correct_answer: '',
  points: 5,
  section: 'objective',
});

export default function NewExamPage() {
  const router = useRouter();
  const { profile, loading: authLoading, profileLoading } = useAuth();
  const searchParams = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
  const preProgramId = searchParams?.get('program_id');
  const preCourseId = searchParams?.get('course_id');
  const preTopic = searchParams?.get('topic');
  const preWeek = searchParams?.get('week');
  const preCurrId = searchParams?.get('curriculum_id');
  const preExamType = searchParams?.get('exam_type') as 'examination' | 'evaluation' | null;
  const isMinimal = searchParams?.get('minimal') === 'true';
  const [programs, setPrograms] = useState<any[]>([]);
  const [courses, setCourses] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState({
    title: '',
    description: '',
    program_id: '',
    course_id: '',
    duration_minutes: '60',
    passing_score: '70',
    start_date: '',
    end_date: '',
    is_active: true,
    exam_type: preExamType === 'evaluation' ? 'evaluation' : 'examination',
  });
  const [questions, setQuestions] = useState<Question[]>([emptyQuestion()]);
  const [sectionWeights, setSectionWeights] = useState({ objective: 60, subjective: 30, practical: 10 });
  const [useWeights, setUseWeights] = useState(false);

  // AI Generation State
  const [aiOpen, setAiOpen] = useState(!!preTopic);
  const [aiGenerating, setAiGenerating] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiTopic, setAiTopic] = useState(preTopic || '');
  const [aiMcqCount, setAiMcqCount] = useState(preExamType === 'evaluation' ? '0' : '10');
  const [aiTheoryCount, setAiTheoryCount] = useState(preExamType === 'evaluation' ? '10' : '0');
  // Track which questions are selected (all selected by default)
  const [selectedQuestions, setSelectedQuestions] = useState<Set<number>>(new Set());
  const [printFilter, setPrintFilter] = useState<'all' | 'mcq' | 'theory'>('all');

  const handleAiGenerate = async () => {
    if (!aiTopic.trim()) { setAiError('Enter a topic first.'); return; }
    const mcq    = Math.max(0, Math.min(50, parseInt(aiMcqCount)    || 0));
    const theory = Math.max(0, Math.min(50, parseInt(aiTheoryCount) || 0));
    const total  = mcq + theory;
    if (total < 1) { setAiError('Set at least 1 question (MCQ or Theory).'); return; }
    setAiGenerating(true);
    setAiError(null);
    try {
      const res = await fetch('/api/ai/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'cbt', topic: aiTopic, questionCount: total, mcqCount: mcq, theoryCount: theory })
      });
      const result = await res.json();
      if (result.error) throw new Error(result.error);

      const data = result.data;
      setForm(prev => ({
        ...prev,
        title: data.title || prev.title,
        description: data.description || prev.description,
        duration_minutes: (data.duration_minutes || 60).toString(),
        passing_score: (data.passing_score || 70).toString(),
      }));
      if (data.questions?.length > 0) {
        const qs = data.questions.map((q: any) => ({
          question_text: q.question_text || '',
          question_type: q.question_type || 'multiple_choice',
          options: q.options || ['', '', '', ''],
          correct_answer: q.correct_answer || '',
          points: q.points || 5,
          section: (q.section || (q.question_type === 'essay' ? 'subjective' : 'objective')) as Question['section'],
        }));
        setQuestions(qs);
        // Select all generated questions by default
        setSelectedQuestions(new Set(qs.map((_: any, i: number) => i)));
      }
      setAiOpen(false);
    } catch (e: any) {
      setAiError(e.message || 'AI generation failed');
    } finally {
      setAiGenerating(false);
    }
  };

  useEffect(() => {
    if (authLoading || !profile) return;
    const db = createClient();
    
    // 1. Fetch programs
    db.from('programs').select('id, name').eq('is_active', true).order('name')
      .then(({ data }) => {
        setPrograms(data ?? []);
        if (preProgramId) setForm(prev => ({ ...prev, program_id: preProgramId }));
      });

    // 2. Fetch courses (linked course pattern)
    let courseQuery = db.from('courses').select('id, title, program_id, school_id, programs(name)').eq('is_active', true);
    if (profile?.school_id) {
      courseQuery = courseQuery.or(`school_id.eq.${profile.school_id},school_id.is.null`);
    }
    courseQuery.order('title').then(({ data }) => {
      const cList = data ?? [];
      setCourses(cList);
      if (preCourseId) {
        const c = cList.find((x: any) => x.id === preCourseId);
        setForm(prev => ({ ...prev, course_id: preCourseId, program_id: c?.program_id || prev.program_id }));
      }
    });
  }, [profile?.id, authLoading, preProgramId, preCourseId]);

  const isStaff = profile?.role === 'admin' || profile?.role === 'teacher' || profile?.role === 'school';

  const addQuestion = () => setQuestions(q => [...q, emptyQuestion()]);
  const removeQuestion = (i: number) => setQuestions(q => q.filter((_, idx) => idx !== i));
  const updateQuestion = (i: number, patch: Partial<Question>) =>
    setQuestions(q => q.map((item, idx) => idx === i ? { ...item, ...patch } : item));
  const updateOption = (qi: number, oi: number, val: string) =>
    setQuestions(q => q.map((item, idx) => idx === qi ? { ...item, options: item.options.map((o, j) => j === oi ? val : o) } : item));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title.trim() || !form.program_id) {
      setError('Title and programme are required.');
      return;
    }
    if (useWeights && sectionWeights.objective + sectionWeights.subjective + sectionWeights.practical !== 100) {
      setError('Section weights must total exactly 100%.');
      return;
    }
    // Use selected questions if any selection was made, otherwise use all filled questions
    const hasSelection = selectedQuestions.size > 0;
    const validQuestions = questions.filter((q, i) =>
      q.question_text.trim() && (!hasSelection || selectedQuestions.has(i))
    );
    if (validQuestions.length === 0) {
      setError('Add at least one question (or tick the questions you want to include).');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const weightTotal = sectionWeights.objective + sectionWeights.subjective + sectionWeights.practical;
      const examPayload: any = {
        title: form.title.trim(),
        description: form.description.trim() || null,
        program_id: form.program_id,
        course_id: form.course_id || null,
        duration_minutes: parseInt(form.duration_minutes) || 60,
        passing_score: parseInt(form.passing_score) || 70,
        total_questions: validQuestions.length,
        exam_type: form.exam_type,
        metadata: {
            ...(useWeights ? { section_weights: sectionWeights, weights_total: weightTotal } : {}),
            ...(preWeek ? { week: parseInt(preWeek, 10) } : {}),
            ...(preCurrId ? { curriculum_id: preCurrId } : {}),
            source: preCurrId ? 'curriculum' : 'standalone',
        },
        questions: validQuestions.map((q, i) => ({
          question_text: q.question_text.trim(),
          question_type: q.question_type,
          options: q.question_type === 'multiple_choice' ? q.options.filter((o: string) => o.trim()) : null,
          correct_answer: q.correct_answer.trim(),
          points: q.points,
          section: q.section,
          order_index: i + 1,
        })),
      };
      if (form.start_date) examPayload.start_date = new Date(form.start_date).toISOString();
      if (form.end_date) examPayload.end_date = new Date(form.end_date).toISOString();

      const res = await fetch('/api/cbt/exams', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(examPayload),
      });
      if (!res.ok) { const j = await res.json(); throw new Error(j.error || 'Failed to create exam'); }

      router.push('/dashboard/cbt');
    } catch (e: any) {
      setError(e.message ?? 'Failed to create exam');
    } finally {
      setSaving(false);
    }
  };

  // ── Print exam sheet (A4 — compact, 20-30 questions per page + marking guide) ──
  const handlePrintExam = () => {
    const hasSelection = selectedQuestions.size > 0;
    const isMcq = (q: Question) => q.question_type === 'multiple_choice' || q.question_type === 'true_false';
    const isTheory = (q: Question) => !isMcq(q);
    let toPrint = questions.filter((q, i) =>
      q.question_text.trim() && (!hasSelection || selectedQuestions.has(i))
    );
    if (printFilter === 'mcq') toPrint = toPrint.filter(isMcq);
    if (printFilter === 'theory') toPrint = toPrint.filter(isTheory);
    if (toPrint.length === 0) {
      alert(printFilter === 'mcq' ? 'No objective (MCQ/True-False) questions found.' : printFilter === 'theory' ? 'No theory questions found.' : 'No questions to print. Add questions first.');
      return;
    }

    const docRef = `CBT-${Date.now().toString(36).toUpperCase()}`;
    const now = new Date();
    const dateStr = now.toLocaleDateString('en-NG', { year: 'numeric', month: 'long', day: 'numeric' });
    const prog = programs.find(p => p.id === form.program_id)?.name ?? '';
    const course = courses.find(c => c.id === form.course_id)?.title ?? '';
    const totalPts = toPrint.reduce((s, q) => s + (q.points || 0), 0);

    const optLabels = ['A', 'B', 'C', 'D', 'E', 'F'];

    // Full markdown → HTML converter for print output
    function formatQuestionText(text: string): string {
      const escHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

      // Extract fenced code blocks first (protect them from inline processing)
      const codeBlocks: string[] = [];
      const t = text.replace(/```(\w*)\n?([\s\S]*?)```/g, (_m, lang, code) => {
        const langLabel = lang ? `<span style="font-size:8px;font-weight:700;color:#7c3aed;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:2px;display:block">${escHtml(lang)}</span>` : '';
        codeBlocks.push(`<div style="margin:5px 0;background:#1e1e2e;border-radius:5px;padding:8px 10px;border-left:3px solid #7c3aed">${langLabel}<pre style="margin:0;font-family:'Courier New',monospace;font-size:10.5px;color:#cdd6f4;white-space:pre-wrap;word-break:break-all;line-height:1.5">${escHtml(code.trimEnd())}</pre></div>`);
        return `\x00CODE${codeBlocks.length - 1}\x00`;
      });

      // Process line by line for block elements
      const lines = t.split('\n');
      const out: string[] = [];
      let i = 0;
      while (i < lines.length) {
        const line = lines[i];

        // Headings
        if (/^### /.test(line)) { out.push(`<div style="font-size:11px;font-weight:900;color:#4c1d95;margin:7px 0 3px;text-transform:uppercase;letter-spacing:0.5px">${inlineMd(line.slice(4))}</div>`); i++; continue; }
        if (/^## /.test(line))  { out.push(`<div style="font-size:12px;font-weight:900;color:#4c1d95;margin:8px 0 4px;border-bottom:1px solid #ddd6fe;padding-bottom:2px">${inlineMd(line.slice(3))}</div>`); i++; continue; }
        if (/^# /.test(line))   { out.push(`<div style="font-size:13px;font-weight:900;color:#4c1d95;margin:9px 0 5px">${inlineMd(line.slice(2))}</div>`); i++; continue; }

        // Blockquote
        if (/^> /.test(line)) {
          const quotes: string[] = [];
          while (i < lines.length && /^> /.test(lines[i])) { quotes.push(lines[i].slice(2)); i++; }
          out.push(`<div style="border-left:3px solid #7c3aed;background:#f5f3ff;padding:5px 10px;margin:5px 0;font-size:10.5px;color:#374151;font-style:italic">${inlineMd(quotes.join(' '))}</div>`);
          continue;
        }

        // Horizontal rule
        if (/^---+$/.test(line.trim())) { out.push(`<hr style="border:none;border-top:1px solid #d1d5db;margin:7px 0"/>`); i++; continue; }

        // Bullet list
        if (/^[-*] /.test(line)) {
          const items: string[] = [];
          while (i < lines.length && /^[-*] /.test(lines[i])) { items.push(lines[i].slice(2)); i++; }
          out.push(`<ul style="margin:5px 0 5px 14px;padding:0;list-style:disc">${items.map(it => `<li style="font-size:10.5px;color:#1f2937;margin-bottom:2px;line-height:1.5">${inlineMd(it)}</li>`).join('')}</ul>`);
          continue;
        }

        // Numbered list
        if (/^\d+\. /.test(line)) {
          const items: string[] = [];
          while (i < lines.length && /^\d+\. /.test(lines[i])) { items.push(lines[i].replace(/^\d+\. /, '')); i++; }
          out.push(`<ol style="margin:5px 0 5px 14px;padding:0;list-style:decimal">${items.map(it => `<li style="font-size:10.5px;color:#1f2937;margin-bottom:2px;line-height:1.5">${inlineMd(it)}</li>`).join('')}</ol>`);
          continue;
        }

        // Placeholder for extracted code block
        if (/^\x00CODE\d+\x00$/.test(line.trim())) {
          const idx = parseInt(line.trim().replace(/\x00CODE(\d+)\x00/, '$1'), 10);
          out.push(codeBlocks[idx] ?? '');
          i++; continue;
        }

        // Empty line
        if (!line.trim()) { out.push('<br/>'); i++; continue; }

        // Paragraph
        const paraLines: string[] = [];
        while (i < lines.length && lines[i].trim() && !/^#{1,3} /.test(lines[i]) && !/^[-*] /.test(lines[i]) && !/^\d+\. /.test(lines[i]) && !/^> /.test(lines[i]) && !/^---+$/.test(lines[i].trim()) && !/^\x00CODE/.test(lines[i])) {
          paraLines.push(lines[i]); i++;
        }
        if (paraLines.length) out.push(`<span style="font-size:11.5px;color:#1f2937;line-height:1.5">${inlineMd(paraLines.join(' '))}</span>`);
      }
      return out.join('');

      function inlineMd(s: string): string {
        // Restore code block placeholders inside inline context (shouldn't happen but be safe)
        s = s.replace(/\x00CODE(\d+)\x00/g, (_, idx) => codeBlocks[parseInt(idx, 10)] ?? '');
        return s
          .replace(/`([^`\n]+)`/g, '<code style="font-family:\'Courier New\',monospace;font-size:10px;background:#f0f0f8;color:#4c1d95;padding:1px 4px;border-radius:3px;border:1px solid #ddd6fe">$1</code>')
          .replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>')
          .replace(/\*\*(.+?)\*\*/g, '<strong style="font-weight:800;color:#111827">$1</strong>')
          .replace(/__(.+?)__/g, '<strong style="font-weight:800;color:#111827">$1</strong>')
          .replace(/\*(.+?)\*/g, '<em style="font-style:italic">$1</em>')
          .replace(/_(.+?)_/g, '<em style="font-style:italic">$1</em>')
          .replace(/~~(.+?)~~/g, '<s style="opacity:0.5">$1</s>')
          .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" style="color:#7c3aed;text-decoration:underline">$1</a>');
      }
    }

    const questionRows = toPrint.map((q, i) => {
      const isChoice = q.question_type === 'multiple_choice';
      const opts = isChoice
        ? q.options.filter(o => o.trim()).map((o, j) => `<span style="margin-right:14px;white-space:nowrap"><b>${optLabels[j]}.</b> ${o}</span>`).join('')
        : '';
      const formattedText = formatQuestionText(q.question_text);
      return `<div style="break-inside:avoid;margin-bottom:7px;padding:5px 8px;border-left:2px solid #7c3aed22;background:${i % 2 === 0 ? '#fafafa' : '#fff'}">
  <div style="display:flex;align-items:flex-start;gap:6px">
    <span style="font-weight:800;font-size:11px;color:#4c1d95;min-width:22px;padding-top:1px">${i + 1}.</span>
    <div style="flex:1">
      <div style="font-size:11.5px;color:#1f2937;line-height:1.5">${formattedText}</div>
      ${isChoice ? `<div style="margin-top:5px;font-size:10.5px;color:#374151;display:flex;flex-wrap:wrap;gap:2px 0">${opts}</div>` : '<div style="margin-top:6px;border-bottom:1px solid #d1d5db;width:60%;height:1px"></div>'}
      <span style="font-size:9px;color:#9ca3af;float:right">[${q.points} pt${q.points !== 1 ? 's' : ''}]</span>
    </div>
  </div>
</div>`;
    }).join('');

    const answerRows = toPrint.map((q, i) => {
      const isChoice = q.question_type === 'multiple_choice';
      const optIdx = isChoice ? q.options.findIndex(o => o.trim() === q.correct_answer.trim()) : -1;
      const label = optIdx >= 0 ? optLabels[optIdx] : (q.correct_answer || '—');
      // Strip code fences for the short summary in the marking guide table
      const shortText = q.question_text.replace(/```[\s\S]*?```/g, '[code]').replace(/`[^`]+`/g, '[code]');
      const truncated = shortText.length > 70 ? shortText.slice(0, 70) + '…' : shortText;
      return `<tr style="border-bottom:1px solid #e5e7eb">
        <td style="padding:3px 8px;text-align:center;font-weight:700;font-size:10.5px;color:#4c1d95">${i + 1}</td>
        <td style="padding:3px 8px;font-size:10px;color:#111827;max-width:260px">${truncated}</td>
        <td style="padding:3px 8px;text-align:center;font-weight:800;font-size:11px;color:#059669">${isChoice ? label : '—'}</td>
        <td style="padding:3px 8px;font-size:10px;color:#374151;max-width:200px">${q.correct_answer || '—'}</td>
        <td style="padding:3px 8px;text-align:center;font-size:10px;color:#6b7280">${q.points}</td>
      </tr>`;
    }).join('');

    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"/>
<title>${form.title || 'CBT Exam'} — Exam Sheet</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:'Segoe UI',Arial,sans-serif;background:#fff;color:#111;padding:18px 20px}
@page{size:A4;margin:12mm 14mm}
@media print{body{padding:0}.no-print{display:none!important}}
.header{display:flex;align-items:flex-start;justify-content:space-between;border-bottom:3px solid #7c3aed;padding-bottom:12px;margin-bottom:14px}
.logo-block{display:flex;align-items:center;gap:12px}
.logo-img{width:52px;height:52px;object-fit:contain}
.org-name{font-size:18px;font-weight:900;color:#7c3aed}
.org-sub{font-size:9px;color:#6b7280;margin-top:2px}
.doc-meta{text-align:right;font-size:9px;color:#6b7280;line-height:1.6}
.exam-title-box{background:linear-gradient(135deg,#4c1d9511,#4f46e511);border:1px solid #7c3aed44;border-radius:8px;padding:10px 16px;margin-bottom:12px}
.exam-title{font-size:16px;font-weight:900;color:#4c1d95}
.meta-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:14px}
.meta-cell{background:#f9fafb;border:1px solid #e5e7eb;border-radius:6px;padding:6px 10px;text-align:center}
.meta-label{font-size:8px;color:#9ca3af;text-transform:uppercase;letter-spacing:0.5px}
.meta-val{font-size:13px;font-weight:800;color:#111827;margin-top:2px}
.instructions{background:#fef3c7;border:1px solid #fbbf24;border-radius:6px;padding:8px 12px;margin-bottom:14px;font-size:10px;color:#92400e}
.section-title{font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:1px;color:#4c1d95;border-bottom:1px solid #7c3aed33;padding-bottom:4px;margin-bottom:8px}
.page-break{page-break-before:always;padding-top:16px}
table{width:100%;border-collapse:collapse}
thead tr{background:#4c1d95;color:white}
thead th{padding:5px 8px;text-align:left;font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px}
tbody tr:nth-child(even){background:#f9fafb}
.footer{margin-top:18px;border-top:1px solid #e5e7eb;padding-top:12px;display:grid;grid-template-columns:1fr 1fr 1fr;gap:16px}
.sig-box{text-align:center}
.sig-line{border-bottom:1px solid #374151;height:32px;margin-bottom:5px}
.sig-label{font-size:8px;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px}
.watermark{text-align:center;margin-top:14px;font-size:8px;color:#9ca3af}
.name-box{border:1px solid #d1d5db;border-radius:6px;padding:7px 14px;margin-bottom:12px;display:flex;gap:24px}
.name-field{flex:1;border-bottom:1px solid #374151;font-size:11px;padding-bottom:2px;color:#111;min-width:120px}
.name-label{font-size:9px;color:#6b7280;margin-bottom:2px}
</style></head><body>
<div class="header">
  <div class="logo-block">
    <img src="${window.location.origin}/logo.png" alt="Rillcod Logo" class="logo-img" onerror="this.style.display='none'" />
    <div>
      <div class="org-name">Rillcod Technologies</div>
      <div class="org-sub">Technology &amp; Innovation in Education</div>
    </div>
  </div>
  <div class="doc-meta">
    <div><b>Exam Ref:</b> ${docRef}</div>
    <div><b>Date:</b> ${dateStr}</div>
    <div><b>Total Questions:</b> ${toPrint.length}</div>
    <div><b>Total Points:</b> ${totalPts}</div>
  </div>
</div>
<div class="exam-title-box">
  <div class="exam-title">${form.title || 'Computer-Based Test'}</div>
  ${form.description ? `<div style="font-size:11px;color:#374151;margin-top:4px">${form.description}</div>` : ''}
  ${prog || course ? `<div style="font-size:10px;color:#7c3aed;margin-top:4px;font-weight:600">${[prog, course].filter(Boolean).join(' · ')}</div>` : ''}
</div>
<div class="meta-grid">
  <div class="meta-cell"><div class="meta-label">Duration</div><div class="meta-val">${form.duration_minutes} min</div></div>
  <div class="meta-cell"><div class="meta-label">Questions</div><div class="meta-val">${toPrint.length}</div></div>
  <div class="meta-cell"><div class="meta-label">Total Points</div><div class="meta-val">${totalPts}</div></div>
  <div class="meta-cell"><div class="meta-label">Pass Mark</div><div class="meta-val">${form.passing_score}%</div></div>
</div>
<div class="name-box">
  <div><div class="name-label">Student Name</div><div class="name-field">&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</div></div>
  <div><div class="name-label">Class / Grade</div><div class="name-field">&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</div></div>
  <div><div class="name-label">Date</div><div class="name-field">&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</div></div>
</div>
<div class="instructions">
  <b>Instructions:</b> Answer all questions. For multiple-choice questions, circle or underline the letter of your chosen answer.
  Write clearly and legibly. No erasure on answers. Duration: <b>${form.duration_minutes} minutes</b>. Total marks: <b>${totalPts} points</b>.
</div>
<div class="section-title">Section A — Questions (${toPrint.length} Questions · ${totalPts} Marks)</div>
${questionRows}
<div class="page-break">
  <div class="header" style="border-bottom:3px solid #dc2626;padding-bottom:10px;margin-bottom:14px">
    <div class="logo-block">
      <img src="${window.location.origin}/logo.png" alt="Rillcod Logo" class="logo-img" onerror="this.style.display='none'" />
      <div>
        <div class="org-name" style="color:#dc2626">Rillcod Technologies — Marking Guide</div>
        <div class="org-sub">CONFIDENTIAL — For Examiner Use Only · Do Not Distribute</div>
      </div>
    </div>
    <div class="doc-meta"><div><b>Ref:</b> ${docRef}-MG</div><div><b>Exam:</b> ${form.title || 'CBT'}</div></div>
  </div>
  <div style="background:#fef2f2;border:1px solid #fca5a5;border-radius:6px;padding:8px 12px;margin-bottom:14px;font-size:10px;color:#7f1d1d">
    <b>⚠ Restricted:</b> This marking guide is strictly for the use of the examining facilitator. It must not be shown to or shared with students before or during the examination.
  </div>
  <div class="section-title" style="color:#dc2626;border-bottom-color:#dc262633">Answer Key &amp; Marking Scheme</div>
  <table>
    <thead><tr>
      <th style="width:40px;text-align:center">#</th>
      <th>Question (truncated)</th>
      <th style="width:60px;text-align:center">Answer</th>
      <th>Full Answer / Expected Response</th>
      <th style="width:50px;text-align:center">Points</th>
    </tr></thead>
    <tbody>${answerRows}</tbody>
    <tfoot><tr style="background:#4c1d95;color:white"><td colspan="4" style="padding:5px 8px;font-weight:700;font-size:10px;text-align:right">TOTAL MARKS</td><td style="padding:5px 8px;text-align:center;font-weight:900">${totalPts}</td></tr></tfoot>
  </table>
  <div class="footer">
    <div class="sig-box"><div class="sig-line"></div><div class="sig-label">Examiner / Facilitator</div></div>
    <div class="sig-box"><div class="sig-line"></div><div class="sig-label">Academic Coordinator</div></div>
    <div class="sig-box"><div class="sig-line"></div><div class="sig-label">Head of Department / Stamp</div></div>
  </div>
</div>
<div class="watermark">Rillcod Technologies · ${docRef} · This is a computer-generated examination document.</div>
</body></html>`;

    const w = window.open('', '_blank', 'width=900,height=750');
    if (!w) { alert('Pop-up blocked. Please allow pop-ups.'); return; }
    w.document.write(html);
    w.document.close();
    w.focus();
    setTimeout(() => w.print(), 600);
  };

  if (authLoading || profileLoading) return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="w-10 h-10 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );
  if (!isStaff) return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <p className="text-muted-foreground">Staff access required.</p>
    </div>
  );

  return (
    <div className={`min-h-screen bg-background text-foreground ${isMinimal ? 'p-0' : 'p-4 sm:p-8'}`}>
      <div className={`${isMinimal ? 'w-full' : 'max-w-4xl mx-auto'} space-y-6`}>
        {!isMinimal && (
          <Link href="/dashboard/cbt" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeftIcon className="w-4 h-4" /> Back to CBT
          </Link>
        )}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <AcademicCapIcon className="w-5 h-5 text-emerald-400" />
              <span className="text-xs font-bold text-emerald-400 uppercase tracking-widest">{isMinimal ? 'Add Context' : 'New Exam'}</span>
            </div>
            <h1 className="text-3xl font-extrabold italic tracking-tight">Create CBT Exam</h1>
            {!isMinimal && <p className="text-muted-foreground text-sm mt-1 font-medium italic">Architect your assessment environment</p>}
          </div>
          <div className="flex items-center gap-2">
            {questions.some(q => q.question_text.trim()) && (
              <div className="flex items-center gap-1">
                {/* Question type filter for print */}
                <div className="flex border border-primary/30 rounded-xl overflow-hidden">
                  {(['all', 'mcq', 'theory'] as const).map(f => (
                    <button key={f} type="button" onClick={() => setPrintFilter(f)}
                      className={`px-2.5 py-3 text-[10px] font-black uppercase tracking-widest transition-colors ${printFilter === f ? 'bg-primary/30 text-primary' : 'bg-primary/10 text-primary/50 hover:bg-primary/20 hover:text-primary'}`}>
                      {f === 'all' ? 'All' : f === 'mcq' ? 'Obj' : 'Theory'}
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={handlePrintExam}
                  className="flex items-center gap-2 px-5 py-3 bg-primary/20 hover:bg-primary/30 border border-primary/30 text-primary font-black text-xs uppercase tracking-[0.2em] rounded-xl transition-all"
                >
                  Print Exam
                </button>
              </div>
            )}
            <button onClick={handleSubmit} disabled={saving} className="flex items-center gap-2 px-8 py-3 bg-emerald-600 hover:bg-emerald-500 text-foreground font-black text-xs uppercase tracking-[0.2em] rounded-xl shadow-xl shadow-emerald-900/40 transition-all disabled:opacity-50">
              {saving ? <ArrowPathIcon className="w-4 h-4 animate-spin" /> : <CheckIcon className="w-4 h-4" />}
              {saving ? 'Creating...' : (isMinimal ? 'CREATE' : 'PUBLISH EXAM')}
            </button>
          </div>
        </div>

        {error && (
          <div className="flex items-center gap-3 bg-rose-500/10 border border-rose-500/20 rounded-xl p-4">
            <ExclamationTriangleIcon className="w-5 h-5 text-rose-400 flex-shrink-0" />
            <p className="text-rose-400 text-sm">{error}</p>
          </div>
        )}

        {/* Premium AI Exam Engine Panel */}
        <div className="p-8 bg-gradient-to-br from-primary/20 to-primary/70/10 border border-primary/20 rounded-[2rem] space-y-6 relative overflow-hidden group">
            <div className="absolute -right-20 -top-20 w-64 h-64 bg-primary/10 rounded-full blur-[100px] group-hover:bg-primary/20 transition-all duration-1000" />
            
            <div className="flex items-center justify-between relative">
                <div className="flex items-center gap-4">
                    <div className="w-14 h-14 rounded-2xl bg-primary flex items-center justify-center shadow-2xl shadow-primary/40 border border-primary/30">
                        <SparklesIcon className="w-7 h-7 text-white" />
                    </div>
                    <div>
                        <h3 className="text-xl font-black text-white uppercase italic tracking-tighter">Premium AI Exam Engine</h3>
                        <p className="text-[10px] text-primary font-black uppercase tracking-[0.4em]">High-Precision Assessment Synthesis</p>
                    </div>
                </div>
                <button 
                  onClick={() => setAiOpen(!aiOpen)}
                  className="px-4 py-2 bg-white/5 hover:bg-white/10 text-[10px] font-black text-white uppercase tracking-widest transition-all rounded-xl border border-white/10"
                >
                  {aiOpen ? 'Hide Controls' : 'Open Designer'}
                </button>
            </div>

            {aiOpen && (
              <div className="space-y-4 pt-4 relative animate-in slide-in-from-top-4 duration-500">
                  {/* Row 1: Topic */}
                  <div className="space-y-1">
                      <label className="text-[10px] font-black uppercase tracking-widest text-brand-red-600/60">What topic is this exam on?</label>
                      <input
                          value={aiTopic}
                          onChange={e => setAiTopic(e.target.value)}
                          placeholder="e.g. Introduction to Python, Basic Electronics, Algebra"
                          className="w-full bg-white/5 border border-white/10 rounded-2xl px-5 py-3.5 text-sm text-white placeholder:text-white/20 outline-none focus:border-primary/50 transition-all"
                      />
                  </div>

                  {/* Row 2: MCQ Count | Theory Count | Total badge | Generate button */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 items-end">
                      <div className="space-y-1">
                          <label className="text-[10px] font-black uppercase tracking-widest text-brand-red-600/60">
                            Multiple-choice questions
                          </label>
                          <input
                            type="number" min="0" max="50"
                            value={aiMcqCount}
                            onChange={e => setAiMcqCount(e.target.value)}
                            className="w-full bg-white/5 border border-white/10 rounded-2xl px-5 py-3.5 text-sm text-white outline-none focus:border-primary/50 transition-all"
                          />
                      </div>
                      <div className="space-y-1">
                          <label className="text-[10px] font-black uppercase tracking-widest text-brand-red-600/60">
                            Written / essay questions
                          </label>
                          <input
                            type="number" min="0" max="50"
                            value={aiTheoryCount}
                            onChange={e => setAiTheoryCount(e.target.value)}
                            className="w-full bg-white/5 border border-white/10 rounded-2xl px-5 py-3.5 text-sm text-white outline-none focus:border-primary/50 transition-all"
                          />
                      </div>
                      {/* Total display */}
                      <div className="flex flex-col items-center justify-center h-full py-2 gap-0.5 border border-white/10 rounded-2xl bg-white/5">
                          <span className="text-[8px] font-black uppercase tracking-widest text-white/30">Total Questions</span>
                          <span className="text-3xl font-black text-primary leading-none">
                            {(parseInt(aiMcqCount) || 0) + (parseInt(aiTheoryCount) || 0)}
                          </span>
                          <span className="text-[8px] text-white/20 uppercase">
                            {parseInt(aiMcqCount) || 0} obj · {parseInt(aiTheoryCount) || 0} theory
                          </span>
                      </div>
                      <button
                          type="button"
                          onClick={handleAiGenerate}
                          disabled={aiGenerating}
                          className="flex flex-col items-center justify-center gap-1.5 p-4 bg-primary hover:bg-primary rounded-[1.5rem] transition-all shadow-xl shadow-primary/40 disabled:opacity-50"
                      >
                          <div className="text-[10px] font-black text-white uppercase tracking-widest">{aiGenerating ? 'Processing...' : 'Generate Exam'}</div>
                          <div className="text-[8px] text-white/40 uppercase">Architecture Build</div>
                      </button>
                  </div>

                  {aiError && <p className="text-[10px] text-rose-400 font-bold uppercase tracking-widest pl-2">Error: {aiError}</p>}
                  {aiGenerating && (
                      <div className="flex items-center gap-3 text-primary animate-pulse pl-2 border-l-2 border-primary">
                          <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                          <span className="text-[10px] font-black uppercase tracking-widest">Accessing OpenRouter Neural Clusters...</span>
                      </div>
                  )}
              </div>
            )}
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Exam Details */}
          <div className="bg-card shadow-sm border border-border rounded-xl p-6 space-y-5">
            <h2 className="text-sm font-bold text-muted-foreground uppercase tracking-widest">Exam Details</h2>

            <div>
              <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-1.5">
                Exam Title <span className="text-rose-400">*</span>
              </label>
              <input type="text" required value={form.title}
                onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                placeholder="e.g. Python Programming Midterm"
                className="w-full px-4 py-3 bg-card shadow-sm border border-border rounded-xl text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:border-emerald-500 transition-colors" />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-1.5">
                  Programme <span className="text-rose-400">*</span>
                </label>
                <select required value={form.program_id}
                  onChange={e => {
                    const pid = e.target.value;
                    const currentCourse = courses.find(x => x.id === form.course_id);
                    setForm(f => ({
                      ...f,
                      program_id: pid,
                      course_id: currentCourse?.program_id === pid ? f.course_id : '',
                    }));
                  }}
                  className="w-full px-4 py-3 bg-card shadow-sm border border-border rounded-xl text-sm text-foreground focus:outline-none focus:border-emerald-500 cursor-pointer">
                  <option value="">Select programme…</option>
                  {programs.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-1.5">
                  Course {form.program_id ? <span className="text-rose-400">*</span> : <span className="text-white/30">(select programme first)</span>}
                </label>
                <select value={form.course_id}
                  onChange={e => setForm(f => ({ ...f, course_id: e.target.value }))}
                  disabled={!form.program_id}
                  className="w-full px-4 py-3 bg-card shadow-sm border border-border rounded-xl text-sm text-foreground focus:outline-none focus:border-emerald-500 cursor-pointer disabled:opacity-40">
                  <option value="">{form.program_id ? 'Select a course…' : '— pick a programme first —'}</option>
                  {courses.filter(c => c.program_id === form.program_id).map(c => <option key={c.id} value={c.id}>{c.title}</option>)}
                </select>
              </div>
            </div>

            {/* Exam Type — critical for score routing */}
            <div className="grid grid-cols-2 gap-3">
              <button type="button"
                onClick={() => setForm(f => ({ ...f, exam_type: 'examination' }))}
                className={`flex items-start gap-3 px-4 py-3 border text-left transition-all ${form.exam_type === 'examination' ? 'bg-indigo-500/10 border-indigo-500/50' : 'bg-card border-border hover:border-indigo-500/30'}`}>
                <div className={`w-3 h-3 rounded-full mt-0.5 flex-shrink-0 border-2 ${form.exam_type === 'examination' ? 'bg-indigo-500 border-indigo-500' : 'border-muted-foreground'}`} />
                <div>
                  <p className="text-xs font-black text-foreground uppercase tracking-widest">Examination</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">40% of final grade · main end-of-term exam</p>
                </div>
              </button>
              <button type="button"
                onClick={() => setForm(f => ({ ...f, exam_type: 'evaluation' }))}
                className={`flex items-start gap-3 px-4 py-3 border text-left transition-all ${form.exam_type === 'evaluation' ? 'bg-cyan-500/10 border-cyan-500/50' : 'bg-card border-border hover:border-cyan-500/30'}`}>
                <div className={`w-3 h-3 rounded-full mt-0.5 flex-shrink-0 border-2 ${form.exam_type === 'evaluation' ? 'bg-cyan-500 border-cyan-500' : 'border-muted-foreground'}`} />
                <div>
                  <p className="text-xs font-black text-foreground uppercase tracking-widest">Evaluation (Test)</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">20% of final grade · compulsory class test</p>
                </div>
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-1.5">Duration (min)</label>
                <input type="number" min="5" value={form.duration_minutes}
                  onChange={e => setForm(f => ({ ...f, duration_minutes: e.target.value }))}
                  className="w-full px-4 py-3 bg-card shadow-sm border border-border rounded-xl text-sm text-foreground focus:outline-none focus:border-emerald-500 transition-colors" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-1.5">Passing Score (%)</label>
                <input type="number" min="1" max="100" value={form.passing_score}
                  onChange={e => setForm(f => ({ ...f, passing_score: e.target.value }))}
                  className="w-full px-4 py-3 bg-card shadow-sm border border-border rounded-xl text-sm text-foreground focus:outline-none focus:border-emerald-500 transition-colors" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-1.5">Status</label>
                <select value={form.is_active ? 'active' : 'inactive'}
                  onChange={e => setForm(f => ({ ...f, is_active: e.target.value === 'active' }))}
                  className="w-full px-4 py-3 bg-card shadow-sm border border-border rounded-xl text-sm text-foreground focus:outline-none focus:border-emerald-500 cursor-pointer">
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-1.5">Start Date/Time</label>
                <input type="datetime-local" value={form.start_date}
                  onChange={e => setForm(f => ({ ...f, start_date: e.target.value }))}
                  className="w-full px-4 py-3 bg-card shadow-sm border border-border rounded-xl text-sm text-foreground focus:outline-none focus:border-emerald-500 transition-colors" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-1.5">End Date/Time</label>
                <input type="datetime-local" value={form.end_date}
                  onChange={e => setForm(f => ({ ...f, end_date: e.target.value }))}
                  className="w-full px-4 py-3 bg-card shadow-sm border border-border rounded-xl text-sm text-foreground focus:outline-none focus:border-emerald-500 transition-colors" />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-1.5">Description</label>
              <textarea rows={2} value={form.description}
                onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                placeholder="Optional exam description…"
                className="w-full px-4 py-3 bg-card shadow-sm border border-border rounded-xl text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:border-emerald-500 transition-colors resize-none" />
            </div>
          </div>

          {/* Section Weights */}
          <div className="bg-card shadow-sm border border-border rounded-xl p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-sm font-bold text-muted-foreground uppercase tracking-widest">Section Weighting</h2>
                <p className="text-[10px] text-muted-foreground mt-0.5">Assign % weight per section. Total must equal 100%.</p>
              </div>
              <button type="button" onClick={() => setUseWeights(w => !w)}
                className={`px-4 py-2 text-[10px] font-black uppercase tracking-widest rounded-xl border transition-all ${useWeights ? 'bg-emerald-500/20 border-emerald-500/30 text-emerald-400' : 'bg-card shadow-sm border-border text-muted-foreground hover:border-emerald-500/30'}`}>
                {useWeights ? 'Weighted ON' : 'Flat Points (default)'}
              </button>
            </div>
            {useWeights && (
              <div className="space-y-3">
                <div className="grid grid-cols-3 gap-4">
                  {(['objective', 'subjective', 'practical'] as const).map(sec => (
                    <div key={sec}>
                      <label className="block text-xs text-muted-foreground uppercase tracking-widest mb-1">{sec} %</label>
                      <input type="number" min="0" max="100"
                        value={sectionWeights[sec]}
                        onChange={e => setSectionWeights(w => ({ ...w, [sec]: parseInt(e.target.value) || 0 }))}
                        className="w-full px-3 py-2.5 bg-card shadow-sm border border-border rounded-xl text-sm text-foreground focus:outline-none focus:border-emerald-500 transition-colors" />
                    </div>
                  ))}
                </div>
                {(() => {
                  const total = sectionWeights.objective + sectionWeights.subjective + sectionWeights.practical;
                  return (
                    <div className={`flex items-center gap-2 text-[10px] font-black uppercase tracking-widest ${total === 100 ? 'text-emerald-400' : 'text-rose-400'}`}>
                      <div className={`w-2 h-2 rounded-full ${total === 100 ? 'bg-emerald-500' : 'bg-rose-500'}`} />
                      Total: {total}% {total === 100 ? '— Valid' : '— Must equal 100%'}
                    </div>
                  );
                })()}
              </div>
            )}
          </div>

          {/* Questions */}
          <div className="space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div>
                <h2 className="text-sm font-bold text-muted-foreground uppercase tracking-widest">
                  Questions ({selectedQuestions.size > 0 ? `${selectedQuestions.size} selected / ` : ''}{questions.length} total)
                </h2>
                {selectedQuestions.size > 0 && (
                  <p className="text-[10px] text-emerald-400/60 mt-0.5">Only ticked questions will be included in the exam</p>
                )}
              </div>
              <div className="flex items-center gap-2">
                {questions.length > 0 && (
                  <button type="button"
                    onClick={() => {
                      if (selectedQuestions.size === questions.length) {
                        setSelectedQuestions(new Set());
                      } else {
                        setSelectedQuestions(new Set(questions.map((_, i) => i)));
                      }
                    }}
                    className="text-xs font-bold text-muted-foreground hover:text-foreground transition-colors px-3 py-1.5 bg-card shadow-sm rounded-xl border border-border">
                    {selectedQuestions.size === questions.length ? 'Deselect All' : 'Select All'}
                  </button>
                )}
                <button type="button" onClick={addQuestion}
                  className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-emerald-400 bg-emerald-500/10 hover:bg-emerald-500/20 rounded-xl transition-colors">
                  <PlusIcon className="w-3.5 h-3.5" /> Add Question
                </button>
              </div>
            </div>

            {questions.map((q, qi) => {
              const isSelected = selectedQuestions.has(qi);
              return (
              <div key={qi} className={`border rounded-xl overflow-hidden transition-all group ${isSelected ? 'bg-emerald-500/5 border-emerald-500/20' : 'bg-card shadow-sm border-border hover:bg-white/[0.07]'}`}>
                <div className="flex items-center justify-between px-5 py-3 bg-white/3 border-b border-border">
                  <div className="flex items-center gap-3">
                    {/* Selection checkbox */}
                    <button
                      type="button"
                      onClick={() => {
                        const next = new Set(selectedQuestions);
                        if (next.has(qi)) next.delete(qi); else next.add(qi);
                        setSelectedQuestions(next);
                      }}
                      className={`w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 transition-all ${isSelected ? 'bg-emerald-500 border-emerald-400' : 'border-border hover:border-emerald-500/50'}`}
                    >
                      {isSelected && <CheckIcon className="w-3 h-3 text-foreground" />}
                    </button>
                    <span className="text-xs font-black text-muted-foreground w-6 tracking-tighter italic">#{qi + 1}</span>
                    <div className="flex items-center gap-1.5 opacity-60 group-hover:opacity-100 transition-opacity">
                        {q.question_type === 'essay' || q.question_type === 'fill_blank' ? (
                            <span className="px-2 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/20 text-[9px] font-black uppercase text-amber-500 italic flex items-center gap-1">
                                <SparklesIcon className="w-2.5 h-2.5" /> Manual Eval
                            </span>
                        ) : (
                            <span className="px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-[9px] font-black uppercase text-emerald-400 italic flex items-center gap-1">
                                <CheckCircleIcon className="w-2.5 h-2.5" /> Auto Graded
                            </span>
                        )}
                    </div>
                  </div>
                  {questions.length > 1 && (
                    <button type="button" onClick={() => removeQuestion(qi)}
                      className="p-1.5 text-rose-400 bg-rose-500/10 hover:bg-rose-500/20 rounded-xl transition-colors scale-90 opacity-40 group-hover:opacity-100 group-hover:scale-100">
                      <TrashIcon className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                <div className="p-5 space-y-4">

                <textarea rows={2} value={q.question_text}
                  onChange={e => updateQuestion(qi, { question_text: e.target.value })}
                  placeholder="Enter question text…"
                  className="w-full px-4 py-3 bg-card shadow-sm border border-border rounded-xl text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:border-emerald-500 transition-colors resize-none" />

                <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                  <div>
                    <label className="block text-xs text-muted-foreground uppercase tracking-widest mb-1">Type</label>
                    <select value={q.question_type}
                      onChange={e => updateQuestion(qi, { question_type: e.target.value, options: ['', '', '', ''], correct_answer: '', section: e.target.value === 'essay' ? 'subjective' : q.section })}
                      className="w-full px-3 py-2.5 bg-card shadow-sm border border-border rounded-xl text-sm text-foreground focus:outline-none focus:border-emerald-500 cursor-pointer">
                      <option value="multiple_choice">Multiple Choice</option>
                      <option value="true_false">True / False</option>
                      <option value="fill_blank">Fill in Blank</option>
                      <option value="essay">Essay</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs text-muted-foreground uppercase tracking-widest mb-1">Section</label>
                    <select value={q.section}
                      onChange={e => updateQuestion(qi, { section: e.target.value as Question['section'] })}
                      className="w-full px-3 py-2.5 bg-card shadow-sm border border-border rounded-xl text-sm text-foreground focus:outline-none focus:border-emerald-500 cursor-pointer">
                      <option value="objective">Objective — multiple choice / true-false</option>
                      <option value="subjective">Subjective — written / essay answers</option>
                      <option value="practical">Practical — hands-on / lab task</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs text-muted-foreground uppercase tracking-widest mb-1">Points</label>
                    <input type="number" min="1" value={q.points}
                      onChange={e => updateQuestion(qi, { points: parseInt(e.target.value) || 1 })}
                      className="w-full px-3 py-2.5 bg-card shadow-sm border border-border rounded-xl text-sm text-foreground focus:outline-none focus:border-emerald-500 transition-colors" />
                  </div>
                  {(q.question_type === 'fill_blank' || q.question_type === 'essay') && (
                    <div className="sm:col-span-2">
                        <label className="block text-xs text-muted-foreground uppercase tracking-widest mb-1">Correct Answer / Scoring Guide</label>
                        <input type="text" value={q.correct_answer}
                            onChange={e => updateQuestion(qi, { correct_answer: e.target.value })}
                            placeholder={q.question_type === 'fill_blank' ? "Exact answer..." : "Grading rubric or points guide..."}
                            className="w-full px-3 py-2.5 bg-card shadow-sm border border-border rounded-xl text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:border-emerald-500 transition-colors" />
                    </div>
                  )}
                </div>

                {q.question_type === 'true_false' && (
                  <div className="flex gap-4">
                    {['True', 'False'].map(opt => (
                      <button
                        key={opt}
                        type="button"
                        onClick={() => updateQuestion(qi, { correct_answer: opt })}
                        className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl border font-bold transition-all ${q.correct_answer === opt ? 'bg-emerald-500 border-emerald-400 text-foreground' : 'bg-card shadow-sm border-border text-muted-foreground hover:bg-muted'}`}
                      >
                        {q.correct_answer === opt && <CheckIcon className="w-4 h-4" />}
                        {opt}
                      </button>
                    ))}
                  </div>
                )}

                {q.question_type === 'multiple_choice' && (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <label className="block text-xs text-muted-foreground uppercase tracking-widest">Options (Select the correct one)</label>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {q.options.map((opt, oi) => {
                        const isCorrect = q.correct_answer === opt && opt !== '';
                        return (
                          <div 
                            key={oi} 
                            onClick={(e) => {
                              if (opt.trim()) updateQuestion(qi, { correct_answer: opt });
                            }}
                            className={`flex items-center gap-2 p-1.5 rounded-xl border transition-all cursor-pointer group/opt ${isCorrect ? 'bg-emerald-500/10 border-emerald-500/50 ring-1 ring-emerald-500/20' : 'bg-card shadow-sm border-border hover:border-border'}`}
                          >
                            <div className={`w-8 h-8 rounded-xl border-2 flex items-center justify-center flex-shrink-0 transition-all ${isCorrect ? 'bg-emerald-500 border-emerald-500 text-foreground shadow-lg shadow-emerald-500/20' : 'border-border group-hover/opt:border-border text-muted-foreground'}`}>
                              {isCorrect ? <CheckIcon className="w-4 h-4 font-black" /> : <span className="text-[10px] font-black">{String.fromCharCode(65 + oi)}</span>}
                            </div>
                            <input 
                              type="text" 
                              value={opt}
                              onClick={e => e.stopPropagation()}
                              onChange={e => {
                                const newVal = e.target.value;
                                const wasCorrect = q.correct_answer === opt;
                                updateOption(qi, oi, newVal);
                                if (wasCorrect) updateQuestion(qi, { correct_answer: newVal });
                              }}
                              placeholder={`Enter option ${String.fromCharCode(65 + oi)}…`}
                              className="flex-1 bg-transparent border-none px-1 py-1 text-sm text-foreground placeholder-muted-foreground focus:outline-none" 
                            />
                            {isCorrect && (
                              <span className="hidden sm:block text-[8px] font-black text-emerald-400 uppercase tracking-widest mr-2">Correct</span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
                </div>
              </div>
              );
            })}
          </div>

          {/* Actions */}
          <div className="flex items-center gap-3 pt-2">
            <Link href="/dashboard/cbt"
              className="px-5 py-2.5 bg-card shadow-sm hover:bg-muted text-muted-foreground text-sm font-bold rounded-xl transition-colors">
              Cancel
            </Link>
            <button type="submit" disabled={saving}
              className="flex items-center gap-2 px-6 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-foreground text-sm font-bold rounded-xl transition-all disabled:opacity-50 shadow-lg shadow-emerald-900/20">
              {saving ? <ArrowPathIcon className="w-4 h-4 animate-spin" /> : <CheckIcon className="w-4 h-4" />}
              {saving ? 'Creating…' : 'Create Exam'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
